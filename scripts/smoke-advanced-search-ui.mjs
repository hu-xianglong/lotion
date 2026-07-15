#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertAdvancedSearchArtifactContract } from "./lib/advanced-search-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

await withLotionUIHarness("advanced-search-ui", async ({ artifactRoot, page, openWorkspace }) => {
  const fixture = await createAdvancedSearchFixture();
  await openWorkspace(fixture.root);
  await page.waitForFunction(async () => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === "db_advanced_search");
  }, null, { timeout: 8_000 });
  const missingModelBaseUrl = "http://lotion-advanced-search-missing-model.local";
  const unreachableBaseUrl = "http://lotion-advanced-search-unreachable.local";
  await installAdvancedSearchFetchMock(page, { missingModelBaseUrl, unreachableBaseUrl });

  const expectedViewports = selectedViewports();
  const viewports = [];
  for (const viewport of expectedViewports) {
    await forEachViewport(page, [viewport], async () => {
      const visualSnapshots = [];
      await resetAdvancedSearchIndex(page);
      await openAdvancedSearch(page);
      await assertInitialAdvancedSearchState(page, viewport.name);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "initial",
        viewport
      }));
      await assertOllamaUnavailableState(page, unreachableBaseUrl);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "ollama-error",
        viewport
      }));
      await resetAdvancedSearchIndex(page);
      await openAdvancedSearch(page);
      await assertMissingOllamaModelState(page, missingModelBaseUrl);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "missing-model-error",
        viewport
      }));
      await resetAdvancedSearchIndex(page);
      await openAdvancedSearch(page);
      await rebuildLocalIndex(page);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "ready",
        viewport
      }));
      await assertStaleAdvancedSearchState(page, fixture);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "stale-results",
        viewport
      }));
      await assertEmptyAdvancedSearchState(page);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "empty",
        viewport
      }));
      const rowPageNavigation = await assertRowPageNavigation(page, fixture);
      await openAdvancedSearch(page);
      const pageNavigation = await assertPageNavigation(page, fixture);
      await openAdvancedSearch(page);
      const databaseNavigation = await assertDatabaseNavigation(page, fixture);
      await openAdvancedSearch(page);
      await assertLanceDbRendererAdapterError(page);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "lancedb-error",
        viewport
      }));
      await resetAdvancedSearchIndex(page);
      await openAdvancedSearch(page);
      await assertExternalProviderError(page);
      visualSnapshots.push(await captureAdvancedSearchSnapshot({
        artifactRoot,
        page,
        phase: "external-error",
        viewport
      }));
      await closeAdvancedSearch(page);
      viewports.push({
        viewport: viewport.name,
        workspaceRoot: fixture.root,
        visualSnapshots,
        navigation: {
          rowPage: rowPageNavigation,
          page: pageNavigation,
          database: databaseNavigation
        }
      });
    });
  }

  const summary = {
    workspaceRoot: fixture.root,
    viewports,
    status: "passed"
  };
  summary.artifactContract = await assertAdvancedSearchArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  console.log(JSON.stringify(summary, null, 2));
  return summary;
});

async function openAdvancedSearch(page) {
  const existing = page.locator(".plugin-modal").filter({ hasText: "Advanced Search" }).first();
  if (await existing.count()) {
    await existing.getByRole("button", { name: "Close" }).click().catch(() => undefined);
    await existing.waitFor({ state: "detached", timeout: 3_000 }).catch(() => undefined);
  }
  const sidebarEntry = page.locator(".sidebar-footer-link").filter({ hasText: "Search & AI" }).first();
  await sidebarEntry.waitFor({ timeout: 8_000 });
  await sidebarEntry.click();
  const surface = page.locator('[data-testid="search-ai-surface"]').first();
  await surface.waitFor({ timeout: 8_000 });
  await surface.getByRole("tab", { name: "Advanced" }).click();
  await surface.getByRole("button", { name: "Open Advanced results" }).click();
  const modal = advancedSearchModal(page);
  await modal.waitFor({ timeout: 8_000 });
  await modal.locator(".advanced-search-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, "advanced search modal", 4);
  await assertNoDocumentHorizontalOverflow(page, "advanced search open");
  return modal;
}

async function closeAdvancedSearch(page) {
  const modal = advancedSearchModal(page);
  if (await modal.count()) {
    await modal.getByRole("button", { name: "Close" }).click().catch(() => undefined);
    await modal.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  }
}

function advancedSearchModal(page) {
  return page.locator(".plugin-modal").filter({ hasText: "Advanced Search" }).first();
}

async function resetAdvancedSearchIndex(page) {
  await closeAdvancedSearch(page);
  await page.evaluate(() => window.lotion.plugins.deleteFile("advanced-search", "advanced-search-index.json"));
}

async function assertInitialAdvancedSearchState(page, viewportName) {
  const modal = advancedSearchModal(page);
  await modal.getByText("Qwen3 via Ollama keeps content on this device").waitFor({ timeout: 8_000 });
  await modal.getByText("Not built").waitFor({ timeout: 8_000 });
  await modal.getByText(/Qwen3 local semantic index uses Ollama/).waitFor({ timeout: 8_000 });
  await modal.getByText(/ollama pull qwen3-embedding:0\.6b/).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Save settings" }).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Rebuild index" }).waitFor({ timeout: 8_000 });
  await modal.getByLabel("Advanced search query").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal.locator(".advanced-search-controls").first(), `advanced search controls ${viewportName}`, 4);
  await assertWithinViewport(page, modal.getByRole("button", { name: "Rebuild index" }).first(), `advanced search rebuild ${viewportName}`, 4);
}

