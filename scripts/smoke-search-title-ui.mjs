#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  setLotionLocale,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { assertGlobalSearchVisualArtifactContract } from "./lib/global-search-visual-artifacts.mjs";

const sharedHarnessMode = Boolean(process.env.LOTION_UI_HARNESS_NO_AUTOSTART);

const result = await withLotionUIHarness("search-title", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  await setLotionLocale(page, "zh");
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createSearchTitleFixture(viewport.name);

    await openWorkspace(fixture.root);
    await waitForPageService(page, fixture.pageId);
    await closeSearchIfOpen(page);
    await openGlobalSearch(page);
    await assertSearchLayout(page, `empty ${viewport.name}`, { expectResults: true, expectFilters: false });
    const emptyPaletteDefaults = await assertCommandPaletteDefaultRows(page, fixture, viewport, artifactRoot);
    await page.locator(".global-search-input").fill(fixture.query);
    await page.waitForFunction(
      (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
        .some((item) => item.textContent?.trim() === title),
      fixture.pageTitle,
      { timeout: 8_000 }
    );
    await assertSearchLayout(page, `typed ${viewport.name}`, { expectResults: true, expectFilters: true });

    const rendered = await page.evaluate((title) => {
      const hits = Array.from(document.querySelectorAll(".global-search-hit")).map((hit) => ({
        label: hit.querySelector(".global-search-label")?.textContent?.trim() ?? "",
        icon: hit.querySelector(".gs-entity-icon")?.textContent?.trim() ?? "",
        title: hit.querySelector(".gs-title")?.textContent?.trim() ?? "",
        kind: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
        matchType: hit.querySelector(".gs-match-badge")?.textContent?.trim() ?? "",
        path: hit.querySelector(".global-search-path")?.textContent?.trim() ?? "",
        preview: hit.querySelector(".global-search-preview")?.textContent?.trim() ?? ""
      }));
      return {
        hits,
        target: hits.find((hit) => hit.title === title) ?? null
      };
    }, fixture.pageTitle);

    if (!rendered.target) {
      throw new Error(`Search result did not show page title: ${JSON.stringify(rendered)}`);
    }
    if (rendered.target.label.includes(fixture.pageId) || rendered.target.title.includes(fixture.pageId)) {
      throw new Error(`Search result leaked raw page id: ${JSON.stringify(rendered.target)}`);
    }
    if (!rendered.target.kind) {
      throw new Error(`Search result is missing a kind badge: ${JSON.stringify(rendered.target)}`);
    }
    if (rendered.target.icon !== fixture.pageIcon) {
      throw new Error(`Search result icon mismatch: ${JSON.stringify({ expected: fixture.pageIcon, target: rendered.target })}`);
    }
    const typedSnapshot = await captureSearchPopupSnapshot({
      artifactRoot,
      fixture,
      metadata: {
        phase: "typed",
        query: fixture.query,
        targetTitle: fixture.pageTitle,
        hits: rendered.hits.slice(0, 8)
      },
      page,
      viewport
    });
    await assertSearchFilters(page, fixture.pageTitle);
    const opened = await assertSearchResultOpensPage(page, fixture);
    const escapeFocusRestore = await assertSearchEscapeRestoresEditorFocus(page, viewport.name);
    const recentDefaults = await assertSearchRecentDefaults(page, fixture, viewport, artifactRoot);
    const tagPages = await assertSearchTagPages(page, fixture, viewport, artifactRoot);
    const builtInCommands = await assertBuiltInCommands(page, fixture, viewport, artifactRoot);
    const databasePluginCommands = await assertBuiltInDatabaseAndPluginCommands(page, fixture, viewport, artifactRoot);

    viewports.push({
      viewport: viewport.name,
      query: fixture.query,
      pageId: fixture.pageId,
      pageTitle: fixture.pageTitle,
      rendered,
      visualSnapshots: [
        typedSnapshot,
        emptyPaletteDefaults.visualSnapshot,
        recentDefaults.visualSnapshot,
        tagPages.visualSnapshot,
        builtInCommands.visualSnapshot,
        databasePluginCommands.visualSnapshot
      ],
      opened,
      escapeFocusRestore,
      emptyPaletteDefaults,
      recentDefaults,
      tagPages,
      builtInCommands,
      databasePluginCommands
    });
  });

  return {
    cdpUrl,
    viewports,
    artifactContract: await assertGlobalSearchVisualArtifactContract({
      status: "passed",
      viewports
    }, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    }),
    status: "passed"
  };
});

console.log(JSON.stringify(result, null, 2));

async function assertSearchLayout(page, label, { expectResults, expectFilters }) {
  await assertWithinViewport(page, page.locator(".global-search").first(), `${label} search dialog`, 8);
  await assertWithinViewport(page, page.locator(".global-search-input").first(), `${label} search input`, 8);
  if (expectFilters) {
    await assertWithinViewport(page, page.locator(".global-search-filters").first(), `${label} search filters`, 8);
  }
  if (expectResults) {
    const firstVisibleHit = page.locator(".global-search-hit:visible").first();
    await firstVisibleHit.waitFor({ timeout: 8_000 });
    await assertWithinViewport(page, firstVisibleHit, `${label} first search hit`, 8);
  }
  await assertNoDocumentHorizontalOverflow(page, `search title ${label}`, 8);
}

async function waitForPageService(page, pageId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetPageId) => {
    const pages = await window.lotion.pages.list();
    return pages.some((candidate) => candidate.id === targetPageId);
  }, pageId, { timeout: 8_000 });
}

async function closeSearchIfOpen(page) {
  if (await page.locator(".global-search").count()) {
    await page.keyboard.press("Escape");
    await page.waitForSelector(".global-search", { state: "detached", timeout: 2_000 }).catch(() => undefined);
  }
}

async function openGlobalSearch(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "F",
      code: "KeyF",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true
    }));
  });
  await page.waitForSelector(".global-search-input", { timeout: 5_000 });
  await page.locator(".global-search-input").focus();
  await page.waitForFunction(
    () => document.activeElement === document.querySelector(".global-search-input"),
    null,
    { timeout: 5_000 }
  );
}

async function assertSearchFilters(page, pageTitle) {
  const filters = await page.evaluate(() => Array.from(document.querySelectorAll(".global-search-filters button")).map((button) => ({
    text: button.textContent?.trim() ?? "",
    active: button.classList.contains("active")
  })));
  for (const label of ["全部", "标题", "正文/字段", "引用", "数据库", "命令"]) {
    if (!filters.some((filter) => filter.text.includes(label))) {
      throw new Error(`Missing search filter "${label}": ${JSON.stringify(filters)}`);
    }
  }

  await clickSearchFilter(page, "数据库");
  await page.waitForSelector(".global-search-empty", { timeout: 5_000 });
  const databaseHitCount = await page.locator(".global-search-hit").count();
  if (databaseHitCount !== 0) {
    throw new Error(`Database filter should hide page-only query results; saw ${databaseHitCount} hits`);
  }

  await clickSearchFilter(page, "标题");
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    pageTitle,
    { timeout: 5_000 }
  );
}

async function clickSearchFilter(page, label) {
  await page.locator(".global-search-filters button").filter({ hasText: label }).first().click();
}

async function assertSearchResultOpensPage(page, fixture) {
  await page.locator(".global-search-input").focus();
  await page.waitForFunction(
    (title) => {
      const active = document.querySelector(".global-search-hit.active");
      return active?.querySelector(".gs-title")?.textContent?.trim() === title;
    },
    fixture.pageTitle,
    { timeout: 5_000 }
  );
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.pageTitle,
    { timeout: 8_000 }
  );
  const opened = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (opened.titleInput !== fixture.pageTitle) {
    throw new Error(`Search result did not open the expected page title: ${JSON.stringify(opened)}`);
  }
  if (!opened.activeTabText.includes(fixture.pageTitle)) {
    throw new Error(`Active tab does not include opened page title: ${JSON.stringify(opened)}`);
  }
  if (opened.activeTabText.includes(fixture.pageId)) {
    throw new Error(`Active tab leaked raw page id after search navigation: ${JSON.stringify(opened)}`);
  }
  return opened;
}

async function assertCommandPaletteDefaultRows(page, fixture, viewport, artifactRoot) {
  await page.waitForFunction(
    (expected) => {
      const renderedTitles = Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
        .map((item) => item.textContent?.trim() ?? "");
      return expected.every((title) => renderedTitles.includes(title));
    },
    [fixture.recentPageTitle, fixture.recentDatabaseName, fixture.recentRowTitle, fixture.tagTitle, "新建页面", "打开所有页面"],
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `default command palette ${viewport.name}`, { expectResults: true, expectFilters: false });
  const rows = await collectSearchRows(page);
  const recentTitles = [fixture.recentPageTitle, fixture.recentDatabaseName, fixture.recentRowTitle];
  const recentIndexes = recentTitles.map((title) => rows.findIndex((row) => row.title === title));
  const tagIndex = rows.findIndex((row) => row.title === fixture.tagTitle && row.badge === "标签");
  const firstCommandIndex = rows.findIndex((row) => row.badge === "命令");
  if (
    recentIndexes.some((index) => index < 0) ||
    tagIndex < 0 ||
    firstCommandIndex < 0 ||
    !recentIndexes.every((index) => index < tagIndex) ||
    tagIndex >= firstCommandIndex
  ) {
    throw new Error(`Default command palette should show recent navigation, tag pages, then command rows: ${JSON.stringify(rows.slice(0, 10))}`);
  }
  assertTagRow(rows, fixture);
  const newPageRow = assertCommandRow(rows, {
    title: "新建页面",
    previewIncludes: ["Lotion", "内置", "lotion.new-page"]
  });
  const openPagesRow = assertCommandRow(rows, {
    title: "打开所有页面",
    previewIncludes: ["Lotion", "内置", "lotion.open-pages"]
  });
  const progress = await page.evaluate(() => ({
    label: document.querySelector(".global-search-progress-label")?.textContent?.trim() ?? "",
    detail: document.querySelector(".global-search-progress-detail")?.textContent?.trim() ?? "",
    inputAria: document.querySelector(".global-search-input")?.getAttribute("aria-label") ?? "",
    searchOpen: Boolean(document.querySelector(".global-search"))
  }));
  if (!progress.label.includes("最近访问、标签和命令") || !progress.detail.includes("打开页面、标签或执行命令") || !progress.inputAria.includes("命令面板")) {
    throw new Error(`Default command palette copy should explain navigation and commands: ${JSON.stringify(progress)}`);
  }
  const visualSnapshot = await captureSearchPopupSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "default-command-palette",
      query: "",
      expectedTitles: [...recentTitles, fixture.tagTitle, "新建页面", "打开所有页面"],
      hits: rows.slice(0, 10)
    },
    page,
    viewport
  });
  const activeCommand = await focusCommandRowByKeyboard(page, "打开所有页面", `default command palette ${viewport.name}`, "");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => /^(All pages|所有页面)$/.test(document.querySelector(".management-view h1")?.textContent?.trim() ?? ""),
    null,
    { timeout: 8_000 }
  );
  const openedPagesView = await page.evaluate(() => ({
    heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? "",
    searchOpen: Boolean(document.querySelector(".global-search"))
  }));
  if (!/All pages|所有页面/.test(openedPagesView.activeTabText) || openedPagesView.searchOpen) {
    throw new Error(`Default command palette Enter did not run the command: ${JSON.stringify(openedPagesView)}`);
  }
  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.recentPageTitle,
    { timeout: 8_000 }
  );
  await assertNoDocumentHorizontalOverflow(page, `default command palette restored ${viewport.name}`, 8);
  return { rows: rows.slice(0, 12), newPageRow, openPagesRow, progress, visualSnapshot, activeCommand, openedPagesView };
}

