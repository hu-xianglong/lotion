import FormulaParser from "fast-formula-parser";
import type { DatabaseRecord, FieldSchema, RecordValue } from "./types.js";

interface FormulaPosition {
  row: number;
  col: number;
  sheet: string;
}

interface CellReference {
  row: number;
  col: number;
  sheet?: string;
}

interface RangeReference {
  from: CellReference;
  to: CellReference;
  sheet?: string;
}

interface FormulaErrorLike {
  _error?: string;
  message?: string;
}

interface FormulaParserInstance {
  parse(formula: string, position: FormulaPosition, allowArray?: boolean): unknown;
}

type FormulaParserConstructor = new (options?: {
  functions?: Record<string, (...args: unknown[]) => unknown>;
  onVariable?: (name: string, sheetName?: string) => CellReference | RangeReference;
  onCell?: (ref: CellReference) => unknown;
  onRange?: (ref: RangeReference) => unknown[][];
}) => FormulaParserInstance;

const Parser = FormulaParser as unknown as FormulaParserConstructor;
const SHEET_NAME = "Lotion";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEL_UNIX_EPOCH_SERIAL = 25569;
const formulaDateIndexCache = new WeakMap<DatabaseRecord[], Map<string, DatedFormulaRecord[]>>();
const structuredFormulaColumnCache = new WeakMap<DatabaseRecord[], Map<string, unknown[]>>();
const structuredFormulaColumnMetadata = new WeakMap<unknown[], StructuredFormulaColumnMetadata>();

interface DatedFormulaRecord {
  item: DatabaseRecord;
  day: number;
}

interface StructuredFormulaColumnMetadata {
  field: FieldSchema;
  records: DatabaseRecord[];
}

export function formulaColumnLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0) return "";
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function evaluateFormula(
  field: FieldSchema,
  record: DatabaseRecord,
  fields: FieldSchema[] = [],
  records: DatabaseRecord[] = [record],
  rowIndex = 0
): RecordValue {
  return createFormulaEvaluator(field, fields, records)(record, rowIndex);
}

function createFormulaEvaluator(
  field: FieldSchema,
  fields: FieldSchema[],
  records: DatabaseRecord[]
): (record: DatabaseRecord, rowIndex: number) => RecordValue {
  const formula = normalizeFormulaExpression(field.formula);
  // No expression means this is likely an imported formula column with
  // precomputed values. Keep those values instead of blanking the CSV.
  if (!formula) return (record) => record[field.id] ?? "";

  const fieldLookup = buildFieldLookup(fields);
  let activeRecord: DatabaseRecord = records[0] ?? {};
  let activeRowIndex = 0;
  const parser = new Parser({
    functions: {
      FIELD: (name) => readFormulaField(name, activeRecord, fields),
      VALUES: (name, fromRow, toRow) => readFormulaValues(name, fields, records, fromRow, toRow),
      LOTION_CURRENT: (name) => readStructuredFormulaCurrent(name, activeRecord, fields),
      LOTION_COLUMN: (name) => readStructuredFormulaColumn(name, fields, records),
      AVERAGEIFS: (...args) => averageIfsFormulaValue(...args),
      MOVING_AVERAGE: (name, windowSize, decimals) =>
        movingAverageFormulaValue(name, fields, records, activeRowIndex, windowSize, decimals),
      AVERAGE_LAST_DAYS: (name, dateField, days, decimals) =>
        averageLastDaysFormulaValue(name, dateField, fields, records, activeRecord, days, decimals),
      LOOKUP: (needle, lookupField, resultField, fromRow, toRow) =>
        lookupFormulaValue(needle, lookupField, resultField, fields, records, fromRow, toRow)
    },
    onVariable: (name) => {
      const col = fieldLookup.get(normalizeFormulaName(name));
      if (!col) throw new Error(`Unknown formula variable: ${name}`);
      return { row: activeRowIndex + 1, col, sheet: SHEET_NAME };
    },
    onCell: (ref) => readFormulaCell(ref, fields, records),
    onRange: (ref) => readFormulaRange(ref, fields, records)
  });
  const col = Math.max(1, fields.findIndex((item) => item.id === field.id) + 1);

  return (record, rowIndex) => {
    activeRecord = record;
    activeRowIndex = rowIndex;
    try {
      const result = parser.parse(formula, { row: rowIndex + 1, col, sheet: SHEET_NAME }, true);
      return normalizeFormulaResult(result);
    } catch (error) {
      return normalizeFormulaError(error);
    }
  };
}

