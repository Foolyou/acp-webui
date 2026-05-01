export function sessionStatusLabel(status: string) {
  switch (status.toLowerCase()) {
    case "idle":
      return "Ready";
    case "running":
      return "Working";
    case "waiting_approval":
      return "Waiting approval";
    case "stopping":
      return "Stopping";
    case "stopped":
      return "Stopped";
    case "failed":
      return "Failed";
    default:
      return humanizeStatus(status);
  }
}

function humanizeStatus(status: string) {
  const text = status.replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}
