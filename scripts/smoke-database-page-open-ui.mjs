#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDatabasePageOpenArtifactContract } from "./lib/database-page-open-artifacts.mjs";
import { assertWithinViewport, captureElementSnapshot, forEachViewport, selectedViewports, withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const ROW_ID = "row_task_1";
const ORIGINAL_TITLE = "Design sample workspace";

const result = await withLotionUIHarness("database-page-open-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-page-open-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabasePageOpenArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  const viewIds = await ensureViews(page);
  let table = await openDatabase(page, "view_default");
  await chooseMode(table, page, "Side peek", "Default");
  let row = table.locator(`tr[data-row-id="${ROW_ID}"]`);
  await row.getByLabel("Select row 1", { exact: true }).check();
  const tableScroll = table.locator(".table-scroll");
  const scrollLeft = await tableScroll.evaluate((element) => {
    element.scrollLeft = Math.min(220, element.scrollWidth - element.clientWidth);
    return element.scrollLeft;
  });
  assert.ok(scrollLeft > 0, "table fixture must provide horizontal scroll state");
  await row.locator(".title-cell-open").evaluate((element) => { element.focus({ preventScroll: true }); element.click(); });
  let peek = page.locator(".row-page-peek-backdrop.side_peek .row-page-peek");
  await peek.waitFor();
  assert.equal(await table.count(), 1, "database must stay mounted behind a peek");
  const editedTitle = `${ORIGINAL_TITLE} ${viewport.name} peek edited`;
  await peek.locator(".title-input").fill(editedTitle);
  await peek.locator(".title-input").blur();
  await page.waitForFunction(async ({ title }) => (await window.lotion.databases.get("db_tasks")).records.find((record) => String(record.id) === "row_task_1")?.title === title, { title: editedTitle });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+[" : "Control+[");
  await peek.waitFor({ state: "detached" });
  assert.equal(await page.locator(".page-header h1", { hasText: /^Tasks$/ }).count(), 1, "Back should close the transient peek before navigating the database");
  assert.equal(await tableScroll.evaluate((element) => element.scrollLeft), scrollLeft, "peek close should preserve table scroll");
  assert.equal(await row.getByLabel("Select row 1", { exact: true }).isChecked(), true, "peek close should preserve selection");
  assert.equal(await page.evaluate((rowId) => document.activeElement?.closest(`[data-row-id="${rowId}"]`) !== null, ROW_ID), true, "peek close should restore focus to the origin row");
  await row.getByText(editedTitle, { exact: true }).waitFor();

  await selectView(table, page, "Smoke list");
  await page.locator(".list-view-row", { hasText: editedTitle }).click();
  peek = page.locator(".row-page-peek-backdrop.center_peek .row-page-peek");
  await peek.waitFor();
  await assertWithinViewport(page, peek, `${viewport.name} center peek`);
  const snapshot = await captureElementSnapshot({ artifactRoot, locator: page.locator("body"), metadata: { phase: "center-peek", viewport: viewport.name }, name: `database-page-open-${viewport.name}`, page, viewport });
  await page.keyboard.press("Escape");
  await peek.waitFor({ state: "detached" });

  await page.reload();
  table = await openDatabase(page, viewIds.list);
  assert.equal(await page.locator(".row-page-peek").count(), 0, "reload must not reopen a transient peek");
  await page.locator(".list-view-row", { hasText: editedTitle }).click();
  await page.locator(".row-page-peek-backdrop.center_peek .row-page-peek").waitFor();
  await page.getByRole("button", { name: "Open as full page" }).click();
  await page.locator(".row-page-surface").waitFor();
  assert.equal(await page.locator(".row-page-peek").count(), 0);
  await page.getByRole("button", { name: /Tasks/ }).first().click();
  table = page.locator(".database-table:not(.embedded-table)").first();
  await table.waitFor();
  await page.locator(".list-view-body").waitFor();

  await selectView(table, page, "Smoke gallery");
  await page.locator(".gallery-card", { hasText: editedTitle }).click();
  await page.locator(".row-page-peek-backdrop.side_peek .row-page-peek").waitFor();
  await page.keyboard.press("Escape");

  await selectView(table, page, "Smoke calendar");
  await page.getByRole("button", { name: "‹" }).click();
  await page.getByRole("button", { name: "‹" }).click();
  await page.locator(".calendar-cell-row", { hasText: editedTitle }).click();
  await page.locator(".row-page-peek-backdrop.center_peek .row-page-peek").waitFor();
  await page.keyboard.press("Escape");

  await selectView(table, page, "Board");
  const kanbanCard = page.locator(`.kanban-card[data-row-id="${ROW_ID}"]`);
  await kanbanCard.click();
  await page.locator(".row-page-peek-backdrop.center_peek .row-page-peek").waitFor();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  const kanbanFocus = await page.evaluate(() => ({ activeClass: document.activeElement?.className, activeRowId: document.activeElement?.getAttribute("data-row-id"), activeTag: document.activeElement?.tagName }));
  assert.deepEqual(kanbanFocus, { activeClass: "kanban-card", activeRowId: ROW_ID, activeTag: "DIV" }, `Kanban peek should restore focus to its card: ${JSON.stringify(kanbanFocus)}`);

  await selectView(table, page, "Default");
  await chooseMode(table, page, "Full page", "Default");
  await table.locator(`tr[data-row-id="${ROW_ID}"] .title-cell-open`).click({ force: true });
  await page.locator(".row-page-surface").waitFor();
  assert.equal(await page.locator(".row-page-peek").count(), 0);
  await page.getByRole("button", { name: /Tasks/ }).first().click();
  table = page.locator(".database-table:not(.embedded-table)").first();
  await chooseMode(table, page, "Side peek", "Default");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("lotion:open-database-row-link", { detail: "lotion://database/db_tasks/row/row_task_1" })));
  await page.locator(".row-page-surface").waitFor();
  assert.equal(await page.locator(".row-page-peek").count(), 0, "canonical row links must target the full row page, not a transient peek");

  const persisted = await page.evaluate(async () => Object.fromEntries((await window.lotion.databases.get("db_tasks")).views.filter((view) => ["Default", "Smoke list", "Smoke gallery", "Smoke calendar", "Board"].includes(view.name)).map((view) => [view.name, view.pageOpenMode])));
  assert.deepEqual(persisted, { Default: "side_peek", "Smoke list": "center_peek", "Smoke gallery": "side_peek", "Smoke calendar": "center_peek", Board: "center_peek" });
  return {
    viewport: viewport.name,
    sidePeek: true,
    centerPeek: true,
    fullPage: true,
    list: true,
    gallery: true,
    calendar: true,
    kanban: true,
    editShared: true,
    focusRestored: true,
    scrollPreserved: true,
    selectionPreserved: true,
    backClosesPeek: true,
    reloadTransientClear: true,
    deepLinkFullPage: true,
    snapshot: { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath }
  };
}

async function ensureViews(page) {
  await page.waitForFunction(() => Boolean(window.lotion?.views?.create));
  return page.evaluate(async () => {
    let bundle = await window.lotion.databases.get("db_tasks");
    const specs = [
      { id: "view_smoke_list", name: "Smoke list", type: "list", pageOpenMode: "center_peek" },
      { id: "view_smoke_gallery", name: "Smoke gallery", type: "gallery", pageOpenMode: "side_peek" },
      { id: "view_smoke_calendar", name: "Smoke calendar", type: "calendar", pageOpenMode: "center_peek", dateFieldId: "due_date" }
    ];
    for (const spec of specs) {
      if (!bundle.views.some((view) => view.name === spec.name)) bundle = await window.lotion.views.create({ databaseId: "db_tasks", name: spec.name, type: spec.type, sourceMode: "empty" });
      const view = bundle.views.find((candidate) => candidate.name === spec.name);
      const patched = await window.lotion.views.patch({ databaseId: "db_tasks", viewId: view.id, patch: { pageOpenMode: spec.pageOpenMode, dateFieldId: spec.dateFieldId }, expectedRevision: view.revision ?? 0 });
      bundle = patched.bundle;
    }
    const board = bundle.views.find((view) => view.name === "Board");
    const boardPatched = await window.lotion.views.patch({ databaseId: "db_tasks", viewId: board.id, patch: { pageOpenMode: "center_peek" }, expectedRevision: board.revision ?? 0 });
    bundle = boardPatched.bundle;
    return {
      list: bundle.views.find((view) => view.name === "Smoke list").id,
      gallery: bundle.views.find((view) => view.name === "Smoke gallery").id,
      calendar: bundle.views.find((view) => view.name === "Smoke calendar").id,
      board: bundle.views.find((view) => view.name === "Board").id
    };
  });
}

async function openDatabase(page, viewId) {
  await page.locator(".startup-loading").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get));
  await page.evaluate(({ databaseId, viewId: activeViewId }) => localStorage.setItem(`lotion.database.lastActiveView.${databaseId}`, activeViewId), { databaseId: DATABASE_ID, viewId });
  await page.evaluate((databaseId) => window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: { kind: "database", entityId: databaseId } })), DATABASE_ID);
  await page.locator(".page-header h1").filter({ hasText: /^Tasks$/ }).waitFor();
  return page.locator(".database-table:not(.embedded-table)").first();
}

async function chooseMode(table, page, label, viewName) {
  await table.getByRole("button", { name: "View settings" }).click();
  await page.getByRole("menuitem", { name: "View settings" }).click();
  await page.getByRole("menuitem", { name: /Open pages in/ }).click();
  await page.getByRole("menu", { name: "Open pages in menu" }).getByRole("menuitem", { name: new RegExp(label) }).click();
  const expected = { "Side peek": "side_peek", "Center peek": "center_peek", "Full page": "full_page" }[label];
  await page.waitForFunction(async ({ expectedMode, viewName: name }) => (await window.lotion.databases.get("db_tasks")).views.find((view) => view.name === name)?.pageOpenMode === expectedMode, { expectedMode: expected, viewName });
}

async function selectView(table, page, name) {
  const tab = table.locator(".view-tab", { hasText: name });
  if (await tab.count()) return tab.click();
  await table.locator(".view-tabs-more").click();
  await page.getByRole("menu", { name: "More views" }).getByRole("menuitem", { name }).click();
}
