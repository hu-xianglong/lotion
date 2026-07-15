#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertElementSnapshotBaseline,
  assertHarnessViewportCoverage,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { assertSearchUiArtifactContract } from "./lib/search-ui-artifacts.mjs";

const args = parseArgs(process.argv.slice(2));
const thresholdMs = Number(process.env.LOTION_SEARCH_UI_RENDER_THRESHOLD_MS ?? 1500);
const backendThresholdMs = Number(process.env.LOTION_SEARCH_BACKEND_THRESHOLD_MS ?? 5000);
const inputThresholdMs = Number(process.env.LOTION_SEARCH_INPUT_KEY_THRESHOLD_MS ?? 80);

const summary = await withLotionUIHarness("search-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createSearchFixture(args.visibleHits + 40, args.queries[0] ?? "the", viewport.name);
    await openWorkspace(fixture.root);
    await waitForPageService(page, fixture.pageIds[0]);
    await installLargeSearchResultHarness(page, {
      delayMs: args.searchDelayMs,
      largeHits: args.largeHits,
      query: fixture.query
    });
    await closeSearchIfOpen(page);
    const selected = await chooseSearchQuery(page, { ...args, queries: [fixture.query, ...args.queries] });
    await openGlobalSearch(page);

    const first = await measureSearchRender(page, selected.query, args.visibleHits, viewport.name, {
      exercisePendingInput: true,
      largeHits: args.largeHits
    });
    const repeated = await measureSearchRender(page, selected.query, args.visibleHits, viewport.name, {
      exercisePendingInput: false,
      largeHits: args.largeHits
    });
    const sorting = await assertSearchSortControls(page, fixture, viewport.name);
    const inputLatency = await measureSearchInputLatency(page, selected.query, viewport.name);
    const { renderOverflow, visualSnapshot } = await captureSearchLatencySnapshot({
      artifactRoot,
      firstRenderMs: first,
      inputLatency,
      page,
      query: selected.query,
      repeatedRenderMs: repeated,
      visibleHits: args.visibleHits,
      viewport
    });
    const keyboardNavigation = await inputKeyboardNavigationSmoke(page, viewport.name);
    const inputOverflow = await assertNoDocumentHorizontalOverflow(page, `search input after keyboard ${viewport.name}`, 8);
    const jump = await assertSearchResultJumpsToMarkdownLine(page, fixture, viewport.name);

    const slowCandidate = selected.candidateChecks.find((candidate) => candidate.elapsedMs > backendThresholdMs);
    if (slowCandidate) {
      throw new Error(
        `Search backend query "${slowCandidate.query}" took ${slowCandidate.elapsedMs}ms, ` +
        `exceeding ${backendThresholdMs}ms`
      );
    }
    if (first > thresholdMs) {
      throw new Error(`First search UI render ${first}ms exceeds ${thresholdMs}ms`);
    }
    if (repeated > thresholdMs) {
      throw new Error(`Repeated search UI render ${repeated}ms exceeds ${thresholdMs}ms`);
    }
    if (inputLatency.maxMs > inputThresholdMs) {
      throw new Error(`Search input key latency ${inputLatency.maxMs}ms exceeds ${inputThresholdMs}ms`);
    }

    viewports.push({
      viewport: viewport.name,
      query: selected.query,
      candidateChecks: selected.candidateChecks,
      hits: selected.hits,
      firstRenderMs: first,
      repeatedRenderMs: repeated,
      sorting,
      inputLatency,
      keyboardNavigation,
      renderOverflow,
      inputOverflow,
      visualSnapshot,
      jump
    });
  });

  const result = {
    cdpUrl,
    visibleHits: args.visibleHits,
    largeHits: args.largeHits,
    searchDelayMs: args.searchDelayMs,
    thresholdMs,
    backendThresholdMs,
    inputThresholdMs,
    viewports,
    status: "passed"
  };
  result.artifactContract = await assertSearchUiArtifactContract(result, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return result;
});

