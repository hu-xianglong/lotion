#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { createLotionCustomerApi } from "../dist-electron/main/customer-api.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import { fileService } from "../dist-electron/main/services/file-service.js";
import { createStartupWorkspaceFixture } from "./startup-workspace-fixture.mjs";

const args = parseArgs(process.argv.slice(2));
const openThresholdMs = Number(process.env.LOTION_STARTUP_OPEN_THRESHOLD_MS ?? 500);
const indexThresholdMs = Number(process.env.LOTION_STARTUP_INDEX_THRESHOLD_MS ?? 1200);
const firstPageThresholdMs = Number(process.env.LOTION_STARTUP_FIRST_PAGE_THRESHOLD_MS ?? 700);
const totalThresholdMs = Number(process.env.LOTION_STARTUP_TOTAL_THRESHOLD_MS ?? 2200);

const appConfigRoot = await mkdtemp(join(tmpdir(), "lotion-startup-latency-config-"));
const fixture = await createStartupWorkspaceFixture({
  name: "latency",
  pageCount: args.pages,
  databaseCount: args.databases,
  rowsPerDatabase: args.rowsPerDatabase
});

try {
  const api = createLotionCustomerApi({
    appConfig: new AppConfigService(join(appConfigRoot, "app-config.json"))
  });
  const runs = [];
  for (let index = 0; index < args.iterations; index += 1) {
    runs.push(await timeStartupCycle(api, fixture));
  }
  const summary = summarizeRuns(runs, fixture, args);
  console.log(JSON.stringify(summary, null, 2));

  if (args.check) {
    assert.equal(summary.lastCounts.pages, fixture.pageCount, "startup benchmark should see all pages");
    assert.equal(summary.lastCounts.databases, fixture.databaseCount, "startup benchmark should see all databases");
    if (summary.medians.openMs > openThresholdMs) {
      throw new Error(`Startup workspace open median ${summary.medians.openMs}ms exceeds ${openThresholdMs}ms`);
    }
    if (summary.medians.indexMs > indexThresholdMs) {
      throw new Error(`Startup index median ${summary.medians.indexMs}ms exceeds ${indexThresholdMs}ms`);
    }
    if (summary.medians.firstPageMs > firstPageThresholdMs) {
      throw new Error(`Startup first page median ${summary.medians.firstPageMs}ms exceeds ${firstPageThresholdMs}ms`);
    }
    if (summary.medians.totalMs > totalThresholdMs) {
      throw new Error(`Startup total median ${summary.medians.totalMs}ms exceeds ${totalThresholdMs}ms`);
    }
  }
} finally {
  await rm(fixture.root, { recursive: true, force: true });
  await rm(appConfigRoot, { recursive: true, force: true });
}

async function timeStartupCycle(api, fixture) {
  fileService.clearCache();
  const totalStarted = performance.now();
  const manifest = await timeAsync(() => api.workspace.open(fixture.root));
  const index = await timeAsync(async () => {
    const [pages, databases, pagesTree, favorites, recents] = await Promise.all([
      api.pages.list(),
      api.databases.list(),
      api.workspace.getPagesTree(),
      api.workspace.listFavorites(),
      api.workspace.listRecents()
    ]);
    return { pages, databases, pagesTree, favorites, recents };
  });
  const firstPage = await timeAsync(() => api.pages.get(fixture.targetPageId));
  const totalMs = Number((performance.now() - totalStarted).toFixed(3));
  return {
    openMs: manifest.ms,
    indexMs: index.ms,
    firstPageMs: firstPage.ms,
    totalMs,
    counts: {
      manifestPages: manifest.value.pages.length,
      pages: index.value.pages.length,
      databases: index.value.databases.length,
      treePages: index.value.pagesTree.topLevelPages.length,
      favorites: index.value.favorites.length,
      recents: index.value.recents.length,
      firstPageBytes: Buffer.byteLength(firstPage.value.markdown, "utf8")
    }
  };
}

async function timeAsync(fn) {
  const started = performance.now();
  const value = await fn();
  return {
    value,
    ms: Number((performance.now() - started).toFixed(3))
  };
}

function summarizeRuns(runs, fixture, args) {
  return {
    pages: fixture.pageCount,
    databases: fixture.databaseCount,
    rowsPerDatabase: fixture.rowsPerDatabase,
    iterations: args.iterations,
    thresholds: args.check ? {
      openMs: openThresholdMs,
      indexMs: indexThresholdMs,
      firstPageMs: firstPageThresholdMs,
      totalMs: totalThresholdMs
    } : undefined,
    medians: {
      openMs: median(runs.map((run) => run.openMs)),
      indexMs: median(runs.map((run) => run.indexMs)),
      firstPageMs: median(runs.map((run) => run.firstPageMs)),
      totalMs: median(runs.map((run) => run.totalMs))
    },
    max: {
      openMs: max(runs.map((run) => run.openMs)),
      indexMs: max(runs.map((run) => run.indexMs)),
      firstPageMs: max(runs.map((run) => run.firstPageMs)),
      totalMs: max(runs.map((run) => run.totalMs))
    },
    lastCounts: runs.at(-1)?.counts,
    runs
  };
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    iterations: 4,
    pages: 100,
    databases: 4,
    rowsPerDatabase: 200
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--check") {
      parsed.check = true;
    } else if (arg === "--iterations") {
      parsed.iterations = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--iterations=")) {
      parsed.iterations = numberArg("--iterations", arg.slice("--iterations=".length));
    } else if (arg === "--pages") {
      parsed.pages = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--pages=")) {
      parsed.pages = numberArg("--pages", arg.slice("--pages=".length));
    } else if (arg === "--databases") {
      parsed.databases = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--databases=")) {
      parsed.databases = numberArg("--databases", arg.slice("--databases=".length));
    } else if (arg === "--rows-per-database") {
      parsed.rowsPerDatabase = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--rows-per-database=")) {
      parsed.rowsPerDatabase = numberArg("--rows-per-database", arg.slice("--rows-per-database=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}

function max(values) {
  return Number(Math.max(...values).toFixed(3));
}
