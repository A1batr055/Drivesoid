'use strict';
// Offline simulation harness: replays synthetic event scripts through the real
// worker pipeline (virtual clock, mocked classifier, seeded RNG) and checks
// the resulting curves against desired human-like shapes.
//
// Usage: node scripts/simulate.js [scenario-id ...]

const fs     = require('fs');
const path   = require('path');
const Module = require('module');
const crypto = require('crypto');

// ── Sandbox: keep all IO inside scripts/sim-out ──────────────────────────────
const OUT_DIR  = path.join(__dirname, 'sim-out');
const DATA_DIR = path.join(OUT_DIR, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
process.env.DRIVES_DATA_DIR = DATA_DIR;
const EVENTS_PATH = path.join(DATA_DIR, 'events.jsonl');

// ── Module mocks (installed before worker is required) ───────────────────────
function mockModule(absPath, exportsObj) {
  const m    = new Module(absPath, null);
  m.filename = absPath;
  m.loaded   = true;
  m.exports  = exportsObj;
  require.cache[absPath] = m;
}

const TZ = 8;
mockModule(require.resolve('../src/config.js'), {
  load: () => ({
    persona: { name: 'Aria' },
    user:    { name: 'Sim' },
    relation: 'partner',
    timezone_offset_hours: TZ,
    classifier: { api_key_env: 'SIM_KEY', endpoint: 'http://mock.invalid', model: 'mock' },
  }),
});

const labelQueue = [];
mockModule(require.resolve('../src/classifier.js'), {
  classifyMessage: async () => {
    if (!labelQueue.length) throw new Error('simulate: label queue empty');
    return labelQueue.shift();
  },
});

// ── Seeded RNG for reproducible runs ─────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const worker = require('../src/worker');

const TICK_MS = 150_000;
const MIN     = 60_000;
const HOUR    = 3_600_000;

// ── Scenario helpers (all times in minutes from scenario start) ──────────────
function localStart(y, mo, d, h, mi = 0) { return Date.UTC(y, mo - 1, d, h - TZ, mi); }

function userMsg(at, label, confidence) {
  return { at, type: 'msg_user', label, confidence, payload: { text: `[sim:${label}]` } };
}
function assistantReply(at) {
  return { at, type: 'msg_assistant', payload: { message_id: `sim-${at}` } };
}
function ev(at, type, payload = {}) { return { at, type, payload }; }

// A user message answered by the assistant one minute later.
function exchange(events, at, label, conf, { quick = false } = {}) {
  events.push(userMsg(at, label, conf), assistantReply(at + 1));
  if (quick) events.push(ev(at + 0.5, 'msg_quick_reply'));
}

// Nightly sleep 23:30 → 07:00 for every night the scenario spans.
// startLocalHour: scenario start hour of day (local).
function nightlySleep(events, startLocalHour, durationMin) {
  const first = (23.5 - startLocalHour) * 60;
  for (let s = first >= 0 ? first : first + 1440; s < durationMin; s += 1440) {
    events.push(ev(s, 'sleep_start', { sleep: true }));
    if (s + 450 < durationMin) events.push(ev(s + 450, 'sleep_end', { sleep: true }));
  }
}

// ── Scenarios ─────────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: 's1-conflict-makeup',
    title: '激烈冲突后和好',
    t0: localStart(2026, 1, 5, 20),
    durationMin: 180,
    plot: ['anxiety', 'dejection', 'contentment'],
    events: (E) => {
      const fight = [['conflict', .85], ['conflict', .8], ['hostile', .8], ['conflict', .85], ['conflict', .8],
                     ['hostile', .85], ['conflict', .8], ['conflict', .85], ['hostile', .8], ['conflict', .85]];
      fight.forEach(([l, c], i) => exchange(E, i * 2, l, c, { quick: i > 0 }));
      [6, 12, 18].forEach(t => E.push(ev(t, 'msg_hot_conv')));
      const makeup = [['affectionate', .85], ['reassuring', .85], ['affectionate', .8],
                      ['reassuring', .85], ['affectionate', .85]];
      makeup.forEach(([l, c], i) => exchange(E, 25 + i * 5, l, c, { quick: i % 2 === 0 }));
      E.push(userMsg(52, 'playful', .7)); // user has the last word: no unanswered thread afterwards
    },
    checks: [
      { name: '冲突期 anxiety 上升 ≥ 0.25',        fn: r => v(r, 20, 'anxiety') - v(r, 0, 'anxiety') >= 0.25 },
      { name: '冲突期逐段上升（2→10→20min）',       fn: r => v(r, 20, 'anxiety') >= v(r, 10, 'anxiety') - 0.02 && v(r, 10, 'anxiety') >= v(r, 2, 'anxiety') - 0.02 },
      { name: '和好起效：anxiety(55) < anxiety(20)', fn: r => v(r, 55, 'anxiety') < v(r, 20, 'anxiety') - 0.03 },
      { name: '冲突残余：anxiety(120) ≥ 0.25',       fn: r => v(r, 120, 'anxiety') >= 0.25 },
    ],
  },
  {
    id: 's2-night-fear',
    title: '深夜恐惧过夜',
    t0: localStart(2026, 1, 5, 22),
    durationMin: 600,
    plot: ['fear', 'anxiety'],
    events: (E) => {
      exchange(E, 0, 'fear_death', .9);
      exchange(E, 6, 'fear_death', .85);
      exchange(E, 15, 'reassuring', .85);
      exchange(E, 20, 'affectionate', .85);
      E.push(ev(60, 'sleep_start'), ev(540, 'sleep_end'));
    },
    checks: [
      { name: '恐惧建立：fear(10) ≥ 0.30',         fn: r => v(r, 10, 'fear') >= 0.30 },
      { name: '睡前仍有恐惧：fear(58) ≥ 0.12',     fn: r => v(r, 58, 'fear') >= 0.12 },
      { name: '晨起留痕：fear(545) ≥ 0.04',        fn: r => v(r, 545, 'fear') >= 0.04 },
    ],
  },
  {
    id: 's3-affection-spam',
    title: 'affectionate 刷屏',
    t0: localStart(2026, 1, 5, 15),
    durationMin: 40,
    plot: ['intimacy', 'contentment'],
    events: (E) => {
      for (let i = 0; i < 8; i++) exchange(E, i * 3, 'affectionate', .9, { quick: i > 0 });
    },
    checks: [
      { name: '增幅递减：第2条 ≤ 75% 第1条',  fn: r => inc(r, 3, 'intimacy') <= 0.75 * inc(r, 0, 'intimacy') },
      { name: '增幅递减：第3条 ≤ 60% 第1条',  fn: r => inc(r, 6, 'intimacy') <= 0.60 * inc(r, 0, 'intimacy') },
      { name: '不顶满：max intimacy < 0.97',   fn: r => Math.max(...r.map(x => x.base.intimacy)) < 0.97 },
    ],
  },
  {
    id: 's4-neglect-cycles',
    title: '多天冷落-和好循环 ×3',
    t0: localStart(2026, 1, 5, 10),
    durationMin: 120 * 60,
    plot: ['longing', 'anxiety'],
    events: (E) => {
      for (const day of [0, 48, 96]) {
        const warm = [['affectionate', .85], ['playful', .8], ['affectionate', .8],
                      ['playful', .75], ['affectionate', .85], ['reassuring', .8]];
        warm.forEach(([l, c], i) => exchange(E, day * 60 + i * 10, l, c));
      }
      nightlySleep(E, 10, 120 * 60);
    },
    checks: [
      { name: '无棘轮：第3轮 longing 峰 ≤ 第1轮峰 + 0.15', fn: r => v(r, 119.8 * 60, 'longing') <= v(r, 47.8 * 60, 'longing') + 0.15 },
      { name: '末段 anxiety 有界 ≤ 0.35',                  fn: r => v(r, 119.8 * 60, 'anxiety') <= 0.35 },
    ],
  },
  {
    id: 's5-week-routine',
    title: '长期日常 7 天',
    t0: localStart(2026, 1, 5, 8),
    durationMin: 168 * 60,
    plot: ['anxiety', 'longing', 'contentment'],
    events: (E) => {
      for (let day = 0; day < 7; day++) {
        for (const h of [9.5, 13, 19, 22]) exchange(E, day * 1440 + (h - 8) * 60, 'neutral', .7);
      }
      nightlySleep(E, 8, 168 * 60);
    },
    checks: [
      { name: '末日各维靠近 neutral（|dev| ≤ 0.15）', fn: (r, dims) => {
          const row = at(r, 6.5 * 1440 + 240);
          return Object.entries(dims).every(([k, p]) => Math.abs(row.base[k] - p.neutral) <= 0.15);
        } },
      { name: '末日无漂移（24h 内 max |dev| ≤ 0.2）', fn: (r, dims) => r.filter(x => x.t >= 6 * 1440).every(row =>
          Object.entries(dims).every(([k, p]) => Math.abs(row.base[k] - p.neutral) <= 0.2)) },
    ],
  },
  {
    id: 's6-cold-then-sweet',
    title: '连续冷淡后一句甜话',
    t0: localStart(2026, 1, 5, 19),
    durationMin: 60,
    plot: ['anxiety', 'dejection'],
    events: (E) => {
      [['cold', .8], ['cold', .8], ['cold', .8], ['distant', .8], ['distant', .8]]
        .forEach(([l, c], i) => exchange(E, i * 3, l, c));
      exchange(E, 20, 'affectionate', .9);
    },
    checks: [
      { name: '冷淡累积：anxiety(19) ≥ 0.45',            fn: r => v(r, 19, 'anxiety') >= 0.45 },
      { name: '甜话起效：anxiety(25) < anxiety(19)',      fn: r => v(r, 25, 'anxiety') < v(r, 19, 'anxiety') },
      { name: '不清零：anxiety(25) ≥ 50% anxiety(19)',    fn: r => v(r, 25, 'anxiety') >= 0.5 * v(r, 19, 'anxiety') },
    ],
  },
];

