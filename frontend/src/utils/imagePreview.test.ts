import { describe, expect, test } from "vitest";
import { imagePreviewFromArtifact, imagePreviewFromPayload } from "./imagePreview";

describe("imagePreview", () => {
  test("builds data URLs for image artifact previews", () => {
    const preview = imagePreviewFromArtifact({
      kind: "image",
      title: "Preview",
      preview: {
        mimeType: "image/png",
        data: "aW1hZ2U=",
        name: "preview.png",
        caption: "Generated image",
        sourcePath: "preview.png"
      }
    });

    expect(preview).toEqual({
      src: "data:image/png;base64,aW1hZ2U=",
      name: "preview.png",
      caption: "Generated image",
      sourcePath: "preview.png"
    });
  });

  test("rejects non-image payloads", () => {
    expect(imagePreviewFromPayload({ mimeType: "text/plain", data: "abc" })).toBeNull();
    expect(imagePreviewFromPayload({ mimeType: "image/png" })).toBeNull();
  });
});
