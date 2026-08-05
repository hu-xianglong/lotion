import { useRef, useState } from "react";
import type { DatabaseRecord } from "../../../shared/types";
import { MenuItem, MenuSection, MenuSurface, type MenuAnchor } from "../../components/Menu";

export type RowMenuActionStatus = "submitted" | "failed" | "ignored";

export function dismissRowMenuIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runRowMenuAction({
  action,
  guard,
  onError,
  onPendingChange,
  onSuccess
}: {
  action: () => Promise<void>;
  guard: { current: boolean };
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
}): Promise<RowMenuActionStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await action();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
  onSuccess();
  return "submitted";
}

export function RowContextMenu({ anchor, record, onClose, onOpen, onOpenNew, onRename, onDuplicate, onCopyLink, onEdit, onDelete }: { anchor: MenuAnchor; record: DatabaseRecord; onClose: () => void; onOpen: () => void; onOpenNew: () => void; onRename: () => Promise<void>; onDuplicate: () => Promise<void>; onCopyLink: () => void; onEdit: () => void; onDelete: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const actionRef = useRef(false);
  const title = String(record.title ?? "").trim() || "Untitled";
  const pendingReason = pending ? "A row action is being saved." : undefined;
  function closeIfIdle() {
    dismissRowMenuIfIdle(actionRef, onClose);
  }
  function runAction(action: () => Promise<void>) {
    return runRowMenuAction({
      action,
      guard: actionRef,
      onError: setActionError,
      onPendingChange: setPending,
      onSuccess: onClose
    });
  }
  return <MenuSurface anchor={anchor} ariaLabel={`Row menu ${title}`} title={title} onClose={closeIfIdle}>
    <MenuSection label="Row page"><MenuItem label="Open" disabledReason={pendingReason} onSelect={onOpen} /><MenuItem label="Open in new window" disabledReason={pendingReason} onSelect={onOpenNew} /><MenuItem label="Rename" disabledReason={pendingReason} onSelect={() => void runAction(onRename)} /><MenuItem label="Edit properties" disabledReason={pendingReason} onSelect={onEdit} /></MenuSection>
    <MenuSection label="Actions"><MenuItem label="Duplicate" disabledReason={pendingReason} onSelect={() => void runAction(onDuplicate)} /><MenuItem label="Copy link" disabledReason={pendingReason} onSelect={onCopyLink} /></MenuSection>
    <MenuSection danger><MenuItem label="Delete" danger description="Moves this row to recently deleted" disabledReason={pendingReason} onSelect={() => void runAction(onDelete)} /></MenuSection>
    {actionError && <small className="view-menu-action-error" role="alert">{actionError}</small>}
  </MenuSurface>;
}
