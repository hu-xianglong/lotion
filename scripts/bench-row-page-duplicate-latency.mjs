#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { DatabaseService } from "../dist-electron/main/services/database-service.js";
import { fileService } from "../dist-electron/main/services/file-service.js";
import {
  createPagesDefaultView,
  createPagesSchema,
  pageInputToRecord
} from "../dist-electron/main/services/pages-database-service.js";
import { RowPagesService } from "../dist-electron/main/services/row-pages-service.js";
import { writeCsvFile } from "../dist-electron/main/storage/csv-file.js";
import { writeJsonFile } from "../dist-electron/main/storage/json-file.js";
import { WorkspacePaths } from "../dist-electron/main/storage/paths.js";

const args = parseArgs(process.argv.slice(2));
const medianThresholdMs = Number(process.env.LOTION_ROW_PAGE_DUPLICATE_MEDIAN_THRESHOLD_MS ?? 750);
const maxThresholdMs = Number(process.env.LOTION_ROW_PAGE_DUPLICATE_MAX_THRESHOLD_MS ?? 1200);
const root = await mkdtemp(join(tmpdir(), "lotion-row-page-duplicate-bench-"));

try {
  const fixture = await createFixture(root, args);
  const paths = new WorkspacePaths(root);
  let manifest = JSON.parse(await readFile(join(root, "lotion.json"), "utf8"));
  const workspace = {
    requirePaths: () => paths,
    getManifest: async () => manifest,
    saveManifest: async (next) => {
      manifest = next;
      await writeJsonFile(join(root, "lotion.json"), next);
      return next;
    }
  };
  const databases = new DatabaseService(workspace);
  const rowPages = new RowPagesService(workspace, databases);
  databases.setRowPagesService(rowPages);

  const source = await rowPages.open(fixture.databaseId, fixture.sourceRowId);
  assert.equal(source.markdown, fixture.markdown);
  const pageDataPath = paths.data(PAGES_DATABASE_ID);
  const pageDataBytes = (await stat(pageDataPath)).size;
  const knownIds = new Set((await databases.get(fixture.databaseId)).records.map((record) => String(record.id)));
  const runs = [];
  let pageIndexAppendWrites = 0;
  let pageIndexFullWrites = 0;
  const originalAppendTextAtomic = fileService.appendTextAtomic.bind(fileService);
  const originalWriteTextAtomic = fileService.writeTextAtomic.bind(fileService);
  fileService.appendTextAtomic = async (path, value) => {
    if (path === pageDataPath) pageIndexAppendWrites += 1;
    return originalAppendTextAtomic(path, value);
  };
  fileService.writeTextAtomic = async (path, value) => {
    if (path === pageDataPath) pageIndexFullWrites += 1;
    return originalWriteTextAtomic(path, value);
  };

  try {
    for (let index = 0; index < args.iterations; index += 1) {
      const started = performance.now();
      const bundle = await databases.duplicateRow({
        databaseId: fixture.databaseId,
        rowId: fixture.sourceRowId
      });
      const elapsed = Number((performance.now() - started).toFixed(3));
      runs.push(elapsed);
      const duplicate = bundle.records.find((record) => !knownIds.has(String(record.id)));
      assert.ok(duplicate, `duplicate ${index + 1} did not create a row`);
      const duplicateId = String(duplicate.id);
      knownIds.add(duplicateId);
      const document = await rowPages.open(fixture.databaseId, duplicateId);
      assert.equal(document.markdown, fixture.markdown);
      assert.equal(document.fullWidth, true);
      assert.equal(document.meta.smallText, true);
      assert.deepEqual(document.meta.tags, ["Daily", "Imported"]);
      assert.equal(document.meta.url, "https://example.test/daily-source");
      assert.deepEqual(document.meta.path, ["Bench", fixture.databaseName, `${fixture.sourceTitle} copy`]);
    }
  } finally {
    fileService.appendTextAtomic = originalAppendTextAtomic;
    fileService.writeTextAtomic = originalWriteTextAtomic;
  }

  const summary = {
    rows: args.rows,
    pageIndexRows: args.pageIndexRows,
    pageIndexBytes: pageDataBytes,
    markdownBytes: Buffer.byteLength(fixture.markdown, "utf8"),
    iterations: args.iterations,
    medianThresholdMs: args.check ? medianThresholdMs : undefined,
    maxThresholdMs: args.check ? maxThresholdMs : undefined,
    medianMs: median(runs),
    maxMs: Number(Math.max(...runs).toFixed(3)),
    pageIndexAppendWrites,
    pageIndexFullWrites,
    runs
  };
  console.log(JSON.stringify(summary, null, 2));

  if (args.check) {
    assert.equal(
      pageIndexAppendWrites,
      args.iterations,
      `expected one incremental page-index write per duplicate, saw ${pageIndexAppendWrites}`
    );
    assert.equal(
      pageIndexFullWrites,
      0,
      `row-page duplicate rewrote the complete page index ${pageIndexFullWrites} time(s)`
    );
    if (summary.medianMs > medianThresholdMs) {
      throw new Error(`Row-page duplicate median ${summary.medianMs}ms exceeds ${medianThresholdMs}ms`);
    }
    if (summary.maxMs > maxThresholdMs) {
      throw new Error(`Row-page duplicate max ${summary.maxMs}ms exceeds ${maxThresholdMs}ms`);
    }
  }
} finally {
  fileService.clearCache();
  await rm(root, { recursive: true, force: true });
}

