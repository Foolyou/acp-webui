import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import { Button } from "react-aria-components";
import { api } from "../../api";
import {
  currentModelLabel,
  modelSwitchDisabledReason,
  selectValues,
  sessionConfigSelectOptions
} from "../../app/sessionConfig";
import { liveMessage, timelineMessage } from "../../app/timeline";
import { buildTimelineBlocks, type TimelineDisplayBlock, type TimelineToolGroupEntry } from "../../app/timelineBlocks";
import { MarkdownContent } from "../../components/MarkdownContent";
import {
  defaultPromptTemplateTitle,
  formatActiveTurnElapsed,
  insertPromptTemplateBody,
  promptComposerStatus,
  promptComposerImageSupported,
  renderableMessageBlocks
} from "./sessionPaneHelpers";
import type {
  AgentRuntimeStatus,
  ChatMessage,
  MessageContentBlock,
  PermissionModeId,
  PermissionOption,
  PermissionRequest,
  PromptTemplate,
  ReviewArtifactSummary,
  SessionDetail,
  SkillSummary
} from "../../types";
import { imagePreviewFromArtifact } from "../../utils/imagePreview";
import {
  fallbackPermissionModes,
  connectionStatusForMode,
  isYoloSession,
  permissionModeClass,
  permissionModeDescription,
  permissionModeLabel
} from "../../utils/permissionMode";
import { insertVoiceTranscript } from "../../utils/speechRecognition";
import { sessionStatusLabel } from "../../utils/sessionStatus";
import { toolSummary } from "../../utils/payload";

const SCROLL_BOTTOM_PROXIMITY_PX = 24;
const PROGRAMMATIC_SCROLL_WINDOW_MS = 800;
const SUPPORTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageAttachment = Extract<MessageContentBlock, { type: "image" }> & {
  id: string;
  size: number;
};

type VoiceState = "idle" | "recording" | "transcribing";
type ComposerIconName = "attach-image" | "microphone" | "play" | "remove" | "send" | "stop" | "templates" | "transcribing";

function ComposerIconButton({
  ariaExpanded,
  ariaPressed,
  className,
  icon,
  isDisabled,
  label,
  onPress,
  tooltip = label,
  type = "button"
}: {
  ariaExpanded?: boolean;
  ariaPressed?: boolean;
  className?: string;
  icon: ComposerIconName;
  isDisabled?: boolean;
  label: string;
  onPress?: () => void;
  tooltip?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <Button
      aria-expanded={ariaExpanded}
      aria-label={label}
      aria-pressed={ariaPressed}
      className={`icon-button composer-icon-button ${className ?? ""}`.trim()}
      data-tooltip={tooltip}
      isDisabled={isDisabled}
      onPress={onPress}
      type={type}
    >
      <span aria-hidden="true" className={`composer-action-icon ${icon}`} />
      <span className="visually-hidden">{label}</span>
    </Button>
  );
}

