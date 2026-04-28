import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "react-aria-components";
import { liveMessage, timelineMessage } from "../../app/timeline";
import { PageHeader } from "../../components/common";
import type { ChatMessage, ConnectionStatus, ReviewArtifactSummary, SessionDetail, TimelineItem } from "../../types";

export function SessionPane({
  busy,
  codex,
  currentSession,
  liveAssistant,
  onOpenDiffFallback,
  onOpenReviewArtifact,
  onSendPrompt
}: {
  busy: boolean;
  codex: ConnectionStatus;
  currentSession: SessionDetail;
  liveAssistant: string;
  onOpenDiffFallback: () => void;
  onOpenReviewArtifact: (artifactId: string) => void;
  onSendPrompt: (prompt: string) => Promise<void>;
}) {
  const waitingApproval =
    Boolean(currentSession.pendingPermission) || currentSession.session.status === "waiting_approval";
  const running = currentSession.session.status === "running" || waitingApproval;
  const canSend = currentSession.continuable && !running;

  return (
    <section className="session-layout">
      <div className="session-toolbar">
        <PageHeader eyebrow={currentSession.workspace.name} title="Session" />
        <div className="section-actions">
          <Button className="secondary small" isDisabled={busy} onPress={onOpenDiffFallback}>
            Diff
          </Button>
          <span className={`badge ${currentSession.session.status}`}>{currentSession.session.status}</span>
        </div>
      </div>
      <div className="timeline" id="timeline">
        {currentSession.failureMessage ? <div className="notice error">{currentSession.failureMessage}</div> : null}
        {!currentSession.continuable ? <div className="notice warning">{currentSession.viewOnlyReason}</div> : null}
        {waitingApproval ? (
          <div className="notice approval">
            Waiting for approval: {currentSession.pendingPermission?.title ?? "Permission requested"}
          </div>
        ) : null}
        {currentSession.timeline.map((item) => (
          <TimelineRow item={item} key={`${item.kind}-${item.id}`} onOpenReviewArtifact={onOpenReviewArtifact} />
        ))}
        {running && !liveAssistant ? <RunningSkeleton waitingApproval={waitingApproval} /> : null}
        {liveAssistant ? <MessageBubble live message={liveMessage(currentSession.session.id, liveAssistant)} /> : null}
      </div>
      <PromptComposer
        busy={busy}
        codex={codex}
        disabled={!canSend}
        running={running}
        viewOnlyReason={currentSession.viewOnlyReason}
        waitingApproval={waitingApproval}
        onSendPrompt={onSendPrompt}
      />
    </section>
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
  return (
    <details className={`tool-row ${item.status}`}>
      <summary>
        <span className="tool-kind">{item.toolKind}</span>
        <strong>{item.title}</strong>
        <span>{item.status}</span>
      </summary>
      <p>{item.summary}</p>
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
        <summary>Raw</summary>
        <pre className="review-pre">{JSON.stringify({ input: item.input, output: item.output }, null, 2)}</pre>
      </details>
    </details>
  );
}

function RunningSkeleton({ waitingApproval }: { waitingApproval: boolean }) {
  return (
    <div className="message assistant live">
      <div className="message-role">{waitingApproval ? "approval" : "codex"}</div>
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
    </div>
  );
}

function PromptComposer({
  busy,
  codex,
  disabled,
  onSendPrompt,
  running,
  viewOnlyReason,
  waitingApproval
}: {
  busy: boolean;
  codex: ConnectionStatus;
  disabled: boolean;
  onSendPrompt: (prompt: string) => Promise<void>;
  running: boolean;
  viewOnlyReason?: string | null;
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

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (composing) return;
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submitPrompt();
    }
  }

  const status = viewOnlyReason
    ? viewOnlyReason
    : waitingApproval
      ? "Waiting for approval"
      : running
        ? "Codex is working..."
        : codex.state !== "ready"
          ? codex.message ?? "Codex is not ready"
          : null;

  return (
    <div className="composer-wrap">
      {status ? <div className={`composer-status ${viewOnlyReason ? "warning" : ""}`}>{status}</div> : null}
      <form className="composer" onSubmit={onSubmit}>
        <textarea
          disabled={disabled}
          onChange={(event) => setPrompt(event.target.value)}
          onCompositionEnd={() => setComposing(false)}
          onCompositionStart={() => setComposing(true)}
          onKeyDown={onKeyDown}
          placeholder={
            viewOnlyReason
              ? "Start a new session to continue"
              : waitingApproval
                ? "Resolve approval before sending another prompt"
                : "Ask Codex..."
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
      <div className="message-content">{message.content}</div>
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
