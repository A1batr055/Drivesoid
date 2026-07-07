'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { readState, writeState }   = require('./state');
const { classifyMessage }         = require('./classifier');
const { pruneEvents }             = require('./events');
const _cfg = require('./config').load();
const { timezone_offset_hours: TZ_OFFSET = 8 } = _cfg;

const DATA_DIR     = process.env.DRIVES_DATA_DIR || path.join(__dirname, '../data');
const EVENTS_PATH  = path.join(DATA_DIR, 'events.jsonl');
const HISTORY_PATH = path.join(DATA_DIR, 'drives-history.jsonl');
const HISTORY_DAYS = 30;

const WORKER_INTERVAL_MS = 150_000; // 2.5 min
const CAP = 0.08;                   // circadian amplitude cap

// ── Dimension parameters ──────────────────────────────────────────────────────
const DIMS = {
  vitality:       { neutral: 0.50, tau: 6,  peak: 10, amp: 1.0, width: 10  },
  longing:        { neutral: 0.30, tau: 6,  peak: 22, amp: 0.9, width: 6   },
  intimacy:       { neutral: 0.35, tau: 10, peak: 23, amp: 0.7, width: 9   },
  possessiveness: { neutral: 0.30, tau: 4,  peak: 21, amp: 0.6, width: 5   },
  lust:           { neutral: 0.30, tau: 4,  peak: 23, amp: 0.8, width: 6   },
  jealousy:       { neutral: 0.22, tau: 2,  peak: 0,  amp: 0,   width: 1   },
  anxiety:        { neutral: 0.20, tau: 2,  peak: 0,  amp: 0,   width: 1   },
  protectiveness: { neutral: 0.25, tau: 4,  peak: 0,  amp: 0,   width: 1   },
  contentment:    { neutral: 0.35, tau: 12, peak: 14, amp: 0.5, width: 9   },
  elation:        { neutral: 0.20, tau: 3,  peak: 19, amp: 0.7, width: 3.5 },
  seeking:        { neutral: 0.25, tau: 4,  peak: 14, amp: 0.8, width: 5   },
  play:           { neutral: 0.25, tau: 3,  peak: 19, amp: 0.7, width: 3.5 },
  dejection:      { neutral: 0.15, tau: 8,  peak: 8,  amp: 0.5, width: 4   },
  irritability:   { neutral: 0.15, tau: 3,  peak: 16, amp: 0.6, width: 3.5 },
  fear:           { neutral: 0,    tau: 1,  peak: 0,  amp: 0,   width: 1   },
};

const DIM_FLOOR = {
  vitality: 0.08, longing: 0.15, intimacy: 0.06, possessiveness: 0.05, lust: 0.05,
  jealousy: 0,    anxiety: 0.02, protectiveness: 0.05,
  contentment: 0.06, elation: 0.02, seeking: 0.12, play: 0.03,
  dejection: 0,   irritability: 0, fear: 0,
};

// Apply optional dimension overrides from config
if (_cfg.dimensions) {
  for (const [k, v] of Object.entries(_cfg.dimensions)) {
    if (DIMS[k]) {
      if (typeof v.neutral === 'number') DIMS[k].neutral = v.neutral;
    }
    if (Object.prototype.hasOwnProperty.call(DIM_FLOOR, k)) {
      if (typeof v.floor === 'number') DIM_FLOOR[k] = v.floor;
    }
  }
}

const FATIGUE_C = { peak: 3, amp: 0.8, width: 10 };

// ── Content label deltas ──────────────────────────────────────────────────────
const LABEL_DELTAS = {
  affectionate:       { intimacy: +0.20, contentment: +0.15, anxiety: -0.18, lust: +0.12, longing: -0.10, fear: -0.08 },
  playful:            { play: +0.20, elation: +0.18, contentment: +0.12, seeking: +0.10, irritability: -0.10, lust: +0.10 },
  vulnerable:         { intimacy: +0.25, protectiveness: +0.20, anxiety: +0.12, dejection: +0.08 },
  reassuring:         { anxiety: -0.25, jealousy: -0.20, contentment: +0.15, intimacy: +0.15, fear: -0.15 },
  cold:               { anxiety: +0.15, dejection: +0.12, longing: +0.10, intimacy: -0.10 },
  conflict:           { anxiety: +0.20, irritability: +0.15, dejection: +0.15, possessiveness: +0.18, lust: +0.10, intimacy: -0.15, contentment: -0.15 },
  distant:            { anxiety: +0.12, dejection: +0.10, longing: +0.12, intimacy: -0.08 },
  struggling:         { protectiveness: +0.30, anxiety: +0.12, dejection: +0.12, contentment: -0.08 },
  intimate_reference: { lust: +0.18, intimacy: +0.10 },
  intimate_event:     { lust: +0.25, intimacy: +0.18 },
  neutral:            { anxiety: -0.05, longing: -0.04, contentment: +0.04 },
  hostile:            { dejection: +0.22, anxiety: +0.18, irritability: +0.12, intimacy: -0.22, contentment: -0.18 },
  fear_separation:    { fear: +0.20, longing: +0.15, possessiveness: +0.12, anxiety: +0.15, protectiveness: +0.10, dejection: +0.10, irritability: +0.08 },
  fear_death:         { fear: +0.35, anxiety: +0.30, irritability: +0.20, contentment: -0.12, play: -0.15, elation: -0.10 },
  fear_concern:       { fear: +0.28, longing: +0.12, possessiveness: +0.15, anxiety: +0.20, protectiveness: +0.25, contentment: -0.10 },
  fear_general:       { fear: +0.20, anxiety: +0.10 },
};

