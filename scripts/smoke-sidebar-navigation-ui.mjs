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
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { assertTagPagesArtifactContract } from "./lib/tag-pages-artifacts.mjs";

const result = await withLotionUIHarness("sidebar-navigation", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createSidebarFixture(viewport.name);

    await openWorkspace(fixture.root);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
    await assertSidebarLayout(page, `initial ${viewport.name}`);
    const pageHierarchy = await assertPagesSectionHierarchy(page, fixture, viewport);
    const tagPage = await assertTagPageNavigation(page, fixture, viewport, artifactRoot);
    const sidebarIcons = {
      page: await assertSidebarIcon(page, fixture.pageTitle, fixture.pageIcon),
      database: "",
      rowPage: ""
    };
    const pageContextMenu = await assertSidebarPageContextMenu(page, fixture);
    await ensureFileTreeRootOpen(page);
    await expandFileTreeFolders(page, [
      /^databases\/$/,
      /^user\/$/,
      new RegExp(`^${escapeRegExp(fixture.databaseFolder)}\\/$`)
    ]);
    await clickFileTreeFile(page, /^data\.csv$/);
    await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
    await page.waitForSelector(".database-table", { timeout: 8_000 });
    await assertSidebarLayout(page, `database ${viewport.name}`);
    sidebarIcons.database = await assertSidebarIcon(page, fixture.databaseName, fixture.databaseIcon);

    await ensureFileTreeRootOpen(page);
    await expandFileTreeFolders(page, [
      /^databases\/$/,
      /^user\/$/,
      new RegExp(`^${escapeRegExp(fixture.databaseFolder)}\\/$`),
      /^pages\/$/
    ]);
    await clickFileTreeFile(page, new RegExp(`^${escapeRegExp(fixture.rowPageFile)}$`));
    await page.getByText(fixture.rowTitle).first().waitFor({ timeout: 8_000 });
    await page.getByText("Row page opened through the sidebar file tree.").first().waitFor({ timeout: 8_000 });
    await assertSidebarLayout(page, `row page ${viewport.name}`);
    sidebarIcons.rowPage = await assertSidebarIcon(page, fixture.rowTitle, fixture.rowIcon);
    const historyTooltips = await assertHistoryTooltips(page, fixture);
    const quickCreate = await assertQuickCreateActions(page, viewport);

    viewports.push({
      viewport: viewport.name,
      databaseFolder: fixture.databaseFolder,
      rowPageFile: fixture.rowPageFile,
      sidebarIcons,
      pageContextMenu,
      pageHierarchy,
      historyTooltips,
      quickCreate,
      tagPage
    });
  });

  return {
    cdpUrl,
    viewports,
    artifactContract: await assertTagPagesArtifactContract({ status: "passed", viewports }),
    status: "passed"
  };
});

console.log(JSON.stringify(result, null, 2));

async function assertSidebarLayout(page, label) {
  await assertWithinViewport(page, page.locator(".sidebar").first(), `${label} sidebar`, 4);
  await assertWithinViewport(page, page.getByRole("button", { name: /Quick create|快速新建/i }), `${label} quick-create`, 8);
  await assertNoDocumentHorizontalOverflow(page, `sidebar navigation ${label}`, 8);
}