assertHarnessViewportCoverage(summary);
console.log(JSON.stringify(summary, null, 2));

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
}

async function installLargeSearchResultHarness(page, { delayMs, largeHits, query }) {
  await page.evaluate(({ delayMs, largeHits, query }) => {
    const original = window.lotion.search.query.bind(window.lotion.search);
    const amplifiedQuery = async (pattern, options) => {
      const result = await original(pattern, options);
      if (pattern.trim() !== query || result.hits.length === 0) return result;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const hits = Array.from({ length: largeHits }, (_unused, index) => {
        const source = result.hits[index % result.hits.length];
        return {
          ...source,
          line: source.line + index,
          path: `${source.path}#large-${index}`,
          text: `${source.text} · large result ${index + 1}`
        };
      });
      return { hits, truncated: true };
    };
    window.__lotionSearchUiHarness = { query: amplifiedQuery };
  }, { delayMs, largeHits, query });
}

async function chooseSearchQuery(page, options) {
  const candidateChecks = [];
  for (const query of options.queries) {
    const started = Date.now();
    const result = await page.evaluate((pattern) => {
      const querySearch = window.__lotionSearchUiHarness?.query ?? window.lotion.search.query;
      return querySearch(pattern);
    }, query);
    const elapsedMs = Date.now() - started;
    candidateChecks.push({
      query,
      hits: result.hits.length,
      truncated: result.truncated,
      elapsedMs
    });
    if (result.hits.length >= options.visibleHits) {
      return { query, hits: result.hits.length, candidateChecks };
    }
  }
  throw new Error(
    `No search query produced ${options.visibleHits}+ hits. Candidates: ` +
    JSON.stringify(candidateChecks)
  );
}

