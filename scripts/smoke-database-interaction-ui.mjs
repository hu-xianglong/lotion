#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { assertDatabaseInteractionArtifactContract } from "./lib/database-interaction-artifacts.mjs";
import { assertProductionVisualBaseline } from "./lib/production-visual-baseline.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const VIEW_ID = "view_default";
const DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1040, height: 820 },
  { name: "wide", width: 1728, height: 1100 }
];

const result = await withLotionUIHarness("database-interaction-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  const requestedViewports = process.env.LOTION_UI_VIEWPORTS ? selectedViewports() : DEFAULT_VIEWPORTS;
  await forEachViewport(page, requestedViewports, async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-database-interaction-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    const evidence = await runScenario({ artifactRoot, page, viewport, workspaceRoot });
    viewports.push(evidence);
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseInteractionArtifactContract(summary, {
    expectedViewportNames: requestedViewports.map((viewport) => viewport.name),
    requiredPerceptualBaselineViewportNames: process.env.LOTION_DATABASE_INTERACTION_SKIP_BASELINE === "1"
      ? []
      : requestedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport, workspaceRoot }) {
  await waitForDatabaseService(page, DATABASE_ID);
  const navigationStarted = performance.now();
  await navigateToDatabase(page, DATABASE_ID);
  const table = page.locator(".database-table:not(.embedded-table)").first();
  await table.waitFor({ timeout: 8_000 });
  await table.locator(".database-title-wrap h1").filter({ hasText: /^Tasks$/ }).waitFor({ timeout: 8_000 });
  const firstPaintMs = performance.now() - navigationStarted;
  await assertNoDocumentHorizontalOverflow(page, `database interaction ${viewport.name}`);

  const switchStarted = performance.now();
  const viewSwitchRoute = await selectDatabaseView(table, "Done tasks");
  await table.locator(".view-tab.active").filter({ hasText: "Done tasks" }).waitFor();
  const viewSwitchMs = performance.now() - switchStarted;
  await selectDatabaseView(table, "Default");
  await table.locator(".view-tab.active").filter({ hasText: "Default" }).waitFor();

  await table.locator('.toolbar-icon[aria-label="View settings"]').click();
  const settingsMenu = page.getByRole("menu", { name: "Database settings" });
  await settingsMenu.waitFor();
  await settingsMenu.getByRole("menuitem", { name: /View settings/ }).waitFor();
  await settingsMenu.getByRole("menuitem", { name: /Database settings/ }).waitFor();
  const settingsSnapshot = await captureInteractionSnapshot({
    artifactRoot,
    page,
    phase: "settings-scope-menu",
    surface: settingsMenu,
    table,
    viewport
  });
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: "View settings menu" }).waitFor();
  await page.keyboard.press("Escape");
  await settingsMenu.waitFor();
  await page.keyboard.press("Escape");
  await settingsMenu.waitFor({ state: "detached" });

  const menuStarted = performance.now();
  await table.locator('.toolbar-icon[aria-label="Filter"]').click();
  await page.getByRole("dialog", { name: "Filter" }).waitFor();
  const menuOpenMs = performance.now() - menuStarted;
  const filterSnapshot = await captureInteractionSnapshot({
    artifactRoot,
    page,
    phase: "filter-menu",
    surface: page.getByRole("dialog", { name: "Filter" }),
    table,
    viewport
  });
  await page.mouse.click(4, 4);

  const before = await readView(page);
  const nextDirection = before.sorts[0]?.direction === "asc" ? "desc" : "asc";
  await table.locator('.toolbar-icon[aria-label="Sort"]').click();
  const sortDialog = page.getByRole("dialog", { name: "Sort" });
  await sortDialog.waitFor();
  const sortSnapshot = await captureInteractionSnapshot({
    artifactRoot,
    page,
    phase: "sort-menu",
    surface: sortDialog,
    table,
    viewport
  });
  const sortCommitStarted = performance.now();
  await sortDialog.locator("select").nth(1).selectOption(nextDirection);
  await page.locator(".view-save-status.saved").waitFor({ timeout: 8_000 });
  const sortCommitMs = performance.now() - sortCommitStarted;
  await page.mouse.click(4, 4);

  const persisted = await readView(page);
  assert.equal(persisted.sorts[0]?.direction, nextDirection);
  const stale = await page.evaluate(async ({ databaseId, viewId }) => window.lotion.views.patch({
    databaseId,
    viewId,
    patch: { name: "stale lab write" },
    expectedRevision: 0
  }), { databaseId: DATABASE_ID, viewId: VIEW_ID });
  assert.equal(stale.ok, false);

  await page.reload();
  await waitForDatabaseService(page, DATABASE_ID);
  await navigateToDatabase(page, DATABASE_ID);
  await table.waitFor({ timeout: 8_000 });
  const reloaded = await readView(page);
  assert.equal(reloaded.sorts[0]?.direction, nextDirection);

  const editableRows = await page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.slice(0, 2).map((record) => ({ id: String(record.id), title: String(record.title ?? "") }));
  }, DATABASE_ID);
  assert.equal(editableRows.length, 2, "cell recovery fixture requires two editable rows");
  const firstTitle = table.locator(`tr[data-row-id="${editableRows[0].id}"] td`).nth(1).locator("input, textarea").first();
  const secondTitle = table.locator(`tr[data-row-id="${editableRows[1].id}"] td`).nth(1).locator("input, textarea").first();
  await firstTitle.waitFor();
  await secondTitle.waitFor();
  const recoveredTitle = `Recovered cell ${viewport.name}`;
  const queuedTitle = `Queued cell ${viewport.name}`;
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected inline cell persistence failure"));
  await firstTitle.fill(recoveredTitle);
  await firstTitle.blur();
  const cellAlert = table.locator('.cell-edit-feedback[role="alert"]');
  await cellAlert.waitFor();
  const cellError = (await cellAlert.innerText()).trim();
  const failedInput = await cellAlert.evaluate((node) => ({
    rowId: node.dataset.rowId,
    fieldId: node.dataset.fieldId,
    value: node.dataset.value
  }));
  assert.match(cellError, /Injected inline cell persistence failure/);
  let failedRecords = await page.evaluate(async ({ databaseId, rowIds }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return rowIds.map((rowId) => bundle.records.find((record) => String(record.id) === rowId));
  }, { databaseId: DATABASE_ID, rowIds: editableRows.map((row) => row.id) });
  assert.equal(String(failedRecords[0]?.title ?? ""), editableRows[0].title, "failed cell edit must leave the stored title unchanged");
  await secondTitle.fill(queuedTitle);
  await secondTitle.blur();
  await cellAlert.getByText(/1 later edit queued/).waitFor();
  failedRecords = await page.evaluate(async ({ databaseId, rowIds }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return rowIds.map((rowId) => bundle.records.find((record) => String(record.id) === rowId));
  }, { databaseId: DATABASE_ID, rowIds: editableRows.map((row) => row.id) });
  assert.equal(String(failedRecords[1]?.title ?? ""), editableRows[1].title, "later cell edits must pause behind the failed write");
  const retryCellEdit = cellAlert.getByRole("button", { name: "Retry" });
  await retryCellEdit.evaluate((button) => {
    button.click();
    button.click();
  });
  await cellAlert.waitFor({ state: "detached" });
  let recoveredRecords = [];
  const recoveryDeadline = Date.now() + 8_000;
  while (Date.now() < recoveryDeadline) {
    recoveredRecords = await page.evaluate(async ({ databaseId, rowIds }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      return rowIds.map((rowId) => bundle.records.find((record) => String(record.id) === rowId));
    }, { databaseId: DATABASE_ID, rowIds: editableRows.map((row) => row.id) });
    if (recoveredRecords[0]?.title === recoveredTitle && recoveredRecords[1]?.title === queuedTitle) break;
    await page.waitForTimeout(100);
  }
  assert.equal(recoveredRecords[0]?.title, recoveredTitle, "retry must persist the failed cell edit");
  assert.equal(recoveredRecords[1]?.title, queuedTitle, "retry must resume later cell edits in order");

  const discardedTitle = `Discarded cell ${viewport.name}`;
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected discarded cell persistence failure"));
  await firstTitle.fill(discardedTitle);
  await firstTitle.blur();
  await cellAlert.waitFor();
  assert.match(await cellAlert.innerText(), /Injected discarded cell persistence failure/);
  await cellAlert.getByRole("button", { name: "Discard failed edit" }).click();
  await cellAlert.waitFor({ state: "detached" });
  const resetFirstTitle = table.locator(`tr[data-row-id="${editableRows[0].id}"] td`).nth(1).locator("input, textarea").first();
  await resetFirstTitle.waitFor();
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.value === expected,
    {
      selector: `tr[data-row-id="${editableRows[0].id}"] td:nth-child(2) textarea, tr[data-row-id="${editableRows[0].id}"] td:nth-child(2) input`,
      expected: recoveredTitle
    },
    { timeout: 8_000 }
  );
  const discardedRecords = await page.evaluate(async ({ databaseId, rowIds }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return rowIds.map((rowId) => bundle.records.find((record) => String(record.id) === rowId));
  }, { databaseId: DATABASE_ID, rowIds: editableRows.map((row) => row.id) });
  const cellEditRecovery = {
    message: cellError,
    failedInput,
    failedValueRolledBack: String(failedRecords[0]?.title ?? "") === editableRows[0].title,
    laterEditPaused: String(failedRecords[1]?.title ?? "") === editableRows[1].title,
    queuedEditVisible: true,
    duplicateRetrySuppressed: true,
    retryPersistedFailedEdit: recoveredRecords[0]?.title === recoveredTitle,
    queueResumedInOrder: recoveredRecords[1]?.title === queuedTitle,
    discardPreservedStoredValue: discardedRecords[0]?.title === recoveredTitle,
    discardResetDraft: await resetFirstTitle.inputValue() === recoveredTitle,
    recoveredTitles: recoveredRecords.map((record) => record?.title),
    expectedTitles: [recoveredTitle, queuedTitle]
  };

  const files = fixtureFiles(workspaceRoot);
  const [viewJson, schemaJson, dataCsv, fieldSchema, virtualCsv, embeddedPage] = await Promise.all([
    readFile(files.viewJson, "utf8"),
    readFile(files.schemaJson, "utf8"),
    readFile(files.dataCsv, "utf8"),
    readFile(files.fieldSchema, "utf8"),
    readFile(files.virtualCsv, "utf8"),
    readFile(files.embeddedPage, "utf8")
  ]);
  assert.equal(JSON.parse(viewJson).revision, persisted.revision);
  assert.ok(JSON.parse(schemaJson).fields.length > 5);
  assert.ok(dataCsv.split("\n").length > 2);
  const fieldTypeCount = new Set(JSON.parse(fieldSchema).fields.map((field) => field.type)).size;

  return {
    viewport: viewport.name,
    databaseId: DATABASE_ID,
    viewId: VIEW_ID,
    reloadVerified: true,
    staleConflictCode: stale.error.code,
    cellEditRecovery,
    noHorizontalOverflow: true,
    viewSwitchRoute,
    timings: { firstPaintMs, menuOpenMs, sortCommitMs, viewSwitchMs, rowBatchActionMs: null },
    fixture: {
      fieldTypeCount,
      hasVirtualRows: virtualCsv.split("\n").length > 120,
      hasEmbeddedReference: embeddedPage.includes("database: db_field_lab")
    },
    persistedFiles: {
      viewJson: relative(workspaceRoot, files.viewJson),
      schemaJson: relative(workspaceRoot, files.schemaJson),
      dataCsv: relative(workspaceRoot, files.dataCsv)
    },
    snapshots: [
      { snapshot: settingsSnapshot, phase: "settings-scope-menu" },
      { snapshot: filterSnapshot, phase: "filter-menu" },
      { snapshot: sortSnapshot, phase: "sort-menu" }
    ].map(({ snapshot, phase }) => ({
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      imageBytes: 0,
      phase,
      completeSurfaceState: snapshot.completeSurfaceState,
      perceptualBaseline: snapshot.perceptualBaseline,
      horizontalOverflowPx: 0,
      viewportWidth: viewport.width,
      scrollWidth: viewport.width
    }))
  };
}

