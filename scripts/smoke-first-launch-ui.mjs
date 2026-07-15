#!/usr/bin/env node
import {
  assertNoDocumentHorizontalOverflow,
  assertIntersectsViewport,
  assertWithinViewport,
  forEachViewport,
  reloadRendererPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { createStartupWorkspaceFixture } from "./startup-workspace-fixture.mjs";

const STARTUP_DELAY_MS = 180;

await withLotionUIHarness("first-launch-ui", async ({ cdpUrl, consoleMessages, page, registerTempWorkspace }) => {
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

      const elapsedMs = await page.evaluate((start) => Number((performance.now() - start).toFixed(1)), startedAt);
      const phases = await page.evaluate(() => window.__lotionStartupPhases ?? []);
      if (phases.length !== 4 || phases.some((phase) => phase.status !== "done")) {
        throw new Error(`Startup phases should finish after first launch in ${viewport.name}: ${JSON.stringify(phases)}`);
      }
      if (phases.some((phase) => typeof phase.ms !== "number" || phase.ms <= 0)) {
        throw new Error(`Startup phases should expose positive timings in ${viewport.name}: ${JSON.stringify(phases)}`);
      }

      await page.evaluate(() => window.localStorage.removeItem("lotion.debug.startupPhaseDelayMs"));
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

function assertNoBrowserErrors(consoleMessages, viewportName) {
  const failures = consoleMessages.filter((message) => (
    message.startsWith("[pageerror]") ||
    message.startsWith("[error]")
  ));
  if (failures.length > 0) {
    throw new Error(`Unexpected browser errors during first-launch smoke ${viewportName}:\n${failures.join("\n")}`);
  }
}
