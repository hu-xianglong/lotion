import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../../dist-electron/shared/constants.js";
import { serializePathValue } from "../../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../../dist-electron/shared/workspace-paths.js";
import {
  assertElementSnapshotBaseline,
  assertFocusWithin,
  assertNoDocumentHorizontalOverflow,
  assertRectsDoNotOverlap,
  assertWithinViewport,
  captureElementSnapshot
} from "../ui-harness.mjs";

export async function createRowPagePropertyVisualFixture(viewportName = "default") {
  const root = await mkdtemp(join(tmpdir(), `lotion-row-property-visual-${viewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const homeId = "pg_row_property_home";
  const homeTitle = "Row Property Visual Home";
  const targetPageId = "pg_row_property_related";
  const targetPageTitle = "Related Visual Reference";
  const databaseId = "db_row_property_visual";
  const databaseName = "Row Property Visual DB";
  const rowId = "row_row_property_visual";
  const rowTitle = "Row Property Visual Row";
  const fields = {
    originalHtml: "Original Notion HTML",
    originalCsv: "Original Notion CSV",
    notes: "Notes",
    emptyText: "Empty text",
    status: "Status",
    tags: "Tags",
    done: "Done",
    blocked: "Blocked",
    dueDate: "Due date",
    emptyDate: "Empty date",
    score: "Score",
    related: "Related"
  };
  const originalHtmlPath = "attachments/original/export/Row_Property_Visual_Row.html";
  const originalCsvPath = "attachments/original/export/Row_Property_Visual_DB.csv";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));
  const targetPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(targetPageId, targetPageTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await mkdir(join(root, "attachments", "original", "export"), { recursive: true });

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_row_property_visual",
    name: "Row Property Visual Regression",
    pages: [homeId, targetPageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      bodyPath: homePath,
      icon: "emoji:📄",
      id: homeId,
      now,
      path: ["Visual", homeTitle],
      title: homeTitle
    }),
    pageRecord({
      bodyPath: targetPath,
      icon: "emoji:🔗",
      id: targetPageId,
      now,
      path: ["Visual", targetPageTitle],
      title: targetPageTitle
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nFixture home for row-property visual regression.\n`, "utf8");
  await writeFile(join(root, targetPath), `# ${targetPageTitle}\n\nTarget page for entity-ref property checks.\n`, "utf8");
  await writeFile(join(root, originalHtmlPath), "<html><body>Original Notion HTML source</body></html>\n", "utf8");
  await writeFile(join(root, originalCsvPath), "Name,Notes\nRow Property Visual Row,CSV source\n", "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
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
      { id: "notion_original_html", name: fields.originalHtml, type: "url" },
      { id: "notion_original_csv", name: fields.originalCsv, type: "url" },
      { id: "notes", name: fields.notes, type: "text" },
      { id: "empty_text", name: fields.emptyText, type: "text" },
      { id: "status", name: fields.status, type: "select", options: [
        { id: "status_todo", name: "Todo", color: "gray" },
        { id: "status_done", name: "Done", color: "green" }
      ] },
      { id: "tags", name: fields.tags, type: "multi_select", options: [
        { id: "tag_focus", name: "Focus", color: "blue" },
        { id: "tag_visual", name: "Visual", color: "yellow" }
      ] },
      { id: "done", name: fields.done, type: "checkbox" },
      { id: "blocked", name: fields.blocked, type: "checkbox" },
      { id: "due_date", name: fields.dueDate, type: "date" },
      { id: "empty_date", name: fields.emptyDate, type: "date" },
      { id: "score", name: fields.score, type: "number" },
      { id: "related", name: fields.related, type: "entity_ref" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "notion_original_html",
    "notion_original_csv",
    "notes",
    "empty_text",
    "status",
    "tags",
    "done",
    "blocked",
    "due_date",
    "empty_date",
    "score",
    "related"
  ], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    page_file: rowPageFile,
    notion_original_html: originalHtmlPath,
    notion_original_csv: originalCsvPath,
    notes: "Readable row property notes",
    empty_text: "",
    status: "Done",
    tags: "Focus;Visual",
    done: "true",
    blocked: "",
    due_date: "2026-01-05",
    empty_date: "",
    score: "3",
    related: JSON.stringify([{
      entityId: targetPageId,
      kind: "page",
      titleSnapshot: targetPageTitle,
      pathSnapshot: ["Visual", targetPageTitle]
    }])
  }]);
  await writeFile(join(root, rowPagePath), `# ${rowTitle}\n\nBody text for row-property visual regression.\n`, "utf8");

  return {
    root,
    databaseId,
    databaseName,
    fields,
    originalCsvPath,
    originalHtmlPath,
    rowId,
    rowPageFile,
    rowTitle,
    targetPageId,
    targetPageTitle
  };
}

