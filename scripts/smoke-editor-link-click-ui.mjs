#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertEditorLinkClickArtifactContract } from "./lib/editor-link-click-artifacts.mjs";
import {
  assertElementSnapshotBaseline,
  assertFocusWithin,
  assertHarnessViewportCoverage,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
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

const RAW_MARKDOWN_STORAGE_KEY = "lotion.settings.rawMarkdown";

const result = await withLotionUIHarness("editor-link-click", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const previousRawMarkdown = await readRawMarkdownSetting(page);
  const expectedViewports = selectedViewports();
  const viewports = [];
  try {
    await page.evaluate((key) => window.localStorage.setItem(key, "0"), RAW_MARKDOWN_STORAGE_KEY);
    await forEachViewport(page, expectedViewports, async (viewport) => {
      const fixture = await createEditorLinkClickFixture(viewport.name);
      await openWorkspace(fixture.root);
      await openPage(page, fixture.mainPageId);
      await waitForTitleValue(page, fixture.mainTitle);
      const capture = await enableShellOpenCapture(page);
      try {
        const external = await assertRenderedLinkClickOpensExternal(page, fixture, capture, viewport);
        const internal = await assertRenderedPageLinkNavigates(page, fixture, capture, viewport);
        const blankEdit = await assertBlankSpaceClickEditsLine(page, fixture, capture, viewport);
        const overflow = await assertNoDocumentHorizontalOverflow(page, `editor link click ${viewport.name}`, 8);
        const visualSnapshot = await captureEditorLinkClickSnapshot({
          artifactRoot,
          blankEdit,
          external,
          fixture,
          internal,
          page,
          viewport
        });
        viewports.push({
          viewport,
          pageId: fixture.mainPageId,
          external,
          internal,
          blankEdit,
          overflow,
          visualSnapshot
        });
      } finally {
        await clearCapturedOpenRequests(page, capture).catch(() => undefined);
        await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
      }
    });
  } finally {
    await restoreRawMarkdownSetting(page, previousRawMarkdown).catch(() => undefined);
  }

  const summary = { cdpUrl, viewports, status: "passed" };
  summary.artifactContract = await assertEditorLinkClickArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

assertHarnessViewportCoverage(result);
console.log(JSON.stringify(result, null, 2));

async function assertRenderedLinkClickOpensExternal(page, fixture, capture, viewport) {
  await clearCapturedOpenRequests(page, capture);
  const link = page.locator(".cm-md-link").filter({ hasText: fixture.externalLabel }).last();
  await link.waitFor({ timeout: 8_000 });
  await link.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, link, `external link ${viewport.name}`, 4);
  const beforeMarkdown = await readPageMarkdown(page, fixture.mainPageId);
  const beforeLine = await renderedLineState(page, fixture.externalLabel);
  if (beforeLine.leakedSource) {
    throw new Error(`External rendered link leaked Markdown source before click: ${JSON.stringify(beforeLine)}`);
  }

  await clickVisibleText(page, fixture.externalLabel);
  const opened = await waitForCapturedOpenRequest(page, capture, fixture.externalUrl);
  await waitForTitleValue(page, fixture.mainTitle);
  const afterMarkdown = await readPageMarkdown(page, fixture.mainPageId);
  const afterLine = await renderedLineState(page, fixture.externalLabel);
  if (afterMarkdown !== beforeMarkdown) {
    throw new Error(`Direct external link click mutated Markdown: ${JSON.stringify({ beforeMarkdown, afterMarkdown })}`);
  }
  if (afterLine.leakedSource) {
    throw new Error(`Direct external link click entered source mode instead of opening: ${JSON.stringify(afterLine)}`);
  }
  return {
    href: fixture.externalUrl,
    opened,
    lineText: afterLine.text
  };
}

async function assertRenderedPageLinkNavigates(page, fixture, capture, viewport) {
  await clearCapturedOpenRequests(page, capture);
  const link = page.locator(".cm-md-link").filter({ hasText: fixture.secondaryTitle }).last();
  await link.waitFor({ timeout: 8_000 });
  await link.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, link, `internal page link ${viewport.name}`, 4);
  const beforeLine = await renderedLineState(page, fixture.secondaryTitle);
  if (beforeLine.dataUrl !== fixture.secondaryPath || beforeLine.leakedSource) {
    throw new Error(`Internal rendered link did not expose the expected page target: ${JSON.stringify({ expected: fixture.secondaryPath, beforeLine })}`);
  }

  await link.click();
  await waitForTitleValue(page, fixture.secondaryTitle);
  await page.getByText(fixture.secondaryBody).first().waitFor({ timeout: 8_000 });
  const opened = await readCapturedOpenRequests(page, capture);
  if (opened.length > 0) {
    throw new Error(`Internal page link used shell.openLink instead of Lotion navigation: ${JSON.stringify(opened)}`);
  }

  await openPage(page, fixture.mainPageId);
  await waitForTitleValue(page, fixture.mainTitle);
  return {
    target: fixture.secondaryPath,
    navigatedTitle: fixture.secondaryTitle
  };
}

