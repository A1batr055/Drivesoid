'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR    = path.join(__dirname, '../data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.jsonl');
const ROTATE_BYTES = 5 * 1024 * 1024; // 5 MB
const ROTATE_KEEP  = 10_000;           // lines retained after rotation

function rotateIfNeeded() {
  try {
    if (fs.statSync(EVENTS_PATH).size < ROTATE_BYTES) return;
    const lines = fs.readFileSync(EVENTS_PATH, 'utf8').split('\n').filter(l => l.trim());
    fs.writeFileSync(EVENTS_PATH, lines.slice(-ROTATE_KEEP).join('\n') + '\n', 'utf8');
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
  rotateIfNeeded();
}

module.exports = { appendEvent };
