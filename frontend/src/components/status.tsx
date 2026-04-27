import type { ConnectionStatus, SocketState } from "../types";

export function StatusStack({ codex, socketState }: { codex: ConnectionStatus; socketState: SocketState }) {
  return (
    <div className="status-stack">
      <StatusPill detail={codex.message ?? "Codex"} stateText={codex.state} />
      <StatusPill detail="Realtime" stateText={socketState} />
    </div>
  );
}

export function StatusDot({ stateText }: { stateText: string }) {
  return <span aria-label={stateText} className={`status-dot ${stateText}`} />;
}

function StatusPill({ stateText, detail }: { stateText: string; detail: string }) {
  return (
    <div className={`pill ${stateText}`}>
      <span>{stateText}</span>
      <small>{detail}</small>
    </div>
  );
}
