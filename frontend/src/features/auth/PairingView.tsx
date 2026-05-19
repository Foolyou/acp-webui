import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { api, errorMessage } from "../../api";
import { FullscreenButton } from "../../components/FullscreenButton";
import type { AuthStatus, DeviceRequest } from "../../types";

function groupedCode(code: string) {
  return (
    code
      .replace(/[\s-]+/g, "")
      .match(/.{1,4}/g)
      ?.join(" ") ?? code
  );
}

function formatExpiration(expiresAt: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) {
    return expiresAt;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PairingView({
  auth,
  onApproved
}: {
  auth: AuthStatus | null;
  onApproved: (auth: AuthStatus) => Promise<void>;
}) {
  const [request, setRequest] = useState<DeviceRequest | null>(null);
  const [busy, setBusy] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);
  const approvedRef = useRef(false);

  const createRequest = useCallback(async () => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    approvedRef.current = false;
    setBusy(true);
    setApproving(false);
    setError(null);
    setRequest(null);

    try {
      const nextRequest = await api.createDeviceRequest();
      if (generationRef.current !== generation) return;
      setRequest(nextRequest);
    } catch (error) {
      if (generationRef.current !== generation) return;
      setError(errorMessage(error));
    } finally {
      if (generationRef.current === generation) {
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void createRequest(), 0);
    return () => {
      window.clearTimeout(timer);
      generationRef.current += 1;
    };
  }, [createRequest]);

  useEffect(() => {
    if (!request?.code || request.status !== "pending" || approving) {
      return;
    }

    let cancelled = false;
    const generation = generationRef.current;
    const codeToPoll = request.code;
    let timer: number | undefined;

    async function poll() {
      try {
        const nextRequest = await api.deviceRequest(codeToPoll);
        if (cancelled || generationRef.current !== generation) return;
        setRequest(nextRequest);
        setError(null);

        if (nextRequest.status === "approved") {
          if (!nextRequest.auth) {
            setError("Device approval did not include auth status.");
            return;
          }
          if (approvedRef.current) return;
          approvedRef.current = true;
          setApproving(true);
          try {
            await onApproved(nextRequest.auth);
          } catch (error) {
            if (!cancelled && generationRef.current === generation) {
              approvedRef.current = false;
              setApproving(false);
              setError(errorMessage(error));
            }
          }
          return;
        }

        if (nextRequest.status === "expired") {
          return;
        }

        timer = window.setTimeout(poll, 2000);
      } catch (error) {
        if (cancelled || generationRef.current !== generation) return;
        setError(errorMessage(error));
        timer = window.setTimeout(poll, 2000);
      }
    }

    timer = window.setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [approving, onApproved, request?.code, request?.status]);

  const expired = request?.status === "expired";
  const approved = request?.status === "approved";
  const code = request ? groupedCode(request.code) : "";

  return (
    <main className="pairing-shell">
      <section className="pairing-panel">
        <div className="pairing-panel-head">
          <div>
            <p className="eyebrow">ACP Web UI</p>
            <h1>Approve this browser</h1>
          </div>
          <FullscreenButton />
        </div>
        <p className="muted">Use the code below to approve this browser from the backend terminal.</p>
        {request?.clientIp || auth?.clientIp ? <p className="muted">Client: {request?.clientIp ?? auth?.clientIp}</p> : null}
        <div className="pairing-form" aria-live="polite">
          <div
            aria-label="Device approval code"
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: 0,
              minHeight: 64,
              padding: "12px 14px",
              textAlign: "center"
            }}
          >
            {busy ? "Creating..." : code}
          </div>
          {request ? (
            <p className="muted">
              {expired
                ? "This approval code expired."
                : approved || approving
                  ? "Approved. Loading workspace..."
                  : `Waiting for approval. Expires at ${formatExpiration(request.expiresAt)}.`}
            </p>
          ) : null}
          {expired ? (
            <Button className="primary" onPress={() => void createRequest()}>
              Regenerate code
            </Button>
          ) : null}
        </div>
        {error ? <div className="notice error">{error}</div> : null}
      </section>
    </main>
  );
}
