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
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  readRect,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";
import { assertUrlFieldArtifactContract } from "./lib/url-field-artifacts.mjs";

const result = await withLotionUIHarness("url-field-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const viewportResults = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createUrlFieldFixture();
    registerTempWorkspace(fixture.root);
    await openWorkspace(fixture.root);
    await waitForDatabaseService(page, fixture.databaseId);
    await navigateToDatabaseAndWait(page, fixture);
    await assertNoDocumentHorizontalOverflow(page, `URL database initial ${viewport.name}`);

    const dryRun = await enableShellOpenCapture(page);
    const patch = dryRun.enabled ? { patched: false } : await patchShellOpenLink(page);

    try {
      const tableEdit = await assertUrlCellTextClickEdits(page, fixture, dryRun.enabled, viewport.name);
      const openButton = page.locator(`.url-cell-open[title="${cssEscape(fixture.editedNormalizedUrl)}"]`).first();
      await openButton.waitFor({ state: "attached", timeout: 8_000 });
      await assertWithinViewport(page, openButton, `URL open button ${viewport.name}`, 4);
      await assertOpenAffordanceGeometry(page, openButton, `URL open button ${viewport.name}`);
      const disabled = await openButton.evaluate((button) => button.hasAttribute("disabled"));
      if (disabled) throw new Error("URL open button is disabled for a valid URL");
      await clearCapturedOpenRequests(page, dryRun.enabled);
      if (dryRun.enabled) {
        await openButton.waitFor({ state: "visible", timeout: 8_000 });
        await openButton.click();
        await page.waitForFunction(async (url) => {
          const requests = await window.lotion.debug.getShellOpenRequests();
          return requests.includes(url);
        }, fixture.editedNormalizedUrl, { timeout: 5_000 });
      } else if (patch.patched) {
        await openButton.click();
        await page.waitForFunction((url) => {
          const opened = window.__lotionOpenedUrls;
          return Array.isArray(opened) && opened.includes(url);
        }, fixture.editedNormalizedUrl, { timeout: 5_000 });
      }
      const tableOpenRequests = await readCapturedOpenRequests(page, dryRun.enabled);
      const tableSnapshot = await captureUrlTableSnapshot(page, artifactRoot, fixture, viewport);

      const rowPageProperty = await assertEditableUrlPropertyUsesEditor(page, fixture, dryRun.enabled, viewport.name);
      const rendered = await assertRenderedUrlLayout(page, fixture, viewport.name);
      const pageUrlProperty = await assertTopLevelPageUrlProperty(page, fixture, dryRun.enabled, viewport.name);
      const pageUrlSnapshot = await captureTopLevelPageUrlSnapshot(page, artifactRoot, fixture, viewport);
      await assertNoDocumentHorizontalOverflow(page, `URL row page ${viewport.name}`);

      viewportResults.push({
        viewport: viewport.name,
        workspaceRoot: fixture.root,
        databaseId: fixture.databaseId,
        rawUrl: fixture.rawUrl,
        normalizedUrl: fixture.normalizedUrl,
        editedRawUrl: fixture.editedRawUrl,
        editedNormalizedUrl: fixture.editedNormalizedUrl,
        pageEditedRawUrl: fixture.pageEditedRawUrl,
        pageEditedNormalizedUrl: fixture.pageEditedNormalizedUrl,
        shellOpenDryRun: dryRun.enabled,
        openLinkPatched: patch.patched,
        openLinkPatchError: patch.error,
        tableEdit,
        tableOpenRequests,
        tableSnapshot,
        rowPageProperty,
        pageUrlProperty,
        pageUrlSnapshot,
        rendered
      });
    } finally {
      await page.evaluate(async () => {
        await window.lotion.debug?.setShellOpenDryRun?.(false);
        await window.lotion.debug?.clearShellOpenRequests?.();
      }).catch(() => undefined);
    }
  });

  const summary = {
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  };
  return {
    ...summary,
    artifactContract: await assertUrlFieldArtifactContract(summary, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    }),
    viewportCoverage: assertHarnessViewportCoverage(summary, expectedViewports)
  };
});

console.log(JSON.stringify(result, null, 2));

async function navigateToDatabase(page, databaseId) {
  await page.evaluate((targetDatabaseId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId: targetDatabaseId }
    }));
  }, databaseId);
}

