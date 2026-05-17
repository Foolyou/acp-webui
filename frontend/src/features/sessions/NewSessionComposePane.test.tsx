import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import type { AgentRuntimeStatus, Workspace } from "../../types";

const mocks = vi.hoisted(() => ({
  buttons: [] as Array<{ isDisabled?: boolean; label: string; onPress?: () => void }>,
  button: vi.fn(
    ({
      children,
      isDisabled,
      onPress
    }: {
      children: ReactNode;
      isDisabled?: boolean;
      onPress?: () => void;
    }) => {
      mocks.buttons.push({ isDisabled, label: textFromNode(children), onPress });
      return <button disabled={isDisabled}>{children}</button>;
    }
  )
}));

function textFromNode(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textFromNode).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node && typeof node === "object" && "props" in node) {
    return textFromNode((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

vi.mock("react-aria-components", () => ({
  Button: mocks.button
}));

vi.mock("../../api", () => ({
  api: {
    promptTemplates: vi.fn(async () => []),
    usePromptTemplate: vi.fn()
  },
  errorMessage: (error: unknown) => String(error)
}));

function agent(overrides: Partial<AgentRuntimeStatus> = {}): AgentRuntimeStatus {
  return {
    id: "codex",
    title: "Codex",
    enabled: true,
    status: { state: "ready" },
    permissionModes: [
      {
        id: "manual",
        label: "Manual",
        description: "Ask before actions",
        riskLevel: "low",
        status: { state: "ready" }
      }
    ],
    launchControls: [
      {
        id: "model",
        label: "Model",
        category: "model",
        scope: "launch",
        type: "select",
        defaultValue: "fast",
        options: [
          { value: "fast", label: "Fast" },
          { value: "pro", label: "Pro" }
        ]
      }
    ],
    ...overrides
  };
}

function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: "workspace-a",
    name: "Workspace Alpha",
    path: "<project-path>",
    createdAt: "2026-04-30T00:00:00Z",
    ...overrides
  };
}

describe("NewSessionComposePane", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    localStorage.clear();
    mocks.buttons = [];
    mocks.button.mockClear();
  });

  test("offers remembered workspace profile without creating a session", async () => {
    localStorage.setItem(
      "lastSessionProfilesByWorkspace",
      JSON.stringify({
        version: 1,
        profiles: {
          "workspace-a": {
            agentId: "codex",
            permissionMode: "manual",
            launchControlValues: { model: "pro", permission: "manual" }
          }
        }
      })
    );
    const onCreate = vi.fn();
    const { NewSessionComposePane } = await import("./NewSessionComposePane");

    const html = renderToStaticMarkup(
      <NewSessionComposePane
        agents={[agent()]}
        busy={false}
        onCreate={onCreate}
        workspace={workspace()}
        workspaceId="workspace-a"
      />
    );

    expect(html).toContain("Start last profile");
    expect(html).toContain("Configure manually");
    mocks.buttons.find((button) => button.label.includes("Start last profile"))?.onPress?.();
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("opens manual configuration directly and allows empty prompts without a workspace profile", async () => {
    const onCreate = vi.fn();
    const { NewSessionComposePane } = await import("./NewSessionComposePane");

    const html = renderToStaticMarkup(
      <NewSessionComposePane
        agents={[agent()]}
        busy={false}
        onCreate={onCreate}
        workspace={workspace()}
        workspaceId="workspace-a"
      />
    );

    expect(html).toContain("First prompt");
    expect(html).toContain("Permission mode");
    expect(html).not.toContain("Start last profile");
    expect(mocks.buttons.find((button) => button.label.includes("Create session"))?.isDisabled).toBe(false);
    await mocks.buttons.find((button) => button.label.includes("Create session"))?.onPress?.();
    expect(onCreate).toHaveBeenCalledWith("codex", "manual", { model: "fast", permission: "manual" }, "");
  });
});
