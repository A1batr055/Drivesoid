# Drivesoid — Agent Setup Guide

This guide is written for AI agents performing an automated installation.
Follow each step in order. Ask the user only the questions listed below — nothing else.

---

## Step 1 — Environment check

**1a — Node.js**

Verify Node.js ≥ 18 is installed:
```
node --version
```
If missing, install from https://nodejs.org/

**1b — Port availability**

Drivesoid defaults to port 3001. Check whether it is already in use:
```
# Linux / macOS
lsof -i :3001

# Windows
netstat -ano | findstr :3001
```

If port 3001 is occupied, identify the process. If it is unrelated to Drivesoid:
- Setup must run on port 3001 (it is hardcoded). Ask the user to stop the occupying process temporarily, complete setup, then restart it.
- After setup, set `server.port` to the user's preferred port in `drives.config.json`.
- If the service port is not 3001, also set the `DRIVESOID_PORT` environment variable to match — the hooks use this to find the running service (default: 3001).

**1c — Existing bridge or middleware**

Check whether the user already has an AI bridge or middleware running that sends messages to Claude or another model:

- Ask the user: *"Do you have an existing bridge, proxy, or middleware that routes your AI conversations? (e.g. a Node.js server, Python script, or self-hosted tool)"*
- If yes, note the language and entry point — you will need to add event-reporting calls to it in Step 6.
- If no, the Claude Code hook approach in Step 6 is the simplest path.

**1d — Clone target directory**

Choose where to install. Default is `~/Drivesoid`. Check the directory does not already exist:
```
ls ~/Drivesoid 2>/dev/null && echo "EXISTS" || echo "OK"
```
If it exists, ask the user whether to reinstall (delete and re-clone) or use a different path.

---

## Step 2 — Clone the repo

Use the install directory confirmed in Step 1d:
```
git clone https://github.com/A1batr055/Drivesoid.git <install-dir>
cd <install-dir>
npm install
```

---

## Step 3 — Run first-time setup via browser

Do NOT collect configuration through conversation.

**Note:** Setup always runs on port 3001. The service port also defaults to 3001. To use a different port, edit `server.port` in `drives.config.json` after completing setup, then restart.

1. Run `npm start`. If `drives.config.json` is missing or the API key is not set, Drivesoid starts in **setup mode** automatically and prints:
   ```
   [drives] First-time setup — open http://127.0.0.1:3001/setup
   ```

2. Tell the user:
   > "Please open **http://127.0.0.1:3001/setup** in your browser to complete setup. Fill in all fields and click Submit — I'll wait."

   **If the user is on a remote VPS with no local browser access**, they need an SSH tunnel first. Tell them to run this on their local machine (replace `user` and `vps-ip`):
   ```
   ssh -L 3001:localhost:3001 user@vps-ip
   ```
   Then open `http://127.0.0.1:3001/setup` in their local browser as normal.

3. Wait for the user to confirm they submitted the form, then stop the process (Ctrl+C).

The setup page collects persona name, user name, relationship, timezone, and API key. Everything is written to disk by the server — the user never needs to touch any files, and the API key does not pass through chat.

---

## Step 4 — Start the service

```
npm start
```

Drivesoid will load the config written by the setup page and start normally. Verify it started:
```
curl http://127.0.0.1:PORT/api/drives/status
```
Replace PORT with the service port (default 3001).
Expected: JSON with `snapshot_at`, `display`, `groups` fields. If `stale: true`, wait 30 seconds and retry.

---

## Step 5 — Keep it running in the background (optional but recommended)

`npm start` runs in the foreground — closing the terminal stops Drivesoid and drives go stale. To keep it alive automatically, use pm2:

**Install pm2 (one time):**
```
npm install -g pm2
```

**Start Drivesoid with pm2 (from the install directory):**
```
cd <install-dir>
pm2 start ecosystem.config.js
```

**Make it restart automatically on reboot:**
```
pm2 save
pm2 startup
```
Run the command that `pm2 startup` prints. On Linux/macOS it looks like `sudo env PATH=...`; on Windows it generates a different command — follow whatever is printed.

