import { parseDateValue } from "./date-values.js";
import type { DatabaseRecord, FieldSchema, FilterCondition, FilterGroup, FilterOperator, RecordValue, ViewFilter } from "./types.js";

export const FILTER_EXPRESSION_VERSION = 1 as const;
export const MAX_FILTER_DEPTH = 3;

export type FilterExpression = FilterGroup;

const ALL_OPERATORS = new Set<FilterOperator>([
  "is", "is_not", "contains", "not_contains", "gt", "lt", "checked", "unchecked",
  "is_empty", "is_not_empty", "within_past", "within_next"
]);

export function legacyFiltersToExpression(filters: readonly ViewFilter[]): FilterExpression {
  return {
    version: 1,
    kind: "group",
    id: "filter-root",
    conjunction: "and",
    children: filters.filter((filter) => isValuelessOperator(filter.operator) || (filter.value !== "" && filter.value !== null)).map((filter, index) => ({
      version: 1,
      kind: "condition",
      id: `legacy-filter-${index + 1}`,
      fieldId: filter.fieldId,
      operator: filter.operator,
      value: filter.value
    }))
  };
}

export function normalizeFilterExpression(
  expression: FilterExpression | undefined,
  legacyFilters: readonly ViewFilter[] = [],
  fields?: readonly FieldSchema[]
): FilterExpression {
  const source = expression?.kind === "group" ? expression : legacyFiltersToExpression(legacyFilters);
  const fieldIds = fields ? new Set(fields.map((field) => field.id)) : undefined;
  return normalizeGroup(source, 1, fieldIds, "filter-root");
}

export function evaluateFilterExpression(
  expression: FilterExpression,
  record: DatabaseRecord,
  fields: readonly FieldSchema[],
  now = new Date()
): boolean {
  const byId = new Map(fields.map((field) => [field.id, field]));
  function evaluate(node: FilterGroup | FilterCondition): boolean {
    if (node.kind === "group") {
      if (node.children.length === 0) return true;
      return node.conjunction === "or" ? node.children.some(evaluate) : node.children.every(evaluate);
    }
    const field = byId.get(node.fieldId);
    if (!field) return false;
    return matchesFilterCondition(record[node.fieldId], node, field, now);
  }
  return evaluate(expression);
}

export function matchesFilterCondition(value: RecordValue, condition: Pick<FilterCondition, "operator" | "value">, field: FieldSchema, now = new Date()): boolean {
  const { operator, value: expected } = condition;
  if (!filterOperatorsForField(field).includes(operator)) return false;
  const empty = value === null || value === undefined || value === "";
  if (operator === "is_empty") return empty;
  if (operator === "is_not_empty") return !empty;
  if (operator === "checked") return value === true;
  if (operator === "unchecked") return value !== true;
  if ((expected === "" || expected === null) && !isValuelessOperator(operator)) return false;

  if (operator === "within_past" || operator === "within_next") {
    const date = parseDateValue(value);
    const days = parseRelativeDays(expected);
    if (!date || days === null) return false;
    const delta = (date.getTime() - startOfDay(now).getTime()) / 86_400_000;
    return operator === "within_past" ? delta <= 0 && delta >= -days : delta >= 0 && delta <= days;
  }
  if (field.type === "date" || field.type === "created_time" || field.type === "updated_time") {
    const actualDate = parseDateValue(value);
    const expectedDate = parseDateValue(expected);
    if (!actualDate || !expectedDate) return false;
    if (operator === "is") return actualDate.getTime() === expectedDate.getTime();
    if (operator === "is_not") return actualDate.getTime() !== expectedDate.getTime();
    if (operator === "gt") return actualDate.getTime() > expectedDate.getTime();
    if (operator === "lt") return actualDate.getTime() < expectedDate.getTime();
  }

  const actualText = String(value ?? "");
  const expectedText = String(expected ?? "");
  if (operator === "is") return actualText === expectedText;
  if (operator === "is_not") return actualText !== expectedText;
  if (operator === "contains" || operator === "not_contains") {
    const contains = field.type === "multi_select" || field.type === "entity_ref"
      ? splitMembershipValue(value).some((item) => item.toLocaleLowerCase() === expectedText.toLocaleLowerCase())
      : actualText.toLocaleLowerCase().includes(expectedText.toLocaleLowerCase());
    return operator === "contains" ? contains : !contains;
  }
  if (operator === "gt" || operator === "lt") {
    const actualNumber = Number(value);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    return operator === "gt" ? actualNumber > expectedNumber : actualNumber < expectedNumber;
  }
  return true;
}

