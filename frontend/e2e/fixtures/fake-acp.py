#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///

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
        prompt_text = " ".join(
            part.get("text", "")
            for part in message.get("params", {}).get("prompt", [])
            if isinstance(part, dict)
        )
        if "queued approval" in prompt_text.lower():
            send(
                {
                    "jsonrpc": "2.0",
                    "id": "permission-e2e-1",
                    "method": "session/request_permission",
                    "params": {
                        "sessionId": prompt_session_id,
                        "toolCall": {
                            "toolCallId": "tool-e2e-1",
                            "title": "Run first queued command",
                            "kind": "execute",
                            "content": [
                                {"type": "text", "text": "echo first queued"}
                            ],
                        },
                        "options": [
                            {
                                "optionId": "allow-once",
                                "name": "Allow once",
                                "kind": "allow_once",
                            },
                            {
                                "optionId": "reject-once",
                                "name": "Reject",
                                "kind": "reject_once",
                            },
                        ],
                    },
                }
            )
            send(
                {
                    "jsonrpc": "2.0",
                    "id": "permission-e2e-2",
                    "method": "session/request_permission",
                    "params": {
                        "sessionId": prompt_session_id,
                        "toolCall": {
                            "toolCallId": "tool-e2e-2",
                            "title": "Run second queued command",
                            "kind": "execute",
                            "content": [
                                {"type": "text", "text": "echo second queued"}
                            ],
                        },
                        "options": [
                            {
                                "optionId": "allow-once",
                                "name": "Allow once",
                                "kind": "allow_once",
                            },
                            {
                                "optionId": "reject-once",
                                "name": "Reject",
                                "kind": "reject_once",
                            },
                        ],
                    },
                }
            )
            first_response = json.loads(sys.stdin.readline())
            second_response = json.loads(sys.stdin.readline())
            first_option_id = (
                first_response.get("result", {})
                .get("outcome", {})
                .get("optionId", "cancelled")
            )
            second_option_id = (
                second_response.get("result", {})
                .get("outcome", {})
                .get("optionId", "cancelled")
            )
            text = f"Queued approvals: {first_option_id}, {second_option_id}"
        elif "approval" in prompt_text.lower():
            send(
                {
                    "jsonrpc": "2.0",
                    "id": "permission-e2e",
                    "method": "session/request_permission",
                    "params": {
                        "sessionId": prompt_session_id,
                        "toolCall": {
                            "toolCallId": "tool-e2e",
                            "title": "Run approval smoke command",
                            "kind": "execute",
                            "content": [
                                {"type": "text", "text": "echo approval smoke"}
                            ],
                        },
                        "options": [
                            {
                                "optionId": "allow-once",
                                "name": "Allow once",
                                "kind": "allow_once",
                            },
                            {
                                "optionId": "reject-once",
                                "name": "Reject",
                                "kind": "reject_once",
                            },
                            {
                                "optionId": "allow-always",
                                "name": "Allow always",
                                "kind": "allow_always",
                            },
                        ],
                    },
                }
            )
            permission_response = json.loads(sys.stdin.readline())
            option_id = (
                permission_response.get("result", {})
                .get("outcome", {})
                .get("optionId", "cancelled")
            )
            text = f"Approval result: {option_id}"
        elif "markdown artifact" in prompt_text.lower():
            send(
                {
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "sessionId": prompt_session_id,
                        "update": {
                            "sessionUpdate": "tool_call",
                            "toolCallId": "tool-markdown",
                            "title": "Render Markdown evidence",
                            "kind": "markdown",
                            "status": "completed",
                            "markdown": "# Markdown Evidence\n\n- artifact list item\n\n```ts\nconst artifact = true;\n```\n\n<script>window.__bad = true</script>",
                        },
                    },
                }
            )
            text = "Markdown artifact emitted"
        elif "review" in prompt_text.lower():
            send(
                {
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "sessionId": prompt_session_id,
                        "update": {
                            "sessionUpdate": "tool_call",
                            "toolCallId": "tool-review",
                            "title": "Inspect review evidence",
                            "kind": "execute",
                            "status": "completed",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "git diff -- README.md",
                                }
                            ],
                        },
                    },
                }
            )
            text = "Review artifact emitted"
        elif "markdown response" in prompt_text.lower():
            text = "# Markdown response\n\n- rendered list item\n\n`inline code`\n\n```ts\nconst value = 1;\n```\n\n<script>bad()</script>"
        else:
            text = "ACP Web UI smoke test OK"
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
                            "text": text,
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
