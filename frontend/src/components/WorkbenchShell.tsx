import { Outlet } from "@tanstack/react-router";
import { Button, Dialog, Modal, ModalOverlay } from "react-aria-components";
import { useState } from "react";
import { useAppContext } from "../app/context";
import { ReviewOverlay } from "../features/reviews/ReviewOverlay";
import { BrandBlock } from "./common";
import { FullscreenButton } from "./FullscreenButton";
import { NotificationButton } from "./NotificationButton";
import { StatusDot } from "./status";
import { WorkbenchNav } from "./WorkbenchNav";

export function WorkbenchShell() {
  const { actions, state, selectedWorkspace } = useAppContext();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileStatus = state.agents.find((agent) => agent.status.state === "ready")?.status.state ?? state.agents[0]?.status.state ?? state.codex.state;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <BrandBlock />
        <WorkbenchNav onNavigate={() => setMobileNavOpen(false)} />
        <div className="shell-controls">
          <NotificationButton />
          <FullscreenButton />
        </div>
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
            <h1>{selectedWorkspace?.name ?? "Agent Session"}</h1>
          </div>
          <div className="mobile-topbar-actions">
            <div className="mobile-status">
              <StatusDot stateText={mobileStatus} />
              <span>{mobileStatus}</span>
            </div>
            <NotificationButton />
            <FullscreenButton />
          </div>
        </header>

        {state.error ? <div className="notice error">{state.error}</div> : null}
        <Outlet />
      </section>

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
            <div className="modal-body">
              <WorkbenchNav onNavigate={() => setMobileNavOpen(false)} />
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </main>
  );
}