async function assertSearchEscapeRestoresEditorFocus(page, viewportName) {
  const editor = page.locator(".cm-content").first();
  await editor.click();
  await page.waitForFunction(() => {
    return document.activeElement?.classList.contains("cm-content") === true
      && document.querySelector(".cm-editor.cm-focused") !== null;
  }, null, { timeout: 8_000 });

  await openGlobalSearch(page);
  await assertWithinViewport(page, page.locator(".global-search").first(), `escape focus ${viewportName} search dialog`, 8);
  await assertWithinViewport(page, page.locator(".global-search-input").first(), `escape focus ${viewportName} search input`, 8);
  await assertNoDocumentHorizontalOverflow(page, `search title escape focus open ${viewportName}`, 8);

  const beforeEscape = await page.evaluate(() => ({
    searchOpen: Boolean(document.querySelector(".global-search")),
    inputFocused: document.activeElement?.classList.contains("global-search-input") === true,
    editorFocused: document.querySelector(".cm-editor.cm-focused") !== null
  }));
  if (!beforeEscape.searchOpen || !beforeEscape.inputFocused) {
    throw new Error(`Global search did not take focus from the editor: ${JSON.stringify(beforeEscape)}`);
  }

  await page.keyboard.press("Escape");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(() => {
    return document.activeElement?.classList.contains("cm-content") === true
      && document.querySelector(".cm-editor.cm-focused") !== null;
  }, null, { timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `search title escape focus restored ${viewportName}`, 8);

  const afterEscape = await page.evaluate(() => ({
    searchOpen: Boolean(document.querySelector(".global-search")),
    cmContentFocused: document.activeElement?.classList.contains("cm-content") === true,
    editorFocused: document.querySelector(".cm-editor.cm-focused") !== null
  }));
  if (afterEscape.searchOpen || !afterEscape.cmContentFocused || !afterEscape.editorFocused) {
    throw new Error(`Escape did not restore focus to the editor: ${JSON.stringify(afterEscape)}`);
  }

  return { beforeEscape, afterEscape };
}

async function assertSearchRecentDefaults(page, fixture, viewport, artifactRoot) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.waitForFunction(
    (titles) => {
      const renderedTitles = Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
        .map((item) => item.textContent?.trim() ?? "");
      return titles.every((title) => renderedTitles.includes(title));
    },
    [fixture.recentPageTitle, fixture.recentDatabaseName, fixture.recentRowTitle],
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `recent ${viewport.name}`, { expectResults: true, expectFilters: false });

  const rendered = await collectSearchRows(page);
  assertRecentRow(rendered, {
    title: fixture.recentPageTitle,
    icon: fixture.recentPageIcon,
    previewIncludes: ["页面", "Recent Bench"]
  });
  assertRecentRow(rendered, {
    title: fixture.recentDatabaseName,
    icon: fixture.recentDatabaseIcon,
    previewIncludes: ["数据库", "Recent Bench"]
  });
  assertRecentRow(rendered, {
    title: fixture.recentRowTitle,
    icon: fixture.recentRowIcon,
    previewIncludes: ["页面", fixture.recentDatabaseName, "Recent Bench"]
  });
  const visualSnapshot = await captureSearchPopupSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "recent",
      query: "",
      expectedTitles: [fixture.recentPageTitle, fixture.recentDatabaseName, fixture.recentRowTitle],
      hits: rendered.slice(0, 8)
    },
    page,
    viewport
  });
  const keyboard = await assertRecentKeyboardNavigation(page, fixture, viewport.name);

  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.recentPageTitle,
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `recent page click ${viewport.name}`, { expectResults: true, expectFilters: false });
  await clickSearchRowByTitle(page, fixture.recentPageTitle, `recent page click ${viewport.name}`);
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.recentPageTitle,
    { timeout: 8_000 }
  );
  const openedPage = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!openedPage.activeTabText.includes(fixture.recentPageTitle)) {
    throw new Error(`Recent page navigation did not activate expected tab: ${JSON.stringify(openedPage)}`);
  }

  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.recentDatabaseName,
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `recent database ${viewport.name}`, { expectResults: true, expectFilters: false });
  await clickSearchRowByTitle(page, fixture.recentDatabaseName, `recent database click ${viewport.name}`);
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".database-title-wrap h1")?.textContent?.trim() === title,
    fixture.recentDatabaseName,
    { timeout: 8_000 }
  );
  const openedDatabase = await page.evaluate(() => ({
    databaseTitle: document.querySelector(".database-title-wrap h1")?.textContent?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!openedDatabase.activeTabText.includes(fixture.recentDatabaseName)) {
    throw new Error(`Recent database navigation did not activate expected tab: ${JSON.stringify(openedDatabase)}`);
  }

  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.recentRowTitle,
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `recent row ${viewport.name}`, { expectResults: true, expectFilters: false });
  await clickSearchRowByTitle(page, fixture.recentRowTitle, `recent row click ${viewport.name}`);
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.recentRowTitle,
    { timeout: 8_000 }
  );
  const openedRowPage = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!openedRowPage.activeTabText.includes(fixture.recentRowTitle)) {
    throw new Error(`Recent row-page navigation did not activate expected tab: ${JSON.stringify(openedRowPage)}`);
  }

  return { rendered, visualSnapshot, keyboard, openedPage, openedDatabase, openedRowPage };
}

async function assertSearchTagPages(page, fixture, viewport, artifactRoot) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll('.global-search-hit[data-search-item-type="tag"] .gs-title'))
      .some((item) => item.textContent?.trim() === title),
    fixture.tagTitle,
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `tag default ${viewport.name}`, { expectResults: true, expectFilters: false });
  const rows = await collectSearchRows(page);
  const tagRow = assertTagRow(rows, fixture);
  const recentIndexes = [fixture.recentPageTitle, fixture.recentDatabaseName, fixture.recentRowTitle]
    .map((title) => rows.findIndex((row) => row.title === title));
  const tagIndex = rows.findIndex((row) => row.title === fixture.tagTitle && row.type === "tag");
  const firstCommandIndex = rows.findIndex((row) => row.type === "command");
  if (recentIndexes.some((index) => index < 0) || tagIndex < 0 || firstCommandIndex < 0 || !recentIndexes.every((index) => index < tagIndex) || tagIndex >= firstCommandIndex) {
    throw new Error(`Tag page should sit between recent and command rows in empty query: ${JSON.stringify(rows.slice(0, 10))}`);
  }
  const visualSnapshot = await captureSearchPopupSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "tag-default",
      query: "",
      expectedTitle: fixture.tagTitle,
      hits: rows.slice(0, 8)
    },
    page,
    viewport
  });
  await clickTagSearchRow(page, fixture, `tag default click ${viewport.name}`);
  const openedByClick = await assertTagManagementOpen(page, fixture, viewport, "click");

  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill(fixture.tagName);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll('.global-search-hit[data-search-item-type="tag"] .gs-title'))
      .some((item) => item.textContent?.trim() === title),
    fixture.tagTitle,
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `tag typed ${viewport.name}`, { expectResults: true, expectFilters: true });
  const typedRows = await collectSearchRows(page);
  const typedTagRow = assertTagRow(typedRows, fixture);
  const typedActive = await focusTagRowByKeyboard(page, fixture, `tag typed keyboard ${viewport.name}`, fixture.tagName);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const openedByKeyboard = await assertTagManagementOpen(page, fixture, viewport, "keyboard");

  return { tagRow, visualSnapshot, openedByClick, typedTagRow, typedActive, openedByKeyboard };
}

async function clickTagSearchRow(page, fixture, label) {
  const row = page.locator('.global-search-hit[data-search-item-type="tag"]').filter({
    has: page.locator(".gs-title").filter({ hasText: exactTextRegex(fixture.tagTitle) })
  }).first();
  await row.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, row, `${label} search row`, 8);
  await row.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
}

