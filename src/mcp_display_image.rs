use std::io::{self, BufRead, Write};

use anyhow::Context;
use serde_json::{json, Value};

const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
const DISPLAY_IMAGE_DESCRIPTION: &str = "Display a workspace-contained image inline in ACP Web UI. Use this after creating, editing, finding, capturing, or referencing an image file that the user should inspect. Prefer this tool over only telling the user the image path.";

pub fn run_stdio() -> anyhow::Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = line.context("failed to read MCP message")?;
        if line.trim().is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<Value>(&line) {
            Ok(message) => handle_message(&message),
            Err(error) => Some(error_response(Value::Null, -32700, error.to_string())),
        };

        if let Some(response) = response {
            serde_json::to_writer(&mut stdout, &response)?;
            stdout.write_all(b"\n")?;
            stdout.flush()?;
        }
    }

    Ok(())
}

fn handle_message(message: &Value) -> Option<Value> {
    let method = message.get("method").and_then(Value::as_str)?;
    let id = message.get("id").cloned();

    match method {
        "initialize" => id.map(|id| initialize_response(id, message)),
        "tools/list" => id.map(tools_list_response),
        "tools/call" => id.map(|id| tools_call_response(id, message)),
        "ping" => id.map(|id| success_response(id, json!({}))),
        method if method.starts_with("notifications/") => None,
        _ => id.map(|id| error_response(id, -32601, format!("Unsupported MCP method `{method}`"))),
    }
}

fn initialize_response(id: Value, message: &Value) -> Value {
    let requested_version = message
        .get("params")
        .and_then(|params| params.get("protocolVersion"))
        .and_then(Value::as_str)
        .unwrap_or(MCP_PROTOCOL_VERSION);

    success_response(
        id,
        json!({
            "protocolVersion": requested_version,
            "serverInfo": {
                "name": "acp-webui-display-image",
                "version": env!("CARGO_PKG_VERSION")
            },
            "capabilities": {
                "tools": {}
            }
        }),
    )
}

fn tools_list_response(id: Value) -> Value {
    success_response(
        id,
        json!({
            "tools": [
                {
                    "name": "display_image",
                    "description": DISPLAY_IMAGE_DESCRIPTION,
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "path": {
                                "type": "string",
                                "description": "Workspace-relative or workspace-contained image path to display inline."
                            },
                            "title": {
                                "type": "string",
                                "description": "Optional concise image title."
                            },
                            "caption": {
                                "type": "string",
                                "description": "Optional short caption for the user."
                            }
                        },
                        "required": ["path"],
                        "additionalProperties": false
                    }
                }
            ]
        }),
    )
}

fn tools_call_response(id: Value, message: &Value) -> Value {
    let params = message.get("params").unwrap_or(&Value::Null);
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if name != "display_image" {
        return success_response(
            id,
            json!({
                "content": [
                    {
                        "type": "text",
                        "text": format!("Unknown tool `{name}`")
                    }
                ],
                "isError": true
            }),
        );
    }

    let arguments = params.get("arguments").unwrap_or(&Value::Null);
    let Some(path) = arguments
        .get("path")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|path| !path.is_empty())
    else {
        return success_response(
            id,
            json!({
                "content": [
                    {
                        "type": "text",
                        "text": "display_image requires a non-empty path argument."
                    }
                ],
                "isError": true
            }),
        );
    };

    success_response(
        id,
        json!({
            "content": [
                {
                    "type": "text",
                    "text": format!("display_image requested inline display for image `{path}`.")
                }
            ],
            "structuredContent": {
                "path": path,
                "title": arguments.get("title").and_then(Value::as_str),
                "caption": arguments.get("caption").and_then(Value::as_str)
            }
        }),
    )
}

fn success_response(id: Value, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    })
}

fn error_response(id: Value, code: i64, message: String) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_display_image_tool() {
        let response = handle_message(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list"
        }))
        .unwrap();

        assert_eq!(
            response["result"]["tools"][0]["name"],
            Value::String("display_image".to_string())
        );
    }

    #[test]
    fn display_image_tool_requires_path() {
        let response = handle_message(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "display_image",
                "arguments": {}
            }
        }))
        .unwrap();

        assert_eq!(response["result"]["isError"], Value::Bool(true));
    }

    #[test]
    fn display_image_tool_returns_structured_path() {
        let response = handle_message(&json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "display_image",
                "arguments": {
                    "path": "prototype/screenshots/overview.png"
                }
            }
        }))
        .unwrap();

        assert_eq!(
            response["result"]["structuredContent"]["path"],
            Value::String("prototype/screenshots/overview.png".to_string())
        );
    }
}
