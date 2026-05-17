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

  test("unwraps whole-message markdown fences before repairing nested fences", () => {
    const input = [
      "````markdown",
      "请先确认这一段 opening fence 是否会被正确拆开：```powershell",
      "cd <project-path>",
      ".\\scripts\\build-run-release.ps1 -TailscaleServer -NoRun",
      "```",
      "",
      "再测 closing fence 粘连：",
      "```text",
      "DM private: control mode - workspace / session / agent",
      "- only respond to explicit bot mentions```",
      "````"
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(
      [
        "请先确认这一段 opening fence 是否会被正确拆开：",
        "```powershell",
        "cd <project-path>",
        ".\\scripts\\build-run-release.ps1 -TailscaleServer -NoRun",
        "```",
        "",
        "再测 closing fence 粘连：",
        "```text",
        "DM private: control mode - workspace / session / agent",
        "- only respond to explicit bot mentions",
        "```"
      ].join("\n")
    );
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

  test("repairs fenced code closings glued to the previous content line", () => {
    const input = [
      "```text",
      "DM private: control mode - workspace / session / agent",
      "- only respond to explicit bot mentions```",
      "",
      "1. **Default chat entry**",
      "   - Recommendation: use direct messages for control."
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(
      [
        "```text",
        "DM private: control mode - workspace / session / agent",
        "- only respond to explicit bot mentions",
        "```",
        "",
        "1. **Default chat entry**",
        "   - Recommendation: use direct messages for control."
      ].join("\n")
    );
  });

  test("repairs text fences glued to their first content line", () => {
    const input = ["```textGET session detail", "  -> ok", "```Done"].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(["```text", "GET session detail", "  -> ok", "```", "Done"].join("\n"));
  });

  test("repairs fenced code openings glued to preceding prose", () => {
    const input = [
      "请在新的 PowerShell 窗口里运行下面两步：```powershell",
      "cd <project-path>",
      ".\\scripts\\build-run-release.ps1 -TailscaleServer -NoRun",
      "```",
      "然后重启服务。"
    ].join("\n");

    expect(normalizeMarkdownContent(input)).toBe(
      [
        "请在新的 PowerShell 窗口里运行下面两步：",
        "```powershell",
        "cd <project-path>",
        ".\\scripts\\build-run-release.ps1 -TailscaleServer -NoRun",
        "```",
        "然后重启服务。"
      ].join("\n")
    );
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
