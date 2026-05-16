import type { AgentRuntimeStatus, ChatMessage, MessageContentBlock } from "../../types";

export function formatActiveTurnElapsed(startedAt: string, now: number = Date.now()) {
  const elapsedMs = Math.max(0, now - Date.parse(startedAt));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

export function insertPromptTemplateBody(current: string, body: string) {
  const templateBody = body.trim();
  if (!templateBody) return current;
  if (!current.trim()) return templateBody;
  return `${current.trimEnd()}\n\n${templateBody}`;
}

export function defaultPromptTemplateTitle(body: string) {
  const firstLine = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Untitled prompt";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

export function promptComposerImageSupported(
  agentConnection: AgentRuntimeStatus["status"] | null,
  options: {
    continuable?: boolean;
    fallbackConnection?: AgentRuntimeStatus["status"] | null;
  } = {}
) {
  if (agentConnection?.promptCapabilities?.image === true) return true;
  return options.continuable === true && options.fallbackConnection?.promptCapabilities?.image === true;
}

export function promptComposerStatus({
  agentConnection,
  agentName,
  continuityReason,
  elapsedLabel,
  running,
  stoppingTurn,
  waitingApproval
}: {
  agentConnection: AgentRuntimeStatus["status"] | null;
  agentName: string;
  continuityReason: string | null;
  elapsedLabel: string | null;
  running: boolean;
  stoppingTurn: boolean;
  waitingApproval: boolean;
}) {
  if (continuityReason) return continuityReason;
  if (waitingApproval) return "Waiting for approval";
  if (stoppingTurn) return `Stopping ${agentName}${elapsedLabel ? ` after ${elapsedLabel}` : "..."}`;
  if (running) return `${agentName} is working${elapsedLabel ? ` for ${elapsedLabel}` : "..."}`;
  if (agentConnection && agentConnection.state !== "ready" && agentConnection.state !== "idle") {
    return agentConnection.message ?? `${agentName} is ${agentConnection.state}`;
  }
  return null;
}

export function renderableMessageBlocks(message: Pick<ChatMessage, "content" | "contentBlocks">) {
  const blocks = message.contentBlocks?.length
    ? message.contentBlocks
    : message.content
      ? [{ type: "text" as const, text: message.content }]
      : [];
  return blocks.reduce<MessageContentBlock[]>((merged, block) => {
    const previous = merged[merged.length - 1];
    if (block.type === "text" && previous?.type === "text") {
      merged[merged.length - 1] = { type: "text", text: `${previous.text}${block.text}` };
      return merged;
    }
    merged.push(block);
    return merged;
  }, []);
}
