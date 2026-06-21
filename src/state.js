'use strict';
const fs   = require('fs');
const path = require('path');

const DATA_DIR   = path.join(__dirname, '../data');
const STATE_PATH = path.join(DATA_DIR, 'drives.json');
const TMP_PATH   = STATE_PATH + '.tmp';

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(obj, null, 2);
  const fd   = fs.openSync(TMP_PATH, 'w');
  fs.writeSync(fd, json, 0, 'utf8');
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  for (let i = 0; i < 3; i++) {
    try {
      fs.renameSync(TMP_PATH, STATE_PATH);
      return;
    } catch (e) {
      if (i === 2) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

module.exports = { readState, writeState };