// Structural effect of an incoming user message, split by meaning: contact
// resolves absence and always applies; soothing is withheld in negative
// contexts — an argument message is contact, not comfort.
const MSG_CONTACT = { longing: -0.06, seeking: -0.04 };
const MSG_SOOTHE  = { dejection: -0.08, contentment: +0.08, anxiety: -0.025, irritability: -0.020 };
const MSG_ANXIETY_COMP = -0.075;
const MSG_IRRIT_COMP   = -0.060;
const SOOTHING_LABELS = new Set(['affectionate', 'playful', 'reassuring']);

// ── Context valence & habituation ─────────────────────────────────────────────
// Timing signals (quick replies, hot conversations) carry arousal, not valence;
// their emotional direction is borrowed from recent classified context.
// Repeating the same label within the window habituates: nth repeat ×0.7ⁿ.
const RECENT_LABEL_WINDOW_MS = 15 * 60_000;
const RECENT_LABEL_KEEP      = 8;
const HABITUATION_FACTOR     = 0.7;
const NEG_CTX_LABELS = new Set(['cold', 'conflict', 'distant', 'hostile', 'struggling',
                                'fear_separation', 'fear_death', 'fear_concern', 'fear_general']);

function recentLabels(state, now_ts) {
  return (state._recent_labels || [])
    .map(e => (typeof e === 'string' ? { label: e, ts: null } : e))
    .filter(e => !e.ts || now_ts - new Date(e.ts).getTime() < RECENT_LABEL_WINDOW_MS);
}

function contextValence(state, now_ts) {
  const recent = recentLabels(state, now_ts);
  if (!recent.length) return 'unknown';
  const neg = recent.filter(e => NEG_CTX_LABELS.has(e.label)).length;
  return neg * 2 >= recent.length ? 'negative' : 'positive';
}

// ── Mood layer: three-level anchor chain (base → mood → temperament) ──────────
// base decays toward mood; mood follows base and slowly returns to the
// temperament anchor (DIMS neutral). Sleep consolidates mood back faster.
// Consolidation is arousal-gated: large base-mood deviations (intense episodes)
// imprint on mood faster than everyday fluctuations.
const MOOD_FOLLOW_TAU_H       = 12;
const MOOD_RETURN_TAU_H       = 72;
const MOOD_SLEEP_RETURN_MULT  = 3;
const MOOD_CONSOLIDATION_GAIN = 4;    // follow speed multiplier = clamp(GAIN·|dev|, MIN, MAX)
const MOOD_CONSOLIDATION_MIN  = 0.25;
const MOOD_CONSOLIDATION_MAX  = 2.5;

const MSG_QUICK_REPLY     = { contentment: +0.12, elation: +0.10, anxiety: -0.10 };
const MSG_HOT_CONV        = { contentment: +0.15, play: +0.12, elation: +0.10, longing: -0.20 };
const MSG_QUICK_REPLY_NEG = { anxiety: +0.05, irritability: +0.05 };
const MSG_HOT_CONV_NEG    = { anxiety: +0.06, irritability: +0.06 };

// ── Time accumulation ─────────────────────────────────────────────────────────
const TIME_PER_HOUR = { longing: 0.04, anxiety: 0.02, seeking: 0.02 };
const TIME_CAPS     = { longing: 0.35, anxiety: 0.18, seeking: 0.12, dejection: 0.08, irritability_unanswered: 0.10 };
const DEJECTION_THRESHOLD_H = 6;

// ── Unanswered milestones ─────────────────────────────────────────────────────
const UNANSWERED = {
  normal: { '1h': { anxiety: +0.06, irritability: +0.04 }, '2h': { anxiety: +0.05 } },
  high:   { '30m': { anxiety: +0.12, irritability: +0.08 }, '1h': { anxiety: +0.10 }, '2h': { anxiety: +0.08 } },
};
const ANXIETY_UNANSWERED_CAP = { normal: 0.15, high: 0.28 };
const MILESTONE_MINUTES = { '30m': 30, '1h': 60, '2h': 120 };

