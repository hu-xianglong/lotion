#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertElementSnapshotBaseline,
  assertHarnessViewportCoverage,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  nextAnimationFrame,
  openPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";
import { assertNavigationAnchorArtifactContract } from "./lib/navigation-anchor-artifacts.mjs";

const result = await withLotionUIHarness("navigation-anchor", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createNavigationAnchorFixture(viewport.name);
    await openWorkspace(fixture.root);
    const viewportResult = await exerciseNavigationAnchor(page, fixture, viewport, artifactRoot);
    viewports.push(viewportResult);
  });
  const summary = { viewports, status: "passed" };
  summary.artifactContract = await assertNavigationAnchorArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

assertHarnessViewportCoverage(result);
console.log(JSON.stringify(result, null, 2));

async function exerciseNavigationAnchor(page, fixture, viewport, artifactRoot) {
  await openPageAndWait(page, fixture.secondPageId, fixture.secondTitle);
  await openPageAndWait(page, fixture.longPageId, fixture.longTitle);
  await waitForPageMarkdown(page, fixture.longPageId, "Anchor paragraph 180", "long page fixture markdown");
  await assertIntersectsViewport(page, page.locator('[data-testid="markdown-editor"]').first(), `editor ${viewport.name}`);
  const beforeOverflow = await assertNoDocumentHorizontalOverflow(page, `navigation anchor before scroll ${viewport.name}`);
  await waitForScrollableEditor(page);

  const before = await scrollLongPageToMiddle(page);
  if (before.scrollTop <= 400) {
    throw new Error(`Expected long page to scroll away from top before navigation: ${JSON.stringify(before)}`);
  }
  const anchorLine = await clickVisibleAnchorLine(page);

  await openPageAndWait(page, fixture.secondPageId, fixture.secondTitle);
  await page.getByText("Second page body for navigation history.").first().waitFor({ timeout: 8_000 });

  const backButton = page.locator(".nav-history-btn").first();
  await backButton.waitFor({ timeout: 8_000 });
  await backButton.click();
  await waitForTitleValue(page, fixture.longTitle);
  const restored = await waitForRestoredScroll(page, before.scrollTop * 0.35);
  const visibleText = await visibleEditorText(page);
  if (!visibleText.includes(anchorLine)) {
    throw new Error(`Back navigation did not restore the clicked markdown anchor line: ${JSON.stringify({ anchorLine, before, restored, visibleText })}`);
  }
  if (visibleText.includes("Anchor paragraph 0") && restored.scrollTop < before.scrollTop * 0.5) {
    throw new Error(`Back navigation restored near top instead of previous anchor: ${JSON.stringify({ before, restored, visibleText })}`);
  }
  const afterBackOverflow = await assertNoDocumentHorizontalOverflow(page, `navigation anchor after back ${viewport.name}`);
  const visibleTextSample = excerptAroundAnchor(visibleText, anchorLine);
  const visualSnapshot = await captureNavigationAnchorSnapshot({
    afterBackOverflow,
    anchorLine,
    artifactRoot,
    page,
    restored,
    visibleTextSample,
    viewport
  });

  const forwardButton = page.locator(".nav-history-btn").nth(1);
  await forwardButton.click();
  await waitForTitleValue(page, fixture.secondTitle);
  await page.getByText("Second page body for navigation history.").first().waitFor({ timeout: 8_000 });
  const afterForwardOverflow = await assertNoDocumentHorizontalOverflow(page, `navigation anchor after forward ${viewport.name}`);
  const forward = await page.evaluate((expectedTitle) => ({
    bodyVisible: Array.from(document.querySelectorAll(".cm-line")).some((line) => line.textContent?.includes("Second page body for navigation history.")),
    title: document.querySelector(".title-input")?.value ?? "",
    expectedTitle
  }), fixture.secondTitle);

  return {
    viewport,
    secondTitle: fixture.secondTitle,
    before,
    restored,
    anchorLine,
    visibleTextSample,
    beforeOverflow,
    afterBackOverflow,
    afterForwardOverflow,
    forward,
    visualSnapshot
  };
}

async function captureNavigationAnchorSnapshot({
  afterBackOverflow,
  anchorLine,
  artifactRoot,
  page,
  restored,
  visibleTextSample,
  viewport
}) {
  const visualSnapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator('[data-testid="markdown-editor"]').first(),
    metadata: {
      phase: "navigation-anchor-restored",
      anchorLine,
      restoredScrollTop: restored.scrollTop,
      visibleTextSample,
      overflow: afterBackOverflow
    },
    name: `Navigation Anchor Restored ${viewport.name}`,
    page,
    viewport
  });
  await assertElementSnapshotBaseline(visualSnapshot, {
    label: `navigation anchor restored ${viewport.name}`,
    rect: {
      height: { min: 220 },
      width: { min: viewport.name === "compact" ? 420 : 620 }
    },
    requiredMetadataKeys: ["anchorLine", "restoredScrollTop", "visibleTextSample"],
    viewportName: viewport.name
  });
  return visualSnapshot;
}

function excerptAroundAnchor(visibleText, anchorLine) {
  const index = visibleText.indexOf(anchorLine);
  if (index < 0) return visibleText.slice(0, 220);
  const start = Math.max(0, index - 120);
  const end = Math.min(visibleText.length, index + anchorLine.length + 120);
  return visibleText.slice(start, end);
}

