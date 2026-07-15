import { type Ref, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FieldSchema, RecordValue, TableView, ViewFilter } from "../../../shared/types";
import { popoverPositionStyle } from "../../lib/popover-position";

interface FilterPopoverProps {
  fields: FieldSchema[];
  view: TableView;
  anchor: { left: number; top: number };
  onClose: () => void;
  onChange: (next: ViewFilter[]) => void;
}

type OperatorOption = { value: ViewFilter["operator"]; label: string };

interface FilterPopoverContentProps {
  fields: FieldSchema[];
  view: TableView;
  anchor: { left: number; top: number };
  onChange: (next: ViewFilter[]) => void;
  popoverRef?: Ref<HTMLDivElement>;
}

// Operators we surface per field type. Mirrors the operators the
// view-query layer already knows how to evaluate.
const OPERATORS_BY_TYPE: Partial<Record<FieldSchema["type"], OperatorOption[]>> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  number: [
    { value: "is", label: "=" },
    { value: "is_not", label: "≠" },
    { value: "gt", label: ">" },
    { value: "lt", label: "<" }
  ],
  select: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ],
  multi_select: [
    { value: "contains", label: "contains" }
  ],
  checkbox: [
    { value: "checked", label: "checked" }
  ],
  date: [
    { value: "is", label: "on" },
    { value: "gt", label: "after" },
    { value: "lt", label: "before" }
  ],
  url: [
    { value: "contains", label: "contains" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" }
  ]
};

function operatorsFor(type: FieldSchema["type"]): OperatorOption[] {
  return OPERATORS_BY_TYPE[type] ?? OPERATORS_BY_TYPE.text!;
}

export function FilterPopover({ fields, view, anchor, onClose, onChange }: FilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (ref.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [onClose]);

  return createPortal(
    <FilterPopoverContent
      fields={fields}
      view={view}
      anchor={anchor}
      onChange={onChange}
      popoverRef={ref}
    />,
    document.body
  );
}

export function FilterPopoverContent({ fields, view, anchor, onChange, popoverRef }: FilterPopoverContentProps) {
  const [filters, setFilters] = useState<ViewFilter[]>(view.filters);

  function commit(next: ViewFilter[]) {
    setFilters(next);
    onChange(next);
  }

  function addFilter() {
    const next = fields[0];
    if (!next) return;
    const ops = operatorsFor(next.type);
    commit([
      ...filters,
      { fieldId: next.id, operator: ops[0].value, value: "" as RecordValue }
    ]);
  }

  function removeFilter(idx: number) {
    commit(filters.filter((_, i) => i !== idx));
  }

  function patchFilter(idx: number, patch: Partial<ViewFilter>) {
    commit(filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  return (
    <div
      ref={popoverRef}
      className="popover filter-popover"
      style={popoverPositionStyle(anchor)}
      role="dialog"
      aria-label="Filter"
    >
      <div className="popover-header">Filter</div>
      {filters.length === 0 ? (
        <div className="popover-empty">No filters yet. Click "Add filter" below.</div>
      ) : (
        filters.map((f, i) => {
          const field = fields.find((x) => x.id === f.fieldId) ?? fields[0];
          const ops = operatorsFor(field.type);
          return (
            <div key={i} className="filter-row">
              <select
                value={f.fieldId}
                onChange={(e) => {
                  const next = fields.find((x) => x.id === e.target.value);
                  if (!next) return;
                  const nextOps = operatorsFor(next.type);
                  patchFilter(i, {
                    fieldId: next.id,
                    operator: nextOps[0].value,
                    value: next.type === "checkbox" ? true : ""
                  });
                }}
              >
                {fields.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
              <select
                value={f.operator}
                onChange={(e) =>
                  patchFilter(i, { operator: e.target.value as ViewFilter["operator"] })
                }
              >
                {ops.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              {field.type === "checkbox" ? (
                <span className="filter-value-static">true</span>
              ) : (
                <input
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={String(f.value ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value: RecordValue =
                      field.type === "number" && raw !== "" ? Number(raw) : raw;
                    patchFilter(i, { value });
                  }}
                  placeholder="value"
                />
              )}
              <button
                type="button"
                className="popover-remove"
                onClick={() => removeFilter(i)}
                aria-label="Remove filter"
                title="Remove filter"
              >×</button>
            </div>
          );
        })
      )}
      <button type="button" className="popover-add" onClick={addFilter}>
        + Add filter
      </button>
    </div>
  );
}