export function SessionPane({
  agentStatus,
  busy,
  currentSession,
  liveAssistant,
  onOpenDiffFallback,
  onOpenReviewArtifact,
  onRestoreSession,
  onResolvePermission,
  onRunQueuedPrompts,
  onSetSessionConfigOption,
  onStopSession,
  onSendPrompt,
  onDeleteSession,
  onUpdateSessionTitle,
  transcriptionAvailable
}: {
  agentStatus: AgentRuntimeStatus | null;
  busy: boolean;
  currentSession: SessionDetail;
  liveAssistant: string;
  onOpenDiffFallback: () => void;
  onOpenReviewArtifact: (artifactId: string) => void;
  onRestoreSession: (sessionId: string) => Promise<void>;
  onResolvePermission: (permission: PermissionRequest, optionId: string) => Promise<void>;
  onRunQueuedPrompts: () => Promise<void>;
  onSetSessionConfigOption: (configId: string, value: string) => Promise<void>;
  onStopSession: (options?: { clearQueuedPrompts?: boolean }) => Promise<void>;
  onSendPrompt: (prompt: string, contentBlocks?: MessageContentBlock[]) => Promise<void>;
  onDeleteSession: () => Promise<void>;
  onUpdateSessionTitle: (title: string) => Promise<void>;
  transcriptionAvailable: boolean;
}) {
  const waitingApproval =
    Boolean(currentSession.pendingPermission) || currentSession.session.status === "waiting_approval";
  const running = ["running", "stopping"].includes(currentSession.session.status) || waitingApproval;
  const continuity = currentSession.continuity;
  const agentName = currentSession.session.agentName;
  const permissionModes = agentStatus ? fallbackPermissionModes(agentStatus) : [];
  const permissionMode = currentSession.session.permissionMode;
  const agentConnection = agentStatus ? connectionStatusForMode(agentStatus, permissionMode) : null;
  const agentReady = continuity.continuable || !agentConnection || agentConnection.state === "ready";
  const canSend = continuity.continuable && agentReady && !waitingApproval;
  const imagePromptSupported = promptComposerImageSupported(agentConnection, {
    continuable: continuity.continuable,
    fallbackConnection: agentStatus?.status ?? null
  });
  const canRestore = continuity.restorable && !continuity.restoring;
  const continuityReason = continuity.reason ?? currentSession.viewOnlyReason;
  const restoreButtonLabel = continuity.restoring
    ? "Restoring..."
    : continuity.state === "restore_failed"
      ? "Retry restore"
      : "Restore";
  const sessionSelectOptions = sessionConfigSelectOptions(currentSession.configOptions);
  const modelDisabledReason = modelSwitchDisabledReason(currentSession, agentConnection);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const programmaticScrollUntilRef = useRef(0);
  const userScrollIntentRef = useRef(false);
  const touchStartYRef = useRef<number | null>(null);
  const [autoFollowState, setAutoFollowState] = useState({ sessionId: currentSession.session.id, value: true });
  const [isAtBottomState, setIsAtBottomState] = useState({ sessionId: currentSession.session.id, value: true });
  const autoFollow = autoFollowState.sessionId === currentSession.session.id ? autoFollowState.value : true;
  const isAtBottom = isAtBottomState.sessionId === currentSession.session.id ? isAtBottomState.value : true;
  const timelineBlocks = useMemo(
    () => buildTimelineBlocks(currentSession.timeline, currentSession.reviewArtifacts),
    [currentSession.reviewArtifacts, currentSession.timeline]
  );
  const elapsedLabel = useActiveTurnElapsed(currentSession.activeTurn);
  const stoppingTurn = currentSession.activeTurn?.status === "stopping" || currentSession.session.status === "stopping";
  const canStop =
    ["running", "waiting_approval"].includes(currentSession.session.status) &&
    currentSession.activeTurn?.status !== "stopping";

  const setAutoFollow = useCallback(
    (value: boolean) => {
      setAutoFollowState((current) =>
        current.sessionId === currentSession.session.id && current.value === value
          ? current
          : { sessionId: currentSession.session.id, value }
      );
    },
    [currentSession.session.id]
  );

  const setIsAtBottom = useCallback(
    (value: boolean) => {
      setIsAtBottomState((current) =>
        current.sessionId === currentSession.session.id && current.value === value
          ? current
          : { sessionId: currentSession.session.id, value }
      );
    },
    [currentSession.session.id]
  );

  const bottomDistance = useCallback(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    return Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight - scrollingElement.scrollTop);
  }, []);

  const isScrolledToBottom = useCallback(() => bottomDistance() <= SCROLL_BOTTOM_PROXIMITY_PX, [bottomDistance]);

  const syncBottomState = useCallback(() => {
    const atBottom = isScrolledToBottom();
    setIsAtBottom(atBottom);
    if (atBottom) {
      setAutoFollow(true);
    }
    return atBottom;
  }, [isScrolledToBottom, setAutoFollow, setIsAtBottom]);

  const scrollToTimelineEnd = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      const targetTop = Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight);
      programmaticScrollUntilRef.current = window.performance.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
      window.scrollTo({ top: targetTop, behavior });

      if (behavior === "auto") {
        window.requestAnimationFrame(() => {
          const nextTargetTop = Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight);
          window.scrollTo({ top: nextTargetTop, behavior: "auto" });
          lastScrollYRef.current = window.scrollY;
          syncBottomState();
        });
        return;
      }

      window.setTimeout(() => {
        lastScrollYRef.current = window.scrollY;
        syncBottomState();
      }, PROGRAMMATIC_SCROLL_WINDOW_MS);
    },
    [syncBottomState]
  );

  useLayoutEffect(() => {
    if (!autoFollow) return;
    scrollToTimelineEnd();
  }, [
    autoFollow,
    currentSession.failureMessage,
    currentSession.pendingPermission?.id,
    currentSession.session.id,
    currentSession.timeline,
    liveAssistant,
    running,
    scrollToTimelineEnd,
    waitingApproval,
    continuity.failureMessage,
    continuity.restoring
  ]);

  useEffect(() => {
    const node = timelineRef.current;
    if (!node || !autoFollow || typeof ResizeObserver === "undefined") return;

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        scrollToTimelineEnd();
      });
    });

    observer.observe(node);
    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
    };
  }, [autoFollow, currentSession.session.id, scrollToTimelineEnd]);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
  }, [currentSession.session.id]);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;

    function markUserScrollIntent() {
      userScrollIntentRef.current = true;
      const scrollingElement = document.scrollingElement ?? document.documentElement;
      if (scrollingElement.scrollTop > 0) {
        programmaticScrollUntilRef.current = 0;
        setAutoFollow(false);
        setIsAtBottom(false);
      }
      window.setTimeout(() => {
        userScrollIntentRef.current = false;
      }, PROGRAMMATIC_SCROLL_WINDOW_MS);
    }

    function onWheel(event: WheelEvent) {
      if (event.deltaY < 0) {
        markUserScrollIntent();
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (["ArrowUp", "Home", "PageUp"].includes(event.key)) {
        markUserScrollIntent();
      }
    }

    function onTouchStart(event: TouchEvent) {
      touchStartYRef.current = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      const touchStartY = touchStartYRef.current;
      const currentY = event.touches[0]?.clientY;
      if (touchStartY === null || currentY === undefined) return;
      if (currentY > touchStartY + 4) {
        markUserScrollIntent();
      }
    }

    function onResize() {
      if (autoFollow) {
        scrollToTimelineEnd();
        return;
      }
      syncBottomState();
    }

    function onScroll() {
      const scrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      lastScrollYRef.current = window.scrollY;
      const atBottom = isScrolledToBottom();
      setIsAtBottom(atBottom);
      if (atBottom) {
        setAutoFollow(true);
        return;
      }

      const programmaticScroll =
        window.performance.now() < programmaticScrollUntilRef.current && !userScrollIntentRef.current;
      if (programmaticScroll) return;

      if (scrollY < previousScrollY - 2 || userScrollIntentRef.current) {
        setAutoFollow(false);
      }
    }

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll);
    };
  }, [autoFollow, isScrolledToBottom, scrollToTimelineEnd, setAutoFollow, setIsAtBottom, syncBottomState]);

  const showScrollShortcut = !autoFollow && !isAtBottom;

  return (
    <section className="session-layout">
      <SessionContextHeader
        agentConnectionState={agentConnection?.state ?? "ready"}
        agentName={agentName}
        busy={busy}
        currentSession={currentSession}
        modelDisabledReason={modelDisabledReason}
        onOpenDiffFallback={onOpenDiffFallback}
        onDeleteSession={onDeleteSession}
        onSetSessionConfigOption={onSetSessionConfigOption}
        onUpdateSessionTitle={onUpdateSessionTitle}
        permissionMode={permissionMode}
        permissionModes={permissionModes}
        sessionSelectOptions={sessionSelectOptions}
      />
      <div className={`timeline ${autoFollow ? "auto-following" : ""}`} id="timeline" ref={timelineRef}>
        {isYoloSession(currentSession.session) ? (
          <div className="notice warning">YOLO mode: approvals and sandboxing are bypassed.</div>
        ) : null}
        {currentSession.failureMessage ? <div className="notice error">{currentSession.failureMessage}</div> : null}
        {continuity.failureMessage ? <div className="notice error">{continuity.failureMessage}</div> : null}
        {continuity.restoring ? <div className="notice">Restoring session context...</div> : null}
        {!continuity.continuable && !continuity.failureMessage && !continuity.restoring ? (
          <div className="notice warning">{continuityReason}</div>
        ) : null}
        {currentSession.queuedPrompts?.length ? (
          <QueuedPromptList queuedPrompts={currentSession.queuedPrompts} />
        ) : null}
        {timelineBlocks.map((block) => (
          <TimelineBlockRow
            block={block}
            key={`${block.kind}-${block.id}`}
            onOpenReviewArtifact={onOpenReviewArtifact}
            reviewArtifacts={currentSession.reviewArtifacts}
          />
        ))}
        {running && !liveAssistant ? <RunningSkeleton agentName={agentName} waitingApproval={waitingApproval} /> : null}
        {liveAssistant ? <MessageBubble live message={liveMessage(currentSession.session.id, liveAssistant)} /> : null}
        <div aria-hidden="true" className="timeline-end" />
      </div>
      {currentSession.pendingPermission ? (
        <InlineApprovalPanel
          busy={busy}
          currentSession={currentSession}
          onResolve={onResolvePermission}
          permission={currentSession.pendingPermission}
        />
      ) : waitingApproval ? (
        <div className="inline-approval-panel compact" role="status">
          <div>
            <p className="eyebrow">Approval</p>
            <strong>Waiting for permission request details</strong>
          </div>
        </div>
      ) : null}
      {showScrollShortcut ? (
        <div className="scroll-follow-control">
          <Button
            className="secondary small scroll-follow-button"
            type="button"
            onPress={() => {
              setAutoFollow(true);
              scrollToTimelineEnd();
            }}
          >
            Scroll to bottom
          </Button>
        </div>
      ) : null}
      <PromptComposer
        busy={busy}
        agentName={agentName}
        agentId={currentSession.session.agentId}
        agentConnection={agentConnection}
        disabled={!canSend}
        imagePromptSupported={imagePromptSupported}
        running={running}
        continuityReason={continuity.continuable ? null : continuityReason}
        onRestoreSession={() => onRestoreSession(currentSession.session.id)}
        restoreButtonLabel={continuity.restorable || continuity.restoring ? restoreButtonLabel : null}
        restoreDisabled={busy || !canRestore}
        restoreRequired={continuity.restorable || continuity.restoring}
        elapsedLabel={elapsedLabel}
        queuedPromptCount={currentSession.queuedPrompts?.length ?? 0}
        canStop={canStop}
        stoppingTurn={stoppingTurn}
        onRunQueuedPrompts={onRunQueuedPrompts}
        onStopSession={onStopSession}
        waitingApproval={waitingApproval}
        onSendPrompt={onSendPrompt}
        workspaceId={currentSession.workspace.id}
        transcriptionAvailable={transcriptionAvailable}
      />
    </section>
  );
}

