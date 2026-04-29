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
const backendBinary = process.env.ACP_WEBUI_E2E_BINARY ?? path.join(repoRoot, "target", "debug", "acp-webui");

let backend: ChildProcessWithoutNullStreams | undefined;

test.beforeAll(async () => {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });

  await startBackend();
});

test.afterAll(async () => {
  await stopBackend();
});

async function startBackend() {
  backend = spawn(
    backendBinary,
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
      fakeAcpScript,
      "--claude-acp-command",
      "uv",
      "--claude-acp-arg",
      "run",
      "--claude-acp-arg=--script",
      "--claude-acp-arg",
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
}

async function stopBackend() {
  if (!backend) {
    return;
  }
  backend.kill("SIGINT");
  await new Promise<void>((resolve) => {
    backend?.once("exit", () => resolve());
    setTimeout(resolve, 1000);
  });
  backend = undefined;
}

async function restartBackend() {
  await stopBackend();
  await startBackend();
}

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
        agents: [
          {
            id: "codex",
            title: "Codex",
            enabled: true,
            status: { state: "ready", message: "Codex" }
          }
        ],
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

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();

  await page.getByPlaceholder("/home/user/project").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(agentCreateButton(page, "Codex")).toBeVisible();

  await startSession(page);

  await page.getByPlaceholder("Ask Codex...").fill("Reply with the smoke phrase.");
  await page.keyboard.press("Control+Enter");

  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  const ids = sessionRouteIds(page);
  await openMenuAndClick(page, /Sessions/);
  await expect(page.getByRole("link", { name: /acp-webui.*Codex.*idle/i })).toBeVisible();

  const detailResponse = await page.request.get(`${backendUrl}/api/sessions/${ids.sessionId}`);
  const detail = await detailResponse.json();
  await page.route(`**/api/sessions/${ids.sessionId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ...detail,
        continuity: {
          state: "view_only",
          continuable: false,
          restorable: false,
          restoring: false,
          reason: "This session history is available for review, but the live Codex runtime context is not available.",
          failureMessage: null,
          restoreStartedAt: null,
          restoreCompletedAt: null
        },
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

test("creates a Claude session when Claude is selected", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page, "Claude");
  await page.getByPlaceholder("Ask Claude...").fill("Reply with the smoke phrase.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();
  const ids = sessionRouteIds(page);
  await openMenuAndClick(page, /Sessions/);
  const sessionLink = page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`);
  await expect(sessionLink).toContainText("Claude");
});

test("keeps ready agents selectable when another agent has failed", async ({ page }) => {
  await page.addInitScript(() => {
    class MockSocket extends EventTarget {
      readyState = 1;

      constructor() {
        super();
        setTimeout(() => this.dispatchEvent(new Event("open")), 0);
      }

      send() {}

      close() {
        this.dispatchEvent(new CloseEvent("close"));
      }
    }

    window.WebSocket = MockSocket as unknown as typeof WebSocket;
  });

  const workspace = {
    id: "mock-workspace",
    name: "Mock workspace",
    path: repoRoot,
    createdAt: new Date().toISOString()
  };
  const session = {
    id: "mock-session",
    workspaceId: workspace.id,
    agentId: "codex",
    agentName: "Codex",
    acpSessionId: "mock-acp-session",
    externalSessionId: "mock-acp-session",
    status: "idle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const continuity = {
    state: "live",
    continuable: true,
    restorable: false,
    restoring: false,
    reason: null,
    failureMessage: null,
    restoreStartedAt: null,
    restoreCompletedAt: null
  };

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        access: "paired_session",
        pairingRequired: false,
        clientIp: "127.0.0.1"
      })
    });
  });
  await page.route("**/api/app-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        codex: { state: "ready", message: null },
        agents: [
          { id: "codex", title: "Codex", enabled: true, status: { state: "ready", message: null } },
          {
            id: "claude",
            title: "Claude",
            enabled: true,
            status: { state: "failed", message: "Claude needs local authentication" }
          }
        ],
        inbox: []
      })
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify([workspace])
    });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route(`**/api/workspaces/${workspace.id}/sessions`, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          session,
          workspace,
          messages: [],
          reviewArtifacts: [],
          timeline: [],
          pendingPermission: null,
          pendingPermissions: [],
          pendingApprovalCount: 0,
          queuedApprovalCount: 0,
          failureMessage: null,
          continuity,
          continuable: true,
          viewOnlyReason: null
        })
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });

  await page.goto(`/workspaces/${workspace.id}/sessions`);
  await expect(agentCreateButton(page, "Claude")).toBeEnabled();
  await expect(agentCreateButton(page, "Claude")).toContainText("Claude needs local authentication");
  await expect(agentCreateButton(page, "Codex")).toBeEnabled();
  await agentCreateButton(page, "Codex").click();
  await expect(page.getByPlaceholder("Ask Codex...")).toBeVisible();
});

