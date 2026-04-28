import { describe, expect, test } from "vitest";
import type { TimelineItem } from "../types";
import { toolCallDisplay } from "./toolDisplay";

function toolCall(overrides: Partial<Extract<TimelineItem, { kind: "tool_call" }>>) {
  return {
    kind: "tool_call",
    id: "tool-1",
    sessionId: "session-1",
    timestamp: "2026-04-28T00:00:00Z",
    status: "completed",
    toolCallId: "acp-tool-1",
    toolKind: "execute",
    title: "Run command",
    summary: "execute completed: echo hello",
    input: {},
    output: null,
    reviewArtifactIds: [],
    ...overrides
  } satisfies Extract<TimelineItem, { kind: "tool_call" }>;
}

describe("toolCallDisplay", () => {
  test("renders shell commands as ran activity", () => {
    const display = toolCallDisplay(
      toolCall({
        input: {
          kind: "execute",
          content: [{ type: "text", text: "npm run build" }]
        }
      })
    );

    expect(display.actionLabel).toBe("Ran");
    expect(display.subject).toBe("npm run build");
    expect(display.details).toContainEqual({ label: "Command", value: "npm run build" });
  });

  test("renders file reads with path subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "read_file",
        title: "Read file",
        input: { path: "frontend/src/App.tsx" }
      })
    );

    expect(display.actionLabel).toBe("Read");
    expect(display.subject).toBe("frontend/src/App.tsx");
  });

  test("renders edits with patch subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "apply_patch",
        title: "Apply patch",
        input: { path: "frontend/src/style.css" }
      })
    );

    expect(display.actionLabel).toBe("Edited");
    expect(display.subject).toBe("frontend/src/style.css");
  });

  test("renders searches with query subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "search",
        title: "Search files",
        input: { query: "MarkdownContent" }
      })
    );

    expect(display.actionLabel).toBe("Searched");
    expect(display.subject).toBe("MarkdownContent");
  });

  test("renders list operations with directory subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "list_directory",
        title: "List directory",
        input: { directory: "frontend/src" }
      })
    );

    expect(display.actionLabel).toBe("Listed");
    expect(display.subject).toBe("frontend/src");
  });

  test("renders browser operations with URL subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "browser_navigate",
        title: "Navigate browser",
        input: { url: "http://127.0.0.1:7635" }
      })
    );

    expect(display.actionLabel).toBe("Browsed");
    expect(display.subject).toBe("http://127.0.0.1:7635");
  });

  test("falls back to existing kind, title, summary, and raw payloads", () => {
    const input = { payload: { opaque: true } };
    const output = { text: "opaque output" };
    const display = toolCallDisplay(
      toolCall({
        toolKind: "custom_tool",
        title: "Do custom work",
        summary: "custom_tool completed",
        input,
        output
      })
    );

    expect(display.actionLabel).toBe("Custom tool");
    expect(display.subject).toBe("Do custom work");
    expect(display.summary).toBe("custom_tool completed");
    expect(display.outputPreview).toBe("opaque output");
    expect(display.rawInput).toBe(input);
    expect(display.rawOutput).toBe(output);
  });
});