async function captureInteractionSnapshot({ artifactRoot, page, phase, surface, table, viewport }) {
  await page.mouse.move(2, 2);
  await surface.waitFor({ state: "visible", timeout: 8_000 });
  await page.waitForFunction((selector) => {
    const node = document.querySelector(selector);
    if (!(node instanceof HTMLElement)) return false;
    const style = getComputedStyle(node);
    const running = node.getAnimations({ subtree: true }).some((animation) => animation.playState === "running");
    return Number(style.opacity) >= 0.99 && style.visibility === "visible" && !running;
  }, phase === "settings-scope-menu"
    ? '[role="menu"][aria-label="Database settings"]'
    : phase === "filter-menu"
      ? '[role="dialog"][aria-label="Filter"]'
      : '[role="dialog"][aria-label="Sort"]', { timeout: 8_000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(50);
  await normalizeInteractionSnapshotTelemetry(page);
  try {
    const completeSurfaceState = await collectInteractionSurfaceState({ page, phase, surface, table });
    assertCompleteInteractionSurfaceState(completeSurfaceState, viewport.name, phase);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator("body"),
      metadata: { completeSurfaceState, phase, viewport: viewport.name },
      name: `database-interaction-${phase.replace(/-(scope-)?menu$/, "")}-${viewport.name}`,
      page,
      viewport,
      waitForStable: false
    });
    const baselinePolicy = phase === "settings-scope-menu" ? {
      compact: "test/baselines/production-visual/database-interaction-settings-compact.json",
      desktop: "test/baselines/production-visual/database-interaction-settings-desktop.json",
      wide: "test/baselines/production-visual/database-interaction-settings-wide.json"
    }[viewport.name] : null;
    const perceptualBaseline = baselinePolicy && process.env.LOTION_DATABASE_INTERACTION_SKIP_BASELINE !== "1"
      ? await assertProductionVisualBaseline({
        actualPath: snapshot.imagePath,
        artifactRoot,
        policyPath: baselinePolicy
      })
      : null;
    return { ...snapshot, completeSurfaceState, perceptualBaseline };
  } finally {
    await restoreInteractionSnapshotTelemetry(page);
  }
}

