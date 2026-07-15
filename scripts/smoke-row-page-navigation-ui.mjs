#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertRowPageNavigationArtifactContract } from "./lib/row-page-navigation-artifacts.mjs";
import {
  assertElementSnapshotBaseline,
  assertFocusWithin,
  assertNoDocumentHorizontalOverflow,
  assertRectsDoNotOverlap,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const thresholdMs = Number(process.env.LOTION_ROW_PAGE_NAV_THRESHOLD_MS ?? 1500);

const result = await withLotionUIHarness("row-page-navigation", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const viewportResults = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createRowPageNavigationFixture(viewport.name);

    await openWorkspace(fixture.root);
    await page.getByText(fixture.homeTitle).first().waitFor({ timeout: 8_000 });
    await navigateToDatabase(page, fixture.databaseId);
    await page.getByText(fixture.databaseName).first().waitFor({ timeout: 8_000 });
    await page.waitForSelector(".database-table", { timeout: 8_000 });

    const row = page.locator(`tr[data-row-id="${fixture.rowId}"]`).first();
    await row.waitFor({ timeout: 8_000 });
    const directCellEdit = await assertDatabaseTableDirectCellEdit(page, fixture);
    await row.locator(".title-cell-with-icon").first().hover();
    const started = await page.evaluate(() => performance.now());
    await row.locator(".title-cell-open").first().click();
    await page.getByText(fixture.rowTitle).first().waitFor({ timeout: 8_000 });
    await page.getByText("Row page opened from the database table Open button.").first().waitFor({ timeout: 8_000 });
    await expandPageDetailsPanel(page);
    const ended = await page.evaluate(() => performance.now());
    const openMs = Number((ended - started).toFixed(1));
    const activeTabText = (await page.locator(".tab.active").first().textContent({ timeout: 5_000 }))?.trim() ?? "";
    if (!activeTabText.includes(fixture.rowTitle)) {
      throw new Error(`Active tab does not include row title "${fixture.rowTitle}": ${activeTabText}`);
    }
    if (activeTabText.includes(fixture.rowId)) {
      throw new Error(`Active tab leaked row id "${fixture.rowId}": ${activeTabText}`);
    }
    if (openMs > thresholdMs) {
      throw new Error(`Row page opened in ${openMs}ms, exceeding ${thresholdMs}ms`);
    }

    const propertyAlignment = await assertRowPropertyAlignment(page, fixture);
    const propertyVisuals = await assertRowPropertyVisualRegression(page, fixture, viewport, artifactRoot);
    const propertyFocusGeometry = await assertRowPropertyInteractiveFocusGeometry(page, fixture, viewport);
    const optionSearch = await assertRowPropertyOptionSearch(page, fixture, viewport);
    const propertyManagement = await assertRowPropertyManagement(page, fixture);
    const dateEdit = await assertDatePropertyEditPersists(page, fixture);
    const sourceLinks = await assertSourceUrlPropertiesReadOnlyAndOpenable(page, fixture);
    const entityRefOpened = await assertEntityRefPropertyOpensPage(page, fixture);

    viewportResults.push({
      viewport: viewport.name,
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowPageFile: fixture.rowPageFile,
      activeTabText,
      directCellEdit,
      propertyAlignment,
      propertyVisuals,
      propertyFocusGeometry,
      optionSearch,
      propertyManagement,
      dateEdit,
      sourceLinks,
      entityRefOpened,
      openMs
    });
  });

  const summary = {
    cdpUrl,
    thresholdMs,
    viewports: viewportResults,
    status: "passed"
  };
  summary.artifactContract = await assertRowPageNavigationArtifactContract(summary);
  return summary;
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
      detail: { kind: "row", databaseId: targetDatabaseId, rowId: targetRowId }
    }));
  }, { targetDatabaseId: databaseId, targetRowId: rowId });
}

async function expandPageDetailsPanel(page) {
  const panel = page.locator('[data-testid="page-secondary-panel"]').first();
  await panel.waitFor({ timeout: 8_000 });
  const expanded = await panel.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await panel.getByRole("button", { name: /Expand page details|展开/ }).click();
  }
  await page.waitForFunction(() => {
    const panel = document.querySelector('[data-testid="page-secondary-panel"]');
    const properties = document.querySelector(".row-properties");
    const box = properties?.getBoundingClientRect();
    return panel?.getAttribute("aria-expanded") === "true" &&
      Boolean(box && box.width > 0 && box.height > 0);
  }, null, { timeout: 8_000 });
}

async function assertDatabaseTableDirectCellEdit(page, fixture) {
  const nextValue = "Edited directly in the database table";
  const row = page.locator(`tr[data-row-id="${fixture.rowId}"]`).first();
  const columnIndex = await databaseColumnIndex(page, fixture.notesFieldName);
  const notesEditor = row
    .locator("td")
    .nth(columnIndex)
    .locator("input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']")
    .first();
  await notesEditor.waitFor({ timeout: 8_000 });
  await notesEditor.fill(nextValue);
  await notesEditor.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
  await page.waitForFunction(
    async ({ databaseId, rowId, fieldId, expected }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((candidate) => String(candidate.id) === rowId);
      return record?.[fieldId] === expected;
    },
    {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      fieldId: "notes",
      expected: nextValue
    },
    { timeout: 8_000 }
  );
  const persisted = await page.evaluate(
    async ({ databaseId, rowId, fieldId }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((candidate) => String(candidate.id) === rowId);
      return record?.[fieldId] ?? "";
    },
    { databaseId: fixture.databaseId, rowId: fixture.rowId, fieldId: "notes" }
  );
  if (persisted !== nextValue) {
    throw new Error(`Database table direct cell edit did not persist: ${persisted}`);
  }
  return { fieldId: "notes", value: persisted };
}

