import { type Ref, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FieldSchema, TableView, ViewSort } from "../../../shared/types";
import { popoverPositionStyle } from "../../lib/popover-position";

interface SortPopoverProps {
  fields: FieldSchema[];
  view: TableView;
  anchor: { left: number; top: number };
  onClose: () => void;
  onChange: (next: ViewSort[]) => void;
}

interface SortPopoverContentProps {
  fields: FieldSchema[];
  view: TableView;
  anchor: { left: number; top: number };
  onChange: (next: ViewSort[]) => void;
  popoverRef?: Ref<HTMLDivElement>;
}

/**
 * Mini-dialog anchored to the sort toolbar icon. Lets the user
 * add / reorder-conceptually / remove sorts and pick direction
 * without diving into the full ViewSettingsDialog. Persists each
 * mutation immediately through `onChange`.
 */
export function SortPopover({ fields, view, anchor, onClose, onChange }: SortPopoverProps) {
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
    <SortPopoverContent
      fields={fields}
      view={view}
      anchor={anchor}
      onChange={onChange}
      popoverRef={ref}
    />,
    document.body
  );
}

/**
 * Renderable popover body split from the portal shell so component tests can
 * cover the user-visible controls without needing a browser document.
 */
export function SortPopoverContent({ fields, view, anchor, onChange, popoverRef }: SortPopoverContentProps) {
  const [sorts, setSorts] = useState<ViewSort[]>(view.sorts);

  function commit(next: ViewSort[]) {
    setSorts(next);
    onChange(next);
  }

  function addSort() {
    const used = new Set(sorts.map((s) => s.fieldId));
    const next = fields.find((f) => !used.has(f.id));
    if (!next) return;
    commit([...sorts, { fieldId: next.id, direction: "asc" }]);
  }

  function removeSort(idx: number) {
    commit(sorts.filter((_, i) => i !== idx));
  }

  function setFieldAt(idx: number, fieldId: string) {
    commit(sorts.map((s, i) => (i === idx ? { ...s, fieldId } : s)));
  }

  function setDirectionAt(idx: number, direction: ViewSort["direction"]) {
    commit(sorts.map((s, i) => (i === idx ? { ...s, direction } : s)));
  }

  return (
    <div
      ref={popoverRef}
      className="popover sort-popover"
      style={popoverPositionStyle(anchor)}
      role="dialog"
      aria-label="Sort"
    >
      <div className="popover-header">Sort</div>
      {sorts.length === 0 ? (
        <div className="popover-empty">No sorts. Click "Add sort" below.</div>
      ) : (
        sorts.map((s, i) => (
          <div key={`${s.fieldId}-${i}`} className="sort-row">
            <select value={s.fieldId} onChange={(e) => setFieldAt(i, e.target.value)}>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <select
              value={s.direction}
              onChange={(e) => setDirectionAt(i, e.target.value as ViewSort["direction"])}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button
              type="button"
              className="popover-remove"
              onClick={() => removeSort(i)}
              aria-label="Remove sort"
              title="Remove sort"
            >×</button>
          </div>
        ))
      )}
      <button
        type="button"
        className="popover-add"
        onClick={addSort}
        disabled={sorts.length >= fields.length}
      >
        + Add sort
      </button>
    </div>
  );
}
