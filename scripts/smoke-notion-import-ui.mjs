#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertNotionImportAuditArtifactContract } from "./lib/notion-import-audit-artifacts.mjs";
import {
  assertHarnessViewportCoverage,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  setLotionLocale,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const CSV_HASH = "11111111222233334444555555555555";
const HTML_HASH = "aaaaaaaa111111112222222233333333";

const result = await withLotionUIHarness("notion-import-audit", async ({
  artifactRoot,
  cdpUrl,
  openWorkspace,
  page,
  registerTempWorkspace
}) => {
  await setLotionLocale(page, "zh");
  const viewportResults = [];
  const diagnosticResults = [];
  const modalResults = [];
  const directModalResults = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createAuditFixture(`${viewport.name}-passing`);
    registerTempWorkspace(fixture.root);
    modalResults.push(await runImportModalOverlayCheck({
      artifactRoot,
      fixture,
      openWorkspace,
      page,
      viewport
    }));
    directModalResults.push(await runDirectImportModalCheck({
      artifactRoot,
      fixture,
      openWorkspace,
      page,
      viewport
    }));
    viewportResults.push(await runPassingAudit({
      artifactRoot,
      fixture,
      openWorkspace,
      page,
      viewport
    }));

    const diagnosticFixture = await createAuditFixture(`${viewport.name}-diagnostic`, {
      importedNotes: "",
      sourceNotes: "Source note that must survive import"
    });
    registerTempWorkspace(diagnosticFixture.root);
    diagnosticResults.push(await runDiagnosticAudit({
      artifactRoot,
      fixture: diagnosticFixture,
      openWorkspace,
      page,
      viewport
    }));
  });

  const summary = {
    cdpUrl,
    diagnostics: diagnosticResults,
    directImportModal: directModalResults,
    importModal: modalResults,
    viewports: viewportResults,
    status: "passed"
  };
  return {
    ...summary,
    artifactContract: await assertNotionImportAuditArtifactContract(summary, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    }),
    viewportCoverage: assertHarnessViewportCoverage(summary)
  };
});

console.log(JSON.stringify(result, null, 2));

async function runImportModalOverlayCheck({ artifactRoot, fixture, openWorkspace, page, viewport }) {
  await openWorkspace(fixture.workspaceRoot);
  await page.getByText("Audit UI Home").first().waitFor({ timeout: 8_000 });
  await openNotionImportCommandModal(page, viewport.name);
  const modal = page.locator(".plugin-modal").filter({ hasText: "Import from Notion" }).first();
  await modal.waitFor({ timeout: 8_000 });
  await modal.locator(".notion-import-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, `notion import command modal ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `notion import command modal ${viewport.name}`, 2);
  const overlay = await page.evaluate(() => {
    const backdrop = document.querySelector(".plugin-modal-backdrop");
    const dialog = document.querySelector(".plugin-modal");
    const pageTitle = Array.from(document.querySelectorAll("h1, h2"))
      .find((candidate) => (candidate.textContent ?? "").includes("Audit UI Home"));
    const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const dialogRect = dialog?.getBoundingClientRect();
    const backdropRect = backdrop?.getBoundingClientRect();
    return {
      ariaModal: dialog?.getAttribute("aria-modal") ?? "",
      backdropCoversViewport: Boolean(backdropRect)
        && backdropRect.left <= 1
        && backdropRect.top <= 1
        && backdropRect.right >= window.innerWidth - 1
        && backdropRect.bottom >= window.innerHeight - 1,
      centerInsideModal: Boolean(center?.closest(".plugin-modal")),
      modalContainsPageTitle: Boolean(dialog && pageTitle && dialog.contains(pageTitle)),
      modalHeight: Math.round(dialogRect?.height ?? 0),
      modalRole: dialog?.getAttribute("role") ?? "",
      title: dialog?.querySelector(".dialog-header h2")?.textContent?.trim() ?? ""
    };
  });
  if (
    overlay.title !== "Import from Notion" ||
    overlay.modalRole !== "dialog" ||
    overlay.ariaModal !== "true" ||
    !overlay.backdropCoversViewport ||
    !overlay.centerInsideModal ||
    overlay.modalContainsPageTitle
  ) {
    throw new Error(`Notion import modal overlay is not isolated from page content: ${JSON.stringify(overlay)}`);
  }
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: modal,
    metadata: {
      overlay,
      phase: "command-modal",
      workspaceRoot: fixture.workspaceRoot
    },
    name: `notion-import-command-modal-${viewport.name}`,
    page,
    viewport
  });
  await page.locator(".plugin-modal-close").click();
  await page.waitForSelector(".plugin-modal", { state: "detached", timeout: 8_000 });
  return {
    viewport: viewport.name,
    overlay,
    snapshot: snapshotSummary(snapshot),
    workspaceRoot: fixture.workspaceRoot
  };
}