async function assertPagesSectionHierarchy(page, fixture, viewport) {
  const pagesSection = await ensureSidebarSectionOpen(page, /Pages|页面/);
  const parentRow = pagesSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeParentTitle }).first();
  await parentRow.waitFor({ timeout: 8_000 });
  const parentToggle = parentRow.locator(".nav-page-tree-toggle").first();
  await parentToggle.waitFor({ timeout: 8_000 });
  await parentToggle.focus();
  const focused = await page.evaluate((title) => {
    const active = document.activeElement;
    return {
      label: active?.getAttribute("aria-label") ?? "",
      expanded: active?.getAttribute("aria-expanded") ?? "",
      text: active?.textContent?.trim() ?? "",
      includesTitle: (active?.getAttribute("aria-label") ?? "").includes(title)
    };
  }, fixture.treeParentTitle);
  if (!focused.includesTitle) {
    throw new Error(`Page tree toggle should be keyboard focusable and name the parent page: ${JSON.stringify(focused)}`);
  }
  if (focused.expanded === "false") {
    await page.keyboard.press("Enter");
  }

  const childRow = pagesSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeChildTitle }).first();
  await childRow.waitFor({ timeout: 8_000 });
  const childMetrics = await page.evaluate(({ parentTitle, childTitle }) => {
    function rowFor(title) {
      return Array.from(document.querySelectorAll(".nav-page-tree-row"))
        .find((row) => (row.textContent ?? "").includes(title));
    }
    const parentRow = rowFor(parentTitle);
    const childRow = rowFor(childTitle);
    const parent = parentRow?.querySelector(".nav-page-tree-main")?.getBoundingClientRect();
    const child = childRow?.querySelector(".nav-page-tree-main")?.getBoundingClientRect();
    return parent && child
      ? {
          parentLeft: parent.left,
          childLeft: child.left,
          parentWidth: parent.width,
          childWidth: child.width
        }
      : null;
  }, { parentTitle: fixture.treeParentTitle, childTitle: fixture.treeChildTitle });
  if (!childMetrics || childMetrics.childLeft <= childMetrics.parentLeft + 8) {
    throw new Error(`Child page should be visibly indented below parent: ${JSON.stringify(childMetrics)}`);
  }

  await childRow.locator(".nav-page-tree-main").first().click();
  await page.getByText("Child page opened through the nested sidebar tree.").first().waitFor({ timeout: 8_000 });
  await assertSidebarLayout(page, `nested child opened ${viewport.name}`);

  const createdChild = await assertCreateChildPageFromTree(page, fixture, viewport);

  await parentToggle.click();
  await page.waitForFunction(
    (title) => !Array.from(document.querySelectorAll(".nav-page-tree-row")).some((row) => (row.textContent ?? "").includes(title)),
    fixture.treeChildTitle,
    { timeout: 5_000 }
  );
  await assertNoDocumentHorizontalOverflow(page, `nested pages collapsed ${viewport.name}`, 8);

  const persistence = await assertPageTreeCollapsePersistence(page, fixture, viewport);
  return { childMetrics, createdChild, persistence };
}

async function assertPageTreeCollapsePersistence(page, fixture, viewport) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 15_000 });
  const pagesSection = await ensureSidebarSectionOpen(page, /Pages|页面/);
  const parentRow = pagesSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeParentTitle }).first();
  await parentRow.waitFor({ timeout: 8_000 });
  const parentToggle = parentRow.locator(".nav-page-tree-toggle").first();
  await parentToggle.waitFor({ timeout: 8_000 });
  const collapsedState = await parentToggle.getAttribute("aria-expanded");
  if (collapsedState !== "false") {
    throw new Error(`Collapsed page tree state should survive reload, saw aria-expanded=${collapsedState}`);
  }
  const childCountWhenCollapsed = await pagesSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeChildTitle }).count();
  if (childCountWhenCollapsed !== 0) {
    throw new Error(`Collapsed page tree should hide child rows after reload, saw ${childCountWhenCollapsed}`);
  }
  await assertSidebarLayout(page, `persisted collapsed tree ${viewport.name}`);

  await parentToggle.focus();
  await page.keyboard.press("Enter");
  const childRow = pagesSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeChildTitle }).first();
  await childRow.waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `persisted tree expanded ${viewport.name}`, 8);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 15_000 });
  const restoredSection = await ensureSidebarSectionOpen(page, /Pages|页面/);
  const restoredToggle = restoredSection
    .locator(".nav-page-tree-row")
    .filter({ hasText: fixture.treeParentTitle })
    .first()
    .locator(".nav-page-tree-toggle")
    .first();
  await restoredToggle.waitFor({ timeout: 8_000 });
  const expandedState = await restoredToggle.getAttribute("aria-expanded");
  if (expandedState !== "true") {
    throw new Error(`Expanded page tree state should clear persisted collapse, saw aria-expanded=${expandedState}`);
  }
  await restoredSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeChildTitle }).first().waitFor({ timeout: 8_000 });
  await assertSidebarLayout(page, `persisted expanded tree ${viewport.name}`);
  return {
    collapsedState,
    childCountWhenCollapsed,
    expandedState
  };
}

