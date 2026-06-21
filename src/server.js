'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const drives  = require('./index');
const config  = require('./config').load();

const app  = express();
const PORT = config.server?.port || 3001;

app.use(express.json());

function loopbackOnly(req, res, next) {
  const addr = req.socket.remoteAddress;
  if (addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1') return next();
  res.status(403).json({ error: 'loopback only' });
}

// Public: AI bridge polls this to read current state
app.get('/api/drives/status', (req, res) => {
  res.json(drives.getStatus());
});

// Internal: call at the start of each AI session for catch-up tick
app.post('/internal/drives/session-start', loopbackOnly, async (req, res) => {
  try {
    await drives.handleSessionStart();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Internal: generic event ingestion
// Body: { type: string, payload?: object }
// Common types: msg_user, msg_assistant, msg_quick_reply, msg_hot_conv, calendar, sex_end
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

// Internal: sleep events shorthand
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