test("restores a persisted session after backend restart and sends a follow-up prompt", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Create scroll history.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Scroll history line 80")).toBeVisible();

  const ids = sessionRouteIds(page);
  await restartBackend();
  await page.goto(`/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}`);

  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore" })).toBeInViewport();
  await expect(page.getByPlaceholder("Restore session to continue")).toBeDisabled();
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.getByPlaceholder("Ask Codex...")).toBeEnabled();
  await expect(page.getByText("ACPWebUIsmoketestOK")).toHaveCount(0);
  await expectPageFitsViewport(page);
  const smokeMessages = page.locator(".message.assistant", { hasText: "ACP Web UI smoke test OK" });
  const restoredMessageCount = await smokeMessages.count();
  await page.getByPlaceholder("Ask Codex...").fill("Follow up after restore.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(smokeMessages).toHaveCount(restoredMessageCount + 1);
  await expectPageFitsViewport(page);
});

test("shows restore failure and view-only fallback states", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  const ids = sessionRouteIds(page);
  const detailResponse = await page.request.get(`${backendUrl}/api/sessions/${ids.sessionId}`);
  const detail = await detailResponse.json();
  const loadableDetail = {
    ...detail,
    continuity: {
      state: "loadable",
      continuable: false,
      restorable: true,
      restoring: false,
      reason: "Restore this session before sending another prompt.",
      failureMessage: null,
      restoreStartedAt: null,
      restoreCompletedAt: null
    },
    continuable: false,
    viewOnlyReason: "Restore this session before sending another prompt."
  };

  await page.route(`**/api/sessions/${ids.sessionId}`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify(loadableDetail)
    });
  });
  await page.route(`**/api/sessions/${ids.sessionId}/restore`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 409,
      body: JSON.stringify({ error: "restore unavailable" })
    });
  });

  await page.reload();
  await page.goto(`/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}`);
  await expect(page.getByRole("button", { name: "Restore" })).toBeVisible();
  await expect(page.getByPlaceholder("Restore session to continue")).toBeDisabled();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator(".notice.error", { hasText: "restore unavailable" })).toBeVisible();
});

test("renders markdown messages and markdown review artifacts", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Show **markdown response**.");
  await page.keyboard.press("Control+Enter");

  const timeline = page.locator(".timeline");
  await expect(timeline.locator(".message.user strong", { hasText: "markdown response" })).toBeVisible();
  await expect(timeline.locator(".message.assistant h1", { hasText: "Markdown response" })).toBeVisible();
  await expect(timeline.locator(".message.assistant li", { hasText: "rendered list item" })).toBeVisible();
  await expect(timeline.locator(".message.assistant code", { hasText: "const value = 1;" })).toBeVisible();
  await expect(timeline.getByText("bad()")).toHaveCount(0);
  await page.getByPlaceholder("Ask Codex...").fill("Trigger markdown artifact.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator("details.tool-row summary", { hasText: "Render Markdown evidence" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Render Markdown evidence/ })).toBeVisible();
  await page.getByRole("button", { name: /Render Markdown evidence/ }).click();

  const reviewDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(reviewDialog.getByRole("heading", { name: "Render Markdown evidence" })).toBeVisible();
  await expect(reviewDialog.locator(".markdown-preview h1", { hasText: "Markdown Evidence" })).toBeVisible();
  await expect(reviewDialog.locator(".markdown-preview li", { hasText: "artifact list item" })).toBeVisible();
  await expect(reviewDialog.locator(".markdown-preview code", { hasText: "const artifact = true;" })).toBeVisible();
  await expect(reviewDialog.locator(".markdown-preview").getByText("window.__bad")).toHaveCount(0);
  await reviewDialog.locator(".raw-details summary").click();
  await expect(reviewDialog.locator(".raw-details")).toContainText("# Markdown Evidence");
  await page.getByRole("button", { name: "Close" }).click();
});

