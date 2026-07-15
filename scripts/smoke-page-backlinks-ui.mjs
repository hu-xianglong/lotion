#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertPageBacklinksArtifactContract } from "./lib/page-backlinks-artifacts.mjs";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const PAGE_SWITCH_THRESHOLD_MS = Number(process.env.LOTION_BACKLINK_PAGE_SWITCH_THRESHOLD_MS ?? 2500);
const BACKLINK_API_THRESHOLD_MS = Number(process.env.LOTION_BACKLINK_API_THRESHOLD_MS ?? 250);

const result = await withLotionUIHarness("page-backlinks-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const viewportResults = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createBacklinksFixture();
    registerTempWorkspace(fixture.root);

    await openWorkspace(fixture.root);
    await waitForPageService(page, fixture.targetPageId);
    await openTargetPage(page, fixture);
    await expandPageDetails(page);
    const panel = page.locator(".page-backlinks").first();
    await panel.waitFor({ timeout: 8_000 });
    await assertBacklinksPanelLayout(page, panel, `backlinks panel ${viewport.name}`);
    const initialItemLayout = await assertBacklinkItemsDoNotOverlap(page, `backlinks items initial ${viewport.name}`);
    await page.locator(".page-backlink-title").filter({ hasText: fixture.sourceTitle }).first().waitFor({ timeout: 8_000 });

    const rendered = await readBacklinksPanel(page);
    assertBacklinksPanel(rendered, fixture);
    await assertNoDocumentHorizontalOverflow(page, `page backlinks initial ${viewport.name}`);
    const initialPanelRect = await rectForLocator(panel);

    const openedPropertyRow = await openPropertyBacklinkWithKeyboard(page, fixture);
    await assertNoDocumentHorizontalOverflow(page, `page backlinks property row keyboard ${viewport.name}`);

    await openTargetPage(page, fixture);
    await expandPageDetails(page);
    const opened = await openMarkdownBacklinkWithKeyboard(page, fixture);
    await assertNoDocumentHorizontalOverflow(page, `page backlinks source page keyboard ${viewport.name}`);

    const repeatedPageOpens = await exerciseRepeatedPageOpens(page, fixture, viewport.name);
    const seededPageOpens = await exerciseSeededPageOpenRun(page, fixture, viewport.name);
    await assertNoDocumentHorizontalOverflow(page, `page backlinks repeated page opens ${viewport.name}`);
    await openTargetPage(page, fixture);
    await expandPageDetails(page);
    const refreshedPanel = page.locator(".page-backlinks").first();
    await refreshedPanel.waitFor({ timeout: 8_000 });
    const refreshedItemLayout = await assertBacklinkItemsDoNotOverlap(page, `backlinks items refreshed ${viewport.name}`);
    const panelRect = await rectForLocator(refreshedPanel);
    const evidence = {
      noHorizontalOverflow: true,
      opened,
      openedPropertyRow,
      panelRect,
      phase: "page-backlinks",
      rendered,
      itemLayout: refreshedItemLayout,
      repeatedPageOpens,
      seededPageOpens,
      viewport: viewport.name
    };
    const snapshot = await captureBacklinksSnapshot({
      artifactRoot,
      evidence,
      page,
      panel: refreshedPanel,
      viewport
    });

    viewportResults.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      targetPageId: fixture.targetPageId,
      sourcePageId: fixture.sourcePageId,
      propertyRowId: fixture.propertyRowId,
      initialPanelRect,
      initialItemLayout,
      rendered,
      openedPropertyRow,
      opened,
      repeatedPageOpens,
      seededPageOpens,
      noHorizontalOverflow: true,
      panelRect,
      refreshedItemLayout,
      snapshot
    });
  });

  const summary = {
    cdpUrl,
    artifactRoot,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertPageBacklinksArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function openTargetPage(page, fixture) {
  await openPage(page, fixture.targetPageId);
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.targetTitle,
    { timeout: 8_000 }
  );
}

