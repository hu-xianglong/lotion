import FormulaParser from "fast-formula-parser";

const SHEET_NAME = "Lotion";

export function evaluateFormula(field, record, fields = [], records = [record], rowIndex = 0) {
  const formula = normalizeFormulaExpression(field.formula);
  if (!formula) return record[field.id] ?? "";

  try {
    const fieldLookup = buildFieldLookup(fields);
    const parser = new FormulaParser({
      onVariable: (name) => {
        const col = fieldLookup.get(normalizeFormulaName(name));
        if (!col) throw new Error(`Unknown formula variable: ${name}`);
        return { row: rowIndex + 1, col, sheet: SHEET_NAME };
      },
      onCell: (ref) => readFormulaCell(ref, fields, records),
      onRange: (ref) => readFormulaRange(ref, fields, records)
    });
    const col = Math.max(1, fields.findIndex((item) => item.id === field.id) + 1);
    return normalizeFormulaResult(parser.parse(formula, { row: rowIndex + 1, col, sheet: SHEET_NAME }, true));
  } catch (error) {
    return normalizeFormulaError(error);
  }
}

export function applyFormulasToRecords(records, fields) {
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

function normalizeFormulaExpression(formula) {
  const trimmed = formula?.trim() ?? "";
  const expression = trimmed.startsWith("=") ? trimmed.slice(1).trim() : trimmed;
  return convertLegacyCaseFormula(expression) ?? expression;
}

function buildFieldLookup(fields) {
  const lookup = new Map();
  fields.forEach((field, index) => {
    const col = index + 1;
    for (const name of [field.id, field.name, slugFormulaName(field.name)]) {
      const normalized = normalizeFormulaName(name);
      if (normalized && !lookup.has(normalized)) lookup.set(normalized, col);
    }
  });
  return lookup;
}

function normalizeFormulaName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function slugFormulaName(name) {
  return String(name ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readFormulaCell(ref, fields, records) {
  const row = records[ref.row - 1];
  const field = fields[ref.col - 1];
  if (!row || !field) return "";
  return row[field.id] ?? "";
}

function readFormulaRange(ref, fields, records) {
  const fromRow = Math.max(1, ref.from.row);
  const toRow = Math.min(records.length, ref.to.row);
  const fromCol = Math.max(1, ref.from.col);
  const toCol = Math.min(fields.length, ref.to.col);
  const values = [];
  for (let row = fromRow; row <= toRow; row += 1) {
    const current = [];
    for (let col = fromCol; col <= toCol; col += 1) {
      current.push(readFormulaCell({ row, col, sheet: ref.sheet }, fields, records));
    }
    values.push(current);
  }
  return values;
}

function normalizeFormulaResult(value) {
  const error = formulaErrorString(value);
  if (error) return error;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? value : "#NUM!";
  if (typeof value === "string" || typeof value === "boolean" || value === null) return value;
  if (value === undefined) return "";
  return String(value);
}

function normalizeFormulaError(error) {
  return formulaErrorString(error) || "#ERROR!";
}

function formulaErrorString(value) {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value._error === "string") return value._error;
  if (typeof value.message === "string" && value.message.startsWith("#")) return value.message;
  return undefined;
}

function convertLegacyCaseFormula(formula) {
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

function normalizeLegacyCaseCondition(condition) {
  return normalizeLegacyCaseFragment(condition)
    .replace(/!=/g, "<>")
    .replace(/\btrue\b/g, "TRUE")
    .replace(/\bfalse\b/g, "FALSE");
}

function normalizeLegacyCaseFragment(fragment) {
  return fragment.trim().replace(/'([^']*)'/g, (_match, value) => JSON.stringify(value));
}
