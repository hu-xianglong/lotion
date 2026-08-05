#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";

import { assertRealWorkspaceVisualArtifactContract } from "./lib/real-workspace-visual-artifacts.mjs";
import {
  assertRealWorkspaceSourceUnchanged,
  cleanupRealWorkspaceClone,
  cloneRealWorkspaceForSmoke
} from "./lib/real-workspace-clone.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  openPage,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const sourceRoot = process.env.LOTION_REAL_WORKSPACE_PATH
  || join(homedir(), "Documents", "Lotion Workspaces", "Lotion Demo Space");
const clone = await cloneRealWorkspaceForSmoke(sourceRoot, { prefix: "lotion-demo-visual-" });
let result;
let runError;
let safetyError;

try {
  result = await withLotionUIHarness("real-demo-workspace-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
    const viewports = [];
    await openWorkspace(clone.cloneRoot);
    await forEachViewport(page, selectedViewports(), async (viewport) => {
      const activeWorkspace = await readActiveWorkspaceEvidence(page, clone.cloneRoot);

      const homeStarted = performance.now();
      await openPage(page, "pg_home");
      await waitForPageTitle(page, "Home", 15_000);
      await page.getByText("Welcome to the Lotion demo space.").first().waitFor({ timeout: 15_000 });
      const homeOpenMs = Number((performance.now() - homeStarted).toFixed(1));
      await assertNoDocumentHorizontalOverflow(page, `real Demo home ${viewport.name}`, 8);
      const homeSnapshot = await captureElementSnapshot({
        artifactRoot,
        locator: page.locator("body"),
        metadata: { phase: "home", realWorkspace: true, viewport: viewport.name },
        name: `real-demo-home-${viewport.name}`,
        page,
        viewport
      });

      const databaseStarted = performance.now();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("lotion:open-entity", {
        detail: { kind: "database", entityId: "db_rows_500k" }
      })));
      await waitForPageTitle(page, "Rows Stress Lab · 500K", 60_000);
      const table = page.locator(".database-table:not(.embedded-table)").first();
      await table.waitFor({ timeout: 60_000 });
      const rowCount = table.locator(".table-row-count");
      await rowCount.waitFor({ timeout: 60_000 });
      await page.waitForFunction(() => (document.querySelector(".database-table:not(.embedded-table) .table-row-count")?.textContent || "").replaceAll(",", "").includes("500000"), null, { timeout: 60_000 });
      const databaseOpenMs = Number((performance.now() - databaseStarted).toFixed(1));
      await table.locator(".table-scroll").evaluate((element) => {
        element.scrollTop = Math.min(element.scrollHeight - element.clientHeight, Math.max(1_000, element.scrollHeight / 2));
        element.dispatchEvent(new Event("scroll", { bubbles: true }));
      });
      await page.waitForTimeout(250);
      const overflow = await assertNoDocumentHorizontalOverflow(page, `real Demo 500K database ${viewport.name}`, 8);
      const databaseState = await readDatabaseState(page, table, overflow);
      const databaseSnapshot = await captureElementSnapshot({
        artifactRoot,
        locator: page.locator("body"),
        metadata: { databaseState, phase: "database500k", realWorkspace: true, viewport: viewport.name },
        name: `real-demo-database-500k-${viewport.name}`,
        page,
        viewport
      });

      viewports.push({
        viewport: viewport.name,
        workspaceName: activeWorkspace.workspaceName,
        activeWorkspaceWasClone: activeWorkspace.activeWorkspaceWasClone,
        homeOpenMs,
        databaseOpenMs,
        databaseState,
        snapshots: { home: homeSnapshot, database500k: databaseSnapshot }
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
      viewports
    };
    summary.artifactContract = await assertRealWorkspaceVisualArtifactContract(summary, {
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
  throw new AggregateError([runError, safetyError].filter(Boolean), "Real Demo workspace visual smoke failed or source immutability was not proven.");
}
console.log(JSON.stringify(result, null, 2));

async function readActiveWorkspaceEvidence(page, cloneRoot) {
  return page.evaluate(async (expectedCloneRoot) => {
    const [manifest, recents] = await Promise.all([
      window.lotion.workspace.getManifest(),
      window.lotion.workspace.listRecent()
    ]);
    return {
      workspaceName: manifest.name,
      activeWorkspaceWasClone: recents[0]?.path === expectedCloneRoot
    };
  }, cloneRoot);
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

async function readDatabaseState(page, table, overflow) {
  return table.evaluate((element, documentMetrics) => {
    const scroll = element.querySelector(".table-scroll");
    const renderedRows = Array.from(element.querySelectorAll("tbody tr[data-row-id]"));
    const spacers = Array.from(element.querySelectorAll("tbody tr.virtual-spacer"));
    const width = Math.max(documentMetrics.bodyScrollWidth, documentMetrics.docScrollWidth);
    const allowed = Math.max(documentMetrics.bodyClientWidth, documentMetrics.docClientWidth, documentMetrics.innerWidth) + 8;
    return {
      rowCountText: element.querySelector(".table-row-count")?.textContent?.trim() || "",
      renderedRowCount: renderedRows.length,
      firstRenderedRowId: renderedRows[0]?.getAttribute("data-row-id") || "",
      virtualSpacerCount: spacers.length,
      virtualized: spacers.length > 0,
      tableScrollHeight: scroll?.scrollHeight || 0,
      tableClientHeight: scroll?.clientHeight || 0,
      tableScrollTop: scroll?.scrollTop || 0,
      documentHorizontalOverflowPx: Math.max(0, width - allowed)
    };
  }, overflow);
}
