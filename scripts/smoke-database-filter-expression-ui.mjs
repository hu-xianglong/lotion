#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseFilterExpressionArtifactContract } from "./lib/database-filter-expression-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";

const result = await withLotionUIHarness("database-filter-expression-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-filter-expression-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseFilterExpressionArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  let table = await openDatabase(page);
  const viewId = await table.locator('.view-tab[aria-selected="true"]').getAttribute("data-view-id");
  assert.ok(viewId);
  let dialog = await openFilter(table, page);
  const existingClear = dialog.getByRole("button", { name: "Clear all" });
  if (await existingClear.isVisible().catch(() => false)) await existingClear.click();

  const root = dialog.locator(".filter-group.depth-1");
  await root.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add condition" }).click();
  let typed = root.locator(":scope > .filter-condition").first();

  await typed.getByLabel("Filter property").selectOption("effort");
  assert.equal(await typed.getByLabel("Filter value").getAttribute("type"), "number");
  await typed.getByRole("alert").filter({ hasText: /Choose or enter a value/ }).waitFor();
  await page.waitForTimeout(350);
  assert.equal(await persistedConditions(page, viewId), 0, "an invalid blank number must not replace persisted filters");
  await typed.getByLabel("Filter operator").selectOption("gt");
  await typed.getByLabel("Filter value").fill("3");
  await waitForCondition(page, viewId, "effort", "gt", 3);

  await typed.getByLabel("Filter property").selectOption("due_date");
  assert.equal(await typed.getByLabel("Filter value").getAttribute("type"), "date");
  await typed.getByLabel("Filter operator").selectOption("within_next");
  const relative = typed.getByLabel("Relative date range");
  await relative.selectOption("30_days");
  await waitForCondition(page, viewId, "due_date", "within_next", "30_days");

  await typed.getByLabel("Filter property").selectOption("done");
  assert.equal(await typed.getByLabel("Filter operator").inputValue(), "checked");
  assert.equal(await typed.getByLabel("Filter value").count(), 0);
  await waitForCondition(page, viewId, "done", "checked", true);

  await typed.getByLabel("Filter property").selectOption("tags");
  assert.equal(await typed.getByLabel("Filter value").evaluate((element) => element.tagName), "SELECT");
  await typed.getByLabel("Filter value").selectOption({ label: "UI" });
  await waitForCondition(page, viewId, "tags", "contains", "UI");

  await typed.getByLabel("Filter property").selectOption("title");
  assert.equal(await typed.getByLabel("Filter value").getAttribute("type"), "search");
  await typed.getByLabel("Filter value").fill("sample");
  await waitForCondition(page, viewId, "title", "contains", "sample");
  await typed.getByRole("button", { name: "Remove filter" }).click();
  await page.waitForFunction(() => document.querySelector('.advanced-filter-popover .popover-empty')?.textContent?.includes("Add a condition"));
  await waitForEmptyExpression(page, viewId);

  await root.locator(":scope > .filter-group-toolbar select").selectOption("or");
  await root.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add group" }).click();
  const depth2 = root.locator(".filter-group.depth-2").first();
  await depth2.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add group" }).click();
  const depth3 = depth2.locator(".filter-group.depth-3").first();
  await depth3.waitFor();
  assert.equal(await depth3.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add group" }).isDisabled(), true);
  await depth3.locator("xpath=..").locator(":scope > button.group-remove").click();

  await depth2.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add condition" }).click();
  await depth2.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add condition" }).click();
  const nestedConditions = depth2.locator(":scope > .filter-condition");
  await configureCondition(nestedConditions.nth(0), "status", "Done");
  await configureCondition(nestedConditions.nth(1), "priority", "High");
  await root.locator(":scope > .filter-group-actions").getByRole("button", { name: "Add condition" }).click();
  await configureCondition(root.locator(":scope > .filter-condition").last(), "tags", "UI");

  await page.waitForFunction(async ({ databaseId, viewId: activeViewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const expression = bundle.views.find((view) => view.id === activeViewId)?.filterExpression;
    return expression?.conjunction === "or" && expression.children.length === 2 && expression.children.some((child) => child.kind === "group" && child.children.length === 2);
  }, { databaseId: DATABASE_ID, viewId });
  await dialog.getByText("3 conditions").waitFor();
  await dialog.getByText(/Status is Done/).waitFor();
  await dialog.getByText(/Priority is High/).waitFor();
  await dialog.getByText(/Tags contains UI/).waitFor();
  await page.locator(".page-header h1").filter({ hasText: /^Tasks$/i }).click();
  await page.waitForFunction(() => document.querySelectorAll('.database-table:not(.embedded-table) .table-scroll tr[data-row-id]').length === 2);

  await page.reload();
  table = await openDatabase(page);
  assert.equal(await table.locator('.table-scroll tr[data-row-id]').count(), 2);
  dialog = await openFilter(table, page);
  await dialog.locator(".filter-group.depth-2").waitFor();
  await dialog.getByText(/Status is Done/).waitFor();
  await dialog.getByText(/Tags contains UI/).waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  await assertNoDocumentHorizontalOverflow(page, `advanced filter ${viewport.name}`);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "nested-filter-reload", viewport: viewport.name },
    name: `database-filter-expression-${viewport.name}`,
    page,
    viewport
  });

  await dialog.getByRole("button", { name: "Clear all" }).click();
  await waitForEmptyExpression(page, viewId);
  assert.equal(await table.locator('.table-scroll tr[data-row-id]').count(), 4);

  return {
    viewport: viewport.name,
    nestedExpression: true,
    selectEditor: true,
    multiSelectEditor: true,
    checkboxEditor: true,
    numberEditor: true,
    relativeDateEditor: true,
    textEditor: true,
    invalidBlocked: true,
    depthLimit: true,
    filterChips: true,
    explicitRemoval: true,
    clearAll: true,
    resultCount: 2,
    reloaded: true,
    noHorizontalOverflow: true,
    snapshot: { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath }
  };
}

