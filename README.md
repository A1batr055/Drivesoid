# Drivesoid

[中文说明](README.zh.md)

An emotional drive system for AI personas. Tracks 15 psychological dimensions (attachment, threat, reward, etc.) that evolve in real time based on conversations, sleep cycles, and calendar events.

## How it works

Drivesoid runs as a lightweight HTTP sidecar alongside your AI bridge. Your bridge reports conversation events; Drivesoid maintains an emotional state that your AI can read and incorporate into its responses.

**Dimensions tracked:** vitality, fatigue, longing, intimacy, possessiveness, lust, jealousy, anxiety, protectiveness, fear, contentment, elation, seeking, play, dejection, irritability

## Quick start

**For AI agents:** Read [AGENT_SETUP.md](AGENT_SETUP.md) — it tells you exactly what to install, what to ask the user, and how to integrate.

**For humans:** Start the service — setup runs automatically on first launch:
```
npm start
```
Then open **http://127.0.0.1:3001/setup** in your browser and fill in the form.

## Requirements

- Node.js ≥ 18
- Python 3 (for Claude Code hooks)
- An OpenAI-compatible API key (DeepSeek recommended: `deepseek-v4-flash`)

## Configuration

Copy `drives.config.example.json` → `drives.config.json` and fill in:

| Field | Description |
|---|---|
| `persona.name` | Your AI's name |
| `user.name` | Your name |
| `relation` | `romantic` / `companion` / `friend` |
| `timezone_offset_hours` | Local timezone offset (e.g. `8` for UTC+8) |
| `classifier.endpoint` | API base URL |
| `classifier.model` | Model name (required, e.g. `deepseek-v4-flash` or `gpt-4o-mini`) |
| `classifier.api_key_env` | Env var name holding the API key |
| `server.port` | Port to listen on (default: `3001`) |

Set your API key in `.env`:
```
DRIVES_API_KEY=sk-...
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/drives/status` | GET | Current emotional state (JSON) |
| `/api/drives/context` | GET | Pre-formatted `[drives]` block for system prompt injection (plain text; empty when stale) |
| `/dashboard` | GET | Live dashboard — view state, tune parameters |
| `/internal/drives/event` | POST | Ingest a conversation event |
| `/internal/drives/session-start` | POST | Catch-up tick at session start |
| `/internal/drives/sleep` | POST | Sleep start/end events |

`/internal/*` accepts loopback connections only (127.0.0.1). `/api/*` is unrestricted.

## Classifier labels

Each user message is classified into one of these labels, which drive dimension changes:

| Label | When it applies |
|---|---|
| `affectionate` | warm, loving, expressing care |
| `playful` | teasing, joking, playful banter |
| `vulnerable` | expressing vulnerability or emotional fragility |
| `reassuring` | comforting, affirming, offering support |
| `intimate_reference` | referencing physical intimacy or the body |
| `intimate_event` | actively engaged in an intimate interaction |
| `struggling` | stress, exhaustion, feeling unable to cope |
| `cold` | emotionally withdrawn, detached, terse |
| `distant` | distracted, disengaged, doesn't want to talk |
| `conflict` | genuine mutual argument, emotional escalation |
| `hostile` | one-sided attack or harsh words |
| `fear_separation` | fear of the other person leaving or being absent |
| `fear_death` | fear of death, suicide, or life-threatening situations |
| `fear_concern` | worrying about something bad happening to the other person |
| `fear_general` | other fears not covered above |
| `neutral` | ordinary response, no notable emotional tone |

## Reset

Wipe config and data to start fresh:
```
npm run reset
npm start
```

## License

MIT
