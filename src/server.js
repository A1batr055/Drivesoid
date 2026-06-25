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
const SETUP_PORT  = parseInt(process.env.DRIVESOID_SETUP_PORT || '3001', 10);

function loopbackOnly(req, res, next) {
  const addr = req.socket.remoteAddress;
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return next();
  res.status(403).json({ error: 'loopback only' });
}

function needsSetup() {
  if (!fs.existsSync(CONFIG_PATH)) return true;
  let keyEnv = 'DRIVES_API_KEY';
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    keyEnv = cfg.classifier?.api_key_env || keyEnv;
  } catch {}
  const key = process.env[keyEnv] || '';
  return !key || key === 'your_api_key_here';
}

const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Drivesoid Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #070912; --surface: #0f121e; --surface-hi: #111522;
    --text: #eef2ff; --muted: #949bb0; --faint: #626a82; --line: #242a3d;
    --accent: #70e8ef; --primary: #806dff;
    --success: #59d9aa; --danger: #f15f70;
    --radius: 16px; --radius-sm: 10px;
  }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 32px 16px 64px; }
  .setup-card { background: var(--surface); border-radius: var(--radius); padding: 32px 28px; max-width: 480px; width: 100%; position: relative; box-shadow: 0 22px 60px rgba(0,0,0,.38); }
  .setup-card::after { content: ''; position: absolute; top: 0; left: 32px; right: 32px; height: 2px; background: var(--accent); border-radius: 0 0 2px 2px; }
  .setup-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand svg { width: 32px; height: 32px; flex-shrink: 0; }
  h1 { font-size: 1.15rem; font-weight: 700; letter-spacing: .01em; }
  .subtitle { color: var(--muted); font-size: 0.83rem; margin-bottom: 28px; line-height: 1.6; }
  .lang-btn { font-size: 0.75rem; padding: 4px 12px; border: 1px solid var(--line); border-radius: 20px; background: transparent; color: var(--muted); cursor: pointer; transition: border-color .15s, color .15s; }
  .lang-btn:hover { border-color: var(--accent); color: var(--accent); }
  .section-kicker { font-size: 0.7rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); margin: 22px 0 12px; }
  .field { margin-bottom: 14px; }
  label { display: block; font-size: 0.82rem; font-weight: 600; margin-bottom: 6px; color: var(--muted); }
  label .note { font-weight: 400; color: var(--faint); }
  input { width: 100%; padding: 10px 13px; background: var(--surface-hi); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 0.93rem; color: var(--text); transition: border-color .15s; -webkit-appearance: none; }
  input:focus { outline: none; border-color: var(--accent); }
  input[type=number] { -moz-appearance: textfield; }
  input::placeholder { color: var(--faint); }
  .hint { font-size: 0.74rem; color: var(--faint); margin-top: 6px; line-height: 1.5; }
  .hint a { color: var(--accent); text-decoration: none; }
  .hint a:hover { text-decoration: underline; }
  .adv-btn { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; border-top: 1px solid var(--line); padding: 12px 0 10px; color: var(--muted); font-size: 0.82rem; cursor: pointer; margin-top: 6px; }
  .adv-btn:hover { color: var(--text); }
  .adv-arrow { transition: transform .2s; font-style: normal; }
  .adv-btn.open .adv-arrow { transform: rotate(180deg); }
  .adv-fields { display: none; }
  .adv-fields.open { display: block; }
  .primary-btn { width: 100%; padding: 12px; background: var(--accent); color: #071015; border: none; border-radius: var(--radius-sm); font-size: 0.95rem; font-weight: 700; cursor: pointer; margin-top: 20px; box-shadow: 0 8px 0 rgba(34,92,101,.25); transition: opacity .15s; }
  .primary-btn:hover { opacity: .9; }
  .primary-btn:disabled { opacity: .45; cursor: default; }
  #errmsg { display: none; color: var(--danger); font-size: 0.82rem; margin-top: 10px; }
  #success { display: none; text-align: center; padding: 16px 0 8px; }
  #success .check { font-size: 2.6rem; color: var(--success); margin-bottom: 14px; }
  #success h2 { font-size: 1rem; font-weight: 700; margin-bottom: 10px; }
  #success p { color: var(--muted); font-size: 0.83rem; line-height: 1.7; }
  #success code { display: inline-block; margin-top: 6px; background: rgba(112,246,255,.08); padding: 4px 10px; border-radius: 6px; font-size: 0.82rem; color: var(--accent); letter-spacing: .02em; }
</style>
</head>
<body>
<div class="setup-card">
  <div class="setup-head">
    <div class="brand">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"><rect x="3" y="3" width="58" height="58" rx="17" fill="#0b0d15"/><rect x="3.75" y="3.75" width="56.5" height="56.5" rx="16.25" fill="none" stroke="#8b82b8" stroke-opacity=".24" stroke-width="1.5"/><path d="M25 13.5 15.5 19v10" fill="none" stroke="#70f6ff" stroke-width="3" stroke-linecap="square"/><path d="M15.5 35v10L25 50.5" fill="none" stroke="#728bff" stroke-width="3" stroke-linecap="square"/><path d="m39 13.5 9.5 5.5v10" fill="none" stroke="#b371ff" stroke-width="3" stroke-linecap="square"/><path d="M48.5 35v10L39 50.5" fill="none" stroke="#ef5cff" stroke-width="3" stroke-linecap="square"/><path d="M20.5 32 27 24.5h10L43.5 32 37 39.5H27Z" fill="#111522" stroke="#70f6ff" stroke-width="2"/><rect x="26.5" y="26.5" width="11" height="11" rx="2" transform="rotate(45 32 32)" fill="#7965ee"/><circle cx="32" cy="32" r="2.2" fill="#d8fcff"/><path d="M10.5 24.5h5M48.5 39.5h5" stroke="#70f6ff" stroke-width="1.6"/><path d="M23 8.5h8M41 55.5h-8" stroke="#ef5cff" stroke-width="1.4" opacity=".8"/></svg>
      <h1 id="t-title">Drivesoid Setup</h1>
    </div>
    <button class="lang-btn" id="lang-btn" onclick="toggleLang()">中文</button>
  </div>
  <p class="subtitle" id="t-subtitle">One-time configuration. Fill in and submit — your AI agent will handle the rest.</p>

  <form id="form">
    <div class="section-kicker" id="t-kicker-who">Who are you</div>
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

    <div class="section-kicker" id="t-kicker-classifier">Emotion Classifier</div>
    <div class="field">
      <label id="t-key">Classifier API key</label>
      <input name="api_key" type="password" required placeholder="sk-...">
      <div class="hint" id="t-key-hint">Used to label your messages emotionally — a cheap fast model works best.<br>
        Recommended: <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek ↗</a> (~$0.1 / 1M tokens)</div>
    </div>

    <button type="button" class="adv-btn" id="adv-toggle" onclick="toggleAdv()">
      <span id="t-adv">Advanced <small id="t-adv-sub">API URL &amp; model</small></span>
      <i class="adv-arrow" id="adv-arrow">⌄</i>
    </button>
    <div class="adv-fields" id="adv-fields">
      <div class="field" style="margin-top:12px;">
        <label id="t-api-url">API base URL</label>
        <input name="api_url" value="https://api.deepseek.com">
      </div>
      <div class="field">
        <label id="t-model">Model</label>
        <input name="api_model" value="deepseek-v4-flash">
      </div>
    </div>

    <button type="submit" class="primary-btn" id="btn">Complete Setup</button>
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
    'kicker-who': 'Who are you', 'kicker-classifier': 'Emotion Classifier',
    'ai-name': 'AI persona name', 'ai-name-note': '(what should I call myself?)',
    'i-ai-name': 'e.g. Aria',
    'user-name': 'Your name', 'i-user-name': 'e.g. Alex',
    relation: 'Relationship', 'i-relation': 'e.g. romantic, best friends, work partner',
    tz: 'Your timezone', 'tz-note': '(UTC offset)',
    'tz-hint': '8 = China/Singapore &nbsp;·&nbsp; -5 = New York &nbsp;·&nbsp; 0 = London',
    key: 'Classifier API key',
    'key-hint': 'Used to label your messages emotionally — a cheap fast model works best.<br>Recommended: <a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek ↗</a> (~$0.1 / 1M tokens)',
    adv: 'Advanced', 'adv-sub': 'API URL &amp; model', 'api-url': 'API base URL', model: 'Model',
    btn: 'Complete Setup', saving: 'Saving…',
    done: 'Setup complete', 'done-hint': 'Tell your AI agent to restart Drivesoid:<br><code>npm start</code>',
    'lang-btn': '中文', 'err-prefix': 'Error: ', 'net-err': 'Network error: ',
  },
  zh: {
    title: 'Drivesoid 初始化',
    subtitle: '一次性配置，填写并提交后，你的 AI 助手将完成剩余步骤。',
    'kicker-who': '你们是谁', 'kicker-classifier': '情绪分类器',
    'ai-name': 'AI 人格名称', 'ai-name-note': '（我该叫什么名字？）',
    'i-ai-name': '例：Aria',
    'user-name': '你的名字', 'i-user-name': '例：Alex',
    relation: '你们的关系', 'i-relation': '例：恋人、最好的朋友、工作伙伴',
    tz: '你的时区', 'tz-note': '（UTC 偏移量）',
    'tz-hint': '8 = 中国 / 新加坡 &nbsp;·&nbsp; -5 = 纽约 &nbsp;·&nbsp; 0 = 伦敦',
    key: '分类器 API 密钥',
    'key-hint': '用于对消息进行情感标注，便宜快速的模型即可。<br>推荐：<a href="https://platform.deepseek.com/api_keys" target="_blank">DeepSeek ↗</a>（约 $0.1 / 100万 token）',
    adv: '高级设置', 'adv-sub': 'API 地址与模型', 'api-url': 'API 地址', model: '模型',
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
  setText('kicker-who', s['kicker-who']); setText('kicker-classifier', s['kicker-classifier']);
  setText('ai-name', s['ai-name']); setText('ai-name-note', s['ai-name-note']);
  setPlaceholder('ai-name', s['i-ai-name']);
  setText('user-name', s['user-name']); setPlaceholder('user-name', s['i-user-name']);
  setText('relation', s.relation); setPlaceholder('relation', s['i-relation']);
  setText('tz', s.tz); setText('tz-note', s['tz-note']); setText('tz-hint', s['tz-hint']);
  setText('key', s.key); setText('key-hint', s['key-hint']);
  setText('adv', s.adv); setText('adv-sub', s['adv-sub']);
  setText('api-url', s['api-url']); setText('model', s.model);
  const btn = document.getElementById('btn');
  if (btn && !btn.disabled) btn.textContent = s.btn;
  setText('done', s.done); setText('done-hint', s['done-hint']);
  document.getElementById('lang-btn').textContent = s['lang-btn'];
  document.documentElement.lang = l;
}
function toggleLang() { lang = lang === 'en' ? 'zh' : 'en'; applyLang(lang); }
function toggleAdv() {
  const toggle = document.getElementById('adv-toggle');
  const fields = document.getElementById('adv-fields');
  const arrow  = document.getElementById('adv-arrow');
  toggle.classList.toggle('open');
  fields.classList.toggle('open');
  arrow.textContent = fields.classList.contains('open') ? '⌃' : '⌄';
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
    if (!ai_name || !user_name || !relation || !api_key || !api_url || !api_model) {
      return res.status(400).send('Missing required fields');
    }
    try { new URL(api_url); } catch {
      return res.status(400).send('Invalid API URL');
    }
    const cfg = {
      persona:  { name: ai_name },
      user:     { name: user_name },
      relation,
      timezone_offset_hours: parseInt(timezone, 10),
      classifier: {
        endpoint:    (api_url || '').replace(/\/$/, ''),
        model:       api_model || null,
        api_key_env: 'DRIVES_API_KEY',
      },
      server: { port: 3001 },
    };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
      fs.writeFileSync(ENV_PATH, `DRIVES_API_KEY=${api_key.replace(/[\r\n]/g, '')}\n`, { mode: 0o600 });
    } catch (e) {
      return res.status(500).send(e.message);
    }
    res.json({ ok: true });
  });
  app.get('*', (req, res) => res.redirect('/setup'));

  const setupServer = app.listen(SETUP_PORT, '127.0.0.1', () => {
    console.log(`[drives] First-time setup — open http://127.0.0.1:${SETUP_PORT}/setup`);
  });
  setupServer.on('error', e => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[drives] ERROR: port ${SETUP_PORT} is already in use.`);
      console.error(`[drives] To use a different port: DRIVESOID_SETUP_PORT=<port> npm start`);
      process.exit(1);
    } else {
      throw e;
    }
  });
} else {
  const drives = require('./index');
  const config  = require('./config').load();
  const PORT    = config.server?.port || 3001;

  // Default dimension values (mirrors worker.js defaults)
  const DIM_DEFAULTS = {
    vitality:       { neutral: 0.50, floor: 0.08 },
    longing:        { neutral: 0.30, floor: 0.15 },
    intimacy:       { neutral: 0.35, floor: 0.06 },
    possessiveness: { neutral: 0.30, floor: 0.05 },
    lust:           { neutral: 0.30, floor: 0.05 },
    jealousy:       { neutral: 0.22, floor: 0.00 },
    anxiety:        { neutral: 0.20, floor: 0.02 },
    protectiveness: { neutral: 0.25, floor: 0.05 },
    contentment:    { neutral: 0.35, floor: 0.06 },
    elation:        { neutral: 0.20, floor: 0.02 },
    seeking:        { neutral: 0.25, floor: 0.12 },
    play:           { neutral: 0.25, floor: 0.03 },
    dejection:      { neutral: 0.15, floor: 0.00 },
    irritability:   { neutral: 0.15, floor: 0.00 },
  };

  const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Drivesoid</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #070912; --surface: #0f121e; --surface-hi: #111522;
    --text: #eef2ff; --muted: #949bb0; --faint: #626a82; --line: #242a3d;
    --accent: #70e8ef; --primary: #806dff;
    --success: #59d9aa; --danger: #f15f70;
    --radius: 16px; --radius-sm: 10px;
  }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .topbar { background: var(--surface); border-bottom: 1px solid var(--line); padding: 0 28px; height: 56px; display: flex; align-items: center; gap: 14px; position: sticky; top: 0; z-index: 10; }
  .topbar::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 1px; background: var(--accent); opacity: .55; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand svg { width: 28px; height: 28px; flex-shrink: 0; }
  .brand-name { font-size: 1rem; font-weight: 700; letter-spacing: .02em; }
  .persona-info { font-size: 0.82rem; color: var(--muted); flex: 1; }
  .status-pill { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--muted); }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--success); flex-shrink: 0; }
  .status-dot.stale { background: var(--danger); }
  .lang-btn { font-size: 0.78rem; padding: 5px 14px; border: 1px solid var(--line); border-radius: 20px; background: transparent; color: var(--muted); cursor: pointer; transition: border-color .15s, color .15s; }
  .lang-btn:hover { border-color: var(--accent); color: var(--accent); }
  .main { max-width: 1000px; margin: 0 auto; padding: 28px 20px 72px; display: grid; grid-template-columns: 1fr 360px; gap: 20px; align-items: start; }
  .main > * { min-width: 0; }
  .card { background: var(--surface); border-radius: var(--radius); padding: 28px 24px; position: relative; overflow: hidden; }
  .card::before { content: ''; position: absolute; top: 0; left: 28px; right: 28px; height: 2px; background: var(--accent); border-radius: 0 0 2px 2px; }
  .card-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 22px; }
  .card-head h2 { font-size: 0.82rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .card-head span { font-size: 0.74rem; color: var(--faint); }
  .highlights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
  .highlight { background: var(--surface-hi); border-radius: 14px; padding: 16px 18px; border: 1px solid var(--line); }
  .highlight-label { font-size: 0.75rem; color: var(--muted); margin-bottom: 8px; line-height: 1.4; }
  .highlight-value { font-size: 1.8rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
  .highlight-tag { font-size: 0.7rem; color: var(--faint); margin-top: 4px; }
  .highlight.pos .highlight-value { color: #5d91ed; }
  .highlight.att .highlight-value { color: #e279a7; }
  .highlight.thr .highlight-value { color: #ed9b43; }
  .highlight.rew .highlight-value { color: #50c887; }
  .highlight.neg .highlight-value { color: #e45b66; }
  .highlight.fat .highlight-value { color: var(--muted); }
  .emotion-group { margin-bottom: 24px; }
  .emotion-group:last-child { margin-bottom: 0; }
  .group-title { font-size: 0.72rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
  .group-title::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .dims-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px 32px; }
  .dim-row { display: flex; flex-direction: column; gap: 7px; }
  .dim-label { font-size: 0.9rem; color: var(--muted); display: flex; justify-content: space-between; }
  .dim-label .val { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 700; }
  .bar-track { height: 8px; background: var(--surface-hi); border-radius: 4px; position: relative; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width .4s ease; }
  .bar-fill.pos { background: #5d91ed; }
  .bar-fill.att { background: #e279a7; }
  .bar-fill.thr { background: #ed9b43; }
  .bar-fill.rew { background: #50c887; }
  .bar-fill.neg { background: #e45b66; }
  .bar-fill.fat { background: var(--faint); }
  .neutral-marker { position: absolute; top: -3px; width: 2px; height: 14px; background: var(--line); border-radius: 1px; }
  .frust-section { display: flex; align-items: center; gap: 10px; padding: 14px 0 18px; border-bottom: 1px solid var(--line); margin-bottom: 18px; }
  .frust-label { font-size: 0.72rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); flex-shrink: 0; width: 100px; }
  .frust-bar { flex: 1; height: 6px; background: var(--surface-hi); border-radius: 3px; overflow: hidden; }
  .frust-fill { height: 100%; background: #e45b66; border-radius: 3px; transition: width .4s ease; }
  .frust-val { font-size: 0.9rem; font-weight: 700; font-variant-numeric: tabular-nums; color: #e45b66; width: 36px; text-align: right; flex-shrink: 0; }
  .frust-stat { font-size: 0.75rem; font-weight: 700; padding: 2px 7px; border-radius: 4px; flex-shrink: 0; }
  .frust-stat.pending { background: rgba(226,121,167,.12); color: #e279a7; }
  .frust-stat.streak  { background: rgba(237,155,67,.12); color: #ed9b43; }
  .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .field label { font-size: 0.8rem; font-weight: 600; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .field input { width: 100%; min-width: 0; padding: 9px 12px; background: var(--surface-hi); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 0.9rem; color: var(--text); }
  .field input:focus { outline: none; border-color: var(--accent); }
  .field input::placeholder { color: var(--faint); }
  .field input[type=number] { -moz-appearance: textfield; }
  .collapse-btn { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; border-top: 1px solid var(--line); padding: 12px 0 10px; color: var(--muted); font-size: 0.82rem; cursor: pointer; margin-top: 10px; }
  .collapse-btn:hover { color: var(--text); }
  .collapse-arrow { transition: transform .2s; font-style: normal; }
  .collapse-btn.open .collapse-arrow { transform: rotate(180deg); }
  .collapse-body { display: none; }
  .collapse-body.open { display: block; }
  .adv-grid { display: grid; grid-template-columns: 1fr; gap: 12px; padding-top: 12px; }
  .dim-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 4px; }
  .dim-table th { text-align: left; font-weight: 600; color: var(--faint); padding: 6px 8px 10px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: .06em; }
  .dim-table td { padding: 5px 8px; color: var(--muted); }
  .dim-table tr:hover td { background: rgba(255,255,255,.02); }
  .dim-table td:first-child { color: var(--text); width: 44%; }
  .dim-table input[type=number] { width: 68px; padding: 5px 7px; background: var(--surface-hi); border: 1px solid var(--line); border-radius: 6px; font-size: 0.8rem; color: var(--text); -moz-appearance: textfield; }
  .dim-table input[type=number]::-webkit-outer-spin-button,
  .dim-table input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  .dim-table input[type=number]:focus { outline: none; border-color: var(--accent); }
  .save-row { display: flex; align-items: center; gap: 12px; margin-top: 18px; flex-wrap: wrap; }
  .save-btn { padding: 10px 24px; background: var(--accent); color: #071015; border: none; border-radius: var(--radius-sm); font-size: 0.88rem; font-weight: 700; cursor: pointer; transition: opacity .15s; }
  .save-btn:hover { opacity: .9; }
  .save-btn:disabled { opacity: .45; cursor: default; }
  .save-note { font-size: 0.75rem; color: var(--faint); flex: 1; min-width: 0; }
  .save-ok { font-size: 0.82rem; color: var(--success); display: none; }
  .save-err { font-size: 0.82rem; color: var(--danger); display: none; }
  @media (max-width: 720px) {
    .main { grid-template-columns: 1fr; }
    .dims-grid { grid-template-columns: 1fr; }
    .config-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="brand">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"><rect x="3" y="3" width="58" height="58" rx="17" fill="#0b0d15"/><rect x="3.75" y="3.75" width="56.5" height="56.5" rx="16.25" fill="none" stroke="#8b82b8" stroke-opacity=".24" stroke-width="1.5"/><path d="M25 13.5 15.5 19v10" fill="none" stroke="#70f6ff" stroke-width="3" stroke-linecap="square"/><path d="M15.5 35v10L25 50.5" fill="none" stroke="#728bff" stroke-width="3" stroke-linecap="square"/><path d="m39 13.5 9.5 5.5v10" fill="none" stroke="#b371ff" stroke-width="3" stroke-linecap="square"/><path d="M48.5 35v10L39 50.5" fill="none" stroke="#ef5cff" stroke-width="3" stroke-linecap="square"/><path d="M20.5 32 27 24.5h10L43.5 32 37 39.5H27Z" fill="#111522" stroke="#70f6ff" stroke-width="2"/><rect x="26.5" y="26.5" width="11" height="11" rx="2" transform="rotate(45 32 32)" fill="#7965ee"/><circle cx="32" cy="32" r="2.2" fill="#d8fcff"/><path d="M10.5 24.5h5M48.5 39.5h5" stroke="#70f6ff" stroke-width="1.6"/><path d="M23 8.5h8M41 55.5h-8" stroke="#ef5cff" stroke-width="1.4" opacity=".8"/></svg>
    <span class="brand-name">Drivesoid</span>
  </div>
  <span class="persona-info" id="persona-info">—</span>
  <div class="status-pill"><div class="status-dot" id="dot"></div><span id="t-status">ok</span></div>
  <button class="lang-btn" id="lang-btn" onclick="toggleLang()">中文</button>
</div>
<div class="main">

  <div class="card">
    <div class="card-head">
      <h2 id="t-state">Emotional State</h2>
      <span id="t-refresh">auto-refresh 15s</span>
    </div>
    <div id="dims-area"></div>
  </div>

  <div class="card">
    <div class="card-head"><h2 id="t-config">Configuration</h2><span id="t-config-note">next session</span></div>
    <div class="config-grid">
      <div class="field"><label id="t-ai-name">AI persona name</label><input id="c-ai-name"></div>
      <div class="field"><label id="t-user-name">Your name</label><input id="c-user-name"></div>
      <div class="field"><label id="t-relation">Relationship</label><input id="c-relation"></div>
      <div class="field"><label id="t-tz">Timezone (UTC)</label><input id="c-tz" type="number" min="-12" max="14"></div>
    </div>

    <button type="button" class="collapse-btn" id="adv-toggle" onclick="toggleAdv()">
      <span id="t-adv">Advanced (classifier)</span>
      <i class="collapse-arrow" id="adv-arrow">⌄</i>
    </button>
    <div class="collapse-body" id="adv-fields">
      <div class="adv-grid">
        <div class="field"><label id="t-api-url">API base URL</label><input id="c-api-url"></div>
        <div class="field"><label id="t-model">Model</label><input id="c-model"></div>
      </div>
    </div>

    <button type="button" class="collapse-btn" id="dims-toggle" onclick="toggleDims()">
      <span id="t-dims">Dimension Tuning</span>
      <i class="collapse-arrow" id="dims-arrow">⌄</i>
    </button>
    <div class="collapse-body" id="dims-collapse">
      <table class="dim-table" style="margin-top:8px;">
        <thead><tr><th id="t-dim-col">Dimension</th><th id="t-neutral-col">Neutral</th><th id="t-floor-col">Floor</th></tr></thead>
        <tbody id="dim-tbody"></tbody>
      </table>
      <div class="save-row">
        <button class="save-btn" id="save-btn" onclick="saveConfig()"><span id="t-save">Save</span></button>
        <span class="save-note" id="t-save-note">Basic fields apply on next session · Dims require restart</span>
        <span class="save-ok" id="save-ok">✓ <span id="t-saved">Saved</span></span>
        <span class="save-err" id="save-err"></span>
      </div>
    </div>
  </div>

</div>
<script>
const DIMS_ORDER = ['vitality','longing','intimacy','possessiveness','lust','jealousy','anxiety','protectiveness','fear','contentment','elation','seeking','play','dejection','irritability','fatigue'];
const DIM_GROUPS = [
  { key: 'activation', dims: ['vitality','fatigue'] },
  { key: 'attachment', dims: ['longing','intimacy','possessiveness','lust'] },
  { key: 'threat',     dims: ['jealousy','anxiety','protectiveness','fear'] },
  { key: 'reward',     dims: ['contentment','elation','seeking','play'] },
  { key: 'negative',   dims: ['dejection','irritability'] },
];
const DIM_CLASS = { vitality:'pos', fatigue:'fat', longing:'att', intimacy:'att', possessiveness:'att', lust:'att', jealousy:'thr', anxiety:'thr', protectiveness:'thr', fear:'thr', contentment:'rew', elation:'rew', seeking:'rew', play:'rew', dejection:'neg', irritability:'neg' };
const DIM_LABELS = {
  en: { vitality:'Vitality', longing:'Longing', intimacy:'Intimacy', possessiveness:'Possessiveness', lust:'Lust', jealousy:'Jealousy', anxiety:'Anxiety', protectiveness:'Protectiveness', fear:'Fear', contentment:'Contentment', elation:'Elation', seeking:'Seeking', play:'Play', dejection:'Dejection', irritability:'Irritability', fatigue:'Fatigue' },
  zh: { vitality:'活力', longing:'思念', intimacy:'亲密', possessiveness:'占有', lust:'欲望', jealousy:'嫉妒', anxiety:'焦虑', protectiveness:'保护欲', fear:'恐惧', contentment:'满足', elation:'愉悦', seeking:'探索', play:'玩心', dejection:'低落', irritability:'烦躁', fatigue:'疲惫' },
};
const GROUP_LABELS = {
  en: { activation:'Activation', attachment:'Attachment', threat:'Threat', reward:'Reward', negative:'Negative' },
  zh: { activation:'激活状态', attachment:'依恋连接', threat:'威胁反应', reward:'奖赏驱动', negative:'负向状态' },
};
const S = {
  en: { state:'Emotional State', refresh:'auto-refresh 15s', status:'ok', config:'Configuration', 'config-note':'next session', 'ai-name':'AI persona name', 'user-name':'Your name', relation:'Relationship', tz:'Timezone (UTC)', adv:'Advanced · classifier', 'api-url':'API base URL', model:'Model', dims:'Dimension Tuning', 'dim-col':'Dimension', 'neutral-col':'Neutral', 'floor-col':'Floor', save:'Save', 'save-note':'Basic fields apply on next session · Dims require restart', saved:'Saved', 'lang-btn':'中文' },
  zh: { state:'情感状态', refresh:'15秒自动刷新', status:'正常', config:'配置', 'config-note':'下次会话生效', 'ai-name':'AI 人格名称', 'user-name':'你的名字', relation:'关系', tz:'时区（UTC）', adv:'高级设置 · 分类器', 'api-url':'API 地址', model:'模型', dims:'维度调参', 'dim-col':'维度', 'neutral-col':'基准值', 'floor-col':'下限', save:'保存', 'save-note':'基础字段下次会话生效 · 维度参数重启后生效', saved:'已保存', 'lang-btn':'EN' },
};

let lang = 'en';
let currentCfg = null;
let dimDefaults = {};
let lastStatus = null;

function toggleLang() { lang = lang === 'en' ? 'zh' : 'en'; applyLang(); if (lastStatus) renderDimGrid(lastStatus); }
function toggleCollapse(btnId, bodyId, arrowId) {
  const btn  = document.getElementById(btnId);
  const body = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  btn.classList.toggle('open');
  body.classList.toggle('open');
  arrow.textContent = body.classList.contains('open') ? '⌃' : '⌄';
}
function toggleAdv()  { toggleCollapse('adv-toggle',  'adv-fields',    'adv-arrow');  }
function toggleDims() { toggleCollapse('dims-toggle', 'dims-collapse', 'dims-arrow'); }

function applyLang() {
  const s = S[lang];
  for (const [k, v] of Object.entries(s)) {
    const el = document.getElementById('t-' + k);
    if (el) el.textContent = v;
  }
  document.getElementById('lang-btn').textContent = s['lang-btn'];
  document.documentElement.lang = lang;
  renderDimTbody();
}

function renderDimGrid(status) {
  if (!status?.display) return;
  const area   = document.getElementById('dims-area');
  const labels = DIM_LABELS[lang];
  const grpLbls = GROUP_LABELS[lang];
  const cfg    = currentCfg?.dimensions || dimDefaults;
  const d      = status.display;

  const frust = status.frustration ?? 0;
  const pc    = status.pending_count ?? 0;
  const rs    = status.rejection_streak ?? 0;
  const frustPct = Math.min(100, Math.round((frust / 3) * 100));
  const frustHtml = \`<div class="frust-section">
    <span class="frust-label">FRUSTRATION</span>
    <div class="frust-bar"><div class="frust-fill" style="width:\${frustPct}%"></div></div>
    <span class="frust-val" style="opacity:\${frust > 0 ? 1 : 0.35}">\${frust.toFixed(2)}</span>
  </div>
  <div class="frust-section">
    <span class="frust-label">INTENTION</span>
    <span class="frust-val" style="width:auto;color:\${pc > 0 ? '#e279a7' : 'var(--faint)'};opacity:\${pc > 0 ? 1 : 0.4}">\${pc > 0 ? '&times;' + pc : 'NONE'}</span>
    \${rs > 0 ? \`<span class="frust-stat streak" style="margin-left:8px">S\${rs}</span>\` : ''}
  </div>\`;

  const top3 = DIMS_ORDER.filter(k => k !== 'fatigue')
    .map(k => ({ k, v: d[k] ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  const highlightsHtml = \`<div class="highlights">\${top3.map((item, i) => {
    const cls = DIM_CLASS[item.k] || 'pos';
    const tag = i === 0 ? (lang === 'zh' ? '最强' : 'strongest') : '';
    return \`<div class="highlight \${cls}">
      <div class="highlight-label">\${labels[item.k] || item.k}</div>
      <div class="highlight-value">\${item.v.toFixed(2)}</div>
      \${tag ? \`<div class="highlight-tag">\${tag}</div>\` : ''}
    </div>\`;
  }).join('')}</div>\`;

  const groupsHtml = DIM_GROUPS.map(g => {
    const rows = g.dims.map(k => {
      const v    = d[k] ?? 0;
      const neutral = cfg[k]?.neutral ?? dimDefaults[k]?.neutral ?? 0.5;
      const pct  = Math.round(v * 100);
      const nPct = Math.round(neutral * 100);
      const cls  = DIM_CLASS[k] || 'pos';
      return \`<div class="dim-row">
        <div class="dim-label"><span>\${labels[k] || k}</span><span class="val">\${v.toFixed(2)}</span></div>
        <div class="bar-track">
          <div class="bar-fill \${cls}" style="width:\${pct}%"></div>
          <div class="neutral-marker" style="left:\${nPct}%"></div>
        </div>
      </div>\`;
    }).join('');
    return \`<div class="emotion-group">
      <div class="group-title">\${grpLbls[g.key] || g.key}</div>
      <div class="dims-grid">\${rows}</div>
    </div>\`;
  }).join('');

  area.innerHTML = highlightsHtml + frustHtml + groupsHtml;
  document.getElementById('dot').className = 'status-dot' + (status.stale ? ' stale' : '');
}

function renderDimTbody() {
  const labels = DIM_LABELS[lang];
  const tuneable = DIMS_ORDER.filter(k => k !== 'fatigue');
  const cfg = currentCfg?.dimensions || dimDefaults;
  document.getElementById('dim-tbody').innerHTML = tuneable.map(k => {
    const n = cfg[k]?.neutral ?? dimDefaults[k]?.neutral ?? 0;
    const f = cfg[k]?.floor  ?? dimDefaults[k]?.floor  ?? 0;
    return \`<tr>
      <td>\${labels[k] || k}</td>
      <td><input type="number" id="dn-\${k}" value="\${n.toFixed(2)}" min="0" max="1" step="0.01"></td>
      <td><input type="number" id="df-\${k}" value="\${f.toFixed(2)}" min="0" max="1" step="0.01"></td>
    </tr>\`;
  }).join('');
}

async function loadStatus() {
  try {
    const r = await fetch('/api/drives/status');
    lastStatus = await r.json();
    renderDimGrid(lastStatus);
  } catch {}
}

async function loadConfig() {
  try {
    const r = await fetch('/api/dashboard/config');
    const data = await r.json();
    currentCfg = data;
    dimDefaults = data._defaults || {};
    document.getElementById('persona-info').textContent = (data.persona?.name || '') + ' · ' + (data.user?.name || '');
    document.getElementById('c-ai-name').value  = data.persona?.name || '';
    document.getElementById('c-user-name').value = data.user?.name || '';
    document.getElementById('c-relation').value  = data.relation || '';
    document.getElementById('c-tz').value        = data.timezone_offset_hours ?? 8;
    document.getElementById('c-api-url').value   = data.classifier?.endpoint || '';
    document.getElementById('c-model').value     = data.classifier?.model || '';
    renderDimTbody();
  } catch {}
}

async function saveConfig() {
  const btn = document.getElementById('save-btn');
  const ok  = document.getElementById('save-ok');
  const err = document.getElementById('save-err');
  btn.disabled = true; ok.style.display = 'none'; err.style.display = 'none';

  const tuneable = DIMS_ORDER.filter(k => k !== 'fatigue');
  const dimensions = {};
  for (const k of tuneable) {
    const n = parseFloat(document.getElementById('dn-' + k)?.value);
    const f = parseFloat(document.getElementById('df-' + k)?.value);
    if (!isNaN(n) || !isNaN(f)) dimensions[k] = { neutral: isNaN(n) ? dimDefaults[k]?.neutral : n, floor: isNaN(f) ? dimDefaults[k]?.floor : f };
  }

  const body = {
    persona:  { name: document.getElementById('c-ai-name').value.trim() },
    user:     { name: document.getElementById('c-user-name').value.trim() },
    relation: document.getElementById('c-relation').value.trim(),
    timezone_offset_hours: parseInt(document.getElementById('c-tz').value, 10),
    classifier: {
      endpoint: document.getElementById('c-api-url').value.trim(),
      model:    document.getElementById('c-model').value.trim(),
    },
    dimensions,
  };

  try {
    const r = await fetch('/api/dashboard/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) { ok.style.display = 'inline'; currentCfg = { ...currentCfg, ...body }; }
    else { err.textContent = await r.text(); err.style.display = 'inline'; }
  } catch (ex) { err.textContent = ex.message; err.style.display = 'inline'; }
  btn.disabled = false;
}

loadConfig();
loadStatus();
setInterval(loadStatus, 15000);
</script>
</body>
</html>`;

  app.get('/api/drives/status', (req, res) => { res.json(drives.getStatus()); });

  app.get('/api/drives/context', (req, res) => {
    const status = drives.getStatus();
    if (!status?.display || status.stale) return res.status(503).send('');
    const d = status.display;
    const f = k => (d[k] ?? 0).toFixed(2);
    const block = [
      '[drives]',
      `vitality ${f('vitality')}  fatigue ${f('fatigue')}`,
      `longing ${f('longing')}  intimacy ${f('intimacy')}  possessiveness ${f('possessiveness')}  lust ${f('lust')}`,
      `jealousy ${f('jealousy')}  anxiety ${f('anxiety')}  protectiveness ${f('protectiveness')}  fear ${f('fear')}`,
      `contentment ${f('contentment')}  elation ${f('elation')}  seeking ${f('seeking')}  play ${f('play')}`,
      `dejection ${f('dejection')}  irritability ${f('irritability')}`,
    ].join('\n');
    res.set('Content-Type', 'text/plain').send(block);
  });

  app.get('/', (req, res) => res.redirect('/dashboard'));
  app.get('/dashboard', (req, res) => res.send(DASHBOARD_HTML));

  app.get('/api/dashboard/config', loopbackOnly, (req, res) => {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const cfg = JSON.parse(raw);
      cfg._defaults = DIM_DEFAULTS;
      res.json(cfg);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/dashboard/config', loopbackOnly, (req, res) => {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
      const existing = JSON.parse(raw);
      const { persona, user, relation, timezone_offset_hours, classifier, dimensions } = req.body || {};
      if (persona?.name) existing.persona.name = persona.name;
      if (user?.name)    existing.user.name = user.name;
      if (relation)      existing.relation = relation;
      if (typeof timezone_offset_hours === 'number') existing.timezone_offset_hours = timezone_offset_hours;
      if (classifier?.endpoint) {
        try { new URL(classifier.endpoint); } catch { return res.status(400).send('Invalid API URL'); }
        existing.classifier.endpoint = classifier.endpoint.replace(/\/$/, '');
      }
      if (classifier?.model)    existing.classifier.model = classifier.model;
      if (dimensions)    existing.dimensions = dimensions;
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(existing, null, 2));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).send(e.message);
    }
  });

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
    const SLEEP_TYPES = new Set(['sleep_start', 'sleep_end', 'sleep_interrupt']);
    if (!SLEEP_TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be sleep_start, sleep_end, or sleep_interrupt' });
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
    console.log(`[drives] Dashboard: http://127.0.0.1:${PORT}/dashboard`);
  });
}
