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
  const formula = normalizeFormulaExpression(field.formula);
  // No expression means this is likely an imported formula column with
  // precomputed values. Keep those values instead of blanking the CSV.
  if (!formula) return record[field.id] ?? "";

  try {
    const fieldLookup = buildFieldLookup(fields);
    const parser = new Parser({
      functions: {
        FIELD: (name) => readFormulaField(name, record, fields),
        VALUES: (name, fromRow, toRow) => readFormulaValues(name, fields, records, fromRow, toRow),
        LOOKUP: (needle, lookupField, resultField, fromRow, toRow) =>
          lookupFormulaValue(needle, lookupField, resultField, fields, records, fromRow, toRow)
      },
      onVariable: (name) => {
        const col = fieldLookup.get(normalizeFormulaName(name));
        if (!col) throw new Error(`Unknown formula variable: ${name}`);
        return { row: rowIndex + 1, col, sheet: SHEET_NAME };
      },
      onCell: (ref) => readFormulaCell(ref, fields, records),
      onRange: (ref) => readFormulaRange(ref, fields, records)
    });
    const col = Math.max(1, fields.findIndex((item) => item.id === field.id) + 1);
    const result = parser.parse(formula, { row: rowIndex + 1, col, sheet: SHEET_NAME }, true);
    return normalizeFormulaResult(result);
  } catch (error) {
    return normalizeFormulaError(error);
  }
}

export function applyFormulasToRecords(records: DatabaseRecord[], fields: FieldSchema[]): DatabaseRecord[] {
  const formulaFields = fields.filter((field) => field.type === "formula");
  if (formulaFields.length === 0) return records;
  const computed = records.map((record) => ({ ...record }));
  computed.forEach((record, rowIndex) => {
    for (const field of formulaFields) {
      record[field.id] = evaluateFormula(field, record, fields, computed, rowIndex);
    }
  });
  return computed;
}

function normalizeFormulaExpression(formula: string | undefined): string {
  const trimmed = formula?.trim() ?? "";
  const expression = trimmed.startsWith("=") ? trimmed.slice(1).trim() : trimmed;
  return convertLegacyCaseFormula(expression) ?? expression;
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
