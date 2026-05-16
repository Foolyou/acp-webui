import { describe, expect, test, vi } from "vitest";
import { fullscreenControlState, toggleFullscreen } from "./FullscreenButton";

function fullscreenFixture({
  active = false,
  available = true
}: {
  active?: boolean;
  available?: boolean;
} = {}) {
  const root = {
    requestFullscreen: available ? vi.fn() : undefined,
    webkitRequestFullscreen: undefined
  };
  const doc = {
    fullscreenElement: active ? root : null,
    fullscreenEnabled: available,
    exitFullscreen: vi.fn(),
    webkitFullscreenElement: null,
    webkitFullscreenEnabled: false,
    webkitExitFullscreen: undefined
  };
  return { doc, root };
}

describe("fullscreenControlState", () => {
  test("reports available inactive fullscreen controls", () => {
    const { doc, root } = fullscreenFixture();

    expect(fullscreenControlState(doc, root)).toEqual({
      active: false,
      available: true,
      label: "Enter fullscreen"
    });
  });

  test("reports active fullscreen controls", () => {
    const { doc, root } = fullscreenFixture({ active: true });

    expect(fullscreenControlState(doc, root)).toEqual({
      active: true,
      available: true,
      label: "Exit fullscreen"
    });
  });

  test("reports unsupported fullscreen controls", () => {
    const { doc, root } = fullscreenFixture({ available: false });

    expect(fullscreenControlState(doc, root)).toEqual({
      active: false,
      available: false,
      label: "Enter fullscreen"
    });
  });
});

describe("toggleFullscreen", () => {
  test("requests fullscreen from the application root when inactive", async () => {
    const { doc, root } = fullscreenFixture();

    await toggleFullscreen(doc, root);

    expect(root.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(doc.exitFullscreen).not.toHaveBeenCalled();
  });

  test("exits fullscreen when active", async () => {
    const { doc, root } = fullscreenFixture({ active: true });

    await toggleFullscreen(doc, root);

    expect(doc.exitFullscreen).toHaveBeenCalledTimes(1);
    expect(root.requestFullscreen).not.toHaveBeenCalled();
  });
});
