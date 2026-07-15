#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  forEachViewport,
  openPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const execFileAsync = promisify(execFile);

await withLotionUIHarness("github-backup-ui", async ({ page, openWorkspace }) => {
  const fixture = await createGitHubBackupFixture();
  await openWorkspace(fixture.root);
  await page.waitForFunction(async (databaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === databaseId);
  }, fixture.databaseId, { timeout: 8_000 });

  for (const viewport of selectedViewports()) {
    await forEachViewport(page, [viewport], async () => {
      await page.evaluate(({ pageId, markdown }) => window.lotion.pages.update(pageId, { markdown }), {
        pageId: fixture.pageId,
        markdown: fixture.changedMarkdown
      });
      await openPage(page, fixture.pageId);
      await assertLocalPageHistory(page, fixture, viewport.name);
      await resetGitHubBackup(page, fixture);
      await openPage(page, fixture.pageId);
      await page.waitForFunction(
        (title) => document.querySelector(".title-input")?.value === title,
        fixture.pageTitle,
        { timeout: 8_000 }
      );
      await openGitHubBackup(page);
      await assertInitialState(page, viewport.name);
      await runBackupAndAssert(page, "first", 1);

      await page.evaluate(({ pageId, markdown }) => window.lotion.pages.update(pageId, { markdown }), {
        pageId: fixture.pageId,
        markdown: fixture.changedMarkdown
      });
      await runBackupAndAssert(page, "second", 2);
      await assertPreviewAndRestore(page, fixture, viewport.name);
      await assertGitHubApiNotConfiguredState(page);
      await closeGitHubBackup(page);
    });
  }

  console.log(JSON.stringify({
    workspaceRoot: fixture.root,
    viewports: selectedViewports().map((viewport) => viewport.name),
    status: "passed"
  }, null, 2));
});

async function openGitHubBackup(page) {
  await closeGitHubBackup(page);
  const button = page.locator(".sidebar-footer-link").filter({ hasText: "GitHub Backup" }).first();
  await button.waitFor({ timeout: 8_000 });
  await button.click();
  const modal = githubBackupModal(page);
  await modal.waitFor({ timeout: 8_000 });
  await modal.locator(".github-backup-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, "github backup modal", 4);
  await assertNoDocumentHorizontalOverflow(page, "github backup open");
  return modal;
}

async function closeGitHubBackup(page) {
  const modal = githubBackupModal(page);
  if (await modal.count()) {
    await modal.getByRole("button", { name: "Close" }).click().catch(() => undefined);
    await modal.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  }
}

function githubBackupModal(page) {
  return page.locator(".plugin-modal").filter({ hasText: "GitHub Backup" }).first();
}

async function resetGitHubBackup(page, fixture) {
  await closeGitHubBackup(page);
  await page.evaluate(async ({ pageId, markdown }) => {
    window.localStorage.removeItem("lotion.plugin.github-backup.settings");
    await window.lotion.plugins.deleteFile("github-backup", "github-backup-local-remote.json");
    await window.lotion.plugins.deleteFile("github-backup", "github-backup-status.json");
    await window.lotion.pages.update(pageId, { markdown });
  }, { pageId: fixture.pageId, markdown: fixture.originalMarkdown });
}

async function assertInitialState(page, viewportName) {
  const modal = githubBackupModal(page);
  await modal.getByText("GitHub-backed page history").waitFor({ timeout: 8_000 });
  await modal.getByLabel("GitHub backup adapter").waitFor({ timeout: 8_000 });
  await modal.getByLabel("GitHub backup adapter").selectOption("local_mock");
  await modal.getByLabel("GitHub repository").fill("");
  await modal.getByLabel("GitHub token").fill("");
  await modal.getByRole("button", { name: "Save settings" }).click();
  await modal.getByRole("button", { name: "Save settings" }).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Run backup" }).waitFor({ timeout: 8_000 });
  await modal.getByText("Settings saved.").waitFor({ timeout: 8_000 });
  await modal.getByText("History empty for the current page.").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal.locator(".github-backup-form").first(), `github backup form ${viewportName}`, 4);
  await assertWithinViewport(page, modal.locator(".github-backup-history").first(), `github backup history ${viewportName}`, 4);
}