async function assertBlankSpaceClickEditsLine(page, fixture, capture, viewport) {
  await clearCapturedOpenRequests(page, capture);
  const token = ` blank-edit-${viewport.name}-${Date.now()}`;
  const point = await blankPointAfterText(page, fixture.externalLabel);
  await page.mouse.click(point.x, point.y);
  await assertFocusWithin(editorContent(page), `blank-space editor focus ${viewport.name}`);
  await page.keyboard.type(token);
  await waitForEditorText(page, token, `blank-space token ${viewport.name}`);
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, token, `blank-space edit autosave ${viewport.name}`);
  if (!markdown.includes(fixture.externalUrl) || !markdown.includes(token)) {
    throw new Error(`Blank-space edit did not preserve link URL and token: ${JSON.stringify({ token, markdown })}`);
  }
  const opened = await readCapturedOpenRequests(page, capture);
  if (opened.length > 0) {
    throw new Error(`Blank-space line click opened a link instead of editing: ${JSON.stringify(opened)}`);
  }
  return {
    token,
    focused: true
  };
}

async function renderedLineState(page, expectedText) {
  return page.evaluate((needle) => {
    const links = Array.from(document.querySelectorAll(".cm-md-link, .cm-md-url"));
    const link = links.find((candidate) => (candidate.textContent ?? "").includes(needle));
    if (!link) throw new Error(`Could not find rendered link text ${needle}`);
    const line = link.closest(".cm-line");
    const text = line?.textContent ?? "";
    return {
      text,
      dataUrl: link.getAttribute("data-md-url") ?? "",
      leakedSource: text.includes("](") || text.includes("](databases/") || text.includes("](http")
    };
  }, expectedText);
}

async function captureEditorLinkClickSnapshot({
  artifactRoot,
  blankEdit,
  external,
  fixture,
  internal,
  page,
  viewport
}) {
  const editor = page.locator('[data-testid="markdown-editor"]').first();
  await assertIntersectsViewport(page, editor, `editor link-click snapshot ${viewport.name}`, 4);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: editor,
    metadata: {
      phase: "editor-link-click",
      pageId: fixture.mainPageId,
      externalHref: external.href,
      internalTarget: internal.target,
      blankEditToken: blankEdit.token,
      externalOpenedCount: Array.isArray(external.opened) ? external.opened.length : 0,
      internalNavigatedTitle: internal.navigatedTitle
    },
    name: `editor-link-click-${viewport.name}`,
    page,
    viewport
  });
  return assertElementSnapshotBaseline(snapshot, {
    label: `editor link-click ${viewport.name}`,
    metadata: {
      phase: "editor-link-click",
      pageId: fixture.mainPageId,
      externalHref: external.href,
      internalTarget: internal.target,
      blankEditToken: blankEdit.token
    },
    rect: {
      width: { min: 300 },
      height: { min: 100 }
    },
    requiredMetadataKeys: ["externalOpenedCount", "internalNavigatedTitle"],
    viewportName: viewport.name
  });
}

async function blankPointAfterText(page, expectedText) {
  return page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent ?? "";
      const index = text.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const textRect = range.getBoundingClientRect();
      const line = node.parentElement?.closest(".cm-line");
      const lineRect = line?.getBoundingClientRect();
      if (!lineRect || !textRect.width || !textRect.height) continue;
      const x = Math.min(lineRect.right - 16, Math.max(textRect.right + 48, lineRect.left + 280));
      if (x <= textRect.right + 8) {
        throw new Error(`No blank editable area after ${needle}: ${JSON.stringify({ textRect, lineRect })}`);
      }
      return {
        x,
        y: textRect.top + textRect.height / 2
      };
    }
    throw new Error(`Could not find text for blank click: ${needle}`);
  }, expectedText);
}

async function clickVisibleText(page, text) {
  const point = await textPoint(page, text, { bias: 0.5 });
  await page.mouse.click(point.x, point.y);
}

async function textPoint(page, text, options = {}) {
  return page.evaluate(({ needle, bias }) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const content = node.textContent ?? "";
      const index = content.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      const offset = index + Math.max(0, Math.min(needle.length - 1, Math.floor(needle.length * bias)));
      range.setStart(node, offset);
      range.setEnd(node, Math.min(offset + 1, content.length));
      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
    throw new Error(`Could not locate visible text: ${needle}`);
  }, { needle: text, bias: options.bias ?? 0.5 });
}

function editorContent(page) {
  return page.locator(".cm-content").first();
}

async function waitForEditorText(page, expectedText, label) {
  await page.waitForFunction(
    ({ expected }) => (document.querySelector(".cm-content")?.textContent ?? "").includes(expected),
    { expected: expectedText },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const text = await page.locator(".cm-content").first().textContent().catch(() => "");
    throw new Error(`${label} did not appear in editor. Text=${JSON.stringify(text)}. ${error.message}`);
  });
}

async function waitForTitleValue(page, expectedTitle) {
  const title = page.locator(".title-input").first();
  await title.waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    ({ expected }) => document.querySelector(".title-input")?.value === expected,
    { expected: expectedTitle },
    { timeout: 8_000 }
  );
}

