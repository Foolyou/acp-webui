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

export function FullscreenButton() {
  const [active, setActive] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const syncFullscreenState = () => {
      setActive(Boolean(fullscreenElement()));
      setAvailable(isFullscreenAvailable());
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

  const toggleFullscreen = useCallback(async () => {
    if (!available) {
      return;
    }

    try {
      if (!fullscreenElement()) {
        await requestFullscreen(document.documentElement);
        return;
      }

      await exitFullscreen();
    } catch {
      setActive(Boolean(fullscreenElement()));
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
        void toggleFullscreen();
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

function fullscreenElement() {
  const doc = fullscreenDocument();
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function isFullscreenAvailable() {
  const doc = fullscreenDocument();
  const root = document.documentElement as FullscreenElement;
  return Boolean((document.fullscreenEnabled || doc.webkitFullscreenEnabled) && (root.requestFullscreen || root.webkitRequestFullscreen));
}

function requestFullscreen(element: HTMLElement) {
  const target = element as FullscreenElement;
  const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
  return request?.call(target);
}

function exitFullscreen() {
  const doc = fullscreenDocument();
  const exit = document.exitFullscreen ?? doc.webkitExitFullscreen;
  return exit?.call(document);
}
