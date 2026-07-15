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
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("database-template-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createDatabaseTemplateFixture(viewport.name);
    await openWorkspace(fixture.root);
    const viewportResult = await runDatabaseTemplateSmoke(page, fixture, viewport, artifactRoot);
    viewports.push({
      viewport: viewport.name,
      databaseId: fixture.databaseId,
      templateId: fixture.templateId,
      ...viewportResult
    });
  });
  return { cdpUrl, viewports, status: "passed" };
});

console.log(JSON.stringify(result, null, 2));

async function runDatabaseTemplateSmoke(page, fixture, viewport, artifactRoot) {
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertIntersectsViewport(page, page.locator(".database-table").first(), `database table initial ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `database template initial ${viewport.name}`);

  await page.locator(".new-row-menu-toggle").first().click();
  await page.locator(".new-row-menu").getByRole("button", { name: fixture.templateName }).waitFor({ timeout: 8_000 });
  await page.locator(".new-row-menu").getByRole("button", { name: fixture.blankLabelPattern }).waitFor({ timeout: 8_000 });
  await page.keyboard.press("Escape").catch(() => undefined);

  const storedBeforeIds = await currentRecordIds(page, fixture.databaseId);
  await page.locator(".new-row-menu-wrap .primary").first().click();
  const storedTemplateResult = await assertAppliedTemplate(page, {
    databaseId: fixture.databaseId,
    beforeIds: storedBeforeIds,
    expectedTitle: fixture.templateRowTitle,
    expectedStatus: fixture.templateStatus,
    expectedScore: fixture.templateScore,
    expectedBodyMarker: fixture.templateBodyMarker,
    expectedFullWidth: true
  });

  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await createTemplateThroughDialog(page, fixture);
  await page.locator(".new-row-menu-toggle").first().click();
  const userBeforeIds = await currentRecordIds(page, fixture.databaseId);
  await page.locator(".new-row-menu").getByRole("button", { name: fixture.uiTemplateName }).click();
  const userTemplateResult = await assertAppliedTemplate(page, {
    databaseId: fixture.databaseId,
    beforeIds: userBeforeIds,
    expectedTitle: fixture.uiTemplateRowTitle,
    expectedStatus: fixture.uiTemplateStatus,
    expectedScore: fixture.uiTemplateScore,
    expectedBodyMarker: fixture.uiTemplateBodyMarker,
    expectedFullWidth: true
  });

  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await setDefaultTemplateThroughViewSettings(page, fixture);
  const viewDefaultBeforeIds = await currentRecordIds(page, fixture.databaseId);
  await page.locator(".new-row-menu-wrap .primary").first().click();
  const viewDefaultResult = await assertAppliedTemplate(page, {
    databaseId: fixture.databaseId,
    beforeIds: viewDefaultBeforeIds,
    expectedTitle: fixture.uiTemplateRowTitle,
    expectedStatus: fixture.uiTemplateStatus,
    expectedScore: fixture.uiTemplateScore,
    expectedBodyMarker: fixture.uiTemplateBodyMarker,
    expectedFullWidth: true
  });

  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  const emptyPromptResult = await assertEmptyPromptTemplate(page, fixture);
  await navigateToDatabase(page, fixture.databaseId);
  await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  const deleteTemplateResult = await assertDeleteTemplateThroughDialog(page, fixture);
  const columnSummaryResult = await assertColumnSummarySelection(page, fixture);
  const sortFilterResult = await assertViewSortFilterSettings(page, fixture);
  const toolbarSortFilterResult = await assertToolbarSortFilterPopovers(page, fixture);
  const fieldLayoutResult = await assertFieldVisibilityAndOrderSettings(page, fixture);
  const multiSelectOptionResult = await assertMultiSelectOptionDropdown(page, fixture);
  const selectOptionResult = await assertSelectOptionDropdown(page, fixture);
  const createViewResult = await assertCreateAndRenameView(page, fixture);
  const viewTypeResult = await assertViewTypeSwitch(page, fixture, createViewResult, viewport, artifactRoot);
  const duplicateSpecificViewResult = await assertDuplicateViewSpecificSettings(page, fixture, createViewResult);
  const duplicateViewResult = await assertDuplicateView(page, fixture, createViewResult);
  const deleteDuplicatedViewResult = await assertDeleteCreatedView(page, fixture, duplicateViewResult);
  const setDefaultViewResult = await assertSetCreatedViewAsDefault(page, fixture, createViewResult);
  const deleteViewResult = await assertDeleteCreatedView(page, fixture, createViewResult);
  const lastViewGuardResult = await assertLastViewDeleteDisabled(page, fixture);
  const listEmptyResult = await assertListEmptyState(page, fixture);
  const listDatePropertyResult = await assertListDateProperty(page, fixture);
  const galleryEmptyResult = await assertGalleryEmptyState(page, fixture);
  const galleryDateCaptionResult = await assertGalleryDateCaption(page, fixture);
  await assertNoDocumentHorizontalOverflow(page, `database template final ${viewport.name}`);

  return {
    createdRowId: storedTemplateResult.rowId,
    createdTitle: storedTemplateResult.title,
    createdStatus: storedTemplateResult.status,
    createdScore: storedTemplateResult.score,
    rowPageFullWidth: storedTemplateResult.fullWidth,
    activeTabText: storedTemplateResult.activeTabText,
    userTemplateName: fixture.uiTemplateName,
    userTemplateCreatedRowId: userTemplateResult.rowId,
    userTemplateCreatedTitle: userTemplateResult.title,
    userTemplateRowPageFullWidth: userTemplateResult.fullWidth,
    viewDefaultCreatedRowId: viewDefaultResult.rowId,
    viewDefaultCreatedTitle: viewDefaultResult.title,
    emptyPromptRowId: emptyPromptResult.rowId,
    emptyPromptTitle: emptyPromptResult.title,
    emptyPromptPersisted: emptyPromptResult.persisted,
    deletedTemplateName: fixture.uiTemplateName,
    deleteTemplateBlankRowId: deleteTemplateResult.blankRowId,
    deleteTemplateBlankRowTitle: deleteTemplateResult.blankRowTitle,
    columnSummaryField: columnSummaryResult.fieldId,
    columnSummaryType: columnSummaryResult.summaryType,
    columnSummaryValue: columnSummaryResult.value,
    sortFilterViewId: sortFilterResult.viewId,
    sortField: sortFilterResult.sortFieldId,
    sortDirection: sortFilterResult.sortDirection,
    filterField: sortFilterResult.filterFieldId,
    filterValue: sortFilterResult.filterValue,
    firstFilteredTitle: sortFilterResult.firstVisibleTitle,
    toolbarSortField: toolbarSortFilterResult.sortFieldId,
    toolbarSortDirection: toolbarSortFilterResult.sortDirection,
    toolbarFilterField: toolbarSortFilterResult.filterFieldId,
    toolbarFilterValue: toolbarSortFilterResult.filterValue,
    toolbarFirstFilteredTitle: toolbarSortFilterResult.firstVisibleTitle,
    hiddenField: fieldLayoutResult.hiddenFieldId,
    fieldBeforeStatus: fieldLayoutResult.fieldBeforeStatus,
    headerOrder: fieldLayoutResult.headerOrder,
    multiSelectRowId: multiSelectOptionResult.rowId,
    multiSelectValue: multiSelectOptionResult.labels,
    multiSelectMenuItems: multiSelectOptionResult.optionNames,
    selectOptionRowId: selectOptionResult.rowId,
    selectOptionValue: selectOptionResult.status,
    selectOptionMenuItems: selectOptionResult.optionNames,
    createdViewId: createViewResult.viewId,
    createdViewName: createViewResult.viewName,
    createdViewType: viewTypeResult.viewType,
    visitedViewTypes: viewTypeResult.visitedTypes,
    galleryCoverFieldId: viewTypeResult.galleryCoverFieldId,
    galleryCoverImageSrc: viewTypeResult.galleryCoverImageSrc,
    listRowIcon: viewTypeResult.listRowIcon,
    listDefaultIconClass: viewTypeResult.listDefaultIconClass,
    listOpenedRowTitle: viewTypeResult.listOpenedRowTitle,
    galleryRowIcon: viewTypeResult.galleryRowIcon,
    galleryDefaultIconClass: viewTypeResult.galleryDefaultIconClass,
    galleryOpenedRowTitle: viewTypeResult.galleryOpenedRowTitle,
    calendarDateFieldId: viewTypeResult.calendarDateFieldId,
    calendarRowIcon: viewTypeResult.calendarRowIcon,
    calendarDefaultIconClass: viewTypeResult.calendarDefaultIconClass,
    calendarRenderedTitle: viewTypeResult.calendarRenderedTitle,
    calendarNavigationRestoredTitle: viewTypeResult.calendarNavigationRestoredTitle,
    calendarTodayRestoredTitle: viewTypeResult.calendarTodayRestoredTitle,
    calendarTodayCellDay: viewTypeResult.calendarTodayCellDay,
    calendarOverflowMarker: viewTypeResult.calendarOverflowMarker,
    calendarOverflowExpandedRows: viewTypeResult.calendarOverflowExpandedRows,
    calendarOverflowResetMarker: viewTypeResult.calendarOverflowResetMarker,
    calendarOpenedRowTitle: viewTypeResult.calendarOpenedRowTitle,
    calendarOverflowOpenedRowTitle: viewTypeResult.calendarOverflowOpenedRowTitle,
    duplicatedGalleryCoverFieldId: duplicateSpecificViewResult.galleryCoverFieldId,
    duplicatedCalendarDateFieldId: duplicateSpecificViewResult.calendarDateFieldId,
    createdViewFieldCount: createViewResult.visibleFieldCount,
    duplicatedViewId: duplicateViewResult.viewId,
    duplicatedViewName: duplicateViewResult.viewName,
    duplicatedViewType: duplicateViewResult.viewType,
    duplicatedViewDeleted: deleteDuplicatedViewResult.viewId,
    defaultViewId: setDefaultViewResult.defaultViewId,
    defaultViewFirstTabText: setDefaultViewResult.firstTabText,
    defaultViewReopenActiveTabText: setDefaultViewResult.reopenActiveTabText,
    deletedViewId: deleteViewResult.viewId,
    deletedViewActiveTabText: deleteViewResult.activeTabText,
    deletedViewDefaultViewId: deleteViewResult.defaultViewId,
    deletedViewRemainingViews: deleteViewResult.remainingViews,
    lastViewDeleteDisabled: lastViewGuardResult.deleteDisabled,
    lastViewDefaultDisabled: lastViewGuardResult.defaultDisabled,
    listEmptyViewId: listEmptyResult.viewId,
    listEmptyText: listEmptyResult.emptyText,
    listDatePropertyViewId: listDatePropertyResult.viewId,
    listDatePropertyValue: listDatePropertyResult.value,
    galleryEmptyViewId: galleryEmptyResult.viewId,
    galleryEmptyText: galleryEmptyResult.emptyText,
    galleryDateCaptionViewId: galleryDateCaptionResult.viewId,
    galleryDateCaptionValue: galleryDateCaptionResult.value,
    viewVisualSnapshots: viewTypeResult.visualSnapshots
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

async function assertAppliedTemplate(page, {
  databaseId,
  beforeIds,
  expectedTitle,
  expectedStatus,
  expectedScore,
  expectedBodyMarker,
  expectedFullWidth
}) {
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    expectedTitle,
    { timeout: 8_000 }
  );
  const persisted = await pollPageValue(
    page,
    async ({ targetDatabaseId, before, title, status, score, bodyMarker, fullWidth }) => {
      const beforeIds = new Set(before);
      const bundle = await window.lotion.databases.get(targetDatabaseId);
      const created = bundle.records.find((record) => !beforeIds.has(String(record.id)));
      if (!created) return null;
      const rowPage = await window.lotion.rowPages.open(targetDatabaseId, String(created.id));
      return {
        rowId: String(created.id),
        title: String(created.title ?? ""),
        status: String(created.status ?? ""),
        score: Number(created.score),
        fullWidth: Boolean(rowPage.meta.fullWidth),
        bodyApplied: rowPage.markdown.includes(bodyMarker),
        markdown: rowPage.markdown,
        ready:
          String(created.title ?? "") === title &&
          String(created.status ?? "") === status &&
          Number(created.score) === score &&
          Boolean(rowPage.meta.fullWidth) === fullWidth &&
          rowPage.markdown.includes(bodyMarker)
      };
    },
    {
      targetDatabaseId: databaseId,
      before: [...beforeIds],
      title: expectedTitle,
      status: expectedStatus,
      score: expectedScore,
      bodyMarker: expectedBodyMarker,
      fullWidth: expectedFullWidth
    },
    (value) => Boolean(value?.ready),
    "template row/page persistence",
    12_000
  );
  await page.getByText(expectedBodyMarker).first().waitFor({ timeout: 12_000 });
  await page.getByText(expectedStatus).first().waitFor({ timeout: 8_000 });

  const activeTabText = (await page.locator(".tab.active").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (!activeTabText.includes(expectedTitle)) {
    throw new Error(`Active tab does not include templated row title: ${activeTabText}`);
  }
  if (activeTabText.includes(persisted.rowId)) {
    throw new Error(`Active tab leaked row id after template creation: ${activeTabText}`);
  }

  return {
    rowId: persisted.rowId,
    title: persisted.title,
    status: persisted.status,
    score: persisted.score,
    fullWidth: persisted.fullWidth,
    activeTabText
  };
}

async function currentRecordIds(page, databaseId) {
  const bundle = await page.evaluate((targetDatabaseId) => window.lotion.databases.get(targetDatabaseId), databaseId);
  return new Set(bundle.records.map((record) => String(record.id)));
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

async function createTemplateThroughDialog(page, fixture) {
  await page.locator(".new-row-menu-toggle").first().click();
  await page.locator(".new-row-menu").getByRole("button", { name: fixture.templateManageLabelPattern }).click();
  await page.locator(".row-template-dialog").waitFor({ timeout: 8_000 });
  await page.locator(".row-template-list-item").filter({ hasText: fixture.newTemplateLabelPattern }).click();
  await page.locator(".row-template-editor > label.form-row input").first().fill(fixture.uiTemplateName);
  await page.locator(".template-default-field").filter({ hasText: "Name" }).locator("input").fill(fixture.uiTemplateRowTitle);
  await page.locator(".template-default-field").filter({ hasText: "Status" }).locator("select").selectOption(fixture.uiTemplateStatus);
  await page.locator(".template-default-field").filter({ hasText: "Score" }).locator("input").fill(String(fixture.uiTemplateScore));
  await page.locator(".template-default-field").filter({ hasText: "Notes" }).locator("input").fill(fixture.uiTemplateNotes);
  await page.locator(".row-template-editor textarea").fill(`# ${fixture.uiTemplateRowTitle}\n\n${fixture.uiTemplateBodyMarker}\n`);
  await page.locator(".view-config-checkbox input").check();
  await page.getByRole("button", { name: fixture.templateSaveLabelPattern }).click();
  await pollPageValue(
    page,
    async ({ databaseId, templateName, bodyMarker }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      return (bundle.schema.templates ?? []).some((template) => (
        template.name === templateName && String(template.markdown ?? "").includes(bodyMarker)
      ));
    },
    {
      databaseId: fixture.databaseId,
      templateName: fixture.uiTemplateName,
      bodyMarker: fixture.uiTemplateBodyMarker
    },
    Boolean,
    "template save persistence"
  );
  await page.getByRole("button", { name: fixture.closeLabelPattern }).click();
  await page.locator(".row-template-dialog").waitFor({ state: "detached", timeout: 8_000 });
}

async function setDefaultTemplateThroughViewSettings(page, fixture) {
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  await page
    .locator(".view-dialog label.form-row")
    .filter({ hasText: fixture.defaultTemplateLabelPattern })
    .locator("select")
    .selectOption({ label: fixture.uiTemplateName });
  await page.getByRole("button", { name: fixture.saveViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });
  await pollPageValue(
    page,
    async ({ databaseId, templateName }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const template = (bundle.schema.templates ?? []).find((item) => item.name === templateName);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return Boolean(template && view?.defaultTemplateId === template.id);
    },
    { databaseId: fixture.databaseId, templateName: fixture.uiTemplateName },
    Boolean,
    "view default template persistence"
  );
}

async function assertEmptyPromptTemplate(page, fixture) {
  const beforeIds = await currentRecordIds(page, fixture.databaseId);
  const bundle = await page.evaluate((databaseId) => window.lotion.databases.addRow(databaseId), fixture.databaseId);
  const created = bundle.records.find((record) => !beforeIds.has(String(record.id)));
  if (!created) throw new Error("Could not create a blank row for the empty-template prompt smoke.");
  const rowId = String(created.id);

  await page.evaluate(({ databaseId, rowId: targetRowId }) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "row", entityId: targetRowId, databaseId, rowId: targetRowId }
    }));
  }, { databaseId: fixture.databaseId, rowId });
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    "New row",
    { timeout: 8_000 }
  );
  await page.locator(".empty-page-prompt").waitFor({ timeout: 8_000 });
  await page.locator(".empty-template-option").filter({ hasText: fixture.uiTemplateName }).click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.uiTemplateRowTitle,
    { timeout: 8_000 }
  );
  await page.getByText(fixture.uiTemplateBodyMarker).first().waitFor({ timeout: 8_000 });
  await page.getByText(fixture.uiTemplateStatus).first().waitFor({ timeout: 8_000 });
  await pollPageValue(
    page,
    async ({ databaseId, targetRowId, title, status, score, bodyMarker }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((item) => String(item.id) === targetRowId);
      if (!record) return false;
      if (String(record.title) !== title) return false;
      if (String(record.status) !== status) return false;
      if (Number(record.score) !== score) return false;
      const doc = await window.lotion.rowPages.open(databaseId, targetRowId);
      return doc.markdown.includes(bodyMarker) && Boolean(doc.meta.fullWidth);
    },
    {
      databaseId: fixture.databaseId,
      targetRowId: rowId,
      title: fixture.uiTemplateRowTitle,
      status: fixture.uiTemplateStatus,
      score: fixture.uiTemplateScore,
      bodyMarker: fixture.uiTemplateBodyMarker
    },
    Boolean,
    "empty prompt template persistence"
  );

  const doc = await page.evaluate(
    ({ databaseId, targetRowId }) => window.lotion.rowPages.open(databaseId, targetRowId),
    { databaseId: fixture.databaseId, targetRowId: rowId }
  );
  if (!doc.markdown.includes(fixture.uiTemplateBodyMarker)) {
    throw new Error(`Empty prompt template body did not persist: ${doc.markdown}`);
  }
  if (!doc.meta.fullWidth) {
    throw new Error("Empty prompt template full-width setting did not persist.");
  }

  return {
    rowId,
    title: doc.title,
    persisted: true
  };
}

