import { type MutableRefObject, type Ref, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FieldSchema, FilterCondition, FilterGroup, FilterOperator, RecordValue, TableView } from "../../../shared/types";
import { defaultFilterOperator, filterConditionError, filterOperatorsForField, flattenSimpleAndFilters, MAX_FILTER_DEPTH, normalizeFilterExpression } from "../../../shared/filter-expression";
import { popoverPositionStyle } from "../../lib/popover-position";

interface FilterPopoverProps {
  fields: FieldSchema[];
  view: TableView;
  anchor: { left: number; top: number };
  onClose: () => void;
  onChange: (expression: FilterGroup) => Promise<void>;
  initialFieldId?: string;
}

interface FilterPopoverContentProps extends Omit<FilterPopoverProps, "onClose"> {
  popoverRef?: Ref<HTMLDivElement>;
  onClose?: () => void;
  dismissRequestRef?: MutableRefObject<(() => void) | null>;
}

export type FilterMutationStatus = "submitted" | "failed" | "ignored";

export function dismissFilterPopoverIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runFilterMutation({
  expression,
  guard,
  onChange,
  onError,
  onPendingChange,
  onSuccess
}: {
  expression: FilterGroup;
  guard: { current: boolean };
  onChange: (expression: FilterGroup) => Promise<void>;
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess?: () => void;
}): Promise<FilterMutationStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await onChange(expression);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
  onSuccess?.();
  return "submitted";
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is", is_not: "is not", contains: "contains", not_contains: "does not contain",
  gt: "is greater/after", lt: "is less/before", checked: "is checked", unchecked: "is unchecked",
  is_empty: "is empty", is_not_empty: "is not empty", within_past: "is within past", within_next: "is within next"
};

export function FilterPopover({ fields, view, anchor, onClose, onChange, initialFieldId }: FilterPopoverProps) {
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
  return createPortal(<FilterPopoverContent fields={fields} view={view} anchor={anchor} onChange={onChange} onClose={onClose} initialFieldId={initialFieldId} popoverRef={ref} dismissRequestRef={dismissRequestRef} />, document.body);
}

export function FilterPopoverContent({ fields, view, anchor, onChange, onClose, initialFieldId, popoverRef, dismissRequestRef }: FilterPopoverContentProps) {
  const [expression, setExpression] = useState(() => {
    const base = normalizeFilterExpression(view.filterExpression, view.filters, fields);
    const field = fields.find((candidate) => candidate.id === initialFieldId);
    if (!field || collectConditions(base).some((condition) => condition.fieldId === field.id)) return base;
    return { ...base, children: [...base.children, { version: 1 as const, kind: "condition" as const, id: createFilterId("condition"), fieldId: field.id, operator: defaultFilterOperator(field), value: field.type === "checkbox" ? true : "" }] };
  });
  const timerRef = useRef<number | undefined>(undefined);
  const pendingRef = useRef<FilterGroup | undefined>(undefined);
  const actionRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
  }, []);

  function submit(next: FilterGroup, closeOnSuccess = false) {
    return runFilterMutation({
      expression: next,
      guard: actionRef,
      onChange,
      onError: setActionError,
      onPendingChange: setPending,
      onSuccess: closeOnSuccess ? onClose : undefined
    });
  }

  function requestClose() {
    if (actionRef.current) return;
    const queued = pendingRef.current;
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    pendingRef.current = undefined;
    if (queued && expressionIsValid(queued, fields)) {
      void submit(queued, true);
      return;
    }
    onClose?.();
  }

  useEffect(() => {
    if (!dismissRequestRef) return;
    dismissRequestRef.current = requestClose;
    return () => {
      dismissRequestRef.current = null;
    };
  });

  function commit(next: FilterGroup, debounce = false) {
    if (actionRef.current) return;
    setExpression(next);
    setActionError("");
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    pendingRef.current = undefined;
    if (!expressionIsValid(next, fields)) return;
    if (!debounce) {
      void submit(next);
      return;
    }
    pendingRef.current = next;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      pendingRef.current = undefined;
      void submit(next);
    }, 250);
  }

  const conditionCount = countConditions(expression);
  return (
    <div ref={popoverRef} className="popover filter-popover advanced-filter-popover" style={popoverPositionStyle(anchor)} role="dialog" aria-label="Filter" aria-busy={pending} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); requestClose(); } }}>
      <fieldset className="filter-popover-controls" disabled={pending}>
        <div className="advanced-filter-header">
          <div><strong>Filter</strong><span>{conditionCount ? `${conditionCount} condition${conditionCount === 1 ? "" : "s"}` : "No conditions"}</span></div>
          {conditionCount > 0 && <button type="button" onClick={() => commit({ ...expression, children: [] })}>Clear all</button>}
        </div>
        {conditionCount === 0 ? <div className="popover-empty">Add a condition or an advanced group.</div> : (
          <div className="filter-chip-list" aria-label="Active filters">
            {collectConditions(expression).map((condition) => <span className="filter-chip" key={condition.id}>{conditionSummary(condition, fields)}</span>)}
          </div>
        )}
        <FilterGroupEditor group={expression} depth={1} fields={fields} onChange={(next, debounce) => commit(next, debounce)} />
      </fieldset>
      {actionError && <div className="view-menu-action-error filter-action-error" role="alert"><span>{actionError}</span><button type="button" disabled={pending || !expressionIsValid(expression, fields)} onClick={() => void submit(expression)}>Retry</button></div>}
    </div>
  );
}

