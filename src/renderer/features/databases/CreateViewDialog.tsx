import { useEffect, useRef, useState } from "react";
import type { CreateViewInput, DatabaseViewType, TableView } from "../../../shared/types";

export type CreateViewSubmissionStatus = "submitted" | "failed" | "ignored";

export async function runCreateViewSubmission({
  guard,
  input,
  onCreate,
  onError,
  onSavingChange,
  onSuccess
}: {
  guard: { current: boolean };
  input: CreateViewInput;
  onCreate: (input: CreateViewInput) => Promise<void>;
  onError: (message: string | null) => void;
  onSavingChange: (saving: boolean) => void;
  onSuccess: () => void;
}): Promise<CreateViewSubmissionStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError(null);
  onSavingChange(true);
  try {
    await onCreate(input);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onSavingChange(false);
  }
  onSuccess();
  return "submitted";
}

export function CreateViewDialog({ databaseId, currentView, existingNames, onClose, onCreate }: {
  databaseId: string;
  currentView: TableView;
  existingNames: string[];
  onClose: () => void;
  onCreate: (input: CreateViewInput) => Promise<void>;
}) {
  const [name, setName] = useState(() => nextViewName(existingNames));
  const [type, setType] = useState<DatabaseViewType>("table");
  const [sourceMode, setSourceMode] = useState<"empty" | "duplicate">("empty");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionRef = useRef(false);

  useEffect(() => inputRef.current?.select(), []);

  async function submit() {
    await runCreateViewSubmission({
      guard: submissionRef,
      input: {
        databaseId,
        name: name.trim() || nextViewName(existingNames),
        type,
        sourceMode,
        sourceViewId: sourceMode === "duplicate" ? currentView.id : undefined
      },
      onCreate,
      onError: setError,
      onSavingChange: setSaving,
      onSuccess: onClose
    });
  }

  function closeIfIdle() {
    if (!submissionRef.current) onClose();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={closeIfIdle}>
      <form
        className="view-dialog create-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create view"
        aria-busy={saving}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => { event.preventDefault(); void submit(); }}
        onKeyDown={(event) => { if (event.key === "Escape") closeIfIdle(); }}
      >
        <div className="dialog-header">
          <div><h2>Create a view</h2><p>Choose what the new saved view starts with.</p></div>
          <button type="button" disabled={saving} onClick={closeIfIdle}>Close</button>
        </div>
        <label className="form-row">
          <span>Name</span>
          <input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="form-row">
          <span>Layout</span>
          <select value={type} onChange={(event) => setType(event.target.value as DatabaseViewType)}>
            <option value="table">Table</option>
            <option value="list">List</option>
            <option value="calendar">Calendar</option>
            <option value="gallery">Gallery</option>
            <option value="kanban">Board</option>
          </select>
        </label>
        <fieldset className="create-view-source">
          <legend>Start with</legend>
          <label><input type="radio" name="source" checked={sourceMode === "empty"} onChange={() => setSourceMode("empty")} /> Empty settings</label>
          <small>No filters, sorts, widths, or hidden view configuration.</small>
          <label><input type="radio" name="source" checked={sourceMode === "duplicate"} onChange={() => { setSourceMode("duplicate"); setType(currentView.type); }} /> Duplicate “{currentView.name}”</label>
          <small>Copies the current view configuration into a separate saved view.</small>
        </fieldset>
        {error && <div className="dialog-error" role="alert">{error}</div>}
        <div className="dialog-actions">
          <button type="button" disabled={saving} onClick={closeIfIdle}>Cancel</button>
          <button className="primary" type="submit" disabled={saving}>{saving ? "Creating…" : "Create view"}</button>
        </div>
      </form>
    </div>
  );
}

function nextViewName(existingNames: string[]): string {
  const names = new Set(existingNames);
  let number = existingNames.length + 1;
  while (names.has(`View ${number}`)) number += 1;
  return `View ${number}`;
}
