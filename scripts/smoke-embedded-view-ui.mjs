#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";
import { assertEmbeddedViewArtifactContract } from "./lib/embedded-view-artifacts.mjs";
import { assertProductionVisualBaseline } from "./lib/production-visual-baseline.mjs";

const args = parseArgs(process.argv.slice(2));
const thresholdMs = Number(process.env.LOTION_EMBEDDED_VIEW_RENDER_THRESHOLD_MS ?? 1000);

const result = await withLotionUIHarness("embedded-view-ui", async ({ artifactRoot, cdpUrl, page, openWorkspace, registerTempWorkspace }) => {
  const results = [];
  const expectedViewports = selectedViewports();

  await forEachViewport(page, expectedViewports, async (viewport) => {
    for (const count of args.counts) {
      const fixture = await createEmbeddedFixture(count, args.rowsPerDatabase);
      registerTempWorkspace(fixture.root);
      await openWorkspace(fixture.root);
      await waitForPageService(page, [fixture.blankPageId, fixture.embeddedPageId]);
      await openPage(page, fixture.blankPageId);
      await page.getByText("Embedded Benchmark Blank").first().waitFor({ timeout: 8_000 });
      await assertNoDocumentHorizontalOverflow(page, `embedded blank ${viewport.name} count ${count}`);
      const started = await page.evaluate(() => performance.now());
      await openPage(page, fixture.embeddedPageId);
      await page.waitForFunction(
        (expected) => document.querySelectorAll(".embedded-table").length >= expected,
        count,
        { timeout: 15_000 }
      );
      const ended = await page.evaluate(() => performance.now());
      const rendered = await page.locator(".embedded-table").count();
      const firstTable = page.locator(".embedded-table").first();
      await assertIntersectsViewport(page, firstTable, `first embedded table ${viewport.name} count ${count}`, 4);
      await assertNoDocumentHorizontalOverflow(page, `embedded rendered ${viewport.name} count ${count}`);
      const columnOrder = count === args.counts[0]
        ? await assertEmbeddedDefaultColumnOrder(page)
        : null;
      const headerActions = count === args.counts[0]
        ? await assertEmbeddedHeaderActions(page, fixture, firstTable, viewport.name)
        : null;
      const pagination = count === args.counts[0] && args.rowsPerDatabase >= 120
        ? await assertEmbeddedTablePagination(page, fixture.databaseIds[0], args.rowsPerDatabase, viewport.name)
        : null;
      const visualSnapshot = count === args.counts[0] && pagination
        ? await captureEmbeddedTableSnapshot({
          artifactRoot,
          columnOrder,
          count,
          page,
          pagination,
          rowsPerDatabase: args.rowsPerDatabase,
          table: firstTable,
          viewport
        })
        : null;
      results.push({
        viewport: viewport.name,
        embeddedViews: count,
        rowsPerDatabase: args.rowsPerDatabase,
        renderMs: Number((ended - started).toFixed(1)),
        rendered,
        columnOrder,
        headerActions,
        pagination,
        visualSnapshot
      });
    }
  });

  const summary = {
    cdpUrl,
    status: "passed",
    thresholdMs,
    results
  };
  summary.artifactContract = await assertEmbeddedViewArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name),
    minTotalRows: Math.min(args.rowsPerDatabase, 120),
    requiredPerceptualBaselineViewportNames: process.env.LOTION_EMBEDDED_VIEW_SKIP_BASELINE === "1"
      ? []
      : expectedViewports.map((viewport) => viewport.name),
    renderThresholdMs: thresholdMs
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function waitForPageService(page, pageIds) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await page.waitForFunction(async (targetPageIds) => {
    const pages = await window.lotion.pages.list();
    const ids = new Set(pages.map((candidate) => candidate.id));
    return targetPageIds.every((pageId) => ids.has(pageId));
  }, pageIds, { timeout: 8_000 });
}

