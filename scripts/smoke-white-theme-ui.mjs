#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";
import { assertWhiteThemeArtifactContract } from "./lib/white-theme-artifacts.mjs";

const EXPECTED = {
  paper: "#ffffff",
  sand: "#f7f7f4",
  vellum: "#f0f1ee",
  kraft: "#e7e9e3",
  shell: "#f3f4f0",
  rule: "#e6e8e2",
  ruleStrong: "#d3d8cf",
  accent: "#5067a5"
};

const result = await withLotionUIHarness("white-theme-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const expectedViewports = selectedViewports();
  const viewports = [];

  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createWhiteThemeFixture(viewport.name);
    await openWorkspace(fixture.root);
    await openPage(page, fixture.pageId);
    await waitForWhiteThemePage(page, fixture.pageTitle);

    const pageState = await assertPageTheme(page, viewport.name);
    const pageSnapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".app-shell").first(),
      metadata: { phase: "page", pageState },
      name: `white-theme-page-${viewport.name}`,
      page,
      viewport
    });

    const searchState = await assertSearchTheme(page, viewport.name);
    const searchSnapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".global-search").first(),
      metadata: { phase: "search", searchState },
      name: `white-theme-search-${viewport.name}`,
      page,
      viewport
    });
    await page.keyboard.press("Escape");
    await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });

    const databaseState = await assertDatabaseTheme(page, fixture, viewport.name);
    const databaseSnapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".main-area").first(),
      metadata: { phase: "database", databaseState },
      name: `white-theme-database-${viewport.name}`,
      page,
      viewport
    });

    await openPage(page, fixture.pageId);
    await waitForWhiteThemePage(page, fixture.pageTitle);
    const pluginState = await assertPluginModalTheme(page, viewport.name);
    const pluginSnapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first(),
      metadata: { phase: "plugin", pluginState },
      name: `white-theme-plugin-${viewport.name}`,
      page,
      viewport
    });
    await page.getByRole("button", { name: "Close LLM Chat" }).click();
    await page.waitForSelector(".openai-llm-assistant-shell", { state: "detached", timeout: 5_000 });

    const snapshots = [
      snapshotEntry("page", pageSnapshot, pageState),
      snapshotEntry("search", searchSnapshot, searchState),
      snapshotEntry("database", databaseSnapshot, databaseState),
      snapshotEntry("plugin", pluginSnapshot, pluginState)
    ];

    viewports.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      pageState,
      searchState,
      databaseState,
      pluginState,
      snapshots
    });
  });

  const summary = {
    cdpUrl,
    status: "passed",
    viewports
  };
  return {
    ...summary,
    artifactContract: await assertWhiteThemeArtifactContract(summary, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    })
  };
});

console.log(JSON.stringify(result, null, 2));

function snapshotEntry(phase, snapshot, state) {
  return {
    phase,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    state
  };
}

async function waitForWhiteThemePage(page, pageTitle) {
  await page.waitForFunction((title) => {
    const editor = document.querySelector('[data-testid="markdown-editor"]');
    const rect = editor?.getBoundingClientRect();
    return Boolean(
      editor &&
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      editor.textContent?.includes(title)
    );
  }, pageTitle, { timeout: 20_000 });
}

