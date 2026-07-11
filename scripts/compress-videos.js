#!/usr/bin/env node
'use strict';

/**
 * scripts/compress-videos.js
 * --------------------------
 * Shrinks the media in public/media so the whole site stays small enough to
 * host for free on Cloudflare Pages.
 *
 *   • Videos  → re-encoded to web-friendly H.264, capped at 1080p, saved as .mp4.
 *   • HEIC    → converted to JPEG (a safety net; ingest.js already does this).
 *
 * Run it AFTER you've curated the folders (deleted the photos you don't want),
 * and BEFORE you deploy:
 *
 *   node scripts/compress-videos.js
 *
 * It is idempotent: a video already processed by this script carries a hidden
 * marker and is skipped on the next run, so you can run it as many times as you
 * like without re-compressing (and degrading) the same file.
 *
 * ⚠️  Cloudflare Pages rejects any single file larger than 25 MB. This script
 * warns you about any video that is still over that limit after compression so
 * you know to trim it before deploying.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const sharp = require('sharp');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'public', 'media');
const MEMORIES_PATH = path.join(PROJECT_ROOT, 'data', 'memories.json');

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v']);
const HEIC_EXTS = new Set(['.heic', '.heif']);

const CLOUDFLARE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard limit per file
const MARKER = 'sunimuni-compressed'; // embedded in a video's metadata once done

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

async function* walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return; // media folder doesn't exist yet
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function fileSize(p) {
  try {
    return (await fsp.stat(p)).size;
  } catch {
    return -1;
  }
}

// Has this video already been processed by us? We check for our marker in the
// file's metadata rather than renaming files (so paths in memories.json stay put).
async function alreadyCompressed(file) {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      file,
    ]);
    const data = JSON.parse(stdout);
    return !!(data.format && data.format.tags && data.format.tags.comment === MARKER);
  } catch {
    return false;
  }
}

// memories.json — we only touch it to fix a src when a file's extension changes
// (e.g. a .mov becomes a .mp4). Titles and captions are never altered.
async function loadMemories() {
  try {
    return JSON.parse(await fsp.readFile(MEMORIES_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function saveMemories(memories) {
  const sorted = {};
  for (const key of Object.keys(memories).sort()) sorted[key] = memories[key];
  await fsp.writeFile(MEMORIES_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

// Replace every occurrence of oldSrc with newSrc across all media arrays.
function rewriteSrc(memories, oldSrc, newSrc) {
  if (!memories) return false;
  let changed = false;
  for (const date of Object.keys(memories)) {
    for (const item of memories[date].media || []) {
      if (item.src === oldSrc) {
        item.src = newSrc;
        changed = true;
      }
    }
  }
  return changed;
}

// Turn an absolute file path into the "/media/..." src used in memories.json.
function toSrc(absPath) {
  const rel = path.relative(path.join(PROJECT_ROOT, 'public'), absPath);
  return '/' + rel.split(path.sep).join('/');
}

// ---------------------------------------------------------------------------
// Video re-encode
// ---------------------------------------------------------------------------

async function compressVideo(videoPath, memories) {
  const dir = path.dirname(videoPath);
  const ext = path.extname(videoPath);
  const base = path.basename(videoPath, ext);
  const finalPath = path.join(dir, `${base}.mp4`); // always end up as .mp4
  const tmpPath = path.join(dir, `${base}.tmp-compress.mp4`);

  // Cap the long edge at 1920 and let the short edge follow the aspect ratio.
  // The min() guards mean small videos are never upscaled.
  const scaleFilter =
    "scale='if(gte(iw,ih),min(1920,iw),-2)':'if(gte(iw,ih),-2,min(1920,ih))'";

  await execFileAsync(ffmpegPath, [
    '-y',
    '-i', videoPath,
    '-vf', scaleFilter,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '24',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-metadata', `comment=${MARKER}`,
    tmpPath,
  ]);

  // Swap the new file in for the old one.
  await fsp.rename(tmpPath, finalPath);
  if (path.resolve(finalPath) !== path.resolve(videoPath)) {
    // Original was .mov/.m4v — remove it and fix the path in memories.json.
    await fsp.rm(videoPath);
    rewriteSrc(memories, toSrc(videoPath), toSrc(finalPath));
  }

  return finalPath;
}

// ---------------------------------------------------------------------------
// HEIC safety net
// ---------------------------------------------------------------------------

async function convertHeic(heicPath, memories) {
  const dir = path.dirname(heicPath);
  const base = path.basename(heicPath, path.extname(heicPath));
  const jpgPath = path.join(dir, `${base}.jpg`);
  try {
    await sharp(heicPath).jpeg({ quality: 90 }).toFile(jpgPath);
  } catch {
    await execFileAsync('sips', ['-s', 'format', 'jpeg', heicPath, '--out', jpgPath]);
  }
  await fsp.rm(heicPath);
  rewriteSrc(memories, toSrc(heicPath), toSrc(jpgPath));
  return jpgPath;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log(`Nothing to do — ${MEDIA_DIR} does not exist yet. Run ingest first.`);
    return;
  }

  console.log(`\n🎬 Compressing media in: ${MEDIA_DIR}\n`);
  const memories = await loadMemories();

  let compressed = 0;
  let skipped = 0;
  let converted = 0;
  const tooBig = [];
  let savedBytes = 0;

  for await (const file of walk(MEDIA_DIR)) {
    const ext = path.extname(file).toLowerCase();

    if (VIDEO_EXTS.has(ext)) {
      if (ext === '.mp4' && (await alreadyCompressed(file))) {
        skipped++;
        continue;
      }
      const before = await fileSize(file);
      try {
        const outPath = await compressVideo(file, memories);
        const after = await fileSize(outPath);
        savedBytes += Math.max(0, before - after);
        compressed++;
        const rel = path.relative(MEDIA_DIR, outPath);
        console.log(`   🎬 ${rel}  ${mb(before)} MB → ${mb(after)} MB`);
        if (after > CLOUDFLARE_MAX_BYTES) tooBig.push({ rel, size: after });
      } catch (err) {
        console.error(`   ❌ Failed to compress ${path.basename(file)}: ${err.message}`);
      }
    } else if (HEIC_EXTS.has(ext)) {
      try {
        const out = await convertHeic(file, memories);
        converted++;
        console.log(`   🖼️  ${path.relative(MEDIA_DIR, file)} → ${path.basename(out)} (HEIC→JPG)`);
      } catch (err) {
        console.error(`   ❌ Failed to convert ${path.basename(file)}: ${err.message}`);
      }
    }
  }

  if (memories) await saveMemories(memories);

  // ------------------------------------------------------------------
  console.log('\n─────────────────────────────────────────────');
  console.log(`✅ Done. ${compressed} video(s) compressed, ${converted} HEIC converted, ${skipped} already-done skipped.`);
  if (compressed) console.log(`   ↳ Saved about ${mb(savedBytes)} MB total.`);
  if (tooBig.length) {
    console.log(`\n⚠️  ${tooBig.length} file(s) are STILL over Cloudflare's 25 MB limit and must be trimmed before deploy:`);
    for (const f of tooBig) console.log(`      • ${f.rel} (${mb(f.size)} MB)`);
  }
  console.log('─────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('\n❌ Compression failed:', err.message);
  process.exitCode = 1;
});