async function configureCondition(condition, fieldId, value) {
  await condition.getByLabel("Filter property").selectOption(fieldId);
  await condition.getByLabel("Filter value").selectOption({ label: value });
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

async function openFilter(table, page) {
  await table.getByRole("button", { name: "Filter" }).click();
  const dialog = page.getByRole("dialog", { name: "Filter" });
  await dialog.waitFor();
  return dialog;
}

async function persistedConditions(page, viewId) {
  return page.evaluate(async ({ databaseId, activeViewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const expression = bundle.views.find((view) => view.id === activeViewId)?.filterExpression;
    const count = (group) => (group?.children ?? []).reduce((total, child) => total + (child.kind === "group" ? count(child) : 1), 0);
    return count(expression);
  }, { databaseId: DATABASE_ID, activeViewId: viewId });
}

async function waitForCondition(page, viewId, fieldId, operator, value) {
  await page.waitForFunction(async ({ databaseId, activeViewId, expectedFieldId, expectedOperator, expectedValue }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const expression = bundle.views.find((view) => view.id === activeViewId)?.filterExpression;
    const conditions = (group) => (group?.children ?? []).flatMap((child) => child.kind === "group" ? conditions(child) : [child]);
    return conditions(expression).some((condition) => condition.fieldId === expectedFieldId && condition.operator === expectedOperator && condition.value === expectedValue);
  }, { databaseId: DATABASE_ID, activeViewId: viewId, expectedFieldId: fieldId, expectedOperator: operator, expectedValue: value });
}

async function waitForEmptyExpression(page, viewId) {
  await page.waitForFunction(async ({ databaseId, activeViewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.views.find((view) => view.id === activeViewId)?.filterExpression?.children.length === 0;
  }, { databaseId: DATABASE_ID, activeViewId: viewId });
}
