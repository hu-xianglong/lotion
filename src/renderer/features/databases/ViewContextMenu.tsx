import { useEffect, useRef, useState } from "react";
import type { TableView } from "../../../shared/types";
import { databaseViewLink } from "../../../shared/database-view-link";
import { MenuItem, MenuSection, MenuSurface, type MenuAnchor } from "../../components/Menu";

export type ViewMenuActionStatus = "submitted" | "failed" | "ignored";

export function viewRenameValidation(name: string, currentName: string, existingNames: string[]): string {
  const normalizedName = name.trim().toLocaleLowerCase();
  if (!name.trim()) return "View name cannot be empty.";
  const conflict = existingNames.some((candidate) => (
    candidate !== currentName && candidate.trim().toLocaleLowerCase() === normalizedName
  ));
  return conflict ? "View names must be unique." : "";
}

export function dismissViewMenuIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runViewMenuAction({
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
}): Promise<ViewMenuActionStatus> {
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

export function ViewContextMenu({ anchor, view, existingNames, isDefault, canDelete, structuralDisabledReason, onClose, onRename, onEdit, onDuplicate, onSetDefault, onDelete }: {
  anchor: MenuAnchor;
  view: TableView;
  existingNames: string[];
  isDefault: boolean;
  canDelete: boolean;
  structuralDisabledReason?: string;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onEdit: () => void;
  onDuplicate: () => Promise<void>;
  onSetDefault: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(view.name);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionRef = useRef(false);
  useEffect(() => { if (renaming) inputRef.current?.select(); }, [renaming]);
  const renameValidation = viewRenameValidation(name, view.name, existingNames);
  const pendingReason = pending ? "A view action is in progress." : undefined;

  function closeIfIdle() {
    dismissViewMenuIfIdle(actionRef, onClose);
  }

  function runAction(action: () => Promise<void>) {
    return runViewMenuAction({
      action,
      guard: actionRef,
      onError: setActionError,
      onPendingChange: setPending,
      onSuccess: onClose
    });
  }

  async function commitRename() {
    const next = name.trim();
    if (renameValidation) return;
    if (next === view.name) { setRenaming(false); return; }
    await runAction(() => onRename(next));
  }

  return (
    <MenuSurface anchor={anchor} ariaLabel={`View menu ${view.name}`} title={view.name} focusKey={renaming} onClose={closeIfIdle}>
      {renaming ? (
        <form className="view-inline-rename" onSubmit={(event) => { event.preventDefault(); void commitRename(); }}>
          <label htmlFor="view-inline-name">View name</label>
          <input id="view-inline-name" ref={inputRef} disabled={pending} value={name} aria-invalid={Boolean(renameValidation || actionError)} aria-describedby={renameValidation || actionError ? "view-inline-name-error" : undefined} onChange={(event) => { setName(event.target.value); setActionError(""); }} onKeyDown={(event) => { if (event.key === "Escape" && !actionRef.current) { event.stopPropagation(); setRenaming(false); } }} />
          <button className="primary" type="submit" disabled={pending || Boolean(renameValidation)}>{pending ? "Saving…" : "Save"}</button>
          {(renameValidation || actionError) && <small id="view-inline-name-error" role="alert">{renameValidation || actionError}</small>}
        </form>
      ) : (
        <>
          <MenuSection label="View">
            <MenuItem label="Rename" disabledReason={pendingReason || structuralDisabledReason} onSelect={() => { setActionError(""); setRenaming(true); }} />
            <MenuItem label="Edit view" disabledReason={pendingReason || structuralDisabledReason} onSelect={onEdit} />
            <MenuItem label="Duplicate" disabledReason={pendingReason || structuralDisabledReason} onSelect={() => void runAction(onDuplicate)} />
            <MenuItem label="Set as default" disabledReason={pendingReason || structuralDisabledReason || (isDefault ? "This is already the default view." : undefined)} onSelect={() => void runAction(onSetDefault)} />
            <MenuItem label={copied ? "Link copied" : "Copy link"} disabledReason={pendingReason} onSelect={() => {
              void navigator.clipboard.writeText(databaseViewLink(view.databaseId, view.id))
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }} />
          </MenuSection>
          <MenuSection danger>
            <MenuItem label="Delete view" danger disabledReason={pendingReason || structuralDisabledReason || (!canDelete ? "The last view cannot be deleted." : undefined)} onSelect={() => void runAction(onDelete)} />
          </MenuSection>
          {actionError && <small className="view-menu-action-error" role="alert">{actionError}</small>}
        </>
      )}
    </MenuSurface>
  );
}