async function rebuildLocalIndex(page) {
  const modal = advancedSearchModal(page);
  await modal.locator(".advanced-search-controls select").first().selectOption("local");
  await modal.getByRole("button", { name: "Rebuild index" }).click();
  await assertAdvancedSearchProgress(page, {
    expectedProvider: "Deterministic fallback",
    expectedStore: "JSON index",
    expectedPhase: /collecting|embedding|writing|done/
  });
  await waitForAdvancedSearchMeta(page, /Indexed \d+ chunks from \d+ items\./, 12_000);
  await waitForAdvancedSearchStatus(page, "Ready");
  await assertAdvancedSearchProgress(page, {
    expectedPercent: "100",
    expectedProvider: "Deterministic fallback",
    expectedStore: "JSON index",
    expectedPhase: "done"
  });
  const storage = await page.evaluate(() => window.lotion.plugins.readJson("advanced-search", "advanced-search-index.json"));
  if (!storage || storage.status !== "ready" || storage.config?.provider !== "local" || storage.chunks.length < 4) {
    throw new Error(`Advanced search index was not persisted: ${JSON.stringify(storage)}`);
  }
}

async function assertAdvancedSearchProgress(page, {
  expectedPercent,
  expectedPhase,
  expectedProvider,
  expectedStore
}) {
  const modal = advancedSearchModal(page);
  const progress = modal.locator('[data-testid="advanced-search-progress"]').first();
  await progress.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, progress, "advanced search progress card", 4);
  await assertNoDocumentHorizontalOverflow(page, "advanced search progress");
  let lastState;
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    const state = await progress.evaluate((node) => ({
      current: node.getAttribute("data-current") || "",
      percent: node.getAttribute("data-percent") || "",
      phase: node.getAttribute("data-phase") || "",
      text: node.textContent || "",
      total: node.getAttribute("data-total") || ""
    }));
    lastState = state;
    const phaseMatches = typeof expectedPhase === "string" ? state.phase === expectedPhase : expectedPhase.test(state.phase);
    const percentMatches = !expectedPercent || state.percent === expectedPercent;
    const metadataMatches = state.text.includes(expectedProvider) && state.text.includes(expectedStore);
    const countsMatch = Number.isFinite(Number(state.current)) && Number.isFinite(Number(state.total));
    if (phaseMatches && percentMatches && metadataMatches && countsMatch) return state;
    await page.waitForTimeout(100);
  }
  const phaseMatches = lastState && (typeof expectedPhase === "string" ? lastState.phase === expectedPhase : expectedPhase.test(lastState.phase));
  if (!phaseMatches) {
    throw new Error(`Advanced search progress phase mismatch: ${JSON.stringify(lastState)}`);
  }
  if (expectedPercent && lastState?.percent !== expectedPercent) {
    throw new Error(`Advanced search progress percent mismatch: ${JSON.stringify(lastState)}`);
  }
  if (!lastState?.text.includes(expectedProvider) || !lastState?.text.includes(expectedStore)) {
    throw new Error(`Advanced search progress metadata missing: ${JSON.stringify(lastState)}`);
  }
  throw new Error(`Advanced search progress counts are not numeric: ${JSON.stringify(lastState)}`);
}

