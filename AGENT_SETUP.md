# Drivesoid — Agent Setup Guide

This guide is written for AI agents performing an automated installation.
Follow each step in order. Ask the user only the questions listed below — nothing else.

---

## Step 1 — Prerequisites

Verify Node.js ≥ 18 is installed:
```
node --version
```
If missing, install from https://nodejs.org/

---

## Step 2 — Clone the repo

```
git clone https://github.com/A1batr055/Drivesoid.git
cd Drivesoid
npm install
```

---

## Step 3 — Ask the user these questions (in conversation)

Collect the following values before writing any config files.

| # | Ask the user | Config field | Notes |
|---|---|---|---|
| 1 | "What is my name?" | `persona.name` | The AI persona's name |
| 2 | "What is your name?" | `user.name` | The human user's name |
| 3 | "How would you describe our relationship? (romantic / companion / friend)" | `relation` | Use exactly one of: `romantic`, `companion`, `friend` |
| 4 | "What timezone are you in? (hours offset from UTC, e.g. 8 for Beijing, -5 for EST)" | `timezone_offset_hours` | Integer, default 8 |
| 5 | "Which classifier endpoint should I use?" | `classifier.endpoint` | Default: `https://api.deepseek.com` |
| 6 | "Which port should Drivesoid listen on?" | `server.port` | Default: 3001. Skip if user doesn't care. |

> **API key security note:** Do NOT ask the user for their API key through conversation — chat logs may be stored or transmitted. Instead, ask them to set it themselves (see Step 4).

---

## Step 4 — Write config files

### `.env`
Tell the user: "Please open `.env.example` in the Drivesoid directory, copy it to `.env`, and fill in your API key. Do not share the key with me."

Once they confirm it's done, continue.

### `drives.config.json`
```json
{
  "persona": { "name": "<answer 1>" },
  "user":    { "name": "<answer 2>" },
  "relation": "<answer 3>",
  "timezone_offset_hours": <answer 4>,
  "classifier": {
    "endpoint": "<answer 5>",
    "model": "deepseek-v4-flash",
    "api_key_env": "DRIVES_API_KEY"
  },
  "server": { "port": <answer 6> }
}
```

---

## Step 5 — Start the service

```
npm start
```

Verify it started:
```
curl http://127.0.0.1:3001/api/drives/status
```
Expected: JSON with `snapshot_at`, `display`, `groups` fields. If `stale: true`, wait 30 seconds and retry.

---

## Step 6 — Integration

Call these endpoints from your AI bridge:

| When | Endpoint | Body |
|---|---|---|
| Session starts | `POST /internal/drives/session-start` | `{}` |
| User sends a message | `POST /internal/drives/event` | `{"type":"msg_user","payload":{"text":"<message>","context":[...]}}` |
| AI sends a reply | `POST /internal/drives/event` | `{"type":"msg_assistant","payload":{"message_id":"<id>"}}` |
| Quick reply detected | `POST /internal/drives/event` | `{"type":"msg_quick_reply"}` |
| User goes to sleep | `POST /internal/drives/sleep` | `{"type":"sleep_start"}` |
| User wakes up | `POST /internal/drives/sleep` | `{"type":"sleep_end"}` |
| Read current state | `GET /api/drives/status` | — |

The `context` array in `msg_user` is optional but improves classification accuracy.
Format: `[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]`

---

## Step 7 — Done

Tell the user: "Drivesoid is running. I can now track my emotional state across our conversations."