async function createFixture(root, options) {
  const now = "2026-07-26T00:00:00.000Z";
  const databaseId = "db_row_page_duplicate_bench";
  const databaseName = "每日习惯 Duplicate Bench";
  const sourceRowId = "row_duplicate_source";
  const sourceTitle = "2026/7/17 Daily Journal";
  const userFolder = databaseFolderName(databaseId, databaseName);
  const userDir = join(root, "databases", "user", userFolder);
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const sourceFile = pageMarkdownFileName(sourceRowId, sourceTitle);
  const sourceBodyPath = join("databases", "user", userFolder, "pages", sourceFile).replaceAll("\\", "/");
  const markdown = buildMarkdown(options.markdownLines);

  await Promise.all([
    mkdir(join(userDir, "pages"), { recursive: true }),
    mkdir(join(userDir, "views"), { recursive: true }),
    mkdir(join(pagesDir, "pages"), { recursive: true }),
    mkdir(join(pagesDir, "views"), { recursive: true })
  ]);
  await writeJsonFile(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_row_page_duplicate_bench",
    name: "Row Page Duplicate Bench",
    pages: [],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });

  const databaseSchema = {
    id: databaseId,
    name: databaseName,
    path: ["Bench", databaseName],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "page_full_width", name: "Full width", type: "checkbox", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" },
      { id: "status", name: "Status", type: "select" }
    ]
  };
  const rows = Array.from({ length: options.rows }, (_unused, index) => ({
    id: index === 0 ? sourceRowId : `row_duplicate_${index}`,
    created_time: now,
    updated_time: now,
    title: index === 0 ? sourceTitle : `Imported row ${index}`,
    page_file: index === 0 ? sourceFile : "",
    page_full_width: index === 0,
    notes: `Imported Notion metadata ${index} ${"x".repeat(360)}`,
    status: index % 2 === 0 ? "Active" : "Archived"
  }));
  await writeJsonFile(join(userDir, "schema.json"), databaseSchema);
  await writeJsonFile(join(userDir, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: ["title", "notes", "status"],
    fieldOrder: ["title", "notes", "status"],
    wrapFieldIds: ["title", "notes"],
    filters: [],
    sorts: []
  });
  await writeCsvFile(join(userDir, "data.csv"), databaseSchema.fields.map((field) => field.id), rows);
  await writeFile(join(root, sourceBodyPath), markdown, "utf8");

  const basePagesSchema = createPagesSchema(now);
  const pagesSchema = {
    ...basePagesSchema,
    fields: [
      ...basePagesSchema.fields,
      { id: "notion_original_html", name: "Original Notion HTML", type: "url" },
      { id: "notion_original_csv", name: "Original Notion CSV", type: "url" }
    ]
  };
  const pageRecords = Array.from({ length: options.pageIndexRows }, (_unused, index) => {
    const source = index === 0;
    const title = source ? sourceTitle : `Imported page ${index} 日记页面`;
    const record = pageInputToRecord({
      meta: {
        id: source ? sourceRowId : `pg_imported_${index}`,
        title,
        created_time: now,
        updated_time: now,
        path: source
          ? ["Bench", databaseName, sourceTitle]
          : ["Notion Import", `年度归档 ${index % 20}`, `项目与日记 ${index % 200}`, title],
        parentId: source ? databaseId : `pg_parent_${index % 500}`,
        parentKind: source ? "database" : "page",
        tags: source ? ["Daily", "Imported"] : ["Imported", `Archive ${index % 50}`, `Topic ${index % 100}`],
        url: source ? "https://example.test/daily-source" : `https://example.test/notion/imported/page/${index}`,
        fullWidth: source,
        smallText: source
      },
      bodyPath: source ? sourceBodyPath : undefined,
      databaseId: source ? databaseId : PAGES_DATABASE_ID,
      rowId: source ? sourceRowId : `pg_imported_${index}`
    });
    return {
      ...record,
      notion_original_html: `attachments/original/Export-html/年度归档/项目与日记/${title}/${"source-".repeat(12)}${index}.html`,
      notion_original_csv: `attachments/original/Export-markdown/年度归档/数据库/${"collection-".repeat(12)}${index}_all.csv`
    };
  });
  await writeJsonFile(join(pagesDir, "schema.json"), pagesSchema);
  await writeJsonFile(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), createPagesDefaultView());
  await writeCsvFile(join(pagesDir, "data.csv"), pagesSchema.fields.map((field) => field.id), pageRecords);

  return { databaseId, databaseName, markdown, sourceRowId, sourceTitle };
}

function buildMarkdown(lines) {
  const body = ["# Daily Journal", ""];
  for (let index = 0; index < lines; index += 1) {
    if (index % 50 === 0) body.push(`## Section ${index / 50 + 1}`);
    else if (index % 37 === 0) body.push(`https://indify.co/widgets/live/countdown/example-${index}`);
    else body.push(`Journal line ${index} with ordinary imported Notion content.`);
  }
  return `${body.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    rows: 1_167,
    pageIndexRows: 43_320,
    markdownLines: 284,
    iterations: 3
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
    } else if (arg === "--page-index-rows") {
      parsed.pageIndexRows = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--page-index-rows=")) {
      parsed.pageIndexRows = numberArg("--page-index-rows", arg.slice("--page-index-rows=".length));
    } else if (arg === "--markdown-lines") {
      parsed.markdownLines = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--markdown-lines=")) {
      parsed.markdownLines = numberArg("--markdown-lines", arg.slice("--markdown-lines=".length));
    } else if (arg === "--iterations") {
      parsed.iterations = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--iterations=")) {
      parsed.iterations = numberArg("--iterations", arg.slice("--iterations=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function numberArg(name, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(number);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}