async function assertOllamaUnavailableState(page, baseUrl) {
  const modal = advancedSearchModal(page);
  await modal.locator(".advanced-search-controls input").nth(0).fill(baseUrl);
  await modal.getByRole("button", { name: "Rebuild index" }).click();
  await waitForAdvancedSearchMeta(page, new RegExp(`Ollama is not reachable at ${escapeRegExp(baseUrl)}`), 12_000);
  await modal.locator(".advanced-search-meta").getByText(/ollama pull qwen3-embedding:0\.6b/).waitFor({ timeout: 8_000 });
  await assertAdvancedSearchProgress(page, {
    expectedProvider: "Ollama",
    expectedStore: "JSON index",
    expectedPhase: "error"
  });
  await waitForAdvancedSearchStatus(page, "Error");
}

async function assertMissingOllamaModelState(page, baseUrl) {
  const modal = advancedSearchModal(page);
  await modal.locator(".advanced-search-controls input").nth(0).fill(baseUrl);
  await modal.getByRole("button", { name: "Rebuild index" }).click();
  await waitForAdvancedSearchMeta(page, /Ollama model "qwen3-embedding:0\.6b" is missing/, 12_000);
  await modal.locator(".advanced-search-meta").getByText(/ollama pull qwen3-embedding:0\.6b/).waitFor({ timeout: 8_000 });
  await assertAdvancedSearchProgress(page, {
    expectedProvider: "Ollama",
    expectedStore: "JSON index",
    expectedPhase: "error"
  });
  await waitForAdvancedSearchStatus(page, "Error");
}

async function installAdvancedSearchFetchMock(page, { missingModelBaseUrl, unreachableBaseUrl }) {
  await page.evaluate(({ missingBaseUrl, unreachableUrl }) => {
    const key = "__lotionAdvancedSearchFetchMockInstalled";
    if (window[key]) return;
    const originalFetch = window.fetch.bind(window);
    Object.defineProperty(window, key, { value: true });
    window.fetch = async (resource, init) => {
      const url = typeof resource === "string" ? resource : resource instanceof URL ? resource.toString() : resource.url;
      if (url === `${unreachableUrl}/api/embed`) {
        throw new TypeError("Mock Ollama is unreachable");
      }
      if (url === `${missingBaseUrl}/api/embed`) {
        return new Response("model not found", {
          status: 404,
          headers: { "content-type": "text/plain" }
        });
      }
      return originalFetch(resource, init);
    };
  }, { missingBaseUrl: missingModelBaseUrl, unreachableUrl: unreachableBaseUrl });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertStaleAdvancedSearchState(page, fixture) {
  await page.evaluate(async () => {
    const index = await window.lotion.plugins.readJson("advanced-search", "advanced-search-index.json");
    index.status = "stale";
    index.staleReason = "Smoke fixture changed.";
    await window.lotion.plugins.writeJson("advanced-search", "advanced-search-index.json", index);
  });
  await closeAdvancedSearch(page);
  await openAdvancedSearch(page);
  const modal = advancedSearchModal(page);
  await waitForAdvancedSearchStatus(page, "Stale");
  await waitForAdvancedSearchMeta(page, /Smoke fixture changed/);
  await modal.getByRole("button", { name: "Update index" }).waitFor({ timeout: 8_000 });
  const input = modal.getByLabel("Advanced search query").first();
  await input.fill("retention complaints");
  await modal.locator(".advanced-search-hit").filter({ hasText: fixture.rowTitle }).first().waitFor({ timeout: 8_000 });
}

async function assertEmptyAdvancedSearchState(page) {
  const modal = advancedSearchModal(page);
  const input = modal.getByLabel("Advanced search query").first();
  await input.fill("zzzz-no-advanced-result");
  await modal.getByText("No results. Rebuild the index or try a different query.").waitFor({ timeout: 8_000 });
}

async function assertRowPageNavigation(page, fixture) {
  const modal = advancedSearchModal(page);
  const input = modal.getByLabel("Advanced search query").first();
  await input.fill("retention complaints");
  await modal.locator(".advanced-search-hit").filter({ hasText: fixture.rowTitle }).first().waitFor({ timeout: 8_000 });
  const hit = modal.locator(".advanced-search-hit").filter({ hasText: fixture.rowTitle }).first();
  await hit.locator(".advanced-search-source").getByText("Row page").waitFor({ timeout: 8_000 });
  await hit.locator(".advanced-search-hit-snippet").getByText(/retention|complaints/i).waitFor({ timeout: 8_000 });
  await hit.scrollIntoViewIfNeeded();
  await assertWithinViewport(page, hit, "advanced search row-page result", 8);
  await input.press("Enter");
  await modal.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.rowTitle,
    { timeout: 8_000 }
  );
  return {
    kind: "rowPage",
    openedTitle: await page.locator(".title-input").inputValue(),
    query: "retention complaints"
  };
}

