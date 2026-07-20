#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertPluginManagerArtifactContract } from "./lib/plugin-manager-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  setLotionLocale,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("plugin-manager-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace }) => {
  await setLotionLocale(page, "zh");
  const fixture = await createPluginManagerFixture();
  await openWorkspace(fixture.root);
  const viewportResults = [];
  const expectedViewports = selectedViewports();

  await page.waitForFunction(async (targetPageId) => {
    const pages = await window.lotion.pages.list();
    return pages.some((candidate) => candidate.id === targetPageId);
  }, fixture.pageId, { timeout: 8_000 });

  await forEachViewport(page, expectedViewports, async (viewport) => {
    await openPage(page, fixture.pageId);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
    await openPluginManager(page);
    await page.locator(".plugin-manager").waitFor({ timeout: 8_000 });
    await waitForPluginRows(page);
    await assertPluginManagerLayout(page, viewport.name);

    const listedPlugins = await verifyListedPlugins(page);
    const permissionSummary = await verifyPluginPermissionSummary(page);
    const extensionPointTitles = await verifyExtensionPointTitles(page);
    const sourceDrilldown = await verifyExtensionPointSourceDrilldown(page, viewport.name);
    const providerSourceDrilldown = await verifyProviderSourceDrilldown(page, viewport.name);
    const details = [];
    details.push(await verifyPluginDetail(page, {
      name: "Notion Import",
      expected: ["Audit imported workspace", "Import settings", "Latest import report"],
      viewportName: viewport.name
    }));
    details.push(await verifyPluginDetail(page, {
      name: "LLM Providers",
      expected: [],
      viewportName: viewport.name
    }));
    details.push(await verifyPluginDetail(page, {
      name: "Git Sync",
      expected: ["Remote repository URL", "Auto backup cadence", "Backup now"],
      viewportName: viewport.name
    }));
    const lifecycle = await verifyPluginLifecycleControls(page, viewport.name);
    const commandSearch = await verifyCommandSearch(page, viewport.name);
    const notification = await verifyNotificationToast(page);

    await openPluginManager(page);
    await waitForPluginRows(page);
    await assertPluginManagerLayout(page, viewport.name);
    const summary = await page.evaluate(() => ({
      pluginRows: document.querySelectorAll(".plugin-row").length,
      providerRows: document.querySelectorAll(".plugin-provider-icon").length,
      settingsHosts: document.querySelectorAll(".plugin-settings-tab-host").length
    }));
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".plugin-manager").first(),
      metadata: {
        commandSearch,
        details,
        extensionPointTitles,
        listedPlugins,
        permissionSummary,
        providerSourceDrilldown,
        lifecycle,
        sourceDrilldown,
        summary,
        viewport: viewport.name
      },
      name: `plugin-manager-${viewport.name}`,
      page,
      viewport
    });
    await assertNoDocumentHorizontalOverflow(page, `plugin manager completed ${viewport.name}`);
    viewportResults.push({
      viewport: viewport.name,
      summary,
      listedPlugins,
      permissionSummary,
      extensionPointTitles,
      sourceDrilldown,
      providerSourceDrilldown,
      details,
      lifecycle,
      commandSearch,
      notification,
      snapshot
    });
  });

  const summary = {
    cdpUrl,
    workspaceRoot: fixture.root,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertPluginManagerArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function assertPluginManagerLayout(page, viewportName) {
  await assertWithinViewport(
    page,
    page.locator(".plugin-summary-grid").first(),
    `plugin manager summary grid ${viewportName}`,
    4
  );
  await assertNoDocumentHorizontalOverflow(page, `plugin manager ${viewportName}`);
}

async function openPluginManager(page) {
  await closeGlobalSearchIfOpen(page);
  await page.keyboard.press("Escape").catch(() => undefined);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("lotion:open-manage", {
        detail: { kind: "plugins" }
      }));
    });
    await page.locator(".management-view").waitFor({ timeout: 8_000 });

    const detailBack = page.locator(".plugin-detail-back").first();
    if (await detailBack.isVisible({ timeout: 750 }).catch(() => false)) {
      await detailBack.click();
    }

    try {
      await page.locator(".plugin-manager").first().waitFor({ timeout: 3_000 });
      await waitForPluginRows(page);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(250);
    }
  }
}

async function verifyListedPlugins(page) {
  await waitForPluginRows(page);
  const expected = ["Default Field Types", "Kanban View", "Notion Import", "LLM Providers", "Git Sync"];
  for (const name of expected) {
    await page.locator("tr.plugin-row").filter({ hasText: name }).first().waitFor({ timeout: 8_000 });
  }
  return expected;
}