async function navigateToRowPage(page, databaseId, rowId) {
  await page.evaluate(({ targetDatabaseId, targetRowId }) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: {
        kind: "row",
        entityId: targetRowId,
        databaseId: targetDatabaseId,
        rowId: targetRowId
      }
    }));
  }, { targetDatabaseId: databaseId, targetRowId: rowId });
}

async function enableShellOpenCapture(page) {
  return page.evaluate(async () => {
    const debug = window.lotion.debug;
    if (!debug?.setShellOpenDryRun || !debug?.clearShellOpenRequests || !debug?.getShellOpenRequests) {
      return { enabled: false };
    }
    await debug.setShellOpenDryRun(true);
    await debug.clearShellOpenRequests();
    return { enabled: true };
  });
}

async function patchShellOpenLink(page) {
  return page.evaluate(() => {
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
      return {
        patched: window.lotion.shell.openLink !== original
      };
    } catch (error) {
      return {
        patched: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

async function assertUrlCellTextClickEdits(page, fixture, dryRunEnabled, viewportName) {
  const urlCell = page.locator(".url-cell", {
    has: page.locator(`.url-cell-open[title="${cssEscape(fixture.normalizedUrl)}"]`)
  }).first();
  await urlCell.waitFor({ state: "visible", timeout: 8_000 });
  await assertWithinViewport(page, urlCell, `URL cell ${viewportName}`, 4);
  const display = urlCell.locator(".url-cell-display").first();
  await display.waitFor({ state: "visible", timeout: 8_000 });
  await assertWithinViewport(page, display, `URL display ${viewportName}`, 4);
  const beforeTextClick = await readCapturedOpenRequests(page, dryRunEnabled);
  await clickCenter(page, display);
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && active.closest(".url-cell");
  }, null, { timeout: 5_000 });
  const afterTextClick = await readCapturedOpenRequests(page, dryRunEnabled);
  if (afterTextClick.length !== beforeTextClick.length) {
    throw new Error(`Clicking URL text opened a link instead of editing: before=${JSON.stringify(beforeTextClick)} after=${JSON.stringify(afterTextClick)}`);
  }
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.type(fixture.editedRawUrl);
  await page.keyboard.press("Enter");
  await page.waitForSelector(`.url-cell-open[title="${cssEscape(fixture.editedNormalizedUrl)}"]`, { timeout: 8_000 });
  const edited = await page.evaluate((url) => {
    const button = document.querySelector(`.url-cell-open[title="${CSS.escape(url)}"]`);
    const cell = button?.closest(".url-cell");
    const input = cell?.querySelector("input");
    const displayElement = cell?.querySelector(".url-cell-display");
    return {
      buttonTitle: button?.getAttribute("title") ?? "",
      inputValue: input?.value ?? "",
      displayText: displayElement?.textContent?.trim() ?? "",
      displayTitle: displayElement?.getAttribute("title") ?? "",
      activeTag: document.activeElement?.tagName ?? ""
    };
  }, fixture.editedNormalizedUrl);
  if (edited.inputValue !== fixture.editedRawUrl || edited.displayText !== fixture.editedRawUrl) {
    throw new Error(`URL field did not stay editable after typing: ${JSON.stringify(edited)}`);
  }
  return {
    openedBeforeTextClick: beforeTextClick,
    openedAfterTextClick: afterTextClick,
    edited
  };
}

async function assertEditableUrlPropertyUsesEditor(page, fixture, dryRunEnabled, viewportName) {
  await navigateToRowPage(page, fixture.databaseId, fixture.rowId);
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.rowTitle,
    { timeout: 8_000 }
  );
  await expandPageDetails(page, viewportName);
  const propertyInfo = await page.evaluate((fieldName) => {
    const rows = Array.from(document.querySelectorAll(".row-property"));
    const row = rows.find((candidate) =>
      candidate.querySelector(".row-property-name")?.textContent?.trim() === fieldName
    );
    return {
      found: Boolean(row),
      rowClass: row?.className ?? "",
      pagePropertyLinks: row?.querySelectorAll(".page-property-link").length ?? 0,
      urlEditors: row?.querySelectorAll(".row-property-editor-url").length ?? 0,
      urlCells: row?.querySelectorAll(".url-cell").length ?? 0,
      displayText: row?.querySelector(".url-cell-display")?.textContent?.trim() ?? "",
      inputValue: row?.querySelector("input")?.value ?? ""
    };
  }, fixture.markdownUrlFieldName);
  if (!propertyInfo.found || propertyInfo.pagePropertyLinks !== 0 || propertyInfo.urlEditors !== 1 || propertyInfo.urlCells !== 1) {
    throw new Error(`Editable URL property rendered as a read-only link instead of an editor: ${JSON.stringify(propertyInfo)}`);
  }
  const propertyRow = page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: fixture.markdownUrlFieldName })
  }).first();
  await assertWithinViewport(page, propertyRow, `row-page URL property ${viewportName}`, 4);
  const propertyCell = page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: fixture.markdownUrlFieldName })
  }).locator(".url-cell").first();
  await assertWithinViewport(page, propertyCell, `row-page URL cell ${viewportName}`, 4);
  const display = propertyCell.locator(".url-cell-display").first();
  await clearCapturedOpenRequests(page, dryRunEnabled);
  await clickCenter(page, display);
  await page.waitForFunction((fieldName) => {
    const rows = Array.from(document.querySelectorAll(".row-property"));
    const row = rows.find((candidate) =>
      candidate.querySelector(".row-property-name")?.textContent?.trim() === fieldName
    );
    const active = document.activeElement;
    return active instanceof HTMLInputElement && row?.contains(active);
  }, fixture.markdownUrlFieldName, { timeout: 5_000 });
  const afterTextClick = await readCapturedOpenRequests(page, dryRunEnabled);
  if (afterTextClick.length > 0) {
    throw new Error(`Clicking editable row-page URL property opened a link: ${JSON.stringify(afterTextClick)}`);
  }
  return {
    propertyInfo,
    openedAfterTextClick: afterTextClick
  };
}

