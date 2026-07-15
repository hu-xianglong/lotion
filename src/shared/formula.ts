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
  onVariable?: (name: string, sheetName?: string) => CellReference | RangeReference;
  onCell?: (ref: CellReference) => unknown;
  onRange?: (ref: RangeReference) => unknown[][];
}) => FormulaParserInstance;

const Parser = FormulaParser as unknown as FormulaParserConstructor;
const SHEET_NAME = "Lotion";

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