function InlineApprovalPanel({
  busy,
  currentSession,
  onResolve,
  permission
}: {
  busy: boolean;
  currentSession: SessionDetail;
  onResolve: (permission: PermissionRequest, optionId: string) => Promise<void>;
  permission: PermissionRequest;
}) {
  const queuedApprovalCount = currentSession.queuedApprovalCount ?? 0;
  return (
    <section className="inline-approval-panel" aria-label="Pending approval">
      <div className="inline-approval-header">
        <div>
          <p className="eyebrow">{permission.kind}</p>
          <h2>{permission.title}</h2>
        </div>
        {queuedApprovalCount > 0 ? <strong className="approval-queue-count">{queuedApprovalCount} queued</strong> : null}
      </div>
      <div className="approval-context">
        <span>{currentSession.workspace.name}</span>
        <span>{currentSession.session.agentName}</span>
        <span>{permission.status}</span>
      </div>
      <pre className="tool-summary">{toolSummary(permission.toolCall)}</pre>
      <div className="approval-actions">
        {permission.options.map((option) => (
          <PermissionOptionButton
            busy={busy}
            key={option.optionId}
            onResolve={() => {
              void onResolve(permission, option.optionId);
            }}
            option={option}
          />
        ))}
      </div>
    </section>
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
  return (
    <Button className={`approval-option ${option.kind}`} isDisabled={busy} onPress={onResolve} type="button">
      <span>{option.name}</span>
    </Button>
  );
}

function useActiveTurnElapsed(activeTurn: SessionDetail["activeTurn"]) {
  const [now, setNow] = useState(() => Date.now());
  const active = activeTurn && ["running", "stopping"].includes(activeTurn.status);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, activeTurn?.startedAt]);

  if (!activeTurn?.startedAt) return null;
  return formatActiveTurnElapsed(activeTurn.startedAt, now);
}

function QueuedPromptList({ queuedPrompts }: { queuedPrompts: NonNullable<SessionDetail["queuedPrompts"]> }) {
  return (
    <div className="queued-prompts" aria-label="Queued prompts">
      <strong>{queuedPrompts.length} queued</strong>
      {queuedPrompts.map((prompt, index) => (
        <div className="queued-prompt" key={prompt.id}>
          <span>#{index + 1}</span>
          <p>{prompt.prompt || imagePromptSummary(prompt.contentBlocks)}</p>
        </div>
      ))}
    </div>
  );
}

function imagePromptSummary(blocks?: MessageContentBlock[]) {
  const imageCount = blocks?.filter((block) => block.type === "image").length ?? 0;
  return imageCount > 0 ? `${imageCount} image${imageCount === 1 ? "" : "s"}` : "Queued prompt";
}

