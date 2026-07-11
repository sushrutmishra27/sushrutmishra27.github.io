#!/usr/bin/env node
'use strict';

/**
 * scripts/ingest.js
 * -----------------
 * Reads a messy folder of photos/videos (e.g. an iCloud export), figures out
 * the REAL date each one was taken from its metadata, and organizes copies
 * into public/media/YYYY-MM-DD/. Then records each item in data/memories.json.
 *
 * Usage:
 *   node scripts/ingest.js <inputFolder> [outputFolder]
 *
 * Examples:
 *   node scripts/ingest.js ~/Desktop/icloud-dump
 *   node scripts/ingest.js ~/Desktop/icloud-dump public/media
 *
 * It is SAFE to run over and over — already-organized files are skipped, and
 * nothing you type into memories.json by hand (titles, captions) is lost.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const ffprobePath = require('ffprobe-static').path;
const { exiftool } = require('exiftool-vendored');
const sharp = require('sharp');

// ---------------------------------------------------------------------------
// Paths & config
// ---------------------------------------------------------------------------

// Project root is one level up from this scripts/ folder, so the script works
// no matter which directory you run it from.
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'public', 'media');
const MEMORIES_PATH = path.join(PROJECT_ROOT, 'data', 'memories.json');

// Which file types we treat as photos vs videos. Anything else is ignored.
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v']);
// iCloud sprinkles these in; they are not media and should be skipped quietly.
const IGNORE_EXTS = new Set(['.aae', '.plist', '.json', '.txt', '.ds_store']);

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');

// Turn "~/Desktop/x" into "/Users/you/Desktop/x" (the shell does this, Node doesn't).
function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

// "IMG 1234 (edited).HEIC" -> "img-1234-edited.heic"  (keeps extension, drops spaces)
function slugifyFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, path.extname(filename));
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file';
  return { slug, ext };
}

function classify(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return null;
}

// Recursively yield every file path under a directory, skipping hidden entries.
async function* walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Could not read folder "${dir}": ${err.message}`);
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // .DS_Store, ._resource forks, etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Date extraction — the heart of the script
// ---------------------------------------------------------------------------

// Photos: read EXIF "DateTimeOriginal" via exiftool (handles HEIC natively).
async function imageDate(file) {
  const tags = await exiftool.read(file);
  const dt = tags.DateTimeOriginal || tags.CreateDate || tags.MediaCreateDate;
  if (dt && typeof dt === 'object' && dt.year && dt.month && dt.day) {
    return `${dt.year}-${pad2(dt.month)}-${pad2(dt.day)}`;
  }
  return null;
}

// Videos: read QuickTime "creation_time" via ffprobe.
async function videoDate(file) {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  const data = JSON.parse(stdout);
  const ct =
    (data.format && data.format.tags && data.format.tags.creation_time) ||
    (data.streams || [])
      .map((s) => s.tags && s.tags.creation_time)
      .find(Boolean);
  if (ct) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ct);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

// Fallback used when metadata is missing (e.g. screenshots): file's modified time.
async function mtimeDate(file) {
  const st = await fsp.stat(file);
  const d = st.mtime;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Copy / convert into place, avoiding collisions and duplicates
// ---------------------------------------------------------------------------

async function fileSize(p) {
  try {
    return (await fsp.stat(p)).size;
  } catch {
    return -1;
  }
}

// Find a free destination path. If a file with the same name already exists AND
// is the same size, we treat it as "already ingested" and return {existing:true}
// so the copy is skipped (this is what makes re-runs idempotent). If the name is
// taken by a DIFFERENT file, we append -1, -2, ... so nothing gets overwritten.
async function resolveDestination(dir, slug, ext, sourceSize) {
  for (let i = 0; ; i++) {
    const name = i === 0 ? `${slug}${ext}` : `${slug}-${i}${ext}`;
    const dest = path.join(dir, name);
    const existingSize = await fileSize(dest);
    if (existingSize === -1) return { dest, name, existing: false }; // free slot
    if (existingSize === sourceSize) return { dest, name, existing: true }; // same file already here
    // else: name taken by a different file -> try the next suffix
  }
}

// Convert a HEIC/HEIF photo to browser-friendly JPEG. Tries sharp first; if that
// fails (some HEIC variants trip up libheif), falls back to macOS's built-in sips.
async function convertHeicToJpeg(source, dest) {
  try {
    await sharp(source).jpeg({ quality: 90 }).toFile(dest);
    return true;
  } catch {
    await execFileAsync('sips', ['-s', 'format', 'jpeg', source, '--out', dest]);
    return true;
  }
}

// Make a poster thumbnail for a video. Grabs the frame at 1 second; if the clip
// is shorter than that, retries at the very first frame.
async function makeVideoThumb(videoPath, thumbPath) {
  const ffmpegPath = require('ffmpeg-static');
  async function grab(seconds) {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(seconds),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '3',
      thumbPath,
    ]);
    return (await fileSize(thumbPath)) > 0;
  }
  try {
    if (await grab(1)) return true;
  } catch {
    /* fall through to first-frame attempt */
  }
  return grab(0);
}

// ---------------------------------------------------------------------------
// memories.json helpers
// ---------------------------------------------------------------------------