async function assertCreateChildPageFromTree(page, fixture, viewport) {
  const pagesSection = await ensureSidebarSectionOpen(page, /Pages|页面/);
  const parentRow = pagesSection.locator(".nav-page-tree-row").filter({ hasText: fixture.treeParentTitle }).first();
  await parentRow.waitFor({ timeout: 8_000 });
  const pageIdsBeforeCreate = await page.evaluate(async () => (await window.lotion.pages.list()).map((item) => item.id));
  await parentRow.locator(".nav-page-tree-main").first().click({ button: "right" });
  const menu = page.locator(".sidebar-context-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const childAction = page.getByRole("menuitem", { name: /New child page|新建子页面/i });
  await childAction.waitFor({ timeout: 5_000 });
  await childAction.focus();
  const focused = await page.evaluate(() => ({
    role: document.activeElement?.getAttribute("role") ?? "",
    text: document.activeElement?.textContent?.trim() ?? ""
  }));
  if (focused.role !== "menuitem" || !/New child page|新建子页面/.test(focused.text)) {
    throw new Error(`New child page menu item should be keyboard focusable: ${JSON.stringify(focused)}`);
  }
  await page.keyboard.press("Enter");
  const childPageId = await waitForNewPageId(page, pageIdsBeforeCreate);
  await page.locator(".title-input").first().waitFor({ timeout: 8_000 });
  const childTitle = await page.locator(".title-input").first().inputValue();
  if (!/^(Untitled|未命名)$/.test(childTitle)) {
    throw new Error(`Created child page should open as Untitled, saw ${JSON.stringify(childTitle)}`);
  }
  const meta = await page.evaluate(async ({ id, parentTitle }) => {
    const doc = await window.lotion.pages.get(id);
    return {
      id: doc.meta.id,
      title: doc.meta.title,
      parentId: doc.meta.parentId ?? "",
      parentKind: doc.meta.parentKind ?? "",
      path: doc.meta.path ?? [],
      parentPathIncluded: (doc.meta.path ?? []).includes(parentTitle)
    };
  }, { id: childPageId, parentTitle: fixture.treeParentTitle });
  if (meta.parentId !== fixture.treeParentId || meta.parentKind !== "page" || !meta.parentPathIncluded) {
    throw new Error(`Created child page should persist parent metadata and path: ${JSON.stringify(meta)}`);
  }
  const recentText = await assertFirstRecentIncludes(page, childTitle);
  const createdChildRow = pagesSection.locator(".nav-page-tree-row").filter({ hasText: childTitle }).first();
  await createdChildRow.waitFor({ timeout: 8_000 });
  const metrics = await page.evaluate(({ parentTitle, childTitle }) => {
    function rowFor(title) {
      return Array.from(document.querySelectorAll(".nav-page-tree-row"))
        .find((row) => (row.textContent ?? "").includes(title));
    }
    const parent = rowFor(parentTitle)?.querySelector(".nav-page-tree-main")?.getBoundingClientRect();
    const child = rowFor(childTitle)?.querySelector(".nav-page-tree-main")?.getBoundingClientRect();
    return parent && child ? { parentLeft: parent.left, childLeft: child.left, childWidth: child.width } : null;
  }, { parentTitle: fixture.treeParentTitle, childTitle });
  if (!metrics || metrics.childLeft <= metrics.parentLeft + 8) {
    throw new Error(`Created child page should appear nested below parent: ${JSON.stringify(metrics)}`);
  }
  await assertSidebarLayout(page, `created child page ${viewport.name}`);
  return { childPageId, childTitle, meta, metrics, recentText };
}

async function assertSidebarPageContextMenu(page, fixture) {
  const pagesSection = await ensureSidebarSectionOpen(page, /Pages|页面/);
  const pageItem = pagesSection.locator(".nav-item").filter({ hasText: fixture.pageTitle }).first();
  await pageItem.waitFor({ timeout: 8_000 });
  await pageItem.click({ button: "right" });
  const menu = page.locator(".sidebar-context-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const openItem = page.getByRole("menuitem", { name: /Open|打开/i });
  const deleteItem = page.getByRole("menuitem", { name: /Delete|删除/i });
  await openItem.waitFor({ timeout: 5_000 });
  await deleteItem.waitFor({ timeout: 5_000 });
  const openLabel = (await openItem.textContent())?.trim() ?? "";
  const deleteLabel = (await deleteItem.textContent())?.trim() ?? "";
  await openItem.click();
  await page.getByText("Initial page for sidebar navigation smoke.").first().waitFor({ timeout: 8_000 });

  await pageItem.click({ button: "right" });
  await deleteItem.waitFor({ timeout: 5_000 });
  await page.evaluate(() => {
    window.__lotionSidebarSmokeConfirmMessages = [];
    window.confirm = (message) => {
      window.__lotionSidebarSmokeConfirmMessages.push(String(message));
      return true;
    };
  });
  await deleteItem.click();
  await page.waitForFunction(
    (title) => !Array.from(document.querySelectorAll(".nav-section .nav-item"))
      .some((item) => (item.textContent ?? "").includes(title)),
    fixture.pageTitle,
    { timeout: 8_000 }
  );
  const confirmMessages = await page.evaluate(() => window.__lotionSidebarSmokeConfirmMessages ?? []);
  if (confirmMessages.length !== 1) {
    throw new Error(`Deleting a sidebar page should confirm exactly once: ${JSON.stringify(confirmMessages)}`);
  }
  return {
    openLabel,
    deleteLabel,
    confirmMessages
  };
}

async function assertTagPageNavigation(page, fixture, viewport, artifactRoot) {
  const settings = page.locator(".sidebar-settings-summary").first();
  await settings.click();
  const tagOption = page.locator(".sidebar-tag-option").filter({ hasText: fixture.tagName }).first();
  await tagOption.waitFor({ timeout: 5_000 });
  const tagOptionText = (await tagOption.textContent())?.trim() ?? "";
  if (!tagOptionText.includes("2")) {
    throw new Error(`Expected tag option to show two matching items: ${tagOptionText}`);
  }
  if (await tagOption.getAttribute("aria-pressed") !== "true") {
    await tagOption.click();
  }
  await page.waitForFunction(
    (tag) => Array.from(document.querySelectorAll(".sidebar-tag-option"))
      .some((option) => (option.textContent ?? "").includes(tag) && option.getAttribute("aria-pressed") === "true"),
    fixture.tagName,
    { timeout: 5_000 }
  );
  await assertSidebarLayout(page, `tag option selected ${viewport.name}`);
  await settings.click();

  const tagSection = await ensureSidebarSectionOpen(page, new RegExp(fixture.tagName));
  const tagOpenButton = tagSection.getByRole("button", { name: new RegExp(`Open tag page|打开标签页`, "i") }).first();
  await tagOpenButton.waitFor({ timeout: 5_000 });
  await tagOpenButton.focus();
  const focusedOpen = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      text: active?.textContent?.trim() ?? "",
      label: active?.getAttribute("aria-label") ?? ""
    };
  });
  if (!focusedOpen.label.includes(fixture.tagName)) {
    throw new Error(`Tag open affordance should be keyboard focusable and name the tag: ${JSON.stringify(focusedOpen)}`);
  }
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: new RegExp(fixture.tagName) }).waitFor({ timeout: 8_000 });
  await page.getByTestId("tag-management-view").waitFor({ timeout: 8_000 });
  await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `tag page ${viewport.name}`, 8);

  const tagPageRows = await page.evaluate(({ pageTitle, databaseName }) => {
    const rows = Array.from(document.querySelectorAll(".tag-manage-table tbody tr"));
    return {
      count: rows.length,
      pageVisible: rows.some((row) => (row.textContent ?? "").includes(pageTitle)),
      databaseVisible: rows.some((row) => (row.textContent ?? "").includes(databaseName)),
      rowWidths: rows.map((row) => {
        const rect = row.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      })
    };
  }, { pageTitle: fixture.pageTitle, databaseName: fixture.databaseName });
  if (!tagPageRows.pageVisible || !tagPageRows.databaseVisible || tagPageRows.count < 2) {
    throw new Error(`Tag page should list matching page and database: ${JSON.stringify(tagPageRows)}`);
  }
  const snapshotState = await page.evaluate(({ tagName, pageTitle, databaseName }) => {
    const summaryNumbers = Array.from(document.querySelectorAll(".tag-management-summary .management-summary-number"))
      .map((node) => node.textContent?.trim() ?? "");
    const rows = Array.from(document.querySelectorAll(".tag-manage-table tbody tr"))
      .map((row) => row.textContent?.replace(/\s+/g, " ").trim() ?? "");
    return {
      databaseCount: Number(summaryNumbers[1] || 0),
      databaseName,
      heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
      pageCount: Number(summaryNumbers[0] || 0),
      pageTitle,
      rows,
      tagName,
      token: document.querySelector(".tag-management-token .management-summary-number")?.textContent?.trim() ?? "",
      totalCount: Number(summaryNumbers[2] || rows.length)
    };
  }, { tagName: fixture.tagName, pageTitle: fixture.pageTitle, databaseName: fixture.databaseName });
  const captured = await captureElementSnapshot({
    artifactRoot,
    locator: page.getByTestId("tag-management-view"),
    metadata: {
      phase: "tag-management",
      ...snapshotState
    },
    name: `tag-management-${viewport.name}`,
    page,
    viewport
  });
  const snapshot = {
    imagePath: captured.imagePath,
    metadataPath: captured.metadataPath,
    height: Number(captured.rect.height.toFixed(1)),
    width: Number(captured.rect.width.toFixed(1))
  };

  const pageRow = page.locator(".tag-manage-table tbody tr").filter({ hasText: fixture.pageTitle }).first();
  await pageRow.focus();
  await page.keyboard.press("Enter");
  await page.getByText("Initial page for sidebar navigation smoke.").first().waitFor({ timeout: 8_000 });
  await assertSidebarLayout(page, `tag page opened page ${viewport.name}`);
  const openedPage = await page.evaluate((pageTitle) => ({
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? "",
    bodyVisible: Boolean(Array.from(document.querySelectorAll("body *")).some((node) => (node.textContent ?? "").includes("Initial page for sidebar navigation smoke."))),
    titleInput: document.querySelector(".title-input")?.value ?? "",
    pageTitle
  }), fixture.pageTitle);

  await tagOpenButton.click();
  await page.getByRole("heading", { name: new RegExp(fixture.tagName) }).waitFor({ timeout: 8_000 });
  const databaseRow = page.locator(".tag-manage-table tbody tr").filter({ hasText: fixture.databaseName }).first();
  await databaseRow.focus();
  await page.keyboard.press(" ");
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertSidebarLayout(page, `tag page opened database ${viewport.name}`);
  const openedDatabase = await page.evaluate((databaseName) => ({
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? "",
    databaseTitle: document.querySelector(".database-title-wrap h1")?.textContent?.trim() ?? "",
    tableVisible: Boolean(document.querySelector(".database-table")),
    databaseName
  }), fixture.databaseName);

  return {
    databaseName: fixture.databaseName,
    focusedOpen,
    openedDatabase,
    openedPage,
    pageTitle: fixture.pageTitle,
    rows: tagPageRows,
    snapshot,
    tagName: fixture.tagName
  };
}