async function scrollLongPageToMiddle(page) {
  let metrics = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scroller = editorScroller(page);
    await scroller.waitFor({ timeout: 8_000 });
    await scroller.evaluate((element) => {
      element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * 0.55);
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await nextAnimationFrame(page);
    await nextAnimationFrame(page);
    metrics = await editorScroller(page).evaluate((element) => ({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    if (metrics.scrollTop > 400) return metrics;
    await page.waitForTimeout(120);
  }
  return metrics;
}

async function waitForScrollableEditor(page) {
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="markdown-editor"] .cm-scroller');
    if (!(element instanceof HTMLElement)) return false;
    if (element.scrollHeight <= element.clientHeight + 80) return false;
    const previous = element.scrollTop;
    element.scrollTop = Math.min(240, element.scrollHeight - element.clientHeight);
    const changed = element.scrollTop > 0;
    element.scrollTop = previous;
    return changed;
  }, null, { timeout: 8_000 });
}

async function clickVisibleAnchorLine(page) {
  const lineText = await page.waitForFunction(() => {
    const lines = Array.from(document.querySelectorAll('[data-testid="markdown-editor"] .cm-line'))
      .map((line) => line.textContent ?? "")
      .filter((text) => /^Anchor paragraph \d+/.test(text));
    const middle = lines.find((text) => {
      const match = /^Anchor paragraph (\d+)/.exec(text);
      return match && Number(match[1]) > 20;
    });
    return middle || false;
  }, null, { timeout: 8_000 }).then((handle) => handle.jsonValue());
  const line = page.locator('[data-testid="markdown-editor"] .cm-line').filter({ hasText: lineText }).first();
  await line.click({ position: { x: 80, y: 12 }, timeout: 8_000 });
  await page.waitForFunction(
    ({ expectedText }) => (
      document.querySelector('[data-testid="markdown-editor"] .cm-activeLine')?.textContent?.includes(expectedText) ||
      document.querySelector('[data-testid="markdown-editor"] .cm-editor.cm-focused') !== null
    ),
    { expectedText: lineText },
    { timeout: 5_000 }
  );
  await nextAnimationFrame(page);
  await nextAnimationFrame(page);
  return lineText;
}

async function waitForRestoredScroll(page, minimumScrollTop) {
  const scroller = editorScroller(page);
  await scroller.waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    ({ minTop }) => {
      const element = document.querySelector('[data-testid="markdown-editor"] .cm-scroller');
      return element instanceof HTMLElement && element.scrollTop >= minTop;
    },
    { minTop: minimumScrollTop },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const metrics = await scroller.evaluate((element) => ({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    throw new Error(`Back navigation did not restore markdown anchor scroll. Metrics=${JSON.stringify(metrics)}. ${error.message}`);
  });
  return scroller.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  }));
}

async function visibleEditorText(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="markdown-editor"] .cm-line'))
    .map((line) => line.textContent ?? "")
    .filter(Boolean)
    .join("\n"));
}

function editorScroller(page) {
  return page.locator('[data-testid="markdown-editor"] .cm-scroller').first();
}

async function waitForTitleValue(page, title) {
  return waitForTitleValueWithin(page, title, 8_000);
}

async function waitForTitleValueWithin(page, title, timeoutMs) {
  await page.waitForFunction(
    ({ expectedTitle }) => document.querySelector(".title-input")?.value === expectedTitle,
    { expectedTitle: title },
    { timeout: timeoutMs }
  ).catch(async (error) => {
    const currentTitle = await page.locator(".title-input").first().inputValue().catch(() => "");
    throw new Error(`Expected title value ${JSON.stringify(title)}, got ${JSON.stringify(currentTitle)}. ${error.message}`);
  });
}

async function openPageAndWait(page, pageId, title) {
  await page.waitForFunction(
    async ({ targetPageId }) => {
      try {
        const doc = await window.lotion.pages.get(targetPageId);
        return doc?.meta?.id === targetPageId;
      } catch {
        return false;
      }
    },
    { targetPageId: pageId },
    { timeout: 8_000 }
  );
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await openPage(page, pageId);
    try {
      await waitForTitleValueWithin(page, title, 2_000);
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(120);
    }
  }
  const active = await page.evaluate(() => ({
    activeTitle: document.querySelector(".title-input")?.value ?? "",
    activeTab: document.querySelector(".tab.active")?.textContent ?? ""
  }));
  throw new Error(`Unable to open page ${pageId} (${title}) after retries. Active=${JSON.stringify(active)}. ${lastError?.message ?? ""}`);
}

async function createNavigationAnchorFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-navigation-anchor-${viewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const longPageId = `pg_nav_anchor_long_${viewportName}`;
  const secondPageId = `pg_nav_anchor_second_${viewportName}`;
  const longTitle = `Navigation Anchor Long ${viewportName}`;
  const secondTitle = `Navigation Anchor Second ${viewportName}`;
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const longPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(longPageId, longTitle));
  const secondPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(secondPageId, secondTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_navigation_anchor_${viewportName}`,
    name: `Navigation Anchor ${viewportName}`,
    pages: [longPageId, secondPageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: longPageId,
      title: longTitle,
      now,
      icon: "emoji:🧭",
      path: ["Smoke", longTitle],
      bodyPath: longPath
    }),
    pageRecord({
      id: secondPageId,
      title: secondTitle,
      now,
      icon: "emoji:➡️",
      path: ["Smoke", secondTitle],
      bodyPath: secondPath
    })
  ]);
  await writeFile(join(root, longPath), longMarkdown(longTitle), "utf8");
  await writeFile(join(root, secondPath), `# ${secondTitle}\n\nSecond page body for navigation history.\n`, "utf8");

  return {
    root,
    longPageId,
    secondPageId,
    longTitle,
    secondTitle
  };
}

function longMarkdown(title) {
  const lines = [`# ${title}`, ""];
  for (let index = 0; index < 260; index += 1) {
    lines.push(`Anchor paragraph ${index}: stable text for navigation history restoration.`);
  }
  return `${lines.join("\n")}\n`;
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
