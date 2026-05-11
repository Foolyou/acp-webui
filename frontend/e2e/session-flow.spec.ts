import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { SessionDetail, TimelineItem } from "../src/types";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendDir, "../..");
const dataDir = path.join(repoRoot, ".data", "e2e");
const databasePath = path.join(dataDir, "playwright.db");
const backendUrl = "http://127.0.0.1:7638";
const fakeAcpScript = path.join(repoRoot, "frontend", "e2e", "fixtures", "fake-acp.py");
const defaultBackendBinary = process.platform === "win32"
  ? path.join(repoRoot, "target", "debug", "acp-webui.exe")
  : path.join(repoRoot, "target", "debug", "acp-webui");
const backendBinary = process.env.ACP_WEBUI_E2E_BINARY ?? defaultBackendBinary;

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
      "--disable-auth",
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

test("lays out mobile navigation overlay consistently", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await expectMobileNavigationLayout(page);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
});

test("creates a workspace and session, sends a prompt, and restores after refresh", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await expectMobileNavigationLayout(page);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
  await openMenuAndClick(page, /Agents/);
  await expect(page.getByRole("heading", { name: "Agent status" })).toBeVisible();
  await expect(page.locator(".agent-status-card", { hasText: "Codex" })).toBeVisible();
  await openMenuAndClick(page, /Workspaces/);

  await page.getByLabel("Workspace path").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(agentChoice(page, "Codex")).toBeVisible();

  await startSession(page);

  await page.getByPlaceholder("Ask Codex...").fill("Reply with the smoke phrase.");
  await page.keyboard.press("Control+Enter");

  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Reply with the smoke phrase.")).toBeVisible();
  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();

  const ids = sessionRouteIds(page);
  await expectPrimaryNavigationWithoutSessions(page);
  await returnToWorkspaceSessions(page);
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
  await expect(navigation.getByRole("link", { name: /Sessions/ })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: /Workspaces/ })).not.toHaveClass(/(^|\s)active(\s|$)/);
  await expect(navigation.getByRole("link", { name: /acp-webui/ }).first()).toHaveClass(/(^|\s)selected(\s|$)/);
  await navigation.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".notice.warning", { hasText: "This session history is available for review" })).toBeVisible();
  await expect(page.getByPlaceholder("Start a new session to continue")).toBeDisabled();
});

test("interleaves assistant messages and tool activity by event time", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);
  await startSession(page);

  await page.getByPlaceholder("Ask Codex...").fill("Exercise interleaved timeline.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("First assistant segment.")).toBeVisible();
  await expect(page.getByText("Second assistant segment.")).toBeVisible();
  await expect(page.locator(".tool-group-row", { hasText: "npm run timeline" })).toBeVisible();

  const blocks = page.locator(".timeline > article.message, .timeline > .tool-group-row");
  await expect(blocks).toHaveCount(4);
  await expect(blocks.nth(0)).toContainText("Exercise interleaved timeline.");
  await expect(blocks.nth(1)).toContainText("First assistant segment.");
  await expect(blocks.nth(2)).toContainText("npm run timeline");
  await expect(blocks.nth(3)).toContainText("Second assistant segment.");

  const ids = sessionRouteIds(page);
  const detailResponse = await page.request.get(`${backendUrl}/api/sessions/${ids.sessionId}`);
  const detail = (await detailResponse.json()) as SessionDetail;
  const coreTimeline = detail.timeline.filter((item) => item.kind !== "review_artifact");
  expect(coreTimeline.map((item) => item.kind)).toEqual(["message", "message", "tool_call", "message"]);
  expect(
    coreTimeline
      .filter((item): item is Extract<TimelineItem, { kind: "message" }> => item.kind === "message")
      .map((item) => item.content)
  ).toEqual(["Exercise interleaved timeline.", "First assistant segment.", "Second assistant segment."]);
});

test("re-enables prompt composer after a completed turn", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);
  await startSession(page);

  const prompt = page.getByPlaceholder("Ask Codex...");
  await prompt.fill("Reply with the smoke phrase.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("ACP Web UI smoke test OK")).toBeVisible();
  await expandSessionInfo(page);
  await expect(page.locator(".session-toolbar")).toContainText("idle");
  await expect(prompt).toBeEnabled();

  await prompt.fill("markdown response");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Markdown response" })).toBeVisible();
  await expect(page.locator(".session-toolbar")).toContainText("idle");
  await expect(prompt).toBeEnabled();
  await expectPageFitsViewport(page);
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
  await returnToWorkspaceSessions(page);
  const sessionLink = page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`);
  await expect(sessionLink).toContainText("Claude");
});

test("creates YOLO sessions with persistent mode indicators", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await showSessionCreateControls(page);
  await agentChoice(page, "Codex").click();
  await permissionModeSelect(page).selectOption({ label: "YOLO" });
  await expect(permissionModeSelect(page)).toHaveValue("yolo");
  await startSession(page, "Codex", "YOLO");
  await expect(page.locator(".session-toolbar")).toContainText("YOLO");
  await expect(page.locator(".notice.warning", { hasText: "YOLO mode" })).toBeVisible();

  const ids = sessionRouteIds(page);
  await page.reload();
  await expect(page.locator(".session-toolbar")).toContainText("YOLO");
  await expect(page.locator(".notice.warning", { hasText: "YOLO mode" })).toBeVisible();

  await returnToWorkspaceSessions(page);
  const sessionLink = page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`);
  await expect(sessionLink).toContainText("YOLO");
  await expect(sessionLink).toContainText("No approvals / no sandbox");
  await showSessionCreateControls(page);
  await expect(page.getByRole("button", { name: /Last profile.*Codex.*YOLO/i })).toBeVisible();
});