// ── Calendar deltas ───────────────────────────────────────────────────────────
const CALENDAR_DELTAS = {
  period_start: { protectiveness: +0.20, lust: -0.10 },
  period_end:   { lust: +0.15, longing: +0.08 },
  intimacy:     { lust: +0.25, intimacy: +0.18 },
  exam:         { protectiveness: +0.15, seeking: +0.10 },
  holiday:      { elation: +0.20, longing: +0.15 },
  birthday:     { elation: +0.30, longing: +0.20, seeking: +0.15, lust: +0.12 },
  trip_start:   { longing: +0.20, anxiety: +0.10, possessiveness: +0.15, lust: +0.10 },
  trip_end:     { elation: +0.25, longing: -0.20, lust: +0.15 },
  meetup:       { elation: +0.30, lust: +0.20, seeking: +0.15 },
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function clamp(v, lo = 0, hi = 1) { return Number.isFinite(v) ? Math.min(Math.max(v, lo), hi) : (lo + hi) / 2; }

function localHour(ts) {
  const d = new Date(ts);
  return ((d.getUTCHours() + TZ_OFFSET) % 24 + 24) % 24;
}

function gaussianOffset(peak, amp, width, ts) {
  if (amp === 0) return 0;
  const h    = localHour(ts);
  const dist = ((h - peak + 12) % 24) - 12;
  return CAP * amp * Math.exp(-0.5 * (dist / width) ** 2);
}


function fatigueBase(sleep, now_ts) {
  const target = 7.5;
  const actual = sleep.last_sleep_duration_hours ?? target;
  const base_at_wake = clamp((Math.max(0, target - actual) / target) * 0.6);

  if (sleep.status === 'asleep' && sleep.last_sleep_started_at) {
    const hours_asleep     = (now_ts - new Date(sleep.last_sleep_started_at).getTime()) / 3_600_000;
    const base_at_sleep    = sleep._base_at_sleep ?? base_at_wake;
    const remaining_target = Math.max(1, target - (sleep.accumulated_sleep_hours ?? 0));
    return clamp(base_at_sleep - (base_at_sleep / remaining_target) * hours_asleep);
  }

  if (sleep.status === 'interrupted') {
    const acc = sleep.accumulated_sleep_hours ?? 0;
    const base_at_interrupt = clamp((Math.max(0, target - acc) / target) * 0.6 + (sleep.interrupt_fatigue_bonus ?? 0.12));
    if (!sleep.last_interrupted_at) return clamp(base_at_interrupt);
    const hours_since = (now_ts - new Date(sleep.last_interrupted_at).getTime()) / 3_600_000;
    return clamp(base_at_interrupt + clamp((hours_since - 1) / 10) * 0.25);
  }

  const wake_ts    = sleep.last_wake_at ? new Date(sleep.last_wake_at).getTime() : now_ts;
  const hours_awake = (now_ts - wake_ts) / 3_600_000;
  return clamp(base_at_wake + clamp((hours_awake - 4) / 14) * 0.4);
}

function noise(sigma = 0.02) {
  const u1 = Math.max(Number.EPSILON, Math.random());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random()) * sigma;
}

const NEG_DIMS = new Set(['dejection', 'irritability', 'anxiety', 'fear']);

// State-dependent impact, midpoint-normalized: increases scale with headroom,
// decreases with the current level (nothing to soothe when already calm).
// At x = 0.5 the effective delta equals the nominal delta, so existing tables
// keep their tuned feel in the normal range.
// Acute relief of negative dims is floored at mood: soothing calms the moment,
// not the underlying mood; only time and mood recovery reach below it.
function applyDeltas(state, deltas) {
  const { base, mood } = state;
  for (const [k, d] of Object.entries(deltas)) {
    if (!(k in base)) continue;
    const x   = base[k];
    const eff = d > 0 ? d * 2 * (1 - x) : d * 2 * x;
    let next  = Math.max(x + eff, DIM_FLOOR[k] ?? 0);
    if (d < 0 && NEG_DIMS.has(k)) next = Math.max(next, Math.min(x, mood?.[k] ?? 0));
    base[k] = clamp(next);
  }
}

// ── Display pipeline ──────────────────────────────────────────────────────────
function buildDisplay(state, now_ts) {
  const b = state.base;

  const d = {};
  for (const k of Object.keys(DIMS)) {
    const p = DIMS[k];
    d[k] = clamp(b[k] + gaussianOffset(p.peak, p.amp, p.width, now_ts) + noise(NEG_DIMS.has(k) ? 0.01 : 0.02));
  }
  d.fatigue = clamp(
    fatigueBase(state.sleep, now_ts) +
    gaussianOffset(FATIGUE_C.peak, FATIGUE_C.amp, FATIGUE_C.width, now_ts) +
    noise()
  );

  const v0 = d.vitality, f0 = d.fatigue;
  d.vitality = v0 * (1 - 0.6 * f0);
  d.fatigue  = f0 * (1 - 0.2 * v0);

  const af  = clamp(d.vitality * (1 - d.fatigue));
  const POS = ['longing','intimacy','possessiveness','lust','contentment','elation','seeking','play','protectiveness','jealousy'];
  const NEG = ['irritability','dejection','anxiety','fear'];
  for (const k of POS) d[k] = clamp(d[k] * (0.5 + 0.7 * af));
  for (const k of NEG) d[k] = clamp(d[k] * (1.4 - 0.6 * af));

  const j0 = d.jealousy, a0 = d.anxiety;
  d.jealousy = j0 * (1 + 0.4  * a0);
  d.anxiety  = a0 * (1 + 0.25 * j0);

  if (state.last_intimacy_at) {
    const hours_ago = (now_ts - new Date(state.last_intimacy_at).getTime()) / 3_600_000;
    const factor = 0.6 * clamp(1 - (hours_ago - 3) / 11);
    if (factor > 0) {
      d.intimacy = clamp(d.intimacy + d.intimacy * factor);
      d.lust     = clamp(d.lust     + d.lust     * factor);
    }
  }

  const a_amp = 1 + 0.3 * d.anxiety;
  for (const k of ['intimacy','lust','longing','possessiveness']) d[k] = clamp(d[k] * a_amp);

  if (d.fear > 0.1) {
    const damp = 1 - 0.3 * d.fear;
    for (const k of ['contentment','elation','play','seeking','lust']) d[k] = clamp(d[k] * damp);
  }

  if (state.active_whim && new Date(state.active_whim.expires_at).getTime() > now_ts) {
    for (const [k, delta] of Object.entries(state.active_whim.deltas)) {
      if (k in d) d[k] = clamp(d[k] + delta);
    }
  }

  if (state.frustration > 0) {
    for (const [k, coeff] of Object.entries(FRUSTRATION_DISPLAY)) {
      if (k in d) d[k] = clamp(d[k] + state.frustration * coeff);
    }
  }

  for (const k of Object.keys(d)) d[k] = clamp(d[k]);
  return d;
}

