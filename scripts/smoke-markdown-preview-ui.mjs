#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertMarkdownPreviewArtifactContract } from "./lib/markdown-preview-artifacts.mjs";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  nextAnimationFrame,
  openPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness
} from "./ui-harness.mjs";

const RAW_MARKDOWN_STORAGE_KEY = "lotion.settings.rawMarkdown";

const result = await withLotionUIHarness("markdown-preview-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const previousRawMarkdown = await readRawMarkdownSetting(page);
  const expectedViewports = selectedViewports();
  const viewports = [];
  try {
    await page.evaluate((key) => window.localStorage.setItem(key, "0"), RAW_MARKDOWN_STORAGE_KEY);
    await forEachViewport(page, expectedViewports, async (viewport) => {
      const fixture = await createMarkdownPreviewFixture(viewport.name);
      await openWorkspace(fixture.root);
      await openPage(page, fixture.pageId);
      await waitForActivePageTitle(page, fixture.pageTitle);
      await setRawMarkdown(page, false);
      await scrollEditorToTop(page);
      const viewportResult = await assertMarkdownPreview(page, fixture, viewport, artifactRoot);
      viewports.push({
        viewport: viewport.name,
        pageId: fixture.pageId,
        ...viewportResult
      });
    });
  } finally {
    await restoreRawMarkdownSetting(page, previousRawMarkdown).catch(() => undefined);
  }
  const smokeResult = { cdpUrl, viewports, status: "passed" };
  return {
    ...smokeResult,
    artifactContract: await assertMarkdownPreviewArtifactContract(smokeResult, {
      expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
    })
  };
});

console.log(JSON.stringify(result, null, 2));

