#!/usr/bin/env node
'use strict';

/**
 * scripts/make-songs.js
 * ---------------------
 * Scans public/audio/ for .mp3 files and writes the list to data/songs.json.
 * The site shuffles through this list — a random song plays each time a
 * date is opened.
 *
 * Run it whenever you add or remove songs:
 *   node scripts/make-songs.js
 */

const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.resolve(__dirname, '..', 'public', 'audio');
const OUT = path.resolve(__dirname, '..', 'data', 'songs.json');

const songs = fs.existsSync(AUDIO_DIR)
  ? fs
      .readdirSync(AUDIO_DIR)
      .filter((f) => f.toLowerCase().endsWith('.mp3'))
      .sort()
      .map((f) => `/audio/${f}`)
  : [];

fs.writeFileSync(OUT, JSON.stringify(songs, null, 2) + '\n');
console.log(`✅ ${songs.length} song(s) written to data/songs.json`);