async function assertDeleteTemplateThroughDialog(page, fixture) {
  await page.locator(".new-row-menu-toggle").first().click();
  await page.locator(".new-row-menu").getByRole("button", { name: fixture.templateManageLabelPattern }).click();
  await page.locator(".row-template-dialog").waitFor({ timeout: 8_000 });
  await page.locator(".row-template-list-item").filter({ hasText: fixture.uiTemplateName }).click();
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.locator(".row-template-dialog .danger-button").click();
  await pollPageValue(
    page,
    async ({ databaseId, templateName }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const deleted = !(bundle.schema.templates ?? []).some((template) => template.name === templateName);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return deleted && !view?.defaultTemplateId;
    },
    { databaseId: fixture.databaseId, templateName: fixture.uiTemplateName },
    Boolean,
    "template delete persistence"
  );
  await page.getByRole("button", { name: fixture.closeLabelPattern }).click();
  await page.locator(".row-template-dialog").waitFor({ state: "detached", timeout: 8_000 });

  await page.locator(".new-row-menu-toggle").first().click();
  const deletedTemplateMenuItems = await page.locator(".new-row-menu").getByRole("button", { name: fixture.uiTemplateName }).count();
  if (deletedTemplateMenuItems !== 0) {
    throw new Error(`Deleted template still appears in New menu ${deletedTemplateMenuItems} time(s).`);
  }
  await page.locator(".new-row-menu-toggle").first().click();
  await page.locator(".new-row-menu").waitFor({ state: "detached", timeout: 8_000 });

  const beforeIds = await currentRecordIds(page, fixture.databaseId);
  const primaryNewButton = page.locator(".new-row-menu-wrap .primary").first();
  await primaryNewButton.waitFor({ state: "visible", timeout: 8_000 });
  await primaryNewButton.click();
  const blankRow = await pollPageValue(
    page,
    async ({ databaseId, before }) => {
      const beforeIds = new Set(before);
      const bundle = await window.lotion.databases.get(databaseId);
      const created = bundle.records.find((record) => !beforeIds.has(String(record.id)));
      return created ? { id: String(created.id), title: String(created.title ?? "") } : null;
    },
    { databaseId: fixture.databaseId, before: [...beforeIds] },
    Boolean,
    "primary new blank row"
  ).catch(async () => {
    const debug = await page.evaluate(async (databaseId) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      const primary = document.querySelector(".new-row-menu-wrap .primary");
      return {
        recordCount: bundle.records.length,
        templateNames: (bundle.schema.templates ?? []).map((template) => template.name),
        viewDefaultTemplateId: view?.defaultTemplateId ?? null,
        primaryButtonText: primary?.textContent ?? null,
        menuOpen: Boolean(document.querySelector(".new-row-menu"))
      };
    }, fixture.databaseId);
    throw new Error(`Primary New did not create a row. Debug: ${JSON.stringify(debug)}`);
  });
  if (!blankRow || blankRow.title !== "New row") {
    throw new Error(`Primary New did not fall back to a blank row: ${JSON.stringify(blankRow)}`);
  }

  return {
    blankRowId: blankRow.id,
    blankRowTitle: blankRow.title
  };
}

