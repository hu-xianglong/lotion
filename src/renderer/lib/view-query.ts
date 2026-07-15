import type { DatabaseBundle, DatabaseRecord, FieldSchema, RecordValue, TableView } from "../../shared/types";

// Construct the collator once — see notes on why this matters in
// scripts/bench-view-query.mjs. Reused across every sort comparison.
const collator = new Intl.Collator(undefined, { numeric: true });

export function getVisibleFields(bundle: DatabaseBundle, view: TableView): FieldSchema[] {
  const byId = new Map(bundle.schema.fields.map((field) => [field.id, field]));
  const orderedIds = view.fieldOrder.length ? view.fieldOrder : view.visibleFieldIds;
  return orderedIds
    .filter((id) => view.visibleFieldIds.includes(id))
    .map((id) => byId.get(id))
    .filter((field): field is FieldSchema => Boolean(field));
}

export function getViewRecords(bundle: DatabaseBundle, view: TableView): DatabaseRecord[] {
  const t0 = performance.now();

  // Formula values are precomputed in the service and persisted to disk, so we
  // read them straight from bundle.records. Filter creates a new array on its
  // own; sort would mutate in place, so we copy first when needed.
  let records: DatabaseRecord[] = bundle.records;

  if (view.filters.length > 0) {
    for (const filter of view.filters) {
      records = records.filter((record) => matchesFilter(record[filter.fieldId], filter.operator, filter.value));
    }
  }
  const t1 = performance.now();

  if (view.sorts.length > 0) {
    if (records === bundle.records) records = [...records];
    for (const sort of [...view.sorts].reverse()) {
      records.sort((a, b) => compareValues(a[sort.fieldId], b[sort.fieldId], sort.direction));
    }
  }
  const t2 = performance.now();

  console.log(
    `[lotion] getViewRecords db=${bundle.schema.id} view=${view.id} ` +
    `rows=${bundle.records.length}→${records.length} ` +
    `filter=${(t1 - t0).toFixed(1)}ms sort=${(t2 - t1).toFixed(1)}ms total=${(t2 - t0).toFixed(1)}ms`
  );

  return records;
}

function matchesFilter(value: RecordValue, operator: string, expected: RecordValue): boolean {
  if (!expected && operator !== "checked") return true;
  if (operator === "is") return String(value) === String(expected);
  if (operator === "is_not") return String(value) !== String(expected);
  if (operator === "contains") return String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "gt") return Number(value) > Number(expected);
  if (operator === "lt") return Number(value) < Number(expected);
  if (operator === "checked") return value === true;
  return true;
}

function compareValues(a: RecordValue, b: RecordValue, direction: "asc" | "desc"): number {
  const modifier = direction === "asc" ? 1 : -1;
  return collator.compare(String(a ?? ""), String(b ?? "")) * modifier;
}
