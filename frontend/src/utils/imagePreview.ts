import type { ReviewArtifactSummary } from "../types";

export function imagePreviewFromArtifact(artifact: Pick<ReviewArtifactSummary, "kind" | "preview" | "title">) {
  if (artifact.kind !== "image") return null;
  return imagePreviewFromPayload(artifact.preview, artifact.title);
}

export function imagePreviewFromPayload(payload: unknown, fallbackName = "Image") {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : "";
  const data = typeof record.data === "string" ? record.data : "";
  if (!mimeType.startsWith("image/") || !data) return null;
  return {
    src: `data:${mimeType};base64,${data}`,
    name: typeof record.name === "string" && record.name ? record.name : fallbackName,
    caption: typeof record.caption === "string" && record.caption ? record.caption : null,
    sourcePath: typeof record.sourcePath === "string" && record.sourcePath ? record.sourcePath : null
  };
}
