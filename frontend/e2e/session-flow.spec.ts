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
const fakeAcpScript = path.join(repoRoot, "frontend", "e2e", "fixtures", "fake-acp.py");

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
      "uv",
      "--codex-acp-arg",
      "run",
      "--codex-acp-arg=--script",
      "--codex-acp-arg",
      fakeAcpScript
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

test("pairs an anonymous browser before loading app state", async ({ page }) => {
  let paired = false;

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        access: paired ? "paired_session" : "anonymous",
        pairingRequired: !paired,
        clientIp: "192.168.1.23"
      })
    });
  });
  await page.route("**/api/auth/pair", async (route) => {
    const body = route.request().postDataJSON() as { token: string };
    if (body.token !== "test-token") {
      await route.fulfill({
        contentType: "application/json",
        status: 401,
        body: JSON.stringify({ error: "Invalid pairing token" })
      });
      return;
    }
    paired = true;
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      headers: { "set-cookie": "acp_webui_session=fake; Path=/; HttpOnly; SameSite=Lax" },
      body: JSON.stringify({
        access: "paired_session",
        pairingRequired: false,
        clientIp: "192.168.1.23"
      })
    });
  });
  await page.route("**/api/app-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        codex: { state: "ready", message: "Codex" },
        inbox: []
      })
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify([])
    });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify([])
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pair this browser" })).toBeVisible();
  await expect(page.getByText("Client: 192.168.1.23")).toBeVisible();

  await page.getByPlaceholder("Pairing token").fill("wrong");
  await page.getByRole("button", { name: "Pair" }).click();
  await expect(page.getByText("Invalid pairing token")).toBeVisible();

  await page.getByPlaceholder("Pairing token").fill("test-token");
  await page.getByRole("button", { name: "Pair" }).click();
  await expect(page.getByRole("heading", { name: "Local workspaces" })).toBeVisible();
});

test("creates a workspace and session, sends a prompt, and restores after refresh", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: "ready" })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();

  await page.getByPlaceholder("/home/user/project").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: "New Session" })).toBeVisible();

  await page.getByRole("button", { name: "New Session" }).click();
  await expect(page.getByText("Starting Codex...")).toBeVisible();
  await expect(page.getByPlaceholder("Ask Codex...")).toBeVisible();

  await page.getByPlaceholder("Ask Codex...").fill("Reply with the smoke phrase.");
  await page.keyboard.press("Control+Enter");

  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  const ids = sessionRouteIds(page);
  await openMenuAndClick(page, /Sessions/);
  await expect(page.getByRole("link", { name: /acp-webui.*codex.*idle/ })).toBeVisible();

  const detailResponse = await page.request.get(`${backendUrl}/api/sessions/${ids.sessionId}`);
  const detail = await detailResponse.json();
  await page.route(`**/api/sessions/${ids.sessionId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ...detail,
        continuable: false,
        viewOnlyReason: "This session history is available for review, but the live Codex runtime context is not available."
      })
    });
  });
  await page.goto(`/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}`);
  await page.getByRole("button", { name: "Menu" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigation" });
  await expect(navigation.getByRole("link", { name: /Sessions/ })).toHaveClass(/(^|\s)active(\s|$)/);
  await expect(navigation.getByRole("link", { name: /Workspaces/ })).not.toHaveClass(/(^|\s)active(\s|$)/);
  await expect(navigation.getByRole("link", { name: /acp-webui/ }).first()).toHaveClass(/(^|\s)selected(\s|$)/);
  await navigation.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".notice.warning", { hasText: "This session history is available for review" })).toBeVisible();
  await expect(page.getByPlaceholder("Start a new session to continue")).toBeDisabled();
});

test("approves a pending permission request and keeps always options disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: "ready" })).toBeVisible();
  await ensureWorkspace(page);

  await page.getByRole("button", { name: "New Session" }).click();
  await page.getByPlaceholder("Ask Codex...").fill("Trigger approval flow.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("heading", { name: "Run approval smoke command" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Allow always/ })).toBeDisabled();
  await expect(page.getByPlaceholder("Resolve approval before sending another prompt")).toBeDisabled();

  const workspaceId = sessionWorkspaceId(page);
  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await page.reload();
  await page.goto(`/workspaces/${workspaceId}/sessions`);
  await expect(page.getByRole("link", { name: /Approval: Run approval smoke command/ })).toBeVisible();
  await page.getByRole("link", { name: /Approval: Run approval smoke command/ }).click();

  await page.getByRole("button", { name: "Allow once" }).click();
  await expect(page.getByText("Approval result: allow-once")).toBeVisible();
  await openMenuAndClick(page, /Inbox/);
  await expect(page.getByText("No approvals waiting.")).toBeVisible();
});

test("shows session review artifacts in the conversation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: "ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review" })).toHaveCount(0);
  await ensureWorkspace(page);

  await page.getByRole("button", { name: "New Session" }).click();
  await page.getByPlaceholder("Ask Codex...").fill("Trigger review artifact.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toBeVisible();
  await expect(page.locator("details.tool-row")).toHaveCount(1);
  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await openMenuAndClick(page, /Sessions/);
  await expect(page.getByRole("link", { name: /1 review items/ })).toBeVisible();
  await page.getByRole("link", { name: /1 review items/ }).click();
  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toBeVisible();
  await page.getByRole("button", { name: /Inspect review evidence/ }).click();
  const reviewDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(reviewDialog.getByRole("heading", { name: "Inspect review evidence" })).toBeVisible();
  await expect(reviewDialog.getByText("git diff -- README.md")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toHaveCount(1);
});

async function ensureWorkspace(page: import("@playwright/test").Page) {
  await openMenuAndClick(page, /Workspaces/);
  const existing = page.getByRole("link", { name: /acp-webui/ }).first();
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
    return;
  }
  await page.getByPlaceholder("/home/user/project").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("button", { name: "New Session" })).toBeVisible();
}

async function openMenuAndClick(page: import("@playwright/test").Page, name: RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name }).click();
}

function sessionWorkspaceId(page: import("@playwright/test").Page) {
  return sessionRouteIds(page).workspaceId;
}

function sessionRouteIds(page: import("@playwright/test").Page) {
  const match = new URL(page.url()).pathname.match(/^\/workspaces\/([^/]+)\/sessions\/([^/]+)/);
  if (!match) {
    throw new Error(`Current page is not a session route: ${page.url()}`);
  }
  return { sessionId: match[2], workspaceId: match[1] };
}

async function waitForBackend() {
  const deadline = Date.now() + 90_000;
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
