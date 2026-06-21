#!/usr/bin/env node
'use strict';

// Optional CLI setup wizard — backup for users who prefer not to configure manually.
// Primary deployment path is agent-guided (see AGENT_SETUP.md).

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(resolve =>
  rl.question(def ? `${q} [${def}]: ` : `${q}: `, ans => resolve(ans.trim() || def || ''))
);

async function main() {
  console.log('\nDrivesoid Setup\n───────────────');

  const personaName = await ask("AI persona name");
  const userName    = await ask("Your name");
  const relation    = await ask("Relationship type (romantic/companion/friend)", "romantic");
  const tzOffset    = await ask("Timezone offset from UTC (e.g. 8 for Beijing)", "8");
  const endpoint    = await ask("Classifier API endpoint", "https://api.deepseek.com");
  const model       = await ask("Classifier model", "deepseek-v4-flash");
  const apiKeyEnv   = "DRIVES_API_KEY";
  const apiKey      = await ask("API key (will be written to .env)");
  const port        = await ask("Port", "3001");

  rl.close();

  const config = {
    persona:  { name: personaName },
    user:     { name: userName },
    relation,
    timezone_offset_hours: (parsed => isNaN(parsed) ? 8 : parsed)(parseInt(tzOffset, 10)),
    classifier: { endpoint, model, api_key_env: apiKeyEnv },
    server: { port: parseInt(port, 10) || 3001 },
  };

  const root = path.join(__dirname, '..');
  fs.writeFileSync(path.join(root, 'drives.config.json'), JSON.stringify(config, null, 2));
  fs.writeFileSync(path.join(root, '.env'), `DRIVES_API_KEY=${apiKey}\n`);

  console.log('\nConfig written. Start with: npm start\n');
}

main().catch(e => { console.error(e); process.exit(1); });
