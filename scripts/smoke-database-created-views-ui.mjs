#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertDatabaseCreatedViewsArtifactContract } from "./lib/database-created-views-artifacts.mjs";
import { assertProductionVisualBaseline } from "./lib/production-visual-baseline.mjs";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const CREATED_ASC_VIEW_ID = "view_created_time_asc";
const CREATED_DESC_VIEW_ID = "view_created_time_desc";

const INJECTED_FAILURE_VALUE = "__FAIL_VIEW_WRITE__";

const result = await withLotionUIHarness("database-created-views-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const expectedViewports = selectedViewports();
  const viewports = [];
  await forEachViewport(page, expectedViewports, async (viewport) => {
    const fixture = await createDatabaseCreatedViewsFixture(viewport.name);
    await openWorkspace(fixture.root);
    const viewportResult = await runCreatedViewsSmoke({ artifactRoot, fixture, page, viewport });
    viewports.push({
      viewport: viewport.name,
      databaseId: fixture.databaseId,
      ...viewportResult
    });
  });
  const summary = { artifactRoot, cdpUrl, viewports, status: "passed" };
  summary.artifactContract = await assertDatabaseCreatedViewsArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name),
    requiredPerceptualBaselineViewportNames: process.env.LOTION_DATABASE_CREATED_VIEWS_SKIP_BASELINE === "1"
      ? []
      : expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

console.log(JSON.stringify(result, null, 2));