async function expandPageDetails(page) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.waitFor({ timeout: 8_000 });
  const toggle = panel.locator(".page-secondary-toggle").first();
  await toggle.waitFor({ timeout: 8_000 });
  const state = await panel.evaluate((node) => ({
    expanded: node.getAttribute("aria-expanded"),
    pinned: node.classList.contains("pinned")
  }));
  if (state.expanded !== "true" || !state.pinned) {
    await toggle.click();
  }
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-testid='page-secondary-panel']");
    const content = document.querySelector("#page-secondary-content");
    return panel?.getAttribute("aria-expanded") === "true"
      && panel.classList.contains("pinned")
      && content?.getAttribute("aria-hidden") === "false";
  }, { timeout: 8_000 });
}

async function assertBacklinksPanelLayout(page, panel, label) {
  const rect = await assertIntersectsViewport(page, panel, label, 4);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`Cannot assert viewport bounds for ${label}; missing viewport size.`);
  if (rect.left < -4 || rect.right > viewport.width + 4 || rect.top < -4 || rect.top > viewport.height - 24) {
    throw new Error(`${label} has invalid visible geometry: ${JSON.stringify({ rect, viewport })}`);
  }
}

async function assertBacklinkItemsDoNotOverlap(page, label) {
  const layout = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".page-backlink-item"));
    const rectFor = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        bottom: Number(rect.bottom.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        top: Number(rect.top.toFixed(1)),
        width: Number(rect.width.toFixed(1))
      };
    };
    return items.map((item, index) => {
      const itemRect = rectFor(item);
      const copy = item.querySelector(".page-backlink-copy");
      const itemStyle = getComputedStyle(item);
      const copyStyle = copy ? getComputedStyle(copy) : null;
      const textRects = Array.from(item.querySelectorAll(
        ".page-backlink-title, .page-backlink-type, .page-backlink-path, .page-backlink-context, .page-backlink-excerpt"
      )).map((node) => ({
        className: node.className,
        text: node.textContent?.trim() ?? "",
        rect: rectFor(node)
      }));
      return {
        index,
        title: item.querySelector(".page-backlink-title")?.textContent?.trim() ?? "",
        rect: itemRect,
        styles: {
          alignItems: itemStyle.alignItems,
          display: itemStyle.display,
          height: itemStyle.height,
          maxHeight: itemStyle.maxHeight,
          minHeight: itemStyle.minHeight,
          overflow: itemStyle.overflow,
          copyHeight: copyStyle?.height ?? "",
          copyOverflow: copyStyle?.overflow ?? ""
        },
        textRects
      };
    });
  });

  for (let index = 1; index < layout.length; index += 1) {
    const previous = layout[index - 1];
    const current = layout[index];
    if (current.rect.top < previous.rect.bottom - 0.5) {
      throw new Error(`${label}: backlink items overlap vertically: ${JSON.stringify({ previous, current })}`);
    }
  }

  for (const item of layout) {
    for (const text of item.textRects) {
      if (text.rect.left < item.rect.left - 0.5 || text.rect.right > item.rect.right + 0.5) {
        throw new Error(`${label}: backlink text overflows item: ${JSON.stringify({ item, text })}`);
      }
      if (text.rect.top < item.rect.top - 0.5 || text.rect.bottom > item.rect.bottom + 0.5) {
        throw new Error(`${label}: backlink text escapes item vertically: ${JSON.stringify({ item, text })}`);
      }
    }
  }

  return layout.map((item) => ({
    height: item.rect.height,
    title: item.title,
    textLines: item.textRects.length
  }));
}

async function rectForLocator(locator) {
  return locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      bottom: Number(rect.bottom.toFixed(1)),
      height: Number(rect.height.toFixed(1)),
      left: Number(rect.left.toFixed(1)),
      right: Number(rect.right.toFixed(1)),
      top: Number(rect.top.toFixed(1)),
      width: Number(rect.width.toFixed(1))
    };
  });
}

