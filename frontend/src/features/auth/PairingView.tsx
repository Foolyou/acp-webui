import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "react-aria-components";
import { FullscreenButton } from "../../components/FullscreenButton";
import type { AuthStatus } from "../../types";

export function PairingView({
  auth,
  onPair
}: {
  auth: AuthStatus | null;
  onPair: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onPair(trimmed);
      setToken("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pairing-shell">
      <section className="pairing-panel">
        <div className="pairing-panel-head">
          <div>
            <p className="eyebrow">ACP Web UI</p>
            <h1>Pair this browser</h1>
          </div>
          <FullscreenButton />
        </div>
        <p className="muted">Enter the pairing token shown in the backend terminal.</p>
        {auth?.clientIp ? <p className="muted">Client: {auth.clientIp}</p> : null}
        <form className="pairing-form" onSubmit={onSubmit}>
          <input
            autoComplete="one-time-code"
            autoFocus
            name="token"
            onChange={(event) => setToken(event.target.value)}
            placeholder="Pairing token"
            value={token}
          />
          <Button className="primary" isDisabled={busy || !token.trim()} type="submit">
            Pair
          </Button>
        </form>
        {error ? <div className="notice error">{error}</div> : null}
      </section>
    </main>
  );
}
