// Backend bench for the view-query pipeline.
//
// Mirrors src/renderer/lib/view-query.ts and src/renderer/lib/formula.ts so
// the numbers reflect what the renderer actually does. Run with:
//
//     node scripts/bench-view-query.mjs
//     node scripts/bench-view-query.mjs --check --current-only db_rows_stress db_rows_2k db_rows_20k
//     node scripts/bench-view-query.mjs --backfill-formulas db_rows_20k
//
// Prints per-stage timings (formula compute / filter / sort) for every view of
// each chosen database, repeated to smooth over JIT warmup.

import { readFile, readdir } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyFormulasToRecords } from "./lib/formula.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const spaceRoot = join(repoRoot, "samples", "demo-space");

const DEFAULT_RUNS_PER_VIEW = 3;
// Defaults exclude db_rows_500k because a full sweep of its 13 views would
// take several minutes. Pass it explicitly when you want those numbers:
//   node scripts/bench-view-query.mjs db_rows_500k
const DEFAULT_DATABASES = ["db_rows_stress", "db_rows_2k", "db_rows_20k", "db_rows_100k"];
const CHECK_DATABASES = ["db_rows_stress", "db_rows_2k", "db_rows_20k"];
const DEFAULT_THRESHOLDS = {
  db_rows_stress: { loadMs: 250, viewMs: 10 },
  db_rows_2k: { loadMs: 750, viewMs: 25 },
  db_rows_20k: { loadMs: 2500, viewMs: 120 },
  db_rows_100k: { loadMs: 8000, viewMs: 700 }
};

function parseArgs(argv) {
  const databases = [];
  const options = {
    check: false,
    currentOnly: false,
    backfillFormulas: false,
    runs: DEFAULT_RUNS_PER_VIEW
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--current-only") {
      options.currentOnly = true;
    } else if (arg === "--backfill-formulas") {
      options.backfillFormulas = true;
    } else if (arg === "--runs") {
      const raw = argv[index + 1];
      index += 1;
      const runs = Number(raw);
      if (!Number.isFinite(runs) || runs <= 0) throw new Error(`Invalid --runs value: ${raw}`);
      options.runs = Math.floor(runs);
    } else if (arg.startsWith("--runs=")) {
      const raw = arg.slice("--runs=".length);
      const runs = Number(raw);
      if (!Number.isFinite(runs) || runs <= 0) throw new Error(`Invalid --runs value: ${raw}`);
      options.runs = Math.floor(runs);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      databases.push(arg);
    }
  }

  return {
    ...options,
    databases: databases.length > 0 ? databases : options.check ? CHECK_DATABASES : DEFAULT_DATABASES
  };
}

const ARGS = parseArgs(process.argv.slice(2));

// ── helpers (ported from production source) ────────────────────────────────

function parseCell(value) {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseCsv(content) {
  if (!content) return [];
  if (!content.includes("\"")) return parseSimpleCsv(content);

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

function parseSimpleCsv(content) {
  return content.split("\n").map((line) => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    return normalized.split(",");
  });
}

function readCsv(content) {
  const rows = parseCsv(content.trim());
  if (rows.length === 0) return [];
  const [headers, ...records] = rows;
  return records.map((row) => {
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = parseCell(row[i] ?? "");
    }
    return record;
  });
}

function matchesFilter(value, operator, expected) {
  if (!expected && operator !== "checked") return true;
  if (operator === "is") return String(value) === String(expected);
  if (operator === "is_not") return String(value) !== String(expected);
  if (operator === "contains") return String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "gt") return Number(value) > Number(expected);
  if (operator === "lt") return Number(value) < Number(expected);
  if (operator === "checked") return value === true;
  return true;
}

// Per-call collator construction — matches the un-optimized "OLD" pipeline.
function compareValues(a, b, direction) {
  const modifier = direction === "asc" ? 1 : -1;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true }) * modifier;
}

// Module-scope collator — what the renderer now uses. Allocated once and
// reused across every comparison, which is the whole point of the hoist.
const collator = new Intl.Collator(undefined, { numeric: true });
function compareValuesHoisted(a, b, direction) {
  const modifier = direction === "asc" ? 1 : -1;
  return collator.compare(String(a ?? ""), String(b ?? "")) * modifier;
}

// Two pipelines so we can show the win from persisting formulas:
//   - new: read path the renderer now uses (no formula recompute).
//   - old: previous behavior (formula recompute on every view switch).
function runPipelineNew(bundle, view) {
  const t0 = performance.now();
  let records = bundle.records;

  for (const filter of view.filters) {
    records = records.filter((record) => matchesFilter(record[filter.fieldId], filter.operator, filter.value));
  }
  const t1 = performance.now();

  if (view.sorts.length > 0) {
    if (records === bundle.records) records = [...records];
    for (const sort of [...view.sorts].reverse()) {
      records.sort((a, b) => compareValuesHoisted(a[sort.fieldId], b[sort.fieldId], sort.direction));
    }
  }
  const t2 = performance.now();

  return { rowsOut: records.length, formulaMs: 0, filterMs: t1 - t0, sortMs: t2 - t1, totalMs: t2 - t0 };
}

