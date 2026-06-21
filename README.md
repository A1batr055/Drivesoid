# Drivesoid

An emotional drive system for AI personas. Tracks 15 psychological dimensions (attachment, threat, reward, etc.) that evolve in real time based on conversations, sleep cycles, and calendar events.

## How it works

Drivesoid runs as a lightweight HTTP sidecar alongside your AI bridge. Your bridge reports conversation events; Drivesoid maintains an emotional state that your AI can read and incorporate into its responses.

**Dimensions tracked:** vitality, fatigue, longing, intimacy, possessiveness, lust, jealousy, anxiety, protectiveness, contentment, elation, seeking, play, dejection, irritability

## Quick start

**For AI agents:** Read [AGENT_SETUP.md](AGENT_SETUP.md) — it tells you exactly what to install, what to ask the user, and how to integrate.

**For humans:** Run the setup wizard:
```
npm run setup
```
Then start:
```
npm start
```

## Requirements

- Node.js ≥ 18
- Python 3 (for `npm run health` only)
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
| `classifier.model` | Model name (default: `deepseek-v4-flash`) |
| `classifier.api_key_env` | Env var name holding the API key |
| `server.port` | Port to listen on (default: `3001`) |

Set your API key in `.env`:
```
DRIVES_API_KEY=sk-...
```

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/drives/status` | GET | Current emotional state |
| `/internal/drives/event` | POST | Ingest a conversation event |
| `/internal/drives/session-start` | POST | Catch-up tick at session start |
| `/internal/drives/sleep` | POST | Sleep start/end events |

Internal endpoints accept loopback connections only (127.0.0.1).

## Health monitoring

```
npm run health          # last 7 days
python3 scripts/drives_health.py 30  # last 30 days
```

## License

MIT
