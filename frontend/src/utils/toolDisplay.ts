import type { TimelineItem } from "../types";
import { payloadText } from "./payload";

export type ToolCallTimelineItem = Extract<TimelineItem, { kind: "tool_call" }>;

export type ToolCallDisplay = {
  actionLabel: string;
  subject: string;
  status: string;
  summary: string;
  details: ToolCallDisplayDetail[];
  outputPreview?: string;
  rawInput: unknown;
  rawOutput?: unknown | null;
};

export type ToolCallDisplayDetail = {
  label: string;
  value: string;
};

type ActionKind = "run" | "read" | "edit" | "search" | "list" | "browse" | "unknown";

const MAX_SUBJECT_LENGTH = 180;
const MAX_DETAIL_LENGTH = 240;
const MAX_PREVIEW_LENGTH = 360;

export function toolCallDisplay(item: ToolCallTimelineItem): ToolCallDisplay {
  const input = asRecord(item.input);
  const toolText = [
    item.toolKind,
    item.title,
    stringField(input, "sessionUpdate"),
    stringField(input, "kind"),
    stringField(input, "type"),
    stringField(input, "name")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const command = findString(item.input, ["command", "cmd", "script", "shell", "commandLine"]);
  const cwd = findString(item.input, ["cwd", "workingDirectory"]);
  const path = findString(item.input, ["path", "file", "filename", "directory", "glob"]);
  const query = findString(item.input, ["query", "q", "pattern", "search", "searchQuery"]);
  const url = findString(item.input, ["url", "href", "target"]);
  const contentText = textFromContent(input?.content);
  const actionKind = detectAction(toolText);
  const subject = subjectForAction(actionKind, {
    command,
    contentText,
    fallback: item.title || item.toolKind,
    path,
    query,
    url
  });
  const outputText = item.output == null ? "" : payloadText(item.output);
  const summary = compactText(item.summary || outputText || "No summary available.", MAX_PREVIEW_LENGTH);
  const outputPreview = outputText && outputText !== "null" ? compactText(outputText, MAX_PREVIEW_LENGTH) : undefined;

  return {
    actionLabel: actionLabel(actionKind, item.toolKind),
    subject: compactText(subject, MAX_SUBJECT_LENGTH),
    status: item.status,
    summary,
    details: uniqueDetails([
      detail("Command", command ?? (actionKind === "run" ? contentText : undefined)),
      detail("Path", path),
      detail("Query", query),
      detail("URL", url),
      detail("Cwd", cwd),
      detail("Tool", item.toolKind)
    ]),
    outputPreview,
    rawInput: item.input,
    rawOutput: item.output
  };
}

function detectAction(text: string): ActionKind {
  if (/\b(browser|navigate|click|screenshot|page|url)\b/.test(text)) return "browse";
  if (/\b(execute|command|shell|bash|powershell|terminal|run)\b/.test(text)) return "run";
  if (/\b(edit|write|patch|apply_patch|update_file|create_file|delete_file|replace)\b/.test(text)) return "edit";
  if (/\b(search|grep|rg|find|query)\b/.test(text)) return "search";
  if (/\b(list|ls|glob|directory)\b/.test(text)) return "list";
  if (/\b(read|open|fetch|cat|view)\b/.test(text)) return "read";
  return "unknown";
}

function actionLabel(kind: ActionKind, fallback: string) {
  switch (kind) {
    case "run":
      return "Ran";
    case "read":
      return "Read";
    case "edit":
      return "Edited";
    case "search":
      return "Searched";
    case "list":
      return "Listed";
    case "browse":
      return "Browsed";
    case "unknown":
      return humanize(fallback || "Tool");
  }
}

function subjectForAction(
  kind: ActionKind,
  values: {
    command?: string;
    contentText?: string;
    fallback: string;
    path?: string;
    query?: string;
    url?: string;
  }
) {
  switch (kind) {
    case "run":
      return values.command ?? values.contentText ?? values.fallback;
    case "read":
    case "edit":
    case "list":
      return values.path ?? values.fallback;
    case "search":
      return values.query ?? values.path ?? values.fallback;
    case "browse":
      return values.url ?? values.fallback;
    case "unknown":
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

function compactText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function humanize(value: string) {
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Tool";
}