// ── Decay ─────────────────────────────────────────────────────────────────────
function decayBaseTo(state, from_ts, to_ts) {
  if (to_ts <= from_ts) return;
  const elapsed   = to_ts - from_ts;
  const returnTau = state.sleep?.status === 'asleep'
    ? MOOD_RETURN_TAU_H / MOOD_SLEEP_RETURN_MULT
    : MOOD_RETURN_TAU_H;
  const ret = Math.exp(-elapsed / (returnTau * 3_600_000));
  for (const k of Object.keys(DIMS)) {
    const { neutral, tau } = DIMS[k];
    const dev    = Math.abs(state.base[k] - state.mood[k]);
    const gain   = clamp(MOOD_CONSOLIDATION_GAIN * dev, MOOD_CONSOLIDATION_MIN, MOOD_CONSOLIDATION_MAX);
    const follow = 1 - Math.exp(-elapsed * gain / (MOOD_FOLLOW_TAU_H * 3_600_000));
    let mood = state.mood[k] + (state.base[k] - state.mood[k]) * follow;
    mood = neutral + (mood - neutral) * ret;
    state.mood[k] = clamp(mood, DIM_FLOOR[k] ?? 0, 1);
    state.base[k] = state.mood[k] + (state.base[k] - state.mood[k]) * Math.exp(-elapsed / (tau * 3_600_000));
  }
}

// ── Time accumulation ─────────────────────────────────────────────────────────
function accumulateTime(state, now_ts, from_iso) {
  if (state.sleep?.status === 'asleep') {
    state.last_time_accumulated_at = new Date(now_ts).toISOString();
    return;
  }
  const from_ts             = new Date(from_iso ?? state.last_time_accumulated_at).getTime();
  const last_interaction_ts = new Date(state.last_interaction_at).getTime();
  if (now_ts <= from_ts) return;

  if (last_interaction_ts > from_ts) {
    state.time_episode = { id: crypto.randomUUID(), started_at: state.last_interaction_at, applied: {} };
  }
  if (!state.time_episode) {
    state.time_episode = { id: crypto.randomUUID(), started_at: state.last_interaction_at, applied: {} };
  }
  const ep = state.time_episode;

  const CATCHUP_HORIZON_MS = 30 * 24 * 3_600_000;
  const step_start = Math.max(from_ts, last_interaction_ts, now_ts - CATCHUP_HORIZON_MS);
  if (now_ts <= step_start) {
    state.last_time_accumulated_at = new Date(now_ts).toISOString();
    return;
  }

  const STEP = 3_600_000;
  let t = step_start;

  while (t < now_ts) {
    const t_end = Math.min(t + STEP, now_ts);
    const frac  = (t_end - t) / STEP;
    const hours_since_interaction = (t - last_interaction_ts) / 3_600_000;

    for (const [k, rate] of Object.entries(TIME_PER_HOUR)) {
      const already = ep.applied[k] ?? 0;
      if (already < TIME_CAPS[k]) {
        const add = Math.min(rate * frac, TIME_CAPS[k] - already);
        state.base[k] = clamp(state.base[k] + add);
        ep.applied[k] = already + add;
      }
    }

    if (hours_since_interaction >= DEJECTION_THRESHOLD_H) {
      const already = ep.applied.dejection ?? 0;
      if (already < TIME_CAPS.dejection) {
        const add = Math.min(0.01 * frac, TIME_CAPS.dejection - already);
        state.base.dejection = clamp(state.base.dejection + add);
        ep.applied.dejection = already + add;
      }
    }

    if (state.unanswered_thread) {
      const key    = 'irritability_unanswered';
      const already = ep.applied[key] ?? 0;
      if (already < TIME_CAPS.irritability_unanswered) {
        const add = Math.min(0.02 * frac, TIME_CAPS.irritability_unanswered - already);
        state.base.irritability = clamp(state.base.irritability + add);
        ep.applied[key] = already + add;
      }
    }

    t = t_end;
  }

  state.last_time_accumulated_at = new Date(now_ts).toISOString();
}

