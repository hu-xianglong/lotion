#!/usr/bin/env node
import {
  assertNoDocumentHorizontalOverflow,
  assertIntersectsViewport,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  reloadRendererPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { createStartupWorkspaceFixture } from "./startup-workspace-fixture.mjs";

const STARTUP_DELAY_MS = 180;

await withLotionUIHarness("first-launch-ui", async ({ artifactRoot, cdpUrl, consoleMessages, page, registerTempWorkspace }) => {
  const viewportResults = [];
  for (const viewport of selectedViewports()) {
    await forEachViewport(page, [viewport], async () => {
      const fixture = await createStartupWorkspaceFixture({
        name: viewport.name,
        pageCount: viewport.name === "compact" ? 60 : 90,
        databaseCount: 3,
        rowsPerDatabase: viewport.name === "compact" ? 120 : 180
      });
      registerTempWorkspace(fixture.root);

      await page.evaluate(async ({ root, delayMs }) => {
        await window.lotion.workspace.open(root);
        window.localStorage.setItem("lotion.debug.startupPhaseDelayMs", String(delayMs));
      }, { root: fixture.root, delayMs: STARTUP_DELAY_MS });
      consoleMessages.length = 0;

      await reloadRendererPage(page);
      await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 15_000 });

      const loading = page.locator("[data-testid='startup-loading']");
      await loading.waitFor({ state: "visible", timeout: 60_000 });
      const startedAt = await page.evaluate(() => performance.now());
      await assertWithinViewport(page, loading, `startup loading screen ${viewport.name}`, 4);
      await assertNoDocumentHorizontalOverflow(page, `startup loading screen ${viewport.name}`, 2);
      await page.waitForFunction(() => {
        const phases = Array.from(document.querySelectorAll("[data-startup-phase]"));
        return phases.length === 4 &&
          phases.filter((phase) => ["active", "done"].includes(phase.getAttribute("data-status") ?? "")).length >= 2;
      }, null, { timeout: 8_000 });
      const loadingText = await loading.textContent();
      for (const expected of ["Opening workspace", "Reading workspace index", "Restoring page", "Painting editor"]) {
        if (!loadingText?.includes(expected)) {
          throw new Error(`Startup loading screen missing phase ${expected} in ${viewport.name}: ${loadingText}`);
        }
      }

      const startupReport = page.locator("[data-testid='startup-performance']");
      await startupReport.waitFor({ state: "visible", timeout: 20_000 });
      await assertWithinViewport(page, startupReport, `startup performance report ${viewport.name}`, 4);
      await assertNoDocumentHorizontalOverflow(page, `startup performance report ${viewport.name}`, 2);
      await assertStartupReport(page, viewport.name, fixture);
      await captureElementSnapshot({
        artifactRoot,
        locator: startupReport,
        name: `startup-performance-${viewport.name}-first`,
        page,
        viewport
      });

      const restoredTab = page.locator("[role='tab']").filter({ hasText: fixture.targetTitle }).first();
      await restoredTab.click();
      await page.waitForFunction(
        (title) => document.querySelector(".title-input")?.value === title,
        fixture.targetTitle,
        { timeout: 20_000 }
      );
      const editorShell = page.locator("[data-testid='markdown-editor']").first();
      await editorShell.waitFor({ state: "visible", timeout: 10_000 });
      await assertIntersectsViewport(page, editorShell, `startup editor shell ${viewport.name}`, 8);
      await assertNoDocumentHorizontalOverflow(page, `startup loaded page ${viewport.name}`, 2);

      const editMarker = `First launch editor ready ${viewport.name}`;
      const editor = page.locator(".cm-content").first();
      await editor.click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type(editMarker);
      await waitForPageMarkdown(page, fixture.targetPageId, editMarker, `first-launch editor persistence ${viewport.name}`);

      const startupTab = page.locator("[data-tab-kind='startup']").first();
      await startupTab.click();
      await startupReport.waitFor({ state: "visible", timeout: 10_000 });
      await assertStartupReport(page, `${viewport.name} diagnostics reselect`, fixture);

      const sidebarPageTitle = "Startup Fixture Page 1";
      const sidebarPage = page.locator(".nav-page-tree-row")
        .filter({ hasText: sidebarPageTitle })
        .locator(".nav-page-tree-main")
        .first();
      await sidebarPage.click();
      await page.waitForFunction(
        (title) => document.querySelector(".title-input")?.value === title,
        sidebarPageTitle,
        { timeout: 20_000 }
      );
      await assertStartupTabPreserved(page, `${viewport.name} sidebar navigation`);

      await startupTab.click();
      await startupReport.waitFor({ state: "visible", timeout: 10_000 });
      await assertStartupReport(page, `${viewport.name} diagnostics after sidebar navigation`, fixture);
      const restoredSidebarPage = page.locator(".nav-page-tree-row")
        .filter({ hasText: fixture.targetTitle })
        .locator(".nav-page-tree-main")
        .first();
      await restoredSidebarPage.click();
      await page.waitForFunction(
        (title) => document.querySelector(".title-input")?.value === title,
        fixture.targetTitle,
        { timeout: 20_000 }
      );

      const elapsedMs = await page.evaluate((start) => Number((performance.now() - start).toFixed(1)), startedAt);
      const phases = await page.evaluate(() => window.__lotionStartupPhases ?? []);
      if (phases.length !== 4 || phases.some((phase) => phase.status !== "done")) {
        throw new Error(`Startup phases should finish after first launch in ${viewport.name}: ${JSON.stringify(phases)}`);
      }
      if (phases.some((phase) => typeof phase.ms !== "number" || phase.ms <= 0)) {
        throw new Error(`Startup phases should expose positive timings in ${viewport.name}: ${JSON.stringify(phases)}`);
      }

      await page.evaluate(() => window.localStorage.removeItem("lotion.debug.startupPhaseDelayMs"));
      await reloadRendererPage(page);
      const secondStartupReport = page.locator("[data-testid='startup-performance']");
      await secondStartupReport.waitFor({ state: "visible", timeout: 20_000 });
      await assertStartupReport(page, `${viewport.name} second reload`, fixture);
      await captureElementSnapshot({
        artifactRoot,
        locator: secondStartupReport,
        name: `startup-performance-${viewport.name}-second`,
        page,
        viewport
      });
      const restoredPageTab = page.locator("[role='tab']").filter({ hasText: fixture.targetTitle }).first();
      if (await restoredPageTab.count() !== 1) {
        throw new Error(`Second reload should preserve the restored page tab in ${viewport.name}`);
      }
      assertNoBrowserErrors(consoleMessages, viewport.name);
      viewportResults.push({
        viewport: viewport.name,
        elapsedMs,
        fixture: {
          pages: fixture.pageCount,
          databases: fixture.databaseCount,
          rowsPerDatabase: fixture.rowsPerDatabase
        },
        phases
      });
    });
  }

  console.log(JSON.stringify({
    cdpUrl,
    viewports: viewportResults,
    status: "passed"
  }, null, 2));
});