async function assertTopLevelPageUrlProperty(page, fixture, dryRunEnabled, viewportName) {
  await openPage(page, fixture.homePageId);
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.homeTitle,
    { timeout: 8_000 }
  );
  await expandPageDetails(page, viewportName);
  const pageUrlCell = page.locator(".page-properties .page-property-url-cell").first();
  await pageUrlCell.waitFor({ state: "visible", timeout: 8_000 });
  await assertWithinViewport(page, pageUrlCell, `top-level page URL cell ${viewportName}`, 4);
  const display = pageUrlCell.locator(".url-cell-display").first();
  await display.waitFor({ state: "visible", timeout: 8_000 });
  await assertWithinViewport(page, display, `top-level page URL display ${viewportName}`, 4);

  const initial = await page.evaluate((rawUrl) => {
    const cell = document.querySelector(".page-properties .page-property-url-cell");
    const display = cell?.querySelector(".url-cell-display");
    const input = cell?.querySelector("input");
    const button = cell?.querySelector(".url-cell-open");
    return {
      displayText: display?.textContent?.trim() ?? "",
      displayTitle: display?.getAttribute("title") ?? "",
      inputValue: input?.value ?? "",
      buttonTitle: button?.getAttribute("title") ?? "",
      buttonDisabled: button?.hasAttribute("disabled") ?? true,
      matchingOpenButtons: document.querySelectorAll(`.page-properties .url-cell-open[title="${CSS.escape(rawUrl)}"]`).length
    };
  }, fixture.pageUrlNormalized);
  if (
    initial.displayText !== fixture.pageUrlRaw ||
    initial.displayTitle !== fixture.pageUrlRaw ||
    initial.inputValue !== fixture.pageUrlRaw ||
    initial.buttonTitle !== fixture.pageUrlNormalized ||
    initial.buttonDisabled ||
    initial.matchingOpenButtons !== 1
  ) {
    throw new Error(`Top-level page URL did not render as an editable link cell in ${viewportName}: ${JSON.stringify(initial)}`);
  }

  await clearCapturedOpenRequests(page, dryRunEnabled);
  await clickCenter(page, display);
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && Boolean(active.closest(".page-property-url-cell"));
  }, null, { timeout: 5_000 });
  const afterTextClick = await readCapturedOpenRequests(page, dryRunEnabled);
  if (afterTextClick.length > 0) {
    throw new Error(`Clicking top-level page URL text opened a link: ${JSON.stringify(afterTextClick)}`);
  }

  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.type(fixture.pageEditedRawUrl);
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLButtonElement && Boolean(active.closest(".page-property-url-cell"));
  }, null, { timeout: 5_000 });
  await page.waitForSelector(`.page-properties .url-cell-open[title="${cssEscape(fixture.pageEditedNormalizedUrl)}"]`, { timeout: 8_000 });
  await page.waitForFunction(async ({ pageId, rawUrl }) => {
    const doc = await window.lotion.pages.get(pageId);
    return doc?.meta?.url === rawUrl;
  }, { pageId: fixture.homePageId, rawUrl: fixture.pageEditedRawUrl }, { timeout: 8_000 });
  await page.locator(".page-secondary-toggle").first().focus();
  await page.waitForFunction(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement && active.classList.contains("page-secondary-toggle");
  }, null, { timeout: 5_000 });

  const editedLayout = await page.evaluate((rawUrl) => {
    const cell = document.querySelector(".page-properties .page-property-url-cell");
    const display = cell?.querySelector(".url-cell-display");
    const input = cell?.querySelector("input");
    const button = cell?.querySelector(".url-cell-open");
    const displayRect = display?.getBoundingClientRect();
    const buttonRect = button?.getBoundingClientRect();
    const cellRect = cell?.getBoundingClientRect();
    return {
      displayText: display?.textContent?.trim() ?? "",
      displayTitle: display?.getAttribute("title") ?? "",
      inputValue: input?.value ?? "",
      inputOpacity: input ? getComputedStyle(input).opacity : "",
      buttonTitle: button?.getAttribute("title") ?? "",
      textDecorationLine: display ? getComputedStyle(display).textDecorationLine : "",
      displayRight: displayRect ? Number(displayRect.right.toFixed(1)) : null,
      buttonLeft: buttonRect ? Number(buttonRect.left.toFixed(1)) : null,
      buttonWidth: buttonRect ? Number(buttonRect.width.toFixed(1)) : null,
      buttonHeight: buttonRect ? Number(buttonRect.height.toFixed(1)) : null,
      buttonCenterY: buttonRect ? Number((buttonRect.top + buttonRect.height / 2).toFixed(1)) : null,
      cellCenterY: cellRect ? Number((cellRect.top + cellRect.height / 2).toFixed(1)) : null,
      gap: displayRect && buttonRect ? Number((buttonRect.left - displayRect.right).toFixed(1)) : null,
      matchedButtons: document.querySelectorAll(`.page-properties .url-cell-open[title="${CSS.escape(rawUrl)}"]`).length
    };
  }, fixture.pageEditedNormalizedUrl);
  if (
    editedLayout.displayText !== fixture.pageEditedRawUrl ||
    editedLayout.displayTitle !== fixture.pageEditedRawUrl ||
    editedLayout.inputValue !== fixture.pageEditedRawUrl ||
    editedLayout.buttonTitle !== fixture.pageEditedNormalizedUrl ||
    editedLayout.matchedButtons !== 1
  ) {
    throw new Error(`Top-level page URL edit did not persist in the visible cell in ${viewportName}: ${JSON.stringify(editedLayout)}`);
  }
  if (!editedLayout.textDecorationLine.includes("underline")) {
    throw new Error(`Top-level page URL should look like a link in ${viewportName}: ${JSON.stringify(editedLayout)}`);
  }
  if (editedLayout.inputOpacity !== "0") {
    throw new Error(`Inactive top-level page URL input should hide behind display text in ${viewportName}: ${JSON.stringify(editedLayout)}`);
  }
  if (editedLayout.gap == null || editedLayout.gap < 0) {
    throw new Error(`Top-level page URL text overlaps its open button in ${viewportName}: ${JSON.stringify(editedLayout)}`);
  }
  if ((editedLayout.buttonWidth ?? 0) < 30 || (editedLayout.buttonHeight ?? 0) < 30) {
    throw new Error(`Top-level page URL open button hit target is too small in ${viewportName}: ${JSON.stringify(editedLayout)}`);
  }
  if (
    editedLayout.buttonCenterY == null ||
    editedLayout.cellCenterY == null ||
    Math.abs(editedLayout.buttonCenterY - editedLayout.cellCenterY) > 5
  ) {
    throw new Error(`Top-level page URL open button is not vertically aligned in ${viewportName}: ${JSON.stringify(editedLayout)}`);
  }

  const openButton = page.locator(`.page-properties .url-cell-open[title="${cssEscape(fixture.pageEditedNormalizedUrl)}"]`).first();
  await assertWithinViewport(page, openButton, `top-level page URL open button ${viewportName}`, 4);
  await clearCapturedOpenRequests(page, dryRunEnabled);
  await openButton.click();
  await page.waitForFunction(async ({ url, useDryRun }) => {
    if (useDryRun) {
      const requests = await window.lotion.debug?.getShellOpenRequests?.() ?? [];
      return requests.includes(url);
    }
    const opened = window.__lotionOpenedUrls;
    return Array.isArray(opened) && opened.includes(url);
  }, { url: fixture.pageEditedNormalizedUrl, useDryRun: dryRunEnabled }, { timeout: 5_000 });
  const openRequests = await readCapturedOpenRequests(page, dryRunEnabled);
  return {
    pageId: fixture.homePageId,
    initial,
    afterTextClick,
    editedLayout,
    openRequests
  };
}

