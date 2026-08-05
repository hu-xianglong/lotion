#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { captureElementSnapshot, withLotionUIHarness, workspacePath, writeCsv, writeJson } from "./ui-harness.mjs";

const result = await withLotionUIHarness("database-breadcrumb-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const fixture = await createFixture();
  await openWorkspace(fixture.root);
  await page.waitForFunction(async (databaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === databaseId);
  }, fixture.databaseId, { timeout: 8_000 });
  await page.evaluate((databaseId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId: databaseId }
    }));
  }, fixture.databaseId);

  const breadcrumb = page.locator(".entity-breadcrumb-link").filter({ hasText: fixture.parentTitle }).first();
  await breadcrumb.waitFor({ timeout: 8_000 });
  const rendered = await page.locator(".entity-breadcrumbs").evaluate((breadcrumbs) => ({
    current: breadcrumbs.querySelector(".entity-breadcrumb-current")?.textContent?.trim() ?? "",
    links: Array.from(breadcrumbs.querySelectorAll(".entity-breadcrumb-link")).map((link) => link.textContent?.trim() ?? ""),
    text: breadcrumbs.textContent?.replace(/\s+/g, " ").trim() ?? ""
  }));
  if (rendered.links.length !== 1 || rendered.links[0] !== fixture.parentTitle) {
    throw new Error(`Expected one resolved database parent breadcrumb: ${JSON.stringify(rendered)}`);
  }
  if (rendered.current !== fixture.databaseName) {
    throw new Error(`Expected current database to remain non-interactive: ${JSON.stringify(rendered)}`);
  }
  const databaseSnapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator(".database-table:not(.embedded-table) > .page-header").first(),
    metadata: { entityKind: "database", path: rendered.text },
    name: "unified-breadcrumb-database-header",
    page,
    viewport: { name: "desktop", width: 1280, height: 800 }
  });

  await breadcrumb.click();
  await page.waitForFunction(
    (parentTitle) => document.querySelector(".title-input")?.value === parentTitle,
    fixture.parentTitle,
    { timeout: 8_000 }
  );
  const opened = await page.evaluate(() => ({
    activeTab: document.querySelector(".tab.active")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
    title: document.querySelector(".title-input")?.value ?? ""
  }));
  if (opened.title !== fixture.parentTitle || !opened.activeTab.includes(fixture.parentTitle)) {
    throw new Error(`Database parent breadcrumb did not open its page: ${JSON.stringify(opened)}`);
  }

  await page.evaluate(({ databaseId, rowId }) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "row", entityId: rowId, databaseId, rowId }
    }));
  }, { databaseId: fixture.databaseId, rowId: fixture.rowId });
  const rowBreadcrumbs = page.locator(".row-page-surface .entity-breadcrumbs").first();
  await rowBreadcrumbs.waitFor({ timeout: 8_000 });
  const rowRendered = await rowBreadcrumbs.evaluate((breadcrumbs) => ({
    current: breadcrumbs.querySelector(".entity-breadcrumb-current")?.textContent?.trim() ?? "",
    links: Array.from(breadcrumbs.querySelectorAll(".entity-breadcrumb-link")).map((link) => link.textContent?.trim() ?? ""),
    text: breadcrumbs.textContent?.replace(/\s+/g, " ").trim() ?? ""
  }));
  if (rowRendered.current !== fixture.rowTitle || !rowRendered.links.includes(fixture.databaseName)) {
    throw new Error(`Row page did not use the shared database breadcrumb: ${JSON.stringify(rowRendered)}`);
  }
  const rowSnapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator(".row-page-surface .page-header").first(),
    metadata: { entityKind: "row", path: rowRendered.text },
    name: "unified-breadcrumb-row-header",
    page,
    viewport: { name: "desktop", width: 1280, height: 800 }
  });

  await rowBreadcrumbs.locator(".entity-breadcrumb-link").filter({ hasText: fixture.databaseName }).click();
  await page.locator(".database-table:not(.embedded-table)").waitFor({ timeout: 8_000 });
  return {
    cdpUrl,
    databaseSnapshot: databaseSnapshot.imagePath,
    opened,
    rendered,
    rowRendered,
    rowSnapshot: rowSnapshot.imagePath,
    status: "passed"
  };
});

console.log(JSON.stringify(result, null, 2));

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-breadcrumb-"));
  const now = "2026-08-05T00:00:00.000Z";
  const parentId = "pg_database_parent";
  const parentTitle = "数据库";
  const databaseId = "db_database_summary";
  const databaseName = "数据库汇总";
  const rowId = "row_database_summary";
  const rowTitle = "Import inventory";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const bodyPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(parentId, parentTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_database_breadcrumb",
    name: "Database Breadcrumb Smoke",
    pages: [parentId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path"]));
  await writeCsv(join(pagesDir, "data.csv"), pageFieldIds(), [{
    id: parentId,
    created_time: now,
    updated_time: now,
    title: parentTitle,
    kind: "page",
    body_path: bodyPath,
    icon: "emoji:📚",
    path: serializePathValue([parentTitle]),
    parent_id: "",
    database_id: PAGES_DATABASE_ID,
    row_id: parentId
  }]);
  await writeFile(join(root, bodyPath), `# ${parentTitle}\n\nParent page for database breadcrumb navigation.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    path: [parentTitle, databaseName],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "created_time", "updated_time", "title", "page_file"], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    page_file: rowPageFile
  }]);
  await writeFile(join(root, rowPagePath), `# ${rowTitle}\n\nRow page for unified breadcrumb navigation.\n`, "utf8");

  return { root, parentTitle, databaseId, databaseName, rowId, rowTitle };
}

function pageFieldIds() {
  return ["id", "created_time", "updated_time", "title", "kind", "body_path", "icon", "path", "parent_id", "database_id", "row_id"];
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
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true }
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