async function ensureSidebarSectionOpen(page, label) {
  const section = page.locator(".nav-section").filter({
    has: page.locator(".section-heading").filter({ hasText: label })
  }).first();
  await section.waitFor({ timeout: 8_000 });
  const toggle = section.locator(".section-heading-toggle").first();
  if (await toggle.count()) {
    const expanded = await toggle.getAttribute("aria-expanded");
    if (expanded === "false") await toggle.click();
  }
  return section;
}

async function ensureFileTreeRootOpen(page) {
  const root = page.locator(".files-tree .section-heading-toggle").first();
  await root.waitFor({ timeout: 5_000 });
  const expanded = await root.getAttribute("aria-expanded");
  if (expanded !== "true") await root.click();
}

async function expandFileTreeFolders(page, labels) {
  for (const label of labels) {
    const row = fileTreeRow(page, label);
    await row.waitFor({ timeout: 5_000 });
    const toggle = row.locator(".file-tree-chevron-btn").first();
    if (await toggle.count() === 0) {
      throw new Error(`File-tree row is not expandable: ${label}`);
    }
    const expanded = await toggle.getAttribute("aria-expanded");
    if (expanded !== "true") await toggle.click();
  }
}

async function clickFileTreeFile(page, label) {
  const row = fileTreeRow(page, label);
  await row.waitFor({ timeout: 5_000 });
  const button = row.locator(".file-tree-name").first();
  await button.click();
}