async function measureSearchRender(page, query, visibleHits, viewportName, options = {}) {
  const input = page.locator(".global-search-input");
  await input.fill("");
  await page.waitForFunction(() => document.querySelectorAll(".global-search-hit").length === 0, null, { timeout: 2_000 })
    .catch(() => undefined);
  const started = await page.evaluate(() => performance.now());
  await input.fill(query);
  await page.waitForSelector('[data-testid="global-search-progress"][data-state="loading"]', { timeout: 2_000 });
  const pendingState = await page.evaluate((query) => {
    const input = document.querySelector(".global-search-input");
    const progress = document.querySelector('[data-testid="global-search-progress"]');
    return {
      activeInput: document.activeElement === input,
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      state: progress?.getAttribute("data-state") ?? "",
      text: progress?.textContent ?? ""
    };
  }, query);
  if (!pendingState.activeInput || pendingState.inputValue !== query || !pendingState.text.includes("输入框保持可编辑")) {
    throw new Error(`Search loading progress/input state mismatch: ${JSON.stringify(pendingState)}`);
  }
  if (options.exercisePendingInput) {
    await input.type("x");
    await page.waitForFunction(
      (expected) => document.querySelector(".global-search-input")?.value === expected,
      `${query}x`,
      { timeout: 2_000 }
    );
    await input.press("Backspace");
    await page.waitForFunction(
      (expected) => document.querySelector(".global-search-input")?.value === expected,
      query,
      { timeout: 2_000 }
    );
  }
  await page.waitForFunction(
    (visibleHits) => document.querySelectorAll(".global-search-hit").length >= visibleHits,
    visibleHits,
    { timeout: 5_000 }
  );
  await assertSearchProgressComplete(page, {
    largeHits: options.largeHits,
    query,
    visibleHits,
    viewportName
  });
  const ended = await page.evaluate(() => performance.now());
  const rendered = await page.locator(".global-search-hit").count();
  if (rendered < visibleHits) {
    throw new Error(`Expected ${visibleHits} rendered hits, saw ${rendered}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `search render ${viewportName}`, 8);
  return Number((ended - started).toFixed(1));
}

async function assertSearchProgressComplete(page, { largeHits, query, visibleHits, viewportName }) {
  await page.waitForSelector('[data-testid="global-search-progress"][data-state="partial"]', { timeout: 5_000 });
  const progress = await page.evaluate(() => {
    const progress = document.querySelector('[data-testid="global-search-progress"]');
    return {
      hasMore: progress?.getAttribute("data-has-more") ?? "",
      state: progress?.getAttribute("data-state") ?? "",
      text: progress?.textContent ?? "",
      totalCount: Number(progress?.getAttribute("data-total-count") ?? "0"),
      truncated: progress?.getAttribute("data-truncated") ?? "",
      visibleCount: Number(progress?.getAttribute("data-visible-count") ?? "0"),
      renderedRows: document.querySelectorAll(".global-search-hit").length,
      inputValue: document.querySelector(".global-search-input") instanceof HTMLInputElement
        ? document.querySelector(".global-search-input").value
        : ""
    };
  });
  if (progress.inputValue !== query) {
    throw new Error(`Search query changed during large-result progress: ${JSON.stringify(progress)}`);
  }
  if (progress.totalCount < largeHits || progress.visibleCount < visibleHits || progress.renderedRows > visibleHits + 1) {
    throw new Error(`Search large-result progress counts are wrong: ${JSON.stringify(progress)}`);
  }
  if (progress.truncated !== "true" || progress.hasMore !== "true" || !progress.text.includes("当前只挂载")) {
    throw new Error(`Search large-result progress copy/state mismatch: ${JSON.stringify(progress)}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `search progress ${viewportName}`, 8);
  return progress;
}

async function assertSearchSortControls(page, fixture, viewportName) {
  const sort = page.locator('select[aria-label="搜索排序"]');
  await sort.waitFor({ state: "visible", timeout: 2_000 });
  await sort.focus();
  const options = await sort.evaluate((select) =>
    Array.from(select.options).map((option) => ({ label: option.textContent?.trim() ?? "", value: option.value }))
  );
  for (const value of ["relevance", "updated_desc", "updated_asc", "created_desc", "created_asc"]) {
    if (!options.some((option) => option.value === value)) {
      throw new Error(`Missing search sort option ${value}: ${JSON.stringify(options)}`);
    }
  }

  await sort.selectOption("created_asc");
  await waitForFirstSearchResultTitle(page, "Search UI Hit 0");
  const createdAsc = await firstSearchResultTitle(page);

  await sort.selectOption("updated_desc");
  const newestTitle = `Search UI Hit ${fixture.sortHitCount - 1}`;
  await waitForFirstSearchResultTitle(page, newestTitle);
  const updatedDesc = await firstSearchResultTitle(page);

  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector(".global-search");
    const sortControl = document.querySelector('select[aria-label="搜索排序"]');
    const active = document.activeElement === sortControl;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const rect = sortControl?.getBoundingClientRect();
    const dialogRect = dialog?.getBoundingClientRect();
    return {
      active,
      dialogInsideViewport: Boolean(
        dialogRect &&
        dialogRect.left >= 0 &&
        dialogRect.top >= 0 &&
        dialogRect.right <= viewport.width &&
        dialogRect.bottom <= viewport.height
      ),
      sortInsideViewport: Boolean(
        rect &&
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= viewport.width &&
        rect.bottom <= viewport.height
      )
    };
  });
  if (!geometry.active || !geometry.dialogInsideViewport || !geometry.sortInsideViewport) {
    throw new Error(`Search sort control geometry/focus failed for ${viewportName}: ${JSON.stringify(geometry)}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `search sort ${viewportName}`, 8);

  await sort.selectOption("relevance");
  await waitForFirstSearchResultTitle(page, "Search UI Hit 0");

  return { createdAsc, updatedDesc, options, geometry };
}

async function waitForFirstSearchResultTitle(page, expectedTitle) {
  try {
    await page.waitForFunction((title) => {
      const rows = Array.from(document.querySelectorAll(".global-search-hit"));
      const firstSearchRow = rows.find((row) => !row.querySelector(".gs-kind-badge.command"));
      return firstSearchRow?.querySelector(".gs-title")?.textContent?.trim() === title;
    }, expectedTitle, { timeout: 10_000 });
  } catch (error) {
    const state = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".global-search-hit"));
      const firstSearchRow = rows.find((row) => !row.querySelector(".gs-kind-badge.command"));
      return {
        firstTitle: firstSearchRow?.querySelector(".gs-title")?.textContent?.trim() ?? "",
        hitCount: rows.length,
        inputValue: document.querySelector(".global-search-input")?.value ?? "",
        sortValue: document.querySelector('select[aria-label="搜索排序"]')?.value ?? ""
      };
    });
    throw new Error(`Timed out waiting for first search result ${JSON.stringify({ expectedTitle, state })}: ${error.message}`);
  }
}

async function firstSearchResultTitle(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".global-search-hit"));
    const firstSearchRow = rows.find((row) => !row.querySelector(".gs-kind-badge.command"));
    return firstSearchRow?.querySelector(".gs-title")?.textContent?.trim() ?? "";
  });
}

async function inputKeyboardNavigationSmoke(page, viewportName) {
  const input = page.locator(".global-search-input");
  await input.press("ArrowDown");
  await page.waitForFunction(
    () => document.querySelectorAll(".global-search-hit.active").length === 1,
    null,
    { timeout: 2_000 }
  );
  await assertNoDocumentHorizontalOverflow(page, `search keyboard navigation ${viewportName}`, 8);
  return page.evaluate(() => {
    const activeHit = document.querySelector(".global-search-hit.active");
    const input = document.querySelector(".global-search-input");
    return {
      active: Boolean(activeHit),
      activeHitCount: document.querySelectorAll(".global-search-hit.active").length,
      activeTitle: activeHit?.querySelector(".gs-title")?.textContent?.trim() ?? "",
      inputFocused: document.activeElement === input
    };
  });
}

async function captureSearchLatencySnapshot({
  artifactRoot,
  firstRenderMs,
  inputLatency,
  page,
  query,
  repeatedRenderMs,
  visibleHits,
  viewport
}) {
  const input = page.locator(".global-search-input");
  await input.fill("");
  await input.fill(query);
  await page.waitForFunction(
    (expectedHits) => document.querySelectorAll(".global-search-hit").length >= expectedHits,
    visibleHits,
    { timeout: 5_000 }
  );
  const renderOverflow = await assertNoDocumentHorizontalOverflow(page, `search latency snapshot ${viewport.name}`, 8);
  const rows = await collectVisibleSearchRows(page);
  const visualSnapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator(".global-search").first(),
    metadata: {
      phase: "search-latency",
      query,
      visibleHitCount: rows.length,
      firstVisibleTitle: rows[0]?.title ?? "",
      firstRenderMs,
      repeatedRenderMs,
      inputMaxMs: inputLatency.maxMs,
      rows: rows.slice(0, 8)
    },
    name: `Search Latency ${viewport.name}`,
    page,
    viewport
  });
  await assertElementSnapshotBaseline(visualSnapshot, {
    label: `search latency ${viewport.name}`,
    rect: {
      height: { min: 180 },
      width: { min: viewport.name === "compact" ? 420 : 620 }
    },
    requiredMetadataKeys: ["query", "visibleHitCount", "firstRenderMs", "repeatedRenderMs", "inputMaxMs"],
    viewportName: viewport.name
  });
  return { renderOverflow, visualSnapshot };
}

async function collectVisibleSearchRows(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".global-search-hit"))
    .filter((hit) => {
      const rect = hit.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .slice(0, 12)
    .map((hit) => ({
      badge: hit.querySelector(".gs-kind-badge")?.textContent?.trim() ?? "",
      match: hit.querySelector(".gs-match-badge")?.textContent?.trim() ?? "",
      title: hit.querySelector(".gs-title")?.textContent?.trim() ?? "",
      preview: hit.querySelector(".global-search-preview")?.textContent?.trim() ?? ""
    })));
}

async function measureSearchInputLatency(page, query, viewportName) {
  const inputLatency = await page.evaluate(async (baseQuery) => {
    const input = document.querySelector(".global-search-input");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Global search input is not mounted.");
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Unable to access native input value setter.");
    const values = Array.from({ length: 8 }, (_unused, index) => `${baseQuery} ${"x".repeat(index + 1)}`);
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    await nextFrame();
    await nextFrame();
    const warmupStarted = performance.now();
    setter.call(input, `${baseQuery} warmup`);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await nextFrame();
    await nextFrame();
    const warmupMs = Number((performance.now() - warmupStarted).toFixed(1));
    const timings = [];
    for (const value of values) {
      const started = performance.now();
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await nextFrame();
      timings.push(Number((performance.now() - started).toFixed(1)));
    }
    return { warmupMs, timings };
  }, query);
  const maxMs = Math.max(...inputLatency.timings);
  const avgMs = inputLatency.timings.reduce((sum, value) => sum + value, 0) / Math.max(inputLatency.timings.length, 1);
  await assertNoDocumentHorizontalOverflow(page, `search input ${viewportName}`, 8);
  return {
    warmupMs: inputLatency.warmupMs,
    samples: inputLatency.timings,
    maxMs: Number(maxMs.toFixed(1)),
    avgMs: Number(avgMs.toFixed(1))
  };
}

async function assertSearchResultJumpsToMarkdownLine(page, fixture, viewportName) {
  await closeSearchIfOpen(page);
  await openGlobalSearch(page);
  await page.locator(".global-search-input").fill(fixture.jumpQuery);
  await page.waitForFunction(
    (title) => Array.from(document.querySelectorAll(".global-search-hit .gs-title"))
      .some((item) => item.textContent?.trim() === title),
    fixture.jumpTitle,
    { timeout: 8_000 }
  );
  await page.locator(".global-search-hit").filter({ hasText: fixture.jumpTitle }).first().click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.jumpTitle,
    { timeout: 8_000 }
  );
  await page.waitForFunction(
    (token) => Array.from(document.querySelectorAll(".cm-line"))
      .some((line) => line.textContent?.includes(token)),
    fixture.jumpQuery,
    { timeout: 8_000 }
  );
  const visible = await page.evaluate((token) => {
    const lines = Array.from(document.querySelectorAll(".cm-line")).map((line) => line.textContent ?? "");
    return {
      visibleLineCount: lines.length,
      matchVisible: lines.some((line) => line.includes(token)),
      matchIndex: lines.findIndex((line) => line.includes(token)),
      firstVisibleLine: lines[0] ?? "",
      lastVisibleLine: lines.at(-1) ?? ""
    };
  }, fixture.jumpQuery);
  if (!visible.matchVisible) {
    throw new Error(`Search result did not scroll to matching markdown line: ${JSON.stringify(visible)}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `search jump ${viewportName}`, 8);
  return visible;
}

