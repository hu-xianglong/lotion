#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDatabaseAccessibilityArtifactContract } from "./lib/database-accessibility-artifacts.mjs";
import { captureElementSnapshot, forEachViewport, reloadRendererPage, selectedViewports, withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const MOD = process.platform === "darwin" ? "Meta" : "Control";

const result = await withLotionUIHarness("database-accessibility-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-database-a11y-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseAccessibilityArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  await page.waitForFunction(() => Boolean(window.lotion?.views?.create));
  await page.evaluate((databaseId) => window.lotion.views.create({ databaseId, name: "Accessibility overflow", type: "list", sourceMode: "empty" }), DATABASE_ID);
  await page.waitForFunction(async (databaseId) => (await window.lotion.databases.get(databaseId)).views.length > 6, DATABASE_ID);
  // A previous suite case may leave this database open when the workspace is
  // switched. Reload so the renderer cache observes the view created through
  // the preload API instead of retaining the pre-mutation six-view bundle.
  await reloadRendererPage(page);
  const table = await openDatabase(page);

  const settings = table.getByRole("button", { name: "View settings" });
  await settings.focus();
  await page.keyboard.press("Enter");
  let rootMenu = page.getByRole("menu", { name: "Database settings" });
  await rootMenu.waitFor();
  assert.equal((await rootMenu.getAttribute("class")).includes("menu-sheet"), viewport.name === "compact");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "menuitem");
  await page.keyboard.press("ArrowDown");
  assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /Database settings/);
  await page.keyboard.press("Escape");
  await rootMenu.waitFor({ state: "detached" });
  await assertFocus(page, "button[aria-label='View settings']");

  const activeTab = table.getByRole("tab", { name: "Default", exact: true });
  await activeTab.focus();
  await page.keyboard.press("Enter");
  const viewMenu = page.getByRole("menu", { name: "View menu Default" });
  await viewMenu.waitFor();
  await page.keyboard.press("Escape");
  await viewMenu.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "tab" && document.activeElement?.textContent?.includes("Default"));

  const more = table.getByRole("button", { name: /more$/ });
  await more.focus();
  await page.keyboard.press("Enter");
  const moreMenu = table.getByRole("menu", { name: "More views" });
  await moreMenu.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem" && document.activeElement?.closest('[aria-label="More views"]'));
  const firstOverflowLabel = await page.evaluate(() => document.activeElement?.textContent?.trim());
  await page.keyboard.press("ArrowDown");
  assert.notEqual(await page.evaluate(() => document.activeElement?.textContent?.trim()), firstOverflowLabel);
  await page.keyboard.press(`${MOD}+f`);
  await moreMenu.waitFor({ state: "detached" });
  const searchInput = table.getByRole("searchbox", { name: "Search this view" });
  await searchInput.waitFor();
  await assertFocus(page, "input[aria-label='Search this view']");
  await page.keyboard.press("Escape");
  await assertFocus(page, "button[aria-label='Search']");

  const rowAction = table.getByRole("button", { name: /Row actions/ }).first();
  await rowAction.focus();
  await page.keyboard.press("Enter");
  const rowMenu = page.getByRole("menu", { name: /Row menu/ });
  await rowMenu.waitFor();
  await page.keyboard.press(`${MOD}+f`);
  await rowMenu.waitFor({ state: "detached" });
  await searchInput.waitFor();
  await page.keyboard.press("Escape");

  const checkbox = table.getByRole("checkbox", { name: /Select row/ }).first();
  await checkbox.focus();
  await page.keyboard.press("Space");
  const bulkToolbar = table.getByRole("toolbar", { name: "Bulk row actions" });
  await bulkToolbar.waitFor();
  await settings.focus();
  await page.keyboard.press("Enter");
  rootMenu = page.getByRole("menu", { name: "Database settings" });
  await rootMenu.waitFor();
  await page.keyboard.press("Escape");
  await rootMenu.waitFor({ state: "detached" });
  assert.equal(await checkbox.isChecked(), true, "closing the menu must not also clear row selection");
  await bulkToolbar.waitFor();
  await page.keyboard.press("Escape");
  await bulkToolbar.waitFor({ state: "detached" });

  const beforeRows = await rowCount(page);
  await page.locator(".page-header h1").focus();
  await page.keyboard.press(`${MOD}+Enter`);
  await page.waitForFunction(async ({ databaseId, expected }) => (await window.lotion.databases.get(databaseId)).records.length === expected, { databaseId: DATABASE_ID, expected: beforeRows + 1 });

  await page.evaluate(() => window.lotion.debug.failNextDatabaseViewWrite("Forced accessibility smoke view failure"));
  const sortTrigger = table.getByRole("button", { name: "Sort" });
  await sortTrigger.focus();
  await page.keyboard.press("Enter");
  const sort = page.getByRole("dialog", { name: "Sort" });
  await sort.waitFor();
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"][aria-label="Sort"]'))), true, "sort dialog must move focus inside itself");
  const addSort = sort.getByRole("button", { name: /Add sort/ });
  await addSort.focus();
  await page.keyboard.press("Enter");
  const viewError = table.locator(".view-save-status.error");
  await viewError.waitFor();
  assert.match(await viewError.innerText(), /Forced accessibility smoke view failure/);
  await page.keyboard.press("Escape");
  await sort.waitFor({ state: "detached" });
  await assertFocus(page, "button[aria-label='Sort']");

  const targetAction = table.getByRole("button", { name: /Row actions/ }).first();
  const targetTitle = (await targetAction.getAttribute("aria-label")).replace(/^Row actions\s*/, "");
  const targetRow = targetAction.locator("xpath=ancestor::tr[1]");
  const targetRowId = await targetRow.getAttribute("data-row-id");
  assert.ok(targetRowId);
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Forced accessibility smoke row delete failure"));
  await targetAction.focus();
  await page.keyboard.press("Enter");
  const targetMenu = page.getByRole("menu", { name: /Row menu/ });
  await targetMenu.waitFor();
  await page.evaluate(() => {
    window.__lotionAccessibilityConfirmMessage = "";
    window.confirm = (message) => {
      window.__lotionAccessibilityConfirmMessage = String(message);
      return true;
    };
  });
  const deleteItem = targetMenu.getByRole("menuitem", { name: /Delete/ });
  await deleteItem.focus();
  await page.keyboard.press("Enter");
  assert.match(await page.evaluate(() => window.__lotionAccessibilityConfirmMessage), /Delete .+\? You can restore it from Deleted items\./);
  const rowError = page.getByRole("alert").filter({ hasText: "Delete failed" });
  await rowError.waitFor();
  assert.match(await rowError.innerText(), /Forced accessibility smoke row delete failure/);
  assert.equal(await table.locator(`tr[data-row-id="${targetRowId}"]`).count(), 1, "failed deletion must keep the row visible");
  await page.waitForFunction((rowId) => document.activeElement?.closest(`tr[data-row-id="${rowId}"]`) !== null, targetRowId);

  const snapshot = await captureElementSnapshot({ artifactRoot, locator: page.locator("body"), metadata: { phase: "recoverable-errors", viewport: viewport.name }, name: `database-accessibility-${viewport.name}`, page, viewport });
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(overflow.width <= overflow.viewport, `accessibility workflow overflowed ${viewport.name}: ${JSON.stringify(overflow)}`);

  const countBeforeRetry = await rowCount(page);
  await rowError.getByRole("button", { name: "Retry delete" }).focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(async ({ databaseId, expected }) => (await window.lotion.databases.get(databaseId)).records.length === expected, { databaseId: DATABASE_ID, expected: countBeforeRetry - 1 });
  const undoToast = page.getByRole("status").filter({ hasText: `Moved “${targetTitle}”` });
  await undoToast.waitFor();

  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Forced accessibility smoke undo failure"));
  await undoToast.getByRole("button", { name: "Undo" }).focus();
  await page.keyboard.press("Enter");
  const undoError = page.getByRole("alert").filter({ hasText: "Undo failed" });
  await undoError.waitFor();
  assert.match(await undoError.innerText(), /Forced accessibility smoke undo failure/);
  assert.equal(await table.locator(`tr[data-row-id="${targetRowId}"]`).count(), 0);
  await undoError.getByRole("button", { name: "Retry undo" }).focus();
  await page.keyboard.press("Enter");
  await table.locator(`tr[data-row-id="${targetRowId}"]`).waitFor();

  await viewError.getByRole("button", { name: "Retry" }).focus();
  await page.keyboard.press("Enter");
  await table.locator(".view-save-status.saved").waitFor();
  const persistedSorts = await page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).views.find((view) => view.id === "view_default")?.sorts.length, DATABASE_ID);
  assert.ok(persistedSorts >= 1);

  return {
    viewport: viewport.name,
    keyboardMenus: true,
    focusReturn: true,
    layeredEscape: true,
    singleMenuLayer: true,
    overflowMenuKeyboard: true,
    shortcuts: true,
    sortAutoFocus: true,
    viewFailureRecovery: true,
    rowDeleteFailureRecovery: true,
    rowUndoFailureRecovery: true,
    dangerConfirmation: true,
    screenReaderNames: true,
    responsiveMenu: true,
    noHorizontalOverflow: true,
    snapshot
  };
}

async function assertFocus(page, selector) {
  await page.waitForFunction((target) => document.activeElement?.matches(target), selector);
}

async function rowCount(page) {
  return page.evaluate(async (databaseId) => (await window.lotion.databases.get(databaseId)).records.length, DATABASE_ID);
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
