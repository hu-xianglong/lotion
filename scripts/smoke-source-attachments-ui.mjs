#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertElementSnapshotBaseline,
  assertHarnessViewportCoverage,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  nextAnimationFrame,
  openRowPage,
  readRect,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";
import { assertSourceAttachmentArtifactContract } from "./lib/source-attachment-artifacts.mjs";

const result = await withLotionUIHarness("source-attachments-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const viewportResults = [];
  const expectedViewports = selectedViewports();
  try {
    await forEachViewport(page, expectedViewports, async (viewport) => {
      const fixture = await createSourceAttachmentFixture();
      registerTempWorkspace(fixture.root);
      await openWorkspace(fixture.root);
      await waitForDatabaseService(page, fixture.databaseId);
      await openRowPage(page, fixture.databaseId, fixture.rowId);
      await page.getByText(fixture.rowTitle).first().waitFor({ timeout: 8_000 });
      await expandPageDetails(page, viewport.name);
      await enableShellOpenDryRun(page);

      await waitForPropertyLinks(page, fixture.originalHtmlRel, fixture.originalCsvRel);
      await assertWithinViewport(page, propertyLink(page, fixture.originalHtmlRel), `original HTML source link ${viewport.name}`, 4);
      await assertWithinViewport(page, propertyLink(page, fixture.originalCsvRel), `original CSV source link ${viewport.name}`, 4);
      await assertPropertyLinkOpenAffordance(page, propertyLink(page, fixture.originalHtmlRel), `original HTML source link open affordance ${viewport.name}`);
      await assertPropertyLinkOpenAffordance(page, propertyLink(page, fixture.originalCsvRel), `original CSV source link open affordance ${viewport.name}`);
      await propertyLink(page, fixture.originalHtmlRel).click();
      await propertyLink(page, fixture.originalCsvRel).click();
      const propertySnapshot = await captureSourcePropertyPanelSnapshot(page, artifactRoot, fixture, viewport);

      await scrollEditorToTop(page);
      const documentLink = page.locator(`[data-md-url="${cssEscape(fixture.documentRel)}"]`).first();
      await documentLink.waitFor({ timeout: 8_000 });
      await documentLink.scrollIntoViewIfNeeded();
      await assertIntersectsViewport(page, documentLink, `document attachment link ${viewport.name}`, 4);
      await documentLink.click();
      await page.locator(".cm-md-attachment-preview-pdf").first().waitFor({ timeout: 8_000 });
      await page.locator(".cm-md-attachment-preview-video").first().waitFor({ timeout: 8_000 });
      await page.locator(".cm-md-attachment-preview-audio").first().waitFor({ timeout: 8_000 });
      await page.locator(`.cm-md-image-widget img[alt="Attachment image"]`).first().waitFor({ timeout: 8_000 });
      await waitForShellOpenRequests(page, [
        fixture.originalHtmlRel,
        fixture.originalCsvRel,
        fixture.documentRel
      ]);
      await assertNoDocumentHorizontalOverflow(page, `source attachments ${viewport.name}`);

      const rendered = await readRenderedAttachmentState(page, fixture);
      assertRenderedAttachmentState(rendered, fixture);

      viewportResults.push({
        viewport: viewport.name,
        workspaceRoot: fixture.root,
        originalHtmlRel: fixture.originalHtmlRel,
        originalCsvRel: fixture.originalCsvRel,
        documentRel: fixture.documentRel,
        pdfRel: fixture.pdfRel,
        videoRel: fixture.videoRel,
        audioRel: fixture.audioRel,
        imageRel: fixture.imageRel,
        propertySnapshot,
        rendered
      });
    });
  } finally {
    await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
  }

  const summary = {
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  };
  return {
    ...summary,
    artifactContract: await assertSourceAttachmentArtifactContract(summary, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    }),
    viewportCoverage: assertHarnessViewportCoverage(summary)
  };
});

console.log(JSON.stringify(result, null, 2));

