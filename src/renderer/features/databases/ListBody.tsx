import type { DatabaseRecord, FieldSchema } from "../../../shared/types";
import { formatDateForField, isDateLikeFieldType, type DateTimeDisplayDefaults } from "../../../shared/date-values";
import { FieldTypeIcon } from "../../components/FieldTypeIcon";
import { EntityIcon } from "../../components/EntityIcon";
import { useDateTimeDisplayDefaults } from "../../lib/settings";

interface ListBodyProps {
  records: DatabaseRecord[];
  fields: FieldSchema[];
  onOpenRow: (rowId: string) => void;
  onOpenRowMenu?: (record: DatabaseRecord, anchor: { left: number; top: number }) => void;
}

export function ListBody({ records, fields, onOpenRow, onOpenRowMenu }: ListBodyProps) {
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  const propertyFields = fields
    .filter((field) => !field.hidden && field.id !== "id" && field.id !== "title")
    .slice(0, 4);

  return (
    <div className="list-view-body">
      {records.length === 0 ? (
        <div className="list-view-empty">No rows</div>
      ) : records.map((record) => (
        <button
          key={String(record.id)}
          type="button"
          className="list-view-row"
          onClick={() => onOpenRow(String(record.id))}
          onContextMenu={(event) => { event.preventDefault(); onOpenRowMenu?.(record, { left: event.clientX, top: event.clientY }); }}
        >
          <span className="list-view-row-main">
            <EntityIcon kind="row_page" icon={String(record.row_icon ?? "") || undefined} />
            <span className="list-view-title">{String(record.title ?? "").trim() || "Untitled"}</span>
          </span>
          {propertyFields.length > 0 && (
            <span className="list-view-properties">
              {propertyFields.map((field) => {
                const value = formatListValue(record[field.id], field, dateTimeDefaults);
                if (!value) return null;
                return (
                  <span key={field.id} className="list-view-property">
                    <FieldTypeIcon type={field.type} />
                    <span className="list-view-property-name">{field.name}</span>
                    <span className="list-view-property-value">{value}</span>
                  </span>
                );
              })}
            </span>
          )}
          <span className="row-context-handle" role="button" tabIndex={0} aria-label={`Row actions ${String(record.title ?? "Untitled")}`} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onOpenRowMenu?.(record, { left: rect.left, top: rect.bottom + 4 }); }} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onOpenRowMenu?.(record, { left: rect.left, top: rect.bottom + 4 }); }}>•••</span>
        </button>
      ))}
    </div>
  );
}

function formatListValue(value: unknown, field: FieldSchema, defaults: DateTimeDisplayDefaults): string {
  if (value === undefined || value === null || value === "") return "";
  if (isDateLikeFieldType(field.type)) return formatDateForField(value, field, defaults);
  if (typeof value === "boolean") return value ? "Checked" : "Unchecked";
  return String(value);
}
