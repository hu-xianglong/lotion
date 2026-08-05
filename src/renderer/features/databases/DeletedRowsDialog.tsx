import { useRef, useState } from "react";
import type { DeletedRowTombstone } from "../../../shared/types";
import { formatDateForField } from "../../../shared/date-values";
import { useDateTimeDisplayDefaults } from "../../lib/settings";

export type DeletedRowsAction = "restore" | "delete";
export type DeletedRowsActionStatus = "submitted" | "failed" | "ignored";

export function dismissDeletedRowsIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runDeletedRowsAction({
  action,
  guard,
  onError,
  onPendingChange
}: {
  action: () => Promise<void>;
  guard: { current: boolean };
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
}): Promise<DeletedRowsActionStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await action();
    return "submitted";
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
}

export function DeletedRowsDialog({ rows, onClose, onRestore, onPermanentlyDelete }: { rows: DeletedRowTombstone[]; onClose: () => void; onRestore: (rowId: string) => Promise<void>; onPermanentlyDelete: (rowId: string) => Promise<void> }) {
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  const [pending, setPending] = useState<{ rowId: string; action: DeletedRowsAction } | null>(null);
  const [error, setError] = useState("");
  const actionRef = useRef(false);

  function closeIfIdle() {
    dismissDeletedRowsIfIdle(actionRef, onClose);
  }

  function run(rowId: string, action: DeletedRowsAction) {
    return runDeletedRowsAction({
      guard: actionRef,
      action: () => action === "restore" ? onRestore(rowId) : onPermanentlyDelete(rowId),
      onError: setError,
      onPendingChange: (isPending) => setPending(isPending ? { rowId, action } : null)
    });
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={closeIfIdle}><div className="field-dialog deleted-rows-dialog" role="dialog" aria-modal="true" aria-label="Recently deleted rows" aria-busy={Boolean(pending)} onMouseDown={(event) => event.stopPropagation()}>
    <div className="dialog-header"><div><h2>Recently deleted rows</h2><p>Restore rows with their properties and page body, or delete them permanently.</p></div><button disabled={Boolean(pending)} onClick={closeIfIdle}>Close</button></div>
    {error && <div className="dialog-error" role="alert">{error}</div>}
    <div className="property-manager-list">{rows.length === 0 ? <div className="popover-empty">No deleted rows.</div> : rows.map((item) => { const rowId = String(item.record.id); const rowAction = pending?.rowId === rowId ? pending.action : undefined; return <div className="deleted-property-row" data-row-id={rowId} key={rowId} aria-busy={Boolean(rowAction)}><span className="property-manager-name">{String(item.record.title ?? "Untitled")}<small>Deleted {formatDateForField(item.deletedAt, { type: "updated_time" }, dateTimeDefaults)}</small></span><button disabled={Boolean(pending)} onClick={() => void run(rowId, "restore")}>{rowAction === "restore" ? "Restoring…" : "Restore"}</button><button disabled={Boolean(pending)} className="property-delete" onClick={() => { if (actionRef.current) return; if (window.confirm("Permanently delete this row and its page body?")) void run(rowId, "delete"); }}>{rowAction === "delete" ? "Deleting…" : "Permanently delete"}</button></div>; })}</div>
  </div></div>;
}
