#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertProductionVisualBaseline } from "./lib/production-visual-baseline.mjs";
import { assertSettingsCenterArtifactContract } from "./lib/settings-center-artifacts.mjs";
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

const result = await withLotionUIHarness("settings-center-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createSettingsCenterFixture(viewport.name);
    await openWorkspace(fixture.root);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });

    await openSettingsFromSidebar(page);
    const initial = await assertSettingsCenter(page, viewport.name, "General");
    const originalDateTimeDefaults = await readDateTimeDefaultSettings(page);
    let dateTimeDefaults;
    let dateTimeSnapshot;
    try {
      dateTimeDefaults = await verifyDateTimeDefaultSettings(page, viewport.name);
      dateTimeSnapshot = await captureElementSnapshot({
        artifactRoot,
        locator: page.locator('[data-testid="settings-center"]').first(),
        metadata: { dateTimeDefaults, phase: "global-date-time-defaults", viewport: viewport.name },
        name: `settings-center-date-time-${viewport.name}`,
        page,
        viewport
      });
    } finally {
      await restoreDateTimeDefaultSettings(page, originalDateTimeDefaults, viewport.name);
    }
    const searchJump = await verifySettingsSearchJump(page, viewport.name);
    const searchAiDeepLink = await verifySearchAiSettingsDeepLink(page, viewport.name);
    const importSection = await verifyPluginSettingsSection(page, viewport.name, "Import", ["Latest import report", "Audit imported workspace"]);
    const pluginsSection = await verifyPluginSettingsSection(page, viewport.name, "Plugins", ["Installed plugins", "Open plugin manager"]);
    const snapshotState = await stabilizeSettingsSnapshot(page, viewport.name);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator('[data-testid="settings-center"]').first(),
      metadata: {
        initial,
        dateTimeDefaults,
        importSection,
        pluginsSection,
        searchAiDeepLink,
        searchJump,
        snapshotState,
        viewport: viewport.name
      },
      name: `settings-center-${viewport.name}`,
      page,
      viewport
    });
    const baselinePolicy = {
      compact: "test/baselines/production-visual/settings-center-compact.json",
      desktop: "test/baselines/production-visual/settings-center-desktop.json",
      wide: "test/baselines/production-visual/settings-center-wide.json"
    }[viewport.name];
    const perceptualBaseline = baselinePolicy && process.env.LOTION_SETTINGS_CENTER_SKIP_BASELINE !== "1"
      ? await assertProductionVisualBaseline({
        actualPath: snapshot.imagePath,
        artifactRoot,
        policyPath: baselinePolicy
      })
      : null;
    viewports.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      initial,
      dateTimeDefaults,
      dateTimeSnapshot,
      importSection,
      pluginsSection,
      searchAiDeepLink,
      searchJump,
      snapshotState,
      snapshot,
      perceptualBaseline
    });
  });
  const summary = { cdpUrl, status: "passed", viewports };
  summary.artifactContract = await assertSettingsCenterArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name),
    requiredPerceptualBaselineViewportNames: process.env.LOTION_SETTINGS_CENTER_SKIP_BASELINE === "1"
      ? []
      : expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function openSettingsFromSidebar(page) {
  await page.locator(".sidebar-footer-link").first().waitFor({ timeout: 8_000 });
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll(".sidebar-footer-link"))
      .find((candidate) => /Settings|设置/.test(candidate.textContent ?? ""));
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Missing unified Settings sidebar button");
    }
    button.click();
  });
  await page.locator('[data-testid="settings-center"]').waitFor({ timeout: 8_000 });
}

