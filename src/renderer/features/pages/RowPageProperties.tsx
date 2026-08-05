import { useRef, useState } from "react";
import type { DatabaseBundle, DatabaseRecord, DatabaseSchema, DatabaseSummary, DateDisplayFormat, EntityRef, FieldSchema, FieldType, RecordValue, RelationFieldConfig, RollupFieldConfig, SelectOption, TimeDisplayFormat } from "../../../shared/types";
import { Cell, createCellEditQueue, type CellEditQueueSnapshot } from "../databases/DatabaseTable";
import { FieldSettingsDialog } from "../databases/FieldSettingsDialog";
import { FieldTypeIcon } from "../../components/FieldTypeIcon";
import { MarkdownPropertyLinks, WorkspaceLinkButton, parseStandaloneMarkdownLinks } from "./PropertyLinks";
import { useDateTimeDisplayDefaults } from "../../lib/settings";
import type { DateTimeDisplayDefaults } from "../../../shared/date-values";

const ORIGINAL_NOTION_LINK_FIELD_IDS = new Set(["notion_original_html", "notion_original_csv"]);

type FieldSettingsInput = {
  name: string;
  type: FieldType;
  options?: SelectOption[];
  formula?: string;
  relation?: RelationFieldConfig;
  rollup?: RollupFieldConfig;
  dateFormat?: DateDisplayFormat;
  timeFormat?: TimeDisplayFormat;
};

interface RowPagePropertiesProps {
  schema: DatabaseSchema;
  record: DatabaseRecord;
  databases?: DatabaseSummary[];
  loadDatabase?: (id: string) => Promise<DatabaseBundle>;
  onUpdateField: (fieldId: string, value: RecordValue) => Promise<void> | void;
  onUpdateFieldSettings?: (field: FieldSchema, input: FieldSettingsInput) => Promise<void> | void;
  onUpdateFieldOptions: (fieldId: string, options: SelectOption[]) => Promise<void> | void;
  onOpenEntityRef?: (ref: EntityRef) => void;
  onSearchPropertyValue?: (value: string) => void;
}

export function createRowPagePropertyEditController({
  onDiscard,
  onStateChange,
  operation
}: {
  onDiscard: () => void;
  onStateChange: (snapshot: CellEditQueueSnapshot) => void;
  operation: (fieldId: string, value: RecordValue) => Promise<void> | void;
}) {
  const queue = createCellEditQueue({
    operation: async (input) => operation(input.fieldId, input.value),
    onStateChange
  });
  return {
    enqueue(databaseId: string, rowId: string, fieldId: string, value: RecordValue) {
      return queue.enqueue({ databaseId, rowId, fieldId, value });
    },
    retry() {
      return queue.retry();
    },
    discard() {
      const discarded = queue.discard();
      if (discarded) onDiscard();
      return discarded;
    }
  };
}

export function RowPageProperties({
  schema,
  record,
  databases = [],
  loadDatabase,
  onUpdateField,
  onUpdateFieldSettings,
  onUpdateFieldOptions,
  onOpenEntityRef,
  onSearchPropertyValue
}: RowPagePropertiesProps) {
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  const [editingField, setEditingField] = useState<FieldSchema | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [editState, setEditState] = useState<CellEditQueueSnapshot>({ status: "idle", queuedCount: 0 });
  const operationRef = useRef(onUpdateField);
  operationRef.current = onUpdateField;
  const editControllerRef = useRef<ReturnType<typeof createRowPagePropertyEditController> | null>(null);
  if (!editControllerRef.current) {
    editControllerRef.current = createRowPagePropertyEditController({
      operation: (fieldId, value) => operationRef.current(fieldId, value),
      onStateChange: setEditState,
      onDiscard: () => setEditorResetVersion((value) => value + 1)
    });
  }
  const controlsBlocked = editState.status !== "idle";
  // Skip: hidden bookkeeping fields, the title (already in the editor's
  // title input), and the implicit `id` system column.
  const fields = schema.fields.filter((field) => !field.hidden && field.id !== "title" && field.id !== "id");
  if (fields.length === 0) return null;

  return (
    <>
      <div
        className="row-properties"
        aria-busy={editState.status === "saving"}
        aria-disabled={controlsBlocked}
        inert={controlsBlocked ? true : undefined}
      >
        {fields.map((field) => (
          <PropertyRow
            key={`${field.id}:${editorResetVersion}`}
            field={field}
            value={record[field.id]}
            record={record}
            databaseId={schema.id}
            onChange={(value) => {
              void editControllerRef.current?.enqueue(schema.id, String(record.id), field.id, value);
            }}
            onOpenEntityRef={onOpenEntityRef}
            onOptionsChange={(options) => onUpdateFieldOptions(field.id, options)}
            onManageField={onUpdateFieldSettings ? () => setEditingField(field) : undefined}
            onSearchPropertyValue={onSearchPropertyValue}
            dateTimeDefaults={dateTimeDefaults}
          />
        ))}
        {editingField && onUpdateFieldSettings && (
          <FieldSettingsDialog
            field={editingField}
            fields={schema.fields}
            databases={databases}
            loadDatabase={loadDatabase}
            onClose={() => setEditingField(null)}
            onSave={async (input) => {
              await onUpdateFieldSettings(editingField, input);
            }}
          />
        )}
      </div>
      {editState.status === "error" ? (
        <div
          className="database-mutation-toast row-page-property-feedback error"
          role="alert"
          aria-live="assertive"
          data-row-id={editState.failedInput?.rowId}
          data-field-id={editState.failedInput?.fieldId}
          data-value={String(editState.failedInput?.value ?? "")}
        >
          <span>
            Row property failed to save: {editState.error}
            {editState.queuedCount > 0 ? ` · ${editState.queuedCount} later edit${editState.queuedCount === 1 ? "" : "s"} queued` : ""}
          </span>
          <button type="button" onClick={() => { editControllerRef.current?.retry(); }}>Retry</button>
          <button type="button" onClick={() => { editControllerRef.current?.discard(); }}>Discard failed edit</button>
        </div>
      ) : null}
    </>
  );
}