export async function expandPageDetailsPanel(page) {
  const panel = page.locator('[data-testid="page-secondary-panel"]').first();
  await panel.waitFor({ timeout: 8_000 });
  const expanded = await panel.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await panel.getByRole("button", { name: /Expand page details|展开/ }).click();
  }
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-testid="page-secondary-panel"]');
    const properties = document.querySelector(".row-properties");
    const box = properties?.getBoundingClientRect();
    return panel?.getAttribute("aria-expanded") === "true" &&
      Boolean(box && box.width > 0 && box.height > 0);
  }, null, { timeout: 8_000 });
}

export async function assertRowPagePropertyVisuals({ artifactRoot, fixture, page, viewport }) {
  const panel = page.locator(".row-properties").first();
  await panel.waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `row-property visual ${viewport.name}`, 2);
  await assertWithinViewport(page, panel, `row-property panel ${viewport.name}`, 12);

  const labels = fixture.fields;
  const expectedRows = [
    labels.originalHtml,
    labels.originalCsv,
    labels.notes,
    labels.emptyText,
    labels.status,
    labels.tags,
    labels.done,
    labels.blocked,
    labels.dueDate,
    labels.emptyDate,
    labels.score,
    labels.related
  ];
  for (const label of expectedRows) {
    await assertWithinViewport(page, rowProperty(page, label), `row property ${label} ${viewport.name}`, 12);
  }

  const metrics = await collectRowPropertyMetrics(page, labels);
  assertStableValueColumn(metrics, expectedRows);
  assertSourceLinkMetrics(metrics.rows[labels.originalHtml], fixture.originalHtmlPath, "Original Notion HTML");
  assertSourceLinkMetrics(metrics.rows[labels.originalCsv], fixture.originalCsvPath, "Original Notion CSV");
  assertDateMetrics(metrics.rows[labels.dueDate], "Due date");
  assertDateMetrics(metrics.rows[labels.emptyDate], "Empty date");
  assertCheckboxMetrics(metrics.rows[labels.done], "Done", true);
  assertCheckboxMetrics(metrics.rows[labels.blocked], "Blocked", false);
  assertOptionMetrics(metrics.rows[labels.status], "Status");
  assertOptionMetrics(metrics.rows[labels.tags], "Tags");
  assertTextMetrics(metrics.rows[labels.notes], "Notes", { empty: false });
  assertTextMetrics(metrics.rows[labels.emptyText], "Empty text", { empty: true });
  assertEntityRefMetrics(metrics.rows[labels.related], fixture.targetPageTitle);

  const sourceOpen = await assertSourceLinkOpenAffordance(page, fixture);
  const focus = await assertKeyboardFocusAffordances(page, fixture, viewport);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: panel,
    metadata: {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle,
      sourceRows: [labels.originalHtml, labels.originalCsv],
      valueColumnLeft: Number(metrics.valueColumnLeft.toFixed(1)),
      visibleRows: expectedRows
    },
    name: `row-property-visual-${viewport.name}`,
    page,
    viewport
  });
  const snapshotBaseline = await assertElementSnapshotBaseline(snapshot, {
    label: `row-property visual ${viewport.name}`,
    metadata: {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle
    },
    rect: {
      width: { min: 560, max: 880 },
      height: { min: 420, max: 760 }
    },
    requiredMetadataKeys: ["sourceRows", "valueColumnLeft", "visibleRows"],
    viewportName: viewport.name
  });

  return {
    focus,
    rowCount: expectedRows.length,
    sourceOpen,
    snapshot: {
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      height: Number(snapshot.rect.height.toFixed(1)),
      width: Number(snapshot.rect.width.toFixed(1))
    },
    snapshotBaseline,
    valueColumnLeft: Number(metrics.valueColumnLeft.toFixed(1)),
    viewport: metrics.viewport
  };
}

