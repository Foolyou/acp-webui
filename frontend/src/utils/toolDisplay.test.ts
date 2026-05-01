import { describe, expect, test } from "vitest";
import type { ReviewArtifactSummary, TimelineItem } from "../types";
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

function artifact(overrides: Partial<ReviewArtifactSummary>) {
  return {
    id: "artifact-1",
    sessionId: "session-1",
    toolCallId: "acp-tool-1",
    kind: "diff",
    title: "Workspace diff",
    summary: "Diff evidence",
    source: "fixture",
    createdAt: "2026-04-28T00:00:00Z",
    ...overrides
  } satisfies ReviewArtifactSummary;
}

describe("toolCallDisplay", () => {
  test("renders shell commands as command activity", () => {
    const display = toolCallDisplay(
      toolCall({
        input: {
          kind: "execute",
          content: [{ type: "text", text: "npm run build" }]
        }
      })
    );

    expect(display.kind).toBe("command");
    expect(display.actionLabel).toBe("Ran");
    expect(display.subject).toBe("npm run build");
    expect(display.metadata).toContainEqual({ label: "Command", value: "npm run build" });
    expect(display.detailText).toContain("Ran npm run build");
    expect(display.detailText).not.toContain("{");
  });

  test("extracts command activity from nested sparse ACP content", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "unknown",
        title: "Tool call",
        summary: "tool_call_update completed",
        input: {
          sessionUpdate: "tool_call_update",
          toolCall: {
            content: [
              {
                type: "text",
                text: "```powershell\nnpm test\nnpm run build\n```"
              }
            ]
          }
        }
      })
    );

    expect(display.kind).toBe("command");
    expect(display.subject).toBe("npm test && npm run build");
    expect(display.metadata).toContainEqual({ label: "Command", value: "npm test && npm run build" });
  });

  test("renders sparse ACP raw output as command output instead of unknown wrapper text", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "unknown",
        title: "Tool call",
        summary: "tool_call_update completed",
        input: {
          rawOutput: "Exit code: 0\nWall time: 0.4 seconds\nOutput:\nREADME.md\nsrc/main.rs",
          sessionUpdate: "tool_call_update",
          status: "completed",
          toolCallId: "call-1"
        },
        reviewArtifactIds: ["artifact-1"]
      }),
      [artifact({ id: "artifact-1", kind: "tool_call", title: "Tool call" })]
    );

    expect(display.kind).toBe("command");
    expect(display.actionLabel).toBe("Ran");
    expect(display.subject).toBe("command");
    expect(display.result).toBe("Exit code: 0, Wall time: 0.4 seconds");
    expect(display.metadata).not.toContainEqual({ label: "Tool", value: "unknown" });
    expect(display.detailText).toContain("Output:\nExit code: 0\nWall time: 0.4 seconds\nOutput:\nREADME.md\nsrc/main.rs");
    expect(display.detailText).not.toContain("tool_call_update completed");
    expect(display.detailText).not.toContain("Evidence: Tool call");
  });

  test("renders file reads with path subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "read_file",
        title: "Read file",
        input: { path: "frontend/src/App.tsx" }
      })
    );

    expect(display.kind).toBe("file_read");
    expect(display.actionLabel).toBe("Read");
    expect(display.subject).toBe("frontend/src/App.tsx");
  });

  test("renders edits with file change subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "apply_patch",
        title: "Apply patch",
        input: { path: "frontend/src/style.css" }
      })
    );

    expect(display.kind).toBe("file_change");
    expect(display.actionLabel).toBe("Changed");
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

    expect(display.kind).toBe("search");
    expect(display.actionLabel).toBe("Searched");
    expect(display.subject).toBe("MarkdownContent");
  });

  test("renders browser operations with URL subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "browser_navigate",
        title: "Navigate browser",
        input: { url: "https://example.test/session" }
      })
    );

    expect(display.kind).toBe("browser");
    expect(display.actionLabel).toBe("Browsed");
    expect(display.subject).toBe("https://example.test/session");
  });

  test("renders MCP operations with server and tool subjects", () => {
    const display = toolCallDisplay(
      toolCall({
        toolKind: "mcp_tool_call",
        title: "Call GitHub",
        input: { server: "github", tool: "fetch_pr" }
      })
    );

    expect(display.kind).toBe("mcp");
    expect(display.actionLabel).toBe("Called");
    expect(display.subject).toBe("github / fetch_pr");
    expect(display.metadata).toContainEqual({ label: "Server", value: "github" });
  });

  test("renders failed command output tails", () => {
    const display = toolCallDisplay(
      toolCall({
        status: "failed",
        summary: "Command failed",
        input: { command: "npm test" },
        output: { stderr: "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7" }
      })
    );

    expect(display.kind).toBe("command");
    expect(display.statusLabel).toBe("failed");
    expect(display.outputTail).toBe("line 2\nline 3\nline 4\nline 5\nline 6\nline 7");
    expect(display.detailText).toContain("Output:\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7");
  });

  test("summarizes linked non-image review artifacts in detail text", () => {
    const display = toolCallDisplay(
      toolCall({ reviewArtifactIds: ["artifact-1", "artifact-2"] }),
      [artifact({ id: "artifact-1", kind: "diff" }), artifact({ id: "artifact-2", kind: "markdown" })]
    );

    expect(display.detailText).toContain("Evidence: Workspace diff");
  });

  test("omits linked image artifacts from ordinary tool detail text", () => {
    const display = toolCallDisplay(
      toolCall({ reviewArtifactIds: ["artifact-1"] }),
      [artifact({ id: "artifact-1", kind: "image", title: "Preview" })]
    );

    expect(display.detailText).not.toContain("Preview");
  });

  test("falls back to generic activity with readable detail text", () => {
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

    expect(display.kind).toBe("generic");
    expect(display.actionLabel).toBe("Custom tool");
    expect(display.subject).toBe("Do custom work");
    expect(display.result).toBe("custom_tool completed");
    expect(display.outputTail).toBe("opaque output");
    expect(display.detailText).toContain("Custom tool Do custom work");
    expect(display.detailText).toContain("Output:\nopaque output");
    expect(display.detailText).not.toContain(JSON.stringify(input));
  });
});
