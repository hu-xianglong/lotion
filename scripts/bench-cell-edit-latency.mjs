#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { DEFAULT_VIEW_ID } from "../dist-electron/shared/constants.js";
import { databaseFolderName } from "../dist-electron/shared/workspace-paths.js";
import { DatabaseService } from "../dist-electron/main/services/database-service.js";
import { WorkspacePaths } from "../dist-electron/main/storage/paths.js";
import { fileService } from "../dist-electron/main/services/file-service.js";

const args = parseArgs(process.argv.slice(2));
const medianThresholdMs = Number(process.env.LOTION_CELL_EDIT_MEDIAN_THRESHOLD_MS ?? 250);
const maxThresholdMs = Number(process.env.LOTION_CELL_EDIT_MAX_THRESHOLD_MS ?? 500);
const root = await mkdtemp(join(tmpdir(), "lotion-cell-edit-bench-"));

try {
  const fixture = await createCellEditFixture(root, args.rows);
  const paths = new WorkspacePaths(root);
  const databases = new DatabaseService({ requirePaths: () => paths });

  await databases.get(fixture.databaseId);
  const runs = [];
  for (let index = 0; index < args.iterations; index += 1) {
    fileService.clearCache();
    const started = performance.now();
    const bundle = await databases.updateCell({
      databaseId: fixture.databaseId,
      rowId: fixture.targetRowId,
      fieldId: "notes",
      value: `Edited value ${index}`
    });
    const elapsed = Number((performance.now() - started).toFixed(3));
    runs.push(elapsed);
    const target = bundle.records.find((record) => record.id === fixture.targetRowId);
    assert.equal(target?.notes, `Edited value ${index}`);
  }

  const summary = {
    rows: args.rows,
    iterations: args.iterations,
    medianThresholdMs: args.check ? medianThresholdMs : undefined,
    maxThresholdMs: args.check ? maxThresholdMs : undefined,
    medianMs: median(runs),
    maxMs: Number(Math.max(...runs).toFixed(3)),
    runs
  };
  console.log(JSON.stringify(summary, null, 2));

  if (args.check) {
    if (summary.medianMs > medianThresholdMs) {
      throw new Error(`Cell edit median ${summary.medianMs}ms exceeds ${medianThresholdMs}ms`);
    }
    if (summary.maxMs > maxThresholdMs) {
      throw new Error(`Cell edit max ${summary.maxMs}ms exceeds ${maxThresholdMs}ms`);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

async function createCellEditFixture(root, rows) {
  const now = "2026-01-01T00:00:00.000Z";
  const databaseId = "db_cell_edit_bench";
  const databaseName = "Cell Edit Bench";
  const folder = databaseFolderName(databaseId, databaseName);
  const dir = join(root, "databases", "user", folder);
  await mkdir(join(dir, "views"), { recursive: true });
  await mkdir(join(dir, "pages"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_cell_edit_bench",
    name: "Cell Edit Bench",
    pages: [],
    databases: [databaseId],
    systemDatabases: []
  });
  await writeJson(join(dir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" },
      { id: "status", name: "Status", type: "select", options: [
        { id: "todo", name: "Todo", color: "gray" },
        { id: "done", name: "Done", color: "green" }
      ] },
      { id: "score", name: "Score", type: "number" }
    ]
  });
  await writeJson(join(dir, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: ["title", "notes", "status", "score"],
    fieldOrder: ["title", "notes", "status", "score"],
    wrapFieldIds: ["title", "notes"],
    sorts: [],
    filters: []
  });

  const records = Array.from({ length: rows }, (_unused, index) => ({
    id: `row_${index}`,
    created_time: now,
    updated_time: now,
    title: `Row ${index}`,
    page_file: "",
    notes: `Initial note ${index}`,
    status: index % 2 === 0 ? "Todo" : "Done",
    score: index % 100
  }));
  await writeCsv(
    join(dir, "data.csv"),
    ["id", "created_time", "updated_time", "title", "page_file", "notes", "status", "score"],
    records
  );

  return {
    databaseId,
    targetRowId: `row_${Math.floor(rows / 2)}`
  };
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    rows: 20_000,
    iterations: 5
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--check") {
      parsed.check = true;
    } else if (arg === "--rows") {
      parsed.rows = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--rows=")) {
      parsed.rows = numberArg("--rows", arg.slice("--rows=".length));
    } else if (arg === "--iterations") {
      parsed.iterations = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--iterations=")) {
      parsed.iterations = numberArg("--iterations", arg.slice("--iterations=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.rows < 1 || parsed.iterations < 1) {
    throw new Error(`Invalid benchmark options: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCsv(path, fields, records) {
  const lines = [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field] ?? "")).join(","))
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
