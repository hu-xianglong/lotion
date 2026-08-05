import type { DatabaseBundle, DatabaseRecord, FieldSchema, TableView } from "../../shared/types";
import { evaluateFilterExpression, normalizeFilterExpression } from "../../shared/filter-expression";
import { sortDatabaseRecords } from "../../shared/database-sort";

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

  const filterExpression = normalizeFilterExpression(view.filterExpression, view.filters, bundle.schema.fields);
  if (filterExpression.children.length > 0) {
    records = records.filter((record) => evaluateFilterExpression(filterExpression, record, bundle.schema.fields));
  }
  const t1 = performance.now();

  if (view.sorts.length > 0) {
    records = sortDatabaseRecords(records, view.sorts, bundle.schema.fields);
  }
  const t2 = performance.now();

  console.log(
    `[lotion] getViewRecords db=${bundle.schema.id} view=${view.id} ` +
    `rows=${bundle.records.length}→${records.length} ` +
    `filter=${(t1 - t0).toFixed(1)}ms sort=${(t2 - t1).toFixed(1)}ms total=${(t2 - t0).toFixed(1)}ms`
  );

  return records;
}