test("displays, switches, persists, and disables advertised model selector", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page, "Codex", "Full auto");
  await expandSessionInfo(page);
  const modelSelect = page.getByLabel("Model");
  await expect(modelSelect).toBeVisible();
  await expect(page.locator(".composer-wrap").getByLabel("Model")).toHaveCount(0);
  await expect(page.locator(".session-toolbar").getByLabel("Model")).toBeVisible();
  await expect(modelSelect).toHaveValue(/fast|pro/);

  await modelSelect.selectOption("pro");
  await expect(modelSelect).toHaveValue("pro");
  await expect(page.getByText("Higher capability")).toBeVisible();

  const ids = sessionRouteIds(page);
  await page.reload();
  await page.goto(`/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}`);
  await expandSessionInfo(page);
  await expect(page.getByLabel("Model")).toHaveValue("pro");

  await returnToWorkspaceSessions(page);
  const sessionLink = page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`);
  await expect(sessionLink).toContainText("Model: Pro model");
  await sessionLink.click();
  await expandSessionInfo(page);

  const runningSelect = page.getByLabel("Model");
  await page.getByPlaceholder("Ask Codex...").fill("Create scroll stream while following.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(runningSelect).toBeDisabled();
  await expect(page.getByText("Following stream line 40")).toBeVisible();

  await page.getByPlaceholder("Ask Codex...").fill("Trigger approval flow.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { name: "Run approval smoke command" })).toBeVisible();
  await expect(page.getByLabel("Model")).toBeDisabled();
  await page.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Approval result: reject-once")).toBeVisible();
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
    permissionMode: "manual",
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
          {
            id: "codex",
            title: "Codex",
            enabled: true,
            status: { state: "ready", message: null },
            permissionModes: [
              {
                id: "manual",
                label: "Manual",
                description: "Ask before approval-managed actions",
                riskLevel: "low",
                status: { state: "ready", message: null }
              },
              {
                id: "yolo",
                label: "YOLO",
                description: "No approvals / no sandbox",
                riskLevel: "high",
                status: { state: "idle", message: "Start session" }
              }
            ]
          },
          {
            id: "claude",
            title: "Claude",
            enabled: true,
            status: { state: "failed", message: "Claude needs local authentication" },
            permissionModes: [
              {
                id: "manual",
                label: "Manual",
                description: "Ask before approval-managed actions",
                riskLevel: "low",
                status: { state: "failed", message: "Claude needs local authentication" }
              }
            ]
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
  await expect(agentChoice(page, "Claude")).toBeEnabled();
  await agentChoice(page, "Claude").click();
  await expect(page.locator(".agent-create-detail")).toContainText("Claude needs local authentication");
  await expect(agentChoice(page, "Codex")).toBeEnabled();
  await agentChoice(page, "Codex").click();
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByPlaceholder("Ask Codex...")).toBeVisible();
});

test("keeps prompt input responsive with a long rendered timeline", async ({ page }) => {
  await mockConnectedWebSocket(page);

  const workspace = {
    id: "long-timeline-workspace",
    name: "Long timeline workspace",
    path: repoRoot,
    createdAt: new Date().toISOString()
  };
  const session = {
    id: "long-timeline-session",
    workspaceId: workspace.id,
    agentId: "codex",
    agentName: "Codex",
    permissionMode: "manual",
    acpSessionId: "long-timeline-acp-session",
    externalSessionId: "long-timeline-acp-session",
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
  const detail: SessionDetail = {
    session,
    workspace,
    configOptions: [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "fast",
        options: [
          { value: "fast", name: "Fast model", description: "Lower latency" },
          { value: "pro", name: "Pro model", description: "Higher capability" }
        ]
      }
    ],
    currentModel: { configId: "model", value: "fast", name: "Fast model" },
    messages: [],
    reviewArtifacts: [],
    timeline: buildLongTimeline(session.id),
    pendingPermission: null,
    pendingPermissions: [],
    pendingApprovalCount: 0,
    queuedApprovalCount: 0,
    failureMessage: null,
    continuity,
    continuable: true,
    viewOnlyReason: null
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
        agents: [{ id: "codex", title: "Codex", enabled: true, status: { state: "ready", message: null } }],
        inbox: []
      })
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([workspace]) });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route(`**/api/sessions/${session.id}`, async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify(detail) });
  });

  await page.goto(`/workspaces/${workspace.id}/sessions/${session.id}`);
  await expect(page.getByText("Long timeline message 180")).toBeVisible();
  await expect(page.locator(".tool-row").first()).toBeVisible();
  await expect(page.locator(".review-card").first()).toBeVisible();
  await expectRedesignedSessionLayout(page, "mobile");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expectRedesignedSessionLayout(page, "desktop");

  const timelineState = await page.locator(".timeline").evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      childCount: element.children.length,
      display: style.display,
      height: rect.height,
      visibility: style.visibility
    };
  });
  expect(timelineState.childCount).toBeGreaterThan(150);
  expect(timelineState.display).not.toBe("none");
  expect(timelineState.visibility).not.toBe("hidden");
  expect(timelineState.height).toBeGreaterThan(0);

  const prompt = "Measure prompt typing through a long rendered timeline without visible input delay.";
  const composer = page.getByPlaceholder("Ask Codex...");
  await expect(composer).toBeEnabled();
  await composer.focus();
  await page.evaluate(() => {
    const textarea = document.querySelector("textarea");
    if (!textarea) {
      throw new Error("Prompt composer textarea not found");
    }
    const metrics = {
      gaps: [] as number[],
      lastInputAt: performance.now()
    };
    (window as typeof window & { __longTimelineTypingMetrics?: typeof metrics }).__longTimelineTypingMetrics = metrics;
    textarea.addEventListener("input", () => {
      const now = performance.now();
      metrics.gaps.push(now - metrics.lastInputAt);
      metrics.lastInputAt = now;
    });
  });
  const startedAt = await page.evaluate(() => {
    const metrics = (window as typeof window & {
      __longTimelineTypingMetrics?: { gaps: number[]; lastInputAt: number };
    }).__longTimelineTypingMetrics;
    if (metrics) {
      metrics.gaps.length = 0;
      metrics.lastInputAt = performance.now();
    }
    return performance.now();
  });
  await page.keyboard.type(prompt);
  const metrics = await page.evaluate(
    ({ expectedPrompt, start }) => {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
      const timeline = document.querySelector<HTMLElement>(".timeline");
      const typingMetrics = (window as typeof window & {
        __longTimelineTypingMetrics?: { gaps: number[]; lastInputAt: number };
      }).__longTimelineTypingMetrics;
      const durationMs = performance.now() - start;
      const gaps = typingMetrics?.gaps ?? [];
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const p95Index = Math.max(0, Math.ceil(sortedGaps.length * 0.95) - 1);
      return {
        inputCount: gaps.length,
        msPerChar: durationMs / expectedPrompt.length,
        p95InputGapMs: sortedGaps[p95Index] ?? 0,
        timelineDisplay: timeline ? getComputedStyle(timeline).display : "missing",
        value: textarea?.value ?? ""
      };
    },
    { expectedPrompt: prompt, start: startedAt }
  );

  expect(metrics.value).toBe(prompt);
  expect(metrics.inputCount).toBe(prompt.length);
  expect(metrics.timelineDisplay).not.toBe("none");
  expect(metrics.msPerChar).toBeLessThan(75);
  expect(metrics.p95InputGapMs).toBeLessThan(150);
});

test("shows mobile skill suggestions for symbol keyboard triggers", async ({ page }) => {
  await mockConnectedWebSocket(page);

  const workspace = {
    id: "skill-trigger-workspace",
    name: "Skill trigger workspace",
    path: repoRoot,
    createdAt: new Date().toISOString()
  };
  const session = {
    id: "skill-trigger-session",
    workspaceId: workspace.id,
    agentId: "codex",
    agentName: "Codex",
    permissionMode: "manual",
    acpSessionId: "skill-trigger-acp-session",
    externalSessionId: "skill-trigger-acp-session",
    status: "idle",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const detail: SessionDetail = {
    session,
    workspace,
    configOptions: [],
    currentModel: null,
    messages: [],
    reviewArtifacts: [],
    timeline: [],
    pendingPermission: null,
    pendingPermissions: [],
    pendingApprovalCount: 0,
    queuedApprovalCount: 0,
    failureMessage: null,
    continuity: {
      state: "live",
      continuable: true,
      restorable: false,
      restoring: false,
      reason: null,
      failureMessage: null,
      restoreStartedAt: null,
      restoreCompletedAt: null
    },
    continuable: true,
    viewOnlyReason: null
  };

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ access: "paired_session", pairingRequired: false, clientIp: "127.0.0.1" })
    });
  });
  await page.route("**/api/app-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        codex: { state: "ready", message: null },
        agents: [{ id: "codex", title: "Codex", enabled: true, status: { state: "ready", message: null } }],
        inbox: []
      })
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([workspace]) });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route("**/api/skills", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify([
        { name: "imagegen", description: "Generate images" },
        { name: "skill-creator", description: "Create skills" }
      ])
    });
  });
  await page.route(`**/api/sessions/${session.id}`, async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify(detail) });
  });

  await page.goto(`/workspaces/${workspace.id}/sessions/${session.id}`);
  const composer = page.getByPlaceholder("Ask Codex...");

  for (const trigger of ["$", "＄", "￥"]) {
    await composer.fill(trigger);
    await expect(page.locator(".skill-autocomplete")).toBeVisible();
    await expect(page.locator(".skill-autocomplete-item")).toHaveCount(2);
    await page.locator(".skill-autocomplete-item", { hasText: "$imagegen" }).click();
    await expect(composer).toHaveValue("$imagegen ");
  }
});

test("recovers missed mobile session messages on visibility return without refresh", async ({ page }) => {
  await mockConnectedWebSocket(page);

  const workspace = {
    id: "mobile-reconnect-workspace",
    name: "Mobile reconnect workspace",
    path: repoRoot,
    createdAt: new Date().toISOString()
  };
  const session = {
    id: "mobile-reconnect-session",
    workspaceId: workspace.id,
    agentId: "codex",
    agentName: "Codex",
    permissionMode: "manual",
    acpSessionId: "mobile-reconnect-acp-session",
    externalSessionId: "mobile-reconnect-acp-session",
    status: "running",
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
  let detail: SessionDetail = {
    session,
    workspace,
    messages: [],
    queuedPrompts: [
      {
        id: "queued-prompt-1",
        sessionId: session.id,
        messageId: "queued-message-1",
        prompt: "queued follow-up",
        status: "queued",
        position: 1,
        createdAt: new Date().toISOString()
      }
    ],
    activeTurn: {
      startedAt: new Date(Date.now() - 65_000).toISOString(),
      status: "running"
    },
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
  };

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ access: "paired_session", pairingRequired: false, clientIp: "127.0.0.1" })
    });
  });
  await page.route("**/api/app-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        codex: { state: "ready", message: null },
        agents: [{ id: "codex", title: "Codex", enabled: true, status: { state: "ready", message: null } }],
        inbox: []
      })
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([workspace]) });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route("**/api/skills", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route(`**/api/sessions/${session.id}`, async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify(detail) });
  });

  await page.goto(`/workspaces/${workspace.id}/sessions/${session.id}`);
  await expect(page.getByPlaceholder("Queue a follow-up for Codex...")).toBeVisible();
  await expect(page.getByText(/Codex is working for 1m/)).toBeVisible();
  await expect(page.getByText("queued follow-up")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  detail = {
    ...detail,
    session: { ...detail.session, status: "idle", updatedAt: new Date().toISOString() },
    activeTurn: null,
    queuedPrompts: [],
    messages: [
      {
        id: "missed-message",
        sessionId: session.id,
        role: "assistant",
        content: "Missed while away",
        status: "idle",
        createdAt: new Date().toISOString()
      }
    ],
    timeline: [
      {
        kind: "message",
        id: "missed-message",
        sessionId: session.id,
        role: "assistant",
        content: "Missed while away",
        status: "idle",
        timestamp: new Date().toISOString()
      }
    ]
  };

  await page.evaluate(() => {
    const sockets = (window as unknown as { __mockSockets?: WebSocket[] }).__mockSockets ?? [];
    sockets.at(-1)?.close();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(page.getByText("Missed while away")).toBeVisible();
  await expect(page.getByPlaceholder("Ask Codex...")).toBeVisible();
});

test("renders compact mobile tool activity rows with evidence and diagnostics", async ({ page }) => {
  await mockConnectedWebSocket(page);

  const workspace = {
    id: "tool-activity-workspace",
    name: "Tool activity workspace",
    path: repoRoot,
    createdAt: new Date().toISOString()
  };
  const session = {
    id: "tool-activity-session",
    workspaceId: workspace.id,
    agentId: "codex",
    agentName: "Codex",
    permissionMode: "manual",
    acpSessionId: "tool-activity-acp-session",
    externalSessionId: "tool-activity-acp-session",
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
  const reviewArtifacts = [
    {
      id: "diff-evidence",
      sessionId: session.id,
      toolCallId: "tool-diff",
      kind: "diff",
      title: "Workspace diff evidence",
      summary: "Updated one frontend file.",
      source: "tool activity fixture",
      createdAt: new Date().toISOString()
    },
    {
      id: "markdown-evidence",
      sessionId: session.id,
      toolCallId: "tool-markdown",
      kind: "markdown",
      title: "Markdown evidence",
      summary: "Generated a compact report.",
      source: "tool activity fixture",
      createdAt: new Date().toISOString()
    }
  ];
  const longCommand =
    "npm run build -- --filter frontend --workspace acp-webui --long-flag-with-a-value=abcdefghijklmnopqrstuvwxyz0123456789";
  const timeline: TimelineItem[] = [
    {
      kind: "tool_call",
      id: "tool-command",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:00.000Z",
      status: "completed",
      toolCallId: "tool-command",
      toolKind: "execute",
      title: "Run frontend build",
      summary: "Build completed.",
      input: { command: longCommand, cwd: repoRoot },
      output: { stdout: "build line 1\nbuild line 2\nbuild line 3" },
      reviewArtifactIds: []
    },
    {
      kind: "tool_call",
      id: "tool-failed",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:01.000Z",
      status: "failed",
      toolCallId: "tool-failed",
      toolKind: "execute",
      title: "Run failing tests",
      summary: "Command failed.",
      input: { command: "npm test -- --run failing-spec" },
      output: {
        stderr:
          "failure line 1\nfailure line 2\nfailure line 3\nfailure line 4\nfailure line 5\nfailure line 6\nfailure line 7"
      },
      reviewArtifactIds: []
    },
    {
      kind: "tool_call",
      id: "tool-diff",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:02.000Z",
      status: "completed",
      toolCallId: "tool-diff",
      toolKind: "apply_patch",
      title: "Apply patch",
      summary: "Patched session UI.",
      input: { path: "frontend/src/features/sessions/SessionPane.tsx" },
      output: null,
      reviewArtifactIds: ["diff-evidence"]
    },
    {
      kind: "tool_call",
      id: "tool-markdown",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:03.000Z",
      status: "completed",
      toolCallId: "tool-markdown",
      toolKind: "markdown",
      title: "Render Markdown evidence",
      summary: "Markdown artifact emitted.",
      input: { path: "doc/report.md" },
      output: null,
      reviewArtifactIds: ["markdown-evidence"]
    },
    {
      kind: "tool_call",
      id: "tool-mcp",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:04.000Z",
      status: "completed",
      toolCallId: "tool-mcp",
      toolKind: "mcp_tool_call",
      title: "Fetch pull request",
      summary: "Fetched PR metadata.",
      input: { server: "github", tool: "fetch_pr" },
      output: null,
      reviewArtifactIds: []
    },
    {
      kind: "tool_call",
      id: "tool-unknown",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:05.000Z",
      status: "completed",
      toolCallId: "tool-unknown",
      toolKind: "custom_tool",
      title: "Do custom work",
      summary: "Custom tool completed.",
      input: { payload: { opaque: true } },
      output: { text: "opaque output" },
      reviewArtifactIds: []
    },
    {
      kind: "review_artifact",
      id: "diff-evidence",
      sessionId: session.id,
      timestamp: "2026-04-30T00:00:06.000Z",
      status: "completed",
      toolCallId: "tool-diff",
      artifactKind: "diff",
      title: "Workspace diff evidence",
      summary: "Updated one frontend file.",
      source: "tool activity fixture"
    }
  ];
  const detail: SessionDetail = {
    session,
    workspace,
    configOptions: [],
    currentModel: null,
    messages: [],
    reviewArtifacts,
    timeline,
    pendingPermission: null,
    pendingPermissions: [],
    pendingApprovalCount: 0,
    queuedApprovalCount: 0,
    failureMessage: null,
    continuity,
    continuable: true,
    viewOnlyReason: null
  };

  await page.route("**/api/auth/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
        body: JSON.stringify({ access: "paired_session", pairingRequired: false, clientIp: "test-client" })
    });
  });
  await page.route("**/api/app-state", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        codex: { state: "ready", message: null },
        agents: [{ id: "codex", title: "Codex", enabled: true, status: { state: "ready", message: null } }],
        inbox: []
      })
    });
  });
  await page.route("**/api/workspaces", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([workspace]) });
  });
  await page.route("**/api/sessions", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route("**/api/skills", async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify([]) });
  });
  await page.route(`**/api/sessions/${session.id}`, async (route) => {
    await route.fulfill({ contentType: "application/json", status: 200, body: JSON.stringify(detail) });
  });
  await page.route(`**/api/sessions/${session.id}/review-artifacts/diff-evidence`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        ...reviewArtifacts[0],
        payload:
          "diff --git a/frontend/src/features/sessions/SessionPane.tsx b/frontend/src/features/sessions/SessionPane.tsx\n@@ -1 +1 @@\n-tool\n+activity"
      })
    });
  });
  await page.route(`**/api/sessions/${session.id}/review-artifacts/markdown-evidence`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({ ...reviewArtifacts[1], payload: "# Tool Activity\n\n- compact evidence" })
    });
  });

  await page.goto(`/workspaces/${workspace.id}/sessions/${session.id}`);
  const toolGroup = page.locator(".tool-group-row");
  await expect(toolGroup).toHaveCount(1);
  await expect(toolGroup).toContainText("Ran 2 commands, changed 1 file, read 1 file, used 2 tools");
  await expect(toolGroup).toContainText("1 failed");
  await expectPageFitsViewport(page);

  await toolGroup.getByRole("button", { name: "Details" }).click();
  await expect(page.locator(".tool-item")).toHaveCount(6);
  await expect(page.locator(".tool-item.command").first()).toContainText("--long-flag-with-a-value");
  await expect(page.locator(".tool-item.failed")).toContainText("failed");
  await expect(page.locator(".tool-item.failed .tool-output")).toContainText("failure line 7");
  await expect(page.locator(".tool-item.mcp")).toContainText("github / fetch_pr");
  await expect(page.locator(".tool-item.generic")).toContainText("Do custom work");

  await page.locator(".tool-item.command").first().getByRole("button", { name: "Output" }).click();
  await expect(page.locator(".tool-item.command").first().locator(".tool-output")).toContainText("build line 3");
  await page.locator(".tool-item.command").first().getByText("Diagnostics").click();
  await expect(page.locator(".tool-item.command").first().locator(".review-pre")).toContainText(longCommand);

  await page.locator(".tool-item.file_change").getByRole("button", { name: "Diff" }).click();
  const diffDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(diffDialog.getByRole("heading", { name: "Workspace diff evidence" })).toBeVisible();
  await expect(diffDialog.locator(".review-pre.diff")).toContainText("SessionPane.tsx");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(diffDialog).toBeHidden();

  await page.locator(".tool-item.file_read", { hasText: "doc/report.md" }).getByRole("button", { name: "Markdown" }).click();
  const markdownDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(markdownDialog.getByRole("heading", { name: "Markdown evidence" })).toBeVisible();
  await expect(markdownDialog.locator(".markdown-preview h1", { hasText: "Tool Activity" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await expect(page.locator(".review-card", { hasText: "Workspace diff evidence" })).toHaveCount(0);
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

  await expect(page.locator(".tool-row", { hasText: "Render Markdown evidence" })).toBeVisible();
  await page.locator(".tool-row", { hasText: "Render Markdown evidence" }).getByRole("button", { name: "Details" }).click();
  await page.locator(".tool-row", { hasText: "Render Markdown evidence" }).getByRole("button", { name: "Markdown" }).click();

  const reviewDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(reviewDialog.getByRole("heading", { name: "Render Markdown evidence" })).toBeVisible();
  await expectOverlayPrimaryControlsReachable(reviewDialog);
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
  await expectLastAssistantMessageBottomInViewport(page);
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

  await page.mouse.move(200, 420);
  await page.mouse.wheel(0, -2200);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toBeVisible();
  await expectTimelineEndBelowViewport(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectTimelineEndNearViewport(page);
  await expect(page.getByRole("button", { name: "Scroll to bottom" })).toHaveCount(0);

  await page.getByPlaceholder("Ask Codex...").fill("Create scroll stream after manual bottom.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Manual bottom stream line 40")).toBeVisible();
  await expectTimelineEndNearViewport(page);
});

test("approves a pending permission request and allows always options", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".mobile-status", { hasText: /idle|ready/ })).toBeVisible();
  await ensureWorkspace(page);

  await startSession(page);
  await page.getByPlaceholder("Ask Codex...").fill("Trigger approval flow.");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("heading", { name: "Run approval smoke command" })).toBeVisible();
  await expectOverlayPrimaryControlsReachable(page.getByRole("dialog", { name: "Approval request" }));
  await expect(page.getByRole("button", { name: /Allow always/ })).toBeEnabled();
  await expect(page.getByPlaceholder("Resolve approval before sending another prompt")).toBeDisabled();

  const workspaceId = sessionWorkspaceId(page);
  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await page.reload();
  await page.goto(`/workspaces/${workspaceId}/sessions`);
  await expect(page.getByRole("link", { name: /Approval: Run approval smoke command/ })).toBeVisible();
  await page.getByRole("link", { name: /Approval: Run approval smoke command/ }).click();

  await page.getByRole("button", { name: "Allow always" }).click();
  await expect(page.getByText("Approval result: allow-always")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "New session" })).toBeVisible();
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

  await expect(page.locator(".tool-row")).toHaveCount(1);
  await expect(page.locator(".tool-row-main")).toContainText("Ran");
  await expect(page.locator(".tool-row-main")).toContainText("git diff -- README.md");
  await page.locator(".tool-row").getByRole("button", { name: "Details" }).click();
  await expect(page.locator(".tool-row").getByRole("button", { name: "Terminal" })).toBeVisible();
  const ids = sessionRouteIds(page);
  await page.evaluate(() => {
    localStorage.removeItem("currentSessionId");
  });
  await page.goto(`/workspaces/${ids.workspaceId}/sessions`);
  await expect(page).toHaveURL(new RegExp(`/workspaces/${ids.workspaceId}/sessions$`));
  const sessionLink = page.locator(`a[href="/workspaces/${ids.workspaceId}/sessions/${ids.sessionId}"]`);
  await expect(sessionLink).toContainText("1 review items");
  await sessionLink.click();
  await page.locator(".tool-row").getByRole("button", { name: "Details" }).click();
  await page.locator(".tool-row").getByRole("button", { name: "Terminal" }).click();
  const reviewDialog = page.getByRole("dialog", { name: "Review artifact" });
  await expect(reviewDialog.getByRole("heading", { name: "Inspect review evidence" })).toBeVisible();
  await expectOverlayPrimaryControlsReachable(reviewDialog);
  await expect(reviewDialog.locator(".muted")).toContainText("git diff -- README.md");
  await page.getByRole("button", { name: "Close" }).click();

  await page.reload();
  await expect(page.locator(".tool-row", { hasText: "git diff -- README.md" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Inspect review evidence/ })).toHaveCount(0);
});

async function mockConnectedWebSocket(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    class MockSocket extends EventTarget {
      readyState = 1;

      constructor() {
        super();
        const windowWithSockets = window as unknown as { __mockSockets?: MockSocket[] };
        windowWithSockets.__mockSockets = windowWithSockets.__mockSockets ?? [];
        windowWithSockets.__mockSockets.push(this);
        setTimeout(() => this.dispatchEvent(new Event("open")), 0);
      }

      send() {}

      close() {
        this.readyState = 3;
        this.dispatchEvent(new CloseEvent("close"));
      }
    }

    window.WebSocket = MockSocket as unknown as typeof WebSocket;
  });
}

function buildLongTimeline(sessionId: string): TimelineItem[] {
  const timestamp = "2026-04-29T00:00:00.000Z";
  const items: TimelineItem[] = [];

  for (let index = 1; index <= 180; index += 1) {
    const id = `long-timeline-${index}`;
    if (index !== 180 && index % 45 === 0) {
      items.push({
        kind: "review_artifact",
        id,
        sessionId,
        timestamp,
        status: "completed",
        toolCallId: `tool-${index}`,
        artifactKind: "markdown",
        title: `Review artifact ${index}`,
        summary: "Compact review artifact summary kept in the long timeline fixture.",
        source: "long timeline performance fixture"
      });
      continue;
    }
    if (index !== 180 && index % 30 === 0) {
      items.push({
        kind: "tool_call",
        id,
        sessionId,
        timestamp,
        status: "completed",
        toolCallId: `tool-${index}`,
        toolKind: "execute",
        title: `Run long timeline command ${index}`,
        summary: "Completed command output for the long timeline performance fixture.",
        input: {
          command: `echo long timeline fixture ${index}`,
          cwd: repoRoot
        },
        output: {
          stdout: `Long timeline command ${index} output\n`.repeat(8)
        },
        reviewArtifactIds: []
      });
      continue;
    }
    if (index !== 180 && index % 37 === 0) {
      items.push({
        kind: "permission",
        id,
        sessionId,
        timestamp,
        status: "resolved",
        toolCallId: `permission-tool-${index}`,
        title: `Resolved permission ${index}`,
        permissionKind: "execute"
      });
      continue;
    }

    items.push({
      kind: "message",
      id,
      sessionId,
      timestamp,
      status: "completed",
      role: index % 2 === 0 ? "assistant" : "user",
      content: [
        `### Long timeline message ${index}`,
        "",
        `This is rich Markdown content in a long rendered timeline row ${index}.`,
        "",
        "- rendered list item",
        "- another rendered list item",
        "",
        "```txt",
        `long timeline code sample ${index}`,
        "```"
      ].join("\n")
    });
  }

  return items;
}

