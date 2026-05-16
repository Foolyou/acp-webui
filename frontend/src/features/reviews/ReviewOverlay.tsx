import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { MarkdownContent } from "../../components/MarkdownContent";
import type { ReviewArtifact } from "../../types";
import { imagePreviewFromPayload } from "../../utils/imagePreview";
import { payloadText } from "../../utils/payload";

export function ReviewOverlay({ artifact, onClose }: { artifact: ReviewArtifact | null; onClose: () => void }) {
  return (
    <ModalOverlay className="modal-backdrop" isDismissable isOpen={Boolean(artifact)} onOpenChange={(open) => !open && onClose()}>
      <Modal className="review-modal">
        <Dialog aria-label="Review artifact" className="modal-dialog">
          {artifact ? (
            <>
              <div className="modal-header">
                <div>
                  <p className="eyebrow">{artifact.kind}</p>
                  <Heading slot="title">{artifact.title}</Heading>
                </div>
                <Button className="secondary small" onPress={onClose}>
                  Close
                </Button>
              </div>
              <div className="modal-body">
                {artifact.kind === "image" ? null : (
                  <div className="review-summary">
                    <p className="muted">{artifact.summary}</p>
                    <div className="review-nav">
                      <span>{artifact.source}</span>
                      {artifact.toolCallId ? <span>{artifact.toolCallId}</span> : null}
                    </div>
                  </div>
                )}
                <ReviewPayload artifact={artifact} />
              </div>
            </>
          ) : null}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

function ReviewPayload({ artifact }: { artifact: ReviewArtifact }) {
  if (artifact.kind === "diff") {
    return <DiffPayload payload={artifact.payload} />;
  }
  if (artifact.kind === "markdown") {
    return <MarkdownPayload payload={artifact.payload} />;
  }
  if (artifact.kind === "terminal") {
    return <pre className="review-pre">{payloadText(artifact.payload)}</pre>;
  }
  if (artifact.kind === "changed_files") {
    return <ChangedFilesPayload payload={artifact.payload} />;
  }
  if (artifact.kind === "tool_call") {
    return <pre className="review-pre">{payloadText(artifact.payload)}</pre>;
  }
  if (artifact.kind === "image") {
    return <ImagePayload artifact={artifact} />;
  }
  return <pre className="review-pre">{JSON.stringify(artifact.payload, null, 2)}</pre>;
}

function ChangedFilesPayload({ payload }: { payload: unknown }) {
  const files = changedFilesFromPayload(payload);
  if (!files.length) {
    return <pre className="review-pre">{payloadText(payload)}</pre>;
  }
  return (
    <div className="changed-files-review">
      {files.map((file) => (
        <div className="changed-file-row" key={`${file.path}-${file.status}`}>
          <strong>{file.path}</strong>
          {file.status ? <span>{file.status}</span> : null}
        </div>
      ))}
    </div>
  );
}

function changedFilesFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const value = payload as Record<string, unknown>;
  const candidates = Array.isArray(value.files)
    ? value.files
    : Array.isArray(value.changedFiles)
      ? value.changedFiles
      : [];
  return candidates
    .map((item) => {
      if (typeof item === "string") {
        return { path: item, status: "" };
      }
      if (!item || typeof item !== "object") return null;
      const file = item as Record<string, unknown>;
      const path =
        typeof file.path === "string"
          ? file.path
          : typeof file.name === "string"
            ? file.name
            : typeof file.file === "string"
              ? file.file
              : "";
      if (!path) return null;
      return {
        path,
        status: typeof file.status === "string" ? file.status : ""
      };
    })
    .filter((item): item is { path: string; status: string } => Boolean(item));
}

function ImagePayload({ artifact }: { artifact: ReviewArtifact }) {
  const image = imagePreviewFromPayload(artifact.payload, artifact.title);
  if (!image) {
    return <p className="muted">Image preview unavailable.</p>;
  }
  const description = image.caption ?? artifact.summary ?? image.sourcePath;
  return (
    <div className="review-image">
      <img alt={image.name ?? artifact.title} src={image.src} />
      {description ? <p className="muted">{description}</p> : null}
    </div>
  );
}

function DiffPayload({ payload }: { payload: unknown }) {
  const diff = payloadText(payload);
  const files = diff
    .split("\n")
    .filter((line) => line.startsWith("diff --git "))
    .map((line) => line.split(" b/")[1] ?? line);
  const hunks = diff.split("\n").filter((line) => line.startsWith("@@"));

  return (
    <>
      {files.length ? (
        <div className="review-nav">
          {files.map((file) => (
            <span key={file}>{file}</span>
          ))}
        </div>
      ) : null}
      {hunks.length ? (
        <div className="review-nav hunks">
          {hunks.map((hunk) => (
            <span key={hunk}>{hunk}</span>
          ))}
        </div>
      ) : null}
      <pre className="review-pre diff">{diff || "No diff content."}</pre>
    </>
  );
}

function MarkdownPayload({ payload }: { payload: unknown }) {
  const text = payloadText(payload);
  return (
    <>
      <MarkdownContent className="markdown-preview" content={text} />
      <details className="raw-details">
        <summary>Raw</summary>
        <pre className="review-pre">{text}</pre>
      </details>
    </>
  );
}
