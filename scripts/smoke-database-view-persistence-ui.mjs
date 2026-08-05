#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmod, cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { withLotionUIHarness } from "./ui-harness.mjs";

const DATABASE_ID = "db_tasks";
const VIEW_ID = "view_default";

const result = await withLotionUIHarness("database-view-persistence-ui", async ({ consoleEvents, openWorkspace, page }) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "lotion-view-persistence-ui-"));
  await cp(join(process.cwd(), "samples", "demo-space"), workspaceRoot, { recursive: true });
  await openWorkspace(workspaceRoot);
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await navigateToDatabase(page, DATABASE_ID);
  await page.waitForSelector(".database-table", { timeout: 8_000 });

  await page.getByRole("tab", { name: /Done tasks/i }).click();
  await page.locator(".view-tab.active").filter({ hasText: "Done tasks" }).waitFor();
  const savedPreference = await page.evaluate((databaseId) => (
    window.localStorage.getItem(`lotion.database.lastActiveView.${databaseId}`)
  ), DATABASE_ID);
  assert.equal(savedPreference, "view_done");

  await page.reload();
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await navigateToDatabase(page, DATABASE_ID);
  await page.locator(".view-tab.active").filter({ hasText: "Done tasks" }).waitFor({ timeout: 8_000 });

  await page.getByRole("tab", { name: /^Default$/i }).click();
  const before = await readView(page, DATABASE_ID, VIEW_ID);
  const beforeDirection = before.sorts[0]?.direction ?? "asc";
  const nextDirection = beforeDirection === "asc" ? "desc" : "asc";
  await changeFirstSortDirection(page, nextDirection);
  await page.locator(".view-save-status.saved").waitFor({ timeout: 8_000 });
  const persisted = await pollView(page, DATABASE_ID, VIEW_ID, (view) => (
    view.sorts[0]?.direction === nextDirection && (view.revision ?? 0) > (before.revision ?? 0)
  ));

  const viewPath = join(workspaceRoot, "databases", "user", "Tasks--db_tasks", "views", `${VIEW_ID}.json`);
  const viewsDir = join(workspaceRoot, "databases", "user", "Tasks--db_tasks", "views");
  const durableBeforeFailure = await readFile(viewPath, "utf8");
  await chmod(viewsDir, 0o555);
  try {
    await changeFirstSortDirection(page, beforeDirection);
    await page.locator(".view-save-status.error").waitFor({ timeout: 8_000 });
  } finally {
    await chmod(viewsDir, 0o755);
  }
  assert.equal(await readFile(viewPath, "utf8"), durableBeforeFailure);
  const afterFailure = await readView(page, DATABASE_ID, VIEW_ID);
  assert.equal(afterFailure.sorts[0]?.direction, nextDirection);
  assert.equal(consoleEvents.some((event) => /views:patch.*EACCES/i.test(event.text)), true);

  return {
    status: "passed",
    databaseId: DATABASE_ID,
    viewId: VIEW_ID,
    restoredLastActiveView: savedPreference,
    persistedRevision: persisted.revision,
    forcedFailureVisible: true,
    rollbackPreservedDirection: afterFailure.sorts[0]?.direction
  };
}, { failOnConsoleErrors: false });

console.log(JSON.stringify(result, null, 2));

async function navigateToDatabase(page, databaseId) {
  await page.evaluate((entityId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId }
    }));
  }, databaseId);
}

async function changeFirstSortDirection(page, direction) {
  await page.locator('.toolbar-icon[aria-label="Sort"]').click();
  const popover = page.getByRole("dialog", { name: "Sort" });
  await popover.waitFor();
  const selects = popover.locator("select");
  if (await selects.count() === 0) {
    await popover.getByRole("button", { name: /Add sort/i }).click();
  }
  await popover.locator("select").nth(1).selectOption(direction);
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.mouse.click(2, 2);
}

async function readView(page, databaseId, viewId) {
  return page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return bundle.views.find((view) => view.id === viewId);
  }, { databaseId, viewId });
}

async function pollView(page, databaseId, viewId, predicate, timeout = 8_000) {
  const startedAt = Date.now();
  let value;
  while (Date.now() - startedAt < timeout) {
    value = await readView(page, databaseId, viewId);
    if (value && predicate(value)) return value;
    await page.waitForTimeout(100);
  }
  throw new Error(`view persistence timed out: ${JSON.stringify(value)}`);
}
