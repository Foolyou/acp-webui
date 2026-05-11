package main

import "testing"

func TestMCPListsDisplayImageTool(t *testing.T) {
	response := handleMCPMessage(map[string]any{"jsonrpc": "2.0", "id": float64(1), "method": "tools/list"}).(map[string]any)
	result := response["result"].(map[string]any)
	tools := result["tools"].([]any)
	tool := tools[0].(map[string]any)
	if tool["name"] != "display_image" {
		t.Fatalf("tool name = %v", tool["name"])
	}
}

func TestMCPDisplayImageRequiresPath(t *testing.T) {
	response := handleMCPMessage(map[string]any{
		"jsonrpc": "2.0",
		"id":      float64(1),
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "display_image",
			"arguments": map[string]any{},
		},
	}).(map[string]any)
	result := response["result"].(map[string]any)
	if result["isError"] != true {
		t.Fatalf("isError = %v", result["isError"])
	}
}

func TestMCPDisplayImageReturnsStructuredPath(t *testing.T) {
	response := handleMCPMessage(map[string]any{
		"jsonrpc": "2.0",
		"id":      float64(1),
		"method":  "tools/call",
		"params": map[string]any{
			"name": "display_image",
			"arguments": map[string]any{
				"path": "prototype/screenshots/overview.png",
			},
		},
	}).(map[string]any)
	result := response["result"].(map[string]any)
	structured := result["structuredContent"].(map[string]any)
	if structured["path"] != "prototype/screenshots/overview.png" {
		t.Fatalf("path = %v", structured["path"])
	}
}