function SessionContextHeader({
  agentConnectionState,
  agentName,
  busy,
  currentSession,
  modelDisabledReason,
  onOpenDiffFallback,
  onDeleteSession,
  onSetSessionConfigOption,
  onUpdateSessionTitle,
  permissionMode,
  permissionModes,
  sessionSelectOptions
}: {
  agentConnectionState: string;
  agentName: string;
  busy: boolean;
  currentSession: SessionDetail;
  modelDisabledReason: string | null;
  onOpenDiffFallback: () => void;
  onDeleteSession: () => Promise<void>;
  onSetSessionConfigOption: (configId: string, value: string) => Promise<void>;
  onUpdateSessionTitle: (title: string) => Promise<void>;
  permissionMode: PermissionModeId;
  permissionModes: ReturnType<typeof fallbackPermissionModes>;
  sessionSelectOptions: NonNullable<SessionDetail["configOptions"]>;
}) {
  const [infoExpandedState, setInfoExpandedState] = useState({
    sessionId: currentSession.session.id,
    value: false
  });
  const [titleDraft, setTitleDraft] = useState(currentSession.session.title ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const infoExpanded = infoExpandedState.sessionId === currentSession.session.id ? infoExpandedState.value : false;

  useEffect(() => {
    setTitleDraft(currentSession.session.title ?? "");
    setConfirmDelete(false);
  }, [currentSession.session.id, currentSession.session.title]);

  function toggleInfoExpanded() {
    setInfoExpandedState((current) => ({
      sessionId: currentSession.session.id,
      value: current.sessionId === currentSession.session.id ? !current.value : true
    }));
  }

  async function saveTitle() {
    await onUpdateSessionTitle(titleDraft);
  }

  async function deleteSession() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDeleteSession();
  }

  return (
    <div className={`session-toolbar ${infoExpanded ? "expanded" : "collapsed"}`}>
      <div className="session-toolbar-summary">
        <Link
          className="secondary small session-list-link"
          params={{ workspaceId: currentSession.workspace.id }}
          to="/workspaces/$workspaceId/sessions"
        >
          Sessions
        </Link>
        <div className="session-summary-badges">
          <span className={`badge ${agentConnectionState}`}>{agentName}</span>
          <span
            className={`permission-mode-badge ${permissionModeClass(permissionMode)}`}
            title={permissionModeDescription(permissionMode, permissionModes)}
          >
            {permissionModeLabel(permissionMode, permissionModes)}
          </span>
        </div>
        <Button
          aria-label={infoExpanded ? "Hide session info" : "Show session info"}
          aria-expanded={infoExpanded}
          className="icon-button session-info-toggle"
          type="button"
          onPress={toggleInfoExpanded}
        >
          <span aria-hidden="true">{infoExpanded ? "▴" : "▾"}</span>
        </Button>
      </div>

      {infoExpanded ? (
        <div className="session-context-controls">
          <div className="session-expanded-context">
            <span>{currentSession.workspace.name}</span>
            <strong>{currentSession.session.title?.trim() || `${agentName} Session`}</strong>
            <span className={`badge ${currentSession.session.status}`}>
              {sessionStatusLabel(currentSession.session.status)}
              <span className="visually-hidden"> {currentSession.session.status}</span>
            </span>
          </div>
          <div className="management-form compact">
            <label>
              <span>Title</span>
              <input
                aria-label="Session title"
                disabled={busy}
                onChange={(event) => setTitleDraft(event.target.value)}
                value={titleDraft}
              />
            </label>
            <Button className="secondary small" isDisabled={busy} onPress={saveTitle}>
              Save title
            </Button>
          </div>
          {sessionSelectOptions.length ? (
            <div className="session-config-controls">
              {sessionSelectOptions.map((option) => (
                <ModelSelector
                  busy={busy}
                  disabledReason={modelDisabledReason}
                  key={option.id}
                  option={option}
                  values={selectValues(option)}
                  onSetSessionConfigOption={onSetSessionConfigOption}
                />
              ))}
            </div>
          ) : null}
          <div className="section-actions">
            <Button className="secondary small" isDisabled={busy} onPress={onOpenDiffFallback}>
              Diff
            </Button>
            <Button className="secondary small danger" isDisabled={busy} onPress={deleteSession}>
              {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelSelector({
  busy,
  disabledReason,
  option,
  values,
  onSetSessionConfigOption
}: {
  busy: boolean;
  disabledReason: string | null;
  option: NonNullable<SessionDetail["configOptions"]>[number];
  values: ReturnType<typeof selectValues>;
  onSetSessionConfigOption: (configId: string, value: string) => Promise<void>;
}) {
  const selectedValue = option.currentValue ?? "";
  const selected = values.find((value) => value.value === selectedValue) ?? null;
  const label = currentModelLabel(option) ?? option.name;
  const disabled = busy || Boolean(disabledReason) || values.length === 0;

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (!value || value === selectedValue) {
      return;
    }
    void onSetSessionConfigOption(option.id, value);
  }

  return (
    <label className="model-selector" title={disabledReason ?? selected?.description ?? label}>
      <span>{option.name}</span>
      <select aria-label={option.name} disabled={disabled} onChange={onChange} value={selectedValue}>
        {values.map((value) => (
          <option key={value.value} title={value.description ?? value.name} value={value.value}>
            {value.name}
          </option>
        ))}
      </select>
      <small>{selected?.description ?? label}</small>
    </label>
  );
}

function TimelineBlockRow({
  block,
  onOpenReviewArtifact,
  reviewArtifacts
}: {
  block: TimelineDisplayBlock;
  onOpenReviewArtifact: (artifactId: string) => void;
  reviewArtifacts: ReviewArtifactSummary[];
}) {
  switch (block.kind) {
    case "message":
      return <MessageBubble message={timelineMessage(block.item)} />;
    case "tool_group":
      return <ToolGroupRow block={block} onOpenReviewArtifact={onOpenReviewArtifact} reviewArtifacts={reviewArtifacts} />;
    case "review_artifact": {
      const artifact = reviewArtifacts.find((item) => item.id === block.item.id);
      return (
        <ReviewArtifactCard
          artifact={{
            id: block.item.id,
            sessionId: block.item.sessionId,
            toolCallId: block.item.toolCallId,
            kind: block.item.artifactKind,
            title: block.item.title,
            summary: block.item.summary,
            preview: artifact?.preview,
            source: block.item.source,
            createdAt: block.item.timestamp
          }}
          onOpen={onOpenReviewArtifact}
        />
      );
    }
    case "permission":
      return (
        <div className="timeline-event permission-event">
          <span>{block.item.status}</span>
          <strong>{block.item.title}</strong>
        </div>
      );
  }
}

function ToolGroupRow({
  block,
  onOpenReviewArtifact,
  reviewArtifacts
}: {
  block: Extract<TimelineDisplayBlock, { kind: "tool_group" }>;
  onOpenReviewArtifact: (artifactId: string) => void;
  reviewArtifacts: ReviewArtifactSummary[];
}) {
  const [expanded, setExpanded] = useState(false);
  const isMulti = block.entries.length > 1;
  const className = ["tool-row", "tool-group-row", ...block.classNames, block.status, isMulti ? "multi" : "single"].join(
    " "
  );

  return (
    <article className={className}>
      <div className="tool-row-main tool-group-main">
        <span className="tool-activity-dot" aria-hidden="true" />
        <span className="tool-group-label">
          <strong className="tool-group-summary">{block.summary}</strong>
          <span
            aria-label={expanded ? "Collapse tool details" : "Expand tool details"}
            aria-expanded={expanded}
            className="tool-group-toggle-text"
            onClick={() => setExpanded((current) => !current)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setExpanded((current) => !current);
              }
            }}
            role="button"
            tabIndex={0}
          >
            {expanded ? "collapse" : "expand"}
          </span>
        </span>
        {block.statusLabel ? <span className={`tool-status ${block.status}`}>{block.statusLabel}</span> : null}
      </div>
      {expanded ? (
        <div className="tool-group-items">
          {block.entries.map((entry) => (
            <ToolGroupItem
              entry={entry}
              key={entry.item.id}
              onOpenReviewArtifact={onOpenReviewArtifact}
              reviewArtifacts={reviewArtifacts}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ToolGroupItem({
  entry,
  onOpenReviewArtifact,
  reviewArtifacts
}: {
  entry: TimelineToolGroupEntry;
  onOpenReviewArtifact: (artifactId: string) => void;
  reviewArtifacts: ReviewArtifactSummary[];
}) {
  const { display, item } = entry;
  const linkedArtifacts = item.reviewArtifactIds
    .map((artifactId) => reviewArtifacts.find((artifact) => artifact.id === artifactId))
    .filter((artifact): artifact is ReviewArtifactSummary => Boolean(artifact));
  const [showOutput, setShowOutput] = useState(Boolean(display.outputTail && item.status.toLowerCase() === "failed"));
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <div className={`tool-item ${display.kind} ${item.status}`}>
      <div className="tool-item-main">
        <span className="tool-action">{display.actionLabel}</span>
        <strong>{display.subject}</strong>
        <span className={`tool-status ${display.status}`}>{display.statusLabel}</span>
      </div>
      <div className="tool-item-actions">
        {display.outputTail ? (
          <Button className="secondary small" onPress={() => setShowOutput((current) => !current)} type="button">
            Output
          </Button>
        ) : null}
        <Button className="secondary small" onPress={() => setShowDiagnostics((current) => !current)} type="button">
          Diagnostics
        </Button>
        {linkedArtifacts.map((artifact) => (
          <Button
            className="secondary small"
            key={artifact.id}
            onPress={() => onOpenReviewArtifact(artifact.id)}
            type="button"
          >
            {reviewArtifactActionLabel(artifact)}
          </Button>
        ))}
      </div>
      {showOutput && display.outputTail ? <pre className="tool-output">{display.outputTail}</pre> : null}
      {showDiagnostics ? (
        <div className="tool-diagnostics">
          <pre className="review-pre">{display.detailText}</pre>
        </div>
      ) : null}
      <pre className="tool-detail-text">{display.detailText}</pre>
    </div>
  );
}

function reviewArtifactActionLabel(artifact: ReviewArtifactSummary) {
  switch (artifact.kind) {
    case "diff":
      return "Diff";
    case "markdown":
      return "Markdown";
    case "terminal":
      return "Terminal";
    case "tool_call":
      return "Terminal";
    default:
      return "Review";
  }
}

function RunningSkeleton({ agentName, waitingApproval }: { agentName: string; waitingApproval: boolean }) {
  return (
    <div className="message assistant live">
      <div className="message-role">{waitingApproval ? "approval" : agentName}</div>
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
    </div>
  );
}

function PromptComposer({
  agentName,
  agentId,
  agentConnection,
  busy,
  disabled,
  imagePromptSupported,
  onSendPrompt,
  onRestoreSession,
  running,
  restoreButtonLabel,
  restoreDisabled,
  continuityReason,
  restoreRequired,
  elapsedLabel,
  queuedPromptCount,
  canStop,
  stoppingTurn,
  onRunQueuedPrompts,
  onStopSession,
  waitingApproval,
  workspaceId,
  transcriptionAvailable
}: {
  agentName: string;
  agentId: string;
  agentConnection: AgentRuntimeStatus["status"] | null;
  busy: boolean;
  disabled: boolean;
  imagePromptSupported: boolean;
  onSendPrompt: (prompt: string, contentBlocks?: MessageContentBlock[]) => Promise<void>;
  onRestoreSession: () => Promise<void>;
  running: boolean;
  restoreButtonLabel: string | null;
  restoreDisabled: boolean;
  continuityReason?: string | null;
  restoreRequired: boolean;
  elapsedLabel: string | null;
  queuedPromptCount: number;
  canStop: boolean;
  stoppingTurn: boolean;
  onRunQueuedPrompts: () => Promise<void>;
  onStopSession: (options?: { clearQueuedPrompts?: boolean }) => Promise<void>;
  waitingApproval: boolean;
  workspaceId: string;
  transcriptionAvailable: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [composing, setComposing] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  const [draggingImages, setDraggingImages] = useState(false);
  const [recordingSupported] = useState(() => audioRecordingSupported());
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateBusyId, setTemplateBusyId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateTitle, setEditingTemplateTitle] = useState("");
  const [editingTemplateBody, setEditingTemplateBody] = useState("");
  const [stopChoiceOpen, setStopChoiceOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const transcribeOnStopRef = useRef(false);
  const voiceActiveRef = useRef(true);
  const voiceSupported = transcriptionAvailable && recordingSupported;
  const voiceRecording = voiceState === "recording";
  const voiceTranscribing = voiceState === "transcribing";
  const previewAttachment = attachments.find((attachment) => attachment.id === previewAttachmentId) ?? null;

  useEffect(() => {
    let cancelled = false;
    api
      .skills()
      .then((items) => {
        if (!cancelled) setSkills(items);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      voiceActiveRef.current = false;
      stopVoiceRecording(false);
      stopMediaStream(mediaStreamRef.current);
    };
  }, []);

  useEffect(() => {
    if (!voiceRecording || (!disabled && !busy)) return;
    stopVoiceRecording(false);
  }, [busy, disabled, voiceRecording]);

  useEffect(() => {
    if (queuedPromptCount === 0 || !canStop) {
      setStopChoiceOpen(false);
    }
  }, [canStop, queuedPromptCount]);

  useEffect(() => {
    if (!templatesOpen) return;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      setTemplatesLoading(true);
      setTemplatesError(null);
    });
    api
      .promptTemplates(workspaceId, agentId)
      .then((items) => {
        if (!cancelled) setTemplates(items);
      })
      .catch((error) => {
        if (!cancelled) setTemplatesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, templatesOpen, workspaceId]);

  async function submitPrompt() {
    const trimmed = prompt.trim();
    if ((!trimmed && attachments.length === 0) || disabled || busy) return;
    if (attachments.length > 0 && !imagePromptSupported) {
      setAttachmentError(`${agentName} does not support image attachments.`);
      return;
    }
    const submittedPrompt = prompt;
    const submittedAttachments = attachments;
    setPrompt("");
    setAttachments([]);
    setPreviewAttachmentId(null);
    try {
      await onSendPrompt(
        trimmed,
        submittedAttachments.map((attachment) => ({
          type: attachment.type,
          mimeType: attachment.mimeType,
          data: attachment.data,
          uri: attachment.uri,
          name: attachment.name
        }))
      );
    } catch (error) {
      setPrompt(submittedPrompt);
      setAttachments(submittedAttachments);
      throw error;
    }
    if (voiceRecording) {
      stopVoiceRecording(false);
    }
    setAttachmentError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submitPrompt();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (composing) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submitPrompt();
    }
  }

  function updatePromptDraft(value: string) {
    setPrompt(value);
    if (voiceError) {
      setVoiceError(null);
    }
  }

  async function startVoiceRecording() {
    if (!voiceSupported || disabled || busy || voiceRecording || voiceTranscribing) return;
    setVoiceError(null);
    audioChunksRef.current = [];
    transcribeOnStopRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!voiceActiveRef.current) {
        stopMediaStream(stream);
        return;
      }
      const mimeType = preferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setVoiceError("Voice input failed. Try again.");
        stopVoiceRecording(false);
      };
      recorder.onstop = () => {
        void finishVoiceRecording(recorder);
      };
      recorder.start();
      setVoiceState("recording");
    } catch (error) {
      setVoiceState("idle");
      setVoiceError(recordingErrorMessage(error));
    }
  }

  function stopVoiceRecording(transcribe: boolean) {
    transcribeOnStopRef.current = transcribe;
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setVoiceState("idle");
      return;
    }
    if (recorder.state === "inactive") {
      void finishVoiceRecording(recorder);
      return;
    }
    recorder.stop();
  }

  async function finishVoiceRecording(recorder: MediaRecorder) {
    const shouldTranscribe = transcribeOnStopRef.current;
    transcribeOnStopRef.current = false;
    mediaRecorderRef.current = null;
    const stream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    stopMediaStream(stream);

    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    if (!shouldTranscribe) {
      if (voiceActiveRef.current) setVoiceState("idle");
      return;
    }
    if (chunks.length === 0) {
      if (voiceActiveRef.current) {
        setVoiceState("idle");
        setVoiceError("No audio was recorded. Try again.");
      }
      return;
    }

    const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
    const audio = new Blob(chunks, { type: mimeType });
    if (audio.size === 0) {
      if (voiceActiveRef.current) {
        setVoiceState("idle");
        setVoiceError("No audio was recorded. Try again.");
      }
      return;
    }

    if (voiceActiveRef.current) setVoiceState("transcribing");
    try {
      const response = await api.transcribeAudio(audio, recordingFileName(mimeType));
      if (!voiceActiveRef.current) return;
      setPrompt((current) => insertVoiceTranscript(current, response.text));
      setVoiceError(null);
    } catch (error) {
      if (!voiceActiveRef.current) return;
      setVoiceError(error instanceof Error ? error.message : String(error));
    } finally {
      if (voiceActiveRef.current) setVoiceState("idle");
    }
  }

  function toggleVoiceInput() {
    if (!voiceSupported || disabled || busy) return;
    if (voiceRecording) {
      stopVoiceRecording(true);
      return;
    }
    void startVoiceRecording();
  }

  const skillMatch = /[$＄￥]([\w:-]*)$/u.exec(prompt);
  const skillSuggestions =
    skillMatch && !disabled
      ? skills
          .filter((skill) => skill.name.toLowerCase().startsWith(skillMatch[1].toLowerCase()))
          .slice(0, 6)
      : [];

  function applySkill(skillName: string) {
    if (!skillMatch) return;
    setPrompt(`${prompt.slice(0, skillMatch.index)}$${skillName} `);
  }

  async function applyPromptTemplate(template: PromptTemplate) {
    if (disabled) return;
    setPrompt((current) => insertPromptTemplateBody(current, template.body));
    setTemplatesOpen(false);
    try {
      const updated = await api.usePromptTemplate(template.id);
      setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch {
      // Template usage is metadata; inserting the prompt should not be blocked by it.
    }
  }

  async function savePromptTemplate() {
    const body = prompt.trim();
    if (!body || templateSaving) return;
    setTemplateSaving(true);
    setTemplatesError(null);
    try {
      const created = await api.createPromptTemplate(workspaceId, agentId, {
        title: templateTitle.trim() || defaultPromptTemplateTitle(body),
        body,
        tags: []
      });
      setTemplates((current) => [...current, created]);
      setTemplateTitle("");
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : String(error));
    } finally {
      setTemplateSaving(false);
    }
  }

  async function deletePromptTemplate(templateId: string) {
    setTemplateBusyId(templateId);
    setTemplatesError(null);
    try {
      await api.deletePromptTemplate(templateId);
      setTemplates((current) => current.filter((item) => item.id !== templateId));
      if (editingTemplateId === templateId) {
        setEditingTemplateId(null);
      }
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : String(error));
    } finally {
      setTemplateBusyId(null);
    }
  }

  function editPromptTemplate(template: PromptTemplate) {
    setEditingTemplateId(template.id);
    setEditingTemplateTitle(template.title);
    setEditingTemplateBody(template.body);
  }

  async function savePromptTemplateEdit(templateId: string) {
    const title = editingTemplateTitle.trim();
    const body = editingTemplateBody.trim();
    if (!title || !body || templateBusyId) return;
    setTemplateBusyId(templateId);
    setTemplatesError(null);
    try {
      const updated = await api.updatePromptTemplate(templateId, { title, body });
      setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingTemplateId(null);
    } catch (error) {
      setTemplatesError(error instanceof Error ? error.message : String(error));
    } finally {
      setTemplateBusyId(null);
    }
  }

  async function addImageFiles(files: File[]) {
    if (!files.length) return;
    if (!imagePromptSupported) {
      setAttachmentError(`${agentName} does not support image attachments.`);
      return;
    }
    try {
      const next = await Promise.all(files.map(readImageAttachment));
      setAttachments((current) => [...current, ...next]);
      setAttachmentError(null);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : String(error));
    }
  }

  async function onImageFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = filesFromList(event.target.files);
    event.target.value = "";
    await addImageFiles(files);
  }

  function onPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const files = filesFromClipboard(event.clipboardData);
    if (!files.length) return;
    event.preventDefault();
    void addImageFiles(files);
  }

  function onDragEnter(event: ReactDragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDraggingImages(true);
  }

  function onDragOver(event: ReactDragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = imagePromptSupported && !disabled && !busy ? "copy" : "none";
    setDraggingImages(true);
  }

  function onDragLeave(event: ReactDragEvent<HTMLFormElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDraggingImages(false);
  }

  function onDrop(event: ReactDragEvent<HTMLFormElement>) {
    if (!hasDraggedFiles(event.dataTransfer)) return;
    event.preventDefault();
    setDraggingImages(false);
    if (disabled || busy) return;
    void addImageFiles(filesFromList(event.dataTransfer.files));
  }

  const status = promptComposerStatus({
    agentConnection,
    agentName,
    continuityReason: continuityReason ?? null,
    elapsedLabel,
    running,
    stoppingTurn,
    waitingApproval
  });
  const voiceControlLabel = voiceTranscribing
    ? "Transcribing voice input"
    : voiceRecording
      ? "Finish voice input"
      : "Start voice input";
  const promptTemplatesLabel = templatesOpen ? "Close prompt templates" : "Open prompt templates";

  return (
    <div className="composer-wrap">
      {stopChoiceOpen ? (
        <div className="stop-scope-panel" role="dialog" aria-label="Stop queued prompts">
          <div>
            <strong>Stop this turn?</strong>
            <span>{queuedPromptCount} queued prompt{queuedPromptCount === 1 ? "" : "s"} will remain unless cleared.</span>
          </div>
          <div className="stop-scope-actions">
            <Button
              className="secondary small"
              isDisabled={busy}
              onPress={() => setStopChoiceOpen(false)}
              type="button"
            >
              Cancel
            </Button>
            <Button
              className="secondary small"
              isDisabled={busy}
              onPress={() => {
                setStopChoiceOpen(false);
                void onStopSession({ clearQueuedPrompts: false });
              }}
              type="button"
            >
              Active only
            </Button>
            <Button
              className="danger small"
              isDisabled={busy}
              onPress={() => {
                setStopChoiceOpen(false);
                void onStopSession({ clearQueuedPrompts: true });
              }}
              type="button"
            >
              Clear queue
            </Button>
          </div>
        </div>
      ) : null}
      {status || restoreButtonLabel || queuedPromptCount > 0 || canStop ? (
        <div className="composer-topline">
          {status ? <div className={`composer-status ${continuityReason ? "warning" : ""}`}>{status}</div> : <span />}
          {queuedPromptCount > 0 ? <span className="queued-count">{queuedPromptCount} queued</span> : null}
          {canStop ? (
            <ComposerIconButton
              className="stop-button"
              icon="stop"
              isDisabled={busy}
              label="Stop"
              onPress={() => {
                if (queuedPromptCount > 0) {
                  setStopChoiceOpen(true);
                  return;
                }
                void onStopSession();
              }}
              tooltip={queuedPromptCount > 0 ? "Stop and choose queue handling" : "Stop"}
            />
          ) : queuedPromptCount > 0 ? (
            <ComposerIconButton
              className="run-queue-button"
              icon="play"
              isDisabled={busy}
              label="Run queued prompts"
              onPress={() => {
                void onRunQueuedPrompts();
              }}
            />
          ) : null}
          {restoreButtonLabel ? (
            <Button
              className="primary small"
              isDisabled={restoreDisabled}
              onPress={() => {
                void onRestoreSession();
              }}
            >
              {restoreButtonLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
      <form
        className={`composer ${draggingImages ? "dragging-images" : ""}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onSubmit={onSubmit}
      >
        <input
          accept={SUPPORTED_IMAGE_MIME_TYPES.join(",")}
          className="visually-hidden"
          disabled={disabled || busy || !imagePromptSupported}
          multiple
          onChange={onImageFilesSelected}
          ref={fileInputRef}
          type="file"
        />
        <textarea
          disabled={disabled}
          onChange={(event) => updatePromptDraft(event.target.value)}
          onCompositionEnd={() => setComposing(false)}
          onCompositionStart={() => setComposing(true)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            continuityReason
              ? restoreRequired
                ? "Restore session to continue"
                : "Start a new session to continue"
              : running
                  ? `Queue a follow-up for ${agentName}...`
                : `Ask ${agentName}...`
          }
          rows={2}
          value={prompt}
        />
        {skillSuggestions.length ? (
          <div className="skill-autocomplete" role="listbox">
            {skillSuggestions.map((skill) => (
              <Button
                className="skill-autocomplete-item"
                key={skill.name}
                onPress={() => applySkill(skill.name)}
                type="button"
              >
                <strong>${skill.name}</strong>
                {skill.description ? <span>{skill.description}</span> : null}
              </Button>
            ))}
          </div>
        ) : null}
        {templatesOpen ? (
          <div className="prompt-template-panel">
            <div className="prompt-template-save">
              <input
                aria-label="Prompt template title"
                onChange={(event) => setTemplateTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void savePromptTemplate();
                  }
                }}
                placeholder={prompt.trim() ? defaultPromptTemplateTitle(prompt) : "Template title"}
                value={templateTitle}
              />
              <Button
                className="secondary"
                isDisabled={!prompt.trim() || templateSaving}
                onPress={() => {
                  void savePromptTemplate();
                }}
                type="button"
              >
                Save current
              </Button>
            </div>
            {templatesError ? <div className="composer-error">{templatesError}</div> : null}
            {templatesLoading ? <div className="prompt-template-empty">Loading prompts...</div> : null}
            {!templatesLoading && templates.length === 0 ? (
              <div className="prompt-template-empty">No saved prompts for this workspace and agent.</div>
            ) : null}
            {templates.length ? (
              <div className="prompt-template-list">
                {templates.map((template) => (
                  <div className="prompt-template-item" key={template.id}>
                    {editingTemplateId === template.id ? (
                      <div className="prompt-template-edit">
                        <input
                          aria-label="Edit prompt template title"
                          onChange={(event) => setEditingTemplateTitle(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void savePromptTemplateEdit(template.id);
                            }
                          }}
                          value={editingTemplateTitle}
                        />
                        <textarea
                          aria-label="Edit prompt template body"
                          onChange={(event) => setEditingTemplateBody(event.target.value)}
                          rows={3}
                          value={editingTemplateBody}
                        />
                      </div>
                    ) : (
                      <div className="prompt-template-copy">
                        <strong>{template.title}</strong>
                        <span>{template.body}</span>
                      </div>
                    )}
                    <div className="prompt-template-actions">
                      <Button
                        className="secondary small"
                        isDisabled={templateBusyId === template.id}
                        onPress={() => {
                          void deletePromptTemplate(template.id);
                        }}
                        type="button"
                      >
                        Delete
                      </Button>
                      {editingTemplateId === template.id ? (
                        <Button
                          className="secondary small"
                          onPress={() => setEditingTemplateId(null)}
                          type="button"
                        >
                          Cancel
                        </Button>
                      ) : (
                        <Button
                          className="secondary small"
                          onPress={() => editPromptTemplate(template)}
                          type="button"
                        >
                          Edit
                        </Button>
                      )}
                      {editingTemplateId === template.id ? (
                        <Button
                          className="secondary small"
                          isDisabled={
                            templateBusyId === template.id ||
                            !editingTemplateTitle.trim() ||
                            !editingTemplateBody.trim()
                          }
                          onPress={() => {
                            void savePromptTemplateEdit(template.id);
                          }}
                          type="button"
                        >
                          Save
                        </Button>
                      ) : (
                        <Button
                          className="secondary small"
                          isDisabled={disabled}
                          onPress={() => {
                            void applyPromptTemplate(template);
                          }}
                          type="button"
                        >
                          Use
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {attachments.length ? (
          <div className="composer-attachments">
            {attachments.map((attachment) => (
              <div className="composer-attachment" key={attachment.id}>
                <Button
                  aria-label={`Preview image attachment ${attachment.name ?? attachment.mimeType}`}
                  className="composer-attachment-preview"
                  onPress={() => setPreviewAttachmentId(attachment.id)}
                  type="button"
                >
                  <img alt={attachment.name ?? "Attached image"} src={imageDataUrl(attachment)} />
                </Button>
                <span>{attachment.name ?? attachment.mimeType}</span>
                <ComposerIconButton
                  className="composer-attachment-remove"
                  icon="remove"
                  label={`Remove image attachment ${attachment.name ?? attachment.mimeType}`}
                  onPress={() => {
                    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
                    setPreviewAttachmentId((current) => (current === attachment.id ? null : current));
                  }}
                  tooltip="Remove attachment"
                />
              </div>
            ))}
          </div>
        ) : null}
        {attachmentError ? <div className="composer-error">{attachmentError}</div> : null}
        {voiceError ? <div className="composer-error">{voiceError}</div> : null}
        <div className="composer-actions">
          <span className="shortcut-hint">Ctrl Enter</span>
          {voiceSupported ? (
            <ComposerIconButton
              ariaPressed={voiceRecording}
              className={`voice-control ${voiceRecording ? "listening" : ""} ${voiceTranscribing ? "transcribing" : ""}`}
              icon={voiceTranscribing ? "transcribing" : "microphone"}
              isDisabled={disabled || busy || voiceTranscribing}
              label={voiceControlLabel}
              onPress={toggleVoiceInput}
            />
          ) : null}
          <ComposerIconButton
            ariaExpanded={templatesOpen}
            className={templatesOpen ? "active" : undefined}
            icon="templates"
            label={promptTemplatesLabel}
            onPress={() => setTemplatesOpen((open) => !open)}
          />
          <ComposerIconButton
            icon="attach-image"
            isDisabled={disabled || busy || !imagePromptSupported}
            label="Attach image"
            onPress={() => fileInputRef.current?.click()}
          />
          <ComposerIconButton className="composer-send-button" icon="send" isDisabled={disabled || busy} label="Send prompt" type="submit" />
        </div>
      </form>
      {previewAttachment ? (
        <div className="modal-backdrop composer-image-backdrop" onClick={() => setPreviewAttachmentId(null)}>
          <div
            aria-label="Image attachment preview"
            aria-modal="true"
            className="composer-image-preview"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Attachment</p>
                <h2>{previewAttachment.name ?? previewAttachment.mimeType}</h2>
              </div>
              <Button className="secondary small" onPress={() => setPreviewAttachmentId(null)} type="button">
                Close
              </Button>
            </div>
            <div className="composer-image-preview-body">
              <img alt={previewAttachment.name ?? "Attached image"} src={imageDataUrl(previewAttachment)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function filesFromList(files: FileList | null) {
  return Array.from(files ?? []);
}

function filesFromClipboard(data: DataTransfer) {
  const files = filesFromList(data.files);
  if (files.length > 0) return files;
  return Array.from(data.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function hasDraggedFiles(data: DataTransfer) {
  return Array.from(data.types).includes("Files");
}

function readImageAttachment(file: File): Promise<ImageAttachment> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
    return Promise.reject(new Error(`Unsupported image type ${file.type || "unknown"}.`));
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error("Image attachments must be 5 MB or smaller."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image attachment."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const data = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      resolve({
        id: `${file.name}-${file.size}-${file.lastModified}-${id}`,
        type: "image",
        mimeType: file.type,
        data,
        name: file.name,
        size: file.size
      });
    };
    reader.readAsDataURL(file);
  });
}

function imageDataUrl(block: Extract<MessageContentBlock, { type: "image" }>) {
  return `data:${block.mimeType};base64,${block.data}`;
}

function audioRecordingSupported(target: unknown = globalThis) {
  const candidate = target as Partial<Window & typeof globalThis> | undefined;
  return Boolean(candidate?.MediaRecorder && candidate.navigator?.mediaDevices?.getUserMedia);
}

function preferredAudioMimeType(target: unknown = globalThis) {
  const candidate = target as Partial<Window & typeof globalThis> | undefined;
  const recorder = candidate?.MediaRecorder;
  if (!recorder?.isTypeSupported) return "";
  for (const mimeType of ["audio/webm", "audio/ogg", "audio/mp4"]) {
    if (recorder.isTypeSupported(mimeType)) return mimeType;
  }
  return "";
}

function recordingFileName(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "recording.mp4";
  if (normalized.includes("ogg")) return "recording.ogg";
  if (normalized.includes("mpeg")) return "recording.mp3";
  if (normalized.includes("wav")) return "recording.wav";
  return "recording.webm";
}

function stopMediaStream(stream: MediaStream | null) {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

function recordingErrorMessage(error: unknown) {
  if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
    return "Microphone access was denied. Check browser permissions and try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found for voice input.";
  }
  return error instanceof Error ? error.message : "Voice input failed. Try again.";
}

function MessageBubble({ live = false, message }: { live?: boolean; message: ChatMessage }) {
  return (
    <article className={`message ${message.role} ${live ? "live" : ""}`}>
      <div className="message-role">{message.role}</div>
      <MessageContent message={message} />
    </article>
  );
}

function MessageContent({ message }: { message: ChatMessage }) {
  const blocks = renderableMessageBlocks(message);
  return (
    <div className="message-content structured">
      {blocks.map((block, index) =>
        block.type === "image" ? (
          <figure className="message-image" key={`${block.type}-${index}`}>
            <img alt={block.name ?? "Message image"} src={imageDataUrl(block)} />
            {block.name ? <figcaption>{block.name}</figcaption> : null}
          </figure>
        ) : (
          <MarkdownContent content={block.text} key={`${block.type}-${index}`} />
        )
      )}
    </div>
  );
}

function ReviewArtifactCard({
  artifact,
  onOpen
}: {
  artifact: ReviewArtifactSummary;
  onOpen: (artifactId: string) => void;
}) {
  const image = imagePreviewFromArtifact(artifact);
  if (image) {
    const description = image.caption ?? artifact.summary ?? artifact.title ?? image.sourcePath;
    return (
      <Button
        aria-label={`Open image preview: ${artifact.title}`}
        className="review-card image-artifact-card"
        onPress={() => onOpen(artifact.id)}
      >
        <figure className="artifact-image-preview">
          <img alt={image.name ?? artifact.title} src={image.src} />
          {description ? <figcaption>{description}</figcaption> : null}
        </figure>
      </Button>
    );
  }
  return (
    <Button className="review-card" onPress={() => onOpen(artifact.id)}>
      <span className="message-role">{artifact.kind}</span>
      <strong>{artifact.title}</strong>
      <span>{artifact.summary}</span>
      <small>
        {artifact.source}
        {artifact.toolCallId ? ` · ${artifact.toolCallId}` : ""}
      </small>
    </Button>
  );
}
