#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertEditorScrollArtifactContract } from "./lib/editor-scroll-artifacts.mjs";
import {
  assertElementSnapshotBaseline,
  assertHarnessViewportCoverage,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const args = parseArgs(process.argv.slice(2));
const thresholdMs = Number(process.env.LOTION_EDITOR_SCROLL_THRESHOLD_MS ?? 600);
const overheadThresholdMs = Number(process.env.LOTION_EDITOR_SCROLL_OVERHEAD_THRESHOLD_MS ?? 250);

const smokeResult = await withLotionUIHarness("editor-scroll-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const expectedViewports = selectedViewports();
  const viewportResults = [];
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createEditorScrollFixture(args.lines, args.rows);
    registerTempWorkspace(fixture.root);

    await openWorkspace(fixture.root);
    await openPage(page, fixture.blankPageId);
    await page.getByText("Editor Scroll Blank").first().waitFor({ timeout: 8_000 });
    await openPage(page, fixture.largePageId);
    await page.getByText("Editor Scroll Benchmark").first().waitFor({ timeout: 8_000 });
    await page.waitForSelector(".cm-scroller", { timeout: 8_000 });
    await page.waitForSelector(".embedded-table", { timeout: 8_000 });
    await assertIntersectsViewport(page, page.locator(".cm-scroller").first(), `editor scroller ${viewport.name}`, 4);
    await assertIntersectsViewport(page, page.locator(".embedded-table").first(), `embedded table ${viewport.name}`, 4);
    const loadedOverflow = await assertNoDocumentHorizontalOverflow(page, `editor scroll loaded ${viewport.name}`);
    await page.bringToFront().catch(() => undefined);
    await page.locator(".cm-scroller").click({ position: { x: 8, y: 8 }, timeout: 2_000 }).catch(() => undefined);

    const result = await runScrollBenchmark(page, args.steps);
    const afterOverflow = await assertNoDocumentHorizontalOverflow(page, `editor scroll after benchmark ${viewport.name}`);
    const summary = {
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      lines: args.lines,
      embeddedRows: args.rows,
      thresholdMs,
      overheadThresholdMs,
      loadedOverflow,
      afterOverflow,
      ...result
    };
    assertScrollLatency(summary);
    summary.visualSnapshot = await captureEditorScrollSnapshot({ artifactRoot, page, summary, viewport });
    viewportResults.push(summary);
  });

  const summary = {
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertEditorScrollArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

assertHarnessViewportCoverage(smokeResult);
console.log(JSON.stringify(smokeResult, null, 2));

async function runScrollBenchmark(page, steps) {
  return page.evaluate(async ({ steps: stepCount }) => {
    const scroller = document.querySelector(".cm-scroller");
    if (!(scroller instanceof HTMLElement)) {
      throw new Error("Missing .cm-scroller");
    }
    const longTasks = [];
    let observer;
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push(Number(entry.duration.toFixed(1)));
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    }
    await nextFrame();
    const baselineStarted = performance.now();
    for (let index = 0; index < stepCount; index += 1) {
      await nextFrame();
    }
    const baselineRafMs = Number((performance.now() - baselineStarted).toFixed(1));
    const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const started = performance.now();
    for (let index = 1; index <= stepCount; index += 1) {
      scroller.scrollTop = Math.round((maxTop * index) / stepCount);
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await nextFrame();
    }
    const totalMs = Number((performance.now() - started).toFixed(1));
    observer?.disconnect();
    return {
      steps: stepCount,
      baselineRafMs,
      totalMs,
      scrollOverheadMs: Number(Math.max(0, totalMs - baselineRafMs).toFixed(1)),
      avgStepMs: Number((totalMs / stepCount).toFixed(2)),
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      embeddedTablesAfterScroll: document.querySelectorAll(".embedded-table").length,
      longTaskCount: longTasks.length,
      maxLongTaskMs: longTasks.length ? Math.max(...longTasks) : 0
    };

    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, { steps });
}

function assertScrollLatency(summary) {
  if (summary.totalMs > thresholdMs && summary.scrollOverheadMs > overheadThresholdMs) {
    throw new Error(
      `Editor scroll ${summary.totalMs}ms exceeds ${thresholdMs}ms and overhead ${summary.scrollOverheadMs}ms exceeds ${overheadThresholdMs}ms for ${summary.viewport}`
    );
  }
}

async function captureEditorScrollSnapshot({ artifactRoot, page, summary, viewport }) {
  const editor = page.locator('[data-testid="markdown-editor"]').first();
  await assertIntersectsViewport(page, editor, `editor scroll snapshot ${viewport.name}`, 4);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: editor,
    metadata: {
      phase: "editor-scroll",
      lines: summary.lines,
      embeddedRows: summary.embeddedRows,
      steps: summary.steps,
      totalMs: summary.totalMs,
      scrollOverheadMs: summary.scrollOverheadMs,
      scrollHeight: summary.scrollHeight,
      embeddedTablesAfterScroll: summary.embeddedTablesAfterScroll
    },
    name: `editor-scroll-${viewport.name}`,
    page,
    viewport
  });
  return assertElementSnapshotBaseline(snapshot, {
    label: `editor scroll ${viewport.name}`,
    metadata: {
      phase: "editor-scroll",
      lines: summary.lines,
      embeddedRows: summary.embeddedRows,
      steps: summary.steps,
      totalMs: summary.totalMs,
      scrollHeight: summary.scrollHeight,
      embeddedTablesAfterScroll: summary.embeddedTablesAfterScroll
    },
    rect: {
      width: { min: 300 },
      height: { min: 120 }
    },
    requiredMetadataKeys: ["scrollOverheadMs"],
    viewportName: viewport.name
  });
}

