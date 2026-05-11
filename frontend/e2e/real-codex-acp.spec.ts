import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendDir, "../..");
const dataDir = path.join(repoRoot, ".data", "real-codex-e2e");
const databasePath = path.join(dataDir, "real-codex.db");
const backendUrl = process.env.ACP_WEBUI_REAL_CODEX_BASE_URL ?? "http://127.0.0.1:7635";
const backendUrlParts = new URL(backendUrl);
const backendBinary =
  process.env.ACP_WEBUI_REAL_CODEX_BINARY ??
  (process.platform === "win32"
    ? path.join(repoRoot, "target", "release", "acp-webui.exe")
    : path.join(repoRoot, "target", "release", "acp-webui"));
const codexAcpCommand = process.env.ACP_WEBUI_REAL_CODEX_COMMAND ?? "codex-acp";
const pairingToken = process.env.ACP_WEBUI_REAL_CODEX_PAIRING_TOKEN ?? `real-codex-${randomUUID()}`;
const responseMarker = "REAL_CODEX_ACP_E2E_OK";

let backend: ChildProcessWithoutNullStreams | undefined;

test.describe("real codex-acp browser flow", () => {
  test.skip(process.env.ACP_WEBUI_REAL_CODEX_E2E !== "1", "Set ACP_WEBUI_REAL_CODEX_E2E=1 to run against real codex-acp.");
  test.setTimeout(360_000);

  test.beforeAll(async () => {
    if (process.env.ACP_WEBUI_REAL_CODEX_EXTERNAL_SERVER === "1") {
      await waitForBackend();
      return;
    }

    rmSync(dataDir, { recursive: true, force: true });
    mkdirSync(dataDir, { recursive: true });

    backend = spawn(
      backendBinary,
      [
        "--bind-host",
        backendUrlParts.hostname,
        "--bind-port",
        backendUrlParts.port || "7635",
        "--database-url",
        `sqlite://${databasePath}`,
        "--pairing-token",
        pairingToken,
        "--codex-acp-command",
        codexAcpCommand
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
    await stopBackend();
  });

  test("pairs, creates a Codex session, receives a real reply, and restores after refresh", async ({ page }) => {
    await page.goto(backendUrl);

    await expect(page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
    await page.getByPlaceholder("Pairing token").fill(pairingToken);
    await page.getByRole("button", { name: "Pair" }).click();

    await expect(page.getByRole("heading", { name: "Local workspaces" })).toBeVisible({ timeout: 60_000 });
    await page.getByLabel("Workspace path").fill(repoRoot);
    await page.getByRole("button", { name: "Add" }).click();

    await expect(agentChoice(page, "Codex")).toBeVisible({ timeout: 60_000 });
    await agentChoice(page, "Codex").click();
    await permissionModeSelect(page).selectOption({ label: "Manual" });
    await expect(page.locator(".agent-create-detail").getByLabel("Reasoning").locator("option", { hasText: "Minimal" })).toHaveCount(0);
    await page.locator(".agent-create-detail").getByLabel("Response mode").selectOption("fast");
    await page.getByRole("button", { name: "Create session" }).click();

    const prompt = page.getByPlaceholder("Ask Codex...");
    await expect(prompt).toBeVisible({ timeout: 120_000 });
    await prompt.fill(`Reply exactly with ${responseMarker} and no other text.`);
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.locator(".message.assistant", { hasText: responseMarker })).toBeVisible({ timeout: 240_000 });
    await expandSessionInfo(page);
    await expect(page.locator(".session-toolbar")).toContainText("idle", { timeout: 60_000 });

    const ids = sessionRouteIds(page);
    await page.reload();
    await expect(page.locator(".message.assistant", { hasText: responseMarker })).toBeVisible({ timeout: 60_000 });

    await page.getByRole("link", { name: "Sessions" }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${ids.workspaceId}/sessions$`));
    await expect(page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`)).toContainText("Codex");
  });
});

async function waitForBackend() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${backendUrl}/api/auth/status`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the backend is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Backend did not become ready");
}

async function stopBackend() {
  if (!backend?.pid) {
    backend = undefined;
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(backend.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    backend.kill("SIGINT");
  }

  await new Promise<void>((resolve) => {
    backend?.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
  backend = undefined;
}

function agentChoice(page: import("@playwright/test").Page, agentName: string) {
  return page.locator(".agent-choice", { hasText: agentName }).first();
}

function permissionModeSelect(page: import("@playwright/test").Page) {
  return page.locator(".agent-create-detail").getByLabel("Permission mode");
}

async function expandSessionInfo(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: "Show session info" });
  if ((await toggle.count()) > 0) {
    await toggle.click();
  }
}

function sessionRouteIds(page: import("@playwright/test").Page) {
  const match = new URL(page.url()).pathname.match(/^\/workspaces\/([^/]+)\/sessions\/([^/]+)/);
  if (!match) {
    throw new Error(`Current page is not a session route: ${page.url()}`);
  }
  return { sessionId: match[2], workspaceId: match[1] };
}