async function verifyPluginPermissionSummary(page) {
  const expected = {
    "Notion Import": ["workspace.read", "workspace.write", "vault.fs"],
    "Git Sync": ["workspace.write", "network", "shell"]
  };
  for (const [pluginName, permissions] of Object.entries(expected)) {
    const row = page.locator("tr.plugin-row").filter({ hasText: pluginName }).first();
    await row.waitFor({ timeout: 8_000 });
    for (const permission of permissions) {
      await row.locator(".plugin-permission-pill", { hasText: permission }).first().waitFor({ timeout: 8_000 });
    }
  }
  return expected;
}

async function verifyExtensionPointTitles(page) {
  const expected = ["Open Notion Import", "Backup Now"];
  for (const title of expected) {
    await page.locator(".plugin-manager .management-section").filter({ hasText: "Registered extension points" }).getByText(title).first().waitFor({ timeout: 8_000 });
  }
  return expected;
}

async function verifyPluginLifecycleControls(page, viewportName) {
  await openPluginManager(page);
  await waitForPluginRows(page);
  const kanbanRow = page.locator("tr.plugin-row").filter({ hasText: "Kanban View" }).first();
  await kanbanRow.waitFor({ timeout: 8_000 });
  await kanbanRow.getByRole("button", { name: "Disable Kanban View" }).waitFor({ timeout: 8_000 });
  const requiredRow = page.locator("tr.plugin-row").filter({ hasText: "Default Field Types" }).first();
  await requiredRow.locator(".plugin-lifecycle-note", { hasText: "Required" }).waitFor({ timeout: 8_000 });

  await kanbanRow.getByRole("button", { name: "Disable Kanban View" }).click();
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll("tr.plugin-row"))
      .find((candidate) => (candidate.textContent ?? "").includes("Kanban View"));
    return (row?.textContent ?? "").includes("disabled")
      && !!row?.querySelector('button[aria-label="Enable Kanban View"]');
  }, null, { timeout: 8_000 });
  const disabledStatus = (await kanbanRow.locator(".plugin-status-pill").textContent({ timeout: 5_000 }))?.trim() ?? "";
  const kanbanProvidersAfterDisable = await page.locator(".plugin-manager .management-section")
    .filter({ hasText: "View providers" })
    .locator("tr")
    .filter({ hasText: "Kanban Board" })
    .count();
  if (kanbanProvidersAfterDisable !== 0) {
    throw new Error(`Expected Kanban provider to unregister after disable in ${viewportName}`);
  }
  await assertPluginManagerLayout(page, `lifecycle disabled ${viewportName}`);

  await kanbanRow.getByRole("button", { name: "Enable Kanban View" }).click();
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll("tr.plugin-row"))
      .find((candidate) => (candidate.textContent ?? "").includes("Kanban View"));
    return (row?.textContent ?? "").includes("active")
      && !!row?.querySelector('button[aria-label="Disable Kanban View"]');
  }, null, { timeout: 8_000 });
  await page.locator(".plugin-manager .management-section")
    .filter({ hasText: "View providers" })
    .getByText("Kanban Board")
    .first()
    .waitFor({ timeout: 8_000 });
  const enabledStatus = (await kanbanRow.locator(".plugin-status-pill").textContent({ timeout: 5_000 }))?.trim() ?? "";
  await assertPluginManagerLayout(page, `lifecycle enabled ${viewportName}`);
  return {
    disabledStatus,
    enabledStatus,
    providerRemovedOnDisable: kanbanProvidersAfterDisable === 0,
    requiredControl: "Default Field Types"
  };
}

async function verifyExtensionPointSourceDrilldown(page, viewportName) {
  const section = page.locator(".plugin-manager .management-section")
    .filter({ hasText: "Registered extension points" })
    .first();
  const sourceButton = section.locator(".plugin-source-button")
    .filter({ hasText: "Notion Import" })
    .first();
  await sourceButton.waitFor({ timeout: 8_000 });
  const sourceText = (await sourceButton.textContent({ timeout: 5_000 }))?.trim() ?? "";
  await sourceButton.click();
  await page.locator(".plugin-detail-page").waitFor({ timeout: 8_000 });
  await page.locator(".plugin-detail-hero").getByText("Notion Import").first().waitFor({ timeout: 8_000 });
  await assertPluginDetailLayout(page, `extension source ${viewportName}`);
  await page.locator(".plugin-detail-back").click();
  await page.locator(".plugin-manager").waitFor({ timeout: 8_000 });
  await assertPluginManagerLayout(page, viewportName);
  return { sourceText };
}