export function applyFormulasToRecords(records: DatabaseRecord[], fields: FieldSchema[]): DatabaseRecord[] {
  const formulaFields = fields.filter((field) => field.type === "formula");
  if (formulaFields.length === 0) return records;
  const computed = records.map((record) => ({ ...record }));
  const evaluators = formulaFields.map((field) => ({
    field,
    evaluate: createFormulaEvaluator(field, fields, computed)
  }));
  computed.forEach((record, rowIndex) => {
    for (const evaluator of evaluators) {
      record[evaluator.field.id] = evaluator.evaluate(record, rowIndex);
    }
  });
  return computed;
}

function normalizeFormulaExpression(formula: string | undefined): string {
  const trimmed = formula?.trim() ?? "";
  const expression = trimmed.startsWith("=") ? trimmed.slice(1).trim() : trimmed;
  return expandStructuredFormulaReferences(convertLegacyCaseFormula(expression) ?? expression);
}

function expandStructuredFormulaReferences(formula: string): string {
  let result = "";
  let inString = false;
  for (let index = 0; index < formula.length;) {
    const char = formula[index];
    if (char === '"') {
      result += char;
      if (inString && formula[index + 1] === '"') {
        result += '"';
        index += 2;
        continue;
      }
      inString = !inString;
      index += 1;
      continue;
    }
    if (!inString && char === "[") {
      const end = formula.indexOf("]", index + 1);
      if (end !== -1) {
        const reference = formula.slice(index + 1, end).trim();
        const currentRow = reference.startsWith("@");
        const fieldName = (currentRow ? reference.slice(1) : reference).trim();
        if (fieldName) {
          result += `${currentRow ? "LOTION_CURRENT" : "LOTION_COLUMN"}(${JSON.stringify(fieldName)})`;
          index = end + 1;
          continue;
        }
      }
    }
    result += char;
    index += 1;
  }
  return result;
}

function buildFieldLookup(fields: FieldSchema[]): Map<string, number> {
  const lookup = new Map<string, number>();
  fields.forEach((field, index) => {
    const col = index + 1;
    for (const name of [field.id, field.name, slugFormulaName(field.name)]) {
      const normalized = normalizeFormulaName(name);
      if (normalized && !lookup.has(normalized)) lookup.set(normalized, col);
    }
  });
  return lookup;
}

function normalizeFormulaName(name: string): string {
  return name.trim().toLowerCase();
}