async function ensureWorkspace(page: import("@playwright/test").Page) {
  await openMenuAndClick(page, /Workspaces/);
  const existing = page.getByRole("link", { name: /acp-webui/ }).first();
  if (await existing.isVisible().catch(() => false)) {
    await existing.click();
    return;
  }
  await page.getByLabel("Workspace path").fill(repoRoot);
  await page.getByRole("button", { name: "Add" }).click();
  await expect(agentChoice(page, "Codex")).toBeVisible();
}

function agentChoice(page: import("@playwright/test").Page, agentName: string) {
  return page.locator(".agent-choice", { hasText: agentName }).first();
}

function permissionModeSelect(page: import("@playwright/test").Page) {
  return page.locator(".agent-create-detail").getByLabel("Permission mode");
}

async function showSessionCreateControls(page: import("@playwright/test").Page) {
  const controls = page.locator(".agent-create-controls");
  if ((await controls.count()) > 0 && (await controls.first().isVisible())) {
    return;
  }

  const newSession = page.getByRole("button", { name: "New session" });
  if ((await newSession.count()) > 0 && (await newSession.first().isVisible())) {
    await newSession.first().click();
  }
  await expect(controls.first()).toBeVisible();
}

async function startSession(page: import("@playwright/test").Page, agentName = "Codex", modeName = "Manual") {
  await showSessionCreateControls(page);
  await agentChoice(page, agentName).click();
  await permissionModeSelect(page).selectOption({ label: modeName });
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByPlaceholder(`Ask ${agentName}...`)).toBeVisible();
}

