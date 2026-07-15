import { useEffect, useMemo, useState } from "react";
import type { DatabaseRowTemplate, DatabaseSchema, RecordValue } from "../../../shared/types";
import { useI18n } from "../../lib/i18n";

interface RowTemplateDialogProps {
  schema: DatabaseSchema;
  onClose: () => void;
  onSave: (template: {
    id?: string;
    name: string;
    values?: Record<string, RecordValue>;
    markdown?: string;
    fullWidth?: boolean;
  }) => Promise<void>;
  onDelete: (templateId: string) => Promise<void>;
}

const NEW_TEMPLATE_ID = "__new__";

export function RowTemplateDialog({ schema, onClose, onSave, onDelete }: RowTemplateDialogProps) {
  const { t } = useI18n();
  const templates = useMemo(() => schema.templates ?? [], [schema.templates]);
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? NEW_TEMPLATE_ID);
  const selected = templates.find((template) => template.id === selectedId);
  const editingExisting = !!selected;
  const editableFields = useMemo(() => (
    schema.fields.filter((field) => !field.system && !field.hidden && field.type !== "formula" && field.type !== "rollup")
  ), [schema.fields]);
  const initialTemplate = templates[0];
  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [values, setValues] = useState<Record<string, RecordValue>>(initialTemplate?.values ?? {});
  const [markdown, setMarkdown] = useState(initialTemplate?.markdown ?? "");
  const [fullWidth, setFullWidth] = useState(!!initialTemplate?.fullWidth);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!selected) {
      setName("");
      setValues({});
      setMarkdown("");
      setFullWidth(false);
      return;
    }
    setName(selected.name);
    setValues(selected.values ?? {});
    setMarkdown(selected.markdown ?? "");
    setFullWidth(!!selected.fullWidth);
  }, [selected]);

  async function save() {
    const cleanValues = sanitizeTemplateValues(values);
    const cleanName = name.trim() || String(cleanValues.title ?? "").trim() || t("templates.untitled");
    if (!cleanValues.title) cleanValues.title = cleanName;
    setSaving(true);
    try {
      await onSave({
        id: editingExisting ? selected.id : undefined,
        name: cleanName,
        values: cleanValues,
        markdown,
        fullWidth
      });
      if (!editingExisting) setSelectedId(NEW_TEMPLATE_ID);
    } finally {
      setSaving(false);
    }
  }

  async function remove(template: DatabaseRowTemplate) {
    if (!window.confirm(t("templates.deleteConfirm"))) return;
    setSaving(true);
    try {
      await onDelete(template.id);
      setSelectedId(NEW_TEMPLATE_ID);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="row-template-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <h2>{t("templates.manage")}</h2>
            <p>{schema.name}</p>
          </div>
          <button onClick={onClose}>{t("common.close")}</button>
        </div>

        <div className="row-template-layout">
          <aside className="row-template-list" aria-label={t("templates.manage")}>
            <button
              type="button"
              className={selectedId === NEW_TEMPLATE_ID ? "row-template-list-item active" : "row-template-list-item"}
              onClick={() => setSelectedId(NEW_TEMPLATE_ID)}
            >
              <span>{t("templates.newTemplate")}</span>
            </button>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={template.id === selectedId ? "row-template-list-item active" : "row-template-list-item"}
                onClick={() => setSelectedId(template.id)}
              >
                <span>{template.name}</span>
              </button>
            ))}
          </aside>

          <section className="row-template-editor">
            <label className="form-row">
              <span>{t("templates.name")}</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="form-row template-defaults">
              <span>{t("templates.fieldDefaults")}</span>
              <div className="template-default-grid">
                {editableFields.map((field) => (
                  <label key={field.id} className="template-default-field">
                    <span>{field.name}</span>
                    {renderTemplateDefaultInput(field, values[field.id], (value) => {
                      setValues((current) => ({ ...current, [field.id]: value }));
                    })}
                  </label>
                ))}
              </div>
            </div>
            <label className="form-row">
              <span>{t("templates.body")}</span>
              <textarea value={markdown} onChange={(event) => setMarkdown(event.target.value)} />
            </label>
            <label className="view-config-checkbox">
              <input
                type="checkbox"
                checked={fullWidth}
                onChange={(event) => setFullWidth(event.target.checked)}
              />
              <span>{t("page.fullWidth")}</span>
            </label>
            <div className="dialog-actions">
              {editingExisting && (
                <button
                  type="button"
                  className="danger-button"
                  disabled={saving}
                  onClick={() => {
                    if (selected) void remove(selected);
                  }}
                >
                  {t("common.delete")}
                </button>
              )}
              <button type="button" onClick={onClose}>{t("common.cancel")}</button>
              <button type="button" className="primary" disabled={saving} onClick={save}>
                {saving ? t("common.saving") : t("templates.save")}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function renderTemplateDefaultInput(
  field: DatabaseSchema["fields"][number],
  value: RecordValue | undefined,
  onChange: (value: RecordValue) => void
) {
  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={value === true || value === "true"}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="" />
        {(field.options ?? []).map((option) => (
          <option key={option.id} value={option.name}>{option.name}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={String(value ?? "")}
      onChange={(event) => onChange(field.type === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
    />
  );
}

function sanitizeTemplateValues(values: Record<string, RecordValue>): Record<string, RecordValue> {
  const clean: Record<string, RecordValue> = {};
  for (const [fieldId, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    clean[fieldId] = value;
  }
  return clean;
}
