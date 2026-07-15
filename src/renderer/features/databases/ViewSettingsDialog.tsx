import { useEffect, useState } from "react";
import type { DatabaseRowTemplate, FieldSchema, RecordValue, TableView, ViewFilter } from "../../../shared/types";
import type { ConfigField, ConfigSchema, DatabaseViewProvider } from "../../../shared/plugin-api";
import { useI18n } from "../../lib/i18n";

interface ViewSettingsDialogProps {
  view: TableView;
  fields: FieldSchema[];
  templates: DatabaseRowTemplate[];
  viewProviders: DatabaseViewProvider[];
  canDelete?: boolean;
  isDefault?: boolean;
  onClose: () => void;
  onSave: (view: TableView) => Promise<void>;
  onDuplicate?: (view: TableView) => Promise<void>;
  onDelete?: (view: TableView) => Promise<void>;
  onSetDefault?: (view: TableView) => Promise<void>;
}

export function ViewSettingsDialog({ view, fields, templates, viewProviders, canDelete = false, isDefault = false, onClose, onSave, onDuplicate, onDelete, onSetDefault }: ViewSettingsDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(view.name);
  const [viewType, setViewType] = useState<TableView["type"]>(view.type);
  const [config, setConfig] = useState<Record<string, unknown>>(view.config || {});
  const [dateFieldId, setDateFieldId] = useState(view.dateFieldId ?? "");
  const [coverFieldId, setCoverFieldId] = useState(view.coverFieldId ?? "");
  const [visibleFieldIds, setVisibleFieldIds] = useState<string[]>(view.visibleFieldIds);
  const [fieldOrder, setFieldOrder] = useState<string[]>(view.fieldOrder);
  const [sortFieldId, setSortFieldId] = useState(view.sorts[0]?.fieldId || "");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(view.sorts[0]?.direction || "asc");
  const [filterFieldId, setFilterFieldId] = useState(view.filters[0]?.fieldId || "");
  const [filterOperator, setFilterOperator] = useState<ViewFilter["operator"]>(view.filters[0]?.operator || "is");
  const [filterValue, setFilterValue] = useState(String(view.filters[0]?.value ?? ""));
  const [defaultTemplateId, setDefaultTemplateId] = useState(view.defaultTemplateId ?? "");
  const [pageSize, setPageSize] = useState<number>(view.pageSize ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingDefault, setIsSettingDefault] = useState(false);

  useEffect(() => {
    setName(view.name);
    setViewType(view.type);
    setConfig(withConfigDefaults(
      viewProviders.find((provider) => provider.type === view.type)?.configSchema,
      view.config || {},
      fields
    ));
    setDateFieldId(view.dateFieldId ?? "");
    setCoverFieldId(view.coverFieldId ?? "");
    setVisibleFieldIds(view.visibleFieldIds);
    setFieldOrder(view.fieldOrder);
    setSortFieldId(view.sorts[0]?.fieldId || "");
    setSortDirection(view.sorts[0]?.direction || "asc");
    setFilterFieldId(view.filters[0]?.fieldId || "");
    setFilterOperator(view.filters[0]?.operator || "is");
    setFilterValue(String(view.filters[0]?.value ?? ""));
    setDefaultTemplateId(view.defaultTemplateId ?? "");
    setPageSize(view.pageSize ?? 0);
  }, [fields, view, viewProviders]);

  async function save() {
    setIsSaving(true);
    const orderedVisibleFields = fieldOrder.filter((id) => visibleFieldIds.includes(id));
    const missingVisibleFields = visibleFieldIds.filter((id) => !orderedVisibleFields.includes(id));
    const next: TableView = {
      ...view,
      name: name.trim() || view.name,
      type: viewType,
      config: buildProviderConfig(activeProvider?.configSchema, config),
      dateFieldId: viewType === "calendar" ? (dateFieldId || undefined) : undefined,
      coverFieldId: viewType === "gallery" ? (coverFieldId || undefined) : undefined,
      visibleFieldIds,
      fieldOrder: [...orderedVisibleFields, ...missingVisibleFields],
      sorts: sortFieldId ? [{ fieldId: sortFieldId, direction: sortDirection }] : [],
      filters: buildFilters(),
      defaultTemplateId: defaultTemplateId || undefined,
      pageSize: pageSize > 0 ? pageSize : 0
    };
    await onSave(next);
    setIsSaving(false);
    onClose();
  }

  async function remove() {
    if (!onDelete || !canDelete) return;
    if (!window.confirm(t("view.deleteConfirm"))) return;
    setIsDeleting(true);
    try {
      await onDelete(view);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  }

  async function duplicate() {
    if (!onDuplicate) return;
    setIsDuplicating(true);
    try {
      await onDuplicate(view);
      onClose();
    } finally {
      setIsDuplicating(false);
    }
  }

  async function setAsDefault() {
    if (!onSetDefault || isDefault) return;
    setIsSettingDefault(true);
    try {
      await onSetDefault(view);
      onClose();
    } finally {
      setIsSettingDefault(false);
    }
  }

  function buildFilters(): ViewFilter[] {
    if (!filterFieldId) return [];
    if (filterOperator !== "checked" && !filterValue.trim()) return [];
    return [{
      fieldId: filterFieldId,
      operator: filterOperator,
      value: filterOperator === "checked" ? true : coerceFilterValue(filterValue)
    }];
  }

  function toggleField(fieldId: string) {
    setVisibleFieldIds((current) => {
      if (current.includes(fieldId)) {
        return current.filter((id) => id !== fieldId);
      }
      return [...current, fieldId];
    });
    setFieldOrder((current) => current.includes(fieldId) ? current : [...current, fieldId]);
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    setFieldOrder((current) => {
      const index = current.indexOf(fieldId);
      const nextIndex = index + direction;
      if (index === -1 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [field] = next.splice(index, 1);
      next.splice(nextIndex, 0, field);
      return next;
    });
  }

  const orderedFields = fieldOrder
    .map((id) => fields.find((field) => field.id === id))
    .filter((field): field is FieldSchema => Boolean(field));
  const remainingFields = fields.filter((field) => !fieldOrder.includes(field.id));
  const displayFields = [...orderedFields, ...remainingFields].filter((field) => !field.hidden);
  const builtinViewOptions: Array<{ type: TableView["type"]; label: string }> = [
    { type: "table", label: "表格 / Table" },
    { type: "list", label: "列表 / List" },
    { type: "calendar", label: "日历 / Calendar" },
    { type: "gallery", label: "画廊 / Gallery" }
  ];
  const builtinTypes = new Set(builtinViewOptions.map((option) => option.type));
  const pluginViewOptions = viewProviders
    .filter((provider) => !builtinTypes.has(provider.type))
    .map((provider) => ({
      type: provider.type as TableView["type"],
      label: `${provider.icon ? `${provider.icon} ` : ""}${provider.label}`
    }));
  const activeProvider = viewProviders.find((provider) => provider.type === viewType);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="view-dialog" role="dialog" aria-modal="true" aria-label="View settings" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <h2>{t("view.settings")}</h2>
            <p>{view.id}</p>
          </div>
          <button onClick={onClose}>{t("common.close")}</button>
        </div>

        <label className="form-row">
          <span>{t("field.name")}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="form-row">
          <span>类型</span>
          <select
            value={viewType}
            onChange={(event) => {
              const nextType = event.target.value as TableView["type"];
              setViewType(nextType);
              const provider = viewProviders.find((item) => item.type === nextType);
              setConfig((current) => withConfigDefaults(provider?.configSchema, current, fields));
            }}
          >
            {[...builtinViewOptions, ...pluginViewOptions].map((option) => (
              <option key={option.type} value={option.type}>{option.label}</option>
            ))}
          </select>
        </label>
        {viewType === "calendar" && (
          <label className="form-row">
            <span>日期字段</span>
            <select value={dateFieldId} onChange={(event) => setDateFieldId(event.target.value)}>
              <option value="">— created_time —</option>
              {fields.filter((f) => f.type === "date" || f.type === "text").map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
        {viewType === "gallery" && (
          <label className="form-row">
            <span>封面字段</span>
            <select value={coverFieldId} onChange={(event) => setCoverFieldId(event.target.value)}>
              <option value="">— 行 cover 默认 —</option>
              {fields.filter((f) => f.type === "text" || f.type === "url").map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
        {activeProvider?.configSchema && (
          <div className="view-provider-config">
            {Object.entries(activeProvider.configSchema).map(([key, field]) => (
              <ProviderConfigRow
                key={key}
                field={field}
                fields={fields}
                value={config[key]}
                onChange={(value) => setConfig((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>
        )}

        <div className="form-row">
          <span>{t("view.fields")}</span>
          <div className="view-field-list">
            {displayFields.map((field) => {
              const visible = visibleFieldIds.includes(field.id);
              return (
                <div className={visible ? "view-field-row visible" : "view-field-row"} data-field-id={field.id} key={field.id}>
                  <label>
                    <input type="checkbox" checked={visible} onChange={() => toggleField(field.id)} />
                    <span>{field.name}</span>
                  </label>
                  <div className="view-field-actions">
                    <button
                      aria-label={`Move ${field.name} up`}
                      data-field-action="move-up"
                      disabled={!visible}
                      onClick={() => moveField(field.id, -1)}
                      type="button"
                    >
                      {t("view.up")}
                    </button>
                    <button
                      aria-label={`Move ${field.name} down`}
                      data-field-action="move-down"
                      disabled={!visible}
                      onClick={() => moveField(field.id, 1)}
                      type="button"
                    >
                      {t("view.down")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="view-settings-grid">
          <label className="form-row">
            <span>{t("view.sortField")}</span>
            <select value={sortFieldId} onChange={(event) => setSortFieldId(event.target.value)}>
              <option value="">{t("view.noSort")}</option>
              {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>

          <label className="form-row">
            <span>{t("view.direction")}</span>
            <select value={sortDirection} disabled={!sortFieldId} onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")}>
              <option value="asc">{t("view.ascending")}</option>
              <option value="desc">{t("view.descending")}</option>
            </select>
          </label>
        </div>

        <div className="view-settings-grid">
          <label className="form-row">
            <span>{t("view.filterField")}</span>
            <select value={filterFieldId} onChange={(event) => setFilterFieldId(event.target.value)}>
              <option value="">{t("view.noFilter")}</option>
              {fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}
            </select>
          </label>

          <label className="form-row">
            <span>{t("view.operator")}</span>
            <select value={filterOperator} disabled={!filterFieldId} onChange={(event) => setFilterOperator(event.target.value as ViewFilter["operator"])}>
              <option value="is">{t("filter.is")}</option>
              <option value="is_not">{t("filter.isNot")}</option>
              <option value="contains">{t("filter.contains")}</option>
              <option value="gt">{t("filter.gt")}</option>
              <option value="lt">{t("filter.lt")}</option>
              <option value="checked">{t("filter.checked")}</option>
            </select>
          </label>
        </div>

        {filterOperator !== "checked" && (
          <label className="form-row">
            <span>{t("view.filterValue")}</span>
            <input disabled={!filterFieldId} value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />
          </label>
        )}

        <label className="form-row">
          <span>{t("templates.defaultForView")}</span>
          <select value={defaultTemplateId} onChange={(event) => setDefaultTemplateId(event.target.value)}>
            <option value="">{t("templates.noDefault")}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </select>
        </label>

        <label className="form-row">
          <span>{t("pagination.pageSize")}</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            <option value={0}>{t("pagination.all")}</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </label>

        <div className="dialog-actions">
          {onSetDefault && (
            <button
              type="button"
              disabled={isSaving || isDuplicating || isDeleting || isSettingDefault || isDefault}
              onClick={setAsDefault}
            >
              {isDefault ? t("view.defaultView") : t("view.setDefault")}
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              disabled={isSaving || isDuplicating || isDeleting || isSettingDefault}
              onClick={duplicate}
            >
              {isDuplicating ? t("common.duplicating") : t("view.duplicate")}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="danger-button"
              disabled={isSaving || isDuplicating || isDeleting || !canDelete}
              onClick={remove}
              title={!canDelete ? t("view.cannotDeleteLast") : undefined}
            >
              {isDeleting ? t("common.deleting") : t("common.delete")}
            </button>
          )}
          <button onClick={onClose}>{t("common.cancel")}</button>
          <button disabled={isSaving || isDuplicating || isDeleting || isSettingDefault || visibleFieldIds.length === 0 || !name.trim()} onClick={save}>
            {isSaving ? t("common.saving") : t("common.saveView")}
          </button>
        </div>
      </div>
    </div>
  );
}

function coerceFilterValue(value: string): RecordValue {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function ProviderConfigRow({
  field,
  fields,
  value,
  onChange
}: {
  field: ConfigField;
  fields: FieldSchema[];
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === "field-ref") {
    const candidates = fields.filter((item) =>
      !item.hidden && (!field.fieldKind || item.type === field.fieldKind)
    );
    return (
      <label className="form-row">
        <span>{field.label}</span>
        <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
          <option value="">自动选择</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="form-row">
        <span>{field.label}</span>
        <select value={String(value ?? field.default ?? "")} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "boolean") {
    return (
      <label className="view-config-checkbox">
        <input
          type="checkbox"
          checked={Boolean(value ?? field.default ?? false)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="form-row">
        <span>{field.label}</span>
        <input
          type="number"
          min={field.min}
          max={field.max}
          value={Number(value ?? field.default ?? 0)}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    );
  }

  return (
    <label className="form-row">
      <span>{field.label}</span>
      {field.multiline ? (
        <textarea value={String(value ?? field.default ?? "")} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={String(value ?? field.default ?? "")} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function withConfigDefaults(
  schema: ConfigSchema | undefined,
  current: Record<string, unknown>,
  fields: FieldSchema[]
): Record<string, unknown> {
  if (!schema) return {};
  const next: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (current[key] != null) {
      next[key] = current[key];
      continue;
    }
    if (field.type === "field-ref") {
      next[key] = fields.find((item) => !item.hidden && (!field.fieldKind || item.type === field.fieldKind))?.id || "";
    } else if ("default" in field) {
      next[key] = field.default;
    }
  }
  return next;
}

function buildProviderConfig(
  schema: ConfigSchema | undefined,
  current: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) {
    const value = current[key];
    if (value == null || value === "") continue;
    next[key] = value;
  }
  return next;
}