async function assertMarkdownPreview(page, fixture, viewport, artifactRoot) {
  await page.locator(".cm-line").first().click();
  await page.getByText("开始恢复锻炼").first().waitFor({ timeout: 8_000 });
  await page.getByText("粗体等待").first().waitFor({ timeout: 8_000 });
  await page.getByText("斜体等待").first().waitFor({ timeout: 8_000 });
  await page.getByText("完成的删除线").first().waitFor({ timeout: 8_000 });
  await page.getByText("从国内买茶叶").first().waitFor({ timeout: 8_000 });
  await page.getByText("HTML 删除线").first().waitFor({ timeout: 8_000 });
  await page.getByText("HTML del 删除线").first().waitFor({ timeout: 8_000 });
  await page.getByText("重要下划线").first().waitFor({ timeout: 8_000 });
  await page.getByText("列表红色").first().waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `markdown preview initial ${viewport.name}`);
  await assertIntersectsViewport(page, page.locator('[data-testid="markdown-editor"]').first(), `markdown editor ${viewport.name}`, 4);
  const visualSnapshots = [];

  const rendered = await page.evaluate(() => {
    const lineData = Array.from(document.querySelectorAll(".cm-line")).map((line) => {
      const element = line;
      return {
        text: element.textContent ?? "",
        links: Array.from(element.querySelectorAll("[data-md-url], .cm-md-link, .cm-md-url")).map((link) => ({
          text: link.textContent ?? "",
          url: link.getAttribute("data-md-url"),
          className: link.getAttribute("class")
        })),
        strikeText: Array.from(element.querySelectorAll(".cm-md-strike")).map((strike) => strike.textContent ?? ""),
        strongText: Array.from(element.querySelectorAll(".cm-md-strong")).map((strong) => strong.textContent ?? ""),
        emphasisText: Array.from(element.querySelectorAll(".cm-md-emphasis")).map((emphasis) => emphasis.textContent ?? ""),
        underlineText: Array.from(element.querySelectorAll(".cm-md-underline")).map((underline) => underline.textContent ?? ""),
        highlightText: Array.from(element.querySelectorAll(".cm-md-highlight")).map((highlight) => highlight.textContent ?? ""),
        colorText: Array.from(element.querySelectorAll(".cm-md-notion-color-red")).map((color) => color.textContent ?? ""),
        bgText: Array.from(element.querySelectorAll(".cm-md-notion-bg-blue, .cm-md-notion-bg-yellow")).map((bg) => bg.textContent ?? ""),
        taskInputs: Array.from(element.querySelectorAll("input.cm-md-task-checkbox")).map((input) => {
          const checkbox = input;
          const rect = checkbox.getBoundingClientRect();
          return {
            checked: checkbox.checked,
            type: checkbox.getAttribute("type") ?? "",
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        })
      };
    });
    const wipLine = lineData.find((line) => line.text.includes("开始恢复锻炼")) ?? null;
    const strongLine = lineData.find((line) => line.text.includes("粗体等待")) ?? null;
    const emphasisLine = lineData.find((line) => line.text.includes("斜体等待")) ?? null;
    const strikeLine = lineData.find((line) => line.text.includes("完成的删除线")) ?? null;
    const importedSingleTildeLine = lineData.find((line) => line.text.includes("从国内买茶叶")) ?? null;
    const htmlStrikeLine = lineData.find((line) => line.text.includes("HTML 删除线")) ?? null;
    const htmlDelStrikeLine = lineData.find((line) => line.text.includes("HTML del 删除线")) ?? null;
    const uncheckedTaskLine = lineData.find((line) => line.text.includes("未完成任务")) ?? null;
    const checkedTaskLine = lineData.find((line) => line.text.includes("已完成任务")) ?? null;
    const underlineLine = lineData.find((line) => line.text.includes("重要下划线")) ?? null;
    const highlightLine = lineData.find((line) => line.text.includes("重点高亮")) ?? null;
    const colorLine = lineData.find((line) => line.text.includes("红色文字")) ?? null;
    const listColorLine = lineData.find((line) => line.text.includes("列表红色")) ?? null;
    const longLinkLine = lineData.find((line) => line.text.includes("prompting-long-context")) ?? null;
    const multilineLinkLabelLine = lineData.find((line) => line.text.includes("multiline%20decoded")) ?? null;
    const escapedLabelLine = lineData.find((line) => line.text.includes("Project [A]")) ?? null;
    const calloutMark = document.querySelector(".cm-md-callout-body mark")?.textContent ?? "";
    const calloutColor = document.querySelector(".cm-md-callout-body .cm-md-notion-color-green")?.textContent ?? "";
    const calloutText = document.querySelector(".cm-md-callout-body")?.textContent ?? "";
    const calloutClassName = document.querySelector(".cm-md-callout-widget")?.getAttribute("class") ?? "";
    const rawCalloutSourceVisible = lineData.some((line) => line.text.includes("lotion-callout"));
    const calloutHasEditSource = Boolean(document.querySelector(".cm-md-callout-widget-outer .cm-md-edit-source"));
    const imageWidget = document.querySelector(".cm-md-image-widget");
    const image = imageWidget?.querySelector("img") ?? null;
    const imageEditButton = imageWidget?.querySelector(".cm-md-edit-source") ?? null;
    const rawImageSourceVisible = lineData.some((line) => line.text.includes("![Preview image]"));
    const contentRect = document.querySelector(".cm-content")?.getBoundingClientRect();
    const referenceLineRect = Array.from(document.querySelectorAll(".cm-line"))
      .find((line) => (line.textContent ?? "").includes("开始恢复锻炼"))
      ?.getBoundingClientRect();
    const calloutRect = document.querySelector(".cm-md-callout-widget")?.getBoundingClientRect();
    const calloutContentLeftDelta = contentRect && calloutRect ? Math.round(calloutRect.left - contentRect.left) : null;
    const calloutLineLeftDelta = referenceLineRect && calloutRect ? Math.round(calloutRect.left - referenceLineRect.left) : null;
    const iframeWidget = document.querySelector(".cm-md-iframe-widget");
    const iframe = iframeWidget?.querySelector("iframe") ?? null;
    const iframeLink = iframeWidget?.querySelector(".cm-md-iframe-widget-url") ?? null;
    const iframeTitle = iframeWidget?.querySelector(".cm-md-iframe-widget-title")?.textContent ?? "";
    const toggle = document.querySelector(".cm-md-toggle-widget");
    const equation = document.querySelector(".cm-md-equation-widget");
    const tableWidget = document.querySelector(".cm-md-table-widget");
    const table = tableWidget?.querySelector("table") ?? null;
    const tableCell = Array.from(table?.querySelectorAll("td") ?? [])
      .find((cell) => (cell.textContent ?? "").includes("2(天)"));
    const tableEditSource = tableWidget?.querySelector(".cm-md-edit-source") ?? null;
    const tableControls = Array.from(tableWidget?.querySelectorAll(".cm-md-table-control") ?? []).map((button) => ({
      action: button.getAttribute("data-table-action") ?? "",
      text: button.textContent ?? ""
    }));
    const rowDragHandles = Array.from(tableWidget?.querySelectorAll(".cm-md-table-row-drag-handle") ?? []);
    const columnDragHandles = Array.from(tableWidget?.querySelectorAll(".cm-md-table-column-drag-handle") ?? []);
    return {
      wipLine,
      strongLine,
      emphasisLine,
      strikeLine,
      importedSingleTildeLine,
      htmlStrikeLine,
      htmlDelStrikeLine,
      uncheckedTaskLine,
      checkedTaskLine,
      underlineLine,
      highlightLine,
      colorLine,
      listColorLine,
      longLinkLine,
      multilineLinkLabelLine,
      escapedLabelLine,
      calloutMark,
      calloutColor,
      calloutText,
      calloutClassName,
      rawCalloutSourceVisible,
      calloutHasEditSource,
      imagePreview: imageWidget ? {
        src: image?.getAttribute("src") ?? "",
        alt: image?.getAttribute("alt") ?? "",
        rawSourceVisible: rawImageSourceVisible,
        hasEditSource: Boolean(imageEditButton),
        editSourceText: imageEditButton?.textContent?.trim() ?? "",
        editSourceOpacity: imageEditButton ? getComputedStyle(imageEditButton).opacity : ""
      } : null,
      calloutContentLeftDelta,
      calloutLineLeftDelta,
      iframePreview: iframeWidget ? {
        title: iframeTitle,
        linkText: iframeLink?.textContent ?? "",
        linkHref: iframeLink?.getAttribute("href") ?? "",
        src: iframe?.getAttribute("src") ?? "",
        height: iframe?.style.height ?? ""
      } : null,
      togglePreview: toggle ? {
        summary: toggle.querySelector(".cm-md-toggle-summary-text")?.textContent?.trim() ?? "",
        body: toggle.querySelector(".cm-md-toggle-body")?.textContent ?? "",
        bodyHtml: toggle.querySelector(".cm-md-toggle-body")?.innerHTML ?? "",
        open: toggle.hasAttribute("open"),
        summaryEditable: toggle.querySelector(".cm-md-toggle-summary-text")?.tagName ?? "",
        summaryContentEditable: toggle.querySelector(".cm-md-toggle-summary-text")?.getAttribute("contenteditable") ?? "",
        bodyEditable: toggle.querySelector(".cm-md-toggle-body")?.tagName ?? "",
        bodyContentEditable: toggle.querySelector(".cm-md-toggle-body")?.getAttribute("contenteditable") ?? "",
        hasEditSource: Boolean(toggle.closest(".cm-md-toggle-widget-outer")?.querySelector(".cm-md-edit-source"))
      } : null,
      equationPreview: equation ? {
        text: equation.textContent ?? "",
        hasEditSource: Boolean(equation.closest(".cm-md-equation-widget-outer")?.querySelector(".cm-md-edit-source"))
      } : null,
      tablePreview: table ? {
        text: table.textContent ?? "",
        editableCellText: tableCell?.textContent ?? "",
        editableCellContentEditable: tableCell?.getAttribute("contenteditable") ?? "",
        hasEditSource: Boolean(tableEditSource),
        editSourceText: tableEditSource?.textContent ?? "",
        editSourceOpacity: tableEditSource instanceof HTMLElement ? getComputedStyle(tableEditSource).opacity : "",
        controls: tableControls,
        rowDragHandleCount: rowDragHandles.length,
        columnDragHandleCount: columnDragHandles.length
      } : null
    };
  });

  if (!rendered.wipLine) throw new Error("Missing [WIP] regression line");
  if (rendered.wipLine.links.length !== 0) {
    throw new Error(`[WIP] line rendered as a link: ${JSON.stringify(rendered.wipLine)}`);
  }
  visualSnapshots.push(await captureMarkdownPreviewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "initial",
      hasBold: Boolean(rendered.strongLine),
      hasItalic: Boolean(rendered.emphasisLine),
      hasStrikethrough: Boolean(rendered.strikeLine),
      hasTable: Boolean(rendered.tablePreview),
      rawCalloutSourceVisible: rendered.rawCalloutSourceVisible,
      rawImageSourceVisible: rendered.imagePreview?.rawSourceVisible ?? null
    },
    page,
    viewport
  }));

  if (!rendered.strongLine) throw new Error("Missing bold regression line");
  if (!rendered.strongLine.strongText.some((text) => text.includes("粗体等待"))) {
    throw new Error(`Bold text did not render with cm-md-strong: ${JSON.stringify(rendered.strongLine)}`);
  }
  if (rendered.strongLine.text.includes("**")) {
    throw new Error(`Bold markers leaked into preview text: ${JSON.stringify(rendered.strongLine)}`);
  }
  if (!rendered.emphasisLine) throw new Error("Missing italic regression line");
  if (!rendered.emphasisLine.emphasisText.some((text) => text.includes("斜体等待"))) {
    throw new Error(`Italic text did not render with cm-md-emphasis: ${JSON.stringify(rendered.emphasisLine)}`);
  }
  if (rendered.emphasisLine.text.includes("*")) {
    throw new Error(`Italic markers leaked into preview text: ${JSON.stringify(rendered.emphasisLine)}`);
  }

  if (!rendered.strikeLine) throw new Error("Missing strikethrough regression line");
  if (!rendered.strikeLine.strikeText.some((text) => text.includes("完成的删除线"))) {
    throw new Error(`Strikethrough did not render with cm-md-strike: ${JSON.stringify(rendered.strikeLine)}`);
  }
  if (!rendered.importedSingleTildeLine) throw new Error("Missing imported single-tilde strikethrough regression line");
  if (!rendered.importedSingleTildeLine.strikeText.some((text) => text.includes("从国内买茶叶"))) {
    throw new Error(`Imported single-tilde strikethrough did not render with cm-md-strike: ${JSON.stringify(rendered.importedSingleTildeLine)}`);
  }
  if (rendered.importedSingleTildeLine.text.includes("~")) {
    throw new Error(`Imported single-tilde markers leaked into preview text: ${JSON.stringify(rendered.importedSingleTildeLine)}`);
  }
  if (rendered.importedSingleTildeLine.text.includes("**")) {
    throw new Error(`Nested imported single-tilde emphasis markers leaked into preview text: ${JSON.stringify(rendered.importedSingleTildeLine)}`);
  }
  if (!rendered.htmlStrikeLine) throw new Error("Missing HTML <s> strikethrough regression line");
  if (!rendered.htmlStrikeLine.strikeText.some((text) => text.includes("HTML 删除线"))) {
    throw new Error(`HTML <s> strikethrough did not render with cm-md-strike: ${JSON.stringify(rendered.htmlStrikeLine)}`);
  }
  if (rendered.htmlStrikeLine.text.includes("<s>") || rendered.htmlStrikeLine.text.includes("</s>")) {
    throw new Error(`HTML <s> tags leaked into preview text: ${JSON.stringify(rendered.htmlStrikeLine)}`);
  }
  if (!rendered.htmlDelStrikeLine) throw new Error("Missing HTML <del> strikethrough regression line");
  if (!rendered.htmlDelStrikeLine.strikeText.some((text) => text.includes("HTML del 删除线"))) {
    throw new Error(`HTML <del> strikethrough did not render with cm-md-strike: ${JSON.stringify(rendered.htmlDelStrikeLine)}`);
  }
  if (rendered.htmlDelStrikeLine.text.includes("<del>") || rendered.htmlDelStrikeLine.text.includes("</del>")) {
    throw new Error(`HTML <del> tags leaked into preview text: ${JSON.stringify(rendered.htmlDelStrikeLine)}`);
  }

  const taskCheckboxToggle = await assertTaskCheckboxPreviewAndToggle(page, fixture, rendered);
  const missingDatabasePlaceholder = await assertMissingDatabasePlaceholderPreview(page);

  if (!rendered.underlineLine) throw new Error("Missing underline regression line");
  if (!rendered.underlineLine.underlineText.some((text) => text.includes("重要下划线"))) {
    throw new Error(`Underline did not render with cm-md-underline: ${JSON.stringify(rendered.underlineLine)}`);
  }

  if (!rendered.highlightLine) throw new Error("Missing highlight regression line");
  if (!rendered.highlightLine.highlightText.some((text) => text.includes("重点高亮"))) {
    throw new Error(`Highlight did not render with cm-md-highlight: ${JSON.stringify(rendered.highlightLine)}`);
  }
  if (!rendered.colorLine) throw new Error("Missing Notion inline color regression line");
  if (!rendered.colorLine.colorText.some((text) => text.includes("红色文字"))) {
    throw new Error(`Notion foreground color did not render with cm-md-notion-color-red: ${JSON.stringify(rendered.colorLine)}`);
  }
  if (!rendered.colorLine.bgText.some((text) => text.includes("蓝色背景"))) {
    throw new Error(`Notion background color did not render with cm-md-notion-bg-blue: ${JSON.stringify(rendered.colorLine)}`);
  }
  if (rendered.colorLine.text.includes("data-lotion-color") || rendered.colorLine.text.includes("data-lotion-bg")) {
    throw new Error(`Notion color tags leaked into preview text: ${JSON.stringify(rendered.colorLine)}`);
  }
  const importedHighlightSelection = await assertImportedHighlightSelectionAndSourceEditing(page, fixture, viewport, artifactRoot);
  rendered.importedHighlightSelection = importedHighlightSelection.snapshot;
  visualSnapshots.push(importedHighlightSelection.visualSnapshot);
  if (!rendered.listColorLine) throw new Error("Missing Notion list color regression line");
  if (!rendered.listColorLine.colorText.some((text) => text.includes("列表红色"))) {
    throw new Error(`Notion list foreground color did not render with cm-md-notion-color-red: ${JSON.stringify(rendered.listColorLine)}`);
  }
  if (rendered.listColorLine.text.includes("data-lotion-color") || rendered.listColorLine.text.includes("data-lotion-bg")) {
    throw new Error(`Notion list color tags leaked into preview text: ${JSON.stringify(rendered.listColorLine)}`);
  }
  if (!rendered.calloutMark || !rendered.calloutClassName) {
    await scrollUntilMounted(page, ".cm-md-callout-widget", "callout widget");
    Object.assign(rendered, await renderedCalloutSnapshot(page));
  }
  if (rendered.calloutMark !== "高亮提示") {
    throw new Error(`Callout mark did not render as real mark: ${JSON.stringify(rendered)}`);
  }
  if (rendered.calloutColor !== "绿色提示") {
    throw new Error(`Callout color span did not render as safe inline color: ${JSON.stringify(rendered)}`);
  }
  if (rendered.calloutText.includes("<mark>")) {
    throw new Error(`Callout mark leaked raw tags: ${JSON.stringify(rendered)}`);
  }
  if (rendered.calloutText.includes("data-lotion-color")) {
    throw new Error(`Callout color span leaked raw tags: ${JSON.stringify(rendered)}`);
  }
  if (!rendered.calloutClassName.includes("cm-md-callout-bg-green")) {
    throw new Error(`Callout background metadata did not render as a Notion bg class: ${JSON.stringify(rendered)}`);
  }
  if (rendered.rawCalloutSourceVisible) {
    throw new Error(`Inactive callout source leaked into live preview: ${JSON.stringify(rendered)}`);
  }
  if (!rendered.calloutHasEditSource) {
    throw new Error(`Collapsed callout should expose an edit source button: ${JSON.stringify(rendered)}`);
  }
  if (!rendered.imagePreview) {
    throw new Error("Missing standalone image preview widget");
  }
  if (rendered.imagePreview.rawSourceVisible) {
    throw new Error(`Inactive image source leaked into live preview: ${JSON.stringify(rendered.imagePreview)}`);
  }
  if (!rendered.imagePreview.src.startsWith("data:image/svg+xml")) {
    throw new Error(`Image preview did not preserve the renderable image src: ${JSON.stringify(rendered.imagePreview)}`);
  }
  if (rendered.imagePreview.alt !== "Preview image") {
    throw new Error(`Image preview alt text mismatch: ${JSON.stringify(rendered.imagePreview)}`);
  }
  if (rendered.imagePreview.hasEditSource) {
    throw new Error(`Image preview should keep its source hidden by default: ${JSON.stringify(rendered.imagePreview)}`);
  }
  const imageSourceReveal = await assertImageSourceHidden(page);
  const calloutDelta = rendered.calloutLineLeftDelta ?? rendered.calloutContentLeftDelta;
  if (calloutDelta === null || Math.abs(calloutDelta) > 2) {
    throw new Error(`Callout preview is not aligned with the editor content column: ${JSON.stringify(rendered)}`);
  }
  await scrollEditorToBottom(page);
  await page.getByText("E = mc^2").first().waitFor({ timeout: 8_000 });
  Object.assign(rendered, await renderedWidgetSnapshot(page));
  visualSnapshots.push(await captureMarkdownPreviewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "widgets",
      iframeTitle: rendered.iframePreview?.title ?? "",
      iframeSrc: rendered.iframePreview?.src ?? "",
      toggleSummary: rendered.togglePreview?.summary ?? "",
      equationText: rendered.equationPreview?.text ?? "",
      missingDatabaseVisible: Boolean(await page.locator(".cm-md-missing-database-widget").count())
    },
    page,
    viewport
  }));
  if (!rendered.iframePreview) {
    throw new Error("Missing lotion-iframe preview widget");
  }
  if (rendered.iframePreview.title !== "Indify progress") {
    throw new Error(`Iframe preview title mismatch: ${JSON.stringify(rendered.iframePreview)}`);
  }
  if (rendered.iframePreview.src !== "https://indify.co/widgets/live/progressBar/CJC1CaARFbRiUGHJPNdR") {
    throw new Error(`Iframe preview src mismatch: ${JSON.stringify(rendered.iframePreview)}`);
  }
  if (rendered.iframePreview.linkHref !== rendered.iframePreview.src || rendered.iframePreview.linkText !== rendered.iframePreview.src) {
    throw new Error(`Iframe preview link mismatch: ${JSON.stringify(rendered.iframePreview)}`);
  }
  if (rendered.iframePreview.height !== "180px") {
    throw new Error(`Iframe preview height mismatch: ${JSON.stringify(rendered.iframePreview)}`);
  }
  if (!rendered.togglePreview) {
    throw new Error("Missing lotion-toggle preview widget");
  }
  if (rendered.togglePreview.summary !== "计划折叠块") {
    throw new Error(`Toggle preview summary mismatch: ${JSON.stringify(rendered.togglePreview)}`);
  }
  if (!rendered.togglePreview.body.includes("折叠内容")) {
    throw new Error(`Toggle preview body mismatch: ${JSON.stringify(rendered.togglePreview)}`);
  }
  if (!rendered.togglePreview.open) {
    throw new Error(`Toggle preview should preserve open=true: ${JSON.stringify(rendered.togglePreview)}`);
  }
  if (rendered.togglePreview.summaryEditable !== "SPAN" || rendered.togglePreview.summaryContentEditable !== "plaintext-only" || rendered.togglePreview.bodyEditable !== "DIV") {
    throw new Error(`Toggle preview should render as Notion-like text blocks, not native inputs: ${JSON.stringify(rendered.togglePreview)}`);
  }
  if (rendered.togglePreview.bodyContentEditable || String(rendered.togglePreview.bodyHtml || "").includes("<textarea") || String(rendered.togglePreview.bodyHtml || "").includes("<input")) {
    throw new Error(`Toggle preview body should render Markdown content without native controls: ${JSON.stringify(rendered.togglePreview)}`);
  }
  if (rendered.togglePreview.hasEditSource) {
    throw new Error(`Toggle preview should keep its source hidden by default: ${JSON.stringify(rendered.togglePreview)}`);
  }
  const importedNotionToggle = await assertImportedNotionTogglePreview(page, fixture, viewport, artifactRoot);
  rendered.importedNotionToggle = importedNotionToggle.snapshot;
  if (!rendered.equationPreview) {
    throw new Error("Missing lotion-equation preview widget");
  }
  if (!rendered.equationPreview.text.includes("E = mc^2")) {
    throw new Error(`Equation preview source mismatch: ${JSON.stringify(rendered.equationPreview)}`);
  }
  if (!rendered.equationPreview.hasEditSource) {
    throw new Error(`Equation preview should expose an edit source button: ${JSON.stringify(rendered.equationPreview)}`);
  }
  if (!rendered.tablePreview) {
    throw new Error("Missing Markdown table preview widget");
  }
  if (!rendered.tablePreview.text.includes("主动增管") || rendered.tablePreview.editableCellText !== "2(天)") {
    throw new Error(`Markdown table preview did not render expected cells: ${JSON.stringify(rendered.tablePreview)}`);
  }
  if (rendered.tablePreview.editableCellContentEditable !== "plaintext-only") {
    throw new Error(`Markdown table cell should be directly editable: ${JSON.stringify(rendered.tablePreview)}`);
  }
  if (!rendered.tablePreview.hasEditSource || rendered.tablePreview.editSourceText !== "Edit source") {
    throw new Error(`Markdown table preview should expose an edit source button: ${JSON.stringify(rendered.tablePreview)}`);
  }
  const tableControlActions = new Set(rendered.tablePreview.controls?.map((control) => control.action));
  for (const action of ["add-row", "add-column", "delete-row", "delete-column"]) {
    if (!tableControlActions.has(action)) {
      throw new Error(`Markdown table preview missing structure control ${action}: ${JSON.stringify(rendered.tablePreview)}`);
    }
  }
  if (rendered.tablePreview.rowDragHandleCount < 2 || rendered.tablePreview.columnDragHandleCount < 3) {
    throw new Error(`Markdown table preview missing drag handles: ${JSON.stringify(rendered.tablePreview)}`);
  }
  const markdownTableSourceEdit = await assertMarkdownTableSourceEditing(page);
  const markdownTableStructureEdit = await assertMarkdownTableStructureEditing(page, fixture);
  const markdownTableDragReorder = await assertMarkdownTableDragReordering(page, fixture);
  const markdownTableEdit = await assertMarkdownTableCellEditing(page, fixture);
  const toggleDirectEdit = await assertToggleDirectEditing(page, fixture, viewport);
  await scrollEditorToBottom(page);
  await page.locator(".cm-md-equation-widget-outer .cm-md-edit-source").first().waitFor({ timeout: 8_000 });
  await page.locator(".cm-md-equation-widget-outer .cm-md-edit-source").first().click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll(".cm-line")).some((line) => (line.textContent ?? "").includes("```lotion-equation")),
    null,
    { timeout: 5_000 }
  );

  if (!rendered.longLinkLine || !rendered.multilineLinkLabelLine || !rendered.escapedLabelLine) {
    await scrollEditorToBottom(page);
    await page.getByText("prompting-long-context").first().waitFor({ timeout: 8_000 });
    await page.getByText("multiline%20decoded").first().waitFor({ timeout: 8_000 });
    await page.getByText("Project [A]").first().waitFor({ timeout: 8_000 });
    const bottomRendered = await renderedLinkLineSnapshot(page);
    rendered.longLinkLine = bottomRendered.longLinkLine;
    rendered.multilineLinkLabelLine = bottomRendered.multilineLinkLabelLine;
    rendered.escapedLabelLine = bottomRendered.escapedLabelLine;
  }

  if (!rendered.longLinkLine) throw new Error("Missing long URL link regression line");
  if (!rendered.longLinkLine.text.includes("100,000 token long context")) {
    throw new Error(`Long URL label was not decoded: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  if (/%20|%2C/i.test(rendered.longLinkLine.text)) {
    throw new Error(`Long URL label leaked encoded characters: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  const urlCount = rendered.longLinkLine.text.split("https://www.anthropic.com/index/prompting-long-context").length - 1;
  if (urlCount !== 1) {
    throw new Error(`Long URL label rendered ${urlCount} URL copies: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  if (!rendered.longLinkLine.links.some((link) => /%20/.test(link.url ?? ""))) {
    throw new Error(`Long URL link lost encoded destination: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  if (rendered.longLinkLine.links.length !== 1) {
    throw new Error(`Long URL line should expose exactly one click target: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  if (rendered.longLinkLine.strikeText.length > 0) {
    throw new Error(`Long URL line was falsely decorated as strikethrough: ${JSON.stringify(rendered.longLinkLine)}`);
  }

  if (!rendered.multilineLinkLabelLine) throw new Error("Missing multiline link label regression line");
  if (!rendered.multilineLinkLabelLine.text.includes("multiline%20decoded")) {
    throw new Error(`Multiline link label was not visible: ${JSON.stringify(rendered.multilineLinkLabelLine)}`);
  }
  if (rendered.multilineLinkLabelLine.text.includes("multiline decoded")) {
    throw new Error(`Multiline link label should not be replaced by a cross-line widget: ${JSON.stringify(rendered.multilineLinkLabelLine)}`);
  }

  if (!rendered.escapedLabelLine) throw new Error("Missing escaped link label regression line");
  if (rendered.escapedLabelLine.text.includes("\\[") || rendered.escapedLabelLine.text.includes("\\]")) {
    throw new Error(`Escaped link label leaked markdown escapes: ${JSON.stringify(rendered.escapedLabelLine)}`);
  }
  if (!rendered.escapedLabelLine.text.includes("Project [A]")) {
    throw new Error(`Escaped link label did not render visible brackets: ${JSON.stringify(rendered.escapedLabelLine)}`);
  }
  if (rendered.escapedLabelLine.links.length !== 1) {
    throw new Error(`Escaped link label should expose exactly one click target: ${JSON.stringify(rendered.escapedLabelLine)}`);
  }
  if (rendered.escapedLabelLine.links[0]?.url !== "https://example.com/project-a") {
    throw new Error(`Escaped link label lost destination URL: ${JSON.stringify(rendered.escapedLabelLine)}`);
  }
  const rawToggle = {
    on: await assertRawMarkdownToggle(page, fixture, true),
    off: await assertRawMarkdownToggle(page, fixture, false)
  };
  const rawMarkdownOpenLink = await assertRawMarkdownModifierOpenLink(page);
  await assertNoDocumentHorizontalOverflow(page, `markdown preview final ${viewport.name}`);
  await assertIntersectsViewport(page, page.locator('[data-testid="markdown-editor"]').first(), `markdown editor final ${viewport.name}`, 4);

  return {
    rendered,
    visualSnapshots,
    imageSourceReveal,
    importedNotionToggle,
    markdownTableEdit,
    markdownTableSourceEdit,
    markdownTableStructureEdit,
    markdownTableDragReorder,
    toggleDirectEdit,
    taskCheckboxToggle,
    missingDatabasePlaceholder,
    rawToggle,
    rawMarkdownOpenLink
  };
}

async function assertImportedNotionTogglePreview(page, fixture, viewport, artifactRoot) {
  await page.waitForFunction(async () => {
    const scroller = document.querySelector(".cm-scroller");
    if (!(scroller instanceof HTMLElement)) return false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const found = Array.from(document.querySelectorAll(".cm-md-toggle-widget")).some((toggle) => {
        const summary = toggle.querySelector(".cm-md-toggle-summary-text");
        const body = toggle.querySelector(".cm-md-toggle-body");
        const summaryText = summary?.textContent ?? "";
        const bodyText = body?.textContent ?? "";
        return summaryText.trim() === "收据" && bodyText.includes("Example vision appointment");
      });
      if (found) return true;
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        scroller.scrollTop + Math.max(160, Math.floor(scroller.clientHeight * 0.65))
      );
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    return false;
  }, null, { timeout: 8_000 });

  const snapshot = await page.evaluate(() => {
    const toggles = Array.from(document.querySelectorAll(".cm-md-toggle-widget"));
    const toggle = toggles.find((candidate) => {
      const summary = candidate.querySelector(".cm-md-toggle-summary-text");
      const body = candidate.querySelector(".cm-md-toggle-body");
      const summaryText = summary?.textContent ?? "";
      const bodyText = body?.textContent ?? "";
      return summaryText.trim() === "收据" && bodyText.includes("Example vision appointment");
    });
    const summary = toggle?.querySelector(".cm-md-toggle-summary-text") ?? null;
    const body = toggle?.querySelector(".cm-md-toggle-body") ?? null;
    const disclosure = toggle?.querySelector(".cm-md-toggle-disclosure") ?? null;
    const edit = toggle?.closest(".cm-md-toggle-widget-outer")?.querySelector(".cm-md-edit-source") ?? null;
    const rect = toggle?.getBoundingClientRect();
    return {
      bodyEditable: body?.tagName ?? "",
      bodyHtml: body instanceof HTMLElement ? body.innerHTML : "",
      bodyText: body?.textContent ?? "",
      bodyImageCount: body?.querySelectorAll("img").length ?? 0,
      bodyRawMarkdownVisible: Boolean(body?.textContent?.includes("![receipt.jpg](")),
      disclosureVisible: disclosure instanceof HTMLElement && disclosure.getBoundingClientRect().width > 0,
      editSourcePresent: Boolean(edit),
      open: toggle?.hasAttribute("open") ?? false,
      rect: rect ? {
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width)
      } : null,
      summaryEditable: summary?.tagName ?? "",
      summaryContentEditable: summary?.getAttribute("contenteditable") ?? "",
      summaryText: summary?.textContent?.trim() ?? "",
      toggleCount: toggles.length
    };
  });
  if (snapshot.summaryText !== "收据" || snapshot.summaryEditable !== "SPAN" || snapshot.summaryContentEditable !== "plaintext-only") {
    throw new Error(`Imported Notion toggle summary did not render as an editable toggle: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.bodyEditable !== "DIV" || !snapshot.bodyText.includes("Example vision appointment")) {
    throw new Error(`Imported Notion toggle body text was not preserved: ${JSON.stringify(snapshot)}`);
  }
  if (snapshot.bodyRawMarkdownVisible || snapshot.bodyImageCount < 1) {
    throw new Error(`Imported Notion toggle nested image should render as an image, not raw Markdown: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.open || !snapshot.disclosureVisible || snapshot.editSourcePresent) {
    throw new Error(`Imported Notion toggle controls are incomplete: ${JSON.stringify(snapshot)}`);
  }

  await assertNoDocumentHorizontalOverflow(page, `imported Notion toggle ${viewport.name}`);
  const visualSnapshot = await captureMarkdownPreviewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "imported-toggle",
      importedToggleBodyIncludesReceipt: snapshot.bodyText.includes("receipt.jpg"),
      importedToggleOpen: snapshot.open,
      importedToggleSummary: snapshot.summaryText
    },
    page,
    viewport
  });

  await page.waitForFunction(() => {
    const toggle = Array.from(document.querySelectorAll(".cm-md-toggle-widget")).find((candidate) => {
      const summary = candidate.querySelector(".cm-md-toggle-summary-text");
      return summary?.textContent?.trim() === "收据";
    });
    const button = toggle?.querySelector(".cm-md-toggle-disclosure");
    if (!(button instanceof HTMLElement)) return false;
    button.click();
    return true;
  }, null, { timeout: 5_000 });
  await waitForPageMarkdown(page, fixture.pageId, "summary: 收据", "imported Notion toggle markdown after collapse");
  await page.waitForFunction(
    () => {
      const toggle = Array.from(document.querySelectorAll(".cm-md-toggle-widget")).find((candidate) => {
        const summary = candidate.querySelector(".cm-md-toggle-summary-text");
        return summary?.textContent?.trim() === "收据";
      });
      const body = toggle?.querySelector(".cm-md-toggle-body");
      return toggle && body instanceof HTMLElement
        ? !toggle.hasAttribute("open") && body.hidden && getComputedStyle(body).display === "none"
        : false;
    },
    null,
    { timeout: 5_000 }
  );
  await page.waitForFunction(() => {
    const toggle = Array.from(document.querySelectorAll(".cm-md-toggle-widget")).find((candidate) => {
      const summary = candidate.querySelector(".cm-md-toggle-summary-text");
      return summary?.textContent?.trim() === "收据";
    });
    const summary = toggle?.querySelector(".cm-md-toggle-summary-text");
    if (!(summary instanceof HTMLElement)) return false;
    summary.click();
    return true;
  }, null, { timeout: 5_000 });
  await page.waitForFunction(async ({ targetPageId }) => {
    const doc = await window.lotion.pages.get(targetPageId);
    return /summary: 收据\nopen: true/.test(doc.markdown);
  }, { targetPageId: fixture.pageId }, { timeout: 5_000 });
  await page.waitForFunction(
    () => {
      const toggle = Array.from(document.querySelectorAll(".cm-md-toggle-widget")).find((candidate) => {
        const summary = candidate.querySelector(".cm-md-toggle-summary-text");
        return summary?.textContent?.trim() === "收据";
      });
      const body = toggle?.querySelector(".cm-md-toggle-body");
      return toggle && body instanceof HTMLElement
        ? toggle.hasAttribute("open") && !body.hidden && getComputedStyle(body).display !== "none"
        : false;
    },
    null,
    { timeout: 5_000 }
  );

  return {
    snapshot,
    visualSnapshot
  };
}

async function assertImportedHighlightSelectionAndSourceEditing(page, fixture, viewport, artifactRoot) {
  const selectedText = "From now on, make it a personal commitment";
  await scrollEditorToTop(page);
  const line = page.locator(".cm-line").filter({ hasText: "personal commitment" }).first();
  await line.waitFor({ timeout: 8_000 });
  await line.scrollIntoViewIfNeeded();
  const editSourceButton = line.locator(".cm-md-block-source-edit-widget .cm-md-edit-source").first();
  await editSourceButton.waitFor({ timeout: 5_000 });
  await line.hover();
  await page.waitForFunction(
    () => {
      const buttons = Array.from(document.querySelectorAll(".cm-md-line-blockquote .cm-md-block-source-edit-widget .cm-md-edit-source"));
      return buttons.some((button) => button instanceof HTMLElement && getComputedStyle(button).opacity === "1");
    },
    null,
    { timeout: 5_000 }
  );
  const editSourceButtonState = await editSourceButton.evaluate((button) => ({
    text: button.textContent ?? "",
    title: button.getAttribute("title") ?? "",
    opacity: getComputedStyle(button).opacity
  }));
  if (editSourceButtonState.text !== "Edit source" || editSourceButtonState.opacity !== "1") {
    throw new Error(`Blockquote Edit source affordance is not visible on hover: ${JSON.stringify(editSourceButtonState)}`);
  }
  await editSourceButton.click();
  await nextAnimationFrame(page);

  const active = await line.evaluate((element) => ({
    text: element.textContent ?? "",
    sourceText: (element.textContent ?? "").replace(/^Edit source/, ""),
    bgText: Array.from(element.querySelectorAll(".cm-md-notion-bg-yellow")).map((node) => node.textContent ?? ""),
    markerText: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? ""),
    lineHasSelectionClass: element.classList.contains("cm-md-line-has-selection")
  }));
  if (!active.sourceText.includes('data-lotion-bg="yellow"') || !active.sourceText.includes("**") || !/^\s*>/.test(active.sourceText)) {
    throw new Error(`Active imported highlight line should expose editable source: ${JSON.stringify(active)}`);
  }
  if (!active.lineHasSelectionClass) {
    throw new Error(`Blockquote Edit source should select the source block: ${JSON.stringify(active)}`);
  }
  if (!active.bgText.some((text) => text.includes(selectedText))) {
    throw new Error(`Active imported highlight line should keep highlight decoration on source text: ${JSON.stringify(active)}`);
  }

  const selection = await selectEditorTextByDrag(page, selectedText);
  await nextAnimationFrame(page);
  await page.waitForFunction(
    () => Boolean(document.querySelector(".cm-editor.cm-md-has-selection")),
    null,
    { timeout: 5_000 }
  );
  const snapshot = await line.evaluate((element, payload) => {
    const { expectedText, editSourceButtonState } = payload;
    const target = Array.from(element.querySelectorAll(".cm-md-notion-bg-yellow"))
      .find((node) => (node.textContent ?? "").includes(expectedText));
    const style = target instanceof HTMLElement ? getComputedStyle(target) : null;
    const lineStyle = getComputedStyle(element);
    return {
      text: element.textContent ?? "",
      sourceEditable: Boolean((element.textContent ?? "").includes('data-lotion-bg="yellow"') && (element.textContent ?? "").includes("**")),
      selectedText: window.getSelection()?.toString() ?? "",
      editorHasSelection: Boolean(element.closest(".cm-editor")?.classList.contains("cm-md-has-selection")),
      lineClassName: element.className,
      lineHasSelectionClass: element.classList.contains("cm-md-line-has-selection"),
      lineIsBlockquote: element.classList.contains("cm-md-line-blockquote"),
      lineBackground: lineStyle.backgroundColor,
      bgText: target?.textContent ?? "",
      bgBackground: style?.backgroundColor ?? "",
      editSourceButtonState
    };
  }, { expectedText: selectedText, editSourceButtonState });
  snapshot.selection = selection;

  if (!snapshot.sourceEditable) {
    throw new Error(`Selected imported highlight line lost editable source: ${JSON.stringify(snapshot)}`);
  }
  if (!snapshot.editorHasSelection || !snapshot.selectedText.includes(selectedText)) {
    throw new Error(`Imported highlight selection did not activate editor selection: ${JSON.stringify(snapshot)}`);
  }
  if (!/^(?:transparent|rgba?\(0,\s*0,\s*0(?:,\s*0)?\))$/.test(snapshot.bgBackground)) {
    throw new Error(`Imported highlight background still obscures selection: ${JSON.stringify(snapshot)}`);
  }
  const lineBackgroundAlpha = cssColorAlpha(snapshot.lineBackground);
  if (!snapshot.lineHasSelectionClass || !snapshot.lineIsBlockquote || lineBackgroundAlpha >= 1) {
    throw new Error(`Selected block background still obscures selection: ${JSON.stringify({ ...snapshot, lineBackgroundAlpha })}`);
  }

  const visualSnapshot = await captureMarkdownPreviewSnapshot({
    artifactRoot,
    fixture,
    metadata: {
      phase: "selected-imported-highlight",
      selectionBackgroundTransparent: true,
      blockBackgroundAlpha: lineBackgroundAlpha,
      sourceEditable: snapshot.sourceEditable
    },
    page,
    viewport
  });

  return {
    snapshot,
    visualSnapshot
  };
}

function cssColorAlpha(value) {
  const color = String(value || "").trim();
  if (!color || color === "transparent") return 0;
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (!rgba) return 1;
  const parts = rgba[1].split(",").map((part) => part.trim());
  if (parts.length < 4) return 1;
  const alpha = Number(parts[3]);
  return Number.isFinite(alpha) ? alpha : 1;
}

async function selectEditorTextByDrag(page, text) {
  await page.locator('[data-testid="markdown-editor"]').first().waitFor({ timeout: 8_000 });
  const range = await page.evaluate((expected) => {
    const lines = Array.from(document.querySelectorAll(".cm-content .cm-line"));
    const line = lines.find((candidate) => (candidate.textContent ?? "").includes(expected));
    if (!line) return null;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      textNodes.push({ node, start: text.length, end: text.length + (node.textContent ?? "").length });
      text += node.textContent ?? "";
    }
    const start = text.indexOf(expected);
    if (start < 0) return null;
    const end = start + expected.length;
    const startNode = textNodes.find((entry) => start >= entry.start && start <= entry.end);
    const endNode = textNodes.find((entry) => end >= entry.start && end <= entry.end);
    if (!startNode || !endNode) return null;
    const selectionRange = document.createRange();
    selectionRange.setStart(startNode.node, start - startNode.start);
    selectionRange.setEnd(endNode.node, end - endNode.start);
    const rect = selectionRange.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      from: { x: rect.left + 1, y: rect.top + rect.height / 2 },
      to: { x: rect.right - 1, y: rect.top + rect.height / 2 }
    };
  }, text);
  if (!range) throw new Error(`Could not locate editor text range for ${JSON.stringify(text)}`);

  await page.mouse.move(range.from.x, range.from.y);
  await page.mouse.down();
  await page.mouse.move(range.to.x, range.to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    ({ expected }) => (window.getSelection()?.toString() ?? "").includes(expected),
    { expected: text },
    { timeout: 5_000 }
  );
  return {
    selected: true,
    selectedText: await page.evaluate(() => window.getSelection()?.toString() ?? "")
  };
}

async function captureMarkdownPreviewSnapshot({ artifactRoot, fixture, metadata, page, viewport }) {
  const editor = page.locator('[data-testid="markdown-editor"]').first();
  await assertIntersectsViewport(page, editor, `markdown visual snapshot editor ${metadata.phase} ${viewport.name}`, 4);
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: editor,
    metadata: {
      pageId: fixture.pageId,
      pageTitle: fixture.pageTitle,
      ...metadata
    },
    name: `markdown-preview-${metadata.phase}-${viewport.name}`,
    page,
    viewport
  });
  return {
    phase: metadata.phase,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: Number(snapshot.rect.height.toFixed(1)),
    width: Number(snapshot.rect.width.toFixed(1))
  };
}

async function scrollEditorToTop(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  });
  await page.waitForTimeout(50);
}

async function scrollEditorToBottom(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector(".cm-scroller");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    }
  });
  await page.waitForTimeout(50);
}

async function scrollUntilMounted(page, selector, label) {
  const mounted = await page.evaluate(async ({ selector, label }) => {
    const scroller = document.querySelector(".cm-scroller");
    if (!(scroller instanceof HTMLElement)) return { ok: false, reason: "missing scroller" };
    for (let attempt = 0; attempt < 18; attempt += 1) {
      if (document.querySelector(selector)) {
        return { ok: true, scrollTop: scroller.scrollTop, attempt };
      }
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        scroller.scrollTop + Math.max(160, Math.floor(scroller.clientHeight * 0.65))
      );
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
    }
    return {
      ok: false,
      reason: `missing ${label}`,
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight
    };
  }, { selector, label });
  if (!mounted.ok) throw new Error(`Could not mount ${label}: ${JSON.stringify(mounted)}`);
}

async function assertImageSourceHidden(page) {
  const imageWidget = page.locator(".cm-md-image-widget").first();
  await imageWidget.waitFor({ timeout: 8_000 });
  const initial = await page.evaluate(() => {
    const imageWidget = document.querySelector(".cm-md-image-widget");
    const edit = imageWidget?.querySelector(".cm-md-edit-source") ?? null;
    const image = imageWidget?.querySelector("img") ?? null;
    const sourceVisible = Array.from(document.querySelectorAll(".cm-line")).some((line) =>
      (line.textContent ?? "").includes("![Preview image]")
    );
    return {
      editSourcePresent: Boolean(edit),
      imageVisible: Boolean(image),
      imageAlt: image?.getAttribute("alt") ?? "",
      sourceVisible
    };
  });
  if (initial.editSourcePresent || initial.sourceVisible || !initial.imageVisible) {
    throw new Error(`Image preview should hide source and edit-source affordance: ${JSON.stringify(initial)}`);
  }

  await imageWidget.hover();
  await nextAnimationFrame(page);
  const afterHover = await page.evaluate(() => {
    const imageWidget = document.querySelector(".cm-md-image-widget");
    const edit = imageWidget?.querySelector(".cm-md-edit-source") ?? null;
    const image = imageWidget?.querySelector("img") ?? null;
    const sourceVisible = Array.from(document.querySelectorAll(".cm-line")).some((line) =>
      (line.textContent ?? "").includes("![Preview image]")
    );
    return {
      editSourcePresent: Boolean(edit),
      imageVisible: Boolean(image),
      sourceVisible
    };
  });
  if (afterHover.editSourcePresent || afterHover.sourceVisible || !afterHover.imageVisible) {
    throw new Error(`Image source became visible on hover: ${JSON.stringify(afterHover)}`);
  }

  await imageWidget.click();
  await nextAnimationFrame(page);
  const afterClick = await page.evaluate(() => {
    const imageWidget = document.querySelector(".cm-md-image-widget");
    const edit = imageWidget?.querySelector(".cm-md-edit-source") ?? null;
    const image = imageWidget?.querySelector("img") ?? null;
    const active = document.activeElement;
    const sourceVisible = Array.from(document.querySelectorAll(".cm-line")).some((line) =>
      (line.textContent ?? "").includes("![Preview image]")
    );
    return {
      activeElementClass: active instanceof HTMLElement ? active.className : "",
      editSourcePresent: Boolean(edit),
      imageVisible: Boolean(image),
      sourceVisible
    };
  });
  if (afterClick.editSourcePresent || afterClick.sourceVisible || !afterClick.imageVisible) {
    throw new Error(`Image source became visible on click: ${JSON.stringify(afterClick)}`);
  }

  await scrollEditorToTop(page);
  await page.getByText("开始恢复锻炼").first().click();
  await page.waitForFunction(
    () => {
      const sourceVisible = Array.from(document.querySelectorAll(".cm-line")).some((line) =>
        (line.textContent ?? "").includes("![Preview image]")
      );
      const imageVisible = Boolean(document.querySelector(".cm-md-image-widget img"));
      return !sourceVisible && imageVisible;
    },
    null,
    { timeout: 5_000 }
  );
  const afterLeavingSource = await page.evaluate(() => {
    const sourceVisible = Array.from(document.querySelectorAll(".cm-line")).some((line) =>
      (line.textContent ?? "").includes("![Preview image]")
    );
    const imageWidget = document.querySelector(".cm-md-image-widget");
    const image = imageWidget?.querySelector("img") ?? null;
    return {
      sourceVisible,
      imageVisible: Boolean(image),
      imageAlt: image?.getAttribute("alt") ?? ""
    };
  });
  if (afterLeavingSource.sourceVisible || !afterLeavingSource.imageVisible) {
    throw new Error(`Image source stayed visible after focus left source line: ${JSON.stringify(afterLeavingSource)}`);
  }
  return {
    initial,
    afterHover,
    afterClick,
    afterLeavingSource
  };
}

async function assertMarkdownTableSourceEditing(page) {
  await setRawMarkdown(page, false);
  await scrollEditorToTop(page);
  const tableWidget = page.locator(".cm-md-table-widget").first();
  await tableWidget.waitFor({ timeout: 8_000 });
  const editSource = tableWidget.locator(".cm-md-edit-source").first();
  await editSource.waitFor({ timeout: 5_000 });
  await tableWidget.hover();
  await page.waitForFunction(
    () => {
      const button = document.querySelector(".cm-md-table-widget > .cm-md-edit-source");
      return button instanceof HTMLElement && getComputedStyle(button).opacity === "1";
    },
    null,
    { timeout: 5_000 }
  );
  const buttonState = await editSource.evaluate((button) => ({
    text: button.textContent ?? "",
    title: button.getAttribute("title") ?? "",
    opacity: getComputedStyle(button).opacity
  }));
  if (buttonState.text !== "Edit source" || buttonState.opacity !== "1") {
    throw new Error(`Markdown table Edit source affordance is not visible on hover: ${JSON.stringify(buttonState)}`);
  }

  await editSource.click();
  await nextAnimationFrame(page);
  const sourceState = await page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll(".cm-line")).map((line) => ({
      text: line.textContent ?? "",
      className: line.className
    }));
    const headerLine = lines.find((line) => line.text.includes("| 名称 | 配额 | 目前余额 |")) ?? null;
    const rowLine = lines.find((line) => line.text.includes("| 主动增管 | 2(天/周) | 2(天) |")) ?? null;
    return {
      headerLine,
      rowLine,
      tableWidgetVisible: Boolean(document.querySelector(".cm-md-table-widget table"))
    };
  });
  if (!sourceState.headerLine || !sourceState.rowLine || sourceState.tableWidgetVisible) {
    throw new Error(`Markdown table Edit source did not reveal raw table source: ${JSON.stringify(sourceState)}`);
  }

  const safeLine = page.locator(".cm-line").filter({ hasText: "开始恢复锻炼" }).first();
  await safeLine.click();
  await nextAnimationFrame(page);
  await page.locator(".cm-md-table-widget table").first().waitFor({ timeout: 5_000 });

  return {
    buttonState,
    sourceState
  };
}

async function assertMarkdownTableStructureEditing(page, fixture) {
  await setRawMarkdown(page, false);
  await scrollEditorToTop(page);
  await page.locator(".cm-md-table-widget table").first().waitFor({ timeout: 8_000 });

  const originalHeader = "| 名称 | 配额 | 目前余额 |";
  const originalFirstRow = "| 主动增管 | 2(天/周) | 2(天) |";
  const insertedBlankRow = "|  |  |  |";
  const insertedColumnHeader = "| 名称 | 配额 | 目前余额 | Column 4 |";
  const insertedColumnRow = "| 主动增管 | 2(天/周) | 2(天) |  |";

  await page.locator(".cm-md-table-widget tbody td").filter({ hasText: "2(天)" }).first().click();
  await clickMarkdownTableControl(page, "add-row");
  await pollMarkdownTablePersistence(page, fixture.pageId, insertedBlankRow);

  await page.locator(".cm-md-table-widget tbody tr").nth(1).locator("td").first().click();
  await clickMarkdownTableControl(page, "delete-row");
  await pollMarkdownTableAbsence(page, fixture.pageId, insertedBlankRow);

  await page.locator(".cm-md-table-widget tbody td").filter({ hasText: "2(天)" }).first().click();
  await clickMarkdownTableControl(page, "add-column");
  await pollMarkdownTablePersistence(page, fixture.pageId, insertedColumnHeader);
  await pollMarkdownTablePersistence(page, fixture.pageId, insertedColumnRow);

  await page.locator(".cm-md-table-widget thead th").filter({ hasText: "Column 4" }).first().click();
  await clickMarkdownTableControl(page, "delete-column");
  await pollMarkdownTableAbsence(page, fixture.pageId, "Column 4");

  const result = await page.evaluate(async ({ pageId, originalHeader, originalFirstRow }) => {
    const doc = await window.lotion.pages.get(pageId);
    const tableText = document.querySelector(".cm-md-table-widget table")?.textContent ?? "";
    return {
      hasOriginalHeader: doc.markdown.includes(originalHeader),
      hasOriginalFirstRow: doc.markdown.includes(originalFirstRow),
      tableText
    };
  }, { pageId: fixture.pageId, originalHeader, originalFirstRow });
  if (!result.hasOriginalHeader || !result.hasOriginalFirstRow || !result.tableText.includes("主动增管")) {
    throw new Error(`Markdown table structure edit did not restore table shape: ${JSON.stringify(result)}`);
  }

  return {
    insertedBlankRow,
    insertedColumnHeader,
    restoredOriginal: true
  };
}

async function clickMarkdownTableControl(page, action) {
  const tableWidget = page.locator(".cm-md-table-widget").first();
  await tableWidget.hover();
  const control = tableWidget.locator(`.cm-md-table-control[data-table-action="${action}"]`).first();
  await control.waitFor({ timeout: 5_000 });
  await control.click();
  await nextAnimationFrame(page);
  await page.locator(".cm-md-table-widget table").first().waitFor({ timeout: 5_000 });
}

async function assertMarkdownTableDragReordering(page, fixture) {
  await setRawMarkdown(page, false);
  await scrollEditorToTop(page);
  await page.locator(".cm-md-table-widget table").first().waitFor({ timeout: 8_000 });

  const originalHeader = "| 名称 | 配额 | 目前余额 |";
  const originalFirstRow = "| 主动增管 | 2(天/周) | 2(天) |";
  const originalSecondRow = "| 开心果 | 1(磅/周) | 1(磅) |";
  const reorderedHeader = "| 配额 | 目前余额 | 名称 |";
  const reorderedFirstRow = "| 2(天/周) | 2(天) | 主动增管 |";

  await dragMarkdownTableHandle(
    page,
    page.locator('.cm-md-table-row-drag-handle[data-table-row="0"]').first(),
    page.locator(".cm-md-table-widget tbody tr").nth(1)
  );
  await pollMarkdownTableOrder(page, fixture.pageId, originalSecondRow, originalFirstRow);

  await dragMarkdownTableHandle(
    page,
    page.locator('.cm-md-table-row-drag-handle[data-table-row="1"]').first(),
    page.locator(".cm-md-table-widget tbody tr").nth(0)
  );
  await pollMarkdownTableOrder(page, fixture.pageId, originalFirstRow, originalSecondRow);

  await dragMarkdownTableHandle(
    page,
    page.locator('.cm-md-table-column-drag-handle[data-table-column="0"]').first(),
    page.locator(".cm-md-table-widget thead th").nth(2)
  );
  await pollMarkdownTablePersistence(page, fixture.pageId, reorderedHeader);
  await pollMarkdownTablePersistence(page, fixture.pageId, reorderedFirstRow);
  await waitForMarkdownTableHeaderOrder(page, ["配额", "目前余额", "名称"]);

  await dragMarkdownTableHandle(
    page,
    page.locator('.cm-md-table-column-drag-handle[data-table-column="2"]').first(),
    page.locator(".cm-md-table-widget thead th").nth(0)
  );
  await pollMarkdownTablePersistence(page, fixture.pageId, originalHeader);
  await pollMarkdownTablePersistence(page, fixture.pageId, originalFirstRow);
  await waitForMarkdownTableHeaderOrder(page, ["名称", "配额", "目前余额"]);

  const result = await page.evaluate(async ({ pageId, originalHeader, originalFirstRow, originalSecondRow }) => {
    const doc = await window.lotion.pages.get(pageId);
    const firstIndex = doc.markdown.indexOf(originalFirstRow);
    const secondIndex = doc.markdown.indexOf(originalSecondRow);
    const tableText = document.querySelector(".cm-md-table-widget table")?.textContent ?? "";
    return {
      hasOriginalHeader: doc.markdown.includes(originalHeader),
      firstBeforeSecond: firstIndex >= 0 && secondIndex > firstIndex,
      tableText
    };
  }, { pageId: fixture.pageId, originalHeader, originalFirstRow, originalSecondRow });
  if (!result.hasOriginalHeader || !result.firstBeforeSecond || !result.tableText.includes("主动增管")) {
    throw new Error(`Markdown table drag reorder did not restore original order: ${JSON.stringify(result)}`);
  }

  return {
    rowDragReordered: true,
    columnDragReordered: true,
    restoredOriginal: true
  };
}

async function dragMarkdownTableHandle(page, source, target) {
  const tableWidget = page.locator(".cm-md-table-widget").first();
  await tableWidget.hover();
  await source.waitFor({ timeout: 5_000 });
  await target.waitFor({ timeout: 5_000 });
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error(`Could not resolve markdown table drag geometry: ${JSON.stringify({ sourceBox, targetBox })}`);
  }
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2
  };
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2
  };
  const hitTest = await page.evaluate(({ sourcePoint, targetPoint }) => {
    const describe = (point) => {
      const element = document.elementFromPoint(point.x, point.y);
      if (!(element instanceof HTMLElement)) return null;
      return {
        tag: element.tagName,
        className: element.className,
        text: element.textContent ?? "",
        tableDragKind: element.dataset.tableDragKind ?? "",
        tableDragIndex: element.dataset.tableDragIndex ?? "",
        tableColumn: element.dataset.tableColumn ?? "",
        tableRow: element.dataset.tableRow ?? ""
      };
    };
    return {
      source: describe(sourcePoint),
      target: describe(targetPoint)
    };
  }, { sourcePoint, targetPoint });
  if (!String(hitTest.source?.className || "").includes("cm-md-table-drag-handle")) {
    throw new Error(`Markdown table drag source is covered or not hittable: ${JSON.stringify({ sourcePoint, targetPoint, hitTest })}`);
  }
  const midPoint = {
    x: sourcePoint.x + (targetPoint.x - sourcePoint.x) * 0.45,
    y: sourcePoint.y + (targetPoint.y - sourcePoint.y) * 0.45
  };
  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(midPoint.x, midPoint.y, { steps: 4 });
  await assertMarkdownTableActiveDragVisuals(page, "during table drag");
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
  await assertMarkdownTableActiveDragVisuals(page, "at table drag target");
  await page.mouse.up();
  await nextAnimationFrame(page);
  await page.locator(".cm-md-table-widget table").first().waitFor({ timeout: 5_000 });
}

async function assertMarkdownTableActiveDragVisuals(page, label) {
  const visuals = await page.evaluate(() => {
    const ghost = document.querySelector(".cm-md-table-drag-ghost");
    const source = document.querySelector(".cm-md-table-row-drag-source, .cm-md-table-column-drag-source");
    const dropTarget = document.querySelector(".cm-md-table-row-drop-target, .cm-md-table-column-drop-target");
    const handle = document.querySelector(".cm-md-table-drag-handle.is-dragging");
    return {
      dragging: Boolean(document.querySelector(".cm-md-table-widget.cm-md-table-is-dragging")),
      ghostText: ghost?.textContent ?? "",
      ghostVisible: ghost instanceof HTMLElement && getComputedStyle(ghost).display !== "none" && getComputedStyle(ghost).opacity !== "0",
      handleDragging: Boolean(handle),
      sourceVisible: Boolean(source),
      dropTargetVisible: Boolean(dropTarget)
    };
  });
  if (!visuals.dragging || !visuals.ghostVisible || !visuals.handleDragging || !visuals.sourceVisible || !visuals.dropTargetVisible) {
    throw new Error(`Markdown table drag visual state missing ${label}: ${JSON.stringify(visuals)}`);
  }
}

async function waitForMarkdownTableHeaderOrder(page, expectedHeaders) {
  await page.waitForFunction(
    (headers) => {
      const actual = Array.from(document.querySelectorAll(".cm-md-table-widget thead th"))
        .map((cell) => (cell.textContent ?? "").trim());
      return headers.every((header, index) => actual[index] === header);
    },
    expectedHeaders,
    { timeout: 5_000 }
  );
}

async function assertMarkdownTableCellEditing(page, fixture) {
  await setRawMarkdown(page, false);
  await scrollEditorToTop(page);
  const cell = page.locator(".cm-md-table-widget tbody td").filter({ hasText: "2(天)" }).first();
  await cell.waitFor({ timeout: 8_000 });
  await cell.click();
  await cell.fill("3(天)");
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll(".cm-md-table-widget tbody td"))
      .some((candidate) => (candidate.textContent ?? "").trim() === "3(天)"),
    null,
    { timeout: 5_000 }
  );
  const expectedMarkdown = "| 主动增管 | 2(天/周) | 3(天) |";
  await pollMarkdownTablePersistence(page, fixture.pageId, expectedMarkdown);
  const result = await page.evaluate(async ({ pageId, expectedMarkdown }) => {
    const doc = await window.lotion.pages.get(pageId);
    const tableText = document.querySelector(".cm-md-table-widget table")?.textContent ?? "";
    const matchingLine = doc.markdown.split(/\r?\n/).find((line) => line.includes("主动增管")) ?? "";
    return {
      expectedMarkdown,
      markdownContainsEdit: doc.markdown.includes(expectedMarkdown),
      matchingLine,
      tableContainsEdit: tableText.includes("3(天)")
    };
  }, { pageId: fixture.pageId, expectedMarkdown });
  if (!result.markdownContainsEdit || !result.tableContainsEdit) {
    throw new Error(`Markdown table direct edit did not persist/re-render: ${JSON.stringify(result)}`);
  }
  return result;
}

async function assertToggleDirectEditing(page, fixture, viewport) {
  await setRawMarkdown(page, false);
  await scrollUntilMounted(page, ".cm-md-toggle-widget", "toggle widget");
  const toggle = page.locator(".cm-md-toggle-widget").first();
  const summary = toggle.locator(".cm-md-toggle-summary-text").first();
  const body = toggle.locator(".cm-md-toggle-body").first();
  await summary.waitFor({ timeout: 8_000 });
  await body.waitFor({ timeout: 8_000 });
  await summary.scrollIntoViewIfNeeded();
  await assertIntersectsViewport(page, summary, `toggle summary direct edit ${viewport.name}`, 4);
  await assertIntersectsViewport(page, body, `toggle body direct edit ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `toggle direct edit before ${viewport.name}`);

  const initial = await page.evaluate(() => {
    const toggle = document.querySelector(".cm-md-toggle-widget");
    const summary = toggle?.querySelector(".cm-md-toggle-summary-text");
    const body = toggle?.querySelector(".cm-md-toggle-body");
    const edit = toggle?.closest(".cm-md-toggle-widget-outer")?.querySelector(".cm-md-edit-source");
    return {
      bodyEditable: body?.tagName ?? "",
      bodyHtml: body instanceof HTMLElement ? body.innerHTML : "",
      bodyText: body?.textContent ?? "",
      bodyContentEditable: body?.getAttribute("contenteditable") ?? "",
      editSourcePresent: Boolean(edit),
      open: toggle?.hasAttribute("open") ?? false,
      summaryEditable: summary?.tagName ?? "",
      summaryContentEditable: summary?.getAttribute("contenteditable") ?? "",
      summaryText: summary?.textContent?.trim() ?? ""
    };
  });
  if (initial.summaryEditable !== "SPAN" || initial.summaryContentEditable !== "plaintext-only" || initial.bodyEditable !== "DIV") {
    throw new Error(`Toggle direct editing should use Notion-like text blocks: ${JSON.stringify(initial)}`);
  }
  if (initial.bodyContentEditable || String(initial.bodyHtml).includes("<textarea") || String(initial.bodyHtml).includes("<input")) {
    throw new Error(`Toggle body should render Markdown content without native controls: ${JSON.stringify(initial)}`);
  }
  if (initial.editSourcePresent || !initial.open || initial.summaryText !== "计划折叠块" || !initial.bodyText.includes("折叠内容")) {
    throw new Error(`Toggle direct editing initial state mismatch: ${JSON.stringify(initial)}`);
  }

  const editedSummary = `计划折叠块 ${viewport.name}`;
  await summary.fill(editedSummary);
  await summary.press("Enter");
  await waitForPageMarkdown(page, fixture.pageId, `summary: ${editedSummary}`, "toggle summary direct edit autosave");
  await page.waitForFunction(
    (text) => {
      const summary = document.querySelector(".cm-md-toggle-summary-text");
      return summary?.textContent?.trim() === text;
    },
    editedSummary,
    { timeout: 5_000 }
  );

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await waitForPageMarkdown(page, fixture.pageId, "summary: 计划折叠块", "toggle summary undo");
  await page.waitForFunction(
    () => {
      const summary = document.querySelector(".cm-md-toggle-summary-text");
      return summary?.textContent?.trim() === "计划折叠块";
    },
    null,
    { timeout: 5_000 }
  );
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Y");
  await waitForPageMarkdown(page, fixture.pageId, `summary: ${editedSummary}`, "toggle summary redo");
  await page.waitForFunction(
    (text) => {
      const summary = document.querySelector(".cm-md-toggle-summary-text");
      return summary?.textContent?.trim() === text;
    },
    editedSummary,
    { timeout: 5_000 }
  );

  await page.waitForFunction(
    () => {
      const body = document.querySelector(".cm-md-toggle-body");
      return body?.textContent?.includes("折叠内容") && !body?.textContent?.includes("```lotion-toggle");
    },
    null,
    { timeout: 5_000 }
  );

  const disclosure = page.locator(".cm-md-toggle-disclosure").first();
  await disclosure.click();
  await waitForPageMarkdown(page, fixture.pageId, "open: false", "toggle collapsed state autosave");
  await page.waitForFunction(
    () => {
      const toggle = document.querySelector(".cm-md-toggle-widget");
      const body = toggle?.querySelector(".cm-md-toggle-body");
      return toggle && body instanceof HTMLElement
        ? !toggle.hasAttribute("open") && body.hidden && getComputedStyle(body).display === "none"
        : false;
    },
    null,
    { timeout: 5_000 }
  );
  await disclosure.click();
  await waitForPageMarkdown(page, fixture.pageId, "open: true", "toggle expanded state autosave");
  await page.waitForFunction(
    () => document.querySelector(".cm-md-toggle-widget")?.hasAttribute("open"),
    null,
    { timeout: 5_000 }
  );

  await assertNoDocumentHorizontalOverflow(page, `toggle direct edit after ${viewport.name}`);
  const result = await page.evaluate(async ({ pageId, editedSummary }) => {
    const doc = await window.lotion.pages.get(pageId);
    const toggle = document.querySelector(".cm-md-toggle-widget");
    const summary = toggle?.querySelector(".cm-md-toggle-summary-text");
    const body = toggle?.querySelector(".cm-md-toggle-body");
    return {
      bodyHtml: body instanceof HTMLElement ? body.innerHTML : "",
      bodyText: body?.textContent ?? "",
      markdownContainsBody: doc.markdown.includes("折叠内容"),
      markdownContainsOpen: doc.markdown.includes("open: true"),
      markdownContainsSummary: doc.markdown.includes(`summary: ${editedSummary}`),
      open: toggle?.hasAttribute("open") ?? false,
      summaryText: summary?.textContent?.trim() ?? ""
    };
  }, { pageId: fixture.pageId, editedSummary });
  if (!result.markdownContainsSummary || !result.markdownContainsBody || !result.markdownContainsOpen || result.summaryText !== editedSummary || !result.open) {
    throw new Error(`Toggle direct editing did not persist/re-render: ${JSON.stringify(result)}`);
  }
  return result;
}

async function assertTaskCheckboxPreviewAndToggle(page, fixture, rendered) {
  if (!rendered.uncheckedTaskLine || !rendered.checkedTaskLine) {
    await scrollEditorToBottom(page);
    await page.getByText("未完成任务").first().waitFor({ timeout: 8_000 });
    await page.getByText("已完成任务").first().waitFor({ timeout: 8_000 });
    Object.assign(rendered, await renderedTaskLineSnapshot(page));
  }
  if (!rendered.uncheckedTaskLine) throw new Error("Missing unchecked task regression line");
  if (!rendered.checkedTaskLine) throw new Error("Missing checked task regression line");
  assertTaskLinePreview(rendered.uncheckedTaskLine, false, "unchecked task");
  assertTaskLinePreview(rendered.checkedTaskLine, true, "checked task");

  const unchecked = page.locator(".cm-line")
    .filter({ hasText: "未完成任务" })
    .first()
    .locator("input.cm-md-task-checkbox")
    .first();
  await unchecked.waitFor({ timeout: 8_000 });
  await unchecked.click();
  await page.waitForFunction(
    () => {
      const line = Array.from(document.querySelectorAll(".cm-line"))
        .find((candidate) => (candidate.textContent ?? "").includes("未完成任务"));
      const checkbox = line?.querySelector("input.cm-md-task-checkbox");
      return checkbox instanceof HTMLInputElement && checkbox.checked;
    },
    null,
    { timeout: 5_000 }
  );
  const expectedMarkdown = "- [x] 未完成任务";
  await waitForPageMarkdown(page, fixture.pageId, expectedMarkdown, "task checkbox toggle autosave");
  const snapshot = await page.evaluate(async ({ pageId, expectedMarkdown }) => {
    const doc = await window.lotion.pages.get(pageId);
    const line = Array.from(document.querySelectorAll(".cm-line"))
      .find((candidate) => (candidate.textContent ?? "").includes("未完成任务"));
    const checkbox = line?.querySelector("input.cm-md-task-checkbox");
    return {
      expectedMarkdown,
      markdownContainsToggle: doc.markdown.includes(expectedMarkdown),
      visibleChecked: checkbox instanceof HTMLInputElement ? checkbox.checked : null,
      visibleText: line?.textContent ?? "",
      checkboxCount: line?.querySelectorAll("input.cm-md-task-checkbox").length ?? 0
    };
  }, { pageId: fixture.pageId, expectedMarkdown });
  if (!snapshot.markdownContainsToggle || snapshot.visibleChecked !== true || snapshot.checkboxCount !== 1) {
    throw new Error(`Task checkbox toggle did not persist/re-render: ${JSON.stringify(snapshot)}`);
  }
  await scrollEditorToTop(page);
  return snapshot;
}

async function assertMissingDatabasePlaceholderPreview(page) {
  await scrollUntilMounted(page, ".cm-md-missing-database-widget", "missing database placeholder widget");
  const outer = page.locator(".cm-md-missing-database-widget-outer").first();
  const widget = page.locator(".cm-md-missing-database-widget").first();
  await widget.waitFor({ timeout: 8_000 });
  await widget.scrollIntoViewIfNeeded();
  await assertIntersectsViewport(page, widget, "missing database placeholder widget", 4);

  const initial = await page.evaluate(() => {
    const widget = document.querySelector(".cm-md-missing-database-widget");
    const outer = document.querySelector(".cm-md-missing-database-widget-outer");
    const edit = outer?.querySelector(".cm-md-edit-source");
    const search = outer?.querySelector(".cm-md-missing-database-search");
    const rawSourceVisible = Array.from(document.querySelectorAll(".cm-line"))
      .some((line) => (line.textContent ?? "").includes("database not found"));
    const rect = widget?.getBoundingClientRect();
    return {
      label: widget?.querySelector(".cm-md-missing-database-label")?.textContent ?? "",
      title: widget?.querySelector(".cm-md-missing-database-title")?.textContent ?? "",
      message: widget?.querySelector(".cm-md-missing-database-message")?.textContent ?? "",
      ariaLabel: widget?.getAttribute("aria-label") ?? "",
      rawSourceVisible,
      hasEditSource: Boolean(edit),
      editSourceText: edit?.textContent?.trim() ?? "",
      editSourceOpacity: edit ? getComputedStyle(edit).opacity : "",
      hasSearch: Boolean(search),
      searchText: search?.textContent?.trim() ?? "",
      searchAria: search?.getAttribute("aria-label") ?? "",
      width: rect ? Math.round(rect.width) : 0,
      height: rect ? Math.round(rect.height) : 0
    };
  });
  if (initial.title !== "问题列表") {
    throw new Error(`Missing database placeholder title mismatch: ${JSON.stringify(initial)}`);
  }
  if (
    initial.label !== "Missing imported view" ||
    !initial.message.includes("Imported Notion embedded database/page view") ||
    !initial.message.includes("Search the workspace") ||
    initial.message.includes("Database not found") ||
    !initial.ariaLabel.includes("Missing imported Notion embedded view") ||
    !initial.ariaLabel.includes("问题列表")
  ) {
    throw new Error(`Missing database placeholder diagnostic state mismatch: ${JSON.stringify(initial)}`);
  }
  if (initial.rawSourceVisible) {
    throw new Error(`Missing database placeholder leaked raw source while inactive: ${JSON.stringify(initial)}`);
  }
  if (!initial.hasEditSource || initial.editSourceText !== "Edit source" || initial.editSourceOpacity !== "0") {
    throw new Error(`Missing database placeholder edit-source affordance mismatch: ${JSON.stringify(initial)}`);
  }
  if (!initial.hasSearch || initial.searchText !== "Search workspace" || !initial.searchAria.includes("问题列表")) {
    throw new Error(`Missing database placeholder search affordance mismatch: ${JSON.stringify(initial)}`);
  }
  if (initial.width < 120 || initial.height < 36) {
    throw new Error(`Missing database placeholder geometry is too small: ${JSON.stringify(initial)}`);
  }

  await outer.locator(".cm-md-missing-database-search").first().click();
  await page.waitForSelector(".global-search-input", { timeout: 5_000 });
  await assertWithinViewport(page, page.locator(".global-search").first(), "missing database search panel", 4);
  await assertWithinViewport(page, page.locator(".global-search-input").first(), "missing database search input", 4);
  await assertNoDocumentHorizontalOverflow(page, "missing database search panel");
  const searchOpen = await page.evaluate(() => {
    const input = document.querySelector(".global-search-input");
    const active = document.activeElement;
    const panel = document.querySelector(".global-search");
    return {
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      focused: input === active,
      panelText: panel?.textContent ?? ""
    };
  });
  if (searchOpen.inputValue !== "问题列表" || !searchOpen.focused) {
    throw new Error(`Missing database search affordance did not open focused search with the database title: ${JSON.stringify(searchOpen)}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector(".global-search", { state: "detached", timeout: 5_000 });

  await outer.hover();
  await page.waitForFunction(() => {
    const button = document.querySelector(".cm-md-missing-database-widget-outer .cm-md-edit-source");
    return button ? getComputedStyle(button).opacity === "1" : false;
  }, null, { timeout: 5_000 });
  const hoverOpacity = await outer.locator(".cm-md-edit-source").first().evaluate((button) => getComputedStyle(button).opacity);
  await outer.locator(".cm-md-edit-source").first().click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll(".cm-line"))
      .some((line) => (line.textContent ?? "").includes("📂 问题列表 (database not found)")),
    null,
    { timeout: 5_000 }
  );
  const sourceReveal = await page.evaluate(() => {
    const sourceLine = Array.from(document.querySelectorAll(".cm-line"))
      .find((line) => (line.textContent ?? "").includes("📂 问题列表 (database not found)"));
    const active = document.activeElement;
    return {
      sourceLineText: sourceLine?.textContent ?? "",
      widgetVisible: Boolean(document.querySelector(".cm-md-missing-database-widget")),
      editorFocused: Boolean(active instanceof HTMLElement && active.closest(".cm-editor"))
    };
  });
  if (!sourceReveal.sourceLineText.includes("_📂 问题列表 (database not found)_") || sourceReveal.widgetVisible) {
    throw new Error(`Missing database edit-source did not reveal raw source: ${JSON.stringify(sourceReveal)}`);
  }
  if (!sourceReveal.editorFocused) {
    throw new Error(`Missing database edit-source did not focus the editor: ${JSON.stringify(sourceReveal)}`);
  }

  await scrollEditorToTop(page);
  await page.getByText("开始恢复锻炼").first().click();
  await scrollUntilMounted(page, ".cm-md-missing-database-widget", "missing database placeholder widget after leaving source");
  const afterLeavingSource = await page.evaluate(() => ({
    rawSourceVisible: Array.from(document.querySelectorAll(".cm-line"))
      .some((line) => (line.textContent ?? "").includes("database not found")),
    widgetVisible: Boolean(document.querySelector(".cm-md-missing-database-widget"))
  }));
  if (afterLeavingSource.rawSourceVisible || !afterLeavingSource.widgetVisible) {
    throw new Error(`Missing database source stayed visible after focus left source line: ${JSON.stringify(afterLeavingSource)}`);
  }

  return { initial, searchOpen, hoverOpacity, sourceReveal, afterLeavingSource };
}

function assertTaskLinePreview(line, expectedChecked, label) {
  if (line.text.includes("[ ]") || /\[[xX]\]/.test(line.text)) {
    throw new Error(`${label} leaked raw task marker: ${JSON.stringify(line)}`);
  }
  if (line.taskInputs.length !== 1) {
    throw new Error(`${label} should render exactly one checkbox: ${JSON.stringify(line)}`);
  }
  const [input] = line.taskInputs;
  if (input.type !== "checkbox" || input.checked !== expectedChecked) {
    throw new Error(`${label} checkbox state mismatch: ${JSON.stringify(line)}`);
  }
  if (input.width < 10 || input.height < 10) {
    throw new Error(`${label} checkbox geometry is too small: ${JSON.stringify(line)}`);
  }
}

async function renderedTaskLineSnapshot(page) {
  return page.evaluate(() => {
    const lineData = Array.from(document.querySelectorAll(".cm-line")).map((line) => {
      const element = line;
      return {
        text: element.textContent ?? "",
        taskInputs: Array.from(element.querySelectorAll("input.cm-md-task-checkbox")).map((input) => {
          const checkbox = input;
          const rect = checkbox.getBoundingClientRect();
          return {
            checked: checkbox.checked,
            type: checkbox.getAttribute("type") ?? "",
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          };
        })
      };
    });
    return {
      uncheckedTaskLine: lineData.find((line) => line.text.includes("未完成任务")) ?? null,
      checkedTaskLine: lineData.find((line) => line.text.includes("已完成任务")) ?? null
    };
  });
}

async function renderedLinkLineSnapshot(page) {
  return page.evaluate(() => {
    const lineData = Array.from(document.querySelectorAll(".cm-line")).map((line) => {
      const element = line;
      return {
        text: element.textContent ?? "",
        links: Array.from(element.querySelectorAll("[data-md-url], .cm-md-link, .cm-md-url")).map((link) => ({
          text: link.textContent ?? "",
          url: link.getAttribute("data-md-url"),
          className: link.getAttribute("class")
        })),
        strikeText: Array.from(element.querySelectorAll(".cm-md-strike")).map((strike) => strike.textContent ?? "")
      };
    });
    return {
      longLinkLine: lineData.find((line) => line.text.includes("prompting-long-context")) ?? null,
      multilineLinkLabelLine: lineData.find((line) => line.text.includes("multiline%20decoded")) ?? null,
      escapedLabelLine: lineData.find((line) => line.text.includes("Project [A]")) ?? null
    };
  });
}

async function pollMarkdownTablePersistence(page, pageId, expectedMarkdown) {
  const deadline = Date.now() + 8_000;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async ({ pageId, expectedMarkdown }) => {
      const doc = await window.lotion.pages.get(pageId);
      return {
        ok: doc.markdown.includes(expectedMarkdown),
        matchingLine: doc.markdown.split(/\r?\n/).find((line) => line.includes("主动增管")) ?? "",
        tableLines: doc.markdown.split(/\r?\n/).filter((line) => line.trim().startsWith("|"))
      };
    }, { pageId, expectedMarkdown });
    if (snapshot.ok) return;
    lastSnapshot = snapshot;
    await page.waitForTimeout(100);
  }
  throw new Error(`Markdown table edit was not persisted: ${JSON.stringify(lastSnapshot)}`);
}

async function pollMarkdownTableAbsence(page, pageId, absentMarkdown) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const contains = await page.evaluate(async ({ pageId, absentMarkdown }) => {
      const doc = await window.lotion.pages.get(pageId);
      return doc.markdown.includes(absentMarkdown);
    }, { pageId, absentMarkdown });
    if (!contains) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Markdown table still contains ${JSON.stringify(absentMarkdown)}`);
}

async function pollMarkdownTableOrder(page, pageId, beforeMarkdown, afterMarkdown) {
  const deadline = Date.now() + 8_000;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async ({ pageId, beforeMarkdown, afterMarkdown }) => {
      const doc = await window.lotion.pages.get(pageId);
      const beforeIndex = doc.markdown.indexOf(beforeMarkdown);
      const afterIndex = doc.markdown.indexOf(afterMarkdown);
      return {
        ok: beforeIndex >= 0 && afterIndex > beforeIndex,
        beforeIndex,
        afterIndex,
        tableLines: doc.markdown.split(/\r?\n/).filter((line) => line.trim().startsWith("|"))
      };
    }, { pageId, beforeMarkdown, afterMarkdown });
    if (snapshot.ok) return;
    lastSnapshot = snapshot;
    await page.waitForTimeout(100);
  }
  throw new Error(`Markdown table order was not persisted: ${JSON.stringify(lastSnapshot)}`);
}

async function renderedWidgetSnapshot(page) {
  return page.evaluate(() => {
    const iframeWidget = document.querySelector(".cm-md-iframe-widget");
    const iframe = iframeWidget?.querySelector("iframe") ?? null;
    const iframeLink = iframeWidget?.querySelector(".cm-md-iframe-widget-url") ?? null;
    const toggle = document.querySelector(".cm-md-toggle-widget");
    const equation = document.querySelector(".cm-md-equation-widget");
    return {
      iframePreview: iframeWidget ? {
        title: iframeWidget.querySelector(".cm-md-iframe-widget-title")?.textContent ?? "",
        linkText: iframeLink?.textContent ?? "",
        linkHref: iframeLink?.getAttribute("href") ?? "",
        src: iframe?.getAttribute("src") ?? "",
        height: iframe?.style.height ?? ""
      } : null,
      togglePreview: toggle ? {
        summary: toggle.querySelector(".cm-md-toggle-summary-text")?.textContent?.trim() ?? "",
        body: toggle.querySelector(".cm-md-toggle-body")?.textContent ?? "",
        bodyHtml: toggle.querySelector(".cm-md-toggle-body")?.innerHTML ?? "",
        open: toggle.hasAttribute("open"),
        summaryEditable: toggle.querySelector(".cm-md-toggle-summary-text")?.tagName ?? "",
        summaryContentEditable: toggle.querySelector(".cm-md-toggle-summary-text")?.getAttribute("contenteditable") ?? "",
        bodyEditable: toggle.querySelector(".cm-md-toggle-body")?.tagName ?? "",
        bodyContentEditable: toggle.querySelector(".cm-md-toggle-body")?.getAttribute("contenteditable") ?? "",
        hasEditSource: Boolean(toggle.closest(".cm-md-toggle-widget-outer")?.querySelector(".cm-md-edit-source"))
      } : null,
      equationPreview: equation ? {
        text: equation.textContent ?? "",
        hasEditSource: Boolean(equation.closest(".cm-md-equation-widget-outer")?.querySelector(".cm-md-edit-source"))
      } : null
    };
  });
}

async function renderedCalloutSnapshot(page) {
  return page.evaluate(() => {
    const lineData = Array.from(document.querySelectorAll(".cm-line")).map((line) => ({
      text: line.textContent ?? ""
    }));
    const calloutMark = document.querySelector(".cm-md-callout-body mark")?.textContent ?? "";
    const calloutColor = document.querySelector(".cm-md-callout-body .cm-md-notion-color-green")?.textContent ?? "";
    const calloutText = document.querySelector(".cm-md-callout-body")?.textContent ?? "";
    const calloutClassName = document.querySelector(".cm-md-callout-widget")?.getAttribute("class") ?? "";
    const contentRect = document.querySelector(".cm-content")?.getBoundingClientRect();
    const referenceLineRect = Array.from(document.querySelectorAll(".cm-line"))
      .find((line) => (line.textContent ?? "").includes("开始恢复锻炼"))
      ?.getBoundingClientRect();
    const calloutRect = document.querySelector(".cm-md-callout-widget")?.getBoundingClientRect();
    return {
      calloutMark,
      calloutColor,
      calloutText,
      calloutClassName,
      rawCalloutSourceVisible: lineData.some((line) => line.text.includes("lotion-callout")),
      calloutHasEditSource: Boolean(document.querySelector(".cm-md-callout-widget-outer .cm-md-edit-source")),
      calloutContentLeftDelta: contentRect && calloutRect ? Math.round(calloutRect.left - contentRect.left) : null,
      calloutLineLeftDelta: referenceLineRect && calloutRect ? Math.round(calloutRect.left - referenceLineRect.left) : null
    };
  });
}

async function assertRawMarkdownToggle(page, fixture, enabled) {
  await setRawMarkdown(page, enabled);
  return editorStabilitySnapshot(page, fixture.pageTitle);
}

async function assertRawMarkdownModifierOpenLink(page) {
  const targetUrl = "https://example.com/project-a";
  await setRawMarkdown(page, true);
  await scrollEditorToBottom(page);
  const targetText = page.getByText(targetUrl).first();
  try {
    await scrollEditorToTop(page);
    await targetText.waitFor({ timeout: 1_000 });
  } catch {
    await scrollEditorToBottom(page);
    await targetText.waitFor({ timeout: 5_000 });
  }
  await targetText.scrollIntoViewIfNeeded();
  const dryRun = await page.evaluate(async () => {
    const debug = window.lotion.debug;
    if (!debug?.setShellOpenDryRun || !debug?.clearShellOpenRequests || !debug?.getShellOpenRequests) {
      return { enabled: false };
    }
    await debug.setShellOpenDryRun(true);
    await debug.clearShellOpenRequests();
    return { enabled: true };
  });
  if (!dryRun.enabled) {
    throw new Error("Shell open dry-run hook is unavailable for raw markdown smoke.");
  }
  try {
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    const point = await textPoint(page, targetUrl);
    await page.evaluate(({ point, modifier }) => {
      const target = document.elementFromPoint(point.x, point.y);
      if (!target) throw new Error(`Could not find click target at ${point.x},${point.y}`);
      target.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: point.x,
        clientY: point.y,
        metaKey: modifier === "Meta",
        ctrlKey: modifier === "Control"
      }));
    }, { point, modifier });
    await page.waitForFunction(
      async (url) => {
        const requests = await window.lotion.debug.getShellOpenRequests();
        return requests.includes(url);
      },
      targetUrl,
      { timeout: 5_000 }
    );
    return page.evaluate(async () => ({
      openedUrls: await window.lotion.debug.getShellOpenRequests()
    }));
  } finally {
    await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
  }
}

async function textPoint(page, text) {
  return page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const content = node.textContent ?? "";
      const index = content.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      const offset = index + Math.floor(needle.length / 2);
      range.setStart(node, offset);
      range.setEnd(node, Math.min(offset + 1, content.length));
      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
    throw new Error(`Could not locate visible text: ${needle}`);
  }, text);
}

