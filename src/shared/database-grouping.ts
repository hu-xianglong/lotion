import type { DatabaseRecord, FieldSchema, RecordValue, ViewGroup } from "./types.js";

export const EMPTY_GROUP_KEY = "__empty__";
export interface DatabaseRecordGroup { key: string; label: string; records: DatabaseRecord[]; empty: boolean; }

export function normalizeViewGroups(groups: readonly ViewGroup[] | undefined, fields: readonly FieldSchema[], legacyGroupBy?: unknown, records: readonly DatabaseRecord[] = []): ViewGroup[] {
  // An explicitly persisted empty array means that grouping was removed. Only
  // migrate provider-specific configuration when the shared property is absent.
  const source = groups !== undefined ? groups : typeof legacyGroupBy === "string" ? [{ version: 1 as const, id: "group-primary", fieldId: legacyGroupBy, order: "manual" as const }] : [];
  const groupableFields = new Map(fields.filter(isGroupableField).map((field) => [field.id, field]));
  const seen = new Set<string>();
  return source.slice(0, 2).filter((group) => groupableFields.has(group.fieldId) && !seen.has(group.fieldId) && (seen.add(group.fieldId), true)).map((group, index) => {
    const field = groupableFields.get(group.fieldId)!;
    const validKeys = validGroupKeys(field, records);
    return {
      version: 1,
      id: group.id || `group-${index + 1}`,
      fieldId: group.fieldId,
      order: group.order === "asc" || group.order === "desc" ? group.order : "manual",
      groupOrder: sanitizeKeys(group.groupOrder, validKeys),
      hiddenGroupKeys: sanitizeKeys(group.hiddenGroupKeys, validKeys),
      collapsedGroupKeys: sanitizeKeys(group.collapsedGroupKeys, validKeys),
      hideEmpty: Boolean(group.hideEmpty)
    };
  });
}

export function isGroupableField(field: FieldSchema): boolean {
  return !field.hidden && field.id !== "id" && field.type !== "formula" && field.type !== "rollup";
}

export function groupDatabaseRecords(records: readonly DatabaseRecord[], field: FieldSchema, config: ViewGroup): DatabaseRecordGroup[] {
  const bucketMap = new Map<string, DatabaseRecordGroup>();
  const optionKeys = (field.options ?? []).map((option) => ({ key: `option:${option.id}`, label: option.name }));
  if (!config.hideEmpty) bucketMap.set(EMPTY_GROUP_KEY, { key: EMPTY_GROUP_KEY, label: "No value", records: [], empty: true });
  for (const option of optionKeys) bucketMap.set(option.key, { ...option, records: [], empty: true });
  for (const record of records) {
    const values = field.type === "multi_select" ? splitValues(record[field.id]) : [record[field.id]];
    const normalized = values.length ? values : [""];
    for (const value of normalized) {
      const { key, label } = groupKeyAndLabel(value, field);
      const bucket = bucketMap.get(key) ?? { key, label, records: [], empty: true };
      bucket.records.push(record);
      bucket.empty = false;
      bucketMap.set(key, bucket);
    }
  }
  const manual = new Map((config.groupOrder ?? optionKeys.map((option) => option.key)).map((key, index) => [key, index]));
  return [...bucketMap.values()]
    .filter((bucket) => !config.hiddenGroupKeys?.includes(bucket.key) && !(config.hideEmpty && bucket.records.length === 0))
    .sort((a, b) => config.order === "manual" ? (manual.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (manual.get(b.key) ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label) : a.label.localeCompare(b.label) * (config.order === "desc" ? -1 : 1));
}

export function groupKeyAndLabel(value: RecordValue, field: FieldSchema): { key: string; label: string } {
  if (value === null || value === "" || value === undefined) return { key: EMPTY_GROUP_KEY, label: "No value" };
  if (field.type === "checkbox") return value === true ? { key: "boolean:true", label: "Checked" } : { key: "boolean:false", label: "Unchecked" };
  const text = String(value).trim();
  const option = field.options?.find((candidate) => candidate.name.toLocaleLowerCase() === text.toLocaleLowerCase());
  return option ? { key: `option:${option.id}`, label: option.name } : { key: `value:${encodeURIComponent(text.toLocaleLowerCase())}`, label: text };
}

function splitValues(value: RecordValue): RecordValue[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return [...new Set(parsed.map(String).map((item) => item.trim()).filter(Boolean))];
  } catch {
    // CSV-style multi-select values are handled below.
  }
  return [...new Set(raw.split(/[;,]/).map((item) => item.trim()).filter(Boolean))];
}

function validGroupKeys(field: FieldSchema, records: readonly DatabaseRecord[]): Set<string> {
  const keys = new Set<string>([EMPTY_GROUP_KEY]);
  for (const option of field.options ?? []) keys.add(`option:${option.id}`);
  if (field.type === "checkbox") {
    keys.add("boolean:true");
    keys.add("boolean:false");
  }
  for (const record of records) {
    const values = field.type === "multi_select" ? splitValues(record[field.id]) : [record[field.id]];
    for (const value of values.length ? values : [""]) keys.add(groupKeyAndLabel(value, field).key);
  }
  return keys;
}

function sanitizeKeys(values: readonly string[] | undefined, validKeys: ReadonlySet<string>): string[] | undefined {
  return values ? [...new Set(values.filter((value) => value && validKeys.has(value)))] : undefined;
}
