// SPDX-License-Identifier: CC-BY-NC-SA-4.0
// Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
'use strict';

const worker      = require('./worker');
const { readState }    = require('./state');
const { appendEvent }  = require('./events');

const SNAPSHOT_MAX_AGE_MS = 5 * 60_000;

function start() {
  worker.init();
}

function getSnapshot() {
  try {
    const state = readState();
    if (!state || !state.snapshot_at || !state.display) return null;
    const snapshotTs = new Date(state.snapshot_at).getTime();
    if (!Number.isFinite(snapshotTs)) return null;
    const age = Date.now() - snapshotTs;
    if (age < 0 || age >= SNAPSHOT_MAX_AGE_MS) return null;
    if (Object.values(state.display).some(v => !Number.isFinite(v))) return null;
    return { display: state.display };
  } catch {
    return null;
  }
}

function getStatus() {
  try {
    const state = readState();
    const now   = Date.now();
    if (!state || !state.snapshot_at || !state.display) {
      return { error: true, stale: true, snapshot_age_ms: null };
    }
    const snapshot_age_ms = now - new Date(state.snapshot_at).getTime();
    const stale = !Number.isFinite(snapshot_age_ms) || snapshot_age_ms < 0 || snapshot_age_ms > SNAPSHOT_MAX_AGE_MS;
    if (Object.values(state.display).some(v => !Number.isFinite(v))) {
      return { error: true, stale, snapshot_age_ms };
    }
    const d = state.display;
    const avg = (...vs) => vs.reduce((a, b) => a + b, 0) / vs.length;
    const groups = {
      activation: avg(d.vitality, 1 - d.fatigue),
      attachment: avg(d.longing, d.intimacy, d.possessiveness, d.lust),
      threat:     d.fear > 0 ? avg(d.jealousy, d.anxiety, d.protectiveness, d.fear) : avg(d.jealousy, d.anxiety, d.protectiveness),
      reward:     avg(d.contentment, d.elation, d.seeking, d.play),
      negative:   d.dejection * 0.30 + d.irritability * 0.25 + d.anxiety * 0.25 + d.fear * 0.20,
    };
    let whim = { active: false };
    if (state.active_whim && new Date(state.active_whim.expires_at).getTime() > now) {
      const dims    = Object.keys(state.active_whim.deltas || {});
      const posPool = ['vitality','seeking','play','elation','contentment'];
      const pool    = dims.filter(k => k !== 'lust').some(k => posPool.includes(k)) ? 'positive' : 'negative';
      whim = { active: true, pool, dims, expires_at: state.active_whim.expires_at };
    }
    return { snapshot_at: state.snapshot_at, snapshot_age_ms, stale, error: stale, base: state.base, mood: state.mood ?? null, display: d, prev: state.prev_display || null, groups, whim, sleep: state.sleep || null, frustration: state.frustration ?? 0, pending_count: (state.lust_intention_pending ?? []).length, rejection_streak: state.rejection_streak ?? 0, last_intention_added_at: state.last_intention_added_at ?? null };
  } catch {
    return { error: true, stale: true, snapshot_age_ms: null };
  }
}

async function handleSessionStart() {
  return worker.handleSessionStart();
}

module.exports = { start, getSnapshot, getStatus, handleSessionStart, appendEvent };
