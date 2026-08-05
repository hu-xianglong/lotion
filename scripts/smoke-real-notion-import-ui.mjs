#!/usr/bin/env node
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { assertNotionRealWorkspaceArtifactContract } from "./lib/notion-real-workspace-artifacts.mjs";
import {
  assertRealWorkspaceSourceUnchanged,
  cleanupRealWorkspaceClone,
  cloneRealWorkspaceForSmoke
} from "./lib/real-workspace-clone.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  setLotionLocale,
  withLotionUIHarness
} from "./ui-harness.mjs";

const SOURCE_WORKSPACE_NAME = "Notion Import";
const NATIVE_DATABASE_ID = requiredEnv("LOTION_REAL_NOTION_DATABASE_ID");
const NATIVE_ROW_ID = requiredEnv("LOTION_REAL_NOTION_ROW_ID");
const NATIVE_VISION_TITLE = requiredEnv("LOTION_REAL_NOTION_PAGE_TITLE");
const SEEDED_TOGGLE_TITLE = "Family Vision Check";
const SEEDED_PROVENANCE = "clone-seeded-exact-importer-regression";
const RAW_MARKDOWN_STORAGE_KEY = "lotion.settings.rawMarkdown";
const sourceRoot = process.env.LOTION_REAL_WORKSPACE_PATH
  || join(homedir(), "Documents", "Lotion Workspaces", SOURCE_WORKSPACE_NAME);
const clone = await cloneRealWorkspaceForSmoke(sourceRoot, { prefix: "lotion-notion-real-visual-" });
let result;
let runError;
let safetyError;

try {
  result = await withLotionUIHarness("real-notion-import-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
    await setLotionLocale(page, "zh");
    await openWorkspace(clone.cloneRoot);
    await page.evaluate((key) => window.localStorage.setItem(key, "0"), RAW_MARKDOWN_STORAGE_KEY);
    const sourceInspection = await inspectStaleSource(page);
    const seedAttachment = await findSeedImageAttachment(clone.cloneRoot);
    const seededRegression = await seedExactToggleRegression(page, seedAttachment);
    const viewports = [];

    await forEachViewport(page, selectedViewports(), async (viewport) => {
      const activeWorkspace = await readActiveWorkspaceEvidence(page, clone.cloneRoot);
      const nativeVision = await verifyNativeVisionPage({ artifactRoot, page, viewport });
      const seededToggle = await verifySeededTogglePage({ artifactRoot, page, seededRegression, viewport });
      const importModal = await verifyImportModal({ artifactRoot, page, viewport });
      viewports.push({
        viewport: viewport.name,
        workspaceName: activeWorkspace.workspaceName,
        activeWorkspaceWasClone: activeWorkspace.activeWorkspaceWasClone,
        nativeVision,
        seededToggle,
        importModal
      });
    });

    const sourceSafety = await assertRealWorkspaceSourceUnchanged(clone);
    const summary = {
      status: "passed",
      cdpUrl,
      sourceIdentity: clone.sourceIdentity,
      sourceFingerprint: clone.sourceBefore,
      cloneFingerprint: clone.cloneFingerprint,
      isolation: clone.isolation,
      sourceSafety,
      staleSource: {
        toggleTargetMissing: sourceInspection.toggleTargetMissing,
        nativeVisionTitle: sourceInspection.nativeVisionTitle
      },
      seededRegression: {
        title: seededRegression.title,
        provenance: seededRegression.provenance,
        seededInClone: true
      },
      viewports
    };
    summary.artifactContract = await assertNotionRealWorkspaceArtifactContract(summary, {
      expectedNativePageTitle: NATIVE_VISION_TITLE,
      expectedViewportNames: selectedViewports().map((viewport) => viewport.name)
    });
    return summary;
  });
} catch (error) {
  runError = error;
}

try {
  await assertRealWorkspaceSourceUnchanged(clone);
} catch (error) {
  safetyError = error;
} finally {
  await cleanupRealWorkspaceClone(clone);
}