test("wraps long assistant pre blocks", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Show wrapping response.");
  await page.getByRole("button", { name: "Send" }).click();

  const timeline = page.locator(".timeline");
  await expect(timeline.locator(".message.assistant pre").last()).toBeVisible();
  await expect(timeline.locator(".message.assistant blockquote").last()).toBeVisible();
  await expectAssistantPreFitsViewport(page);
  await expectAssistantQuoteFitsViewport(page);
});

test("repairs assistant markdown fences glued to prose", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Show malformed fence response.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Final paragraph")).toBeVisible();
  const assistant = page.locator(".message.assistant", { hasText: "Final paragraph" });
  await expect(assistant.locator("pre")).toHaveCount(3);
  await expect(assistant.locator("pre").nth(0)).toContainText("first block");
  await expect(assistant.locator("p", { hasText: "Next paragraph" })).toBeVisible();
  await expect(assistant.locator("pre").nth(1)).toContainText('{"ok":true}');
  await expect(assistant.locator("p", { hasText: "More text" })).toBeVisible();
  await expect(assistant.locator("pre").nth(2)).toContainText("GET session detail");
  await expect(assistant.locator("p", { hasText: "Final paragraph" })).toBeVisible();
  await expect(assistant.locator("pre", { hasText: "```" })).toHaveCount(0);
});

test("auto-scrolls session timeline unless the user scrolls away", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Create scroll history.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Scroll history line 80")).toBeVisible();
  await expectTimelineEndNearViewport(page);

  const ids = sessionRouteIds(page);
  await page.reload();
  await page.goto(`/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}`);
  await expect(page.getByText("Scroll history line 80")).toBeVisible();
  await expectTimelineEndNearViewport(page);

  await page.getByPlaceholder("Ask Codex...").fill("Create scroll stream while following.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Following stream line 40")).toBeVisible();
  await expectTimelineEndNearViewport(page);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toHaveCount(0);

  await page.mouse.move(200, 420);
  await page.mouse.wheel(0, -2200);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toBeVisible();
  await expectTimelineEndBelowViewport(page);
  const pausedScrollY = await page.evaluate(() => window.scrollY);

  await page.getByPlaceholder("Ask Codex...").fill("Create scroll stream while paused.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.locator(".message.assistant", { hasText: "Paused stream line 40" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toBeVisible();
  const afterPausedStreamY = await page.evaluate(() => window.scrollY);
  expect(Math.abs(afterPausedStreamY - pausedScrollY)).toBeLessThan(80);

  await page.getByRole("button", { name: "Scroll to bottom" }).click();
  await expect(page.getByText("Paused stream line 40")).toBeVisible();
  await expectTimelineEndNearViewport(page);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toHaveCount(0);

  await page.mouse.wheel(0, -2200);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectTimelineEndNearViewport(page);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toHaveCount(0);

  await page.getByPlaceholder("Ask Codex...").fill("Create scroll stream after manual bottom.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Manual bottom stream line 40")).toBeVisible();
  await expectTimelineEndNearViewport(page);
});

test("approves a pending permission request and keeps always options disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
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

test("opens home to the workspace sessions list instead of the last session", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  const ids = sessionRouteIds(page);

  await page.goto("/");

  await expect(page).toHaveURL(new RegExp(`/workspaces/${ids.workspaceId}/sessions$`));
  await expect(agentCreateButton(page, "Codex")).toBeVisible();
  await expect(page.getByPlaceholder("Ask Codex...")).toHaveCount(0);
});

