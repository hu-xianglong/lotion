import { useEffect, useState } from "react";
import type { DatabaseBundle, DatabaseRecord, DatabaseSummary, DateDisplayFormat, FieldSchema, FieldType, RelationFieldConfig, RollupAggregation, RollupFieldConfig, SelectOption, TimeDisplayFormat } from "../../../shared/types";
import { defaultDateFormatForField, defaultTimeFormatForField, isDateLikeFieldType } from "../../../shared/date-values";
import { evaluateFormula, formulaColumnLabel } from "../../../shared/formula";
import { useI18n } from "../../lib/i18n";
import { OPTION_COLORS } from "./option-colors";
import { OptionPill } from "./OptionPill";
import { pluginHost } from "../../plugin-host";

interface FieldSettingsDialogProps {
  field: FieldSchema;
  fields?: FieldSchema[];
  records?: DatabaseRecord[];
  databases?: DatabaseSummary[];
  loadDatabase?: (id: string) => Promise<DatabaseBundle>;
  wrap?: boolean;
  onToggleWrap?: () => void | Promise<void>;
  onHide?: () => void | Promise<void>;
  onClose: () => void;
  onSave: (input: { name: string; type: FieldType; options?: SelectOption[]; formula?: string; relation?: RelationFieldConfig; rollup?: RollupFieldConfig; dateFormat?: DateDisplayFormat; timeFormat?: TimeDisplayFormat }) => Promise<void>;
}

