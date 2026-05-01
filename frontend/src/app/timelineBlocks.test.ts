import { describe, expect, test } from "vitest";
import type { ReviewArtifactSummary, TimelineItem } from "../types";
import { buildTimelineBlocks } from "./timelineBlocks";

function toolCall(overrides: Partial<Extract<TimelineItem, { kind: "tool_call" }>>) {
  return {
    kind: "tool_call",
    id: "tool-1",
    sessionId: "session-1",
    timestamp: "2026-04-30T00:00:00Z",
    status: "completed",
    toolCallId: "acp-tool-1",
    toolKind: "execute",
    title: "Run command",
    summary: "Command completed",
    input: { command: "npm test" },
    output: null,
    reviewArtifactIds: [],
    ...overrides
  } satisfies Extract<TimelineItem, { kind: "tool_call" }>;
}

function message(overrides: Partial<Extract<TimelineItem, { kind: "message" }>>) {
  return {
    kind: "message",
    id: "message-1",
    sessionId: "session-1",
    timestamp: "2026-04-30T00:00:00Z",
    status: "completed",
    role: "assistant",
    content: "Done",
    ...overrides
  } satisfies Extract<TimelineItem, { kind: "message" }>;
}

function permission(overrides: Partial<Extract<TimelineItem, { kind: "permission" }>>) {
  return {
    kind: "permission",
    id: "permission-1",
    sessionId: "session-1",
    timestamp: "2026-04-30T00:00:00Z",
    status: "resolved",
    toolCallId: null,
    title: "Permission resolved",
    permissionKind: "execute",
    ...overrides
  } satisfies Extract<TimelineItem, { kind: "permission" }>;
}

function reviewArtifactItem(overrides: Partial<Extract<TimelineItem, { kind: "review_artifact" }>>) {
  return {
    kind: "review_artifact",
    id: "artifact-1",
    sessionId: "session-1",
    timestamp: "2026-04-30T00:00:00Z",
    status: "completed",
    toolCallId: "acp-tool-1",
    artifactKind: "diff",
    title: "Diff evidence",
    summary: "Diff summary",
    source: "fixture",
    ...overrides
  } satisfies Extract<TimelineItem, { kind: "review_artifact" }>;
}

function reviewArtifact(overrides: Partial<ReviewArtifactSummary>) {
  return {
    id: "artifact-1",
    sessionId: "session-1",
    toolCallId: "acp-tool-1",
    kind: "diff",
    title: "Diff evidence",
    summary: "Diff summary",
    source: "fixture",
    createdAt: "2026-04-30T00:00:00Z",
    ...overrides
  } satisfies ReviewArtifactSummary;
}