interface PropertyRowProps {
  field: FieldSchema;
  value: RecordValue | undefined;
  record: DatabaseRecord;
  databaseId: string;
  onChange: (value: RecordValue) => void;
  onOpenEntityRef?: (ref: EntityRef) => void;
  onOptionsChange: (options: SelectOption[]) => Promise<void> | void;
  onManageField?: () => void;
  onSearchPropertyValue?: (value: string) => void;
  dateTimeDefaults?: DateTimeDisplayDefaults;
}

export function PropertyRow({
  field,
  value,
  record,
  databaseId,
  onChange,
  onOpenEntityRef,
  onOptionsChange,
  onManageField,
  onSearchPropertyValue,
  dateTimeDefaults
}: PropertyRowProps) {
  const originalNotionLink = ORIGINAL_NOTION_LINK_FIELD_IDS.has(field.id) ? String(value ?? "").trim() : "";
  const editable = isEditablePropertyField(field) && !originalNotionLink;
  const markdownLinks = originalNotionLink || editable ? [] : parseStandaloneMarkdownLinks(String(value ?? ""));
  const searchableOptionValues = onSearchPropertyValue ? optionSearchValues(field, value) : [];
  const className = [
    "row-property",
    editable ? "editable" : "read-only",
    originalNotionLink ? "source-link-property" : ""
  ].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <div className="row-property-label" title={field.name}>
        <span className="row-property-icon"><FieldTypeIcon type={field.type} /></span>
        <span className="row-property-name">{field.name}</span>
        {onManageField && (
          <button
            type="button"
            className="row-property-settings"
            title={`Field settings: ${field.name}`}
            aria-label={`Field settings: ${field.name}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onManageField();
            }}
          >
            ...
          </button>
        )}
      </div>
      <div className="row-property-value">
        {originalNotionLink ? (
          <WorkspaceLinkButton href={originalNotionLink} />
        ) : markdownLinks.length > 0 ? (
          <MarkdownPropertyLinks links={markdownLinks} />
        ) : (
          <>
            <span className={`row-property-editor row-property-editor-${field.type}`}>
              <Cell
                field={field}
                value={value}
                wrap={true}
                record={record}
                databaseId={databaseId}
                onChange={onChange}
                onOpenEntityRef={onOpenEntityRef}
                onOptionsChange={onOptionsChange}
                dateTimeDefaults={dateTimeDefaults}
              />
            </span>
            {searchableOptionValues.length > 0 && (
              <span className="row-property-option-searches" aria-label={`Search ${field.name} values`}>
                {searchableOptionValues.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="row-property-option-search row-property-option-search-chip"
                    title={`Search ${field.name}: ${item.name}`}
                    aria-label={`Search ${field.name}: ${item.name}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onSearchPropertyValue?.(item.name);
                    }}
                  >
                    <span className="row-property-option-search-glyph" aria-hidden="true">⌕</span>
                    <span className="row-property-option-search-label">{item.name}</span>
                  </button>
                ))}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function optionSearchValues(field: FieldSchema, value: RecordValue | undefined): SelectOption[] {
  if (field.type !== "select" && field.type !== "multi_select") return [];
  if (typeof value !== "string") return [];
  const values = field.type === "multi_select" ? value.split(";") : [value];
  const seen = new Set<string>();
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((name) => {
      if (seen.has(name)) return [];
      seen.add(name);
      return [field.options?.find((option) => option.name === name) ?? { id: `unknown_${name}`, name, color: "gray" }];
    });
}

function isEditablePropertyField(field: FieldSchema): boolean {
  return !field.system &&
    !field.hidden &&
    field.type !== "formula" &&
    field.type !== "rollup" &&
    field.type !== "created_time" &&
    field.type !== "updated_time";
}
