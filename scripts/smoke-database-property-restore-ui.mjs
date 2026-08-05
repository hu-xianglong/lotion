#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabasePropertyRestoreArtifactContract } from "./lib/database-property-restore-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";

const result = await withLotionUIHarness("database-property-restore-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-property-restore-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabasePropertyRestoreArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  let table = await openDatabase(page);
  const activeViewId = await table.locator('.view-tab[aria-selected="true"]').getAttribute("data-view-id");
  assert.ok(activeViewId);
  let bundle = await page.evaluate(({ databaseId, viewId }) => window.lotion.databases.addField(databaseId, {
    name: "Recoverable",
    type: "text",
    visibility: "current",
    viewId
  }), { databaseId: DATABASE_ID, viewId: activeViewId });
  const recoverable = bundle.schema.fields.find((field) => field.name === "Recoverable");
  assert.ok(recoverable);
  const rowId = String(bundle.records[0].id);
  bundle = await page.evaluate((input) => window.lotion.databases.updateCell(input), {
    databaseId: DATABASE_ID,
    rowId,
    fieldId: recoverable.id,
    value: "keep me"
  });
  bundle = await page.evaluate(({ databaseId, viewId, fieldId }) => window.lotion.databases.addField(databaseId, {
    name: "Recoverable mirror",
    type: "formula",
    formula: `=FIELD("${fieldId}")`,
    visibility: "hidden",
    viewId
  }), { databaseId: DATABASE_ID, viewId: activeViewId, fieldId: recoverable.id });
  bundle = await page.evaluate(({ databaseId }) => window.lotion.databases.addField(databaseId, {
    name: "Disposable",
    type: "text",
    visibility: "hidden"
  }), { databaseId: DATABASE_ID });
  const disposable = bundle.schema.fields.find((field) => field.name === "Disposable");
  assert.ok(disposable);
  const schemaPosition = bundle.schema.fields.findIndex((field) => field.id === recoverable.id);
  const activeView = bundle.views.find((view) => view.id === activeViewId);
  const visibleIndex = activeView.visibleFieldIds.indexOf(recoverable.id);
  const orderIndex = activeView.fieldOrder.indexOf(recoverable.id);
  const wrapped = Boolean(activeView.wrapFieldIds?.includes(recoverable.id));

  await page.reload();
  table = await openDatabase(page);
  await table.getByLabel("Add or manage properties").click();
  let manager = page.getByRole("dialog", { name: "Property manager" });
  await confirmAction(page, () => rowFor(manager, "Recoverable", "text").getByRole("button", { name: "Delete" }).click(), /Delete “Recoverable”/);
  await deletedRowFor(manager, "Recoverable").waitFor();
  await confirmAction(page, () => rowFor(manager, "Disposable", "text").getByRole("button", { name: "Delete" }).click(), /Delete “Disposable”/);
  const deletedRecoverable = deletedRowFor(manager, "Recoverable");
  const deletedDisposable = deletedRowFor(manager, "Disposable");
  await deletedDisposable.waitFor();
  assert.match(await deletedRecoverable.innerText(), /formula:recoverable_mirror/i);
  assert.equal(await deletedRecoverable.getByRole("button", { name: "Permanently delete" }).isDisabled(), true);
  assert.equal(await deletedRecoverable.getByRole("button", { name: "Permanently delete" }).getAttribute("title"), "Restore or remove dependencies first.");
  await assertNoDocumentHorizontalOverflow(page, `deleted property ${viewport.name}`);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "deleted-property", viewport: viewport.name },
    name: `database-deleted-property-${viewport.name}`,
    page,
    viewport
  });

  await page.reload();
  table = await openDatabase(page);
  await table.getByLabel("Add or manage properties").click();
  manager = page.getByRole("dialog", { name: "Property manager" });
  await deletedRowFor(manager, "Recoverable").waitFor();
  const reloadedDisposable = deletedRowFor(manager, "Disposable");
  await reloadedDisposable.waitFor();
  const reloadedBundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  const storedViewState = reloadedBundle.schema.deletedFields
    ?.find((item) => item.field.id === recoverable.id)
    ?.views.find((view) => view.viewId === activeViewId);
  await confirmAction(page, () => reloadedDisposable.getByRole("button", { name: "Permanently delete" }).click(), /Permanently delete “Disposable”.*cannot be recovered/i);
  await reloadedDisposable.waitFor({ state: "detached" });
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(bundle.schema.deletedFields?.some((item) => item.field.id === disposable.id), false);

  const recoverableDeletedRow = deletedRowFor(manager, "Recoverable");
  await recoverableDeletedRow.getByRole("button", { name: "Restore" }).click();
  await recoverableDeletedRow.waitFor({ state: "detached" });
  await rowFor(manager, "Recoverable", "text").waitFor();
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  const restoredView = bundle.views.find((view) => view.id === activeViewId);
  assert.equal(bundle.schema.fields[schemaPosition].id, recoverable.id);
  const restoreDiagnostic = JSON.stringify({ activeViewId, orderIndex, storedViewState, visibleIndex, restoredView });
  assert.equal(restoredView.visibleFieldIds.includes(recoverable.id), visibleIndex >= 0, restoreDiagnostic);
  assert.equal(restoredView.fieldOrder.includes(recoverable.id), orderIndex >= 0, restoreDiagnostic);
  assert.equal(Boolean(restoredView.wrapFieldIds?.includes(recoverable.id)), wrapped);
  assert.equal(bundle.records.find((record) => String(record.id) === rowId)?.recoverable_mirror, "keep me");
  assert.equal(await rowFor(manager, "ID", "id").getByRole("button", { name: "Delete" }).isDisabled(), true);
  assert.equal(await rowFor(manager, "Title", "text").getByRole("button", { name: "Delete" }).isDisabled(), true);
  await assertNoDocumentHorizontalOverflow(page, `restored property ${viewport.name}`);
  return {
    viewport: viewport.name,
    tombstoneReloaded: true,
    valueRestored: true,
    positionRestored: true,
    viewStateRestored: true,
    dependencyProtected: true,
    permanentDeleteConfirmed: true,
    permanentDeleted: true,
    systemProtected: true,
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
  const message = await page.evaluate(() => window.__lotionSmokeConfirmMessage ?? "");
  assert.match(message, messagePattern);
}

function rowFor(manager, name, type) {
  return manager.locator(".property-manager-row").filter({ hasText: new RegExp(`${escapeRegExp(name)}\\s*${escapeRegExp(type)}`, "i") });
}

function deletedRowFor(manager, name) {
  return manager.locator(".deleted-property-row").filter({ hasText: new RegExp(escapeRegExp(name)) });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