async function captureUrlTableSnapshot(page, artifactRoot, fixture, viewport) {
  const table = page.locator(".database-table").first();
  await table.waitFor({ state: "visible", timeout: 8_000 });
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: table,
    metadata: {
      phase: "table",
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      editedRawUrl: fixture.editedRawUrl,
      editedNormalizedUrl: fixture.editedNormalizedUrl,
      openButtonCount: await page.locator(`.url-cell-open[title="${cssEscape(fixture.editedNormalizedUrl)}"]`).count()
    },
    name: `url-field-table-${viewport.name}`,
    page,
    viewport
  });
  return assertElementSnapshotBaseline(snapshot, {
    label: `URL field table ${viewport.name}`,
    metadata: {
      phase: "table",
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      editedNormalizedUrl: fixture.editedNormalizedUrl
    },
    rect: {
      width: { min: 520, max: 1400 },
      height: { min: 140, max: 1200 }
    },
    viewportName: viewport.name
  });
}

async function captureTopLevelPageUrlSnapshot(page, artifactRoot, fixture, viewport) {
  const properties = page.locator(".page-properties").first();
  await properties.waitFor({ state: "visible", timeout: 8_000 });
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: properties,
    metadata: {
      phase: "top-level-page-property",
      pageId: fixture.homePageId,
      editedRawUrl: fixture.pageEditedRawUrl,
      editedNormalizedUrl: fixture.pageEditedNormalizedUrl,
      openButtonCount: await page.locator(`.page-properties .url-cell-open[title="${cssEscape(fixture.pageEditedNormalizedUrl)}"]`).count()
    },
    name: `url-field-page-property-${viewport.name}`,
    page,
    viewport
  });
  return assertElementSnapshotBaseline(snapshot, {
    label: `top-level page URL property ${viewport.name}`,
    metadata: {
      phase: "top-level-page-property",
      pageId: fixture.homePageId,
      editedNormalizedUrl: fixture.pageEditedNormalizedUrl
    },
    rect: {
      width: { min: 420, max: 1240 },
      height: { min: 90, max: 420 }
    },
    viewportName: viewport.name
  });
}