function slugFormulaName(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readFormulaCell(ref: CellReference, fields: FieldSchema[], records: DatabaseRecord[]): unknown {
  const row = records[ref.row - 1];
  const field = fields[ref.col - 1];
  if (!row || !field) return "";
  return row[field.id] ?? "";
}

function readFormulaField(name: unknown, record: DatabaseRecord, fields: FieldSchema[]): unknown {
  const field = resolveFormulaField(name, fields);
  return field ? record[field.id] ?? "" : "#NAME?";
}

function readStructuredFormulaCurrent(name: unknown, record: DatabaseRecord, fields: FieldSchema[]): unknown {
  const field = resolveFormulaField(name, fields);
  return field ? structuredFormulaValue(record[field.id], field) : Number.NaN;
}

function readStructuredFormulaColumn(
  name: unknown,
  fields: FieldSchema[],
  records: DatabaseRecord[]
): unknown[] {
  const field = resolveFormulaField(name, fields);
  if (!field) return [Number.NaN];
  let byField = structuredFormulaColumnCache.get(records);
  if (!byField) {
    byField = new Map();
    structuredFormulaColumnCache.set(records, byField);
  }
  const cacheKey = `${field.id}:${field.type}`;
  const cached = byField.get(cacheKey);
  if (cached) return cached;
  const column = records.map((item) => structuredFormulaValue(item[field.id], field));
  structuredFormulaColumnMetadata.set(column, { field, records });
  if (field.type !== "formula" && field.type !== "rollup") byField.set(cacheKey, column);
  return column;
}

function structuredFormulaValue(value: RecordValue | undefined, field: FieldSchema): unknown {
  if (field.type !== "date" && field.type !== "created_time" && field.type !== "updated_time") return value ?? "";
  const day = formulaCalendarDay(value);
  return day === undefined ? "" : day / MILLISECONDS_PER_DAY + EXCEL_UNIX_EPOCH_SERIAL;
}

function averageIfsFormulaValue(...args: unknown[]): unknown {
  if (args.length < 3 || (args.length - 1) % 2 !== 0) return Number.NaN;
  const optimized = optimizedDateRangeAverage(args);
  if (optimized !== undefined) return optimized;
  const averageValues = flattenFormulaArgument(args[0]);
  const criteria: Array<{ values: unknown[]; criterion: unknown }> = [];
  for (let index = 1; index < args.length; index += 2) {
    const values = flattenFormulaArgument(args[index]);
    if (values.length !== averageValues.length) return Number.NaN;
    criteria.push({ values, criterion: unwrapFormulaArgument(args[index + 1]) });
  }

  const matches: number[] = [];
  for (let index = 0; index < averageValues.length; index += 1) {
    if (!criteria.every((item) => matchesFormulaCriterion(item.values[index], item.criterion))) continue;
    const value = averageValues[index];
    if (value === "" || value === null || value === undefined || typeof value === "boolean") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) matches.push(numeric);
  }
  if (matches.length === 0) return Number.NaN;
  return matches.reduce((sum, value) => sum + value, 0) / matches.length;
}

