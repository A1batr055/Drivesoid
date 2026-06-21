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

## Step 3 — Run first-time setup via browser

Do NOT collect configuration through conversation.

1. Run `npm start`. If `drives.config.json` is missing or the API key is not set, Drivesoid starts in **setup mode** automatically and prints:
   ```
   [drives] First-time setup — open http://127.0.0.1:3001/setup
   ```

2. Tell the user:
   > "Please open **http://127.0.0.1:3001/setup** in your browser to complete setup. Fill in all fields and click Submit — I'll wait."

3. Wait for the user to confirm they submitted the form.

The setup page collects persona name, user name, relationship, timezone, and API key. Everything is written to disk by the server — the user never needs to touch any files, and the API key does not pass through chat.

---

## Step 4 — Restart after setup

Once the user confirms the setup form was submitted, restart the service:

```
npm start
```

The server will now load the config written by the setup page and start normally.

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
