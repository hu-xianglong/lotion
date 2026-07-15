#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertSidebarSettingsArtifactContract } from "./lib/sidebar-settings-artifacts.mjs";
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

const settingsKeys = [
  "lotion.locale",
  "lotion.settings.sidebarTags",
  "lotion.settings.shortcuts"
];

await withLotionUIHarness("sidebar-settings-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace }) => {
  const previousSettings = await captureSettings(page);
  const fixture = await createSidebarSettingsFixture();

  try {
    const viewportResults = [];
    await forEachViewport(page, selectedViewports(), async (viewport) => {
      await resetSettingsToEnglish(page);
      await openWorkspace(fixture.root);
      await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
      await assertNoDocumentHorizontalOverflow(page, `sidebar initial ${viewport.name}`);

      const initial = await assertDefaultSidebarSettings(page, viewport.name);
      await moveDatabasesAbovePages(page, viewport.name);
      const reordered = await waitForSectionOrder(page, ["Databases", "Pages"]);
      await assertNoDocumentHorizontalOverflow(page, `sidebar reordered ${viewport.name}`);
      await resetSidebarSections(page, viewport.name);
      const reset = await waitForSectionOrder(page, ["Pages", "Databases"]);
      await assertNoDocumentHorizontalOverflow(page, `sidebar reset ${viewport.name}`);
      const shortcuts = await exerciseShortcutSettings(page, viewport.name);
      const snapshot = await captureSidebarSettingsSnapshot({
        artifactRoot,
        initial,
        page,
        reordered,
        reset,
        shortcuts,
        viewport
      });
      viewportResults.push({
        viewport: viewport.name,
        initial,
        reordered,
        reset,
        shortcuts,
        snapshot
      });
    });

    const result = {
      cdpUrl,
      workspaceRoot: fixture.root,
      viewports: viewportResults,
      status: "passed"
    };
    result.artifactContract = await assertSidebarSettingsArtifactContract(result);

    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await restoreSettings(page, previousSettings).catch(() => undefined);
  }
});

async function captureSettings(page) {
  return page.evaluate((keys) => keys.map((key) => [key, window.localStorage.getItem(key)]), settingsKeys);
}

