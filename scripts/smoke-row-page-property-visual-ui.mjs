#!/usr/bin/env node
import {
  assertNoDocumentHorizontalOverflow,
  assertHarnessViewportCoverage,
  forEachViewport,
  openRowPage,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";
import {
  assertRowPagePropertyVisuals,
  createRowPagePropertyVisualFixture,
  expandPageDetailsPanel
} from "./lib/row-page-property-visual-harness.mjs";
import { assertRowPagePropertyVisualArtifactContract } from "./lib/row-page-property-visual-artifacts.mjs";

const result = await withLotionUIHarness("row-page-property-visual", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  const expectedViewports = selectedViewports();
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createRowPagePropertyVisualFixture(viewport.name);
    await openWorkspace(fixture.root);
    await openRowPage(page, fixture.databaseId, fixture.rowId);
    await page.waitForFunction(
      (title) => document.querySelector(".title-input")?.value === title,
      fixture.rowTitle,
      { timeout: 8_000 }
    );
    await expandPageDetailsPanel(page);
    await assertNoDocumentHorizontalOverflow(page, `row-property visual opened ${viewport.name}`, 2);
    const propertyVisuals = await assertRowPagePropertyVisuals({ artifactRoot, fixture, page, viewport });
    viewports.push({
      viewport: viewport.name,
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle,
      propertyVisuals
    });
  });
  const summary = {
    cdpUrl,
    status: "passed",
    viewports
  };
  return {
    ...summary,
    artifactContract: await assertRowPagePropertyVisualArtifactContract(summary, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    }),
    viewportCoverage: assertHarnessViewportCoverage(summary)
  };
});

console.log(JSON.stringify(result, null, 2));