async function focusTagRowByKeyboard(page, fixture, label, expectedInputValue) {
  await page.locator(".global-search-input").focus();
  const targetState = await page.evaluate((title) => {
    const rows = Array.from(document.querySelectorAll(".global-search-hit"))
      .map((hit, index) => {
        const rect = hit.getBoundingClientRect();
        return {
          active: hit.classList.contains("active"),
          badge: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
          index,
          title: hit.querySelector(".gs-title")?.textContent?.trim() ?? "",
          type: hit.getAttribute("data-search-item-type") ?? "",
          visible: rect.width > 0 && rect.height > 0
        };
      })
      .filter((row) => row.visible);
    return {
      activeIndex: rows.findIndex((row) => row.active),
      rows,
      targetIndex: rows.findIndex((row) => row.title === title && row.type === "tag")
    };
  }, fixture.tagTitle);
  if (targetState.targetIndex < 0) {
    throw new Error(`Tag keyboard target not rendered for ${label}: ${JSON.stringify(targetState)}`);
  }
  if (targetState.activeIndex < 0) {
    throw new Error(`Tag keyboard has no active row for ${label}: ${JSON.stringify(targetState)}`);
  }
  for (let index = targetState.activeIndex; index < targetState.targetIndex; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  for (let index = targetState.activeIndex; index > targetState.targetIndex; index -= 1) {
    await page.keyboard.press("ArrowUp");
  }
  return assertActiveTagRow(page, fixture, label, expectedInputValue);
}

async function assertActiveTagRow(page, fixture, label, expectedInputValue) {
  await page.waitForFunction(
    (title) => {
      const active = document.querySelector(".global-search-hit.active");
      return active?.getAttribute("data-search-item-type") === "tag"
        && active?.querySelector(".gs-title")?.textContent?.trim() === title;
    },
    fixture.tagTitle,
    { timeout: 5_000 }
  );
  await assertWithinViewport(page, page.locator(".global-search-hit.active").first(), `${label} active tag row`, 8);
  await assertNoDocumentHorizontalOverflow(page, label, 8);
  const state = await page.evaluate(() => {
    const input = document.querySelector(".global-search-input");
    const activeRows = Array.from(document.querySelectorAll(".global-search-hit.active"));
    const active = activeRows[0];
    return {
      activeRows: activeRows.length,
      badge: active?.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      inputFocused: document.activeElement === input,
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      preview: active?.querySelector(".global-search-preview")?.textContent?.trim() ?? "",
      title: active?.querySelector(".gs-title")?.textContent?.trim() ?? "",
      type: active?.getAttribute("data-search-item-type") ?? ""
    };
  });
  if (
    state.activeRows !== 1 ||
    state.badge !== "标签" ||
    !state.inputFocused ||
    state.inputValue !== expectedInputValue ||
    state.title !== fixture.tagTitle ||
    state.type !== "tag" ||
    !state.preview.includes(`页面 ${fixture.tagPageCount}`) ||
    !state.preview.includes(`数据库 ${fixture.tagDatabaseCount}`)
  ) {
    throw new Error(`Tag keyboard active-row state mismatch for ${label}: ${JSON.stringify(state)}`);
  }
  return state;
}

async function assertTagManagementOpen(page, fixture, viewport, mode) {
  await page.waitForFunction(
    (tagName) => (document.querySelector(".management-view h1")?.textContent?.trim() ?? "").includes(tagName),
    fixture.tagName,
    { timeout: 8_000 }
  );
  await assertWithinViewport(page, page.locator(".management-header").first(), `tag management header ${mode} ${viewport.name}`, 8);
  await assertWithinViewport(page, page.locator('[data-testid="tag-management-view"]').first(), `tag management body ${mode} ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `tag management ${mode} ${viewport.name}`, 8);
  const state = await page.evaluate((expected) => {
    const rows = Array.from(document.querySelectorAll(".tag-manage-table tbody tr")).map((row) => row.textContent?.trim() ?? "");
    return {
      activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? "",
      heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
      rowCount: rows.length,
      rows,
      searchOpen: Boolean(document.querySelector(".global-search")),
      token: document.querySelector(".tag-management-token .management-summary-number")?.textContent?.trim() ?? "",
      hasPage: rows.some((row) => row.includes(expected.pageTitle)),
      hasDatabase: rows.some((row) => row.includes(expected.databaseName))
    };
  }, {
    databaseName: fixture.recentDatabaseName,
    pageTitle: fixture.pageTitle
  });
  if (
    state.searchOpen ||
    !state.heading.includes(fixture.tagName) ||
    !state.activeTabText.includes(fixture.tagTitle) ||
    state.token !== fixture.tagTitle ||
    state.rowCount !== fixture.tagTotalCount ||
    !state.hasPage ||
    !state.hasDatabase
  ) {
    throw new Error(`Tag management page did not open correctly via ${mode}: ${JSON.stringify(state)}`);
  }
  return state;
}

async function assertRecentKeyboardNavigation(page, fixture, viewportName) {
  const pageActive = await focusRecentRowByKeyboard(page, fixture.recentPageTitle, `recent keyboard page ${viewportName}`);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.recentPageTitle,
    { timeout: 8_000 }
  );
  const openedPage = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!openedPage.activeTabText.includes(fixture.recentPageTitle)) {
    throw new Error(`Keyboard recent page navigation did not activate expected tab: ${JSON.stringify(openedPage)}`);
  }

  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.recentDatabaseName,
    { timeout: 8_000 }
  );
  const databaseActive = await focusRecentRowByKeyboard(page, fixture.recentDatabaseName, `recent keyboard database ${viewportName}`);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".database-title-wrap h1")?.textContent?.trim() === title,
    fixture.recentDatabaseName,
    { timeout: 8_000 }
  );
  const openedDatabase = await page.evaluate(() => ({
    databaseTitle: document.querySelector(".database-title-wrap h1")?.textContent?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!openedDatabase.activeTabText.includes(fixture.recentDatabaseName)) {
    throw new Error(`Keyboard recent database navigation did not activate expected tab: ${JSON.stringify(openedDatabase)}`);
  }

  await openGlobalSearch(page);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.recentRowTitle,
    { timeout: 8_000 }
  );
  const rowActive = await focusRecentRowByKeyboard(page, fixture.recentRowTitle, `recent keyboard row ${viewportName}`);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.recentRowTitle,
    { timeout: 8_000 }
  );
  const openedRowPage = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!openedRowPage.activeTabText.includes(fixture.recentRowTitle)) {
    throw new Error(`Keyboard recent row-page navigation did not activate expected tab: ${JSON.stringify(openedRowPage)}`);
  }

  return { pageActive, databaseActive, rowActive, openedPage, openedDatabase, openedRowPage };
}

async function focusRecentRowByKeyboard(page, expectedTitle, label) {
  await page.locator(".global-search-input").focus();
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    expectedTitle,
    { timeout: 8_000 }
  );
  const targetState = await page.evaluate((title) => {
    const rows = Array.from(document.querySelectorAll(".global-search-hit")).map((hit, index) => ({
      active: hit.classList.contains("active"),
      badge: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      index,
      title: hit.querySelector(".gs-title")?.textContent?.trim() ?? ""
    }));
    return {
      activeIndex: rows.findIndex((row) => row.active),
      rows,
      targetIndex: rows.findIndex((row) => row.title === title)
    };
  }, expectedTitle);
  if (targetState.targetIndex < 0) {
    throw new Error(`Recent keyboard target not rendered for ${label}: ${JSON.stringify(targetState)}`);
  }
  if (targetState.activeIndex < 0) {
    throw new Error(`Recent keyboard has no active row for ${label}: ${JSON.stringify(targetState)}`);
  }
  for (let index = 0; index < targetState.rows.length + 2; index += 1) {
    await page.keyboard.press("ArrowUp");
  }
  await assertActiveSearchRowAtIndex(page, 0, `${label} reset to first row`);
  for (let index = 0; index < targetState.targetIndex; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  return assertActiveRecentRow(page, expectedTitle, label);
}

async function focusCommandRowByKeyboard(page, expectedTitle, label, expectedInputValue) {
  await page.locator(".global-search-input").focus();
  await waitForSearchSettled(page, expectedInputValue);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    expectedTitle,
    { timeout: 8_000 }
  );
  const targetState = await page.evaluate((title) => {
    const rows = Array.from(document.querySelectorAll(".global-search-hit")).map((hit, index) => ({
      active: hit.classList.contains("active"),
      badge: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      index,
      title: hit.querySelector(".gs-title")?.textContent?.trim() ?? "",
      type: hit.getAttribute("data-search-item-type") ?? ""
    }));
    return {
      activeIndex: rows.findIndex((row) => row.active),
      rows,
      targetIndex: rows.findIndex((row) => row.title === title && row.badge === "命令")
    };
  }, expectedTitle);
  if (targetState.targetIndex < 0) {
    throw new Error(`Command keyboard target not rendered for ${label}: ${JSON.stringify(targetState)}`);
  }
  if (targetState.activeIndex < 0) {
    throw new Error(`Command keyboard has no active row for ${label}: ${JSON.stringify(targetState)}`);
  }
  for (let index = 0; index < targetState.rows.length + 2; index += 1) {
    await page.keyboard.press("ArrowUp");
  }
  await assertActiveSearchRowAtIndex(page, 0, `${label} reset to first row`);
  for (let index = 0; index < targetState.targetIndex; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  return assertActiveCommandRow(page, expectedTitle, label, expectedInputValue);
}

async function waitForSearchSettled(page, expectedInputValue) {
  await page.waitForFunction(
    (expected) => {
      const input = document.querySelector(".global-search-input");
      const progress = document.querySelector("[data-testid='global-search-progress']");
      if (!(input instanceof HTMLInputElement)) return false;
      if (expected !== undefined && input.value !== expected) return false;
      if (!input.value.trim()) return true;
      const state = progress?.getAttribute("data-state") ?? "";
      return state !== "loading" && state !== "empty";
    },
    expectedInputValue,
    { timeout: 8_000 }
  );
}

async function assertActiveSearchRowAtIndex(page, expectedIndex, label) {
  await page.waitForFunction(
    (index) => {
      const rows = Array.from(document.querySelectorAll(".global-search-hit"));
      return rows[index]?.classList.contains("active") === true;
    },
    expectedIndex,
    { timeout: 5_000 }
  );
  await assertNoDocumentHorizontalOverflow(page, label, 8);
}

async function assertActiveRecentRow(page, expectedTitle, label) {
  await page.waitForFunction(
    (title) => {
      const active = document.querySelector(".global-search-hit.active");
      return active?.querySelector(".gs-title")?.textContent?.trim() === title;
    },
    expectedTitle,
    { timeout: 5_000 }
  );
  await assertWithinViewport(page, page.locator(".global-search-hit.active").first(), `${label} active row`, 8);
  await assertNoDocumentHorizontalOverflow(page, label, 8);
  const state = await page.evaluate(() => {
    const input = document.querySelector(".global-search-input");
    const activeRows = Array.from(document.querySelectorAll(".global-search-hit.active"));
    const active = activeRows[0];
    return {
      activeRows: activeRows.length,
      inputFocused: document.activeElement === input,
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      title: active?.querySelector(".gs-title")?.textContent?.trim() ?? "",
      badge: active?.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      preview: active?.querySelector(".global-search-preview")?.textContent?.trim() ?? ""
    };
  });
  if (state.activeRows !== 1 || !state.inputFocused || state.inputValue !== "" || state.title !== expectedTitle || state.badge !== "最近") {
    throw new Error(`Recent keyboard active-row state mismatch for ${label}: ${JSON.stringify(state)}`);
  }
  return state;
}

async function assertActiveCommandRow(page, expectedTitle, label, expectedInputValue) {
  await page.waitForFunction(
    (title) => {
      return Array.from(document.querySelectorAll(".global-search-hit.active")).some((active) => {
        const rect = active.getBoundingClientRect();
        return active.querySelector(".gs-title")?.textContent?.trim() === title
          && active.querySelector(".gs-kind-badge")?.textContent?.trim() === "命令"
          && rect.width > 0
          && rect.height > 0;
      });
    },
    expectedTitle,
    { timeout: 5_000 }
  );
  const activeCommand = page.locator(".global-search-hit.active")
    .filter({ hasText: expectedTitle })
    .filter({ hasText: "命令" })
    .first();
  await assertWithinViewport(page, activeCommand, `${label} active command row`, 8);
  await assertNoDocumentHorizontalOverflow(page, label, 8);
  const state = await page.evaluate(() => {
    const input = document.querySelector(".global-search-input");
    const activeRows = Array.from(document.querySelectorAll(".global-search-hit.active"));
    const visibleActiveRows = activeRows.filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const active = visibleActiveRows[0];
    return {
      activeRows: activeRows.length,
      visibleActiveRows: visibleActiveRows.length,
      inputFocused: document.activeElement === input,
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      title: active?.querySelector(".gs-title")?.textContent?.trim() ?? "",
      badge: active?.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      preview: active?.querySelector(".global-search-preview")?.textContent?.trim() ?? "",
      type: active?.getAttribute("data-search-item-type") ?? ""
    };
  });
  const inputMatches = expectedInputValue === undefined || state.inputValue === expectedInputValue;
  if (state.visibleActiveRows !== 1 || !state.inputFocused || !inputMatches || state.title !== expectedTitle || state.badge !== "命令" || state.type !== "command") {
    throw new Error(`Command keyboard active-row state mismatch for ${label}: ${JSON.stringify(state)}`);
  }
  return state;
}

async function clickSearchRowByTitle(page, title, label) {
  const exactTitle = exactTextRegex(title);
  const matches = await page.evaluate((expected) => Array.from(document.querySelectorAll(".global-search-hit"))
    .filter((hit) => hit.querySelector(".gs-title")?.textContent?.trim() === expected)
    .map((hit) => ({
      badge: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      preview: hit.querySelector(".global-search-preview")?.textContent?.trim() ?? "",
      title: hit.querySelector(".gs-title")?.textContent?.trim() ?? ""
    })), title);
  if (matches.length !== 1) {
    throw new Error(`Expected one exact search row for ${label}, found ${matches.length}: ${JSON.stringify(matches)}`);
  }
  const row = page.locator(".global-search-hit").filter({
    has: page.locator(".gs-title").filter({ hasText: exactTitle })
  }).first();
  await row.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, row, `${label} search row`, 8);
  await row.click();
}

function exactTextRegex(text) {
  return new RegExp(`^${escapeRegex(text)}$`);
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertBuiltInCommands(page, fixture, viewport, artifactRoot) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("open pages");
  const openPagesHit = page.locator(".global-search-hit")
    .filter({ hasText: "打开所有页面" })
    .filter({ hasText: "命令" })
    .first();
  await openPagesHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open pages ${viewport.name}`, { expectResults: true, expectFilters: true });
  let rendered = await collectSearchRows(page);
  const openPagesRow = assertCommandRow(rendered, {
    title: "打开所有页面",
    previewIncludes: ["Lotion", "内置", "lotion.open-pages"]
  });
  const visualSnapshot = await captureSearchPopupSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "builtin-open-pages",
      query: "open pages",
      expectedTitle: "打开所有页面",
      hits: rendered.slice(0, 8)
    },
    page,
    viewport
  });
  await openPagesHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => /^(All pages|所有页面)$/.test(document.querySelector(".management-view h1")?.textContent?.trim() ?? ""),
    null,
    { timeout: 8_000 }
  );
  const openedPagesView = await page.evaluate(() => ({
    heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!/All pages|所有页面/.test(openedPagesView.activeTabText)) {
    throw new Error(`Built-in Open pages command did not activate an all-pages tab: ${JSON.stringify(openedPagesView)}`);
  }

  const openRecentCommand = await assertOpenRecentManagementCommand(page, viewport);
  const openSidebarSettingsCommand = await assertOpenSidebarSettingsCommand(page, viewport);
  const vimModeCommand = await assertToggleVimModeCommand(page, viewport);
  const rawMarkdownCommand = await assertToggleRawMarkdownCommand(page, viewport);
  const embedSourceCommand = await assertToggleEmbedSourceCommand(page, viewport);

  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("new page");
  const newPageHit = page.locator(".global-search-hit")
    .filter({ hasText: "新建页面" })
    .filter({ hasText: "命令" })
    .first();
  await newPageHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin new page ${viewport.name}`, { expectResults: true, expectFilters: true });
  rendered = await collectSearchRows(page);
  const newPageRow = assertCommandRow(rendered, {
    title: "新建页面",
    previewIncludes: ["Lotion", "内置", "lotion.new-page"]
  });
  const newPageActive = await focusCommandRowByKeyboard(page, "新建页面", `builtin new page ${viewport.name}`, "new page");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => /^(Untitled|未命名)$/.test(document.querySelector(".title-input")?.value?.trim() ?? ""),
    null,
    { timeout: 8_000 }
  );
  const createdPage = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!/Untitled|未命名/.test(createdPage.activeTabText)) {
    throw new Error(`Built-in New page command did not activate the created page tab: ${JSON.stringify(createdPage)}`);
  }

  await openGlobalSearch(page);
  await page.waitForFunction(
    () => {
      const firstTitle = document.querySelector(".global-search-hit .gs-title")?.textContent?.trim() ?? "";
      return /^(Untitled|未命名)$/.test(firstTitle);
    },
    null,
    { timeout: 8_000 }
  );
  await assertSearchLayout(page, `builtin recent created page ${viewport.name}`, { expectResults: true, expectFilters: false });
  const recentRows = await collectSearchRows(page);
  const firstRecent = recentRows[0];
  if (firstRecent?.badge !== "最近" || !/^(Untitled|未命名)$/.test(firstRecent.title)) {
    throw new Error(`Created page should be the first recent item: ${JSON.stringify(recentRows.slice(0, 4))}`);
  }
  if (!firstRecent.preview.includes("页面")) {
    throw new Error(`Created page recent row should be labeled as a page: ${JSON.stringify(firstRecent)}`);
  }

  const directFavoriteToggle = await assertPageStarFavoriteToggle(page, createdPage, viewport);
  const favoriteCommand = await assertFavoriteCurrentPageCommand(page, createdPage, viewport);
  const openFavoritesCommand = await assertOpenFavoritesManagementCommand(page, createdPage, viewport);
  const fullWidthCommand = await assertFullWidthCurrentPageCommand(page, createdPage, viewport);
  const smallTextCommand = await assertSmallTextCurrentPageCommand(page, createdPage, viewport);
  const openNewWindowCommand = await assertOpenCurrentInNewWindowCommand(page, createdPage, viewport);
  await closeSearchIfOpen(page);

  return {
    openPagesRow,
    openedPagesView,
    openRecentCommand,
    openSidebarSettingsCommand,
    vimModeCommand,
    rawMarkdownCommand,
    embedSourceCommand,
    newPageRow,
    newPageActive,
    createdPage,
    firstRecent,
    directFavoriteToggle,
    favoriteCommand,
    openFavoritesCommand,
    fullWidthCommand,
    smallTextCommand,
    openNewWindowCommand,
    visualSnapshot
  };
}

async function assertOpenRecentManagementCommand(page, viewport) {
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("recent");
  const openRecentHit = page.locator(".global-search-hit")
    .filter({ hasText: "打开最近访问" })
    .filter({ hasText: "命令" })
    .first();
  await openRecentHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open recent ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const openRecentRow = assertCommandRow(rendered, {
    title: "打开最近访问",
    previewIncludes: ["Lotion", "内置", "lotion.open-recent"]
  });
  await openRecentHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => /^(Recent|最近访问)$/.test(document.querySelector(".management-view h1")?.textContent?.trim() ?? ""),
    null,
    { timeout: 8_000 }
  );
  await assertWithinViewport(page, page.locator(".management-header").first(), `recent management header ${viewport.name}`, 8);
  await assertWithinViewport(page, page.locator(".manage-table").first(), `recent management table ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `recent management ${viewport.name}`, 8);
  const recentState = await page.evaluate(() => ({
    heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? "",
    searchOpen: Boolean(document.querySelector(".global-search")),
    rowCount: document.querySelectorAll(".manage-table tbody tr").length,
    firstRow: document.querySelector(".manage-table tbody tr")?.textContent?.trim() ?? ""
  }));
  if (!/Recent|最近访问/.test(recentState.activeTabText) || recentState.rowCount < 1 || recentState.searchOpen) {
    throw new Error(`Built-in Open recent command did not show the Recent management view: ${JSON.stringify(recentState)}`);
  }
  return { openRecentRow, recentState };
}

