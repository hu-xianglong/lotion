import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { applyFormulasToRecords, evaluateFormula, formulaColumnLabel } from "../dist-electron/shared/formula.js";

assert.equal(formulaColumnLabel(0), "A");
assert.equal(formulaColumnLabel(25), "Z");
assert.equal(formulaColumnLabel(26), "AA");
assert.equal(formulaColumnLabel(701), "ZZ");
assert.equal(formulaColumnLabel(702), "AAA");
assert.equal(formulaColumnLabel(-1), "");

const fields = [
  { id: "title", name: "Title", type: "text" },
  { id: "base", name: "Base", type: "number" },
  { id: "multiplier", name: "Multiplier", type: "number" },
  { id: "status", name: "Status", type: "select" },
  { id: "done", name: "Done", type: "checkbox" },
  { id: "score", name: "Score", type: "formula", formula: "=base * multiplier + 2" },
  { id: "label", name: "Label", type: "formula", formula: "=IF(status=\"Blocked\", \"Needs help\", IF(score > 20, \"Large\", \"Small\"))" },
  { id: "average", name: "Average", type: "formula", formula: "=ROUND(AVERAGE(base, multiplier), 2)" },
  { id: "summary", name: "Summary", type: "formula", formula: "=CONCATENATE(title, \" / \", status)" },
  { id: "ready", name: "Ready", type: "formula", formula: "=AND(done=FALSE, base > 1)" },
  { id: "range_total", name: "Range total", type: "formula", formula: "=SUM(B1:C3)" }
];

const rows = [
  { title: "Small active", base: 2, multiplier: 3, status: "Active", done: false },
  { title: "Large active", base: 8, multiplier: 4, status: "Active", done: false },
  { title: "Blocked", base: 1, multiplier: 9, status: "Blocked", done: true }
];

const computed = applyFormulasToRecords(rows, fields);
assert.equal(computed[0].score, 8);
assert.equal(computed[1].score, 34);
assert.equal(computed[2].label, "Needs help");
assert.equal(computed[1].label, "Large");
assert.equal(computed[0].average, 2.5);
assert.equal(computed[0].summary, "Small active / Active");
assert.equal(computed[0].ready, true);
assert.equal(computed[2].ready, false);
assert.equal(computed[0].range_total, 27);
assert.equal(computed[1].range_total, 27);

assert.equal(
  evaluateFormula(
    { id: "lookup", name: "Lookup", type: "formula", formula: "=VLOOKUP(\"Blocked\",D1:E3,2,FALSE)" },
    rows[0],
    fields,
    rows,
    0
  ),
  true
);

const lookupFields = [
  { id: "sku", name: "SKU", type: "text" },
  { id: "unit_price", name: "Unit price", type: "number" },
  { id: "quantity", name: "Quantity", type: "number" },
  { id: "line_total", name: "Line total", type: "formula" }
];
const lookupRows = [
  { sku: "DESK-01", unit_price: 699, quantity: 0 },
  { sku: "CHAIR-02", unit_price: 249, quantity: 0 },
  { sku: "CHAIR-02", unit_price: "", quantity: 6 }
];
assert.equal(
  evaluateFormula(
    { ...lookupFields[3], formula: '=LOOKUP(FIELD("sku"),"sku","unit_price",1,2)*quantity' },
    lookupRows[2],
    lookupFields,
    lookupRows,
    2
  ),
  1494
);
assert.equal(
  evaluateFormula(
    { ...lookupFields[3], formula: '=SUM(VALUES("unit_price",1,2))' },
    lookupRows[0],
    lookupFields,
    lookupRows,
    0
  ),
  948
);
assert.equal(
  evaluateFormula(
    { ...lookupFields[3], formula: '=FIELD("sku")' },
    lookupRows[0],
    lookupFields,
    lookupRows,
    0
  ),
  "DESK-01"
);

assert.equal(
  evaluateFormula(
    { id: "legacy", name: "Legacy", type: "formula", formula: "CASE WHEN status = 'Blocked' THEN 'Needs help' ELSE 'OK' END" },
    rows[2],
    fields,
    rows,
    2
  ),
  "Needs help"
);

assert.equal(
  evaluateFormula({ id: "imported", name: "Imported", type: "formula" }, { imported: "precomputed" }),
  "precomputed"
);

assert.equal(
  evaluateFormula({ id: "bad", name: "Bad", type: "formula", formula: "=NOT_A_FUNCTION(1)" }, rows[0], fields, rows, 0),
  "#ERROR!"
);

await assertDemoFormulaCsv("db_formula_lab", { minRows: 8, minFormulaFields: 6 });
await assertDemoFormulaCsv("db_quote_builder", { minRows: 6, minFormulaFields: 1 });
await assertDemoFormulaCsv("db_tasks", { minRows: 4, minFormulaFields: 1 });
await assertDemoFormulaCsv("db_reading", { minRows: 3, minFormulaFields: 1 });
await assertDemoFormulaCsv("db_views_stress", { minRows: 30, minFormulaFields: 1 });
await assertDemoFormulaCsv("db_rows_stress", { minRows: 100, minFormulaFields: 1 });
console.log("Formula engine regression tests passed.");

async function assertDemoFormulaCsv(databaseId, { minRows, minFormulaFields }) {
  const root = databasePath(databaseId);
  const schema = JSON.parse(await readFile(join(root, "schema.json"), "utf8"));
  const records = readCsv(await readFile(join(root, "data.csv"), "utf8"));
  const expected = applyFormulasToRecords(records, schema.fields);
  const formulaFields = schema.fields.filter((field) => field.type === "formula");
  assert.ok(records.length >= minRows, `${databaseId} should include enough rows for formula coverage.`);
  assert.ok(formulaFields.length >= minFormulaFields, `${databaseId} should include formula fields.`);
  for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
    for (const field of formulaFields) {
      assert.equal(
        String(records[rowIndex][field.id] ?? ""),
        String(expected[rowIndex][field.id] ?? ""),
        `${databaseId} CSV mismatch at row ${rowIndex + 1}, field ${field.id}`
      );
    }
  }
}

function databasePath(id) {
  const base = join(process.cwd(), "samples", "demo-space", "databases", "user");
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === id || entry.name.endsWith(`--${id}`)) return join(base, entry.name);
    }
  }
  return join(base, id);
}

function readCsv(content) {
  const rows = parseCsv(content.trim());
  if (rows.length === 0) return [];
  const [headers, ...records] = rows;
  return records.map((row) => {
    const record = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = parseCell(row[index] ?? "");
    }
    return record;
  });
}

function parseCell(value) {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseCsv(content) {
  if (!content) return [];
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