async function captureBacklinksSnapshot({ artifactRoot, evidence, page, panel, viewport }) {
  await panel.scrollIntoViewIfNeeded();
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: panel,
    metadata: evidence,
    name: `page-backlinks-${viewport.name}`,
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

async function exerciseSeededPageOpenRun(page, fixture, viewportName) {
  await ensureSidebarPagesSectionOpen(page);
  const sequence = buildSeededPageSequence(fixture, 100);
  const timings = [];
  for (const item of sequence) {
    const startedAt = performance.now();
    await clickSidebarPage(page, item.title);
    await page.waitForFunction(
      (title) => document.querySelector(".title-input")?.value === title,
      item.title,
      { timeout: 8_000 }
    );
    await page.getByText(item.expectedText).first().waitFor({ timeout: 8_000 });
    const openMs = Number((performance.now() - startedAt).toFixed(1));
    if (openMs > PAGE_SWITCH_THRESHOLD_MS) {
      throw new Error(`Seeded page switch to "${item.title}" took ${openMs}ms in ${viewportName}, exceeding ${PAGE_SWITCH_THRESHOLD_MS}ms`);
    }
    const backlinkTiming = await page.evaluate(async (pageId) => {
      const startedAt = performance.now();
      const backlinks = await window.lotion.entities.backlinks(pageId);
      return {
        count: backlinks.length,
        ms: Number((performance.now() - startedAt).toFixed(1))
      };
    }, item.id);
    if (backlinkTiming.ms > BACKLINK_API_THRESHOLD_MS) {
      throw new Error(`Seeded backlink lookup for "${item.title}" took ${backlinkTiming.ms}ms in ${viewportName}, exceeding ${BACKLINK_API_THRESHOLD_MS}ms`);
    }
    await assertEditorUsable(page, item.title, viewportName);
    await assertNoDocumentHorizontalOverflow(page, `seeded page switch ${item.title} ${viewportName}`);
    timings.push({
      id: item.id,
      title: item.title,
      backlinkHeavy: item.backlinkHeavy,
      openMs,
      backlinkMs: backlinkTiming.ms,
      backlinkCount: backlinkTiming.count
    });
  }
  const openSamples = timings.map((item) => item.openMs).sort((a, b) => a - b);
  const slowest = timings.reduce((current, item) => (item.openMs > current.openMs ? item : current), timings[0]);
  if (!timings.some((item) => item.title === fixture.manualSlowTitle)) {
    throw new Error(`Seeded run did not include the manual slow-page fixture ${fixture.manualSlowTitle}`);
  }
  return {
    count: timings.length,
    thresholdMs: PAGE_SWITCH_THRESHOLD_MS,
    backlinkThresholdMs: BACKLINK_API_THRESHOLD_MS,
    p50: percentile(openSamples, 0.5),
    p95: percentile(openSamples, 0.95),
    max: slowest.openMs,
    slowest,
    manualSlowFixtureTitle: fixture.manualSlowTitle,
    manualSlowFixtureReason: "CI does not include the user's imported workspace, so the smoke creates the same title with large backlink-heavy imported-style body content.",
    timings
  };
}

function buildSeededPageSequence(fixture, count) {
  const random = mulberry32(0x381);
  const pages = [
    {
      id: fixture.targetPageId,
      title: fixture.targetTitle,
      expectedText: "Target page for backlinks smoke.",
      backlinkHeavy: true
    },
    {
      id: fixture.sourcePageId,
      title: fixture.sourceTitle,
      expectedText: "Source page for backlinks smoke.",
      backlinkHeavy: false
    },
    {
      id: fixture.noBacklinkPageId,
      title: fixture.noBacklinkTitle,
      expectedText: "This page intentionally has no backlinks.",
      backlinkHeavy: false
    },
    {
      id: fixture.manualSlowPageId,
      title: fixture.manualSlowTitle,
      expectedText: "Imported slow-page fixture",
      backlinkHeavy: true
    },
    ...fixture.stressSourcePageIds.map((id, index) => ({
      id,
      title: fixture.stressSourceTitles[index],
      expectedText: "Stress source backlink",
      backlinkHeavy: false
    }))
  ];
  const sequence = [
    pages.find((item) => item.id === fixture.manualSlowPageId),
    pages.find((item) => item.id === fixture.targetPageId)
  ].filter(Boolean);
  while (sequence.length < count) {
    sequence.push(pages[Math.floor(random() * pages.length)]);
  }
  return sequence.slice(0, count);
}

function percentile(sortedSamples, value) {
  if (!sortedSamples.length) return 0;
  const index = Math.min(sortedSamples.length - 1, Math.max(0, Math.ceil(sortedSamples.length * value) - 1));
  return sortedSamples[index];
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let next = Math.imul(seed ^ seed >>> 15, 1 | seed);
    next = next + Math.imul(next ^ next >>> 7, 61 | next) ^ next;
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}

async function exerciseRepeatedPageOpens(page, fixture, viewportName) {
  await ensureSidebarPagesSectionOpen(page);
  const sequence = [
    {
      id: fixture.sourcePageId,
      title: fixture.sourceTitle,
      expectedText: "Source page for backlinks smoke."
    },
    {
      id: fixture.noBacklinkPageId,
      title: fixture.noBacklinkTitle,
      expectedText: "This page intentionally has no backlinks."
    },
    {
      id: fixture.targetPageId,
      title: fixture.targetTitle,
      expectedText: "Target page for backlinks smoke."
    },
    {
      id: fixture.stressSourcePageIds[0],
      title: fixture.stressSourceTitles[0],
      expectedText: "Stress source backlink"
    },
    {
      id: fixture.targetPageId,
      title: fixture.targetTitle,
      expectedText: "Target page for backlinks smoke."
    },
    {
      id: fixture.noBacklinkPageId,
      title: fixture.noBacklinkTitle,
      expectedText: "This page intentionally has no backlinks."
    }
  ];
  const timings = [];
  for (const item of sequence) {
    const openStartedAt = performance.now();
    await clickSidebarPage(page, item.title);
    await page.waitForFunction(
      (title) => document.querySelector(".title-input")?.value === title,
      item.title,
      { timeout: 8_000 }
    );
    await page.getByText(item.expectedText).first().waitFor({ timeout: 8_000 });
    const openMs = Number((performance.now() - openStartedAt).toFixed(1));
    if (openMs > PAGE_SWITCH_THRESHOLD_MS) {
      throw new Error(`Page switch to "${item.title}" took ${openMs}ms in ${viewportName}, exceeding ${PAGE_SWITCH_THRESHOLD_MS}ms`);
    }
    const backlinkTiming = await page.evaluate(async (pageId) => {
      const startedAt = performance.now();
      const items = await window.lotion.entities.backlinks(pageId);
      return {
        count: items.length,
        ms: Number((performance.now() - startedAt).toFixed(1))
      };
    }, item.id);
    if (backlinkTiming.ms > BACKLINK_API_THRESHOLD_MS) {
      throw new Error(`Backlink lookup for "${item.title}" took ${backlinkTiming.ms}ms in ${viewportName}, exceeding ${BACKLINK_API_THRESHOLD_MS}ms`);
    }
    await assertEditorUsable(page, item.title, viewportName);
    await assertNoDocumentHorizontalOverflow(page, `page switch ${item.title} ${viewportName}`);
    timings.push({
      title: item.title,
      openMs,
      backlinkMs: backlinkTiming.ms,
      backlinkCount: backlinkTiming.count
    });
  }
  return {
    thresholdMs: PAGE_SWITCH_THRESHOLD_MS,
    backlinkThresholdMs: BACKLINK_API_THRESHOLD_MS,
    timings
  };
}

async function ensureSidebarPagesSectionOpen(page) {
  const section = page.locator(".nav-section").filter({
    has: page.locator(".section-heading").filter({ hasText: /Pages|页面/ })
  }).first();
  await section.waitFor({ timeout: 8_000 });
  const toggle = section.locator(".section-heading-toggle").first();
  if (await toggle.count()) {
    const expanded = await toggle.getAttribute("aria-expanded");
    if (expanded === "false") await toggle.click();
  }
  return section;
}

async function clickSidebarPage(page, title) {
  const section = await ensureSidebarPagesSectionOpen(page);
  const item = section.locator(".nav-item").filter({ hasText: title }).first();
  await item.waitFor({ timeout: 8_000 });
  await item.scrollIntoViewIfNeeded();
  await item.click();
}

async function assertEditorUsable(page, title, viewportName) {
  const editor = page.locator(".cm-content").first();
  await editor.waitFor({ timeout: 8_000 });
  const state = await editor.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      title: document.querySelector(".title-input")?.value ?? "",
      editable: node.getAttribute("contenteditable"),
      width: rect.width,
      height: rect.height,
      text: node.textContent ?? ""
    };
  });
  if (state.title !== title || state.editable !== "true" || state.width < 200 || state.height < 24) {
    throw new Error(`Editor is not usable after page switch in ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function readBacklinksPanel(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".page-backlinks");
    const items = Array.from(panel?.querySelectorAll(".page-backlink-item") ?? []).map((item) => ({
      ariaLabel: item.getAttribute("aria-label") ?? "",
      tagName: item.tagName,
      tabIndex: item instanceof HTMLElement ? item.tabIndex : null,
      disabled: item instanceof HTMLButtonElement ? item.disabled : null,
      sourceTitle: item.querySelector(".page-backlink-title")?.textContent?.trim() ?? "",
      sourceType: item.querySelector(".page-backlink-type")?.textContent?.trim() ?? "",
      sourcePath: item.querySelector(".page-backlink-path")?.textContent?.trim() ?? "",
      context: item.querySelector(".page-backlink-context")?.textContent?.trim() ?? "",
      excerpt: item.querySelector(".page-backlink-excerpt")?.textContent?.trim() ?? ""
    }));
    const item = items[0];
    return {
      panelText: panel?.textContent?.trim() ?? "",
      count: panel?.querySelector(".page-backlinks-count")?.textContent?.trim() ?? "",
      sourceTitle: item?.sourceTitle ?? "",
      sourceType: item?.sourceType ?? "",
      sourcePath: item?.sourcePath ?? "",
      context: item?.context ?? "",
      excerpt: item?.excerpt ?? "",
      items
    };
  });
}

function assertBacklinksPanel(rendered, fixture) {
  const markdownBacklink = rendered.items.find((item) => item.sourceTitle === fixture.sourceTitle);
  const propertyBacklink = rendered.items.find((item) => item.sourceTitle === fixture.propertyRowTitle);

  if (!markdownBacklink) {
    throw new Error(`Backlinks panel did not show source title: ${JSON.stringify(rendered)}`);
  }
  assertBacklinkItemAccessible(markdownBacklink, fixture.sourceTitle);
  if (!["Page", "页面"].includes(markdownBacklink.sourceType)) {
    throw new Error(`Backlinks panel did not show source type: ${JSON.stringify(rendered)}`);
  }
  if (markdownBacklink.sourcePath !== "Smoke") {
    throw new Error(`Backlinks panel did not show source path: ${JSON.stringify(rendered)}`);
  }
  if (!markdownBacklink.context.includes("L5")) {
    throw new Error(`Backlinks panel did not show markdown line context: ${JSON.stringify(rendered)}`);
  }
  if (!markdownBacklink.excerpt.includes(`See [${fixture.targetTitle}]`)) {
    throw new Error(`Backlinks panel did not show source excerpt: ${JSON.stringify(rendered)}`);
  }
  if (!propertyBacklink) {
    throw new Error(`Backlinks panel did not show property source title: ${JSON.stringify(rendered)}`);
  }
  assertBacklinkItemAccessible(propertyBacklink, fixture.propertyRowTitle);
  if (!["Database row", "数据库行"].includes(propertyBacklink.sourceType)) {
    throw new Error(`Backlinks panel did not show property source type: ${JSON.stringify(rendered)}`);
  }
  if (propertyBacklink.sourcePath !== `Smoke / ${fixture.propertyDatabaseTitle}`) {
    throw new Error(`Backlinks panel did not show property source path: ${JSON.stringify(rendered)}`);
  }
  if (!propertyBacklink.context.includes(fixture.propertyDatabaseTitle) || !propertyBacklink.context.includes(fixture.propertyFieldName)) {
    throw new Error(`Backlinks panel did not show property field context: ${JSON.stringify(rendered)}`);
  }
  if (propertyBacklink.excerpt !== fixture.targetTitle || propertyBacklink.excerpt.includes(fixture.targetPageId)) {
    throw new Error(`Backlinks panel did not show property cell preview: ${JSON.stringify(rendered)}`);
  }
  if (rendered.count !== String(fixture.expectedTargetBacklinkCount)) {
    throw new Error(`Backlinks panel did not show the backlink count: ${JSON.stringify(rendered)}`);
  }
}

function assertBacklinkItemAccessible(item, expectedTitle) {
  if (item.tagName !== "BUTTON") {
    throw new Error(`Backlink item is not a native button: ${JSON.stringify(item)}`);
  }
  if (item.disabled) {
    throw new Error(`Backlink item should be enabled: ${JSON.stringify(item)}`);
  }
  if (item.tabIndex < 0) {
    throw new Error(`Backlink item should be keyboard focusable: ${JSON.stringify(item)}`);
  }
  if (!item.ariaLabel.includes(expectedTitle) || !item.ariaLabel.includes(item.sourceType)) {
    throw new Error(`Backlink item accessible label is not descriptive: ${JSON.stringify(item)}`);
  }
}

async function openPropertyBacklinkWithKeyboard(page, fixture) {
  const item = await focusBacklinkItem(page, fixture.propertyRowTitle, "property backlink");
  const ariaLabel = await item.getAttribute("aria-label");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.propertyRowTitle,
    { timeout: 8_000 }
  );
  const openedPropertyRow = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (openedPropertyRow.titleInput !== fixture.propertyRowTitle) {
    throw new Error(`Property backlink keyboard activation did not open source row page: ${JSON.stringify(openedPropertyRow)}`);
  }
  if (openedPropertyRow.activeTabText.includes(fixture.propertyRowId)) {
    throw new Error(`Active tab leaked property source row id after backlink keyboard activation: ${JSON.stringify(openedPropertyRow)}`);
  }
  return {
    ...openedPropertyRow,
    activation: "keyboard-enter",
    ariaLabel
  };
}

async function openMarkdownBacklinkWithKeyboard(page, fixture) {
  const item = await focusBacklinkItem(page, fixture.sourceTitle, "markdown backlink");
  const ariaLabel = await item.getAttribute("aria-label");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.sourceTitle,
    { timeout: 8_000 }
  );
  const opened = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (opened.titleInput !== fixture.sourceTitle) {
    throw new Error(`Backlink keyboard activation did not open source page: ${JSON.stringify(opened)}`);
  }
  if (opened.activeTabText.includes(fixture.sourcePageId)) {
    throw new Error(`Active tab leaked source page id after backlink keyboard activation: ${JSON.stringify(opened)}`);
  }
  return {
    ...opened,
    activation: "keyboard-enter",
    ariaLabel
  };
}

async function focusBacklinkItem(page, title, label) {
  const item = page.locator(".page-backlink-item").filter({ hasText: title }).first();
  await item.waitFor({ timeout: 8_000 });
  await item.scrollIntoViewIfNeeded();
  await assertWithinViewport(page, item, label, 4);
  await item.focus();
  const focused = await item.evaluate((node) => document.activeElement === node);
  if (!focused) {
    throw new Error(`Could not focus ${label} for keyboard activation`);
  }
  const geometry = await item.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return {
      width: rect.width,
      height: rect.height,
      ariaLabel: node.getAttribute("aria-label") ?? "",
      backgroundColor: style.backgroundColor,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    };
  });
  if (geometry.width < 180 || geometry.height < 24) {
    throw new Error(`${label} has an unstable hit target: ${JSON.stringify(geometry)}`);
  }
  if (!geometry.ariaLabel.includes(title)) {
    throw new Error(`${label} aria-label does not include the source title: ${JSON.stringify(geometry)}`);
  }
  const hasFocusBackground = geometry.backgroundColor !== "rgba(0, 0, 0, 0)" && geometry.backgroundColor !== "transparent";
  const hasFocusOutline = geometry.outlineStyle !== "none" && Number.parseFloat(geometry.outlineWidth) > 0;
  if (!hasFocusBackground && !hasFocusOutline) {
    throw new Error(`${label} does not expose a visible focus affordance: ${JSON.stringify(geometry)}`);
  }
  return item;
}

async function waitForPageService(page, pageId) {
  await page.waitForSelector(".main-content", { timeout: 60_000 });
  await page.waitForFunction(async (targetPageId) => {
    const pages = await window.lotion.pages.list();
    return pages.some((candidate) => candidate.id === targetPageId);
  }, pageId, { timeout: 60_000 });
}

async function createBacklinksFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-backlinks-"));
  const now = "2026-01-01T00:00:00.000Z";
  const targetPageId = "pg_backlink_target";
  const sourcePageId = "pg_backlink_source";
  const noBacklinkPageId = "pg_backlink_light";
  const manualSlowPageId = "pg_backlink_sp_startup";
  const propertyRowId = "pg_backlink_property_source";
  const propertyDatabaseId = "db_backlink_property_sources";
  const targetTitle = "Backlink Target Page";
  const sourceTitle = "Backlink Source Page";
  const noBacklinkTitle = "Backlink Light Page";
  const manualSlowTitle = "[SP][总][重要] 自己创业";
  const propertyRowTitle = "Property Source Row";
  const propertyDatabaseTitle = "Property Sources";
  const propertyFieldName = "Related Page";
  const stressSourceCount = 36;
  const stressSourcePageIds = Array.from({ length: stressSourceCount }, (_, index) => `pg_backlink_stress_${index + 1}`);
  const stressSourceTitles = stressSourcePageIds.map((_, index) => `Backlink Stress Source ${index + 1}`);
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const propertyDatabaseFolder = databaseFolderName(propertyDatabaseId, propertyDatabaseTitle);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const propertyDatabaseDir = join(root, "databases", "user", propertyDatabaseFolder);
  const targetPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(targetPageId, targetTitle));
  const sourcePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(sourcePageId, sourceTitle));
  const noBacklinkPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(noBacklinkPageId, noBacklinkTitle));
  const manualSlowPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(manualSlowPageId, manualSlowTitle));
  const stressSourcePaths = stressSourcePageIds.map((pageId, index) =>
    workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, stressSourceTitles[index]))
  );

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(propertyDatabaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_page_backlinks",
    name: "Page Backlinks Smoke",
    pages: [targetPageId, sourcePageId, noBacklinkPageId, manualSlowPageId, ...stressSourcePageIds],
    databases: [propertyDatabaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeJson(join(propertyDatabaseDir, "schema.json"), propertyDatabaseSchema({
    id: propertyDatabaseId,
    title: propertyDatabaseTitle,
    fieldName: propertyFieldName,
    now
  }));
  await writeJson(
    join(propertyDatabaseDir, "views", `${DEFAULT_VIEW_ID}.json`),
    defaultView(propertyDatabaseId, ["title", "related"])
  );
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: targetPageId,
      title: targetTitle,
      now,
      icon: "emoji:🎯",
      path: ["Smoke", targetTitle],
      bodyPath: targetPath
    }),
    pageRecord({
      id: sourcePageId,
      title: sourceTitle,
      now,
      icon: "emoji:🔗",
      path: ["Smoke", sourceTitle],
      bodyPath: sourcePath
    }),
    pageRecord({
      id: noBacklinkPageId,
      title: noBacklinkTitle,
      now,
      icon: "emoji:🪶",
      path: ["Smoke", noBacklinkTitle],
      bodyPath: noBacklinkPath
    }),
    pageRecord({
      id: manualSlowPageId,
      title: manualSlowTitle,
      now,
      icon: "emoji:🚀",
      path: ["Smoke", "Manual slow fixture", manualSlowTitle],
      bodyPath: manualSlowPath
    }),
    ...stressSourcePageIds.map((id, index) => pageRecord({
      id,
      title: stressSourceTitles[index],
      now,
      icon: "emoji:🔁",
      path: ["Smoke", "Stress Sources", stressSourceTitles[index]],
      bodyPath: stressSourcePaths[index]
    }))
  ]);
  await writeCsv(join(propertyDatabaseDir, "data.csv"), ["id", "created_time", "updated_time", "title", "related"], [
    {
      id: propertyRowId,
      created_time: now,
      updated_time: now,
      title: propertyRowTitle,
      related: JSON.stringify([{
        entityId: targetPageId,
        kind: "page",
        titleSnapshot: targetTitle,
        pathSnapshot: ["Smoke", targetTitle]
      }])
    }
  ]);
  await writeFile(join(root, targetPath), `# ${targetTitle}\n\nTarget page for backlinks smoke.\n`, "utf8");
  await writeFile(
    join(root, sourcePath),
    `# ${sourceTitle}\n\nSource page for backlinks smoke.\n\nSee [${targetTitle}](${targetPath}).\n\nRepeated [${targetTitle}](${targetPath}).\n`,
    "utf8"
  );
  await writeFile(
    join(root, noBacklinkPath),
    `# ${noBacklinkTitle}\n\nThis page intentionally has no backlinks.\n`,
    "utf8"
  );
  await writeFile(
    join(root, manualSlowPath),
    [
      `# ${manualSlowTitle}`,
      "",
      "Imported slow-page fixture for `[SP][总][重要] 自己创业`.",
      "",
      ...Array.from({ length: 80 }, (_, index) => {
        const sourceTitleForLink = stressSourceTitles[index % stressSourceTitles.length];
        const sourcePathForLink = stressSourcePaths[index % stressSourcePaths.length];
        return `- Imported section ${index + 1}: [${sourceTitleForLink}](${sourcePathForLink}) keeps enough links and body text to stress page-open backlinks without using the user's real workspace.`;
      })
    ].join("\n"),
    "utf8"
  );
  for (let index = 0; index < stressSourcePaths.length; index += 1) {
    await writeFile(
      join(root, stressSourcePaths[index]),
      `# ${stressSourceTitles[index]}\n\nStress source backlink ${index + 1} points to [${targetTitle}](${targetPath}).\n`,
      "utf8"
    );
  }
  return {
    root,
    targetPageId,
    sourcePageId,
    noBacklinkPageId,
    manualSlowPageId,
    targetTitle,
    sourceTitle,
    noBacklinkTitle,
    manualSlowTitle,
    propertyRowTitle,
    propertyRowId,
    propertyDatabaseTitle,
    propertyFieldName,
    stressSourcePageIds,
    stressSourceTitles,
    expectedTargetBacklinkCount: stressSourceCount + 2
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
      { id: "path", name: "Path", type: "text", system: true },
      { id: "parent_id", name: "Parent", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "date" },
      { id: "url", name: "URL", type: "url" },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true },
      { id: "row_id", name: "Row ID", type: "text", system: true },
      { id: "page_file", name: "Page file", type: "text", system: true }
    ]
  };
}

function propertyDatabaseSchema({ id, title, fieldName, now }) {
  return {
    id,
    name: title,
    path: ["Smoke", title],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "related", name: fieldName, type: "entity_ref" }
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
