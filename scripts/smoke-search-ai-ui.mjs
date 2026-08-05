#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertSearchAiArtifactContract } from "./lib/search-ai-artifacts.mjs";
import { assertProductionVisualBaseline } from "./lib/production-visual-baseline.mjs";
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

const result = await withLotionUIHarness("search-ai-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createSearchAiFixture(viewport.name);
    await openWorkspace(fixture.root);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
    await assertUnifiedSidebarEntry(page, viewport.name);
    await openSearchAi(page);
    const surface = page.locator('[data-testid="search-ai-surface"]').first();
    await assertSearchAiLayout(page, surface, `initial ${viewport.name}`);
    const search = await assertSearchAiSearchTab(page, surface, fixture, viewport.name);
    const advanced = await assertSearchAiAdvancedTab(page, surface, viewport.name);
    const chat = await assertSearchAiChatTab(page, surface, fixture, viewport.name);
    await stabilizeSearchAiSnapshot(page, surface);
    await prepareSearchAiSnapshot(page, surface);
    let visibleState;
    let snapshot;
    try {
      visibleState = await collectSearchAiVisibleState(surface);
      snapshot = await captureElementSnapshot({
        artifactRoot,
        name: `search-ai-${viewport.name}`,
        locator: surface,
        metadata: {
          phase: "search-ai",
          search,
          advanced,
          chat,
          visibleState,
          viewport: viewport.name
        },
        page,
        viewport
      });
    } finally {
      await restoreSearchAiSnapshot(page, surface);
    }
    const baselinePolicy = {
      compact: "test/baselines/production-visual/search-ai-chat-handoff-compact.json",
      desktop: "test/baselines/production-visual/search-ai-chat-handoff-desktop.json",
      wide: "test/baselines/production-visual/search-ai-chat-handoff-wide.json"
    }[viewport.name];
    snapshot.perceptualBaseline = baselinePolicy && process.env.LOTION_SEARCH_AI_SKIP_BASELINE !== "1"
      ? await assertProductionVisualBaseline({
        actualPath: snapshot.imagePath,
        artifactRoot,
        policyPath: baselinePolicy
      })
      : null;
    await surface.getByRole("button", { name: "Close Search and AI" }).click();
    await surface.waitFor({ state: "detached", timeout: 5_000 });
    viewports.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      snapshot,
      search,
      advanced,
      chat
    });
  });
  const summary = { cdpUrl, viewports, status: "passed" };
  summary.artifactContract = await assertSearchAiArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name),
    requiredPerceptualBaselineViewportNames: process.env.LOTION_SEARCH_AI_SKIP_BASELINE === "1"
      ? []
      : expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function stabilizeSearchAiSnapshot(page, surface) {
  await page.mouse.move(0, 0);
  await surface.evaluate(async (root) => {
    if (root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await Promise.all(root.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function prepareSearchAiSnapshot(page, surface) {
  await surface.evaluate((root) => {
    root.setAttribute("data-search-ai-snapshot-inline-style", root.getAttribute("style") ?? "");
    root.style.boxSizing = "border-box";
    root.style.width = "880px";
    root.style.height = "368px";
    root.style.minWidth = "880px";
    root.style.maxWidth = "880px";
    root.style.minHeight = "368px";
    root.style.maxHeight = "368px";
    root.style.overflow = "hidden";
  });
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-search-ai-snapshot-style", "true");
    style.textContent = `
      [data-testid="search-ai-surface"],
      [data-testid="search-ai-surface"] * {
        -webkit-font-smoothing: antialiased !important;
        font-feature-settings: normal !important;
        font-kerning: none !important;
        font-optical-sizing: none !important;
        font-variant-ligatures: none !important;
        text-rendering: geometricPrecision !important;
      }
    `;
    document.head.appendChild(style);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function restoreSearchAiSnapshot(page, surface) {
  await surface.evaluate((root) => {
    const original = root.getAttribute("data-search-ai-snapshot-inline-style") ?? "";
    if (original) root.setAttribute("style", original);
    else root.removeAttribute("style");
    root.removeAttribute("data-search-ai-snapshot-inline-style");
  });
  await page.evaluate(() => {
    for (const style of document.querySelectorAll("[data-search-ai-snapshot-style]")) style.remove();
  });
}

async function collectSearchAiVisibleState(surface) {
  return await surface.evaluate((root) => {
    const rect = (node) => {
      if (!(node instanceof Element)) return null;
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
    const surfaceRect = root.getBoundingClientRect();
    const selected = root.querySelector('[data-testid="search-ai-selected-source"]');
    const selectedRect = selected?.getBoundingClientRect();
    const primaryTabs = Array.from(root.querySelectorAll(".search-ai-primary-tabs [role=tab]"));
    const text = root.textContent || "";
    return {
      activePrimaryTab: root.querySelector(".search-ai-primary-tabs [aria-selected=true]")?.textContent?.trim() ?? "",
      primaryTabs: primaryTabs.map((tab) => {
        const tabRect = tab.getBoundingClientRect();
        return {
          label: tab.textContent?.trim() ?? "",
          fullyVisible: tabRect.left >= surfaceRect.left && tabRect.right <= surfaceRect.right + 0.5
        };
      }),
      selectedSource: {
        title: selected?.querySelector("strong")?.textContent?.trim() ?? "",
        subtitle: selected?.querySelector("small")?.textContent?.trim() ?? "",
        clientWidth: selected instanceof HTMLElement ? selected.clientWidth : 0,
        scrollWidth: selected instanceof HTMLElement ? selected.scrollWidth : 0,
        fullyVisible: Boolean(
          selectedRect
          && selectedRect.width > 0
          && selectedRect.height > 0
          && selectedRect.top >= surfaceRect.top
          && selectedRect.bottom <= surfaceRect.bottom + 0.5
        ),
        rect: rect(selected)
      },
      storageLeakMatches: text.match(/databases\/(?:user|system)\/\S+|--(?:db|row|pg)_[a-z0-9_-]+|(?:data\.csv|[A-Za-z0-9_-]+--(?:row|pg)_[A-Za-z0-9_-]+\.md)/gi) || [],
      surface: rect(root)
    };
  });
}

async function assertUnifiedSidebarEntry(page, label) {
  const footerLabels = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".sidebar-footer-link .nav-item-label"))
      .map((item) => item.textContent?.trim() ?? "")
  );
  if (!footerLabels.includes("Search & AI")) {
    throw new Error(`Search & AI sidebar entry missing in ${label}: ${JSON.stringify(footerLabels)}`);
  }
  if (footerLabels.includes("Advanced Search") || footerLabels.includes("LLM Chat")) {
    throw new Error(`Search workflow should not expose separate sidebar entries in ${label}: ${JSON.stringify(footerLabels)}`);
  }
}

async function openSearchAi(page) {
  const entry = page.locator(".sidebar-footer-link").filter({ hasText: "Search & AI" }).first();
  await entry.waitFor({ timeout: 8_000 });
  await entry.click();
  await page.locator('[data-testid="search-ai-surface"]').waitFor({ timeout: 8_000 });
}

async function assertSearchAiSearchTab(page, surface, fixture, label) {
  await surface.getByRole("tab", { name: "Search" }).waitFor({ timeout: 8_000 });
  await surface.getByRole("tab", { name: "LLM Chat" }).waitFor({ timeout: 8_000 });
  const query = surface.getByLabel("Search and AI query").first();
  await query.waitFor({ timeout: 8_000 });
  await query.fill(fixture.query);
  await surface.locator(".search-ai-hit").filter({ hasText: fixture.pageTitle }).first().waitFor({ timeout: 8_000 });
  await surface.locator(".search-ai-hit").filter({ hasText: fixture.databaseName }).first().waitFor({ timeout: 8_000 });
  const rowHit = surface.locator(".search-ai-hit").filter({ hasText: fixture.rowTitle }).first();
  await rowHit.waitFor({ timeout: 8_000 });
  await rowHit.hover();
  await assertSearchAiLayout(page, surface, `search results ${label}`);
  const rows = await surface.locator(".search-ai-hit").evaluateAll((hits) =>
    hits.slice(0, 8).map((hit) => hit.textContent?.trim() ?? "")
  );
  if (!rows.some((row) => row.includes(fixture.query))) {
    throw new Error(`Search & AI result rows did not include query context: ${JSON.stringify(rows)}`);
  }
  return {
    databaseName: fixture.databaseName,
    pageTitle: fixture.pageTitle,
    query: fixture.query,
    rowTitle: fixture.rowTitle,
    rows
  };
}

async function assertSearchAiAdvancedTab(page, surface, label) {
  await surface.getByRole("tab", { name: "Advanced" }).click();
  const advanced = surface.locator('[data-testid="search-ai-advanced-tab"]').first();
  await advanced.waitFor({ timeout: 8_000 });
  await advanced.getByText("Local semantic index").waitFor({ timeout: 8_000 });
  await advanced.getByRole("button", { name: "Open Advanced results" }).waitFor({ timeout: 8_000 });
  await advanced.getByRole("button", { name: "Search & AI Settings" }).waitFor({ timeout: 8_000 });
  await advanced.getByRole("button", { name: "Search & AI Settings" }).focus();
  await assertSearchAiLayout(page, surface, `advanced ${label}`);
  return {
    text: (await advanced.textContent({ timeout: 5_000 }))?.trim() ?? ""
  };
}

async function assertSearchAiChatTab(page, surface, fixture, label) {
  await surface.getByRole("tab", { name: "LLM Chat" }).click();
  const chat = surface.locator('[data-testid="search-ai-chat-tab"]').first();
  await chat.waitFor({ timeout: 8_000 });
  await chat.getByText("Workspace assistant").waitFor({ timeout: 8_000 });
  await chat.getByRole("button", { name: "Open LLM Chat" }).waitFor({ timeout: 8_000 });
  await chat.getByRole("button", { name: "LLM settings" }).waitFor({ timeout: 8_000 });
  const selected = chat.locator('[data-testid="search-ai-selected-source"]').first();
  await selected.waitFor({ timeout: 8_000 });
  await selected.getByText(fixture.rowTitle).waitFor({ timeout: 8_000 });
  await chat.getByRole("button", { name: "Open LLM Chat" }).focus();
  await assertSearchAiLayout(page, surface, `chat ${label}`);
  return {
    selected: (await selected.textContent({ timeout: 5_000 }))?.trim() ?? ""
  };
}

async function assertSearchAiLayout(page, surface, label) {
  await assertWithinViewport(page, surface, `Search & AI surface ${label}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `Search & AI ${label}`, 8);
  const geometry = await surface.evaluate((root) => {
    const rect = root.getBoundingClientRect();
    const buttons = Array.from(root.querySelectorAll("button"));
    return {
      width: rect.width,
      height: rect.height,
      overflowX: getComputedStyle(root).overflowX,
      buttonCount: buttons.length,
      focusVisible: Boolean(root.querySelector(":focus"))
    };
  });
  if (geometry.width <= 320 || geometry.height <= 240 || geometry.buttonCount < 5) {
    throw new Error(`Search & AI layout is not usable in ${label}: ${JSON.stringify(geometry)}`);
  }
  return geometry;
}

async function createSearchAiFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-search-ai-${safeViewport}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `pg_search_ai_${safeViewport}`;
  const pageTitle = "Search AI Unified Home";
  const databaseId = `db_search_ai_${safeViewport}`;
  const databaseName = "Knowledge Base";
  const rowId = `row_search_ai_${safeViewport}`;
  const rowTitle = "Semantic Orchard Row";
  const query = "semantic orchard";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_search_ai_${safeViewport}`,
    name: "Search AI Smoke",
    pages: [pageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID],
    recents: []
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: pageId,
      title: pageTitle,
      now,
      icon: "emoji:⌕",
      path: ["Smoke", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nThe ${query} page verifies unified search and AI.\n`, "utf8");
  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    icon: "emoji:🧠",
    tags: [],
    path: ["Smoke", databaseName],
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
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "row_icon",
    "page_file",
    "notes"
  ], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    row_icon: "emoji:🧭",
    page_file: rowPageFile,
    notes: `${query} row verifies selected source handoff.`
  }]);
  await writeFile(join(root, rowPagePath), `# ${rowTitle}\n\nThe ${query} row page is available to Search & AI.\n`, "utf8");

  return { root, pageId, pageTitle, databaseName, query, rowTitle };
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

function pagesSchema(now) {
  return {
    id: PAGES_DATABASE_ID,
    name: "All pages",
    icon: "emoji:📄",
    path: ["All pages"],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: pagesFieldIds().map((id) => ({
      id,
      name: id === "title" ? "Title" : id,
      type: id === "path" || id === "tags" ? "multi_select" : id === "created_time" || id === "updated_time" ? "created_time" : "text",
      system: id !== "title"
    }))
  };
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
    database_id: "",
    row_id: "",
    page_file: ""
  };
}

function defaultView(databaseId, visibleFieldIds) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    sorts: [],
    filters: [],
    pageSize: 50
  };
}
