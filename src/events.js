'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR    = path.join(__dirname, '../data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.jsonl');
const ROTATE_BYTES = 5 * 1024 * 1024; // 5 MB
const ROTATE_KEEP  = 10_000;           // lines retained after rotation

function pruneEvents(lastProcessedId) {
  try {
    if (fs.statSync(EVENTS_PATH).size < ROTATE_BYTES) return;
    const lines = fs.readFileSync(EVENTS_PATH, 'utf8').split('\n').filter(l => l.trim());
    const cursorIdx = lastProcessedId
      ? lines.findIndex(l => { try { return JSON.parse(l).event_id === lastProcessedId; } catch { return false; } })
      : -1;
    const keepFrom = Math.min(
      cursorIdx >= 0 ? cursorIdx : lines.length,
      Math.max(0, lines.length - ROTATE_KEEP)
    );
    if (keepFrom <= 0) return;
    const tmp = EVENTS_PATH + '.tmp';
    fs.writeFileSync(tmp, lines.slice(keepFrom).join('\n') + '\n', 'utf8');
    fs.renameSync(tmp, EVENTS_PATH);
  } catch {}
}

function appendEvent(type, payload = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const line = JSON.stringify({
    event_id:  crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    payload,
  });
  fs.appendFileSync(EVENTS_PATH, line + '\n', 'utf8');
}

module.exports = { appendEvent, pruneEvents };
