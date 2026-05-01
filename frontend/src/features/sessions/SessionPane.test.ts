import { describe, expect, test } from "vitest";
import {
  defaultPromptTemplateTitle,
  formatActiveTurnElapsed,
  insertPromptTemplateBody,
  renderableMessageBlocks
} from "./SessionPane";

describe("formatActiveTurnElapsed", () => {
  test("formats active work time in seconds and minutes", () => {
    expect(formatActiveTurnElapsed("2026-04-30T00:00:00Z", Date.parse("2026-04-30T00:00:09Z"))).toBe("9s");
    expect(formatActiveTurnElapsed("2026-04-30T00:00:00Z", Date.parse("2026-04-30T00:02:05Z"))).toBe("2m 05s");
  });
});

describe("renderableMessageBlocks", () => {
  test("coalesces adjacent text blocks before rendering markdown", () => {
    expect(
      renderableMessageBlocks({
        content: "",
        contentBlocks: [
          { type: "text", text: "我" },
          { type: "text", text: "先" },
          { type: "text", text: "快速" }
        ]
      })
    ).toEqual([{ type: "text", text: "我先快速" }]);
  });

  test("preserves image boundaries between text blocks", () => {
    const image = { type: "image" as const, mimeType: "image/png", data: "abc" };
    expect(
      renderableMessageBlocks({
        content: "",
        contentBlocks: [
          { type: "text", text: "before" },
          image,
          { type: "text", text: "after" }
        ]
      })
    ).toEqual([{ type: "text", text: "before" }, image, { type: "text", text: "after" }]);
  });
});

describe("prompt template helpers", () => {
  test("inserts template bodies without disturbing existing prompt text", () => {
    expect(insertPromptTemplateBody("", "  explain this  ")).toBe("explain this");
    expect(insertPromptTemplateBody("hello\n", "world")).toBe("hello\n\nworld");
    expect(insertPromptTemplateBody("hello", "   ")).toBe("hello");
  });

  test("derives a compact title from the first non-empty line", () => {
    expect(defaultPromptTemplateTitle("\n  Review this diff\nwith detail")).toBe("Review this diff");
    expect(defaultPromptTemplateTitle("")).toBe("Untitled prompt");
    expect(defaultPromptTemplateTitle("a".repeat(70))).toBe(`${"a".repeat(57)}...`);
  });
});
