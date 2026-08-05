#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseSortPriorityArtifactContract } from "./lib/database-sort-priority-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";

const result = await withLotionUIHarness("database-sort-priority-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-sort-priority-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseSortPriorityArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  let table = await openDatabase(page);
  const viewId = await table.locator('.view-tab[aria-selected="true"]').getAttribute("data-view-id");
  assert.ok(viewId);
  let dialog = await openSort(table, page);
  const clear = dialog.getByRole("button", { name: "Clear all" });
  if (await clear.isVisible().catch(() => false)) await clear.click();
  await dialog.getByRole("button", { name: "Add sort" }).click();
  await dialog.getByRole("button", { name: "Add sort" }).click();
  let rules = dialog.locator(".sort-rule");
  await rules.nth(0).getByLabel("Sort property 1").selectOption("priority");
  await rules.nth(1).getByLabel("Sort property 2").selectOption("due_date");
  assert.equal(await rules.nth(0).getByLabel("Sort direction 1").locator("option:checked").textContent(), "First option first");
  assert.equal(await rules.nth(1).getByLabel("Sort direction 2").locator("option:checked").textContent(), "Latest first");
  assert.equal(await rules.nth(1).getByLabel("Sort property 2").locator('option[value="priority"]').isDisabled(), true);
  await waitForRowOrder(page, "row_task_2,row_task_1,row_task_3,row_task_4");
  const before = await rowOrder(table);

  await rules.nth(1).getByRole("button", { name: "Reorder Due date" }).focus();
  await page.keyboard.press("Alt+ArrowUp");
  rules = dialog.locator(".sort-rule");
  await waitForRowOrder(page, "row_task_4,row_task_3,row_task_2,row_task_1");
  const keyboardOrder = await rowOrder(table);
  assert.notDeepEqual(keyboardOrder, before);
  assert.match(await dialog.locator(".sort-priority-chips").innerText(), /1\. Due date[\s\S]*2\. Priority/);
  await waitForSortFields(page, viewId, "due_date,priority");

  await page.reload();
  table = await openDatabase(page);
  assert.deepEqual(await rowOrder(table), keyboardOrder);
  dialog = await openSort(table, page);
  await dialog.getByText("1. Due date").waitFor();
  rules = dialog.locator(".sort-rule");
  await rules.nth(1).evaluate((source, targetIndex) => {
    const target = source.parentElement?.querySelectorAll(".sort-rule")[targetIndex];
    if (!(target instanceof HTMLElement)) throw new Error("Sort drop target not found");
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: transfer }));
  }, 0);
  await waitForSortFields(page, viewId, "priority,due_date");
  await waitForRowOrder(page, "row_task_2,row_task_1,row_task_3,row_task_4");
  rules = dialog.locator(".sort-rule");
  await rules.nth(1).getByRole("button", { name: "Move Due date up" }).click();
  await waitForSortFields(page, viewId, "due_date,priority");
  await waitForRowOrder(page, "row_task_4,row_task_3,row_task_2,row_task_1");

  const box = await dialog.boundingBox();
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  await assertNoDocumentHorizontalOverflow(page, `sort priority ${viewport.name}`);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "reloaded-sort-priority", viewport: viewport.name },
    name: `database-sort-priority-${viewport.name}`,
    page,
    viewport
  });

  await dialog.getByRole("button", { name: "Clear all" }).click();
  await waitForSortFields(page, viewId, "");
  assert.equal(await table.locator('.table-scroll tr[data-row-id]').count(), 4);
  await dialog.getByRole("button", { name: "Add sort" }).click();
  rules = dialog.locator(".sort-rule");
  await rules.first().getByLabel("Sort property 1").selectOption("priority");
  await waitForRowOrder(page, "row_task_1,row_task_2,row_task_3,row_task_4");
  const beforeOptionChange = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  const priority = beforeOptionChange.schema.fields.find((field) => field.id === "priority");
  assert.ok(priority?.options);
  const valuesBefore = beforeOptionChange.records.map((record) => record.priority);
  await page.evaluate(({ databaseId, options }) => window.lotion.databases.updateField({ databaseId, fieldId: "priority", options }), {
    databaseId: DATABASE_ID,
    options: [...priority.options].reverse()
  });
  await page.reload();
  table = await openDatabase(page);
  await waitForRowOrder(page, "row_task_4,row_task_3,row_task_1,row_task_2");
  const afterOptionChange = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.deepEqual(afterOptionChange.records.map((record) => record.priority), valuesBefore, "option reorder must not mutate cell values");
  dialog = await openSort(table, page);
  assert.equal(await dialog.getByLabel("Sort direction 1").locator("option:checked").textContent(), "First option first");

  return {
    viewport: viewport.name,
    typeLabels: true,
    keyboardPriority: true,
    dragPriority: true,
    moveControls: true,
    priorityChips: true,
    duplicatePrevented: true,
    clearAll: true,
    reloaded: true,
    optionOrderChangedResults: true,
    optionOrderPreservedCells: true,
    noHorizontalOverflow: true,
    before,
    after: keyboardOrder,
    snapshot: { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath }
  };
}

async function rowOrder(table) {
  return table.locator('.table-scroll tr[data-row-id]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")));
}

async function waitForRowOrder(page, expected) {
  await page.waitForFunction((order) => [...document.querySelectorAll('.database-table:not(.embedded-table) tr[data-row-id]')].map((row) => row.getAttribute("data-row-id")).join(",") === order, expected);
}

async function waitForSortFields(page, viewId, expected) {
  await page.waitForFunction(async ({ databaseId, activeViewId, fields }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.views.find((view) => view.id === activeViewId)?.sorts.map((sort) => sort.fieldId).join(",") === fields;
  }, { databaseId: DATABASE_ID, activeViewId: viewId, fields: expected });
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

async function openSort(table, page) {
  await table.getByRole("button", { name: "Sort" }).click();
  const dialog = page.getByRole("dialog", { name: "Sort" });
  await dialog.waitFor();
  return dialog;
}