async function assertOpenSidebarSettingsCommand(page, viewport) {
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("settings");
  const openSettingsHit = page.locator(".global-search-hit")
    .filter({ hasText: "打开侧栏设置" })
    .filter({ hasText: "命令" })
    .first();
  await openSettingsHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open sidebar settings ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const openSettingsRow = assertCommandRow(rendered, {
    title: "打开侧栏设置",
    previewIncludes: ["Lotion", "内置", "lotion.open-sidebar-settings"]
  });
  await openSettingsHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => (document.querySelector("details.sidebar-settings")?.open ?? false) === true,
    null,
    { timeout: 8_000 }
  );
  await page.waitForFunction(
    () => document.activeElement?.classList.contains("sidebar-settings-summary") === true,
    null,
    { timeout: 8_000 }
  );
  await assertWithinViewport(page, page.locator(".sidebar-settings-summary").first(), `sidebar settings summary ${viewport.name}`, 4);
  await assertWithinViewport(page, page.locator(".sidebar-settings-panel .language-toggle").first(), `sidebar settings language ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `sidebar settings command ${viewport.name}`, 4);
  const settingsState = await page.evaluate(() => ({
    open: document.querySelector("details.sidebar-settings")?.open ?? false,
    focusedClass: document.activeElement?.className ?? "",
    summary: document.querySelector(".sidebar-settings-summary")?.textContent?.trim() ?? "",
    hasLanguage: Boolean(document.querySelector(".sidebar-settings-panel .language-toggle")),
    hasRawMode: Boolean(Array.from(document.querySelectorAll(".vim-toggle-label")).some((node) => /Raw|原文/.test(node.textContent ?? ""))),
    searchOpen: Boolean(document.querySelector(".global-search"))
  }));
  if (!settingsState.open || !settingsState.hasLanguage || !settingsState.hasRawMode || settingsState.searchOpen) {
    throw new Error(`Built-in Open sidebar settings command did not expose the settings panel: ${JSON.stringify(settingsState)}`);
  }
  if (!String(settingsState.focusedClass).includes("sidebar-settings-summary")) {
    throw new Error(`Built-in Open sidebar settings command did not focus the settings summary: ${JSON.stringify(settingsState)}`);
  }
  return { openSettingsRow, settingsState };
}

async function assertToggleRawMarkdownCommand(page, viewport) {
  const beforeState = await readRawMarkdownSettingsState(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("raw");
  const rawMarkdownHit = page.locator(".global-search-hit")
    .filter({ hasText: "切换原文模式" })
    .filter({ hasText: "命令" })
    .first();
  await rawMarkdownHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin toggle raw markdown ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const rawMarkdownRow = assertCommandRow(rendered, {
    title: "切换原文模式",
    previewIncludes: ["Lotion", "内置", "lotion.toggle-raw-markdown"]
  });
  await rawMarkdownHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (beforePersisted) => {
      const rawGroup = Array.from(document.querySelectorAll(".vim-toggle")).find((group) => {
        const label = group.querySelector(".vim-toggle-label")?.textContent ?? "";
        return /Raw|原文/.test(label);
      });
      const buttons = Array.from(rawGroup?.querySelectorAll("button") ?? []);
      const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));
      const persisted = window.localStorage.getItem("lotion.settings.rawMarkdown") === "1";
      return persisted !== beforePersisted && activeIndex === (persisted ? 1 : 0);
    },
    beforeState.persisted,
    { timeout: 8_000 }
  );
  const afterState = await readRawMarkdownSettingsState(page);
  await assertWithinViewport(page, page.locator(".vim-toggle").filter({ hasText: /Raw|原文/ }).first(), `raw markdown setting ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `raw markdown command ${viewport.name}`, 4);
  if (afterState.persisted === beforeState.persisted || afterState.activeIndex !== (afterState.persisted ? 1 : 0) || afterState.searchOpen) {
    throw new Error(`Raw markdown command did not toggle the visible setting: ${JSON.stringify({ beforeState, afterState })}`);
  }
  return { rawMarkdownRow, beforeState, afterState };
}

async function assertToggleVimModeCommand(page, viewport) {
  const beforeState = await readVimSettingsState(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("vim");
  const vimHit = page.locator(".global-search-hit")
    .filter({ hasText: "切换 Vim 模式" })
    .filter({ hasText: "命令" })
    .first();
  await vimHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin toggle vim mode ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const vimModeRow = assertCommandRow(rendered, {
    title: "切换 Vim 模式",
    previewIncludes: ["Lotion", "内置", "lotion.toggle-vim-mode"]
  });
  await vimHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (beforePersisted) => {
      const vimGroup = Array.from(document.querySelectorAll(".vim-toggle")).find((group) => {
        const label = group.querySelector(".vim-toggle-label")?.textContent ?? "";
        return /Vim/.test(label);
      });
      const buttons = Array.from(vimGroup?.querySelectorAll("button") ?? []);
      const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));
      const persisted = window.localStorage.getItem("lotion.settings.vimMode") === "1";
      return persisted !== beforePersisted && activeIndex === (persisted ? 1 : 0);
    },
    beforeState.persisted,
    { timeout: 8_000 }
  );
  const afterState = await readVimSettingsState(page);
  await assertWithinViewport(page, page.locator(".vim-toggle").filter({ hasText: /Vim/ }).first(), `vim mode setting ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `vim mode command ${viewport.name}`, 4);
  if (afterState.persisted === beforeState.persisted || afterState.activeIndex !== (afterState.persisted ? 1 : 0) || afterState.searchOpen) {
    throw new Error(`Vim mode command did not toggle the visible setting: ${JSON.stringify({ beforeState, afterState })}`);
  }
  return { vimModeRow, beforeState, afterState };
}

async function readVimSettingsState(page) {
  return page.evaluate(() => {
    const vimGroup = Array.from(document.querySelectorAll(".vim-toggle")).find((group) => {
      const label = group.querySelector(".vim-toggle-label")?.textContent ?? "";
      return /Vim/.test(label);
    });
    const buttons = Array.from(vimGroup?.querySelectorAll("button") ?? []);
    const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));
    return {
      persisted: window.localStorage.getItem("lotion.settings.vimMode") === "1",
      activeIndex,
      text: vimGroup?.textContent?.trim() ?? "",
      searchOpen: Boolean(document.querySelector(".global-search"))
    };
  });
}

async function readRawMarkdownSettingsState(page) {
  return page.evaluate(() => {
    const rawGroup = Array.from(document.querySelectorAll(".vim-toggle")).find((group) => {
      const label = group.querySelector(".vim-toggle-label")?.textContent ?? "";
      return /Raw|原文/.test(label);
    });
    const buttons = Array.from(rawGroup?.querySelectorAll("button") ?? []);
    const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));
    return {
      persisted: window.localStorage.getItem("lotion.settings.rawMarkdown") === "1",
      activeIndex,
      text: rawGroup?.textContent?.trim() ?? "",
      searchOpen: Boolean(document.querySelector(".global-search"))
    };
  });
}

async function assertToggleEmbedSourceCommand(page, viewport) {
  const beforeState = await readEmbedSourceSettingsState(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("source");
  const embedSourceHit = page.locator(".global-search-hit")
    .filter({ hasText: "切换嵌入源码显示" })
    .filter({ hasText: "命令" })
    .first();
  await embedSourceHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin toggle embed source ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const embedSourceRow = assertCommandRow(rendered, {
    title: "切换嵌入源码显示",
    previewIncludes: ["Lotion", "内置", "lotion.toggle-embed-source"]
  });
  await embedSourceHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (beforePersisted) => {
      const embedGroup = Array.from(document.querySelectorAll(".vim-toggle")).find((group) => {
        const label = group.querySelector(".vim-toggle-label")?.textContent ?? "";
        return /Embed|嵌入/.test(label);
      });
      const buttons = Array.from(embedGroup?.querySelectorAll("button") ?? []);
      const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));
      const persisted = window.localStorage.getItem("lotion.settings.showEmbedSource") === "1";
      return persisted !== beforePersisted && activeIndex === (persisted ? 1 : 0);
    },
    beforeState.persisted,
    { timeout: 8_000 }
  );
  const afterState = await readEmbedSourceSettingsState(page);
  await assertWithinViewport(page, page.locator(".vim-toggle").filter({ hasText: /Embed|嵌入/ }).first(), `embed source setting ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `embed source command ${viewport.name}`, 4);
  if (afterState.persisted === beforeState.persisted || afterState.activeIndex !== (afterState.persisted ? 1 : 0) || afterState.searchOpen) {
    throw new Error(`Embed source command did not toggle the visible setting: ${JSON.stringify({ beforeState, afterState })}`);
  }
  return { embedSourceRow, beforeState, afterState };
}