async function assertEmbeddedDefaultColumnOrder(page) {
  const headers = await page
    .locator(".embedded-table")
    .first()
    .locator("thead .field-header-name")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? "").filter(Boolean));
  const expected = ["Name", "Notes", "Score"];
  const actual = headers.slice(0, expected.length);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected fallback default column order ${expected.join(" > ")}, saw ${actual.join(" > ")}`);
  }
  return actual;
}

async function assertEmbeddedHeaderActions(page, fixture, table, viewportName) {
  const header = table.locator(".embedded-view-header").first();
  await header.waitFor({ timeout: 8_000 });
  await header.scrollIntoViewIfNeeded();
  const openButton = header.getByRole("button", { name: /^(open|打开)$/i }).first();
  const refreshButton = header.getByRole("button", { name: /refresh|refreshing|刷新|刷新中/i }).first();
  const settingsButton = header.getByRole("button", { name: /view settings|视图设置/i }).first();
  await openButton.waitFor({ timeout: 8_000 });
  await refreshButton.waitFor({ timeout: 8_000 });
  await settingsButton.waitFor({ timeout: 8_000 });

  const initial = await header.evaluate((node) => {
    const title = node.querySelector(".embedded-view-title-stack strong");
    const subtitle = node.querySelector(".embedded-view-subtitle");
    const buttons = Array.from(node.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        ariaLabel: button.getAttribute("aria-label") ?? "",
        disabled: button.disabled,
        height: Math.round(rect.height),
        text: (button.textContent ?? "").trim(),
        title: button.getAttribute("title") ?? "",
        type: button.getAttribute("type") ?? "",
        visible: rect.width > 0 && rect.height > 0,
        width: Math.round(rect.width),
        x: Math.round(rect.x),
        y: Math.round(rect.y)
      };
    });
    const headerRect = node.getBoundingClientRect();
    return {
      actionCount: buttons.length,
      buttons,
      headerHeight: Math.round(headerRect.height),
      subtitle: subtitle?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      title: title?.textContent?.trim() ?? ""
    };
  });
  if (initial.title !== "Embedded DB 1") {
    throw new Error(`Embedded header title mismatch: ${JSON.stringify(initial)}`);
  }
  if (!initial.subtitle.includes("All") || !/table|表格/i.test(initial.subtitle)) {
    throw new Error(`Embedded header subtitle mismatch: ${JSON.stringify(initial)}`);
  }
  const openMeta = initial.buttons.find((button) => /^(open|打开)$/i.test(button.text));
  const refreshMeta = initial.buttons.find((button) => /refresh|刷新/i.test(button.ariaLabel || button.title));
  const settingsMeta = initial.buttons.find((button) => /view settings|视图设置/i.test(button.ariaLabel || button.title));
  if (!openMeta?.visible || !refreshMeta?.visible || !settingsMeta?.visible) {
    throw new Error(`Embedded header actions missing visible controls: ${JSON.stringify(initial)}`);
  }
  for (const action of [openMeta, refreshMeta, settingsMeta]) {
    if (action.type !== "button" || action.height < 28) {
      throw new Error(`Embedded header action lost button semantics or hit target: ${JSON.stringify({ action, initial })}`);
    }
  }
  assertNonOverlappingButtonRow(initial.buttons, `embedded header actions ${viewportName}`);

  await settingsButton.focus();
  const settingsFocused = await settingsButton.evaluate((button) => document.activeElement === button);
  if (!settingsFocused) throw new Error(`Embedded Settings action is not keyboard focusable in ${viewportName}`);

  await refreshButton.click();
  await page.waitForFunction(
    () => !document.querySelector(".embedded-error") && !Array.from(document.querySelectorAll(".embedded-view-header-actions button"))
      .some((button) => button.disabled && /refresh|刷新/i.test(`${button.getAttribute("aria-label") ?? ""} ${button.getAttribute("title") ?? ""}`)),
    null,
    { timeout: 8_000 }
  );
  const refreshAfter = await refreshButton.evaluate((button) => ({
    disabled: button.disabled,
    ariaLabel: button.getAttribute("aria-label") ?? "",
    title: button.getAttribute("title") ?? ""
  }));

  const settingsMenuState = await openEmbeddedViewSettingsDialog(page, settingsButton);
  const settingsDialog = await page.locator(".view-dialog").first().evaluate((dialog) => ({
    ariaLabel: dialog.getAttribute("aria-label") ?? "",
    text: dialog.textContent ?? ""
  }));
  if (!/view settings|视图设置/i.test(settingsDialog.ariaLabel)) {
    throw new Error(`Embedded Settings did not open the view dialog: ${JSON.stringify(settingsDialog)}`);
  }
  await page.getByRole("button", { name: /cancel|取消/i }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });

  await openButton.click();
  await page.waitForFunction(
    (databaseId) => {
      const standalone = document.querySelector(".database-table:not(.embedded-table)");
      return Boolean(standalone && standalone.textContent?.includes("Embedded DB 1") && document.body.textContent?.includes(databaseId));
    },
    fixture.databaseIds[0],
    { timeout: 8_000 }
  ).catch(async () => {
    await page.getByText("Embedded DB 1").first().waitFor({ timeout: 8_000 });
  });
  const openResult = await page.evaluate((databaseId) => ({
    hasStandaloneDatabase: Boolean(document.querySelector(".database-table:not(.embedded-table)")),
    hasEmbeddedPageTitle: Boolean(Array.from(document.querySelectorAll("input, h1, .title-input"))
      .some((node) => (node.value ?? node.textContent ?? "").includes("Embedded Benchmark"))),
    textIncludesDatabaseId: document.body.textContent?.includes(databaseId) ?? false,
    textIncludesTitle: document.body.textContent?.includes("Embedded DB 1") ?? false
  }), fixture.databaseIds[0]);
  if (!openResult.hasStandaloneDatabase || !openResult.textIncludesTitle) {
    throw new Error(`Embedded Open action did not navigate to the source database: ${JSON.stringify(openResult)}`);
  }
  await openPage(page, fixture.embeddedPageId);
  await page.waitForFunction(
    () => document.querySelectorAll(".embedded-table").length >= 1,
    null,
    { timeout: 8_000 }
  );
  await assertNoDocumentHorizontalOverflow(page, `embedded header actions ${viewportName}`);

  return {
    title: initial.title,
    subtitle: initial.subtitle,
    actionCount: initial.actionCount,
    openButton: { text: openMeta.text, width: openMeta.width, height: openMeta.height },
    refreshButton: { ariaLabel: refreshMeta.ariaLabel, title: refreshMeta.title, width: refreshMeta.width, height: refreshMeta.height },
    settingsButton: { ariaLabel: settingsMeta.ariaLabel, title: settingsMeta.title, width: settingsMeta.width, height: settingsMeta.height },
    settingsFocused,
    refreshAfter,
    settingsMenu: {
      rootAriaLabel: settingsMenuState.root.ariaLabel,
      rootHasViewSettings: /view settings/i.test(settingsMenuState.root.text),
      viewAriaLabel: settingsMenuState.view.ariaLabel,
      viewHasLayout: /layout/i.test(settingsMenuState.view.text)
    },
    settingsDialog: {
      ariaLabel: settingsDialog.ariaLabel,
      hasRowsPerPage: /rows per page|每页行数/i.test(settingsDialog.text)
    },
    openResult,
    buttons: [openMeta, refreshMeta, settingsMeta].map((button) => ({
      ariaLabel: button.ariaLabel,
      height: button.height,
      text: button.text,
      title: button.title,
      type: button.type,
      visible: button.visible,
      width: button.width
    }))
  };
}

function assertNonOverlappingButtonRow(buttons, label) {
  const visible = buttons.filter((button) => button.visible).sort((a, b) => a.x - b.x);
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1];
    const current = visible[index];
    const horizontalGap = current.x - (previous.x + previous.width);
    const verticalOverlap = Math.min(previous.y + previous.height, current.y + current.height) - Math.max(previous.y, current.y);
    if (horizontalGap < 0 && verticalOverlap > 0) {
      throw new Error(`${label} overlap: ${JSON.stringify({ previous, current })}`);
    }
  }
}

async function createEmbeddedFixture(count, rowsPerDatabase) {
  const root = await mkdtemp(join(tmpdir(), `lotion-embedded-${count}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });

  const blankPageId = `pg_embedded_blank_${count}`;
  const embeddedPageId = `pg_embedded_page_${count}`;
  const blankTitle = "Embedded Benchmark Blank";
  const embeddedTitle = `Embedded Benchmark ${count}`;
  const blankPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(blankPageId, blankTitle));
  const embeddedPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(embeddedPageId, embeddedTitle));
  const databaseIds = Array.from({ length: count }, (_unused, index) => `db_embedded_${count}_${index}`);

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_embedded_${count}`,
    name: `Embedded Bench ${count}`,
    pages: [blankPageId, embeddedPageId],
    databases: databaseIds,
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: blankPageId,
      title: blankTitle,
      now,
      icon: "emoji:📄",
      path: ["Bench", blankTitle],
      bodyPath: blankPath
    }),
    pageRecord({
      id: embeddedPageId,
      title: embeddedTitle,
      now,
      icon: "emoji:📊",
      path: ["Bench", embeddedTitle],
      bodyPath: embeddedPath
    })
  ]);
  await writeFile(join(root, blankPath), `# ${blankTitle}\n\nThis page keeps the initial workspace load free of embedded views.\n`, "utf8");
  await writeFile(join(root, embeddedPath), embeddedMarkdown(embeddedTitle, databaseIds), "utf8");

  for (let index = 0; index < databaseIds.length; index += 1) {
    await createEmbeddedDatabase(root, databaseIds[index], `Embedded DB ${index + 1}`, rowsPerDatabase);
  }
  return { root, blankPageId, embeddedPageId, databaseIds };
}

