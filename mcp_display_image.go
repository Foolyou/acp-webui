package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

const mcpProtocolVersion = "2025-06-18"

const displayImageDescription = "Display a workspace-contained image inline in ACP Web UI. Use this after creating, editing, finding, capturing, or referencing an image file that the user should inspect. Prefer this tool over only telling the user the image path."

func runMCPDisplayImage(input io.Reader, output io.Writer) error {
	scanner := bufio.NewScanner(input)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var message map[string]any
		var response any
		if err := json.Unmarshal([]byte(line), &message); err != nil {
			response = mcpError(nil, -32700, err.Error())
		} else {
			response = handleMCPMessage(message)
		}
		if response == nil {
			continue
		}
		data, _ := json.Marshal(response)
		if _, err := output.Write(append(data, '\n')); err != nil {
			return err
		}
	}
	return scanner.Err()
}

func handleMCPMessage(message map[string]any) any {
	method, _ := message["method"].(string)
	id, hasID := message["id"]
	if !hasID {
		return nil
	}
	switch {
	case method == "initialize":
		version := mcpProtocolVersion
		if params, ok := message["params"].(map[string]any); ok {
			if requested, ok := params["protocolVersion"].(string); ok && requested != "" {
				version = requested
			}
		}
		return mcpSuccess(id, map[string]any{
			"protocolVersion": version,
			"serverInfo":      map[string]any{"name": "acp-webui-display-image", "version": "0.1.0"},
			"capabilities":    map[string]any{"tools": map[string]any{}},
		})
	case method == "tools/list":
		return mcpSuccess(id, map[string]any{"tools": []any{map[string]any{
			"name":        "display_image",
			"description": displayImageDescription,
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path":    map[string]any{"type": "string", "description": "Workspace-relative or workspace-contained image path to display inline."},
					"title":   map[string]any{"type": "string", "description": "Optional concise image title."},
					"caption": map[string]any{"type": "string", "description": "Optional short caption for the user."},
				},
				"required":             []string{"path"},
				"additionalProperties": false,
			},
		}}})
	case method == "tools/call":
		return mcpToolCall(id, message)
	case method == "ping":
		return mcpSuccess(id, map[string]any{})
	case strings.HasPrefix(method, "notifications/"):
		return nil
	default:
		return mcpError(id, -32601, fmt.Sprintf("Unsupported MCP method `%s`", method))
	}
}

func mcpToolCall(id any, message map[string]any) any {
	params, _ := message["params"].(map[string]any)
	name, _ := params["name"].(string)
	if name != "display_image" {
		return mcpSuccess(id, map[string]any{
			"content": []any{map[string]any{"type": "text", "text": fmt.Sprintf("Unknown tool `%s`", name)}},
			"isError": true,
		})
	}
	args, _ := params["arguments"].(map[string]any)
	path, _ := args["path"].(string)
	path = strings.TrimSpace(path)
	if path == "" {
		return mcpSuccess(id, map[string]any{
			"content": []any{map[string]any{"type": "text", "text": "display_image requires a non-empty path argument."}},
			"isError": true,
		})
	}
	return mcpSuccess(id, map[string]any{
		"content": []any{map[string]any{"type": "text", "text": fmt.Sprintf("display_image requested inline display for image `%s`.", path)}},
		"structuredContent": map[string]any{
			"path":    path,
			"title":   args["title"],
			"caption": args["caption"],
		},
	})
}

func mcpSuccess(id any, result any) map[string]any {
	return map[string]any{"jsonrpc": "2.0", "id": id, "result": result}
}

func mcpError(id any, code int, message string) map[string]any {
	return map[string]any{"jsonrpc": "2.0", "id": id, "error": map[string]any{"code": code, "message": message}}
}
