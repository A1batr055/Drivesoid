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
  body { font-family: system-ui, -apple-system, sans-serif; background: #f0f0f0; display: flex; justify-content: center; align-items: flex-start; padding: 24px 16px 48px; min-height: 100vh; }
  .card { background: white; border-radius: 14px; padding: 28px 24px; max-width: 460px; width: 100%; box-shadow: 0 2px 20px rgba(0,0,0,0.09); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  h1 { font-size: 1.25rem; font-weight: 650; line-height: 1.3; }
  #lang-btn { font-size: 0.78rem; padding: 3px 10px; border: 1px solid #ccc; border-radius: 20px; background: white; cursor: pointer; color: #555; white-space: nowrap; margin-left: 12px; flex-shrink: 0; }
  #lang-btn:hover { border-color: #888; color: #222; }
  .subtitle { color: #777; font-size: 0.83rem; margin-bottom: 24px; line-height: 1.5; }
  .field { margin-bottom: 14px; }
  label { display: block; font-size: 0.85rem; font-weight: 550; margin-bottom: 5px; color: #222; }
  label .note { font-weight: 400; color: #aaa; }
  input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 0.95rem; transition: border-color 0.15s; -webkit-appearance: none; }
  input:focus { outline: none; border-color: #666; }
  input[type=number] { -moz-appearance: textfield; }
  .hint { font-size: 0.76rem; color: #aaa; margin-top: 5px; line-height: 1.4; }
  .hint a { color: #0066cc; text-decoration: none; }
  .hint a:hover { text-decoration: underline; }
  .divider { border: none; border-top: 1px solid #eee; margin: 18px 0; }
  .adv-toggle { font-size: 0.8rem; color: #888; cursor: pointer; display: flex; align-items: center; gap: 4px; margin-bottom: 14px; user-select: none; }
  .adv-toggle::before { content: '▶'; font-size: 0.6rem; transition: transform 0.2s; }
  .adv-toggle.open::before { transform: rotate(90deg); }
  .adv-fields { display: none; }
  .adv-fields.open { display: block; }
  button[type=submit] { width: 100%; padding: 12px; background: #111; color: white; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 550; cursor: pointer; margin-top: 6px; transition: background 0.15s; }
  button[type=submit]:hover { background: #333; }
  button[type=submit]:disabled { background: #bbb; cursor: default; }
  #success { display: none; text-align: center; padding: 12px 0 4px; }
  #success .check { font-size: 2.2rem; margin-bottom: 10px; }
  #success h2 { font-size: 1.05rem; margin-bottom: 8px; }
  #success p { color: #555; font-size: 0.85rem; line-height: 1.6; }
  #success code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
  #errmsg { display: none; color: #c00; font-size: 0.83rem; margin-top: 10px; }
  @media (min-width: 500px) {
    .card { padding: 36px 32px; }
    h1 { font-size: 1.35rem; }
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1 id="t-title">Drivesoid Setup</h1>
    <button id="lang-btn" onclick="toggleLang()">中文</button>
  </div>
  <p class="subtitle" id="t-subtitle">One-time configuration. Fill in and submit — your AI agent will handle the rest.</p>

  <form id="form">
    <div class="field">
      <label><span id="t-ai-name">AI persona name</span> <span class="note" id="t-ai-name-note">(what should I call myself?)</span></label>
      <input name="ai_name" required id="i-ai-name" placeholder="e.g. Aria">
    </div>
    <div class="field">
      <label id="t-user-name">Your name</label>
      <input name="user_name" required id="i-user-name" placeholder="e.g. Alex">
    </div>
    <div class="field">
      <label id="t-relation">Relationship</label>
      <input name="relation" required id="i-relation" placeholder="e.g. romantic, best friends, work partner">
    </div>
    <div class="field">
      <label><span id="t-tz">Your timezone</span> <span class="note" id="t-tz-note">(UTC offset)</span></label>
      <input name="timezone" type="number" value="8" min="-12" max="14">
      <div class="hint" id="t-tz-hint">8 = China/Singapore &nbsp;·&nbsp; -5 = New York &nbsp;·&nbsp; 0 = London</div>
    </div>

    <hr class="divider">

    <div class="field">
      <label id="t-key">Classifier API key</label>
      <input name="api_key" type="password" required placeholder="sk-...">
      <div class="hint" id="t-key-hint">Used to label your messages emotionally — a cheap fast model works best.<br>
        Recommended: <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek ↗</a> (~$0.1 / 1M tokens)</div>
    </div>

    <div class="adv-toggle" id="adv-toggle" onclick="toggleAdv()"><span id="t-adv">Advanced</span></div>
    <div class="adv-fields" id="adv-fields">
      <div class="field">
        <label><span id="t-api-url">API base URL</span></label>
        <input name="api_url" value="https://api.deepseek.com">
      </div>
      <div class="field">
        <label id="t-model">Model</label>
        <input name="api_model" value="deepseek-v4-flash">
      </div>
    </div>

    <button type="submit" id="btn" id="t-btn">Complete Setup</button>
    <div id="errmsg"></div>
  </form>

  <div id="success">
    <div class="check">✓</div>
    <h2 id="t-done">Setup complete</h2>
    <p id="t-done-hint">Tell your AI agent to restart Drivesoid:<br><code>npm start</code></p>
  </div>
</div>
<script>
const STRINGS = {
  en: {
    title: 'Drivesoid Setup',
    subtitle: 'One-time configuration. Fill in and submit — your AI agent will handle the rest.',
    'ai-name': 'AI persona name', 'ai-name-note': '(what should I call myself?)',
    'i-ai-name': 'e.g. Aria',
    'user-name': 'Your name', 'i-user-name': 'e.g. Alex',
    relation: 'Relationship', 'i-relation': 'e.g. romantic, best friends, work partner',
    tz: 'Your timezone', 'tz-note': '(UTC offset)',
    'tz-hint': '8 = China/Singapore &nbsp;·&nbsp; -5 = New York &nbsp;·&nbsp; 0 = London',
    key: 'Classifier API key',
    'key-hint': 'Used to label your messages emotionally — a cheap fast model works best.<br>Recommended: <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek ↗</a> (~$0.1 / 1M tokens)',
    adv: 'Advanced', 'api-url': 'API base URL', model: 'Model',
    btn: 'Complete Setup', saving: 'Saving…',
    done: 'Setup complete', 'done-hint': 'Tell your AI agent to restart Drivesoid:<br><code>npm start</code>',
    'lang-btn': '中文', 'err-prefix': 'Error: ', 'net-err': 'Network error: ',
  },
  zh: {
    title: 'Drivesoid 初始化',
    subtitle: '一次性配置，填写并提交后，你的 AI 助手将完成剩余步骤。',
    'ai-name': 'AI 人格名称', 'ai-name-note': '（我该叫什么名字？）',
    'i-ai-name': '例：Aria',
    'user-name': '你的名字', 'i-user-name': '例：Alex',
    relation: '你们的关系', 'i-relation': '例：恋人、最好的朋友、工作伙伴',
    tz: '你的时区', 'tz-note': '（UTC 偏移量）',
    'tz-hint': '8 = 中国 / 新加坡 &nbsp;·&nbsp; -5 = 纽约 &nbsp;·&nbsp; 0 = 伦敦',
    key: '分类器 API 密钥',
    'key-hint': '用于对消息进行情感标注，便宜快速的模型即可。<br>推荐：<a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek ↗</a>（约 $0.1 / 100万 token）',
    adv: '高级设置', 'api-url': 'API 地址', model: '模型',
    btn: '完成配置', saving: '保存中…',
    done: '配置完成', 'done-hint': '请告诉你的 AI 助手重启 Drivesoid：<br><code>npm start</code>',
    'lang-btn': 'EN', 'err-prefix': '错误：', 'net-err': '网络错误：',
  },
};

let lang = 'en';
function applyLang(l) {
  const s = STRINGS[l];
  const setText = (id, val) => { const el = document.getElementById('t-' + id); if (el) el.innerHTML = val; };
  const setPlaceholder = (id, val) => { const el = document.getElementById('i-' + id); if (el) el.placeholder = val; };
  setText('title', s.title); setText('subtitle', s.subtitle);
  setText('ai-name', s['ai-name']); setText('ai-name-note', s['ai-name-note']);
  setPlaceholder('ai-name', s['i-ai-name']);
  setText('user-name', s['user-name']); setPlaceholder('user-name', s['i-user-name']);
  setText('relation', s.relation); setPlaceholder('relation', s['i-relation']);
  setText('tz', s.tz); setText('tz-note', s['tz-note']); setText('tz-hint', s['tz-hint']);
  setText('key', s.key); setText('key-hint', s['key-hint']);
  setText('adv', s.adv); setText('api-url', s['api-url']); setText('model', s.model);
  const btn = document.getElementById('btn');
  if (btn && !btn.disabled) btn.textContent = s.btn;
  setText('done', s.done); setText('done-hint', s['done-hint']);
  document.getElementById('lang-btn').textContent = s['lang-btn'];
  document.documentElement.lang = l;
}
function toggleLang() {
  lang = lang === 'en' ? 'zh' : 'en';
  applyLang(lang);
}
function toggleAdv() {
  const t = document.getElementById('adv-toggle');
  const f = document.getElementById('adv-fields');
  t.classList.toggle('open');
  f.classList.toggle('open');
}

document.getElementById('form').addEventListener('submit', async e => {
  e.preventDefault();
  const s = STRINGS[lang];
  const btn = document.getElementById('btn');
  const err = document.getElementById('errmsg');
  btn.disabled = true; btn.textContent = s.saving;
  err.style.display = 'none';
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const res = await fetch('/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (res.ok) {
      document.getElementById('form').style.display = 'none';
      document.getElementById('success').style.display = 'block';
    } else {
      err.innerHTML = s['err-prefix'] + await res.text();
      err.style.display = 'block';
      btn.disabled = false; btn.textContent = s.btn;
    }
  } catch (ex) {
    err.innerHTML = s['net-err'] + ex.message;
    err.style.display = 'block';
    btn.disabled = false; btn.textContent = s.btn;
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
