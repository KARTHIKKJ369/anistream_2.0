'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Standard ani-cli state directory
const HIST_DIR = process.env.ANI_CLI_HIST_DIR
  || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'ani-cli');

const HIST_FILE = path.join(HIST_DIR, 'ani-hsts');
const FALLBACK_HIST_FILE = path.join(HIST_DIR, 'history');
const PROGRESS_FILE = path.join(HIST_DIR, 'ani-progress.json');

/**
 * Ensure storage directory and files exist.
 */
function ensureStorage() {
  if (!fs.existsSync(HIST_DIR)) {
    fs.mkdirSync(HIST_DIR, { recursive: true });
  }
  if (!fs.existsSync(HIST_FILE)) {
    // If old history file exists, migrate or initialize
    if (fs.existsSync(FALLBACK_HIST_FILE)) {
      try {
        fs.copyFileSync(FALLBACK_HIST_FILE, HIST_FILE);
      } catch (_) {
        fs.writeFileSync(HIST_FILE, '');
      }
    } else {
      fs.writeFileSync(HIST_FILE, '');
    }
  }
  if (!fs.existsSync(PROGRESS_FILE)) {
    try {
      fs.writeFileSync(PROGRESS_FILE, '{}', 'utf8');
    } catch (_) {}
  }
}

/**
 * Read detailed progress companion JSON.
 */
function readProgressMap() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(PROGRESS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (_) {
    return {};
  }
}

/**
 * Write detailed progress companion JSON.
 */
function writeProgressMap(map) {
  ensureStorage();
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(map, null, 2), 'utf8');
  } catch (err) {
    console.error('[writeProgressMap error]', err.message);
  }
}

/**
 * Read history entries from ani-hsts and enrich with progress data.
 * ani-hsts format: ep_no \t anime_id \t anime_title
 */
function readHistory() {
  ensureStorage();
  let content = '';
  try {
    content = fs.readFileSync(HIST_FILE, 'utf8');
  } catch (e) {
    return [];
  }

  const progressMap = readProgressMap();
  const lines = content.split('\n').filter(l => l.trim());

  const entries = lines.map(line => {
    const parts = line.split('\t');
    if (parts.length < 3) return null;

    const episodeNumber = parts[0].trim();
    const animeId = parts[1].trim();
    const animeTitle = parts[2].trim();
    const cover = parts[3] ? parts[3].trim() : null;
    const banner = parts[4] ? parts[4].trim() : null;

    const prog = progressMap[animeId] || {};

    return {
      episodeNumber,
      animeId,
      animeTitle,
      cover: cover || prog.cover || null,
      banner: banner || prog.banner || null,
      currentTime: prog.currentTime || 0,
      duration: prog.duration || 0,
      progressPercent: prog.progressPercent || 0,
      updatedAt: prog.updatedAt || Date.now(),
    };
  }).filter(Boolean);

  // Return reverse (most recent first)
  return entries.reverse();
}

/**
 * Update or add a history entry.
 * Synchronizes with ani-cli's ani-hsts while saving metadata & progress.
 */
function updateHistory(episodeNumber, animeId, animeTitle, cover = '', banner = '', currentTime = 0, duration = 0) {
  ensureStorage();
  const safeTitle = (animeTitle || '').replace(/\t|\r|\n/g, ' ').trim();
  const safeId = (animeId || '').replace(/\t|\r|\n/g, '').trim();
  const epNo = String(episodeNumber).trim();

  let content = '';
  try {
    content = fs.readFileSync(HIST_FILE, 'utf8');
  } catch (_) {}

  const lines = content.split('\n').filter(l => l.trim());
  const existingIndex = lines.findIndex(l => {
    const parts = l.split('\t');
    return parts[1] === safeId;
  });

  // Standard 3-field ani-cli format: ep_no \t anime_id \t anime_title
  const newEntry = `${epNo}\t${safeId}\t${safeTitle}`;

  let newLines;
  if (existingIndex >= 0) {
    newLines = [...lines];
    newLines[existingIndex] = newEntry;
  } else {
    newLines = [...lines, newEntry];
  }

  try {
    fs.writeFileSync(HIST_FILE, newLines.join('\n') + '\n', 'utf8');
  } catch (err) {
    console.error('[updateHistory write error]', err.message);
  }

  // Update companion progress map
  const progressMap = readProgressMap();
  const percent = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

  progressMap[safeId] = {
    animeId: safeId,
    animeTitle: safeTitle,
    episodeNumber: parseInt(epNo, 10) || 1,
    currentTime: Number(currentTime) || 0,
    duration: Number(duration) || 0,
    progressPercent: percent,
    cover: cover || progressMap[safeId]?.cover || null,
    banner: banner || progressMap[safeId]?.banner || null,
    updatedAt: Date.now(),
  };

  writeProgressMap(progressMap);
}

/**
 * Save exact playback timestamp without modifying episode if omitted.
 */
function saveExactProgress(animeId, episodeNumber, currentTime, duration, cover = null, banner = null) {
  if (!animeId) return;
  const progressMap = readProgressMap();
  const existing = progressMap[animeId] || {};

  const ep = episodeNumber !== undefined ? parseInt(episodeNumber, 10) : (existing.episodeNumber || 1);
  const curTime = Number(currentTime) || 0;
  const dur = Number(duration) || 0;
  const percent = dur > 0 ? Math.min(100, Math.round((curTime / dur) * 100)) : 0;

  progressMap[animeId] = {
    ...existing,
    animeId,
    episodeNumber: ep,
    currentTime: curTime,
    duration: dur,
    progressPercent: percent,
    cover: cover || existing.cover || null,
    banner: banner || existing.banner || null,
    updatedAt: Date.now(),
  };

  writeProgressMap(progressMap);
}

/**
 * Get saved progress for a specific anime.
 */
function getProgress(animeId) {
  const map = readProgressMap();
  return map[animeId] || null;
}

/**
 * Delete all history and progress.
 */
function clearHistory() {
  ensureStorage();
  try {
    fs.writeFileSync(HIST_FILE, '', 'utf8');
    fs.writeFileSync(PROGRESS_FILE, '{}', 'utf8');
  } catch (err) {
    console.error('[clearHistory error]', err.message);
  }
}

/**
 * Remove a single anime from history and progress.
 */
function removeFromHistory(animeId) {
  ensureStorage();
  try {
    const content = fs.readFileSync(HIST_FILE, 'utf8');
    const lines = content.split('\n').filter(l => {
      const parts = l.split('\t');
      return parts[1] !== animeId;
    });
    fs.writeFileSync(HIST_FILE, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');

    const progressMap = readProgressMap();
    delete progressMap[animeId];
    writeProgressMap(progressMap);
  } catch (err) {
    console.error('[removeFromHistory error]', err.message);
  }
}

module.exports = {
  readHistory,
  updateHistory,
  saveExactProgress,
  getProgress,
  clearHistory,
  removeFromHistory,
};
