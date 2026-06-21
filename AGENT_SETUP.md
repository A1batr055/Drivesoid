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

## Step 3 — Generate a setup sheet for the user to fill in

Do NOT collect answers through conversation. Instead:

1. Write the following file to the repo root as `drives.answers.json`:

```json
{
  "_readme": "Fill in all fields below, then tell me you are done.",
  "ai_name": "",
  "your_name": "",
  "relationship": "",
  "timezone_utc_offset": 8,
  "classifier_api_url": "https://api.deepseek.com",
  "classifier_model": "deepseek-v4-flash"
}
```

2. Tell the user:

   > "I've created a setup sheet at `drives.answers.json` in the Drivesoid folder. Please open it and fill in:
   > - **ai_name** — what you'd like to call me
   > - **your_name** — your name
   > - **relationship** — how you'd describe our relationship (anything you like: romantic, best friends, work partner, etc.)
   > - **timezone_utc_offset** — your UTC offset (e.g. 8 for China/Singapore, -5 for New York). Default is 8.
   > - **classifier_api_url / classifier_model** — leave as-is to use DeepSeek (recommended). The classifier labels your messages for emotional context; a cheap fast model is ideal.
   >
   > Let me know when you're done."

3. Wait for the user to confirm, then read `drives.answers.json` and proceed.

**Port:** Do NOT ask the user about ports. Check programmatically whether 3001 is free (e.g. `netstat -an | grep 3001`). If free, use 3001 silently. If occupied, pick the next free port and tell the user which one you chose.

> **API key security note:** Do NOT ask the user for their API key through conversation — chat logs may be stored. Handle key setup separately in Step 4.

---

## Step 4 — Write config files

### `.env`

1. Ask the user for their API key. If they are using DeepSeek, direct them to https://platform.deepseek.com/api_keys to obtain one.
2. Once the user provides the key, write `.env` yourself:
   ```
   DRIVES_API_KEY=<key the user provided>
   ```
   > Note: writing the key through conversation means it may appear in chat logs. If the user prefers not to share it this way, offer to create `.env` with a placeholder and let them fill it in manually instead.

### `drives.config.json`

Read values from `drives.answers.json`, then write:

```json
{
  "persona": { "name": "<ai_name>" },
  "user":    { "name": "<your_name>" },
  "relation": "<relationship>",
  "timezone_offset_hours": <timezone_utc_offset>,
  "classifier": {
    "endpoint": "<classifier_api_url>",
    "model": "<classifier_model>",
    "api_key_env": "DRIVES_API_KEY"
  },
  "server": { "port": <auto-detected free port> }
}
```

After writing `drives.config.json`, delete `drives.answers.json` — it is a temp file.

---

## Step 5 — Start the service

```
npm start
```

Verify it started (replace PORT with the port chosen in Step 3):
```
curl http://127.0.0.1:PORT/api/drives/status
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
