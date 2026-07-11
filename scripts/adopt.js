#!/usr/bin/env node
'use strict';

/**
 * scripts/adopt.js
 * ----------------
 * The partner of extract-suspects.js. Reads the `review/` folder and files
 * every photo onto the date its FOLDER NAME says — no metadata needed,
 * you are the authority here.
 *
 * How to use (all in Finder, no tech):
 *   1. Open the `review` folder inside the sunimuni project. Unsorted photos
 *      wait in folders like  unsorted-2026-07-11  (named for where they WERE).
 *      Those "unsorted-" folders are never touched by this script.
 *   2. Make folders named by the CORRECT date, like  2026-03-11 .
 *   3. Drag each photo into the folder for the day it really belongs to.
 *      Delete any photo you don't want on the site at all.
 *   4. Run:  node scripts/adopt.js
 *   5. Then: node scripts/make-thumbs.js
 *
 * Photos are MOVED out of review/ as they're filed, so what's left in
 * review/ is simply what you haven't sorted yet. Titles you or Claude wrote
 * for a date are kept; a brand-new date starts with an empty title.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'public', 'media');
const MEMORIES_PATH = path.join(PROJECT_ROOT, 'data', 'memories.json');
const REVIEW_DIR = path.join(PROJECT_ROOT, 'review');
const TITLE_STASH = path.join(REVIEW_DIR, '_titles.json');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png']);

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(p, obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  await fsp.writeFile(p, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

async function fileSize(p) {
  try {
    return (await fsp.stat(p)).size;
  } catch {
    return -1;
  }
}

async function main() {
  if (!fs.existsSync(REVIEW_DIR)) {
    console.log('Nothing to do — there is no review/ folder.');
    return;
  }

  const memories = await readJson(MEMORIES_PATH, {});
  const titleStash = await readJson(TITLE_STASH, {});

  const dateFolders = fs
    .readdirSync(REVIEW_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
    .map((e) => e.name);

  let adopted = 0;
  let skippedDupes = 0;
  let ignored = 0;

  for (const date of dateFolders) {
    const srcDir = path.join(REVIEW_DIR, date);
    const files = fs.readdirSync(srcDir).filter((f) => !f.startsWith('.'));

    for (const name of files) {
      const ext = path.extname(name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) {
        if (name !== '_titles.json') {
          ignored++;
          console.log(`   ⚠️  Skipping non-photo file: review/${date}/${name}`);
        }
        continue;
      }

      const source = path.join(srcDir, name);
      const destDir = path.join(MEDIA_DIR, date);
      await fsp.mkdir(destDir, { recursive: true });

      // Same-name handling: identical size = same photo already there (skip);
      // different photo with same name gets a numbered suffix.
      const srcSize = await fileSize(source);
      let finalName = name;
      for (let i = 1; ; i++) {
        const candidate = path.join(destDir, finalName);
        const existing = await fileSize(candidate);
        if (existing === -1 || existing === srcSize) break;
        finalName = `${path.basename(name, ext)}-${i}${ext}`;
      }
      const dest = path.join(destDir, finalName);

      if ((await fileSize(dest)) === srcSize) {
        await fsp.rm(source); // already on the site — just clear it from review
        skippedDupes++;
        continue;
      }

      await fsp.rename(source, dest);
      adopted++;

      if (!memories[date]) {
        memories[date] = { title: titleStash[date] || '', media: [] };
        if (titleStash[date]) delete titleStash[date];
      }
      const src = `/media/${date}/${finalName}`;
      if (!memories[date].media.some((m) => m.src === src)) {
        memories[date].media.push({ type: 'image', src });
      }
      console.log(`   📥 review/${date}/${name} → ${date}/`);
    }

    // Tidy up folders that are now empty.
    if (!fs.readdirSync(srcDir).filter((f) => !f.startsWith('.')).length) {
      await fsp.rm(srcDir, { recursive: true });
    }
  }

  await writeJson(MEMORIES_PATH, memories);
  await writeJson(TITLE_STASH, titleStash);

  console.log('─────────────────────────────────────────────');
  console.log(`✅ ${adopted} photo(s) filed onto their dates · ${skippedDupes} already there · ${ignored} non-photos skipped.`);
  console.log('   Now run:  node scripts/make-thumbs.js');
  console.log('─────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exitCode = 1;
});