async function assertRenderedUrlLayout(page, fixture, viewportName) {
  const rendered = await page.evaluate(async (url) => ({
    openButtons: Array.from(document.querySelectorAll(".url-cell-open")).map((button) => ({
      title: button.getAttribute("title"),
      disabled: button.hasAttribute("disabled")
    })),
    displayLinks: Array.from(document.querySelectorAll(".url-cell-display")).map((el) => ({
      title: el.getAttribute("title"),
      text: el.textContent?.trim(),
      visible: Boolean(el.getClientRects().length),
      color: getComputedStyle(el).color,
      textDecorationLine: getComputedStyle(el).textDecorationLine
    })),
    layouts: Array.from(document.querySelectorAll(".url-cell")).map((cell) => {
      const display = cell.querySelector(".url-cell-display");
      const input = cell.querySelector("input");
      const button = cell.querySelector(".url-cell-open");
      const displayRect = display?.getBoundingClientRect();
      const buttonRect = button?.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const inputStyle = input ? getComputedStyle(input) : undefined;
      return {
        displayTitle: display?.getAttribute("title") ?? "",
        displayText: display?.textContent?.trim() ?? "",
        inputValue: input?.value ?? "",
        inputOpacity: inputStyle?.opacity ?? "",
        inputCaretColor: inputStyle?.caretColor ?? "",
        displayRight: displayRect ? Number(displayRect.right.toFixed(1)) : null,
        buttonLeft: buttonRect ? Number(buttonRect.left.toFixed(1)) : null,
        buttonWidth: buttonRect ? Number(buttonRect.width.toFixed(1)) : null,
        buttonHeight: buttonRect ? Number(buttonRect.height.toFixed(1)) : null,
        buttonCenterY: buttonRect ? Number((buttonRect.top + buttonRect.height / 2).toFixed(1)) : null,
        cellCenterY: Number((cellRect.top + cellRect.height / 2).toFixed(1)),
        gap: displayRect && buttonRect ? Number((buttonRect.left - displayRect.right).toFixed(1)) : null
      };
    }),
    openedUrls: window.__lotionOpenedUrls ?? [],
    shellOpenDryRunRequests: await window.lotion.debug?.getShellOpenRequests?.() ?? [],
    matchedButtons: document.querySelectorAll(`.url-cell-open[title="${CSS.escape(url)}"]`).length
  }), fixture.editedNormalizedUrl);

  const matchingDisplay = rendered.displayLinks.find((item) => item.title === fixture.editedRawUrl);
  if (!matchingDisplay || !matchingDisplay.visible || matchingDisplay.text !== fixture.editedRawUrl) {
    throw new Error(`URL cell did not render a visible link-style display in ${viewportName}: ${JSON.stringify(rendered.displayLinks)}`);
  }
  if (!matchingDisplay.textDecorationLine.includes("underline")) {
    throw new Error(`URL cell display should be underlined like a link in ${viewportName}: ${JSON.stringify(matchingDisplay)}`);
  }
  const matchingLayout = rendered.layouts.find((item) => item.displayTitle === fixture.editedRawUrl);
  if (!matchingLayout) {
    throw new Error(`Missing URL cell layout sample for edited URL in ${viewportName}: ${JSON.stringify(rendered.layouts)}`);
  }
  if (matchingLayout.inputOpacity !== "0") {
    throw new Error(`Inactive URL input should be visually hidden behind display text in ${viewportName}: ${JSON.stringify(matchingLayout)}`);
  }
  if (matchingLayout.gap == null || matchingLayout.gap < 0) {
    throw new Error(`URL display text overlaps the open button in ${viewportName}: ${JSON.stringify(matchingLayout)}`);
  }
  if ((matchingLayout.buttonWidth ?? 0) < 30 || (matchingLayout.buttonHeight ?? 0) < 30) {
    throw new Error(`URL open button hit target is too small in ${viewportName}: ${JSON.stringify(matchingLayout)}`);
  }
  if (matchingLayout.buttonCenterY == null || Math.abs(matchingLayout.buttonCenterY - matchingLayout.cellCenterY) > 5) {
    throw new Error(`URL open button is not vertically aligned in ${viewportName}: ${JSON.stringify(matchingLayout)}`);
  }
  return rendered;
}