async function readRawMarkdownSetting(page) {
  return page.evaluate((key) => window.localStorage.getItem(key) === "1", RAW_MARKDOWN_STORAGE_KEY);
}

async function restoreRawMarkdownSetting(page, enabled) {
  try {
    await setRawMarkdown(page, enabled);
  } catch {
    await page.evaluate(({ key, enabled }) => {
      window.localStorage.setItem(key, enabled ? "1" : "0");
    }, { key: RAW_MARKDOWN_STORAGE_KEY, enabled });
  }
}

async function setRawMarkdown(page, enabled) {
  await ensureSidebarSettingsOpen(page);
  const group = page.locator(".sidebar-settings-panel .vim-toggle").filter({ hasText: /Raw markdown|原文模式/ }).first();
  await group.waitFor({ timeout: 5_000 });
  await group.locator("button").filter({ hasText: enabled ? /^(On|开)$/ : /^(Off|关)$/ }).first().click();
  await page.waitForFunction(
    ({ enabled }) => {
      const groups = Array.from(document.querySelectorAll(".sidebar-settings-panel .vim-toggle"));
      const rawGroup = groups.find((item) => /Raw markdown|原文模式/.test(item.textContent ?? ""));
      const expected = enabled ? /^(On|开)$/ : /^(Off|关)$/;
      const button = Array.from(rawGroup?.querySelectorAll("button") ?? [])
        .find((candidate) => expected.test(candidate.textContent?.trim() ?? ""));
      return button?.classList.contains("active") === true;
    },
    { enabled },
    { timeout: 5_000 }
  );
}