function FilterGroupEditor({ group, depth, fields, onChange }: { group: FilterGroup; depth: number; fields: FieldSchema[]; onChange: (next: FilterGroup, debounce?: boolean) => void }) {
  function patchNode(id: string, replacement?: FilterGroup | FilterCondition, debounce = false) {
    onChange(updateNode(group, id, replacement), debounce);
  }
  function addCondition() {
    const field = fields[0];
    if (!field) return;
    const condition: FilterCondition = { version: 1, kind: "condition", id: createFilterId("condition"), fieldId: field.id, operator: defaultFilterOperator(field), value: field.type === "checkbox" ? true : "" };
    onChange({ ...group, children: [...group.children, condition] });
  }
  function addGroup() {
    const child: FilterGroup = { version: 1, kind: "group", id: createFilterId("group"), conjunction: "and", children: [] };
    onChange({ ...group, children: [...group.children, child] });
  }
  return (
    <section className={`filter-group depth-${depth}`} aria-label={depth === 1 ? "Root filter group" : `Filter group level ${depth}`}>
      <div className="filter-group-toolbar">
        <span>Match</span>
        <select aria-label={`Group ${group.id} conjunction`} value={group.conjunction} onChange={(event) => onChange({ ...group, conjunction: event.target.value as "and" | "or" })}>
          <option value="and">all (AND)</option><option value="or">any (OR)</option>
        </select>
        <span>of the following</span>
      </div>
      {group.children.map((child) => child.kind === "condition" ? (
        <FilterConditionEditor key={child.id} condition={child} fields={fields} onChange={(next, debounce) => patchNode(child.id, next, debounce)} onRemove={() => patchNode(child.id)} />
      ) : (
        <div className="nested-filter-group" key={child.id}>
          <FilterGroupEditor group={child} depth={depth + 1} fields={fields} onChange={(next, debounce) => patchNode(child.id, next, debounce)} />
          <button type="button" className="popover-remove group-remove" aria-label="Remove group" onClick={() => patchNode(child.id)}>×</button>
        </div>
      ))}
      <div className="filter-group-actions">
        <button type="button" className="popover-add" onClick={addCondition}>+ Add condition</button>
        <button type="button" className="popover-add" onClick={addGroup} disabled={depth >= MAX_FILTER_DEPTH}>+ Add group</button>
      </div>
    </section>
  );
}