async function assertCreateAndRenameView(page, fixture) {
  const before = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), fixture.databaseId);
  const beforeViewIds = new Set(before.views.map((view) => String(view.id)));
  const sourceView = before.views.find((view) => view.id === before.schema.defaultViewId) ?? before.views[0];
  if (!sourceView) throw new Error("Database fixture has no source view to clone.");

  await page.locator(".view-tab-add").click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  const createdBeforeRename = await pollPageValue(
    page,
    async ({ databaseId, existingViewIds }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const created = bundle.views.find((view) => !existingViewIds.includes(String(view.id)));
      return created ? {
        id: String(created.id),
        name: String(created.name),
        visibleFieldIds: created.visibleFieldIds,
        fieldOrder: created.fieldOrder,
        wrapFieldIds: created.wrapFieldIds ?? [],
        columnSummaries: created.columnSummaries ?? {}
      } : null;
    },
    { databaseId: fixture.databaseId, existingViewIds: [...beforeViewIds] },
    Boolean,
    "view creation"
  );
  if (!createdBeforeRename?.id) {
    throw new Error("View tab + did not create a new view.");
  }

  const nameInput = page
    .locator(".view-dialog label.form-row")
    .filter({ hasText: fixture.viewNameLabelPattern })
    .locator("input")
    .first();
  await nameInput.fill(fixture.createdViewName);
  await page.getByRole("button", { name: fixture.saveViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });

  const savedView = await pollPageValue(
    page,
    async ({ databaseId, viewId, viewName }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => String(item.id) === viewId);
      return view?.name === viewName ? {
        id: String(view.id),
        name: String(view.name),
        visibleFieldIds: view.visibleFieldIds,
        fieldOrder: view.fieldOrder,
        wrapFieldIds: view.wrapFieldIds ?? [],
        columnSummaries: view.columnSummaries ?? {}
      } : null;
    },
    {
      databaseId: fixture.databaseId,
      viewId: createdBeforeRename.id,
      viewName: fixture.createdViewName
    },
    Boolean,
    "view rename persistence"
  );
  if (!savedView) {
    throw new Error("Renamed view was not saved to the database bundle.");
  }
  await page.waitForFunction(
    (viewName) => Array.from(document.querySelectorAll(".view-tab"))
      .some((tab) => tab.textContent?.includes(viewName)),
    fixture.createdViewName,
    { timeout: 8_000 }
  );
  const activeTabText = (await page.locator(".view-tab.active").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (!activeTabText.includes(fixture.createdViewName)) {
    const allTabs = await page.locator(".view-tab").allTextContents();
    throw new Error(`Renamed view tab is not active. Active: ${activeTabText}; tabs: ${JSON.stringify(allTabs)}`);
  }
  assertStringArrayEquals(savedView.visibleFieldIds, sourceView.visibleFieldIds, "visible field ids");
  assertStringArrayEquals(savedView.fieldOrder, sourceView.fieldOrder, "field order");
  assertStringArrayEquals(savedView.wrapFieldIds, sourceView.wrapFieldIds ?? [], "wrap field ids");
  assertJsonEquals(savedView.columnSummaries, sourceView.columnSummaries ?? {}, "column summaries");

  return {
    viewId: savedView.id,
    viewName: savedView.name,
    visibleFieldCount: savedView.visibleFieldIds.length
  };
}

async function assertSetCreatedViewAsDefault(page, fixture, createdView) {
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".view-tab.active").filter({ hasText: createdView.viewName }).waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: fixture.setDefaultViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });

  const savedState = await pollPageValue(
    page,
    async ({ databaseId, viewId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      return {
        defaultViewId: String(bundle.schema.defaultViewId ?? ""),
        firstViewId: String(bundle.views[0]?.id ?? "")
      };
    },
    { databaseId: fixture.databaseId, viewId: createdView.viewId },
    (value) => value?.defaultViewId === createdView.viewId && value?.firstViewId === createdView.viewId,
    "set default view persistence"
  );
  const firstTabText = (await page.locator(".view-tab").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (!firstTabText.includes(createdView.viewName)) {
    throw new Error(`Default view did not move to the first tab: ${firstTabText}`);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab.active").filter({ hasText: createdView.viewName }).waitFor({ timeout: 8_000 });
  const reopenActiveTabText = (await page.locator(".view-tab.active").first().textContent({ timeout: 5_000 }))?.trim() ?? "";

  return {
    defaultViewId: savedState.defaultViewId,
    firstTabText,
    reopenActiveTabText
  };
}

async function assertColumnSummarySelection(page, fixture) {
  const summarySelect = page.locator('select[aria-label="Score summary"]').first();
  await summarySelect.waitFor({ timeout: 8_000 });
  await summarySelect.selectOption("sum");

  const savedState = await pollPageValue(
    page,
    async (databaseId) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      const numbers = bundle.records
        .map((record) => Number(record.score))
        .filter((value) => Number.isFinite(value));
      return {
        summaryType: view?.columnSummaries?.score ?? "",
        expectedValue: String(numbers.reduce((sum, value) => sum + value, 0))
      };
    },
    fixture.databaseId,
    (value) => value?.summaryType === "sum" && value.expectedValue !== "0",
    "column summary persistence"
  );

  const valueCell = summarySelect.locator("xpath=ancestor::td[1]");
  await valueCell.locator(".column-summary-value").filter({ hasText: savedState.expectedValue }).waitFor({ timeout: 8_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  const reloadedSelect = page.locator('select[aria-label="Score summary"]').first();
  await reloadedSelect.waitFor({ timeout: 8_000 });
  const selectedValue = await reloadedSelect.evaluate((select) => select instanceof HTMLSelectElement ? select.value : "");
  if (selectedValue !== "sum") {
    throw new Error(`Column summary selection did not survive reload: ${selectedValue}`);
  }
  const reloadedCell = reloadedSelect.locator("xpath=ancestor::td[1]");
  const valueText = (await reloadedCell.locator(".column-summary-value").textContent({ timeout: 8_000 }))?.trim() ?? "";
  if (!valueText.includes(savedState.expectedValue)) {
    throw new Error(`Column summary value did not survive reload: ${valueText} expected ${savedState.expectedValue}`);
  }

  return {
    fieldId: "score",
    summaryType: "sum",
    value: valueText
  };
}

async function assertViewSortFilterSettings(page, fixture) {
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  const dialog = page.locator(".view-dialog");
  await dialog
    .locator("label.form-row")
    .filter({ hasText: fixture.sortFieldLabelPattern })
    .locator("select")
    .selectOption({ label: "Score" });
  await dialog
    .locator("label.form-row")
    .filter({ hasText: fixture.sortDirectionLabelPattern })
    .locator("select")
    .selectOption("desc");
  await dialog
    .locator("label.form-row")
    .filter({ hasText: fixture.filterFieldLabelPattern })
    .locator("select")
    .selectOption({ label: "Status" });
  await dialog
    .locator("label.form-row")
    .filter({ hasText: fixture.filterValueLabelPattern })
    .locator("input")
    .fill(fixture.filterStatusValue);
  await page.getByRole("button", { name: fixture.saveViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });

  const savedState = await pollPageValue(
    page,
    async ({ databaseId, filterValue }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return {
        viewId: String(view?.id ?? ""),
        sortFieldId: String(view?.sorts?.[0]?.fieldId ?? ""),
        sortDirection: String(view?.sorts?.[0]?.direction ?? ""),
        filterFieldId: String(view?.filters?.[0]?.fieldId ?? ""),
        filterOperator: String(view?.filters?.[0]?.operator ?? ""),
        filterValue: String(view?.filters?.[0]?.value ?? ""),
        ready:
          view?.sorts?.[0]?.fieldId === "score" &&
          view?.sorts?.[0]?.direction === "desc" &&
          view?.filters?.[0]?.fieldId === "status" &&
          view?.filters?.[0]?.operator === "is" &&
          String(view?.filters?.[0]?.value ?? "") === filterValue
      };
    },
    {
      databaseId: fixture.databaseId,
      filterValue: fixture.filterStatusValue
    },
    (value) => Boolean(value?.ready),
    "view sort/filter persistence"
  );
  await assertFilteredSortedTable(page, fixture);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertFilteredSortedTable(page, fixture);

  return {
    viewId: savedState.viewId,
    sortFieldId: savedState.sortFieldId,
    sortDirection: savedState.sortDirection,
    filterFieldId: savedState.filterFieldId,
    filterValue: savedState.filterValue,
    firstVisibleTitle: fixture.blockedHighTitle
  };
}

async function assertFilteredSortedTable(page, fixture) {
  await page.waitForFunction(
    ({ expectedFirstTitle, forbiddenTitle, expectedStatus }) => {
      const rows = Array.from(document.querySelectorAll(".database-table .table-scroll tbody tr"))
        .filter((row) => !row.classList.contains("add-row") && !row.classList.contains("virtual-spacer"));
      const texts = rows.map((row) => row.textContent || "");
      return (
        texts.length > 0 &&
        texts[0].includes(expectedFirstTitle) &&
        texts.every((text) => text.includes(expectedStatus)) &&
        texts.every((text) => !text.includes(forbiddenTitle))
      );
    },
    {
      expectedFirstTitle: fixture.blockedHighTitle,
      forbiddenTitle: fixture.readySeedTitle,
      expectedStatus: fixture.filterStatusValue
    },
    { timeout: 8_000 }
  );
}

async function assertToolbarSortFilterPopovers(page, fixture) {
  await clearToolbarFilters(page, fixture);
  await clearToolbarSorts(page, fixture);

  await page.locator('.view-tab-actions .toolbar-icon[aria-label="Filter"]').first().click();
  await page.locator(".filter-popover").waitFor({ timeout: 8_000 });
  await page.locator(".filter-popover .popover-add").click();
  const filterRow = page.locator(".filter-popover .filter-row").first();
  await filterRow.locator("select").first().selectOption({ label: "Status" });
  await filterRow.locator("input").fill(fixture.toolbarFilterStatusValue);
  await pollPageValue(
    page,
    async ({ databaseId, filterValue }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return {
        filterFieldId: String(view?.filters?.[0]?.fieldId ?? ""),
        filterOperator: String(view?.filters?.[0]?.operator ?? ""),
        filterValue: String(view?.filters?.[0]?.value ?? ""),
        ready:
          view?.filters?.[0]?.fieldId === "status" &&
          view?.filters?.[0]?.operator === "is" &&
          String(view?.filters?.[0]?.value ?? "") === filterValue
      };
    },
    {
      databaseId: fixture.databaseId,
      filterValue: fixture.toolbarFilterStatusValue
    },
    (value) => Boolean(value?.ready),
    "toolbar filter persistence"
  );

  await page.locator('.view-tab-actions .toolbar-icon[aria-label="Sort"]').first().click();
  await page.locator(".sort-popover").waitFor({ timeout: 8_000 });
  await page.locator(".sort-popover .popover-add").click();
  const sortRow = page.locator(".sort-popover .sort-row").first();
  await sortRow.locator("select").nth(0).selectOption({ label: "Score" });
  await sortRow.locator("select").nth(1).selectOption("desc");
  const savedState = await pollPageValue(
    page,
    async ({ databaseId, filterValue }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return {
        viewId: String(view?.id ?? ""),
        sortFieldId: String(view?.sorts?.[0]?.fieldId ?? ""),
        sortDirection: String(view?.sorts?.[0]?.direction ?? ""),
        filterFieldId: String(view?.filters?.[0]?.fieldId ?? ""),
        filterOperator: String(view?.filters?.[0]?.operator ?? ""),
        filterValue: String(view?.filters?.[0]?.value ?? ""),
        ready:
          view?.sorts?.[0]?.fieldId === "score" &&
          view?.sorts?.[0]?.direction === "desc" &&
          view?.filters?.[0]?.fieldId === "status" &&
          view?.filters?.[0]?.operator === "is" &&
          String(view?.filters?.[0]?.value ?? "") === filterValue
      };
    },
    {
      databaseId: fixture.databaseId,
      filterValue: fixture.toolbarFilterStatusValue
    },
    (value) => Boolean(value?.ready),
    "toolbar sort/filter persistence"
  );
  await assertToolbarFilteredSortedTable(page, fixture);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertToolbarFilteredSortedTable(page, fixture);

  return {
    viewId: savedState.viewId,
    sortFieldId: savedState.sortFieldId,
    sortDirection: savedState.sortDirection,
    filterFieldId: savedState.filterFieldId,
    filterValue: savedState.filterValue,
    firstVisibleTitle: fixture.templateRowTitle
  };
}

async function clearToolbarFilters(page, fixture) {
  await page.locator('.view-tab-actions .toolbar-icon[aria-label="Filter"]').first().click();
  await page.locator(".filter-popover").waitFor({ timeout: 8_000 });
  while (await page.locator(".filter-popover .popover-remove").count()) {
    await page.locator(".filter-popover .popover-remove").first().click();
  }
  await pollPageValue(
    page,
    async (databaseId) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return (view?.filters ?? []).length;
    },
    fixture.databaseId,
    (count) => count === 0,
    "toolbar filter clear"
  );
}

async function clearToolbarSorts(page, fixture) {
  await page.locator('.view-tab-actions .toolbar-icon[aria-label="Sort"]').first().click();
  await page.locator(".sort-popover").waitFor({ timeout: 8_000 });
  while (await page.locator(".sort-popover .popover-remove").count()) {
    await page.locator(".sort-popover .popover-remove").first().click();
  }
  await pollPageValue(
    page,
    async (databaseId) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      return (view?.sorts ?? []).length;
    },
    fixture.databaseId,
    (count) => count === 0,
    "toolbar sort clear"
  );
}

async function assertToolbarFilteredSortedTable(page, fixture) {
  await page.waitForFunction(
    ({ expectedFirstTitle, forbiddenTitle, expectedStatus }) => {
      const rows = Array.from(document.querySelectorAll(".database-table .table-scroll tbody tr"))
        .filter((row) => !row.classList.contains("add-row") && !row.classList.contains("virtual-spacer"));
      const texts = rows.map((row) => row.textContent || "");
      return (
        texts.length > 0 &&
        texts[0].includes(expectedFirstTitle) &&
        texts.every((text) => text.includes(expectedStatus)) &&
        texts.every((text) => !text.includes(forbiddenTitle))
      );
    },
    {
      expectedFirstTitle: fixture.templateRowTitle,
      forbiddenTitle: fixture.blockedHighTitle,
      expectedStatus: fixture.toolbarFilterStatusValue
    },
    { timeout: 8_000 }
  );
}

async function assertFieldVisibilityAndOrderSettings(page, fixture) {
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  const dialog = page.locator(".view-dialog");
  const notesRow = dialog.locator(".view-field-row").filter({ hasText: "Notes" }).first();
  await notesRow.locator('input[type="checkbox"]').uncheck();
  await page.waitForFunction(() => {
    const notesRow = document.querySelector('.view-dialog .view-field-row[data-field-id="notes"]');
    return notesRow && !notesRow.classList.contains("visible");
  }, undefined, { timeout: 8_000 });
  const scoreUpButton = dialog.locator('button[aria-label="Move Score up"]');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const order = await dialogFieldOrder(page);
    const scoreIndex = order.indexOf("score");
    const statusIndex = order.indexOf("status");
    if (scoreIndex >= 0 && statusIndex >= 0 && scoreIndex < statusIndex) break;
    await scoreUpButton.click();
    await page.waitForFunction((previousOrder) => {
      const rows = Array.from(document.querySelectorAll(".view-dialog .view-field-row"));
      const fieldIds = rows.map((row) => row.getAttribute("data-field-id") ?? "");
      return fieldIds.join("|") !== previousOrder;
    }, order.join("|"), { timeout: 8_000 });
  }
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll(".view-dialog .view-field-row"));
    const fieldIds = rows.map((row) => row.getAttribute("data-field-id"));
    const scoreIndex = fieldIds.indexOf("score");
    const statusIndex = fieldIds.indexOf("status");
    return scoreIndex >= 0 && statusIndex >= 0 && scoreIndex < statusIndex;
  }, undefined, { timeout: 8_000 });
  await page.getByRole("button", { name: fixture.saveViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });

  const savedState = await pollPageValue(
    page,
    async (databaseId) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
      const visibleFieldIds = (view?.visibleFieldIds ?? []).map(String);
      const fieldOrder = (view?.fieldOrder ?? []).map(String);
      return {
        visibleFieldIds,
        fieldOrder,
        scoreIndex: fieldOrder.indexOf("score"),
        statusIndex: fieldOrder.indexOf("status"),
        ready:
          visibleFieldIds.includes("score") &&
          visibleFieldIds.includes("status") &&
          !visibleFieldIds.includes("notes") &&
          fieldOrder.indexOf("score") >= 0 &&
          fieldOrder.indexOf("status") >= 0 &&
          fieldOrder.indexOf("score") < fieldOrder.indexOf("status")
      };
    },
    fixture.databaseId,
    (value) => Boolean(value?.ready),
    "field visibility/order persistence"
  );
  const headerOrder = await assertFieldHeaderOrder(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await assertFieldHeaderOrder(page);

  return {
    hiddenFieldId: "notes",
    fieldBeforeStatus: "score",
    headerOrder,
    savedFieldOrder: savedState.fieldOrder
  };
}

