#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertImageLightboxArtifactContract } from "./lib/image-lightbox-artifacts.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  nextAnimationFrame,
  openPage,
  readRect,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("image-lightbox-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const viewportResults = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createImageLightboxFixture();
    registerTempWorkspace(fixture.root);
    await openWorkspace(fixture.root);
    await openPage(page, fixture.pageId);
    await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
    await assertNoDocumentHorizontalOverflow(page, `image lightbox page ${viewport.name}`);

    const imageWidget = page.locator(".cm-md-image-widget").first();
    const image = page.locator('.cm-md-image-widget img[alt="Lightbox image"]').first();
    await image.waitFor({ timeout: 8_000 });
    await assertWithinViewport(page, imageWidget, `image widget ${viewport.name}`, 4);
    await image.dblclick();

    const lightbox = page.locator(".cm-md-image-lightbox").first();
    await lightbox.waitFor({ timeout: 5_000 });
    await assertWithinViewport(page, lightbox, `image lightbox ${viewport.name}`, 4);
    const toolbar = lightbox.locator(".cm-md-image-lightbox-toolbar").first();
    const lightboxImage = lightbox.locator(".cm-md-image-lightbox-stage img").first();
    await toolbar.waitFor({ timeout: 5_000 });
    await lightbox.getByRole("button", { name: "Zoom in" }).waitFor({ timeout: 5_000 });
    await lightbox.getByRole("button", { name: "Zoom out" }).waitFor({ timeout: 5_000 });
    await lightbox.getByRole("button", { name: "Reset zoom" }).waitFor({ timeout: 5_000 });
    await lightbox.getByRole("button", { name: "Close image preview" }).waitFor({ timeout: 5_000 });
    const controls = await lightbox.locator("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label") || button.textContent?.trim()).filter(Boolean));
    await page.waitForFunction(() => {
      const image = document.querySelector(".cm-md-image-lightbox-stage img");
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    }, null, { timeout: 5_000 });
    await assertWithinViewport(page, toolbar, `image lightbox toolbar ${viewport.name}`, 4);
    const initialRect = await readRect(lightboxImage);
    assertUsableImageRect(initialRect, `initial image ${viewport.name}`);

    await lightbox.getByRole("button", { name: "Zoom in" }).click();
    await waitForLightboxZoom(page, 125);
    const zoomedRect = await waitForImageWidth(page, initialRect.width * 1.18, `zoomed image ${viewport.name}`);
    await assertWithinViewport(page, toolbar, `image lightbox toolbar after zoom ${viewport.name}`, 4);
    await assertNoDocumentHorizontalOverflow(page, `image lightbox zoomed ${viewport.name}`);

    await page.keyboard.press("+");
    await waitForLightboxZoom(page, 150);
    const keyboardZoomRect = await waitForImageWidth(page, zoomedRect.width * 1.1, `keyboard zoom image ${viewport.name}`);
    await page.keyboard.press("-");
    await waitForLightboxZoom(page, 125);
    await waitForImageWidthBelow(page, keyboardZoomRect.width * 0.95, `keyboard zoom-out image ${viewport.name}`);

    await page.keyboard.press("0");
    await waitForLightboxZoom(page, 100);
    const resetRect = await waitForImageWidthNear(page, initialRect.width, `reset image ${viewport.name}`);
    if (Math.abs(resetRect.height - initialRect.height) > 3) {
      throw new Error(`Reset image height did not return near initial size for ${viewport.name}: ${JSON.stringify({ initialRect, resetRect })}`);
    }

    await lightbox.getByRole("button", { name: "Zoom out" }).click();
    await waitForLightboxZoom(page, 75);
    await waitForImageWidthBelow(page, initialRect.width * 0.85, `button zoom-out image ${viewport.name}`);
    await page.keyboard.press("0");
    await waitForLightboxZoom(page, 100);
    await assertNoDocumentHorizontalOverflow(page, `image lightbox open ${viewport.name}`);
    const evidence = {
      closed: false,
      controls,
      geometry: {
        initialRect,
        keyboardZoomRect,
        resetRect,
        zoomedRect
      },
      imageRel: fixture.imageRel,
      noHorizontalOverflow: true,
      opened: true,
      phase: "image-lightbox",
      viewport: viewport.name
    };
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: lightbox,
      metadata: evidence,
      name: `image-lightbox-${viewport.name}`,
      page,
      viewport
    });
    await page.keyboard.press("Escape");
    await page.locator(".cm-md-image-lightbox").waitFor({ state: "detached", timeout: 5_000 });
    evidence.closed = true;

    viewportResults.push({
      viewport: viewport.name,
      workspaceRoot: fixture.root,
      pageId: fixture.pageId,
      imageRel: fixture.imageRel,
      ...evidence,
      snapshot
    });
  });

  const summary = {
    cdpUrl,
    artifactRoot,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertImageLightboxArtifactContract(summary);
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function createImageLightboxFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-image-lightbox-"));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = "pg_image_lightbox";
  const pageTitle = "Image Lightbox Smoke";
  const imageRel = "attachments/images/lightbox.svg";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(root, "attachments", "images"), { recursive: true });
  await writeFile(join(root, imageRel), lightboxSvg(), "utf8");
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_image_lightbox",
    name: "Image Lightbox Smoke",
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
      icon: "emoji:🖼️",
      path: ["Bench", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), [
    `# ${pageTitle}`,
    "",
    `![Lightbox image](${imageRel})`,
    ""
  ].join("\n"), "utf8");

  return { root, pageId, pageTitle, imageRel };
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

