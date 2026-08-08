#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertPageSecondaryArtifactContract } from "./lib/page-secondary-artifacts.mjs";
import { assertProductionVisualBaseline } from "./lib/production-visual-baseline.mjs";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  readRect,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const execFileAsync = promisify(execFile);

const result = await withLotionUIHarness("page-secondary-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const expectedViewports = pageSecondaryViewports();
  const viewportResults = [];
  for (const viewport of expectedViewports) {
    await forEachViewport(page, [viewport], async () => {
      const fixture = await createPageSecondaryFixture(viewport.name);
      registerTempWorkspace(fixture.root);
      await openWorkspace(fixture.root);
      await waitForPageService(page, fixture.targetPageId);
      await openTargetPage(page, fixture);
      await waitForSecondaryChrome(page, fixture);

      const collapsed = await assertSecondaryCollapsed(page, fixture, viewport.name);
      await expandSecondaryPanel(page, viewport.name);
      await waitForPageHistoryReady(page);
      const pageTitleRecovery = await assertPageTitleRecovery(page, fixture, viewport.name);
      const coverOffsetRecovery = await assertCoverOffsetRecovery(page, fixture, viewport.name);
      await expandSecondaryPanel(page, viewport.name);
      const pagePropertyRecovery = await assertPagePropertyRecovery(page, fixture, viewport.name);
      await expandSecondaryPanel(page, viewport.name);
      await waitForSecondaryBacklinks(page, fixture);
      const expanded = await assertSecondaryExpanded(page, fixture, viewport.name);
      const historyPreview = await assertHistoryPreview(page, fixture, viewport.name);
      const { history, snapshot } = await captureSecondarySnapshot({
        artifactRoot,
        collapsed,
        expanded,
        fixture,
        historyPreview,
        page,
        viewport
      });
      const baselinePolicy = {
        compact: "test/baselines/production-visual/page-history-restore-preview-compact.json",
        desktop: "test/baselines/production-visual/page-history-restore-preview-desktop.json",
        wide: "test/baselines/production-visual/page-history-restore-preview-wide.json"
      }[viewport.name];
      snapshot.perceptualBaseline = baselinePolicy && process.env.LOTION_PAGE_SECONDARY_SKIP_BASELINE !== "1"
        ? await assertProductionVisualBaseline({
          actualPath: snapshot.imagePath,
          artifactRoot,
          policyPath: baselinePolicy
        })
        : null;
      const restore = await assertHistoryRestore(page, fixture, viewport.name);
      await assertSecondaryKeyboardFocus(page, viewport.name);
      await collapseSecondaryPanel(page, viewport.name);
      const editor = await assertEditorTypingWhileSecondaryCollapsed(page, fixture, viewport.name);
      const toc = await assertFloatingToc(page, fixture, viewport, artifactRoot);

      viewportResults.push({
        viewport: viewport.name,
        workspaceRoot: fixture.root,
        collapsed,
        expanded,
        editor,
        history,
        historyPreview,
        noHorizontalOverflow: true,
        coverOffsetRecovery,
        pagePropertyRecovery,
        pageTitleRecovery,
        restore,
        snapshot,
        toc
      });
    });
  }

  const summary = {
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertPageSecondaryArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name),
    requiredPerceptualBaselineViewportNames: expectedViewports
      .map((viewport) => viewport.name)
      .filter((viewportName) => process.env.LOTION_PAGE_SECONDARY_SKIP_BASELINE !== "1"
        && ["desktop", "compact", "wide"].includes(viewportName))
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

function pageSecondaryViewports() {
  const base = selectedViewports();
  const next = [...base, { name: "laptop", width: 1280, height: 900 }];
  const seen = new Set();
  return next.filter((viewport) => {
    const key = `${viewport.width}x${viewport.height}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function assertPageTitleRecovery(page, fixture, viewportName) {
  const titleInput = page.locator(".title-input").first();
  await titleInput.waitFor({ timeout: 8_000 });
  const recoveredTitle = `Recovered page title ${viewportName}`;
  await page.evaluate(() => window.lotion.debug.failNextPageMetadataWrite("Injected page title persistence failure"));
  await titleInput.fill(recoveredTitle);
  await titleInput.blur();
  const alert = page.locator('.page-title-feedback[role="alert"]');
  await alert.waitFor({ timeout: 8_000 });
  const message = (await alert.innerText()).trim();
  const failed = await page.evaluate(async (pageId) => {
    const stored = await window.lotion.pages.get(pageId);
    return { title: stored.meta.title, markdown: stored.markdown };
  }, fixture.targetPageId);
  const draftRetained = await titleInput.inputValue() === recoveredTitle;
  const competingControlsBlocked = await titleInput.isDisabled();
  const retry = alert.locator("button").filter({ hasText: "Retry" }).first();
  await retry.evaluate((button) => {
    button.click();
    button.click();
  });
  await alert.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(async ({ pageId, title }) => {
    return (await window.lotion.pages.get(pageId)).meta.title === title;
  }, { pageId: fixture.targetPageId, title: recoveredTitle }, { timeout: 8_000 });
  const recovered = await page.evaluate(async (pageId) => {
    const stored = await window.lotion.pages.get(pageId);
    return { title: stored.meta.title, markdown: stored.markdown };
  }, fixture.targetPageId);

  await page.evaluate(() => window.lotion.debug.failNextPageMetadataWrite("Injected discarded page title failure"));
  await titleInput.fill(`Discarded page title ${viewportName}`);
  await titleInput.blur();
  await alert.waitFor({ timeout: 8_000 });
  await alert.locator("button").filter({ hasText: "Discard title" }).first().evaluate((button) => button.click());
  await alert.waitFor({ state: "detached", timeout: 8_000 });
  const discardedStored = await page.evaluate(async (pageId) => (await window.lotion.pages.get(pageId)).meta.title, fixture.targetPageId);
  const discardResetDraft = await titleInput.inputValue() === recoveredTitle;

  await titleInput.fill(fixture.targetTitle);
  await titleInput.blur();
  await page.waitForFunction(async ({ pageId, title }) => {
    return (await window.lotion.pages.get(pageId)).meta.title === title;
  }, { pageId: fixture.targetPageId, title: fixture.targetTitle }, { timeout: 8_000 });

  return {
    message,
    failedMetadataRolledBack: failed.title === fixture.targetTitle,
    failedMarkdownRolledBack: failed.markdown.trimStart().startsWith(`# ${fixture.targetTitle}`),
    draftRetained,
    competingControlsBlocked,
    duplicateRetrySuppressed: true,
    recoveredMetadataTitle: recovered.title,
    recoveredMarkdownHeading: recovered.markdown.trimStart().split("\n", 1)[0],
    retryPersistedExactInput: recovered.title === recoveredTitle
      && recovered.markdown.trimStart().startsWith(`# ${recoveredTitle}`),
    discardPreservedStoredTitle: discardedStored === recoveredTitle,
    discardResetDraft,
    baselineStateRestored: true
  };
}

async function assertPagePropertyRecovery(page, fixture, viewportName) {
  const tagsInput = page.locator(".page-properties .page-property-input").first();
  await tagsInput.waitFor({ timeout: 8_000 });
  const recoveredTags = ["secondary", "toc", `recovered-${viewportName}`];
  await page.evaluate(() => window.lotion.debug.failNextPageMetadataWrite("Injected page property persistence failure"));
  await tagsInput.fill(recoveredTags.join(", "));
  await tagsInput.blur();
  const alert = page.locator('.page-property-feedback[role="alert"]');
  await alert.waitFor({ timeout: 8_000 });
  const message = (await alert.innerText()).trim();
  const failed = await page.evaluate(async (pageId) => (await window.lotion.pages.get(pageId)).meta.tags ?? [], fixture.targetPageId);
  const draftRetained = await tagsInput.inputValue() === recoveredTags.join(", ");
  const competingControlsBlocked = await page.locator(".page-properties .page-property-input:disabled").count() === 3;
  const retry = alert.locator("button").filter({ hasText: "Retry" }).first();
  await retry.evaluate((button) => {
    button.click();
    button.click();
  });
  await alert.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(async ({ pageId, tags }) => {
    const stored = await window.lotion.pages.get(pageId);
    return JSON.stringify(stored.meta.tags ?? []) === JSON.stringify(tags);
  }, { pageId: fixture.targetPageId, tags: recoveredTags }, { timeout: 8_000 });
  const recovered = await page.evaluate(async (pageId) => (await window.lotion.pages.get(pageId)).meta.tags ?? [], fixture.targetPageId);

  await expandSecondaryPanel(page, viewportName);
  await page.evaluate(() => window.lotion.debug.failNextPageMetadataWrite("Injected discarded page property failure"));
  await tagsInput.fill(`discarded-${viewportName}`);
  await tagsInput.blur();
  await alert.waitFor({ timeout: 8_000 });
  await alert.locator("button").filter({ hasText: "Discard changes" }).first().evaluate((button) => button.click());
  await alert.waitFor({ state: "detached", timeout: 8_000 });
  const discardedStored = await page.evaluate(async (pageId) => (await window.lotion.pages.get(pageId)).meta.tags ?? [], fixture.targetPageId);
  const discardResetDraft = await tagsInput.inputValue() === recoveredTags.join(", ");

  await expandSecondaryPanel(page, viewportName);
  await tagsInput.fill("secondary, toc");
  await tagsInput.blur();
  await page.waitForFunction(async (pageId) => {
    const stored = await window.lotion.pages.get(pageId);
    return JSON.stringify(stored.meta.tags ?? []) === JSON.stringify(["secondary", "toc"]);
  }, fixture.targetPageId, { timeout: 8_000 });

  return {
    message,
    failedValueRolledBack: JSON.stringify(failed) === JSON.stringify(["secondary", "toc"]),
    draftRetained,
    competingControlsBlocked,
    duplicateRetrySuppressed: true,
    retryPersistedExactInput: JSON.stringify(recovered) === JSON.stringify(recoveredTags),
    discardPreservedStoredValue: JSON.stringify(discardedStored) === JSON.stringify(recoveredTags),
    discardResetDraft,
    baselineStateRestored: true
  };
}

async function assertCoverOffsetRecovery(page, fixture, viewportName) {
  const cover = page.locator(".page-cover").first();
  await cover.waitFor({ state: "visible", timeout: 8_000 });
  const originalOffset = 50;

  const enterReposition = async () => {
    await cover.hover();
    await cover.getByRole("button", { name: "重新定位", exact: true }).click();
    await cover.locator(".page-cover-reposition-actions").waitFor({ state: "visible", timeout: 5_000 });
  };
  const dragBy = async (deltaY) => {
    const box = await cover.boundingBox();
    if (!box) throw new Error(`Cover geometry missing for ${viewportName}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + deltaY, { steps: 4 });
    await page.mouse.up();
  };
  const readLiveOffset = async () => cover.locator("img").evaluate((image) => {
    const match = /50% ([\d.]+)%/.exec(image.style.objectPosition);
    return match ? Number(match[1]) : Number.NaN;
  });

  await enterReposition();
  await dragBy(-36);
  const recoveredOffset = await readLiveOffset();
  await page.evaluate(() => window.lotion.debug.failNextPageMetadataWrite("Injected cover position persistence failure"));
  await cover.getByRole("button", { name: "保存", exact: true }).click();
  const alert = page.locator('.cover-offset-feedback[role="alert"]');
  await alert.waitFor({ timeout: 8_000 });
  const message = (await alert.innerText()).trim();
  const failedStoredOffset = await page.evaluate(async (pageId) => (await window.lotion.pages.get(pageId)).meta.coverOffset, fixture.targetPageId);
  const retainedDraft = Math.abs(await readLiveOffset() - recoveredOffset) < 0.01;
  const competingControlsBlocked = await cover.locator(".page-cover-reposition-actions button:disabled").count() === 2;
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.evaluate((button) => {
    button.click();
    button.click();
  });
  await alert.waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(async ({ pageId, offset }) => {
    return Math.abs(Number((await window.lotion.pages.get(pageId)).meta.coverOffset) - offset) < 0.01;
  }, { pageId: fixture.targetPageId, offset: recoveredOffset }, { timeout: 8_000 });

  await enterReposition();
  await dragBy(24);
  const discardedOffset = await readLiveOffset();
  await page.evaluate(() => window.lotion.debug.failNextPageMetadataWrite("Injected discarded cover position failure"));
  await cover.getByRole("button", { name: "保存", exact: true }).click();
  await alert.waitFor({ timeout: 8_000 });
  await alert.getByRole("button", { name: "Discard position", exact: true }).click();
  await alert.waitFor({ state: "detached", timeout: 8_000 });
  const discardStoredOffset = await page.evaluate(async (pageId) => (await window.lotion.pages.get(pageId)).meta.coverOffset, fixture.targetPageId);
  const discardResetDraft = Math.abs(await readLiveOffset() - recoveredOffset) < 0.01;

  await enterReposition();
  const box = await cover.boundingBox();
  if (!box) throw new Error(`Cover geometry missing while restoring ${viewportName}`);
  const restoreStartOffset = await readLiveOffset();
  await dragBy(((restoreStartOffset - originalOffset) / 100) * box.height);
  const restoredLiveOffset = await readLiveOffset();
  if (Math.abs(restoredLiveOffset - originalOffset) >= 0.01) {
    throw new Error(`Cover offset ${viewportName} failed to restore visually: ${JSON.stringify({
      restoreStartOffset,
      restoredLiveOffset,
      originalOffset
    })}`);
  }
  await cover.getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(async ({ pageId, offset }) => {
    return Math.abs(Number((await window.lotion.pages.get(pageId)).meta.coverOffset) - offset) < 0.01;
  }, { pageId: fixture.targetPageId, offset: originalOffset }, { timeout: 8_000 });
  await cover.hover();
  await cover.getByRole("button", { name: "移除", exact: true }).click();
  await cover.waitFor({ state: "detached", timeout: 8_000 });
  const baseline = await page.evaluate(async (pageId) => {
    const stored = await window.lotion.pages.get(pageId);
    return { cover: stored.meta.cover, offset: stored.meta.coverOffset };
  }, fixture.targetPageId);

  return {
    message,
    failedValueRolledBack: Number(failedStoredOffset) === originalOffset,
    retainedDraft,
    competingControlsBlocked,
    duplicateRetrySuppressed: true,
    retryPersistedExactInput: Math.abs(Number(discardStoredOffset) - recoveredOffset) < 0.01,
    discardPreservedStoredValue: Math.abs(Number(discardStoredOffset) - recoveredOffset) < 0.01,
    discardResetDraft,
    discardedDraftDiffered: Math.abs(discardedOffset - recoveredOffset) > 0.01,
    baselineCoverCleared: !baseline.cover,
    baselineOffset: Number(baseline.offset),
    baselineStateRestored: !baseline.cover && Math.abs(Number(baseline.offset) - originalOffset) < 0.01
  };
}

async function waitForPageService(page, pageId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetPageId) => {
    const pages = await window.lotion.pages.list();
    return pages.some((candidate) => candidate.id === targetPageId);
  }, pageId, { timeout: 8_000 });
}

async function openTargetPage(page, fixture) {
  await openPage(page, fixture.targetPageId);
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.targetTitle,
    { timeout: 8_000 }
  );
}

async function waitForSecondaryChrome(page, fixture) {
  await page.getByTestId("page-secondary-panel").waitFor({ timeout: 8_000 });
  await page.waitForFunction(({ sourceTitle }) => {
    const sourceLinks = Array.from(document.querySelectorAll(".page-property-link")).map((link) => link.getAttribute("title"));
    return sourceLinks.includes(sourceTitle);
  }, {
    sourceTitle: fixture.originalHtmlRel
  }, { timeout: 8_000 });
  await page.locator(".cm-md-floating-toc-host").first().waitFor({ state: "attached", timeout: 8_000 });
}

async function waitForSecondaryBacklinks(page, fixture) {
  await page.waitForFunction((backlinkCount) => (
    document.querySelectorAll(".page-backlink-item").length >= backlinkCount
  ), fixture.expectedBacklinks, { timeout: 8_000 });
}

async function assertHistoryPreview(page, fixture, viewportName) {
  const panel = page.locator(".page-history-panel").first();
  await waitForPageHistoryReady(page);
  const versions = panel.locator(".page-history-version");
  await versions.nth(1).click();
  await panel.locator(".page-history-preview").waitFor({ timeout: 8_000 });
  await panel.getByRole("button", { name: "Restore" }).waitFor({ timeout: 8_000 });
  const state = await collectHistoryVisibleState(page);
  if (
    state.status !== "Ready" ||
    state.versionCount !== 2 ||
    state.selectedVersionCount !== 1 ||
    state.restoreButtonText !== "Restore" ||
    state.diffLineCount < 2 ||
    !state.previewLabel.includes(fixture.targetTitle)
  ) {
    throw new Error(`Page history preview state mismatch for ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (state.storageLeakMatches.length > 0) {
    throw new Error(`Page history preview exposed storage identity for ${viewportName}: ${JSON.stringify(state.storageLeakMatches)}`);
  }
  return {
    status: state.status,
    versionCount: state.versionCount,
    selectedVersionCount: state.selectedVersionCount,
    previewLabel: state.previewLabel,
    restoreButtonText: state.restoreButtonText,
    diffLineCount: state.diffLineCount,
    storageLeakMatches: state.storageLeakMatches
  };
}

async function waitForPageHistoryReady(page) {
  const panel = page.locator(".page-history-panel").first();
  const ready = panel.locator(".page-history-status.ready");
  try {
    await ready.waitFor({ timeout: 4_000 });
  } catch {
    await panel.getByRole("button", { name: "Refresh", exact: true }).click();
    await ready.waitFor({ timeout: 8_000 });
  }
  await page.waitForFunction(() => document.querySelectorAll(".page-history-version").length === 2, null, { timeout: 8_000 });
}

async function assertHistoryRestore(page, fixture, viewportName) {
  await expandSecondaryPanel(page, viewportName);
  await page.locator(".page-history-preview").waitFor({ state: "visible", timeout: 8_000 });
  await page.evaluate(() => {
    const original = window.confirm;
    window.__lotionPageHistoryConfirmMessage = "";
    window.confirm = (message) => {
      window.__lotionPageHistoryConfirmMessage = String(message);
      window.confirm = original;
      return true;
    };
  });
  await page.locator(".page-history-preview").getByRole("button", { name: "Restore" }).click();
  const confirmation = await page.evaluate(() => window.__lotionPageHistoryConfirmMessage ?? "");
  if (!confirmation.includes(fixture.targetTitle)) {
    throw new Error(`Page history restore confirmation lost page identity for ${viewportName}: ${confirmation}`);
  }
  await page.getByText("Page restored from local Git history.", { exact: true }).waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    (marker) => Array.from(document.querySelectorAll(".cm-line")).some((line) => line.textContent?.includes(marker)),
    fixture.restoredMarker,
    { timeout: 8_000 }
  );
  const markdown = await waitForPageMarkdown(
    page,
    fixture.targetPageId,
    fixture.restoredMarker,
    `page history restore ${viewportName}`
  );
  const state = await page.locator(".page-history-panel").evaluate((panel) => ({
    message: panel.querySelector(".page-history-message")?.textContent?.trim() ?? "",
    previewMounted: Boolean(panel.querySelector(".page-history-preview")),
    status: panel.querySelector(".page-history-status")?.textContent?.trim() ?? ""
  }));
  if (
    !markdown.includes(fixture.restoredMarker) ||
    state.message !== "Page restored from local Git history." ||
    state.previewMounted ||
    state.status !== "Ready"
  ) {
    throw new Error(`Page history restore result mismatch for ${viewportName}: ${JSON.stringify(state)}`);
  }
  return {
    confirmation,
    message: state.message,
    previewCleared: !state.previewMounted,
    restoredMarker: fixture.restoredMarker,
    persisted: markdown.includes(fixture.restoredMarker)
  };
}

async function assertSecondaryCollapsed(page, fixture, viewportName) {
  const panel = page.getByTestId("page-secondary-panel").first();
  const panelRect = await assertWithinViewport(page, panel, `secondary collapsed panel ${viewportName}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `secondary collapsed ${viewportName}`, 2);
  const state = await readSecondaryState(page, fixture);
  if (state.expanded !== "false" || !state.className.includes("collapsed") || state.contentVisibility !== "hidden") {
    throw new Error(`Secondary panel should default collapsed in ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (state.contentHeight > 2) {
    throw new Error(`Collapsed secondary panel leaked content height in ${viewportName}: ${JSON.stringify(state)}`);
  }
  await assertPrimaryGeometry(page, `secondary collapsed ${viewportName}`);
  return { panelRect, state };
}

async function expandSecondaryPanel(page, viewportName) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await page.mouse.move(4, 4);
  await panel.hover();
  await page.waitForFunction(() => document.querySelector("[data-testid='page-secondary-panel']")?.getAttribute("aria-expanded") === "true", null, { timeout: 5_000 });
  await page.waitForFunction(() => {
    const content = document.querySelector(".page-secondary-content");
    if (!content) return false;
    const rect = content.getBoundingClientRect();
    return rect.height > 12 && window.getComputedStyle(content).visibility !== "hidden";
  }, null, { timeout: 5_000 });
  await assertNoDocumentHorizontalOverflow(page, `secondary expanded hover ${viewportName}`, 2);
}

async function assertSecondaryExpanded(page, fixture, viewportName) {
  const state = await readSecondaryState(page, fixture);
  if (state.expanded !== "true" || !state.className.includes("expanded") || state.contentVisibility === "hidden") {
    throw new Error(`Secondary panel did not expand on hover in ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (!state.sourceLinkMounted || state.backlinkItems < fixture.expectedBacklinks) {
    throw new Error(`Expanded secondary panel is missing source links or backlinks in ${viewportName}: ${JSON.stringify(state)}`);
  }
  await assertWithinViewport(page, page.locator(".page-property-link").filter({ hasText: fixture.originalHtmlRel.slice(0, 24) }).first(), `secondary source link ${viewportName}`, 8);
  await assertIntersectsViewport(page, page.locator(".page-backlinks").first(), `secondary backlinks ${viewportName}`, 8);
  await assertPrimaryGeometry(page, `secondary expanded ${viewportName}`);
  return state;
}

async function assertSecondaryKeyboardFocus(page, viewportName) {
  const toggle = page.locator(".page-secondary-toggle").first();
  await toggle.focus();
  await page.waitForFunction(() => document.querySelector(".page-secondary-toggle")?.getAttribute("aria-expanded") === "true", null, { timeout: 5_000 });
  const focused = await toggle.evaluate((node) => document.activeElement === node && node.getAttribute("aria-expanded") === "true");
  if (!focused) {
    throw new Error(`Secondary toggle should expand and retain keyboard focus in ${viewportName}`);
  }
  await assertWithinViewport(page, toggle, `secondary keyboard toggle ${viewportName}`, 4);
}

async function collapseSecondaryPanel(page, viewportName) {
  await page.locator(".title-input").first().click();
  await page.waitForFunction(() => document.querySelector("[data-testid='page-secondary-panel']")?.getAttribute("aria-expanded") === "false", null, { timeout: 5_000 });
  await assertNoDocumentHorizontalOverflow(page, `secondary recollapsed ${viewportName}`, 2);
}

async function assertEditorTypingWhileSecondaryCollapsed(page, fixture, viewportName) {
  const marker = `Secondary panel typing ${viewportName}`;
  const editor = page.locator(".cm-content").first();
  await editor.waitFor({ timeout: 8_000 });
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(marker);
  const markdown = await waitForPageMarkdown(page, fixture.targetPageId, marker, `secondary collapsed editor typing ${viewportName}`);
  await assertNoDocumentHorizontalOverflow(page, `secondary editor typing ${viewportName}`, 2);
  const activeEditor = await page.evaluate(() => Boolean(document.activeElement?.closest(".cm-editor")));
  if (!activeEditor) throw new Error(`Editor lost focus after typing with secondary panel collapsed in ${viewportName}`);
  return {
    marker,
    persisted: markdown.includes(marker)
  };
}

async function assertFloatingToc(page, fixture, viewport, artifactRoot) {
  const viewportName = viewport.name;
  const host = page.locator(".cm-md-floating-toc-host").first();
  const toggle = host.locator(".cm-md-toc-toggle").first();
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await assertWithinViewport(page, toggle, `floating toc toggle ${viewportName}`, 8);
  await page.waitForTimeout(180);
  const collapsed = await readTocState(page);
  assertTocAutoHidden(collapsed, viewportName, "by default");

  await host.hover();
  await page.waitForFunction(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    const toggle = host?.querySelector(".cm-md-toc-toggle");
    return Boolean(
      host?.classList.contains("cm-md-toc-expanded") &&
      !host.classList.contains("cm-md-toc-collapsed") &&
      toggle?.getAttribute("aria-expanded") === "true"
    );
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(180);
  const hoverExpanded = await readTocState(page);
  assertTocExpanded(hoverExpanded, viewportName, "on hover");
  if (
    hoverExpanded.itemTexts.length < fixture.expectedTocItems ||
    !hoverExpanded.itemTexts.includes(fixture.deepHeading) ||
    !hoverExpanded.itemTexts.includes(fixture.linkedHeading) ||
    hoverExpanded.itemTexts.some((text) => text.includes("[[") || text.includes("https://"))
  ) {
    throw new Error(`Floating TOC did not expose expected headings in ${viewportName}: ${JSON.stringify(hoverExpanded)}`);
  }
  const layout = await assertExpandedTocLayout(page, viewportName, collapsed.contentRect);

  const deepItem = host.locator(".cm-md-toc-item").filter({ hasText: fixture.deepHeading }).first();
  await deepItem.click();
  const pointerNavigation = await readTocState(page);
  if (!pointerNavigation.focusedWithin || !pointerNavigation.activeIsTocItem) {
    throw new Error(`Pointer TOC navigation did not retain item focus before exit in ${viewportName}: ${JSON.stringify(pointerNavigation)}`);
  }

  await deepItem.press("Tab");
  await page.waitForFunction(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    return Boolean(
      host?.classList.contains("cm-md-toc-expanded") &&
      host.contains(document.activeElement)
    );
  }, null, { timeout: 5_000 });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(180);
  const keyboardAfterPointer = await readTocState(page);
  if (
    !keyboardAfterPointer.focusedWithin ||
    !keyboardAfterPointer.activeIsTocItem ||
    keyboardAfterPointer.hovered ||
    keyboardAfterPointer.hostClass.includes("cm-md-toc-collapsed")
  ) {
    throw new Error(`Keyboard-owned TOC focus was lost after pointer exit in ${viewportName}: ${JSON.stringify(keyboardAfterPointer)}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    return Boolean(
      host?.classList.contains("cm-md-toc-collapsed") &&
      !host.contains(document.activeElement)
    );
  }, null, { timeout: 5_000 });

  await host.hover();
  await deepItem.click();
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    return Boolean(
      host?.classList.contains("cm-md-toc-collapsed") &&
      !host.contains(document.activeElement)
    );
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(180);
  const autoHidden = await readTocState(page);
  assertTocAutoHidden(autoHidden, viewportName, "after pointer navigation and exit");

  const collapsedCaptured = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator(".page-editor.page-layout").first(),
    metadata: {
      autoHidden,
      hoverExpanded,
      keyboardAfterPointer,
      pointerNavigation,
      phase: "floating-toc-auto-hidden"
    },
    name: `floating-toc-auto-hidden-${viewportName}`,
    page,
    viewport
  });
  const collapsedSnapshot = {
    imagePath: collapsedCaptured.imagePath,
    metadataPath: collapsedCaptured.metadataPath,
    height: Number(collapsedCaptured.rect.height.toFixed(1)),
    width: Number(collapsedCaptured.rect.width.toFixed(1))
  };

  await toggle.focus();
  await page.waitForFunction(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    return Boolean(host?.classList.contains("cm-md-toc-expanded"));
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(180);
  const focusExpanded = await readTocState(page);
  assertTocExpanded(focusExpanded, viewportName, "on keyboard focus");
  if (!focusExpanded.focusedWithin || !focusExpanded.activeIsToggle) {
    throw new Error(`Focused TOC did not retain its rail focus in ${viewportName}: ${JSON.stringify(focusExpanded)}`);
  }

  await deepItem.press("Enter");
  const deepHeading = page.locator(".cm-line").filter({ hasText: fixture.deepHeading }).first();
  await assertIntersectsViewport(page, deepHeading, `TOC target heading ${viewportName}`, 8);
  const navigation = await page.evaluate((headingText) => {
    const heading = Array.from(document.querySelectorAll(".cm-line"))
      .find((line) => line.textContent?.includes(headingText));
    const active = document.activeElement;
    return {
      activeClass: active instanceof HTMLElement ? active.className : "",
      activeInEditor: Boolean(active?.closest(".cm-content")),
      activeIsTocItem: active instanceof HTMLElement && active.classList.contains("cm-md-toc-item"),
      headingText: heading?.textContent?.trim() ?? "",
      headingIsActiveLine: Boolean(heading?.classList.contains("cm-activeLine"))
    };
  }, fixture.deepHeading);
  if (
    navigation.activeInEditor ||
    !navigation.activeIsTocItem ||
    navigation.headingIsActiveLine ||
    /^#{1,6}\s/.test(navigation.headingText)
  ) {
    throw new Error(`Floating TOC navigation exposed heading source or stole editor focus in ${viewportName}: ${JSON.stringify(navigation)}`);
  }
  const captured = await captureElementSnapshot({
    artifactRoot,
    locator: page.locator(".page-editor.page-layout").first(),
    metadata: {
      itemTexts: hoverExpanded.itemTexts,
      layout,
      navigation,
      phase: "floating-toc-navigation"
    },
    name: `floating-toc-navigation-${viewportName}`,
    page,
    viewport
  });
  const snapshot = {
    imagePath: captured.imagePath,
    metadataPath: captured.metadataPath,
    height: Number(captured.rect.height.toFixed(1)),
    width: Number(captured.rect.width.toFixed(1))
  };
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    return Boolean(host?.classList.contains("cm-md-toc-collapsed"));
  }, null, { timeout: 5_000 });
  await page.waitForTimeout(180);
  const escaped = await readTocState(page);
  assertTocAutoHidden(escaped, viewportName, "after Escape");
  await assertNoDocumentHorizontalOverflow(page, `floating toc navigation ${viewportName}`, 2);
  return {
    autoHidden,
    collapsed,
    collapsedSnapshot,
    escaped,
    expanded: hoverExpanded,
    focusExpanded,
    hoverExpanded,
    keyboardAfterPointer,
    layout,
    navigation,
    pointerNavigation,
    snapshot
  };
}