// ── Unanswered milestones ─────────────────────────────────────────────────────
function checkUnansweredMilestones(state, now_ts) {
  if (state.sleep?.status === 'asleep') return;
  const ut = state.unanswered_thread;
  if (!ut) return;
  const elapsed_min = (now_ts - new Date(ut.sent_at).getTime()) / 60_000;
  const table = UNANSWERED[ut.stakes] || UNANSWERED.normal;
  const cap   = ANXIETY_UNANSWERED_CAP[ut.stakes] || ANXIETY_UNANSWERED_CAP.normal;
  if (!ut.milestones_applied) ut.milestones_applied = [];

  let anxiety_applied = ut.milestones_applied.reduce((sum, m) => sum + (table[m]?.anxiety ?? 0), 0);

  for (const [label, mins] of Object.entries(MILESTONE_MINUTES)) {
    if (!table[label] || ut.milestones_applied.includes(label)) continue;
    if (elapsed_min < mins) continue;
    const deltas = { ...table[label] };
    if (deltas.anxiety) {
      deltas.anxiety = Math.min(deltas.anxiety, Math.max(0, cap - anxiety_applied));
      anxiety_applied += deltas.anxiety;
    }
    applyDeltas(state, deltas);
    ut.milestones_applied.push(label);
  }
}

// ── Whim ──────────────────────────────────────────────────────────────────────
function applyFrustrationDelta(state, delta, now_ts) {
  state.frustration = Math.max(0, Math.min(state.frustration + delta, FRUSTRATION_CAP));
  if (state.frustration >= FRUSTRATION_CAP && !state.frustration_peak_at) {
    state.frustration_peak_at = new Date(now_ts).toISOString();
  }
}

function satisfyOldestIntention(state, now_ts) {
  if (state.lust_intention_pending.length > 0) state.lust_intention_pending.shift();
  applyFrustrationDelta(state, FRUSTRATION_DELTAS.satisfied, now_ts);
  state.rejection_streak = 0;
}

function decayFrustration(state, from_ts, to_ts) {
  if (state.sleep?.status === 'asleep') return;
  if (to_ts <= from_ts) return;
  state.frustration = Math.max(0, state.frustration - FRUSTRATION_DECAY_RATE * (to_ts - from_ts));
}

function pruneExpiredIntentions(state, now_ts) {
  const expired = state.lust_intention_pending.filter(
    i => new Date(i.expires_at).getTime() <= now_ts
  );
  for (const _ of expired) applyFrustrationDelta(state, FRUSTRATION_DELTAS.expired, now_ts);
  state.lust_intention_pending = state.lust_intention_pending.filter(
    i => new Date(i.expires_at).getTime() > now_ts
  );
}

function maybeRollIntention(state, now_ts) {
  if (state.sleep?.status === 'asleep') return;
  const lustDisplay = state.display?.lust ?? state.base.lust;
  if (lustDisplay <= INTENTION_LUST_FLOOR) return;
  const windowStart = Math.floor(now_ts / INTENTION_WINDOW_MS) * INTENTION_WINDOW_MS;
  const lastRoll = state.lust_intention_last_roll_at
    ? new Date(state.lust_intention_last_roll_at).getTime()
    : 0;
  if (lastRoll >= windowStart) return;
  state.lust_intention_last_roll_at = new Date(windowStart).toISOString();
  if (Math.random() < INTENTION_ROLL_PROB) {
    const addedAt = new Date(now_ts).toISOString();
    state.lust_intention_pending.push({
      id:         crypto.randomUUID(),
      created_at: addedAt,
      expires_at: new Date(now_ts + INTENTION_EXPIRY_MS).toISOString(),
    });
    state.last_intention_added_at = addedAt;
  }
}

function maybeFireWhim(state, now_ts) {
  if (state.sleep?.status === 'asleep') return;
  if (state.active_whim && new Date(state.active_whim.expires_at).getTime() > now_ts) return;

  const d      = buildDisplay(state, now_ts);
  const POS_W  = ['vitality','seeking','play','elation','contentment'];
  const NEG_W  = ['dejection','irritability','anxiety'];
  const pos_max = Math.max(...POS_W.map(k => Math.max(0, d[k] - 0.6)));
  const neg_max = Math.max(...NEG_W.map(k => Math.max(0, d[k] - 0.5)));

  if (pos_max === 0 && neg_max === 0) return;
  if (Math.abs(pos_max - neg_max) < 0.1) return;

  const positive  = pos_max > neg_max;
  const threshold = positive ? 0.6 : 0.5;
  const pool      = (positive ? POS_W : NEG_W).filter(k => d[k] > threshold);
  const count     = 2 + Math.floor(Math.random() * Math.min(2, pool.length - 1));
  const chosen    = pool.sort(() => Math.random() - 0.5).slice(0, count);

  const deltas = {};
  for (const k of chosen) deltas[k] = 0.03 + Math.random() * 0.02;
  deltas.lust = 0.04;

  state.active_whim = {
    fired_at:   new Date(now_ts).toISOString(),
    expires_at: new Date(now_ts + 30 * 60_000).toISOString(),
    deltas,
  };
}

// ── Lust intention / frustration ──────────────────────────────────────────────
const INTENTION_ROLL_PROB    = 0.30;
const INTENTION_LUST_FLOOR   = 0.70;
const INTENTION_WINDOW_MS    = 4 * 3_600_000;
const INTENTION_EXPIRY_MS    = 2  * 3_600_000;
const FRUSTRATION_CAP        = 3.0;
const FRUSTRATION_DECAY_RATE = 0.04 / 3_600_000;
const STREAK_MULTIPLIER_CAP  = 2.0;

const FRUSTRATION_DELTAS = {
  expired:             +0.20,
  lust_rejection_hard: +0.35,
  lust_rejection_soft: +0.18,
  self_relief:         -0.40,
  satisfied:           -0.50,
};

