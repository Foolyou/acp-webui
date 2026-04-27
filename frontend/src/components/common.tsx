export function PageHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="page-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

export function LoadingPanel({ text }: { text: string }) {
  return (
    <div className="page-surface loading-panel">
      <div className="skeleton-line wide" />
      <div className="skeleton-line" />
      <p className="muted">{text}</p>
    </div>
  );
}

export function BrandBlock() {
  return (
    <div className="brand">
      <p className="eyebrow">ACP Web UI</p>
      <h1>Codex Session</h1>
    </div>
  );
}
