import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendDir, "../..");
const dataDir = path.join(repoRoot, ".data", "e2e");
const databasePath = path.join(dataDir, "playwright.db");
const backendUrl = "http://127.0.0.1:7638";

let backend: ChildProcessWithoutNullStreams | undefined;

test.beforeAll(async () => {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });

  backend = spawn(
    path.join(repoRoot, "target", "debug", "acp-webui"),
    [
      "--bind-host",
      "127.0.0.1",
      "--bind-port",
      "7638",
      "--database-url",
      `sqlite://${databasePath}`,
      "--codex-acp-command",
      "python3",
      "--codex-acp-arg",
      path.join(repoRoot, "frontend", "e2e", "fixtures", "fake-acp.py")
    ],
    {
      cwd: repoRoot,
      stdio: "pipe"
    }
  );

  backend.stdout.on("data", (chunk) => process.stdout.write(`[backend] ${chunk}`));
  backend.stderr.on("data", (chunk) => process.stderr.write(`[backend] ${chunk}`));

  await waitForBackend();
});

test.afterAll(async () => {
  if (!backend) {
    return;
  }
  backend.kill("SIGINT");
  await new Promise<void>((resolve) => {
    backend?.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
});

test("creates a workspace and session, sends a prompt, and restores after refresh", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("ready").first()).toBeVisible();
  await page.getByPlaceholder("/home/user/project").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: /acp-webui/ })).toBeVisible();

  await page.getByRole("button", { name: "New Codex Session" }).click();
  await expect(page.getByPlaceholder("Ask Codex...")).toBeVisible();

  await page.getByPlaceholder("Ask Codex...").fill("Reply with the smoke phrase.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();
});

async function waitForBackend() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${backendUrl}/api/app-state`);
      if (response.ok) {
        const state = (await response.json()) as { codex: { state: string } };
        if (state.codex.state === "ready") {
          return;
        }
      }
    } catch {
      // Retry until the backend is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Backend did not become ready");
}