async function readPageMarkdown(page, pageId) {
  return page.evaluate(async (targetPageId) => {
    const doc = await window.lotion.pages.get(targetPageId);
    return doc.markdown;
  }, pageId);
}

async function enableShellOpenCapture(page) {
  const dryRun = await page.evaluate(async () => {
    const debug = window.lotion.debug;
    if (!debug?.setShellOpenDryRun || !debug?.clearShellOpenRequests || !debug?.getShellOpenRequests) {
      return { enabled: false };
    }
    await debug.setShellOpenDryRun(true);
    await debug.clearShellOpenRequests();
    return { enabled: true };
  });
  if (dryRun.enabled) return { mode: "debug-dry-run" };

  const patch = await page.evaluate(() => {
    const opened = [];
    Object.defineProperty(window, "__lotionOpenedUrls", {
      configurable: true,
      value: opened
    });
    const original = window.lotion.shell.openLink;
    try {
      window.lotion.shell.openLink = async (url) => {
        opened.push(url);
        return "";
      };
      if (window.lotion.shell.openLink === original) {
        Object.defineProperty(window.lotion.shell, "openLink", {
          configurable: true,
          value: async (url) => {
            opened.push(url);
            return "";
          }
        });
      }
      return { patched: window.lotion.shell.openLink !== original };
    } catch (error) {
      return {
        patched: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  if (!patch.patched) {
    throw new Error(`Could not capture shell.openLink for editor link click smoke: ${JSON.stringify(patch)}`);
  }
  return { mode: "patched-shell-open" };
}

async function clearCapturedOpenRequests(page, capture) {
  await page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") await window.lotion.debug?.clearShellOpenRequests?.();
    if (Array.isArray(window.__lotionOpenedUrls)) window.__lotionOpenedUrls.length = 0;
  }, capture.mode);
}

async function readCapturedOpenRequests(page, capture) {
  return page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") return await window.lotion.debug?.getShellOpenRequests?.() ?? [];
    return Array.isArray(window.__lotionOpenedUrls) ? [...window.__lotionOpenedUrls] : [];
  }, capture.mode);
}

async function waitForCapturedOpenRequest(page, capture, expectedUrl) {
  await page.waitForFunction(
    async ({ mode, expected }) => {
      if (mode === "debug-dry-run") {
        return (await window.lotion.debug.getShellOpenRequests()).includes(expected);
      }
      const opened = window.__lotionOpenedUrls;
      return Array.isArray(opened) && opened.includes(expected);
    },
    { mode: capture.mode, expected: expectedUrl },
    { timeout: 5_000 }
  );
  return readCapturedOpenRequests(page, capture);
}

async function readRawMarkdownSetting(page) {
  return page.evaluate((key) => window.localStorage.getItem(key), RAW_MARKDOWN_STORAGE_KEY);
}

async function restoreRawMarkdownSetting(page, previous) {
  await page.evaluate(({ key, value }) => {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  }, { key: RAW_MARKDOWN_STORAGE_KEY, value: previous });
}

async function createEditorLinkClickFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-editor-link-click-${viewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const mainPageId = `pg_editor_link_click_main_${viewportName}`;
  const secondaryPageId = `pg_editor_link_click_secondary_${viewportName}`;
  const mainTitle = `Editor Link Click Main ${viewportName}`;
  const secondaryTitle = `Editor Link Click Secondary ${viewportName}`;
  const secondaryBody = `Secondary page opened by direct page link ${viewportName}.`;
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const mainPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(mainPageId, mainTitle));
  const secondaryPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(secondaryPageId, secondaryTitle));
  const externalLabel = `External direct link ${viewportName}`;
  const externalUrl = `https://example.com/editor-direct-click/${viewportName}`;
  const bareUrl = `https://example.com/editor-bare-direct/${viewportName}`;
  const internalLabel = `Open secondary page ${viewportName}`;

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_editor_link_click_${viewportName}`,
    name: `Editor Link Click ${viewportName}`,
    pages: [mainPageId, secondaryPageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: mainPageId,
      title: mainTitle,
      now,
      icon: "emoji:🔗",
      path: ["Smoke", mainTitle],
      bodyPath: mainPath
    }),
    pageRecord({
      id: secondaryPageId,
      title: secondaryTitle,
      now,
      icon: "emoji:↗️",
      path: ["Smoke", secondaryTitle],
      bodyPath: secondaryPath
    })
  ]);
  await writeFile(join(root, mainPath), `# ${mainTitle}

External link fixture: [${externalLabel}](${externalUrl})
Bare URL fixture: ${bareUrl}
Internal page fixture: [${internalLabel}](${secondaryPath})
`, "utf8");
  await writeFile(join(root, secondaryPath), `# ${secondaryTitle}\n\n${secondaryBody}\n`, "utf8");

  return {
    root,
    mainPageId,
    secondaryPageId,
    mainTitle,
    secondaryTitle,
    secondaryBody,
    secondaryPath,
    externalLabel,
    externalUrl,
    bareUrl,
    internalLabel
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
    "small_text",
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
    small_text: "",
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
      { id: "small_text", name: "Small text", type: "checkbox" },
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