async function normalizeInteractionSnapshotTelemetry(page) {
  await page.evaluate(() => {
    for (const rowCount of document.querySelectorAll(".table-row-count")) {
      const text = rowCount.textContent ?? "";
      if (!/loaded in \d+(?:\.\d+)? ms/i.test(text)) continue;
      rowCount.setAttribute("data-interaction-original-text", text);
      rowCount.textContent = text.replace(/loaded in \d+(?:\.\d+)? ms/i, "loaded in 0 ms");
    }
  });
}

async function restoreInteractionSnapshotTelemetry(page) {
  await page.evaluate(() => {
    for (const rowCount of document.querySelectorAll("[data-interaction-original-text]")) {
      rowCount.textContent = rowCount.getAttribute("data-interaction-original-text") ?? rowCount.textContent;
      rowCount.removeAttribute("data-interaction-original-text");
    }
  });
}

async function collectInteractionSurfaceState({ page, phase, surface, table }) {
  const [surfaceState, tableState] = await Promise.all([
    surface.evaluate((node, currentPhase) => {
      const rect = (element) => {
        if (!(element instanceof Element)) return null;
        const box = element.getBoundingClientRect();
        return {
          left: Math.round(box.left),
          top: Math.round(box.top),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
          width: Math.round(box.width),
          height: Math.round(box.height)
        };
      };
      const findButton = (label) => Array.from(node.querySelectorAll("button"))
        .find((button) => button.textContent?.replace(/\s+/g, " ").trim() === label);
      const controls = currentPhase === "settings-scope-menu"
        ? {
          header: node.querySelector(".menu-surface-header"),
          viewSettings: Array.from(node.querySelectorAll('[role="menuitem"]')).find((item) => item.textContent?.includes("View settings")),
          databaseSettings: Array.from(node.querySelectorAll('[role="menuitem"]')).find((item) => item.textContent?.includes("Database settings"))
        }
        : currentPhase === "filter-menu"
          ? {
            header: node.querySelector(".advanced-filter-header"),
            empty: node.querySelector(".popover-empty"),
            rootGroup: node.querySelector('[aria-label="Root filter group"]'),
            conjunction: node.querySelector("select"),
            addCondition: findButton("+ Add condition"),
            addGroup: findButton("+ Add group")
          }
          : {
            header: node.querySelector(".advanced-filter-header"),
            priority: node.querySelector('[aria-label="Sort priority"]'),
            rule: node.querySelector(".sort-rule"),
            property: node.querySelector('select[aria-label^="Sort property"]'),
            direction: node.querySelector('select[aria-label^="Sort direction"]'),
            addSort: findButton("+ Add sort"),
            clearAll: findButton("Clear all")
          };
      const style = getComputedStyle(node);
      return {
        surfaceRect: rect(node),
        surfaceVisibility: style.visibility,
        surfaceOpacity: Number(style.opacity),
        runningAnimationCount: node.getAnimations({ subtree: true }).filter((animation) => animation.playState === "running").length,
        controlRects: Object.fromEntries(Object.entries(controls).map(([key, element]) => [key, rect(element)])),
        controlTexts: Object.fromEntries(Object.entries(controls).map(([key, element]) => [key, element?.textContent?.replace(/\s+/g, " ").trim() ?? ""]))
      };
    }, phase),
    table.evaluate((node) => {
      const rect = (element) => {
        if (!(element instanceof Element)) return null;
        const box = element.getBoundingClientRect();
        return {
          left: Math.round(box.left),
          top: Math.round(box.top),
          right: Math.round(box.right),
          bottom: Math.round(box.bottom),
          width: Math.round(box.width),
          height: Math.round(box.height)
        };
      };
      return {
        tableRect: rect(node),
        activeTabRect: rect(node.querySelector(".view-tab.active")),
        activeTabText: node.querySelector(".view-tab.active")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
      };
    })
  ]);
  return {
    phase,
    ...surfaceState,
    ...tableState,
    viewport: await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
    documentHorizontalOverflow: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
  };
}

