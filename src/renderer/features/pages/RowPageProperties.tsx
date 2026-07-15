import { useState } from "react";
import type { DatabaseBundle, DatabaseRecord, DatabaseSchema, DatabaseSummary, DateDisplayFormat, EntityRef, FieldSchema, FieldType, RecordValue, RelationFieldConfig, RollupFieldConfig, SelectOption, TimeDisplayFormat } from "../../../shared/types";
import { Cell } from "../databases/DatabaseTable";
import { FieldSettingsDialog } from "../databases/FieldSettingsDialog";
import { OptionPill } from "../databases/OptionPill";
import { FieldTypeIcon } from "../../components/FieldTypeIcon";
import { MarkdownPropertyLinks, WorkspaceLinkButton, parseStandaloneMarkdownLinks } from "./PropertyLinks";

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
  onUpdateField: (fieldId: string, value: RecordValue) => void;
  onUpdateFieldSettings?: (field: FieldSchema, input: FieldSettingsInput) => Promise<void> | void;
  onUpdateFieldOptions: (fieldId: string, options: SelectOption[]) => void;
  onUpdateFieldOptionColor: (fieldId: string, optionId: string, color: string) => void;
  onOpenEntityRef?: (ref: EntityRef) => void;
  onSearchPropertyValue?: (value: string) => void;
}

export function RowPageProperties({
  schema,
  record,
  databases = [],
  loadDatabase,
  onUpdateField,
  onUpdateFieldSettings,
  onUpdateFieldOptions,
  onUpdateFieldOptionColor,
  onOpenEntityRef,
  onSearchPropertyValue
}: RowPagePropertiesProps) {
  const [editingField, setEditingField] = useState<FieldSchema | null>(null);
  // Skip: hidden bookkeeping fields, the title (already in the editor's
  // title input), and the implicit `id` system column.
  const fields = schema.fields.filter((field) => !field.hidden && field.id !== "title" && field.id !== "id");
  if (fields.length === 0) return null;

  return (
    <div className="row-properties">
      {fields.map((field) => (
        <PropertyRow
          key={field.id}
          field={field}
          value={record[field.id]}
          record={record}
          databaseId={schema.id}
          onChange={(value) => onUpdateField(field.id, value)}
          onOpenEntityRef={onOpenEntityRef}
          onOptionColorChange={(optionId, color) => onUpdateFieldOptionColor(field.id, optionId, color)}
          onOptionsChange={(options) => onUpdateFieldOptions(field.id, options)}
          onManageField={onUpdateFieldSettings ? () => setEditingField(field) : undefined}
          onSearchPropertyValue={onSearchPropertyValue}
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
  );
}

interface PropertyRowProps {
  field: FieldSchema;
  value: RecordValue | undefined;
  record: DatabaseRecord;
  databaseId: string;
  onChange: (value: RecordValue) => void;
  onOpenEntityRef?: (ref: EntityRef) => void;
  onOptionColorChange: (optionId: string, color: string) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  onManageField?: () => void;
  onSearchPropertyValue?: (value: string) => void;
}

function PropertyRow({
  field,
  value,
  record,
  databaseId,
  onChange,
  onOpenEntityRef,
  onOptionColorChange,
  onOptionsChange,
  onManageField,
  onSearchPropertyValue
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
                onOptionColorChange={onOptionColorChange}
                onOptionsChange={onOptionsChange}
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
                    <OptionPill option={item} />
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