async function readEmbedSourceSettingsState(page) {
  return page.evaluate(() => {
    const embedGroup = Array.from(document.querySelectorAll(".vim-toggle")).find((group) => {
      const label = group.querySelector(".vim-toggle-label")?.textContent ?? "";
      return /Embed|嵌入/.test(label);
    });
    const buttons = Array.from(embedGroup?.querySelectorAll("button") ?? []);
    const activeIndex = buttons.findIndex((button) => button.classList.contains("active"));
    return {
      persisted: window.localStorage.getItem("lotion.settings.showEmbedSource") === "1",
      activeIndex,
      text: embedGroup?.textContent?.trim() ?? "",
      searchOpen: Boolean(document.querySelector(".global-search"))
    };
  });
}

async function assertPageStarFavoriteToggle(page, createdPage, viewport) {
  const expectedTitle = createdPage.titleInput;
  await closeSearchIfOpen(page);

  const favoriteToggle = page.locator(".page-action-bar .favorite-toggle").first();
  await favoriteToggle.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, favoriteToggle, `page star favorite toggle ${viewport.name}`, 8);
  await favoriteToggle.focus();
  const focused = await page.evaluate(() => document.activeElement?.classList.contains("favorite-toggle") ?? false);
  if (!focused) {
    throw new Error(`Page star favorite toggle did not receive keyboard focus in ${viewport.name}`);
  }

  const initialPressed = await favoriteToggle.getAttribute("aria-pressed");
  if (initialPressed !== "false") {
    throw new Error(`New page favorite star should start unpressed in ${viewport.name}: ${initialPressed}`);
  }

  await favoriteToggle.click();
  await page.waitForFunction(
    (title) => {
      const button = document.querySelector(".page-action-bar .favorite-toggle");
      const sections = Array.from(document.querySelectorAll(".nav-section"));
      const favorites = sections.find((section) => /^(Favorites|收藏)$/.test(section.querySelector(".section-heading")?.textContent?.trim() ?? ""));
      const labels = Array.from(favorites?.querySelectorAll(".nav-item-label") ?? []).map((node) => node.textContent?.trim() ?? "");
      return button?.getAttribute("aria-pressed") === "true" && labels.includes(title);
    },
    expectedTitle,
    { timeout: 8_000 }
  );

  const favoritedState = await favoriteSidebarState(page, expectedTitle);
  if (!favoritedState.hasExpected || favoritedState.pressed !== "true" || !favoritedState.toggleClass.includes("on")) {
    throw new Error(`Page star favorite toggle did not add the current page to Favorites: ${JSON.stringify(favoritedState)}`);
  }
  await assertWithinViewport(page, page.locator(".nav-section").filter({ hasText: favoritedState.heading }).first(), `direct favorite section ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `direct favorite add ${viewport.name}`, 4);

  await favoriteToggle.click();
  await page.waitForFunction(
    (title) => {
      const button = document.querySelector(".page-action-bar .favorite-toggle");
      const sections = Array.from(document.querySelectorAll(".nav-section"));
      const favorites = sections.find((section) => /^(Favorites|收藏)$/.test(section.querySelector(".section-heading")?.textContent?.trim() ?? ""));
      const labels = Array.from(favorites?.querySelectorAll(".nav-item-label") ?? []).map((node) => node.textContent?.trim() ?? "");
      return button?.getAttribute("aria-pressed") === "false" && !labels.includes(title);
    },
    expectedTitle,
    { timeout: 8_000 }
  );
  const unfavoritedState = await favoriteSidebarState(page, expectedTitle);
  if (unfavoritedState.hasExpected || unfavoritedState.pressed !== "false" || unfavoritedState.toggleClass.includes("on")) {
    throw new Error(`Page star favorite toggle did not remove the current page from Favorites: ${JSON.stringify(unfavoritedState)}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `direct favorite remove ${viewport.name}`, 4);

  return {
    favoritedState,
    unfavoritedState
  };
}

async function favoriteSidebarState(page, expectedTitle) {
  return page.evaluate((title) => {
    const button = document.querySelector(".page-action-bar .favorite-toggle");
    const sections = Array.from(document.querySelectorAll(".nav-section"));
    const favorites = sections.find((section) => /^(Favorites|收藏)$/.test(section.querySelector(".section-heading")?.textContent?.trim() ?? ""));
    const labels = Array.from(favorites?.querySelectorAll(".nav-item-label") ?? []).map((node) => node.textContent?.trim() ?? "");
    return {
      heading: favorites?.querySelector(".section-heading")?.textContent?.trim() ?? "",
      labels,
      hasExpected: labels.includes(title),
      pressed: button?.getAttribute("aria-pressed") ?? "",
      toggleClass: button?.getAttribute("class") ?? "",
      toggleTitle: button?.getAttribute("title") ?? ""
    };
  }, expectedTitle);
}

async function assertFavoriteCurrentPageCommand(page, createdPage, viewport) {
  const expectedTitle = createdPage.titleInput;
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("favorite");
  const favoriteHit = page.locator(".global-search-hit")
    .filter({ hasText: "收藏/取消收藏当前内容" })
    .filter({ hasText: "命令" })
    .first();
  await favoriteHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin favorite current page ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const favoriteRow = assertCommandRow(rendered, {
    title: "收藏/取消收藏当前内容",
    previewIncludes: ["Lotion", "内置", "lotion.toggle-favorite"]
  });
  await favoriteHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => {
      const sections = Array.from(document.querySelectorAll(".nav-section"));
      const favorites = sections.find((section) => /^(Favorites|收藏)$/.test(section.querySelector(".section-heading")?.textContent?.trim() ?? ""));
      const labels = Array.from(favorites?.querySelectorAll(".nav-item-label") ?? []).map((node) => node.textContent?.trim() ?? "");
      return labels.some((label) => label === title);
    },
    expectedTitle,
    { timeout: 8_000 }
  );
  const sidebarState = await page.evaluate((title) => {
    const sections = Array.from(document.querySelectorAll(".nav-section"));
    const favorites = sections.find((section) => /^(Favorites|收藏)$/.test(section.querySelector(".section-heading")?.textContent?.trim() ?? ""));
    return {
      heading: favorites?.querySelector(".section-heading")?.textContent?.trim() ?? "",
      labels: Array.from(favorites?.querySelectorAll(".nav-item-label") ?? []).map((node) => node.textContent?.trim() ?? ""),
      activeLabel: document.querySelector(".nav-section .nav-item.active .nav-item-label")?.textContent?.trim() ?? "",
      hasExpected: Array.from(favorites?.querySelectorAll(".nav-item-label") ?? []).some((node) => node.textContent?.trim() === title)
    };
  }, expectedTitle);
  if (!sidebarState.hasExpected) {
    throw new Error(`Favorite command did not update the sidebar Favorites section: ${JSON.stringify(sidebarState)}`);
  }
  await assertWithinViewport(page, page.locator(".nav-section").filter({ hasText: sidebarState.heading }).first(), `favorite section ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `favorite command sidebar ${viewport.name}`, 4);
  return { favoriteRow, sidebarState };
}

async function assertOpenFavoritesManagementCommand(page, createdPage, viewport) {
  const expectedTitle = createdPage.titleInput;
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("favorites");
  const favoritesHit = page.locator(".global-search-hit")
    .filter({ hasText: "打开收藏" })
    .filter({ hasText: "命令" })
    .first();
  await favoritesHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open favorites ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const favoritesRow = assertCommandRow(rendered, {
    title: "打开收藏",
    previewIncludes: ["Lotion", "内置", "lotion.open-favorites"]
  });
  await favoritesHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const management = page.locator(".management-view").first();
  await management.waitFor({ timeout: 8_000 });
  const heading = page.getByRole("heading", { name: /Favorites|收藏/ }).first();
  await heading.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, heading, `favorites management heading ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `favorites management ${viewport.name}`, 8);

  const favoritesTable = page.locator('[data-testid="favorites-management-view"]').first();
  await favoritesTable.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, favoritesTable, `favorites management table ${viewport.name}`, 8);
  const favoritePageRow = favoritesTable.locator("tbody tr").filter({ hasText: expectedTitle }).first();
  await favoritePageRow.waitFor({ timeout: 8_000 });
  const rowText = (await favoritePageRow.textContent())?.trim() ?? "";
  if (!rowText.includes("Page") && !rowText.includes("页面")) {
    throw new Error(`Favorites management row should label page favorites: ${rowText}`);
  }
  await favoritePageRow.click();
  await page.locator(".title-input").first().waitFor({ timeout: 8_000 });
  const openedTitle = await page.locator(".title-input").first().inputValue();
  if (openedTitle !== expectedTitle) {
    throw new Error(`Favorite management row did not reopen the page: expected ${expectedTitle}, saw ${openedTitle}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `favorites management navigation ${viewport.name}`, 8);
  return {
    favoritesRow,
    rowText,
    openedTitle
  };
}

async function assertFullWidthCurrentPageCommand(page, createdPage, viewport) {
  const expectedTitle = createdPage.titleInput;
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("full width");
  const fullWidthHit = page.locator(".global-search-hit")
    .filter({ hasText: "切换当前页面全宽" })
    .filter({ hasText: "命令" })
    .first();
  await fullWidthHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin full width current page ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const fullWidthRow = assertCommandRow(rendered, {
    title: "切换当前页面全宽",
    previewIncludes: ["Lotion", "内置", "lotion.toggle-full-width"]
  });
  await fullWidthHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForSelector(".page-editor.page-layout.full-width", { timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".page-header").first(), `full-width page header ${viewport.name}`, 8);
  await assertWithinViewport(page, page.locator(".title-input").first(), `full-width page title ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `full-width command page ${viewport.name}`, 8);
  const pageState = await page.evaluate(async (title) => {
    const activeTitle = document.querySelector(".title-input")?.value?.trim() ?? "";
    const fullWidthClass = document.querySelector(".page-editor.page-layout")?.classList.contains("full-width") ?? false;
    const matches = (await window.lotion.pages.list()).filter((candidate) => candidate.title === title);
    return {
      activeTitle,
      fullWidthClass,
      persistedFullWidth: matches.some((candidate) => candidate.fullWidth === true),
      matchingPages: matches.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        fullWidth: candidate.fullWidth === true
      }))
    };
  }, expectedTitle);
  if (pageState.activeTitle !== expectedTitle || !pageState.fullWidthClass || !pageState.persistedFullWidth) {
    throw new Error(`Full-width command did not toggle and persist the current page setting: ${JSON.stringify(pageState)}`);
  }
  return { fullWidthRow, pageState };
}

