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
      server: { port: SETUP_PORT },
    };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
      fs.writeFileSync(ENV_PATH, `DRIVES_API_KEY=${api_key}\n`, { mode: 0o600 });
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
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f0f0f0; color: #111; min-height: 100vh; }
  .topbar { background: #111; color: white; padding: 12px 20px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 10; }
  .topbar h1 { font-size: 1rem; font-weight: 600; letter-spacing: 0.02em; }
  .topbar .persona { font-size: 0.8rem; color: #aaa; flex: 1; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink: 0; }
  .status-dot.stale { background: #f87171; }
  #lang-btn { font-size: 0.75rem; padding: 3px 10px; border: 1px solid #444; border-radius: 20px; background: transparent; color: #ccc; cursor: pointer; }
  #lang-btn:hover { border-color: #888; color: white; }
  .main { max-width: 860px; margin: 0 auto; padding: 20px 16px 48px; }
  .section { background: white; border-radius: 12px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.06); }
  .section-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 16px; }
  .section-header h2 { font-size: 0.9rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #555; }
  .refresh-note { font-size: 0.75rem; color: #bbb; }
  .dims-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px; }
  .dim-row { display: flex; flex-direction: column; gap: 3px; }
  .dim-label { font-size: 0.78rem; color: #666; display: flex; justify-content: space-between; }
  .dim-label .val { font-variant-numeric: tabular-nums; color: #222; font-weight: 500; }
  .bar-track { height: 6px; background: #eee; border-radius: 3px; position: relative; overflow: visible; }
  .bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
  .bar-fill.pos { background: #60a5fa; }
  .bar-fill.neg { background: #f87171; }
  .bar-fill.fat { background: #d1d5db; }
  .neutral-marker { position: absolute; top: -2px; width: 2px; height: 10px; background: #ccc; border-radius: 1px; }
  .config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field label { font-size: 0.8rem; font-weight: 500; color: #555; }
  .field input { padding: 7px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.88rem; }
  .field input:focus { outline: none; border-color: #888; }
  .adv-toggle { font-size: 0.8rem; color: #999; cursor: pointer; margin: 14px 0 10px; display: flex; align-items: center; gap: 4px; }
  .adv-toggle::before { content: '▶'; font-size: 0.6rem; transition: transform 0.15s; }
  .adv-toggle.open::before { transform: rotate(90deg); }
  .adv-fields { display: none; }
  .adv-fields.open { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
  .dim-table { width: 100%; border-collapse: collapse; margin-top: 4px; font-size: 0.82rem; }
  .dim-table th { text-align: left; font-weight: 500; color: #888; padding: 4px 8px 8px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .dim-table td { padding: 3px 8px; }
  .dim-table tr:hover td { background: #fafafa; }
  .dim-table td:first-child { color: #444; width: 40%; }
  .dim-table input[type=number] { width: 72px; padding: 4px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.82rem; -moz-appearance: textfield; }
  .dim-table input[type=number]::-webkit-outer-spin-button,
  .dim-table input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
  .dim-table input[type=number]:focus { outline: none; border-color: #888; }
  .save-row { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
  .save-btn { padding: 9px 24px; background: #111; color: white; border: none; border-radius: 7px; font-size: 0.88rem; font-weight: 500; cursor: pointer; }
  .save-btn:hover { background: #333; }
  .save-btn:disabled { background: #bbb; cursor: default; }
  .save-note { font-size: 0.78rem; color: #bbb; }
  .save-ok { font-size: 0.82rem; color: #16a34a; display: none; }
  .save-err { font-size: 0.82rem; color: #c00; display: none; }
  @media (max-width: 520px) {
    .dims-grid { grid-template-columns: 1fr; }
    .config-grid { grid-template-columns: 1fr; }
    .adv-fields.open { grid-template-columns: 1fr; }
    .topbar { padding: 10px 14px; }
    .main { padding: 14px 12px 48px; }
  }
</style>
</head>
<body>
<div class="topbar">
  <div class="status-dot" id="dot"></div>
  <h1>Drivesoid</h1>
  <span class="persona" id="persona-info">—</span>
  <button id="lang-btn" onclick="toggleLang()">中文</button>
</div>
<div class="main">

  <div class="section">
    <div class="section-header">
      <h2 id="t-state">Emotional State</h2>
      <span class="refresh-note" id="t-refresh">auto-refresh 15s</span>
    </div>
    <div class="dims-grid" id="dims-grid"></div>
  </div>

  <div class="section">
    <div class="section-header"><h2 id="t-config">Configuration</h2></div>
    <div class="config-grid">
      <div class="field"><label id="t-ai-name">AI persona name</label><input id="c-ai-name"></div>
      <div class="field"><label id="t-user-name">Your name</label><input id="c-user-name"></div>
      <div class="field"><label id="t-relation">Relationship</label><input id="c-relation"></div>
      <div class="field"><label id="t-tz">Timezone (UTC offset)</label><input id="c-tz" type="number" min="-12" max="14"></div>
    </div>
    <div class="adv-toggle" id="adv-toggle" onclick="toggleAdv()"><span id="t-adv">Advanced (classifier)</span></div>
    <div class="adv-fields" id="adv-fields">
      <div class="field"><label id="t-api-url">API base URL</label><input id="c-api-url"></div>
      <div class="field"><label id="t-model">Model</label><input id="c-model"></div>
    </div>

    <div class="section-header" style="margin-top:20px;margin-bottom:8px;">
      <h2 id="t-dims">Dimension Tuning</h2>
      <span class="refresh-note" id="t-dims-note">takes effect on restart</span>
    </div>
    <table class="dim-table">
      <thead><tr><th id="t-dim-col">Dimension</th><th id="t-neutral-col">Neutral</th><th id="t-floor-col">Floor</th></tr></thead>
      <tbody id="dim-tbody"></tbody>
    </table>

    <div class="save-row">
      <button class="save-btn" id="save-btn" onclick="saveConfig()"><span id="t-save">Save</span></button>
      <span class="save-note" id="t-save-note">Basic fields apply on next session · Dimension changes require restart</span>
      <span class="save-ok" id="save-ok">✓ <span id="t-saved">Saved</span></span>
      <span class="save-err" id="save-err"></span>
    </div>
  </div>

</div>
<script>
const DIMS_ORDER = ['vitality','longing','intimacy','possessiveness','lust','jealousy','anxiety','protectiveness','contentment','elation','seeking','play','dejection','irritability','fatigue'];
const NEG_DIMS   = new Set(['jealousy','anxiety','dejection','irritability','fatigue']);
const DIM_LABELS = {
  en: { vitality:'Vitality', longing:'Longing', intimacy:'Intimacy', possessiveness:'Possessiveness', lust:'Lust', jealousy:'Jealousy', anxiety:'Anxiety', protectiveness:'Protectiveness', contentment:'Contentment', elation:'Elation', seeking:'Seeking', play:'Play', dejection:'Dejection', irritability:'Irritability', fatigue:'Fatigue' },
  zh: { vitality:'活力', longing:'思念', intimacy:'亲密', possessiveness:'占有', lust:'欲望', jealousy:'嫉妒', anxiety:'焦虑', protectiveness:'保护欲', contentment:'满足', elation:'愉悦', seeking:'探索', play:'玩心', dejection:'低落', irritability:'烦躁', fatigue:'疲惫' },
};
const S = {
  en: { state:'Emotional State', refresh:'auto-refresh 15s', config:'Configuration', 'ai-name':'AI persona name', 'user-name':'Your name', relation:'Relationship', tz:'Timezone (UTC offset)', adv:'Advanced (classifier)', 'api-url':'API base URL', model:'Model', dims:'Dimension Tuning', 'dims-note':'takes effect on restart', 'dim-col':'Dimension', 'neutral-col':'Neutral', 'floor-col':'Floor', save:'Save', 'save-note':'Basic fields apply on next session · Dimension changes require restart', saved:'Saved', 'lang-btn':'中文' },
  zh: { state:'情感状态', refresh:'15秒自动刷新', config:'配置', 'ai-name':'AI 人格名称', 'user-name':'你的名字', relation:'关系', tz:'时区（UTC 偏移）', adv:'高级设置（分类器）', 'api-url':'API 地址', model:'模型', dims:'维度调参', 'dims-note':'重启后生效', 'dim-col':'维度', 'neutral-col':'基准值', 'floor-col':'下限', save:'保存', 'save-note':'基础字段下次会话生效 · 维度参数重启后生效', saved:'已保存', 'lang-btn':'EN' },
};

let lang = 'en';
let currentCfg = null;
let dimDefaults = {};

function toggleLang() { lang = lang === 'en' ? 'zh' : 'en'; applyLang(); renderDimGrid(lastStatus); }
function toggleAdv() { document.getElementById('adv-toggle').classList.toggle('open'); document.getElementById('adv-fields').classList.toggle('open'); }

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

let lastStatus = null;

function renderDimGrid(status) {
  if (!status?.display) return;
  const grid = document.getElementById('dims-grid');
  const labels = DIM_LABELS[lang];
  const cfg = currentCfg?.dimensions || dimDefaults;
  grid.innerHTML = DIMS_ORDER.map(k => {
    const v = status.display[k] ?? 0;
    const neutral = cfg[k]?.neutral ?? dimDefaults[k]?.neutral ?? 0.5;
    const pct = Math.round(v * 100);
    const nPct = Math.round(neutral * 100);
    const cls = k === 'fatigue' ? 'fat' : (NEG_DIMS.has(k) ? 'neg' : 'pos');
    return \`<div class="dim-row">
      <div class="dim-label"><span>\${labels[k] || k}</span><span class="val">\${v.toFixed(2)}</span></div>
      <div class="bar-track">
        <div class="bar-fill \${cls}" style="width:\${pct}%"></div>
        <div class="neutral-marker" style="left:\${nPct}%"></div>
      </div>
    </div>\`;
  }).join('');

  const dot = document.getElementById('dot');
  dot.className = 'status-dot' + (status.stale ? ' stale' : '');
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
    document.getElementById('persona-info').textContent = (data.persona?.name || '') + ' / ' + (data.user?.name || '');
    document.getElementById('c-ai-name').value   = data.persona?.name || '';
    document.getElementById('c-user-name').value  = data.user?.name || '';
    document.getElementById('c-relation').value   = data.relation || '';
    document.getElementById('c-tz').value         = data.timezone_offset_hours ?? 8;
    document.getElementById('c-api-url').value    = data.classifier?.endpoint || '';
    document.getElementById('c-model').value      = data.classifier?.model || '';
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
      `jealousy ${f('jealousy')}  anxiety ${f('anxiety')}  protectiveness ${f('protectiveness')}`,
      `contentment ${f('contentment')}  elation ${f('elation')}  seeking ${f('seeking')}  play ${f('play')}`,
      `dejection ${f('dejection')}  irritability ${f('irritability')}`,
    ].join('\n');
    res.set('Content-Type', 'text/plain').send(block);
  });

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
      if (classifier?.endpoint) existing.classifier.endpoint = classifier.endpoint.replace(/\/$/, '');
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
    console.log(`[drives] Dashboard: http://127.0.0.1:${PORT}/dashboard`);
  });
}
