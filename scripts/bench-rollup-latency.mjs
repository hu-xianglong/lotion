// Focused latency gate for shared rollup computation.
//
// Requires compiled shared modules:
//   tsc -p tsconfig.main.json && node scripts/bench-rollup-latency.mjs --check

import assert from "node:assert/strict";
import { applyRollupsToRecords } from "../dist-electron/shared/rollup.js";

const CHECK = process.argv.includes("--check");
const RUNS = 5;
const SOURCE_ROWS = 2_000;
const TARGET_ROWS = 5_000;
const REFS_PER_ROW = 3;
const CHECK_THRESHOLD_MS = 80;

const targetSchema = {
  id: "db_rollup_target",
  name: "Rollup Target",
  created_time: "2026-01-01T00:00:00.000Z",
  updated_time: "2026-01-01T00:00:00.000Z",
  defaultViewId: "view_default",
  fields: [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "amount", name: "Amount", type: "number" },
    { id: "status", name: "Status", type: "select" }
  ]
};

const sourceSchema = {
  id: "db_rollup_source",
  name: "Rollup Source",
  created_time: "2026-01-01T00:00:00.000Z",
  updated_time: "2026-01-01T00:00:00.000Z",
  defaultViewId: "view_default",
  fields: [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "target", name: "Target", type: "entity_ref", relation: { targetDatabaseId: targetSchema.id, multiple: true } },
    { id: "target_total", name: "Target total", type: "rollup", rollup: { relationFieldId: "target", targetFieldId: "amount", aggregation: "sum" } },
    { id: "target_count", name: "Target count", type: "rollup", rollup: { relationFieldId: "target", aggregation: "count" } },
    { id: "target_statuses", name: "Statuses", type: "rollup", rollup: { relationFieldId: "target", targetFieldId: "status", aggregation: "count_values" } }
  ]
};

const targetRecords = Array.from({ length: TARGET_ROWS }, (_, index) => ({
  id: `target_${index}`,
  title: `Target ${index}`,
  amount: (index % 17) + 1,
  status: index % 2 === 0 ? "Open" : "Closed"
}));

const sourceRecords = Array.from({ length: SOURCE_ROWS }, (_, index) => ({
  id: `source_${index}`,
  title: `Source ${index}`,
  target: JSON.stringify(Array.from({ length: REFS_PER_ROW }, (_unused, offset) => {
    const targetIndex = (index * 7 + offset * 11) % TARGET_ROWS;
    return {
      entityId: `target_${targetIndex}`,
      kind: "row",
      databaseId: targetSchema.id,
      rowId: `target_${targetIndex}`,
      titleSnapshot: `Target ${targetIndex}`
    };
  })),
  target_total: "",
  target_count: "",
  target_statuses: ""
}));

async function loadTarget(databaseId) {
  if (databaseId !== targetSchema.id) return null;
  return { schema: targetSchema, records: targetRecords };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const runs = [];
let last = [];
for (let index = 0; index < RUNS; index += 1) {
  const start = performance.now();
  last = await applyRollupsToRecords(sourceSchema, sourceRecords, loadTarget);
  runs.push(performance.now() - start);
}

assert.equal(last.length, SOURCE_ROWS);
assert.equal(last[0].target_count, REFS_PER_ROW);
const expectedFirstTotal = [0, 11, 22]
  .map((targetIndex) => targetRecords[targetIndex].amount)
  .reduce((sum, value) => sum + value, 0);
assert.equal(last[0].target_total, expectedFirstTotal);
assert.equal(last[0].target_statuses, REFS_PER_ROW);

const result = {
  sourceRows: SOURCE_ROWS,
  targetRows: TARGET_ROWS,
  refsPerRow: REFS_PER_ROW,
  runs: RUNS,
  medianMs: Number(median(runs).toFixed(1)),
  maxMs: Number(Math.max(...runs).toFixed(1)),
  thresholdMs: CHECK ? CHECK_THRESHOLD_MS : undefined
};

console.log(JSON.stringify(result, null, 2));

if (CHECK && result.medianMs > CHECK_THRESHOLD_MS) {
  console.error(`Rollup latency gate failed: median ${result.medianMs}ms > ${CHECK_THRESHOLD_MS}ms`);
  process.exitCode = 1;
}
