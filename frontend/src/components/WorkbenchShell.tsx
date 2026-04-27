import { Outlet, useRouterState } from "@tanstack/react-router";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useState } from "react";
import { useAppContext } from "../app/context";
import { ApprovalSheet } from "../features/approvals/ApprovalSheet";
import { ReviewOverlay } from "../features/reviews/ReviewOverlay";
import { BrandBlock } from "./common";
import { StatusDot, StatusStack } from "./status";
import { WorkbenchNav } from "./WorkbenchNav";

export function WorkbenchShell() {
  const { actions, state, selectedWorkspace } = useAppContext();
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const showSessionApproval = /\/sessions\/[^/]+$/.test(pathname);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <BrandBlock />
        <WorkbenchNav onNavigate={() => setMobileNavOpen(false)} />
        <StatusStack codex={state.codex} socketState={state.socketState} />
      </aside>

      <section className="workbench">
        <header className="mobile-topbar">
          <Button aria-label="Menu" className="icon-button menu-trigger" onPress={() => setMobileNavOpen(true)}>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </Button>
          <div>
            <p className="eyebrow">ACP Web UI</p>
            <h1>{selectedWorkspace?.name ?? "Codex Session"}</h1>
          </div>
          <div className="mobile-status">
            <StatusDot stateText={state.codex.state} />
            <span>{state.codex.state}</span>
          </div>
        </header>

        {state.error ? <div className="notice error">{state.error}</div> : null}
        <Outlet />
      </section>

      <ApprovalSheet
        busy={state.busy}
        currentSession={showSessionApproval ? state.currentSession : null}
        onCancel={actions.cancelApproval}
        onResolve={actions.resolvePermission}
      />
      <ReviewOverlay artifact={state.activeReview} onClose={() => actions.setActiveReview(null)} />

      <ModalOverlay
        className="modal-backdrop nav-backdrop"
        isDismissable
        isOpen={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      >
        <Modal className="mobile-nav-modal">
          <Dialog aria-label="Navigation" className="modal-dialog">
            <div className="modal-header">
              <BrandBlock />
              <Button className="secondary small" onPress={() => setMobileNavOpen(false)}>
                Close
              </Button>
            </div>
            <WorkbenchNav onNavigate={() => setMobileNavOpen(false)} />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </main>
  );
}
