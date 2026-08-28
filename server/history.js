'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Matches ani-cli's history file location
const HIST_DIR = process.env.ANI_CLI_HIST_DIR
  || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'ani-cli');
const HIST_FILE = path.join(HIST_DIR, 'history');

/**
 * Ensure the history directory and file exist.
 */
function ensureHistFile() {
  if (!fs.existsSync(HIST_DIR)) {
    fs.mkdirSync(HIST_DIR, { recursive: true });
  }
  if (!fs.existsSync(HIST_FILE)) {
    fs.writeFileSync(HIST_FILE, '');
  }
}

/**
 * Read history entries.
 * Format: ep_no \t anime_id \t anime_title \t cover_url \t banner_url
 */
function readHistory() {
  ensureHistFile();
  const content = fs.readFileSync(HIST_FILE, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const parts = line.split('\t');
    if (parts.length < 3) return null;
    return {
      episodeNumber: parts[0].trim(),
      animeId: parts[1].trim(),
      animeTitle: parts[2].trim(),
      cover: parts[3] ? parts[3].trim() : null,
      banner: parts[4] ? parts[4].trim() : null,
    };
  }).filter(Boolean).reverse();
}

/**
 * Update or add a history entry.
 */
function updateHistory(episodeNumber, animeId, animeTitle, cover = '', banner = '') {
  ensureHistFile();
  const content = fs.readFileSync(HIST_FILE, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  const newEntry = `${episodeNumber}\t${animeId}\t${animeTitle}\t${cover || ''}\t${banner || ''}`;
  const existingIndex = lines.findIndex(l => l.split('\t')[1] === animeId);

  let newLines;
  if (existingIndex >= 0) {
    newLines = [...lines];
    newLines[existingIndex] = newEntry;
  } else {
    newLines = [...lines, newEntry];
  }

  fs.writeFileSync(HIST_FILE, newLines.join('\n') + '\n');
}

/**
 * Delete all history.
 */
function clearHistory() {
  ensureHistFile();
  fs.writeFileSync(HIST_FILE, '');
}

/**
 * Remove a single anime from history.
 */
function removeFromHistory(animeId) {
  ensureHistFile();
  const content = fs.readFileSync(HIST_FILE, 'utf8');
  const lines = content.split('\n').filter(l => {
    const parts = l.split('\t');
    return parts[1] !== animeId;
  });
  fs.writeFileSync(HIST_FILE, lines.join('\n') + '\n');
}

module.exports = { readHistory, updateHistory, clearHistory, removeFromHistory };