async function databaseColumnIndex(page, fieldName) {
  const index = await page.evaluate((targetFieldName) => {
    const headers = Array.from(document.querySelectorAll(".database-table thead th"));
    return headers.findIndex((header) =>
      header.querySelector(".field-header-name")?.textContent?.trim() === targetFieldName
    );
  }, fieldName);
  if (index < 0) throw new Error(`Could not find database column header: ${fieldName}`);
  return index;
}

async function assertEntityRefPropertyOpensPage(page, fixture) {
  const chip = page.locator(".row-properties .entity-ref-chip").filter({ hasText: fixture.targetPageTitle }).first();
  await chip.waitFor({ timeout: 8_000 });
  await chip.click();
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    fixture.targetPageTitle,
    { timeout: 8_000 }
  );
  const opened = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    activeTabText: document.querySelector(".tab.active")?.textContent?.trim() ?? ""
  }));
  if (opened.titleInput !== fixture.targetPageTitle) {
    throw new Error(`Entity-ref property did not open target page: ${JSON.stringify(opened)}`);
  }
  if (!opened.activeTabText.includes(fixture.targetPageTitle)) {
    throw new Error(`Active tab does not include entity-ref target title: ${JSON.stringify(opened)}`);
  }
  if (opened.activeTabText.includes(fixture.targetPageId)) {
    throw new Error(`Active tab leaked entity-ref target id: ${JSON.stringify(opened)}`);
  }
  return opened;
}

async function assertRowPropertyManagement(page, fixture) {
  const property = page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: fixture.notesFieldName })
  }).first();
  await property.waitFor({ timeout: 8_000 });
  await property.hover();

  const settingsButton = property.getByRole("button", { name: `Field settings: ${fixture.notesFieldName}` });
  await settingsButton.waitFor({ state: "visible", timeout: 8_000 });
  await settingsButton.click();

  const dialog = page.getByRole("dialog", { name: "Field settings" });
  await dialog.waitFor({ timeout: 8_000 });
  const state = await dialog.evaluate(() => {
    const heading = document.querySelector(".field-dialog h2")?.textContent?.trim() ?? "";
    const fieldId = document.querySelector(".field-dialog .dialog-header p")?.textContent?.trim() ?? "";
    const nameInput = document.querySelector(".field-dialog .form-row input");
    const typeSelect = document.querySelector(".field-dialog .form-row select");
    return {
      heading,
      fieldId,
      nameValue: nameInput instanceof HTMLInputElement ? nameInput.value : "",
      nameDisabled: nameInput instanceof HTMLInputElement ? nameInput.disabled : null,
      typeValue: typeSelect instanceof HTMLSelectElement ? typeSelect.value : "",
      typeDisabled: typeSelect instanceof HTMLSelectElement ? typeSelect.disabled : null
    };
  });
  if (state.fieldId !== "notes" || state.nameValue !== fixture.notesFieldName || state.typeValue !== "text" || state.nameDisabled || state.typeDisabled) {
    throw new Error(`Unexpected Field settings dialog state from row property: ${JSON.stringify(state)}`);
  }
  await dialog.getByRole("button", { name: /Close|关闭/ }).click();
  await dialog.waitFor({ state: "detached", timeout: 8_000 });
  return state;
}

async function assertRowPropertyOptionSearch(page, fixture, viewport) {
  const clickedStatus = await assertOptionSearchActivation(page, fixture, viewport, {
    fieldName: fixture.statusFieldName,
    value: fixture.statusOptionValue,
    activation: "click"
  });
  const keyboardTag = await assertOptionSearchActivation(page, fixture, viewport, {
    fieldName: fixture.tagsFieldName,
    value: fixture.firstTagValue,
    activation: "keyboard"
  });
  return {
    clickedStatus,
    keyboardTag
  };
}

