import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import type { PermissionOption, PermissionRequest, SessionDetail } from "../../types";
import { toolSummary } from "../../utils/payload";

export function ApprovalSheet({
  busy,
  currentSession,
  onCancel,
  onResolve
}: {
  busy: boolean;
  currentSession: SessionDetail | null;
  onCancel: () => void;
  onResolve: (permission: PermissionRequest, optionId: string) => void;
}) {
  const permission = currentSession?.pendingPermission;
  const open = Boolean(permission);
  return (
    <ModalOverlay className="modal-backdrop" isDismissable={false} isOpen={open}>
      <Modal className="sheet-modal">
        <Dialog aria-label="Approval request" className="modal-dialog">
          {permission && currentSession ? (
            <>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">{permission.kind}</p>
                  <Heading slot="title">{permission.title}</Heading>
                </div>
                <Button className="secondary small" isDisabled={busy} onPress={onCancel}>
                  Cancel
                </Button>
              </div>
              <div className="modal-body">
                <div className="approval-context">
                  <span>{currentSession.workspace.name}</span>
                  <span>{currentSession.session.agentName}</span>
                </div>
                <pre className="tool-summary">{toolSummary(permission.toolCall)}</pre>
              </div>
              <div className="modal-footer approval-actions">
                {permission.options.map((option) => (
                  <PermissionOptionButton
                    busy={busy}
                    key={option.optionId}
                    onResolve={() => onResolve(permission, option.optionId)}
                    option={option}
                  />
                ))}
              </div>
            </>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function PermissionOptionButton({
  busy,
  onResolve,
  option
}: {
  busy: boolean;
  onResolve: () => void;
  option: PermissionOption;
}) {
  const isAlways = option.kind === "allow_always" || option.kind === "reject_always";
  return (
    <Button className={`approval-option ${option.kind}`} isDisabled={busy || isAlways} onPress={onResolve}>
      <span>{option.name}</span>
      {isAlways ? <small>Not available yet</small> : null}
    </Button>
  );
}