function parseArgs(argv) {
  const parsed = {
    largeHits: Number(process.env.LOTION_SEARCH_UI_LARGE_HITS ?? 10_000),
    searchDelayMs: Number(process.env.LOTION_SEARCH_UI_DELAY_MS ?? 350),
    visibleHits: 100,
    queries: (process.env.LOTION_SEARCH_UI_QUERIES ?? "每日习惯,the,空,page,2023,日记,202,a")
      .split(",")
      .map((query) => query.trim())
      .filter(Boolean)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--query") {
      if (!value) throw new Error("--query requires a value");
      parsed.queries = [value];
      index += 1;
    } else if (arg.startsWith("--query=")) {
      parsed.queries = [arg.slice("--query=".length)];
    } else if (arg === "--visible-hits") {
      parsed.visibleHits = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--visible-hits=")) {
      parsed.visibleHits = numberArg("--visible-hits", arg.slice("--visible-hits=".length));
    } else if (arg === "--large-hits") {
      parsed.largeHits = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--large-hits=")) {
      parsed.largeHits = numberArg("--large-hits", arg.slice("--large-hits=".length));
    } else if (arg === "--search-delay-ms") {
      parsed.searchDelayMs = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--search-delay-ms=")) {
      parsed.searchDelayMs = numberArg("--search-delay-ms", arg.slice("--search-delay-ms=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.largeHits < parsed.visibleHits) {
    throw new Error("--large-hits must be greater than or equal to --visible-hits.");
  }
  if (parsed.queries.length === 0) {
    throw new Error("At least one --query or LOTION_SEARCH_UI_QUERIES value is required.");
  }
  return parsed;
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

async function createSearchFixture(pageCount, query, viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-search-ui-${safeViewport}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const entitiesFolder = databaseFolderName(ENTITIES_DATABASE_ID, "entities");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const entitiesDir = join(root, "databases", "system", entitiesFolder);
  const pageIds = Array.from({ length: pageCount }, (_unused, index) => `pg_search_ui_${safeViewport}_${index}`);
  const jumpPageId = `pg_search_jump_line_${safeViewport}`;
  const jumpTitle = "Search Jump Target";
  const jumpQuery = "needle-search-jump-line";
  const allPageIds = [...pageIds, jumpPageId];

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(entitiesDir, { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_search_ui_${safeViewport}`,
    name: "Search UI Smoke",
    pages: allPageIds,
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID, ENTITIES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  const pageEntries = pageIds.map((pageId, index) => {
    const title = `Search UI Hit ${index}`;
    const bodyPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, title));
    const createdTime = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
    const updatedTime = new Date(Date.UTC(2026, 1, index + 1)).toISOString();
    return { bodyPath, createdTime, icon: "emoji:🔎", id: pageId, index, title, updatedTime };
  });
  const records = pageEntries.map((entry) => {
    return pageRecord({
      id: entry.id,
      title: entry.title,
      createdTime: entry.createdTime,
      updatedTime: entry.updatedTime,
      icon: entry.icon,
      path: ["Search Smoke", entry.title],
      bodyPath: entry.bodyPath
    });
  });
  records.push(pageRecord({
    id: jumpPageId,
    title: jumpTitle,
    createdTime: now,
    updatedTime: now,
    icon: "emoji:🎯",
    path: ["Search Smoke", jumpTitle],
    bodyPath: workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(jumpPageId, jumpTitle))
  }));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), records);
  await writeCsv(join(entitiesDir, "data.csv"), entityFieldIds(), pageEntries.map((entry) => entityRecord({
    id: entry.id,
    createdTime: entry.createdTime,
    updatedTime: entry.updatedTime,
    title: entry.title,
    icon: entry.icon,
    path: ["Search Smoke", entry.title],
    bodyPath: entry.bodyPath
  })));
  for (const entry of pageEntries) {
    await writeFile(join(root, entry.bodyPath), `# ${entry.title}\n\n${query} deterministic search body ${entry.index}.\n`, "utf8");
  }
  const jumpBodyPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(jumpPageId, jumpTitle));
  await writeFile(join(root, jumpBodyPath), searchJumpBody(jumpTitle, jumpQuery), "utf8");
  return { root, pageIds: allPageIds, query, jumpPageId, jumpTitle, jumpQuery, sortHitCount: pageEntries.length };
}

function searchJumpBody(title, query) {
  const filler = Array.from({ length: 120 }, (_unused, index) => `Filler line ${index + 1}`);
  return [`# ${title}`, "", ...filler, `${query} should be visible after search navigation.`, ""].join("\n");
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

function pageRecord({ id, title, createdTime, updatedTime, icon, path, bodyPath }) {
  return {
    id,
    created_time: createdTime,
    updated_time: updatedTime,
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

function entityFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
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

function entityRecord({ id, title, createdTime, updatedTime, icon, path, bodyPath }) {
  return {
    id,
    created_time: createdTime,
    updated_time: updatedTime,
    kind: "page",
    title,
    icon,
    path: serializePathValue(path),
    parent_id: "",
    database_id: "",
    row_id: "",
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