function optimizedDateRangeAverage(args: unknown[]): number | undefined {
  if (args.length !== 5) return undefined;
  const averageColumn = unwrapFormulaArgument(args[0]);
  const firstCriteriaColumn = unwrapFormulaArgument(args[1]);
  const secondCriteriaColumn = unwrapFormulaArgument(args[3]);
  if (!Array.isArray(averageColumn) || !Array.isArray(firstCriteriaColumn) || firstCriteriaColumn !== secondCriteriaColumn) {
    return undefined;
  }
  const averageMetadata = structuredFormulaColumnMetadata.get(averageColumn);
  const dateMetadata = structuredFormulaColumnMetadata.get(firstCriteriaColumn);
  if (!averageMetadata || !dateMetadata || averageMetadata.records !== dateMetadata.records) return undefined;
  if (dateMetadata.field.type !== "date" && dateMetadata.field.type !== "created_time" && dateMetadata.field.type !== "updated_time") {
    return undefined;
  }

  const criteria = [parseNumericFormulaCriterion(args[2]), parseNumericFormulaCriterion(args[4])];
  if (criteria.some((item) => !item)) return undefined;
  const lower = criteria.find((item) => item?.operator === ">" || item?.operator === ">=");
  const upper = criteria.find((item) => item?.operator === "<" || item?.operator === "<=");
  if (!lower || !upper) return undefined;
  const lowerDay = (lower.expected - EXCEL_UNIX_EPOCH_SERIAL) * MILLISECONDS_PER_DAY;
  const upperDay = (upper.expected - EXCEL_UNIX_EPOCH_SERIAL) * MILLISECONDS_PER_DAY;
  const datedRecords = formulaDateIndex(dateMetadata.records, dateMetadata.field.id);
  const fromIndex = lower.operator === ">="
    ? lowerBoundFormulaDay(datedRecords, lowerDay)
    : upperBoundFormulaDay(datedRecords, lowerDay);
  const toIndex = upper.operator === "<"
    ? lowerBoundFormulaDay(datedRecords, upperDay)
    : upperBoundFormulaDay(datedRecords, upperDay);
  const values = datedRecords
    .slice(fromIndex, toIndex)
    .map(({ item }) => item[averageMetadata.field.id])
    .filter((value) => value !== "" && value !== null && value !== undefined && typeof value !== "boolean")
    .map(Number)
    .filter(Number.isFinite);
  if (values.length === 0) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseNumericFormulaCriterion(value: unknown): { operator: string; expected: number } | undefined {
  const raw = unwrapFormulaArgument(value);
  if (typeof raw !== "string") return undefined;
  const match = raw.match(/^(<=|>=|<|>)(.*)$/);
  if (!match) return undefined;
  const expected = Number(match[2]);
  return Number.isFinite(expected) ? { operator: match[1], expected } : undefined;
}

function flattenFormulaArgument(value: unknown): unknown[] {
  const unwrapped = unwrapFormulaArgument(value);
  if (!Array.isArray(unwrapped)) return [unwrapped];
  return unwrapped.flat(Number.POSITIVE_INFINITY);
}

function matchesFormulaCriterion(value: unknown, criterion: unknown): boolean {
  const rawCriterion = unwrapFormulaArgument(criterion);
  const parsed = typeof rawCriterion === "string"
    ? rawCriterion.match(/^(<=|>=|<>|=|<|>)(.*)$/)
    : null;
  const operator = parsed?.[1] ?? "=";
  const expected = parsed ? parsed[2] : rawCriterion;
  const expectedNumber = expected !== "" && expected !== null && expected !== undefined
    ? Number(expected)
    : Number.NaN;
  if (Number.isFinite(expectedNumber)) {
    const actualNumber = value === "" || value === null || value === undefined ? Number.NaN : Number(value);
    if (!Number.isFinite(actualNumber)) return operator === "<>";
    return compareFormulaCriterion(actualNumber, expectedNumber, operator);
  }

  const actualText = String(value ?? "").toLowerCase();
  const expectedText = String(expected ?? "").toLowerCase();
  if ((operator === "=" || operator === "<>") && /[*?]/.test(expectedText)) {
    const pattern = expectedText
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    const matches = new RegExp(`^${pattern}$`, "i").test(actualText);
    return operator === "=" ? matches : !matches;
  }
  return compareFormulaCriterion(actualText, expectedText, operator);
}

function compareFormulaCriterion(left: number | string, right: number | string, operator: string): boolean {
  switch (operator) {
    case "<": return left < right;
    case "<=": return left <= right;
    case ">": return left > right;
    case ">=": return left >= right;
    case "<>": return left !== right;
    default: return left === right;
  }
}

function readFormulaValues(
  name: unknown,
  fields: FieldSchema[],
  records: DatabaseRecord[],
  fromRow?: unknown,
  toRow?: unknown
): unknown[] {
  const field = resolveFormulaField(name, fields);
  if (!field) return ["#NAME?"];
  const [start, end] = normalizeFormulaRowBounds(records.length, fromRow, toRow);
  return records.slice(start - 1, end).map((item) => item[field.id] ?? "");
}

function lookupFormulaValue(
  needle: unknown,
  lookupFieldName: unknown,
  resultFieldName: unknown,
  fields: FieldSchema[],
  records: DatabaseRecord[],
  fromRow?: unknown,
  toRow?: unknown
): unknown {
  const lookupField = resolveFormulaField(lookupFieldName, fields);
  const resultField = resolveFormulaField(resultFieldName, fields);
  if (!lookupField || !resultField) return "#NAME?";
  const [start, end] = normalizeFormulaRowBounds(records.length, fromRow, toRow);
  const target = String(unwrapFormulaArgument(needle) ?? "");
  for (let row = start; row <= end; row += 1) {
    const record = records[row - 1];
    if (String(record?.[lookupField.id] ?? "") === target) return record?.[resultField.id] ?? "";
  }
  return "#N/A";
}

function movingAverageFormulaValue(
  fieldName: unknown,
  fields: FieldSchema[],
  records: DatabaseRecord[],
  rowIndex: number,
  windowSize: unknown,
  decimals?: unknown
): unknown {
  const field = resolveFormulaField(fieldName, fields);
  if (!field) return "#NAME?";
  const requestedWindow = Number(unwrapFormulaArgument(windowSize));
  if (!Number.isFinite(requestedWindow) || requestedWindow < 1) return "#VALUE!";
  const window = Math.floor(requestedWindow);
  if (rowIndex < window) return "";

  const values = records
    .slice(rowIndex - window, rowIndex)
    .map((item) => item[field.id])
    .filter((value) => value !== "" && value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  if (values.length !== window) return "";

  return roundFormulaNumber(values.reduce((sum, value) => sum + value, 0) / window, decimals);
}

function averageLastDaysFormulaValue(
  valueFieldName: unknown,
  dateFieldName: unknown,
  fields: FieldSchema[],
  records: DatabaseRecord[],
  record: DatabaseRecord,
  days: unknown,
  decimals?: unknown
): unknown {
  const valueField = resolveFormulaField(valueFieldName, fields);
  const dateField = resolveFormulaField(dateFieldName, fields);
  if (!valueField || !dateField) return "#NAME?";

  const requestedDays = Number(unwrapFormulaArgument(days));
  const currentDay = formulaCalendarDay(record[dateField.id]);
  if (!Number.isFinite(requestedDays) || requestedDays < 1 || currentDay === undefined) return "#VALUE!";
  const windowDays = Math.floor(requestedDays);
  const startDay = currentDay - windowDays * 24 * 60 * 60 * 1000;
  const datedRecords = formulaDateIndex(records, dateField.id);
  if (datedRecords.length === 0 || datedRecords[0].day > startDay) return "";
  const fromIndex = lowerBoundFormulaDay(datedRecords, startDay);
  const toIndex = lowerBoundFormulaDay(datedRecords, currentDay);
  const values = datedRecords
    .slice(fromIndex, toIndex)
    .map(({ item }) => item[valueField.id])
    .filter((value) => value !== "" && value !== null && value !== undefined)
    .map(Number)
    .filter(Number.isFinite);
  if (values.length === 0) return "";
  return roundFormulaNumber(values.reduce((sum, value) => sum + value, 0) / values.length, decimals);
}

function formulaDateIndex(records: DatabaseRecord[], fieldId: string): DatedFormulaRecord[] {
  let byField = formulaDateIndexCache.get(records);
  if (!byField) {
    byField = new Map();
    formulaDateIndexCache.set(records, byField);
  }
  const cached = byField.get(fieldId);
  if (cached) return cached;
  const index = records
    .map((item) => ({ item, day: formulaCalendarDay(item[fieldId]) }))
    .filter((entry): entry is DatedFormulaRecord => entry.day !== undefined)
    .sort((left, right) => left.day - right.day);
  byField.set(fieldId, index);
  return index;
}

function lowerBoundFormulaDay(records: DatedFormulaRecord[], target: number): number {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (records[middle].day < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundFormulaDay(records: DatedFormulaRecord[], target: number): number {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (records[middle].day <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function roundFormulaNumber(value: number, decimals?: unknown): unknown {
  if (decimals === undefined) return value;
  const requestedDecimals = Number(unwrapFormulaArgument(decimals));
  if (!Number.isFinite(requestedDecimals)) return "#VALUE!";
  const precision = Math.max(0, Math.min(12, Math.floor(requestedDecimals)));
  return Number(value.toFixed(precision));
}

function formulaCalendarDay(value: RecordValue | undefined): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const text = String(value);
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function resolveFormulaField(name: unknown, fields: FieldSchema[]): FieldSchema | undefined {
  const target = normalizeFormulaName(String(unwrapFormulaArgument(name) ?? ""));
  if (!target) return undefined;
  return fields.find((field) => [field.id, field.name, slugFormulaName(field.name)]
    .some((candidate) => normalizeFormulaName(candidate) === target));
}

function normalizeFormulaRowBounds(recordCount: number, fromRow?: unknown, toRow?: unknown): [number, number] {
  const requestedStart = Number(unwrapFormulaArgument(fromRow));
  const requestedEnd = Number(unwrapFormulaArgument(toRow));
  const start = Number.isFinite(requestedStart) ? Math.max(1, Math.floor(requestedStart)) : 1;
  const end = Number.isFinite(requestedEnd) ? Math.min(recordCount, Math.floor(requestedEnd)) : recordCount;
  return [Math.min(start, recordCount + 1), Math.max(0, end)];
}

function unwrapFormulaArgument(value: unknown): unknown {
  if (!value || typeof value !== "object" || !("value" in value)) return value;
  return (value as { value?: unknown }).value;
}

function readFormulaRange(ref: RangeReference, fields: FieldSchema[], records: DatabaseRecord[]): unknown[][] {
  const fromRow = Math.max(1, ref.from.row);
  const toRow = Math.min(records.length, ref.to.row);
  const fromCol = Math.max(1, ref.from.col);
  const toCol = Math.min(fields.length, ref.to.col);
  const values: unknown[][] = [];
  for (let row = fromRow; row <= toRow; row += 1) {
    const current: unknown[] = [];
    for (let col = fromCol; col <= toCol; col += 1) {
      current.push(readFormulaCell({ row, col, sheet: ref.sheet }, fields, records));
    }
    values.push(current);
  }
  return values;
}

function normalizeFormulaResult(value: unknown): RecordValue {
  const error = formulaErrorString(value);
  if (error) return error;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? value : "#NUM!";
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (value === undefined) return "";
  return String(value);
}

function normalizeFormulaError(error: unknown): RecordValue {
  return formulaErrorString(error) || "#ERROR!";
}

function formulaErrorString(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const maybe = value as FormulaErrorLike;
  if (typeof maybe._error === "string") return maybe._error;
  if (typeof maybe.message === "string" && maybe.message.startsWith("#")) return maybe.message;
  return undefined;
}

function convertLegacyCaseFormula(formula: string): string | undefined {
  if (!/^CASE\s+/i.test(formula)) return undefined;
  const whenMatches = [...formula.matchAll(/WHEN\s+(.+?)\s+THEN\s+(.+?)(?=\s+WHEN|\s+ELSE|\s+END)/gis)];
  if (whenMatches.length === 0) return undefined;
  const elseMatch = formula.match(/ELSE\s+(.+?)\s+END/is);
  let expression = elseMatch ? normalizeLegacyCaseFragment(elseMatch[1]) : "\"\"";
  for (let index = whenMatches.length - 1; index >= 0; index -= 1) {
    expression = `IF(${normalizeLegacyCaseCondition(whenMatches[index][1])},${normalizeLegacyCaseFragment(whenMatches[index][2])},${expression})`;
  }
  return expression;
}

function normalizeLegacyCaseCondition(condition: string): string {
  return normalizeLegacyCaseFragment(condition)
    .replace(/!=/g, "<>")
    .replace(/\btrue\b/g, "TRUE")
    .replace(/\bfalse\b/g, "FALSE");
}

function normalizeLegacyCaseFragment(fragment: string): string {
  return fragment.trim().replace(/'([^']*)'/g, (_match, value: string) => JSON.stringify(value));
}
