import type { DatabaseRecord, FieldSchema, TableView } from "../../../shared/types";
import { formatDateForField, isDateLikeFieldType, type DateTimeDisplayDefaults } from "../../../shared/date-values";
import { EntityIcon, iconUrl } from "../../components/EntityIcon";
import { useDateTimeDisplayDefaults } from "../../lib/settings";

interface GalleryBodyProps {
  records: DatabaseRecord[];
  fields: FieldSchema[];
  view: TableView;
  onOpenRow: (rowId: string) => void;
  onOpenRowMenu?: (record: DatabaseRecord, anchor: { left: number; top: number }) => void;
}

/**
 * Gallery view: each row becomes a card with its cover image (or a
 * neutral cream-tone fallback when none is set) above the title and
 * the first couple of visible fields. Layout is a responsive grid —
 * `auto-fill, minmax(220px, 1fr)` so columns flex with the viewport.
 *
 * The cover source preference is: `view.coverFieldId` (if set and the
 * cell has a value) → the row's hidden system `cover` cell. That way
 * a user can either use the row-detail cover or point the gallery at
 * a custom field (e.g. an image-URL column).
 */
export function GalleryBody({ records, fields, view, onOpenRow, onOpenRowMenu }: GalleryBodyProps) {
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  // `fields` is the view's visible-field list. A cover field can be hidden
  // from the card captions while still driving the image, matching Notion's
  // gallery cover behavior.
  const coverField = view.coverFieldId;
  // Title + first 2 visible non-title fields appear on each card.
  const captionFields = fields.filter((f) => f.id !== "title").slice(0, 2);

  if (records.length === 0) {
    return (
      <div className="gallery-body gallery-body-empty">
        <div className="gallery-view-empty">No rows</div>
      </div>
    );
  }

  return (
    <div className="gallery-body">
      {records.map((record) => {
        const coverPath = (coverField && String(record[coverField] ?? ""))
          || String(record.cover ?? "");
        const offset = Number(record.cover_offset ?? 50);
        return (
          <button
            key={String(record.id)}
            type="button"
            className="gallery-card"
            onClick={() => onOpenRow(String(record.id))}
            onContextMenu={(event) => { event.preventDefault(); onOpenRowMenu?.(record, { left: event.clientX, top: event.clientY }); }}
          >
            <div className="gallery-card-cover">
              {coverPath ? (
                <img
                  src={iconUrl(coverPath)}
                  alt=""
                  style={{ objectPosition: `50% ${Number.isFinite(offset) ? offset : 50}%` }}
                />
              ) : (
                <div className="gallery-card-cover-placeholder" />
              )}
            </div>
            <div className="gallery-card-meta">
              <span className="row-context-handle" role="button" tabIndex={0} aria-label={`Row actions ${String(record.title ?? "Untitled")}`} onClick={(event) => { event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onOpenRowMenu?.(record, { left: rect.left, top: rect.bottom + 4 }); }} onKeyDown={(event) => { if (event.key !== "Enter" && event.key !== " ") return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); onOpenRowMenu?.(record, { left: rect.left, top: rect.bottom + 4 }); }}>•••</span>
              <div className="gallery-card-title">
                <EntityIcon kind="row_page" icon={String(record.row_icon ?? "") || undefined} size={16} />
                <span>{String(record.title ?? "") || "Untitled"}</span>
              </div>
              {captionFields.map((field) => {
                const v = record[field.id];
                if (v === undefined || v === null || v === "") return null;
                return (
                  <div key={field.id} className="gallery-card-caption">
                    <span className="gallery-card-caption-label">{field.name}</span>
                    <span className="gallery-card-caption-value">{formatGalleryCaptionValue(v, field, dateTimeDefaults)}</span>
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function formatGalleryCaptionValue(value: unknown, field: FieldSchema, defaults: DateTimeDisplayDefaults): string {
  if (isDateLikeFieldType(field.type)) return formatDateForField(value, field, defaults);
  return String(value);
}