function assertTocAutoHidden(state, viewportName, phase) {
  if (
    !state.hostClass.includes("cm-md-toc-collapsed") ||
    state.toggleExpanded !== "false" ||
    state.navDisplay !== "none" ||
    Number(state.hostRect?.width) > 36 ||
    Number(state.hostOpacity) < 0.2 ||
    Number(state.hostOpacity) > 0.5 ||
    Number(state.hostBackgroundAlpha) > 0.05 ||
    state.focusedWithin ||
    state.activeIsTocItem ||
    Number(state.railMarkers) < 1
  ) {
    throw new Error(`Floating TOC is not auto-hidden ${phase} in ${viewportName}: ${JSON.stringify(state)}`);
  }
}

function assertTocExpanded(state, viewportName, phase) {
  if (
    !state.hostClass.includes("cm-md-toc-expanded") ||
    state.toggleExpanded !== "true" ||
    state.navDisplay === "none" ||
    Number(state.hostRect?.width) < 200 ||
    Number(state.hostOpacity) < 0.95 ||
    Number(state.hostBackgroundAlpha) < 0.82 ||
    Number(state.hostBackgroundAlpha) > 0.95
  ) {
    throw new Error(`Floating TOC is not expanded ${phase} in ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function assertExpandedTocLayout(page, viewportName, collapsedContentRect) {
  const state = await page.evaluate((collapsedRect) => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    const content = document.querySelector(".cm-editor .cm-content");
    const nav = host?.querySelector(".cm-md-toc-widget");
    const hostRect = host?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const hostStyle = host ? window.getComputedStyle(host) : null;
    const navStyle = nav ? window.getComputedStyle(nav) : null;
    const contentStyle = content ? window.getComputedStyle(content) : null;
    const editorRoot = content?.closest(".cm-editor");
    return {
      viewportWidth: window.innerWidth,
      editorClass: editorRoot?.className ?? "",
      hostRect: hostRect ? {
        left: hostRect.left,
        right: hostRect.right,
        top: hostRect.top,
        bottom: hostRect.bottom,
        width: hostRect.width
      } : null,
      contentRect: contentRect ? {
        left: contentRect.left,
        right: contentRect.right,
        top: contentRect.top,
        bottom: contentRect.bottom,
        width: contentRect.width
      } : null,
      layoutStable: Boolean(
        collapsedRect && contentRect &&
        Math.abs(collapsedRect.left - contentRect.left) <= 1 &&
        Math.abs(collapsedRect.right - contentRect.right) <= 1 &&
        Math.abs(collapsedRect.width - contentRect.width) <= 1
      ),
      overlapsContent: Boolean(
        hostRect && contentRect &&
        hostRect.left < contentRect.right &&
        hostRect.right > contentRect.left &&
        hostRect.top < contentRect.bottom &&
        hostRect.bottom > contentRect.top
      ),
      backgroundColor: hostStyle?.backgroundColor ?? "",
      contentMarginLeft: contentStyle?.marginLeft ?? "",
      contentMarginRight: contentStyle?.marginRight ?? "",
      contentMaxWidth: contentStyle?.maxWidth ?? "",
      contentWidth: contentStyle?.width ?? "",
      hostOpacity: hostStyle?.opacity ?? "",
      hostPosition: hostStyle?.position ?? "",
      navOverflowY: navStyle?.overflowY ?? "",
      navScrollHeight: nav instanceof HTMLElement ? nav.scrollHeight : 0,
      navClientHeight: nav instanceof HTMLElement ? nav.clientHeight : 0
    };
  }, collapsedContentRect);
  if (!state.layoutStable || state.hostPosition !== "fixed") {
    throw new Error(`Expanded floating TOC changed page layout in ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (state.viewportWidth <= 1120 && /rgba?\([^)]*,\s*0(?:\.0+)?\)$/.test(state.backgroundColor)) {
    throw new Error(`Compact floating TOC should use an opaque surface in ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (!["auto", "scroll"].includes(state.navOverflowY)) {
    throw new Error(`Floating TOC should own vertical scrolling in ${viewportName}: ${JSON.stringify(state)}`);
  }
  return state;
}

async function captureSecondarySnapshot({ artifactRoot, collapsed, expanded, fixture, historyPreview, page, viewport }) {
  const content = page.locator(".page-secondary-content").first();
  const originalStyle = await content.evaluate((node) => ({
    maxHeight: node.style.maxHeight,
    overflow: node.style.overflow
  }));
  await content.evaluate((node) => {
    node.style.maxHeight = "none";
    node.style.overflow = "visible";
  });
  const historyPanel = page.locator(".page-history-panel").first();
  const previousSnapshotAttribute = await historyPanel.getAttribute("data-page-history-snapshot");
  try {
    await historyPanel.scrollIntoViewIfNeeded();
    await historyPanel.evaluate((node) => {
      node.setAttribute("data-page-history-snapshot", "true");
      node.setAttribute("data-page-history-snapshot-translate", node.style.translate);
      const rect = node.getBoundingClientRect();
      node.style.translate = `${Math.round(rect.left) - rect.left}px ${Math.round(rect.top) - rect.top}px`;
    });
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.setAttribute("data-page-history-snapshot-style", "true");
      style.textContent = `
        [data-page-history-snapshot],
        [data-page-history-snapshot] * {
          font-family: Arial, sans-serif !important;
        }
        [data-page-history-snapshot] .page-history-version span,
        [data-page-history-snapshot] .page-history-version small {
          font-style: normal !important;
          font-synthesis: none !important;
          font-weight: 400 !important;
          letter-spacing: 0 !important;
        }
      `;
      document.head.appendChild(style);
      for (const detail of document.querySelectorAll("[data-page-history-snapshot] .page-history-version small")) {
        detail.setAttribute("data-page-history-snapshot-text", detail.textContent ?? "");
        detail.textContent = (detail.textContent ?? "").replace(/\b[0-9a-f]{7,40}\b/gi, "0000000");
      }
    });
    await stabilizeHistorySnapshot(page, historyPanel);
    const history = await collectHistoryVisibleState(page);
    assertHistoryVisibleState(history, viewport.name);
    const captured = await captureElementSnapshot({
      artifactRoot,
      locator: historyPanel,
      metadata: {
        collapsed,
        expanded,
        expectedBacklinks: fixture.expectedBacklinks,
        expectedTocItems: fixture.expectedTocItems,
        history,
        historyPreview,
        phase: "page-history-restore-preview"
      },
      name: `page-history-restore-preview-${viewport.name}`,
      page,
      viewport
    });
    return {
      history,
      snapshot: {
        imagePath: captured.imagePath,
        metadataPath: captured.metadataPath,
        height: Number(captured.rect.height.toFixed(1)),
        width: Number(captured.rect.width.toFixed(1))
      }
    };
  } finally {
    await historyPanel.evaluate((node, previous) => {
      node.style.translate = node.getAttribute("data-page-history-snapshot-translate") ?? "";
      node.removeAttribute("data-page-history-snapshot-translate");
      if (previous === null) node.removeAttribute("data-page-history-snapshot");
      else node.setAttribute("data-page-history-snapshot", previous);
    }, previousSnapshotAttribute);
    await page.evaluate(() => {
      for (const detail of document.querySelectorAll("[data-page-history-snapshot-text]")) {
        detail.textContent = detail.getAttribute("data-page-history-snapshot-text") ?? "";
        detail.removeAttribute("data-page-history-snapshot-text");
      }
      for (const style of document.querySelectorAll("[data-page-history-snapshot-style]")) style.remove();
    });
    await content.evaluate((node, style) => {
      node.style.maxHeight = style.maxHeight;
      node.style.overflow = style.overflow;
    }, originalStyle);
  }
}

async function stabilizeHistorySnapshot(page, historyPanel) {
  const box = await historyPanel.boundingBox();
  if (!box) throw new Error("Page history panel has no capture bounds.");
  await page.mouse.move(box.x + Math.min(24, box.width / 2), box.y + Math.min(24, box.height / 2));
  await historyPanel.evaluate(async (root) => {
    if (root.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await Promise.all(root.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function collectHistoryVisibleState(page) {
  return page.locator(".page-history-panel").first().evaluate((panel) => {
    const rect = (node) => {
      if (!(node instanceof Element)) return null;
      const box = node.getBoundingClientRect();
      return {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
        width: box.width,
        height: box.height
      };
    };
    const contains = (outer, inner, tolerance = 1) => Boolean(
      outer && inner &&
      inner.left >= outer.left - tolerance &&
      inner.top >= outer.top - tolerance &&
      inner.right <= outer.right + tolerance &&
      inner.bottom <= outer.bottom + tolerance
    );
    const panelRect = rect(panel);
    const secondaryContent = panel.closest(".page-secondary-content");
    const secondaryPanel = panel.closest("[data-testid='page-secondary-panel']");
    const contentStyle = secondaryContent ? window.getComputedStyle(secondaryContent) : null;
    const status = panel.querySelector(".page-history-status");
    const preview = panel.querySelector(".page-history-preview");
    const previewLabel = panel.querySelector(".page-history-preview-header span");
    const restoreButton = panel.querySelector(".page-history-preview-header button");
    const versions = Array.from(panel.querySelectorAll(".page-history-version"));
    const backlinkExcerpts = Array.from(document.querySelectorAll(".page-backlink-excerpt"))
      .map((item) => item.textContent?.trim() ?? "");
    const visibleText = [panel.textContent || "", ...backlinkExcerpts].join("\n");
    const storageLeakMatches = visibleText.match(
      /(?:databases|pages)\/[^\s)]+|--(?:db|pg|row)_[a-z0-9_-]+|(?:^|\/)[^/\s]+\.md\b/gi
    ) ?? [];
    const versionRects = versions.map((version) => ({
      label: version.textContent?.trim() ?? "",
      rect: rect(version),
      selected: version.classList.contains("selected")
    }));
    const statusRect = rect(status);
    const previewRect = rect(preview);
    const previewLabelRect = rect(previewLabel);
    const restoreButtonRect = rect(restoreButton);
    return {
      panel: panelRect,
      statusRect,
      previewRect,
      previewLabelRect,
      restoreButtonRect,
      versionRects,
      status: status?.textContent?.trim() ?? "",
      message: panel.querySelector(".page-history-message")?.textContent?.trim() ?? "",
      versionCount: versions.length,
      selectedVersionCount: versions.filter((version) => version.classList.contains("selected")).length,
      previewLabel: previewLabel?.textContent?.trim() ?? "",
      restoreButtonText: restoreButton?.textContent?.trim() ?? "",
      diffLineCount: panel.querySelectorAll(".page-history-diff-line").length,
      addedLineCount: panel.querySelectorAll(".page-history-diff-line.added").length,
      removedLineCount: panel.querySelectorAll(".page-history-diff-line.removed").length,
      backlinkExcerpts,
      storageLeakMatches,
      statusInsidePanel: contains(panelRect, statusRect),
      versionsInsidePanel: versionRects.every((version) => contains(panelRect, version.rect)),
      previewInsidePanel: contains(panelRect, previewRect),
      previewLabelInsidePreview: contains(previewRect, previewLabelRect),
      restoreInsidePreview: contains(previewRect, restoreButtonRect),
      horizontalOverflow: panel instanceof HTMLElement
        ? Math.max(0, panel.scrollWidth - panel.clientWidth)
        : Number.NaN,
      secondaryExpanded: secondaryPanel?.getAttribute("aria-expanded") === "true",
      contentVisibility: contentStyle?.visibility ?? "",
      contentOpacity: contentStyle?.opacity ?? ""
    };
  });
}

function assertHistoryVisibleState(state, viewportName) {
  for (const key of ["panel", "statusRect", "previewRect", "previewLabelRect", "restoreButtonRect"]) {
    const box = state[key];
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(`Page history ${viewportName} missing ${key} geometry: ${JSON.stringify(box)}`);
    }
  }
  if (
    state.status !== "Ready" ||
    state.versionCount !== 2 ||
    state.selectedVersionCount !== 1 ||
    state.restoreButtonText !== "Restore" ||
    state.diffLineCount < 2 ||
    state.addedLineCount < 1 ||
    state.removedLineCount < 1 ||
    !state.statusInsidePanel ||
    !state.versionsInsidePanel ||
    !state.previewInsidePanel ||
    !state.previewLabelInsidePreview ||
    !state.restoreInsidePreview ||
    state.horizontalOverflow > 1 ||
    !state.secondaryExpanded ||
    state.contentVisibility !== "visible" ||
    Number(state.contentOpacity) < 0.99 ||
    state.storageLeakMatches.length > 0
  ) {
    throw new Error(`Page history ${viewportName} visible-state contract failed: ${JSON.stringify(state)}`);
  }
}

async function readSecondaryState(page, fixture) {
  return page.evaluate((sourceTitle) => {
    const panel = document.querySelector("[data-testid='page-secondary-panel']");
    const content = document.querySelector(".page-secondary-content");
    const rect = panel?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const contentStyle = content ? window.getComputedStyle(content) : null;
    return {
      className: panel?.className ?? "",
      expanded: panel?.getAttribute("aria-expanded") ?? "",
      panelHeight: rect?.height ?? 0,
      panelTop: rect?.top ?? 0,
      panelBottom: rect?.bottom ?? 0,
      contentHeight: contentRect?.height ?? 0,
      contentVisibility: contentStyle?.visibility ?? "",
      sourceLinkMounted: Array.from(document.querySelectorAll(".page-property-link")).some((link) => link.getAttribute("title") === sourceTitle),
      backlinkItems: document.querySelectorAll(".page-backlink-item").length
    };
  }, fixture.originalHtmlRel);
}

async function readTocState(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".cm-md-floating-toc-host");
    const nav = host?.querySelector(".cm-md-toc-widget");
    const toggle = host?.querySelector(".cm-md-toc-toggle");
    const hostRect = host?.getBoundingClientRect();
    const navStyle = nav ? window.getComputedStyle(nav) : null;
    return {
      hostClass: host?.className ?? "",
      hostRect: hostRect ? {
        top: hostRect.top,
        right: hostRect.right,
        bottom: hostRect.bottom,
        left: hostRect.left,
        width: hostRect.width,
        height: hostRect.height
      } : null,
      toggleExpanded: toggle?.getAttribute("aria-expanded") ?? "",
      navDisplay: navStyle?.display ?? "",
      hovered: Boolean(host?.matches(":hover")),
      focusedWithin: Boolean(host?.contains(document.activeElement)),
      activeIsToggle: document.activeElement === toggle,
      contentRect: (() => {
        const rect = document.querySelector(".cm-editor .cm-content")?.getBoundingClientRect();
        return rect ? {
          left: rect.left,
          right: rect.right,
          width: rect.width
        } : null;
      })(),
      hostOpacity: host ? window.getComputedStyle(host).opacity : "",
      hostBackgroundAlpha: (() => {
        if (!host) return 1;
        const value = window.getComputedStyle(host).backgroundColor.trim().toLowerCase();
        if (value === "transparent") return 0;
        const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)$/.exec(value);
        if (rgba) return Number(rgba[1]);
        const slash = /\/\s*([0-9.]+)(%)?\s*\)$/.exec(value);
        if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
        return 1;
      })(),
      itemTexts: Array.from(host?.querySelectorAll(".cm-md-toc-item") ?? []).map((item) => item.textContent?.trim() ?? ""),
      activeIsTocItem: document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("cm-md-toc-item"),
      railMarkers: host?.querySelectorAll(".cm-md-toc-rail-marker").length ?? 0
    };
  });
}

async function assertPrimaryGeometry(page, label) {
  const titleRect = await readRect(page.locator(".title-input").first());
  const panelRect = await readRect(page.getByTestId("page-secondary-panel").first());
  const editorRect = await readRect(page.locator(".page-body").first());
  const sidebarRect = await readRect(page.locator(".sidebar").first());
  const tocToggleRect = await readRect(page.locator(".cm-md-floating-toc-host .cm-md-toc-toggle").first());
  const viewport = page.viewportSize();
  const metrics = { titleRect, panelRect, editorRect, sidebarRect, tocToggleRect, viewport };
  if (overlap(titleRect, panelRect)) {
    throw new Error(`${label}: title overlaps secondary panel: ${JSON.stringify(metrics)}`);
  }
  if (overlap(panelRect, editorRect)) {
    throw new Error(`${label}: secondary panel overlaps editor body: ${JSON.stringify(metrics)}`);
  }
  if (tocToggleRect.left < sidebarRect.right) {
    throw new Error(`${label}: floating TOC overlaps sidebar: ${JSON.stringify(metrics)}`);
  }
  if (viewport && (tocToggleRect.right > viewport.width + 8 || tocToggleRect.left < -8)) {
    throw new Error(`${label}: floating TOC toggle leaves viewport: ${JSON.stringify(metrics)}`);
  }
}

function overlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function createPageSecondaryFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-page-secondary-${viewportName}-`));
  const now = "2026-06-12T12:00:00.000Z";
  const targetPageId = `pg_secondary_target_${viewportName}`;
  const targetTitle = `Page Secondary Target ${viewportName}`;
  const sourceCount = 5;
  const sourcePageIds = Array.from({ length: sourceCount }, (_, index) => `pg_secondary_source_${viewportName}_${index + 1}`);
  const sourceTitles = sourcePageIds.map((_, index) => `Secondary Source ${index + 1} ${viewportName}`);
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const targetPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(targetPageId, targetTitle));
  const sourcePaths = sourcePageIds.map((id, index) =>
    workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(id, sourceTitles[index]))
  );
  const originalHtmlRel = `attachments/original/${viewportName}-source.html`;
  const coverRel = `attachments/covers/page-secondary-${viewportName}.svg`;
  const deepHeading = "Nested Insight";
  const linkedHeading = "Work reflectionJump";
  const restoredMarker = `Historical page detail ${viewportName}`;
  const currentMarker = `Current page detail ${viewportName}`;

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(root, "attachments", "original"), { recursive: true });
  await mkdir(join(root, "attachments", "covers"), { recursive: true });
  await writeFile(join(root, originalHtmlRel), "<html><body>Original source fixture</body></html>\n", "utf8");
  await writeFile(
    join(root, coverRel),
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="360"><rect width="1200" height="360" fill="#d9c7ac"/><path d="M0 270L260 90l220 140 260-170 460 250v50H0z" fill="#8fa08d"/></svg>\n`,
    "utf8"
  );
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_page_secondary_${viewportName}`,
    name: `Page Secondary ${viewportName}`,
    pages: [targetPageId, ...sourcePageIds],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "tags", "date", "url"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: targetPageId,
      title: targetTitle,
      now,
      icon: "emoji:🧭",
      path: ["Smoke", targetTitle],
      bodyPath: targetPath,
      tags: "secondary, toc",
      date: "2026-06-12",
      url: "https://example.com/page-secondary",
      originalHtmlRel,
      cover: coverRel,
      coverOffset: 50
    }),
    ...sourcePageIds.map((id, index) => pageRecord({
      id,
      title: sourceTitles[index],
      now,
      icon: "emoji:🔁",
      path: ["Smoke", "Sources", sourceTitles[index]],
      bodyPath: sourcePaths[index]
    }))
  ]);
  await writeFile(
    join(root, targetPath),
    pageSecondaryMarkdown(targetTitle, deepHeading, restoredMarker),
    "utf8"
  );
  for (let index = 0; index < sourcePaths.length; index += 1) {
    await writeFile(
      join(root, sourcePaths[index]),
      `# ${sourceTitles[index]}\n\nBacklink source ${index + 1} links to [${targetTitle}](${targetPath}).\n`,
      "utf8"
    );
  }
  await initializePageHistoryFixture({
    currentMarkdown: pageSecondaryMarkdown(targetTitle, deepHeading, currentMarker),
    root,
    targetPath
  });
  return {
    root,
    targetPageId,
    targetTitle,
    originalHtmlRel,
    expectedBacklinks: sourceCount,
    expectedTocItems: 5,
    deepHeading,
    linkedHeading,
    restoredMarker
  };
}