function fileTreeRow(page, label) {
  return page.locator(".file-tree-row").filter({ hasText: label }).first();
}

async function assertSidebarIcon(page, label, expectedIcon) {
  const item = page.locator(".nav-item").filter({ hasText: label }).first();
  await item.waitFor({ timeout: 8_000 });
  const icon = (await item.locator(".nav-item-icon .entity-icon-emoji").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (icon !== expectedIcon) {
    throw new Error(`Sidebar icon mismatch for "${label}": expected ${expectedIcon}, saw ${icon}`);
  }
  return icon;
}

async function assertHistoryTooltips(page, fixture) {
  const backButton = page.locator(".nav-history-btn").first();
  const forwardButton = page.locator(".nav-history-btn").nth(1);
  await page.waitForFunction(
    ({ databaseName }) => {
      const button = document.querySelector(".nav-history-btn");
      return button?.getAttribute("title")?.includes(databaseName) === true;
    },
    { databaseName: fixture.databaseName },
    { timeout: 5_000 }
  );
  const backTitle = await backButton.getAttribute("title");
  if (!backTitle?.includes(fixture.databaseName)) {
    throw new Error(`Back tooltip should name database target: ${backTitle}`);
  }

  await backButton.click();
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    ({ rowTitle }) => {
      const buttons = Array.from(document.querySelectorAll(".nav-history-btn"));
      return buttons[1]?.getAttribute("title")?.includes(rowTitle) === true;
    },
    { rowTitle: fixture.rowTitle },
    { timeout: 5_000 }
  );
  const forwardTitle = await forwardButton.getAttribute("title");
  if (!forwardTitle?.includes(fixture.rowTitle)) {
    throw new Error(`Forward tooltip should name row-page target: ${forwardTitle}`);
  }
  return { backTitle, forwardTitle };
}

