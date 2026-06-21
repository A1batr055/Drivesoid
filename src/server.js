'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
app.use(express.json());

const ROOT        = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'drives.config.json');
const ENV_PATH    = path.join(ROOT, '.env');
const SETUP_PORT  = 3001;

function loopbackOnly(req, res, next) {
  const addr = req.socket.remoteAddress;
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return next();
  res.status(403).json({ error: 'loopback only' });
}

function needsSetup() {
  if (!fs.existsSync(CONFIG_PATH)) return true;
  const key = process.env.DRIVES_API_KEY || '';
  return !key || key === 'your_api_key_here';
}

const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Drivesoid Setup</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, sans-serif; background: #f0f0f0; display: flex; justify-content: center; padding: 40px 16px; min-height: 100vh; }
  .card { background: white; border-radius: 12px; padding: 36px; max-width: 480px; width: 100%; height: fit-content; box-shadow: 0 2px 16px rgba(0,0,0,0.08); }
  h1 { font-size: 1.3rem; font-weight: 600; margin-bottom: 4px; }
  .subtitle { color: #777; font-size: 0.85rem; margin-bottom: 28px; }
  .field { margin-bottom: 16px; }
  label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 5px; color: #222; }
  label .note { font-weight: 400; color: #999; }
  input { width: 100%; padding: 8px 11px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem; transition: border-color 0.15s; }
  input:focus { outline: none; border-color: #888; }
  .hint { font-size: 0.78rem; color: #999; margin-top: 4px; }
  .hint a { color: #0066cc; }
  .divider { border: none; border-top: 1px solid #eee; margin: 20px 0; }
  button { width: 100%; padding: 10px; background: #111; color: white; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 500; cursor: pointer; margin-top: 4px; transition: background 0.15s; }
  button:hover { background: #333; }
  button:disabled { background: #999; cursor: default; }
  #success { display: none; text-align: center; padding: 16px 0; }
  #success .check { font-size: 2rem; margin-bottom: 10px; }
  #success h2 { font-size: 1.1rem; margin-bottom: 8px; }
  #success p { color: #555; font-size: 0.875rem; line-height: 1.5; }
  #error { display: none; color: #c00; font-size: 0.85rem; margin-top: 10px; }
</style>
</head>
<body>
<div class="card">
  <h1>Drivesoid Setup</h1>
  <p class="subtitle">One-time configuration. Fill in and submit — your AI agent will handle the rest.</p>
  <form id="form">
    <div class="field">
      <label>AI persona name <span class="note">(what should I call myself?)</span></label>
      <input name="ai_name" required placeholder="e.g. Aria">
    </div>
    <div class="field">
      <label>Your name</label>
      <input name="user_name" required placeholder="e.g. Alex">
    </div>
    <div class="field">
      <label>Relationship</label>
      <input name="relation" required placeholder="e.g. romantic, best friends, work partner">
    </div>
    <div class="field">
      <label>Your timezone <span class="note">(UTC offset)</span></label>
      <input name="timezone" type="number" value="8" min="-12" max="14">
      <div class="hint">8 = China/Singapore · -5 = New York · 0 = London</div>
    </div>

    <hr class="divider">

    <div class="field">
      <label>Classifier API key</label>
      <input name="api_key" type="password" required placeholder="sk-...">
      <div class="hint">
        Used to label your messages emotionally — a cheap fast model works best.<br>
        <a href="https://platform.deepseek.com/api_keys" target="_blank">Get a free DeepSeek key ↗</a>
        (recommended)
      </div>
    </div>
    <div class="field">
      <label>API base URL <span class="note">(advanced)</span></label>
      <input name="api_url" value="https://api.deepseek.com">
    </div>
    <div class="field">
      <label>Model <span class="note">(advanced)</span></label>
      <input name="api_model" value="deepseek-v4-flash">
    </div>

    <button type="submit" id="btn">Complete Setup</button>
    <div id="error"></div>
  </form>
  <div id="success">
    <div class="check">✓</div>
    <h2>Setup complete</h2>
    <p>Tell your AI agent to restart Drivesoid:<br><code>npm start</code></p>
  </div>
</div>
<script>
document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn');
  const err = document.getElementById('error');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  err.style.display = 'none';
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const res = await fetch('/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      document.getElementById('form').style.display = 'none';
      document.getElementById('success').style.display = 'block';
    } else {
      const msg = await res.text();
      err.textContent = 'Error: ' + msg;
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Complete Setup';
    }
  } catch (ex) {
    err.textContent = 'Network error: ' + ex.message;
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Complete Setup';
  }
});
</script>
</body>
</html>`;

if (needsSetup()) {
  app.get('/setup', (req, res) => res.send(SETUP_HTML));
  app.post('/setup', (req, res) => {
    const { ai_name, user_name, relation, timezone, api_key, api_url, api_model } = req.body || {};
    if (!ai_name || !user_name || !relation || !api_key) {
      return res.status(400).send('Missing required fields');
    }
    const cfg = {
      persona:  { name: ai_name },
      user:     { name: user_name },
      relation,
      timezone_offset_hours: parseInt(timezone, 10),
      classifier: {
        endpoint:    (api_url || 'https://api.deepseek.com').replace(/\/$/, ''),
        model:       api_model || 'deepseek-v4-flash',
        api_key_env: 'DRIVES_API_KEY',
      },
      server: { port: SETUP_PORT },
    };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
      fs.writeFileSync(ENV_PATH, `DRIVES_API_KEY=${api_key}\n`);
    } catch (e) {
      return res.status(500).send(e.message);
    }
    res.json({ ok: true });
  });
  app.get('*', (req, res) => res.redirect('/setup'));

  app.listen(SETUP_PORT, '127.0.0.1', () => {
    console.log(`[drives] First-time setup — open http://127.0.0.1:${SETUP_PORT}/setup`);
  });
} else {
  const drives = require('./index');
  const config  = require('./config').load();
  const PORT    = config.server?.port || 3001;

  app.get('/api/drives/status', (req, res) => { res.json(drives.getStatus()); });

  app.post('/internal/drives/session-start', loopbackOnly, async (req, res) => {
    try {
      await drives.handleSessionStart();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/internal/drives/event', loopbackOnly, async (req, res) => {
    const { type, payload } = req.body || {};
    if (!type) return res.status(400).json({ error: 'type required' });
    try {
      await drives.appendEvent(type, payload || {});
      res.json({ ok: true, type });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.post('/internal/drives/sleep', loopbackOnly, async (req, res) => {
    const { type } = req.body || {};
    if (type !== 'sleep_start' && type !== 'sleep_end') {
      return res.status(400).json({ error: 'type must be sleep_start or sleep_end' });
    }
    try {
      await drives.appendEvent(type);
      res.json({ ok: true, type });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  drives.start();
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[drives] Drivesoid listening on port ${PORT}`);
    console.log(`[drives] Persona: ${config.persona.name} / User: ${config.user.name}`);
  });
}