if (runError || safetyError) {
  throw new AggregateError([runError, safetyError].filter(Boolean), "Real Notion Import visual smoke failed or source immutability was not proven.");
}
console.log(JSON.stringify(result, null, 2));

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the isolated real-workspace smoke.`);
  return value;
}

async function inspectStaleSource(page) {
  return page.evaluate(async ({ databaseId, rowId, missingTitle, nativeTitle }) => {
    const [pages, database] = await Promise.all([
      window.lotion.pages.list(),
      window.lotion.databases.get(databaseId)
    ]);
    const record = database.records.find((candidate) => String(candidate.id) === rowId);
    return {
      toggleTargetMissing: !pages.some((candidate) => candidate.title === missingTitle),
      nativeVisionTitle: String(record?.title || "") === nativeTitle ? nativeTitle : ""
    };
  }, {
    databaseId: NATIVE_DATABASE_ID,
    rowId: NATIVE_ROW_ID,
    missingTitle: SEEDED_TOGGLE_TITLE,
    nativeTitle: NATIVE_VISION_TITLE
  });
}

async function seedExactToggleRegression(page, attachmentPath) {
  const markdown = [
    `# ${SEEDED_TOGGLE_TITLE}`,
    "",
    "```lotion-toggle",
    "summary: Appointment receipt",
    "open: true",
    "---",
    `![appointment.jpg](${attachmentPath})`,
    "",
    "Booked a vision check appointment",
    "```",
    "",
    "## Log",
    "",
    "| Date | Note |",
    "| --- | --- |",
    "| 2024/1/15 | Booked a vision check appointment |"
  ].join("\n");
  const seeded = await page.evaluate(async ({ title, body }) => {
    const created = await window.lotion.pages.create({ title, path: ["Health Archive", title] });
    const updated = await window.lotion.pages.update(created.meta.id, { markdown: body });
    return { pageId: updated.meta.id, title: updated.meta.title };
  }, { title: SEEDED_TOGGLE_TITLE, body: markdown });
  return { ...seeded, provenance: SEEDED_PROVENANCE, attachmentPath };
}

async function verifyNativeVisionPage({ artifactRoot, page, viewport }) {
  const started = performance.now();
  await navigateToRowPage(page, NATIVE_DATABASE_ID, NATIVE_ROW_ID);
  await waitForPageTitle(page, NATIVE_VISION_TITLE, 20_000);
  await page.getByText("状态: 完成", { exact: true }).first().waitFor({ timeout: 20_000 });
  await page.getByText("日志", { exact: true }).first().waitFor({ timeout: 20_000 });
  const openMs = Number((performance.now() - started).toFixed(1));
  const overflow = await assertNoDocumentHorizontalOverflow(page, `real Notion native vision ${viewport.name}`, 8);
  const state = {
    title: NATIVE_VISION_TITLE,
    provenance: "native-real-workspace",
    statusText: "状态: 完成",
    logHeadingVisible: true,
    openMs,
    documentHorizontalOverflowPx: overflowPx(overflow, 8)
  };
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "native-vision", state },
    name: `real-notion-native-vision-${viewport.name}`,
    page,
    viewport
  });
  return { ...state, snapshot };
}

