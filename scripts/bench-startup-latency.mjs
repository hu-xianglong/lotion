#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
  pageIndexRecordCount: args.pageIndexRecords,
  databaseCount: args.databases,
  rowsPerDatabase: args.rowsPerDatabase,
  sparsePageBodies: args.sparsePageBodies
});

try {
  const appConfigPath = join(appConfigRoot, "app-config.json");
  const fixtureInitializer = createLotionCustomerApi({
    appConfig: new AppConfigService(appConfigPath)
  });
  await fixtureInitializer.workspace.open(fixture.root);
  await fixtureInitializer.workspace.getStartupIndex();
  const sourceSnapshot = await snapshotSources(fixture.root);
  const runs = [];
  for (let index = 0; index < args.iterations; index += 1) {
    runs.push(await timeStartupCycle(appConfigPath, fixture));
  }
  const summary = summarizeRuns(runs, fixture, args);
  const sourceSnapshotAfter = await snapshotSources(fixture.root);
  summary.sourceChanges = sourceSnapshotChanges(sourceSnapshot, sourceSnapshotAfter);
  summary.sourceFilesUnchanged = summary.sourceChanges.length === 0;
  console.log(JSON.stringify(summary, null, 2));

  if (args.check) {
    assert.equal(summary.lastCounts.pages, fixture.pageCount, "startup benchmark should see all pages");
    assert.equal(summary.lastCounts.databases, fixture.databaseCount, "startup benchmark should see all databases");
    assert.equal(summary.sourceFilesUnchanged, true, "clean startup must not rewrite source files");
    assert.equal(summary.max.indexMarkdownReads, 0, "startup index must not read Markdown bodies");
    assert.equal(
      summary.max.navigationPagesCsvReads,
      0,
      "restoring the first row page must not parse the system pages CSV"
    );
    assert.equal(
      summary.cacheStatuses.every((status) => status === "hit"),
      true,
      "measured restarts must use the SQLite startup cache"
    );
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

async function timeStartupCycle(appConfigPath, fixture) {
  fileService.clearCache();
  const api = createLotionCustomerApi({
    appConfig: new AppConfigService(appConfigPath)
  });
  const totalStarted = performance.now();
  const manifest = await timeAsync(() => api.workspace.open(fixture.root));
  let indexMarkdownReads = 0;
  let navigationPagesCsvReads = 0;
  let indexComplete = false;
  const originalReadText = fileService.readText.bind(fileService);
  fileService.readText = async (path) => {
    if (!indexComplete && String(path).endsWith(".md")) indexMarkdownReads += 1;
    if (indexComplete && String(path) === pagesCsvPath(fixture.root)) navigationPagesCsvReads += 1;
    return originalReadText(path);
  };
  let index;
  let firstPage;
  try {
    index = await timeAsync(async () => {
      const [startupIndex, favorites, recents] = await Promise.all([
        timeAsync(() => api.workspace.getStartupIndex()),
        timeAsync(() => api.workspace.listFavorites()),
        timeAsync(() => api.workspace.listRecents())
      ]);
      return { startupIndex, favorites, recents };
    });
    indexComplete = true;
    firstPage = fixture.targetRowPageId
      ? await timeAsync(() => api.rowPages.open(fixture.databaseIds[0], fixture.targetRowPageId))
      : await timeAsync(() => api.pages.get(fixture.targetPageId));
  } finally {
    fileService.readText = originalReadText;
  }
  const totalMs = Number((performance.now() - totalStarted).toFixed(3));
  return {
    openMs: manifest.ms,
    indexMs: index.ms,
    indexMarkdownReads,
    navigationPagesCsvReads,
    firstPageMs: firstPage.ms,
    totalMs,
    counts: {
      manifestPages: manifest.value.pages.length,
      pages: index.value.startupIndex.value.pages.length,
      databases: index.value.startupIndex.value.databases.length,
      treePages: index.value.startupIndex.value.pagesTree.topLevelPages.length,
      favorites: index.value.favorites.value.length,
      recents: index.value.recents.value.length,
      firstPageBytes: Buffer.byteLength(firstPage.value.markdown, "utf8")
    },
    indexComponents: {
      startupIndexMs: index.value.startupIndex.ms,
      favoritesMs: index.value.favorites.ms,
      recentsMs: index.value.recents.ms
    },
    cache: index.value.startupIndex.value.cache
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
    pageIndexRecords: fixture.pageIndexRecordCount,
    databases: fixture.databaseCount,
    rowsPerDatabase: fixture.rowsPerDatabase,
    iterations: args.iterations,
    thresholds: args.check ? {
      openMs: openThresholdMs,
      indexMs: indexThresholdMs,
      firstPageMs: firstPageThresholdMs,
      totalMs: totalThresholdMs
    } : undefined,
    cacheStatuses: runs.map((run) => run.cache.status),
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
      totalMs: max(runs.map((run) => run.totalMs)),
      indexMarkdownReads: max(runs.map((run) => run.indexMarkdownReads)),
      navigationPagesCsvReads: max(runs.map((run) => run.navigationPagesCsvReads))
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
    rowsPerDatabase: 200,
    pageIndexRecords: undefined,
    sparsePageBodies: false
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
    } else if (arg === "--page-index-records") {
      parsed.pageIndexRecords = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--page-index-records=")) {
      parsed.pageIndexRecords = numberArg("--page-index-records", arg.slice("--page-index-records=".length));
    } else if (arg === "--databases") {
      parsed.databases = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--databases=")) {
      parsed.databases = numberArg("--databases", arg.slice("--databases=".length));
    } else if (arg === "--rows-per-database") {
      parsed.rowsPerDatabase = nonNegativeNumberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--rows-per-database=")) {
      parsed.rowsPerDatabase = nonNegativeNumberArg("--rows-per-database", arg.slice("--rows-per-database=".length));
    } else if (arg === "--sparse-page-bodies") {
      parsed.sparsePageBodies = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  parsed.pageIndexRecords ??= parsed.pages + (parsed.databases > 0 && parsed.rowsPerDatabase > 0 ? 1 : 0);
  return parsed;
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 1) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

function nonNegativeNumberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

async function snapshotSources(root) {
  const paths = [
    join(root, "lotion.json"),
    join(root, "databases", "system", "pages--db_pages", "schema.json"),
    join(root, "databases", "system", "pages--db_pages", "data.csv"),
    join(root, "databases", "system", "pages--db_pages", "views", "view_default.json")
  ];
  return Promise.all(paths.map(async (path) => {
    const [bytes, info] = await Promise.all([readFile(path), stat(path)]);
    return { path, bytes, mtimeMs: info.mtimeMs, size: info.size };
  }));
}

function pagesCsvPath(root) {
  return join(root, "databases", "system", "pages--db_pages", "data.csv");
}

function sourceSnapshotChanges(before, after) {
  if (before.length !== after.length) {
    return [{ path: "source-set", before: before.length, after: after.length }];
  }
  return before.flatMap((entry, index) => {
    const next = after[index];
    if (
      entry.path === next.path &&
      entry.size === next.size &&
      entry.mtimeMs === next.mtimeMs &&
      entry.bytes.equals(next.bytes)
    ) {
      return [];
    }
    return [{
      path: entry.path,
      beforeSize: entry.size,
      afterSize: next.size,
      bytesEqual: entry.bytes.equals(next.bytes),
      mtimeEqual: entry.mtimeMs === next.mtimeMs
    }];
  });
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