async function ensureSidebarSettingsOpen(page) {
  const details = page.locator(".sidebar-settings").first();
  await details.waitFor({ timeout: 5_000 });
  const open = await details.evaluate((element) => element.hasAttribute("open"));
  if (!open) {
    await page.locator(".sidebar-settings-summary").first().click();
  }
}

async function editorStabilitySnapshot(page, expectedTitle) {
  await page.waitForFunction(
    (title) => document.querySelector(".title-input")?.value === title,
    expectedTitle,
    { timeout: 8_000 }
  );
  await page.waitForFunction(() => document.querySelectorAll(".cm-line").length > 0, null, { timeout: 8_000 });
  const snapshot = await page.evaluate(() => ({
    titleInput: document.querySelector(".title-input")?.value ?? "",
    lineCount: document.querySelectorAll(".cm-line").length,
    editorPresent: Boolean(document.querySelector(".cm-editor"))
  }));
  if (snapshot.titleInput !== expectedTitle || !snapshot.editorPresent || snapshot.lineCount <= 0) {
    throw new Error(`Editor unstable after raw markdown toggle: ${JSON.stringify(snapshot)}`);
  }
  return snapshot;
}

async function waitForActivePageTitle(page, expectedTitle) {
  try {
    await page.waitForFunction(
      (title) => document.querySelector(".title-input")?.value === title,
      expectedTitle,
      { timeout: 60_000 }
    );
  } catch (error) {
    const snapshot = await page.evaluate(() => ({
      titleInput: document.querySelector(".title-input")?.value ?? "",
      visibleText: document.body.textContent?.slice(0, 400) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`Active page title did not settle: ${JSON.stringify({ expectedTitle, snapshot })}. ${error.message}`);
  }
}

async function createMarkdownPreviewFixture(viewportName) {
  const safeViewportName = String(viewportName || "default").replace(/[^A-Za-z0-9_-]+/g, "-");
  const root = await mkdtemp(join(tmpdir(), `lotion-markdown-preview-${safeViewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `pg_markdown_preview_${safeViewportName}`;
  const pageTitle = `Markdown Preview Smoke ${safeViewportName}`;
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const longUrl = "https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's%20100%2C000%20token%20long%20context,or%20even%20an%20entire%20book";
  const longLabel = "https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's 100%2C000 token long context,or even an entire book";
  const imageDataUrl = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='90'%3E%3Crect%20width='160'%20height='90'%20rx='10'%20fill='%23dbeafe'/%3E%3Ctext%20x='80'%20y='51'%20text-anchor='middle'%20font-family='sans-serif'%20font-size='16'%20fill='%2324221f'%3EPreview%3C/text%3E%3C/svg%3E";

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_markdown_preview",
    name: "Markdown Preview Smoke",
    pages: [pageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: pageId,
      title: pageTitle,
      now,
      icon: "emoji:🧪",
      path: ["Bench", pageTitle],
      bodyPath: pagePath
    })
  ]);
  await writeFile(join(root, pagePath), [
    `# ${pageTitle}`,
    "",
    "- [WIP] 开始恢复锻炼 **粗体等待** *斜体等待*",
    "- ~~完成的删除线~~",
    "- ~从国内买茶叶，药品，书法用具(~~**等待**~~)~",
    "- <s>HTML 删除线</s>",
    "- <del>HTML del 删除线</del>",
    "- <u>重要下划线</u>",
    "- <mark>重点高亮</mark>",
    '- <span data-lotion-color="red">红色文字</span> <span data-lotion-bg="blue">蓝色背景</span>',
    "> Have you ever peeked into the cockpit of a large airliner as you boarded a plane? It’s an impressive display of buttons, levers, dials, and switches under one big windshield.",
    ">",
    '> <span data-lotion-bg="yellow">**From now on, make it a personal commitment to notice everything that pushes your buttons.**</span>',
    ">",
    "> Motivation doesn’t have to be accidental. You can control what songs you hear.",
    '- <span data-lotion-color="red">列表红色</span>',
    "",
    "| 名称 | 配额 | 目前余额 |",
    "| --- | --- | --- |",
    "| 主动增管 | 2(天/周) | 2(天) |",
    "| 开心果 | 1(磅/周) | 1(磅) |",
    "",
    `![Preview image](${imageDataUrl})`,
    "```lotion-callout",
    "icon: 💡",
    "background: green",
    "---",
    "<mark>高亮提示</mark>",
    '<span data-lotion-color="green">绿色提示</span>',
    "```",
    "```lotion-iframe",
    "url: https://indify.co/widgets/live/progressBar/CJC1CaARFbRiUGHJPNdR",
    "height: 180",
    "title: Indify progress",
    "```",
    "```lotion-toggle",
    "summary: 计划折叠块",
    "open: true",
    "---",
    "折叠内容",
    "```",
    "```lotion-toggle",
    "summary: 收据",
    "open: true",
    "---",
    `![receipt.jpg](${imageDataUrl})`,
    "",
    "Example vision appointment",
    "```",
    "```lotion-equation",
    "E = mc^2",
    "```",
    `- [${longLabel}](${longUrl}).`,
    "- [https://example.com/multiline%20decoded",
    "target](https://example.com/multiline-target)",
    "- [Project \\[A\\]](https://example.com/project-a)",
    "- [ ] 未完成任务",
    "- [x] 已完成任务",
    "_📂 问题列表 (database not found)_",
    ""
  ].join("\n"), "utf8");

  return { root, pageId, pageTitle };
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
