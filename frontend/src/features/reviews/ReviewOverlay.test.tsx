import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";
import { ReviewOverlay } from "./ReviewOverlay";

vi.mock("react-aria-components", () => ({
  Button: ({ children, className }: { children: ReactNode; className?: string }) => (
    <button className={className}>{children}</button>
  ),
  Dialog: ({ children, className }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
  Heading: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Modal: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  ModalOverlay: ({ children, isOpen }: { children: ReactNode; isOpen?: boolean }) =>
    isOpen ? <div>{children}</div> : null
}));

describe("ReviewOverlay", () => {
  test("renders changed files in the unified review viewer", () => {
    const html = renderToStaticMarkup(
      <ReviewOverlay
        artifact={{
          id: "artifact-1",
          sessionId: "session-1",
          kind: "changed_files",
          title: "Changed files",
          summary: "Two files changed",
          payload: {
            files: [
              { path: "frontend/src/App.tsx", status: "modified" },
              { path: "server.go", status: "modified" }
            ]
          },
          source: "tool_call",
          createdAt: "2026-04-30T00:00:00Z"
        }}
        onClose={vi.fn()}
      />
    );

    expect(html).toContain("review-modal");
    expect(html).toContain("frontend/src/App.tsx");
    expect(html).toContain("server.go");
    expect(html).toContain("modified");
  });
});