async function dialogFieldOrder(page) {
  return page.evaluate(() => (
    Array.from(document.querySelectorAll(".view-dialog .view-field-row"))
      .map((row) => row.getAttribute("data-field-id") ?? "")
      .filter(Boolean)
  ));
}

async function assertFieldHeaderOrder(page) {
  const headerOrder = await pollPageValue(
    page,
    async () => {
      const names = Array.from(document.querySelectorAll(".database-table .table-scroll thead .field-header-name"))
        .map((node) => node.textContent?.trim() ?? "")
        .filter(Boolean);
      return {
        names,
        scoreIndex: names.indexOf("Score"),
        statusIndex: names.indexOf("Status"),
        notesIndex: names.indexOf("Notes"),
        ready:
          names.includes("Score") &&
          names.includes("Status") &&
          !names.includes("Notes") &&
          names.indexOf("Score") < names.indexOf("Status")
      };
    },
    undefined,
    (value) => Boolean(value?.ready),
    "field header order"
  );
  return headerOrder.names;
}

async function assertMultiSelectOptionDropdown(page, fixture) {
  const targetRow = page.locator(".database-table .table-scroll tbody tr")
    .filter({ hasText: fixture.readySeedTitle })
    .first();
  await targetRow.waitFor({ timeout: 8_000 });
  await targetRow.locator(".option-dropdown-trigger").nth(1).click();
  await page.locator(".option-menu").waitFor({ timeout: 8_000 });
  await assertOptionMenuWithinViewport(page);
  const optionNames = await page.locator(".option-menu .option-menu-item .option-pill").evaluateAll((nodes) => (
    nodes.map((node) => node.textContent?.trim() ?? "").filter(Boolean)
  ));
  for (const expected of [fixture.labelAlpha, fixture.labelBeta, fixture.labelGamma]) {
    if (!optionNames.includes(expected)) {
      throw new Error(`Multi-select dropdown is missing option "${expected}": ${JSON.stringify(optionNames)}`);
    }
  }
  await page.locator(".option-menu .option-menu-item").filter({ hasText: fixture.labelGamma }).first().click();
  const savedState = await pollPageValue(
    page,
    async ({ databaseId, rowId, expectedA, expectedB }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((item) => String(item.id) === rowId);
      const labels = String(record?.labels ?? "");
      return {
        rowId,
        labels,
        ready: labels.split(";").map((item) => item.trim()).includes(expectedA) &&
          labels.split(";").map((item) => item.trim()).includes(expectedB)
      };
    },
    {
      databaseId: fixture.databaseId,
      rowId: fixture.readySeedRowId,
      expectedA: fixture.labelAlpha,
      expectedB: fixture.labelGamma
    },
    (value) => Boolean(value?.ready),
    "multi-select option cell persistence"
  );
  await page.mouse.click(8, 8);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await pollPageValue(
    page,
    async ({ databaseId, rowId, expectedA, expectedB }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((item) => String(item.id) === rowId);
      const values = String(record?.labels ?? "").split(";").map((item) => item.trim());
      return values.includes(expectedA) && values.includes(expectedB);
    },
    {
      databaseId: fixture.databaseId,
      rowId: fixture.readySeedRowId,
      expectedA: fixture.labelAlpha,
      expectedB: fixture.labelGamma
    },
    Boolean,
    "multi-select option cell reload persistence"
  );

  return {
    rowId: fixture.readySeedRowId,
    labels: savedState.labels,
    optionNames
  };
}

async function assertSelectOptionDropdown(page, fixture) {
  const targetRow = page.locator(".database-table .table-scroll tbody tr")
    .filter({ hasText: fixture.readySeedTitle })
    .first();
  await targetRow.waitFor({ timeout: 8_000 });
  await targetRow.locator(".option-dropdown-trigger").first().click();
  await page.locator(".option-menu").waitFor({ timeout: 8_000 });
  await assertOptionMenuWithinViewport(page);
  const optionNames = await page.locator(".option-menu .option-menu-item .option-pill").evaluateAll((nodes) => (
    nodes.map((node) => node.textContent?.trim() ?? "").filter(Boolean)
  ));
  for (const expected of [fixture.templateStatus, fixture.uiTemplateStatus, fixture.deferredStatus]) {
    if (!optionNames.includes(expected)) {
      throw new Error(`Select dropdown is missing option "${expected}": ${JSON.stringify(optionNames)}`);
    }
  }
  await page.locator(".option-menu .option-menu-item").filter({ hasText: fixture.deferredStatus }).first().click();
  const savedState = await pollPageValue(
    page,
    async ({ databaseId, rowId, expectedStatus }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((item) => String(item.id) === rowId);
      return {
        rowId,
        status: String(record?.status ?? ""),
        ready: String(record?.status ?? "") === expectedStatus
      };
    },
    {
      databaseId: fixture.databaseId,
      rowId: fixture.readySeedRowId,
      expectedStatus: fixture.deferredStatus
    },
    (value) => Boolean(value?.ready),
    "select option cell persistence"
  );
  await page.waitForFunction(
    (title) => !Array.from(document.querySelectorAll(".database-table .table-scroll tbody tr"))
      .some((row) => (row.textContent || "").includes(title)),
    fixture.readySeedTitle,
    { timeout: 8_000 }
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await pollPageValue(
    page,
    async ({ databaseId, rowId, expectedStatus }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((item) => String(item.id) === rowId);
      return String(record?.status ?? "") === expectedStatus;
    },
    {
      databaseId: fixture.databaseId,
      rowId: fixture.readySeedRowId,
      expectedStatus: fixture.deferredStatus
    },
    Boolean,
    "select option cell reload persistence"
  );

  return {
    rowId: fixture.readySeedRowId,
    status: savedState.status,
    optionNames
  };
}

async function assertOptionMenuWithinViewport(page) {
  await pollPageValue(
    page,
    () => {
      const menu = document.querySelector(".option-menu");
      if (!menu) return { ready: false, reason: "missing menu" };
      const rect = menu.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        ready: rect.left >= 0 &&
          rect.right <= window.innerWidth &&
          rect.top >= 0 &&
          rect.bottom <= window.innerHeight
      };
    },
    undefined,
    (value) => Boolean(value?.ready),
    "option menu viewport bounds"
  );
}

