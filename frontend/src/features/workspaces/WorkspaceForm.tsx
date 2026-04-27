import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "react-aria-components";

export function WorkspaceForm({
  busy,
  onCreateWorkspace
}: {
  busy: boolean;
  onCreateWorkspace: (path: string) => Promise<void>;
}) {
  const [path, setPath] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = path.trim();
    if (!trimmed) return;
    await onCreateWorkspace(trimmed);
    setPath("");
  }

  return (
    <form className="inline-form" onSubmit={onSubmit}>
      <input
        autoComplete="off"
        name="path"
        onChange={(event) => setPath(event.target.value)}
        placeholder="/home/user/project"
        value={path}
      />
      <Button className="primary" isDisabled={busy} type="submit">
        Add
      </Button>
    </form>
  );
}