async function restoreSettings(page, entries) {
  await page.evaluate((pairs) => {
    for (const [key, value] of pairs) {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
  }, entries);
}

async function resetSettingsToEnglish(page) {
  await page.evaluate((keys) => {
    for (const key of keys) window.localStorage.removeItem(key);
    window.localStorage.setItem("lotion.locale", "en");
  }, settingsKeys);
}

async function assertDefaultSidebarSettings(page, viewportName) {
  await openSidebarSettings(page, viewportName);
  const pagesChoice = page.locator(".sidebar-tag-option").filter({ hasText: "Pages" }).first();
  const databasesChoice = page.locator(".sidebar-tag-option").filter({ hasText: "Databases" }).first();
  await pagesChoice.waitFor({ timeout: 8_000 });
  await databasesChoice.waitFor({ timeout: 8_000 });
  const choices = {
    pagesPressed: await pagesChoice.getAttribute("aria-pressed"),
    databasesPressed: await databasesChoice.getAttribute("aria-pressed"),
    pagesDisabled: await pagesChoice.isDisabled(),
    databasesDisabled: await databasesChoice.isDisabled()
  };
  if (choices.pagesPressed !== "true" || choices.databasesPressed !== "true") {
    throw new Error(`Default sidebar choices should be active: ${JSON.stringify(choices)}`);
  }
  if (!choices.pagesDisabled || !choices.databasesDisabled) {
    throw new Error(`Built-in sidebar choices should be locked on: ${JSON.stringify(choices)}`);
  }
  const settingsOrder = await waitForSettingsOrder(page, ["Pages", "Databases"]);
  const sectionOrder = await waitForSectionOrder(page, ["Pages", "Databases"]);
  return { choices, settingsOrder, sectionOrder };
}

async function openSidebarSettings(page, viewportName = "current") {
  const details = page.locator(".sidebar-settings").first();
  await details.waitFor({ timeout: 8_000 });
  const open = await details.evaluate((node) => node.hasAttribute("open"));
  if (!open) await page.locator(".sidebar-settings-summary").first().click();
  const panel = page.locator(".sidebar-settings-panel").first();
  await panel.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, panel, `sidebar settings panel ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `sidebar settings panel ${viewportName}`);
}

async function moveDatabasesAbovePages(page, viewportName) {
  await openSidebarSettings(page, viewportName);
  const databaseRow = page.locator(".sidebar-tag-order-row").filter({ hasText: "Databases" }).first();
  await databaseRow.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, databaseRow, `sidebar database order row ${viewportName}`, 4);
  await databaseRow.getByRole("button").nth(0).click();
  await waitForSettingsOrder(page, ["Databases", "Pages"]);
}

async function resetSidebarSections(page, viewportName) {
  await openSidebarSettings(page, viewportName);
  await page.locator(".sidebar-settings-subhead").getByRole("button", { name: "Reset", exact: true }).click();
  await waitForSettingsOrder(page, ["Pages", "Databases"]);
}

async function exerciseShortcutSettings(page, viewportName) {
  await openSidebarSettings(page, viewportName);
  const section = page.locator(".shortcut-settings").first();
  await section.waitFor({ timeout: 8_000 });
  await section.scrollIntoViewIfNeeded();
  await assertWithinViewport(page, section, `shortcut settings ${viewportName}`, 4);

  const search = section.getByLabel("Search keyboard shortcuts");
  await search.fill("");
  await search.pressSequentially("f");
  const ordinaryValue = await search.inputValue();
  if (ordinaryValue !== "f") {
    throw new Error(`Shortcut settings search input did not accept ordinary typing: ${ordinaryValue}`);
  }
  await assertGlobalSearchClosed(page, `ordinary shortcut input ${viewportName}`);

  await search.fill("command");
  const openSearchRow = section.locator('.shortcut-settings-row[data-shortcut-id="lotion.open-search"]').first();
  await openSearchRow.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, openSearchRow, `open search shortcut row ${viewportName}`, 4);
  const defaultChord = await openSearchRow.locator(".shortcut-settings-chord").innerText();
  if (!/F/.test(defaultChord)) {
    throw new Error(`Open search shortcut row did not show a readable default chord: ${defaultChord}`);
  }

  await openSearchRow.getByRole("button", { name: "Edit Open command palette" }).click();
  await page.keyboard.press("Alt+Shift+F");
  await waitForShortcutOverride(page, "lotion.open-search", "Alt+Shift+F");
  await section.locator(".shortcut-settings-recorder").waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(() => {
    const row = document.querySelector('.shortcut-settings-row[data-shortcut-id="lotion.open-search"]');
    return row?.querySelector(".shortcut-settings-chord")?.textContent?.includes("F");
  }, null, { timeout: 8_000 });

  await dispatchShortcut(page, { key: "f", ctrlKey: true, shiftKey: true });
  await assertGlobalSearchClosed(page, `old shortcut disabled ${viewportName}`);
  await dispatchShortcut(page, { key: "f", altKey: true, shiftKey: true });
  const panel = page.locator(".global-search").first();
  await panel.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, panel, `custom shortcut global search ${viewportName}`, 4);
  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "detached", timeout: 8_000 }).catch(async () => {
    await page.locator(".dialog-backdrop").click({ position: { x: 4, y: 4 } });
    await panel.waitFor({ state: "detached", timeout: 8_000 });
  });

  await openSidebarSettings(page, viewportName);
  await section.getByLabel("Search keyboard shortcuts").fill("settings");
  const settingsRow = section.locator('.shortcut-settings-row[data-shortcut-id="lotion.open-sidebar-settings"]').first();
  await settingsRow.waitFor({ timeout: 8_000 });
  await settingsRow.getByRole("button", { name: "Edit Open settings" }).click();
  await page.keyboard.press("Alt+Shift+F");
  await page.waitForFunction(() => {
    const message = document.querySelector(".shortcut-settings-message")?.textContent ?? "";
    return /already used/.test(message);
  }, null, { timeout: 8_000 });

  await section.getByLabel("Search keyboard shortcuts").fill("command");
  await openSearchRow.getByRole("button", { name: "Reset" }).click();
  await waitForShortcutOverride(page, "lotion.open-search", undefined);
  await dispatchShortcut(page, { key: "f", ctrlKey: true, shiftKey: true });
  await page.locator(".global-search").first().waitFor({ timeout: 8_000 });
  await page.keyboard.press("Escape");
  await page.locator(".global-search").first().waitFor({ state: "detached", timeout: 8_000 }).catch(() => undefined);
  await assertNoDocumentHorizontalOverflow(page, `shortcut settings ${viewportName}`);

  return {
    defaultChord,
    ordinaryValue,
    customChord: "Alt+Shift+F"
  };
}

async function captureSidebarSettingsSnapshot({
  artifactRoot,
  initial,
  page,
  reordered,
  reset,
  shortcuts,
  viewport
}) {
  await openSidebarSettings(page, viewport.name);
  const panel = page.locator(".sidebar-settings-panel").first();
  await assertWithinViewport(page, panel, `sidebar settings snapshot panel ${viewport.name}`, 4);
  return captureElementSnapshot({
    artifactRoot,
    locator: panel,
    name: `sidebar-settings-${viewport.name}`,
    page,
    viewport,
    metadata: {
      phase: "sidebar-settings",
      initial,
      reordered,
      reset,
      shortcuts,
      settingsOrder: await settingsOrder(page),
      sectionOrder: await sectionOrder(page)
    }
  });
}

async function waitForShortcutOverride(page, id, expected) {
  await page.waitForFunction(({ key, value }) => {
    const raw = window.localStorage.getItem("lotion.settings.shortcuts");
    const parsed = raw ? JSON.parse(raw) : {};
    return value === undefined
      ? !Object.prototype.hasOwnProperty.call(parsed, key)
      : parsed[key] === value;
  }, { key: id, value: expected }, { timeout: 8_000 });
}

async function dispatchShortcut(page, options) {
  await page.evaluate((eventInit) => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: eventInit.key,
      ctrlKey: Boolean(eventInit.ctrlKey),
      metaKey: Boolean(eventInit.metaKey),
      altKey: Boolean(eventInit.altKey),
      shiftKey: Boolean(eventInit.shiftKey)
    }));
  }, options);
}

async function assertGlobalSearchClosed(page, label) {
  const opened = await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve(Boolean(document.querySelector(".global-search")));
      });
    });
  }));
  if (opened) {
    throw new Error(`Global search unexpectedly opened during ${label}`);
  }
}

async function waitForSettingsOrder(page, expectedPrefix) {
  await page.waitForFunction((expected) => {
    const labels = Array.from(document.querySelectorAll(".sidebar-tag-order-row .sidebar-tag-order-label"))
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);
    return expected.every((label, index) => labels[index] === label);
  }, expectedPrefix, { timeout: 8_000 });
  return settingsOrder(page);
}

async function waitForSectionOrder(page, expectedPrefix) {
  await page.waitForFunction((expected) => {
    const labels = Array.from(document.querySelectorAll(".sidebar-scroll > .nav-section > .section-heading"))
      .map((node) => node.textContent?.replace(/[+▾]/g, "").trim() ?? "")
      .filter((text) => text === "Pages" || text === "Databases");
    return expected.every((label, index) => labels[index] === label);
  }, expectedPrefix, { timeout: 8_000 });
  return sectionOrder(page);
}

async function settingsOrder(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".sidebar-tag-order-row .sidebar-tag-order-label"))
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean));
}

async function sectionOrder(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".sidebar-scroll > .nav-section > .section-heading"))
    .map((node) => node.textContent?.replace(/[+▾]/g, "").trim() ?? "")
    .filter((text) => text === "Pages" || text === "Databases"));
}

async function createSidebarSettingsFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-sidebar-settings-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_sidebar_settings";
  const pageTitle = "Sidebar Settings Smoke Page";
  const databaseId = "db_sidebar_settings";
  const databaseName = "Sidebar Settings Smoke DB";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_sidebar_settings",
    name: "Sidebar Settings Smoke",
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
      icon: "emoji:📄",
      path: ["Smoke", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nSmoke workspace for sidebar settings.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    icon: "emoji:🧮",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "created_time", "updated_time", "title"], [{
    id: "row_sidebar_settings",
    created_time: now,
    updated_time: now,
    title: "Sidebar settings row"
  }]);

  return { root, pageTitle };
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
