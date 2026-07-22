import type { DatabaseRecord, FieldSchema } from "../../../shared/types";
import { formatDateForField, isDateLikeFieldType } from "../../../shared/date-values";
import { FieldTypeIcon } from "../../components/FieldTypeIcon";
import { EntityIcon } from "../../components/EntityIcon";
import { resolveRowIcon } from "../../../shared/row-icons";

interface ListBodyProps {
  records: DatabaseRecord[];
  fields: FieldSchema[];
  databaseIcon?: string;
  onOpenRow: (rowId: string) => void;
}

export function ListBody({ records, fields, databaseIcon, onOpenRow }: ListBodyProps) {
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
        >
          <span className="list-view-row-main">
            <EntityIcon kind="row_page" icon={resolveRowIcon(record, databaseIcon)} />
            <span className="list-view-title">{String(record.title ?? "").trim() || "Untitled"}</span>
          </span>
          {propertyFields.length > 0 && (
            <span className="list-view-properties">
              {propertyFields.map((field) => {
                const value = formatListValue(record[field.id], field);
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
        </button>
      ))}
    </div>
  );
}

function formatListValue(value: unknown, field: FieldSchema): string {
  if (value === undefined || value === null || value === "") return "";
  if (isDateLikeFieldType(field.type)) return formatDateForField(value, field);
  if (typeof value === "boolean") return value ? "Checked" : "Unchecked";
  return String(value);
}