**Useful commands:**
```
pm2 status          # check if running
pm2 logs drivesoid  # view logs
pm2 stop drivesoid  # stop it
pm2 restart drivesoid  # restart after config changes
```

If the user does not want to install pm2, they can leave `npm start` running in a terminal and skip this step.

---

## Step 6 — Integration

### 6a — Report events

Call these endpoints from your AI bridge so Drivesoid can track what's happening:

| When | Endpoint | Body |
|---|---|---|
| Session starts | `POST /internal/drives/session-start` | `{}` |
| User sends a message | `POST /internal/drives/event` | `{"type":"msg_user","payload":{"text":"<message>","context":[...]}}` |
| AI sends a reply | `POST /internal/drives/event` | `{"type":"msg_assistant","payload":{"message_id":"<id>"}}` |
| Quick reply detected | `POST /internal/drives/event` | `{"type":"msg_quick_reply"}` |
| User goes to sleep | `POST /internal/drives/sleep` | `{"type":"sleep_start"}` |
| User wakes up (morning) | `POST /internal/drives/sleep` | `{"type":"sleep_end"}` |
| User briefly woken mid-sleep | `POST /internal/drives/sleep` | `{"type":"sleep_interrupt"}` |

The `context` array in `msg_user` is optional but improves classification accuracy.
Format: `[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]`

### 6b — Inject drives state into AI context

The AI needs to receive its current drives state each turn so it can reflect it in its persona.

**Option A — Claude Code hook (recommended for Claude Code users)**

Copy both hooks from this repo to your workspace:
```
mkdir -p <your-workspace>/.claude/hooks
cp hooks/UserPromptSubmit.sh <your-workspace>/.claude/hooks/UserPromptSubmit.sh
cp hooks/Stop.sh             <your-workspace>/.claude/hooks/Stop.sh
chmod +x <your-workspace>/.claude/hooks/UserPromptSubmit.sh
chmod +x <your-workspace>/.claude/hooks/Stop.sh
```

Enable hooks in your Claude Code settings (`.claude/settings.json`). **Paths must be absolute.** On Windows, prefix each command with `bash `:
```json
{
  "hooks": {
    "UserPromptSubmit": [{"matcher": "", "hooks": [{"type": "command", "command": "/absolute/path/to/.claude/hooks/UserPromptSubmit.sh"}]}],
    "Stop":             [{"matcher": "", "hooks": [{"type": "command", "command": "/absolute/path/to/.claude/hooks/Stop.sh"}]}]
  }
}
```

**Requirements:** Python 3 must be installed (used by both hooks). On Windows, hooks run inside Git Bash — install it from https://git-scm.com/ if not present, and use forward-slash paths. On macOS, install Python 3 via `brew install python3` if not already present.

If the service port is not 3001 (set in Step 1b), prefix the hook command with `DRIVESOID_PORT=<port>`:
```json
"command": "DRIVESOID_PORT=3099 bash /absolute/path/to/.claude/hooks/UserPromptSubmit.sh"
```
On Windows (Git Bash):
```json
"command": "bash -c 'DRIVESOID_PORT=3099 bash /absolute/path/to/.claude/hooks/UserPromptSubmit.sh'"
```

`UserPromptSubmit` fires before each turn: it reports the user message to the classifier and injects a `[drives]` block as `additionalContext`:
```
[drives]
vitality 0.62  fatigue 0.18
longing 0.41  intimacy 0.68  possessiveness 0.33  lust 0.25
jealousy 0.10  anxiety 0.22  protectiveness 0.51  fear 0.00
contentment 0.60  elation 0.38  seeking 0.47  play 0.44
dejection 0.09  irritability 0.14
```

`Stop` fires after each completed AI turn and records the assistant response as an event.

Add the drives state block to your workspace `CLAUDE.md` so the AI persona understands what the `[drives]` block means. If the workspace already has other instructions, paste only the contents of `CLAUDE.md` from the Drivesoid install directory — do **not** replace the user's entire `CLAUDE.md`. The Drivesoid section starts with the `# Drives state` heading; on future updates, find and replace only that heading and everything under it.