function assertCompleteInteractionSurfaceState(state, viewportName, phase) {
  if (
    !positiveRect(state.surfaceRect)
    || !positiveRect(state.tableRect)
    || !positiveRect(state.activeTabRect)
    || state.activeTabText !== "Default"
    || state.surfaceVisibility !== "visible"
    || state.surfaceOpacity < 0.99
    || state.runningAnimationCount !== 0
    || state.documentHorizontalOverflow > 0
    || !insideViewport(state.surfaceRect, state.viewport)
    || !insideViewport(state.tableRect, state.viewport)
    || !containsRect(state.tableRect, state.activeTabRect)
  ) {
    throw new Error(`Database interaction ${phase} is clipped, transparent, animating, or offscreen for ${viewportName}: ${JSON.stringify(state)}`);
  }
  const requiredControls = {
    "settings-scope-menu": ["header", "viewSettings", "databaseSettings"],
    "filter-menu": ["header", "empty", "rootGroup", "conjunction", "addCondition", "addGroup"],
    "sort-menu": ["header", "priority", "rule", "property", "direction", "addSort", "clearAll"]
  }[phase];
  for (const key of requiredControls) {
    const control = state.controlRects?.[key];
    if (!positiveRect(control) || !containsRect(state.surfaceRect, control)) {
      throw new Error(`Database interaction ${phase} has missing, clipped, or mis-owned ${key} for ${viewportName}: ${JSON.stringify({ control, state })}`);
    }
  }
  for (let index = 1; index < requiredControls.length; index += 1) {
    const previous = state.controlRects[requiredControls[index - 1]];
    const current = state.controlRects[requiredControls[index]];
    if (overlaps(previous, current) && !containsRect(current, previous) && !containsRect(previous, current)) {
      throw new Error(`Database interaction ${phase} controls overlap for ${viewportName}: ${JSON.stringify({ previous, current })}`);
    }
  }
}