function runPipelineOld(bundle, view) {
  const t0 = performance.now();
  let records = applyFormulasToRecords(bundle.records, bundle.schema.fields);
  const t1 = performance.now();

  for (const filter of view.filters) {
    records = records.filter((record) => matchesFilter(record[filter.fieldId], filter.operator, filter.value));
  }
  const t2 = performance.now();

  for (const sort of [...view.sorts].reverse()) {
    records = records.sort((a, b) => compareValues(a[sort.fieldId], b[sort.fieldId], sort.direction));
  }
  const t3 = performance.now();

  return { rowsOut: records.length, formulaMs: t1 - t0, filterMs: t2 - t1, sortMs: t3 - t2, totalMs: t3 - t0 };
}

// ── load + bench ───────────────────────────────────────────────────────────

async function loadBundle(databaseId, options) {
  const t0 = performance.now();
  const dir = databasePath(databaseId);
  const schema = JSON.parse(await readFile(join(dir, "schema.json"), "utf8"));
  const csvRecords = readCsv(await readFile(join(dir, "data.csv"), "utf8"));
  // Keep the latency gate focused on the current production read path: values
  // are read from disk, not recomputed on load. `--backfill-formulas` is only a
  // manual diagnostic mode for old fixture data with empty formula columns.
  const records = options.backfillFormulas ? applyFormulasToRecords(csvRecords, schema.fields) : csvRecords;
  const viewFiles = (await readdir(join(dir, "views"))).filter((file) => file.endsWith(".json"));
  const views = [];
  for (const file of viewFiles) {
    views.push(JSON.parse(await readFile(join(dir, "views", file), "utf8")));
  }
  views.sort((a, b) => (a.id === schema.defaultViewId ? -1 : b.id === schema.defaultViewId ? 1 : a.id.localeCompare(b.id)));
  const loadMs = performance.now() - t0;
  return { schema, records, views, loadMs };
}

function databasePath(id) {
  const base = join(spaceRoot, "databases", "user");
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === id || entry.name.endsWith(`--${id}`)) return join(base, entry.name);
    }
  }
  return join(base, id);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(ms) {
  return `${ms.toFixed(1).padStart(7)}ms`;
}

function pad(text, width) {
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length);
}

async function main() {
  const failures = [];
  console.log(
    `Bench (Node ${process.versions.node})  ·  ${ARGS.runs} runs per view, reporting median` +
      `${ARGS.check ? " · latency gate" : ""}${ARGS.currentOnly ? " · current path only" : ""}\n`
  );

  for (const databaseId of ARGS.databases) {
    let bundle;
    try {
      bundle = await loadBundle(databaseId, ARGS);
    } catch (error) {
      console.warn(`Skipping ${databaseId}: ${error.message}`);
      continue;
    }

    const totalSize = bundle.records.length;
    const thresholds = DEFAULT_THRESHOLDS[databaseId] ?? { loadMs: 5000, viewMs: 250 };
    console.log(
      `== ${databaseId} · ${totalSize.toLocaleString()} rows · ${bundle.views.length} views · load=${bundle.loadMs.toFixed(1)}ms ==`
    );
    if (ARGS.check && bundle.loadMs > thresholds.loadMs) {
      failures.push(`${databaseId} load ${bundle.loadMs.toFixed(1)}ms > ${thresholds.loadMs}ms`);
    }
    if (ARGS.currentOnly) {
      console.log(pad("view", 28) + pad("rows out", 12) + pad("NEW total", 14) + "  (filter + sort)");
    } else {
      console.log(
        pad("view", 28) + pad("rows out", 12) +
        pad("OLD total", 14) + pad("NEW total", 14) + pad("Δ", 10) + "  (NEW: filter + sort)"
      );
    }

    for (const view of bundle.views) {
      const oldRuns = [];
      const newRuns = [];
      for (let i = 0; i < ARGS.runs; i += 1) {
        if (!ARGS.currentOnly) oldRuns.push(runPipelineOld(bundle, view));
        newRuns.push(runPipelineNew(bundle, view));
      }

      const newTotal = median(newRuns.map((run) => run.totalMs));
      const newFilter = median(newRuns.map((run) => run.filterMs));
      const newSort = median(newRuns.map((run) => run.sortMs));
      const rowsOut = newRuns[0].rowsOut;
      if (ARGS.check && newTotal > thresholds.viewMs) {
        failures.push(`${databaseId}/${view.id} view ${newTotal.toFixed(1)}ms > ${thresholds.viewMs}ms`);
      }

      if (ARGS.currentOnly) {
        console.log(
          pad(view.id, 28) +
          pad(rowsOut.toLocaleString(), 12) +
          fmt(newTotal) +
          `  filter=${newFilter.toFixed(1)}ms sort=${newSort.toFixed(1)}ms`
        );
      } else {
        const oldTotal = median(oldRuns.map((run) => run.totalMs));
        const delta = (newTotal - oldTotal).toFixed(1);
        console.log(
          pad(view.id, 28) +
          pad(rowsOut.toLocaleString(), 12) +
          fmt(oldTotal) + "    " +
          fmt(newTotal) + "    " +
          pad(`${delta}ms`, 10) +
          `  filter=${newFilter.toFixed(1)}ms sort=${newSort.toFixed(1)}ms`
        );
      }
    }
    console.log();
  }

  if (failures.length > 0) {
    console.error("Latency gate failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else if (ARGS.check) {
    console.log("Latency gate passed.");
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
