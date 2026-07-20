#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NotionImportService } from "../dist-electron/main/services/notion-import-service.js";
import {
  assertHarnessViewportCoverage,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness
} from "./ui-harness.mjs";

const PAGE_A = "10101010111122223333444455556666";
const PAGE_B = "20202020111122223333444455556666";
const PAGE_C = "30303030111122223333444455556666";
const DB_A = "40404040111122223333444455556666";
const DB_B = "50505050111122223333444455556666";

const result = await withLotionUIHarness("notion-import-report", async ({
  artifactRoot,
  cdpUrl,
  openWorkspace,
  page,
  registerTempWorkspace
}) => {
  const fixture = await createImportFixture();
  registerTempWorkspace(fixture.root);
  const importer = new NotionImportService({ touch: async () => undefined });
  const imported = await importer.runImport(fixture.sourceRoot, fixture.workspaceRoot, true, {
    skipEmptyRowsAndPages: true,
    dedupeMarkdownFiles: true,
    includeOriginalHtml: true
  });
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    await openWorkspace(fixture.workspaceRoot);
    await openPage(page, imported.reportPageId);
    await waitForPageMarkdown(page, imported.reportPageId, "## Same-name Pages And Databases", "detailed import report");
    await page.waitForFunction(
      () => document.querySelector(".title-input")?.value?.startsWith("Import report "),
      null,
      { timeout: 8_000 }
    );
    await page.getByText("Notion import report", { exact: true }).first().waitFor({ timeout: 8_000 });
    await page.getByText("Same-name Pages And Databases", { exact: true }).first().waitFor({ state: "visible", timeout: 8_000 });
    await assertNoDocumentHorizontalOverflow(page, `detailed import report ${viewport.name}`, 2);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: page.locator(".main-content").first(),
      metadata: {
        reportPageId: imported.reportPageId,
        status: imported.report.status,
        nameConflicts: imported.report.nameConflicts,
        iconCoverage: imported.report.icons
      },
      name: `notion-import-report-${viewport.name}`,
      page,
      viewport
    });
    viewports.push({
      viewport: viewport.name,
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      nameConflictGroups: imported.report.nameConflicts.groups.length,
      status: imported.report.status
    });
  });
  const summary = { cdpUrl, status: "passed", viewports };
  return { ...summary, viewportCoverage: assertHarnessViewportCoverage(summary, expectedViewports) };
});

console.log(JSON.stringify(result, null, 2));

async function createImportFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-import-report-ui-"));
  const sourceRoot = join(root, "source");
  const workspaceRoot = join(root, "workspace");
  await mkdir(join(sourceRoot, "Work"), { recursive: true });
  await mkdir(join(sourceRoot, "Personal"), { recursive: true });
  await writeFile(join(sourceRoot, "Work", `Projects ${DB_A}.csv`), "Name,Status\nLaunch,Active\n", "utf8");
  await writeFile(join(sourceRoot, "Personal", `Projects ${DB_B}.csv`), "Name,Status\nHome,Planned\n", "utf8");
  await writeFile(
    join(sourceRoot, `Weekly Review A ${PAGE_A}.html`),
    notionPage("Weekly Review", "<p>Work review.</p>", "🗓️"),
    "utf8"
  );
  await writeFile(
    join(sourceRoot, `Weekly Review B ${PAGE_B}.html`),
    notionPage("Weekly Review", "<p>Personal review.</p>", "📝"),
    "utf8"
  );
  await writeFile(
    join(sourceRoot, `Projects overview ${PAGE_C}.html`),
    notionPage("Projects", "<p>A page sharing its name with two databases.</p>", "📌"),
    "utf8"
  );
  return { root, sourceRoot, workspaceRoot };
}

function notionPage(title, body, icon) {
  return `<!doctype html><html><body><article class="page sans"><header><div class="page-header-icon"><span class="icon">${icon}</span></div><h1 class="page-title">${title}</h1></header><div class="page-body">${body}</div></article></body></html>`;
}