async function waitForDatabaseService(page, databaseId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetDatabaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((candidate) => candidate.id === targetDatabaseId);
  }, databaseId, { timeout: 8_000 });
}

async function waitForPropertyLinks(page, originalHtmlRel, originalCsvRel) {
  await page.waitForFunction(({ html, csv }) => {
    const links = Array.from(document.querySelectorAll(".page-property-link")).map((el) => el.getAttribute("title"));
    return links.includes(html) && links.includes(csv);
  }, { html: originalHtmlRel, csv: originalCsvRel }, { timeout: 8_000 });
}

function propertyLink(page, href) {
  return page.locator(`.page-property-link[title="${cssEscape(href)}"]`).first();
}

async function assertPropertyLinkOpenAffordance(page, link, label) {
  const open = link.locator(".page-property-link-open").first();
  await open.waitFor({ state: "attached", timeout: 8_000 });
  const rect = await readRect(open);
  const style = await open.evaluate((element) => {
    const computed = window.getComputedStyle(element);
    return {
      display: computed.display,
      opacity: computed.opacity,
      visibility: computed.visibility
    };
  });
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    throw new Error(`${label} open affordance is not visible: ${JSON.stringify({ rect, style })}`);
  }
  if (rect.width < 28 || rect.height < 28) {
    throw new Error(`${label} hit target is too small: ${JSON.stringify(rect)}`);
  }
  await assertWithinViewport(page, open, label, 4);
  const layout = await link.evaluate((element) => {
    const text = element.querySelector(".page-property-link-text");
    const open = element.querySelector(".page-property-link-open");
    const textRect = text?.getBoundingClientRect();
    const openRect = open?.getBoundingClientRect();
    return {
      text: text?.textContent?.trim() ?? "",
      label: element.getAttribute("aria-label") ?? "",
      openTitle: open?.getAttribute("title") ?? "",
      textRight: textRect ? Number(textRect.right.toFixed(1)) : null,
      openLeft: openRect ? Number(openRect.left.toFixed(1)) : null,
      openWidth: openRect ? Number(openRect.width.toFixed(1)) : null,
      openHeight: openRect ? Number(openRect.height.toFixed(1)) : null,
      centerDelta: textRect && openRect
        ? Number(((textRect.top + textRect.height / 2) - (openRect.top + openRect.height / 2)).toFixed(1))
        : null
    };
  });
  if (!layout.label.startsWith("Open link:") || layout.openTitle !== "Open link") {
    throw new Error(`${label} should expose accessible open-link labels: ${JSON.stringify(layout)}`);
  }
  if (layout.textRight == null || layout.openLeft == null || layout.textRight > layout.openLeft + 1) {
    throw new Error(`${label} text overlaps open affordance: ${JSON.stringify(layout)}`);
  }
  if (layout.centerDelta == null || Math.abs(layout.centerDelta) > 6) {
    throw new Error(`${label} open affordance is not baseline-aligned: ${JSON.stringify(layout)}`);
  }
  return layout;
}

async function captureSourcePropertyPanelSnapshot(page, artifactRoot, fixture, viewport) {
  const propertyPanel = page.locator(".row-properties").first();
  await propertyPanel.waitFor({ timeout: 8_000 });
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: propertyPanel,
    metadata: {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle,
      originalHtmlRel: fixture.originalHtmlRel,
      originalCsvRel: fixture.originalCsvRel,
      sourceLinkCount: 2
    },
    name: `source-attachment-properties-${viewport.name}`,
    page,
    viewport
  });
  return assertElementSnapshotBaseline(snapshot, {
    label: `source attachment properties ${viewport.name}`,
    metadata: {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle,
      sourceLinkCount: 2
    },
    rect: {
      width: { min: 560, max: 940 },
      height: { min: 120, max: 340 }
    },
    requiredMetadataKeys: ["originalHtmlRel", "originalCsvRel"],
    viewportName: viewport.name
  });
}