async function runDirectImportModalCheck({ artifactRoot, fixture, openWorkspace, page, viewport }) {
  await openWorkspace(fixture.workspaceRoot);
  await page.getByText("Audit UI Home").first().waitFor({ timeout: 8_000 });
  await page.locator(".workspace-selector").click();
  const menu = page.getByRole("menu").first();
  await menu.waitFor({ timeout: 8_000 });
  await menu.getByRole("button", { name: "Import from Notion…" }).click();

  const modal = page.locator(".notion-dialog").first();
  await modal.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, `direct Notion import modal ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `direct Notion import modal ${viewport.name}`, 2);

  const layout = await page.evaluate(() => {
    const backdrop = document.querySelector(".dialog-backdrop");
    const dialog = document.querySelector(".notion-dialog");
    const dialogRect = dialog?.getBoundingClientRect();
    const backdropRect = backdrop?.getBoundingClientRect();
    const style = dialog ? window.getComputedStyle(dialog) : null;
    const bodyStyle = document.body ? window.getComputedStyle(document.body) : null;
    return {
      ariaModal: dialog?.getAttribute("aria-modal") ?? "",
      backdropCoversViewport: Boolean(backdropRect)
        && backdropRect.left <= 1
        && backdropRect.top <= 1
        && backdropRect.right >= window.innerWidth - 1
        && backdropRect.bottom >= window.innerHeight - 1,
      backgroundColor: style?.backgroundColor ?? "",
      bodyBackgroundColor: bodyStyle?.backgroundColor ?? "",
      htmlLabel: dialog?.querySelector(".notion-import-source:nth-of-type(2) strong")?.textContent?.trim() ?? "",
      height: Math.round(dialogRect?.height ?? 0),
      markdownCsvLabel: dialog?.querySelector(".notion-import-source:first-of-type strong")?.textContent?.trim() ?? "",
      mergeById: (dialog?.textContent ?? "").includes("matches their stable Notion IDs"),
      modalRole: dialog?.getAttribute("role") ?? "",
      title: dialog?.querySelector(".notion-dialog-header h2")?.textContent?.trim() ?? "",
      width: Math.round(dialogRect?.width ?? 0)
    };
  });
  if (
    layout.title !== "Import from Notion" ||
    layout.modalRole !== "dialog" ||
    layout.ariaModal !== "true" ||
    layout.markdownCsvLabel !== "Markdown & CSV export" ||
    layout.htmlLabel !== "HTML export" ||
    !layout.mergeById ||
    !layout.backdropCoversViewport ||
    !layout.backgroundColor ||
    layout.backgroundColor === "rgba(0, 0, 0, 0)" ||
    layout.backgroundColor === "transparent"
  ) {
    throw new Error(`Direct Notion import modal is incomplete: ${JSON.stringify(layout)}`);
  }

  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: modal,
    metadata: {
      layout,
      phase: "direct-modal",
      workspaceRoot: fixture.workspaceRoot
    },
    name: `notion-import-direct-modal-${viewport.name}`,
    page,
    viewport
  });
  await modal.getByRole("button", { name: "Close import dialog" }).click();
  await page.waitForSelector(".notion-dialog", { state: "detached", timeout: 8_000 });
  return {
    viewport: viewport.name,
    layout,
    snapshot: snapshotSummary(snapshot),
    workspaceRoot: fixture.workspaceRoot
  };
}

async function runPassingAudit({ artifactRoot, fixture, openWorkspace, page, viewport }) {
  try {
    await openWorkspace(fixture.workspaceRoot);
    await openNotionImportPlugin(page);
    await page.waitForSelector(".notion-audit-panel", { timeout: 8_000 });
    await enableShellOpenDryRun(page);
    await assertAuditPanelLayout(page, viewport.name, "before-audit");
    await page.locator(".notion-audit-source-row input").fill(fixture.sourceRoot);
    await page.locator('.notion-audit-options input[type="checkbox"]').first().setChecked(true);
    await page.getByRole("button", { name: "Run audit" }).click();
    await page.getByText("No blocking audit issues found.").waitFor({ timeout: 10_000 });
    await assertAuditPanelLayout(page, viewport.name, "after-audit");

    const summary = await readAuditSummary(page);
    const pathButtons = await page.locator(".notion-audit-result .notion-audit-path button").count();

    assertSummary(summary, {
      "Source CSVs": "1 / 1",
      "Source HTMLs": "1 / 1",
      "Imported mappings": "1 database, 1 row/page",
      "Issues": "0",
      "Warnings": "0"
    });
    if (pathButtons !== 2) {
      throw new Error(`Expected exactly 2 audit path Open buttons, saw ${pathButtons}`);
    }
    const pathOpenButtons = page.locator(".notion-audit-result .notion-audit-path button");
    await assertWithinViewport(page, pathOpenButtons.nth(0), `audit path open source ${viewport.name}`, 8);
    await assertWithinViewport(page, pathOpenButtons.nth(1), `audit path open workspace ${viewport.name}`, 8);
    await pathOpenButtons.nth(0).click();
    await pathOpenButtons.nth(1).click();
    await waitForShellOpenRequests(page, [fixture.sourceRoot, fixture.workspaceRoot]);
    const shellOpenDryRunRequests = await page.evaluate(() => window.lotion.debug.getShellOpenRequests());
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".notion-audit-result").first(),
      metadata: {
        phase: "passing",
        summary,
        pathButtons,
        sourceRoot: fixture.sourceRoot,
        workspaceRoot: fixture.workspaceRoot,
        shellOpenDryRunRequests
      },
      name: `notion-audit-result-${viewport.name}`,
      page,
      viewport
    });

    return {
      viewport: viewport.name,
      sourceRoot: fixture.sourceRoot,
      workspaceRoot: fixture.workspaceRoot,
      summary,
      pathButtons,
      snapshot: snapshotSummary(snapshot),
      shellOpenDryRunRequests
    };
  } finally {
    await disableShellOpenDryRun(page).catch(() => undefined);
  }
}

async function runDiagnosticAudit({ artifactRoot, fixture, openWorkspace, page, viewport }) {
  try {
    await openWorkspace(fixture.workspaceRoot);
    await openNotionImportPlugin(page);
    await page.waitForSelector(".notion-audit-panel", { timeout: 8_000 });
    await enableShellOpenDryRun(page);
    await assertAuditPanelLayout(page, viewport.name, "before-audit");
    await page.locator(".notion-audit-source-row input").fill(fixture.sourceRoot);
    await page.locator('.notion-audit-options input[type="checkbox"]').first().setChecked(true);
    await page.getByRole("button", { name: "Run audit" }).click();
    await page.getByText("Audit found blocking import issues.").waitFor({ timeout: 10_000 });
    await assertAuditPanelLayout(page, viewport.name, "after-diagnostic");

    const summary = await readAuditSummary(page);
    assertSummary(summary, {
      "Source CSVs": "1 / 1",
      "Source HTMLs": "1 / 1",
      "Imported mappings": "1 database, 1 row/page",
      "Issues": "1",
      "Warnings": "0"
    });

    const issueKinds = await readAuditKindCounts(page, "Issue types");
    if (issueKinds.cell_loss !== 1) {
      throw new Error(`Expected diagnostic issue kind cell_loss=1, got ${JSON.stringify(issueKinds)}`);
    }
    const issueRows = await page.locator(".notion-audit-items", { hasText: "Issues" }).locator("tbody tr").count();
    if (issueRows < 1) throw new Error("Expected at least one visible Notion audit issue row");
    const failText = (await page.locator(".notion-audit-fail").first().textContent())?.trim() ?? "";
    const pathButtons = await page.locator(".notion-audit-result .notion-audit-path button").count();
    if (pathButtons < 3) {
      throw new Error(`Expected diagnostic audit to expose at least 3 path Open buttons, saw ${pathButtons}`);
    }
    const pathOpenButtons = page.locator(".notion-audit-result .notion-audit-path button");
    await assertWithinViewport(page, pathOpenButtons.nth(0), `diagnostic path open source ${viewport.name}`, 8);
    await assertWithinViewport(page, pathOpenButtons.nth(1), `diagnostic path open workspace ${viewport.name}`, 8);
    await pathOpenButtons.nth(0).click();
    await pathOpenButtons.nth(1).click();
    await pathOpenButtons.nth(2).click();
    await waitForShellOpenRequests(page, [fixture.sourceRoot, fixture.workspaceRoot]);
    const shellOpenDryRunRequests = await page.evaluate(() => window.lotion.debug.getShellOpenRequests());
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".notion-audit-result").first(),
      metadata: {
        phase: "diagnostic",
        failText,
        issueKinds,
        issueRows,
        pathButtons,
        shellOpenDryRunRequests,
        sourceRoot: fixture.sourceRoot,
        summary,
        workspaceRoot: fixture.workspaceRoot
      },
      name: `notion-audit-diagnostic-${viewport.name}`,
      page,
      viewport
    });

    return {
      viewport: viewport.name,
      failText,
      issueKinds,
      issueRows,
      pathButtons,
      shellOpenDryRunRequests,
      snapshot: snapshotSummary(snapshot),
      sourceRoot: fixture.sourceRoot,
      summary,
      workspaceRoot: fixture.workspaceRoot
    };
  } finally {
    await disableShellOpenDryRun(page).catch(() => undefined);
  }
}

function snapshotSummary(snapshot) {
  return {
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: Number(snapshot.rect.height.toFixed(1)),
    width: Number(snapshot.rect.width.toFixed(1))
  };
}

function assertSummary(actual, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) {
      throw new Error(`Expected audit summary ${key}=${value}, got ${actual[key] ?? "(missing)"}`);
    }
  }
}

async function readAuditSummary(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".notion-summary tr"));
    return Object.fromEntries(rows.map((row) => {
      const key = row.querySelector("th")?.textContent?.trim() ?? "";
      const value = row.querySelector("td")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      return [key, value];
    }).filter(([key]) => key));
  });
}

async function readAuditKindCounts(page, title) {
  return page.evaluate((headingText) => {
    const sections = Array.from(document.querySelectorAll(".notion-audit-kind-summary"));
    const section = sections.find((candidate) => candidate.querySelector("h3")?.textContent?.trim() === headingText);
    if (!section) return {};
    return Object.fromEntries(Array.from(section.querySelectorAll(".notion-audit-kind-card")).map((card) => {
      const kind = card.querySelector("code")?.textContent?.trim() ?? "";
      const count = Number(card.querySelector("strong")?.textContent?.replace(/,/g, "").trim() ?? "0");
      return [kind, count];
    }).filter(([kind]) => kind));
  }, title);
}

async function enableShellOpenDryRun(page) {
  const enabled = await page.evaluate(async () => {
    if (!window.lotion.debug?.setShellOpenDryRun || !window.lotion.debug?.clearShellOpenRequests) return false;
    await window.lotion.debug.setShellOpenDryRun(true);
    await window.lotion.debug.clearShellOpenRequests();
    return true;
  });
  if (!enabled) throw new Error("Shell open dry-run debug API is not available");
}

async function disableShellOpenDryRun(page) {
  await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false));
}

async function waitForShellOpenRequests(page, expectedRequests) {
  await page.waitForFunction(async (expected) => {
    const requests = await window.lotion.debug.getShellOpenRequests();
    return expected.every((request) => requests.includes(request));
  }, expectedRequests, { timeout: 8_000 });
}

async function assertAuditPanelLayout(page, viewportName, phase) {
  await assertNoDocumentHorizontalOverflow(page, `notion audit ${phase} ${viewportName}`, 2);
  if (phase === "before-audit") {
    await assertWithinViewport(page, page.locator(".notion-audit-heading").first(), `audit heading ${phase} ${viewportName}`, 8);
    await assertWithinViewport(page, page.locator(".notion-audit-source-row").first(), `audit source row ${phase} ${viewportName}`, 8);
    await assertWithinViewport(page, page.locator(".notion-audit-options").first(), `audit options ${phase} ${viewportName}`, 8);
    return;
  }
  const result = page.locator(".notion-audit-result").first();
  await result.scrollIntoViewIfNeeded();
  await assertIntersectsViewport(page, result, `audit result ${viewportName}`, 8);
  const status = phase === "after-diagnostic"
    ? page.locator(".notion-audit-fail").first()
    : page.locator(".notion-audit-ok").first();
  await assertWithinViewport(page, status, `audit status ${phase} ${viewportName}`, 8);
  await assertWithinViewport(page, page.locator(".notion-summary").first(), `audit summary ${viewportName}`, 8);
  if (phase === "after-diagnostic") {
    await assertWithinViewport(page, page.locator(".notion-audit-kind-summary").first(), `audit issue kinds ${viewportName}`, 8);
    await assertIntersectsViewport(page, page.locator(".notion-audit-items").first(), `audit issue table ${viewportName}`, 8);
  }
}

async function openNotionImportPlugin(page) {
  if (await page.locator(".notion-audit-panel").count()) return;
  const detailPage = page.locator(".plugin-detail-page", { hasText: "Notion Import" });
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("lotion:open-plugin-detail", {
        detail: { pluginId: "notion-import", panel: "settings" }
      }));
    });
    try {
      await detailPage.waitFor({ timeout: 8_000 });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  const settingsTab = page.getByRole("tab", { name: "Settings" });
  if (await settingsTab.count()) {
    await settingsTab.first().click();
  }
  await page.locator(".plugin-detail-settings-panel").waitFor({ timeout: 8_000 });
}

async function openNotionImportCommandModal(page, viewportName) {
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "F",
      code: "KeyF",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true
    }));
  });
  await page.locator(".global-search-input").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".global-search").first(), `notion import command search ${viewportName}`, 8);
  await page.locator(".global-search-input").fill("Open Notion Import");
  const commandFilter = page.locator(".global-search-filters button").filter({ hasText: "命令" }).first();
  await commandFilter.waitFor({ timeout: 8_000 });
  await commandFilter.click();
  const commandHit = page.locator(".global-search-hit")
    .filter({ hasText: "Open Notion Import" })
    .filter({ hasText: "命令" })
    .first();
  await commandHit.waitFor({ timeout: 8_000 });
  await commandHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 8_000 });
}

async function createAuditFixture(viewportName = "default", {
  importedNotes = "Imported note",
  sourceNotes = "Imported note"
} = {}) {
  const root = await mkdtemp(join(tmpdir(), `lotion-notion-audit-ui-${viewportName}-`));
  const sourceRoot = join(root, "source");
  const workspaceRoot = join(root, "workspace");
  const sourceCsvRel = `Tasks ${CSV_HASH}.csv`;
  const sourceHtmlRel = `Tasks/Task One ${HTML_HASH}.html`;
  const originalCsvRel = `attachments/original/notion-export/${sourceCsvRel}`;
  const originalHtmlRel = `attachments/original/notion-export/${sourceHtmlRel}`;
  const csv = `Name,Notes\nTask One,${csvCell(sourceNotes)}\n`;
  const html = notionPage("Task One", "<p>Imported row body.</p>");

  await mkdir(join(sourceRoot, "Tasks"), { recursive: true });
  await writeFile(join(sourceRoot, sourceCsvRel), csv, "utf8");
  await writeFile(join(sourceRoot, sourceHtmlRel), html, "utf8");
  await mkdir(join(workspaceRoot, "attachments", "original", "notion-export", "Tasks"), { recursive: true });
  await writeFile(join(workspaceRoot, originalCsvRel), csv, "utf8");
  await writeFile(join(workspaceRoot, originalHtmlRel), html, "utf8");
  await createImportedWorkspace(workspaceRoot, originalCsvRel, originalHtmlRel, { importedNotes });
  return { root, sourceRoot, workspaceRoot };
}

async function createImportedWorkspace(root, originalCsvRel, originalHtmlRel, { importedNotes = "Imported note" } = {}) {
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_audit_ui_home";
  const pageTitle = "Audit UI Home";
  const databaseId = "db_audit_ui";
  const databaseName = "Tasks";
  const rowId = "row_audit_ui";
  const rowTitle = "Task One";
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
    spaceId: "sp_audit_ui",
    name: "Audit UI Smoke",
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
      path: ["Audit", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), `# ${pageTitle}\n\nTemporary workspace for Notion audit UI smoke.\n`, "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    path: ["Tasks"],
    notion_source_hash: CSV_HASH,
    notion_original_csv: originalCsvRel,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "notion_original_csv", name: "Original Notion CSV", type: "url" },
      { id: "notion_original_html", name: "Original Notion HTML", type: "url" },
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
    "notion_original_csv",
    "notion_original_html",
    "notes"
  ], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    page_file: rowPageFile,
    notion_original_csv: originalCsvRel,
    notion_original_html: originalHtmlRel,
    notes: importedNotes
  }]);
  await writeFile(join(root, rowPagePath), `# ${rowTitle}\n\nImported row body.\n`, "utf8");
}

function notionPage(title, body) {
  return `<!doctype html><html><body><article class="page sans"><header><h1 class="page-title">${title}</h1></header><div class="page-body">${body}</div></article></body></html>`;
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