export function filterConditionError(condition: Pick<FilterCondition, "operator" | "value">, field: FieldSchema): string | undefined {
  if (!filterOperatorsForField(field).includes(condition.operator)) return "Choose a valid operator.";
  if (isValuelessOperator(condition.operator)) return undefined;
  if (condition.value === "" || condition.value === null) return "Choose or enter a value.";
  if (field.type === "number" && !Number.isFinite(Number(condition.value))) return "Enter a valid number.";
  if ((field.type === "date" || field.type === "created_time" || field.type === "updated_time") && condition.operator !== "within_past" && condition.operator !== "within_next" && !parseDateValue(condition.value)) return "Enter a valid date.";
  if ((condition.operator === "within_past" || condition.operator === "within_next") && parseRelativeDays(condition.value) === null) return "Choose a relative date range.";
  return undefined;
}

export function filterOperatorsForField(field: Pick<FieldSchema, "type">): FilterOperator[] {
  const common: FilterOperator[] = ["is", "is_not", "is_empty", "is_not_empty"];
  if (field.type === "checkbox") return ["checked", "unchecked"];
  if (field.type === "number" || field.type === "formula" || field.type === "rollup") return ["is", "is_not", "gt", "lt", "is_empty", "is_not_empty"];
  if (field.type === "date" || field.type === "created_time" || field.type === "updated_time") return ["is", "is_not", "gt", "lt", "within_past", "within_next", "is_empty", "is_not_empty"];
  if (field.type === "multi_select" || field.type === "entity_ref") return ["contains", "not_contains", "is_empty", "is_not_empty"];
  if (field.type === "text" || field.type === "url") return ["contains", "not_contains", ...common];
  return common;
}

export function defaultFilterOperator(field: Pick<FieldSchema, "type">): FilterOperator {
  return filterOperatorsForField(field)[0];
}

export function flattenSimpleAndFilters(expression: FilterExpression): ViewFilter[] {
  if (expression.conjunction !== "and" || expression.children.some((child) => child.kind !== "condition")) return [];
  return expression.children.map((child) => {
    if (child.kind !== "condition") throw new Error("Expected a flat filter condition.");
    return { fieldId: child.fieldId, operator: child.operator, value: child.value };
  });
}

export function filterExpressionUsesField(expression: FilterExpression | undefined, fieldId: string): boolean {
  if (!expression) return false;
  return expression.children.some((child) => child.kind === "condition" ? child.fieldId === fieldId : filterExpressionUsesField(child, fieldId));
}

function normalizeGroup(group: FilterGroup, depth: number, fieldIds: Set<string> | undefined, fallbackId: string): FilterGroup {
  const children: Array<FilterGroup | FilterCondition> = [];
  for (const [index, child] of (Array.isArray(group.children) ? group.children : []).entries()) {
    if (child?.kind === "condition") {
      if (!child.fieldId || (fieldIds && !fieldIds.has(child.fieldId))) continue;
      const validOperator = ALL_OPERATORS.has(child.operator);
      children.push({
        version: 1,
        kind: "condition",
        id: child.id || `${fallbackId}-condition-${index + 1}`,
        fieldId: child.fieldId,
        operator: validOperator ? child.operator : "is",
        value: validOperator ? child.value ?? "" : ""
      });
    } else if (child?.kind === "group" && depth < MAX_FILTER_DEPTH) {
      children.push(normalizeGroup(child, depth + 1, fieldIds, `${fallbackId}-group-${index + 1}`));
    }
  }
  return {
    version: 1,
    kind: "group",
    id: group.id || fallbackId,
    conjunction: group.conjunction === "or" ? "or" : "and",
    children
  };
}

function splitMembershipValue(value: RecordValue): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // CSV-style multi-select values are handled below.
  }
  return raw.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function parseRelativeDays(value: RecordValue): number | null {
  const match = String(value ?? "").match(/^(\d+)(?:_days?)?$/);
  return match ? Number(match[1]) : null;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isValuelessOperator(operator: FilterOperator): boolean {
  return operator === "checked" || operator === "unchecked" || operator === "is_empty" || operator === "is_not_empty";
}