async function loadMemories() {
  try {
    const raw = await fsp.readFile(MEMORIES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return {}; // first run — start empty
    throw new Error(`data/memories.json exists but is not valid JSON: ${err.message}`);
  }
}

async function saveMemories(memories) {
  // Write with dates in chronological order so the file stays easy to read.
  const sorted = {};
  for (const key of Object.keys(memories).sort()) sorted[key] = memories[key];
  await fsp.mkdir(path.dirname(MEMORIES_PATH), { recursive: true });
  await fsp.writeFile(MEMORIES_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

// Add a media item to a date, creating the date entry if needed. Never adds the
// same src twice, and never touches an existing title/caption.
function addMedia(memories, date, mediaItem) {
  if (!memories[date]) memories[date] = { title: '', media: [] };
  if (!Array.isArray(memories[date].media)) memories[date].media = [];
  const already = memories[date].media.some((m) => m.src === mediaItem.src);
  if (already) return false;
  memories[date].media.push(mediaItem);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const inputArg = process.argv[2];
  const outputArg = process.argv[3];

  if (!inputArg) {
    console.error('Usage: node scripts/ingest.js <inputFolder> [outputFolder]');
    console.error('Example: node scripts/ingest.js ~/Desktop/icloud-dump');
    process.exitCode = 1;
    return;
  }

  const inputDir = path.resolve(expandHome(inputArg));
  const outputDir = outputArg ? path.resolve(expandHome(outputArg)) : DEFAULT_OUTPUT;

  if (!fs.existsSync(inputDir)) {
    console.error(`Input folder does not exist: ${inputDir}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n📥 Reading from: ${inputDir}`);
  console.log(`📤 Organizing into: ${outputDir}\n`);

  const memories = await loadMemories();

  // Running tallies for the final summary.
  let photos = 0;
  let videos = 0;
  let skipped = 0; // media already organized on a previous run
  let ignored = 0; // non-media files
  let warnings = 0; // had to fall back to file date
  const datesTouched = new Set();

  for await (const source of walk(inputDir)) {
    const kind = classify(source);
    const ext = path.extname(source).toLowerCase();

    if (!kind) {
      if (!IGNORE_EXTS.has(ext)) ignored++; // count only "real" unexpected files
      continue;
    }

    // 1) Work out the date.
    let date = null;
    try {
      date = kind === 'image' ? await imageDate(source) : await videoDate(source);
    } catch (err) {
      console.warn(`   ⚠️  Could not read metadata for ${path.basename(source)}: ${err.message}`);
    }
    if (!date) {
      date = await mtimeDate(source);
      warnings++;
      console.warn(`   ⚠️  No capture date in ${path.basename(source)} — using file date ${date}`);
    }

    // 2) Prepare the destination folder.
    const destDir = path.join(outputDir, date);
    await fsp.mkdir(destDir, { recursive: true });

    // 3) Figure out the destination filename (HEIC becomes JPEG).
    let { slug, ext: destExt } = slugifyFilename(source);
    const isHeic = destExt === '.heic' || destExt === '.heif';
    if (isHeic) destExt = '.jpg';

    const sourceSize = await fileSize(source);
    // For HEIC we can't size-match (output differs), so key idempotency on the
    // target JPEG existing. For everything else, match on size.
    const { dest, name, existing } = isHeic
      ? await (async () => {
          const target = path.join(destDir, `${slug}.jpg`);
          return { dest: target, name: `${slug}.jpg`, existing: fs.existsSync(target) };
        })()
      : await resolveDestination(destDir, slug, destExt, sourceSize);

    const src = `/media/${date}/${name}`;

    // 4) Copy or convert (unless already done).
    if (existing) {
      skipped++;
    } else {
      if (isHeic) {
        await convertHeicToJpeg(source, dest);
        console.log(`   🖼️  ${path.basename(source)} → ${date}/${name} (HEIC→JPG)`);
      } else {
        await fsp.copyFile(source, dest);
        console.log(`   ${kind === 'image' ? '🖼️ ' : '🎬'} ${path.basename(source)} → ${date}/${name}`);
      }
    }

    // 5) Build the memories.json entry (and a video poster).
    let mediaItem;
    if (kind === 'image') {
      photos += existing ? 0 : 1;
      mediaItem = { type: 'image', src };
    } else {
      videos += existing ? 0 : 1;
      const thumbName = `${slug}-thumb.jpg`;
      const thumbPath = path.join(destDir, thumbName);
      if (!fs.existsSync(thumbPath)) {
        try {
          await makeVideoThumb(dest, thumbPath);
        } catch (err) {
          console.warn(`   ⚠️  Could not make a poster for ${name}: ${err.message}`);
        }
      }
      mediaItem = { type: 'video', src, poster: `/media/${date}/${thumbName}` };
    }

    addMedia(memories, date, mediaItem);
    datesTouched.add(date);
  }

  await saveMemories(memories);
  await exiftool.end();

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('\n─────────────────────────────────────────────');
  console.log(`✅ Done. ${photos} photos + ${videos} videos organized across ${datesTouched.size} unique dates.`);
  if (skipped) console.log(`   ↳ ${skipped} file(s) were already organized and skipped.`);
  if (warnings) console.log(`   ↳ ${warnings} file(s) had no capture date and used the file date instead.`);
  if (ignored) console.log(`   ↳ ${ignored} non-photo/video file(s) were ignored.`);
  console.log(`   ↳ memories.json now has ${Object.keys(memories).length} date(s) total.`);
  console.log('─────────────────────────────────────────────\n');
}

main().catch(async (err) => {
  console.error('\n❌ Ingestion failed:', err.message);
  try {
    await exiftool.end();
  } catch {}
  process.exitCode = 1;
});