async function assertOptionSearchActivation(page, fixture, viewport, { fieldName, value, activation }) {
  const property = page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: fieldName })
  }).first();
  await property.waitFor({ timeout: 8_000 });
  const searchButton = property.getByRole("button", { name: `Search ${fieldName}: ${value}` });
  await searchButton.waitFor({ state: "visible", timeout: 8_000 });
  await assertWithinViewport(page, searchButton, `row property option search ${fieldName} ${viewport.name}`, 4);
  const buttonState = await searchButton.evaluate((button) => ({
    classes: button.className,
    text: button.textContent?.trim() ?? "",
    optionPills: button.querySelectorAll(".option-pill").length,
    tabIndex: button instanceof HTMLButtonElement ? button.tabIndex : null,
    role: button.getAttribute("role") ?? button.tagName.toLowerCase()
  }));
  if (!String(buttonState.classes).includes("row-property-option-search-chip") || buttonState.optionPills !== 1 || !buttonState.text.includes(value)) {
    throw new Error(`Row property option search is not rendered as a navigable chip: ${JSON.stringify({ fieldName, value, buttonState })}`);
  }
  if (activation === "keyboard") {
    await searchButton.focus();
    await page.waitForFunction(
      ({ fieldName, value }) => {
        const active = document.activeElement;
        return active instanceof HTMLButtonElement &&
          active.getAttribute("aria-label") === `Search ${fieldName}: ${value}`;
      },
      { fieldName, value },
      { timeout: 8_000 }
    );
    await page.keyboard.press("Enter");
  } else {
    await searchButton.click();
  }

  const panel = page.locator(".global-search").first();
  await panel.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, panel, `option-search global search ${fieldName} ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `option-search global search ${fieldName} ${viewport.name}`, 2);

  const input = panel.locator(".global-search-input").first();
  await input.waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    (expected) => {
      const input = document.querySelector(".global-search-input");
      return input instanceof HTMLInputElement &&
        input.value === expected &&
        document.activeElement === input;
    },
    value,
    { timeout: 8_000 }
  );
  await page.waitForFunction(
    ({ expectedValue, expectedTitle }) => {
      const hits = Array.from(document.querySelectorAll(".global-search-hit"));
      const visibleHits = hits.filter((hit) => hit.getBoundingClientRect().height > 0);
      return visibleHits.some((hit) => {
        const text = hit.textContent ?? "";
        return text.includes(expectedValue) || text.includes(expectedTitle);
      });
    },
    { expectedValue: value, expectedTitle: fixture.rowTitle },
    { timeout: 8_000 }
  );

  const state = await page.evaluate(() => {
    const panel = document.querySelector(".global-search");
    const input = document.querySelector(".global-search-input");
    const firstHit = document.querySelector(".global-search-hit");
    const meta = document.querySelector(".global-search-meta")?.textContent?.trim() ?? "";
    const panelRect = panel?.getBoundingClientRect();
    const hitRect = firstHit?.getBoundingClientRect();
    return {
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      inputFocused: document.activeElement === input,
      firstHitText: firstHit?.textContent?.trim() ?? "",
      meta,
      panelRect: panelRect ? {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
        width: panelRect.width,
        height: panelRect.height
      } : null,
      firstHitRect: hitRect ? {
        left: hitRect.left,
        right: hitRect.right,
        top: hitRect.top,
        bottom: hitRect.bottom,
        width: hitRect.width,
        height: hitRect.height
      } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth
    };
  });
  if (state.inputValue !== value || !state.inputFocused || !state.firstHitText) {
    throw new Error(`Row property option search did not open focused search results: ${JSON.stringify(state)}`);
  }
  if (!state.panelRect || state.panelRect.left < 0 || state.panelRect.right > state.viewport.width || state.panelRect.bottom > state.viewport.height) {
    throw new Error(`Row property option search panel overflowed viewport: ${JSON.stringify(state)}`);
  }
  if (!state.firstHitRect || state.firstHitRect.left < state.panelRect.left || state.firstHitRect.right > state.panelRect.right) {
    throw new Error(`Row property option search result overflowed the panel: ${JSON.stringify(state)}`);
  }

  await page.keyboard.press("Escape");
  await panel.waitFor({ state: "detached", timeout: 8_000 });
  return {
    fieldName,
    value,
    activation,
    buttonState,
    inputValue: state.inputValue,
    inputFocused: state.inputFocused,
    firstHitText: state.firstHitText,
    meta: state.meta,
    panelWidth: Number(state.panelRect.width.toFixed(1))
  };
}

async function assertDatePropertyEditPersists(page, fixture) {
  const nextDate = "2026-02-14";
  const nextDisplay = "February 14, 2026";
  const property = page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: fixture.emptyDateFieldName })
  }).first();
  await property.waitFor({ timeout: 8_000 });
  const input = property.locator(".date-cell-text-input").first();
  await input.waitFor({ timeout: 8_000 });
  await input.fill(nextDate);
  await input.press("Enter");
  await page.waitForFunction(
    async ({ databaseId, rowId, expected }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((candidate) => String(candidate.id) === rowId);
      return record?.empty_date === expected;
    },
    {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      expected: nextDate
    },
    { timeout: 8_000 }
  );

  await navigateToDatabase(page, fixture.databaseId);
  await page.waitForSelector(".database-table", { timeout: 8_000 });
  await navigateToRowPage(page, fixture.databaseId, fixture.rowId);
  await expandPageDetailsPanel(page);
  await page.waitForFunction(
    ({ title, fieldName, expected }) => {
      if (document.querySelector(".title-input")?.value !== title) return false;
      const rows = Array.from(document.querySelectorAll(".row-property"));
      const row = rows.find((candidate) =>
        candidate.querySelector(".row-property-name")?.textContent?.trim() === fieldName
      );
      return row?.querySelector(".date-cell-text-input")?.value === expected;
    },
    { title: fixture.rowTitle, fieldName: fixture.emptyDateFieldName, expected: nextDisplay },
    { timeout: 8_000 }
  );
  const persisted = await page.evaluate(
    async ({ databaseId, rowId, fieldName }) => {
      const bundle = await window.lotion.databases.get(databaseId);
      const record = bundle.records.find((candidate) => String(candidate.id) === rowId);
      const rows = Array.from(document.querySelectorAll(".row-property"));
      const row = rows.find((candidate) =>
        candidate.querySelector(".row-property-name")?.textContent?.trim() === fieldName
      );
      return {
        raw: record?.empty_date ?? "",
        display: row?.querySelector(".date-cell-text-input")?.value ?? ""
      };
    },
    { databaseId: fixture.databaseId, rowId: fixture.rowId, fieldName: fixture.emptyDateFieldName }
  );
  if (persisted.raw !== nextDate || persisted.display !== nextDisplay) {
    throw new Error(`Date property edit did not persist and re-render: ${JSON.stringify(persisted)}`);
  }
  return persisted;
}

async function assertSourceUrlPropertiesReadOnlyAndOpenable(page, fixture) {
  const capture = await enableShellOpenCapture(page);
  const results = [];
  for (const fieldName of [fixture.originalHtmlFieldName, fixture.originalCsvFieldName]) {
    const property = page.locator(".row-property", {
      has: page.locator(".row-property-name", { hasText: fieldName })
    }).first();
    await property.waitFor({ timeout: 8_000 });
    const info = await property.evaluate((row) => ({
      rowClass: row.className,
      editors: row.querySelectorAll(".row-property-editor").length,
      urlEditors: row.querySelectorAll(".row-property-editor-url, .url-cell").length,
      links: row.querySelectorAll(".page-property-link").length,
      linkTitle: row.querySelector(".page-property-link")?.getAttribute("title") ?? "",
      openText: row.querySelector(".page-property-link-open")?.textContent?.trim() ?? ""
    }));
    if (!info.rowClass.includes("read-only") || !info.rowClass.includes("source-link-property") || info.editors !== 0 || info.urlEditors !== 0 || info.links !== 1) {
      throw new Error(`Source URL property was not read-only/openable: ${fieldName} ${JSON.stringify(info)}`);
    }

    await clearCapturedOpenRequests(page, capture);
    await property.locator(".page-property-link").first().click();
    const opened = await waitForCapturedOpenRequest(page, capture, info.linkTitle);
    results.push({ fieldName, info, opened });
  }
  return results;
}

async function assertRowPropertyVisualRegression(page, fixture, viewport, artifactRoot) {
  await assertNoDocumentHorizontalOverflow(page, `row page property layout ${viewport.name}`, 2);
  const propertyPanel = page.locator(".row-properties").first();
  await propertyPanel.waitFor({ timeout: 8_000 });
  const visibleRows = [
    fixture.originalHtmlFieldName,
    fixture.originalCsvFieldName,
    fixture.notesFieldName,
    fixture.statusFieldName,
    fixture.tagsFieldName,
    fixture.doneFieldName,
    fixture.blockedFieldName,
    fixture.dueDateFieldName,
    fixture.emptyDateFieldName,
    fixture.scoreFieldName
  ];
  for (const label of visibleRows) {
    await assertWithinViewport(page, rowProperty(page, label), `row property ${label} ${viewport.name}`, 8);
  }

  const metrics = await page.evaluate((labels) => {
    const rows = Array.from(document.querySelectorAll(".row-property"));
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };
    const text = (element) => element?.textContent?.trim() ?? "";
    const measure = (label) => {
      const row = rows.find((candidate) =>
        candidate.querySelector(".row-property-name")?.textContent?.trim() === label
      );
      if (!row) return null;
      const labelElement = row.querySelector(".row-property-label");
      const valueElement = row.querySelector(".row-property-value");
      const input = row.querySelector("input");
      const link = row.querySelector(".page-property-link");
      const linkText = row.querySelector(".page-property-link-text");
      const linkOpen = row.querySelector(".page-property-link-open");
      const dateText = row.querySelector(".date-cell-text-input");
      const datePicker = row.querySelector(".date-cell-picker");
      const optionPill = row.querySelector(".option-pill");
      const searchChip = row.querySelector(".row-property-option-search-chip");
      return {
        label,
        rowClass: row.className,
        labelRect: rect(labelElement),
        valueRect: rect(valueElement),
        inputRect: rect(input),
        linkRect: rect(link),
        linkTextRect: rect(linkText),
        linkOpenRect: rect(linkOpen),
        dateTextRect: rect(dateText),
        datePickerRect: rect(datePicker),
        optionPillRect: rect(optionPill),
        searchChipRect: rect(searchChip),
        searchChipText: text(searchChip),
        linkText: text(linkText),
        linkTitle: link?.getAttribute("title") ?? "",
        inputType: input instanceof HTMLInputElement ? input.type : "",
        inputValue: input instanceof HTMLInputElement ? input.value : ""
      };
    };
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth
      },
      rows: Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, measure(label)]))
    };
  }, {
    html: fixture.originalHtmlFieldName,
    csv: fixture.originalCsvFieldName,
    notes: fixture.notesFieldName,
    status: fixture.statusFieldName,
    tags: fixture.tagsFieldName,
    done: fixture.doneFieldName,
    blocked: fixture.blockedFieldName,
    dueDate: fixture.dueDateFieldName,
    emptyDate: fixture.emptyDateFieldName,
    score: fixture.scoreFieldName
  });

  const required = ["html", "csv", "notes", "status", "tags", "done", "blocked", "dueDate", "emptyDate", "score"];
  for (const key of required) {
    const row = metrics.rows[key];
    if (!row?.labelRect || !row.valueRect) {
      throw new Error(`Missing row property visual metrics for ${key}: ${JSON.stringify(row)}`);
    }
    if (row.labelRect.right > row.valueRect.left - 8) {
      throw new Error(`${key} label overlaps value column: ${JSON.stringify(row)}`);
    }
    if (row.valueRect.right > metrics.viewport.width - 16) {
      throw new Error(`${key} value column overflows viewport: ${JSON.stringify({ viewport: metrics.viewport, row })}`);
    }
  }

  for (const key of ["html", "csv"]) {
    const row = metrics.rows[key];
    if (!row.rowClass.includes("read-only") || !row.linkRect || !row.linkTextRect || !row.linkOpenRect || row.inputRect) {
      throw new Error(`${key} source link does not look read-only/openable: ${JSON.stringify(row)}`);
    }
    if (!row.linkTitle.includes("attachments/original/")) {
      throw new Error(`${key} source link lost its original-path title: ${JSON.stringify(row)}`);
    }
    assertRectsDoNotOverlap(row.linkTextRect, row.linkOpenRect, `${key} source link text and open action`);
  }

  for (const key of ["done", "blocked"]) {
    const row = metrics.rows[key];
    if (row.inputType !== "checkbox" || !row.inputRect || row.inputRect.width < 16 || row.inputRect.height < 16) {
      throw new Error(`${key} checkbox control geometry regressed: ${JSON.stringify(row)}`);
    }
    const verticalDelta = Math.abs(center(row.inputRect) - center(row.valueRect));
    if (verticalDelta > 3) {
      throw new Error(`${key} checkbox is not vertically centered: ${JSON.stringify({ verticalDelta, row })}`);
    }
  }

  for (const key of ["dueDate", "emptyDate"]) {
    const row = metrics.rows[key];
    if (!row.dateTextRect || !row.datePickerRect) {
      throw new Error(`${key} date controls missing: ${JSON.stringify(row)}`);
    }
    assertRectsDoNotOverlap(row.dateTextRect, row.datePickerRect, `${key} date text and picker`);
    const verticalDelta = Math.abs(center(row.dateTextRect) - center(row.datePickerRect));
    if (verticalDelta > 4) {
      throw new Error(`${key} date text and picker are not vertically aligned: ${JSON.stringify({ verticalDelta, row })}`);
    }
  }

  for (const key of ["status", "tags"]) {
    const row = metrics.rows[key];
    if (!row.optionPillRect || row.optionPillRect.height < 18) {
      throw new Error(`${key} option/tag pill geometry regressed: ${JSON.stringify(row)}`);
    }
    if (!row.searchChipRect || row.searchChipRect.height < 18 || !row.searchChipText) {
      throw new Error(`${key} option/tag search chip geometry regressed: ${JSON.stringify(row)}`);
    }
    if (row.searchChipRect.right > row.valueRect.right + 1) {
      throw new Error(`${key} option/tag search chip overflows value column: ${JSON.stringify(row)}`);
    }
  }

  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: propertyPanel,
    metadata: {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle,
      visibleRows,
      sourceLinkWidth: Number(metrics.rows.html.linkRect.width.toFixed(1)),
      tagPillHeight: Number(metrics.rows.tags.optionPillRect.height.toFixed(1))
    },
    name: `row-properties-${viewport.name}`,
    page,
    viewport
  });
  const snapshotBaseline = await assertElementSnapshotBaseline(snapshot, {
    label: `row properties ${viewport.name}`,
    metadata: {
      databaseId: fixture.databaseId,
      rowId: fixture.rowId,
      rowTitle: fixture.rowTitle
    },
    rect: {
      width: { min: 680, max: 820 },
      height: { min: 420, max: 500 }
    },
    requiredMetadataKeys: ["visibleRows", "sourceLinkWidth", "tagPillHeight"],
    viewportName: viewport.name
  });

  return {
    viewport: metrics.viewport,
    checkedSize: metrics.rows.done.inputRect,
    sourceLinkWidth: Number(metrics.rows.html.linkRect.width.toFixed(1)),
    tagPillHeight: Number(metrics.rows.tags.optionPillRect.height.toFixed(1)),
    snapshotBaseline,
    snapshot: {
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      height: Number(snapshot.rect.height.toFixed(1)),
      width: Number(snapshot.rect.width.toFixed(1))
    }
  };
}

async function assertRowPropertyInteractiveFocusGeometry(page, fixture, viewport) {
  const panel = page.locator(".row-properties").first();
  await panel.waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `row property focus layout initial ${viewport.name}`, 2);

  const sourceLinks = [];
  for (const fieldName of [fixture.originalHtmlFieldName, fixture.originalCsvFieldName]) {
    const row = rowProperty(page, fieldName);
    const link = row.locator(".page-property-link").first();
    await link.waitFor({ timeout: 8_000 });
    await link.focus();
    const focus = await assertFocusWithin(row, `source link property focus ${fieldName} ${viewport.name}`);
    await assertWithinViewport(page, row, `focused source link property ${fieldName} ${viewport.name}`, 8);
    await assertNoDocumentHorizontalOverflow(page, `focused source link property ${fieldName} ${viewport.name}`, 2);
    const state = await row.evaluate((element) => {
      const active = element.ownerDocument.activeElement;
      const link = element.querySelector(".page-property-link");
      const linkText = element.querySelector(".page-property-link-text");
      const open = element.querySelector(".page-property-link-open");
      return {
        activeTag: active?.tagName ?? "",
        editorCount: element.querySelectorAll(".row-property-editor, .row-property-editor-url, .url-cell, input, textarea").length,
        hasReadOnlyClass: element.classList.contains("read-only"),
        hasSourceClass: element.classList.contains("source-link-property"),
        linkTitle: link?.getAttribute("title") ?? "",
        linkText: linkText?.textContent?.trim() ?? "",
        openText: open?.textContent?.trim() ?? ""
      };
    });
    if (state.activeTag !== "BUTTON" || !state.hasReadOnlyClass || !state.hasSourceClass || state.editorCount !== 0) {
      throw new Error(`Focused source property should remain a read-only link: ${fieldName} ${JSON.stringify(state)}`);
    }
    if (!state.linkTitle.includes("attachments/original/") || !state.linkText) {
      throw new Error(`Focused source property lost visible/original link affordance: ${fieldName} ${JSON.stringify(state)}`);
    }
    sourceLinks.push({ fieldName, focus, state });
  }

  const score = await assertFocusedPropertyControl(page, {
    controlName: "score number input",
    fieldName: fixture.scoreFieldName,
    selector: "input",
    viewport
  });
  const blocked = await assertFocusedPropertyControl(page, {
    controlName: "blocked checkbox",
    fieldName: fixture.blockedFieldName,
    selector: "input[type='checkbox']",
    viewport
  });
  const dueDate = await assertFocusedDateControl(page, fixture.dueDateFieldName, viewport);
  const emptyDate = await assertFocusedDateControl(page, fixture.emptyDateFieldName, viewport);
  const statusSearch = await assertFocusedPropertyControl(page, {
    controlName: "status option search",
    fieldName: fixture.statusFieldName,
    selector: ".row-property-option-search",
    viewport
  });

  await assertNoDocumentHorizontalOverflow(page, `row property focus layout final ${viewport.name}`, 2);
  return {
    blocked,
    dueDate,
    emptyDate,
    score,
    sourceLinks,
    statusSearch
  };
}

async function assertFocusedDateControl(page, fieldName, viewport) {
  const focused = await assertFocusedPropertyControl(page, {
    controlName: `${fieldName} date text`,
    fieldName,
    selector: ".date-cell-text-input",
    viewport
  });
  const row = rowProperty(page, fieldName);
  const dateState = await row.evaluate((element) => {
    const rect = (target) => {
      if (!target) return null;
      const box = target.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };
    const text = element.querySelector(".date-cell-text-input");
    const picker = element.querySelector(".date-cell-picker");
    return {
      pickerOpacity: picker ? getComputedStyle(picker).opacity : "",
      pickerRect: rect(picker),
      textRect: rect(text)
    };
  });
  if (!dateState.textRect || !dateState.pickerRect) {
    throw new Error(`Focused date property is missing text or picker geometry: ${fieldName} ${JSON.stringify(dateState)}`);
  }
  if (Number(dateState.pickerOpacity) < 0.75) {
    throw new Error(`Focused date property should reveal the date picker affordance: ${fieldName} ${JSON.stringify(dateState)}`);
  }
  assertRectsDoNotOverlap(dateState.textRect, dateState.pickerRect, `${fieldName} focused date text and picker`);
  return {
    ...focused,
    pickerOpacity: dateState.pickerOpacity
  };
}

async function assertFocusedPropertyControl(page, { controlName, fieldName, selector, viewport }) {
  const row = rowProperty(page, fieldName);
  const control = row.locator(selector).first();
  await control.waitFor({ timeout: 8_000 });
  const before = await measurePropertyControl(row, selector);
  await control.focus();
  const focus = await assertFocusWithin(row, `${controlName} focus ${viewport.name}`);
  await assertWithinViewport(page, row, `${controlName} focused row ${viewport.name}`, 8);
  await assertNoDocumentHorizontalOverflow(page, `${controlName} focused layout ${viewport.name}`, 2);
  const after = await measurePropertyControl(row, selector);
  if (!after.focused) {
    throw new Error(`${controlName} did not keep focus inside its property row: ${JSON.stringify({ before, after, focus })}`);
  }
  if (!after.controlRect || !after.valueRect) {
    throw new Error(`${controlName} missing focused control geometry: ${JSON.stringify({ before, after })}`);
  }
  if (Math.abs(after.valueRect.left - before.valueRect.left) > 1) {
    throw new Error(`${controlName} shifted the property value column while focused: ${JSON.stringify({ before, after })}`);
  }
  if (after.controlRect.right > after.valueRect.right + 1) {
    throw new Error(`${controlName} overflows the property value column while focused: ${JSON.stringify({ before, after })}`);
  }
  return {
    controlName,
    fieldName,
    focus,
    left: Number(after.controlRect.left.toFixed(1)),
    valueLeft: Number(after.valueRect.left.toFixed(1)),
    width: Number(after.controlRect.width.toFixed(1))
  };
}

async function measurePropertyControl(row, selector) {
  return row.evaluate((element, targetSelector) => {
    const rect = (target) => {
      if (!target) return null;
      const box = target.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height
      };
    };
    const active = element.ownerDocument.activeElement;
    const control = element.querySelector(targetSelector);
    const value = element.querySelector(".row-property-value");
    return {
      activeTag: active?.tagName ?? "",
      controlRect: rect(control),
      focused: Boolean(active && (active === control || element.contains(active))),
      valueRect: rect(value)
    };
  }, selector);
}

function rowProperty(page, label) {
  return page.locator(".row-property", {
    has: page.locator(".row-property-name", { hasText: label })
  }).first();
}

function center(rect) {
  return rect.top + rect.height / 2;
}

async function assertRowPropertyAlignment(page, fixture) {
  await page.locator(".row-properties").waitFor({ timeout: 8_000 });
  await page.mouse.move(8, 8);
  const metrics = await page.evaluate((labels) => {
    const rows = Array.from(document.querySelectorAll(".row-property"));
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        width: box.width,
        height: box.height
      };
    };
    const style = (element) => {
      if (!element) return null;
      const computed = getComputedStyle(element);
      return {
        appearance: computed.appearance,
        backgroundColor: computed.backgroundColor,
        borderColor: computed.borderTopColor,
        fontSize: computed.fontSize,
        opacity: computed.opacity,
        paddingLeft: computed.paddingLeft,
        paddingRight: computed.paddingRight
      };
    };
    const rowForLabel = (label) => rows.find((row) =>
      row.querySelector(".row-property-name")?.textContent?.trim() === label
    );
    const measure = (label) => {
      const row = rowForLabel(label);
      if (!row) return null;
      const labelElement = row.querySelector(".row-property-label");
      const value = row.querySelector(".row-property-value");
      const editor = row.querySelector(".row-property-editor");
      const input = row.querySelector("input");
      const dateText = row.querySelector(".date-cell-text-input");
      const picker = row.querySelector(".date-cell-picker");
      const optionPill = row.querySelector(".option-pill");
      const optionTrigger = row.querySelector(".option-dropdown-trigger");
      const emptyOption = row.querySelector(".empty-option");
      return {
        label,
        rowClass: row.className,
        editorClass: editor?.className ?? "",
        checked: input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : undefined,
        rowStyle: style(row),
        labelStyle: style(labelElement),
        valueStyle: style(value),
        editorStyle: style(editor),
        value: rect(value),
        editor: rect(editor),
        input: rect(input),
        dateText: rect(dateText),
        picker: rect(picker),
        optionPill: rect(optionPill),
        optionTrigger: rect(optionTrigger),
        emptyOption: rect(emptyOption),
        inputStyle: style(input),
        dateTextStyle: style(dateText),
        pickerStyle: style(picker),
        optionPillStyle: style(optionPill),
        optionTriggerStyle: style(optionTrigger),
        emptyOptionStyle: style(emptyOption)
      };
    };
    return Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, measure(label)]));
  }, {
    notes: fixture.notesFieldName,
    status: fixture.statusFieldName,
    tags: fixture.tagsFieldName,
    done: fixture.doneFieldName,
    blocked: fixture.blockedFieldName,
    dueDate: fixture.dueDateFieldName,
    emptyDate: fixture.emptyDateFieldName,
    score: fixture.scoreFieldName,
    related: fixture.relatedFieldName
  });

  const requiredKeys = ["notes", "status", "tags", "done", "blocked", "dueDate", "emptyDate", "score", "related"];
  for (const key of requiredKeys) {
    if (!metrics[key]?.value || !metrics[key]?.editor) {
      throw new Error(`Missing row property geometry for ${key}: ${JSON.stringify(metrics[key])}`);
    }
  }
  const valueLeft = metrics.notes.value.left;
  const rowFontSize = metrics.notes.rowStyle.fontSize;
  for (const key of requiredKeys) {
    assertSameFont(`${key} label`, metrics[key].labelStyle.fontSize, rowFontSize);
    assertSameFont(`${key} value`, metrics[key].valueStyle.fontSize, rowFontSize);
    assertSameFont(`${key} editor`, metrics[key].editorStyle.fontSize, rowFontSize);
  }
  assertSameFont("score input", metrics.score.inputStyle.fontSize, rowFontSize);
  assertSameFont("dueDate text", metrics.dueDate.dateTextStyle.fontSize, rowFontSize);
  assertSameFont("emptyDate text", metrics.emptyDate.dateTextStyle.fontSize, rowFontSize);
  for (const key of ["status", "tags"]) {
    if (!metrics[key].optionPill || !metrics[key].optionTrigger) {
      throw new Error(`${key} option pill was not rendered: ${JSON.stringify(metrics[key])}`);
    }
    assertSameFont(`${key} option trigger`, metrics[key].optionTriggerStyle.fontSize, rowFontSize);
    assertSameFont(`${key} option pill`, metrics[key].optionPillStyle.fontSize, rowFontSize);
    assertWithin(`${key} option pill left`, metrics[key].optionPill.left, valueLeft, 1);
  }
  for (const key of requiredKeys) {
    assertWithin(`${key} editor left`, metrics[key].editor.left, valueLeft, 1);
  }
  for (const key of ["done", "blocked"]) {
    assertWithin(`${key} checkbox left`, metrics[key].input.left, valueLeft, 1);
    if (metrics[key].inputStyle.appearance !== "none") {
      throw new Error(`${key} checkbox is still using native browser appearance: ${JSON.stringify(metrics[key])}`);
    }
  }
  if (metrics.done.inputStyle.backgroundColor === "rgba(0, 0, 0, 0)") {
    throw new Error(`Checked checkbox did not use the themed checked background: ${JSON.stringify(metrics.done)}`);
  }
  if (metrics.blocked.inputStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Unchecked checkbox should stay transparent: ${JSON.stringify(metrics.blocked)}`);
  }
  if (metrics.score.inputStyle.backgroundColor !== "rgba(0, 0, 0, 0)") {
    throw new Error(`Number property should render as text-like chrome until focused: ${JSON.stringify(metrics.score)}`);
  }
  if (metrics.score.inputStyle.paddingLeft !== "0px" || metrics.score.inputStyle.paddingRight !== "0px") {
    throw new Error(`Number property should not shift text with idle padding: ${JSON.stringify(metrics.score)}`);
  }
  for (const key of ["dueDate", "emptyDate"]) {
    const metric = metrics[key];
    assertWithin(`${key} date text left`, metric.dateText.left, valueLeft, 1);
    const pickerGap = metric.picker.left - metric.dateText.right;
    if (pickerGap < 0 || pickerGap > 8) {
      throw new Error(`${key} date picker is not adjacent to the date text: ${JSON.stringify(metric)}`);
    }
    if (Number(metric.pickerStyle.opacity) !== 0) {
      throw new Error(`${key} date picker should be hidden until hover/focus: ${JSON.stringify(metric)}`);
    }
  }
  return {
    valueLeft: Number(valueLeft.toFixed(1)),
    rowFontSize,
    checkedCheckboxBackground: metrics.done.inputStyle.backgroundColor,
    datePickerGaps: {
      dueDate: Number((metrics.dueDate.picker.left - metrics.dueDate.dateText.right).toFixed(1)),
      emptyDate: Number((metrics.emptyDate.picker.left - metrics.emptyDate.dateText.right).toFixed(1))
    },
    scoreBackground: metrics.score.inputStyle.backgroundColor
  };
}