async function assertSettingsCenter(page, viewportName, expectedSection) {
  const center = page.locator('[data-testid="settings-center"]').first();
  await center.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".settings-center-section-header").first(), `settings header ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `settings center ${viewportName}`, 8);
  await center.getByLabel("Search settings").waitFor({ timeout: 8_000 });
  const categories = ["General", "Appearance", "Search & AI", "Shortcuts", "Plugins", "Git Sync / Backup", "Import", "Advanced / Developer"];
  for (const category of categories) {
    await center.getByRole("tab", { name: category }).waitFor({ timeout: 8_000 });
  }
  await center.locator(".settings-center-section-header").getByRole("heading", { name: expectedSection, exact: true }).waitFor({ timeout: 8_000 });
  await assertSettingsGeometry(page, viewportName);
  const activeText = (await center.locator(".settings-center-section-header").textContent({ timeout: 5_000 }))?.trim() ?? "";
  return { activeText, categories };
}

async function verifyDateTimeDefaultSettings(page, viewportName) {
  const center = page.locator('[data-testid="settings-center"]').first();
  const dateFormat = center.getByLabel(/Default date format|默认日期格式/);
  const timeFormat = center.getByLabel(/Default time format|默认时间格式/);
  await dateFormat.waitFor({ timeout: 8_000 });
  await timeFormat.waitFor({ timeout: 8_000 });
  await dateFormat.selectOption("iso");
  await timeFormat.selectOption("h24");
  const state = await page.evaluate(() => ({
    dateFormat: window.localStorage.getItem("lotion.settings.defaultDateFormat"),
    timeFormat: window.localStorage.getItem("lotion.settings.defaultTimeFormat")
  }));
  if (state.dateFormat !== "iso" || state.timeFormat !== "h24") {
    throw new Error(`Global date/time defaults did not persist for ${viewportName}: ${JSON.stringify(state)}`);
  }
  await assertSettingsGeometry(page, `date-time defaults ${viewportName}`);
  return state;
}

async function readDateTimeDefaultSettings(page) {
  const center = page.locator('[data-testid="settings-center"]').first();
  const dateFormat = center.getByLabel(/Default date format|默认日期格式/);
  const timeFormat = center.getByLabel(/Default time format|默认时间格式/);
  await dateFormat.waitFor({ timeout: 8_000 });
  await timeFormat.waitFor({ timeout: 8_000 });
  return {
    dateFormat: await dateFormat.inputValue(),
    timeFormat: await timeFormat.inputValue()
  };
}

async function restoreDateTimeDefaultSettings(page, original, viewportName) {
  const center = page.locator('[data-testid="settings-center"]').first();
  await center.getByLabel(/Default date format|默认日期格式/).selectOption(original.dateFormat);
  await center.getByLabel(/Default time format|默认时间格式/).selectOption(original.timeFormat);
  await page.waitForFunction(
    ({ dateFormat, timeFormat }) => (
      window.localStorage.getItem("lotion.settings.defaultDateFormat") === dateFormat
      && window.localStorage.getItem("lotion.settings.defaultTimeFormat") === timeFormat
    ),
    original,
    { timeout: 8_000 }
  );
  await assertSettingsGeometry(page, `restored date-time defaults ${viewportName}`);
}

async function verifySettingsSearchJump(page, viewportName) {
  const center = page.locator('[data-testid="settings-center"]').first();
  const input = center.getByLabel("Search settings");
  await input.fill("git");
  const result = center.locator(".settings-search-result").filter({ hasText: "Git Sync / Backup" }).first();
  await result.waitFor({ timeout: 8_000 });
  await result.click();
  await center.locator(".settings-center-section-header").getByRole("heading", { name: "Git Sync / Backup", exact: true }).waitFor({ timeout: 8_000 });
  await center.getByText("Remote repository URL").first().waitFor({ timeout: 8_000 });
  await center.getByText("GitHub Backup").first().waitFor({ timeout: 8_000 });
  await assertSettingsGeometry(page, `git search ${viewportName}`);
  const paneText = (await center.locator('[data-testid="settings-center-pane"]').textContent({ timeout: 5_000 }))?.trim() ?? "";
  return { paneText: paneText.slice(0, 240) };
}

async function verifySearchAiSettingsDeepLink(page, viewportName) {
  const searchAiButton = page.locator(".sidebar-footer-link").filter({ hasText: "Search & AI" }).first();
  await searchAiButton.waitFor({ timeout: 8_000 });
  await searchAiButton.click();
  const surface = page.locator('[data-testid="search-ai-surface"]').first();
  await surface.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, surface, `Search & AI source surface ${viewportName}`, 8);
  const advancedTab = surface.getByRole("tab", { name: "Advanced" });
  await advancedTab.waitFor({ state: "visible", timeout: 8_000 });
  const advancedTabClick = await advancedTab.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const metrics = {
      disabled: element instanceof HTMLButtonElement ? element.disabled : false,
      height: rect.height,
      width: rect.width
    };
    element.click();
    return metrics;
  });
  await surface.getByRole("button", { name: "Search & AI Settings" }).waitFor({ timeout: 8_000 });
  advancedTabClick.ariaSelectedAfter = await surface.getByRole("tab", { name: "Advanced" }).getAttribute("aria-selected");
  await surface.getByRole("button", { name: "Search & AI Settings" }).click();
  await surface.waitFor({ state: "detached", timeout: 8_000 });
  const center = page.locator('[data-testid="settings-center"]').first();
  await center.locator(".settings-center-section-header").getByRole("heading", { name: "Search & AI", exact: true }).waitFor({ timeout: 8_000 });
  await center.getByText("Advanced Search").first().waitFor({ timeout: 8_000 });
  await center.getByText("LLM Providers").first().waitFor({ timeout: 8_000 });
  await center.getByText("Lotion API permissions").first().waitFor({ timeout: 8_000 });
  await assertSettingsGeometry(page, `search ai deep link ${viewportName}`);
  const pluginHosts = await center.locator(".plugin-settings-tab-host").count();
  return { advancedTabClick, pluginHosts };
}

async function verifyPluginSettingsSection(page, viewportName, sectionName, expectedTexts) {
  const center = page.locator('[data-testid="settings-center"]').first();
  await center.getByRole("tab", { name: sectionName }).click();
  await center.locator(".settings-center-section-header").getByRole("heading", { name: sectionName, exact: true }).waitFor({ timeout: 8_000 });
  for (const text of expectedTexts) {
    await center.getByText(text).first().waitFor({ timeout: 8_000 });
  }
  await assertSettingsGeometry(page, `${sectionName} ${viewportName}`);
  const paneText = (await center.locator('[data-testid="settings-center-pane"]').textContent({ timeout: 5_000 }))?.trim() ?? "";
  return { sectionName, paneText: paneText.slice(0, 240) };
}

async function assertSettingsGeometry(page, label) {
  await assertNoDocumentHorizontalOverflow(page, `settings ${label}`, 8);
  const metrics = await page.evaluate(() => {
    const center = document.querySelector('[data-testid="settings-center"]');
    const pane = document.querySelector('[data-testid="settings-center-pane"]');
    const tabs = Array.from(document.querySelectorAll(".settings-section-list [role='tab']"));
    const tabRects = tabs.map((tab) => {
      const rect = tab.getBoundingClientRect();
      return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
    });
    let overlappingTabs = 0;
    for (let index = 0; index < tabRects.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < tabRects.length; nextIndex += 1) {
        const a = tabRects[index];
        const b = tabRects[nextIndex];
        const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        if (overlaps) overlappingTabs += 1;
      }
    }
    const paneRect = pane?.getBoundingClientRect();
    const centerRect = center?.getBoundingClientRect();
    return {
      centerWidth: centerRect?.width ?? 0,
      hasFocus: Boolean(document.querySelector(":focus")),
      overlappingTabs,
      paneRight: paneRect?.right ?? 0,
      paneWidth: paneRect?.width ?? 0,
      tabCount: tabs.length,
      viewportWidth: window.innerWidth
    };
  });
  if (metrics.tabCount < 8 || metrics.overlappingTabs > 0 || metrics.paneWidth < 320 || metrics.paneRight > metrics.viewportWidth + 8) {
    throw new Error(`Settings center geometry failed for ${label}: ${JSON.stringify(metrics)}`);
  }
  return metrics;
}

async function stabilizeSettingsSnapshot(page, viewportName) {
  const center = page.locator('[data-testid="settings-center"]').first();
  const activeTab = center.locator(".settings-section-list button.active").first();
  await activeTab.waitFor({ state: "visible", timeout: 8_000 });
  await activeTab.evaluate(async (element) => {
    const animations = element.getAnimations({ subtree: true });
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  });
  const state = await center.evaluate((element) => {
    const active = element.querySelector(".settings-section-list button.active");
    const pane = element.querySelector('[data-testid="settings-center-pane"]');
    const navigation = element.querySelector(".settings-center-nav");
    const pluginRows = Array.from(element.querySelectorAll(".settings-plugin-list-row"));
    const activeStyle = active instanceof HTMLElement ? getComputedStyle(active) : null;
    const centerRect = element.getBoundingClientRect();
    const paneRect = pane?.getBoundingClientRect();
    const pluginRowRects = pluginRows.map((row) => row.getBoundingClientRect());
    const lastPluginRowRect = pluginRowRects.at(-1);
    return {
      activeTab: active?.textContent?.trim() || "",
      activeTabAriaSelected: active?.getAttribute("aria-selected") || "",
      activeTabStyle: activeStyle
        ? {
          backgroundColor: activeStyle.backgroundColor,
          borderColor: activeStyle.borderColor,
          color: activeStyle.color
        }
        : null,
      focusedInside: element.contains(document.activeElement),
      lastPluginRowWithinCenter: Boolean(
        lastPluginRowRect
        && lastPluginRowRect.left >= centerRect.left
        && lastPluginRowRect.right <= centerRect.right
        && lastPluginRowRect.top >= centerRect.top
        && lastPluginRowRect.bottom <= centerRect.bottom + 1
      ),
      navigationScrollTop: navigation instanceof HTMLElement ? navigation.scrollTop : null,
      paneScrollTop: pane instanceof HTMLElement ? pane.scrollTop : null,
      paneVisible: Boolean(paneRect && paneRect.width > 0 && paneRect.height > 0),
      pluginRowCount: pluginRows.length,
      visiblePluginRowCount: pluginRowRects.filter((rect) =>
        rect.width > 0
        && rect.height > 0
        && rect.left >= centerRect.left
        && rect.right <= centerRect.right
        && rect.top >= centerRect.top
        && rect.bottom <= centerRect.bottom + 1
      ).length
    };
  });
  if (
    state.activeTab !== "PluginsExtensions"
    || state.activeTabAriaSelected !== "true"
    || state.focusedInside
    || !state.lastPluginRowWithinCenter
    || state.navigationScrollTop !== 0
    || state.paneScrollTop !== 0
    || !state.paneVisible
    || state.pluginRowCount < 7
    || state.visiblePluginRowCount !== state.pluginRowCount
  ) {
    throw new Error(`Settings Center snapshot state failed for ${viewportName}: ${JSON.stringify(state)}`);
  }
  return state;
}

async function createSettingsCenterFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]+/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-settings-center-${safeViewport}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `pg_settings_center_${safeViewport}`;
  const pageTitle = "Settings Center Smoke Home";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_settings_center_${safeViewport}`,
    name: "Settings Center Smoke",
    pages: [pageId],
    databases: [],
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
      icon: "emoji:⚙️",
      path: ["Smoke", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nThis fixture verifies the unified settings center.\n`, "utf8");
  return { pageId, pageTitle, root };
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
