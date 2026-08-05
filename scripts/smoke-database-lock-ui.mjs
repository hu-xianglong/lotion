#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDatabaseLockArtifactContract } from "./lib/database-lock-artifacts.mjs";
import { captureElementSnapshot, forEachViewport, selectedViewports, withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const ROW_ID = "row_task_1";

const result = await withLotionUIHarness("database-lock-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-database-lock-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseLockArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  let table = await openDatabase(page);
  await openDatabaseSettings(table, page);
  await page.getByRole("menu", { name: "Database settings menu" }).getByRole("menuitem", { name: "Lock database" }).click();
  await table.locator(".database-locked-indicator").waitFor();
  await assertStructuralControlsLocked(table);

  await table.getByRole("button", { name: "View settings" }).click();
  await page.getByRole("menuitem", { name: "View settings" }).click();
  const viewMenu = page.getByRole("menu", { name: "View settings menu" });
  const lockedReason = await viewMenu.getByRole("menuitem", { name: "Filter" }).getAttribute("title");
  assert.match(lockedReason, /locked/i);
  assert.equal(await viewMenu.getByRole("menuitem", { name: "Group" }).isDisabled(), true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const backend = await page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const attempts = {
      addField: () => window.lotion.databases.addField(databaseId, { name: "Bypass field", type: "text" }),
      createView: () => window.lotion.views.create({ databaseId, name: "Bypass view", type: "list", sourceMode: "empty" }),
      patchView: () => window.lotion.views.patch({ databaseId, viewId: bundle.views[0].id, patch: { name: "Bypass rename" }, expectedRevision: bundle.views[0].revision || 0 }),
      saveTemplate: () => window.lotion.databases.saveTemplate({ databaseId, template: { name: "Bypass template" } }),
      updateTags: () => window.lotion.databases.updateMeta({ databaseId, tags: ["bypass"] }),
      deleteDatabase: () => window.lotion.databases.delete(databaseId)
    };
    const errors = {};
    for (const [name, attempt] of Object.entries(attempts)) {
      try {
        await attempt();
        errors[name] = "unexpected success";
      } catch (error) {
        errors[name] = String(error?.message ?? error);
      }
    }
    let systemLockError = "unexpected success";
    try {
      await window.lotion.databases.updateMeta({ databaseId: "pages", locked: true });
    } catch (error) {
      systemLockError = String(error?.message ?? error);
    }
    return { errors, systemLockError };
  }, DATABASE_ID);
  for (const [name, message] of Object.entries(backend.errors)) {
    assert.match(message, /DATABASE_LOCKED|is locked/i, `${name} must be rejected by the shared lock guard`);
  }
  assert.match(backend.systemLockError, /system databases cannot be locked/i);

  const row = table.locator(`tr[data-row-id="${ROW_ID}"]`);
  const titleEditor = row.locator(".title-cell-editor input, .title-cell-editor textarea, .title-cell-editor [contenteditable='true']").first();
  const fullTitle = `Locked full row ${viewport.name}`;
  await titleEditor.fill(fullTitle);
  await titleEditor.blur();
  await waitForRowTitle(page, fullTitle);

  const beforeRows = await page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).records.length, DATABASE_ID);
  await table.locator(".new-row-menu-wrap > button.primary").click();
  await page.waitForFunction(async ({ databaseId, count }) => (await window.lotion.databases.get(databaseId)).records.length === count + 1, { databaseId: DATABASE_ID, count: beforeRows });
  const rowPageMarkdown = `Locked row page remains editable (${viewport.name})`;
  await page.evaluate(({ databaseId, rowId, markdown }) => window.lotion.rowPages.update({ databaseId, rowId, markdown }), { databaseId: DATABASE_ID, rowId: ROW_ID, markdown: rowPageMarkdown });
  assert.equal((await page.evaluate(({ databaseId, rowId }) => window.lotion.rowPages.open(databaseId, rowId).then((document) => document.markdown), { databaseId: DATABASE_ID, rowId: ROW_ID })).trim(), rowPageMarkdown);

  await page.reload();
  table = await openDatabase(page);
  await table.locator(".database-locked-indicator").waitFor();
  await assertStructuralControlsLocked(table);
  assert.equal(await page.evaluate(async (databaseId) => Boolean((await window.lotion.databases.get(databaseId)).schema.locked), DATABASE_ID), true);

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: { kind: "page", entityId: "pg_home" } })));
  await page.locator(".title-input").first().waitFor();
  const embedded = page.locator(".embedded-table").filter({ hasText: "Tasks" }).first();
  await embedded.waitFor();
  await embedded.locator(".database-locked-indicator").waitFor();
  await assertStructuralControlsLocked(embedded, { embedded: true });
  const embeddedTitle = `Locked embedded row ${viewport.name}`;
  const embeddedEditor = embedded.locator(`tr[data-row-id="${ROW_ID}"] .title-cell-editor input, tr[data-row-id="${ROW_ID}"] .title-cell-editor textarea, tr[data-row-id="${ROW_ID}"] .title-cell-editor [contenteditable='true']`).first();
  await embeddedEditor.fill(embeddedTitle);
  await embeddedEditor.blur();
  await waitForRowTitle(page, embeddedTitle);

  await embedded.scrollIntoViewIfNeeded();
  const snapshot = await captureElementSnapshot({ artifactRoot, locator: page.locator("body"), metadata: { phase: "locked-embedded", viewport: viewport.name }, name: `database-lock-${viewport.name}`, page, viewport });

  await openDatabaseSettings(embedded, page);
  await page.getByRole("menu", { name: "Database settings menu" }).getByRole("menuitem", { name: "Unlock database" }).click();
  await embedded.locator(".database-locked-indicator").waitFor({ state: "detached" });
  assert.equal(await embedded.getByRole("button", { name: "Filter" }).isEnabled(), true);
  assert.equal(await page.evaluate(async (databaseId) => Boolean((await window.lotion.databases.get(databaseId)).schema.locked), DATABASE_ID), false);

  table = await openDatabase(page);
  assert.equal(await table.locator(".database-locked-indicator").count(), 0);
  assert.equal(await table.getByRole("button", { name: "New view" }).isEnabled(), true);

  return {
    viewport: viewport.name,
    backendStructuralBlocked: true,
    systemLockBlocked: true,
    rowCellEditable: true,
    rowCreateEditable: true,
    rowPageEditable: true,
    persistedAfterReload: true,
    fullViewLocked: true,
    embeddedViewLocked: true,
    embeddedRowEditable: true,
    embeddedUnlock: true,
    lockedReason,
    snapshot
  };
}

