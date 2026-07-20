#!/usr/bin/env bash
# SPDX-License-Identifier: CC-BY-NC-SA-4.0
# Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
# Drivesoid — Claude Code Stop hook
# Place at .claude/hooks/Stop.sh in your workspace.
# Reports the assistant's completed turn as a msg_assistant event.

PORT="${DRIVESOID_PORT:-3001}"
BASE="http://127.0.0.1:${PORT}"

INPUT_FILE=$(mktemp /tmp/drivesoid-stop-XXXXXX.json)
cat > "$INPUT_FILE"

HAS_MSG=$(python3 -c "
import json, sys, os

input_file = sys.argv[1]
try:
    with open(input_file, 'rb') as f:
        inp = json.loads(f.read().decode('utf-8'))
    os.unlink(input_file)
except Exception:
    sys.exit(0)

transcript_path = inp.get('transcript_path') or ''
if not transcript_path or not os.path.isfile(transcript_path):
    sys.exit(0)

try:
    with open(transcript_path, 'rb') as f:
        lines = [l for l in f.read().splitlines() if l.strip()]
    for raw in reversed(lines):
        try: obj = json.loads(raw.decode('utf-8'))
        except Exception: continue
        t = obj.get('type')
        if t == 'user':
            content = obj.get('message', {}).get('content', [])
            if not any(isinstance(c, dict) and c.get('type') == 'tool_result' for c in content):
                break
        if t == 'assistant':
            for c in obj.get('message', {}).get('content', []):
                if isinstance(c, dict) and c.get('type') == 'text' and c.get('text'):
                    print('yes')
                    break
            break
except Exception:
    pass
" "$INPUT_FILE" 2>/dev/null)

[ -z "$HAS_MSG" ] && exit 0

curl -sf -X POST "${BASE}/internal/drives/event" \
     -H "Content-Type: application/json" \
     -d '{"type":"msg_assistant","payload":{}}' >/dev/null 2>&1

exit 0
