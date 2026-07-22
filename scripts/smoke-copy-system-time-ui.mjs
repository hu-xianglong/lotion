#!/usr/bin/env node
import assert from "node:assert/strict";

import {
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  setLotionLocale,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { createStartupWorkspaceFixture } from "./startup-workspace-fixture.mjs";

const result = await withLotionUIHarness("copy-system-time-ui", async ({ artifactRoot, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createStartupWorkspaceFixture({
      name: `copy-system-time-${viewport.name}`,
      pageCount: 1,
      databaseCount: 1,
      rowsPerDatabase: 4,
      extraDatabaseFields: [{
        id: "imported_date",
        name: "Imported date",
        type: "date",
        values: ["2026-07-08", "July 10, 2026 9:30 AM", "", "not-a-date"]
      }]
    });
    await openWorkspace(fixture.root);
    await setLotionLocale(page, "en");
    await page.locator(".main-content").waitFor({ timeout: 8_000 });
    await page.waitForFunction(() => Boolean(window.lotion?.databases), null, { timeout: 8_000 });
    viewports.push(await runCopySystemTimeSmoke({ artifactRoot, fixture, page, viewport }));
  });
  return { status: "passed", viewports };
});

console.log(JSON.stringify(result, null, 2));

async function runCopySystemTimeSmoke({ artifactRoot, fixture, page, viewport }) {
  const databaseId = fixture.databaseIds[0];
  const prepared = await page.evaluate(async (targetDatabaseId) => {
    const bundle = await window.lotion.databases.get(targetDatabaseId);
    const sourceField = bundle.schema.fields.find((field) => field.name === "Imported date");
    if (!sourceField) throw new Error("Imported date fixture field is missing");
    const sourceValues = bundle.records.map((record) => String(record[sourceField.id] ?? ""));
    const originalCreatedTimes = bundle.records.map((record) => String(record.created_time));
    return {
      sourceFieldId: sourceField.id,
      sourceValues,
      originalCreatedTimes,
      databaseName: bundle.schema.name
    };
  }, databaseId);

  const sourceHeader = await openDatabaseAndWaitForField({
    databaseId,
    databaseName: prepared.databaseName,
    fieldName: "Imported date",
    page
  });

  await sourceHeader.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Imported date column menu" });
  await menu.waitFor({ timeout: 8_000 });
  await menu.getByRole("menuitem", { name: "Copy to Created time" }).waitFor();
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: menu,
    metadata: { phase: "copy-system-time", target: "created_time", viewport: viewport.name },
    name: `copy-system-time-column-menu-${viewport.name}`,
    page,
    viewport
  });

  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await menu.getByRole("menuitem", { name: "Copy to Created time" }).click();
  const resultMessage = menu.locator(".field-context-menu-result");
  await resultMessage.getByText(/Copied 2 rows; 0 unchanged; skipped 1 empty and 1 invalid value/).waitFor({ timeout: 8_000 });

  const persisted = await page.evaluate(async ({ targetDatabaseId, sourceFieldId }) => {
    const bundle = await window.lotion.databases.get(targetDatabaseId);
    return bundle.records.map((record) => ({
      createdTime: String(record.created_time),
      sourceValue: String(record[sourceFieldId] ?? "")
    }));
  }, { targetDatabaseId: databaseId, sourceFieldId: prepared.sourceFieldId });

  assert.deepEqual(persisted.map((row) => row.sourceValue), prepared.sourceValues);
  assert.match(persisted[0].createdTime, /^2026-07-08T/);
  assert.match(persisted[1].createdTime, /^2026-07-10T/);
  assert.equal(persisted[2].createdTime, prepared.originalCreatedTimes[2]);
  assert.equal(persisted[3].createdTime, prepared.originalCreatedTimes[3]);

  return {
    databaseId,
    message: await resultMessage.textContent(),
    snapshot: {
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath
    },
    status: "passed",
    viewport: viewport.name
  };
}

async function openDatabaseAndWaitForField({ databaseId, databaseName, fieldName, page }) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((targetDatabaseId) => {
      window.dispatchEvent(new CustomEvent("lotion:open-entity", {
        detail: { kind: "database", entityId: targetDatabaseId }
      }));
    }, databaseId);
    try {
      await page.locator(".database-title-wrap h1").filter({ hasText: databaseName }).waitFor({ timeout: 5_000 });
      await page.locator(".database-table").waitFor({ timeout: 5_000 });
      const header = page.locator(".field-header-button").filter({
        has: page.locator(".field-header-name", { hasText: fieldName })
      });
      await header.waitFor({ timeout: 5_000 });
      return header;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(150);
    }
  }

  const diagnostic = await page.evaluate(async (targetDatabaseId) => {
    const bundle = await window.lotion.databases.get(targetDatabaseId);
    return {
      activeTitle: document.querySelector(".database-title-wrap h1")?.textContent?.trim() ?? "",
      backendFields: bundle.schema.fields.map((field) => field.name),
      visibleHeaders: Array.from(document.querySelectorAll(".field-header-name"))
        .map((node) => node.textContent?.trim() ?? "")
    };
  }, databaseId);
  throw new Error(`Database field did not render after navigation: ${JSON.stringify(diagnostic)}`, { cause: lastError });
}