async function assertStartupTabPreserved(page, label) {
  const result = await page.evaluate(() => ({
    startupTabs: document.querySelectorAll("[data-tab-kind='startup']").length,
    activeStartupTabs: document.querySelectorAll("[data-tab-kind='startup'].active").length
  }));
  if (result.startupTabs !== 1 || result.activeStartupTabs !== 0) {
    throw new Error(`Startup diagnostics should stay pinned but inactive after ${label}: ${JSON.stringify(result)}`);
  }
}

async function assertStartupReport(page, label, fixture) {
  const result = await page.evaluate(() => {
    const report = window.__lotionStartupReport;
    const storedTabs = JSON.parse(window.localStorage.getItem("lotion.tabs") ?? '{"tabs":[]}');
    return {
      report,
      startupTabs: document.querySelectorAll("[data-tab-kind='startup']").length,
      activeStartupTabs: document.querySelectorAll("[data-tab-kind='startup'].active").length,
      persistedStartupTabs: storedTabs.tabs.filter((tab) => tab.item?.type === "startup").length
    };
  });
  if (result.startupTabs !== 1 || result.activeStartupTabs !== 1) {
    throw new Error(`Startup diagnostics should open exactly once and be selected in ${label}: ${JSON.stringify(result)}`);
  }
  if (result.persistedStartupTabs !== 0) {
    throw new Error(`Startup diagnostics must not persist in ${label}: ${JSON.stringify(result)}`);
  }
  if (!result.report || result.report.phases.length !== 4 || result.report.indexOperations.length !== 4) {
    throw new Error(`Startup report is incomplete in ${label}: ${JSON.stringify(result.report)}`);
  }
  const operationKeys = result.report.indexOperations.map((operation) => operation.key).sort();
  const expectedKeys = ["favorites", "recents", "workspaceIndex", "workspacePath"];
  if (JSON.stringify(operationKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error(`Startup report operation split is incomplete in ${label}: ${JSON.stringify(operationKeys)}`);
  }
  if (result.report.workspace.pages !== fixture.pageCount || result.report.workspace.databases !== fixture.databaseCount) {
    throw new Error(`Startup report workspace counts are wrong in ${label}: ${JSON.stringify(result.report.workspace)}`);
  }
  if (!result.report.cache || !["hit", "rebuilt"].includes(result.report.cache.status)) {
    throw new Error(`Startup report cache diagnostics are missing in ${label}: ${JSON.stringify(result.report)}`);
  }
  if (result.report.totalMs <= 0 || result.report.indexOperations.some((operation) => operation.ms < 0)) {
    throw new Error(`Startup report timings are invalid in ${label}: ${JSON.stringify(result.report)}`);
  }
  if (result.report.indexOperations.some((operation) => typeof operation.count !== "number" || !operation.countKind)) {
    throw new Error(`Startup report operation counts are incomplete in ${label}: ${JSON.stringify(result.report.indexOperations)}`);
  }
}

function assertNoBrowserErrors(consoleMessages, viewportName) {
  const failures = consoleMessages.filter((message) => (
    message.startsWith("[pageerror]") ||
    message.startsWith("[error]")
  ));
  if (failures.length > 0) {
    throw new Error(`Unexpected browser errors during first-launch smoke ${viewportName}:\n${failures.join("\n")}`);
  }
}