function rowProperty(page, label) {
  return page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: label })
  }).first();
}

async function collectRowPropertyMetrics(page, labels) {
  return page.evaluate((fieldLabels) => {
    const rows = Array.from(document.querySelectorAll(".row-property"));
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        height: box.height,
        left: box.left,
        right: box.right,
        top: box.top,
        width: box.width
      };
    };
    const text = (element) => element?.textContent?.trim() ?? "";
    const measure = (label) => {
      const row = rows.find((candidate) =>
        candidate.querySelector(".row-property-name")?.textContent?.trim() === label
      );
      if (!row) return null;
      const input = row.querySelector("input");
      const control = row.querySelector("input, textarea");
      return {
        editorCount: row.querySelectorAll(".row-property-editor, .row-property-editor-url, .url-cell, textarea").length,
        emptyText: row.querySelector(".empty-cell")?.textContent?.trim() ?? "",
        controlPlaceholder: control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? control.placeholder : "",
        controlRect: rect(control),
        controlValue: control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? control.value : "",
        entityChipRect: rect(row.querySelector(".entity-ref-chip")),
        entityChipText: text(row.querySelector(".entity-ref-chip")),
        inputChecked: input instanceof HTMLInputElement ? input.checked : null,
        inputRect: rect(input),
        inputType: input instanceof HTMLInputElement ? input.type : "",
        inputValue: input instanceof HTMLInputElement ? input.value : "",
        label,
        labelRect: rect(row.querySelector(".row-property-label")),
        labelText: text(row.querySelector(".row-property-name")),
        linkOpenRect: rect(row.querySelector(".page-property-link-open")),
        linkRect: rect(row.querySelector(".page-property-link")),
        linkText: text(row.querySelector(".page-property-link-text")),
        linkTextRect: rect(row.querySelector(".page-property-link-text")),
        linkTitle: row.querySelector(".page-property-link")?.getAttribute("title") ?? "",
        optionPillRect: rect(row.querySelector(".option-pill")),
        optionPillText: text(row.querySelector(".option-pill")),
        rowClass: row.className,
        rowRect: rect(row),
        searchChipRect: rect(row.querySelector(".row-property-option-search-chip")),
        searchChipText: text(row.querySelector(".row-property-option-search-chip")),
        valueRect: rect(row.querySelector(".row-property-value")),
        valueText: text(row.querySelector(".row-property-value"))
      };
    };
    const entries = Object.values(fieldLabels).map((label) => [label, measure(label)]);
    const valueColumnLeft = entries.find(([, row]) => row?.valueRect)?.[1]?.valueRect?.left ?? 0;
    return {
      rows: Object.fromEntries(entries),
      valueColumnLeft,
      viewport: {
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        width: window.innerWidth
      }
    };
  }, labels);
}

function assertStableValueColumn(metrics, expectedRows) {
  for (const label of expectedRows) {
    const row = metrics.rows[label];
    if (!row?.labelRect || !row.valueRect || !row.rowRect) {
      throw new Error(`Missing property row metrics for ${label}: ${JSON.stringify(row)}`);
    }
    if (row.labelRect.right > row.valueRect.left - 8) {
      throw new Error(`${label} label overlaps value column: ${JSON.stringify(row)}`);
    }
    if (Math.abs(row.valueRect.left - metrics.valueColumnLeft) > 1) {
      throw new Error(`${label} value column is not aligned: ${JSON.stringify({ expected: metrics.valueColumnLeft, row })}`);
    }
    if (row.valueRect.right > metrics.viewport.width - 12) {
      throw new Error(`${label} value column overflows viewport: ${JSON.stringify({ viewport: metrics.viewport, row })}`);
    }
  }
}