**Option B — Custom bridge / middleware**

Before each Claude API call, fetch the formatted block from `GET /api/drives/context` and inject it as a system message:

```js
const ctx = await fetch('http://127.0.0.1:PORT/api/drives/context').then(r => r.text());
// empty string when state is stale — skip injection
if (ctx) messages.unshift({ role: 'system', content: ctx });
```

**Option C — OpenAI Codex CLI (≥ 0.141.0)**

Codex CLI has native lifecycle hooks. Copy the Python adapters and register them:

```
cp hooks/codex/UserPromptSubmit.py <your-codex-hooks-dir>/
cp hooks/codex/Stop.py             <your-codex-hooks-dir>/
```

Register in `~/.codex/hooks.json` — use `hooks/codex/hooks.json.example` as a template and replace the path placeholders with the absolute path to your Drivesoid install.

If the service port is not 3001, prefix each command with `DRIVESOID_PORT=<port>`:
```json
"command": "DRIVESOID_PORT=3099 python \"/path/to/drivesoid/hooks/codex/UserPromptSubmit.py\""
```

After saving, restart Codex and run `/hooks` to review and trust both commands.

The `UserPromptSubmit` adapter also handles service lifecycle: if Drivesoid is not running (e.g. after a reboot), it starts `node src/server.js` in the background automatically before the turn proceeds.

**Option D — MCP server**

For agents that use the Model Context Protocol (e.g. Claude with MCP tools configured), Drivesoid ships a stdio MCP server that wraps all endpoints as callable tools.

Start the MCP server (Drivesoid HTTP service must already be running):
```
npm run mcp
```

Tools exposed:

| Tool | Description |
|---|---|
| `drives_sleep` | Report sleep state change (`sleep_start`, `sleep_end`, `sleep_interrupt`) |
| `drives_event` | Report any drives event (`msg_user`, `msg_assistant`, `sex_end`, etc.) |
| `drives_context` | Fetch the current drives state block as plain text |

Configure in Claude Code (`.claude/settings.json` in your workspace or `~/.claude/settings.json` globally):
```json
{
  "mcpServers": {
    "drivesoid": {
      "command": "node",
      "args": ["/absolute/path/to/Drivesoid/src/mcp-server.js"],
      "env": { "DRIVESOID_PORT": "3001" }
    }
  }
}
```

Replace `/absolute/path/to/Drivesoid` with the actual install path. If the service port is not 3001, update `DRIVESOID_PORT` to match.

The AI agent is then responsible for calling `drives_sleep` with the appropriate type when sleep state changes, and `drives_event` to report conversation events. The `drives_context` tool can be called at the start of a session to read current state.

---

## Step 7 — Done

Tell the user:

> "Drivesoid is running. I can now track my emotional state across our conversations.
>
> You can view my emotional state and tune parameters anytime at:
> **http://127.0.0.1:PORT/dashboard**
> (replace PORT with the port number, default 3001)"

---

## Updating an existing installation

```
cd <install-dir>
git pull
npm install          # only needed if package.json changed; safe to run every time
pm2 restart drivesoid   # or: stop the process and run npm start again
```

**What git pull does and does not touch:**

| File | Touched by git pull? |
|---|---|
| `drives.config.json` (port, persona, API key env) | No — gitignored |
| `data/` (state, event log, history) | No — gitignored |
| `.env` (API key) | No — gitignored |
| Source files and docs | Yes — updated |

Port settings and all personal data are preserved automatically. If the service runs on a non-default port, ensure `DRIVESOID_PORT` is set to match in the environment where the hooks run (see Step 1b).

**State migration:** if the update adds a new dimension, the service initialises missing keys in the existing state file on the first tick. No manual intervention needed.

**CLAUDE.md in your workspace:** `git pull` does not touch your workspace — only the Drivesoid install directory. To update, find the `# Drives state` section in your workspace `CLAUDE.md` and replace it with the contents of the updated `<install-dir>/CLAUDE.md`. Do not overwrite your entire workspace `CLAUDE.md`.
