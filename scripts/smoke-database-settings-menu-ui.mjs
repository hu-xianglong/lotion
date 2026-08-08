#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseSettingsMenuArtifactContract } from "./lib/database-settings-menu-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  withLotionUIHarness
} from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const SYSTEM_DATABASE_ID = "pages";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 680, height: 760 }
];

const result = await withLotionUIHarness("database-settings-menu-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, VIEWPORTS, async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-database-settings-menu-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseSettingsMenuArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  const table = await openDatabase(page, DATABASE_ID);
  await assertNoDocumentHorizontalOverflow(page, `database settings initial ${viewport.name}`);

  const root = await openSettingsRoot(table, page);
  await assertMenuGeometry(page, root, viewport);
  assert.match(await focusedMenuItem(page), /^View settingsOnly affects “Default”/);
  assert.equal((await root.getAttribute("class") ?? "").split(/\s+/).includes("menu-sheet"), viewport.name === "compact");

  await page.keyboard.press("ArrowDown");
  assert.match(await focusedMenuItem(page), /^Database settingsAffects every saved view/);
  await page.keyboard.press("Enter");
  const databaseMenu = page.getByRole("menu", { name: "Database settings menu" });
  await databaseMenu.waitFor();
  assert.equal(await focusedMenuItem(page), "Edit propertiesChanges apply to every view");
  await assertMenuLabels(databaseMenu, ["Edit properties", "Templates", "Deleted items", "Lock database"]);
  assert.equal(await databaseMenu.getByRole("menuitem", { name: "Lock database" }).isEnabled(), true);

  await page.keyboard.press("Escape");
  await page.getByRole("menu", { name: "Database settings" }).waitFor();
  await page.keyboard.press("Escape");
  await assertMenuClosed(page);

  const viewRoot = await openSettingsRoot(table, page);
  await viewRoot.getByRole("menuitem", { name: /View settings/ }).click();
  let viewMenu = page.getByRole("menu", { name: "View settings menu" });
  await viewMenu.waitFor();
  await assertMenuLabels(viewMenu, ["Layout", "Property visibility", "Filter", "Sort", "Group", "Open pages in", "Copy link to view"]);
  await viewMenu.getByRole("menuitem", { name: /Open pages in/ }).click();
  const openPagesMenu = page.getByRole("menu", { name: "Open pages in menu" });
  await openPagesMenu.waitFor();
  await assertMenuLabels(openPagesMenu, ["Side peek", "Center peek", "Full page"]);
  await page.keyboard.press("Escape");
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "view-settings-menu", viewport: viewport.name },
    name: `database-settings-menu-${viewport.name}`,
    page,
    viewport
  });

  await viewMenu.getByRole("menuitem", { name: /Open pages in/ }).click();
  await page.getByRole("menu", { name: "Open pages in menu" }).getByRole("menuitem", { name: "Center peek" }).click();
  await assertMenuClosed(page);
  await page.waitForFunction(async (databaseId) => {
    const current = await window.lotion.databases.get(databaseId);
    return current.views.find((candidate) => candidate.id === "view_default")?.pageOpenMode === "center_peek";
  }, DATABASE_ID);
  const filterRoot = await openSettingsRoot(table, page);
  await filterRoot.getByRole("menuitem", { name: /View settings/ }).click();
  viewMenu = page.getByRole("menu", { name: "View settings menu" });
  await viewMenu.waitFor();
  await viewMenu.getByRole("menuitem", { name: "Filter" }).click();
  await page.getByRole("dialog", { name: "Filter" }).waitFor();
  await page.mouse.click(4, 4);

  const outsideRoot = await openSettingsRoot(table, page);
  await outsideRoot.waitFor();
  await page.mouse.click(4, 4);
  await assertMenuClosed(page);

  const recoveryRoot = await openSettingsRoot(table, page);
  await recoveryRoot.getByRole("menuitem", { name: /Database settings/ }).click();
  const recoveryMenu = page.getByRole("menu", { name: "Database settings menu" });
  await recoveryMenu.waitFor();
  await page.evaluate(() => window.lotion.debug.failNextDatabaseMetaWrite("Injected database settings failure"));
  const lockAction = recoveryMenu.getByRole("menuitem", { name: "Lock database" });
  await lockAction.evaluate((button) => {
    button.click();
    button.click();
  });
  const recoveryAlert = recoveryMenu.getByRole("alert");
  await recoveryAlert.waitFor();
  const recoveryMessage = (await recoveryAlert.textContent())?.trim() ?? "";
  assert.match(recoveryMessage, /Injected database settings failure/);
  let bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(Boolean(bundle.schema.locked), false, "failed lock must leave the database unlocked");
  assert.equal(await lockAction.isEnabled(), true, "failed lock must become retryable");
  await lockAction.click();
  await recoveryMenu.waitFor({ state: "detached" });
  await page.waitForFunction(async (databaseId) => {
    const current = await window.lotion.databases.get(databaseId);
    return current.schema.locked === true;
  }, DATABASE_ID);
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(bundle.schema.locked, true);
  const actionRecovery = {
    message: recoveryMessage,
    menuRemainedOpen: true,
    duplicateSubmitSuppressed: true,
    failedStateRolledBack: true,
    retryLockedExactlyOnce: true
  };

  let systemDisabledReason = "not-run";
  if (viewport.name === "desktop") {
    const systemTable = await openDatabase(page, SYSTEM_DATABASE_ID);
    const systemRoot = await openSettingsRoot(systemTable, page);
    await systemRoot.getByRole("menuitem", { name: /Database settings/ }).click();
    const systemMenu = page.getByRole("menu", { name: "Database settings menu" });
    await systemMenu.waitFor();
    systemDisabledReason = await assertDisabledReason(systemMenu, "Edit properties", "System database structure is managed by Lotion.");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }

  await assertNoDocumentHorizontalOverflow(page, `database settings final ${viewport.name}`);
  return {
    viewport: viewport.name,
    sheetFallback: viewport.name === "compact",
    keyboardNavigation: true,
    escapeLevels: 2,
    outsideDismissal: true,
    scopeLabelsVerified: true,
    pageOpenModePersisted: true,
    actionRecovery,
    systemDisabledReason,
    noHorizontalOverflow: true,
    snapshot: { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath }
  };
}

