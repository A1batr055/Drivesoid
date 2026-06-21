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

Collect the following values before writing any config files. Ask naturally in conversation — you don't need to present them as a numbered list.

| # | What to ask | Config field | Notes |
|---|---|---|---|
| 1 | "What name should I go by? (this is my name as the AI persona)" | `persona.name` | The AI persona's display name |
| 2 | "What's your name?" | `user.name` | The human user's name |
| 3 | "How would you describe our relationship?" | `relation` | Free-form string, e.g. `romantic`, `best friends`, `work partner`. No restriction on values. |
| 4 | "What timezone are you in? (hours offset from UTC, e.g. 8 for Beijing, -5 for New York)" | `timezone_offset_hours` | Integer, default 8 |
| 5 | See classifier note below | `classifier.*` | See below |
| 6 | Handled automatically | `server.port` | See port note below |

**Classifier (question 5):** Drivesoid needs a language model to classify each message with an emotional label (e.g. affectionate, playful, anxious). This can be any cheap, fast model — it does not need to be powerful. Recommended: DeepSeek (`https://api.deepseek.com`, model `deepseek-v4-flash`). Ask the user: "Do you have a preferred API for a small classification model? If not, I'll use DeepSeek by default — you'll just need to add a DeepSeek API key." Collect the base URL and model name if they want a custom one.

**Port (question 6):** Do NOT ask the user about ports — they likely don't know what that means. Instead, check programmatically whether port 3001 is available (e.g. `netstat -an | grep 3001` or attempt a socket bind). If 3001 is free, use it silently. If occupied, pick the next free port (3002, 3003, …) and inform the user: "I'll run the service on port XXXX."

> **API key security note:** Do NOT ask the user for their API key through conversation — chat logs may be stored or transmitted. Instead, ask them to set it themselves (see Step 4).

---

## Step 4 — Write config files

### `.env`
Tell the user: "Please open `.env.example` in the Drivesoid directory, copy it to `.env`, and fill in your API key. Do not share the key with me."

Once they confirm it's done, continue.

### `drives.config.json`
```json
{
  "persona": { "name": "<persona name from question 1>" },
  "user":    { "name": "<user name from question 2>" },
  "relation": "<relation from question 3>",
  "timezone_offset_hours": <integer from question 4>,
  "classifier": {
    "endpoint": "<classifier base URL from question 5, or https://api.deepseek.com>",
    "model": "<model name from question 5, or deepseek-v4-flash>",
    "api_key_env": "DRIVES_API_KEY"
  },
  "server": { "port": <port determined automatically in question 6> }
}
```

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