async function verifyProviderSourceDrilldown(page, viewportName) {
  const section = page.locator(".plugin-manager .management-section")
    .filter({ hasText: "Field providers" })
    .first();
  const sourceButton = section.locator(".plugin-source-button")
    .filter({ hasText: "Default Field Types" })
    .first();
  await sourceButton.waitFor({ timeout: 8_000 });
  const sourceText = (await sourceButton.textContent({ timeout: 5_000 }))?.trim() ?? "";
  await sourceButton.click();
  await page.locator(".plugin-detail-page").waitFor({ timeout: 8_000 });
  await page.locator(".plugin-detail-hero").getByText("Default Field Types").first().waitFor({ timeout: 8_000 });
  await assertPluginDetailLayout(page, `provider source ${viewportName}`);
  await page.locator(".plugin-detail-back").click();
  await page.locator(".plugin-manager").waitFor({ timeout: 8_000 });
  await assertPluginManagerLayout(page, viewportName);
  return { sourceText };
}

async function waitForPluginRows(page) {
  await page.waitForFunction(() => document.querySelectorAll("tr.plugin-row").length >= 5, null, { timeout: 8_000 });
}

async function verifyPluginDetail(page, { name, expected, viewportName }) {
  await page.locator("tr.plugin-row").filter({ hasText: name }).first().click();
  await page.locator(".plugin-detail-page").waitFor({ timeout: 8_000 });
  await page.locator(".plugin-detail-hero").getByText(name).first().waitFor({ timeout: 8_000 });
  await assertPluginDetailLayout(page, `${name} detail ${viewportName}`);
  await page.getByRole("tab", { name: "Overview" }).waitFor({ timeout: 8_000 });
  const overviewSelected = await page.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected");
  const settingsSelected = await page.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected");
  if (overviewSelected !== "true" || settingsSelected !== "false") {
    throw new Error(`Expected ${name} detail to default to Overview, saw overview=${overviewSelected}, settings=${settingsSelected}`);
  }
  const initialSettingsHosts = await page.locator(".plugin-detail-page .plugin-settings-tab-host").count();
  if (initialSettingsHosts !== 0) {
    throw new Error(`Expected ${name} overview to keep settings hosts unmounted, saw ${initialSettingsHosts}`);
  }
  await page.locator('[data-testid="plugin-workflow-overview"]').waitFor({ timeout: 8_000 });
  await page.locator('[data-testid="plugin-workflow-overview"]').getByText("Workflow").first().waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".plugin-detail-switcher").first(), `${name} detail switcher ${viewportName}`, 4);
  await assertWithinViewport(page, page.locator(".plugin-workflow-grid").first(), `${name} workflow grid ${viewportName}`, 4);

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.locator(".plugin-detail-settings-panel").waitFor({ timeout: 8_000 });
  await assertPluginDetailLayout(page, `${name} settings ${viewportName}`);
  const settingsHosts = await page.locator(".plugin-detail-page .plugin-settings-tab-host").count();
  if (settingsHosts < 1) {
    throw new Error(`Expected ${name} settings panel to mount at least one settings host`);
  }
  for (const text of expected) {
    await page.getByText(text).first().waitFor({ timeout: 8_000 });
  }
  await page.getByRole("tab", { name: "Overview" }).click();
  await page.locator('[data-testid="plugin-workflow-overview"]').waitFor({ timeout: 8_000 });
  const restoredSettingsHosts = await page.locator(".plugin-detail-page .plugin-settings-tab-host").count();
  if (restoredSettingsHosts !== 0) {
    throw new Error(`Expected ${name} settings hosts to unmount after returning to Overview, saw ${restoredSettingsHosts}`);
  }
  const detail = {
    name,
    initialSettingsHosts,
    settingsHosts
  };
  await page.locator(".plugin-detail-back").click();
  await page.locator(".plugin-manager").waitFor({ timeout: 8_000 });
  await assertPluginManagerLayout(page, viewportName);
  return detail;
}

async function assertPluginDetailLayout(page, label) {
  await assertWithinViewport(page, page.locator(".plugin-detail-hero").first(), label, 4);
  await assertNoDocumentHorizontalOverflow(page, label);
}

