#!/usr/bin/env node
'use strict';

/**
 * scripts/make-thumbs.js
 * ----------------------
 * Creates a small, fast-loading copy of every photo in public/media,
 * saved next to the original as "<name>-sm.jpg" (about 30–60 KB each).
 *
 * The scatter view uses these small copies so that opening a date with
 * dozens of photos stays instant; clicking a photo to zoom loads the
 * full-quality original.
 *
 * Run it once now, and again any time after ingesting new photos:
 *
 *   node scripts/make-thumbs.js
 *
 * Idempotent — photos that already have a "-sm.jpg" copy are skipped.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'public', 'media');

const PHOTO_EXTS = new Set(['.jpg', '.jpeg', '.png']);

async function* walk(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

async function main() {
  if (!fs.existsSync(MEDIA_DIR)) {
    console.log('Nothing to do — public/media does not exist yet.');
    return;
  }

  let made = 0;
  let skipped = 0;
  let failed = 0;

  for await (const file of walk(MEDIA_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!PHOTO_EXTS.has(ext)) continue;

    const base = path.basename(file, path.extname(file));
    // Don't thumbnail our own outputs or video poster frames.
    if (base.endsWith('-sm') || base.endsWith('-thumb')) continue;

    const smPath = path.join(path.dirname(file), `${base}-sm.jpg`);
    if (fs.existsSync(smPath)) {
      skipped++;
      continue;
    }

    try {
      await sharp(file)
        .rotate() // respect the photo's orientation info
        .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toFile(smPath);
      made++;
    } catch (err) {
      failed++;
      console.error(`   ❌ ${path.relative(MEDIA_DIR, file)}: ${err.message}`);
    }
  }

  console.log('─────────────────────────────────────────────');
  console.log(`✅ Done. ${made} small copies created, ${skipped} already existed.`);
  if (failed) console.log(`   ↳ ${failed} photo(s) failed (see above).`);
  console.log('─────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
});