export function FieldSettingsDialog({ field, fields = [], records = [], databases = [], loadDatabase, wrap = false, onToggleWrap, onHide, onClose, onSave }: FieldSettingsDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState(field.name);
  const [type, setType] = useState<FieldType>(field.type);
  const [options, setOptions] = useState<SelectOption[]>(field.options || defaultOptions());
  const [formula, setFormula] = useState(field.formula || "");
  const [formulaPreview, setFormulaPreview] = useState<{ row: number; value: string }>();
  const [relationTargetDatabaseId, setRelationTargetDatabaseId] = useState(field.relation?.targetDatabaseId || "");
  const [relationMultiple, setRelationMultiple] = useState(field.relation?.multiple !== false);
  const [rollupRelationFieldId, setRollupRelationFieldId] = useState(field.rollup?.relationFieldId || "");
  const [rollupTargetFieldId, setRollupTargetFieldId] = useState(field.rollup?.targetFieldId || "");
  const [rollupTargetFields, setRollupTargetFields] = useState<FieldSchema[]>([]);
  const [rollupTargetLoadState, setRollupTargetLoadState] = useState<"idle" | "loading" | "error">("idle");
  const [rollupAggregation, setRollupAggregation] = useState<RollupAggregation>(field.rollup?.aggregation || "count");
  const [dateFormat, setDateFormat] = useState<DateDisplayFormat>(field.dateFormat ?? defaultDateFormatForField(field.type));
  const [timeFormat, setTimeFormat] = useState<TimeDisplayFormat>(field.timeFormat ?? defaultTimeFormatForField(field.type));
  const [isSaving, setIsSaving] = useState(false);
  const providers = pluginHost.fields.list();
  const providerTypes = new Set(providers.map((provider) => provider.type));
  const rollupRelationFields = fields.filter((candidate) => candidate.type === "entity_ref" && !candidate.hidden);
  const selectedRollupRelationField = rollupRelationFields.find((candidate) => candidate.id === rollupRelationFieldId);
  const rollupTargetDatabaseId = selectedRollupRelationField?.relation?.targetDatabaseId?.trim() || "";

  useEffect(() => {
    setName(field.name);
    setType(field.type);
    setOptions(field.options || defaultOptions());
    setFormula(field.formula || "");
    setFormulaPreview(undefined);
    setRelationTargetDatabaseId(field.relation?.targetDatabaseId || "");
    setRelationMultiple(field.relation?.multiple !== false);
    setRollupRelationFieldId(field.rollup?.relationFieldId || "");
    setRollupTargetFieldId(field.rollup?.targetFieldId || "");
    setRollupAggregation(field.rollup?.aggregation || "count");
    setDateFormat(field.dateFormat ?? defaultDateFormatForField(field.type));
    setTimeFormat(field.timeFormat ?? defaultTimeFormatForField(field.type));
  }, [field]);

  useEffect(() => {
    if (type !== "rollup" || !rollupTargetDatabaseId || !loadDatabase) {
      setRollupTargetFields([]);
      setRollupTargetLoadState("idle");
      return;
    }

    let cancelled = false;
    setRollupTargetFields([]);
    setRollupTargetLoadState("loading");
    loadDatabase(rollupTargetDatabaseId)
      .then((bundle) => {
        if (cancelled) return;
        setRollupTargetFields(bundle.schema.fields.filter((candidate) => !candidate.hidden));
        setRollupTargetLoadState("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setRollupTargetFields([]);
        setRollupTargetLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [loadDatabase, rollupTargetDatabaseId, type]);

  async function save() {
    const dateLike = isDateLikeFieldType(type);
    setIsSaving(true);
    await onSave({
      name,
      type,
      options: usesOptions(type) ? cleanOptions(options) : undefined,
      formula: type === "formula" ? formula : undefined,
      relation: type === "entity_ref"
        ? {
          ...(relationTargetDatabaseId.trim() ? { targetDatabaseId: relationTargetDatabaseId.trim() } : {}),
          multiple: relationMultiple
        }
        : undefined,
      rollup: type === "rollup"
        ? {
          ...(rollupRelationFieldId.trim() ? { relationFieldId: rollupRelationFieldId.trim() } : {}),
          ...(rollupTargetFieldId.trim() ? { targetFieldId: rollupTargetFieldId.trim() } : {}),
          aggregation: rollupAggregation
        }
        : undefined,
      dateFormat: dateLike ? dateFormat : undefined,
      timeFormat: dateLike ? timeFormat : undefined
    });
    setIsSaving(false);
    onClose();
  }

  function updateOption(index: number, value: string) {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? { ...option, name: value } : option));
  }

  function updateOptionColor(index: number, color: string) {
    setOptions((current) => current.map((option, optionIndex) => optionIndex === index ? { ...option, color } : option));
  }

  function addOption() {
    setOptions((current) => [...current, { id: createOptionId("New option"), name: "New option", color: "gray" }]);
  }

  function removeOption(index: number) {
    setOptions((current) => current.filter((_option, optionIndex) => optionIndex !== index));
  }

  function updateType(nextType: FieldType) {
    const wasDateLike = isDateLikeFieldType(type);
    setType(nextType);
    if (!wasDateLike && isDateLikeFieldType(nextType)) {
      setDateFormat(defaultDateFormatForField(nextType));
      setTimeFormat(defaultTimeFormatForField(nextType));
    }
  }

  function previewFormula() {
    if (!formula.trim() || records.length === 0) return;
    const previewRows = records.slice(0, Math.min(records.length, 25));
    for (let rowIndex = 0; rowIndex < previewRows.length; rowIndex += 1) {
      const value = evaluateFormula({ ...field, type: "formula", formula }, previewRows[rowIndex], fields, records, rowIndex);
      if (value !== "" && value !== null && value !== undefined) {
        setFormulaPreview({ row: rowIndex + 1, value: String(value) });
        return;
      }
    }
    setFormulaPreview({ row: 1, value: "" });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="field-dialog" role="dialog" aria-modal="true" aria-label="Field settings" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div>
            <h2>{t("field.settings")}</h2>
            <p>{field.id}</p>
          </div>
          <button onClick={onClose}>{t("common.close")}</button>
        </div>

        <label className="form-row">
          <span>{t("field.name")}</span>
          <input value={name} disabled={field.system} onChange={(event) => setName(event.target.value)} />
        </label>

        <label className="form-row">
          <span>{t("field.type")}</span>
          <select value={type} disabled={field.system} onChange={(event) => updateType(event.target.value as FieldType)}>
            {field.system && <option value={field.type}>{formatFieldType(field.type)}</option>}
            {!field.system && !providerTypes.has(type) && <option value={type}>{formatFieldType(type)}</option>}
            {/* Plugin path: list every registered FieldTypeProvider.
                Built-ins (text/number/select/...) come from
                src/builtin-plugins/field-types-default; third-party
                plugins that registered a field type also appear here. */}
            {providers.map((p) => (
              <option key={p.type} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {field.system && <p className="helper-text">{t("field.systemHelper")}</p>}

        {isDateLikeFieldType(type) && (
          <>
            <label className="form-row">
              <span>{t("field.dateFormat")}</span>
              <select value={dateFormat} onChange={(event) => setDateFormat(event.target.value as DateDisplayFormat)}>
                <option value="full">{t("field.dateFormat.full")}</option>
                <option value="month_day_year">{t("field.dateFormat.monthDayYear")}</option>
                <option value="day_month_year">{t("field.dateFormat.dayMonthYear")}</option>
                <option value="year_month_day">{t("field.dateFormat.yearMonthDay")}</option>
                <option value="iso">{t("field.dateFormat.iso")}</option>
              </select>
            </label>
            <label className="form-row">
              <span>{t("field.timeFormat")}</span>
              <select value={timeFormat} onChange={(event) => setTimeFormat(event.target.value as TimeDisplayFormat)}>
                <option value="none">{t("field.timeFormat.none")}</option>
                <option value="h12">{t("field.timeFormat.h12")}</option>
                <option value="h24">{t("field.timeFormat.h24")}</option>
              </select>
            </label>
          </>
        )}

        {usesOptions(type) && (
          <div className="form-row">
            <span>{t("field.options")}</span>
            <div className="option-list">
              {options.map((option, index) => (
                <div className="option-editor-row" key={`${option.id}-${index}`}>
                  <input value={option.name} onChange={(event) => updateOption(index, event.target.value)} />
                  <select value={option.color || "gray"} onChange={(event) => updateOptionColor(index, event.target.value)}>
                    {OPTION_COLORS.map((color) => (
                      <option key={color.id} value={color.id}>{color.label}</option>
                    ))}
                  </select>
                  <OptionPill option={option.name ? option : { ...option, name: "Option" }} />
                  <button disabled={options.length <= 1} onClick={() => removeOption(index)}>{t("field.remove")}</button>
                </div>
              ))}
            </div>
            <button className="secondary-action" onClick={addOption}>{t("field.addOption")}</button>
            <p className="helper-text">{t("field.optionsHelper")}</p>
          </div>
        )}

        {type === "formula" && (
          <div className="form-row formula-row">
            <label htmlFor={`formula-${field.id}`}>{t("field.formula")}</label>
            <textarea
              id={`formula-${field.id}`}
              value={formula}
              disabled={field.system}
              spellCheck={false}
              onChange={(event) => {
                setFormula(event.target.value);
                setFormulaPreview(undefined);
              }}
            />
            <p className="helper-text">{t("field.formulaHelper")}</p>
            <p className="helper-text">{t("field.formulaStableHelper")}</p>
            <div className="formula-reference-section">
              <strong>{t("field.formulaColumns")}</strong>
              <div className="formula-reference-list">
                {fields.map((candidate, index) => (
                  <div className="formula-reference-item" key={candidate.id}>
                    <code>{formulaColumnLabel(index)}</code>
                    <span>{candidate.name}</span>
                    <small>{candidate.id}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="formula-example-section">
              <strong>{t("field.formulaExamples")}</strong>
              <code>=SUM(E1:E100)</code>
              <code>=AVERAGEIFS([weight_kg], [recorded_date], "&gt;="&amp;[@recorded_date]-7, [recorded_date], "&lt;"&amp;[@recorded_date])</code>
              <code>=SUM(VALUES("line_total", 4, 100))</code>
            </div>
            <div className="formula-preview-row">
              <button type="button" className="secondary-action" disabled={!formula.trim() || records.length === 0} onClick={previewFormula}>
                {t("field.formulaPreview")}
              </button>
              {formulaPreview && (
                <output>
                  {t("field.formulaPreviewRow")} {formulaPreview.row}: <code>{formulaPreview.value || t("cell.empty")}</code>
                </output>
              )}
            </div>
          </div>
        )}

        {type === "entity_ref" && (
          <div className="form-row relation-settings-row">
            <span>{t("field.relation")}</span>
            <div className="relation-settings">
              <label>
                <span>{t("field.relationTarget")}</span>
                {databases.length > 0 ? (
                  <select
                    value={relationTargetDatabaseId}
                    disabled={field.system}
                    onChange={(event) => setRelationTargetDatabaseId(event.target.value)}
                  >
                    <option value="">{t("field.relationTargetAny")}</option>
                    {relationTargetDatabaseId && !databases.some((database) => database.id === relationTargetDatabaseId) && (
                      <option value={relationTargetDatabaseId}>{relationTargetDatabaseId}</option>
                    )}
                    {databases.map((database) => (
                      <option key={database.id} value={database.id}>
                        {databasePickerLabel(database)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={relationTargetDatabaseId}
                    disabled={field.system}
                    placeholder={t("field.relationTargetPlaceholder")}
                    onChange={(event) => setRelationTargetDatabaseId(event.target.value)}
                  />
                )}
              </label>
              <label className="relation-multiple-row">
                <input
                  type="checkbox"
                  checked={relationMultiple}
                  disabled={field.system}
                  onChange={(event) => setRelationMultiple(event.target.checked)}
                />
                <span>{t("field.relationMultiple")}</span>
              </label>
              <p className="helper-text">{t("field.relationHelper")}</p>
            </div>
          </div>
        )}

        {type === "rollup" && (
          <div className="form-row relation-settings-row">
            <span>{t("field.rollup")}</span>
            <div className="relation-settings">
              <label>
                <span>{t("field.rollupRelationField")}</span>
                {rollupRelationFields.length > 0 ? (
                  <select
                    value={rollupRelationFieldId}
                    disabled={field.system}
                    onChange={(event) => setRollupRelationFieldId(event.target.value)}
                  >
                    <option value="">{t("field.rollupRelationFieldSelect")}</option>
                    {rollupRelationFieldId && !rollupRelationFields.some((candidate) => candidate.id === rollupRelationFieldId) && (
                      <option value={rollupRelationFieldId}>{rollupRelationFieldId}</option>
                    )}
                    {rollupRelationFields.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {fieldPickerLabel(candidate)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={rollupRelationFieldId}
                    disabled={field.system}
                    placeholder={t("field.rollupRelationFieldPlaceholder")}
                    onChange={(event) => setRollupRelationFieldId(event.target.value)}
                  />
                )}
              </label>
              <label>
                <span>{t("field.rollupTargetField")}</span>
                {rollupTargetFields.length > 0 ? (
                  <select
                    value={rollupTargetFieldId}
                    disabled={field.system}
                    onChange={(event) => setRollupTargetFieldId(event.target.value)}
                  >
                    <option value="">{t("field.rollupTargetFieldSelect")}</option>
                    {rollupTargetFieldId && !rollupTargetFields.some((candidate) => candidate.id === rollupTargetFieldId) && (
                      <option value={rollupTargetFieldId}>{rollupTargetFieldId}</option>
                    )}
                    {rollupTargetFields.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {fieldPickerLabel(candidate)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={rollupTargetFieldId}
                    disabled={field.system}
                    placeholder={t("field.rollupTargetFieldPlaceholder")}
                    onChange={(event) => setRollupTargetFieldId(event.target.value)}
                  />
                )}
              </label>
              {rollupTargetLoadState === "loading" && <p className="helper-text">{t("field.rollupTargetFieldLoading")}</p>}
              {rollupTargetLoadState === "error" && <p className="helper-text">{t("field.rollupTargetFieldLoadFailed")}</p>}
              {rollupRelationFieldId && !rollupTargetDatabaseId && <p className="helper-text">{t("field.rollupTargetFieldNeedsTarget")}</p>}
              <label>
                <span>{t("field.rollupAggregation")}</span>
                <select
                  value={rollupAggregation}
                  disabled={field.system}
                  onChange={(event) => setRollupAggregation(event.target.value as RollupAggregation)}
                >
                  <option value="count">{t("field.rollupAggregation.count")}</option>
                  <option value="count_values">{t("field.rollupAggregation.countValues")}</option>
                  <option value="sum">{t("field.rollupAggregation.sum")}</option>
                  <option value="average">{t("field.rollupAggregation.average")}</option>
                  <option value="min">{t("field.rollupAggregation.min")}</option>
                  <option value="max">{t("field.rollupAggregation.max")}</option>
                  <option value="range">{t("field.rollupAggregation.range")}</option>
                  <option value="show_original">{t("field.rollupAggregation.showOriginal")}</option>
                </select>
              </label>
              <p className="helper-text">{t("field.rollupHelper")}</p>
            </div>
          </div>
        )}

        {onToggleWrap && (
          <label className="field-wrap-row">
            <input type="checkbox" checked={wrap} onChange={() => onToggleWrap()} />
            <span>
              <strong>{t("field.wrap")}</strong>
              <em>{t("field.wrapHelper")}</em>
            </span>
          </label>
        )}

        {onHide && (
          <div className="field-hide-row">
            <button className="field-hide-button" onClick={() => onHide()}>
              <strong>{t("field.hide")}</strong>
              <em>{t("field.hideHelper")}</em>
            </button>
          </div>
        )}

        <div className="dialog-actions">
          <button onClick={onClose}>{t("common.cancel")}</button>
          <button disabled={isSaving || !name.trim() || (usesOptions(type) && cleanOptions(options).length === 0)} onClick={save}>
            {isSaving ? t("common.saving") : t("common.saveField")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function formatFieldType(type: FieldType): string {
  if (type === "created_time") return "Created";
  if (type === "updated_time") return "Updated";
  if (type === "url") return "URL";
  if (type === "person") return "Person";
  if (type === "entity_ref") return "Page / row link";
  if (type === "rollup") return "Rollup";
  if (type === "multi_select") return "Multi select";
  return type.replace("_", " ");
}

export function usesOptions(type: FieldType): boolean {
  return type === "select" || type === "multi_select";
}

function defaultOptions(): SelectOption[] {
  return [
    { id: "opt_todo", name: "Todo", color: "gray" },
    { id: "opt_in_progress", name: "In Progress", color: "blue" },
    { id: "opt_done", name: "Done", color: "green" }
  ];
}

function cleanOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  return options.flatMap((option) => {
    const name = option.name.trim();
    if (!name || seen.has(name.toLowerCase())) return [];
    seen.add(name.toLowerCase());
    return [{ ...option, id: option.id || createOptionId(name), name, color: option.color || "gray" }];
  });
}

function createOptionId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `opt_${slug || Math.random().toString(36).slice(2, 8)}`;
}

function databasePickerLabel(database: DatabaseSummary): string {
  const path = (database.path ?? []).map((segment) => segment.trim()).filter(Boolean);
  if (path.length > 1) return path.join(" / ");
  return database.name;
}

function fieldPickerLabel(field: FieldSchema): string {
  return `${field.name} (${field.id})`;
}