async function assertPageNavigation(page, fixture) {
  const modal = advancedSearchModal(page);
  const input = modal.getByLabel("Advanced search query").first();
  await input.fill("Perplexity migration notes");
  const hit = modal.locator(".advanced-search-hit").filter({ hasText: fixture.pageTitle }).first();
  await hit.waitFor({ timeout: 8_000 });
  await hit.locator(".advanced-search-source").getByText("Page").waitFor({ timeout: 8_000 });
  await hit.click();
  await modal.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.pageTitle,
    { timeout: 8_000 }
  );
  return {
    kind: "page",
    openedTitle: await page.locator(".title-input").inputValue(),
    query: "Perplexity migration notes"
  };
}

async function assertDatabaseNavigation(page, fixture) {
  const modal = advancedSearchModal(page);
  const input = modal.getByLabel("Advanced search query").first();
  await input.fill("Research DB");
  const hit = modal.locator(".advanced-search-hit").filter({ hasText: fixture.databaseName }).first();
  await hit.waitFor({ timeout: 8_000 });
  await hit.locator(".advanced-search-source").getByText("Database").waitFor({ timeout: 8_000 });
  await hit.click();
  await modal.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(
    (title) => document.querySelector(".database-title-wrap h1")?.textContent?.trim() === title,
    fixture.databaseName,
    { timeout: 8_000 }
  );
  return {
    kind: "database",
    openedTitle: await page.locator(".database-title-wrap h1").first().textContent(),
    query: "Research DB"
  };
}

async function assertExternalProviderError(page) {
  const modal = advancedSearchModal(page);
  const providerSelect = modal.locator(".advanced-search-controls select").first();
  await providerSelect.selectOption("openai-compatible");
  await modal.locator(".advanced-search-controls input").nth(0).fill("https://api.deepseek.com/v1");
  await modal.locator(".advanced-search-controls input").nth(1).fill("deepseek-embedding");
  await modal.getByRole("button", { name: "Save settings" }).click();
  await modal.locator(".advanced-search-note").getByText(/compatible \/embeddings provider/).waitFor({ timeout: 8_000 });
  await modal.getByRole("button", { name: "Rebuild index" }).click();
  await waitForAdvancedSearchMeta(page, /External embeddings require base URL, model, and API key/);
  await assertAdvancedSearchProgress(page, {
    expectedProvider: "External embeddings",
    expectedStore: "JSON index",
    expectedPhase: "error"
  });
  await waitForAdvancedSearchStatus(page, "Error");
}

async function assertLanceDbRendererAdapterError(page) {
  const modal = advancedSearchModal(page);
  await modal.locator(".advanced-search-controls select").first().selectOption("local");
  await modal.locator(".advanced-search-controls select").nth(1).selectOption("lancedb");
  await modal.getByRole("button", { name: /Rebuild index|Update index/ }).click();
  await waitForAdvancedSearchMeta(page, /LanceDB vector storage requires the backend LanceDB adapter/, 12_000);
  await assertAdvancedSearchProgress(page, {
    expectedProvider: "Deterministic fallback",
    expectedStore: "LanceDB",
    expectedPhase: "error"
  });
  await waitForAdvancedSearchStatus(page, "Error");
}

async function waitForAdvancedSearchMeta(page, pattern, timeout = 8_000) {
  await advancedSearchModal(page).locator(".advanced-search-meta").getByText(pattern).waitFor({ timeout });
}

async function waitForAdvancedSearchStatus(page, label, timeout = 8_000) {
  await advancedSearchModal(page).locator(".advanced-search-status", { hasText: label }).waitFor({ timeout });
}

async function captureAdvancedSearchSnapshot({ artifactRoot, page, phase, viewport }) {
  const modal = advancedSearchModal(page);
  await modal.waitFor({ timeout: 8_000 });
  const panel = modal.locator(".advanced-search-panel").first();
  await panel.waitFor({ state: "visible", timeout: 8_000 });
  const visibleState = await collectAdvancedSearchVisibleState(page);
  const geometry = await collectAdvancedSearchGeometry(page);
  return {
    phase,
    visibleState,
    ...(await captureElementSnapshot({
      artifactRoot,
      locator: panel,
      metadata: {
        geometry,
        phase,
        visibleState,
        viewport: viewport.name
      },
      name: `advanced-search-${phase}-${viewport.name}`,
      page,
      viewport
    }))
  };
}

