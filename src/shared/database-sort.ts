import { parseDateValue } from "./date-values.js";
import type { DatabaseRecord, FieldSchema, RecordValue, ViewSort } from "./types.js";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortDatabaseRecords(records: readonly DatabaseRecord[], sorts: readonly ViewSort[], fields: readonly FieldSchema[]): DatabaseRecord[] {
  if (sorts.length === 0) return records as DatabaseRecord[];
  const byId = new Map(fields.map((field) => [field.id, field]));
  return records
    .map((record, sourceIndex) => ({ record, sourceIndex }))
    .sort((a, b) => {
      for (const sort of sorts) {
        const field = byId.get(sort.fieldId);
        if (!field) continue;
        const compared = compareFieldValues(a.record[sort.fieldId], b.record[sort.fieldId], field, sort.direction);
        if (compared !== 0) return compared;
      }
      return a.sourceIndex - b.sourceIndex || collator.compare(String(a.record.id ?? ""), String(b.record.id ?? ""));
    })
    .map(({ record }) => record);
}

export function compareFieldValues(a: RecordValue, b: RecordValue, field: FieldSchema, direction: ViewSort["direction"]): number {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const modifier = direction === "asc" ? 1 : -1;
  let result = 0;
  if (field.type === "number") result = compareNumbers(a, b);
  else if (field.type === "formula" || field.type === "rollup") result = canCompareAsNumbers(a, b) ? compareNumbers(a, b) : compareText(a, b);
  else if (field.type === "date" || field.type === "created_time" || field.type === "updated_time") result = compareDates(a, b);
  else if (field.type === "checkbox") result = checkboxRank(a) - checkboxRank(b);
  else if (field.type === "select") result = compareSelect(a, b, field);
  else if (field.type === "multi_select") result = compareMultiSelect(a, b, field);
  else result = compareText(a, b);
  return result * modifier;
}

export function defaultSortDirection(field: Pick<FieldSchema, "type">): ViewSort["direction"] {
  return field.type === "date" || field.type === "created_time" || field.type === "updated_time" ? "desc" : "asc";
}

export function sortDirectionLabels(field: Pick<FieldSchema, "type">): { asc: string; desc: string } {
  if (field.type === "number" || field.type === "formula" || field.type === "rollup") return { asc: "Smallest first", desc: "Largest first" };
  if (field.type === "date" || field.type === "created_time" || field.type === "updated_time") return { asc: "Earliest first", desc: "Latest first" };
  if (field.type === "checkbox") return { asc: "Unchecked first", desc: "Checked first" };
  if (field.type === "select" || field.type === "multi_select") return { asc: "First option first", desc: "Last option first" };
  return { asc: "A → Z", desc: "Z → A" };
}

function compareNumbers(a: RecordValue, b: RecordValue): number {
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return compareText(a, b);
  return left - right;
}
function canCompareAsNumbers(a: RecordValue, b: RecordValue): boolean { return Number.isFinite(Number(a)) && Number.isFinite(Number(b)); }
function compareDates(a: RecordValue, b: RecordValue): number { const left = parseDateValue(a); const right = parseDateValue(b); return left && right ? left.getTime() - right.getTime() : compareText(a, b); }
function compareText(a: RecordValue, b: RecordValue): number { return collator.compare(String(a ?? ""), String(b ?? "")); }
function compareSelect(a: RecordValue, b: RecordValue, field: FieldSchema): number {
  const order = new Map((field.options ?? []).map((option, index) => [option.name.toLocaleLowerCase(), index]));
  const left = order.get(String(a).toLocaleLowerCase());
  const right = order.get(String(b).toLocaleLowerCase());
  if (left !== undefined || right !== undefined) return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER);
  return compareText(a, b);
}
function compareMultiSelect(a: RecordValue, b: RecordValue, field: FieldSchema): number {
  const order = new Map((field.options ?? []).map((option, index) => [option.name.toLocaleLowerCase(), index]));
  const toOrder = (value: RecordValue) => [...new Set(splitValues(value).map((item) => order.get(item.toLocaleLowerCase()) ?? Number.MAX_SAFE_INTEGER))].sort((x, y) => x - y);
  const left = toOrder(a);
  const right = toOrder(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}
function splitValues(value: RecordValue): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch {
    // CSV-style multi-select values are handled below.
  }
  return raw.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}
function checkboxRank(value: RecordValue): number {
  if (value === true || value === 1) return 1;
  const normalized = String(value ?? "").trim().toLocaleLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" ? 1 : 0;
}
function isEmpty(value: RecordValue): boolean { return value === null || value === "" || value === undefined; }