async function assertQuickCreateActions(page) {
  const quickCreateButton = page.getByRole("button", { name: /Quick create|快速新建/i });
  await quickCreateButton.waitFor({ timeout: 5_000 });
  const quickCreateIconClass = await quickCreateButton.locator("svg").first().getAttribute("class");
  if (!quickCreateIconClass?.includes("lucide-square-pen")) {
    throw new Error(`Quick-create icon should be square-pen, saw: ${quickCreateIconClass}`);
  }
  await quickCreateButton.click();
  const newPageOption = page.getByRole("menuitem", { name: /New page|新建页面/i });
  const newDatabaseOption = page.getByRole("menuitem", { name: /New database|新建数据库/i });
  await newPageOption.waitFor({ timeout: 5_000 });
  await newDatabaseOption.waitFor({ timeout: 5_000 });

  const pageIdsBeforeCreate = await page.evaluate(async () => (await window.lotion.pages.list()).map((item) => item.id));
  const beforeClick = await page.evaluate(() => performance.now());
  await newPageOption.click();
  await page.locator(".title-input").first().waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    () => {
      const input = document.querySelector(".title-input");
      return input instanceof HTMLInputElement && /^(Untitled|未命名)$/.test(input.value);
    },
    null,
    { timeout: 8_000 }
  );
  const afterClick = await page.evaluate(() => performance.now());
  const titleValue = await page.locator(".title-input").first().inputValue();
  const newPageId = await waitForNewPageId(page, pageIdsBeforeCreate);
  const recentText = await assertFirstRecentIncludes(page, titleValue);
  if (!recentText.includes(titleValue)) {
    throw new Error(`New page should appear first in Recent. title=${titleValue} recent=${recentText}`);
  }
  const editingLoop = await assertNewPageEditingLoop(page, newPageId, titleValue);
  return {
    newPageId,
    newPageTitle: titleValue,
    newPageOpenMs: Number((afterClick - beforeClick).toFixed(1)),
    quickCreateIconClass,
    recentText,
    hasNewDatabaseOption: true,
    editingLoop
  };
}