async function runCreatedViewsSmoke({ artifactRoot, fixture, page, viewport }) {
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertIntersectsViewport(page, page.locator(".database-table").first(), `created views table ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `created views initial ${viewport.name}`);

  const generatedBeforeClick = await assertGeneratedCreatedViews(page, fixture.databaseId);
  const visibleTabState = await assertVisibleViewTabs(page, ["All", "Created date asc", "Created date desc"]);

  const ascTab = page.getByRole("tab", { name: /Created date asc/i }).first();
  await ascTab.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("tab", { name: /Created date asc/i }).first().waitFor({ timeout: 8_000 });
  await page.locator(".view-tab.active").filter({ hasText: "Created date asc" }).waitFor({ timeout: 8_000 });
  const keyboardActivatedTab = await page.locator(".view-tab.active").first().textContent();
  const ascFirstTitle = await waitForFirstVisibleRowTitle(page, fixture.ascendingFirstTitle);
  await assertNoDocumentHorizontalOverflow(page, `created views asc ${viewport.name}`);

  await page.getByRole("tab", { name: /Created date desc/i }).first().click();
  await page.locator(".view-tab.active").filter({ hasText: "Created date desc" }).waitFor({ timeout: 8_000 });
  const descFirstTitle = await waitForFirstVisibleRowTitle(page, fixture.descendingFirstTitle);
  await assertNoDocumentHorizontalOverflow(page, `created views desc ${viewport.name}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.locator(".view-tab.active").filter({ hasText: "Created date desc" }).waitFor({ timeout: 8_000 });
  const restoredActiveTab = (await page.locator(".view-tab.active").first().textContent() ?? "").trim();
  const restoredFirstTitle = await waitForFirstVisibleRowTitle(page, fixture.descendingFirstTitle);
  await assertNoDocumentHorizontalOverflow(page, `created views restored ${viewport.name}`);

  await page.locator('.view-tab-actions .toolbar-icon[aria-label="Filter"]').first().click();
  await page.locator(".filter-popover").waitFor({ timeout: 8_000 });
  await page.locator(".filter-popover").getByRole("button", { name: /add condition/i }).click();
  const successfulFilterRow = page.locator(".filter-popover .filter-row").first();
  await successfulFilterRow.locator("select").first().selectOption({ label: "Notes" });
  await successfulFilterRow.locator("input").fill("Newest");
  const resizeHandle = page.getByRole("separator", { name: "Resize Name" }).first();
  const resizeBox = await resizeHandle.boundingBox();
  if (!resizeBox) throw new Error("Could not measure Name resize handle.");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 48, resizeBox.y + resizeBox.height / 2);
  await page.mouse.up();
  const successfulMutation = await pollPageValue(
    page,
    async ({ databaseId, viewId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const target = bundle.views.find((candidate) => candidate.id === viewId);
      return {
        filterValue: String(target?.filters?.[0]?.value ?? ""),
        revision: target?.revision ?? 0,
        titleWidth: target?.columnWidths?.title ?? 0,
        ok: target?.filters?.[0]?.fieldId === "notes" && target?.filters?.[0]?.value === "Newest" && (target?.columnWidths?.title ?? 0) >= 228
      };
    },
    { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID },
    (value) => Boolean(value?.ok),
    "serialized filter and resize persistence"
  );
  await page.locator(".view-save-status.saved").first().waitFor({ timeout: 8_000 });

  const externalSurfacePatch = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const current = bundle.views.find((candidate) => candidate.id === viewId);
    const result = await window.lotion.views.patch({
      databaseId,
      viewId,
      patch: { pageSize: 42 },
      expectedRevision: current?.revision ?? 0
    });
    if (!result.ok) throw new Error(`External surface patch conflicted: ${result.error.message}`);
    return { revision: result.view.revision, pageSize: result.view.pageSize };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  if (!await page.locator(".filter-popover").isVisible().catch(() => false)) {
    await page.locator('.view-tab-actions .toolbar-icon[aria-label="Filter"]').first().click();
    await page.locator(".filter-popover").waitFor({ timeout: 8_000 });
  }
  await page.locator(".filter-popover .filter-row").first().locator("input").fill("Newest row");
  const convergedMutation = await pollPageValue(
    page,
    async ({ databaseId, viewId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const target = bundle.views.find((candidate) => candidate.id === viewId);
      return {
        filterValue: String(target?.filters?.[0]?.value ?? ""),
        pageSize: target?.pageSize ?? 0,
        revision: target?.revision ?? 0,
        ok: target?.filters?.[0]?.value === "Newest row" && target?.pageSize === 42
      };
    },
    { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID },
    (value) => Boolean(value?.ok),
    "cross-surface conflict convergence"
  );
  const queuedDismissalValue = "Queued filter close";
  await page.locator(".filter-popover .filter-row").first().locator("input").fill(queuedDismissalValue);
  await page.locator(".filter-popover").press("Escape");
  await page.locator(".filter-popover").waitFor({ state: "detached", timeout: 8_000 });
  const queuedDismissalMutation = await pollPageValue(
    page,
    async ({ databaseId, viewId, expectedValue }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const target = bundle.views.find((candidate) => candidate.id === viewId);
      return {
        filterValue: String(target?.filters?.[0]?.value ?? ""),
        revision: target?.revision ?? 0,
        ok: target?.filters?.[0]?.value === expectedValue
      };
    },
    { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID, expectedValue: queuedDismissalValue },
    (value) => Boolean(value?.ok),
    "debounced filter flush before dismissal"
  );

  const beforeFailure = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const target = bundle.views.find((candidate) => candidate.id === viewId);
    return { revision: target?.revision ?? 0, sortCount: target?.sorts?.length ?? 0, filterValue: String(target?.filters?.[0]?.value ?? "") };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  if (!await page.locator(".filter-popover").isVisible().catch(() => false)) {
    await page.locator('.view-tab-actions .toolbar-icon[aria-label="Filter"]').first().click();
    await page.locator(".filter-popover").waitFor({ timeout: 8_000 });
  }
  await page.evaluate(() => window.lotion.debug.failNextDatabaseViewWrite("Injected view persistence failure"));
  await page.locator(".filter-popover .filter-row").first().locator("input").fill(INJECTED_FAILURE_VALUE);
  const filterFailureAlert = page.locator('.filter-popover .filter-action-error[role="alert"]').first();
  await filterFailureAlert.waitFor({ timeout: 8_000 });
  const filterFailureMessage = (await filterFailureAlert.textContent() ?? "").trim();
  if (!filterFailureMessage.includes("Injected view persistence failure")) {
    throw new Error(`Expected local filter recovery error, received ${JSON.stringify(filterFailureMessage)}.`);
  }
  const failureAlert = page.locator('.view-save-status.error[role="alert"]').first();
  await failureAlert.waitFor({ timeout: 8_000 });
  const failureMessage = (await failureAlert.textContent() ?? "").trim();
  if (!failureMessage.includes("Injected view persistence failure")) {
    throw new Error(`Expected injected persistence failure, received ${JSON.stringify(failureMessage)}.`);
  }
  const afterFailure = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const target = bundle.views.find((candidate) => candidate.id === viewId);
    return { revision: target?.revision ?? 0, sortCount: target?.sorts?.length ?? 0, filterValue: String(target?.filters?.[0]?.value ?? "") };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  if (
    afterFailure.revision !== beforeFailure.revision
    || afterFailure.sortCount !== beforeFailure.sortCount
    || afterFailure.filterValue !== beforeFailure.filterValue
  ) {
    throw new Error(`Failed optimistic mutation leaked to storage: before=${JSON.stringify(beforeFailure)} after=${JSON.stringify(afterFailure)}.`);
  }
  const retainedFailureDraft = await page.locator(".filter-popover .filter-row").first().locator("input").inputValue();
  if (retainedFailureDraft !== INJECTED_FAILURE_VALUE) {
    throw new Error(`Filter failure did not retain the draft: ${JSON.stringify(retainedFailureDraft)}.`);
  }
  await page.locator('.filter-popover .filter-action-error button', { hasText: "Retry" }).evaluate((button) => {
    button.click();
    button.click();
    const popover = button.closest(".filter-popover");
    popover?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  const pendingDismissalBlocked = await page.locator(".filter-popover").isVisible();
  const retryMutation = await pollPageValue(
    page,
    async ({ databaseId, viewId, expectedValue }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const target = bundle.views.find((candidate) => candidate.id === viewId);
      return {
        filterValue: String(target?.filters?.[0]?.value ?? ""),
        revision: target?.revision ?? 0,
        ok: target?.filters?.[0]?.value === expectedValue
      };
    },
    { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID, expectedValue: INJECTED_FAILURE_VALUE },
    (value) => Boolean(value?.ok),
    "filter failure retry"
  );
  await page.locator(".filter-popover .filter-action-error").waitFor({ state: "detached", timeout: 8_000 });
  if (retryMutation.revision !== beforeFailure.revision + 1) {
    throw new Error(`Filter retry was not exactly-once: before=${beforeFailure.revision} after=${retryMutation.revision}.`);
  }
  const filterRecovery = {
    message: filterFailureMessage,
    popoverRemainedOpen: await page.locator(".filter-popover").isVisible(),
    pendingDismissalBlocked,
    draftRetained: retainedFailureDraft === INJECTED_FAILURE_VALUE,
    debouncedDismissalFlushed: queuedDismissalMutation.filterValue === queuedDismissalValue,
    failedStateRolledBack: afterFailure.revision === beforeFailure.revision && afterFailure.filterValue === beforeFailure.filterValue,
    duplicateSubmitSuppressed: retryMutation.revision === beforeFailure.revision + 1,
    retryCommittedExactlyOnce: retryMutation.filterValue === INJECTED_FAILURE_VALUE
  };

  await waitForIdlePopover(page, ".filter-popover", "filter retry");
  await page.locator(".filter-popover").press("Escape");
  await page.locator(".filter-popover").waitFor({ state: "detached", timeout: 8_000 });
  const beforeSortFailure = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const target = bundle.views.find((candidate) => candidate.id === viewId);
    return {
      revision: target?.revision ?? 0,
      sorts: target?.sorts ?? []
    };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  await page.locator('.view-tab-actions .toolbar-icon[aria-label="Sort"]').first().click();
  const sortPopover = page.locator(".sort-popover");
  await sortPopover.waitFor({ timeout: 8_000 });
  await page.evaluate(() => window.lotion.debug.failNextDatabaseViewWrite("Injected sort persistence failure"));
  const sortDirection = sortPopover.locator('select[aria-label^="Sort direction"]').first();
  await sortDirection.selectOption("asc");
  const sortFailureAlert = sortPopover.locator('.sort-action-error[role="alert"]').first();
  await sortFailureAlert.waitFor({ timeout: 8_000 });
  const sortFailureMessage = (await sortFailureAlert.textContent() ?? "").trim();
  if (!sortFailureMessage.includes("Injected sort persistence failure")) {
    throw new Error(`Expected local sort recovery error, received ${JSON.stringify(sortFailureMessage)}.`);
  }
  const afterSortFailure = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const target = bundle.views.find((candidate) => candidate.id === viewId);
    return {
      revision: target?.revision ?? 0,
      sorts: target?.sorts ?? []
    };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  if (
    afterSortFailure.revision !== beforeSortFailure.revision
    || JSON.stringify(afterSortFailure.sorts) !== JSON.stringify(beforeSortFailure.sorts)
  ) {
    throw new Error(`Failed sort mutation leaked to storage: before=${JSON.stringify(beforeSortFailure)} after=${JSON.stringify(afterSortFailure)}.`);
  }
  const retainedSortDirection = await sortDirection.inputValue();
  if (retainedSortDirection !== "asc") {
    throw new Error(`Sort failure did not retain the draft direction: ${JSON.stringify(retainedSortDirection)}.`);
  }
  await sortFailureAlert.getByRole("button", { name: "Retry" }).evaluate((button) => {
    button.click();
    button.click();
    const popover = button.closest(".sort-popover");
    popover?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  const sortPendingDismissalBlocked = await sortPopover.isVisible();
  const sortRetryMutation = await pollPageValue(
    page,
    async ({ databaseId, viewId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const target = bundle.views.find((candidate) => candidate.id === viewId);
      return {
        direction: target?.sorts?.[0]?.direction ?? "",
        revision: target?.revision ?? 0,
        ok: target?.sorts?.[0]?.direction === "asc"
      };
    },
    { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID },
    (value) => Boolean(value?.ok),
    "sort failure retry"
  );
  await sortFailureAlert.waitFor({ state: "detached", timeout: 8_000 });
  if (sortRetryMutation.revision !== beforeSortFailure.revision + 1) {
    throw new Error(`Sort retry was not exactly-once: before=${beforeSortFailure.revision} after=${sortRetryMutation.revision}.`);
  }
  const sortRecovery = {
    message: sortFailureMessage,
    popoverRemainedOpen: await sortPopover.isVisible(),
    pendingDismissalBlocked: sortPendingDismissalBlocked,
    draftRetained: retainedSortDirection === "asc",
    failedStateRolledBack: afterSortFailure.revision === beforeSortFailure.revision
      && JSON.stringify(afterSortFailure.sorts) === JSON.stringify(beforeSortFailure.sorts),
    duplicateSubmitSuppressed: sortRetryMutation.revision === beforeSortFailure.revision + 1,
    retryCommittedExactlyOnce: sortRetryMutation.direction === "asc"
  };

  await waitForIdlePopover(page, ".sort-popover", "sort retry");
  await sortPopover.press("Escape");
  await sortPopover.waitFor({ state: "detached", timeout: 8_000 });
  const beforeViewSettingsFailure = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const target = bundle.views.find((candidate) => candidate.id === viewId);
    return {
      name: target?.name ?? "",
      revision: target?.revision ?? 0
    };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  await page.locator('.view-tab-actions .toolbar-icon[aria-label="View settings"]').first().click();
  const settingsScopeMenu = page.getByRole("menu", { name: "Database settings" });
  await settingsScopeMenu.waitFor({ timeout: 8_000 });
  await settingsScopeMenu.getByRole("menuitem", { name: /View settings/ }).click();
  const viewSettingsMenu = page.getByRole("menu", { name: "View settings menu" });
  await viewSettingsMenu.waitFor({ timeout: 8_000 });
  await viewSettingsMenu.getByRole("menuitem", { name: "Layout" }).click();
  const viewSettingsDialog = page.getByRole("dialog", { name: "View settings" });
  await viewSettingsDialog.waitFor({ timeout: 8_000 });
  const recoveredViewName = `${beforeViewSettingsFailure.name} recovered`;
  const viewNameInput = viewSettingsDialog.locator(".form-row input").first();
  await viewNameInput.fill(recoveredViewName);
  await page.evaluate(() => window.lotion.debug.failNextDatabaseViewWrite("Injected view settings persistence failure"));
  const viewSettingsPendingDismissalBlocked = await viewSettingsDialog.getByRole("button", { name: "Save view" }).evaluate((button) => {
    button.click();
    button.click();
    button.closest(".dialog-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    return Boolean(document.querySelector(".view-dialog"));
  });
  const viewSettingsFailureAlert = viewSettingsDialog.locator('.view-settings-action-error[role="alert"]');
  await viewSettingsFailureAlert.waitFor({ timeout: 8_000 });
  const viewSettingsFailureMessage = (await viewSettingsFailureAlert.textContent() ?? "").trim();
  if (!viewSettingsFailureMessage.includes("Injected view settings persistence failure")) {
    throw new Error(`Expected local view settings recovery error, received ${JSON.stringify(viewSettingsFailureMessage)}.`);
  }
  const afterViewSettingsFailure = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const target = bundle.views.find((candidate) => candidate.id === viewId);
    return {
      name: target?.name ?? "",
      revision: target?.revision ?? 0
    };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  if (
    afterViewSettingsFailure.revision !== beforeViewSettingsFailure.revision
    || afterViewSettingsFailure.name !== beforeViewSettingsFailure.name
  ) {
    throw new Error(`Failed view settings mutation leaked to storage: before=${JSON.stringify(beforeViewSettingsFailure)} after=${JSON.stringify(afterViewSettingsFailure)}.`);
  }
  const retainedViewName = await viewNameInput.inputValue();
  if (retainedViewName !== recoveredViewName) {
    throw new Error(`View settings failure did not retain the name draft: ${JSON.stringify(retainedViewName)}.`);
  }
  const viewSettingsRetryDismissalBlocked = await viewSettingsFailureAlert.getByRole("button", { name: "Retry" }).evaluate((button) => {
    button.click();
    button.click();
    button.closest(".dialog-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    return Boolean(document.querySelector(".view-dialog"));
  });
  await viewSettingsDialog.waitFor({ state: "detached", timeout: 8_000 });
  const viewSettingsRetryMutation = await pollPageValue(
    page,
    async ({ databaseId, viewId, expectedName }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const target = bundle.views.find((candidate) => candidate.id === viewId);
      return {
        name: target?.name ?? "",
        revision: target?.revision ?? 0,
        ok: target?.name === expectedName
      };
    },
    { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID, expectedName: recoveredViewName },
    (value) => Boolean(value?.ok),
    "view settings failure retry"
  );
  if (viewSettingsRetryMutation.revision !== beforeViewSettingsFailure.revision + 1) {
    throw new Error(`View settings retry was not exactly-once: before=${beforeViewSettingsFailure.revision} after=${viewSettingsRetryMutation.revision}.`);
  }
  const viewSettingsRecovery = {
    message: viewSettingsFailureMessage,
    dialogRemainedOpen: viewSettingsPendingDismissalBlocked,
    pendingDismissalBlocked: viewSettingsRetryDismissalBlocked,
    draftRetained: retainedViewName === recoveredViewName,
    failedStateRolledBack: afterViewSettingsFailure.revision === beforeViewSettingsFailure.revision
      && afterViewSettingsFailure.name === beforeViewSettingsFailure.name,
    duplicateSubmitSuppressed: viewSettingsRetryMutation.revision === beforeViewSettingsFailure.revision + 1,
    retryCommittedExactlyOnce: viewSettingsRetryMutation.name === recoveredViewName
  };

  const beforeTemplateFailure = await page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return { templateCount: bundle.schema.templates?.length ?? 0 };
  }, fixture.databaseId);
  await page.locator('.view-tab-actions .toolbar-icon[aria-label="View settings"]').first().click();
  const templateSettingsScopeMenu = page.getByRole("menu", { name: "Database settings" });
  await templateSettingsScopeMenu.waitFor({ timeout: 8_000 });
  await templateSettingsScopeMenu.getByRole("menuitem", { name: /Database settings/ }).click();
  const databaseSettingsMenu = page.getByRole("menu", { name: "Database settings menu" });
  await databaseSettingsMenu.waitFor({ timeout: 8_000 });
  await databaseSettingsMenu.getByRole("menuitem", { name: "Templates" }).click();
  const templateDialog = page.getByRole("dialog", { name: "Templates" });
  await templateDialog.waitFor({ timeout: 8_000 });
  const recoveredTemplateName = "Recovered template";
  const templateNameInput = templateDialog.locator(".form-row input").first();
  await templateNameInput.fill(recoveredTemplateName);
  await page.evaluate(() => window.lotion.debug.failNextDatabaseBundleWrite("Injected template persistence failure"));
  const templatePendingDismissalBlocked = await templateDialog.getByRole("button", { name: "Save template" }).evaluate((button) => {
    button.click();
    button.click();
    button.closest(".dialog-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    return Boolean(document.querySelector(".row-template-dialog"));
  });
  const templateFailureAlert = templateDialog.locator('.row-template-action-error[role="alert"]');
  await templateFailureAlert.waitFor({ timeout: 8_000 });
  const templateFailureMessage = (await templateFailureAlert.textContent() ?? "").trim();
  if (!templateFailureMessage.includes("Injected template persistence failure")) {
    throw new Error(`Expected local template recovery error, received ${JSON.stringify(templateFailureMessage)}.`);
  }
  const afterTemplateFailure = await page.evaluate(async (databaseId) => {
    const bundle = await window.lotion.databases.get(databaseId);
    return {
      templateCount: bundle.schema.templates?.length ?? 0,
      matchingCount: (bundle.schema.templates ?? []).filter((template) => template.name === "Recovered template").length
    };
  }, fixture.databaseId);
  if (
    afterTemplateFailure.templateCount !== beforeTemplateFailure.templateCount
    || afterTemplateFailure.matchingCount !== 0
  ) {
    throw new Error(`Failed template mutation leaked to storage: before=${JSON.stringify(beforeTemplateFailure)} after=${JSON.stringify(afterTemplateFailure)}.`);
  }
  const retainedTemplateName = await templateNameInput.inputValue();
  if (retainedTemplateName !== recoveredTemplateName) {
    throw new Error(`Template failure did not retain the name draft: ${JSON.stringify(retainedTemplateName)}.`);
  }
  const templateRetryDismissalBlocked = await templateFailureAlert.getByRole("button", { name: "Retry" }).evaluate((button) => {
    button.click();
    button.click();
    button.closest(".dialog-backdrop")?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    return Boolean(document.querySelector(".row-template-dialog"));
  });
  const templateRetryMutation = await pollPageValue(
    page,
    async ({ databaseId, expectedName }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const matching = (bundle.schema.templates ?? []).filter((template) => template.name === expectedName);
      return {
        matchingCount: matching.length,
        templateCount: bundle.schema.templates?.length ?? 0,
        templateId: matching[0]?.id ?? "",
        ok: matching.length === 1
      };
    },
    { databaseId: fixture.databaseId, expectedName: recoveredTemplateName },
    (value) => Boolean(value?.ok),
    "template failure retry"
  );
  await templateFailureAlert.waitFor({ state: "detached", timeout: 8_000 });
  if (templateRetryMutation.templateCount !== beforeTemplateFailure.templateCount + 1) {
    throw new Error(`Template retry was not exactly-once: before=${beforeTemplateFailure.templateCount} after=${templateRetryMutation.templateCount}.`);
  }
  const templateRecovery = {
    message: templateFailureMessage,
    dialogRemainedOpen: templatePendingDismissalBlocked,
    pendingDismissalBlocked: templateRetryDismissalBlocked,
    draftRetained: retainedTemplateName === recoveredTemplateName,
    failedStateRolledBack: afterTemplateFailure.templateCount === beforeTemplateFailure.templateCount
      && afterTemplateFailure.matchingCount === 0,
    duplicateSubmitSuppressed: templateRetryMutation.templateCount === beforeTemplateFailure.templateCount + 1,
    retryCommittedExactlyOnce: templateRetryMutation.matchingCount === 1
  };
  await templateDialog.getByRole("button", { name: "Close" }).click();
  await templateDialog.waitFor({ state: "detached", timeout: 8_000 });
  await page.evaluate(async ({ databaseId, templateId }) => {
    await window.lotion.databases.deleteTemplate({ databaseId, templateId });
  }, { databaseId: fixture.databaseId, templateId: templateRetryMutation.templateId });

  const recoveredCaptureState = await page.evaluate(async ({ databaseId, viewId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const current = bundle.views.find((candidate) => candidate.id === viewId);
    const result = await window.lotion.views.patch({
      databaseId,
      viewId,
      patch: {
        filters: [],
        name: "Created date desc",
        sorts: [{ fieldId: "created_time", direction: "desc" }]
      },
      expectedRevision: current?.revision ?? 0
    });
    if (!result.ok) throw new Error(`Could not restore clean created-view capture state: ${result.error.message}`);
    return {
      filterCount: result.view.filters?.length ?? 0,
      revision: result.view.revision,
      sortCount: result.view.sorts?.length ?? 0
    };
  }, { databaseId: fixture.databaseId, viewId: CREATED_DESC_VIEW_ID });
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.locator(".view-tab.active").filter({ hasText: "Created date desc" }).waitFor({ timeout: 8_000 });
  await waitForFirstVisibleRowTitle(page, fixture.descendingFirstTitle);
  await page.waitForFunction(() => (
    document.querySelectorAll(".database-table tbody tr[data-row-id]").length === 3
    && !document.querySelector(".filter-popover")
    && !document.querySelector(".view-save-status.error")
  ), null, { timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `created views recovered capture ${viewport.name}`);

  const tabsBar = page.locator(".view-tabs-bar").first();
  const activeTab = page.locator(".view-tab.active").first();
  await assertIntersectsViewport(page, tabsBar, `created views tabs ${viewport.name}`, 4);
  await assertIntersectsViewport(page, activeTab, `created views active tab ${viewport.name}`, 4);

  const generatedAfterReload = await assertGeneratedCreatedViews(page, fixture.databaseId);
  const layout = await captureCreatedViewsLayout(page);
  const evidence = {
    activeTabRect: layout.activeTabRect,
    activeTabText: layout.activeTabText,
    ascFirstTitle,
    databaseName: fixture.databaseName,
    descFirstTitle,
    generatedViewCountAfterReload: generatedAfterReload.generatedViewIds.length,
    generatedViewIds: generatedBeforeClick.generatedViewIds,
    keyboardActivatedTab: (keyboardActivatedTab ?? "").trim(),
    noHorizontalOverflow: true,
    phase: "database-created-views",
    tableRect: layout.tableRect,
    tabsRect: layout.tabsRect,
    restoredActiveTab,
    restoredFirstTitle,
    successfulMutation,
    externalSurfacePatch,
    convergedMutation,
    queuedDismissalMutation,
    failureMessage,
    failedMutationRolledBack: true,
    filterRecovery,
    sortRecovery,
    viewSettingsRecovery,
    templateRecovery,
    recoveredCaptureState,
    viewport: viewport.name,
    visibleTabs: visibleTabState.tabs
  };
  const snapshot = await captureCreatedViewsSnapshot({
    artifactRoot,
    evidence,
    page,
    table: page.locator(".database-table").first(),
    viewport
  });
  return {
    ...evidence,
    snapshot
  };
}

async function navigateToDatabase(page, databaseId) {
  await page.evaluate((targetDatabaseId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "database", entityId: targetDatabaseId }
    }));
  }, databaseId);
}

async function waitForDatabaseService(page, databaseId) {
  await page.waitForSelector(".main-content", { timeout: 8_000 });
  await pollPageValue(page, async (targetDatabaseId) => {
    const databases = await window.lotion.databases.list();
    return databases.some((database) => database.id === targetDatabaseId);
  }, databaseId, Boolean, "database service readiness");
}

async function assertGeneratedCreatedViews(page, databaseId) {
  return pollPageValue(
    page,
    async (targetDatabaseId) => {
      const bundle = await window.lotion.databases.get(targetDatabaseId);
      const asc = bundle.views.filter((view) => view.id === "view_created_time_asc");
      const desc = bundle.views.filter((view) => view.id === "view_created_time_desc");
      return {
        ascCount: asc.length,
        descCount: desc.length,
        defaultViewId: bundle.schema.defaultViewId,
        generatedViewIds: [...asc, ...desc].map((view) => view.id),
        ok: asc.length === 1 &&
          desc.length === 1 &&
          asc[0]?.sorts?.[0]?.fieldId === "created_time" &&
          asc[0]?.sorts?.[0]?.direction === "asc" &&
          desc[0]?.sorts?.[0]?.fieldId === "created_time" &&
          desc[0]?.sorts?.[0]?.direction === "desc" &&
          bundle.views[0]?.id === bundle.schema.defaultViewId
      };
    },
    databaseId,
    (value) => Boolean(value?.ok),
    "generated created-date views"
  );
}

async function assertVisibleViewTabs(page, expectedLabels) {
  return pollPageValue(
    page,
    (labels) => {
      const tabs = Array.from(document.querySelectorAll(".view-tab"))
        .map((tab) => tab.textContent?.trim() ?? "");
      return {
        tabs,
        ok: labels.every((label) => tabs.some((tab) => tab.includes(label)))
      };
    },
    expectedLabels,
    (value) => Boolean(value?.ok),
    "created-date view tabs"
  );
}

async function captureCreatedViewsLayout(page) {
  return page.evaluate(() => {
    const table = document.querySelector(".database-table");
    const tabsBar = document.querySelector(".view-tabs-bar");
    const activeTab = document.querySelector(".view-tab.active");
    const visibleTabs = Array.from(document.querySelectorAll(".view-tab"))
      .map((tab) => tab.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);
    return {
      activeTabRect: rectFor(activeTab),
      activeTabText: activeTab?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      tableRect: rectFor(table),
      tabsRect: rectFor(tabsBar),
      visibleTabs
    };

    function rectFor(element) {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        bottom: Number(rect.bottom.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        left: Number(rect.left.toFixed(1)),
        right: Number(rect.right.toFixed(1)),
        top: Number(rect.top.toFixed(1)),
        width: Number(rect.width.toFixed(1))
      };
    }
  });
}

async function captureCreatedViewsSnapshot({ artifactRoot, evidence, page, table, viewport }) {
  await page.mouse.move(2, 2);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await table.evaluate((node) => node.scrollIntoView({ block: "start", inline: "nearest" }));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(100);
  await table.screenshot({ animations: "disabled", caret: "hide" });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-created-views-snapshot-style", "true");
    style.textContent = `
      .row-menu-handle,
      .row-context-handle {
        opacity: 0 !important;
        visibility: hidden !important;
      }
    `;
    document.head.appendChild(style);
    for (const rowCount of document.querySelectorAll(".table-row-count")) {
      const text = rowCount.textContent ?? "";
      if (!/loaded in \d+(?:\.\d+)? ms/i.test(text)) continue;
      rowCount.setAttribute("data-created-views-original-text", text);
      rowCount.textContent = text.replace(/loaded in \d+(?:\.\d+)? ms/i, "loaded in 0 ms");
    }
  });
  try {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const completeSurfaceState = await collectCreatedViewsCompleteSurfaceState(table);
    assertCompleteCreatedViewsSurfaceState(completeSurfaceState, viewport.name);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: table,
      metadata: { ...evidence, completeSurfaceState },
      name: `database-created-views-${viewport.name}`,
      page,
      viewport
    });
    const baselinePolicy = {
      compact: "test/baselines/production-visual/database-created-views-compact.json",
      desktop: "test/baselines/production-visual/database-created-views-desktop.json",
      wide: "test/baselines/production-visual/database-created-views-wide.json"
    }[viewport.name];
    const perceptualBaseline = baselinePolicy && process.env.LOTION_DATABASE_CREATED_VIEWS_SKIP_BASELINE !== "1"
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
    await page.evaluate(() => {
      for (const style of document.querySelectorAll("[data-created-views-snapshot-style]")) style.remove();
      for (const rowCount of document.querySelectorAll("[data-created-views-original-text]")) {
        rowCount.textContent = rowCount.getAttribute("data-created-views-original-text") ?? rowCount.textContent;
        rowCount.removeAttribute("data-created-views-original-text");
      }
    });
  }
}

async function collectCreatedViewsCompleteSurfaceState(table) {
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
    const visual = (node) => {
      if (!(node instanceof Element)) return { opacity: 0, visibility: "" };
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), visibility: style.visibility };
    };
    const rowText = (row) => [
      row?.textContent ?? "",
      ...Array.from(row?.querySelectorAll("input, textarea") ?? []).map((input) => input.value).filter(Boolean)
    ].join(" ").replace(/\s+/g, " ").trim();
    const header = surface.querySelector(".page-header");
    const title = header?.querySelector(".database-title-wrap h1");
    const subtitle = header?.querySelector(".database-subtitle");
    const openWindow = header?.querySelector(".database-open-window");
    const properties = surface.querySelector(".database-properties");
    const tabsBar = surface.querySelector(".view-tabs-bar");
    const tabs = Array.from(tabsBar?.querySelectorAll(".view-tab") ?? []);
    const tab = (label) => tabs.find((candidate) => candidate.textContent?.includes(label));
    const activeTab = tabsBar?.querySelector(".view-tab.active");
    const viewActions = tabsBar?.querySelector(".view-tab-actions");
    const tableScroll = surface.querySelector(".table-scroll");
    const tableHeader = tableScroll?.querySelector("thead");
    const dataRows = Array.from(tableScroll?.querySelectorAll("tbody tr[data-row-id]") ?? []);
    const summary = surface.querySelector(".table-summary-scroll");
    const footer = surface.querySelector(".table-footer");
    const rowCount = footer?.querySelector(".table-row-count");
    const surfaceVisual = visual(surface);
    const headerVisual = visual(header);
    const tabsVisual = visual(tabsBar);
    const tableVisual = visual(tableScroll);
    const footerVisual = visual(footer);
    return {
      surfaceRect: rect(surface),
      headerRect: rect(header),
      titleRect: rect(title),
      subtitleRect: rect(subtitle),
      openWindowRect: rect(openWindow),
      propertiesRect: rect(properties),
      tabsRect: rect(tabsBar),
      allTabRect: rect(tab("All")),
      ascTabRect: rect(tab("Created date asc")),
      descTabRect: rect(tab("Created date desc")),
      activeTabRect: rect(activeTab),
      viewActionsRect: rect(viewActions),
      tableScrollRect: rect(tableScroll),
      tableHeaderRect: rect(tableHeader),
      firstRowRect: rect(dataRows[0]),
      middleRowRect: rect(dataRows[1]),
      lastRowRect: rect(dataRows[2]),
      summaryRect: rect(summary),
      footerRect: rect(footer),
      rowCountRect: rect(rowCount),
      titleText: title?.textContent?.trim() ?? "",
      subtitleText: subtitle?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      visibleTabTexts: tabs.map((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() ?? ""),
      activeTabText: activeTab?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      rowTexts: dataRows.map(rowText),
      rowCountText: rowCount?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      renderedDataRowCount: dataRows.length,
      filterPopoverCount: document.querySelectorAll(".filter-popover").length,
      errorStatusCount: surface.querySelectorAll(".view-save-status.error").length,
      surfaceVisibility: surfaceVisual.visibility,
      surfaceOpacity: surfaceVisual.opacity,
      headerVisibility: headerVisual.visibility,
      headerOpacity: headerVisual.opacity,
      tabsVisibility: tabsVisual.visibility,
      tabsOpacity: tabsVisual.opacity,
      tableVisibility: tableVisual.visibility,
      tableOpacity: tableVisual.opacity,
      footerVisibility: footerVisual.visibility,
      footerOpacity: footerVisual.opacity,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentHorizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
    };
  });
}

