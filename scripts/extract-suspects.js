#!/usr/bin/env node
'use strict';

/**
 * scripts/extract-suspects.js
 * ---------------------------
 * Pulls "suspect" photos (ones with NO capture date in their metadata —
 * usually WhatsApp saves/downloads that may sit on the wrong date) OUT of
 * the site and into a `review/` folder, so you can re-sort them by hand.
 *
 * Usage:
 *   node scripts/extract-suspects.js 2026-07-11              (one date)
 *   node scripts/extract-suspects.js 2026-07-11 2025-12-30   (several dates)
 *   node scripts/extract-suspects.js --all                   (every date)
 *
 * Photos whose metadata confirms their date are NEVER touched.
 * Extracted photos land in review/unsorted-<the-date-they-were-on>/ so you
 * can see where they came from. adopt.js deliberately IGNORES "unsorted-"
 * folders — only photos you move into a plain date folder (e.g. 2026-03-11)
 * get filed back. If a date ends up empty it disappears from the calendar,
 * and its title is safely stashed (adopt.js restores it).
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { exiftool } = require('exiftool-vendored');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MEDIA_DIR = path.join(PROJECT_ROOT, 'public', 'media');
const MEMORIES_PATH = path.join(PROJECT_ROOT, 'data', 'memories.json');
const REVIEW_DIR = path.join(PROJECT_ROOT, 'review');
const TITLE_STASH = path.join(REVIEW_DIR, '_titles.json');

const pad2 = (n) => String(n).padStart(2, '0');

async function readJson(p, fallback) {
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(p, obj) {
  await fsp.mkdir(path.dirname(p), { recursive: true });
  await fsp.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/extract-suspects.js <date> [more dates] | --all');
    process.exitCode = 1;
    return;
  }

  const memories = await readJson(MEMORIES_PATH, null);
  if (!memories) {
    console.error('data/memories.json not found.');
    process.exitCode = 1;
    return;
  }

  const dates = args.includes('--all')
    ? Object.keys(memories)
    : args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

  if (!dates.length) {
    console.error('No valid dates given (expected YYYY-MM-DD).');
    process.exitCode = 1;
    return;
  }

  const titleStash = await readJson(TITLE_STASH, {});
  let moved = 0;
  let kept = 0;
  let emptied = 0;

  for (const date of dates) {
    const entry = memories[date];
    if (!entry) {
      console.log(`   (no memories on ${date} — skipping)`);
      continue;
    }

    const remaining = [];
    for (const item of entry.media) {
      if (item.type !== 'image') {
        remaining.push(item); // videos are never suspects here
        continue;
      }
      const abs = path.join(PROJECT_ROOT, 'public', item.src);
      if (!fs.existsSync(abs)) {
        remaining.push(item);
        continue;
      }

      // Does the photo's own metadata confirm a capture date?
      let confirmed = false;
      try {
        const t = await exiftool.read(abs);
        const dt = t.DateTimeOriginal || t.CreateDate || t.MediaCreateDate;
        confirmed = !!(dt && typeof dt === 'object' && dt.year);
      } catch {
        confirmed = false;
      }

      if (confirmed) {
        kept++;
        remaining.push(item);
        continue;
      }

      // Suspect: move it (and remove its small copy) out to review/.
      // "unsorted-" prefix so adopt.js never re-files it until YOU move it
      // into a real date folder.
      const destDir = path.join(REVIEW_DIR, `unsorted-${date}`);
      await fsp.mkdir(destDir, { recursive: true });
      await fsp.rename(abs, path.join(destDir, path.basename(abs)));
      const sm = abs.replace(/(\.[a-z0-9]+)$/i, '-sm.jpg');
      if (fs.existsSync(sm)) await fsp.rm(sm);
      moved++;
      console.log(`   📤 ${date}/${path.basename(abs)} → review/unsorted-${date}/`);
    }

    if (remaining.length) {
      entry.media = remaining;
    } else {
      // Date is now empty — remove it from the calendar, stash its title.
      if (entry.title) titleStash[date] = entry.title;
      delete memories[date];
      emptied++;
      // Remove the now-empty folder if nothing (but thumbs) is left.
      const dir = path.join(MEDIA_DIR, date);
      if (fs.existsSync(dir)) {
        const left = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
        if (!left.length) await fsp.rm(dir, { recursive: true });
      }
    }
  }

  await writeJson(MEMORIES_PATH, memories);
  await writeJson(TITLE_STASH, titleStash);
  await exiftool.end();

  console.log('─────────────────────────────────────────────');
  console.log(`✅ ${moved} suspect photo(s) moved to review/ · ${kept} confirmed photo(s) untouched.`);
  if (emptied) console.log(`   ↳ ${emptied} date(s) became empty and left the calendar (titles stashed).`);
  console.log('   Next: sort them in the review folder, then run  node scripts/adopt.js');
  console.log('─────────────────────────────────────────────');
}

main().catch(async (err) => {
  console.error('❌ Failed:', err.message);
  try { await exiftool.end(); } catch {}
  process.exitCode = 1;
});
