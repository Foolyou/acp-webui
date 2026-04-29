import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { Button } from "react-aria-components";
import { currentModelLabel, modelConfigOption, modelSwitchDisabledReason, selectValues } from "../../app/sessionConfig";
import { liveMessage, timelineMessage } from "../../app/timeline";
import { MarkdownContent } from "../../components/MarkdownContent";
import { PageHeader } from "../../components/common";
import type { AgentRuntimeStatus, ChatMessage, ReviewArtifactSummary, SessionDetail, TimelineItem } from "../../types";
import { toolCallDisplay } from "../../utils/toolDisplay";
import {
  fallbackPermissionModes,
  connectionStatusForMode,
  isYoloSession,
  permissionModeClass,
  permissionModeDescription,
  permissionModeLabel
} from "../../utils/permissionMode";

const SCROLL_BOTTOM_PROXIMITY_PX = 24;
const PROGRAMMATIC_SCROLL_WINDOW_MS = 800;

export function SessionPane({
  agentStatus,
  busy,
  currentSession,
  liveAssistant,
  onOpenDiffFallback,
  onOpenReviewArtifact,
  onRestoreSession,
  onSetSessionConfigOption,
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
  onSendPrompt: (prompt: string) => Promise<void>;
}) {
  const waitingApproval =
    Boolean(currentSession.pendingPermission) || currentSession.session.status === "waiting_approval";
  const running = currentSession.session.status === "running" || waitingApproval;
  const continuity = currentSession.continuity;
  const agentName = currentSession.session.agentName;
  const permissionModes = agentStatus ? fallbackPermissionModes(agentStatus) : [];
  const permissionMode = currentSession.session.permissionMode;
  const agentConnection = agentStatus ? connectionStatusForMode(agentStatus, permissionMode) : null;
  const agentReady = !agentConnection || agentConnection.state === "ready";
  const canSend = continuity.continuable && !running && agentReady;
  const canRestore = continuity.restorable && !continuity.restoring;
  const queuedApprovalCount = currentSession.queuedApprovalCount ?? 0;
  const continuityReason = continuity.reason ?? currentSession.viewOnlyReason;
  const restoreButtonLabel = continuity.restoring
    ? "Restoring..."
    : continuity.state === "restore_failed"
      ? "Retry restore"
      : "Restore";
  const modelOption = modelConfigOption(currentSession.configOptions);
  const modelValues = selectValues(modelOption);
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
      <div className="session-toolbar">
        <PageHeader eyebrow={currentSession.workspace.name} title={`${agentName} Session`} />
        <div className="section-actions">
          <Button className="secondary small" isDisabled={busy} onPress={onOpenDiffFallback}>
            Diff
          </Button>
          <span className={`badge ${agentConnection?.state ?? "ready"}`}>{agentName}</span>
          <span
            className={`permission-mode-badge ${permissionModeClass(permissionMode)}`}
            title={permissionModeDescription(permissionMode, permissionModes)}
          >
            {permissionModeLabel(permissionMode, permissionModes)}
          </span>
          <span className={`badge ${currentSession.session.status}`}>{currentSession.session.status}</span>
        </div>
      </div>
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
        {currentSession.timeline.map((item) => (
          <TimelineRow item={item} key={`${item.kind}-${item.id}`} onOpenReviewArtifact={onOpenReviewArtifact} />
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
        agentStatus={agentStatus}
        disabled={!canSend}
        running={running}
        continuityReason={continuity.continuable ? null : continuityReason}
        onRestoreSession={() => onRestoreSession(currentSession.session.id)}
        restoreButtonLabel={continuity.restorable || continuity.restoring ? restoreButtonLabel : null}
        restoreDisabled={busy || !canRestore}
        restoreRequired={continuity.restorable || continuity.restoring}
        waitingApproval={waitingApproval}
        onSendPrompt={onSendPrompt}
        controls={
          modelOption ? (
            <ModelSelector
              busy={busy}
              disabledReason={modelDisabledReason}
              option={modelOption}
              values={modelValues}
              onSetSessionConfigOption={onSetSessionConfigOption}
            />
          ) : null
        }
      />
    </section>
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
  option: NonNullable<ReturnType<typeof modelConfigOption>>;
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

function TimelineRow({
  item,
  onOpenReviewArtifact
}: {
  item: TimelineItem;
  onOpenReviewArtifact: (artifactId: string) => void;
}) {
  switch (item.kind) {
    case "message":
      return <MessageBubble message={timelineMessage(item)} />;
    case "tool_call":
      return <ToolCallRow item={item} onOpenReviewArtifact={onOpenReviewArtifact} />;
    case "review_artifact":
      return (
        <ReviewArtifactCard
          artifact={{
            id: item.id,
            sessionId: item.sessionId,
            toolCallId: item.toolCallId,
            kind: item.artifactKind,
            title: item.title,
            summary: item.summary,
            source: item.source,
            createdAt: item.timestamp
          }}
          onOpen={onOpenReviewArtifact}
        />
      );
    case "permission":
      return (
        <div className="timeline-event">
          <span>{item.status}</span>
          <strong>{item.title}</strong>
        </div>
      );
  }
}

function ToolCallRow({
  item,
  onOpenReviewArtifact
}: {
  item: Extract<TimelineItem, { kind: "tool_call" }>;
  onOpenReviewArtifact: (artifactId: string) => void;
}) {
  const display = toolCallDisplay(item);

  return (
    <details className={`tool-row ${item.status}`}>
      <summary>
        <span className="tool-action">{display.actionLabel}</span>
        <span className="tool-heading">
          <strong>{display.subject}</strong>
          <span>{display.summary}</span>
        </span>
        <span className={`tool-status ${display.status}`}>{display.status}</span>
      </summary>
      {display.details.length ? (
        <dl className="tool-details">
          {display.details.map((detail) => (
            <div key={`${detail.label}-${detail.value}`}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {display.outputPreview ? <pre className="tool-output">{display.outputPreview}</pre> : null}
      {item.reviewArtifactIds.length ? (
        <div className="tool-links">
          {item.reviewArtifactIds.map((artifactId) => (
            <Button className="secondary small" key={artifactId} onPress={() => onOpenReviewArtifact(artifactId)}>
              Open artifact
            </Button>
          ))}
        </div>
      ) : null}
      <details className="raw-details">
        <summary>Raw payload</summary>
        <pre className="review-pre">{JSON.stringify({ input: display.rawInput, output: display.rawOutput }, null, 2)}</pre>
      </details>
    </details>
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

function PromptComposer({
  agentName,
  agentStatus,
  busy,
  disabled,
  onSendPrompt,
  onRestoreSession,
  running,
  restoreButtonLabel,
  restoreDisabled,
  continuityReason,
  controls,
  restoreRequired,
  waitingApproval
}: {
  agentName: string;
  agentStatus: AgentRuntimeStatus | null;
  busy: boolean;
  disabled: boolean;
  onSendPrompt: (prompt: string) => Promise<void>;
  onRestoreSession: () => Promise<void>;
  running: boolean;
  restoreButtonLabel: string | null;
  restoreDisabled: boolean;
  continuityReason?: string | null;
  controls?: ReactNode;
  restoreRequired: boolean;
  waitingApproval: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const [composing, setComposing] = useState(false);

  async function submitPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || disabled || busy) return;
    await onSendPrompt(trimmed);
    setPrompt("");
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

  const status = continuityReason
    ? continuityReason
    : waitingApproval
      ? "Waiting for approval"
      : running
        ? `${agentName} is working...`
        : agentStatus && agentStatus.status.state !== "ready"
          ? agentStatus.status.message ?? `${agentName} is ${agentStatus.status.state}`
          : null;

  return (
    <div className="composer-wrap">
      {status || restoreButtonLabel ? (
        <div className="composer-topline">
          {status ? <div className={`composer-status ${continuityReason ? "warning" : ""}`}>{status}</div> : <span />}
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
      {controls ? <div className="composer-control-bar">{controls}</div> : null}
      <form className="composer" onSubmit={onSubmit}>
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
                ? "Resolve approval before sending another prompt"
                : `Ask ${agentName}...`
          }
          rows={3}
          value={prompt}
        />
        <div className="composer-actions">
          <span className="shortcut-hint">Ctrl Enter</span>
          <Button className="primary" isDisabled={disabled || busy} type="submit">
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ live = false, message }: { live?: boolean; message: ChatMessage }) {
  return (
    <article className={`message ${message.role} ${live ? "live" : ""}`}>
      <div className="message-role">{message.role}</div>
      <MarkdownContent className="message-content" content={message.content} />
    </article>
  );
}

function ReviewArtifactCard({
  artifact,
  onOpen
}: {
  artifact: ReviewArtifactSummary;
  onOpen: (artifactId: string) => void;
}) {
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
