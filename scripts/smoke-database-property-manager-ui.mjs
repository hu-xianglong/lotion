#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabasePropertyManagerArtifactContract } from "./lib/database-property-manager-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";

const result = await withLotionUIHarness("database-property-manager-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-property-manager-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabasePropertyManagerArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  const table = await openDatabase(page);
  const activeViewId = await table.locator('.view-tab[aria-selected="true"]').getAttribute("data-view-id");
  assert.ok(activeViewId, `active view missing for ${viewport.name}`);

  await table.getByLabel("Add or manage properties").click();
  const manager = page.getByRole("dialog", { name: "Property manager" });
  await manager.waitFor();
  await manager.getByLabel("Search properties").fill("priority");
  assert.equal(await manager.locator(".property-manager-row").count(), 1);
  assert.match(await manager.locator(".property-manager-row").innerText(), /priority/i);
  await manager.getByLabel("Search properties").fill("");

  await manager.getByRole("button", { name: "New property" }).click();
  await manager.getByLabel("New property name").fill("Failure recovery property");
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected property manager failure"));
  const recoveryButton = manager.getByRole("button", { name: "Create property" });
  await recoveryButton.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error("Create property action must be a button");
    button.click();
    button.click();
  });
  const recoveryAlert = manager.getByRole("alert");
  await recoveryAlert.waitFor();
  const recoveryMessage = (await recoveryAlert.innerText()).trim();
  assert.match(recoveryMessage, /Injected property manager failure/);
  assert.equal(await manager.getAttribute("aria-busy"), "false");
  assert.equal(await manager.getByRole("button", { name: "Create property" }).isEnabled(), true);
  const afterFailedCreate = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(afterFailedCreate.schema.fields.filter((field) => field.name === "Failure recovery property").length, 0);
  await manager.getByRole("button", { name: "Create property" }).click();
  await rowFor(manager, "Failure recovery property").waitFor({ timeout: 8_000 });
  const afterRecovery = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(afterRecovery.schema.fields.filter((field) => field.name === "Failure recovery property").length, 1);
  const mutationRecovery = {
    message: recoveryMessage,
    dialogRemainedOpen: true,
    duplicateSubmitSuppressed: true,
    retryCreatedExactlyOne: true
  };

  await createProperty(manager, { name: "Review score", type: "number", visibility: "current" });
  await createProperty(manager, { name: "Shared note", type: "text", visibility: "all" });
  await createProperty(manager, { name: "Private draft", type: "text", visibility: "hidden" });
  await page.waitForFunction(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const byName = new Map(bundle.schema.fields.map((field) => [field.name, field]));
    const current = byName.get("Review score");
    const all = byName.get("Shared note");
    const hidden = byName.get("Private draft");
    if (!current || !all || !hidden) return false;
    const active = bundle.views.find((view) => view.id === viewId);
    return Boolean(
      active?.visibleFieldIds.includes(current.id) &&
      bundle.views.filter((view) => view.id !== viewId).every((view) => !view.visibleFieldIds.includes(current.id)) &&
      bundle.views.every((view) => view.visibleFieldIds.includes(all.id) && view.fieldOrder.includes(all.id)) &&
      bundle.views.every((view) => !view.visibleFieldIds.includes(hidden.id) && !view.fieldOrder.includes(hidden.id))
    );
  }, { databaseId: DATABASE_ID, viewId: activeViewId });

  let bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  const source = bundle.schema.fields.find((field) => field.name === "Priority");
  const target = bundle.schema.fields.find((field) => field.name === "Tags");
  assert.ok(source && target && !source.system && !target.system, "reorder requires two editable properties");
  const expectedOrder = bundle.schema.fields.map((field) => field.id);
  const sourceIndex = expectedOrder.indexOf(source.id);
  const targetIndex = expectedOrder.indexOf(target.id);
  expectedOrder.splice(sourceIndex, 1);
  expectedOrder.splice(targetIndex, 0, source.id);
  await rowFor(manager, source.name).dragTo(rowFor(manager, target.name));
  await page.waitForFunction(async ({ databaseId, expected }) => {
    const current = await window.lotion.databases.get(databaseId);
    return JSON.stringify(current.schema.fields.map((field) => field.id)) === JSON.stringify(expected);
  }, { databaseId: DATABASE_ID, expected: expectedOrder });
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.deepEqual(bundle.schema.fields.map((field) => field.id), expectedOrder);

  await assertNoDocumentHorizontalOverflow(page, `property manager ${viewport.name}`);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "property-manager", viewport: viewport.name },
    name: `database-property-manager-${viewport.name}`,
    page,
    viewport
  });

  await rowFor(manager, "Review score").locator(".property-manager-edit").click();
  const fieldSettings = page.getByRole("dialog", { name: "Field settings" });
  await fieldSettings.waitFor();
  const fieldBeforeFailure = await page.evaluate(({ databaseId, viewId }) => {
    const bundlePromise = window.lotion.databases.get(databaseId);
    return bundlePromise.then((bundle) => {
      const field = bundle.schema.fields.find((candidate) => candidate.name === "Review score");
      const active = bundle.views.find((view) => view.id === viewId);
      return {
        id: field?.id ?? "",
        name: field?.name ?? "",
        visible: field ? active?.visibleFieldIds.includes(field.id) === true : false
      };
    });
  }, { databaseId: DATABASE_ID, viewId: activeViewId });
  assert.ok(fieldBeforeFailure.id && fieldBeforeFailure.visible, "field settings recovery requires a visible editable field");
  const recoveredFieldName = "Recovered review score";
  const fieldNameInput = fieldSettings.locator(".form-row input").first();
  await fieldNameInput.fill(recoveredFieldName);
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected field settings persistence failure"));
  const fieldSettingsPendingDismissalBlocked = await fieldSettings.getByRole("button", { name: "Save field" }).evaluate((button) => {
    button.click();
    button.click();
    button.closest(".dialog-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    return Boolean(document.querySelector('[role="dialog"][aria-label="Field settings"]'));
  });
  const fieldSettingsAlert = fieldSettings.locator('.field-settings-action-error[role="alert"]');
  await fieldSettingsAlert.waitFor({ timeout: 8_000 });
  const fieldSettingsFailureMessage = (await fieldSettingsAlert.textContent() ?? "").trim();
  assert.match(fieldSettingsFailureMessage, /Injected field settings persistence failure/);
  assert.equal(await fieldSettings.getAttribute("aria-busy"), "false");
  const fieldAfterFailure = await page.evaluate(async ({ databaseId, fieldId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const field = bundle.schema.fields.find((candidate) => candidate.id === fieldId);
    const active = bundle.views.find((view) => view.id === viewId);
    return {
      name: field?.name ?? "",
      recoveredNameCount: bundle.schema.fields.filter((candidate) => candidate.name === "Recovered review score").length,
      visible: field ? active?.visibleFieldIds.includes(field.id) === true : false
    };
  }, { databaseId: DATABASE_ID, fieldId: fieldBeforeFailure.id, viewId: activeViewId });
  assert.equal(fieldAfterFailure.name, fieldBeforeFailure.name);
  assert.equal(fieldAfterFailure.recoveredNameCount, 0);
  assert.equal(fieldAfterFailure.visible, true);
  assert.equal(await fieldNameInput.inputValue(), recoveredFieldName);
  const fieldSettingsRetryDismissalBlocked = await fieldSettingsAlert.getByRole("button", { name: "Retry" }).evaluate((button) => {
    button.click();
    const hide = button.closest('[role="dialog"]')?.querySelector(".field-hide-button");
    if (hide instanceof HTMLButtonElement) hide.click();
    button.closest(".dialog-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    return Boolean(document.querySelector('[role="dialog"][aria-label="Field settings"]'));
  });
  await fieldSettings.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(async ({ databaseId, fieldId, expectedName }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.schema.fields.find((candidate) => candidate.id === fieldId)?.name === expectedName;
  }, { databaseId: DATABASE_ID, fieldId: fieldBeforeFailure.id, expectedName: recoveredFieldName });
  const fieldAfterRetry = await page.evaluate(async ({ databaseId, fieldId, expectedName, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const field = bundle.schema.fields.find((candidate) => candidate.id === fieldId);
    const active = bundle.views.find((view) => view.id === viewId);
    return {
      name: field?.name ?? "",
      recoveredNameCount: bundle.schema.fields.filter((candidate) => candidate.name === expectedName).length,
      visible: field ? active?.visibleFieldIds.includes(field.id) === true : false
    };
  }, { databaseId: DATABASE_ID, fieldId: fieldBeforeFailure.id, expectedName: recoveredFieldName, viewId: activeViewId });
  assert.equal(fieldAfterRetry.name, recoveredFieldName);
  assert.equal(fieldAfterRetry.recoveredNameCount, 1);
  assert.equal(fieldAfterRetry.visible, true);
  const fieldSettingsRecovery = {
    message: fieldSettingsFailureMessage,
    dialogRemainedOpen: true,
    failedMutationRolledBack: fieldAfterFailure.name === fieldBeforeFailure.name && fieldAfterFailure.recoveredNameCount === 0,
    draftRetained: true,
    duplicateSubmitSuppressed: true,
    pendingDismissalBlocked: fieldSettingsPendingDismissalBlocked,
    retryDismissalBlocked: fieldSettingsRetryDismissalBlocked,
    retryCommittedExactlyOnce: fieldAfterRetry.recoveredNameCount === 1,
    competingHideSuppressed: fieldAfterRetry.visible
  };
  return {
    viewport: viewport.name,
    search: true,
    currentVisibility: true,
    allVisibility: true,
    hiddenVisibility: true,
    reordered: true,
    focusedEditor: true,
    noHorizontalOverflow: true,
    mutationRecovery,
    fieldSettingsRecovery,
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

async function createProperty(manager, { name, type, visibility }) {
  await manager.getByRole("button", { name: "New property" }).click();
  await manager.getByLabel("New property name").fill(name);
  await manager.getByLabel("New property type").selectOption(type);
  await manager.getByLabel("New property visibility").selectOption(visibility);
  await manager.getByRole("button", { name: "Create property" }).click();
  await rowFor(manager, name).waitFor({ timeout: 8_000 });
}

function rowFor(manager, name) {
  return manager.locator(".property-manager-row").filter({ hasText: new RegExp(escapeRegExp(name), "i") });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