async function expandPageDetails(page, viewportName) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.waitFor({ timeout: 8_000 });
  await panel.hover();
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-testid='page-secondary-panel']");
    const content = document.querySelector(".page-secondary-content");
    if (!(panel instanceof HTMLElement) || !(content instanceof HTMLElement)) return false;
    const rect = content.getBoundingClientRect();
    return panel.getAttribute("aria-expanded") === "true" &&
      rect.height > 12 &&
      window.getComputedStyle(content).visibility !== "hidden";
  }, null, { timeout: 5_000 });
  await assertWithinViewport(page, panel, `expanded page details ${viewportName}`, 4);
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

async function waitForShellOpenRequests(page, expectedRequests) {
  await page.waitForFunction(async (expected) => {
    const requests = await window.lotion.debug.getShellOpenRequests();
    return expected.every((request) => requests.includes(request));
  }, expectedRequests, { timeout: 8_000 });
}

async function scrollEditorToTop(page) {
  await page.evaluate(() => {
    const editor = document.querySelector(".codemirror-editor");
    if (editor instanceof HTMLElement) {
      editor.scrollIntoView({ block: "start" });
    }
    const surface = document.querySelector(".row-page-surface");
    if (surface instanceof HTMLElement && editor instanceof HTMLElement) {
      surface.scrollTop = Math.max(0, editor.offsetTop - 24);
      surface.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
    const scroller = document.querySelector(".cm-scroller");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  });
  await nextAnimationFrame(page);
}

async function readRenderedAttachmentState(page, fixture) {
  return page.evaluate(async ({ originalHtmlRel, originalCsvRel, documentRel, pdfRel, videoRel, audioRel, imageRel }) => ({
    sourceLinkButtons: Array.from(document.querySelectorAll(".page-property-link")).map((el) => ({
      title: el.getAttribute("title"),
      text: el.textContent?.trim(),
      readOnly: Boolean(el.closest(".row-property.read-only.source-link-property"))
    })).filter((item) => item.title === originalHtmlRel || item.title === originalCsvRel),
    documentLinks: document.querySelectorAll(`[data-md-url="${CSS.escape(documentRel)}"]`).length,
    shellOpenDryRunRequests: await window.lotion.debug.getShellOpenRequests(),
    pdfPreviewSrc: document.querySelector(".cm-md-attachment-preview-pdf")?.getAttribute("src") ?? "",
    videoPreview: {
      src: document.querySelector(".cm-md-attachment-preview-video")?.getAttribute("src") ?? "",
      controls: Boolean(document.querySelector(".cm-md-attachment-preview-video")?.controls)
    },
    audioPreview: {
      src: document.querySelector(".cm-md-attachment-preview-audio")?.getAttribute("src") ?? "",
      controls: Boolean(document.querySelector(".cm-md-attachment-preview-audio")?.controls)
    },
    imageSrc: document.querySelector(`.cm-md-image-widget img[alt="Attachment image"]`)?.getAttribute("src") ?? "",
    expectedPdfRel: pdfRel,
    expectedVideoRel: videoRel,
    expectedAudioRel: audioRel,
    expectedImageRel: imageRel
  }), {
    originalHtmlRel: fixture.originalHtmlRel,
    originalCsvRel: fixture.originalCsvRel,
    documentRel: fixture.documentRel,
    pdfRel: fixture.pdfRel,
    videoRel: fixture.videoRel,
    audioRel: fixture.audioRel,
    imageRel: fixture.imageRel
  });
}

function assertRenderedAttachmentState(rendered, fixture) {
  if (rendered.sourceLinkButtons.length !== 2) {
    throw new Error(`Expected 2 source link buttons, saw ${rendered.sourceLinkButtons.length}`);
  }
  if (!rendered.sourceLinkButtons.every((item) => item.readOnly)) {
    throw new Error(`Source attachment links should render inside read-only property rows: ${JSON.stringify(rendered.sourceLinkButtons)}`);
  }
  if (rendered.documentLinks < 1) {
    throw new Error("Document attachment link did not render with data-md-url");
  }
  if (!rendered.pdfPreviewSrc.includes(fixture.pdfRel)) {
    throw new Error(`PDF attachment preview did not resolve to workspace URL: ${rendered.pdfPreviewSrc}`);
  }
  if (!rendered.videoPreview.src.includes(fixture.videoRel) || !rendered.videoPreview.controls) {
    throw new Error(`Video attachment preview did not render with controls: ${JSON.stringify(rendered.videoPreview)}`);
  }
  if (!rendered.audioPreview.src.includes(fixture.audioRel) || !rendered.audioPreview.controls) {
    throw new Error(`Audio attachment preview did not render with controls: ${JSON.stringify(rendered.audioPreview)}`);
  }
  if (!rendered.imageSrc.includes(fixture.imageRel)) {
    throw new Error(`Image attachment did not resolve to workspace URL: ${rendered.imageSrc}`);
  }
}

async function createSourceAttachmentFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-source-attachments-"));
  const now = "2026-01-01T00:00:00.000Z";
  const homeId = "pg_source_attachment_home";
  const homeTitle = "Source Attachment Home";
  const databaseId = "db_source_attachment";
  const databaseName = "Source Attachment DB";
  const rowId = "row_source_attachment";
  const rowTitle = "Source Attachment Row";
  const originalHtmlRel = "attachments/original/notion-export/source-page.html";
  const originalCsvRel = "attachments/original/notion-export/source-database.csv";
  const documentRel = "attachments/documents/source-note.txt";
  const pdfRel = "attachments/documents/source-preview.pdf";
  const videoRel = "attachments/videos/source-preview.mp4";
  const audioRel = "attachments/audio/source-preview.mp3";
  const imageRel = "attachments/images/tiny-source.png";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await mkdir(join(root, "attachments", "original", "notion-export"), { recursive: true });
  await mkdir(join(root, "attachments", "documents"), { recursive: true });
  await mkdir(join(root, "attachments", "videos"), { recursive: true });
  await mkdir(join(root, "attachments", "audio"), { recursive: true });
  await mkdir(join(root, "attachments", "images"), { recursive: true });
  await writeFile(join(root, originalHtmlRel), "<!doctype html><title>Original Notion HTML</title><p>source</p>\n", "utf8");
  await writeFile(join(root, originalCsvRel), "Name,Notes\nExample,source csv\n", "utf8");
  await writeFile(join(root, documentRel), "source attachment note\n", "utf8");
  await writeFile(join(root, pdfRel), "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");
  await writeFile(join(root, videoRel), Buffer.from("lotion smoke video placeholder\n"));
  await writeFile(join(root, audioRel), Buffer.from("lotion smoke audio placeholder\n"));
  await writeFile(join(root, imageRel), tinyPngBytes());

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_source_attachment",
    name: "Source Attachment Smoke",
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
      icon: "emoji:📄",
      path: ["Bench", homeTitle],
      bodyPath: homePath
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nInitial page for source attachment smoke.\n`, "utf8");

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
      { id: "notion_original_html", name: "Original Notion HTML", type: "url" },
      { id: "notion_original_csv", name: "Original Notion CSV", type: "url" },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notion_original_html", "notion_original_csv", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "notion_original_html",
    "notion_original_csv",
    "notes"
  ], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    page_file: rowPageFile,
    notion_original_html: originalHtmlRel,
    notion_original_csv: originalCsvRel,
    notes: "Source links should render as property buttons"
  }]);
  await writeFile(join(root, rowPagePath), [
    `# ${rowTitle}`,
    "",
    "This page verifies source and attachment links.",
    "",
    `[Source note](${documentRel})`,
    "",
    `[Source PDF](${pdfRel})`,
    "",
    `[Source video](${videoRel})`,
    "",
    `[Source audio](${audioRel})`,
    "",
    `![Attachment image](${imageRel})`,
    ""
  ].join("\n"), "utf8");

  return {
    root,
    homeTitle,
    databaseId,
    rowId,
    rowTitle,
    originalHtmlRel,
    originalCsvRel,
    documentRel,
    pdfRel,
    videoRel,
    audioRel,
    imageRel
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

function tinyPngBytes() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

function cssEscape(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