function assertSourceLinkMetrics(row, expectedPath, label) {
  if (!row?.rowClass?.includes("read-only") || !row.rowClass.includes("source-link-property")) {
    throw new Error(`${label} should render as a read-only source-link row: ${JSON.stringify(row)}`);
  }
  if (row.editorCount !== 0 || row.inputRect) {
    throw new Error(`${label} should not render editable inputs: ${JSON.stringify(row)}`);
  }
  if (!row.linkRect || !row.linkTextRect || !row.linkOpenRect || !row.linkText.includes("attachments/original/")) {
    throw new Error(`${label} should render a visible source-link affordance: ${JSON.stringify(row)}`);
  }
  if (!row.linkTitle.includes(expectedPath)) {
    throw new Error(`${label} source link title should preserve original path: ${JSON.stringify({ expectedPath, row })}`);
  }
  assertRectsDoNotOverlap(row.linkTextRect, row.linkOpenRect, `${label} link text/open affordance`);
}

function assertDateMetrics(row, label) {
  if (!row?.inputRect || row.inputType !== "text") {
    throw new Error(`${label} date row should expose a text date input: ${JSON.stringify(row)}`);
  }
  if (row.inputRect.right > row.valueRect.right + 1) {
    throw new Error(`${label} date row overflows value column: ${JSON.stringify(row)}`);
  }
  const verticalDelta = Math.abs(center(row.inputRect) - center(row.valueRect));
  if (verticalDelta > 4) {
    throw new Error(`${label} date row is not vertically aligned: ${JSON.stringify({ verticalDelta, row })}`);
  }
}

function assertCheckboxMetrics(row, label, checked) {
  if (!row?.inputRect || row.inputType !== "checkbox") {
    throw new Error(`${label} checkbox row should expose checkbox geometry: ${JSON.stringify(row)}`);
  }
  if (row.inputRect.width < 16 || row.inputRect.height < 16) {
    throw new Error(`${label} checkbox hit target is too small: ${JSON.stringify(row)}`);
  }
  if (row.inputChecked !== checked) {
    throw new Error(`${label} checkbox checked state is wrong: ${JSON.stringify({ expected: checked, row })}`);
  }
  const verticalDelta = Math.abs(center(row.inputRect) - center(row.valueRect));
  if (verticalDelta > 4) {
    throw new Error(`${label} checkbox is not vertically aligned: ${JSON.stringify({ verticalDelta, row })}`);
  }
}

function assertOptionMetrics(row, label) {
  if (!row?.optionPillRect || !row.optionPillText) {
    throw new Error(`${label} should render a visible option/tag pill: ${JSON.stringify(row)}`);
  }
  if (!row.searchChipRect || !row.searchChipText) {
    throw new Error(`${label} should expose an option search affordance: ${JSON.stringify(row)}`);
  }
  if (row.searchChipRect.right > row.valueRect.right + 1) {
    throw new Error(`${label} option search chip overflows value column: ${JSON.stringify(row)}`);
  }
}

function assertTextMetrics(row, label, { empty }) {
  if (!row?.valueRect) throw new Error(`${label} text row missing value geometry: ${JSON.stringify(row)}`);
  const visibleOrAccessibleEmpty = [row.valueText, row.emptyText, row.controlPlaceholder]
    .some((text) => /Empty|空/.test(String(text)));
  if (empty && !visibleOrAccessibleEmpty) {
    throw new Error(`${label} empty row should visibly render empty state: ${JSON.stringify(row)}`);
  }
  if (!empty && !`${row.valueText} ${row.controlValue}`.includes("Readable row property notes")) {
    throw new Error(`${label} text row should render its value: ${JSON.stringify(row)}`);
  }
}

function assertEntityRefMetrics(row, expectedTitle) {
  if (!row?.entityChipRect || !row.entityChipText.includes(expectedTitle)) {
    throw new Error(`Entity ref row should render a readable chip: ${JSON.stringify({ expectedTitle, row })}`);
  }
  if (row.entityChipRect.right > row.valueRect.right + 1) {
    throw new Error(`Entity ref chip overflows value column: ${JSON.stringify(row)}`);
  }
}