function assertWithin(label, actual, expected, tolerance) {
  if (Math.abs(actual - expected) <= tolerance) return;
  throw new Error(`${label} expected ${expected} +/- ${tolerance}, got ${actual}`);
}

function assertSameFont(label, actual, expected) {
  if (actual === expected) return;
  throw new Error(`${label} font-size expected ${expected}, got ${actual}`);
}

async function enableShellOpenCapture(page) {
  const dryRun = await page.evaluate(async () => {
    const debug = window.lotion.debug;
    if (!debug?.setShellOpenDryRun || !debug?.clearShellOpenRequests || !debug?.getShellOpenRequests) {
      return { enabled: false };
    }
    await debug.setShellOpenDryRun(true);
    await debug.clearShellOpenRequests();
    return { enabled: true };
  });
  if (dryRun.enabled) return { mode: "debug-dry-run" };

  const patch = await page.evaluate(() => {
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
      return { patched: window.lotion.shell.openLink !== original };
    } catch (error) {
      return {
        patched: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  if (!patch.patched) {
    throw new Error(`Could not capture shell.openLink for source URL smoke: ${JSON.stringify(patch)}`);
  }
  return { mode: "patched-shell-open" };
}

async function clearCapturedOpenRequests(page, capture) {
  await page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") await window.lotion.debug?.clearShellOpenRequests?.();
    if (Array.isArray(window.__lotionOpenedUrls)) window.__lotionOpenedUrls.length = 0;
  }, capture.mode);
}

async function waitForCapturedOpenRequest(page, capture, expected) {
  await page.waitForFunction(
    async ({ mode, expectedUrl }) => {
      if (mode === "debug-dry-run") {
        return (await window.lotion.debug.getShellOpenRequests()).includes(expectedUrl);
      }
      const opened = window.__lotionOpenedUrls;
      return Array.isArray(opened) && opened.includes(expectedUrl);
    },
    { mode: capture.mode, expectedUrl: expected },
    { timeout: 5_000 }
  );
  return page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") return await window.lotion.debug.getShellOpenRequests();
    return Array.isArray(window.__lotionOpenedUrls) ? [...window.__lotionOpenedUrls] : [];
  }, capture.mode);
}

