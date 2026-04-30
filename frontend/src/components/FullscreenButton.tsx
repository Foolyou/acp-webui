import { useCallback, useEffect, useState } from "react";
import { Button } from "react-aria-components";

export function FullscreenButton() {
  const [active, setActive] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const syncFullscreenState = () => {
      setActive(Boolean(document.fullscreenElement));
      setAvailable(Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen));
    };

    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("fullscreenerror", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("fullscreenerror", syncFullscreenState);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!available) {
      return;
    }

    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        return;
      }

      await document.exitFullscreen();
    } catch {
      setActive(Boolean(document.fullscreenElement));
    }
  }, [available]);

  const label = !available ? "Fullscreen unavailable" : active ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <Button
      aria-label={label}
      className={`icon-button fullscreen-toggle ${active ? "active" : ""}`}
      data-tooltip={label}
      isDisabled={!available}
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