async function assertViewTypeSwitch(page, fixture, createdView, viewport, artifactRoot) {
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".view-tab.active").filter({ hasText: createdView.viewName }).waitFor({ timeout: 8_000 });
  const visitedTypes = [];
  visitedTypes.push((await switchActiveViewType(page, fixture, createdView, "list", ".list-view-body")).viewType);
  const listRowIcon = await assertListRowIcon(page, fixture);
  const listDefaultIconClass = await assertListDefaultRowIcon(page, fixture);
  const listSnapshot = await captureDatabaseViewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "list",
      rowIcon: listRowIcon,
      defaultIconClass: listDefaultIconClass,
      viewId: createdView.viewId,
      viewName: createdView.viewName
    },
    page,
    viewport
  });
  const listOpenedRowTitle = await assertListRowOpens(page, fixture, createdView);
  const galleryState = await switchActiveViewType(page, fixture, createdView, "gallery", ".gallery-body");
  visitedTypes.push(galleryState.viewType);
  const galleryCoverImageSrc = await assertGalleryCoverImage(page, fixture);
  const galleryRowIcon = await assertGalleryRowIcon(page, fixture);
  const galleryDefaultIconClass = await assertGalleryDefaultRowIcon(page, fixture);
  const gallerySnapshot = await captureDatabaseViewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "gallery",
      coverFieldId: galleryState.coverFieldId,
      coverImageSrc: galleryCoverImageSrc,
      rowIcon: galleryRowIcon,
      defaultIconClass: galleryDefaultIconClass,
      viewId: createdView.viewId,
      viewName: createdView.viewName
    },
    page,
    viewport
  });
  const galleryOpenedRowTitle = await assertGalleryCardOpens(page, fixture, createdView);
  const calendarState = await switchActiveViewType(page, fixture, createdView, "calendar", ".calendar-body");
  visitedTypes.push(calendarState.viewType);
  const calendarRowIcon = await assertCalendarRowIcon(page, fixture);
  const calendarDefaultIconClass = await assertCalendarDefaultRowIcon(page, fixture);
  const calendarRenderedTitle = await assertCalendarDateFieldRows(page, fixture);
  const calendarOverflowMarker = await assertCalendarOverflowRows(page, fixture);
  const calendarSnapshot = await captureDatabaseViewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "calendar",
      dateFieldId: calendarState.dateFieldId,
      renderedTitle: calendarRenderedTitle,
      overflowMarker: calendarOverflowMarker,
      rowIcon: calendarRowIcon,
      defaultIconClass: calendarDefaultIconClass,
      viewId: createdView.viewId,
      viewName: createdView.viewName
    },
    page,
    viewport
  });
  const calendarOverflowExpandedRows = await assertCalendarOverflowInlineExpand(page, fixture);
  const calendarOverflowResetMarker = await assertCalendarOverflowReset(page, fixture);
  const calendarOverflowOpenedRowTitle = await assertCalendarOverflowRowOpens(page, fixture, createdView);
  const calendarNavigationRestoredTitle = await assertCalendarMonthNavigation(page, fixture);
  const calendarTodayRestoredTitle = await assertCalendarTodayButton(page, fixture);
  const calendarTodayCellDay = await assertCalendarTodayCell(page);
  const calendarOpenedRowTitle = await assertCalendarRowOpens(page, fixture, createdView);
  const savedState = await switchActiveViewType(page, fixture, createdView, "list", ".list-view-body");
  visitedTypes.push(savedState.viewType);

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".view-tab.active").filter({ hasText: createdView.viewName }).waitFor({ timeout: 8_000 });
  await page.locator(".list-view-body").waitFor({ timeout: 8_000 });

  return {
    viewId: savedState.viewId,
    viewType: savedState.viewType,
    listRowIcon,
    listDefaultIconClass,
    listOpenedRowTitle,
    galleryCoverFieldId: galleryState.coverFieldId,
    galleryCoverImageSrc,
    galleryRowIcon,
    galleryDefaultIconClass,
    galleryOpenedRowTitle,
    calendarDateFieldId: calendarState.dateFieldId,
    calendarRowIcon,
    calendarDefaultIconClass,
    calendarRenderedTitle,
    calendarOverflowMarker,
    calendarOverflowExpandedRows,
    calendarOverflowResetMarker,
    calendarNavigationRestoredTitle,
    calendarTodayRestoredTitle,
    calendarTodayCellDay,
    calendarOpenedRowTitle,
    calendarOverflowOpenedRowTitle,
    visitedTypes,
    visualSnapshots: [listSnapshot, gallerySnapshot, calendarSnapshot]
  };
}

async function captureDatabaseViewSnapshot({ artifactRoot, fixture, metadata, page, viewport }) {
  const locator = page.locator(".database-table").first();
  await locator.waitFor({ timeout: 8_000 });
  const visibleState = await locator.evaluate((table) => {
    const rect = table.getBoundingClientRect();
    const activeTab = table.querySelector(".view-tab.active")?.textContent?.trim() ?? "";
    return {
      activeTab,
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1)),
      listRows: table.querySelectorAll(".list-view-row").length,
      galleryCards: table.querySelectorAll(".gallery-card").length,
      calendarRows: table.querySelectorAll(".calendar-cell-row").length,
      calendarOverflowControls: table.querySelectorAll(".calendar-cell-more").length,
      toolbarButtons: table.querySelectorAll(".database-toolbar button").length
    };
  });
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator,
    metadata: {
      databaseId: fixture.databaseId,
      databaseName: fixture.databaseName,
      visibleState,
      ...metadata
    },
    name: `database-${metadata.phase}-view-${viewport.name}`,
    page,
    viewport
  });
  return {
    phase: metadata.phase,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: Number(snapshot.rect.height.toFixed(1)),
    width: Number(snapshot.rect.width.toFixed(1)),
    visibleState
  };
}

async function assertListRowIcon(page, fixture) {
  return pollPageValue(
    page,
    ({ expectedTitle, expectedIcon }) => {
      const rows = Array.from(document.querySelectorAll(".list-view-row"));
      const target = rows.find((row) => (row.textContent || "").includes(expectedTitle));
      const icon = target?.querySelector(".entity-icon-emoji")?.textContent?.trim() ?? "";
      return {
        targetFound: Boolean(target),
        rowTexts: rows.map((row) => (row.textContent || "").trim()).slice(0, 8),
        icon,
        ready: icon === expectedIcon
      };
    },
    {
      expectedTitle: fixture.calendarOverflowTitles[0],
      expectedIcon: fixture.galleryRowIcon
    },
    (value) => Boolean(value?.ready),
    "list row icon"
  ).then((value) => value.icon);
}

async function assertListDefaultRowIcon(page, fixture) {
  return pollPageValue(
    page,
    (expectedTitle) => {
      const rows = Array.from(document.querySelectorAll(".list-view-row"));
      const target = rows.find((row) => (row.textContent || "").includes(expectedTitle));
      const icon = target?.querySelector(".entity-icon-default");
      return {
        targetFound: Boolean(target),
        iconClass: icon?.className ?? "",
        ready: Boolean(icon)
      };
    },
    fixture.templateRowTitle,
    (value) => Boolean(value?.ready),
    "list default row icon"
  ).then((value) => value.iconClass);
}

async function assertListRowOpens(page, fixture, createdView) {
  const expectedTitle = fixture.calendarOverflowTitles[0];
  await page.locator(".list-view-row").filter({ hasText: expectedTitle }).first().click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    expectedTitle,
    { timeout: 8_000 }
  );
  const title = await page.locator(".title-input").inputValue({ timeout: 5_000 });
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".list-view-body").waitFor({ timeout: 8_000 });
  return title;
}

async function assertGalleryCoverImage(page, fixture) {
  return pollPageValue(
    page,
    ({ expectedTitle, expectedSrc }) => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      const target = cards.find((card) => (card.textContent || "").includes(expectedTitle));
      const img = target?.querySelector(".gallery-card-cover img");
      const src = img?.getAttribute("src") || "";
      return {
        cardTexts: cards.map((card) => (card.textContent || "").trim()).slice(0, 8),
        targetFound: Boolean(target),
        src,
        ready: Boolean(target && src === expectedSrc)
      };
    },
    {
      expectedTitle: fixture.templateRowTitle,
      expectedSrc: fixture.galleryCoverUrl
    },
    (value) => Boolean(value?.ready),
    "gallery cover image source"
  ).then((value) => value.src);
}

async function assertGalleryRowIcon(page, fixture) {
  return pollPageValue(
    page,
    ({ expectedTitle, expectedIcon }) => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      const target = cards.find((card) => (card.textContent || "").includes(expectedTitle));
      const icon = target?.querySelector(".gallery-card-title .entity-icon-emoji")?.textContent?.trim() ?? "";
      const titleIcon = target?.querySelector(".gallery-card-title .entity-icon");
      return {
        targetFound: Boolean(target),
        cardTexts: cards.map((card) => (card.textContent || "").trim()).slice(0, 8),
        icon,
        iconClass: titleIcon?.className ?? "",
        iconText: titleIcon?.textContent?.trim() ?? "",
        ready: icon === expectedIcon
      };
    },
    {
      expectedTitle: fixture.calendarOverflowTitles[0],
      expectedIcon: fixture.galleryRowIcon
    },
    (value) => Boolean(value?.ready),
    "gallery card row icon"
  ).then((value) => value.icon);
}

async function assertGalleryDefaultRowIcon(page, fixture) {
  return pollPageValue(
    page,
    (expectedTitle) => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      const target = cards.find((card) => (card.textContent || "").includes(expectedTitle));
      const icon = target?.querySelector(".gallery-card-title .entity-icon-default");
      return {
        targetFound: Boolean(target),
        iconClass: icon?.className ?? "",
        ready: Boolean(icon)
      };
    },
    fixture.templateRowTitle,
    (value) => Boolean(value?.ready),
    "gallery default row icon"
  ).then((value) => value.iconClass);
}

async function assertGalleryCardOpens(page, fixture, createdView) {
  const expectedTitle = fixture.calendarOverflowTitles[0];
  await page.locator(".gallery-card").filter({ hasText: expectedTitle }).first().click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    expectedTitle,
    { timeout: 8_000 }
  );
  const title = await page.locator(".title-input").inputValue({ timeout: 5_000 });
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".gallery-body").waitFor({ timeout: 8_000 });
  return title;
}

async function assertCalendarDateFieldRows(page, fixture) {
  return pollPageValue(
    page,
    (expectedTitle) => {
      const rows = Array.from(document.querySelectorAll(".calendar-cell-row"));
      const title = rows
        .map((row) => row.textContent?.trim() ?? "")
        .find((text) => text === expectedTitle) || "";
      return {
        titles: rows.map((row) => row.textContent?.trim() ?? "").filter(Boolean).slice(0, 8),
        title,
        ready: title === expectedTitle
      };
    },
    fixture.templateRowTitle,
    (value) => Boolean(value?.ready),
    "calendar selected date field row rendering"
  ).then((value) => value.title);
}

async function assertCalendarRowIcon(page, fixture) {
  return pollPageValue(
    page,
    ({ expectedTitle, expectedIcon }) => {
      const rows = Array.from(document.querySelectorAll(".calendar-cell-row"));
      const target = rows.find((row) => (row.textContent || "").includes(expectedTitle));
      const icon = target?.querySelector(".entity-icon-emoji")?.textContent?.trim() ?? "";
      return {
        targetFound: Boolean(target),
        rowTexts: rows.map((row) => (row.textContent || "").trim()).slice(0, 8),
        icon,
        ready: icon === expectedIcon
      };
    },
    {
      expectedTitle: fixture.calendarOverflowTitles[0],
      expectedIcon: fixture.galleryRowIcon
    },
    (value) => Boolean(value?.ready),
    "calendar row icon"
  ).then((value) => value.icon);
}

async function assertCalendarDefaultRowIcon(page, fixture) {
  return pollPageValue(
    page,
    (expectedTitle) => {
      const rows = Array.from(document.querySelectorAll(".calendar-cell-row"));
      const target = rows.find((row) => (row.textContent || "").includes(expectedTitle));
      const icon = target?.querySelector(".entity-icon-default");
      return {
        targetFound: Boolean(target),
        iconClass: icon?.className ?? "",
        ready: Boolean(icon)
      };
    },
    fixture.templateRowTitle,
    (value) => Boolean(value?.ready),
    "calendar default row icon"
  ).then((value) => value.iconClass);
}

async function assertCalendarRowOpens(page, fixture, createdView) {
  const expectedTitle = fixture.calendarOverflowTitles[0];
  await page.locator(".calendar-cell-row").filter({ hasText: expectedTitle }).first().click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    expectedTitle,
    { timeout: 8_000 }
  );
  const title = await page.locator(".title-input").inputValue({ timeout: 5_000 });
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".calendar-body").waitFor({ timeout: 8_000 });
  return title;
}

async function assertCalendarOverflowRows(page, fixture) {
  return pollPageValue(
    page,
    ({ expectedDay, expectedMarker }) => {
      const cells = Array.from(document.querySelectorAll(".calendar-cell"));
      const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === expectedDay);
      const visibleRows = Array.from(target?.querySelectorAll(".calendar-cell-row") ?? [])
        .map((row) => row.textContent?.trim() ?? "")
        .filter(Boolean);
      const marker = target?.querySelector(".calendar-cell-more")?.textContent?.trim() ?? "";
      return {
        visibleRows,
        marker,
        ready: visibleRows.length === 3 && marker === expectedMarker
      };
    },
    {
      expectedDay: String(Number(fixture.calendarDateValue.split("-").at(-1) ?? "0")),
      expectedMarker: "+1"
    },
    (value) => Boolean(value?.ready),
    "calendar overflow row count"
  ).then((value) => value.marker);
}

