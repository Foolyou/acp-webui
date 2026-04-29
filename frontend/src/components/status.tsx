import type { AgentRuntimeStatus, SocketState } from "../types";

export function StatusStack({ agents, socketState }: { agents: AgentRuntimeStatus[]; socketState: SocketState }) {
  return (
    <div className="status-stack">
      {agents.map((agent) => (
        <StatusPill detail={agent.status.message ?? agent.title} key={agent.id} stateText={agent.status.state} />
      ))}
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