async function waitForNewPageId(page, previousIds) {
  const previous = new Set(previousIds);
  const handle = await page.waitForFunction(
    async (idsBefore) => {
      const pages = await window.lotion.pages.list();
      const previousIds = new Set(idsBefore);
      const created = pages.find((item) => (
        typeof item.id === "string" &&
        item.id.startsWith("pg_") &&
        !previousIds.has(item.id)
      ));
      return created?.id || false;
    },
    Array.from(previous),
    { timeout: 8_000 }
  );
  return handle.jsonValue();
}

async function assertFirstRecentIncludes(page, expectedText) {
  const firstRecent = page.locator(".nav-section").filter({ hasText: /Recent|最近访问/ }).locator(".nav-item").first();
  await firstRecent.waitFor({ timeout: 8_000 });
  const recentText = (await firstRecent.textContent())?.trim() ?? "";
  if (!recentText.includes(expectedText)) {
    throw new Error(`Expected first Recent item to include "${expectedText}", saw: ${recentText}`);
  }
  return recentText;
}

async function assertNewPageEditingLoop(page, pageId, titleValue) {
  const bodyText = `Quick-created body smoke ${Date.now()}`;
  const emptyPrompt = page.locator(".empty-page-prompt").first();
  const emptyPromptVisible = await emptyPrompt.isVisible({ timeout: 1_000 }).catch(() => false);
  if (emptyPromptVisible) {
    await emptyPrompt.click();
    await page.keyboard.press("Enter");
  }
  const editor = page.locator(".cm-content").first();
  await editor.waitFor({ timeout: 8_000 });
  await editor.click();
  await page.keyboard.type(bodyText);
  await page.getByText(bodyText).first().waitFor({ timeout: 8_000 });
  await waitForPageMarkdown(page, pageId, bodyText, "new page body text after quick-create typing");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 8_000 });
  const recentTextAfterReload = await assertFirstRecentIncludes(page, titleValue);
  await page.locator(".nav-section").filter({ hasText: /Recent|最近访问/ }).locator(".nav-item").first().click();
  await page.locator(".title-input").first().waitFor({ timeout: 8_000 });
  await page.getByText(bodyText).first().waitFor({ timeout: 8_000 });
  const persisted = await page.evaluate(async ({ targetPageId, expectedText }) => {
    const doc = await window.lotion.pages.get(targetPageId);
    return {
      title: doc.meta.title,
      markdown: doc.markdown,
      containsExpectedText: doc.markdown.includes(expectedText)
    };
  }, { targetPageId: pageId, expectedText: bodyText });
  if (!persisted.containsExpectedText) {
    throw new Error(`Quick-created page body did not persist after reload/reopen: ${JSON.stringify(persisted)}`);
  }
  return {
    bodyText,
    emptyPromptVisible,
    recentTextAfterReload,
    persistedTitle: persisted.title,
    markdownLength: persisted.markdown.length
  };
}