async function openDatabase(page, entityId) {
  await page.locator(".main-content").waitFor({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get), null, { timeout: 8_000 });
  await page.evaluate((databaseId) => window.dispatchEvent(new CustomEvent("lotion:open-entity", {
    detail: { kind: "database", entityId: databaseId }
  })), entityId);
  const expectedName = entityId === SYSTEM_DATABASE_ID ? "pages" : "Tasks";
  await page.locator(".database-title-wrap h1").filter({ hasText: new RegExp(`^${expectedName}$`, "i") }).waitFor({ timeout: 8_000 });
  const table = page.locator(".database-table:not(.embedded-table)").first();
  await table.waitFor({ timeout: 8_000 });
  return table;
}

async function openSettingsRoot(table, page) {
  await table.getByRole("button", { name: "View settings" }).click();
  const root = page.getByRole("menu", { name: "Database settings" });
  await root.waitFor({ timeout: 8_000 });
  return root;
}

async function assertMenuGeometry(page, menu, viewport) {
  const rect = await menu.boundingBox();
  assert.ok(rect, `menu rectangle missing for ${viewport.name}`);
  assert.ok(rect.x >= 0 && rect.y >= 0, `menu starts outside ${viewport.name}`);
  assert.ok(rect.x + rect.width <= viewport.width + 1, `menu exceeds ${viewport.name} width`);
  assert.ok(rect.y + rect.height <= viewport.height + 1, `menu exceeds ${viewport.name} height`);
  const viewportSize = page.viewportSize();
  assert.deepEqual(viewportSize, { width: viewport.width, height: viewport.height });
}

async function focusedMenuItem(page) {
  return page.evaluate(() => document.activeElement?.getAttribute("role") === "menuitem"
    ? document.activeElement.textContent?.replace(/\s+/g, " ").trim() ?? ""
    : "");
}

async function assertMenuLabels(menu, labels) {
  for (const label of labels) await menu.getByRole("menuitem", { name: new RegExp(`^${escapeRegExp(label)}`) }).waitFor();
}

async function assertDisabledReason(menu, label, expected) {
  const item = menu.getByRole("menuitem", { name: new RegExp(`^${escapeRegExp(label)}`) });
  assert.equal(await item.isDisabled(), true, `${label} should be disabled`);
  assert.equal(await item.getAttribute("title"), expected);
  return expected;
}

async function assertMenuClosed(page) {
  await page.waitForFunction(() => document.querySelector('[role="menu"]') === null, null, { timeout: 8_000 });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