async function collectAdvancedSearchVisibleState(page) {
  return await page.evaluate(() => {
    const panel = document.querySelector(".advanced-search-panel");
    const text = (selector) => panel?.querySelector(selector)?.textContent?.trim() ?? "";
    const inputValue = (selector) => panel?.querySelector(selector)?.value ?? "";
    const controls = Array.from(panel?.querySelectorAll(".advanced-search-controls select") ?? []);
    const inputs = Array.from(panel?.querySelectorAll(".advanced-search-controls input") ?? []);
    const progress = panel?.querySelector('[data-testid="advanced-search-progress"]');
    const hits = Array.from(panel?.querySelectorAll(".advanced-search-hit") ?? []);
    return {
      baseUrlValue: inputs[0]?.value ?? "",
      emptyText: text(".advanced-search-empty"),
      metaText: text(".advanced-search-meta"),
      modelValue: inputs[1]?.value ?? "",
      noteText: text(".advanced-search-note"),
      progressPercent: progress?.getAttribute("data-percent") ?? "",
      progressPhase: progress?.getAttribute("data-phase") ?? "",
      progressText: progress?.textContent?.trim() ?? "",
      providerValue: controls[0]?.value ?? "",
      queryPlaceholder: panel?.querySelector(".advanced-search-query-row input")?.getAttribute("placeholder") ?? "",
      queryValue: inputValue(".advanced-search-query-row input"),
      resultCount: hits.length,
      snippets: hits.map((hit) => hit.querySelector(".advanced-search-hit-snippet")?.textContent?.trim() ?? ""),
      sources: hits.map((hit) => hit.querySelector(".advanced-search-source")?.textContent?.trim() ?? ""),
      statusLabel: text(".advanced-search-status"),
      storeValue: controls[1]?.value ?? "",
      titles: hits.map((hit) => hit.querySelector(".advanced-search-hit-title")?.textContent?.trim() ?? "")
    };
  });
}

async function collectAdvancedSearchGeometry(page) {
  return await page.evaluate(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height
      };
    };
    return {
      panel: rect(".advanced-search-panel"),
      controls: rect(".advanced-search-controls"),
      progress: rect('[data-testid="advanced-search-progress"]'),
      query: rect(".advanced-search-query-row"),
      meta: rect(".advanced-search-meta"),
      results: rect(".advanced-search-results"),
      firstHit: rect(".advanced-search-hit")
    };
  });
}

async function createAdvancedSearchFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_advanced_notes";
  const pageTitle = "Research Notes";
  const databaseId = "db_advanced_search";
  const databaseName = "Research DB";
  const rowId = "row_customer_feedback";
  const rowTitle = "Customer Feedback";
  const rowTwoId = "row_ops_logs";
  const rowTwoTitle = "Ops Logs";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowTwoPageFile = pageMarkdownFileName(rowTwoId, rowTwoTitle);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_advanced_search",
    name: "Advanced Search Smoke",
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
      icon: "emoji:🔎",
      path: serializePathValue(["Lab", pageTitle]),
      created_time: now,
      updated_time: now
    }
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nPerplexity migration notes and vector search planning.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    icon: "emoji:🧠",
    path: ["Lab", databaseName],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "row_icon", name: "Icon", type: "text", system: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "title", "page_file", "row_icon", "notes"], [
    {
      id: rowId,
      title: rowTitle,
      page_file: rowPageFile,
      row_icon: "emoji:💬",
      notes: "retention complaints customer interviews"
    },
    {
      id: rowTwoId,
      title: rowTwoTitle,
      page_file: rowTwoPageFile,
      row_icon: "emoji:🚦",
      notes: "deployment checklist"
    }
  ]);
  await writeFile(
    join(databaseDir, "pages", rowPageFile),
    `# ${rowTitle}\n\nRetention complaints from customers and support notes.\n`,
    "utf8"
  );
  await writeFile(
    join(databaseDir, "pages", rowTwoPageFile),
    `# ${rowTwoTitle}\n\nRelease checklist and deployment risks.\n`,
    "utf8"
  );

  return { root, pageTitle, databaseName, rowTitle };
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
