import type { SessionDetail } from "../types";

export function liveAssistantAfterSessionReconcile(liveAssistant: string, detail: SessionDetail) {
  if (!liveAssistant) return "";
  const active =
    ["running", "waiting_approval", "stopping"].includes(detail.session.status) ||
    ["running", "stopping"].includes(detail.activeTurn?.status ?? "");
  if (!active) return "";
  const persisted = detail.timeline.some(
    (item) => item.kind === "message" && item.role === "assistant" && item.content.includes(liveAssistant)
  );
  return persisted ? "" : liveAssistant;
}
