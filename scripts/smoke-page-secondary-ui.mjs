#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertPageSecondaryArtifactContract } from "./lib/page-secondary-artifacts.mjs";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  readRect,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("page-secondary-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const expectedViewports = pageSecondaryViewports();
  const viewportResults = [];
  for (const viewport of expectedViewports) {
    await forEachViewport(page, [viewport], async () => {
      const fixture = await createPageSecondaryFixture(viewport.name);
      registerTempWorkspace(fixture.root);
      await openWorkspace(fixture.root);
      await waitForPageService(page, fixture.targetPageId);
      await openTargetPage(page, fixture);
      await waitForSecondaryChrome(page, fixture);

      const collapsed = await assertSecondaryCollapsed(page, fixture, viewport.name);
      await expandSecondaryPanel(page, viewport.name);
      await waitForSecondaryBacklinks(page, fixture);
      const expanded = await assertSecondaryExpanded(page, fixture, viewport.name);
      const snapshot = await captureSecondarySnapshot({ artifactRoot, collapsed, expanded, fixture, page, viewport });
      await assertSecondaryKeyboardFocus(page, viewport.name);
      await collapseSecondaryPanel(page, viewport.name);
      const editor = await assertEditorTypingWhileSecondaryCollapsed(page, fixture, viewport.name);
      const toc = await assertFloatingToc(page, fixture, viewport.name);

      viewportResults.push({
        viewport: viewport.name,
        workspaceRoot: fixture.root,
        collapsed,
        expanded,
        editor,
        noHorizontalOverflow: true,
        snapshot,
        toc
      });
    });
  }

  const summary = {
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertPageSecondaryArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

function pageSecondaryViewports() {
  const base = selectedViewports();
  const next = [...base, { name: "laptop", width: 1280, height: 900 }];
  const seen = new Set();
  return next.filter((viewport) => {
    const key = `${viewport.width}x${viewport.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function waitForPageService(page, pageId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetPageId) => {
    const pages = await window.lotion.pages.list();
    return pages.some((candidate) => candidate.id === targetPageId);
  }, pageId, { timeout: 8_000 });
}

async function openTargetPage(page, fixture) {
  await openPage(page, fixture.targetPageId);
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.targetTitle,
    { timeout: 8_000 }
  );
}

async function waitForSecondaryChrome(page, fixture) {
  await page.getByTestId("page-secondary-panel").waitFor({ timeout: 8_000 });
  await page.waitForFunction(({ sourceTitle }) => {
    const sourceLinks = Array.from(document.querySelectorAll(".page-property-link")).map((link) => link.getAttribute("title"));
    return sourceLinks.includes(sourceTitle);
  }, {
    sourceTitle: fixture.originalHtmlRel
  }, { timeout: 8_000 });
  await page.locator(".cm-md-floating-toc-host").first().waitFor({ state: "attached", timeout: 8_000 });
}

async function waitForSecondaryBacklinks(page, fixture) {
  await page.waitForFunction((backlinkCount) => (
    document.querySelectorAll(".page-backlink-item").length >= backlinkCount
  ), fixture.expectedBacklinks, { timeout: 8_000 });
}

async function assertSecondaryCollapsed(page, fixture, viewportName) {
  const panel = page.getByTestId("page-secondary-panel").first();
  const panelRect = await assertWithinViewport(page, panel, `secondary collapsed panel ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `secondary collapsed ${viewportName}`, 2);
  const state = await readSecondaryState(page, fixture);
  if (state.expanded !== "false" || !state.className.includes("collapsed") || state.contentVisibility !== "hidden") {
    throw new Error(`Secondary panel should default collapsed in ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (state.contentHeight > 2) {
    throw new Error(`Collapsed secondary panel leaked content height in ${viewportName}: ${JSON.stringify(state)}`);
  }
  await assertPrimaryGeometry(page, `secondary collapsed ${viewportName}`);
  return { panelRect, state };
}

async function expandSecondaryPanel(page, viewportName) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.hover();
  await page.waitForFunction(() => document.querySelector("[data-testid='page-secondary-panel']")?.getAttribute("aria-expanded") === "true", null, { timeout: 5_000 });
  await page.waitForFunction(() => {
    const content = document.querySelector(".page-secondary-content");
    if (!content) return false;
    const rect = content.getBoundingClientRect();
    return rect.height > 12 && window.getComputedStyle(content).visibility !== "hidden";
  }, null, { timeout: 5_000 });
  await assertNoDocumentHorizontalOverflow(page, `secondary expanded hover ${viewportName}`, 2);
}

async function assertSecondaryExpanded(page, fixture, viewportName) {
  const state = await readSecondaryState(page, fixture);
  if (state.expanded !== "true" || !state.className.includes("expanded") || state.contentVisibility === "hidden") {
    throw new Error(`Secondary panel did not expand on hover in ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (!state.sourceLinkMounted || state.backlinkItems < fixture.expectedBacklinks) {
    throw new Error(`Expanded secondary panel is missing source links or backlinks in ${viewportName}: ${JSON.stringify(state)}`);
  }
  await assertWithinViewport(page, page.locator(".page-property-link").filter({ hasText: fixture.originalHtmlRel.slice(0, 24) }).first(), `secondary source link ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator(".page-backlinks").first(), `secondary backlinks ${viewportName}`, 8);
  await assertPrimaryGeometry(page, `secondary expanded ${viewportName}`);
  return state;
}

async function assertSecondaryKeyboardFocus(page, viewportName) {
  const toggle = page.locator(".page-secondary-toggle").first();
  await toggle.focus();
  await page.waitForFunction(() => document.querySelector(".page-secondary-toggle")?.getAttribute("aria-expanded") === "true", null, { timeout: 5_000 });
  const focused = await toggle.evaluate((node) => document.activeElement === node && node.getAttribute("aria-expanded") === "true");
  if (!focused) {
    throw new Error(`Secondary toggle should expand and retain keyboard focus in ${viewportName}`);
  }
  await assertWithinViewport(page, toggle, `secondary keyboard toggle ${viewportName}`, 4);
}

async function collapseSecondaryPanel(page, viewportName) {
  await page.locator(".title-input").first().click();
  await page.waitForFunction(() => document.querySelector("[data-testid='page-secondary-panel']")?.getAttribute("aria-expanded") === "false", null, { timeout: 5_000 });
  await assertNoDocumentHorizontalOverflow(page, `secondary recollapsed ${viewportName}`, 2);
}

async function assertEditorTypingWhileSecondaryCollapsed(page, fixture, viewportName) {
  const marker = `Secondary panel typing ${viewportName}`;
  const editor = page.locator(".cm-content").first();
  await editor.waitFor({ timeout: 8_000 });
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker);
  const markdown = await waitForPageMarkdown(page, fixture.targetPageId, marker, `secondary collapsed editor typing ${viewportName}`);
  await assertNoDocumentHorizontalOverflow(page, `secondary editor typing ${viewportName}`, 2);
  const activeEditor = await page.evaluate(() => Boolean(document.activeElement?.closest(".cm-editor")));
  if (!activeEditor) throw new Error(`Editor lost focus after typing with secondary panel collapsed in ${viewportName}`);
  return {
    marker,
    persisted: markdown.includes(marker)
  };
}

async function assertFloatingToc(page, fixture, viewportName) {
  const host = page.locator(".cm-md-floating-toc-host").first();
  const toggle = host.locator(".cm-md-toc-toggle").first();
  await assertWithinViewport(page, toggle, `floating toc toggle ${viewportName}`, 8);
  const collapsed = await readTocState(page);
  if (!collapsed.hostClass.includes("cm-md-toc-collapsed") || collapsed.toggleExpanded !== "false") {
    throw new Error(`Floating TOC should default collapsed in ${viewportName}: ${JSON.stringify(collapsed)}`);
  }
  if (collapsed.navDisplay !== "none") {
    throw new Error(`Collapsed floating TOC should hide entries before hover/focus in ${viewportName}: ${JSON.stringify(collapsed)}`);
  }
  await host.hover();
  await page.waitForFunction(() => {
    const nav = document.querySelector(".cm-md-floating-toc-host .cm-md-toc-widget");
    const host = document.querySelector(".cm-md-floating-toc-host");
    const rect = host?.getBoundingClientRect();
    return nav && rect ? window.getComputedStyle(nav).display !== "none" && rect.width > 160 : false;
  }, null, { timeout: 5_000 });
  const expanded = await readTocState(page);
  if (expanded.itemTexts.length < fixture.expectedTocItems || !expanded.itemTexts.includes(fixture.deepHeading)) {
    throw new Error(`Floating TOC did not expose expected headings in ${viewportName}: ${JSON.stringify(expanded)}`);
  }
  const deepItem = host.locator(".cm-md-toc-item").filter({ hasText: fixture.deepHeading }).first();
  await deepItem.click();
  const deepHeading = page.locator(".cm-line").filter({ hasText: fixture.deepHeading }).first();
  await assertIntersectsViewport(page, deepHeading, `TOC target heading ${viewportName}`, 8);
  const activeEditor = await page.evaluate(() => Boolean(document.activeElement?.closest(".cm-editor")));
  if (!activeEditor) throw new Error(`TOC navigation did not return focus to the editor in ${viewportName}`);
  await assertNoDocumentHorizontalOverflow(page, `floating toc navigation ${viewportName}`, 2);
  return {
    collapsed,
    expanded
  };
}

async function captureSecondarySnapshot({ artifactRoot, collapsed, expanded, fixture, page, viewport }) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.scrollIntoViewIfNeeded();
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: panel,
    metadata: {
      collapsed,
      expanded,
      expectedBacklinks: fixture.expectedBacklinks,
      expectedTocItems: fixture.expectedTocItems,
      phase: "page-secondary"
    },
    name: `page-secondary-${viewport.name}`,
    page,
    viewport
  });
  return {
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: Number(snapshot.rect.height.toFixed(1)),
    width: Number(snapshot.rect.width.toFixed(1))
  };
}

async function readSecondaryState(page, fixture) {
  return page.evaluate((sourceTitle) => {
    const panel = document.querySelector("[data-testid='page-secondary-panel']");
    const content = document.querySelector(".page-secondary-content");
    const rect = panel?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const contentStyle = content ? window.getComputedStyle(content) : null;
    return {
      className: panel?.className ?? "",
      expanded: panel?.getAttribute("aria-expanded") ?? "",
      panelHeight: rect?.height ?? 0,
      panelTop: rect?.top ?? 0,
      panelBottom: rect?.bottom ?? 0,
      contentHeight: contentRect?.height ?? 0,
      contentVisibility: contentStyle?.visibility ?? "",
      sourceLinkMounted: Array.from(document.querySelectorAll(".page-property-link")).some((link) => link.getAttribute("title") === sourceTitle),
      backlinkItems: document.querySelectorAll(".page-backlink-item").length
    };
  }, fixture.originalHtmlRel);
}

async function readTocState(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    const nav = host?.querySelector(".cm-md-toc-widget");
    const toggle = host?.querySelector(".cm-md-toc-toggle");
    const hostRect = host?.getBoundingClientRect();
    const navStyle = nav ? window.getComputedStyle(nav) : null;
    return {
      hostClass: host?.className ?? "",
      hostRect: hostRect ? {
        top: hostRect.top,
        right: hostRect.right,
        bottom: hostRect.bottom,
        left: hostRect.left,
        width: hostRect.width,
        height: hostRect.height
      } : null,
      toggleExpanded: toggle?.getAttribute("aria-expanded") ?? "",
      navDisplay: navStyle?.display ?? "",
      itemTexts: Array.from(host?.querySelectorAll(".cm-md-toc-item") ?? []).map((item) => item.textContent?.trim() ?? "")
    };
  });
}

async function assertPrimaryGeometry(page, label) {
  const titleRect = await readRect(page.locator(".title-input").first());
  const panelRect = await readRect(page.getByTestId("page-secondary-panel").first());
  const editorRect = await readRect(page.locator(".page-body").first());
  const sidebarRect = await readRect(page.locator(".sidebar").first());
  const tocToggleRect = await readRect(page.locator(".cm-md-floating-toc-host .cm-md-toc-toggle").first());
  const viewport = page.viewportSize();
  const metrics = { titleRect, panelRect, editorRect, sidebarRect, tocToggleRect, viewport };
  if (overlap(titleRect, panelRect)) {
    throw new Error(`${label}: title overlaps secondary panel: ${JSON.stringify(metrics)}`);
  }
  if (overlap(panelRect, editorRect)) {
    throw new Error(`${label}: secondary panel overlaps editor body: ${JSON.stringify(metrics)}`);
  }
  if (tocToggleRect.left < sidebarRect.right) {
    throw new Error(`${label}: floating TOC overlaps sidebar: ${JSON.stringify(metrics)}`);
  }
  if (viewport && (tocToggleRect.right > viewport.width + 8 || tocToggleRect.left < -8)) {
    throw new Error(`${label}: floating TOC toggle leaves viewport: ${JSON.stringify(metrics)}`);
  }
}

function overlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function createPageSecondaryFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-page-secondary-${viewportName}-`));
  const now = "2026-06-12T12:00:00.000Z";
  const targetPageId = `pg_secondary_target_${viewportName}`;
  const targetTitle = `Page Secondary Target ${viewportName}`;
  const sourceCount = 5;
  const sourcePageIds = Array.from({ length: sourceCount }, (_, index) => `pg_secondary_source_${viewportName}_${index + 1}`);
  const sourceTitles = sourcePageIds.map((_, index) => `Secondary Source ${index + 1} ${viewportName}`);
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const targetPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(targetPageId, targetTitle));
  const sourcePaths = sourcePageIds.map((id, index) =>
    workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(id, sourceTitles[index]))
  );
  const originalHtmlRel = `attachments/original/${viewportName}-source.html`;
  const deepHeading = "Nested Insight";

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(root, "attachments", "original"), { recursive: true });
  await writeFile(join(root, originalHtmlRel), "<html><body>Original source fixture</body></html>\n", "utf8");
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_page_secondary_${viewportName}`,
    name: `Page Secondary ${viewportName}`,
    pages: [targetPageId, ...sourcePageIds],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "tags", "date", "url"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: targetPageId,
      title: targetTitle,
      now,
      icon: "emoji:🧭",
      path: ["Smoke", targetTitle],
      bodyPath: targetPath,
      tags: "secondary, toc",
      date: "2026-06-12",
      url: "https://example.com/page-secondary",
      originalHtmlRel
    }),
    ...sourcePageIds.map((id, index) => pageRecord({
      id,
      title: sourceTitles[index],
      now,
      icon: "emoji:🔁",
      path: ["Smoke", "Sources", sourceTitles[index]],
      bodyPath: sourcePaths[index]
    }))
  ]);
  await writeFile(
    join(root, targetPath),
    [
      `# ${targetTitle}`,
      "",
      "Target page for secondary chrome smoke.",
      "",
      "## Overview",
      "",
      "A short overview keeps the first heading visible.",
      "",
      "## Deep Work",
      "",
      "Longer body copy before the nested heading.",
      "",
      `### ${deepHeading}`,
      "",
      "This heading is used by the floating table of contents.",
      "",
      "## Final Section",
      "",
      "The editor should remain usable after TOC navigation."
    ].join("\n"),
    "utf8"
  );
  for (let index = 0; index < sourcePaths.length; index += 1) {
    await writeFile(
      join(root, sourcePaths[index]),
      `# ${sourceTitles[index]}\n\nBacklink source ${index + 1} links to [${targetTitle}](${targetPath}).\n`,
      "utf8"
    );
  }
  return {
    root,
    targetPageId,
    targetTitle,
    originalHtmlRel,
    expectedBacklinks: sourceCount,
    expectedTocItems: 4,
    deepHeading
  };
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
    "notion_original_html",
    "full_width",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function pageRecord({ id, title, now, icon, path, bodyPath, tags = "", date = "", url = "", originalHtmlRel = "" }) {
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
    tags,
    date,
    url,
    notion_original_html: originalHtmlRel,
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
      { id: "path", name: "Path", type: "text", system: true },
      { id: "parent_id", name: "Parent", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "date" },
      { id: "url", name: "URL", type: "url" },
      { id: "notion_original_html", name: "Original Notion HTML", type: "url", system: true },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true },
      { id: "row_id", name: "Row ID", type: "text", system: true },
      { id: "page_file", name: "Page file", type: "text", system: true }
    ]
  };
}

function defaultView(databaseId, fieldIds) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fieldIds,
    fieldOrder: fieldIds,
    wrapFieldIds: fieldIds,
    sorts: [],
    filters: []
  };
}