async function createEditorScrollFixture(lines, rows) {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-scroll-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });

  const blankPageId = "pg_editor_scroll_blank";
  const largePageId = "pg_editor_scroll_large";
  const blankTitle = "Editor Scroll Blank";
  const largeTitle = "Editor Scroll Benchmark";
  const databaseId = "db_editor_scroll";
  const blankPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(blankPageId, blankTitle));
  const largePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(largePageId, largeTitle));

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_editor_scroll",
    name: "Editor Scroll Bench",
    pages: [blankPageId, largePageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await createScrollImageAttachments(root, lines);
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: blankPageId,
      title: blankTitle,
      now,
      icon: "emoji:📄",
      path: ["Bench", blankTitle],
      bodyPath: blankPath
    }),
    pageRecord({
      id: largePageId,
      title: largeTitle,
      now,
      icon: "emoji:🧪",
      path: ["Bench", largeTitle],
      bodyPath: largePath
    })
  ]);
  await writeFile(join(root, blankPath), `# ${blankTitle}\n\nBlank page before scroll benchmark.\n`, "utf8");
  await writeFile(join(root, largePath), largeMarkdown(largeTitle, databaseId, lines), "utf8");
  await createEmbeddedDatabase(root, databaseId, "Editor Scroll DB", rows);
  return { root, blankPageId, largePageId };
}

async function createScrollImageAttachments(root, lines) {
  const imagesDir = join(root, "attachments", "images");
  await mkdir(imagesDir, { recursive: true });
  for (let index = 0; index < lines; index += 700) {
    await writeFile(join(imagesDir, `missing-${index}.png`), tinyPngBuffer());
  }
}

function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

async function createEmbeddedDatabase(root, databaseId, databaseName, rows) {
  const now = "2026-01-01T00:00:00.000Z";
  const dir = join(root, "databases", "user", databaseFolderName(databaseId, databaseName));
  await mkdir(join(dir, "views"), { recursive: true });
  await mkdir(join(dir, "pages"), { recursive: true });
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
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(dir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(
    join(dir, "data.csv"),
    ["id", "created_time", "updated_time", "title", "page_file", "notes"],
    Array.from({ length: rows }, (_unused, index) => ({
      id: `row_${index}`,
      created_time: now,
      updated_time: now,
      title: `Scroll Row ${index}`,
      page_file: "",
      notes: `Scroll benchmark row ${index}`
    }))
  );
}

function largeMarkdown(title, databaseId, lines) {
  const body = [
    `# ${title}`,
    "",
    "```lotion-view",
    `database: ${databaseId}`,
    `view: ${DEFAULT_VIEW_ID}`,
    "```",
    ""
  ];
  for (let index = 0; index < lines; index += 1) {
    if (index % 700 === 0) {
      body.push(`![Scroll image ${index}](attachments/images/missing-${index}.png)`);
    } else if (index % 900 === 0) {
      body.push("```lotion-iframe");
      body.push(`url: https://example.com/scroll-${index}`);
      body.push(`title: Example iframe ${index}`);
      body.push("```");
      body.push("");
    } else {
      body.push(`Paragraph ${index} with enough imported Notion text to exercise CodeMirror scrolling and decoration boundaries.`);
    }
  }
  return `${body.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {
    lines: Number(process.env.LOTION_EDITOR_SCROLL_LINES ?? 2500),
    rows: Number(process.env.LOTION_EDITOR_SCROLL_ROWS ?? 300),
    steps: Number(process.env.LOTION_EDITOR_SCROLL_STEPS ?? 24)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--lines") {
      parsed.lines = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--lines=")) {
      parsed.lines = numberArg("--lines", arg.slice("--lines=".length));
    } else if (arg === "--rows") {
      parsed.rows = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--rows=")) {
      parsed.rows = numberArg("--rows", arg.slice("--rows=".length));
    } else if (arg === "--steps") {
      parsed.steps = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--steps=")) {
      parsed.steps = numberArg("--steps", arg.slice("--steps=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.lines < 1 || parsed.rows < 1 || parsed.steps < 1) {
    throw new Error(`Invalid editor scroll benchmark options: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

function pagesFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
    "title",
    "kind",
    "body_path",
    "icon",
    "cover",
    "cover_offset",
    "path",
    "parent_id",
    "tags",
    "date",
    "url",
    "full_width",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function pageRecord({ id, title, now, icon, path, bodyPath }) {
  return {
    id,
    created_time: now,
    updated_time: now,
    title,
    kind: "page",
    body_path: bodyPath,
    icon,
    cover: "",
    cover_offset: "",
    path: serializePathValue(path),
    parent_id: "",
    tags: "",
    date: "",
    url: "",
    full_width: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
  };
}

function pagesSchema(now) {
  return {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "cover", name: "Cover", type: "text" },
      { id: "cover_offset", name: "Cover offset", type: "number" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "text" },
      { id: "url", name: "URL", type: "url" },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  };
}

function defaultView(databaseId, fields) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fields,
    fieldOrder: fields,
    wrapFieldIds: fields,
    sorts: [],
    filters: []
  };
}
