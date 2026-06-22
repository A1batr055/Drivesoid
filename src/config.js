'use strict';
const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../drives.config.json');

let _config = null;

function load() {
  if (_config) return _config;
  try {
    _config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('[drives] drives.config.json not found — copy drives.config.example.json and fill in your values.');
    } else {
      console.error('[drives] Failed to load drives.config.json:', e.message);
    }
    process.exit(1);
  }
  const required = [
    ['persona.name',            _config?.persona?.name],
    ['user.name',               _config?.user?.name],
    ['classifier.api_key_env',  _config?.classifier?.api_key_env],
  ];
  for (const [field, val] of required) {
    if (!val) { console.error(`[drives] Missing required config: ${field}`); process.exit(1); }
  }
  return _config;
}

module.exports = { load };
