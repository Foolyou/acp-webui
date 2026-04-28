import { describe, expect, test } from "vitest";
import { normalizeMarkdownContent } from "./markdownNormalize";

describe("normalizeMarkdownContent", () => {
  test("repairs fenced code closings glued to following prose", () => {
    const input = [
      "Intro",
      "",
      "```text",
      "first block",
      "```Next paragraph",
      "",
      "```json",
      "{\"ok\":true}",
      "```More text"
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(
      [
        "Intro",
        "",
        "```text",
        "first block",
        "```",
        "Next paragraph",
        "",
        "```json",
        "{\"ok\":true}",
        "```",
        "More text"
      ].join("\n")
    );
  });

  test("repairs text fences glued to their first content line", () => {
    const input = ["```textGET session detail", "  -> ok", "```Done"].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(["```text", "GET session detail", "  -> ok", "```", "Done"].join("\n"));
  });

  test("keeps valid fenced code blocks unchanged", () => {
    const input = ["```ts", "const value = 1;", "```", "", "Done"].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(input);
  });
});