const FRUSTRATION_DISPLAY = {
  lust:           +0.12,
  irritability:   +0.10,
  longing:        +0.10,
  possessiveness: +0.08,
  anxiety:        +0.04,
  intimacy:       +0.04,
  contentment:    -0.05,
  dejection:      +0.03,
  elation:        -0.04,
};

const FEAR_LABEL_CAP = 0.60;

// ── Event processing ──────────────────────────────────────────────────────────
function readPendingEvents(last_id) {
  let raw;
  try { raw = fs.readFileSync(EVENTS_PATH, 'utf8'); } catch { return []; }
  const all = raw.split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  if (!last_id) return all;
  const idx = all.findIndex(e => e.event_id === last_id);
  if (idx === -1) {
    console.error('[drives:worker] last_processed_event_id not found — skipping tick to avoid event replay');
    return [];
  }
  return all.slice(idx + 1);
}

async function processEvents(state, now_ts) {
  const pending = readPendingEvents(state.last_processed_event_id);
  const log     = { events: [], classifier: [] };
  let cursor    = new Date(state.last_time_accumulated_at).getTime();

  if (!pending.length) {
    decayBaseTo(state, cursor, now_ts);
    decayFrustration(state, cursor, now_ts);
    accumulateTime(state, now_ts);
    return log;
  }

  for (const ev of pending) {
    const ev_ts = new Date(ev.timestamp).getTime();
    if (!Number.isFinite(ev_ts)) { state.last_processed_event_id = ev.event_id; continue; }

    decayBaseTo(state, cursor, ev_ts);
    decayFrustration(state, cursor, ev_ts);
    accumulateTime(state, ev_ts);
    cursor = ev_ts;
    log.events.push(ev.type);

    switch (ev.type) {
      case 'msg_user': {
        const valence = contextValence(state, ev_ts);
        state.last_interaction_at = ev.timestamp;
        state.unanswered_thread   = null;
        applyDeltas(state, MSG_CONTACT);
        if (valence !== 'negative') applyDeltas(state, MSG_SOOTHE);

        if (!state.last_segment || state.last_segment.status === 'summarized') {
          state.last_segment = { id: crypto.randomUUID(), started_at: ev.timestamp, last_message_at: ev.timestamp, status: 'open', messages: 1, fear_label_applied: 0 };
        } else {
          state.last_segment.last_message_at = ev.timestamp;
          state.last_segment.messages = (state.last_segment.messages || 0) + 1;
        }

        if (ev.payload?.text) {
          try {
            const { label, confidence } = await classifyMessage(ev.payload.text, ev.payload.context || []);
            log.classifier.push({ label, confidence: +confidence.toFixed(3) });
            const raw    = LABEL_DELTAS[label] || {};
            const scaled = {};
            const priorSame   = recentLabels(state, ev_ts).filter(e => e.label === label).length;
            const habituation = Math.pow(HABITUATION_FACTOR, priorSame);
            for (const [k, v] of Object.entries(raw)) {
              scaled[k] = clamp(v * confidence * habituation, -0.25, 0.25);
            }
            if (scaled.fear != null && label.startsWith('fear_')) {
              const seg     = state.last_segment;
              const already = seg.fear_label_applied || 0;
              const allowed = Math.max(0, Math.min(scaled.fear, FEAR_LABEL_CAP - already));
              seg.fear_label_applied = already + allowed;
              scaled.fear = allowed;
            }
            applyDeltas(state, scaled);

            if (SOOTHING_LABELS.has(label)) {
              applyDeltas(state, { anxiety: MSG_ANXIETY_COMP * habituation, irritability: MSG_IRRIT_COMP * habituation });
            }

            if (label === 'intimate_event') {
              state.last_intimacy_at = ev.timestamp;
              satisfyOldestIntention(state, ev_ts);
            }

            if (!state._recent_labels) state._recent_labels = [];
            state._recent_labels = [{ label, ts: ev.timestamp }, ...state._recent_labels].slice(0, RECENT_LABEL_KEEP);
          } catch (e) {
            log.classifier.push({ error: e.message });
          }
        }
        break;
      }

      case 'msg_assistant': {
        const high_stakes_labels = new Set(['affectionate','vulnerable','intimate_reference','intimate_event']);
        const stakes = recentLabels(state, ev_ts).some(e => high_stakes_labels.has(e.label)) ? 'high' : 'normal';
        state.unanswered_thread = {
          message_id:         ev.payload?.message_id,
          sent_at:            ev.timestamp,
          stakes,
          milestones_applied: [],
        };
        if (!state.last_segment || state.last_segment.status === 'summarized') {
          state.last_segment = { id: crypto.randomUUID(), started_at: ev.timestamp, last_message_at: ev.timestamp, status: 'open', messages: 1, fear_label_applied: 0 };
        } else {
          state.last_segment.last_message_at = ev.timestamp;
          state.last_segment.messages = (state.last_segment.messages || 0) + 1;
        }
        break;
      }

      case 'msg_quick_reply': {
        const valence = contextValence(state, ev_ts);
        if (valence === 'positive') applyDeltas(state, MSG_QUICK_REPLY);
        else if (valence === 'negative') applyDeltas(state, MSG_QUICK_REPLY_NEG);
        break;
      }

      case 'msg_hot_conv': {
        const valence = contextValence(state, ev_ts);
        if (valence === 'positive') applyDeltas(state, MSG_HOT_CONV);
        else if (valence === 'negative') applyDeltas(state, MSG_HOT_CONV_NEG);
        break;
      }

      case 'calendar': {
        const { calendar_id, calendar_type } = ev.payload || {};
        if (calendar_id && !(state.processed_calendar_ids || []).includes(calendar_id)) {
          const deltas = CALENDAR_DELTAS[calendar_type];
          if (deltas) {
            applyDeltas(state, deltas);
            if (calendar_type === 'intimacy') state.last_intimacy_at = ev.timestamp;
            if (!state.processed_calendar_ids) state.processed_calendar_ids = [];
            state.processed_calendar_ids.push(calendar_id);
          }
        }
        break;
      }

      case 'self_relief':
        if (state.lust_intention_pending.length > 0) state.lust_intention_pending.shift();
        applyFrustrationDelta(state, FRUSTRATION_DELTAS.self_relief, ev_ts);
        break;

      case 'lust_rejection_hard': {
        if (state.lust_intention_pending.length === 0) break;
        const mult_h = Math.min(1 + state.rejection_streak * 0.10, STREAK_MULTIPLIER_CAP);
        applyFrustrationDelta(state, FRUSTRATION_DELTAS.lust_rejection_hard * mult_h, ev_ts);
        state.rejection_streak += 1;
        break;
      }

      case 'lust_rejection_soft': {
        if (state.lust_intention_pending.length === 0) break;
        const mult_s = Math.min(1 + state.rejection_streak * 0.10, STREAK_MULTIPLIER_CAP);
        applyFrustrationDelta(state, FRUSTRATION_DELTAS.lust_rejection_soft * mult_s, ev_ts);
        state.rejection_streak += 1;
        break;
      }

      case 'sex_end':
        state.last_intimacy_at = ev.timestamp;
        satisfyOldestIntention(state, ev_ts);
        break;

      case 'sleep_start':
        if (state.sleep.status === 'asleep') break;
        if (state.sleep.status === 'awake') delete state.sleep.accumulated_sleep_hours;
        state.sleep._base_at_sleep        = fatigueBase(state.sleep, ev_ts);
        delete state.sleep.interrupt_fatigue_bonus;
        state.sleep.status                = 'asleep';
        state.sleep.last_sleep_started_at = ev.timestamp;
        state.unanswered_thread           = null;
        delete state.active_whim;
        break;

      case 'sleep_end': {
        if (state.sleep.status === 'awake') break;
        const hasActiveSegment = state.sleep.status === 'asleep' && state.sleep.last_sleep_started_at;
        const last_segment_hours = hasActiveSegment
          ? Math.max(0, ev_ts - new Date(state.sleep.last_sleep_started_at).getTime()) / 3_600_000
          : 0;
        const accumulated = state.sleep.accumulated_sleep_hours ?? 0;
        const total = accumulated + last_segment_hours;
        state.sleep.last_sleep_duration_hours = total > 0 ? total : (state.sleep.last_sleep_duration_hours ?? 7.5);
        state.sleep.status       = 'awake';
        state.sleep.last_wake_at = ev.timestamp;
        state.sleep.estimated    = false;
        delete state.sleep._base_at_sleep;
        delete state.sleep.accumulated_sleep_hours;
        delete state.sleep.interrupt_fatigue_bonus;
        state.unanswered_thread  = null;
        break;
      }

      case 'sleep_interrupt': {
        if (state.sleep.status !== 'asleep') break;
        const seg_start = state.sleep.last_sleep_started_at
          ? new Date(state.sleep.last_sleep_started_at).getTime()
          : ev_ts;
        state.sleep.accumulated_sleep_hours = (state.sleep.accumulated_sleep_hours ?? 0) + Math.max(0, ev_ts - seg_start) / 3_600_000;
        delete state.sleep.last_sleep_started_at;
        state.sleep.status              = 'interrupted';
        state.sleep.last_interrupted_at = ev.timestamp;
        state.sleep.interrupt_fatigue_bonus = 0.12;
        applyDeltas(state, { irritability: 0.12, vitality: -0.10 });
        state.unanswered_thread         = null;
        delete state.active_whim;
        break;
      }
    }

    state.last_processed_event_id = ev.event_id;
  }

  decayBaseTo(state, cursor, now_ts);
  decayFrustration(state, cursor, now_ts);
  accumulateTime(state, now_ts);
  return log;
}

