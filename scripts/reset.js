'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const targets = [
  path.join(ROOT, 'drives.config.json'),
  path.join(ROOT, '.env'),
  path.join(ROOT, 'data'),
];

for (const t of targets) {
  if (!fs.existsSync(t)) continue;
  fs.rmSync(t, { recursive: true, force: true });
  console.log(`removed: ${path.relative(ROOT, t)}`);
}
console.log('Reset complete. Run "npm start" to reconfigure.');
