#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertDatabaseCreatedViewsArtifactContract } from "./lib/database-created-views-artifacts.mjs";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const CREATED_ASC_VIEW_ID = "view_created_time_asc";
const CREATED_DESC_VIEW_ID = "view_created_time_desc";

const result = await withLotionUIHarness("database-created-views-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const expectedViewports = selectedViewports();
  const viewports = [];
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createDatabaseCreatedViewsFixture(viewport.name);
    await openWorkspace(fixture.root);
    const viewportResult = await runCreatedViewsSmoke({ artifactRoot, fixture, page, viewport });
    viewports.push({
      viewport: viewport.name,
      databaseId: fixture.databaseId,
      ...viewportResult
    });
  });
  const summary = { artifactRoot, cdpUrl, viewports, status: "passed" };
  summary.artifactContract = await assertDatabaseCreatedViewsArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runCreatedViewsSmoke({ artifactRoot, fixture, page, viewport }) {
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertIntersectsViewport(page, page.locator(".database-table").first(), `created views table ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `created views initial ${viewport.name}`);

  const favoriteState = await assertDatabaseFavoriteFlow(page, fixture, viewport);
  const generatedBeforeClick = await assertGeneratedCreatedViews(page, fixture.databaseId);
  const visibleTabState = await assertVisibleViewTabs(page, ["All", "Created date asc", "Created date desc"]);

  const ascTab = page.getByRole("tab", { name: /Created date asc/i }).first();
  await ascTab.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: /Created date asc/i }).first().waitFor({ timeout: 8_000 });
  await page.locator(".view-tab.active").filter({ hasText: "Created date asc" }).waitFor({ timeout: 8_000 });
  const keyboardActivatedTab = await page.locator(".view-tab.active").first().textContent();
  const ascFirstTitle = await waitForFirstVisibleRowTitle(page, fixture.ascendingFirstTitle);
  await assertNoDocumentHorizontalOverflow(page, `created views asc ${viewport.name}`);

  await page.getByRole("tab", { name: /Created date desc/i }).first().click();
  await page.locator(".view-tab.active").filter({ hasText: "Created date desc" }).waitFor({ timeout: 8_000 });
  const descFirstTitle = await waitForFirstVisibleRowTitle(page, fixture.descendingFirstTitle);
  await assertNoDocumentHorizontalOverflow(page, `created views desc ${viewport.name}`);

  const tabsBar = page.locator(".view-tabs-bar").first();
  const activeTab = page.locator(".view-tab.active").first();
  await assertIntersectsViewport(page, tabsBar, `created views tabs ${viewport.name}`, 4);
  await assertIntersectsViewport(page, activeTab, `created views active tab ${viewport.name}`, 4);

  const generatedAfterReload = await assertGeneratedCreatedViews(page, fixture.databaseId);
  const layout = await captureCreatedViewsLayout(page);
  const evidence = {
    activeTabRect: layout.activeTabRect,
    activeTabText: layout.activeTabText,
    ascFirstTitle,
    databaseName: fixture.databaseName,
    descFirstTitle,
    generatedViewCountAfterReload: generatedAfterReload.generatedViewIds.length,
    generatedViewIds: generatedBeforeClick.generatedViewIds,
    favoriteState,
    keyboardActivatedTab: (keyboardActivatedTab ?? "").trim(),
    noHorizontalOverflow: true,
    phase: "database-created-views",
    tableRect: layout.tableRect,
    tabsRect: layout.tabsRect,
    viewport: viewport.name,
    visibleTabs: visibleTabState.tabs
  };
  const snapshot = await captureCreatedViewsSnapshot({
    artifactRoot,
    evidence,
    page,
    table: page.locator(".database-table").first(),
    viewport
  });
  return {
    ...evidence,
    snapshot
  };
}

async function assertDatabaseFavoriteFlow(page, fixture, viewport) {
  const favoriteToggle = page.locator(".page-action-bar .favorite-toggle").first();
  await favoriteToggle.waitFor({ timeout: 8_000 });
  await assertIntersectsViewport(page, favoriteToggle, `database favorite toggle ${viewport.name}`, 4);
  const initialPressed = await favoriteToggle.getAttribute("aria-pressed");
  if (initialPressed !== "false") {
    throw new Error(`Database favorite should start unpressed in ${viewport.name}: ${initialPressed}`);
  }

  await favoriteToggle.click();
  const added = await waitForDatabaseFavoriteState(page, fixture, true);
  await assertNoDocumentHorizontalOverflow(page, `database favorite add ${viewport.name}`);

  await favoriteToggle.click();
  const removed = await waitForDatabaseFavoriteState(page, fixture, false);

  await favoriteToggle.click();
  const final = await waitForDatabaseFavoriteState(page, fixture, true);
  await assertNoDocumentHorizontalOverflow(page, `database favorite final ${viewport.name}`);

  return {
    added,
    final,
    initialPressed,
    removed
  };
}

async function waitForDatabaseFavoriteState(page, fixture, expected) {
  return pollPageValue(
    page,
    async ({ databaseId, databaseName, expectedState }) => {
      const button = document.querySelector(".page-action-bar .favorite-toggle");
      const favorites = await window.lotion.favorites.list();
      const favoriteSection = Array.from(document.querySelectorAll(".nav-section")).find((section) =>
        /^(Favorites|收藏)$/.test(section.querySelector(".section-heading")?.textContent?.trim() ?? "")
      );
      const labels = Array.from(favoriteSection?.querySelectorAll(".nav-item-label") ?? [])
        .map((node) => node.textContent?.trim() ?? "");
      const manifestHasDatabase = favorites.some((item) => item.type === "database" && item.id === databaseId);
      const sidebarHasDatabase = labels.includes(databaseName);
      const pressed = button?.getAttribute("aria-pressed") === "true";
      return {
        buttonClass: button?.getAttribute("class") ?? "",
        labels,
        manifestHasDatabase,
        ok: pressed === expectedState && manifestHasDatabase === expectedState && sidebarHasDatabase === expectedState,
        pressed,
        sidebarHasDatabase
      };
    },
    { databaseId: fixture.databaseId, databaseName: fixture.databaseName, expectedState: expected },
    (value) => Boolean(value?.ok),
    `database favorite state ${expected ? "on" : "off"}`
  );
}

async function navigateToDatabase(page, databaseId) {
  await page.evaluate((targetDatabaseId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId: targetDatabaseId }
    }));
  }, databaseId);
}

async function waitForDatabaseService(page, databaseId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await pollPageValue(page, async (targetDatabaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === targetDatabaseId);
  }, databaseId, Boolean, "database service readiness");
}

async function assertGeneratedCreatedViews(page, databaseId) {
  return pollPageValue(
    page,
    async (targetDatabaseId) => {
      const bundle = await window.lotion.databases.get(targetDatabaseId);
      const asc = bundle.views.filter((view) => view.id === "view_created_time_asc");
      const desc = bundle.views.filter((view) => view.id === "view_created_time_desc");
      return {
        ascCount: asc.length,
        descCount: desc.length,
        defaultViewId: bundle.schema.defaultViewId,
        generatedViewIds: [...asc, ...desc].map((view) => view.id),
        ok: asc.length === 1 &&
          desc.length === 1 &&
          asc[0]?.sorts?.[0]?.fieldId === "created_time" &&
          asc[0]?.sorts?.[0]?.direction === "asc" &&
          desc[0]?.sorts?.[0]?.fieldId === "created_time" &&
          desc[0]?.sorts?.[0]?.direction === "desc" &&
          bundle.views[0]?.id === bundle.schema.defaultViewId
      };
    },
    databaseId,
    (value) => Boolean(value?.ok),
    "generated created-date views"
  );
}

async function assertVisibleViewTabs(page, expectedLabels) {
  return pollPageValue(
    page,
    (labels) => {
      const tabs = Array.from(document.querySelectorAll(".view-tab"))
        .map((tab) => tab.textContent?.trim() ?? "");
      return {
        tabs,
        ok: labels.every((label) => tabs.some((tab) => tab.includes(label)))
      };
    },
    expectedLabels,
    (value) => Boolean(value?.ok),
    "created-date view tabs"
  );
}

async function captureCreatedViewsLayout(page) {
  return page.evaluate(() => {
    const table = document.querySelector(".database-table");
    const tabsBar = document.querySelector(".view-tabs-bar");
    const activeTab = document.querySelector(".view-tab.active");
    const visibleTabs = Array.from(document.querySelectorAll(".view-tab"))
      .map((tab) => tab.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    return {
      activeTabRect: rectFor(activeTab),
      activeTabText: activeTab?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      tableRect: rectFor(table),
      tabsRect: rectFor(tabsBar),
      visibleTabs
    };

    function rectFor(element) {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: Number(rect.bottom.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        top: Number(rect.top.toFixed(1)),
        width: Number(rect.width.toFixed(1))
      };
    }
  });
}

async function captureCreatedViewsSnapshot({ artifactRoot, evidence, page, table, viewport }) {
  await table.scrollIntoViewIfNeeded();
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: table,
    metadata: evidence,
    name: `database-created-views-${viewport.name}`,
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

async function waitForFirstVisibleRowTitle(page, expectedTitle) {
  const state = await pollPageValue(
    page,
    (title) => {
      const rows = Array.from(document.querySelectorAll(".database-table tbody tr"))
        .filter((row) => !row.classList.contains("virtual-spacer") && !row.classList.contains("add-row"));
      const first = rows[0];
      return {
        firstText: first?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        rowCount: rows.length,
        ok: Boolean(first?.textContent?.includes(title))
      };
    },
    expectedTitle,
    (value) => Boolean(value?.ok),
    `first visible row ${expectedTitle}`
  );
  return state.firstText;
}

async function pollPageValue(page, evaluate, arg, isReady, label, timeout = 8_000) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeout) {
    lastValue = await page.evaluate(evaluate, arg);
    if (isReady(lastValue)) return lastValue;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} timed out. Last value: ${JSON.stringify(lastValue)}`);
}

async function createDatabaseCreatedViewsFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-database-created-views-${safeViewport}-`));
  const now = "2026-06-01T00:00:00.000Z";
  const homeId = `pg_created_views_home_${safeViewport}`;
  const homeTitle = "Created Views Smoke Home";
  const databaseId = `db_created_views_${safeViewport}`;
  const databaseName = "Created Views Smoke DB";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_created_views_${safeViewport}`,
    name: "Created Views Smoke",
    pages: [homeId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: homeId,
      title: homeTitle,
      now,
      icon: "emoji:🗓️",
      path: ["Created Views", homeTitle],
      bodyPath: homePath
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nCreated-date views smoke workspace.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "row_icon", name: "Icon", type: "text", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "row_icon",
    "notes"
  ], [
    {
      id: "row_mid",
      created_time: "2025-01-01T00:00:00.000Z",
      updated_time: now,
      title: "Middle created row",
      page_file: "",
      row_icon: "",
      notes: "Middle row notes"
    },
    {
      id: "row_new",
      created_time: "2026-01-01T00:00:00.000Z",
      updated_time: now,
      title: "Newest created row",
      page_file: "",
      row_icon: "",
      notes: "Newest row notes with more content for field richness"
    },
    {
      id: "row_old",
      created_time: "2024-01-01T00:00:00.000Z",
      updated_time: now,
      title: "Oldest created row",
      page_file: "",
      row_icon: "",
      notes: "Oldest row notes"
    }
  ]);

  return {
    root,
    databaseId,
    databaseName,
    ascendingFirstTitle: "Oldest created row",
    descendingFirstTitle: "Newest created row"
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
