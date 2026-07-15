#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { fileService } from "../dist-electron/main/services/file-service.js";
import { readCsvFile } from "../dist-electron/main/storage/csv-file.js";

const args = parseArgs(process.argv.slice(2));
const medianThresholdMs = Number(process.env.LOTION_CSV_READ_MEDIAN_THRESHOLD_MS ?? 150);
const maxThresholdMs = Number(process.env.LOTION_CSV_READ_MAX_THRESHOLD_MS ?? 350);

const FIELD_IDS = [
  "id",
  "created_time",
  "updated_time",
  "title",
  "status",
  "category",
  "score",
  "notes"
];

const root = await mkdtemp(join(tmpdir(), "lotion-csv-read-bench-"));
try {
  const csvPath = join(root, "data.csv");
  const csv = buildCsv(args.rows);
  await writeFile(csvPath, csv, "utf8");

  const runs = [];
  for (let index = 0; index < args.iterations; index += 1) {
    fileService.clearCache();
    const started = performance.now();
    const records = await readCsvFile(csvPath);
    const elapsed = Number((performance.now() - started).toFixed(3));
    assert.equal(records.length, args.rows);
    assert.equal(records[0]?.title, "Row 0");
    assert.equal(records.at(-1)?.score, args.rows - 1);
    runs.push(elapsed);
  }

  const summary = {
    rows: args.rows,
    fields: FIELD_IDS.length,
    bytes: Buffer.byteLength(csv, "utf8"),
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
      throw new Error(`CSV read median ${summary.medianMs}ms exceeds ${medianThresholdMs}ms`);
    }
    if (summary.maxMs > maxThresholdMs) {
      throw new Error(`CSV read max ${summary.maxMs}ms exceeds ${maxThresholdMs}ms`);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function buildCsv(rows) {
  const lines = [FIELD_IDS.join(",")];
  const created = "2026-01-01T00:00:00.000Z";
  for (let index = 0; index < rows; index += 1) {
    lines.push([
      `row_${index}`,
      created,
      created,
      `Row ${index}`,
      index % 2 === 0 ? "Todo" : "Done",
      `Category ${index % 10}`,
      String(index),
      `Plain note ${index} without quotes or commas`
    ].join(","));
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    rows: 50_000,
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