async function runBackupAndAssert(page, label, expectedHistoryCount) {
  const modal = githubBackupModal(page);
  await modal.getByRole("button", { name: "Run backup" }).click();
  await modal.locator(".github-backup-status").filter({ hasText: "Backed up" }).waitFor({ timeout: 10_000 });
  await modal.locator(".github-backup-message").filter({ hasText: /Backed up \d+ changed files\.|No changes to backup\./ }).first().waitFor({ timeout: 10_000 });
  await page.waitForFunction((count) => document.querySelectorAll(".github-backup-version").length >= count, expectedHistoryCount, { timeout: 10_000 });
  const storage = await page.evaluate(() => window.lotion.plugins.readJson("github-backup", "github-backup-local-remote.json"));
  if (!storage?.commits?.length || !storage?.head) {
    throw new Error(`GitHub backup ${label} did not persist local mock remote: ${JSON.stringify(storage)}`);
  }
}

async function assertPreviewAndRestore(page, fixture, viewportName) {
  const modal = githubBackupModal(page);
  const versions = modal.locator(".github-backup-version");
  await versions.nth(1).click();
  await modal.locator(".github-backup-preview").waitFor({ timeout: 8_000 });
  await modal.locator(".github-backup-diff-line.removed").filter({ hasText: "Changed backup body" }).waitFor({ timeout: 8_000 });
  await modal.locator(".github-backup-diff-line.added").filter({ hasText: "Original backup body" }).waitFor({ timeout: 8_000 });
  await waitForPreviewInViewport(page);
  await assertPreviewLayout(page, viewportName);
  page.once("dialog", (dialog) => dialog.accept());
  await modal.getByRole("button", { name: "Restore this version" }).click();
  await waitForPageMarkdown(page, fixture.pageId, "Original backup body", "restored GitHub backup page");
  await modal.getByText("Page restored from selected version.").waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `github backup restored preview ${viewportName}`);
}

async function waitForPreviewInViewport(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector(".github-backup-preview");
    if (!node) return false;
    const rect = node.getBoundingClientRect();
    return rect.top >= 4 && rect.bottom <= window.innerHeight - 4;
  }, null, { timeout: 8_000 });
}