async function createRowPageNavigationFixture(viewportName = "default") {
  const root = await mkdtemp(join(tmpdir(), `lotion-row-page-nav-${viewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const homeId = "pg_row_nav_home";
  const homeTitle = "Row Page Navigation Home";
  const targetPageId = "pg_row_nav_related";
  const targetPageTitle = "Related Reference Page";
  const databaseId = "db_row_nav";
  const databaseName = "Row Page Navigation DB";
  const rowId = "row_row_nav";
  const rowTitle = "Row Page Navigation Row";
  const notesFieldName = "Notes";
  const relatedFieldName = "Related";
  const statusFieldName = "Status";
  const statusOptionValue = "Done";
  const tagsFieldName = "Tags";
  const firstTagValue = "Focus";
  const doneFieldName = "Done";
  const blockedFieldName = "Blocked";
  const dueDateFieldName = "Due date";
  const emptyDateFieldName = "Empty date";
  const scoreFieldName = "Score";
  const originalHtmlFieldName = "Original Notion HTML";
  const originalCsvFieldName = "Original Notion CSV";
  const originalHtmlPath = "attachments/original/export/Row_Page_Navigation_Row.html";
  const originalCsvPath = "attachments/original/export/Row_Page_Navigation_DB.csv";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const homePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(homeId, homeTitle));
  const targetPagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(targetPageId, targetPageTitle));
  const rowPageFile = pageMarkdownFileName(rowId, rowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_row_page_nav",
    name: "Row Page Navigation Smoke",
    pages: [homeId, targetPageId],
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
      icon: "emoji:📄",
      path: ["Bench", homeTitle],
      bodyPath: homePath
    }),
    pageRecord({
      id: targetPageId,
      title: targetPageTitle,
      now,
      icon: "emoji:🔗",
      path: ["Bench", targetPageTitle],
      bodyPath: targetPagePath
    })
  ]);
  await writeFile(join(root, homePath), `# ${homeTitle}\n\nInitial page for row-page navigation smoke.\n`, "utf8");
  await writeFile(join(root, targetPagePath), `# ${targetPageTitle}\n\nTarget page for entity-ref property smoke.\n`, "utf8");

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
      { id: "notes", name: notesFieldName, type: "text" },
      { id: "status", name: statusFieldName, type: "select", options: [
        { id: "status_todo", name: "Todo", color: "gray" },
        { id: "status_done", name: "Done", color: "green" }
      ] },
      { id: "tags", name: tagsFieldName, type: "multi_select", options: [
        { id: "tag_focus", name: "Focus", color: "blue" },
        { id: "tag_bug", name: "Bug", color: "yellow" }
      ] },
      { id: "done", name: doneFieldName, type: "checkbox" },
      { id: "blocked", name: blockedFieldName, type: "checkbox" },
      { id: "due_date", name: dueDateFieldName, type: "date" },
      { id: "empty_date", name: emptyDateFieldName, type: "date" },
      { id: "score", name: scoreFieldName, type: "number" },
      { id: "related", name: relatedFieldName, type: "entity_ref" },
      { id: "notion_original_html", name: originalHtmlFieldName, type: "url" },
      { id: "notion_original_csv", name: originalCsvFieldName, type: "url" }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes"]));
  await writeCsv(join(databaseDir, "data.csv"), [
    "id",
    "created_time",
    "updated_time",
    "title",
    "page_file",
    "notes",
    "status",
    "tags",
    "done",
    "blocked",
    "due_date",
    "empty_date",
    "score",
    "related",
    "notion_original_html",
    "notion_original_csv"
  ], [{
    id: rowId,
    created_time: now,
    updated_time: now,
    title: rowTitle,
    page_file: rowPageFile,
    notes: "Open me from the database table",
    status: "Done",
    tags: `${firstTagValue};Bug`,
    done: "true",
    blocked: "",
    due_date: "2026-01-05",
    empty_date: "",
    score: "3",
    related: JSON.stringify([{
      entityId: targetPageId,
      kind: "page",
      titleSnapshot: targetPageTitle,
      pathSnapshot: ["Bench", targetPageTitle]
    }]),
    notion_original_html: originalHtmlPath,
    notion_original_csv: originalCsvPath
  }]);
  await writeFile(join(root, rowPagePath), `# ${rowTitle}\n\nRow page opened from the database table Open button.\n\nStatus context: ${statusOptionValue} option search target.\n\nTag context: ${firstTagValue} option search target.\n`, "utf8");

  return {
    root,
    homeTitle,
    databaseId,
    databaseName,
    rowId,
    rowTitle,
    rowPageFile,
    targetPageId,
    targetPageTitle,
    notesFieldName,
    relatedFieldName,
    statusFieldName,
    statusOptionValue,
    tagsFieldName,
    firstTagValue,
    doneFieldName,
    blockedFieldName,
    dueDateFieldName,
    emptyDateFieldName,
    scoreFieldName,
    originalHtmlFieldName,
    originalCsvFieldName,
    originalHtmlPath,
    originalCsvPath
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