function pageSecondaryMarkdown(title, deepHeading, versionMarker) {
  return [
    `# ${title}`,
    "",
    "Target page for secondary chrome smoke.",
    "",
    "## Overview",
    "",
    "A short overview keeps the first heading visible.",
    "",
    "## Deep Work",
    "",
    versionMarker,
    "",
    `### ${deepHeading}`,
    "",
    "This heading is used by the floating table of contents.",
    "",
    "## Final Section",
    "",
    "The editor should remain usable after TOC navigation.",
    "",
    "The expanded table of contents should never resize the document.",
    "",
    "Navigation should scroll without moving the editor selection.",
    "",
    "Imported heading labels should remain readable in the table of contents.",
    "",
    "The malformed imported-link fixture remains below the screenshot fold.",
    "",
    "## Work reflection[[Jump]](https://example.com/reflection)"
  ].join("\n");
}

async function initializePageHistoryFixture({ currentMarkdown, root, targetPath }) {
  await execFileAsync("git", ["init", "-q"], { cwd: root });
  await execFileAsync("git", ["config", "user.name", "Lotion UI Smoke"], { cwd: root });
  await execFileAsync("git", ["config", "user.email", "ui-smoke@lotion.local"], { cwd: root });
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync("git", ["commit", "-q", "-m", "Historical page details"], {
    cwd: root,
    env: gitCommitEnvironment("2026-06-11T12:00:00Z")
  });
  await writeFile(join(root, targetPath), currentMarkdown, "utf8");
  await execFileAsync("git", ["add", "--", targetPath], { cwd: root });
  await execFileAsync("git", ["commit", "-q", "-m", "Current page details"], {
    cwd: root,
    env: gitCommitEnvironment("2026-06-12T12:00:00Z")
  });
}

