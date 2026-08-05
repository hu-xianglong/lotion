#!/usr/bin/env node
import assert from "node:assert/strict";
import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDatabaseViewMenuArtifactContract } from "./lib/database-view-menu-artifacts.mjs";
import { assertNoDocumentHorizontalOverflow, captureElementSnapshot, forEachViewport, withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1040, height: 820 }
];

const result = await withLotionUIHarness("database-view-menu-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, VIEWPORTS, async (viewport) => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), `lotion-view-menu-${viewport.name}-`));
    await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
    await openWorkspace(workspaceRoot);
    viewports.push(await runScenario({ artifactRoot, page, viewport }));
  });
  const summary = { status: "passed", viewports };
  summary.artifactContract = await assertDatabaseViewMenuArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runScenario({ artifactRoot, page, viewport }) {
  await openDatabase(page);
  const table = page.locator(".database-table:not(.embedded-table)").first();
  await table.waitFor();
  await table.getByLabel("View tab display").selectOption("both");
  const defaultTab = table.getByRole("tab", { name: "Default" });
  const boardTab = table.getByRole("tab", { name: "Board" });
  assert.equal(await defaultTab.getAttribute("aria-selected"), "true");

  await boardTab.click({ button: "right" });
  assert.equal(await defaultTab.getAttribute("aria-selected"), "true", "right-clicking an inactive tab must not switch views");
  let menu = page.getByRole("menu", { name: "View menu Board" });
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await menu.getByLabel("View name").fill("default");
  await menu.getByRole("alert").filter({ hasText: "unique" }).waitFor();
  assert.equal(await menu.getByRole("button", { name: "Save" }).isDisabled(), true);
  await page.keyboard.press("Escape");
  await menu.getByRole("menuitem", { name: "Rename" }).waitFor();
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });

  await boardTab.click({ button: "right" });
  menu = page.getByRole("menu", { name: "View menu Board" });
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected view menu failure"));
  const duplicateAction = menu.getByRole("menuitem", { name: "Duplicate" });
  await duplicateAction.evaluate((button) => {
    button.click();
    button.click();
  });
  const recoveryAlert = menu.getByRole("alert");
  await recoveryAlert.waitFor();
  const recoveryMessage = (await recoveryAlert.textContent())?.trim() ?? "";
  assert.match(recoveryMessage, /Injected view menu failure/);
  let bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(bundle.views.filter((candidate) => candidate.name === "Board copy").length, 0, "failed duplicate must not persist a partial view");
  assert.equal(await duplicateAction.isEnabled(), true, "failed duplicate must become retryable");
  await duplicateAction.click();
  await table.getByRole("tab", { name: "Board copy" }).waitFor();
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(bundle.views.filter((candidate) => candidate.name === "Board copy").length, 1, "retry must create exactly one view");
  const actionRecovery = {
    message: recoveryMessage,
    menuRemainedOpen: true,
    duplicateSubmitSuppressed: true,
    retryCreatedExactlyOne: true
  };

  await defaultTab.click({ button: "right" });
  menu = page.getByRole("menu", { name: "View menu Default" });
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await menu.getByLabel("View name").fill("Work queue");
  await menu.getByRole("button", { name: "Save" }).click();
  const renamedTab = table.getByRole("tab", { name: "Work queue" });
  await renamedTab.waitFor();

  await renamedTab.click();
  menu = page.getByRole("menu", { name: "View menu Work queue" });
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  const copiedTab = table.getByRole("tab", { name: "Work queue copy" });
  await copiedTab.waitFor();
  assert.equal(await copiedTab.getAttribute("aria-selected"), "true");

  await table.getByRole("button", { name: "Open Work queue copy view menu" }).click();
  menu = page.getByRole("menu", { name: "View menu Work queue copy" });
  await menu.getByRole("menuitem", { name: "Set as default" }).click();
  await page.waitForFunction(async ({ databaseId, viewName }) => {
    const current = await window.lotion.databases.get(databaseId);
    return current.views.find((view) => view.id === current.schema.defaultViewId)?.name === viewName;
  }, { databaseId: DATABASE_ID, viewName: "Work queue copy" });
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  const copied = bundle.views.find((view) => view.name === "Work queue copy");
  assert.equal(bundle.schema.defaultViewId, copied.id);

  await copiedTab.click();
  menu = page.getByRole("menu", { name: "View menu Work queue copy" });
  await menu.getByRole("menuitem", { name: "Copy link" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(link, /^lotion:\/\/database\/db_tasks\?view=/);
  await page.keyboard.press("Escape");

  await page.reload();
  await page.waitForSelector(".main-content");
  await page.evaluate((url) => window.dispatchEvent(new CustomEvent("lotion:open-database-view-link", { detail: { url } })), link);
  await page.locator('.database-table:not(.embedded-table) .view-tab[aria-selected="true"]').filter({ hasText: "Work queue copy" }).waitFor();
  bundle = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), DATABASE_ID);
  assert.equal(bundle.views.find((view) => view.id === bundle.schema.defaultViewId)?.name, "Work queue copy");

  const active = table.locator('.view-tab[aria-selected="true"]');
  await active.click();
  menu = page.getByRole("menu", { name: "View menu Work queue copy" });
  await assertNoDocumentHorizontalOverflow(page, `view context menu ${viewport.name}`);
  const rect = await menu.boundingBox();
  assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "view-menu-lifecycle", viewport: viewport.name },
    name: `database-view-menu-lifecycle-${viewport.name}`,
    page,
    viewport
  });
  await menu.getByRole("menuitem", { name: "Delete view" }).click();
  await page.waitForFunction(async (databaseId) => {
    const current = await window.lotion.databases.get(databaseId);
    return !current.views.some((view) => view.name === "Work queue copy") && current.views.some((view) => view.id === current.schema.defaultViewId);
  }, DATABASE_ID);

  return {
    viewport: viewport.name,
    inactiveRightClickIsolated: true,
    uniqueRenameValidated: true,
    renameEscapeStayedInMenu: true,
    renamed: true,
    duplicated: true,
    actionRecovery,
    deepLink: link,
    defaultDeleteRecovered: true,
    noHorizontalOverflow: true,
    snapshot
  };
}

async function openDatabase(page) {
  await page.locator(".main-content").waitFor({ timeout: 8_000 });
  await page.waitForFunction(() => Boolean(window.lotion?.databases?.get), null, { timeout: 8_000 });
  await page.evaluate((databaseId) => window.dispatchEvent(new CustomEvent("lotion:open-entity", {
    detail: { kind: "database", entityId: databaseId }
  })), DATABASE_ID);
  await page.locator(".page-header h1").filter({ hasText: /^Tasks$/i }).waitFor({ timeout: 8_000 });
}
