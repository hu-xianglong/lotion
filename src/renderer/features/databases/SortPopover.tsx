import { type KeyboardEvent, type MutableRefObject, type Ref, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FieldSchema, TableView, ViewSort } from "../../../shared/types";
import { defaultSortDirection, sortDirectionLabels } from "../../../shared/database-sort";
import { popoverPositionStyle } from "../../lib/popover-position";

interface SortPopoverProps { fields: FieldSchema[]; view: TableView; anchor: { left: number; top: number }; onClose: () => void; onChange: (next: ViewSort[]) => Promise<void>; }
interface SortPopoverContentProps extends Omit<SortPopoverProps, "onClose"> {
  popoverRef?: Ref<HTMLDivElement>;
  onClose?: () => void;
  dismissRequestRef?: MutableRefObject<(() => void) | null>;
}

export type SortMutationStatus = "submitted" | "failed" | "ignored";

export function dismissSortPopoverIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runSortMutation({
  sorts,
  guard,
  onChange,
  onError,
  onPendingChange
}: {
  sorts: ViewSort[];
  guard: { current: boolean };
  onChange: (sorts: ViewSort[]) => Promise<void>;
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
}): Promise<SortMutationStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await onChange(sorts);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
  return "submitted";
}

export function SortPopover({ fields, view, anchor, onClose, onChange }: SortPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dismissRequestRef = useRef<(() => void) | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const focusFrame = requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled])')?.focus());
    function onDocClick(event: MouseEvent) {
      if (ref.current?.contains(event.target as Node)) return;
      (dismissRequestRef.current ?? onClose)();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => { cancelAnimationFrame(focusFrame); document.removeEventListener("mousedown", onDocClick); };
  }, [onClose]);
  useEffect(() => () => { requestAnimationFrame(() => { const active = document.activeElement; if (returnFocusRef.current?.isConnected && (!active || active === document.body || !active.isConnected)) returnFocusRef.current.focus(); }); }, []);
  return createPortal(<SortPopoverContent fields={fields} view={view} anchor={anchor} onChange={onChange} onClose={onClose} popoverRef={ref} dismissRequestRef={dismissRequestRef} />, document.body);
}