async function assertCalendarOverflowInlineExpand(page, fixture) {
  const expectedDay = String(Number(fixture.calendarDateValue.split("-").at(-1) ?? "0"));
  await page.evaluate((dayText) => {
    const cells = Array.from(document.querySelectorAll(".calendar-cell"));
    const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === dayText);
    const button = target?.querySelector(".calendar-cell-more");
    if (button instanceof HTMLButtonElement) button.click();
  }, expectedDay);
  const expanded = await pollPageValue(
    page,
    ({ dayText }) => {
      const cells = Array.from(document.querySelectorAll(".calendar-cell"));
      const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === dayText);
      const rows = Array.from(target?.querySelectorAll(".calendar-cell-row") ?? [])
        .map((row) => row.textContent?.trim() ?? "")
        .filter(Boolean);
      const button = target?.querySelector(".calendar-cell-more");
      const marker = button?.textContent?.trim() ?? "";
      const expanded = button?.getAttribute("aria-expanded") ?? "";
      return {
        rows,
        marker,
        expanded,
        ready: rows.length === 4 && marker === "收起" && expanded === "true"
      };
    },
    { dayText: expectedDay },
    (value) => Boolean(value?.ready),
    "calendar overflow inline expand"
  );
  await page.evaluate((dayText) => {
    const cells = Array.from(document.querySelectorAll(".calendar-cell"));
    const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === dayText);
    const button = target?.querySelector(".calendar-cell-more");
    if (button instanceof HTMLButtonElement) button.click();
  }, expectedDay);
  await pollPageValue(
    page,
    ({ dayText }) => {
      const cells = Array.from(document.querySelectorAll(".calendar-cell"));
      const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === dayText);
      const rows = Array.from(target?.querySelectorAll(".calendar-cell-row") ?? [])
        .map((row) => row.textContent?.trim() ?? "")
        .filter(Boolean);
      const button = target?.querySelector(".calendar-cell-more");
      const marker = button?.textContent?.trim() ?? "";
      const expanded = button?.getAttribute("aria-expanded") ?? "";
      return {
        rows,
        marker,
        expanded,
        ready: rows.length === 3 && marker === "+1" && expanded === "false"
      };
    },
    { dayText: expectedDay },
    (value) => Boolean(value?.ready),
    "calendar overflow inline collapse"
  );
  return expanded.rows.length;
}

async function assertCalendarOverflowReset(page, fixture) {
  const expectedDay = String(Number(fixture.calendarDateValue.split("-").at(-1) ?? "0"));
  await clickCalendarOverflowButton(page, expectedDay);
  await page.locator(".calendar-today").first().click();
  await waitForCalendarOverflowCollapsed(page, expectedDay, "calendar overflow reset on today");

  await clickCalendarOverflowButton(page, expectedDay);
  const label = page.locator(".calendar-month-label").first();
  const currentLabel = (await label.textContent({ timeout: 8_000 }))?.trim() ?? "";
  await page.locator(".calendar-nav").nth(1).click();
  await page.waitForFunction(
    (previousLabel) => document.querySelector(".calendar-month-label")?.textContent?.trim() !== previousLabel,
    currentLabel,
    { timeout: 8_000 }
  );
  await page.locator(".calendar-nav").first().click();
  const collapsed = await waitForCalendarOverflowCollapsed(page, expectedDay, "calendar overflow reset on month navigation");
  return collapsed.marker;
}

async function assertCalendarOverflowRowOpens(page, fixture, createdView) {
  const expectedDay = String(Number(fixture.calendarDateValue.split("-").at(-1) ?? "0"));
  const expectedTitle = fixture.calendarOverflowTitles[2];
  await clickCalendarOverflowButton(page, expectedDay);
  await page.locator(".calendar-cell-row").filter({ hasText: expectedTitle }).first().click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    expectedTitle,
    { timeout: 8_000 }
  );
  const title = await page.locator(".title-input").inputValue({ timeout: 5_000 });
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: createdView.viewName }).click();
  await page.locator(".calendar-body").waitFor({ timeout: 8_000 });
  return title;
}

async function clickCalendarOverflowButton(page, expectedDay) {
  await page.evaluate((dayText) => {
    const cells = Array.from(document.querySelectorAll(".calendar-cell"));
    const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === dayText);
    const button = target?.querySelector(".calendar-cell-more");
    if (button instanceof HTMLButtonElement) button.click();
  }, expectedDay);
}

async function waitForCalendarOverflowCollapsed(page, expectedDay, label) {
  return pollPageValue(
    page,
    (dayText) => {
      const cells = Array.from(document.querySelectorAll(".calendar-cell"));
      const target = cells.find((cell) => cell.querySelector(".calendar-cell-day")?.textContent?.trim() === dayText);
      const rows = Array.from(target?.querySelectorAll(".calendar-cell-row") ?? [])
        .map((row) => row.textContent?.trim() ?? "")
        .filter(Boolean);
      const button = target?.querySelector(".calendar-cell-more");
      const snapshot = {
        rows,
        marker: button?.textContent?.trim() ?? "",
        expanded: button?.getAttribute("aria-expanded") ?? ""
      };
      return {
        ...snapshot,
        ready: snapshot.rows.length === 3 && snapshot.marker === "+1" && snapshot.expanded === "false"
      };
    },
    expectedDay,
    (value) => Boolean(value?.ready),
    label
  );
}

async function assertCalendarMonthNavigation(page, fixture) {
  const label = page.locator(".calendar-month-label").first();
  const initialLabel = (await label.textContent({ timeout: 8_000 }))?.trim() ?? "";
  await page.locator(".calendar-nav").nth(1).click();
  await page.waitForFunction(
    ({ previousLabel, title }) => {
      const currentLabel = document.querySelector(".calendar-month-label")?.textContent?.trim() ?? "";
      const titles = Array.from(document.querySelectorAll(".calendar-cell-row"))
        .map((row) => row.textContent?.trim() ?? "");
      return currentLabel !== previousLabel && !titles.includes(title);
    },
    {
      previousLabel: initialLabel,
      title: fixture.templateRowTitle
    },
    { timeout: 8_000 }
  );
  await page.locator(".calendar-nav").first().click();
  return pollPageValue(
    page,
    ({ expectedLabel, expectedTitle }) => {
      const currentLabel = document.querySelector(".calendar-month-label")?.textContent?.trim() ?? "";
      const title = Array.from(document.querySelectorAll(".calendar-cell-row"))
        .map((row) => row.textContent?.trim() ?? "")
        .find((text) => text === expectedTitle) || "";
      return {
        label: currentLabel,
        title,
        ready: currentLabel === expectedLabel && title === expectedTitle
      };
    },
    {
      expectedLabel: initialLabel,
      expectedTitle: fixture.templateRowTitle
    },
    (value) => Boolean(value?.ready),
    "calendar month navigation restore"
  ).then((value) => value.title);
}

async function assertCalendarTodayButton(page, fixture) {
  const label = page.locator(".calendar-month-label").first();
  const currentLabel = (await label.textContent({ timeout: 8_000 }))?.trim() ?? "";
  await page.locator(".calendar-nav").nth(1).click();
  await page.waitForFunction(
    (previousLabel) => {
      const nextLabel = document.querySelector(".calendar-month-label")?.textContent?.trim() ?? "";
      return nextLabel !== previousLabel;
    },
    currentLabel,
    { timeout: 8_000 }
  );
  await page.locator(".calendar-today").first().click();
  return pollPageValue(
    page,
    ({ expectedLabel, expectedTitle }) => {
      const labelText = document.querySelector(".calendar-month-label")?.textContent?.trim() ?? "";
      const title = Array.from(document.querySelectorAll(".calendar-cell-row"))
        .map((row) => row.textContent?.trim() ?? "")
        .find((text) => text === expectedTitle) || "";
      return {
        label: labelText,
        title,
        ready: labelText === expectedLabel && title === expectedTitle
      };
    },
    {
      expectedLabel: currentLabel,
      expectedTitle: fixture.templateRowTitle
    },
    (value) => Boolean(value?.ready),
    "calendar today button restore"
  ).then((value) => value.title);
}

async function assertCalendarTodayCell(page) {
  return pollPageValue(
    page,
    () => {
      const today = new Date();
      const cell = document.querySelector(".calendar-cell.today[aria-current='date']");
      const dayText = cell?.querySelector(".calendar-cell-day")?.textContent?.trim() ?? "";
      return {
        dayText,
        ready: dayText === String(today.getDate())
      };
    },
    undefined,
    (value) => Boolean(value?.ready),
    "calendar today cell highlight"
  ).then((value) => value.dayText);
}