async function waitForPageMarkdown(page, pageId, expectedText, label) {
  const deadline = Date.now() + 10_000;
  let lastMarkdown = "";
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async ({ targetPageId, text }) => {
      const doc = await window.lotion.pages.get(targetPageId);
      return {
        ok: doc.markdown.includes(text),
        markdown: doc.markdown
      };
    }, { targetPageId: pageId, text: expectedText });
    if (snapshot.ok) return;
    lastMarkdown = snapshot.markdown;
    await page.waitForTimeout(150);
  }
  throw new Error(`${label} was not persisted. Last markdown: ${JSON.stringify(lastMarkdown)}`);
}

async function createSidebarFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-sidebar-nav-${safeViewport}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `pg_sidebar_smoke_${safeViewport}`;
  const pageTitle = "Sidebar Smoke Page";
  const pageIcon = "📘";
  const treeParentId = `pg_sidebar_tree_parent_${safeViewport}`;
  const treeParentTitle = "Sidebar Parent Page";
  const treeParentIcon = "🗂️";
  const treeChildId = `pg_sidebar_tree_child_${safeViewport}`;
  const treeChildTitle = "Sidebar Child Page";
  const treeChildIcon = "🧩";
  const databaseId = `db_sidebar_smoke_${safeViewport}`;
  const databaseName = "Sidebar Smoke DB";
  const databaseIcon = "🧮";
  const rowId = `row_sidebar_smoke_${safeViewport}`;
  const rowTitle = "Sidebar Smoke Row";
  const rowIcon = "🧭";
  const tagName = "Focus";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const treeParentPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(treeParentId, treeParentTitle));
  const treeChildPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(treeChildId, treeChildTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_sidebar_smoke",
    name: "Sidebar Smoke",
    pages: [pageId, treeParentId, treeChildId],
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
      icon: `emoji:${pageIcon}`,
      path: ["Bench", pageTitle],
      bodyPath: pagePath,
      tags: [tagName]
    }),
    pageRecord({
      id: treeParentId,
      title: treeParentTitle,
      now,
      icon: `emoji:${treeParentIcon}`,
      path: ["Bench", treeParentTitle],
      bodyPath: treeParentPath
    }),
    pageRecord({
      id: treeChildId,
      title: treeChildTitle,
      now,
      icon: `emoji:${treeChildIcon}`,
      path: ["Bench", treeParentTitle, treeChildTitle],
      bodyPath: treeChildPath,
      parentId: treeParentId,
      parentKind: "page"
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nInitial page for sidebar navigation smoke.\n`, "utf8");
  await writeFile(join(root, treeParentPath), `# ${treeParentTitle}\n\nParent page for sidebar hierarchy smoke.\n`, "utf8");
  await writeFile(join(root, treeChildPath), `# ${treeChildTitle}\n\nChild page opened through the nested sidebar tree.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    icon: `emoji:${databaseIcon}`,
    tags: [tagName],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "row_icon", name: "Icon", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "created_time", "updated_time", "title", "row_icon", "page_file", "notes"], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    row_icon: `emoji:${rowIcon}`,
    page_file: rowPageFile,
    notes: "Open me from the file tree"
  }]);
  await writeFile(join(root, rowPagePath), `# ${rowTitle}\n\nRow page opened through the sidebar file tree.\n`, "utf8");

  return {
    root,
    treeParentId,
    pageTitle,
    pageIcon,
    treeParentTitle,
    treeChildTitle,
    databaseName,
    databaseIcon,
    rowTitle,
    rowIcon,
    databaseFolder,
    rowPageFile,
    tagName
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCsv(path, fields, records) {
  const lines = [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field] ?? "")).join(","))
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function workspacePath(group, dbFolder, ...parts) {
  return ["databases", group, dbFolder, ...parts].join("/");
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

function pageRecord({ id, title, now, icon, path, bodyPath, tags = [], parentId = "", parentKind = "page" }) {
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
    parent_id: parentId ? JSON.stringify([{ entityId: parentId, kind: parentKind }]) : "",
    tags: tags.join(";"),
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
