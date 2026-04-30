import type { ReviewArtifactSummary, TimelineItem } from "../types";
import { toolCallDisplay, type ToolCallDisplay, type ToolCallTimelineItem } from "../utils/toolDisplay";

type MessageTimelineItem = Extract<TimelineItem, { kind: "message" }>;
type PermissionTimelineItem = Extract<TimelineItem, { kind: "permission" }>;
type ReviewArtifactTimelineItem = Extract<TimelineItem, { kind: "review_artifact" }>;

export type TimelineToolGroupEntry = {
  item: ToolCallTimelineItem;
  display: ToolCallDisplay;
};

export type TimelineDisplayBlock =
  | { kind: "message"; id: string; item: MessageTimelineItem }
  | {
      kind: "tool_group";
      id: string;
      entries: TimelineToolGroupEntry[];
      summary: string;
      status: string;
      statusLabel: string | null;
      failureCount: number;
      classNames: string[];
    }
  | { kind: "permission"; id: string; item: PermissionTimelineItem }
  | { kind: "review_artifact"; id: string; item: ReviewArtifactTimelineItem };

type ActivitySummary = {
  verb: string;
  noun: string;
};

type ActivitySummaryKey = "command" | "file_change" | "file_read" | "search" | "browser" | "tool";

const ACTIVITY_SUMMARIES: Record<ActivitySummaryKey, ActivitySummary> = {
  command: { verb: "Ran", noun: "command" },
  file_change: { verb: "Changed", noun: "file" },
  file_read: { verb: "Read", noun: "file" },
  search: { verb: "Searched", noun: "search" },
  browser: { verb: "Browsed", noun: "browser action" },
  tool: { verb: "Used", noun: "tool" }
};

export function buildTimelineBlocks(
  timeline: TimelineItem[],
  reviewArtifacts: ReviewArtifactSummary[] = []
): TimelineDisplayBlock[] {
  const blocks: TimelineDisplayBlock[] = [];
  const permissionsByToolCallId = permissionMap(timeline);
  const visibleToolCallIds = new Set(
    timeline
      .filter((item): item is ToolCallTimelineItem => item.kind === "tool_call")
      .map((item) => item.toolCallId)
      .filter((id): id is string => Boolean(id))
  );
  const foldedArtifactIds = new Set<string>();

  for (const item of timeline) {
    if (item.kind !== "tool_call") continue;
    for (const artifactId of item.reviewArtifactIds) {
      foldedArtifactIds.add(artifactId);
    }
  }

  for (const artifact of reviewArtifacts) {
    if (artifact.toolCallId && visibleToolCallIds.has(artifact.toolCallId)) {
      foldedArtifactIds.add(artifact.id);
    }
  }

  let pendingTools: TimelineToolGroupEntry[] = [];

  function flushTools() {
    if (!pendingTools.length) return;
    blocks.push(toolGroupBlock(pendingTools));
    pendingTools = [];
  }

  for (const item of timeline) {
    switch (item.kind) {
      case "message":
        flushTools();
        blocks.push({ kind: "message", id: item.id, item });
        break;
      case "tool_call": {
        const toolItem = toolCallWithPermissionContext(item, permissionsByToolCallId);
        if (shouldFoldPermissionToolCall(toolItem, permissionsByToolCallId)) {
          break;
        }
        const toolItemWithArtifacts = withLinkedArtifactIds(toolItem, reviewArtifacts);
        pendingTools.push({ item: toolItemWithArtifacts, display: toolCallDisplay(toolItemWithArtifacts, reviewArtifacts) });
        break;
      }
      case "review_artifact":
        if (shouldFoldReviewArtifact(item, visibleToolCallIds, foldedArtifactIds)) {
          break;
        }
        flushTools();
        blocks.push({ kind: "review_artifact", id: item.id, item });
        break;
      case "permission":
        if (shouldFoldPermission(item)) {
          break;
        }
        flushTools();
        blocks.push({ kind: "permission", id: item.id, item });
        break;
    }
  }

  flushTools();
  return blocks;
}

function withLinkedArtifactIds(
  item: ToolCallTimelineItem,
  reviewArtifacts: ReviewArtifactSummary[]
): ToolCallTimelineItem {
  if (!item.toolCallId) return item;
  const ids = new Set(item.reviewArtifactIds);
  for (const artifact of reviewArtifacts) {
    if (artifact.toolCallId === item.toolCallId) {
      ids.add(artifact.id);
    }
  }
  if (ids.size === item.reviewArtifactIds.length) return item;
  return { ...item, reviewArtifactIds: [...ids] };
}