function FilterConditionEditor({ condition, fields, onChange, onRemove }: { condition: FilterCondition; fields: FieldSchema[]; onChange: (next: FilterCondition, debounce?: boolean) => void; onRemove: () => void }) {
  const field = fields.find((candidate) => candidate.id === condition.fieldId) ?? fields[0];
  if (!field) return null;
  const error = filterConditionError(condition, field);
  const valueless = ["checked", "unchecked", "is_empty", "is_not_empty"].includes(condition.operator);
  function changeField(fieldId: string) {
    const next = fields.find((candidate) => candidate.id === fieldId);
    if (!next) return;
    const operator = defaultFilterOperator(next);
    onChange({ ...condition, fieldId, operator, value: next.type === "checkbox" ? true : "" });
  }
  return (
    <div className={error ? "filter-condition invalid" : "filter-condition"}>
      <div className="filter-row">
        <select aria-label="Filter property" value={condition.fieldId} onChange={(event) => changeField(event.target.value)}>{fields.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select>
        <select aria-label="Filter operator" value={condition.operator} onChange={(event) => onChange({ ...condition, operator: event.target.value as FilterOperator, value: "" })}>{filterOperatorsForField(field).map((operator) => <option value={operator} key={operator}>{OPERATOR_LABELS[operator]}</option>)}</select>
        {!valueless && <FilterValueEditor field={field} condition={condition} onChange={(value) => onChange({ ...condition, value }, true)} />}
        <button type="button" className="popover-remove" onClick={onRemove} aria-label="Remove filter" title="Remove filter">×</button>
      </div>
      {error && <div className="filter-validation" role="alert">{error}</div>}
    </div>
  );
}

function FilterValueEditor({ field, condition, onChange }: { field: FieldSchema; condition: FilterCondition; onChange: (value: RecordValue) => void }) {
  if ((field.type === "select" || field.type === "multi_select") && field.options?.length) return <select aria-label="Filter value" value={String(condition.value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{field.options.map((option) => <option key={option.id} value={option.name}>{option.name}</option>)}</select>;
  if (condition.operator === "within_past" || condition.operator === "within_next") return <select aria-label="Relative date range" value={String(condition.value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option><option value="7_days">7 days</option><option value="30_days">30 days</option><option value="90_days">90 days</option></select>;
  const type = field.type === "number" ? "number" : field.type === "date" || field.type === "created_time" || field.type === "updated_time" ? "date" : "search";
  return <input aria-label={field.type === "entity_ref" ? "Related entity" : "Filter value"} type={type} value={String(condition.value ?? "")} onChange={(event) => onChange(field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} placeholder={field.type === "entity_ref" ? "Entity ID or title" : "Value"} />;
}

function updateNode(group: FilterGroup, id: string, replacement?: FilterGroup | FilterCondition): FilterGroup {
  return { ...group, children: group.children.flatMap((child) => child.id === id ? replacement ? [replacement] : [] : child.kind === "group" ? [updateNode(child, id, replacement)] : [child]) };
}
function collectConditions(group: FilterGroup): FilterCondition[] { return group.children.flatMap((child) => child.kind === "condition" ? [child] : collectConditions(child)); }
function countConditions(group: FilterGroup): number { return collectConditions(group).length; }
function expressionIsValid(group: FilterGroup, fields: FieldSchema[]): boolean { return collectConditions(group).every((condition) => { const field = fields.find((candidate) => candidate.id === condition.fieldId); return Boolean(field && !filterConditionError(condition, field)); }); }
function conditionSummary(condition: FilterCondition, fields: FieldSchema[]): string { const field = fields.find((candidate) => candidate.id === condition.fieldId); return `${field?.name ?? condition.fieldId} ${OPERATOR_LABELS[condition.operator]}${["checked", "unchecked", "is_empty", "is_not_empty"].includes(condition.operator) ? "" : ` ${String(condition.value ?? "")}`}`; }
function createFilterId(kind: "group" | "condition"): string { return `filter-${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }

export { flattenSimpleAndFilters };
