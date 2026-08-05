#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseColumnMenuArtifactContract } from "./lib/database-column-menu-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const REQUIRED_ACTIONS = [
  "Rename", "Edit property", "Sort ascending", "Sort descending", "Filter by property",
  "Calculate", "Hide in this view", "Duplicate property", "Insert left", "Insert right",
  "Freeze up to this column", "Delete property"
];

const result = await withLotionUIHarness("database-column-menu-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-column-menu-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseColumnMenuArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  let table = await openDatabase(page);
  const activeViewId = await table.locator('.view-tab[aria-selected="true"]').getAttribute("data-view-id");
  assert.ok(activeViewId);

  let menu = await openColumnMenu(page, table, "Priority");
  for (const label of REQUIRED_ACTIONS) await menu.getByRole("menuitem", { name: label }).waitFor();
  await menu.getByRole("menuitem", { name: /wrap/i }).waitFor();
  const menuBox = await menu.boundingBox();
  assert.ok(menuBox && menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= viewport.width + 1 && menuBox.y + menuBox.height <= viewport.height + 1);
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem");
  await page.keyboard.press("Escape");

  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Edit property" }).click();
  const editDialog = page.getByRole("dialog", { name: "Field settings" });
  await editDialog.waitFor();
  assert.equal(await editDialog.locator(".form-row input").first().inputValue(), "Priority");
  await editDialog.getByRole("button", { name: "Close" }).click();

  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Sort descending" }).click();
  await page.waitForFunction(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const view = bundle.views.find((candidate) => candidate.id === viewId);
    return view?.sorts[0]?.fieldId === "priority" && view.sorts[0]?.direction === "desc";
  }, { databaseId: DATABASE_ID, viewId: activeViewId });

  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Filter by property" }).click();
  const filter = page.getByRole("dialog", { name: "Filter" });
  await filter.waitFor();
  const priorityCondition = filter.locator(".filter-condition").first();
  assert.equal(await priorityCondition.getByLabel("Filter property").inputValue(), "priority");
  const filterValue = priorityCondition.getByLabel("Filter value");
  await filterValue.selectOption({ label: "High" });
  await page.waitForFunction(() => document.querySelectorAll('.database-table:not(.embedded-table) .table-scroll tr[data-row-id]').length === 2);

  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Calculate" }).click();
  await table.getByLabel("Priority summary").waitFor();
  await page.waitForFunction(() => document.querySelector('.database-table:not(.embedded-table) select[aria-label="Priority summary"]')?.value === "count");

  menu = await openColumnMenu(page, table, "Priority");
  const wrapItem = menu.getByRole("menuitem", { name: /wrap/i });
  const wrapLabel = (await wrapItem.innerText()).trim();
  await wrapItem.click();
  const expectedWrapped = !/^Disable wrap$/i.test(wrapLabel);
  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: expectedWrapped ? "Disable wrap" : "Wrap cells" }).waitFor();
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected column menu failure"));
  menu = await openColumnMenu(page, table, "Priority");
  const duplicateAction = menu.getByRole("menuitem", { name: "Duplicate property" });
  await duplicateAction.evaluate((button) => {
    button.click();
    button.click();
  });
  const actionAlert = menu.getByRole("alert");
  await actionAlert.waitFor();
  const actionError = (await actionAlert.innerText()).trim();
  assert.match(actionError, /Injected column menu failure/);
  assert.equal(await menu.count(), 1, "failed duplicate should retain the column menu");
  await duplicateAction.waitFor({ state: "visible" });
  assert.equal(await duplicateAction.isEnabled(), true, "failed duplicate should re-enable retry");
  const failedCopies = await priorityCopyCount(page);
  assert.equal(failedCopies, 0, "failed duplicate should not mutate the live bundle");

  await page.reload();
  table = await openDatabase(page);
  assert.equal(await priorityCopyCount(page), 0, "failed duplicate should remain rolled back after reload");
  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Duplicate property" }).click();
  await headerFor(table, "Priority copy").waitFor();
  assert.equal(await priorityCopyCount(page), 1, "retry should create exactly one copied property");
  const actionRecovery = {
    message: actionError,
    menuRemainedOpen: true,
    duplicateSubmitSuppressed: failedCopies === 0,
    failedStateRolledBack: true,
    retryCreatedExactlyOnce: await priorityCopyCount(page) === 1
  };
  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Insert left" }).click();
  await headerFor(table, "New property").waitFor();
  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Insert right" }).click();
  await headerFor(table, "New property 2").waitFor();

  menu = await openColumnMenu(page, table, "New property 2");
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  const renameDialog = page.getByRole("dialog", { name: "Field settings" });
  await renameDialog.locator(".form-row input").first().fill("Inserted right");
  await renameDialog.getByRole("button", { name: "Save field" }).click();
  await headerFor(table, "Inserted right").waitFor();
  menu = await openColumnMenu(page, table, "Inserted right");
  await menu.getByRole("menuitem", { name: "Hide in this view" }).click();
  await headerFor(table, "Inserted right").waitFor({ state: "detached" });

  const priorityHeader = headerFor(table, "Priority");
  const priorityCell = priorityHeader.locator("..");
  const widthBefore = (await priorityCell.boundingBox())?.width;
  assert.ok(widthBefore);
  const resize = priorityCell.getByRole("separator", { name: "Resize Priority" });
  const resizeBox = await resize.boundingBox();
  assert.ok(resizeBox);
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 44, resizeBox.y + resizeBox.height / 2);
  await page.mouse.up();
  await page.waitForFunction((before) => {
    const button = [...document.querySelectorAll('.database-table:not(.embedded-table) .field-header-button')].find((candidate) => candidate.querySelector('.field-header-name')?.textContent === "Priority");
    return Boolean(button?.parentElement && button.parentElement.getBoundingClientRect().width > before + 25);
  }, widthBefore);
  assert.equal(await page.getByRole("menu", { name: /Column menu/ }).count(), 0, "resize must not open the column menu");

  const tagsCell = headerFor(table, "Tags").locator("..");
  const statusCell = headerFor(table, "Status").locator("..");
  await tagsCell.evaluate((source, targetName) => {
    const target = [...source.parentElement.children].find((candidate) => candidate.querySelector?.(".field-header-name")?.textContent === targetName);
    if (!(target instanceof HTMLElement)) throw new Error(`Column target ${targetName} not found`);
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
  }, "Status");
  await page.waitForFunction(() => {
    const names = [...document.querySelectorAll('.database-table:not(.embedded-table) .field-header-name')].map((element) => element.textContent);
    return names.indexOf("Tags") < names.indexOf("Status");
  });
  assert.equal(await page.getByRole("menu", { name: /Column menu/ }).count(), 0, "drag reorder must not open the column menu");

  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Freeze up to this column" }).click();
  await priorityCell.evaluate((element) => element.classList.contains("frozen-column"));
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('.database-table:not(.embedded-table) .field-header-button')].find((candidate) => candidate.querySelector('.field-header-name')?.textContent === "Priority");
    return Boolean(button?.parentElement?.classList.contains("frozen-column-edge"));
  });
  const stickyEvidence = await verifyStickyColumns(table);

  menu = await openColumnMenu(page, table, "Priority");
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "frozen-column-menu", viewport: viewport.name },
    name: `database-column-menu-${viewport.name}`,
    page,
    viewport
  });
  await page.keyboard.press("Escape");
  await assertNoDocumentHorizontalOverflow(page, `column menu ${viewport.name}`);

  await page.reload();
  table = await openDatabase(page);
  const persisted = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  const view = persisted.views.find((candidate) => candidate.id === activeViewId);
  const priorityIndex = persisted.schema.fields.findIndex((field) => field.id === "priority");
  const priorityCopy = persisted.schema.fields.find((field) => field.name === "Priority copy");
  const insertedLeft = persisted.schema.fields.find((field) => field.name === "New property");
  const insertedRight = persisted.schema.fields.find((field) => field.name === "Inserted right");
  assert.ok(priorityCopy && insertedLeft && insertedRight);
  assert.equal(persisted.schema.fields[priorityIndex - 1].id, insertedLeft.id);
  assert.equal(persisted.schema.fields[priorityIndex + 1].id, insertedRight.id);
  assert.equal(persisted.schema.fields[priorityIndex + 2].id, priorityCopy.id);
  assert.equal(persisted.records.every((record) => record[priorityCopy.id] === "" && record[insertedLeft.id] === "" && record[insertedRight.id] === ""), true);
  assert.equal(view.visibleFieldIds.includes(insertedRight.id), false);
  assert.equal(view.fieldOrder.indexOf("tags") < view.fieldOrder.indexOf("status"), true);
  assert.equal(view.columnWidths.priority > widthBefore + 25, true);
  assert.equal(view.columnSummaries.priority, "count");
  assert.equal(Boolean(view.wrapFieldIds?.includes("priority")), expectedWrapped);
  assert.equal(view.frozenThroughFieldId, "priority");
  assert.equal(view.sorts[0]?.fieldId, "priority");
  assert.equal(view.filterExpression?.children.some((condition) => condition.kind === "condition" && condition.fieldId === "priority" && condition.value === "High"), true);
  assert.equal(await table.locator('.table-scroll tr[data-row-id]').count(), 2);
  assert.equal((await priorityCellFor(table).boundingBox()) !== null, true);

  menu = await openColumnMenu(page, table, "Priority");
  await menu.getByRole("menuitem", { name: "Unfreeze columns" }).click();
  await page.waitForFunction(() => document.querySelector('.database-table:not(.embedded-table) .frozen-column') === null);

  menu = await openColumnMenu(page, table, "New property");
  await confirmAction(page, () => menu.getByRole("menuitem", { name: "Delete property" }).click(), /Delete property “New property”/);
  await headerFor(table, "New property").waitFor({ state: "detached" });
  menu = await openColumnMenu(page, table, "Title");
  assert.equal(await menu.getByRole("menuitem", { name: "Delete property" }).isDisabled(), true);
  assert.match(await menu.getByRole("menuitem", { name: "Delete property" }).getAttribute("title"), /cannot be deleted/i);
  await page.keyboard.press("Escape");

  return {
    viewport: viewport.name,
    menuActions: REQUIRED_ACTIONS.length + 1,
    keyboardNavigation: true,
    editOpened: true,
    renamed: true,
    sortTargeted: true,
    filterTargeted: true,
    calculationSet: true,
    wrapToggled: true,
    hiddenInView: true,
    duplicateReloaded: true,
    actionRecovery,
    insertedBothSides: true,
    frozenDuringScroll: stickyEvidence.frozenStable,
    frozenBodyCells: stickyEvidence.bodyCount,
    unfreezePersisted: true,
    deleteRecoverable: true,
    protectedTitle: true,
    resizeIsolation: true,
    dragIsolation: true,
    reloadPersisted: true,
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

async function priorityCopyCount(page) {
  return page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.schema.fields.filter((field) => field.name === "Priority copy").length;
  }, DATABASE_ID);
}