test("advances through queued approval requests in one session", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Trigger queued approval flow.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("heading", { name: "Run first queued command" })).toBeVisible();
  await expect(page.getByText("1 queued").first()).toBeVisible();
  await page.getByRole("button", { name: "Allow once" }).click();

  await expect(page.getByRole("heading", { name: "Run second queued command" })).toBeVisible();
  await page.getByRole("button", { name: "Allow once" }).click();

  await expect(page.getByText("Queued approvals: allow-once, allow-once")).toBeVisible();
  await openMenuAndClick(page, /Inbox/);
  await expect(page.getByText("No approvals waiting.")).toBeVisible();
});

test("shows session review artifacts in the conversation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review" })).toHaveCount(0);
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Trigger review artifact.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toBeVisible();
  await expect(page.locator("details.tool-row")).toHaveCount(1);
  await expect(page.locator("details.tool-row > summary")).toContainText("Ran");
  await expect(page.locator("details.tool-row > summary")).toContainText("git diff -- README.md");
  const ids = sessionRouteIds(page);
  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await openMenuAndClick(page, /Sessions/);
  const sessionLink = page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`);
  await expect(sessionLink).toContainText("1 review items");
  await sessionLink.click();
  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toBeVisible();
  await page.getByRole("button", { name: /Inspect review evidence/ }).click();
  const reviewDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(reviewDialog.getByRole("heading", { name: "Inspect review evidence" })).toBeVisible();
  await expect(reviewDialog.locator(".muted")).toContainText("git diff -- README.md");
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
  await expect(agentCreateButton(page, "Codex")).toBeVisible();
}

function agentCreateButton(page: import("@playwright/test").Page, agentName: string) {
  return page
    .locator(".section-actions .agent-create-controls")
    .getByRole("button", { name: new RegExp(agentName) });
}

async function startSession(page: import("@playwright/test").Page, agentName = "Codex") {
  await agentCreateButton(page, agentName).click();
  await expect(page.getByPlaceholder(`Ask ${agentName}...`)).toBeVisible();
}

async function openMenuAndClick(page: import("@playwright/test").Page, name: RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name }).click();
}

async function expectPageFitsViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const sessionLayout = document.querySelector(".session-layout");
        const layoutOverflow = sessionLayout ? sessionLayout.scrollWidth - sessionLayout.clientWidth : 0;
        const pageOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
        return Math.max(pageOverflow, layoutOverflow);
      })
    )
    .toBeLessThanOrEqual(1);
}

async function expectAssistantQuoteFitsViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const quotes = Array.from(document.querySelectorAll<HTMLElement>(".message.assistant blockquote"));
        const quote = quotes[quotes.length - 1];
        const quotedCode = quote?.querySelector<HTMLElement>("pre");
        const pageOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
        if (!quote) return 999;
        return Math.max(
          pageOverflow,
          quote.scrollWidth - quote.clientWidth,
          quotedCode ? quotedCode.scrollWidth - quotedCode.clientWidth : 0
        );
      })
    )
    .toBeLessThanOrEqual(1);
}

async function expectAssistantPreFitsViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll<HTMLElement>(".message.assistant pre"));
        const pre = blocks[blocks.length - 1];
        const pageOverflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
        if (!pre) return 999;
        return Math.max(pageOverflow, pre.scrollWidth - pre.clientWidth);
      })
    )
    .toBeLessThanOrEqual(1);
}

async function expectTimelineEndNearViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const end = document.querySelector(".timeline-end");
        if (!end) return false;
        const rect = end.getBoundingClientRect();
        return rect.top <= window.innerHeight && rect.bottom >= 0;
      })
    )
    .toBe(true);
}

async function expectTimelineEndBelowViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const end = document.querySelector(".timeline-end");
        if (!end) return false;
        const rect = end.getBoundingClientRect();
        return rect.top > window.innerHeight;
      })
    )
    .toBe(true);
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
        if (state.codex.state === "idle" || state.codex.state === "ready") {
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