async function switchActiveViewType(page, fixture, createdView, viewType, bodySelector) {
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  const dialog = page.locator(".view-dialog");
  await page
    .locator(".view-dialog label.form-row")
    .filter({ hasText: /type|类型/i })
    .locator("select")
    .selectOption(viewType);
  if (viewType === "calendar") {
    await dialog
      .locator("label.form-row")
      .filter({ hasText: /date field|日期字段/i })
      .locator("select")
      .selectOption(fixture.calendarDateFieldId);
  } else if (viewType === "gallery") {
    await dialog
      .locator("label.form-row")
      .filter({ hasText: /cover field|封面字段/i })
      .locator("select")
      .selectOption(fixture.galleryCoverFieldId);
  }
  await page.getByRole("button", { name: fixture.saveViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });
  await page.locator(bodySelector).waitFor({ timeout: 8_000 });

  return pollPageValue(
    page,
    async ({ databaseId, viewId, expectedType, expectedCoverFieldId, expectedDateFieldId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const view = bundle.views.find((item) => String(item.id) === viewId);
      return {
        viewId,
        viewType: String(view?.type ?? ""),
        coverFieldId: String(view?.coverFieldId ?? ""),
        dateFieldId: String(view?.dateFieldId ?? ""),
        ready: view?.type === expectedType &&
          (expectedType !== "gallery" || view?.coverFieldId === expectedCoverFieldId) &&
          (expectedType !== "calendar" || view?.dateFieldId === expectedDateFieldId)
      };
    },
    {
      databaseId: fixture.databaseId,
      viewId: createdView.viewId,
      expectedType: viewType,
      expectedCoverFieldId: fixture.galleryCoverFieldId,
      expectedDateFieldId: fixture.calendarDateFieldId
    },
    (value) => Boolean(value?.ready),
    `view type switch persistence (${viewType})`
  );
}

async function assertDuplicateView(page, fixture, sourceView) {
  const before = await page.evaluate((databaseId) => window.lotion.databases.get(databaseId), fixture.databaseId);
  const beforeViewIds = before.views.map((view) => String(view.id));
  const persistedSource = before.views.find((view) => String(view.id) === sourceView.viewId);
  if (!persistedSource) throw new Error(`Source view disappeared before duplicate: ${sourceView.viewId}`);

  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  await page.getByRole("button", { name: fixture.duplicateViewLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });

  const duplicatedView = await pollPageValue(
    page,
    async ({ databaseId, existingViewIds, expectedPrefix }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const duplicated = bundle.views.find((view) => !existingViewIds.includes(String(view.id)));
      return duplicated && String(duplicated.name).startsWith(expectedPrefix)
        ? {
            id: String(duplicated.id),
            name: String(duplicated.name),
            type: String(duplicated.type),
            visibleFieldIds: duplicated.visibleFieldIds,
            fieldOrder: duplicated.fieldOrder,
            wrapFieldIds: duplicated.wrapFieldIds ?? [],
            filters: duplicated.filters ?? [],
            sorts: duplicated.sorts ?? [],
            pageSize: duplicated.pageSize ?? 0,
            defaultTemplateId: duplicated.defaultTemplateId ?? "",
            coverFieldId: duplicated.coverFieldId ?? "",
            dateFieldId: duplicated.dateFieldId ?? "",
            columnSummaries: duplicated.columnSummaries ?? {}
          }
        : null;
    },
    {
      databaseId: fixture.databaseId,
      existingViewIds: beforeViewIds,
      expectedPrefix: `${sourceView.viewName} copy`
    },
    Boolean,
    "view duplicate persistence"
  );
  assertStringArrayEquals(duplicatedView.visibleFieldIds, persistedSource.visibleFieldIds, "duplicated visible field ids");
  assertStringArrayEquals(duplicatedView.fieldOrder, persistedSource.fieldOrder, "duplicated field order");
  assertStringArrayEquals(duplicatedView.wrapFieldIds, persistedSource.wrapFieldIds ?? [], "duplicated wrap field ids");
  if (duplicatedView.type !== persistedSource.type) {
    throw new Error(`Duplicated view did not preserve type: ${duplicatedView.type} !== ${persistedSource.type}`);
  }
  if (JSON.stringify(duplicatedView.filters) !== JSON.stringify(persistedSource.filters ?? [])) {
    throw new Error("Duplicated view did not preserve filters.");
  }
  if (JSON.stringify(duplicatedView.sorts) !== JSON.stringify(persistedSource.sorts ?? [])) {
    throw new Error("Duplicated view did not preserve sorts.");
  }
  if (duplicatedView.pageSize !== (persistedSource.pageSize ?? 0)) {
    throw new Error(`Duplicated view did not preserve page size: ${duplicatedView.pageSize}`);
  }
  if (duplicatedView.defaultTemplateId !== (persistedSource.defaultTemplateId ?? "")) {
    throw new Error(`Duplicated view did not preserve default template: ${duplicatedView.defaultTemplateId}`);
  }
  if (duplicatedView.coverFieldId !== (persistedSource.coverFieldId ?? "")) {
    throw new Error(`Duplicated view did not preserve cover field: ${duplicatedView.coverFieldId}`);
  }
  if (duplicatedView.dateFieldId !== (persistedSource.dateFieldId ?? "")) {
    throw new Error(`Duplicated view did not preserve date field: ${duplicatedView.dateFieldId}`);
  }
  assertJsonEquals(duplicatedView.columnSummaries, persistedSource.columnSummaries ?? {}, "duplicated column summaries");

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  const duplicatedTab = page.locator(".view-tab").filter({ hasText: duplicatedView.name });
  await duplicatedTab.waitFor({ timeout: 8_000 });
  await duplicatedTab.click();
  await page.locator(".view-tab.active").filter({ hasText: duplicatedView.name }).waitFor({ timeout: 8_000 });

  return {
    viewId: duplicatedView.id,
    viewName: duplicatedView.name,
    viewType: duplicatedView.type,
    coverFieldId: duplicatedView.coverFieldId,
    dateFieldId: duplicatedView.dateFieldId,
    visibleFieldCount: duplicatedView.visibleFieldIds.length
  };
}

async function assertDuplicateViewSpecificSettings(page, fixture, sourceView) {
  await page.locator(".view-tab").filter({ hasText: sourceView.viewName }).click();
  await page.locator(".view-tab.active").filter({ hasText: sourceView.viewName }).waitFor({ timeout: 8_000 });
  await switchActiveViewType(page, fixture, sourceView, "gallery", ".gallery-body");
  const galleryDuplicate = await assertDuplicateView(page, fixture, sourceView);
  if (galleryDuplicate.coverFieldId !== fixture.galleryCoverFieldId) {
    throw new Error(`Gallery duplicate lost cover field: ${galleryDuplicate.coverFieldId}`);
  }
  await assertDeleteCreatedView(page, fixture, galleryDuplicate);

  await page.locator(".view-tab").filter({ hasText: sourceView.viewName }).click();
  await page.locator(".view-tab.active").filter({ hasText: sourceView.viewName }).waitFor({ timeout: 8_000 });
  await switchActiveViewType(page, fixture, sourceView, "calendar", ".calendar-body");
  const calendarDuplicate = await assertDuplicateView(page, fixture, sourceView);
  if (calendarDuplicate.dateFieldId !== fixture.calendarDateFieldId) {
    throw new Error(`Calendar duplicate lost date field: ${calendarDuplicate.dateFieldId}`);
  }
  await assertDeleteCreatedView(page, fixture, calendarDuplicate);

  await page.locator(".view-tab").filter({ hasText: sourceView.viewName }).click();
  await page.locator(".view-tab.active").filter({ hasText: sourceView.viewName }).waitFor({ timeout: 8_000 });
  await switchActiveViewType(page, fixture, sourceView, "list", ".list-view-body");

  return {
    galleryCoverFieldId: galleryDuplicate.coverFieldId,
    calendarDateFieldId: calendarDuplicate.dateFieldId
  };
}

async function assertDeleteCreatedView(page, fixture, createdView) {
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.locator(".view-dialog .danger-button").click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });
  await page.waitForFunction(
    (viewName) => !Array.from(document.querySelectorAll(".view-tab"))
      .some((tab) => tab.textContent?.includes(viewName)),
    createdView.viewName,
    { timeout: 8_000 }
  );

  const savedState = await pollPageValue(
    page,
    async ({ databaseId, viewId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      return {
        exists: bundle.views.some((view) => String(view.id) === viewId),
        viewNames: bundle.views.map((view) => String(view.name)),
        viewCount: bundle.views.length,
        defaultViewId: String(bundle.schema.defaultViewId ?? "")
      };
    },
    { databaseId: fixture.databaseId, viewId: createdView.viewId },
    (value) => Boolean(value && !value.exists),
    "view delete persistence"
  );
  const activeTabText = (await page.locator(".view-tab.active").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
  if (activeTabText.includes(createdView.viewName)) {
    throw new Error(`Deleted view stayed active: ${activeTabText}`);
  }
  if (savedState.defaultViewId === createdView.viewId) {
    throw new Error(`Deleted default view id did not fall back: ${savedState.defaultViewId}`);
  }

  return {
    viewId: createdView.viewId,
    activeTabText,
    defaultViewId: savedState.defaultViewId,
    remainingViews: savedState.viewNames,
    viewCount: savedState.viewCount
  };
}

async function assertLastViewDeleteDisabled(page, fixture) {
  await page.getByRole("button", { name: fixture.viewSettingsLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ timeout: 8_000 });
  const deleteDisabled = await page.locator(".view-dialog .danger-button").evaluate((button) => {
    return button instanceof HTMLButtonElement && button.disabled;
  });
  if (!deleteDisabled) {
    throw new Error("Final remaining view delete button is not disabled.");
  }
  const defaultDisabled = await page
    .getByRole("button", { name: fixture.defaultViewButtonLabelPattern })
    .evaluate((button) => button instanceof HTMLButtonElement && button.disabled);
  if (!defaultDisabled) {
    throw new Error("Current default view button is not disabled.");
  }
  await page.getByRole("button", { name: fixture.closeLabelPattern }).click();
  await page.locator(".view-dialog").waitFor({ state: "detached", timeout: 8_000 });
  return { deleteDisabled, defaultDisabled };
}

async function assertListEmptyState(page, fixture) {
  const view = await page.evaluate(async ({ databaseId, viewName, emptyStatus }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const source = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
    const created = await window.lotion.views.create({ databaseId, name: viewName, sourceViewId: source?.id });
    const nextView = created.views.find((item) => item.name === viewName);
    if (!nextView) throw new Error(`Temporary list view was not created: ${viewName}`);
    const updatedView = {
      ...nextView,
      type: "list",
      filters: [{ fieldId: "status", operator: "is", value: emptyStatus }],
      sorts: []
    };
    await window.lotion.views.update({ databaseId, view: updatedView });
    return updatedView;
  }, {
    databaseId: fixture.databaseId,
    viewName: "Empty List Smoke",
    emptyStatus: "__no_rows__"
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: view.name }).click();
  await page.locator(".list-view-body").waitFor({ timeout: 8_000 });
  await page.locator(".list-view-empty").filter({ hasText: "No rows" }).waitFor({ timeout: 8_000 });
  const emptyText = (await page.locator(".list-view-empty").first().textContent({ timeout: 5_000 }))?.trim() ?? "";

  await page.evaluate(({ databaseId, viewId }) => window.lotion.views.delete({ databaseId, viewId }), {
    databaseId: fixture.databaseId,
    viewId: view.id
  });
  return {
    viewId: view.id,
    emptyText
  };
}

async function assertListDateProperty(page, fixture) {
  const view = await page.evaluate(async ({ databaseId, viewName, dateFieldId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const source = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
    const created = await window.lotion.views.create({ databaseId, name: viewName, sourceViewId: source?.id });
    const nextView = created.views.find((item) => item.name === viewName);
    if (!nextView) throw new Error(`Temporary list view was not created: ${viewName}`);
    const updatedView = {
      ...nextView,
      type: "list",
      visibleFieldIds: ["title", dateFieldId],
      fieldOrder: ["title", dateFieldId],
      filters: [{ fieldId: "status", operator: "is", value: "Ready" }],
      sorts: []
    };
    await window.lotion.views.update({ databaseId, view: updatedView });
    return updatedView;
  }, {
    databaseId: fixture.databaseId,
    viewName: "List Date Property Smoke",
    dateFieldId: fixture.calendarDateFieldId
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: view.name }).click();
  await page.locator(".list-view-body").waitFor({ timeout: 8_000 });
  const expectedDate = formatExpectedMonthDayYear(fixture.calendarDateValue);
  const property = await pollPageValue(
    page,
    ({ expectedTitle, expectedLabel, expectedValue }) => {
      const rows = Array.from(document.querySelectorAll(".list-view-row"));
      const target = rows.find((row) => (row.textContent || "").includes(expectedTitle));
      const properties = Array.from(target?.querySelectorAll(".list-view-property") ?? []).map((property) => ({
        label: property.querySelector(".list-view-property-name")?.textContent?.trim() ?? "",
        value: property.querySelector(".list-view-property-value")?.textContent?.trim() ?? ""
      }));
      const match = properties.find((item) => item.label === expectedLabel);
      return {
        properties,
        value: match?.value ?? "",
        ready: match?.value === expectedValue
      };
    },
    {
      expectedTitle: fixture.calendarOverflowTitles[0],
      expectedLabel: fixture.calendarDateFieldName,
      expectedValue: expectedDate
    },
    (value) => Boolean(value?.ready),
    "list date property formatting"
  );

  await page.evaluate(({ databaseId, viewId }) => window.lotion.views.delete({ databaseId, viewId }), {
    databaseId: fixture.databaseId,
    viewId: view.id
  });
  return {
    viewId: view.id,
    value: property.value
  };
}

async function assertGalleryEmptyState(page, fixture) {
  const view = await page.evaluate(async ({ databaseId, viewName, emptyStatus }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const source = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
    const created = await window.lotion.views.create({ databaseId, name: viewName, sourceViewId: source?.id });
    const nextView = created.views.find((item) => item.name === viewName);
    if (!nextView) throw new Error(`Temporary gallery view was not created: ${viewName}`);
    const updatedView = {
      ...nextView,
      type: "gallery",
      filters: [{ fieldId: "status", operator: "is", value: emptyStatus }],
      sorts: [],
      coverFieldId: "cover_url"
    };
    await window.lotion.views.update({ databaseId, view: updatedView });
    return updatedView;
  }, {
    databaseId: fixture.databaseId,
    viewName: "Empty Gallery Smoke",
    emptyStatus: "__no_rows__"
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: view.name }).click();
  await page.locator(".gallery-body").waitFor({ timeout: 8_000 });
  await page.locator(".gallery-view-empty").filter({ hasText: "No rows" }).waitFor({ timeout: 8_000 });
  const emptyText = (await page.locator(".gallery-view-empty").first().textContent({ timeout: 5_000 }))?.trim() ?? "";

  await page.evaluate(({ databaseId, viewId }) => window.lotion.views.delete({ databaseId, viewId }), {
    databaseId: fixture.databaseId,
    viewId: view.id
  });
  return {
    viewId: view.id,
    emptyText
  };
}

async function assertGalleryDateCaption(page, fixture) {
  const view = await page.evaluate(async ({ databaseId, viewName, dateFieldId }) => {
    const bundle = await window.lotion.databases.get(databaseId);
    const source = bundle.views.find((item) => item.id === bundle.schema.defaultViewId) ?? bundle.views[0];
    const created = await window.lotion.views.create({ databaseId, name: viewName, sourceViewId: source?.id });
    const nextView = created.views.find((item) => item.name === viewName);
    if (!nextView) throw new Error(`Temporary gallery view was not created: ${viewName}`);
    const updatedView = {
      ...nextView,
      type: "gallery",
      visibleFieldIds: ["title", dateFieldId],
      fieldOrder: ["title", dateFieldId],
      filters: [{ fieldId: "status", operator: "is", value: "Ready" }],
      sorts: [],
      coverFieldId: "cover_url"
    };
    await window.lotion.views.update({ databaseId, view: updatedView });
    return updatedView;
  }, {
    databaseId: fixture.databaseId,
    viewName: "Gallery Date Caption Smoke",
    dateFieldId: fixture.calendarDateFieldId
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForDatabaseService(page, fixture.databaseId);
  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await page.locator(".view-tab").filter({ hasText: view.name }).click();
  await page.locator(".gallery-body").waitFor({ timeout: 8_000 });
  const expectedDate = formatExpectedMonthDayYear(fixture.calendarDateValue);
  const caption = await pollPageValue(
    page,
    ({ expectedTitle, expectedLabel, expectedValue }) => {
      const cards = Array.from(document.querySelectorAll(".gallery-card"));
      const target = cards.find((card) => (card.textContent || "").includes(expectedTitle));
      const captions = Array.from(target?.querySelectorAll(".gallery-card-caption") ?? []).map((caption) => ({
        label: caption.querySelector(".gallery-card-caption-label")?.textContent?.trim() ?? "",
        value: caption.querySelector(".gallery-card-caption-value")?.textContent?.trim() ?? ""
      }));
      const match = captions.find((item) => item.label === expectedLabel);
      return {
        captions,
        value: match?.value ?? "",
        ready: match?.value === expectedValue
      };
    },
    {
      expectedTitle: fixture.calendarOverflowTitles[0],
      expectedLabel: fixture.calendarDateFieldName,
      expectedValue: expectedDate
    },
    (value) => Boolean(value?.ready),
    "gallery date caption formatting"
  );

  await page.evaluate(({ databaseId, viewId }) => window.lotion.views.delete({ databaseId, viewId }), {
    databaseId: fixture.databaseId,
    viewId: view.id
  });
  return {
    viewId: view.id,
    value: caption.value
  };
}

function formatExpectedMonthDayYear(dateValue) {
  const [yearText, monthText, dayText] = String(dateValue).split("-");
  const date = new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function assertStringArrayEquals(actual, expected, label) {
  const actualText = JSON.stringify(actual.map(String));
  const expectedText = JSON.stringify(expected.map(String));
  if (actualText !== expectedText) {
    throw new Error(`Created view did not preserve ${label}: ${actualText} !== ${expectedText}`);
  }
}

function assertJsonEquals(actual, expected, label) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`View did not preserve ${label}: ${actualText} !== ${expectedText}`);
  }
}

async function createDatabaseTemplateFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-template-"));
  const now = "2026-01-01T00:00:00.000Z";
  const homeId = "pg_database_template_home";
  const homeTitle = "Database Template Smoke Home";
  const databaseId = "db_database_template";
  const databaseName = "Database Template Smoke DB";
  const templateId = "tpl_database_template_meeting";
  const templateName = "Meeting Note Template";
  const templateRowTitle = "Templated Meeting Note";
  const templateStatus = "Ready";
  const templateScore = 42;
  const templateBodyMarker = "Template body smoke marker";
  const uiTemplateName = "UI Created Template";
  const uiTemplateRowTitle = "UI Created Template Row";
  const uiTemplateStatus = "Blocked";
  const uiTemplateScore = 77;
  const uiTemplateNotes = "Saved through the template dialog";
  const uiTemplateBodyMarker = "UI template body smoke marker";
  const createdViewName = "Renamed Smoke View";
  const readySeedRowId = "row_ready_seed_low";
  const readySeedTitle = "Ready Seed Low Score";
  const blockedHighTitle = "Blocked Seed High Score";
  const blockedLowTitle = "Blocked Seed Low Score";
  const blockedSeedStatus = "Blocked";
  const deferredStatus = "Deferred";
  const labelAlpha = "Alpha";
  const labelBeta = "Beta";
  const labelGamma = "Gamma";
  const calendarDateFieldId = "due_date";
  const calendarDateFieldName = "Due Date";
  const galleryCoverFieldId = "cover_url";
  const galleryCoverFieldName = "Cover URL";
  const galleryCoverUrl = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='64'%20height='36'%3E%3Crect%20width='64'%20height='36'%20fill='%23378252'/%3E%3Ctext%20x='32'%20y='23'%20text-anchor='middle'%20font-family='sans-serif'%20font-size='12'%20fill='white'%3ECover%3C/text%3E%3C/svg%3E";
  const galleryRowIcon = "🖼️";
  const calendarNow = new Date();
  const calendarDateValue = [
    calendarNow.getFullYear(),
    String(calendarNow.getMonth() + 1).padStart(2, "0"),
    "05"
  ].join("-");
  const calendarOverflowTitles = [
    "Calendar Overflow Seed 1",
    "Calendar Overflow Seed 2",
    "Calendar Overflow Seed 3"
  ];
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));
  const templatePageFile = pageMarkdownFileName(templateId, templateName);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "templates", "pages"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_database_template",
    name: "Database Template Smoke",
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
      icon: "emoji:🧪",
      path: ["Bench", homeTitle],
      bodyPath: homePath
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nSmoke workspace for database templates.\n`, "utf8");

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
      {
        id: "status",
        name: "Status",
        type: "select",
        options: [
          { id: "opt_ready", name: templateStatus, color: "green" },
          { id: "opt_blocked", name: blockedSeedStatus, color: "red" },
          { id: "opt_deferred", name: deferredStatus, color: "gray" }
        ]
      },
      { id: "score", name: "Score", type: "number" },
      {
        id: "labels",
        name: "Labels",
        type: "multi_select",
        options: [
          { id: "opt_label_alpha", name: labelAlpha, color: "blue" },
          { id: "opt_label_beta", name: labelBeta, color: "green" },
          { id: "opt_label_gamma", name: labelGamma, color: "purple" }
        ]
      },
      { id: galleryCoverFieldId, name: galleryCoverFieldName, type: "url" },
      { id: calendarDateFieldId, name: calendarDateFieldName, type: "date" },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), {
    ...defaultView(databaseId, ["title", "status", "score", "labels", "notes"]),
    defaultTemplateId: templateId
  });
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "row_icon",
    "status",
    "score",
    "labels",
    galleryCoverFieldId,
    calendarDateFieldId,
    "notes"
  ], [
    {
      id: readySeedRowId,
      created_time: now,
      updated_time: now,
      title: readySeedTitle,
      page_file: "",
      row_icon: `emoji:${galleryRowIcon}`,
      status: templateStatus,
      score: 11,
      labels: labelAlpha,
      cover_url: "",
      due_date: "2026-01-05",
      notes: "Ready row should be hidden by the smoke filter"
    },
    {
      id: "row_blocked_seed_high",
      created_time: now,
      updated_time: now,
      title: blockedHighTitle,
      page_file: "",
      row_icon: "",
      status: blockedSeedStatus,
      score: 91,
      labels: labelBeta,
      cover_url: "",
      due_date: "2026-01-06",
      notes: "Highest blocked score should sort first"
    },
    {
      id: "row_blocked_seed_low",
      created_time: now,
      updated_time: now,
      title: blockedLowTitle,
      page_file: "",
      row_icon: "",
      status: blockedSeedStatus,
      score: 13,
      labels: "",
      cover_url: "",
      due_date: "2026-01-07",
      notes: "Lower blocked score should sort after high score"
    },
    ...calendarOverflowTitles.map((title, index) => ({
      id: `row_calendar_overflow_${index + 1}`,
      created_time: now,
      updated_time: now,
      title,
      page_file: "",
      row_icon: index === 0 ? `emoji:${galleryRowIcon}` : "",
      status: templateStatus,
      score: "",
      labels: "",
      cover_url: "",
      due_date: calendarDateValue,
      notes: "Current-month calendar overflow seed"
    }))
  ]);
  await writeCsv(join(databaseDir, "templates", "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "template_values",
    "full_width"
  ], [{
    id: templateId,
    created_time: now,
    updated_time: now,
    title: templateName,
    page_file: templatePageFile,
      template_values: JSON.stringify({
        title: templateRowTitle,
        row_icon: `emoji:${galleryRowIcon}`,
        status: templateStatus,
        score: templateScore,
        [galleryCoverFieldId]: galleryCoverUrl,
        [calendarDateFieldId]: calendarDateValue,
        notes: "Seeded from row template"
      }),
    full_width: true
  }]);
  await writeFile(
    join(databaseDir, "templates", "pages", templatePageFile),
    `# ${templateRowTitle}\n\n${templateBodyMarker}\n`,
    "utf8"
  );

  return {
    root,
    databaseId,
    databaseName,
    templateId,
    templateName,
    templateRowTitle,
    templateStatus,
    templateScore,
    templateBodyMarker,
    uiTemplateName,
    uiTemplateRowTitle,
    uiTemplateStatus,
    uiTemplateScore,
    uiTemplateNotes,
    uiTemplateBodyMarker,
    createdViewName,
    readySeedRowId,
    readySeedTitle,
    blockedHighTitle,
    blockedLowTitle,
    filterStatusValue: blockedSeedStatus,
    toolbarFilterStatusValue: templateStatus,
    deferredStatus,
    labelAlpha,
    labelBeta,
    labelGamma,
    calendarDateFieldId,
    calendarDateFieldName,
    galleryCoverFieldId,
    galleryCoverFieldName,
    galleryCoverUrl,
    galleryRowIcon,
    calendarOverflowTitles,
    calendarDateValue,
    newTemplateLabelPattern: /new template|新模板/i,
    templateManageLabelPattern: /templates|模板/i,
    templateSaveLabelPattern: /save template|保存模板/i,
    viewSettingsLabelPattern: /view settings|视图设置/i,
    viewNameLabelPattern: /name|名称/i,
    sortFieldLabelPattern: /sort field|排序字段/i,
    sortDirectionLabelPattern: /direction|排序方向/i,
    filterFieldLabelPattern: /filter field|筛选字段/i,
    filterValueLabelPattern: /filter value|筛选值/i,
    duplicateViewLabelPattern: /duplicate|复制/i,
    setDefaultViewLabelPattern: /set as default|设为默认/i,
    defaultViewButtonLabelPattern: /default view|默认视图/i,
    defaultTemplateLabelPattern: /default template|默认模板/i,
    saveViewLabelPattern: /save view|保存视图/i,
    closeLabelPattern: /close|关闭/i,
    blankLabelPattern: /blank|空白/i
  };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCsv(path, fields, records) {
  const lines = [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field] ?? "")).join(","))
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function workspacePath(group, dbFolder, ...parts) {
  return ["databases", group, dbFolder, ...parts].join("/");
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
