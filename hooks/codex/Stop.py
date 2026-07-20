# SPDX-License-Identifier: CC-BY-NC-SA-4.0
# Copyright (c) 2026 A1batr055 - https://github.com/A1batr055/Drivesoid
import json
import os
import sys
import urllib.request

PORT = os.environ.get("DRIVESOID_PORT", "3001")
BASE_URL = f"http://127.0.0.1:{PORT}"


def main():
    try:
        hook_input = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except Exception:
        hook_input = {}

    message = str(hook_input.get("last_assistant_message") or "").strip()
    if message:
        payload = {
            "type": "msg_assistant",
            "payload": {
                "message_id": hook_input.get("turn_id"),
                "text": message,
            },
        }
        try:
            req = urllib.request.Request(
                BASE_URL + "/internal/drives/event",
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=3):
                pass
        except Exception:
            pass

    print(json.dumps({"continue": True}))


if __name__ == "__main__":
    main()