async function verifyNotificationToast(page) {
  const text = "Plugin notify smoke";
  await page.evaluate((message) => {
    window.dispatchEvent(new CustomEvent("lotion:notify", {
      detail: { text: message, level: "warn" }
    }));
  }, text);
  const toast = page.locator(".notification-toast.warn").filter({ hasText: text }).first();
  await toast.waitFor({ timeout: 8_000 });
  const renderedText = (await toast.textContent({ timeout: 5_000 }))?.trim() ?? "";
  await toast.getByRole("button", { name: "Dismiss notification" }).click();
  await toast.waitFor({ state: "detached", timeout: 8_000 });
  return { text, renderedText };
}

async function verifyCommandSearch(page, viewportName) {
  const query = "Open Notion Import";
  const filter = await verifyCommandFilter(page, query, viewportName);
  const click = await activateCommandSearch(page, query, "click", viewportName);
  const enter = await activateCommandSearch(page, query, "enter", viewportName);
  return { query, filter, click, enter };
}

async function verifyCommandFilter(page, query, viewportName) {
  await closeGlobalSearchIfOpen(page);
  await openGlobalSearch(page);
  await assertWithinViewport(page, page.locator(".global-search").first(), `global search ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `global search ${viewportName}`);
  await page.locator(".global-search-input").fill(query);
  const commandFilter = page.locator(".global-search-filters button").filter({ hasText: "命令" }).first();
  await commandFilter.waitFor({ timeout: 8_000 });
  await commandFilter.click();
  const commandHit = page.locator(".global-search-hit")
    .filter({ hasText: query })
    .filter({ hasText: "命令" })
    .first();
  await commandHit.waitFor({ timeout: 8_000 });
  const badges = await page.locator(".global-search-hit .gs-kind-badge").allTextContents();
  if (!badges.length || badges.some((badge) => !badge.includes("命令"))) {
    throw new Error(`Expected command filter to show only command results, saw badges: ${JSON.stringify(badges)}`);
  }
  const filterText = (await commandFilter.textContent({ timeout: 5_000 }))?.trim() ?? "";
  const filterCountText = (await commandFilter.locator(".global-search-filter-count").textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (!/^\d+$/.test(filterCountText)) {
    throw new Error(`Expected command filter count badge to contain a number, saw: ${JSON.stringify(filterCountText)}`);
  }
  await closeGlobalSearchIfOpen(page);
  return { filterText, filterCountText, resultCount: badges.length };
}

async function activateCommandSearch(page, query, activation, viewportName) {
  await closeGlobalSearchIfOpen(page);
  await openGlobalSearch(page);
  await assertWithinViewport(page, page.locator(".global-search").first(), `global search activation ${viewportName}`, 4);
  await page.locator(".global-search-input").fill(query);
  const commandHit = page.locator(".global-search-hit")
    .filter({ hasText: query })
    .filter({ hasText: "命令" })
    .first();
  await commandHit.waitFor({ timeout: 8_000 });
  const renderedText = (await commandHit.textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (activation === "enter") {
    const commandFilter = page.locator(".global-search-filters button").filter({ hasText: "命令" }).first();
    await commandFilter.click();
    await page.waitForFunction((expectedTitle) => {
      const hits = Array.from(document.querySelectorAll(".global-search-hit"));
      if (!hits.length) return false;
      return hits.every((hit) => hit.dataset.searchItemType === "command")
        && hits[0]?.classList.contains("active")
        && (hits[0]?.textContent ?? "").includes(expectedTitle);
    }, query, { timeout: 8_000 });
    await page.locator(".global-search-input").focus();
    await page.keyboard.press("Enter");
  } else {
    await commandHit.click();
  }
  await page.waitForSelector(".global-search", { state: "detached", timeout: 8_000 });
  await page.locator(".plugin-modal").filter({ hasText: "Import from Notion" }).waitFor({ timeout: 8_000 });
  await page.locator(".plugin-modal .notion-import-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".plugin-modal").first(), `command opened Notion import modal ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `command opened Notion import modal ${viewportName}`);
  const modalTitle = (await page.locator(".plugin-modal .dialog-header h2").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
  await page.locator(".plugin-modal-close").click();
  await page.waitForSelector(".plugin-modal", { state: "detached", timeout: 8_000 });
  return { activation, renderedText, modalTitle };
}

async function closeGlobalSearchIfOpen(page) {
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

async function createPluginManagerFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-plugin-manager-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_plugin_manager_home";
  const pageTitle = "Plugin Manager Smoke Home";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_plugin_manager",
    name: "Plugin Manager Smoke",
    pages: [pageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: pageId,
      title: pageTitle,
      now,
      icon: "emoji:🔌",
      path: ["Bench", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nSmoke workspace for plugin manager tests.\n`, "utf8");
  return { root, pageId, pageTitle };
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
