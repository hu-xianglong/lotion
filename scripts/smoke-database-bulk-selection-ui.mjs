#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseBulkSelectionArtifactContract } from "./lib/database-bulk-selection-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("database-bulk-selection-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-bulk-selection-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseBulkSelectionArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.create));
  const fixture = await page.evaluate(async () => {
    const bundle = await window.lotion.databases.create({
      name: "Bulk rows",
      template: {
        fields: [
          { id: "score", name: "Score", type: "number" },
          { id: "done", name: "Done", type: "checkbox" },
          { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] }
        ],
        rows: Array.from({ length: 160 }, (_, index) => ({ title: `Virtual row ${index + 1}`, score: index, done: false, status: "Todo" }))
      }
    });
    const sourceId = String(bundle.records[0].id);
    await window.lotion.rowPages.update({ databaseId: bundle.schema.id, rowId: sourceId, markdown: "# Bulk lifecycle body\n\nRestore me." });
    await window.lotion.rowPages.setSmallText({ databaseId: bundle.schema.id, rowId: sourceId, smallText: true });
    await window.lotion.views.create({ databaseId: bundle.schema.id, name: "Alternate", type: "table", sourceMode: "empty" });
    return { databaseId: bundle.schema.id, sourceId };
  });
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: { kind: "database", entityId: id } })), fixture.databaseId);
  const table = page.locator(".database-table:not(.embedded-table)").first();
  await page.locator(".page-header h1", { hasText: "Bulk rows" }).waitFor();
  assert.equal(await sourceSmallText(page, fixture), true, "source metadata must survive database creation and opening");
  const toolbar = table.getByRole("toolbar", { name: "Bulk row actions" });

  await table.getByLabel("Select row 1", { exact: true }).click();
  await toolbar.getByText("1 selected").waitFor();
  await selectView(table, page, "Alternate");
  await toolbar.waitFor({ state: "detached" });
  await selectView(table, page, "Default");
  await table.getByLabel("Select row 1", { exact: true }).click();
  await page.keyboard.press("Escape");
  await toolbar.waitFor({ state: "detached" });

  const scroll = table.locator(".table-scroll");
  await table.getByLabel("Select row 1", { exact: true }).click();
  await scroll.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await page.waitForTimeout(150);
  const target = table.locator('input[aria-label^="Select row "]').last();
  const targetNumber = Number((await target.getAttribute("aria-label")).replace("Select row ", ""));
  assert.ok(targetNumber > 100, `virtual range should cross unmounted rows, got ${targetNumber}`);
  await target.click({ modifiers: ["Shift"] });
  await toolbar.getByText(`${targetNumber} selected`).waitFor();
  await toolbar.getByLabel("Bulk property").selectOption("score");
  assert.equal(await toolbar.getByLabel("Bulk value").getAttribute("type"), "number");
  await toolbar.getByLabel("Bulk value").fill("77");
  await toolbar.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("status").getByText("Rows updated.").waitFor();
  await page.waitForFunction(async ({ id, count }) => (await window.lotion.databases.get(id)).records.slice(0, count).every((record) => record.score === 77), { id: fixture.databaseId, count: targetNumber });
  assert.equal(await sourceSmallText(page, fixture), true, "bulk cell updates must not overwrite source page metadata");
  await dismissFeedback(page);

  await scroll.evaluate((element) => { element.scrollTop = 0; });
  await page.waitForTimeout(100);
  await table.getByLabel("Select row 1", { exact: true }).click();
  await table.getByLabel("Select row 2", { exact: true }).click({ modifiers: [process.platform === "darwin" ? "Meta" : "Control"] });
  await toolbar.getByText("2 selected").waitFor();
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected bulk row persistence failure"));
  const duplicateButton = toolbar.getByRole("button", { name: "Duplicate" });
  await duplicateButton.evaluate((button) => {
    button.click();
    button.click();
  });
  const bulkFailureAlert = page.locator('.bulk-row-feedback.error[role="alert"]');
  await bulkFailureAlert.waitFor({ timeout: 8_000 });
  const bulkFailureMessage = (await bulkFailureAlert.locator("span").textContent() ?? "").trim();
  assert.match(bulkFailureMessage, /Injected bulk row persistence failure/);
  assert.equal(await toolbar.getAttribute("aria-busy"), "false");
  assert.match(await toolbar.innerText(), /2 selected/);
  const afterFailedDuplicate = await page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return {
      count: bundle.records.length,
      copyCount: bundle.records.filter((record) => /Virtual row [12] copy/.test(String(record.title))).length
    };
  }, fixture.databaseId);
  assert.deepEqual(afterFailedDuplicate, { count: 160, copyCount: 0 });
  await bulkFailureAlert.getByRole("button", { name: "Retry" }).evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByRole("status").getByText("Rows duplicated.").waitFor();
  const duplicateState = await page.evaluate(async ({ databaseId, sourceId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const duplicate = bundle.records.find((record) => record.title === "Virtual row 1 copy");
    const doc = await window.lotion.rowPages.open(databaseId, String(duplicate.id));
    const source = await window.lotion.rowPages.open(databaseId, sourceId);
    return {
      count: bundle.records.length,
      copyCount: bundle.records.filter((record) => /Virtual row [12] copy/.test(String(record.title))).length,
      body: doc.markdown,
      smallText: doc.meta.smallText,
      sourceBody: source.markdown,
      sourceSmallText: source.meta.smallText
    };
  }, fixture);
  assert.equal(duplicateState.count, 162);
  assert.equal(duplicateState.copyCount, 2);
  assert.equal(duplicateState.body.trimEnd(), "# Bulk lifecycle body\n\nRestore me.");
  assert.equal(duplicateState.sourceSmallText, true, "the source layout metadata must remain active before delete");
  assert.equal(duplicateState.smallText, true);
  assert.equal(duplicateState.sourceBody.trimEnd(), "# Bulk lifecycle body\n\nRestore me.");
  const mutationRecovery = {
    message: bulkFailureMessage,
    selectionRetained: true,
    failedMutationRolledBack: afterFailedDuplicate.count === 160 && afterFailedDuplicate.copyCount === 0,
    duplicateSubmitSuppressed: true,
    retryCreatedExactlyOnce: duplicateState.count === 162 && duplicateState.copyCount === 2
  };
  await dismissFeedback(page);

  await table.getByLabel("Select all visible rows").check();
  await toolbar.getByText("162 selected").waitFor();
  await toolbar.getByLabel("Bulk property").selectOption("done");
  assert.equal(await toolbar.getByLabel("Bulk value").evaluate((element) => element.tagName), "SELECT");
  await assertNoDocumentHorizontalOverflow(page, `bulk selection ${viewport.name}`);
  await confirmAction(page, () => toolbar.getByRole("button", { name: "Delete" }).click(), /Delete 162 selected rows/);
  await page.getByRole("status").getByText("Rows moved to Deleted items.").waitFor();
  const deletedState = await page.evaluate(async ({ databaseId, sourceId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const tombstone = bundle.schema.deletedRows?.find((item) => String(item.record.id) === sourceId);
    return {
      rows: bundle.records.length,
      tombstones: bundle.schema.deletedRows?.length,
      ghost: await window.lotion.entities.resolve(sourceId),
      bodyPath: tombstone?.page?.bodyPath,
      smallText: tombstone?.page?.meta.smallText
    };
  }, fixture);
  assert.deepEqual({ rows: deletedState.rows, tombstones: deletedState.tombstones, ghost: deletedState.ghost }, { rows: 0, tombstones: 162, ghost: null });
  assert.ok(deletedState.bodyPath);
  assert.equal(deletedState.smallText, true);

  const deleted = await openDeletedRows(page, table);
  const sourceTombstone = deleted.locator(`.deleted-property-row[data-row-id="${fixture.sourceId}"]`);
  await sourceTombstone.waitFor();
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "bulk-deleted", viewport: viewport.name },
    name: `database-bulk-selection-${viewport.name}`,
    page,
    viewport
  });
  await sourceTombstone.getByRole("button", { name: "Restore" }).click();
  await sourceTombstone.waitFor({ state: "detached" });
  await page.waitForFunction(async ({ databaseId, sourceId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.records.some((record) => String(record.id) === sourceId) && (await window.lotion.entities.resolve(sourceId))?.rowId === sourceId;
  }, fixture);
  const restored = await page.evaluate(({ databaseId, sourceId }) => window.lotion.rowPages.open(databaseId, sourceId), fixture);
  assert.equal(restored.markdown.trimEnd(), "# Bulk lifecycle body\n\nRestore me.");
  assert.equal(restored.meta.smallText, true);

  return {
    viewport: viewport.name,
    virtualRange: targetNumber,
    atomicEdit: true,
    modifierToggle: true,
    escapeClear: true,
    viewScopeClear: true,
    typedEditors: true,
    duplicate: true,
    duplicateBody: true,
    duplicateMetadata: true,
    mutationRecovery,
    recoverableDelete: true,
    ghostPageRemoved: true,
    restoredBody: true,
    restoredMetadata: true,
    noHorizontalOverflow: true,
    snapshot: { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath }
  };
}

async function selectView(table, page, name) {
  const tab = table.locator(".view-tab", { hasText: name });
  if (await tab.count()) return tab.click();
  await table.locator(".view-tabs-more").click();
  await page.getByRole("menu", { name: "More views" }).getByRole("menuitem", { name }).click();
}

async function dismissFeedback(page) {
  await page.getByRole("button", { name: "Dismiss bulk action result" }).click();
}

async function sourceSmallText(page, fixture) {
  return page.evaluate(({ databaseId, sourceId }) => window.lotion.rowPages.open(databaseId, sourceId).then((doc) => doc.meta.smallText), fixture);
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