async function assertEmbeddedTablePagination(page, databaseId, totalRows, viewportName) {
  const table = page.locator(".embedded-table").first();
  const defaultState = await waitForEmbeddedRowCount(page, table, 20, totalRows, "default embedded row limit");
  const settingsButton = table
    .locator(".embedded-view-header-actions")
    .getByRole("button", { name: /view settings|视图设置/i })
    .first();
  await openEmbeddedViewSettingsDialog(page, settingsButton);
  const pageSizeSelect = page
    .locator(".view-dialog label.form-row")
    .filter({ hasText: /rows per page|每页行数/i })
    .locator("select")
    .first();
  await pageSizeSelect.selectOption("50");
  await page.getByRole("button", { name: /save view|保存视图/i }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });
  const savedPageSize = await page.waitForFunction(
    async (targetDatabaseId) => {
      const bundle = await window.lotion.databases.get(targetDatabaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return view?.pageSize === 50 ? view.pageSize : false;
    },
    databaseId,
    { timeout: 8_000 }
  );
  const configuredState = await waitForEmbeddedRowCount(page, table, 50, totalRows, "embedded row limit after page size setting");
  const loadMoreAffordance = await assertEmbeddedLoadMoreAffordance(page, table, {
    shownRows: configuredState.shown,
    totalRows
  });
  await assertNoDocumentHorizontalOverflow(page, `embedded pagination ${viewportName}`);
  await table.getByRole("button", { name: /load 50 more|加载 50 行/i }).click();
  const loadedState = await waitForEmbeddedRowCount(page, table, 100, totalRows, "embedded load more");
  await assertNoDocumentHorizontalOverflow(page, `embedded load more ${viewportName}`);
  return {
    defaultShown: defaultState.shown,
    configuredShown: configuredState.shown,
    loadMoreShown: loadedState.shown,
    totalRows: loadedState.total,
    persistedPageSize: await savedPageSize.jsonValue(),
    loadMoreAffordance
  };
}

