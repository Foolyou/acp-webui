import { describe, expect, test } from "vitest";
import { normalizeMarkdownContent } from "./markdownNormalize";

describe("normalizeMarkdownContent", () => {
  test("unwraps whole-message text fences for readable markdown rendering", () => {
    const input = [
      "```text",
      "需要你定两个点：",
      "",
      "1. **Review viewer 是单一统一 viewer 吗？**",
      "   - 我建议统一 viewer。",
      "",
      "`raw/source` 切换。",
      "```"
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(
      [
        "需要你定两个点：",
        "",
        "1. **Review viewer 是单一统一 viewer 吗？**",
        "   - 我建议统一 viewer。",
        "",
        "`raw/source` 切换。"
      ].join("\n")
    );
  });

  test("unwraps whole-message plaintext and txt fences", () => {
    expect(normalizeMarkdownContent(["```plaintext", "**Readable**", "```"].join("\n"))).toBe("**Readable**");
    expect(normalizeMarkdownContent(["```txt", "- item", "```"].join("\n"))).toBe("- item");
  });

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

  test("keeps whole-message language-specific code fences unchanged", () => {
    const input = ["```json", "{\"ok\":true}", "```"].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(input);
  });

  test("keeps mixed prose and text fences unchanged", () => {
    const input = ["Here is a literal example:", "", "```text", "**not rendered**", "```", "", "Done"].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(input);
  });
});