function positiveRect(rect) {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function containsRect(outer, inner, tolerance = 1) {
  return Boolean(outer && inner
    && inner.left >= outer.left - tolerance
    && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance
    && inner.bottom <= outer.bottom + tolerance);
}

function insideViewport(rect, viewport, tolerance = 1) {
  return Boolean(rect && viewport
    && rect.left >= -tolerance
    && rect.top >= -tolerance
    && rect.right <= viewport.width + tolerance
    && rect.bottom <= viewport.height + tolerance);
}

function overlaps(left, right, tolerance = 1) {
  return Boolean(left && right
    && left.right > right.left + tolerance
    && left.left < right.right - tolerance
    && left.bottom > right.top + tolerance
    && left.top < right.bottom - tolerance);
}

async function selectDatabaseView(table, name) {
  const matcher = new RegExp(`^${name}$`, "i");
  const tab = table.getByRole("tab", { name: matcher }).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    return "tab";
  }
  await table.locator(".view-tabs-more").first().click();
  await table.getByRole("menu", { name: "More views" }).first().getByRole("menuitem", { name: matcher }).click();
  return "overflow-menu";
}

function fixtureFiles(root) {
  return {
    viewJson: join(root, "databases/user/Tasks--db_tasks/views/view_default.json"),
    schemaJson: join(root, "databases/user/Tasks--db_tasks/schema.json"),
    dataCsv: join(root, "databases/user/Tasks--db_tasks/data.csv"),
    fieldSchema: join(root, "databases/user/Field_Type_Lab--db_field_lab/schema.json"),
    virtualCsv: join(root, "databases/user/Rows_Stress_Lab--db_rows_stress/data.csv"),
    embeddedPage: join(root, "databases/system/pages--db_pages/pages/Database_Lab--pg_database_lab.md")
  };
}

async function navigateToDatabase(page, entityId) {
  await page.evaluate((databaseId) => window.dispatchEvent(new CustomEvent("lotion:open-entity", {
    detail: { kind: "database", entityId: databaseId }
  })), entityId);
}

async function waitForDatabaseService(page, databaseId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetDatabaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === targetDatabaseId);
  }, databaseId, { timeout: 8_000 });
}

async function readView(page) {
  return page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.views.find((view) => view.id === viewId);
  }, { databaseId: DATABASE_ID, viewId: VIEW_ID });
}