// ── Row access helpers ────────────────────────────────────────────────────────
function at(rows, t_min) {
  let best = rows[0];
  for (const row of rows) if (row.t <= t_min) best = row; else break;
  return best;
}
function v(rows, t_min, dim) { return at(rows, t_min).base[dim]; }
// Base increment across the tick that ingests the message sent at t_min.
function inc(rows, t_min, dim) {
  const idx = rows.findIndex(row => row.t > t_min);
  if (idx < 1) return 0;
  return rows[idx].base[dim] - rows[idx - 1].base[dim];
}

// ── Runner ────────────────────────────────────────────────────────────────────
function sparkline(series, width = 64) {
  const marks = '▁▂▃▄▅▆▇█';
  const step  = series.length / width;
  let out = '';
  for (let i = 0; i < width; i++) {
    const x = series[Math.min(series.length - 1, Math.floor(i * step))];
    out += marks[Math.min(7, Math.max(0, Math.floor(x * 8)))];
  }
  return out;
}

async function runScenario(sc) {
  Math.random = mulberry32(20260707);
  labelQueue.length = 0;
  fs.writeFileSync(EVENTS_PATH, '');

  const events = [];
  sc.events(events);
  events.sort((a, b) => a.at - b.at);

  const state = worker.createInitialState(sc.t0);
  const dims  = {};
  for (const k of Object.keys(state.base)) dims[k] = { neutral: state.base[k] };

  const rows = [];
  let next = 0;
  const totalTicks = Math.ceil((sc.durationMin * MIN) / TICK_MS);

  for (let i = 1; i <= totalTicks; i++) {
    const now_ts = sc.t0 + i * TICK_MS;
    while (next < events.length && sc.t0 + events[next].at * MIN <= now_ts) {
      const e = events[next++];
      if (e.type === 'msg_user') labelQueue.push({ label: e.label, confidence: e.confidence });
      const record = {
        event_id:  crypto.randomUUID(),
        timestamp: new Date(sc.t0 + e.at * MIN).toISOString(),
        type:      e.type,
        payload:   e.payload || {},
      };
      fs.appendFileSync(EVENTS_PATH, JSON.stringify(record) + '\n');
    }
    const log = await worker.advance(state, now_ts);
    rows.push({
      t:       (i * TICK_MS) / MIN,
      base:    { ...state.base },
      mood:    { ...state.mood },
      display: { ...state.display },
      labels:  log.classifier.map(c => c.label ?? 'error'),
      sleep:   state.sleep?.status,
    });
  }

  const header = ['t_min', 'sleep',
                  ...Object.keys(dims).map(k => `base.${k}`),
                  ...Object.keys(dims).map(k => `mood.${k}`),
                  'display.anxiety', 'display.fear', 'display.intimacy', 'display.longing', 'labels'];
  const csv = [header.join(',')];
  for (const row of rows) {
    csv.push([row.t.toFixed(1), row.sleep,
      ...Object.keys(dims).map(k => row.base[k].toFixed(4)),
      ...Object.keys(dims).map(k => (row.mood?.[k] ?? 0).toFixed(4)),
      row.display.anxiety.toFixed(4), row.display.fear.toFixed(4),
      row.display.intimacy.toFixed(4), row.display.longing.toFixed(4),
      row.labels.join('|')].join(','));
  }
  fs.writeFileSync(path.join(OUT_DIR, `${sc.id}.csv`), csv.join('\n') + '\n');

  const results = sc.checks.map(c => ({ name: c.name, ok: !!c.fn(rows, dims) }));

  console.log(`\n━━ ${sc.id} · ${sc.title} ━━ (${rows.length} ticks / ${(sc.durationMin / 60).toFixed(1)}h)`);
  for (const dim of sc.plot) {
    console.log(`  ${dim.padEnd(12)} ${sparkline(rows.map(r => r.base[dim]))}`);
  }
  for (const res of results) console.log(`  ${res.ok ? 'PASS' : 'FAIL'}  ${res.name}`);
  return { id: sc.id, title: sc.title, results };
}

async function main() {
  const wanted = process.argv.slice(2);
  const list   = wanted.length ? SCENARIOS.filter(s => wanted.some(w => s.id.includes(w))) : SCENARIOS;
  if (!list.length) { console.error('no matching scenario'); process.exit(2); }

  const report = [];
  for (const sc of list) report.push(await runScenario(sc));

  fs.writeFileSync(path.join(OUT_DIR, 'report.json'),
    JSON.stringify({ ran_at: new Date().toISOString(), report }, null, 2));

  const failed = report.reduce((n, s) => n + s.results.filter(r => !r.ok).length, 0);
  const total  = report.reduce((n, s) => n + s.results.length, 0);
  console.log(`\n${total - failed}/${total} checks passed · CSV + report.json → scripts/sim-out/`);
}

main().catch(e => { console.error(e); process.exit(1); });
