#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseRowMenuArtifactContract } from "./lib/database-row-menu-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const SOURCE_ID = "row_task_1";
const SOURCE_TITLE = "Design sample workspace";

const result = await withLotionUIHarness("database-row-menu-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-row-menu-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseRowMenuArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get));
  await page.evaluate(async ({ databaseId, rowId }) => {
    await window.lotion.rowPages.update({ databaseId, rowId, markdown: "# Row menu body\n\nPreserve me." });
    await window.lotion.rowPages.setFullWidth({ databaseId, rowId, fullWidth: true });
    await window.lotion.rowPages.setSmallText({ databaseId, rowId, smallText: true });
    const bundle = await window.lotion.databases.get(databaseId);
    for (const [name, type] of [["List menu", "list"], ["Gallery menu", "gallery"], ["Calendar menu", "calendar"]]) {
      if (!bundle.views.some((view) => view.name === name)) await window.lotion.views.create({ databaseId, name, type, sourceMode: "empty" });
    }
  }, { databaseId: DATABASE_ID, rowId: SOURCE_ID });
  await page.reload();
  let table = await openDatabase(page);

  const sourceRow = table.locator(`tr[data-row-id="${SOURCE_ID}"]`);
  await sourceRow.click({ button: "right" });
  let menu = page.getByRole("menu", { name: `Row menu ${SOURCE_TITLE}` });
  await menu.waitFor();
  const menuText = await menu.innerText();
  for (const label of ["Open", "Open in new window", "Rename", "Edit properties", "Duplicate", "Copy link", "Delete"]) assert.match(menuText, new RegExp(label));
  const menuBox = await menu.boundingBox();
  assert.ok(menuBox && menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= viewport.width + 1 && menuBox.y + menuBox.height <= viewport.height + 1);
  assert.equal(await page.locator(".row-page-surface").count(), 0, "right-click must not open the row page");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem");
  await page.keyboard.press("Escape");

  menu = await openTableRowMenuByHandle(table, page, SOURCE_TITLE);
  await menu.getByRole("menuitem", { name: "Copy link" }).click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), `lotion://database/${DATABASE_ID}/row/${SOURCE_ID}`);

  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected row menu duplicate failure"));
  menu = await openTableRowMenuByHandle(table, page, SOURCE_TITLE);
  const duplicateAction = menu.getByRole("menuitem", { name: "Duplicate" });
  await duplicateAction.evaluate((button) => {
    button.click();
    button.click();
  });
  const duplicateAlert = menu.getByRole("alert");
  await duplicateAlert.waitFor();
  const duplicateError = (await duplicateAlert.innerText()).trim();
  assert.match(duplicateError, /Injected row menu duplicate failure/);
  assert.equal(await menu.count(), 1, "failed duplicate should retain the row menu");
  await duplicateAction.waitFor({ state: "visible" });
  assert.equal(await duplicateAction.isEnabled(), true, "failed duplicate should re-enable retry");
  const failedCopyCount = await rowTitleCount(page, `${SOURCE_TITLE} copy`);
  assert.equal(failedCopyCount, 0, "failed duplicate should create no hidden copy");
  await duplicateAction.click();
  await table.getByRole("button", { name: `Row actions ${SOURCE_TITLE} copy` }).waitFor();
  assert.equal(await rowTitleCount(page, `${SOURCE_TITLE} copy`), 1, "retry should create exactly one row copy");
  const menuRecovery = {
    message: duplicateError,
    menuRemainedOpen: true,
    duplicateSubmitSuppressed: failedCopyCount === 0,
    failedStateRolledBack: true,
    retryCreatedExactlyOnce: true
  };
  const duplicate = await page.evaluate(async ({ databaseId, sourceId, title }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const record = bundle.records.find((item) => item.title === `${title} copy`);
    const doc = await window.lotion.rowPages.open(databaseId, String(record.id));
    await window.lotion.rowPages.update({ databaseId, rowId: String(record.id), markdown: "Independent duplicate body" });
    const source = await window.lotion.rowPages.open(databaseId, sourceId);
    return { id: String(record.id), body: doc.markdown, fullWidth: doc.fullWidth, smallText: doc.meta.smallText, sourceBody: source.markdown };
  }, { databaseId: DATABASE_ID, sourceId: SOURCE_ID, title: SOURCE_TITLE });
  assert.equal(duplicate.body.trimEnd(), "# Row menu body\n\nPreserve me.");
  assert.equal(duplicate.fullWidth, true);
  assert.equal(duplicate.smallText, true);
  assert.equal(duplicate.sourceBody.trimEnd(), "# Row menu body\n\nPreserve me.");

  await page.evaluate(() => { window.prompt = () => "Independent copy"; });
  menu = await openTableRowMenuByHandle(table, page, `${SOURCE_TITLE} copy`);
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await page.waitForFunction(async ({ databaseId, rowId }) => (await window.lotion.databases.get(databaseId)).records.find((record) => String(record.id) === rowId)?.title === "Independent copy", { databaseId: DATABASE_ID, rowId: duplicate.id });

  menu = await openTableRowMenuByHandle(table, page, SOURCE_TITLE);
  await menu.getByRole("menuitem", { name: "Edit properties" }).click();
  await page.locator(".row-page-surface").waitFor();
  await page.locator(".row-page-breadcrumb-current", { hasText: SOURCE_TITLE }).waitFor();
  table = await openDatabase(page);

  for (const [viewName, rowSelector] of [["List menu", ".list-view-row"], ["Gallery menu", ".gallery-card"]]) {
    await selectView(table, page, viewName);
    const row = table.locator(rowSelector, { hasText: SOURCE_TITLE }).first();
    const handle = row.getByRole("button", { name: `Row actions ${SOURCE_TITLE}` });
    await handle.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menu", { name: `Row menu ${SOURCE_TITLE}` }).waitFor();
    assert.equal(await page.locator(".row-page-surface").count(), 0);
    await page.keyboard.press("Escape");
  }
  await selectView(table, page, "Calendar menu");
  await table.getByRole("button", { name: "‹" }).click();
  await table.getByRole("button", { name: "‹" }).click();
  const calendarRow = table.locator(`.calendar-cell-row[title="${SOURCE_TITLE}"]`).first();
  const calendarHandle = calendarRow.getByRole("button", { name: `Row actions ${SOURCE_TITLE}` });
  await calendarHandle.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menu", { name: `Row menu ${SOURCE_TITLE}` }).waitFor();
  await page.keyboard.press("Escape");

  await selectView(table, page, "Default");
  menu = await openTableRowMenuByHandle(table, page, SOURCE_TITLE);
  await confirmAction(page, () => menu.getByRole("menuitem", { name: "Delete" }).click(), /restore it from Deleted items/i);
  await page.waitForFunction(async ({ databaseId, rowId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.schema.deletedRows?.some((item) => String(item.record.id) === rowId) && await window.lotion.entities.resolve(rowId) === null;
  }, { databaseId: DATABASE_ID, rowId: SOURCE_ID });
  const deletedPageMeta = await page.evaluate(async ({ databaseId, rowId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.schema.deletedRows?.find((item) => String(item.record.id) === rowId)?.page?.meta;
  }, { databaseId: DATABASE_ID, rowId: SOURCE_ID });
  assert.equal(deletedPageMeta?.smallText, true, "the tombstone must retain small-text layout metadata");

  await page.reload();
  table = await openDatabase(page);
  let deleted = await openDeletedRows(page, table);
  const deletedRow = deleted.locator(`.deleted-property-row[data-row-id="${SOURCE_ID}"]`);
  await deletedRow.waitFor();
  await assertNoDocumentHorizontalOverflow(page, `row menu ${viewport.name}`);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "deleted-row", viewport: viewport.name },
    name: `database-row-menu-${viewport.name}`,
    page,
    viewport
  });
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected deleted row restore failure"));
  const restoreAction = deletedRow.getByRole("button", { name: "Restore" });
  await restoreAction.evaluate((button) => {
    button.click();
    button.click();
  });
  const restoreAlert = deleted.getByRole("alert");
  await restoreAlert.waitFor();
  const restoreError = (await restoreAlert.innerText()).trim();
  assert.match(restoreError, /Injected deleted row restore failure/);
  assert.equal(await deleted.count(), 1, "failed restore should retain the dialog");
  assert.equal(await deletedRow.count(), 1, "failed restore should retain the tombstone row");
  await restoreAction.waitFor({ state: "visible" });
  assert.equal(await restoreAction.isEnabled(), true, "failed restore should re-enable retry");
  const failedRestore = await rowLifecycleState(page, SOURCE_ID);
  assert.deepEqual(failedRestore, { active: false, tombstoned: true, resolves: false }, "failed duplicate restore must not secretly restore the row");
  await restoreAction.click();
  await deletedRow.waitFor({ state: "detached" });
  await page.waitForFunction(async ({ databaseId, rowId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.some((record) => String(record.id) === rowId) && (await window.lotion.entities.resolve(rowId))?.rowId === rowId;
  }, { databaseId: DATABASE_ID, rowId: SOURCE_ID });
  const restored = await page.evaluate(({ databaseId, rowId }) => window.lotion.rowPages.open(databaseId, rowId), { databaseId: DATABASE_ID, rowId: SOURCE_ID });
  assert.equal(restored.markdown.trimEnd(), "# Row menu body\n\nPreserve me.");
  assert.equal(restored.fullWidth, true);
  assert.equal(restored.meta.smallText, true);
  const restoreRecovery = {
    message: restoreError,
    dialogRemainedOpen: true,
    duplicateSubmitSuppressed: failedRestore.active === false,
    failedStateRolledBack: failedRestore.tombstoned && !failedRestore.resolves,
    tombstoneRetained: true,
    retryRestoredExactlyOnce: true
  };
  await deleted.getByRole("button", { name: "Close" }).click();

  table = page.locator(".database-table:not(.embedded-table)").first();
  menu = await openTableRowMenuByHandle(table, page, "Independent copy");
  await confirmAction(page, () => menu.getByRole("menuitem", { name: "Delete" }).click(), /restore it from Deleted items/i);
  deleted = await openDeletedRows(page, table);
  const disposable = deleted.locator(`.deleted-property-row[data-row-id="${duplicate.id}"]`);
  await confirmAction(page, () => disposable.getByRole("button", { name: "Permanently delete" }).click(), /Permanently delete this row and its page body/i);
  await page.waitForFunction(async ({ databaseId, rowId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    if (bundle.schema.deletedRows?.some((item) => String(item.record.id) === rowId)) return false;
    try { await window.lotion.rowPages.open(databaseId, rowId); return false; } catch { return true; }
  }, { databaseId: DATABASE_ID, rowId: duplicate.id });

  return {
    viewport: viewport.name,
    menuActions: 7,
    keyboardMenu: true,
    rightClickIsolated: true,
    copyLink: true,
    rename: true,
    editProperties: true,
    crossView: true,
    focusHandles: true,
    duplicateBody: true,
    duplicateMetadata: true,
    duplicateIndependent: true,
    menuRecovery,
    tombstoneReloaded: true,
    ghostPageRemoved: true,
    restoredBody: true,
    restoredMetadata: true,
    restoreRecovery,
    permanentDelete: true,
    noHorizontalOverflow: true,
    snapshot: { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath }
  };
}

async function openDatabase(page) {
  await page.locator(".main-content").waitFor({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get), null, { timeout: 8_000 });
  const sidebarEntry = page.locator('.sidebar-database-tree button[title="Tasks"]').first();
  await sidebarEntry.waitFor({ timeout: 8_000 });
  await sidebarEntry.click();
  const table = page.locator(".database-table:not(.embedded-table)").first();
  await table.waitFor({ timeout: 8_000 });
  return table;
}

async function rowLifecycleState(page, rowId) {
  return page.evaluate(async ({ databaseId, rowId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return {
      active: bundle.records.some((record) => String(record.id) === rowId),
      tombstoned: Boolean(bundle.schema.deletedRows?.some((item) => String(item.record.id) === rowId)),
      resolves: Boolean(await window.lotion.entities.resolve(rowId))
    };
  }, { databaseId: DATABASE_ID, rowId });
}

async function rowTitleCount(page, title) {
  return page.evaluate(async ({ databaseId, title }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.filter((record) => record.title === title).length;
  }, { databaseId: DATABASE_ID, title });
}

async function openTableRowMenuByHandle(table, page, title) {
  const handle = table.getByRole("button", { name: `Row actions ${title}` }).first();
  await handle.click();
  const menu = page.getByRole("menu", { name: `Row menu ${title}` });
  await menu.waitFor();
  return menu;
}

async function selectView(table, page, name) {
  const tab = table.locator(".view-tab", { hasText: name });
  if (await tab.count()) return tab.click();
  await table.locator(".view-tabs-more").click();
  await page.getByRole("menu", { name: "More views" }).getByRole("menuitem", { name }).click();
}

async function openDeletedRows(page, table) {
  await table.getByRole("button", { name: "View settings" }).click();
  await page.getByRole("menuitem", { name: "Database settings" }).click();
  await page.getByRole("menuitem", { name: "Deleted items" }).click();
  const dialog = page.getByRole("dialog", { name: "Recently deleted rows" });
  await dialog.waitFor();
  return dialog;
}

async function confirmAction(page, action, messagePattern) {
  await page.evaluate(() => {
    const original = window.confirm;
    window.__lotionSmokeConfirmMessage = undefined;
    window.confirm = (message) => {
      window.__lotionSmokeConfirmMessage = String(message);
      window.confirm = original;
      return true;
    };
  });
  await action();
  assert.match(await page.evaluate(() => window.__lotionSmokeConfirmMessage ?? ""), messagePattern);
}