async function assertPreviewLayout(page, viewportName) {
  const modal = githubBackupModal(page);
  const selectedVersion = modal.locator(".github-backup-version.selected").first();
  const preview = modal.locator(".github-backup-preview").first();
  const diffBody = preview.locator("pre").first();
  const restoreButton = preview.getByRole("button", { name: "Restore this version" });

  await assertWithinViewport(page, selectedVersion, `github backup selected version ${viewportName}`, 4);
  await assertWithinViewport(page, preview, `github backup restore preview ${viewportName}`, 4);
  await assertWithinViewport(page, diffBody, `github backup restore diff ${viewportName}`, 4);
  await assertWithinViewport(page, restoreButton, `github backup restore action ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `github backup restore preview ${viewportName}`);

  const metrics = await preview.evaluate((node) => {
    const previewRect = node.getBoundingClientRect();
    const pre = node.querySelector("pre");
    const preRect = pre?.getBoundingClientRect();
    const button = Array.from(node.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Restore this version"));
    const buttonRect = button?.getBoundingClientRect();
    return {
      previewHeight: previewRect.height,
      previewWidth: previewRect.width,
      preHeight: preRect?.height ?? 0,
      preWidth: preRect?.width ?? 0,
      buttonWidth: buttonRect?.width ?? 0,
      buttonTop: buttonRect?.top ?? 0,
      buttonBottom: buttonRect?.bottom ?? 0,
      preTop: preRect?.top ?? 0,
      preBottom: preRect?.bottom ?? 0,
      buttonOverlapsPre: !!preRect && !!buttonRect &&
        buttonRect.left < preRect.right - 2 &&
        buttonRect.right > preRect.left + 2 &&
        buttonRect.top < preRect.bottom - 2 &&
        buttonRect.bottom > preRect.top + 2,
      preOverflowsPreviewX: !!preRect && preRect.right > previewRect.right + 2,
      buttonOverflowsPreviewX: !!buttonRect && buttonRect.right > previewRect.right + 2
    };
  });
  if (metrics.buttonOverlapsPre || metrics.preOverflowsPreviewX || metrics.buttonOverflowsPreviewX) {
    throw new Error(`GitHub backup preview layout is unstable at ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function assertGitHubApiNotConfiguredState(page) {
  const modal = githubBackupModal(page);
  await modal.getByLabel("GitHub backup adapter").selectOption("github_api");
  await modal.getByLabel("GitHub repository").fill("lotion/test-repo");
  await modal.getByLabel("GitHub token").fill("");
  await modal.getByRole("button", { name: "Save settings" }).click();
  await modal.getByRole("button", { name: "Run backup" }).click();
  await modal.locator(".github-backup-status").filter({ hasText: "Not configured" }).waitFor({ timeout: 8_000 });
}

async function assertLocalPageHistory(page, fixture, viewportName) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.waitFor({ timeout: 8_000 });
  const expanded = await panel.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await page.locator(".page-secondary-toggle").first().click();
  }
  await page.waitForFunction(() => document.querySelector("[data-testid='page-secondary-panel']")?.getAttribute("aria-expanded") === "true", null, { timeout: 5_000 });
  const history = page.locator(".page-history-panel").first();
  await history.locator(".page-history-status.ready").waitFor({ timeout: 8_000 });
  await history.locator(".page-history-version").filter({ hasText: "Initial local page history" }).first().click();
  await history.locator(".page-history-preview").waitFor({ timeout: 8_000 });
  await history.locator(".page-history-diff-line.removed").filter({ hasText: "Changed backup body" }).waitFor({ timeout: 8_000 });
  await history.locator(".page-history-diff-line.added").filter({ hasText: "Original backup body" }).waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, history, `local page history panel ${viewportName}`, 4);
  await assertWithinViewport(page, history.locator(".page-history-preview").first(), `local page history preview ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `local page history ${viewportName}`);
  const activeBeforeFocus = await page.evaluate(() => document.activeElement?.className || "");
  await history.getByRole("button", { name: "Restore" }).focus();
  const restoreFocused = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Restore");
  if (!restoreFocused) {
    throw new Error(`Local page history restore action did not receive focus at ${viewportName}; active before: ${activeBeforeFocus}`);
  }
  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "Restore" }).click();
  await waitForPageMarkdown(page, fixture.pageId, "Original backup body", `local page history restored ${viewportName}`);
  await history.getByText("Page restored from local Git history.").waitFor({ timeout: 8_000 });
}

async function createGitHubBackupFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-github-backup-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_backup_history";
  const pageTitle = "Backup History Page";
  const originalMarkdown = `# ${pageTitle}\n\nOriginal backup body for restore.\n`;
  const changedMarkdown = `# ${pageTitle}\n\nChanged backup body before restore.\n`;
  const databaseId = "db_backup_plan";
  const databaseName = "Backup Plan";
  const rowId = "row_backup_task";
  const rowTitle = "Backup Task";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_github_backup",
    name: "GitHub Backup Smoke",
    pages: [pageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Title", type: "title" },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "path", name: "Path", type: "text" },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true }
    ]
  });
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), ["id", "title", "body_path", "icon", "path", "created_time", "updated_time"], [
    {
      id: pageId,
      title: pageTitle,
      body_path: pagePath,
      icon: "emoji:🧾",
      path: serializePathValue(["Lab", pageTitle]),
      created_time: now,
      updated_time: now
    }
  ]);
  await writeFile(join(root, pagePath), originalMarkdown, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    icon: "emoji:🧪",
    path: ["Lab", databaseName],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "title", "page_file", "notes"], [
    {
      id: rowId,
      title: rowTitle,
      page_file: rowPageFile,
      notes: "row page backup smoke"
    }
  ]);
  await writeFile(join(databaseDir, "pages", rowPageFile), `# ${rowTitle}\n\nRow page backup body.\n`, "utf8");
  await execFileAsync("git", ["init"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "ui-smoke@example.com"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Lotion UI Smoke"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-m", "Initial local page history"], { cwd: root });

  return { root, pageId, pageTitle, originalMarkdown, changedMarkdown, databaseId };
}

function defaultView(databaseId, fieldOrder) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fieldOrder,
    fieldOrder,
    sorts: [],
    filters: []
  };
}
