import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];
const REQUIRED_SNAPSHOT_PHASES = ["initial", "widgets"];

export function requiredMarkdownPreviewKeys() {
  return [
    "callout",
    "image",
    "missingDatabase",
    "iframe",
    "toggle",
    "importedNotionToggle",
    "equation",
    "table",
    "taskCheckbox",
    "rawToggle",
    "links"
  ];
}

export async function assertMarkdownPreviewArtifactContract(result, options = {}) {
  if (!result || typeof result !== "object") {
    throw new Error("Markdown preview artifact contract requires a smoke result object");
  }
  if (result.status !== "passed") {
    throw new Error(`Markdown preview smoke status must be passed, received ${JSON.stringify(result.status)}`);
  }
  const expectedViewportNames = options.expectedViewportNames ?? DEFAULT_EXPECTED_VIEWPORTS;
  const viewports = Array.isArray(result.viewports) ? result.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportName(entry)).filter(Boolean);
  for (const expected of expectedViewportNames) {
    if (!observedViewportNames.includes(expected)) {
      throw new Error(`Markdown preview artifact contract missing viewport ${expected}`);
    }
  }

  const snapshots = [];
  for (const expected of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportName(candidate) === expected);
    if (!entry) continue;
    snapshots.push(await validateViewport(entry, expected));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

async function validateViewport(entry, expectedViewportName) {
  const visualSnapshots = Array.isArray(entry.visualSnapshots) ? entry.visualSnapshots : [];
  const phaseSummaries = [];
  for (const phase of REQUIRED_SNAPSHOT_PHASES) {
    const snapshot = visualSnapshots.find((candidate) => candidate?.phase === phase);
    if (!snapshot) {
      throw new Error(`Markdown preview ${expectedViewportName} missing ${phase} snapshot`);
    }
    phaseSummaries.push(await validateSnapshot(snapshot, expectedViewportName, phase));
  }

  const rendered = entry.rendered;
  if (!rendered || typeof rendered !== "object") {
    throw new Error(`Markdown preview ${expectedViewportName} missing rendered summary`);
  }
  validateInlineMarkdown(rendered, expectedViewportName);
  validateRenderedWidgets(rendered, expectedViewportName);
  validateInteractionSummaries(entry, expectedViewportName);

  return {
    viewport: expectedViewportName,
    imageBytes: phaseSummaries.reduce((sum, item) => sum + item.imageBytes, 0),
    imagePath: phaseSummaries[0]?.imagePath || "",
    metadataPath: phaseSummaries[0]?.metadataPath || "",
    phaseCount: phaseSummaries.length,
    phases: phaseSummaries.map((item) => item.phase),
    phaseSnapshots: phaseSummaries.map((item) => ({
      phase: item.phase,
      imagePath: item.imagePath,
      metadataPath: item.metadataPath,
      imageBytes: item.imageBytes
    })),
    previews: {
      callout: true,
      image: true,
      missingDatabase: true,
      iframe: true,
      toggle: true,
      importedNotionToggle: true,
      equation: true,
      table: true,
      taskCheckbox: true,
      rawToggle: true,
      links: true
    },
    sourceHidden: true
  };
}

async function validateSnapshot(snapshot, expectedViewportName, phase) {
  const imagePath = stringValue(snapshot.imagePath, `Markdown preview ${expectedViewportName} ${phase} imagePath`);
  const metadataPath = stringValue(snapshot.metadataPath, `Markdown preview ${expectedViewportName} ${phase} metadataPath`);
  const imageStats = await stat(imagePath);
  if (!imageStats.isFile() || imageStats.size <= 0) {
    throw new Error(`Markdown preview ${expectedViewportName} ${phase} screenshot is empty: ${imagePath}`);
  }
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const actualViewportName = metadata?.viewport?.name;
  if (actualViewportName !== expectedViewportName) {
    throw new Error(`Markdown preview ${expectedViewportName} ${phase} metadata viewport mismatch: ${actualViewportName}`);
  }
  if (metadata?.metadata?.phase !== phase) {
    throw new Error(`Markdown preview ${expectedViewportName} ${phase} metadata phase mismatch: ${metadata?.metadata?.phase}`);
  }
  return {
    phase,
    imagePath,
    metadataPath,
    imageBytes: imageStats.size
  };
}