async function assertSmallTextCurrentPageCommand(page, createdPage, viewport) {
  const expectedTitle = createdPage.titleInput;
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("small text");
  const smallTextHit = page.locator(".global-search-hit")
    .filter({ hasText: "切换当前页面小字号" })
    .filter({ hasText: "命令" })
    .first();
  await smallTextHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin small text current page ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const smallTextRow = assertCommandRow(rendered, {
    title: "切换当前页面小字号",
    previewIncludes: ["Lotion", "内置", "lotion.toggle-small-text"]
  });
  await smallTextHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForSelector(".page-editor.page-layout.small-text", { timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".page-header").first(), `small-text page header ${viewport.name}`, 8);
  await assertWithinViewport(page, page.locator(".title-input").first(), `small-text page title ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `small-text command page ${viewport.name}`, 8);
  const pageState = await page.evaluate(async (title) => {
    const activeTitle = document.querySelector(".title-input")?.value?.trim() ?? "";
    const layout = document.querySelector(".page-editor.page-layout");
    const smallTextClass = layout?.classList.contains("small-text") ?? false;
    const fullWidthClass = layout?.classList.contains("full-width") ?? false;
    const matches = (await window.lotion.pages.list()).filter((candidate) => candidate.title === title);
    return {
      activeTitle,
      fullWidthClass,
      smallTextClass,
      persistedSmallText: matches.some((candidate) => candidate.smallText === true),
      matchingPages: matches.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        fullWidth: candidate.fullWidth === true,
        smallText: candidate.smallText === true
      }))
    };
  }, expectedTitle);
  if (pageState.activeTitle !== expectedTitle || !pageState.smallTextClass || !pageState.persistedSmallText) {
    throw new Error(`Small-text command did not toggle and persist the current page setting: ${JSON.stringify(pageState)}`);
  }
  if (!pageState.fullWidthClass) {
    throw new Error(`Small-text command should not clear the full-width page setting: ${JSON.stringify(pageState)}`);
  }
  return { smallTextRow, pageState };
}

async function assertOpenCurrentInNewWindowCommand(page, createdPage, viewport) {
  const expectedTitle = createdPage.titleInput;
  const context = page.context();
  let spawnedPage = null;
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("新窗口");
  const openNewWindowHit = page.locator(".global-search-hit")
    .filter({ hasText: "在新窗口打开当前项目" })
    .filter({ hasText: "命令" })
    .first();
  await openNewWindowHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open current in new window ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const openNewWindowRow = assertCommandRow(rendered, {
    title: "在新窗口打开当前项目",
    previewIncludes: ["Lotion", "内置", "lotion.open-current-in-new-window"]
  });
  const openNewWindowActive = await focusCommandRowByKeyboard(
    page,
    "在新窗口打开当前项目",
    `builtin open current in new window ${viewport.name}`,
    "新窗口"
  );
  if (sharedHarnessMode) {
    await closeSearchIfOpen(page);
    await assertNoDocumentHorizontalOverflow(page, `open-current-in-new-window shared original ${viewport.name}`, 8);
    return {
      openNewWindowRow,
      openNewWindowActive,
      sharedHarness: true,
      skippedWindowSpawn: "Secondary BrowserWindow creation is verified by standalone smoke:search-title-ui; aggregate children run under a shared CDP harness."
    };
  }
  const beforePages = rendererPages(context).length;
  const newPagePromise = context.waitForEvent("page", { timeout: 8_000 });
  await page.keyboard.press("Enter");
  try {
    spawnedPage = await newPagePromise;
    await waitForSpawnedPageReady(spawnedPage);
    await spawnedPage.locator(".title-input").waitFor({ timeout: 8_000 });
    const spawnedTitle = await spawnedPage.locator(".title-input").inputValue();
    const originalState = await page.evaluate(() => ({
      activeTitle: document.querySelector(".title-input")?.value?.trim() ?? "",
      searchOpen: Boolean(document.querySelector(".global-search")),
      activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
    }));
    const afterPages = rendererPages(context).length;
    if (spawnedTitle !== expectedTitle) {
      throw new Error(`New-window command opened the wrong page: ${JSON.stringify({ expectedTitle, spawnedTitle })}`);
    }
    if (originalState.activeTitle !== expectedTitle || originalState.searchOpen) {
      throw new Error(`New-window command changed the original window state unexpectedly: ${JSON.stringify(originalState)}`);
    }
    if (afterPages < beforePages + 1) {
      throw new Error(`New-window command did not create another renderer page: ${JSON.stringify({ beforePages, afterPages })}`);
    }
    const spawnedHeaderGeometry = await assertSpawnedHeaderWithinWindow(spawnedPage, viewport.name);
    await assertNoDocumentHorizontalOverflow(spawnedPage, `spawned page ${viewport.name}`, 8);
    await assertNoDocumentHorizontalOverflow(page, `open-current-in-new-window original ${viewport.name}`, 8);
    return {
      openNewWindowRow,
      openNewWindowActive,
      beforePages,
      afterPages,
      spawnedTitle,
      originalState,
      spawnedHeaderGeometry
    };
  } finally {
    if (spawnedPage && !spawnedPage.isClosed()) {
      await spawnedPage.close().catch(() => undefined);
    }
    await page.evaluate(() => window.localStorage.removeItem("lotion.nextWindowInit")).catch(() => undefined);
  }
}

async function assertBuiltInDatabaseAndPluginCommands(page, fixture, viewport, artifactRoot) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("open databases");
  const openDatabasesHit = page.locator(".global-search-hit")
    .filter({ hasText: "打开所有数据库" })
    .filter({ hasText: "命令" })
    .first();
  await openDatabasesHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open databases ${viewport.name}`, { expectResults: true, expectFilters: true });
  let rendered = await collectSearchRows(page);
  const openDatabasesRow = assertCommandRow(rendered, {
    title: "打开所有数据库",
    previewIncludes: ["Lotion", "内置", "lotion.open-databases"]
  });
  const visualSnapshot = await captureSearchPopupSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "builtin-open-databases",
      query: "open databases",
      expectedTitle: "打开所有数据库",
      hits: rendered.slice(0, 8)
    },
    page,
    viewport
  });
  await openDatabasesHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => /^(Manage databases|管理数据库)$/.test(document.querySelector(".management-view h1")?.textContent?.trim() ?? ""),
    null,
    { timeout: 8_000 }
  );
  await assertWithinViewport(page, page.locator(".management-header").first(), `all databases management header ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `all databases management ${viewport.name}`, 8);
  const openedDatabasesView = await page.evaluate(() => ({
    heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!/Manage databases|管理数据库/.test(openedDatabasesView.activeTabText)) {
    throw new Error(`Built-in Open databases command did not activate the database management tab: ${JSON.stringify(openedDatabasesView)}`);
  }

  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("open plugins");
  const openPluginsHit = page.locator(".global-search-hit")
    .filter({ hasText: "打开插件" })
    .filter({ hasText: "命令" })
    .first();
  await openPluginsHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin open plugins ${viewport.name}`, { expectResults: true, expectFilters: true });
  rendered = await collectSearchRows(page);
  const openPluginsRow = assertCommandRow(rendered, {
    title: "打开插件",
    previewIncludes: ["Lotion", "内置", "lotion.open-plugins"]
  });
  await openPluginsHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    () => /^(Plugins|插件)$/.test(document.querySelector(".management-view h1")?.textContent?.trim() ?? ""),
    null,
    { timeout: 8_000 }
  );
  await page.locator(".plugin-manager").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".plugin-summary-grid").first(), `plugins management summary ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `plugins management ${viewport.name}`, 8);
  const openedPluginsView = await page.evaluate(() => ({
    heading: document.querySelector(".management-view h1")?.textContent?.trim() ?? "",
    pluginRows: document.querySelectorAll(".plugin-row").length,
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (!/Plugins|插件/.test(openedPluginsView.activeTabText) || openedPluginsView.pluginRows < 1) {
    throw new Error(`Built-in Open plugins command did not show the plugin manager: ${JSON.stringify(openedPluginsView)}`);
  }

  const advancedSearchCommand = await assertAdvancedSearchPluginCommand(page, viewport);
  const githubBackupCommand = await assertGitHubBackupPluginCommand(page, viewport);
  const gitSyncCommand = await assertGitSyncPluginCommand(page, viewport);
  const gitSyncBackupNowCommand = await assertGitSyncBackupNowCommand(page, viewport);
  const gitSyncFetchStatusCommand = await assertGitSyncFetchStatusCommand(page, viewport);
  const gitSyncInitCommand = await assertGitSyncNotificationCommand(page, viewport, {
    query: "initialize git",
    title: "Initialize Git repo",
    id: "git-sync.init-repository",
    toastPattern: /Git repository:/,
    label: "initialize"
  });
  const gitSyncRemoteTestCommand = await assertGitSyncNotificationCommand(page, viewport, {
    query: "test remote",
    title: "Test Git remote access",
    id: "git-sync.test-remote",
    toastPattern: /Git remote test:/,
    label: "remote test"
  });
  const gitSyncPullCommand = await assertGitSyncNotificationCommand(page, viewport, {
    query: "pull git",
    title: "Pull Git remote",
    id: "git-sync.pull",
    toastPattern: /Git pull:/,
    label: "pull"
  });
  const gitSyncPushCommand = await assertGitSyncNotificationCommand(page, viewport, {
    query: "push git",
    title: "Push Git remote",
    id: "git-sync.push",
    toastPattern: /Git push:/,
    label: "push"
  });
  const gitSyncSquashSafetyCommand = await assertGitSyncSquashSafetyCommand(page, viewport);

  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("new database");
  const newDatabaseHit = page.locator(".global-search-hit")
    .filter({ hasText: "新建数据库" })
    .filter({ hasText: "命令" })
    .first();
  await newDatabaseHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `builtin new database ${viewport.name}`, { expectResults: true, expectFilters: true });
  rendered = await collectSearchRows(page);
  const newDatabaseRow = assertCommandRow(rendered, {
    title: "新建数据库",
    previewIncludes: ["Lotion", "内置", "lotion.new-database"]
  });
  const newDatabaseActive = await focusCommandRowByKeyboard(page, "新建数据库", `builtin new database ${viewport.name}`, "new database");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const picker = page.locator(".db-template-dialog").first();
  await picker.waitFor({ timeout: 8_000 });
  await picker.getByText("新建数据库").first().waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, picker, `new database template picker ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `new database template picker ${viewport.name}`, 8);
  const templatePicker = await page.evaluate(() => ({
    heading: document.querySelector(".db-template-dialog h2")?.textContent?.trim() ?? "",
    cards: document.querySelectorAll(".db-template-card").length
  }));
  if (templatePicker.cards < 1) {
    throw new Error(`Database template picker should expose at least one template: ${JSON.stringify(templatePicker)}`);
  }
  await picker.getByRole("button", { name: "关闭" }).click();
  await picker.waitFor({ state: "detached", timeout: 5_000 });

  return {
    openDatabasesRow,
    openedDatabasesView,
    openPluginsRow,
    openedPluginsView,
    advancedSearchCommand,
    githubBackupCommand,
    gitSyncCommand,
    gitSyncBackupNowCommand,
    gitSyncFetchStatusCommand,
    gitSyncInitCommand,
    gitSyncRemoteTestCommand,
    gitSyncPullCommand,
    gitSyncPushCommand,
    gitSyncSquashSafetyCommand,
    newDatabaseRow,
    newDatabaseActive,
    templatePicker,
    visualSnapshot
  };
}

async function assertGitSyncBackupNowCommand(page, viewport) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("backup now");
  const backupHit = page.locator(".global-search-hit")
    .filter({ hasText: "Backup Now" })
    .filter({ hasText: "命令" })
    .first();
  await backupHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin Git Sync backup command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const backupRow = assertCommandRow(rendered, {
    title: "Backup Now",
    previewIncludes: ["Sync", "Git Sync", "git-sync.backup-now"]
  });
  await backupHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const toast = page.locator(".notification-toast")
    .filter({ hasText: /Backup|backup/ })
    .first();
  await toast.waitFor({ timeout: 10_000 });
  await assertWithinViewport(page, toast, `Git Sync backup toast ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `Git Sync backup toast ${viewport.name}`, 8);
  const state = await page.evaluate(() => {
    const toast = Array.from(document.querySelectorAll(".notification-toast"))
      .find((candidate) => /Backup|backup/.test(candidate.textContent ?? ""));
    return {
      text: toast?.textContent?.trim() ?? "",
      className: toast?.className ?? "",
      searchOpen: Boolean(document.querySelector(".global-search")),
      modalOpen: Boolean(Array.from(document.querySelectorAll(".plugin-modal"))
        .some((candidate) => /Git Sync/.test(candidate.textContent ?? "")))
    };
  });
  if (
    !/Backup|backup/.test(state.text) ||
    !/(info|error)/.test(state.className) ||
    state.searchOpen ||
    state.modalOpen
  ) {
    throw new Error(`Git backup command did not produce a notification-only result: ${JSON.stringify(state)}`);
  }
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await toast.waitFor({ state: "detached", timeout: 8_000 });
  return { backupRow, state };
}

async function assertGitSyncFetchStatusCommand(page, viewport) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("fetch git status");
  const fetchHit = page.locator(".global-search-hit")
    .filter({ hasText: "Fetch Git remote status" })
    .filter({ hasText: "命令" })
    .first();
  await fetchHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin Git Sync fetch command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const fetchRow = assertCommandRow(rendered, {
    title: "Fetch Git remote status",
    previewIncludes: ["Sync", "Git Sync", "git-sync.fetch-status"]
  });
  await fetchHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const toast = page.locator(".notification-toast")
    .filter({ hasText: "Git remote status:" })
    .first();
  await toast.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, toast, `Git Sync fetch status toast ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `Git Sync fetch status toast ${viewport.name}`, 8);
  const state = await page.evaluate(() => {
    const toast = Array.from(document.querySelectorAll(".notification-toast"))
      .find((candidate) => /Git remote status:/.test(candidate.textContent ?? ""));
    return {
      text: toast?.textContent?.trim() ?? "",
      className: toast?.className ?? "",
      searchOpen: Boolean(document.querySelector(".global-search")),
      modalOpen: Boolean(Array.from(document.querySelectorAll(".plugin-modal"))
        .some((candidate) => /Git Sync/.test(candidate.textContent ?? "")))
    };
  });
  if (
    !/Git remote status:/.test(state.text) ||
    !/(info|error)/.test(state.className) ||
    state.searchOpen ||
    state.modalOpen
  ) {
    throw new Error(`Git fetch-status command did not produce a notification-only result: ${JSON.stringify(state)}`);
  }
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await toast.waitFor({ state: "detached", timeout: 8_000 });
  return { fetchRow, state };
}

