import { useCallback, useEffect, useState } from "react";
import { Button } from "react-aria-components";

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenDocumentLike = {
  fullscreenElement?: unknown;
  fullscreenEnabled?: boolean;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: unknown;
  webkitFullscreenEnabled?: boolean;
};

export type FullscreenElementLike = {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export function FullscreenButton() {
  const [active, setActive] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const syncFullscreenState = () => {
      const state = fullscreenControlState(fullscreenDocument(), fullscreenRoot());
      setActive(state.active);
      setAvailable(state.available);
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("fullscreenerror", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenerror", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("fullscreenerror", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenerror", syncFullscreenState);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    if (!available) {
      return;
    }

    try {
      await toggleFullscreen(fullscreenDocument(), fullscreenRoot());
    } catch {
      setActive(fullscreenControlState(fullscreenDocument(), fullscreenRoot()).active);
    }
  }, [available]);

  if (available === false) {
    return null;
  }

  const label = active ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <Button
      aria-label={label}
      className={`icon-button fullscreen-toggle ${active ? "active" : ""}`}
      data-tooltip={label}
      isDisabled={available !== true}
      onPress={() => {
        void handleToggleFullscreen();
      }}
    >
      <span aria-hidden="true" className="fullscreen-corner top-left" />
      <span aria-hidden="true" className="fullscreen-corner top-right" />
      <span aria-hidden="true" className="fullscreen-corner bottom-left" />
      <span aria-hidden="true" className="fullscreen-corner bottom-right" />
      <span className="visually-hidden">{label}</span>
    </Button>
  );
}

function fullscreenDocument() {
  return document as FullscreenDocument;
}

function fullscreenRoot() {
  return document.documentElement as FullscreenElement;
}

export function fullscreenControlState(doc: FullscreenDocumentLike, root: FullscreenElementLike) {
  const active = Boolean(fullscreenElement(doc));
  const available = isFullscreenAvailable(doc, root);
  return {
    active,
    available,
    label: active ? "Exit fullscreen" : "Enter fullscreen"
  };
}

export function toggleFullscreen(doc: FullscreenDocumentLike, root: FullscreenElementLike) {
  if (!isFullscreenAvailable(doc, root)) {
    return undefined;
  }
  if (!fullscreenElement(doc)) {
    return requestFullscreen(root);
  }
  return exitFullscreen(doc);
}

function fullscreenElement(doc: FullscreenDocumentLike) {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function isFullscreenAvailable(doc: FullscreenDocumentLike, root: FullscreenElementLike) {
  return Boolean((doc.fullscreenEnabled || doc.webkitFullscreenEnabled) && (root.requestFullscreen || root.webkitRequestFullscreen));
}

function requestFullscreen(root: FullscreenElementLike) {
  const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
  return request?.call(root);
}

function exitFullscreen(doc: FullscreenDocumentLike) {
  const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
  return exit?.call(doc);
}