function validateInlineMarkdown(rendered, viewportName) {
  assertArrayIncludes(rendered.strongLine?.strongText, "粗体等待", `${viewportName} bold preview`);
  assertArrayIncludes(rendered.emphasisLine?.emphasisText, "斜体等待", `${viewportName} italic preview`);
  assertArrayIncludes(rendered.strikeLine?.strikeText, "完成的删除线", `${viewportName} strikethrough preview`);
  assertArrayIncludes(rendered.importedSingleTildeLine?.strikeText, "从国内买茶叶", `${viewportName} imported strikethrough preview`);
  assertArrayIncludes(rendered.underlineLine?.underlineText, "重要下划线", `${viewportName} underline preview`);
  assertArrayIncludes(rendered.highlightLine?.highlightText, "重点高亮", `${viewportName} highlight preview`);
  assertArrayIncludes(rendered.colorLine?.colorText, "红色文字", `${viewportName} color preview`);
  const importedSelection = rendered.importedHighlightSelection;
  if (!importedSelection?.sourceEditable || importedSelection?.editorHasSelection !== true) {
    throw new Error(`Markdown preview ${viewportName} missing selected imported highlight source-editing evidence`);
  }
  if (importedSelection.editSourceButtonState?.text !== "Edit source" || importedSelection.editSourceButtonState?.opacity !== "1") {
    throw new Error(`Markdown preview ${viewportName} missing blockquote Edit source affordance: ${JSON.stringify(importedSelection)}`);
  }
  if (!/^(?:transparent|rgba?\(0,\s*0,\s*0(?:,\s*0)?\))$/.test(String(importedSelection.bgBackground || ""))) {
    throw new Error(`Markdown preview ${viewportName} imported highlight background obscures selection: ${JSON.stringify(importedSelection)}`);
  }
  const lineBackgroundAlpha = cssColorAlpha(importedSelection.lineBackground);
  if (importedSelection.lineHasSelectionClass !== true || importedSelection.lineIsBlockquote !== true || lineBackgroundAlpha >= 1) {
    throw new Error(`Markdown preview ${viewportName} selected block background obscures selection: ${JSON.stringify({ ...importedSelection, lineBackgroundAlpha })}`);
  }
  assertArrayIncludes(rendered.listColorLine?.colorText, "列表红色", `${viewportName} list color preview`);
  if (rendered.rawCalloutSourceVisible !== false) {
    throw new Error(`Markdown preview ${viewportName} leaked callout source`);
  }
  const longLink = rendered.longLinkLine;
  if (!Array.isArray(longLink?.links) || longLink.links.length !== 1) {
    throw new Error(`Markdown preview ${viewportName} missing single long-link target`);
  }
  if (!String(longLink.text || "").includes("100,000 token long context")) {
    throw new Error(`Markdown preview ${viewportName} long-link label was not decoded`);
  }
  const escaped = rendered.escapedLabelLine;
  if (!Array.isArray(escaped?.links) || escaped.links[0]?.url !== "https://example.com/project-a") {
    throw new Error(`Markdown preview ${viewportName} escaped-link target mismatch`);
  }
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

function validateRenderedWidgets(rendered, viewportName) {
  if (rendered.calloutMark !== "高亮提示" || rendered.calloutColor !== "绿色提示" || !rendered.calloutHasEditSource) {
    throw new Error(`Markdown preview ${viewportName} missing callout preview/edit affordance`);
  }
  if (!String(rendered.calloutClassName || "").includes("cm-md-callout-bg-green")) {
    throw new Error(`Markdown preview ${viewportName} missing callout background class`);
  }
  if (rendered.imagePreview?.rawSourceVisible !== false || rendered.imagePreview?.hasEditSource !== false) {
    throw new Error(`Markdown preview ${viewportName} image source should stay hidden`);
  }
  if (!String(rendered.imagePreview?.src || "").startsWith("data:image/svg+xml")) {
    throw new Error(`Markdown preview ${viewportName} missing renderable image preview`);
  }
  if (rendered.iframePreview?.src !== "https://indify.co/widgets/live/progressBar/CJC1CaARFbRiUGHJPNdR") {
    throw new Error(`Markdown preview ${viewportName} iframe preview src mismatch`);
  }
  if (
    rendered.togglePreview?.summary !== "计划折叠块" ||
    rendered.togglePreview?.summaryEditable !== "SPAN" ||
    rendered.togglePreview?.summaryContentEditable !== "plaintext-only" ||
    rendered.togglePreview?.bodyEditable !== "DIV" ||
    rendered.togglePreview?.bodyContentEditable ||
    rendered.togglePreview?.hasEditSource !== false
  ) {
    throw new Error(`Markdown preview ${viewportName} toggle preview is not Notion-like`);
  }
  const importedToggle = rendered.importedNotionToggle ?? null;
  if (
    importedToggle?.summaryText !== "收据" ||
    importedToggle?.summaryEditable !== "SPAN" ||
    importedToggle?.summaryContentEditable !== "plaintext-only" ||
    importedToggle?.bodyEditable !== "DIV" ||
    !String(importedToggle?.bodyText || "").includes("Example vision appointment") ||
    importedToggle?.bodyRawMarkdownVisible ||
    !(Number(importedToggle?.bodyImageCount) >= 1) ||
    importedToggle?.editSourcePresent !== false
  ) {
    throw new Error(`Markdown preview ${viewportName} imported Notion toggle preview mismatch`);
  }
  if (!String(rendered.equationPreview?.text || "").includes("E = mc^2") || !rendered.equationPreview?.hasEditSource) {
    throw new Error(`Markdown preview ${viewportName} equation preview missing edit affordance`);
  }
  if (
    !String(rendered.tablePreview?.text || "").includes("主动增管") ||
    rendered.tablePreview?.editableCellContentEditable !== "plaintext-only" ||
    rendered.tablePreview?.hasEditSource !== true ||
    !Array.isArray(rendered.tablePreview?.controls) ||
    rendered.tablePreview.controls.length < 4 ||
    Number(rendered.tablePreview?.rowDragHandleCount || 0) < 2 ||
    Number(rendered.tablePreview?.columnDragHandleCount || 0) < 3
  ) {
    throw new Error(`Markdown preview ${viewportName} table preview is not directly editable`);
  }
}

function validateInteractionSummaries(entry, viewportName) {
  if (entry.imageSourceReveal?.afterLeavingSource?.sourceVisible !== false || entry.imageSourceReveal?.afterLeavingSource?.imageVisible !== true) {
    throw new Error(`Markdown preview ${viewportName} image source did not hide after leaving source edit`);
  }
  if (!entry.markdownTableEdit?.markdownContainsEdit || !entry.markdownTableEdit?.tableContainsEdit) {
    throw new Error(`Markdown preview ${viewportName} table edit did not persist`);
  }
  if (
    entry.markdownTableSourceEdit?.buttonState?.text !== "Edit source" ||
    !entry.markdownTableSourceEdit?.sourceState?.headerLine ||
    entry.markdownTableSourceEdit?.sourceState?.tableWidgetVisible !== false
  ) {
    throw new Error(`Markdown preview ${viewportName} table Edit source did not reveal source`);
  }
  if (entry.markdownTableStructureEdit?.restoredOriginal !== true) {
    throw new Error(`Markdown preview ${viewportName} table row/column controls did not restore the original table`);
  }
  if (entry.markdownTableDragReorder?.restoredOriginal !== true) {
    throw new Error(`Markdown preview ${viewportName} table drag reorder did not restore the original table`);
  }
  if (!entry.toggleDirectEdit?.markdownContainsSummary || !entry.toggleDirectEdit?.markdownContainsBody || !entry.toggleDirectEdit?.markdownContainsOpen) {
    throw new Error(`Markdown preview ${viewportName} toggle edit did not persist`);
  }
  if (entry.importedNotionToggle?.snapshot?.open !== true || !entry.importedNotionToggle?.snapshot?.disclosureVisible) {
    throw new Error(`Markdown preview ${viewportName} imported Notion toggle interaction did not preserve disclosure state`);
  }
  if (!entry.taskCheckboxToggle?.markdownContainsToggle || !entry.taskCheckboxToggle?.visibleChecked) {
    throw new Error(`Markdown preview ${viewportName} checkbox toggle did not persist`);
  }
  const missing = entry.missingDatabasePlaceholder;
  if (missing?.initial?.label !== "Missing imported view" || !missing?.initial?.hasSearch || missing?.afterLeavingSource?.widgetVisible !== true) {
    throw new Error(`Markdown preview ${viewportName} missing-database diagnostic contract failed`);
  }
  if (!entry.rawToggle?.on?.editorPresent || !entry.rawToggle?.off?.editorPresent) {
    throw new Error(`Markdown preview ${viewportName} raw markdown toggle did not preserve the editor`);
  }
}

function viewportName(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}

function stringValue(value, label) {
  if (typeof value !== "string" || !value) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function assertArrayIncludes(values, expected, label) {
  if (!Array.isArray(values) || !values.some((value) => String(value).includes(expected))) {
    throw new Error(`${label} missing ${JSON.stringify(expected)}`);
  }
}
