#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///

import json
import sys
import time

session_id = "fake-e2e-session"
current_model = "fast"


def send(message):
    print(json.dumps(message), flush=True)


def config_options():
    return [
        {
            "id": "model",
            "name": "Model",
            "category": "model",
            "type": "select",
            "currentValue": current_model,
            "options": [
                {
                    "value": "fast",
                    "name": "Fast model",
                    "description": "Lower latency",
                },
                {
                    "value": "pro",
                    "name": "Pro model",
                    "description": "Higher capability",
                },
            ],
        }
    ]


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
                    },
                    "agentCapabilities": {
                        "loadSession": True,
                        "sessionCapabilities": {
                            "list": {},
                            "resume": False,
                        },
                    },
                },
            }
        )
    elif method == "session/new":
        session_id = "fake-e2e-session"
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"sessionId": session_id, "configOptions": config_options()},
            }
        )
    elif method == "session/load":
        load_session_id = message.get("params", {}).get("sessionId")
        if load_session_id != "fake-e2e-session":
            send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {
                        "code": -32004,
                        "message": "session not found",
                    },
                }
            )
            continue
        send(
            {
                "jsonrpc": "2.0",
                "method": "session/update",
                "params": {
                    "sessionId": load_session_id,
                    "update": {
                        "sessionUpdate": "user_message_chunk",
                        "content": {
                            "type": "text",
                            "text": "Reply with the smoke phrase.",
                        },
                    },
                },
            }
        )
        for text in ["ACP", " Web", " UI", " smoke", " test", " OK"]:
            send(
                {
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "sessionId": load_session_id,
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
                "method": "session/update",
                "params": {
                    "sessionId": load_session_id,
                    "update": {
                        "sessionUpdate": "tool_call",
                        "toolCallId": "tool-load-long",
                        "title": "Loaded compact replay payload",
                        "kind": "execute",
                        "status": "completed",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "RecoveredHistoryWithoutSpaces"
                                    "RecoveredHistoryWithoutSpaces"
                                    "RecoveredHistoryWithoutSpaces"
                                    "RecoveredHistoryWithoutSpaces"
                                ),
                            }
                        ],
                    },
                },
            }
        )
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "sessionId": load_session_id,
                    "configOptions": config_options(),
                },
            }
        )
    elif method == "session/set_config_option":
        config_id = message.get("params", {}).get("configId")
        value = message.get("params", {}).get("value")
        if config_id != "model" or value not in ["fast", "pro"]:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32602, "message": "invalid config option"},
                }
            )
            continue
        current_model = value
        send(
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {"configOptions": config_options()},
            }
        )
    elif method == "session/cancel":
        send({"jsonrpc": "2.0", "id": request_id, "result": {}})
    elif method == "session/prompt":
        prompt_session_id = message.get("params", {}).get("sessionId", session_id)
        prompt_text = " ".join(
            part.get("text", "")
            for part in message.get("params", {}).get("prompt", [])
            if isinstance(part, dict)
        )
        if "scroll stream" in prompt_text.lower():
            if "manual bottom" in prompt_text.lower():
                label = "Manual bottom stream"
            elif "paused" in prompt_text.lower():
                label = "Paused stream"
            else:
                label = "Following stream"
            for index in range(1, 41):
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
                                    "text": f"{label} line {index:02d}: streaming scroll content.\n",
                                },
                            },
                        },
                    }
                )
                time.sleep(0.01)
            send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "result": {"stopReason": "end_turn"},
                }
            )
            continue
        if "scroll history" in prompt_text.lower():
            text = "\n".join(
                f"Scroll history line {index:02d}: restored timeline overflow content."
                for index in range(1, 81)
            )
        elif "queued approval" in prompt_text.lower():
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
        elif "wrapping response" in prompt_text.lower():
            quoted_text = "QuotedContentWithoutSpaces" * 14
            quoted_code = "QuotedCodeWithoutSpaces" * 10
            long_code = "PlainPreContentWithoutSpaces" * 18
            text = f"Plain pre wrapping:\n\n```txt\n{long_code}\n```\n\n> {quoted_text}\n>\n> ```txt\n> {quoted_code}\n> ```"
        elif "malformed fence response" in prompt_text.lower():
            text = "Fence check:\n\n```text\nfirst block\n```Next paragraph\n\n```json\n{\"ok\":true}\n```More text\n\n```textGET session detail\n  -> done\n```Final paragraph"
        elif "agent model update" in prompt_text.lower():
            current_model = "pro"
            send(
                {
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "sessionId": prompt_session_id,
                        "update": {
                            "sessionUpdate": "config_option_update",
                            "configOptions": config_options(),
                        },
                    },
                }
            )
            text = "Agent updated the model"
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