async function assertGitSyncNotificationCommand(page, viewport, options) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill(options.query);
  const commandHit = page.locator(".global-search-hit")
    .filter({ hasText: options.title })
    .filter({ hasText: "命令" })
    .first();
  await commandHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin Git Sync ${options.label} command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const commandRow = assertCommandRow(rendered, {
    title: options.title,
    previewIncludes: ["Sync", "Git Sync", options.id]
  });
  await commandHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const toast = page.locator(".notification-toast")
    .filter({ hasText: options.toastPattern })
    .first();
  await toast.waitFor({ timeout: 10_000 });
  await assertWithinViewport(page, toast, `Git Sync ${options.label} toast ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `Git Sync ${options.label} toast ${viewport.name}`, 8);
  const state = await page.evaluate((source) => {
    const pattern = new RegExp(source);
    const toast = Array.from(document.querySelectorAll(".notification-toast"))
      .find((candidate) => pattern.test(candidate.textContent ?? ""));
    return {
      text: toast?.textContent?.trim() ?? "",
      className: toast?.className ?? "",
      searchOpen: Boolean(document.querySelector(".global-search")),
      modalOpen: Boolean(Array.from(document.querySelectorAll(".plugin-modal"))
        .some((candidate) => /Git Sync/.test(candidate.textContent ?? "")))
    };
  }, options.toastPattern.source);
  if (
    !options.toastPattern.test(state.text) ||
    !/(info|error)/.test(state.className) ||
    state.searchOpen ||
    state.modalOpen
  ) {
    throw new Error(`Git Sync ${options.label} command did not produce a notification-only result: ${JSON.stringify(state)}`);
  }
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await toast.waitFor({ state: "detached", timeout: 8_000 });
  return { commandRow, state };
}

async function assertGitSyncSquashSafetyCommand(page, viewport) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("squash safety");
  const safetyHit = page.locator(".global-search-hit")
    .filter({ hasText: "Check Git squash safety" })
    .filter({ hasText: "命令" })
    .first();
  await safetyHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin Git Sync squash command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const safetyRow = assertCommandRow(rendered, {
    title: "Check Git squash safety",
    previewIncludes: ["Sync", "Git Sync", "git-sync.squash-preflight"]
  });
  await safetyHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const toast = page.locator(".notification-toast")
    .filter({ hasText: "Git squash safety:" })
    .first();
  await toast.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, toast, `Git Sync squash safety toast ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `Git Sync squash safety toast ${viewport.name}`, 8);
  const state = await page.evaluate(() => {
    const toast = Array.from(document.querySelectorAll(".notification-toast"))
      .find((candidate) => /Git squash safety:/.test(candidate.textContent ?? ""));
    return {
      text: toast?.textContent?.trim() ?? "",
      className: toast?.className ?? "",
      searchOpen: Boolean(document.querySelector(".global-search")),
      modalOpen: Boolean(Array.from(document.querySelectorAll(".plugin-modal"))
        .some((candidate) => /Git Sync/.test(candidate.textContent ?? "")))
    };
  });
  if (
    !/Git squash safety:/.test(state.text) ||
    !/(info|warn)/.test(state.className) ||
    state.searchOpen ||
    state.modalOpen
  ) {
    throw new Error(`Git squash safety command did not produce a safe notification-only result: ${JSON.stringify(state)}`);
  }
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await toast.waitFor({ state: "detached", timeout: 8_000 });
  return { safetyRow, state };
}

async function assertGitSyncPluginCommand(page, viewport) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("git sync");
  const gitSyncHit = page.locator(".global-search-hit")
    .filter({ hasText: "Open Git Sync" })
    .filter({ hasText: "命令" })
    .first();
  await gitSyncHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin Git Sync command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const gitSyncRow = assertCommandRow(rendered, {
    title: "Open Git Sync",
    previewIncludes: ["Sync", "Git Sync", "git-sync.open"]
  });
  await gitSyncHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const modal = page.locator(".plugin-modal").filter({ hasText: "Git Sync" }).first();
  await modal.locator(".git-sync-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, `Git Sync command modal ${viewport.name}`, 8);
  await assertWithinViewport(page, modal.locator(".git-sync-header").first(), `Git Sync command header ${viewport.name}`, 8);
  await assertWithinViewport(page, modal.locator(".git-sync-form").first(), `Git Sync command form ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `Git Sync command modal ${viewport.name}`, 8);
  const modalState = await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll(".plugin-modal")).find((candidate) => /Git Sync/.test(candidate.textContent ?? ""));
    return {
      searchOpen: Boolean(document.querySelector(".global-search")),
      title: modal?.querySelector(".dialog-header h2")?.textContent?.trim() ?? "",
      panelTitle: modal?.querySelector(".git-sync-panel h3")?.textContent?.trim() ?? "",
      status: modal?.querySelector(".git-sync-pill")?.textContent?.trim() ?? "",
      hasRemoteInput: Boolean(Array.from(modal?.querySelectorAll("label") ?? []).some((label) => /Remote repository URL/.test(label.textContent ?? ""))),
      hasBranchInput: Boolean(Array.from(modal?.querySelectorAll("label") ?? []).some((label) => /Branch/.test(label.textContent ?? ""))),
      hasInit: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Initialize repo$/.test(button.textContent?.trim() ?? ""))),
      hasBackup: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Backup now$/.test(button.textContent?.trim() ?? ""))),
      hasRemoteTest: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Test remote$/.test(button.textContent?.trim() ?? ""))),
      hasFetch: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Fetch status$/.test(button.textContent?.trim() ?? ""))),
      hasPull: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Pull$/.test(button.textContent?.trim() ?? ""))),
      hasPush: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Push$/.test(button.textContent?.trim() ?? ""))),
      statusItems: Array.from(modal?.querySelectorAll(".git-sync-status-item") ?? []).map((item) => item.textContent?.trim() ?? "")
    };
  });
  if (
    modalState.searchOpen ||
    modalState.title !== "Git Sync" ||
    modalState.panelTitle !== "Git Sync" ||
    !modalState.status ||
    !modalState.hasRemoteInput ||
    !modalState.hasBranchInput ||
    !modalState.hasInit ||
    !modalState.hasBackup ||
    !modalState.hasRemoteTest ||
    !modalState.hasFetch ||
    !modalState.hasPull ||
    !modalState.hasPush ||
    modalState.statusItems.length < 6
  ) {
    throw new Error(`Git Sync command did not expose a usable plugin modal: ${JSON.stringify(modalState)}`);
  }
  await modal.getByRole("button", { name: "Close" }).click();
  await modal.waitFor({ state: "detached", timeout: 5_000 });
  return { gitSyncRow, modalState };
}

async function assertAdvancedSearchPluginCommand(page, viewport) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("advanced");
  const advancedSearchHit = page.locator(".global-search-hit")
    .filter({ hasText: "Open Advanced Search" })
    .filter({ hasText: "命令" })
    .first();
  await advancedSearchHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin advanced search command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const advancedSearchRow = assertCommandRow(rendered, {
    title: "Open Advanced Search",
    previewIncludes: ["Search", "Advanced Search", "advanced-search.open"]
  });
  await advancedSearchHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const modal = page.locator(".plugin-modal").filter({ hasText: "Advanced Search" }).first();
  await modal.locator(".advanced-search-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, `advanced search command modal ${viewport.name}`, 8);
  await assertWithinViewport(page, modal.locator(".advanced-search-controls").first(), `advanced search command controls ${viewport.name}`, 8);
  await assertWithinViewport(page, modal.locator(".advanced-search-query-row").first(), `advanced search command query ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `advanced search command modal ${viewport.name}`, 8);
  const modalState = await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll(".plugin-modal")).find((candidate) => /Advanced Search/.test(candidate.textContent ?? ""));
    return {
      searchOpen: Boolean(document.querySelector(".global-search")),
      title: modal?.querySelector(".dialog-header h2")?.textContent?.trim() ?? "",
      status: modal?.querySelector(".advanced-search-status")?.textContent?.trim() ?? "",
      hasRebuild: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /Rebuild index/.test(button.textContent ?? ""))),
      hasQueryInput: Boolean(modal?.querySelector(".advanced-search-query-row input")),
      hasResults: Boolean(modal?.querySelector(".advanced-search-results"))
    };
  });
  if (modalState.searchOpen || !modalState.title || !modalState.status || !modalState.hasRebuild || !modalState.hasQueryInput || !modalState.hasResults) {
    throw new Error(`Advanced Search command did not expose a usable plugin modal: ${JSON.stringify(modalState)}`);
  }
  await modal.getByRole("button", { name: "Close" }).click();
  await modal.waitFor({ state: "detached", timeout: 5_000 });
  return { advancedSearchRow, modalState };
}

