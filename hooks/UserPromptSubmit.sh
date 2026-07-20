#!/usr/bin/env bash
# SPDX-License-Identifier: CC-BY-NC-SA-4.0
# Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
# Drivesoid — Claude Code UserPromptSubmit hook
# Place at .claude/hooks/UserPromptSubmit.sh in your workspace.

PORT="${DRIVESOID_PORT:-3001}"
BASE="http://127.0.0.1:${PORT}"

INPUT_FILE=$(mktemp /tmp/drivesoid-hook-XXXXXX.json)
cat > "$INPUT_FILE"

curl -sf -X POST "${BASE}/internal/drives/session-start" \
     -H "Content-Type: application/json" -d '{}' >/dev/null 2>&1 &

python3 -c "
import json, sys, urllib.request, os

base = sys.argv[1]
input_file = sys.argv[2]

with open(input_file, 'rb') as f:
    inp = json.loads(f.read().decode('utf-8'))
os.unlink(input_file)

text = inp.get('prompt') or ''
transcript_path = inp.get('transcript_path') or ''

context = []
if transcript_path and os.path.isfile(transcript_path):
    try:
        msgs = []
        with open(transcript_path, 'rb') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line.decode('utf-8'))
                except Exception:
                    continue
                t = obj.get('type')
                if t == 'user':
                    content = obj.get('message', {}).get('content', '')
                    if isinstance(content, list):
                        content = ' '.join(c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text')
                    if content:
                        msgs.append({'role': 'user', 'content': str(content)})
                elif t == 'assistant':
                    content = obj.get('message', {}).get('content', '')
                    if isinstance(content, list):
                        content = ' '.join(c.get('text', '') for c in content if isinstance(c, dict) and c.get('type') == 'text')
                    if content:
                        msgs.append({'role': 'assistant', 'content': str(content)})
        budget = 600
        used = 0
        for msg in reversed(msgs):
            context.insert(0, msg)
            used += len(msg['content'])
            if used > budget:
                break
    except Exception:
        context = []

if text:
    try:
        payload = {'type': 'msg_user', 'payload': {'text': text}}
        if context:
            payload['payload']['context'] = context
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(base + '/internal/drives/event', data=body,
              headers={'Content-Type': 'application/json; charset=utf-8'}, method='POST')
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass

try:
    req = urllib.request.Request(base + '/api/drives/context')
    with urllib.request.urlopen(req, timeout=1) as r:
        block = r.read().decode('utf-8').strip()
except Exception:
    block = ''

if block:
    print(json.dumps({'continue': True, 'hookSpecificOutput': {
        'hookEventName': 'UserPromptSubmit', 'additionalContext': block}
    }))
else:
    print(json.dumps({'continue': True}))
" "$BASE" "$INPUT_FILE"