describe("buildTimelineBlocks", () => {
  test("renders a single tool call as a direct activity summary", () => {
    const blocks = buildTimelineBlocks([toolCall({ input: { command: "npm run build" } })]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "tool_group", summary: "Ran npm run build" });
  });

  test("groups consecutive commands into one summary", () => {
    const blocks = buildTimelineBlocks([
      toolCall({ id: "tool-1", input: { command: "npm test" } }),
      toolCall({ id: "tool-2", toolCallId: "acp-tool-2", input: { command: "npm run build" } }),
      toolCall({ id: "tool-3", toolCallId: "acp-tool-3", input: { command: "npm run lint" } })
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "tool_group", summary: "Ran 3 commands", statusLabel: "3 completed" });
    expect(blocks[0].kind === "tool_group" ? blocks[0].entries.map((entry) => entry.item.id) : []).toEqual([
      "tool-1",
      "tool-2",
      "tool-3"
    ]);
  });

  test("uses message boundaries to split groups", () => {
    const blocks = buildTimelineBlocks([
      toolCall({ id: "tool-1", input: { command: "npm test" } }),
      message({ id: "message-1", content: "Done" }),
      toolCall({ id: "tool-2", toolCallId: "acp-tool-2", input: { command: "npm run build" } })
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["tool_group", "message", "tool_group"]);
  });

  test("keeps failed and running tool calls as visible boundaries", () => {
    const blocks = buildTimelineBlocks([
      toolCall({ id: "tool-1", status: "failed", input: { command: "npm test" } }),
      toolCall({
        id: "tool-running",
        toolCallId: "acp-tool-running",
        status: "running",
        input: { command: "npm run build" }
      }),
      toolCall({
        id: "tool-2",
        toolCallId: "acp-tool-2",
        toolKind: "apply_patch",
        title: "Apply patch",
        input: { path: "frontend/src/App.tsx" }
      }),
      toolCall({
        id: "tool-3",
        toolCallId: "acp-tool-3",
        toolKind: "mcp__node_repl__js",
        title: "Execute JavaScript",
        input: { server: "node_repl", tool: "js" }
      })
    ]);

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({
      kind: "tool_group",
      summary: "Ran npm test",
      status: "failed",
      statusLabel: "1 failed"
    });
    expect(blocks[1]).toMatchObject({
      kind: "tool_group",
      summary: "Ran npm run build",
      status: "running",
      statusLabel: "running"
    });
    expect(blocks[2]).toMatchObject({
      kind: "tool_group",
      summary: "Changed 1 file, used 1 tool",
      status: "completed",
      statusLabel: "2 completed"
    });
  });

  test("folds linked review artifacts into tool evidence", () => {
    const blocks = buildTimelineBlocks(
      [
        toolCall({ id: "tool-1", reviewArtifactIds: [] }),
        reviewArtifactItem({ id: "artifact-1", toolCallId: "acp-tool-1" }),
        reviewArtifactItem({ id: "orphan-artifact", toolCallId: "unknown-tool" })
      ],
      [reviewArtifact({ id: "artifact-1", toolCallId: "acp-tool-1" })]
    );

    expect(blocks.map((block) => block.kind)).toEqual(["tool_group", "review_artifact"]);
    expect(blocks[0].kind === "tool_group" ? blocks[0].entries[0].item.reviewArtifactIds : []).toEqual([
      "artifact-1"
    ]);
  });

  test("keeps linked image artifacts visible in the timeline", () => {
    const blocks = buildTimelineBlocks(
      [
        toolCall({ id: "tool-1", reviewArtifactIds: [] }),
        reviewArtifactItem({
          id: "image-artifact",
          toolCallId: "acp-tool-1",
          artifactKind: "image",
          title: "Generated image"
        })
      ],
      [reviewArtifact({ id: "image-artifact", toolCallId: "acp-tool-1", kind: "image" })]
    );

    expect(blocks.map((block) => block.kind)).toEqual(["tool_group", "review_artifact"]);
    expect(blocks[1]).toMatchObject({ kind: "review_artifact", id: "image-artifact" });
  });

  test("folds tool-linked permissions without breaking consecutive groups", () => {
    const blocks = buildTimelineBlocks([
      toolCall({ id: "tool-1", input: { command: "npm test" } }),
      permission({ id: "permission-1", toolCallId: "acp-tool-1" }),
      toolCall({ id: "tool-2", toolCallId: "acp-tool-2", input: { command: "npm run build" } }),
      permission({ id: "permission-orphan", toolCallId: null })
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(["tool_group", "permission"]);
    expect(blocks[0]).toMatchObject({ kind: "tool_group", summary: "Ran 2 commands" });
  });

  test("folds permission bookkeeping tool calls", () => {
    const blocks = buildTimelineBlocks([
      toolCall({ id: "tool-1", input: { command: "npm test" } }),
      toolCall({
        id: "permission-tool",
        toolCallId: "permission-tool",
        toolKind: "permission_request",
        title: "Permission requested",
        summary: "Permission requested"
      }),
      toolCall({ id: "tool-2", toolCallId: "acp-tool-2", input: { command: "npm run build" } })
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "tool_group", summary: "Ran 2 commands" });
  });

  test("keeps sparse generic permission-labeled tool calls grouped", () => {
    const blocks = buildTimelineBlocks([
      toolCall({
        id: "tool-1",
        toolCallId: "legacy-tool-1",
        toolKind: "unknown",
        title: "Permission requested",
        summary: "tool_call_update completed",
        input: {}
      }),
      toolCall({
        id: "tool-2",
        toolCallId: "legacy-tool-2",
        toolKind: "unknown",
        title: "Permission requested",
        summary: "tool_call_update completed",
        input: {}
      })
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "tool_group", summary: "Used 2 tools", statusLabel: "2 completed" });
    expect(blocks[0].kind === "tool_group" ? blocks[0].entries.map((entry) => entry.item.id) : []).toEqual([
      "tool-1",
      "tool-2"
    ]);
  });

  test("renders permission placeholder tool calls with linked command context", () => {
    const blocks = buildTimelineBlocks([
      toolCall({
        id: "permission-tool",
        toolCallId: "permission-tool",
        toolKind: "unknown",
        title: "Permission requested",
        summary: "tool_call_update completed",
        input: {}
      }),
      permission({
        id: "permission-1",
        toolCallId: "permission-tool",
        title: "git status --short",
        permissionKind: "execute"
      })
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "tool_group", summary: "Ran git status --short" });
    expect(blocks[0].kind === "tool_group" ? blocks[0].entries[0].display.subject : "").toBe("git status --short");
  });
});