async function assertOpenAffordanceGeometry(page, locator, label) {
  const rect = await readRect(locator);
  if (rect.width < 30 || rect.height < 30) {
    throw new Error(`${label} hit target is too small: ${JSON.stringify(rect)}`);
  }
  await assertWithinViewport(page, locator, label, 4);
  return rect;
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

async function clearCapturedOpenRequests(page, dryRunEnabled) {
  await page.evaluate(async (useDryRun) => {
    if (useDryRun) await window.lotion.debug?.clearShellOpenRequests?.();
    if (Array.isArray(window.__lotionOpenedUrls)) window.__lotionOpenedUrls.length = 0;
  }, dryRunEnabled);
}

async function readCapturedOpenRequests(page, dryRunEnabled) {
  return page.evaluate(async (useDryRun) => {
    if (useDryRun) return await window.lotion.debug?.getShellOpenRequests?.() ?? [];
    return Array.isArray(window.__lotionOpenedUrls) ? [...window.__lotionOpenedUrls] : [];
  }, dryRunEnabled);
}

async function clickCenter(page, locator) {
  const box = await locator.boundingBox({ timeout: 8_000 });
  if (!box) throw new Error("Expected clickable URL display geometry");
  await locator.click({
    position: {
      x: Math.min(12, Math.max(1, box.width / 2)),
      y: box.height / 2
    }
  });
}

function selectAllShortcut() {
  return process.platform === "darwin" ? "Meta+A" : "Control+A";
}

async function navigateToDatabaseAndWait(page, fixture) {
  const selector = `.url-cell-open[title="${cssEscape(fixture.normalizedUrl)}"]`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await navigateToDatabase(page, fixture.databaseId);
    try {
      await page.waitForSelector(".database-table", { timeout: 5_000 });
      await page.getByText(fixture.rowTitle).first().waitFor({ timeout: 5_000 });
      await page.locator(selector).first().waitFor({ state: "attached", timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  const snapshot = await page.evaluate((targetSelector) => ({
    title: document.title,
    activeTab: document.querySelector(".tab.active")?.textContent?.trim() ?? "",
    databaseTables: document.querySelectorAll(".database-table").length,
    urlOpenButtons: Array.from(document.querySelectorAll(".url-cell-open")).map((button) => ({
      title: button.getAttribute("title"),
      text: button.textContent?.trim() ?? "",
      visible: Boolean(button.getClientRects().length)
    })),
    targetMatches: document.querySelectorAll(targetSelector).length,
    bodyText: document.body.textContent?.slice(0, 1000) ?? ""
  }), selector);
  throw new Error(`URL field database did not render target button: ${lastError instanceof Error ? lastError.message : String(lastError)}\n${JSON.stringify(snapshot, null, 2)}`);
}

async function waitForDatabaseService(page, databaseId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetDatabaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === targetDatabaseId);
  }, databaseId, { timeout: 8_000 });
}

async function createUrlFieldFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-url-field-"));
  const now = "2026-01-01T00:00:00.000Z";
  const homeId = "pg_url_field_home";
  const homeTitle = "URL Field Smoke Home";
  const databaseId = "db_url_field";
  const databaseName = "URL Field Smoke DB";
  const rowId = "row_url_field";
  const rowTitle = "URL Field Row";
  const rawUrl = "example.com/open-smoke?x=1";
  const normalizedUrl = `https://${rawUrl}`;
  const editedRawUrl = "example.com/edited-smoke?x=2";
  const editedNormalizedUrl = `https://${editedRawUrl}`;
  const pageUrlRaw = "docs.example.com/top-page-url";
  const pageUrlNormalized = `https://${pageUrlRaw}`;
  const pageEditedRawUrl = "docs.example.com/top-page-url-edited";
  const pageEditedNormalizedUrl = `https://${pageEditedRawUrl}`;
  const markdownUrlFieldName = "Markdown Website";
  const markdownUrlRaw = "[Editable URL](https://example.com/markdown-url-smoke)";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_url_field",
    name: "URL Field Smoke",
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
      icon: "emoji:🔗",
      path: ["Bench", homeTitle],
      bodyPath: homePath,
      url: pageUrlRaw
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nSmoke workspace for URL field tests.\n`, "utf8");

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
      { id: "website", name: "Website", type: "url" },
      { id: "markdown_website", name: markdownUrlFieldName, type: "url" },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "website", "markdown_website", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "website",
    "markdown_website",
    "notes"
  ], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    page_file: rowPageFile,
    website: rawUrl,
    markdown_website: markdownUrlRaw,
    notes: "URL field smoke row"
  }]);
  await writeFile(join(databaseDir, "pages", rowPageFile), `# ${rowTitle}\n\nURL field row page body.\n`, "utf8");

  return {
    root,
    homePageId: homeId,
    homeTitle,
    databaseId,
    databaseName,
    rowId,
    rowPageFile,
    rowTitle,
    rawUrl,
    normalizedUrl,
    editedRawUrl,
    editedNormalizedUrl,
    pageUrlRaw,
    pageUrlNormalized,
    pageEditedRawUrl,
    pageEditedNormalizedUrl,
    markdownUrlFieldName,
    markdownUrlRaw
  };
}

function cssEscape(value) {
  return String(value).replace(/["\\]/g, "\\$&");
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

function pageRecord({ id, title, now, icon, path, bodyPath, url = "" }) {
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
    url,
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