function shouldFoldReviewArtifact(
  item: ReviewArtifactTimelineItem,
  visibleToolCallIds: Set<string>,
  foldedArtifactIds: Set<string>
) {
  return foldedArtifactIds.has(item.id) || Boolean(item.toolCallId && visibleToolCallIds.has(item.toolCallId));
}

function shouldFoldPermission(item: PermissionTimelineItem) {
  return Boolean(item.toolCallId);
}

function shouldFoldPermissionToolCall(item: ToolCallTimelineItem, permissionsByToolCallId: Map<string, PermissionTimelineItem>) {
  if (item.toolCallId && permissionsByToolCallId.has(item.toolCallId)) {
    return false;
  }
  const text = [item.toolKind, item.title, item.summary].join(" ").toLowerCase();
  return /\b(permission|approval)\s+(requested|resolved)\b/.test(text);
}

function permissionMap(timeline: TimelineItem[]) {
  const map = new Map<string, PermissionTimelineItem>();
  for (const item of timeline) {
    if (item.kind === "permission" && item.toolCallId) {
      map.set(item.toolCallId, item);
    }
  }
  return map;
}

function toolCallWithPermissionContext(
  item: ToolCallTimelineItem,
  permissionsByToolCallId: Map<string, PermissionTimelineItem>
): ToolCallTimelineItem {
  if (!item.toolCallId) return item;
  const permission = permissionsByToolCallId.get(item.toolCallId);
  if (!permission?.title) return item;
  const input = item.input && typeof item.input === "object" && !Array.isArray(item.input) ? item.input : {};
  return {
    ...item,
    toolKind: permission.permissionKind || item.toolKind,
    title: permission.title,
    input: {
      ...input,
      command: permission.title
    }
  };
}

function toolGroupBlock(entries: TimelineToolGroupEntry[]): Extract<TimelineDisplayBlock, { kind: "tool_group" }> {
  const first = entries[0];
  const last = entries.at(-1) ?? first;
  const failureCount = entries.filter((entry) => entry.item.status.toLowerCase() === "failed").length;
  const runningCount = entries.filter((entry) => entry.item.status.toLowerCase() === "running").length;
  const status = failureCount ? "failed" : runningCount ? "running" : "completed";
  const classNames = Array.from(new Set(entries.map((entry) => entry.display.kind)));

  return {
    kind: "tool_group",
    id: `tool-group-${first.item.id}-${last.item.id}-${entries.length}`,
    entries,
    summary: toolGroupSummary(entries),
    status,
    statusLabel: failureCount ? `${failureCount} failed` : runningCount ? "running" : null,
    failureCount,
    classNames
  };
}

function toolGroupSummary(entries: TimelineToolGroupEntry[]) {
  if (entries.length === 1) {
    return singleToolSummary(entries[0]);
  }

  const orderedKinds: ActivitySummaryKey[] = [];
  const counts = new Map<ActivitySummaryKey, number>();
  for (const entry of entries) {
    const kind = summaryKey(entry.display.kind);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (!orderedKinds.includes(kind)) {
      orderedKinds.push(kind);
    }
  }

  return orderedKinds
    .map((kind, index) => activityCountLabel(kind, counts.get(kind) ?? 0, index === 0))
    .join(", ");
}

function singleToolSummary(entry: TimelineToolGroupEntry) {
  const subject = friendlyToolSubject(entry);
  const summary = ACTIVITY_SUMMARIES[summaryKey(entry.display.kind)];
  return `${summary.verb} ${subject}`;
}

function activityCountLabel(kind: ActivitySummaryKey, count: number, sentenceStart: boolean) {
  const summary = ACTIVITY_SUMMARIES[kind];
  const verb = sentenceStart ? summary.verb : lowerFirst(summary.verb);
  return `${verb} ${count} ${pluralize(summary.noun, count)}`;
}

function summaryKey(kind: ToolCallDisplay["kind"]): ActivitySummaryKey {
  if (kind === "mcp" || kind === "generic") return "tool";
  return kind;
}

function friendlyToolSubject(entry: TimelineToolGroupEntry) {
  if (entry.display.kind === "mcp" && /node[_-]?repl/i.test(entry.item.toolKind)) {
    return "Node Repl";
  }
  return entry.display.subject;
}

function pluralize(noun: string, count: number) {
  if (count === 1) return noun;
  if (noun.endsWith("search")) return "searches";
  return `${noun}s`;
}

function lowerFirst(value: string) {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}
