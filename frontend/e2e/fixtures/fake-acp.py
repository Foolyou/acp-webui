#!/usr/bin/env python3
import json
import sys

session_id = "fake-e2e-session"


def send(message):
    print(json.dumps(message), flush=True)


for line in sys.stdin:
    if not line.strip():
        continue

    message = json.loads(line)
    method = message.get("method")
    request_id = message.get("id")

    if method == "initialize":
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "agentInfo": {
                        "name": "fake-codex-acp",
                        "title": "Fake Codex",
                        "version": "0.0.0-e2e",
                    }
                },
            }
        )
    elif method == "session/new":
        session_id = "fake-e2e-session"
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"sessionId": session_id},
            }
        )
    elif method == "session/prompt":
        prompt_session_id = message.get("params", {}).get("sessionId", session_id)
        send(
            {
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": prompt_session_id,
                    "update": {
                        "sessionUpdate": "agent_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "ACP Web UI smoke test OK",
                        },
                    },
                },
            }
        )
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"stopReason": "end_turn"},
            }
        )
    elif request_id is not None:
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Unsupported method: {method}"},
            }
        )