// ── History ───────────────────────────────────────────────────────────────────
function appendHistory(state, now_ts, eventLog) {
  const entry = {
    ts:         new Date(now_ts).toISOString(),
    sleep:      state.sleep?.status ?? 'unknown',
    events:     eventLog.events,
    classifier: eventLog.classifier,
    whim:       (state.active_whim && new Date(state.active_whim.expires_at).getTime() > now_ts)
                  ? { active: true, dims: Object.keys(state.active_whim.deltas) }
                  : { active: false },
    unanswered: state.unanswered_thread
                  ? { stakes: state.unanswered_thread.stakes, milestones: state.unanswered_thread.milestones_applied }
                  : null,
    base:    { ...state.base },
    mood:    { ...state.mood },
    display: { ...state.display },
    frustration:             state.frustration ?? 0,
    pending_count:           (state.lust_intention_pending ?? []).length,
    rejection_streak:        state.rejection_streak ?? 0,
    last_intention_added_at: state.last_intention_added_at ?? null,
  };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[drives:worker] history append error:', e.message);
  }
}

function pruneHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return;
    const cutoff = Date.now() - HISTORY_DAYS * 24 * 3_600_000;
    const lines  = fs.readFileSync(HISTORY_PATH, 'utf8').split('\n').filter(Boolean);
    const kept   = lines.filter(l => {
      try { return new Date(JSON.parse(l).ts).getTime() >= cutoff; } catch { return false; }
    });
    if (kept.length < lines.length) {
      fs.writeFileSync(HISTORY_PATH, kept.join('\n') + '\n');
      console.log(`[drives:worker] pruned ${lines.length - kept.length} history entries`);
    }
  } catch (e) {
    console.error('[drives:worker] history prune error:', e.message);
  }
}