function gitCommitEnvironment(date) {
  return {
    ...process.env,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_DATE: date
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
    "notion_original_html",
    "full_width",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function pageRecord({
  id,
  title,
  now,
  icon,
  path,
  bodyPath,
  tags = "",
  date = "",
  url = "",
  originalHtmlRel = "",
  cover = "",
  coverOffset = ""
}) {
  return {
    id,
    created_time: now,
    updated_time: now,
    title,
    kind: "page",
    body_path: bodyPath,
    icon,
    cover,
    cover_offset: coverOffset,
    path: serializePathValue(path),
    parent_id: "",
    tags,
    date,
    url,
    notion_original_html: originalHtmlRel,
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
      { id: "path", name: "Path", type: "text", system: true },
      { id: "parent_id", name: "Parent", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "date" },
      { id: "url", name: "URL", type: "url" },
      { id: "notion_original_html", name: "Original Notion HTML", type: "url", system: true },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true },
      { id: "row_id", name: "Row ID", type: "text", system: true },
      { id: "page_file", name: "Page file", type: "text", system: true }
    ]
  };
}

function defaultView(databaseId, fieldIds) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fieldIds,
    fieldOrder: fieldIds,
    wrapFieldIds: fieldIds,
    sorts: [],
    filters: []
  };
}
