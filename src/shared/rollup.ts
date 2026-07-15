import type { DatabaseRecord, DatabaseSchema, EntityRef, FieldSchema, RecordValue, RollupAggregation } from "./types.js";

export interface RollupTargetBundle {
  schema: DatabaseSchema;
  records: DatabaseRecord[];
}

export type RollupTargetLoader = (databaseId: string) => Promise<RollupTargetBundle | null>;

export async function applyRollupsToRecords(
  schema: DatabaseSchema,
  records: DatabaseRecord[],
  loadTarget: RollupTargetLoader
): Promise<DatabaseRecord[]> {
  const rollupFields = schema.fields.filter((field) => field.type === "rollup" && field.rollup);
  if (rollupFields.length === 0 || records.length === 0) return records;

  const sourceFields = new Map(schema.fields.map((field) => [field.id, field]));
  const targetRecordIndexes = new Map<string, Map<string, DatabaseRecord>>();

  return Promise.all(records.map(async (record) => {
    let next = record;
    for (const field of rollupFields) {
      const value = await computeRollupValue(field, record, sourceFields, loadTarget, targetRecordIndexes);
      if (recordValueEquals(next[field.id], value)) continue;
      if (next === record) next = { ...record };
      next[field.id] = value;
    }
    return next;
  }));
}

async function computeRollupValue(
  rollupField: FieldSchema,
  record: DatabaseRecord,
  sourceFields: Map<string, FieldSchema>,
  loadTarget: RollupTargetLoader,
  targetRecordIndexes: Map<string, Map<string, DatabaseRecord>>
): Promise<RecordValue> {
  const config = rollupField.rollup;
  if (!config?.relationFieldId) return config?.aggregation === "count" ? 0 : "";
  const relationField = sourceFields.get(config.relationFieldId);
  if (!relationField || relationField.type !== "entity_ref") return config.aggregation === "count" ? 0 : "";

  const refs = parseEntityRefs(record[relationField.id]);
  if (refs.length === 0) return config.aggregation === "count" ? 0 : "";

  const values: RecordValue[] = [];
  let matchedRows = 0;
  for (const ref of refs) {
    const databaseId = ref.databaseId || relationField.relation?.targetDatabaseId;
    if (!databaseId || ref.kind !== "row") continue;
    const target = await loadTarget(databaseId);
    if (!target) continue;
    const rowId = ref.rowId || ref.entityId;
    const targetRecord = targetRecordById(databaseId, target, targetRecordIndexes).get(rowId);
    if (!targetRecord) continue;
    matchedRows += 1;
    if (config.targetFieldId) values.push(targetRecord[config.targetFieldId]);
  }

  return aggregateRollupValues(config.aggregation || "count", matchedRows, values);
}

function targetRecordById(
  databaseId: string,
  target: RollupTargetBundle,
  indexes: Map<string, Map<string, DatabaseRecord>>
): Map<string, DatabaseRecord> {
  const cached = indexes.get(databaseId);
  if (cached) return cached;

  const index = new Map<string, DatabaseRecord>();
  for (const record of target.records) {
    index.set(String(record.id), record);
  }
  indexes.set(databaseId, index);
  return index;
}

function parseEntityRefs(value: RecordValue | undefined): EntityRef[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    return candidates.filter(isEntityRefLike);
  } catch {
    return [];
  }
}

function isEntityRefLike(value: unknown): value is EntityRef {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EntityRef>;
  return (
    typeof candidate.entityId === "string" &&
    (candidate.kind === "page" || candidate.kind === "database" || candidate.kind === "row")
  );
}

function aggregateRollupValues(aggregation: RollupAggregation, matchedRows: number, values: RecordValue[]): RecordValue {
  if (aggregation === "count") return matchedRows;
  const nonEmptyValues = values.filter((value) => !isEmptyRollupValue(value));
  if (aggregation === "count_values") return nonEmptyValues.length;
  if (aggregation === "show_original") return nonEmptyValues.map((value) => String(value)).join(", ");

  const numbers = nonEmptyValues
    .map((value) => typeof value === "number" ? value : Number(String(value).replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return "";

  if (aggregation === "sum") return numbers.reduce((sum, value) => sum + value, 0);
  if (aggregation === "average") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (aggregation === "min") return Math.min(...numbers);
  if (aggregation === "max") return Math.max(...numbers);
  if (aggregation === "range") return Math.max(...numbers) - Math.min(...numbers);
  return "";
}

function isEmptyRollupValue(value: RecordValue | undefined): boolean {
  return value === undefined || value === null || value === "";
}

function recordValueEquals(left: RecordValue | undefined, right: RecordValue): boolean {
  if (left === right) return true;
  const leftEmpty = left == null || left === "";
  const rightEmpty = right == null || right === "";
  return leftEmpty && rightEmpty;
}