async function assertPageTheme(page, viewportName) {
  await assertNoDocumentHorizontalOverflow(page, `white page ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator(".sidebar").first(), `white sidebar ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator(".main-area").first(), `white main ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator('[data-testid="markdown-editor"]').first(), `white editor ${viewportName}`, 8);

  const state = await readThemeState(page, {
    html: "html",
    sidebar: ".sidebar",
    mainArea: ".main-area",
    tabStrip: ".tab-strip",
    activeTab: ".tab.active",
    searchBox: ".search-box",
    activeNavIcon: ".nav-item.active .nav-item-icon",
    pageHeader: ".page-header",
    editor: '[data-testid="markdown-editor"]'
  });

  assertTokens(state.tokens);
  assertBackground(state.surfaces.html, EXPECTED.sand, "html");
  assertBackground(state.surfaces.sidebar, EXPECTED.sand, "sidebar");
  assertBackground(state.surfaces.mainArea, EXPECTED.paper, "main area");
  assertBackground(state.surfaces.tabStrip, EXPECTED.sand, "tab strip");
  assertBackground(state.surfaces.activeTab, EXPECTED.paper, "active tab");
  assertBackground(state.surfaces.searchBox, EXPECTED.paper, "search box");
  assertBorderColor(state.surfaces.searchBox, EXPECTED.ruleStrong, "search box");
  assertTextColor(state.surfaces.activeNavIcon, EXPECTED.accent, "active nav icon");
  return state;
}

async function assertSearchTheme(page, viewportName) {
  await openGlobalSearch(page);
  const search = page.locator(".global-search").first();
  await assertIntersectsViewport(page, search, `white global search ${viewportName}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `white global search ${viewportName}`, 8);
  await page.locator(".global-search-input").first().fill("White Theme Page");
  await page.locator(".global-search-hit").first().waitFor({ timeout: 8_000 });

  const state = await readThemeState(page, {
    dialog: ".global-search",
    input: ".global-search-input",
    filters: ".global-search-filters",
    hit: ".global-search-hit"
  });
  assertBackground(state.surfaces.dialog, EXPECTED.paper, "global search dialog");
  assertBackground(state.surfaces.input, EXPECTED.paper, "global search input");
  assertBackground(state.surfaces.filters, EXPECTED.paper, "global search filters");
  const focusState = await page.evaluate(() => ({
    activeClass: typeof document.activeElement?.className === "string" ? document.activeElement.className : "",
    isInput: document.activeElement?.classList.contains("global-search-input") === true
  }));
  if (!focusState.isInput) throw new Error(`Global search did not keep keyboard focus: ${JSON.stringify(focusState)}`);
  return { ...state, focusState };
}

async function assertDatabaseTheme(page, fixture, viewportName) {
  await page.evaluate((databaseId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId: databaseId }
    }));
  }, fixture.databaseId);
  await page.getByText(fixture.databaseTitle).first().waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `white database ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator(".database-toolbar").first(), `white database toolbar ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator(".database-table").first(), `white database table ${viewportName}`, 8);
  const state = await readThemeState(page, {
    mainArea: ".main-area",
    toolbar: ".database-toolbar",
    table: ".database-table",
    tableScroll: ".table-scroll",
    tableCell: ".database-table td"
  });
  assertBackground(state.surfaces.mainArea, EXPECTED.paper, "database main area");
  assertBackground(state.surfaces.toolbar, EXPECTED.paper, "database toolbar");
  return state;
}