async function verifySeededTogglePage({ artifactRoot, page, seededRegression, viewport }) {
  const started = performance.now();
  await openPage(page, seededRegression.pageId);
  await waitForPageTitle(page, SEEDED_TOGGLE_TITLE, 20_000);
  await scrollUntilMounted(page, ".cm-md-toggle-widget", "seeded imported toggle");
  await page.waitForFunction(() => {
    const image = document.querySelector(".cm-md-toggle-widget .cm-md-toggle-body img");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, null, { timeout: 20_000 });
  const openMs = Number((performance.now() - started).toFixed(1));
  const toggle = page.locator(".cm-md-toggle-widget").filter({ hasText: "收据" }).first();
  const disclosure = toggle.locator(".cm-md-toggle-disclosure").first();
  const before = await readToggleState(page);
  await disclosure.click();
  await page.waitForFunction(() => {
    const candidate = Array.from(document.querySelectorAll(".cm-md-toggle-widget"))
      .find((element) => element.querySelector(".cm-md-toggle-summary-text")?.textContent?.trim() === "收据");
    return Boolean(candidate && !candidate.hasAttribute("open"));
  }, null, { timeout: 8_000 });
  const collapsed = true;
  await disclosure.click();
  await page.waitForFunction(() => {
    const candidate = Array.from(document.querySelectorAll(".cm-md-toggle-widget"))
      .find((element) => element.querySelector(".cm-md-toggle-summary-text")?.textContent?.trim() === "收据");
    return Boolean(candidate?.hasAttribute("open"));
  }, null, { timeout: 8_000 });
  const overflow = await assertNoDocumentHorizontalOverflow(page, `real Notion seeded toggle ${viewport.name}`, 8);
  const state = {
    title: SEEDED_TOGGLE_TITLE,
    provenance: SEEDED_PROVENANCE,
    summary: before.summary,
    bodyText: before.bodyText,
    toggleCount: before.toggleCount,
    loadedImageCount: before.loadedImageCount,
    summaryEditable: before.summaryEditable,
    collapsed,
    reexpanded: true,
    postToggleLogVisible: before.postToggleLogVisible,
    openMs,
    documentHorizontalOverflowPx: overflowPx(overflow, 8)
  };
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator("body"),
    metadata: { phase: "seeded-toggle-media", state },
    name: `real-notion-seeded-toggle-media-${viewport.name}`,
    page,
    viewport
  });
  return { ...state, snapshot };
}

async function verifyImportModal({ artifactRoot, page, viewport }) {
  await openNotionImportCommandModal(page, viewport.name);
  const modal = page.locator(".plugin-modal").filter({ hasText: "Import from Notion" }).first();
  await modal.waitFor({ timeout: 8_000 });
  await modal.locator(".notion-import-panel").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, modal, `real Notion import modal ${viewport.name}`, 8);
  const overflow = await assertNoDocumentHorizontalOverflow(page, `real Notion import modal ${viewport.name}`, 8);
  const overlay = await page.evaluate(() => {
    const backdrop = document.querySelector(".plugin-modal-backdrop");
    const dialog = document.querySelector(".plugin-modal");
    const pageTitle = Array.from(document.querySelectorAll(".page-header .title-input, .database-title-wrap h1"))
      .find((candidate) => ((candidate instanceof HTMLInputElement ? candidate.value : candidate.textContent) || "").includes("Family Vision Check"));
    const center = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const backdropRect = backdrop?.getBoundingClientRect();
    return {
      ariaModal: dialog?.getAttribute("aria-modal") || "",
      backdropCoversViewport: Boolean(backdropRect)
        && backdropRect.left <= 1
        && backdropRect.top <= 1
        && backdropRect.right >= window.innerWidth - 1
        && backdropRect.bottom >= window.innerHeight - 1,
      centerInsideModal: Boolean(center?.closest(".plugin-modal")),
      modalContainsPageTitle: Boolean(dialog && pageTitle && dialog.contains(pageTitle)),
      modalRole: dialog?.getAttribute("role") || "",
      title: dialog?.querySelector(".dialog-header h2")?.textContent?.trim() || ""
    };
  });
  const state = {
    provenance: "native-real-workspace-plugin",
    overlay,
    documentHorizontalOverflowPx: overflowPx(overflow, 8)
  };
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: modal,
    metadata: { phase: "import-modal", state },
    name: `real-notion-import-modal-${viewport.name}`,
    page,
    viewport
  });
  await page.locator(".plugin-modal-close").click();
  await page.waitForSelector(".plugin-modal", { state: "detached", timeout: 8_000 });
  return { ...state, snapshot };
}