async function assertSourceLinkOpenAffordance(page, fixture) {
  const capture = await enableShellOpenCapture(page);
  const opened = [];
  for (const [label, expected] of [
    [fixture.fields.originalHtml, fixture.originalHtmlPath],
    [fixture.fields.originalCsv, fixture.originalCsvPath]
  ]) {
    const row = rowProperty(page, label);
    await row.locator(".page-property-link").first().focus();
    await assertFocusWithin(row, `${label} source link focus`);
    await clearCapturedOpenRequests(page, capture);
    await row.locator(".page-property-link").first().click();
    const requests = await waitForCapturedOpenRequest(page, capture, expected);
    opened.push({ label, requests });
  }
  return opened;
}

async function assertKeyboardFocusAffordances(page, fixture, viewport) {
  const focusTargets = [
    [fixture.fields.originalHtml, ".page-property-link"],
    [fixture.fields.dueDate, "input"],
    [fixture.fields.done, 'input[type="checkbox"]'],
    [fixture.fields.related, ".entity-ref-chip"]
  ];
  const rows = [];
  for (const [label, selector] of focusTargets) {
    const row = rowProperty(page, label);
    const target = row.locator(selector).first();
    await target.waitFor({ timeout: 8_000 });
    await target.focus();
    const focus = await assertFocusWithin(row, `${label} focus ${viewport.name}`);
    const rect = await assertWithinViewport(page, row, `${label} focused row ${viewport.name}`, 12);
    await assertNoDocumentHorizontalOverflow(page, `${label} focused row ${viewport.name}`, 2);
    rows.push({ label, focus, rect: roundRect(rect) });
  }
  return rows;
}

async function enableShellOpenCapture(page) {
  const dryRun = await page.evaluate(async () => {
    const debug = window.lotion.debug;
    if (!debug?.setShellOpenDryRun || !debug?.clearShellOpenRequests || !debug?.getShellOpenRequests) {
      return { enabled: false };
    }
    await debug.setShellOpenDryRun(true);
    await debug.clearShellOpenRequests();
    return { enabled: true };
  });
  if (dryRun.enabled) return { mode: "debug-dry-run" };

  const patch = await page.evaluate(() => {
    const opened = [];
    Object.defineProperty(window, "__lotionOpenedUrls", {
      configurable: true,
      value: opened
    });
    const original = window.lotion.shell.openLink;
    try {
      window.lotion.shell.openLink = async (url) => {
        opened.push(url);
        return "";
      };
      return { patched: window.lotion.shell.openLink !== original };
    } catch (error) {
      return { patched: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  if (!patch.patched) {
    throw new Error(`Could not capture shell.openLink for source URL smoke: ${JSON.stringify(patch)}`);
  }
  return { mode: "patched-shell-open" };
}

async function clearCapturedOpenRequests(page, capture) {
  await page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") await window.lotion.debug?.clearShellOpenRequests?.();
    if (Array.isArray(window.__lotionOpenedUrls)) window.__lotionOpenedUrls.length = 0;
  }, capture.mode);
}

async function waitForCapturedOpenRequest(page, capture, expected) {
  await page.waitForFunction(
    async ({ mode, expectedUrl }) => {
      if (mode === "debug-dry-run") {
        return (await window.lotion.debug.getShellOpenRequests()).some((url) => String(url).includes(expectedUrl));
      }
      const opened = window.__lotionOpenedUrls;
      return Array.isArray(opened) && opened.some((url) => String(url).includes(expectedUrl));
    },
    { mode: capture.mode, expectedUrl: expected },
    { timeout: 5_000 }
  );
  return page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") return await window.lotion.debug.getShellOpenRequests();
    return Array.isArray(window.__lotionOpenedUrls) ? [...window.__lotionOpenedUrls] : [];
  }, capture.mode);
}

function center(rect) {
  return rect.top + rect.height / 2;
}

function roundRect(rect) {
  return {
    bottom: Number(rect.bottom.toFixed(1)),
    height: Number(rect.height.toFixed(1)),
    left: Number(rect.left.toFixed(1)),
    right: Number(rect.right.toFixed(1)),
    top: Number(rect.top.toFixed(1)),
    width: Number(rect.width.toFixed(1))
  };
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

function workspacePath(group, dbFolder, ...parts) {
  return ["databases", group, dbFolder, ...parts].join("/");
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

function pageRecord({ bodyPath, icon, id, now, path, title }) {
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