async function openMenuAndClick(page: import("@playwright/test").Page, name: RegExp) {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("link", { name }).click();
}

async function returnToWorkspaceSessions(page: import("@playwright/test").Page) {
  const { workspaceId } = sessionRouteIds(page);
  const legacyBackLink = page.getByRole("link", { name: "Back to sessions" });
  if ((await legacyBackLink.count()) > 0) {
    await legacyBackLink.click();
  } else {
    await page.getByRole("link", { name: "Sessions" }).click();
  }
  await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}/sessions$`));
}

async function expandSessionInfo(page: import("@playwright/test").Page) {
  const toggle = page.getByRole("button", { name: "Show session info" });
  if ((await toggle.count()) > 0) {
    await toggle.click();
  }
}

async function expectPrimaryNavigationWithoutSessions(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  const navigation = page.getByRole("dialog", { name: "Navigation" });
  await expect(navigation.getByRole("link", { name: /Sessions/ })).toHaveCount(0);
  await navigation.getByRole("button", { name: "Close" }).click();
}

async function expectMobileNavigationLayout(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expectOverlayPrimaryControlsReachable(dialog);
  const metrics = await dialog.evaluate((node) => {
    const dialogRect = (node as HTMLElement).getBoundingClientRect();
    const header = (node as HTMLElement).querySelector<HTMLElement>(".modal-header");
    const body = (node as HTMLElement).querySelector<HTMLElement>(".modal-body");
    const brand = header?.querySelector<HTMLElement>(".brand");
    const firstLink = (node as HTMLElement).querySelector<HTMLElement>(".nav-link");
    const bodyStyle = body ? getComputedStyle(body) : null;
    const brandRect = brand?.getBoundingClientRect();
    const firstLinkRect = firstLink?.getBoundingClientRect();
    return {
      bodyPaddingLeft: bodyStyle ? Number.parseFloat(bodyStyle.paddingLeft) : null,
      bodyPaddingRight: bodyStyle ? Number.parseFloat(bodyStyle.paddingRight) : null,
      brandInset: brandRect ? brandRect.left - dialogRect.left : null,
      linkInset: firstLinkRect ? firstLinkRect.left - dialogRect.left : null
    };
  });

  expect(metrics.bodyPaddingLeft).not.toBeNull();
  expect(metrics.bodyPaddingRight).not.toBeNull();
  expect(metrics.brandInset).not.toBeNull();
  expect(metrics.linkInset).not.toBeNull();
  expect(metrics.bodyPaddingLeft!).toBeGreaterThanOrEqual(8);
  expect(metrics.bodyPaddingRight!).toBeGreaterThanOrEqual(8);
  expect(Math.abs(metrics.brandInset! - metrics.linkInset!)).toBeLessThanOrEqual(1);
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

async function expectRedesignedSessionLayout(page: import("@playwright/test").Page, viewport: "desktop" | "mobile") {
  await expectPageFitsViewport(page);
  await expect(page.locator(".session-toolbar")).toBeVisible();
  await expandSessionInfo(page);
  await expect(page.locator(".session-toolbar").getByLabel("Model")).toBeVisible();
  await expect(page.locator(".composer-wrap").getByLabel("Model")).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return { height: bounds.height, top: bounds.top, bottom: bounds.bottom };
    };
    const toolbar = rect(".session-toolbar");
    const composer = rect(".composer-wrap");
    const timeline = rect(".timeline");
    const topbar = rect(".mobile-topbar");
    return {
      composer,
      timeline,
      toolbar,
      topbar,
      viewportHeight: window.innerHeight
    };
  });

  expect(metrics.composer).not.toBeNull();
  expect(metrics.timeline).not.toBeNull();
  expect(metrics.toolbar).not.toBeNull();
  expect(metrics.composer!.height).toBeLessThanOrEqual(viewport === "desktop" ? 130 : 170);
  expect(metrics.timeline!.height).toBeGreaterThan(0);
  expect(metrics.toolbar!.bottom).toBeLessThan(metrics.composer!.top);
  if (viewport === "mobile") {
    expect(metrics.topbar).not.toBeNull();
    expect(metrics.topbar!.bottom).toBeLessThanOrEqual(metrics.toolbar!.top + 1);
  }
}

async function expectOverlayPrimaryControlsReachable(dialog: import("@playwright/test").Locator) {
  await expect(dialog).toBeVisible();
  const metrics = await dialog.evaluate((node) => {
    const bounds = (node as HTMLElement).getBoundingClientRect();
    const buttons = Array.from(node.querySelectorAll<HTMLElement>("button"));
    const visibleButtons = buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    return {
      bottom: bounds.bottom,
      top: bounds.top,
      viewportHeight: window.innerHeight,
      visibleButtonCount: visibleButtons.length
    };
  });

  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.visibleButtonCount).toBeGreaterThan(0);
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
        const scrollingElement = document.scrollingElement ?? document.documentElement;
        const end = document.querySelector(".timeline-end");
        const composer = document.querySelector(".composer-wrap");
        if (!end) return false;
        const rect = end.getBoundingClientRect();
        const composerTop = composer?.getBoundingClientRect().top ?? window.innerHeight;
        const bottomDistance = scrollingElement.scrollHeight - scrollingElement.clientHeight - scrollingElement.scrollTop;
        return bottomDistance <= 8 && rect.bottom <= composerTop + 24 && rect.bottom >= 0;
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

async function expectLastAssistantMessageBottomInViewport(page: import("@playwright/test").Page) {
  await expect
    .poll(async () =>
      page.locator(".message.assistant").last().evaluate((node) => {
        const composerTop = document.querySelector(".composer-wrap")?.getBoundingClientRect().top ?? window.innerHeight;
        const rect = node.getBoundingClientRect();
        return rect.bottom <= composerTop + 4;
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