async function openNotionImportCommandModal(page, viewportName) {
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "F",
    code: "KeyF",
    ctrlKey: true,
    shiftKey: true,
    bubbles: true
  })));
  await page.locator(".global-search-input").waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, page.locator(".global-search").first(), `real Notion command search ${viewportName}`, 8);
  await page.locator(".global-search-input").fill("Open Notion Import");
  const commandFilter = page.locator(".global-search-filters button").filter({ hasText: "命令" }).first();
  await commandFilter.waitFor({ timeout: 8_000 });
  await commandFilter.click();
  const commandHit = page.locator(".global-search-hit").filter({ hasText: "Open Notion Import" }).filter({ hasText: "命令" }).first();
  await commandHit.waitFor({ timeout: 8_000 });
  await commandHit.click();
  await page.waitForSelector(".global-search", { state: "detached", timeout: 8_000 });
}

async function readToggleState(page) {
  return page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll(".cm-md-toggle-widget"));
    const toggle = toggles.find((candidate) => candidate.querySelector(".cm-md-toggle-summary-text")?.textContent?.trim() === "收据");
    const images = Array.from(toggle?.querySelectorAll(".cm-md-toggle-body img") || []);
    return {
      summary: toggle?.querySelector(".cm-md-toggle-summary-text")?.textContent?.trim() || "",
      bodyText: toggle?.querySelector(".cm-md-toggle-body")?.textContent || "",
      toggleCount: toggles.length,
      loadedImageCount: images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length,
      summaryEditable: toggle?.querySelector(".cm-md-toggle-summary-text")?.getAttribute("contenteditable") === "plaintext-only",
      postToggleLogVisible: Array.from(document.querySelectorAll(".cm-line, .cm-md-table-widget"))
        .some((element) => element.textContent?.includes("2022/6/18"))
    };
  });
}

async function scrollUntilMounted(page, selector, label) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await page.locator(selector).count()) return;
    await page.locator(".cm-scroller").evaluate((element) => {
      element.scrollTop = Math.min(element.scrollHeight, element.scrollTop + Math.max(300, element.clientHeight * 0.75));
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.waitForTimeout(50);
  }
  throw new Error(`Could not mount ${label}.`);
}

async function findSeedImageAttachment(cloneRoot) {
  const attachmentDir = join(cloneRoot, "attachments", "notion");
  const entries = (await readdir(attachmentDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.(?:png|jpe?g|gif|webp)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const info = await stat(join(attachmentDir, entry.name));
    if (info.size > 0) return `attachments/notion/${entry.name}`;
  }
  throw new Error("Notion real-workspace clone has no usable image attachment for the exact toggle regression page.");
}

async function readActiveWorkspaceEvidence(page, cloneRoot) {
  return page.evaluate(async (expectedCloneRoot) => {
    const [manifest, recents] = await Promise.all([window.lotion.workspace.getManifest(), window.lotion.workspace.listRecent()]);
    return { workspaceName: manifest.name, activeWorkspaceWasClone: recents[0]?.path === expectedCloneRoot };
  }, cloneRoot);
}

async function navigateToRowPage(page, databaseId, rowId) {
  await page.evaluate(({ targetDatabaseId, targetRowId }) => window.dispatchEvent(new CustomEvent("lotion:open-entity", {
    detail: { kind: "row", databaseId: targetDatabaseId, rowId: targetRowId }
  })), { targetDatabaseId: databaseId, targetRowId: rowId });
}

async function waitForPageTitle(page, expectedTitle, timeout) {
  await page.waitForFunction((title) => {
    const inputMatch = Array.from(document.querySelectorAll(".page-header .title-input"))
      .some((element) => element instanceof HTMLInputElement && element.value === title);
    const headingMatch = Array.from(document.querySelectorAll(".database-title-wrap h1"))
      .some((element) => element.textContent?.trim() === title);
    return inputMatch || headingMatch;
  }, expectedTitle, { timeout });
}

function overflowPx(metrics, tolerance) {
  const width = Math.max(metrics.bodyScrollWidth, metrics.docScrollWidth);
  const allowed = Math.max(metrics.bodyClientWidth, metrics.docClientWidth, metrics.innerWidth) + tolerance;
  return Math.max(0, width - allowed);
}
