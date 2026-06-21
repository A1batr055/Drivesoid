'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const DATA_DIR    = path.join(__dirname, '../data');
const EVENTS_PATH = path.join(DATA_DIR, 'events.jsonl');

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

module.exports = { appendEvent };