async function openEmbeddedViewSettingsDialog(page, settingsButton) {
  await settingsButton.click();
  const rootMenu = page.getByRole("menu", { name: "Database settings" }).first();
  await rootMenu.waitFor({ timeout: 8_000 });
  const root = await rootMenu.evaluate((menu) => ({
    ariaLabel: menu.getAttribute("aria-label") ?? "",
    text: menu.textContent ?? ""
  }));
  await rootMenu.getByRole("menuitem", { name: /^view settings/i }).click();
  const viewMenu = page.getByRole("menu", { name: "View settings menu" }).first();
  await viewMenu.waitFor({ timeout: 8_000 });
  const view = await viewMenu.evaluate((menu) => ({
    ariaLabel: menu.getAttribute("aria-label") ?? "",
    text: menu.textContent ?? ""
  }));
  await viewMenu.getByRole("menuitem", { name: /^layout/i }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  return { root, view };
}

async function waitForEmbeddedRowCount(page, table, expectedShown, expectedTotal, label) {
  const footer = table.locator(".table-row-count").first();
  let lastText = "";
  for (let attempt = 0; attempt < 60; attempt += 1) {
    lastText = (await footer.textContent({ timeout: 2_000 }))?.trim() ?? "";
    const parsed = parseRowCountText(lastText);
    if (parsed && parsed.shown === expectedShown && parsed.total === expectedTotal) return parsed;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not reach ${expectedShown}/${expectedTotal}; last row count text: ${lastText}`);
}

async function assertEmbeddedLoadMoreAffordance(page, table, { shownRows, totalRows }) {
  const footer = table.locator(".table-footer").first();
  const button = footer.locator(".table-load-more").first();
  const rowCount = footer.locator(".table-row-count").first();
  await button.waitFor({ timeout: 8_000 });
  await rowCount.waitFor({ timeout: 8_000 });
  await button.scrollIntoViewIfNeeded();

  const roleButton = footer.getByRole("button", { name: /load 50 more|加载 50 行/i }).first();
  if (!(await roleButton.isVisible())) {
    throw new Error("Embedded load-more control is not exposed as a visible button.");
  }

  const [buttonText, iconText, rowCountText, nestedRowCountCount, buttonBox, rowCountBox, buttonMetrics] = await Promise.all([
    button.textContent(),
    button.locator(".table-load-more-icon").textContent(),
    rowCount.textContent(),
    button.locator(".table-row-count").count(),
    button.boundingBox(),
    rowCount.boundingBox(),
    button.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        tagName: node.tagName.toLowerCase(),
        type: node.getAttribute("type"),
        display: styles.display,
        alignItems: styles.alignItems,
        cursor: styles.cursor,
        fontWeight: styles.fontWeight,
        minHeight: styles.minHeight,
        borderRadius: styles.borderRadius,
        borderTopWidth: styles.borderTopWidth,
        backgroundColor: styles.backgroundColor,
        color: styles.color
      };
    })
  ]);

  if (!buttonBox || !rowCountBox) throw new Error("Embedded load-more affordance did not produce stable geometry.");
  if ((iconText ?? "").trim() !== "+") throw new Error(`Expected load-more plus marker, saw ${JSON.stringify(iconText)}`);
  if (!/load\s+50\s+more|加载\s*50\s*行/i.test(buttonText ?? "")) {
    throw new Error(`Expected stronger load-more label, saw ${JSON.stringify(buttonText)}`);
  }
  if (nestedRowCountCount !== 0) throw new Error("Row count should be secondary text beside the load-more button, not inside it.");
  const parsed = parseRowCountText((rowCountText ?? "").trim());
  if (!parsed || parsed.shown !== shownRows || parsed.total !== totalRows) {
    throw new Error(`Expected secondary row count ${shownRows}/${totalRows}, saw ${JSON.stringify(rowCountText)}`);
  }
  if (buttonMetrics.tagName !== "button" || buttonMetrics.type !== "button") {
    throw new Error(`Load-more control lost button semantics: ${JSON.stringify(buttonMetrics)}`);
  }
  if (!["inline-flex", "flex"].includes(buttonMetrics.display) || buttonMetrics.alignItems !== "center") {
    throw new Error(`Load-more control lost pill layout: ${JSON.stringify(buttonMetrics)}`);
  }
  if (buttonMetrics.cursor !== "pointer") {
    throw new Error(`Load-more control does not advertise clickability: ${JSON.stringify(buttonMetrics)}`);
  }
  if (Number.parseFloat(buttonMetrics.minHeight) < 28 || Number.parseFloat(buttonMetrics.borderTopWidth) < 1) {
    throw new Error(`Load-more control lost visible button affordance: ${JSON.stringify(buttonMetrics)}`);
  }
  if (!Number.isFinite(Number.parseInt(buttonMetrics.fontWeight, 10)) || Number.parseInt(buttonMetrics.fontWeight, 10) < 550) {
    throw new Error(`Load-more label weight is too weak: ${JSON.stringify(buttonMetrics)}`);
  }

  const horizontalGap = rowCountBox.x - (buttonBox.x + buttonBox.width);
  const verticalOverlap = Math.min(buttonBox.y + buttonBox.height, rowCountBox.y + rowCountBox.height) - Math.max(buttonBox.y, rowCountBox.y);
  if (horizontalGap < 4 || verticalOverlap <= 0) {
    throw new Error(`Load-more button and secondary row count overlap or are unstable: ${JSON.stringify({ buttonBox, rowCountBox })}`);
  }

  await button.focus();
  const isFocused = await button.evaluate((node) => document.activeElement === node);
  if (!isFocused) throw new Error("Embedded load-more button is not focusable for keyboard users.");

  await button.hover();
  const hoverMetrics = await button.evaluate((node) => {
    const styles = getComputedStyle(node);
    return {
      borderColor: styles.borderColor,
      backgroundColor: styles.backgroundColor,
      color: styles.color
    };
  });

  return {
    buttonText: (buttonText ?? "").trim(),
    iconText: (iconText ?? "").trim(),
    rowCountText: (rowCountText ?? "").trim(),
    horizontalGap: Number(horizontalGap.toFixed(1)),
    buttonMetrics,
    hoverMetrics
  };
}

async function captureEmbeddedTableSnapshot({
  artifactRoot,
  columnOrder,
  count,
  page,
  pagination,
  rowsPerDatabase,
  table,
  viewport
}) {
  await page.mouse.move(Math.max(1, viewport.width - 2), Math.max(1, viewport.height - 2));
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await table.evaluate((node) => node.scrollIntoView({ block: "start", inline: "nearest" }));
  await page.waitForFunction(
    () => Boolean(document.querySelector('.embedded-table tbody tr[data-row-id="row_0"]')),
    null,
    { timeout: 8_000 }
  );
  await prepareEmbeddedBaselineCapture(page, table);
  try {
    const completeSurfaceState = await collectEmbeddedSurfaceState(table);
    assertCompleteEmbeddedSurfaceState(completeSurfaceState, viewport.name);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: table,
      metadata: {
        phase: "embedded-table",
        completeSurfaceState,
        embeddedViews: count,
        rowsPerDatabase,
        columnOrder,
        pagination
      },
      name: `embedded-table-${count}-${viewport.name}`,
      page,
      viewport
    });
    const baselinePolicy = {
      compact: "test/baselines/production-visual/embedded-view-table-compact.json",
      desktop: "test/baselines/production-visual/embedded-view-table-desktop.json",
      wide: "test/baselines/production-visual/embedded-view-table-wide.json"
    }[viewport.name];
    const perceptualBaseline = baselinePolicy && process.env.LOTION_EMBEDDED_VIEW_SKIP_BASELINE !== "1"
      ? await assertProductionVisualBaseline({
        actualPath: snapshot.imagePath,
        artifactRoot,
        policyPath: baselinePolicy
      })
      : null;
    return {
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      height: Number(snapshot.rect.height.toFixed(1)),
      width: Number(snapshot.rect.width.toFixed(1)),
      completeSurfaceState,
      perceptualBaseline
    };
  } finally {
    await restoreEmbeddedBaselineCapture(page, table);
  }
}

async function prepareEmbeddedBaselineCapture(page, table) {
  await table.evaluate((node) => {
    node.setAttribute("data-embedded-baseline-capture", "true");
    node.setAttribute("data-embedded-baseline-translate", node.style.translate);
    const rect = node.getBoundingClientRect();
    node.style.translate = `${Math.round(rect.left) - rect.left}px ${Math.round(rect.top) - rect.top}px`;
    for (const row of Array.from(node.querySelectorAll("tbody tr[data-row-id]")).slice(8)) {
      row.setAttribute("data-embedded-baseline-hidden", "true");
    }
  });
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-embedded-baseline-capture-style", "true");
    style.textContent = `
      [data-embedded-baseline-capture] .virtual-spacer {
        display: none !important;
        height: 0 !important;
      }
      [data-embedded-baseline-capture] [data-embedded-baseline-hidden] {
        display: none !important;
      }
      [data-embedded-baseline-capture],
      [data-embedded-baseline-capture] *,
      [data-embedded-baseline-capture] *::before,
      [data-embedded-baseline-capture] *::after {
        -webkit-font-smoothing: antialiased !important;
        animation: none !important;
        caret-color: transparent !important;
        font-feature-settings: normal !important;
        font-kerning: none !important;
        font-optical-sizing: none !important;
        font-variant-ligatures: none !important;
        text-rendering: geometricPrecision !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(100);
  await table.screenshot({ animations: "disabled", caret: "hide" });
  await page.waitForTimeout(100);
}

async function restoreEmbeddedBaselineCapture(page, table) {
  await table.evaluate((node) => {
    node.removeAttribute("data-embedded-baseline-capture");
    node.style.translate = node.getAttribute("data-embedded-baseline-translate") ?? "";
    node.removeAttribute("data-embedded-baseline-translate");
    for (const row of node.querySelectorAll("[data-embedded-baseline-hidden]")) {
      row.removeAttribute("data-embedded-baseline-hidden");
    }
  });
  await page.evaluate(() => {
    for (const style of document.querySelectorAll("[data-embedded-baseline-capture-style]")) style.remove();
  });
}

async function collectEmbeddedSurfaceState(table) {
  return table.evaluate((surface) => {
    const rect = (node) => {
      if (!(node instanceof Element)) return null;
      const box = node.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    };
    const state = (node) => {
      if (!(node instanceof Element)) return { opacity: 0, visibility: "" };
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), visibility: style.visibility };
    };
    const header = surface.querySelector(".embedded-view-header");
    const title = header?.querySelector(".embedded-view-title-stack strong");
    const subtitle = header?.querySelector(".embedded-view-subtitle");
    const open = header?.querySelector(".embedded-view-header-actions > button:not(.toolbar-icon)");
    const refresh = header?.querySelector('button[aria-label="Refresh"]');
    const settings = header?.querySelector('button[aria-label="View settings"]');
    const tabs = surface.querySelector(".view-tabs-bar");
    const stickyHeader = surface.querySelector(".table-sticky-header");
    const body = surface.querySelector(".table-scroll");
    const summary = surface.querySelector(".table-summary-scroll");
    const footer = surface.querySelector(".table-footer");
    const loadMore = footer?.querySelector(".table-load-more");
    const rowCount = footer?.querySelector(".table-row-count");
    const dataRows = Array.from(surface.querySelectorAll("tbody tr[data-row-id]"))
      .filter((row) => getComputedStyle(row).display !== "none");
    const surfaceState = state(surface);
    const headerState = state(header);
    const footerState = state(footer);
    return {
      surfaceRect: rect(surface),
      headerRect: rect(header),
      titleRect: rect(title),
      subtitleRect: rect(subtitle),
      openRect: rect(open),
      refreshRect: rect(refresh),
      settingsRect: rect(settings),
      tabsRect: rect(tabs),
      stickyHeaderRect: rect(stickyHeader),
      bodyRect: rect(body),
      summaryRect: rect(summary),
      footerRect: rect(footer),
      loadMoreRect: rect(loadMore),
      rowCountRect: rect(rowCount),
      firstRowRect: rect(dataRows[0]),
      lastRowRect: rect(dataRows.at(-1)),
      firstRowText: dataRows[0]?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      lastRowText: dataRows.at(-1)?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      renderedDataRowCount: dataRows.length,
      virtualSpacerCount: surface.querySelectorAll(".virtual-spacer").length,
      titleText: title?.textContent?.trim() ?? "",
      subtitleText: subtitle?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      loadMoreText: loadMore?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      rowCountText: rowCount?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      surfaceVisibility: surfaceState.visibility,
      surfaceOpacity: surfaceState.opacity,
      headerVisibility: headerState.visibility,
      headerOpacity: headerState.opacity,
      footerVisibility: footerState.visibility,
      footerOpacity: footerState.opacity,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentHorizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  });
}

function assertCompleteEmbeddedSurfaceState(state, viewportName) {
  for (const key of [
    "surfaceRect",
    "headerRect",
    "titleRect",
    "subtitleRect",
    "openRect",
    "refreshRect",
    "settingsRect",
    "tabsRect",
    "stickyHeaderRect",
    "bodyRect",
    "summaryRect",
    "footerRect",
    "loadMoreRect",
    "rowCountRect",
    "firstRowRect",
    "lastRowRect"
  ]) {
    if (!positiveRect(state?.[key])) {
      throw new Error(`Embedded baseline capture missing ${key} for ${viewportName}: ${JSON.stringify(state?.[key])}`);
    }
  }
  if (
    state.titleText !== "Embedded DB 1"
    || !state.subtitleText.includes("All")
    || !state.firstRowText.includes("Row 0")
    || state.renderedDataRowCount < 4
    || !/load\s+50\s+more|加载\s*50\s*行/i.test(state.loadMoreText)
    || !/100\s+of\s+500|共\s*500\s*行.*100/i.test(state.rowCountText)
    || state.surfaceVisibility !== "visible"
    || state.headerVisibility !== "visible"
    || state.footerVisibility !== "visible"
    || state.surfaceOpacity < 0.99
    || state.headerOpacity < 0.99
    || state.footerOpacity < 0.99
    || state.documentHorizontalOverflow > 2
    || !insideViewport(state.surfaceRect, state.viewport)
  ) {
    throw new Error(`Embedded baseline capture is incomplete, hidden, or offscreen for ${viewportName}: ${JSON.stringify(state)}`);
  }
  for (const [ownerName, owner, children] of [
    ["surface", state.surfaceRect, [
      state.headerRect,
      state.tabsRect,
      state.stickyHeaderRect,
      state.bodyRect,
      state.summaryRect,
      state.footerRect
    ]],
    ["header", state.headerRect, [
      state.titleRect,
      state.subtitleRect,
      state.openRect,
      state.refreshRect,
      state.settingsRect
    ]],
    ["body", state.bodyRect, [state.firstRowRect, state.lastRowRect]],
    ["footer", state.footerRect, [state.loadMoreRect, state.rowCountRect]]
  ]) {
    if (children.some((child) => !containsRect(owner, child))) {
      throw new Error(`Embedded baseline capture has a child escaping ${ownerName} for ${viewportName}: ${JSON.stringify({ owner, children })}`);
    }
  }
  if (overlaps(state.loadMoreRect, state.rowCountRect)) {
    throw new Error(`Embedded baseline Load more overlaps row count for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

function positiveRect(rect) {
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function containsRect(outer, inner, tolerance = 1) {
  return Boolean(outer && inner
    && inner.left >= outer.left - tolerance
    && inner.top >= outer.top - tolerance
    && inner.right <= outer.right + tolerance
    && inner.bottom <= outer.bottom + tolerance);
}

function insideViewport(rect, viewport, tolerance = 1) {
  return Boolean(rect && viewport
    && rect.left >= -tolerance
    && rect.top >= -tolerance
    && rect.right <= viewport.width + tolerance
    && rect.bottom <= viewport.height + tolerance);
}

function overlaps(left, right, tolerance = 1) {
  return Boolean(left && right
    && left.right > right.left + tolerance
    && left.left < right.right - tolerance
    && left.bottom > right.top + tolerance
    && left.top < right.bottom - tolerance);
}

function parseRowCountText(text) {
  const en = text.match(/([\d,]+)\s+of\s+([\d,]+)\s+rows/i);
  if (en) {
    return {
      shown: Number(en[1].replaceAll(",", "")),
      total: Number(en[2].replaceAll(",", ""))
    };
  }
  const zh = text.match(/共\s*([\d,]+)\s*行\s*,?\s*当前显示\s*([\d,]+)\s*行/);
  if (zh) {
    return {
      shown: Number(zh[2].replaceAll(",", "")),
      total: Number(zh[1].replaceAll(",", ""))
    };
  }
  return null;
}

async function createEmbeddedDatabase(root, databaseId, databaseName, rows) {
  const now = "2026-01-01T00:00:00.000Z";
  const dir = join(root, "databases", "user", databaseFolderName(databaseId, databaseName));
  await mkdir(join(dir, "views"), { recursive: true });
  await mkdir(join(dir, "pages"), { recursive: true });
  await writeJson(join(dir, "schema.json"), {
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
      { id: "notes", name: "Notes", type: "text" },
      { id: "score", name: "Score", type: "number" }
    ]
  });
  await writeCsv(
    join(dir, "data.csv"),
    ["id", "created_time", "updated_time", "title", "page_file", "notes", "score"],
    Array.from({ length: rows }, (_unused, index) => ({
      id: `row_${index}`,
      created_time: now,
      updated_time: now,
      title: `Row ${index}`,
      page_file: "",
      notes: `Embedded row ${index}`,
      score: index % 100
    }))
  );
}

function embeddedMarkdown(title, databaseIds) {
  const blocks = databaseIds.map((databaseId) =>
    "```lotion-view\n" +
    `database: ${databaseId}\n` +
    `view: ${DEFAULT_VIEW_ID}\n` +
    "```"
  );
  return [`# ${title}`, "", ...blocks].join("\n\n");
}

function parseArgs(argv) {
  const parsed = {
    counts: (process.env.LOTION_EMBEDDED_VIEW_COUNTS ?? "1,3,10")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0),
    rowsPerDatabase: Number(process.env.LOTION_EMBEDDED_VIEW_ROWS ?? 500)
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--counts") {
      parsed.counts = parseCounts(value);
      index += 1;
    } else if (arg.startsWith("--counts=")) {
      parsed.counts = parseCounts(arg.slice("--counts=".length));
    } else if (arg === "--rows-per-database") {
      parsed.rowsPerDatabase = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--rows-per-database=")) {
      parsed.rowsPerDatabase = numberArg("--rows-per-database", arg.slice("--rows-per-database=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.counts.length === 0 || parsed.rowsPerDatabase < 1) {
    throw new Error(`Invalid embedded view benchmark options: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function parseCounts(raw) {
  if (!raw) throw new Error("--counts requires a value");
  const counts = raw.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
  if (counts.length === 0) throw new Error(`Invalid --counts value: ${raw}`);
  return counts.map((count) => Math.floor(count));
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
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