async function assertStructuralControlsLocked(table, { embedded = false } = {}) {
  assert.equal(await table.getByRole("button", { name: "Filter" }).isDisabled(), true);
  assert.equal(await table.getByRole("button", { name: "Sort" }).isDisabled(), true);
  assert.equal(await table.getByRole("button", { name: "New view" }).isDisabled(), true);
  if (!embedded) assert.equal(await table.getByRole("button", { name: "Add or manage properties" }).isDisabled(), true);
}

async function waitForRowTitle(page, title) {
  await page.waitForFunction(async ({ databaseId, rowId, expected }) => (
    await window.lotion.databases.get(databaseId)
  ).records.find((record) => String(record.id) === rowId)?.title === expected, { databaseId: DATABASE_ID, rowId: ROW_ID, expected: title });
}

async function openDatabase(page) {
  await page.locator(".startup-loading").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get));
  await page.evaluate((databaseId) => {
    localStorage.setItem(`lotion.database.lastActiveView.${databaseId}`, "view_default");
    window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: { kind: "database", entityId: databaseId } }));
  }, DATABASE_ID);
  await page.locator(".page-header h1").filter({ hasText: /^Tasks$/ }).waitFor();
  const table = page.locator(".database-table:not(.embedded-table)").first();
  await table.waitFor();
  return table;
}

async function openDatabaseSettings(table, page) {
  await table.getByRole("button", { name: "View settings" }).click();
  await page.getByRole("menu", { name: "Database settings" }).getByRole("menuitem", { name: /Database settings/ }).click();
  await page.getByRole("menu", { name: "Database settings menu" }).waitFor();
}
