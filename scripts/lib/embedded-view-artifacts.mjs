import { readFile, stat } from "node:fs/promises";

const REQUIRED_COLUMN_ORDER = ["Name", "Notes", "Score"];

export async function assertEmbeddedViewArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  minTotalRows = 120,
  requiredPerceptualBaselineViewportNames = [],
  renderThresholdMs = 1000
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Embedded view artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const results = Array.isArray(summary?.results) ? summary.results : [];
  const observedViewportNames = [...new Set(results.map((entry) => entry.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Embedded view artifact contract missing viewport(s): ${missing.join(", ")}`);
  }
  if (!Number.isFinite(renderThresholdMs) || renderThresholdMs <= 0) {
    throw new Error(`Embedded view artifact contract requires a positive render budget, saw ${JSON.stringify(renderThresholdMs)}`);
  }

  const renderTimings = results.map((entry) => {
    assertEmbeddedPerformanceResult(entry, renderThresholdMs);
    return {
      viewport: entry.viewport,
      embeddedViews: entry.embeddedViews,
      rowsPerDatabase: entry.rowsPerDatabase,
      renderMs: entry.renderMs
    };
  });

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = results.find((candidate) => candidate.viewport === viewportName && candidate.visualSnapshot);
    if (!entry) {
      throw new Error(`Embedded view artifact contract missing table snapshot for ${viewportName}`);
    }
    assertEmbeddedResult(entry, viewportName, minTotalRows);
    const snapshot = await assertEmbeddedSnapshot(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    });
    snapshots.push(snapshot);
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    renderThresholdMs,
    maxRenderMs: Math.max(...renderTimings.map((entry) => entry.renderMs)),
    renderTimings,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertEmbeddedPerformanceResult(entry, renderThresholdMs) {
  if (!Number.isFinite(entry.renderMs) || entry.renderMs <= 0) {
    throw new Error(`Embedded view artifact contract missing render timing for ${entry.viewport ?? "unknown"}: ${JSON.stringify(entry.renderMs)}`);
  }
  if (!Number.isFinite(entry.embeddedViews) || entry.embeddedViews <= 0 || entry.rendered < entry.embeddedViews) {
    throw new Error(`Embedded view artifact contract rendered view count mismatch for ${entry.viewport ?? "unknown"}: ${JSON.stringify(entry)}`);
  }
  if (!Number.isFinite(entry.rowsPerDatabase) || entry.rowsPerDatabase <= 0) {
    throw new Error(`Embedded view artifact contract missing row scale for ${entry.viewport ?? "unknown"}: ${JSON.stringify(entry.rowsPerDatabase)}`);
  }
  if (entry.renderMs > renderThresholdMs) {
    throw new Error(`${entry.embeddedViews} embedded views rendered in ${entry.renderMs}ms for ${entry.viewport}, exceeding ${renderThresholdMs}ms`);
  }
}

function assertEmbeddedResult(entry, viewportName, minTotalRows) {
  if (JSON.stringify(entry.columnOrder) !== JSON.stringify(REQUIRED_COLUMN_ORDER)) {
    throw new Error(`Embedded view artifact contract column order mismatch for ${viewportName}: ${JSON.stringify(entry.columnOrder)}`);
  }
  assertHeaderActions(entry.headerActions, viewportName);
  const pagination = entry.pagination;
  if (!pagination || pagination.defaultShown !== 20 || pagination.configuredShown !== 50 || pagination.loadMoreShown !== 100 || pagination.persistedPageSize !== 50) {
    throw new Error(`Embedded view artifact contract pagination mismatch for ${viewportName}: ${JSON.stringify(pagination)}`);
  }
  if (pagination.totalRows < minTotalRows) {
    throw new Error(`Embedded view artifact contract expected at least ${minTotalRows} rows for ${viewportName}: ${pagination.totalRows}`);
  }
  assertLoadMoreAffordance(pagination.loadMoreAffordance, viewportName);
}

function assertHeaderActions(headerActions, viewportName) {
  if (!headerActions || typeof headerActions !== "object") {
    throw new Error(`Embedded view artifact contract missing header action evidence for ${viewportName}`);
  }
  if (headerActions.title !== "Embedded DB 1" || !String(headerActions.subtitle || "").includes("All")) {
    throw new Error(`Embedded view artifact contract header title/subtitle mismatch for ${viewportName}: ${JSON.stringify(headerActions)}`);
  }
  if (!Number.isFinite(headerActions.actionCount) || headerActions.actionCount < 3) {
    throw new Error(`Embedded view artifact contract expected Open/Refresh/Settings actions for ${viewportName}: ${JSON.stringify(headerActions)}`);
  }
  for (const [label, action] of [
    ["Open", headerActions.openButton],
    ["Refresh", headerActions.refreshButton],
    ["Settings", headerActions.settingsButton]
  ]) {
    if (!action || action.height < 28 || action.width < 28) {
      throw new Error(`Embedded view artifact contract weak ${label} action for ${viewportName}: ${JSON.stringify(action)}`);
    }
  }
  if (!headerActions.settingsFocused) {
    throw new Error(`Embedded view artifact contract Settings action was not focusable for ${viewportName}`);
  }
  if (headerActions.refreshAfter?.disabled) {
    throw new Error(`Embedded view artifact contract Refresh action stayed disabled for ${viewportName}: ${JSON.stringify(headerActions.refreshAfter)}`);
  }
  if (!headerActions.settingsMenu?.rootHasViewSettings || !headerActions.settingsMenu?.viewHasLayout) {
    throw new Error(`Embedded view artifact contract Settings did not traverse the scoped settings menu for ${viewportName}: ${JSON.stringify(headerActions.settingsMenu)}`);
  }
  if (!headerActions.settingsDialog?.hasRowsPerPage) {
    throw new Error(`Embedded view artifact contract Settings did not expose view settings for ${viewportName}: ${JSON.stringify(headerActions.settingsDialog)}`);
  }
  if (!headerActions.openResult?.hasStandaloneDatabase || !headerActions.openResult?.textIncludesTitle) {
    throw new Error(`Embedded view artifact contract Open action did not navigate for ${viewportName}: ${JSON.stringify(headerActions.openResult)}`);
  }
  const buttons = Array.isArray(headerActions.buttons) ? headerActions.buttons : [];
  if (buttons.length < 3 || buttons.some((button) => !button.visible || button.type !== "button")) {
    throw new Error(`Embedded view artifact contract header buttons lost semantics for ${viewportName}: ${JSON.stringify(buttons)}`);
  }
}

function assertLoadMoreAffordance(affordance, viewportName) {
  if (!affordance || affordance.iconText !== "+") {
    throw new Error(`Embedded view artifact contract missing plus marker for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  if (!/load\s+50\s+more|加载\s*50\s*行/i.test(affordance.buttonText || "")) {
    throw new Error(`Embedded view artifact contract missing strong load-more label for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  if (!/\d/.test(affordance.rowCountText || "")) {
    throw new Error(`Embedded view artifact contract missing secondary row count for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  if (!Number.isFinite(affordance.horizontalGap) || affordance.horizontalGap < 4) {
    throw new Error(`Embedded view artifact contract load-more row count overlaps button for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  const metrics = affordance.buttonMetrics || {};
  if (metrics.tagName !== "button" || metrics.type !== "button" || metrics.cursor !== "pointer") {
    throw new Error(`Embedded view artifact contract load-more lost button semantics for ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function assertEmbeddedSnapshot(entry, viewportName, { requirePerceptualBaseline }) {
  const snapshot = entry.visualSnapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Embedded view artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Embedded view artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const metadataPayload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Embedded view artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (metadataPayload.phase !== "embedded-table") {
    throw new Error(`Embedded view artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
  }
  if (metadataPayload.embeddedViews !== entry.embeddedViews || metadataPayload.rowsPerDatabase !== entry.rowsPerDatabase) {
    throw new Error(`Embedded view artifact contract snapshot metadata mismatch for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
  }
  if (JSON.stringify(metadataPayload.columnOrder) !== JSON.stringify(REQUIRED_COLUMN_ORDER)) {
    throw new Error(`Embedded view artifact contract snapshot column order mismatch for ${viewportName}: ${JSON.stringify(metadataPayload.columnOrder)}`);
  }
  if (!metadataPayload.pagination || metadataPayload.pagination.loadMoreShown !== 100) {
    throw new Error(`Embedded view artifact contract snapshot pagination missing load-more state for ${viewportName}: ${JSON.stringify(metadataPayload.pagination)}`);
  }
  validateCompleteSurfaceState(snapshot.completeSurfaceState, viewportName, "entry");
  validateCompleteSurfaceState(metadataPayload.completeSurfaceState, viewportName, "metadata");
  const perceptualBaseline = await assertPerceptualBaseline(
    snapshot.perceptualBaseline,
    snapshot,
    viewportName,
    { required: requirePerceptualBaseline }
  );

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    columnOrder: metadataPayload.columnOrder,
    headerActionCount: entry.headerActions?.actionCount ?? 0,
    headerTitle: entry.headerActions?.title ?? "",
    loadMoreShown: metadataPayload.pagination.loadMoreShown,
    rowCountText: metadataPayload.pagination.loadMoreAffordance?.rowCountText ?? "",
    completeSurfaceState: snapshot.completeSurfaceState,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

function validateCompleteSurfaceState(state, viewportName, source) {
  const requiredRects = [
    "surfaceRect",
    "headerRect",
    "titleRect",
    "subtitleRect",
    "openRect",
    "refreshRect",
    "settingsRect",
    "tabsRect",
    "stickyHeaderRect",
    "bodyRect",
    "summaryRect",
    "footerRect",
    "loadMoreRect",
    "rowCountRect",
    "firstRowRect",
    "lastRowRect"
  ];
  for (const key of requiredRects) {
    if (!positiveRect(state?.[key])) {
      throw new Error(`Embedded view artifact contract missing ${source} ${key} for ${viewportName}: ${JSON.stringify(state?.[key])}`);
    }
  }
  if (
    state.titleText !== "Embedded DB 1"
    || !String(state.subtitleText || "").includes("All")
    || !String(state.firstRowText || "").includes("Row 0")
    || !String(state.lastRowText || "").includes("Row 7")
    || state.renderedDataRowCount !== 8
    || state.virtualSpacerCount !== 0
    || !/load\s+50\s+more|加载\s*50\s*行/i.test(state.loadMoreText || "")
    || !/100\s+of\s+\d+|共\s*\d+\s*行.*100/i.test(state.rowCountText || "")
    || state.surfaceVisibility !== "visible"
    || state.headerVisibility !== "visible"
    || state.footerVisibility !== "visible"
    || Number(state.surfaceOpacity) < 0.99
    || Number(state.headerOpacity) < 0.99
    || Number(state.footerOpacity) < 0.99
    || Number(state.documentHorizontalOverflow) > 2
    || !insideViewport(state.surfaceRect, state.viewport)
  ) {
    throw new Error(`Embedded view artifact contract found clipped, hidden, incomplete, or offscreen ${source} table for ${viewportName}: ${JSON.stringify(state)}`);
  }
  for (const [ownerName, owner, children] of [
    ["surface", state.surfaceRect, [
      state.headerRect,
      state.tabsRect,
      state.stickyHeaderRect,
      state.bodyRect,
      state.summaryRect,
      state.footerRect
    ]],
    ["header", state.headerRect, [
      state.titleRect,
      state.subtitleRect,
      state.openRect,
      state.refreshRect,
      state.settingsRect
    ]],
    ["body", state.bodyRect, [state.firstRowRect, state.lastRowRect]],
    ["footer", state.footerRect, [state.loadMoreRect, state.rowCountRect]]
  ]) {
    if (children.some((child) => !containsRect(owner, child))) {
      throw new Error(`Embedded view artifact contract found mis-owned ${source} ${ownerName} content for ${viewportName}: ${JSON.stringify({ owner, children })}`);
    }
  }
  if (overlaps(state.loadMoreRect, state.rowCountRect)) {
    throw new Error(`Embedded view artifact contract found overlapping ${source} Load more and row count for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Embedded view artifact contract missing committed table baseline for ${viewportName}`);
    return null;
  }
  if (
    baseline.kind !== "lotion-png-visual-diff"
    || baseline.status !== "passed"
    || baseline.actualPath !== snapshot.imagePath
    || !baseline.dimensionsMatch
    || baseline.diffPixels > baseline.maxDiffPixels
    || baseline.diffRatio > baseline.maxDiffRatio
  ) {
    throw new Error(`Embedded view artifact contract table baseline failed for ${viewportName}: ${JSON.stringify(baseline)}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path || (await stat(path)).size <= 0) {
      throw new Error(`Embedded view artifact contract missing ${label} table baseline evidence for ${viewportName}: ${path ?? "missing"}`);
    }
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.actualPath !== baseline.actualPath || diffMetadata.expectedPath !== baseline.expectedPath) {
    throw new Error(`Embedded view artifact contract table diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
  }
  return {
    kind: baseline.kind,
    status: baseline.status,
    policyPath: baseline.policyPath,
    actualPath: baseline.actualPath,
    expectedPath: baseline.expectedPath,
    diffPath: baseline.diffPath,
    metadataPath: baseline.metadataPath,
    dimensionsMatch: baseline.dimensionsMatch,
    diffPixels: baseline.diffPixels,
    diffRatio: baseline.diffRatio,
    maxDiffPixels: baseline.maxDiffPixels,
    maxDiffRatio: baseline.maxDiffRatio,
    threshold: baseline.threshold,
    includeAA: baseline.includeAA,
    policy: baseline.policy
  };
}

function positiveRect(rect) {
  return Boolean(rect && Number(rect.width) > 0 && Number(rect.height) > 0);
}

function containsRect(outer, inner, tolerance = 1) {
  return Boolean(outer && inner
    && Number(inner.left) >= Number(outer.left) - tolerance
    && Number(inner.top) >= Number(outer.top) - tolerance
    && Number(inner.right) <= Number(outer.right) + tolerance
    && Number(inner.bottom) <= Number(outer.bottom) + tolerance);
}

function insideViewport(rect, viewport, tolerance = 1) {
  return Boolean(rect && viewport
    && Number(rect.left) >= -tolerance
    && Number(rect.top) >= -tolerance
    && Number(rect.right) <= Number(viewport.width) + tolerance
    && Number(rect.bottom) <= Number(viewport.height) + tolerance);
}

function overlaps(left, right, tolerance = 1) {
  return Boolean(left && right
    && Number(left.right) > Number(right.left) + tolerance
    && Number(left.left) < Number(right.right) - tolerance
    && Number(left.bottom) > Number(right.top) + tolerance
    && Number(left.top) < Number(right.bottom) - tolerance);
}
