import type { ChatMessage, TimelineItem } from "../types";

export function liveMessage(sessionId: string, content: string): ChatMessage {
  return {
    id: "live-assistant",
    sessionId,
    role: "assistant",
    content,
    status: "running",
    createdAt: new Date().toISOString()
  };
}

export function timelineMessage(item: Extract<TimelineItem, { kind: "message" }>): ChatMessage {
  return {
    id: item.id,
    sessionId: item.sessionId,
    role: item.role,
    content: item.content,
    contentBlocks: item.contentBlocks,
    status: item.status,
    createdAt: item.timestamp
  };
}

export function messageToTimelineItem(message: ChatMessage): TimelineItem {
  return {
    kind: "message",
    id: message.id,
    sessionId: message.sessionId,
    timestamp: message.createdAt,
    status: message.status,
    role: message.role,
    content: message.content,
    contentBlocks: message.contentBlocks
  };
}
