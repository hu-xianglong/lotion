import { useRef, useState } from "react";
import type { CopyFieldToSystemTimeResult, FieldSchema, SystemTimeFieldId } from "../../../shared/types";
import { isDateLikeFieldType } from "../../../shared/date-values";
import { MenuItem, MenuSection, MenuSurface, type MenuAnchor } from "../../components/Menu";

export type ColumnMenuActionStatus = "submitted" | "failed" | "ignored";

export function dismissColumnMenuIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runColumnMenuAction({
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
}): Promise<ColumnMenuActionStatus> {
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

export function ColumnHeaderMenu({ anchor, field, wrapped, frozen, canHide, onClose, onEdit, onSort, onFilter, onCalculate, onWrap, onHide, onDuplicate, onInsert, onFreeze, onCopyToSystemTime, onDelete }: {
  anchor: MenuAnchor; field: FieldSchema; wrapped: boolean; frozen: boolean; canHide: boolean; onClose: () => void;
  onEdit: () => void; onSort: (direction: "asc" | "desc") => Promise<void>; onFilter: () => void; onCalculate: () => Promise<void>;
  onWrap: () => Promise<void>; onHide: () => Promise<void>; onDuplicate: () => Promise<void>; onInsert: (side: "left" | "right") => Promise<void>; onFreeze: () => Promise<void>; onDelete: () => Promise<void>;
  onCopyToSystemTime?: (targetFieldId: SystemTimeFieldId) => Promise<CopyFieldToSystemTimeResult>;
}) {
  const [actionError, setActionError] = useState("");
  const [copyResult, setCopyResult] = useState("");
  const [pending, setPending] = useState(false);
  const actionRef = useRef(false);
  const protectedField = Boolean(field.system) || field.id === "title";
  const pendingReason = pending ? "A column action is being saved." : undefined;

  function closeIfIdle() {
    dismissColumnMenuIfIdle(actionRef, onClose);
  }

  function runAction(action: () => Promise<void>) {
    return runColumnMenuAction({
      action,
      guard: actionRef,
      onError: setActionError,
      onPendingChange: setPending,
      onSuccess: onClose
    });
  }

  async function copyToSystemTime(targetFieldId: SystemTimeFieldId) {
    if (!onCopyToSystemTime || actionRef.current) return;
    actionRef.current = true;
    setActionError("");
    setCopyResult("");
    setPending(true);
    try {
      const result = await onCopyToSystemTime(targetFieldId);
      setCopyResult(`Copied ${result.copiedRows} rows; ${result.unchangedRows} unchanged; skipped ${result.skippedEmptyRows} empty and ${result.skippedInvalidRows} invalid values.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      actionRef.current = false;
      setPending(false);
    }
  }

  return (
    <MenuSurface anchor={anchor} ariaLabel={`Column menu ${field.name}`} title={`${field.name} · ${field.type.replaceAll("_", " ")}`} onClose={closeIfIdle}>
      <MenuSection label="Property">
        <MenuItem label="Rename" disabledReason={pendingReason || (field.system ? "System properties cannot be renamed." : undefined)} onSelect={onEdit} />
        <MenuItem label="Edit property" disabledReason={pendingReason} onSelect={onEdit} />
        <MenuItem label="Sort ascending" disabledReason={pendingReason} onSelect={() => void runAction(() => onSort("asc"))} />
        <MenuItem label="Sort descending" disabledReason={pendingReason} onSelect={() => void runAction(() => onSort("desc"))} />
        <MenuItem label="Filter by property" disabledReason={pendingReason} onSelect={onFilter} />
        <MenuItem label="Calculate" disabledReason={pendingReason} onSelect={() => void runAction(onCalculate)} />
        <MenuItem label={wrapped ? "Disable wrap" : "Wrap cells"} disabledReason={pendingReason} onSelect={() => void runAction(onWrap)} />
        <MenuItem label="Hide in this view" disabledReason={pendingReason || (!canHide ? "At least one property must remain visible." : undefined)} onSelect={() => void runAction(onHide)} />
      </MenuSection>
      <MenuSection label="Column">
        <MenuItem label="Duplicate property" disabledReason={pendingReason || (field.system ? "System properties cannot be duplicated." : undefined)} onSelect={() => void runAction(onDuplicate)} />
        <MenuItem label="Insert left" disabledReason={pendingReason} onSelect={() => void runAction(() => onInsert("left"))} />
        <MenuItem label="Insert right" disabledReason={pendingReason} onSelect={() => void runAction(() => onInsert("right"))} />
        <MenuItem label={frozen ? "Unfreeze columns" : "Freeze up to this column"} disabledReason={pendingReason} onSelect={() => void runAction(onFreeze)} />
      </MenuSection>
      {onCopyToSystemTime && isDateLikeFieldType(field.type) && (
        <MenuSection label="System timestamps">
          {field.id !== "created_time" && <MenuItem label="Copy to Created time" disabledReason={pendingReason} onSelect={() => void copyToSystemTime("created_time")} />}
          {field.id !== "updated_time" && <MenuItem label="Copy to Last updated time" disabledReason={pendingReason} onSelect={() => void copyToSystemTime("updated_time")} />}
        </MenuSection>
      )}
      <MenuSection danger>
        <MenuItem label="Delete property" danger disabledReason={pendingReason || (protectedField ? "System and title properties cannot be deleted." : undefined)} onSelect={() => void runAction(onDelete)} />
      </MenuSection>
      {actionError && <small className="view-menu-action-error" role="alert">{actionError}</small>}
      {copyResult && <output className="field-context-menu-result" role="status">{copyResult}</output>}
    </MenuSurface>
  );
}