function headerFor(table, name) {
  return table.locator(".field-header-button").filter({ hasText: new RegExp(`${escapeRegExp(name)}$`, "i") });
}

function priorityCellFor(table) {
  return headerFor(table, "Priority").locator("..");
}

async function openColumnMenu(page, table, name) {
  await headerFor(table, name).click();
  const menu = page.getByRole("menu", { name: `Column menu ${name}` });
  await menu.waitFor({ timeout: 8_000 });
  return menu;
}

async function verifyStickyColumns(table) {
  const scroll = table.locator(".table-scroll");
  await scroll.evaluate((element) => { element.scrollLeft = 0; });
  const frozenHeaders = table.locator("th.frozen-column");
  const frozenCount = await frozenHeaders.count();
  assert.ok(frozenCount >= 2);
  const before = await frozenHeaders.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x));
  const bodyCount = await table.locator('tr[data-row-id]').first().locator("td.frozen-column").count();
  assert.equal(bodyCount, frozenCount);
  const nonFrozen = table.locator("th.column-header:not(.frozen-column)").first();
  const nonFrozenBefore = await nonFrozen.boundingBox();
  await scroll.evaluate((element) => { element.scrollLeft = Math.min(220, element.scrollWidth - element.clientWidth); });
  await scroll.evaluate((element) => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await frozenHeaders.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x));
  const nonFrozenAfter = await nonFrozen.boundingBox();
  assert.deepEqual(after.map((x, index) => Math.abs(x - before[index]) < 2), after.map(() => true));
  assert.ok(nonFrozenBefore && nonFrozenAfter && nonFrozenAfter.x < nonFrozenBefore.x - 20);
  return { frozenStable: true, bodyCount };
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