async function assertGitHubBackupPluginCommand(page, viewport) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill("github backup");
  const githubBackupHit = page.locator(".global-search-hit")
    .filter({ hasText: "Open GitHub Backup" })
    .filter({ hasText: "命令" })
    .first();
  await githubBackupHit.waitFor({ timeout: 8_000 });
  await assertSearchLayout(page, `plugin GitHub Backup command ${viewport.name}`, { expectResults: true, expectFilters: true });
  const rendered = await collectSearchRows(page);
  const githubBackupRow = assertCommandRow(rendered, {
    title: "Open GitHub Backup",
    previewIncludes: ["Sync", "GitHub Backup", "github-backup.open"]
  });
  await githubBackupHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  const modal = page.locator(".plugin-modal").filter({ hasText: "GitHub Backup" }).first();
  await modal.locator('[data-testid="github-backup-panel"]').waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, `GitHub Backup command modal ${viewport.name}`, 8);
  await assertWithinViewport(page, modal.locator(".github-backup-hero").first(), `GitHub Backup command hero ${viewport.name}`, 8);
  await assertWithinViewport(page, modal.locator(".github-backup-form").first(), `GitHub Backup command form ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `GitHub Backup command modal ${viewport.name}`, 8);
  const modalState = await page.evaluate(() => {
    const modal = Array.from(document.querySelectorAll(".plugin-modal")).find((candidate) => /GitHub Backup/.test(candidate.textContent ?? ""));
    return {
      searchOpen: Boolean(document.querySelector(".global-search")),
      title: modal?.querySelector(".dialog-header h2")?.textContent?.trim() ?? "",
      status: modal?.querySelector(".github-backup-status")?.textContent?.trim() ?? "",
      hasAdapterSelect: Boolean(modal?.querySelector('[aria-label="GitHub backup adapter"]')),
      hasRepositoryInput: Boolean(modal?.querySelector('[aria-label="GitHub repository"]')),
      hasBranchInput: Boolean(modal?.querySelector('[aria-label="GitHub branch"]')),
      hasPathInput: Boolean(modal?.querySelector('[aria-label="GitHub backup path"]')),
      hasRunBackup: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /Run backup/.test(button.textContent ?? ""))),
      historyLabel: modal?.querySelector('[aria-label="GitHub page history"]')?.getAttribute("aria-label") ?? "",
      hasHistoryPanel: Boolean(modal?.querySelector(".github-backup-history")),
      historyHeading: modal?.querySelector(".github-backup-history h4")?.textContent?.trim() ?? "",
      hasRefresh: Boolean(Array.from(modal?.querySelectorAll("button") ?? []).some((button) => /^Refresh$/.test(button.textContent?.trim() ?? "")))
    };
  });
  if (
    modalState.searchOpen ||
    !/GitHub Backup/.test(modalState.title) ||
    !modalState.status ||
    !modalState.hasAdapterSelect ||
    !modalState.hasRepositoryInput ||
    !modalState.hasBranchInput ||
    !modalState.hasPathInput ||
    !modalState.hasRunBackup ||
    modalState.historyLabel !== "GitHub page history" ||
    !modalState.hasHistoryPanel ||
    modalState.historyHeading !== "Page history" ||
    !modalState.hasRefresh
  ) {
    throw new Error(`GitHub Backup command did not expose a usable plugin modal: ${JSON.stringify(modalState)}`);
  }
  await modal.getByRole("button", { name: "Close" }).click();
  await modal.waitFor({ state: "detached", timeout: 5_000 });
  return { githubBackupRow, modalState };
}

async function collectSearchRows(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".global-search-hit")).map((hit) => ({
    active: hit.classList.contains("active"),
    badge: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
    icon: hit.querySelector(".gs-entity-icon")?.textContent?.trim() ?? "",
    title: hit.querySelector(".gs-title")?.textContent?.trim() ?? "",
    path: hit.querySelector(".global-search-path")?.textContent?.trim() ?? "",
    preview: hit.querySelector(".global-search-preview")?.textContent?.trim() ?? "",
    type: hit.getAttribute("data-search-item-type") ?? ""
  })));
}

function rendererPages(context) {
  return context.pages().filter((candidate) => !candidate.isClosed());
}

async function waitForSpawnedPageReady(targetPage) {
  await targetPage.waitForLoadState("domcontentloaded");
  await targetPage.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 8_000 });
}

async function assertSpawnedHeaderWithinWindow(targetPage, viewportName) {
  const metrics = await targetPage.evaluate(() => {
    const header = document.querySelector(".page-header");
    const title = document.querySelector(".title-input");
    const headerRect = header?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const rectJson = (rect) => rect ? {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
      height: rect.height
    } : null;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: rectJson(headerRect),
      title: rectJson(titleRect)
    };
  });
  if (!metrics.header || !metrics.title) {
    throw new Error(`Spawned page missing header/title for ${viewportName}: ${JSON.stringify(metrics)}`);
  }
  for (const [key, rect] of Object.entries({ header: metrics.header, title: metrics.title })) {
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Spawned page ${key} has invalid geometry for ${viewportName}: ${JSON.stringify(metrics)}`);
    }
    if (
      rect.left < -8 ||
      rect.top < -8 ||
      rect.right > metrics.viewport.width + 8 ||
      rect.bottom > metrics.viewport.height + 8
    ) {
      throw new Error(`Spawned page ${key} is outside viewport for ${viewportName}: ${JSON.stringify(metrics)}`);
    }
  }
  return metrics;
}

function assertCommandRow(rows, expected) {
  const row = rows.find((candidate) => candidate.title === expected.title);
  if (!row) throw new Error(`Missing command search row ${expected.title}: ${JSON.stringify(rows)}`);
  if (row.badge !== "命令") throw new Error(`Command row has wrong badge: ${JSON.stringify(row)}`);
  for (const text of expected.previewIncludes) {
    if (!row.preview.includes(text)) {
      throw new Error(`Command row preview missing ${JSON.stringify(text)}: ${JSON.stringify(row)}`);
    }
  }
  return row;
}

function assertTagRow(rows, fixture) {
  const row = rows.find((candidate) => candidate.title === fixture.tagTitle && candidate.type === "tag");
  if (!row) throw new Error(`Missing tag search row ${fixture.tagTitle}: ${JSON.stringify(rows)}`);
  if (row.badge !== "标签") throw new Error(`Tag row has wrong badge: ${JSON.stringify(row)}`);
  if (!row.preview.includes("标签页") || !row.preview.includes(`${fixture.tagTotalCount} 个项目`)) {
    throw new Error(`Tag row preview should summarize item count: ${JSON.stringify(row)}`);
  }
  if (!row.preview.includes(`页面 ${fixture.tagPageCount}`) || !row.preview.includes(`数据库 ${fixture.tagDatabaseCount}`)) {
    throw new Error(`Tag row preview should summarize page/database counts: ${JSON.stringify(row)}`);
  }
  return row;
}

async function captureSearchPopupSnapshot({ artifactRoot, fixture, metadata, page, viewport }) {
  const popup = page.locator(".global-search").first();
  await assertWithinViewport(page, popup, `search snapshot ${metadata.phase} ${viewport.name}`, 8);
  const rows = await collectSearchRows(page);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: popup,
    metadata: {
      pageId: fixture.pageId,
      pageTitle: fixture.pageTitle,
      visibleRows: rows.slice(0, 12),
      ...metadata
    },
    name: `search-quick-switcher-${metadata.phase}-${viewport.name}`,
    page,
    viewport
  });
  return {
    phase: metadata.phase,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: Number(snapshot.rect.height.toFixed(1)),
    width: Number(snapshot.rect.width.toFixed(1))
  };
}

function assertRecentRow(rows, expected) {
  const row = rows.find((candidate) => candidate.title === expected.title);
  if (!row) throw new Error(`Missing recent search row ${expected.title}: ${JSON.stringify(rows)}`);
  if (row.badge !== "最近") throw new Error(`Recent row has wrong badge: ${JSON.stringify(row)}`);
  if (row.icon !== expected.icon) {
    throw new Error(`Recent row icon mismatch: ${JSON.stringify({ expected, row })}`);
  }
  for (const text of expected.previewIncludes) {
    if (!row.preview.includes(text)) {
      throw new Error(`Recent row preview missing ${JSON.stringify(text)}: ${JSON.stringify(row)}`);
    }
  }
}

async function createSearchTitleFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-search-title-${safeViewport}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `7918b506-cf94-4bdd-99bb-47da14a7607f_${safeViewport}`;
  const pageTitle = "[完成] createDeepDive";
  const pageIcon = "✅";
  const query = "createDeepDive";
  const tagName = "Focus";
  const tagTitle = `#${tagName}`;
  const tagPageCount = 1;
  const tagDatabaseCount = 1;
  const tagTotalCount = tagPageCount + tagDatabaseCount;
  const recentPageId = `pg_recent_switcher_page_${safeViewport}`;
  const recentPageTitle = "Recent Switcher Page";
  const recentPageIcon = "📄";
  const recentDatabaseId = `db_recent_switcher_${safeViewport}`;
  const recentDatabaseName = "Recent Switcher Database";
  const recentDatabaseIcon = "🗃️";
  const recentRowId = `row_recent_switcher_${safeViewport}`;
  const recentRowTitle = "Recent Switcher Row";
  const recentRowIcon = "🧭";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const entitiesFolder = databaseFolderName(ENTITIES_DATABASE_ID, "entities");
  const recentDatabaseFolder = databaseFolderName(recentDatabaseId, recentDatabaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const entitiesDir = join(root, "databases", "system", entitiesFolder);
  const recentDatabaseDir = join(root, "databases", "user", recentDatabaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const recentPagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(recentPageId, recentPageTitle));
  const recentRowPageFile = pageMarkdownFileName(recentRowId, recentRowTitle);
  const recentRowPagePath = workspacePath("user", recentDatabaseFolder, "pages", recentRowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(entitiesDir, "views"), { recursive: true });
  await mkdir(join(recentDatabaseDir, "pages"), { recursive: true });
  await mkdir(join(recentDatabaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_search_title",
    name: "Search Title Smoke",
    pages: [pageId, recentPageId],
    databases: [recentDatabaseId],
    systemDatabases: [PAGES_DATABASE_ID, ENTITIES_DATABASE_ID],
    recents: [
      { type: "page", id: recentPageId, at: "2026-01-01T00:03:00.000Z", count: 1 },
      { type: "database", id: recentDatabaseId, at: "2026-01-01T00:02:00.000Z", count: 1 },
      {
        type: "row_page",
        databaseId: recentDatabaseId,
        rowId: recentRowId,
        title: recentRowTitle,
        icon: `emoji:${recentRowIcon}`,
        at: "2026-01-01T00:01:00.000Z",
        count: 1
      }
    ]
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
      id: recentPageId,
      title: recentPageTitle,
      now,
      icon: `emoji:${recentPageIcon}`,
      path: ["Recent Bench", recentPageTitle],
      bodyPath: recentPagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nSearch title label regression body.\n`, "utf8");
  await writeFile(join(root, recentPagePath), `# ${recentPageTitle}\n\nRecent quick switcher page body.\n`, "utf8");

  await writeJson(join(recentDatabaseDir, "schema.json"), {
    id: recentDatabaseId,
    name: recentDatabaseName,
    icon: `emoji:${recentDatabaseIcon}`,
    tags: [tagName],
    path: ["Recent Bench", recentDatabaseName],
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
  await writeJson(join(recentDatabaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(recentDatabaseId, ["title", "notes"]));
  await writeCsv(join(recentDatabaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "row_icon",
    "page_file",
    "notes"
  ], [{
    id: recentRowId,
    created_time: now,
    updated_time: now,
    title: recentRowTitle,
    row_icon: `emoji:${recentRowIcon}`,
    page_file: recentRowPageFile,
    notes: "Recent row page target"
  }]);
  await writeFile(join(root, recentRowPagePath), `# ${recentRowTitle}\n\nRecent quick switcher row page body.\n`, "utf8");

  await writeJson(join(entitiesDir, "schema.json"), entitiesSchema(now));
  await writeJson(join(entitiesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(ENTITIES_DATABASE_ID, ["kind", "title", "path", "icon"]));
  await writeCsv(join(entitiesDir, "data.csv"), entitiesFieldIds(), [
    entityRecord({
      id: pageId,
      kind: "page",
      title: pageTitle,
      icon: `emoji:${pageIcon}`,
      path: ["Bench", pageTitle],
      bodyPath: pagePath
    }),
    entityRecord({
      id: recentPageId,
      kind: "page",
      title: recentPageTitle,
      icon: `emoji:${recentPageIcon}`,
      path: ["Recent Bench", recentPageTitle],
      bodyPath: recentPagePath
    }),
    entityRecord({
      id: recentDatabaseId,
      kind: "database",
      title: recentDatabaseName,
      icon: `emoji:${recentDatabaseIcon}`,
      path: ["Recent Bench", recentDatabaseName],
      bodyPath: ""
    }),
    entityRecord({
      id: recentRowId,
      kind: "row",
      title: recentRowTitle,
      icon: `emoji:${recentRowIcon}`,
      path: ["Recent Bench", recentDatabaseName, recentRowTitle],
      bodyPath: recentRowPagePath,
      databaseId: recentDatabaseId,
      rowId: recentRowId
    })
  ]);

  return {
    root,
    pageId,
    pageTitle,
    pageIcon,
    query,
    tagDatabaseCount,
    tagName,
    tagPageCount,
    tagTitle,
    tagTotalCount,
    recentPageTitle,
    recentPageIcon,
    recentDatabaseName,
    recentDatabaseIcon,
    recentRowTitle,
    recentRowIcon
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

function entitiesFieldIds() {
  return [
    "id",
    "kind",
    "title",
    "icon",
    "path",
    "parent_id",
    "database_id",
    "row_id",
    "body_path",
    "source_notion_hash"
  ];
}

function pageRecord({ id, title, now, icon, path, bodyPath, tags = [] }) {
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
    tags: tags.join(";"),
    date: "",
    url: "",
    full_width: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
  };
}

function entityRecord({ id, kind, title, icon, path, bodyPath, databaseId = "", rowId = "" }) {
  return {
    id,
    kind,
    title,
    icon,
    path: serializePathValue(path),
    parent_id: "",
    database_id: databaseId || (kind === "page" ? PAGES_DATABASE_ID : ""),
    row_id: rowId || (kind === "page" ? id : ""),
    body_path: bodyPath,
    source_notion_hash: ""
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

function entitiesSchema(now) {
  return {
    id: ENTITIES_DATABASE_ID,
    name: "entities",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "title", name: "Title", type: "text" },
      { id: "icon", name: "Icon", type: "text" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "database_id", name: "Database ID", type: "text", system: true },
      { id: "row_id", name: "Row ID", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true },
      { id: "source_notion_hash", name: "Source Notion hash", type: "text", system: true }
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
