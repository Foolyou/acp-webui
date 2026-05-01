import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "react-aria-components";
import { api } from "../../api";
import { currentModelLabel, modelSwitchDisabledReason, selectValues } from "../../app/sessionConfig";
import { liveMessage, timelineMessage } from "../../app/timeline";
import { buildTimelineBlocks, type TimelineDisplayBlock, type TimelineToolGroupEntry } from "../../app/timelineBlocks";
import { MarkdownContent } from "../../components/MarkdownContent";
import type {
  AgentRuntimeStatus,
  ChatMessage,
  MessageContentBlock,
  PermissionModeId,
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
import { sessionStatusLabel } from "../../utils/sessionStatus";

const SCROLL_BOTTOM_PROXIMITY_PX = 24;
const PROGRAMMATIC_SCROLL_WINDOW_MS = 800;
const SUPPORTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ImageAttachment = Extract<MessageContentBlock, { type: "image" }> & {
  id: string;
  size: number;
};

export function SessionPane({
  agentStatus,
  busy,
  currentSession,
  liveAssistant,
  onOpenDiffFallback,
  onOpenReviewArtifact,
  onRestoreSession,
  onSetSessionConfigOption,
  onStopSession,
  onSendPrompt
}: {
  agentStatus: AgentRuntimeStatus | null;
  busy: boolean;
  currentSession: SessionDetail;
  liveAssistant: string;
  onOpenDiffFallback: () => void;
  onOpenReviewArtifact: (artifactId: string) => void;
  onRestoreSession: (sessionId: string) => Promise<void>;
  onSetSessionConfigOption: (configId: string, value: string) => Promise<void>;
  onStopSession: () => Promise<void>;
  onSendPrompt: (prompt: string, contentBlocks?: MessageContentBlock[]) => Promise<void>;
}) {
  const waitingApproval =
    Boolean(currentSession.pendingPermission) || currentSession.session.status === "waiting_approval";
  const running = ["running", "stopping"].includes(currentSession.session.status) || waitingApproval;
  const continuity = currentSession.continuity;
  const agentName = currentSession.session.agentName;
  const permissionModes = agentStatus ? fallbackPermissionModes(agentStatus) : [];
  const permissionMode = currentSession.session.permissionMode;
  const agentConnection = agentStatus ? connectionStatusForMode(agentStatus, permissionMode) : null;
  const agentReady = !agentConnection || agentConnection.state === "ready";
  const canSend = continuity.continuable && agentReady;
  const canRestore = continuity.restorable && !continuity.restoring;
  const queuedApprovalCount = currentSession.queuedApprovalCount ?? 0;
  const continuityReason = continuity.reason ?? currentSession.viewOnlyReason;
  const restoreButtonLabel = continuity.restoring
    ? "Restoring..."
    : continuity.state === "restore_failed"
      ? "Retry restore"
      : "Restore";
  const sessionSelectOptions = (currentSession.configOptions ?? []).filter((option) => selectValues(option).length > 0);
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
        onSetSessionConfigOption={onSetSessionConfigOption}
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
        {waitingApproval ? (
          <div className="notice approval">
            Waiting for approval: {currentSession.pendingPermission?.title ?? "Permission requested"}
            {queuedApprovalCount > 0 ? ` (${queuedApprovalCount} queued)` : ""}
          </div>
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
        agentStatus={agentStatus}
        disabled={!canSend}
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
        onStopSession={onStopSession}
        waitingApproval={waitingApproval}
        onSendPrompt={onSendPrompt}
        workspaceId={currentSession.workspace.id}
      />
    </section>
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

export function formatActiveTurnElapsed(startedAt: string, now: number = Date.now()) {
  const elapsedMs = Math.max(0, now - Date.parse(startedAt));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
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
  onSetSessionConfigOption,
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
  onSetSessionConfigOption: (configId: string, value: string) => Promise<void>;
  permissionMode: PermissionModeId;
  permissionModes: ReturnType<typeof fallbackPermissionModes>;
  sessionSelectOptions: NonNullable<SessionDetail["configOptions"]>;
}) {
  const [infoExpandedState, setInfoExpandedState] = useState({
    sessionId: currentSession.session.id,
    value: false
  });
  const infoExpanded = infoExpandedState.sessionId === currentSession.session.id ? infoExpandedState.value : false;

  function toggleInfoExpanded() {
    setInfoExpandedState((current) => ({
      sessionId: currentSession.session.id,
      value: current.sessionId === currentSession.session.id ? !current.value : true
    }));
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
            <strong>{agentName} Session</strong>
            <span className={`badge ${currentSession.session.status}`}>
              {sessionStatusLabel(currentSession.session.status)}
            </span>
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
      return <ToolGroupRow block={block} onOpenReviewArtifact={onOpenReviewArtifact} />;
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
  onOpenReviewArtifact
}: {
  block: Extract<TimelineDisplayBlock, { kind: "tool_group" }>;
  onOpenReviewArtifact: (artifactId: string) => void;
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
        <strong className="tool-group-summary">{block.summary}</strong>
        {block.statusLabel ? <span className={`tool-status ${block.status}`}>{block.statusLabel}</span> : null}
        <Button
          aria-expanded={expanded}
          className="secondary small tool-group-toggle"
          type="button"
          onPress={() => setExpanded((current) => !current)}
        >
          {expanded ? "Hide" : "Details"}
        </Button>
      </div>
      {expanded ? (
        <div className="tool-group-items">
          {block.entries.map((entry) => (
            <ToolGroupItem
              entry={entry}
              key={entry.item.id}
              onOpenReviewArtifact={onOpenReviewArtifact}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ToolGroupItem({
  entry,
  onOpenReviewArtifact
}: {
  entry: TimelineToolGroupEntry;
  onOpenReviewArtifact: (artifactId: string) => void;
}) {
  const [outputExpanded, setOutputExpanded] = useState(false);
  const { display, item } = entry;
  const showOutputTail = Boolean(display.outputTail) && (outputExpanded || item.status === "failed");
  const artifactActions = display.evidenceActions.filter(
    (action) => action.kind !== "diagnostics" && action.kind !== "output"
  );
  const hasOutputAction = display.evidenceActions.some((action) => action.kind === "output");

  return (
    <div className={`tool-item ${display.kind} ${item.status}`}>
      <div className="tool-item-main">
        <span className="tool-action">{display.actionLabel}</span>
        <strong>{display.subject}</strong>
        <span className={`tool-status ${display.status}`}>{display.statusLabel}</span>
      </div>
      {showOutputTail && display.outputTail ? <pre className="tool-output">{display.outputTail}</pre> : null}
      <div className="tool-links">
        {hasOutputAction ? (
          <Button className="secondary small" onPress={() => setOutputExpanded((current) => !current)}>
            {outputExpanded ? "Hide output" : "Output"}
          </Button>
        ) : null}
        {artifactActions.map((action) => (
          <Button className="secondary small" key={action.id} onPress={() => onOpenReviewArtifact(action.id)}>
            {action.label}
          </Button>
        ))}
        <details className="tool-diagnostics raw-details">
          <summary>Diagnostics</summary>
          <pre className="review-pre">
            {JSON.stringify(
              { input: display.diagnostics.rawInput, output: display.diagnostics.rawOutput },
              null,
              2
            )}
          </pre>
        </details>
      </div>
    </div>
  );
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

export function insertPromptTemplateBody(current: string, body: string) {
  const templateBody = body.trim();
  if (!templateBody) return current;
  if (!current.trim()) return templateBody;
  return `${current.trimEnd()}\n\n${templateBody}`;
}

export function defaultPromptTemplateTitle(body: string) {
  const firstLine = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Untitled prompt";
  return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function PromptComposer({
  agentName,
  agentId,
  agentStatus,
  busy,
  disabled,
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
  onStopSession,
  waitingApproval,
  workspaceId
}: {
  agentName: string;
  agentId: string;
  agentStatus: AgentRuntimeStatus | null;
  busy: boolean;
  disabled: boolean;
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
  onStopSession: () => Promise<void>;
  waitingApproval: boolean;
  workspaceId: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [composing, setComposing] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imagePromptSupported = agentStatus?.status.promptCapabilities?.image === true;

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
    if (!templatesOpen) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
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
    await onSendPrompt(
      trimmed,
      attachments.map(({ id: _id, size: _size, ...block }) => block)
    );
    setPrompt("");
    setAttachments([]);
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

  async function onImageFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
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

  const status = continuityReason
    ? continuityReason
    : waitingApproval
      ? "Waiting for approval"
      : stoppingTurn
        ? `Stopping ${agentName}${elapsedLabel ? ` after ${elapsedLabel}` : "..."}`
      : running
        ? `${agentName} is working${elapsedLabel ? ` for ${elapsedLabel}` : "..."}`
        : agentStatus && agentStatus.status.state !== "ready"
          ? agentStatus.status.message ?? `${agentName} is ${agentStatus.status.state}`
          : null;

  return (
    <div className={`composer-wrap ${waitingApproval ? "blocked" : ""}`}>
      {status || restoreButtonLabel || queuedPromptCount > 0 || canStop ? (
        <div className="composer-topline">
          {status ? <div className={`composer-status ${continuityReason ? "warning" : ""}`}>{status}</div> : <span />}
          {queuedPromptCount > 0 ? <span className="queued-count">{queuedPromptCount} queued</span> : null}
          {canStop ? (
            <Button
              className="secondary small stop-button"
              isDisabled={busy}
              onPress={() => {
                void onStopSession();
              }}
            >
              Stop
            </Button>
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
      <form className="composer" onSubmit={onSubmit}>
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
          onChange={(event) => setPrompt(event.target.value)}
          onCompositionEnd={() => setComposing(false)}
          onCompositionStart={() => setComposing(true)}
          onKeyDown={onKeyDown}
          placeholder={
            continuityReason
              ? restoreRequired
                ? "Restore session to continue"
                : "Start a new session to continue"
              : waitingApproval
                ? "Queue a follow-up behind the approval..."
                : running
                  ? `Queue a follow-up for ${agentName}...`
                : `Ask ${agentName}...`
          }
          rows={waitingApproval ? 1 : 2}
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
                <img alt={attachment.name ?? "Attached image"} src={imageDataUrl(attachment)} />
                <span>{attachment.name ?? attachment.mimeType}</span>
                <Button
                  className="secondary small"
                  onPress={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                  type="button"
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        {attachmentError ? <div className="composer-error">{attachmentError}</div> : null}
        <div className="composer-actions">
          <span className="shortcut-hint">Ctrl Enter</span>
          <Button
            className="secondary"
            onPress={() => setTemplatesOpen((open) => !open)}
            type="button"
          >
            Prompts
          </Button>
          <Button
            className="secondary"
            isDisabled={disabled || busy || !imagePromptSupported}
            onPress={() => fileInputRef.current?.click()}
            type="button"
          >
            Image
          </Button>
          <Button className="primary" isDisabled={disabled || busy} type="submit">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
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

export function renderableMessageBlocks(message: Pick<ChatMessage, "content" | "contentBlocks">) {
  const blocks = message.contentBlocks?.length
    ? message.contentBlocks
    : message.content
      ? [{ type: "text" as const, text: message.content }]
      : [];
  return blocks.reduce<MessageContentBlock[]>((merged, block) => {
    const previous = merged[merged.length - 1];
    if (block.type === "text" && previous?.type === "text") {
      merged[merged.length - 1] = { type: "text", text: previous.text + block.text };
    } else {
      merged.push(block);
    }
    return merged;
  }, []);
}

function ReviewArtifactCard({
  artifact,
  onOpen
}: {
  artifact: ReviewArtifactSummary;
  onOpen: (artifactId: string) => void;
}) {
  const image = imagePreviewFromArtifact(artifact);
  return (
    <Button className="review-card" onPress={() => onOpen(artifact.id)}>
      <span className="message-role">{artifact.kind}</span>
      {image ? (
        <figure className="artifact-image-preview">
          <img alt={image.name ?? artifact.title} src={image.src} />
          {image.caption || image.sourcePath ? <figcaption>{image.caption ?? image.sourcePath}</figcaption> : null}
        </figure>
      ) : null}
      <strong>{artifact.title}</strong>
      <span>{artifact.summary}</span>
      <small>
        {artifact.source}
        {artifact.toolCallId ? ` · ${artifact.toolCallId}` : ""}
      </small>
    </Button>
  );
}