async function assertPluginModalTheme(page, viewportName) {
  const entry = page.locator(".sidebar-footer-link").filter({ hasText: "Search & AI" }).first();
  await entry.waitFor({ timeout: 8_000 });
  await entry.click();
  const surface = page.locator('[data-testid="search-ai-surface"]').first();
  await surface.waitFor({ timeout: 8_000 });
  await surface.getByRole("tab", { name: "LLM Chat" }).click();
  await surface.getByRole("button", { name: "Open LLM Chat" }).click();
  const panel = page.locator(".openai-llm-assistant-shell").filter({ hasText: "LLM Chat" }).first();
  await panel.waitFor({ timeout: 8_000 });
  await panel.locator(".openai-llm-chat").waitFor({ timeout: 8_000 });
  await assertIntersectsViewport(page, panel, `white LLM assistant ${viewportName}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `white LLM assistant ${viewportName}`, 8);

  const state = await readThemeState(page, {
    panel: ".openai-llm-assistant-panel",
    chat: ".openai-llm-chat",
    history: ".openai-llm-chat-history",
    composer: ".openai-llm-chat-composer",
    input: ".openai-llm-chat-input"
  });
  assertBackground(state.surfaces.panel, EXPECTED.paper, "LLM assistant panel");
  assertBackground(state.surfaces.chat, EXPECTED.paper, "LLM chat");
  assertLightThemeBackground(state.surfaces.history, "LLM history");
  assertLightThemeBackground(state.surfaces.composer, "LLM composer");
  assertBackground(state.surfaces.input, EXPECTED.paper, "LLM input");
  return state;
}

async function openGlobalSearch(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("lotion:open-search", { detail: { pattern: "" } }));
  });
  await page.waitForSelector(".global-search-input", { timeout: 5_000 });
}

async function readThemeState(page, selectors) {
  return page.evaluate((targetSelectors) => {
    const root = getComputedStyle(document.documentElement);
    return {
      tokens: {
        paper: root.getPropertyValue("--paper").trim(),
        sand: root.getPropertyValue("--sand").trim(),
        vellum: root.getPropertyValue("--vellum").trim(),
        kraft: root.getPropertyValue("--kraft").trim(),
        shell: root.getPropertyValue("--shell").trim(),
        rule: root.getPropertyValue("--rule").trim(),
        ruleStrong: root.getPropertyValue("--rule-strong").trim(),
        accent: root.getPropertyValue("--accent").trim()
      },
      surfaces: Object.fromEntries(Object.entries(targetSelectors).map(([key, selector]) => {
        const element = document.querySelector(selector);
        if (!element) return [key, null];
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return [key, {
          selector,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          color: style.color,
          outlineColor: style.outlineColor,
          rect: {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }
        }];
      }))
    };
  }, selectors);
}

function assertTokens(tokens) {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const actual = normalizeHex(tokens[key]);
    if (actual !== expected) {
      throw new Error(`Expected theme token ${key}=${expected}, got ${tokens[key]} (${actual})`);
    }
  }
}

function assertBackground(surface, expected, label) {
  if (!surface) throw new Error(`Missing ${label} surface.`);
  const actual = normalizeColor(surface.backgroundColor);
  if (actual !== expected) {
    throw new Error(`Expected ${label} background ${expected}, got ${surface.backgroundColor} (${actual})`);
  }
}

function assertBorderColor(surface, expected, label) {
  if (!surface) throw new Error(`Missing ${label} surface.`);
  const actual = normalizeColor(surface.borderColor);
  if (actual !== expected) {
    throw new Error(`Expected ${label} border ${expected}, got ${surface.borderColor} (${actual})`);
  }
}

function assertTextColor(surface, expected, label) {
  if (!surface) throw new Error(`Missing ${label} surface.`);
  const actual = normalizeColor(surface.color);
  if (actual !== expected) {
    throw new Error(`Expected ${label} color ${expected}, got ${surface.color} (${actual})`);
  }
}

function assertLightThemeBackground(surface, label) {
  if (!surface) throw new Error(`Missing ${label} surface.`);
  const actual = normalizeColor(surface.backgroundColor);
  const allowed = new Set([EXPECTED.paper, EXPECTED.sand, EXPECTED.vellum]);
  if (!allowed.has(actual)) {
    throw new Error(`Expected ${label} to use a light theme background token, got ${surface.backgroundColor} (${actual})`);
  }
}

function normalizeHex(value) {
  const trimmed = String(value ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  return normalizeColor(trimmed);
}

function normalizeColor(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(text);
  if (hex) return `#${hex[1]}`;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/.exec(text);
  if (!rgb) return text;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (alpha === 0) return "transparent";
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

async function createWhiteThemeFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-white-theme-${safeViewport}-`));
  const now = "2026-06-15T00:00:00.000Z";
  const pageId = `pg_white_theme_${safeViewport}`;
  const pageTitle = "White Theme Page";
  const databaseId = `db_white_theme_${safeViewport}`;
  const databaseTitle = "White Theme Database";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseFolder = databaseFolderName(databaseId, databaseTitle);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_white_theme_${safeViewport}`,
    name: "White Theme Smoke",
    pages: [pageId],
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
      icon: "emoji:⬜",
      path: ["Smoke", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), [
    `# ${pageTitle}`,
    "",
    "This page validates the default white Lotion light theme.",
    "",
    "- Sidebar, editor, search, and plugin surfaces should read white.",
    ""
  ].join("\n"), "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseTitle,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes", "created_time"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "created_time", "updated_time", "title", "notes"], [
    {
      id: "row_white_1",
      created_time: "2026-06-14T10:00:00.000Z",
      updated_time: "2026-06-14T10:00:00.000Z",
      title: "White database row",
      notes: "Light theme table surface"
    }
  ]);

  return { root, pageId, pageTitle, databaseId, databaseTitle };
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
      { id: "title", name: "Name", type: "title" },
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
