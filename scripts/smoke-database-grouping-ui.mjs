#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDatabaseGroupingArtifactContract } from "./lib/database-grouping-artifacts.mjs";
import { assertWithinViewport, captureElementSnapshot, withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const result = await withLotionUIHarness("database-grouping-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "lotion-grouping-"));
  await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWorkspace(workspaceRoot); await page.waitForTimeout(500); await openDatabase(page);
  const table = page.locator(".database-table:not(.embedded-table)").first();
  const activeViewId = await table.locator('.view-tab[aria-selected="true"]').getAttribute("data-view-id");
  assert.ok(activeViewId);
  await table.getByRole("button", { name: "View settings" }).click();
  await page.getByRole("menuitem", { name: "View settings" }).click();
  await page.getByRole("menuitem", { name: "Group" }).click();
  const dialog = page.getByRole("dialog", { name: "Group settings" });
  await dialog.getByLabel("Group by").selectOption("status");
  await dialog.getByLabel("Sub-group by").selectOption("priority");
  await dialog.getByLabel("Hide empty groups").check();
  await dialog.getByLabel("Hide empty sub-groups").check();
  await dialog.getByLabel("Collapse Done").check();
  await dialog.getByLabel("Collapse Low").check();
  await assertWithinViewport(page, dialog, "group settings dialog");
  await page.evaluate(() => window.lotion.debug.failNextDatabaseViewWrite("Injected grouping save failure"));
  const saveGrouping = dialog.getByRole("button", { name: "Save grouping" });
  await saveGrouping.evaluate((button) => {
    button.click();
    button.click();
  });
  const saveAlert = dialog.getByRole("alert");
  await saveAlert.waitFor();
  const saveError = (await saveAlert.innerText()).trim();
  assert.match(saveError, /Injected grouping save failure/);
  assert.equal(await dialog.count(), 1, "failed grouping save should retain the dialog");
  assert.equal(await dialog.getByLabel("Group by", { exact: true }).inputValue(), "status", "failed save should retain the primary draft");
  assert.equal(await dialog.getByLabel("Sub-group by", { exact: true }).inputValue(), "priority", "failed save should retain the secondary draft");
  await saveGrouping.waitFor({ state: "visible" });
  assert.equal(await saveGrouping.isEnabled(), true, "failed grouping save should re-enable retry");
  const failedGroups = await persistedGroups(page, activeViewId);
  assert.deepEqual(failedGroups, [], "failed duplicate save should not persist grouping");
  await saveGrouping.click();
  await table.locator('tr.database-group-row[data-group-key="option:opt_done"]').waitFor();
  const recoveredGroups = await persistedGroups(page, activeViewId);
  assert.equal(recoveredGroups.length, 2, "retry should persist exactly one primary/secondary grouping configuration");
  const saveRecovery = {
    message: saveError,
    dialogRemainedOpen: true,
    duplicateSubmitSuppressed: failedGroups.length === 0,
    failedStateRolledBack: true,
    draftRetained: true,
    retryPersistedExactlyOnce: recoveredGroups.length === 2
  };
  assert.equal(await table.locator('tr.database-group-row[data-group-key="__empty__"]').count(), 0);
  assert.equal(await table.locator('tr[data-row-id="row_task_1"]').count(), 0, "collapsed Done group should hide its row");
  const todoMedium = table.locator('tr.database-subgroup-row[data-group-key="option:opt_todo"][data-subgroup-key="option:opt_medium"]');
  const todoLow = table.locator('tr.database-subgroup-row[data-group-key="option:opt_todo"][data-subgroup-key="option:opt_low"]');
  await todoMedium.waitFor(); await todoLow.waitFor();
  assert.equal(await table.locator('tr[data-row-id="row_task_3"]').count(), 1, "expanded Medium subgroup should show its row");
  assert.equal(await table.locator('tr[data-row-id="row_task_4"]').count(), 0, "collapsed Low subgroup should hide its row");
  const beforeIds = await page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).records.map((record) => String(record.id)), DATABASE_ID);
  const addGroupedRow = todoMedium.getByRole("button", { name: "Add row to Todo / Medium" });
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected grouped row creation failure"));
  await addGroupedRow.evaluate((button) => {
    button.click();
    button.click();
  });
  const rowCreationAlert = table.locator('.row-creation-feedback[role="alert"]');
  await rowCreationAlert.waitFor();
  const rowCreationError = (await rowCreationAlert.innerText()).trim();
  assert.match(rowCreationError, /Injected grouped row creation failure/);
  assert.equal(await addGroupedRow.isDisabled(), true, "failed grouped creation should block competing row creation");
  const failedIds = await page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).records.map((record) => String(record.id)), DATABASE_ID);
  assert.deepEqual(failedIds, beforeIds, "failed grouped creation must not leave a partial unassigned row");
  const retryCreation = rowCreationAlert.getByRole("button", { name: "Retry" });
  await retryCreation.evaluate((button) => {
    button.click();
    button.click();
  });
  await rowCreationAlert.waitFor({ state: "detached" });
  await page.waitForTimeout(300);
  const createdRecord = await page.evaluate(async ({ databaseId, beforeIds }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.find((record) => !beforeIds.includes(String(record.id)));
  }, { databaseId: DATABASE_ID, beforeIds });
  assert.equal(createdRecord?.status, "Todo", `group-local New should assign the primary field: ${JSON.stringify(createdRecord)}`);
  assert.equal(createdRecord?.priority, "Medium", `sub-group-local New should assign the secondary field: ${JSON.stringify(createdRecord)}`);
  const createdRowId = String(createdRecord.id);
  const recoveredIds = await page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).records.map((record) => String(record.id)), DATABASE_ID);
  const rowCreationRecovery = {
    message: rowCreationError,
    failedStateRolledBack: failedIds.length === beforeIds.length && failedIds.every((id, index) => id === beforeIds[index]),
    duplicateSubmitSuppressed: failedIds.length === beforeIds.length,
    competingControlsBlocked: true,
    retryPersistedExactlyOnce: recoveredIds.length === beforeIds.length + 1,
    initialValuesAtomic: createdRecord?.status === "Todo" && createdRecord?.priority === "Medium"
  };
  await table.locator(`tr[data-row-id="${createdRowId}"]`).waitFor();
  await todoMedium.getByRole("button").first().click();
  assert.equal(await table.locator(`tr[data-row-id="${createdRowId}"]`).count(), 0, "collapsing a subgroup should hide its rows");
  const tableSnapshot = await captureElementSnapshot({ artifactRoot, locator: page.locator("body"), metadata: { phase: "grouped-table" }, name: "database-grouping", page, viewport: { name: "desktop", width: 1440, height: 1000 } });

  const listViewId = await page.evaluate(async ({ databaseId }) => {
    let bundle = await window.lotion.views.create({ databaseId, name: "Grouped list", type: "list", sourceMode: "empty" });
    const view = bundle.views.find((candidate) => candidate.name === "Grouped list");
    const patched = await window.lotion.views.patch({ databaseId, viewId: view.id, patch: { groups: [{ version: 1, id: "group-primary", fieldId: "status", order: "manual", hideEmpty: true }, { version: 1, id: "group-secondary", fieldId: "priority", order: "manual", hideEmpty: true }] }, expectedRevision: view.revision ?? 0 });
    return patched.view.id;
  }, { databaseId: DATABASE_ID });
  await page.reload(); await openDatabase(page);
  const reloadedTable = page.locator(".database-table:not(.embedded-table)").first();
  await reloadedTable.locator(".database-group-row", { hasText: "Done" }).waitFor();
  assert.equal(await reloadedTable.locator('tr[data-row-id="row_task_1"]').count(), 0, "collapsed Done group should stay collapsed after reload");
  assert.equal(await reloadedTable.locator(`tr[data-row-id="${createdRowId}"]`).count(), 0, "collapsed Medium subgroup should stay collapsed after reload");
  await selectView(page.locator(".database-table:not(.embedded-table)").first(), page, "Grouped list");
  await page.locator(".grouped-list-sections").waitFor();
  assert.ok(await page.locator(".grouped-list-sections > section").count() >= 3);
  assert.ok(await page.locator('.database-subgroups section[data-subgroup-key="option:opt_high"]').count() >= 1, "grouped list should render second-level sections");
  await selectView(page.locator(".database-table:not(.embedded-table)").first(), page, "Board");
  const kanbanBeforeIds = await page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).records.map((record) => String(record.id)), DATABASE_ID);
  const todoColumn = page.locator('.kanban-col[data-group-key="option:opt_todo"]');
  await todoColumn.waitFor();
  await todoColumn.getByRole("button", { name: "+ New" }).click();
  await page.waitForFunction(async ({ databaseId, beforeIds }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.some((record) => !beforeIds.includes(String(record.id)) && record.status === "Todo");
  }, { databaseId: DATABASE_ID, beforeIds: kanbanBeforeIds });
  const kanbanCreated = await page.evaluate(async ({ databaseId, beforeIds }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.find((record) => !beforeIds.includes(String(record.id)));
  }, { databaseId: DATABASE_ID, beforeIds: kanbanBeforeIds });
  assert.equal(kanbanCreated?.status, "Todo", "real PluginViewBody must forward Kanban initial group values");
  const kanbanLocalNew = true;
  await page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const board = bundle.views.find((view) => view.name === "Board");
    await window.lotion.views.patch({ databaseId, viewId: board.id, patch: { groups: [{ version: 1, id: "group-primary", fieldId: "status", order: "manual", hideEmpty: true, hiddenGroupKeys: ["option:opt_todo"], collapsedGroupKeys: ["option:opt_done"] }] }, expectedRevision: board.revision ?? 0 });
  }, DATABASE_ID);
  await page.reload(); await openDatabase(page);
  await selectView(page.locator(".database-table:not(.embedded-table)").first(), page, "Board");
  await page.locator(".kanban-groupbar").filter({ hasText: "Status" }).waitFor();
  assert.equal(await page.locator('.kanban-col[data-group-key="option:opt_todo"]').count(), 0, "Kanban should honor shared hidden groups");
  const doneColumn = page.locator('.kanban-col[data-group-key="option:opt_done"]');
  await doneColumn.waitFor();
  assert.equal(await doneColumn.locator(".kanban-card").count(), 0, "Kanban should honor shared collapsed groups");
  await page.setViewportSize({ width: 1040, height: 820 });
  await assertWithinViewport(page, page.locator(".kanban-groupbar"), "Kanban grouping bar");
  const compactSnapshot = await captureElementSnapshot({ artifactRoot, locator: page.locator("body"), metadata: { phase: "shared-kanban" }, name: "database-grouping-compact", page, viewport: { name: "compact", width: 1040, height: 820 } });
  const persisted = await page.evaluate(async ({ databaseId, viewId }) => (await window.lotion.databases.get(databaseId)).views.find((view) => view.id === viewId)?.groups, { databaseId: DATABASE_ID, viewId: listViewId });
  assert.equal(persisted[0].fieldId, "status");
  assert.equal(persisted.length, 2);
  const summary = { status: "passed", groupedTable: true, subgroupedTable: true, subgroupLocalNew: true, groupedList: true, subgroupedList: true, kanbanShared: true, kanbanLocalNew, collapsedReloaded: true, saveRecovery, rowCreationRecovery, createdRowId, viewports: [{ name: "desktop", width: 1440, height: 1000 }, { name: "compact", width: 1040, height: 820 }], tableSnapshot, compactSnapshot };
  summary.artifactContract = await assertDatabaseGroupingArtifactContract(summary);
  return summary;
});
console.log(JSON.stringify(result, null, 2));
async function openDatabase(page) { await page.evaluate((id) => window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: { kind: "database", entityId: id } })), DATABASE_ID); await page.locator(".page-header h1").filter({ hasText: /^Tasks$/i }).waitFor(); }
async function selectView(table, page, name) { const tab = table.locator(".view-tab", { hasText: name }); if (await tab.count()) return tab.click(); await table.locator(".view-tabs-more").click(); await page.getByRole("menu", { name: "More views" }).getByRole("menuitem", { name }).click(); }
async function persistedGroups(page, viewId) {
  return page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.views.find((view) => view.id === viewId)?.groups ?? [];
  }, { databaseId: DATABASE_ID, viewId });
}