function assertCompleteCreatedViewsSurfaceState(state, viewportName) {
  for (const key of [
    "surfaceRect",
    "headerRect",
    "titleRect",
    "subtitleRect",
    "openWindowRect",
    "propertiesRect",
    "tabsRect",
    "allTabRect",
    "ascTabRect",
    "descTabRect",
    "activeTabRect",
    "viewActionsRect",
    "tableScrollRect",
    "tableHeaderRect",
    "firstRowRect",
    "middleRowRect",
    "lastRowRect",
    "summaryRect",
    "footerRect",
    "rowCountRect"
  ]) {
    if (!positiveRect(state?.[key])) {
      throw new Error(`Database created views capture missing ${key} for ${viewportName}: ${JSON.stringify(state?.[key])}`);
    }
  }
  if (
    state.titleText !== "Created Views Smoke DB"
    || !/4 fields?\s*·\s*3 rows?/i.test(state.subtitleText)
    || state.activeTabText !== "Created date desc"
    || state.renderedDataRowCount !== 3
    || !state.rowTexts?.[0]?.includes("Newest created row")
    || !state.rowTexts?.[1]?.includes("Middle created row")
    || !state.rowTexts?.[2]?.includes("Oldest created row")
    || !/3\s+of\s+3\s+rows/i.test(state.rowCountText)
    || state.filterPopoverCount !== 0
    || state.errorStatusCount !== 0
    || state.documentHorizontalOverflow > 2
    || !insideViewport(state.surfaceRect, state.viewport)
    || !["surface", "header", "tabs", "table", "footer"].every((name) => (
      state[`${name}Visibility`] === "visible" && state[`${name}Opacity`] >= 0.99
    ))
  ) {
    throw new Error(`Database created views capture is clipped, hidden, dirty, or incomplete for ${viewportName}: ${JSON.stringify(state)}`);
  }
  for (const [ownerName, owner, children] of [
    ["surface", state.surfaceRect, [
      state.headerRect,
      state.propertiesRect,
      state.tabsRect,
      state.tableScrollRect,
      state.summaryRect,
      state.footerRect
    ]],
    ["header", state.headerRect, [state.titleRect, state.subtitleRect, state.openWindowRect]],
    ["tabs", state.tabsRect, [
      state.allTabRect,
      state.ascTabRect,
      state.descTabRect,
      state.activeTabRect,
      state.viewActionsRect
    ]],
    ["table", state.tableScrollRect, [
      state.tableHeaderRect,
      state.firstRowRect,
      state.middleRowRect,
      state.lastRowRect
    ]],
    ["footer", state.footerRect, [state.rowCountRect]]
  ]) {
    if (children.some((child) => !containsRect(owner, child))) {
      throw new Error(`Database created views capture has mis-owned ${ownerName} content for ${viewportName}: ${JSON.stringify({ owner, children })}`);
    }
  }
  if (overlaps(state.allTabRect, state.ascTabRect)
    || overlaps(state.ascTabRect, state.descTabRect)
    || overlaps(state.descTabRect, state.viewActionsRect)
    || overlaps(state.footerRect, state.summaryRect)) {
    throw new Error(`Database created views capture has overlapping controls or regions for ${viewportName}: ${JSON.stringify(state)}`);
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

async function waitForFirstVisibleRowTitle(page, expectedTitle) {
  const state = await pollPageValue(
    page,
    (title) => {
      const rows = Array.from(document.querySelectorAll(".database-table tbody tr"))
        .filter((row) => !row.classList.contains("virtual-spacer") && !row.classList.contains("add-row"));
      const first = rows[0];
      const editableValues = first
        ? Array.from(first.querySelectorAll("input, textarea")).map((input) => input.value).filter(Boolean)
        : [];
      const firstText = [first?.textContent ?? "", ...editableValues].join(" ").replace(/\s+/g, " ").trim();
      return {
        firstText,
        rowCount: rows.length,
        ok: firstText.includes(title)
      };
    },
    expectedTitle,
    (value) => Boolean(value?.ok),
    `first visible row ${expectedTitle}`
  );
  return state.firstText;
}

async function pollPageValue(page, evaluate, arg, isReady, label, timeout = 8_000) {
  const startedAt = Date.now();
  let lastValue;
  while (Date.now() - startedAt < timeout) {
    lastValue = await page.evaluate(evaluate, arg);
    if (isReady(lastValue)) return lastValue;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} timed out. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForIdlePopover(page, selector, label) {
  await pollPageValue(
    page,
    (targetSelector) => {
      const popover = document.querySelector(targetSelector);
      return {
        exists: Boolean(popover),
        busy: popover?.getAttribute("aria-busy") ?? null
      };
    },
    selector,
    (value) => value?.exists === true && value.busy === "false",
    `${label} popover idle`
  );
}

async function createDatabaseCreatedViewsFixture(viewportName) {
  const safeViewport = viewportName.replace(/[^a-z0-9_-]/gi, "_");
  const root = await mkdtemp(join(tmpdir(), `lotion-database-created-views-${safeViewport}-`));
  const now = "2026-06-01T00:00:00.000Z";
  const homeId = `pg_created_views_home_${safeViewport}`;
  const homeTitle = "Created Views Smoke Home";
  const databaseId = `db_created_views_${safeViewport}`;
  const databaseName = "Created Views Smoke DB";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_created_views_${safeViewport}`,
    name: "Created Views Smoke",
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
      icon: "emoji:🗓️",
      path: ["Created Views", homeTitle],
      bodyPath: homePath
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nCreated-date views smoke workspace.\n`, "utf8");

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
      { id: "row_icon", name: "Icon", type: "text", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "row_icon",
    "notes"
  ], [
    {
      id: "row_mid",
      created_time: "2025-01-01T00:00:00",
      updated_time: now,
      title: "Middle created row",
      page_file: "",
      row_icon: "",
      notes: "Middle row notes"
    },
    {
      id: "row_new",
      created_time: "2026-01-01T00:00:00",
      updated_time: now,
      title: "Newest created row",
      page_file: "",
      row_icon: "",
      notes: "Newest row notes with more content for field richness"
    },
    {
      id: "row_old",
      created_time: "2024-01-01T00:00:00",
      updated_time: now,
      title: "Oldest created row",
      page_file: "",
      row_icon: "",
      notes: "Oldest row notes"
    }
  ]);

  return {
    root,
    databaseId,
    databaseName,
    ascendingFirstTitle: "Oldest created row",
    descendingFirstTitle: "Newest created row"
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
