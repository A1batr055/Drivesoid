# SPDX-License-Identifier: CC-BY-NC-SA-4.0
# Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

PORT = os.environ.get("DRIVESOID_PORT", "3001")
BASE_URL = f"http://127.0.0.1:{PORT}"
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOG_DIR = os.path.join(REPO_ROOT, "logs")
CONTEXT_CHAR_BUDGET = 600


def request(path, *, payload=None, timeout=8):
    data = None
    headers = {}
    method = "GET"
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
        method = "POST"
    req = urllib.request.Request(
        BASE_URL + path, data=data, headers=headers, method=method
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8")


def ensure_service():
    try:
        request("/api/drives/status", timeout=1)
        return
    except Exception:
        pass

    node = shutil.which("node")
    if not node:
        return

    os.makedirs(LOG_DIR, exist_ok=True)
    stdout = open(os.path.join(LOG_DIR, "drivesoid.stdout.log"), "a", encoding="utf-8")
    stderr = open(os.path.join(LOG_DIR, "drivesoid.stderr.log"), "a", encoding="utf-8")
    try:
        flags = 0
        if os.name == "nt":
            flags = (
                subprocess.CREATE_NO_WINDOW
                | subprocess.DETACHED_PROCESS
                | subprocess.CREATE_NEW_PROCESS_GROUP
            )
        subprocess.Popen(
            [node, "src/server.js"],
            cwd=REPO_ROOT,
            stdin=subprocess.DEVNULL,
            stdout=stdout,
            stderr=stderr,
            creationflags=flags,
            start_new_session=(os.name != "nt"),
        )
    finally:
        stdout.close()
        stderr.close()

    for _ in range(10):
        time.sleep(0.3)
        try:
            request("/api/drives/status", timeout=1)
            return
        except Exception:
            pass


def extract_context(transcript_path, current_prompt):
    if not transcript_path or not os.path.isfile(transcript_path):
        return []

    messages = []
    try:
        with open(transcript_path, "rb") as f:
            for raw in f:
                try:
                    row = json.loads(raw.decode("utf-8"))
                except Exception:
                    continue
                if row.get("type") != "event_msg":
                    continue
                payload = row.get("payload") or {}
                event_type = payload.get("type")
                content = payload.get("message")
                if not isinstance(content, str) or not content.strip():
                    continue
                if event_type == "user_message":
                    messages.append({"role": "user", "content": content.strip()})
                elif event_type == "agent_message" and payload.get("phase") == "final_answer":
                    messages.append({"role": "assistant", "content": content.strip()})
    except Exception:
        return []

    # Codex writes the current prompt to the rollout before this hook runs — exclude it.
    if messages and messages[-1]["role"] == "user" and messages[-1]["content"] == current_prompt:
        messages.pop()

    selected = []
    used = 0
    for msg in reversed(messages):
        selected.append(msg)
        used += len(msg["content"])
        if used > CONTEXT_CHAR_BUDGET:
            break
    selected.reverse()
    return selected


def main():
    try:
        hook_input = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        hook_input = {}

    prompt = str(hook_input.get("prompt") or "").strip()
    context = extract_context(hook_input.get("transcript_path"), prompt)

    drives_context = ""
    try:
        ensure_service()
        if prompt:
            event_payload = {"text": prompt}
            if context:
                event_payload["context"] = context
            request("/internal/drives/event", payload={"type": "msg_user", "payload": event_payload}, timeout=3)
            request("/internal/drives/session-start", payload={}, timeout=12)
        drives_context = request("/api/drives/context", timeout=2).strip()
    except Exception:
        pass

    output = {"continue": True}
    if drives_context:
        output["hookSpecificOutput"] = {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": drives_context,
        }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
