#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertFocusWithin,
  assertHarnessViewportCoverage,
  assertNoHarnessConsoleErrors,
  assertStablePageLayout,
  forEachViewport,
  nextAnimationFrame,
  openPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("ui-harness-foundation", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];

  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createHarnessFoundationFixture(viewport.name);
    await openWorkspace(fixture.root);
    await openPage(page, fixture.pageId);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });

    const title = page.locator(".title-input").first();
    const editor = page.locator('[data-testid="markdown-editor"]').first();
    const initialLayout = await assertStablePageLayout(page, {
      critical: [{ label: "title", locator: title }],
      label: `foundation page ${viewport.name}`,
      visible: [{ label: "editor", locator: editor }]
    });

    await editor.click();
    await nextAnimationFrame(page);
    const focusState = await assertFocusWithin(editor, `foundation editor ${viewport.name}`);

    const token = `Harness foundation edit ${viewport.name} ${Date.now()}`;
    await page.keyboard.type(`\n${token}`);
    await waitForPageMarkdown(page, fixture.pageId, token, `foundation edit autosave ${viewport.name}`);
    const editedLayout = await assertStablePageLayout(page, {
      critical: [{ label: "title", locator: title }],
      label: `foundation edited page ${viewport.name}`,
      visible: [{ label: "editor", locator: editor }]
    });

    viewports.push({
      viewport,
      pageId: fixture.pageId,
      pageTitle: fixture.pageTitle,
      initialLayout,
      editedLayout,
      focusState,
      edited: token
    });
  });

  const summary = {
    artifactRoot,
    cdpUrl,
    status: "passed",
    viewports
  };
  summary.viewportCoverage = assertHarnessViewportCoverage(summary);
  return summary;
});

assertHarnessViewportCoverage(result);
const manifestPath = join(result.artifactRoot, "harness-result.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.status !== "passed") {
  throw new Error(`Harness manifest should record a passed run: ${JSON.stringify(manifest)}`);
}
if (manifest.name !== "ui-harness-foundation") {
  throw new Error(`Harness manifest recorded the wrong suite: ${JSON.stringify(manifest)}`);
}
if (manifest.coverage.missingViewportNames.length !== 0) {
  throw new Error(`Harness manifest missed viewport coverage: ${JSON.stringify(manifest.coverage)}`);
}
assertNoHarnessConsoleErrors(manifest, "ui-harness-foundation");
if (!manifest.result || manifest.result.viewportCount !== selectedViewports().length) {
  throw new Error(`Harness manifest did not summarize viewport results: ${JSON.stringify(manifest.result)}`);
}

console.log(JSON.stringify({ ...result, harnessManifest: manifestPath }, null, 2));

async function createHarnessFoundationFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-ui-harness-foundation-${viewportName}-`));
  const now = "2026-06-15T00:00:00.000Z";
  const pageId = `pg_ui_harness_${viewportName}`;
  const pageTitle = `UI Harness Foundation ${viewportName}`;
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_ui_harness_${viewportName}`,
    name: `UI Harness Foundation ${viewportName}`,
    pages: [pageId],
    databases: [],
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
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId: PAGES_DATABASE_ID,
    name: "All",
    type: "table",
    fields: ["title", "path", "icon"],
    sort: [],
    filter: { type: "and", filters: [] },
    pageSize: 20,
    wrap: true
  });
  await writeCsv(join(pagesDir, "data.csv"), ["id", "title", "body_path", "icon", "path", "created_time", "updated_time"], [
    {
      id: pageId,
      title: pageTitle,
      body_path: pagePath,
      icon: "emoji:🧪",
      path: serializePathValue(["Testing", pageTitle]),
      created_time: now,
      updated_time: now
    }
  ]);
  await writeFile(join(root, pagePath), [
    `# ${pageTitle}`,
    "",
    "This page exists to validate the shared UI harness.",
    "",
    "- It should render without horizontal overflow.",
    "- It should accept editor focus and persist typed text.",
    ""
  ].join("\n"), "utf8");

  return { root, pageId, pageTitle };
}