async function waitForLightboxZoom(page, zoom) {
  await page.waitForFunction(
    (expected) => document.querySelector(".cm-md-image-lightbox")?.getAttribute("data-zoom") === String(expected),
    zoom,
    { timeout: 2_000 }
  );
  await nextAnimationFrame(page);
}

async function waitForImageWidth(page, minWidth, label) {
  await page.waitForFunction(
    (minimum) => {
      const image = document.querySelector(".cm-md-image-lightbox-stage img");
      return image instanceof HTMLImageElement && image.getBoundingClientRect().width >= minimum;
    },
    minWidth,
    { timeout: 2_000 }
  );
  const rect = await readRect(page.locator(".cm-md-image-lightbox-stage img").first());
  assertUsableImageRect(rect, label);
  return rect;
}

async function waitForImageWidthBelow(page, maxWidth, label) {
  await page.waitForFunction(
    (maximum) => {
      const image = document.querySelector(".cm-md-image-lightbox-stage img");
      return image instanceof HTMLImageElement && image.getBoundingClientRect().width <= maximum;
    },
    maxWidth,
    { timeout: 2_000 }
  );
  const rect = await readRect(page.locator(".cm-md-image-lightbox-stage img").first());
  assertUsableImageRect(rect, label);
  return rect;
}

async function waitForImageWidthNear(page, expectedWidth, label) {
  await page.waitForFunction(
    (expected) => {
      const image = document.querySelector(".cm-md-image-lightbox-stage img");
      if (!(image instanceof HTMLImageElement)) return false;
      return Math.abs(image.getBoundingClientRect().width - expected) <= 3;
    },
    expectedWidth,
    { timeout: 2_000 }
  );
  const rect = await readRect(page.locator(".cm-md-image-lightbox-stage img").first());
  assertUsableImageRect(rect, label);
  return rect;
}

function assertUsableImageRect(rect, label) {
  if (rect.width < 120 || rect.height < 80) {
    throw new Error(`${label} image geometry is too small for zoom assertions: ${JSON.stringify(rect)}`);
  }
}

function lightboxSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260" viewBox="0 0 420 260">',
    '<rect width="420" height="260" rx="18" fill="#fbf6ed"/>',
    '<rect x="28" y="28" width="364" height="204" rx="14" fill="#dfe9dd" stroke="#3c8154" stroke-width="6"/>',
    '<circle cx="118" cy="104" r="36" fill="#d7a944"/>',
    '<path d="M60 200 L160 132 L224 184 L278 146 L360 204" fill="none" stroke="#2f557f" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>',
    '<text x="210" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#24221f">Lightbox Zoom</text>',
    '</svg>'
  ].join("");
}
