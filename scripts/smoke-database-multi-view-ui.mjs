#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseMultiViewArtifactContract } from "./lib/database-multi-view-artifacts.mjs";
import { assertNoDocumentHorizontalOverflow, captureElementSnapshot, forEachViewport, withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1040, height: 820 }
];

const result = await withLotionUIHarness("database-multi-view-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewportEvidence = [];
  await forEachViewport(page, viewports, async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-multi-view-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    await openDatabase(page);
    const table = page.locator(".database-table:not(.embedded-table)").first();
    await table.waitFor();
    await table.getByLabel("View tab display").selectOption("both");

    const sourceBundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    const sourceView = sourceBundle.views.find((view) => view.id === "view_default");

    await table.locator(".view-tab-add").click();
    const recoveryDialog = page.getByRole("dialog", { name: "Create view" });
    await recoveryDialog.getByLabel("Name").fill("Failure recovery");
    await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected create view failure"));
    await recoveryDialog.evaluate((form) => {
      if (!(form instanceof HTMLFormElement)) throw new Error("Create view dialog must be a form");
      form.requestSubmit();
      form.requestSubmit();
    });
    const recoveryAlert = recoveryDialog.getByRole("alert");
    await recoveryAlert.waitFor();
    const recoveryMessage = (await recoveryAlert.innerText()).trim();
    assert.match(recoveryMessage, /Injected create view failure/);
    assert.equal(await recoveryDialog.getAttribute("aria-busy"), "false");
    assert.equal(await recoveryDialog.getByRole("button", { name: "Create view" }).isEnabled(), true);
    const afterFailedCreate = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    assert.equal(afterFailedCreate.views.filter((view) => view.name === "Failure recovery").length, 0);
    await recoveryDialog.getByRole("button", { name: "Create view" }).click();
    await table.getByRole("tab", { name: "Failure recovery" }).waitFor();
    const afterRecovery = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    assert.equal(afterRecovery.views.filter((view) => view.name === "Failure recovery").length, 1);
    const createViewFailureRecovery = {
      message: recoveryMessage,
      dialogRemainedOpen: true,
      duplicateSubmitSuppressed: true,
      retryCreatedExactlyOne: true
    };
    await table.getByRole("tab", { name: "Default" }).click();

    await table.locator(".view-tab-add").click();
    const duplicateDialog = page.getByRole("dialog", { name: "Create view" });
    await duplicateDialog.getByLabel("Name").fill("Default duplicate");
    await duplicateDialog.locator("label", { hasText: /^\s*Duplicate/ }).locator('input[type="radio"]').check();
    await duplicateDialog.getByRole("button", { name: "Create view" }).click();
    await table.getByRole("tab", { name: "Default duplicate" }).waitFor();
    const afterDuplicate = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    const duplicate = afterDuplicate.views.find((view) => view.name === "Default duplicate");
    assert.deepEqual(duplicate.sorts, sourceView.sorts);
    assert.deepEqual(duplicate.visibleFieldIds, sourceView.visibleFieldIds);

    await table.locator(".view-tab-add").click();
    const dialog = page.getByRole("dialog", { name: "Create view" });
    await dialog.waitFor();
    await dialog.getByLabel("Name").fill("Blank review");
    await dialog.getByLabel("Layout").selectOption("list");
    await dialog.getByLabel("Empty settings").check();
    await dialog.getByRole("button", { name: "Create view" }).click();
    await table.getByRole("tab", { name: "Blank review" }).waitFor();
    let bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    const blank = bundle.views.find((view) => view.name === "Blank review");
    assert.equal(blank.type, "list");
    assert.deepEqual(blank.filters, []);
    assert.deepEqual(blank.sorts, []);

    for (const name of ["Team", "Archive", "Launch"]) {
      await page.evaluate(({ databaseId, name }) => window.lotion.views.create({ databaseId, name, type: "table", sourceMode: "empty" }), { databaseId: DATABASE_ID, name });
    }
    await page.reload();
    await page.waitForSelector(".main-content");
    await openDatabase(page);
    await table.waitFor();
    await table.getByLabel("View tab display").selectOption("both");
    const persistedAfterReload = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    const sidebarViews = page.locator(".sidebar-database-tree", { has: page.locator('.nav-item[title="Tasks"]') }).locator(".sidebar-database-view");
    await page.waitForFunction((expected) => document.querySelectorAll(".sidebar-database-view").length === expected, persistedAfterReload.views.length, { timeout: 8_000 });
    assert.equal(await sidebarViews.count(), persistedAfterReload.views.length);
    await sidebarViews.filter({ hasText: "Blank review" }).waitFor();
    const more = table.locator(".view-tabs-more");
    await more.waitFor();
    assert.match(await more.innerText(), /more/);
    const blankTab = table.getByRole("tab", { name: "Blank review" });
    if (await blankTab.isVisible().catch(() => false)) {
      await blankTab.click();
    } else {
      await more.click();
      await page.locator(".view-tabs-more-menu button", { hasText: "Blank review" }).click();
    }

    const activeTab = table.locator('.view-tab[aria-selected="true"]');
    assert.equal((await activeTab.getAttribute("aria-label")) || (await activeTab.innerText()).trim(), "Blank review");
    const beforeReorder = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    const beforeOrder = beforeReorder.views.map((candidate) => candidate.id);
    const beforeRevisions = Object.fromEntries(beforeReorder.views.map((candidate) => [candidate.id, candidate.revision ?? 0]));
    await page.evaluate(() => window.lotion.debug.failNextDatabaseViewWrite("Injected view reorder failure"));
    await activeTab.evaluate((source) => {
      const target = source.closest('[role="tablist"]')?.querySelector('[role="tab"][data-view-id="view_default"]');
      if (!(target instanceof HTMLElement)) throw new Error("Default view tab not found");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const transfer = new DataTransfer();
        source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer }));
        target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }));
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      }
    });
    const reorderAlert = page.getByRole("alert").filter({ hasText: "View reorder failed" });
    await reorderAlert.waitFor();
    const reorderFailureMessage = (await reorderAlert.innerText()).trim();
    assert.match(reorderFailureMessage, /Injected view reorder failure/);
    assert.equal(await table.locator(".view-order-controls").getAttribute("aria-busy"), "false");
    assert.equal(await table.locator(".view-order-controls").getAttribute("aria-disabled"), "true", "failed order should disable the view control surface");
    assert.equal(await table.locator(".view-tab-add").isDisabled(), true, "failed order should block competing view controls until retry or dismissal");
    const afterFailedReorder = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    assert.deepEqual(afterFailedReorder.views.map((candidate) => candidate.id), beforeOrder, "failed reorder must preserve stored order");
    assert.deepEqual(
      Object.fromEntries(afterFailedReorder.views.map((candidate) => [candidate.id, candidate.revision ?? 0])),
      beforeRevisions,
      "failed reorder must preserve every view revision"
    );
    await reorderAlert.getByRole("button", { name: "Retry" }).evaluate((button) => {
      button.click();
      button.click();
    });
    await page.waitForFunction(async (databaseId) => {
      const current = await window.lotion.databases.get(databaseId);
      return current.views[0]?.name === "Blank review";
    }, DATABASE_ID, { timeout: 8_000 });
    bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    assert.equal(bundle.views[0].name, "Blank review");
    for (const reorderedView of bundle.views) {
      assert.equal(
        reorderedView.revision ?? 0,
        beforeRevisions[reorderedView.id] + 1,
        `retry should persist ${reorderedView.name} exactly once`
      );
    }
    await page.waitForFunction((viewId) => (
      document.querySelector('.database-table:not(.embedded-table) [role="tab"]')?.getAttribute("data-view-id") === viewId
    ), blank.id, { timeout: 8_000 });
    const viewOrderFailureRecovery = {
      message: reorderFailureMessage,
      controlsBlockedUntilResolution: true,
      rollbackPreservedOrder: true,
      rollbackPreservedRevisions: true,
      duplicateDropSuppressed: true,
      retryPersistedExactlyOnce: true
    };
    await page.getByRole("button", { name: "Dismiss view order result" }).click();

    await activeTab.press("ArrowRight");
    const keyboardSelected = table.locator('.view-tab[aria-selected="true"]');
    await page.waitForFunction(() => {
      const selected = document.querySelector('.database-table:not(.embedded-table) .view-tab[aria-selected="true"]');
      return selected?.getAttribute("data-view-id") === "view_default" && document.activeElement === selected;
    }, null, { timeout: 8_000 });
    assert.equal(await activeViewName(keyboardSelected), "Default");
    await table.locator(".table-scroll").waitFor({ timeout: 8_000 });
    assert.equal(await table.locator(".list-view-body").count(), 0, "Default should remain active after keyboard switching");
    await table.getByLabel("View tab display").selectOption("text");
    assert.equal((await keyboardSelected.innerText()).trim(), "Default");
    await table.getByLabel("View tab display").selectOption("icon");
    assert.equal(await keyboardSelected.getAttribute("data-view-id"), "view_default");
    await page.reload();
    await page.waitForSelector(".main-content");
    await openDatabase(page);
    const reloaded = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
    assert.equal(reloaded.views[0].name, "Blank review");
    assert.equal(await table.getByLabel("View tab display").inputValue(), "icon");
    await assertNoDocumentHorizontalOverflow(page, `multi-view ${viewport.name}`);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator("body"),
      metadata: { phase: "multi-view-overflow", viewport: viewport.name },
      name: `database-multi-view-${viewport.name}`,
      page,
      viewport
    });
    viewportEvidence.push({
      viewport: viewport.name,
      viewCount: reloaded.views.length,
      orderPersisted: true,
      keyboardFocusFollowed: true,
      sidebarViewsVerified: true,
      createViewFailureRecovery,
      viewOrderFailureRecovery,
      snapshot
    });
  });
  const summary = { status: "passed", viewports: viewportEvidence };
  summary.artifactContract = await assertDatabaseMultiViewArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function openDatabase(page) {
  await page.locator(".startup-loading").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  await page.locator(".main-content").waitFor({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get), null, { timeout: 8_000 });
  const sidebarEntry = page.locator('.sidebar-database-tree button[title="Tasks"]').first();
  await sidebarEntry.waitFor({ timeout: 8_000 });
  await sidebarEntry.click();
  await page.locator(".page-header h1").filter({ hasText: /^Tasks$/i }).waitFor({ timeout: 8_000 });
}

async function activeViewName(tab) {
  return (await tab.getAttribute("aria-label")) || (await tab.innerText()).trim();
}