// ── Initial state ─────────────────────────────────────────────────────────────
function createInitialState(now_ts = Date.now()) {
  const now = new Date(now_ts);

  const local_now = new Date(now_ts + TZ_OFFSET * 3_600_000);
  local_now.setUTCHours(7, 0, 0, 0);
  let wake_ts = local_now.getTime() - TZ_OFFSET * 3_600_000;
  if (wake_ts > now_ts) wake_ts -= 86_400_000;
  const last_wake_at = new Date(wake_ts).toISOString();

  const iso  = now.toISOString();
  const base = {};
  for (const [k, p] of Object.entries(DIMS)) base[k] = p.neutral;

  return {
    schema_version:           2,
    snapshot_at:              iso,
    state_updated_at:         iso,
    last_processed_event_id:  null,
    last_time_accumulated_at: iso,
    last_interaction_at:      iso,
    unanswered_thread:        null,
    last_segment:             { id: crypto.randomUUID(), started_at: iso, last_message_at: iso, status: 'open', messages: 0, fear_label_applied: 0 },
    processed_calendar_ids:   [],
    time_episode:             null,
    active_whim:              null,
    sleep:                    { status: 'awake', last_sleep_started_at: null, last_wake_at, last_sleep_duration_hours: 7.2, estimated: true },
    last_intimacy_at:         null,
    frustration:                  0,
    rejection_streak:             0,
    frustration_peak_at:          null,
    lust_intention_pending:       [],
    lust_intention_last_roll_at:  null,
    last_intention_added_at:      null,
    _recent_labels:           [],
    base,
    mood: { ...base },
  };
}

// ── Worker tick ───────────────────────────────────────────────────────────────
let _running = false;

async function advance(state, now_ts) {
  if (!state.mood) state.mood = {};
  for (const [k, p] of Object.entries(DIMS)) {
    if (!(k in state.base)) state.base[k] = p.neutral;
    if (!(k in state.mood)) state.mood[k] = p.neutral;
  }
  if ((state.schema_version ?? 1) < 2) {
    state.schema_version = 2;
    delete state.high_emotion_until;
  }
  if (state.frustration            == null)  state.frustration            = 0;
  if (state.rejection_streak       == null)  state.rejection_streak       = 0;
  if (state.frustration_peak_at    === undefined) state.frustration_peak_at    = null;
  if (!Array.isArray(state.lust_intention_pending)) state.lust_intention_pending = [];
  if (state.lust_intention_last_roll_at === undefined) state.lust_intention_last_roll_at = null;
  if (state.last_intention_added_at    === undefined) state.last_intention_added_at    = null;

  const eventLog = await processEvents(state, now_ts);
  pruneExpiredIntentions(state, now_ts);
  maybeRollIntention(state, now_ts);
  checkUnansweredMilestones(state, now_ts);
  maybeFireWhim(state, now_ts);

  if (state.last_segment?.status === 'open') {
    const last_msg_ts = new Date(state.last_segment.last_message_at).getTime();
    if (now_ts - last_msg_ts > 15 * 60_000) state.last_segment.status = 'summarized';
  }

  const iso          = new Date(now_ts).toISOString();
  state.snapshot_at  = iso;
  state.state_updated_at = iso;
  if (state.display) state.prev_display = state.display;
  state.display      = buildDisplay(state, now_ts);
  return eventLog;
}

async function tick({ throwOnError = false } = {}) {
  if (_running) return;
  _running = true;
  try {
    const now_ts = Date.now();
    let state    = readState();
    if (!state) state = createInitialState(now_ts);

    const eventLog = await advance(state, now_ts);
    pruneEvents(state.last_processed_event_id);
    writeState(state);
    appendHistory(state, now_ts, eventLog);
  } catch (e) {
    console.error('[drives:worker] tick error:', e.message);
    if (throwOnError) throw e;
  } finally {
    _running = false;
  }
}

async function handleSessionStart() {
  await tick({ throwOnError: true });
}

function init() {
  pruneHistory();
  setInterval(pruneHistory, 24 * 3_600_000);
  tick().catch(e => console.error('[drives:worker] init error:', e.message));
  setInterval(() => tick().catch(e => console.error('[drives:worker] interval error:', e.message)), WORKER_INTERVAL_MS);
}

module.exports = { init, handleSessionStart, buildDisplay, advance, createInitialState };
