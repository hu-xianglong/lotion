#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

await withLotionUIHarness("page-path-slash-ui", async ({ cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const viewportResults = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createSlashTitleFixture();
    registerTempWorkspace(fixture.root);
    await openWorkspace(fixture.root);
    await waitForPageService(page, fixture.pageId);
    await openPage(page, fixture.pageId);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
    const pathLabel = page.locator(".page-path-label").first();
    await pathLabel.waitFor({ timeout: 8_000 });
    await assertWithinViewport(page, pathLabel, `page path label ${viewport.name}`, 4);
    await assertNoDocumentHorizontalOverflow(page, `page path slash initial ${viewport.name}`);

    const rendered = await page.evaluate(() => {
      const label = document.querySelector(".page-path-label");
      return {
        title: label?.getAttribute("title") ?? "",
        segments: Array.from(label?.querySelectorAll(".page-path-segment, .page-path-link") ?? [])
          .map((segment) => segment.textContent?.trim() ?? "")
          .filter(Boolean),
        separators: label?.querySelectorAll(".page-path-separator").length ?? 0,
        parentLinks: label?.querySelectorAll(".page-path-link").length ?? 0
      };
    });

    if (rendered.segments.length !== 2) {
      throw new Error(`Expected 2 path segments, saw ${rendered.segments.length}: ${JSON.stringify(rendered)}`);
    }
    if (rendered.segments[0] !== fixture.parentSegment || rendered.segments[1] !== fixture.pageTitle) {
      throw new Error(`Page path split title incorrectly: ${JSON.stringify(rendered)}`);
    }
    if (rendered.separators !== 1) {
      throw new Error(`Expected exactly 1 path separator, saw ${rendered.separators}: ${JSON.stringify(rendered)}`);
    }
    if (rendered.parentLinks !== 1) {
      throw new Error(`Expected exactly 1 clickable parent breadcrumb, saw ${rendered.parentLinks}: ${JSON.stringify(rendered)}`);
    }

    const parentOpened = await assertParentBreadcrumbOpensPage(page, fixture, viewport.name);
    await assertNoDocumentHorizontalOverflow(page, `page path slash parent ${viewport.name}`);
    const slashCreated = await assertSlashCreatesChildPage(page, fixture, viewport.name);

    viewportResults.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      pageId: fixture.pageId,
      pageTitle: fixture.pageTitle,
      rendered,
      parentOpened,
      slashCreated
    });
  });

  console.log(JSON.stringify({
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  }, null, 2));
});

async function waitForPageService(page, pageId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetPageId) => {
    const pages = await window.lotion.pages.list();
    return pages.some((candidate) => candidate.id === targetPageId);
  }, pageId, { timeout: 8_000 });
}

async function assertSlashCreatesChildPage(page, fixture, viewportName) {
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/page");

  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const command = menu.locator(".slash-menu-item").filter({ hasText: /Page|页面/ }).first();
  await command.waitFor({ timeout: 5_000 });
  await assertWithinViewport(page, command, `new page slash command ${viewportName}`, 4);
  await command.click();

  let created = null;
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline && !created) {
    created = await page.evaluate(async ({ parentId, existingChildId }) => {
      const pages = await window.lotion.pages.list();
      const child = pages.find((candidate) => (
        candidate.parentId === parentId && candidate.id !== parentId && candidate.id !== existingChildId
      ));
      if (!child) return null;
      const childDocument = await window.lotion.pages.get(child.id);
      if (childDocument.markdown !== "") return null;
      const parent = await window.lotion.pages.get(parentId);
      if (!parent.markdown.includes(child.id) || !parent.markdown.includes(`[${child.title}]`)) return null;
      const title = document.querySelector(".title-input")?.value ?? "";
      if (title !== child.title) return null;
      return {
        childId: child.id,
        childTitle: child.title,
        childPath: child.path ?? [],
        childParentId: child.parentId,
        childParentKind: child.parentKind,
        childMarkdown: childDocument.markdown,
        parentMarkdown: parent.markdown
      };
    }, { parentId: fixture.parentId, existingChildId: fixture.pageId });
    if (!created) await page.waitForTimeout(100);
  }
  if (!created) {
    const debug = await page.evaluate(async (parentId) => ({
      title: document.querySelector(".title-input")?.value ?? "",
      pages: await window.lotion.pages.list(),
      parent: await window.lotion.pages.get(parentId)
    }), fixture.parentId);
    throw new Error(`Slash-created page did not become durable: ${JSON.stringify(debug)}`);
  }
  if (created.childParentId !== fixture.parentId || created.childParentKind !== "page") {
    throw new Error(`Slash-created page has the wrong parent: ${JSON.stringify(created)}`);
  }
  const expectedPathPrefix = [fixture.parentSegment];
  if (
    created.childPath.length !== 2 ||
    created.childPath[0] !== expectedPathPrefix[0] ||
    created.childPath[1] !== created.childTitle
  ) {
    throw new Error(`Slash-created page has the wrong path: ${JSON.stringify(created)}`);
  }
  if (/\/page\s*$/m.test(created.parentMarkdown)) {
    throw new Error(`Slash source was not replaced in parent markdown: ${JSON.stringify(created.parentMarkdown)}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-created-child-${viewportName}`);
  return created;
}

async function assertParentBreadcrumbOpensPage(page, fixture, viewportName) {
  const parentBreadcrumb = page.locator(".page-path-link").filter({ hasText: fixture.parentSegment }).first();
  await assertWithinViewport(page, parentBreadcrumb, `parent breadcrumb ${viewportName}`, 4);
  await parentBreadcrumb.click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.parentSegment,
    { timeout: 8_000 }
  );
  const opened = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (opened.titleInput !== fixture.parentSegment) {
    throw new Error(`Parent breadcrumb did not open the parent page: ${JSON.stringify(opened)}`);
  }
  if (!opened.activeTabText.includes(fixture.parentSegment)) {
    throw new Error(`Active tab does not include parent title after breadcrumb click: ${JSON.stringify(opened)}`);
  }
  if (opened.activeTabText.includes(fixture.parentId)) {
    throw new Error(`Active tab leaked parent page id after breadcrumb click: ${JSON.stringify(opened)}`);
  }
  return opened;
}

async function createSlashTitleFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-path-slash-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_path_slash_title";
  const parentId = "pg_path_slash_parent";
  const pageTitle = "2024/04/24 尤宁城 给北";
  const parentSegment = "书写";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const parentPagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(parentId, parentSegment));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_page_path_slash",
    name: "Page Path Slash Smoke",
    pages: [parentId, pageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: parentId,
      title: parentSegment,
      now,
      icon: "emoji:📚",
      path: [parentSegment],
      bodyPath: parentPagePath
    }),
    pageRecord({
      id: pageId,
      title: pageTitle,
      now,
      icon: "emoji:📄",
      path: [parentSegment, pageTitle],
      bodyPath: pagePath,
      parentId
    })
  ]);
  await writeFile(join(root, parentPagePath), `# ${parentSegment}\n\nParent page for breadcrumb navigation smoke.\n`, "utf8");
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nTitle slash regression page.\n`, "utf8");
  return { root, pageId, parentId, pageTitle, parentSegment };
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

function pageRecord({ id, title, now, icon, path, bodyPath, parentId = "" }) {
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
    parent_id: parentId ? JSON.stringify([{ entityId: parentId, kind: "page" }]) : "",
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
