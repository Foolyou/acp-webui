import { describe, expect, test } from "vitest";
import { normalizeMarkdownContent } from "./markdownNormalize";

describe("normalizeMarkdownContent", () => {
  test("keeps valid markdown unchanged", () => {
    const input = ["Intro", "", "```ts", "const value = 1;", "```", "", "- item"].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(input);
  });

  test("does not unwrap markdown source fences", () => {
    const input = [
      "````markdown",
      "```powershell",
      "cd <project-path>",
      "```",
      "````"
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(input);
  });

  test("does not repair malformed glued fences", () => {
    const input = [
      "```markdown请确认：```powershell",
      "cd <project-path>",
      "```",
      "```"
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(input);
  });
});
