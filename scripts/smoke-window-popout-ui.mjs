#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

await withLotionUIHarness("window-popout-ui", async ({ cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const context = page.context();
  const viewportResults = [];

  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createWindowPopoutFixture();
    registerTempWorkspace(fixture.root);
    let spawnedPage = null;
    const closeSpawnedPage = async () => {
      if (spawnedPage && !spawnedPage.isClosed()) {
        await spawnedPage.close().catch(() => undefined);
      }
      spawnedPage = null;
    };

    try {
      await openWorkspace(fixture.root);
      await openPage(page, fixture.pageId);
      await page.locator(".title-input").waitFor({ timeout: 8_000 });
      const activeTitle = await page.locator(".title-input").inputValue();
      if (activeTitle !== fixture.pageTitle) {
        throw new Error(`Expected active page ${fixture.pageTitle}, got ${activeTitle}`);
      }
      await assertNoDocumentHorizontalOverflow(page, `page loaded ${viewport.name}`);

      const popout = page.locator(".tab.active .tab-pop-out").first();
      await popout.waitFor({ timeout: 8_000 });
      await assertIntersectsViewport(page, popout, `tab pop-out button ${viewport.name}`, 4);
      const beforePages = rendererPages(context).length;
      const newPagePromise = context.waitForEvent("page", { timeout: 8_000 });
      await popout.click();
      spawnedPage = await newPagePromise;
      await waitForPageReady(spawnedPage);

      const spawnedTitle = await spawnedPage.locator(".title-input").inputValue();
      if (spawnedTitle !== fixture.pageTitle) {
        throw new Error(`Expected spawned window title ${fixture.pageTitle}, got ${spawnedTitle}`);
      }
      await page.waitForFunction(() => {
        const label = document.querySelector(".tab.active .tab-label")?.textContent?.trim() ?? "";
        return label === "新标签页";
      }, null, { timeout: 8_000 });
      const originalTabLabel = await page.locator(".tab.active .tab-label").textContent();
      const afterPages = rendererPages(context).length;
      if (afterPages < beforePages + 1) {
        throw new Error(`Expected one additional renderer page, saw before=${beforePages} after=${afterPages}`);
      }
      await closeSpawnedPage();

      await openWorkspace(fixture.root);
      await openPage(page, fixture.pageId);
      await page.locator(".title-input").waitFor({ timeout: 8_000 });
      const restoredTitle = await page.locator(".title-input").inputValue();
      if (restoredTitle !== fixture.pageTitle) {
        throw new Error(`Expected restored page ${fixture.pageTitle}, got ${restoredTitle}`);
      }
      await assertNoDocumentHorizontalOverflow(page, `page menu loaded ${viewport.name}`);
      const menuBeforePages = rendererPages(context).length;
      const pageMenuWindowPromise = context.waitForEvent("page", { timeout: 8_000 });
      await page.locator(".page-options-toggle").click();
      const openNewWindowItem = page.locator(".page-action-menu .page-menu-item")
        .filter({ hasText: /Open in new window|在新窗口打开/ })
        .first();
      await openNewWindowItem.waitFor({ timeout: 8_000 });
      await assertIntersectsViewport(page, openNewWindowItem, `page menu open-new-window item ${viewport.name}`, 4);
      await openNewWindowItem.click();
      spawnedPage = await pageMenuWindowPromise;
      await waitForPageReady(spawnedPage);
      const pageMenuSpawnedTitle = await spawnedPage.locator(".title-input").inputValue();
      const originalTitleAfterPageMenu = await page.locator(".title-input").inputValue();
      if (pageMenuSpawnedTitle !== fixture.pageTitle) {
        throw new Error(`Expected page-menu spawned title ${fixture.pageTitle}, got ${pageMenuSpawnedTitle}`);
      }
      if (originalTitleAfterPageMenu !== fixture.pageTitle) {
        throw new Error(`Page menu open-new-window should keep original page active, got ${originalTitleAfterPageMenu}`);
      }
      const menuAfterPages = rendererPages(context).length;
      if (menuAfterPages < menuBeforePages + 1) {
        throw new Error(`Expected page menu to open another renderer page, saw before=${menuBeforePages} after=${menuAfterPages}`);
      }
      await closeSpawnedPage();

      await openDatabase(page, fixture.databaseId);
      await page.locator(".database-title-wrap h1").waitFor({ timeout: 8_000 });
      const originalDatabaseTitle = await page.locator(".database-title-wrap h1").textContent();
      if (originalDatabaseTitle?.trim() !== fixture.databaseName) {
        throw new Error(`Expected original database ${fixture.databaseName}, got ${originalDatabaseTitle}`);
      }
      await assertNoDocumentHorizontalOverflow(page, `database loaded ${viewport.name}`);
      const databaseBeforePages = rendererPages(context).length;
      const databaseWindowPromise = context.waitForEvent("page", { timeout: 8_000 });
      const databaseOpenWindowButton = page.locator(".database-open-window").first();
      await assertIntersectsViewport(page, databaseOpenWindowButton, `database open-window button ${viewport.name}`, 4);
      await databaseOpenWindowButton.click();
      spawnedPage = await databaseWindowPromise;
      await waitForPageReady(spawnedPage);
      await spawnedPage.locator(".database-title-wrap h1").waitFor({ timeout: 8_000 });
      const databaseSpawnedTitle = await spawnedPage.locator(".database-title-wrap h1").textContent();
      const originalDatabaseTitleAfterOpen = await page.locator(".database-title-wrap h1").textContent();
      if (databaseSpawnedTitle?.trim() !== fixture.databaseName) {
        throw new Error(`Expected spawned database ${fixture.databaseName}, got ${databaseSpawnedTitle}`);
      }
      if (originalDatabaseTitleAfterOpen?.trim() !== fixture.databaseName) {
        throw new Error(`Database open-new-window should keep original database active, got ${originalDatabaseTitleAfterOpen}`);
      }
      const databaseAfterPages = rendererPages(context).length;
      if (databaseAfterPages < databaseBeforePages + 1) {
        throw new Error(`Expected database header to open another renderer page, saw before=${databaseBeforePages} after=${databaseAfterPages}`);
      }

      viewportResults.push({
        viewport: viewport.name,
        workspaceRoot: fixture.root,
        pageTitle: fixture.pageTitle,
        databaseName: fixture.databaseName,
        beforePages,
        afterPages,
        originalTabLabel: originalTabLabel?.trim(),
        spawnedTitle,
        pageMenuSpawnedTitle,
        originalTitleAfterPageMenu,
        menuBeforePages,
        menuAfterPages,
        databaseSpawnedTitle: databaseSpawnedTitle?.trim(),
        originalDatabaseTitleAfterOpen: originalDatabaseTitleAfterOpen?.trim(),
        databaseBeforePages,
        databaseAfterPages
      });
    } finally {
      await closeSpawnedPage();
      await page.evaluate(() => window.localStorage.removeItem("lotion.nextWindowInit")).catch(() => undefined);
    }
  });

  console.log(JSON.stringify({
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  }, null, 2));
});

