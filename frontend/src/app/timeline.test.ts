import { describe, expect, test } from "vitest";
import type { ChatMessage, TimelineItem } from "../types";
import { messageToTimelineItem, timelineMessage } from "./timeline";

describe("timeline message content blocks", () => {
  test("preserves image content blocks between chat messages and timeline items", () => {
    const message: ChatMessage = {
      id: "message-1",
      sessionId: "session-1",
      role: "user",
      content: "look",
      contentBlocks: [
        { type: "text", text: "look" },
        { type: "image", mimeType: "image/png", data: "aW1hZ2U=", name: "image.png" }
      ],
      status: "idle",
      createdAt: "2026-05-01T00:00:00Z"
    };

    const item = messageToTimelineItem(message) as Extract<TimelineItem, { kind: "message" }>;
    expect(item.contentBlocks).toEqual(message.contentBlocks);
    expect(timelineMessage(item).contentBlocks).toEqual(message.contentBlocks);
  });
});