export function SortPopoverContent({ fields, view, anchor, onChange, onClose, popoverRef, dismissRequestRef }: SortPopoverContentProps) {
  const [sorts, setSorts] = useState<ViewSort[]>(dedupeSorts(view.sorts, fields));
  const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);
  const actionRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");

  function requestClose() {
    dismissSortPopoverIfIdle(actionRef, () => onClose?.());
  }

  useEffect(() => {
    if (!dismissRequestRef) return;
    dismissRequestRef.current = requestClose;
    return () => {
      dismissRequestRef.current = null;
    };
  });

  function submit(next: ViewSort[]) {
    return runSortMutation({
      sorts: next,
      guard: actionRef,
      onChange,
      onError: setActionError,
      onPendingChange: setPending
    });
  }

  function commit(next: ViewSort[]) {
    if (actionRef.current) return;
    const safe = dedupeSorts(next, fields);
    setSorts(safe);
    void submit(safe);
  }
  function addSort() { const field = fields.find((candidate) => !sorts.some((sort) => sort.fieldId === candidate.id)); if (field) commit([...sorts, { fieldId: field.id, direction: defaultSortDirection(field) }]); }
  function moveSort(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= sorts.length) return; const next = [...sorts]; const [sort] = next.splice(index, 1); next.splice(target, 0, sort); commit(next); }
  function setFieldAt(index: number, fieldId: string) { if (sorts.some((sort, candidateIndex) => candidateIndex !== index && sort.fieldId === fieldId)) return; const field = fields.find((candidate) => candidate.id === fieldId); if (!field) return; commit(sorts.map((sort, candidateIndex) => candidateIndex === index ? { fieldId, direction: defaultSortDirection(field) } : sort)); }
  function handleRuleKeyboard(event: KeyboardEvent<HTMLDivElement>, index: number) { if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return; event.preventDefault(); moveSort(index, event.key === "ArrowUp" ? -1 : 1); }
  return (
    <div ref={popoverRef} className="popover sort-popover priority-sort-popover" style={popoverPositionStyle(anchor)} role="dialog" aria-label="Sort" aria-busy={pending} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); requestClose(); } }}>
      <fieldset className="sort-popover-controls" disabled={pending}>
      <div className="advanced-filter-header"><div><strong>Sort</strong><span>{sorts.length ? `${sorts.length} rule${sorts.length === 1 ? "" : "s"}` : "No rules"}</span></div>{sorts.length > 0 && <button type="button" onClick={() => commit([])}>Clear all</button>}</div>
      {sorts.length > 0 && <div className="sort-priority-chips" aria-label="Sort priority">{sorts.map((sort, index) => <span className="filter-chip" key={sort.fieldId}>{index + 1}. {fields.find((field) => field.id === sort.fieldId)?.name}</span>)}</div>}
      {sorts.length === 0 ? <div className="popover-empty">No sorts. Add a rule below.</div> : sorts.map((sort, index) => {
        const field = fields.find((candidate) => candidate.id === sort.fieldId) ?? fields[0];
        if (!field) return null;
        const labels = sortDirectionLabels(field);
        const usedElsewhere = new Set(sorts.filter((_, candidateIndex) => candidateIndex !== index).map((candidate) => candidate.fieldId));
        return (
          <div key={sort.fieldId} className="sort-rule" draggable={!pending} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", sort.fieldId); setDragIndex(index); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={(event) => { event.preventDefault(); const transferredFieldId = event.dataTransfer.getData("text/plain"); const sourceIndex = dragIndex ?? sorts.findIndex((candidate) => candidate.fieldId === transferredFieldId); if (sourceIndex < 0 || sourceIndex === index) return; const next = [...sorts]; const [dragged] = next.splice(sourceIndex, 1); next.splice(index, 0, dragged); setDragIndex(undefined); commit(next); }} onDragEnd={() => setDragIndex(undefined)} onKeyDown={(event) => handleRuleKeyboard(event, index)}>
            <span className="sort-priority" aria-label={`Priority ${index + 1}`}>{index + 1}</span>
            <button type="button" className="sort-drag-handle" title="Drag or press Alt+Arrow to reorder" aria-label={`Reorder ${field.name}`}>⠿</button>
            <select aria-label={`Sort property ${index + 1}`} value={sort.fieldId} onChange={(event) => setFieldAt(index, event.target.value)}>{fields.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={usedElsewhere.has(candidate.id)}>{candidate.name}</option>)}</select>
            <select aria-label={`Sort direction ${index + 1}`} value={sort.direction} onChange={(event) => commit(sorts.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, direction: event.target.value as ViewSort["direction"] } : candidate))}><option value="asc">{labels.asc}</option><option value="desc">{labels.desc}</option></select>
            <div className="sort-move-buttons"><button type="button" aria-label={`Move ${field.name} up`} disabled={index === 0} onClick={() => moveSort(index, -1)}>↑</button><button type="button" aria-label={`Move ${field.name} down`} disabled={index === sorts.length - 1} onClick={() => moveSort(index, 1)}>↓</button></div>
            <button type="button" className="popover-remove" onClick={() => commit(sorts.filter((_, candidateIndex) => candidateIndex !== index))} aria-label="Remove sort">×</button>
          </div>
        );
      })}
      <button type="button" className="popover-add" onClick={addSort} disabled={sorts.length >= fields.length}>+ Add sort</button>
      </fieldset>
      {actionError && <div className="view-menu-action-error sort-action-error" role="alert"><span>{actionError}</span><button type="button" disabled={pending} onClick={() => void submit(sorts)}>Retry</button></div>}
    </div>
  );
}

function dedupeSorts(sorts: readonly ViewSort[], fields: readonly FieldSchema[]): ViewSort[] {
  const fieldIds = new Set(fields.map((field) => field.id));
  const seen = new Set<string>();
  return sorts.filter((sort) => fieldIds.has(sort.fieldId) && !seen.has(sort.fieldId) && (seen.add(sort.fieldId), true));
}