function rendererPages(context) {
  return context.pages().filter((candidate) => candidate.url().includes("127.0.0.1:5173"));
}

async function waitForPageReady(targetPage) {
  await targetPage.waitForLoadState("domcontentloaded");
  await targetPage.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 8_000 });
}

async function openDatabase(page, databaseId) {
  await page.evaluate((targetDatabaseId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId: targetDatabaseId }
    }));
  }, databaseId);
}

async function createWindowPopoutFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-window-popout-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_window_popout";
  const pageTitle = "Window Popout Smoke Page";
  const databaseId = "db_window_popout";
  const databaseName = "Window Popout Smoke DB";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_window_popout",
    name: "Window Popout Smoke",
    pages: [pageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: pageId,
      title: pageTitle,
      now,
      icon: "emoji:🪟",
      path: ["Bench", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nSmoke workspace for tab pop-out tests.\n`, "utf8");
  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "created_time", "updated_time", "title"], [{
    id: "row_window_popout",
    created_time: now,
    updated_time: now,
    title: "Window Popout Row"
  }]);
  return { root, pageId, pageTitle, databaseId, databaseName };
}

function pagesFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
    "title",
    "kind",
    "body_path",
    "icon",
    "cover",
    "cover_offset",
    "path",
    "parent_id",
    "tags",
    "date",
    "url",
    "full_width",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function pageRecord({ id, title, now, icon, path, bodyPath }) {
  return {
    id,
    created_time: now,
    updated_time: now,
    title,
    kind: "page",
    body_path: bodyPath,
    icon,
    cover: "",
    cover_offset: "",
    path: serializePathValue(path),
    parent_id: "",
    tags: "",
    date: "",
    url: "",
    full_width: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
  };
}

function pagesSchema(now) {
  return {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "cover", name: "Cover", type: "text" },
      { id: "cover_offset", name: "Cover offset", type: "number" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "text" },
      { id: "url", name: "URL", type: "url" },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  };
}

function defaultView(databaseId, fields) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fields,
    fieldOrder: fields,
    wrapFieldIds: fields,
    sorts: [],
    filters: []
  };
}
