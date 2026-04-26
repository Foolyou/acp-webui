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
  await page.getByRole("button", { name: "New Session" }).click();
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

  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByRole("button", { name: /acp-webui.*codex.*idle/ })).toBeVisible();
});

test("approves a pending permission request and keeps always options disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("ready").first()).toBeVisible();
  await ensureWorkspace(page);

  await page.getByRole("button", { name: "New Codex Session" }).click();
  await page.getByPlaceholder("Ask Codex...").fill("Trigger approval flow.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("heading", { name: "Run approval smoke command" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Allow always/ })).toBeDisabled();
  await expect(page.getByPlaceholder("Resolve approval before sending another prompt")).toBeDisabled();

  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await page.reload();
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByRole("button", { name: /Approval: Run approval smoke command/ })).toBeVisible();
  await page.getByRole("button", { name: /Approval: Run approval smoke command/ }).click();

  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByText("Approval result: allow-once")).toBeVisible();
  await page.getByRole("button", { name: "Inbox" }).click();
  await expect(page.getByText("No approvals waiting.")).toBeVisible();
});

test("shows session review artifacts in the conversation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("ready").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Review" })).toHaveCount(0);
  await ensureWorkspace(page);

  await page.getByRole("button", { name: "New Codex Session" }).click();
  await page.getByPlaceholder("Ask Codex...").fill("Trigger review artifact.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toBeVisible();
  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByRole("button", { name: /1 review items/ })).toBeVisible();
  await page.getByRole("button", { name: /1 review items/ }).click();
  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toBeVisible();
  await page.getByRole("button", { name: /Inspect review evidence/ }).click();
  await expect(page.getByRole("heading", { name: "Inspect review evidence" })).toBeVisible();
  await expect(page.getByText("git diff -- README.md")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toHaveCount(1);
});

async function ensureWorkspace(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Sessions" }).click();
  await page.getByRole("button", { name: "New Session" }).click();
  const existing = page.getByRole("button", { name: /acp-webui/ }).first();
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
    return;
  }
  await page.getByPlaceholder("/home/user/project").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: /acp-webui/ })).toBeVisible();
}

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
