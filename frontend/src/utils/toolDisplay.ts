import type { ReviewArtifactSummary, TimelineItem } from "../types";

export type ToolCallTimelineItem = Extract<TimelineItem, { kind: "tool_call" }>;

export type ToolActivityKind =
  | "command"
  | "file_change"
  | "file_read"
  | "search"
  | "browser"
  | "mcp"
  | "generic";

export type ToolCallDisplay = {
  kind: ToolActivityKind;
  actionLabel: string;
  subject: string;
  status: string;
  statusLabel: string;
  result: string;
  metadata: ToolCallDisplayDetail[];
  outputTail?: string;
  detailText: string;
};

export type ToolCallDisplayDetail = {
  label: string;
  value: string;
};

const MAX_SUBJECT_LENGTH = 180;
const MAX_DETAIL_LENGTH = 240;
const MAX_RESULT_LENGTH = 240;
const MAX_OUTPUT_TAIL_LINES = 6;
const MAX_OUTPUT_TAIL_LENGTH = 520;

export function toolCallDisplay(
  item: ToolCallTimelineItem,
  reviewArtifacts: ReviewArtifactSummary[] = []
): ToolCallDisplay {
  const input = asRecord(item.input);
  const contentText = findContentText(item.input);
  const command = findString(item.input, ["command", "cmd", "script", "shell", "commandLine"]) ?? shellCommandFromContent(contentText);
  const toolText = [
    item.toolKind,
    item.title,
    stringField(input, "sessionUpdate"),
    stringField(input, "kind"),
    stringField(input, "type"),
    stringField(input, "name"),
    stringField(input, "tool"),
    contentText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const cwd = findString(item.input, ["cwd", "workingDirectory"]);
  const path = findString(item.input, ["path", "file", "filename", "directory", "glob"]);
  const query = findString(item.input, ["query", "q", "pattern", "search", "searchQuery"]);
  const url = findString(item.input, ["url", "href", "target"]);
  const server = findString(item.input, ["server", "serverName", "mcpServer"]);
  const tool = findString(item.input, ["tool", "toolName", "name"]);
  const kind = detectKind(toolText, { command, path, query, server, tool, url });
  const subject = subjectForKind(kind, {
    command,
    contentText,
    fallback: item.title || item.toolKind,
    path,
    query,
    server,
    tool,
    url
  });
  const outputText = outputFromPayload(item.output);
  const result = compactText(item.summary || outputText || resultForStatus(item.status), MAX_RESULT_LENGTH);
  const outputTail = outputText && outputText !== "null" ? compactMultilineTail(outputText) : undefined;
  const metadata = uniqueDetails([
    detail("Command", command ?? (kind === "command" ? contentText : undefined)),
    detail("Path", path),
    detail("Query", query),
    detail("URL", url),
    detail("Cwd", cwd),
    detail("Server", server),
    detail("Tool", tool && tool !== item.toolKind ? tool : item.toolKind)
  ]);
  const displayBase = {
    kind,
    actionLabel: actionLabel(kind, item.toolKind),
    subject: compactText(subject, MAX_SUBJECT_LENGTH),
    status: item.status,
    statusLabel: statusLabel(item.status),
    result,
    metadata,
    outputTail
  };

  return {
    ...displayBase,
    detailText: toolDetailText(displayBase, reviewArtifacts, item.reviewArtifactIds)
  };
}

function detectKind(
  text: string,
  values: {
    command?: string;
    path?: string;
    query?: string;
    server?: string;
    tool?: string;
    url?: string;
  }
): ToolActivityKind {
  if (/\b(browser|navigate|click|screenshot|page|url)\b/.test(text) || values.url) return "browser";
  if (/\bmcp\b/.test(text) || (values.server && values.tool)) return "mcp";
  if (/\b(edit|write|patch|apply_patch|update_file|create_file|delete_file|replace)\b/.test(text)) {
    return "file_change";
  }
  if (/\b(search|grep|rg|find|query)\b/.test(text) || values.query) return "search";
  if (/\b(execute|command|shell|bash|powershell|terminal|run)\b/.test(text) || values.command) return "command";
  if (/\b(list|ls|glob|directory|read|open|fetch|cat|view)\b/.test(text) || values.path) return "file_read";
  return "generic";
}

function actionLabel(kind: ToolActivityKind, fallback: string) {
  switch (kind) {
    case "command":
      return "Ran";
    case "file_change":
      return "Changed";
    case "file_read":
      return "Read";
    case "search":
      return "Searched";
    case "browser":
      return "Browsed";
    case "mcp":
      return "Called";
    case "generic":
      return humanize(fallback || "Tool");
  }
}

function subjectForKind(
  kind: ToolActivityKind,
  values: {
    command?: string;
    contentText?: string;
    fallback: string;
    path?: string;
    query?: string;
    server?: string;
    tool?: string;
    url?: string;
  }
) {
  switch (kind) {
    case "command":
      return values.command ?? values.contentText ?? values.fallback;
    case "file_change":
    case "file_read":
      return values.path ?? values.fallback;
    case "search":
      return values.query ?? values.path ?? values.fallback;
    case "browser":
      return values.url ?? values.fallback;
    case "mcp":
      return [values.server, values.tool].filter(Boolean).join(" / ") || values.fallback;
    case "generic":
      return values.fallback;
  }
}

function detail(label: string, value?: string | null): ToolCallDisplayDetail | null {
  const compact = compactText(value ?? "", MAX_DETAIL_LENGTH);
  return compact ? { label, value: compact } : null;
}

function uniqueDetails(details: Array<ToolCallDisplayDetail | null>) {
  const seen = new Set<string>();
  return details.filter((item): item is ToolCallDisplayDetail => {
    if (!item) return false;
    const key = `${item.label}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringField(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function findString(value: unknown, keys: string[], depth = 0): string | undefined {
  if (depth > 4) return undefined;
  if (typeof value === "string") return undefined;
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (Array.isArray(candidate)) {
      const joined = candidate.filter((item): item is string => typeof item === "string" && item.trim().length > 0).join(" ");
      if (joined) return joined;
    }
  }

  for (const key of ["input", "params", "arguments", "toolCall", "data"]) {
    const found = findString(record[key], keys, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function findContentText(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined;
  if (!value || typeof value !== "object") return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findContentText(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const direct = textFromContent(record.content);
  if (direct) return direct;

  for (const key of ["input", "params", "arguments", "toolCall", "data"]) {
    const found = findContentText(record[key], depth + 1);
    if (found) return found;
  }
  return undefined;
}

function textFromContent(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!Array.isArray(value)) return undefined;

  const text = value
    .map((part) => {
      const record = asRecord(part);
      const text = stringField(record, "text");
      return text?.trim() ?? "";
    })
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

function shellCommandFromContent(value?: string): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;

  const fenced = text.match(/```(?:sh|shell|bash|zsh|powershell|ps1|pwsh|cmd|bat)?\s*\n([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).replace(/\r\n/g, "\n");
  const lines = candidate
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  if (!lines.length) return undefined;

  const command = lines.slice(0, 3).join(" && ");
  if (fenced || looksLikeShellCommand(lines[0])) {
    return command;
  }
  return undefined;
}

function looksLikeShellCommand(value: string) {
  const firstToken = value.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (/^(?:\.{1,2}[\\/]|[\\/])/.test(firstToken)) return true;
  return [
    "bun",
    "cargo",
    "cmd",
    "deno",
    "dotnet",
    "git",
    "go",
    "make",
    "node",
    "npm",
    "npx",
    "pnpm",
    "powershell",
    "pwsh",
    "python",
    "rg",
    "rustc",
    "tsc",
    "uv",
    "vite",
    "yarn"
  ].includes(firstToken);
}

function outputFromPayload(payload: unknown) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  const record = asRecord(payload);
  if (record) {
    const values = ["stderr", "stdout", "error", "message", "output", "text", "content", "diff", "markdown"]
      .map((key) => record[key])
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (values.length) return values.join("\n");
  }
  return "";
}

function compactText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactMultilineTail(value: string) {
  const lines = value.replace(/\r\n/g, "\n").trim().split("\n").filter(Boolean);
  const tail = lines.slice(-MAX_OUTPUT_TAIL_LINES).join("\n");
  if (tail.length <= MAX_OUTPUT_TAIL_LENGTH) return tail;
  return `${tail.slice(0, Math.max(0, MAX_OUTPUT_TAIL_LENGTH - 3))}...`;
}

function resultForStatus(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    default:
      return humanize(status || "Tool activity");
  }
}

function statusLabel(status: string) {
  return resultForStatus(status).toLowerCase();
}

function humanize(value: string) {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Tool";
}

function toolDetailText(
  display: Omit<ToolCallDisplay, "detailText">,
  reviewArtifacts: ReviewArtifactSummary[],
  artifactIds: string[]
) {
  const lines = [
    `${display.actionLabel} ${display.subject}`,
    `Status: ${display.statusLabel}`
  ];

  if (display.result && display.result.toLowerCase() !== display.statusLabel) {
    lines.push(`Result: ${display.result}`);
  }

  for (const item of display.metadata) {
    lines.push(`${item.label}: ${item.value}`);
  }

  const linkedArtifacts = artifactIds
    .map((id) => reviewArtifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is ReviewArtifactSummary => Boolean(artifact))
    .filter((artifact) => artifact.kind !== "image")
    .map((artifact) => compactText(artifact.title || artifact.summary || artifact.kind, MAX_DETAIL_LENGTH));

  if (linkedArtifacts.length) {
    lines.push(`Evidence: ${Array.from(new Set(linkedArtifacts)).join(", ")}`);
  }

  if (display.outputTail) {
    lines.push(`Output:\n${display.outputTail}`);
  }

  return Array.from(new Set(lines.filter(Boolean))).join("\n");
}
