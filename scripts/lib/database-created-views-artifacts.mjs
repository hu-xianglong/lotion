import { readFile, stat } from "node:fs/promises";

const REQUIRED_VIEW_TABS = ["All", "Created date asc", "Created date desc"];
const CREATED_ASC_VIEW_ID = "view_created_time_asc";
const CREATED_DESC_VIEW_ID = "view_created_time_desc";

export async function assertDatabaseCreatedViewsArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Database created views artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry?.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Database created views artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Database created views artifact contract missing entry for ${viewportName}`);
    assertCreatedViewsEvidence(entry, viewportName);
    snapshots.push(await assertCreatedViewsSnapshot(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertCreatedViewsEvidence(entry, viewportName) {
  const generatedIds = Array.isArray(entry.generatedViewIds) ? entry.generatedViewIds : [];
  if (!generatedIds.includes(CREATED_ASC_VIEW_ID) || !generatedIds.includes(CREATED_DESC_VIEW_ID)) {
    throw new Error(`Database created views artifact contract missing generated view ids for ${viewportName}: ${JSON.stringify(generatedIds)}`);
  }
  if (entry.generatedViewCountAfterReload !== 2) {
    throw new Error(`Database created views artifact contract expected idempotent generated views for ${viewportName}: ${JSON.stringify(entry.generatedViewCountAfterReload)}`);
  }
  if (!String(entry.ascFirstTitle || "").includes("Oldest created row")) {
    throw new Error(`Database created views artifact contract missing ascending row order for ${viewportName}: ${JSON.stringify(entry.ascFirstTitle)}`);
  }
  if (!String(entry.descFirstTitle || "").includes("Newest created row")) {
    throw new Error(`Database created views artifact contract missing descending row order for ${viewportName}: ${JSON.stringify(entry.descFirstTitle)}`);
  }

  const tabs = Array.isArray(entry.visibleTabs) ? entry.visibleTabs : [];
  const missingTabs = REQUIRED_VIEW_TABS.filter((label) => !tabs.some((tab) => tab.includes(label)));
  if (missingTabs.length > 0) {
    throw new Error(`Database created views artifact contract missing visible tab(s) for ${viewportName}: ${missingTabs.join(", ")}`);
  }
  if (!String(entry.keyboardActivatedTab || "").includes("Created date asc")) {
    throw new Error(`Database created views artifact contract missing keyboard tab activation evidence for ${viewportName}: ${JSON.stringify(entry.keyboardActivatedTab)}`);
  }
  if (!String(entry.activeTabText || "").includes("Created date desc")) {
    throw new Error(`Database created views artifact contract missing final desc active tab for ${viewportName}: ${JSON.stringify(entry.activeTabText)}`);
  }
  if (entry.noHorizontalOverflow !== true) {
    throw new Error(`Database created views artifact contract missing no-overflow evidence for ${viewportName}`);
  }
  if (
    entry.recoveredCaptureState?.filterCount !== 0
    || entry.recoveredCaptureState?.sortCount !== 1
  ) {
    throw new Error(`Database created views artifact contract missing clean recovered capture state for ${viewportName}: ${JSON.stringify(entry.recoveredCaptureState)}`);
  }
  assertFilterRecoveryEvidence(entry.filterRecovery, viewportName);
  assertSortRecoveryEvidence(entry.sortRecovery, viewportName);
  assertViewSettingsRecoveryEvidence(entry.viewSettingsRecovery, viewportName);
  assertTemplateRecoveryEvidence(entry.templateRecovery, viewportName);

  const favorite = entry.favoriteState;
  if (
    favorite?.initialPressed !== "false" ||
    favorite?.added?.pressed !== true ||
    favorite?.added?.manifestHasDatabase !== true ||
    favorite?.added?.sidebarHasDatabase !== true ||
    favorite?.removed?.pressed !== false ||
    favorite?.removed?.manifestHasDatabase !== false ||
    favorite?.removed?.sidebarHasDatabase !== false ||
    favorite?.final?.pressed !== true ||
    favorite?.final?.buttonClass?.includes("on") !== true
  ) {
    throw new Error(`Database created views artifact contract missing favorite add/remove evidence for ${viewportName}: ${JSON.stringify(favorite)}`);
  }

  if (!isUsableRect(entry.tableRect) || !isUsableRect(entry.tabsRect) || !isUsableRect(entry.activeTabRect)) {
    throw new Error(`Database created views artifact contract missing usable geometry for ${viewportName}: ${JSON.stringify({
      activeTabRect: entry.activeTabRect,
      tableRect: entry.tableRect,
      tabsRect: entry.tabsRect
    })}`);
  }
}

export function assertFilterRecoveryEvidence(recovery, viewportName = "unknown") {
  if (
    !recovery
    || !String(recovery.message || "").includes("Injected view persistence failure")
    || recovery.popoverRemainedOpen !== true
    || recovery.pendingDismissalBlocked !== true
    || recovery.draftRetained !== true
    || recovery.debouncedDismissalFlushed !== true
    || recovery.failedStateRolledBack !== true
    || recovery.duplicateSubmitSuppressed !== true
    || recovery.retryCommittedExactlyOnce !== true
  ) {
    throw new Error(`Database created views artifact contract missing filter recovery evidence for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
  return true;
}

export function assertSortRecoveryEvidence(recovery, viewportName = "unknown") {
  if (
    !recovery
    || !String(recovery.message || "").includes("Injected sort persistence failure")
    || recovery.popoverRemainedOpen !== true
    || recovery.pendingDismissalBlocked !== true
    || recovery.draftRetained !== true
    || recovery.failedStateRolledBack !== true
    || recovery.duplicateSubmitSuppressed !== true
    || recovery.retryCommittedExactlyOnce !== true
  ) {
    throw new Error(`Database created views artifact contract missing sort recovery evidence for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
  return true;
}

export function assertViewSettingsRecoveryEvidence(recovery, viewportName = "unknown") {
  if (
    !recovery
    || !String(recovery.message || "").includes("Injected view settings persistence failure")
    || recovery.dialogRemainedOpen !== true
    || recovery.pendingDismissalBlocked !== true
    || recovery.draftRetained !== true
    || recovery.failedStateRolledBack !== true
    || recovery.duplicateSubmitSuppressed !== true
    || recovery.retryCommittedExactlyOnce !== true
  ) {
    throw new Error(`Database created views artifact contract missing view settings recovery evidence for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
  return true;
}

export function assertTemplateRecoveryEvidence(recovery, viewportName = "unknown") {
  if (
    !recovery
    || !String(recovery.message || "").includes("Injected template persistence failure")
    || recovery.dialogRemainedOpen !== true
    || recovery.pendingDismissalBlocked !== true
    || recovery.draftRetained !== true
    || recovery.failedStateRolledBack !== true
    || recovery.duplicateSubmitSuppressed !== true
    || recovery.retryCommittedExactlyOnce !== true
  ) {
    throw new Error(`Database created views artifact contract missing template recovery evidence for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
  return true;
}

async function assertCreatedViewsSnapshot(entry, viewportName, { requirePerceptualBaseline }) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Database created views artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Database created views artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Database created views artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "database-created-views") {
    throw new Error(`Database created views artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertCreatedViewsEvidence(payload, viewportName);
  validateCompleteSurfaceState(snapshot.completeSurfaceState, viewportName, "entry");
  validateCompleteSurfaceState(payload.completeSurfaceState, viewportName, "metadata");
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
    activeTabText: payload.activeTabText,
    visibleTabs: payload.visibleTabs,
    completeSurfaceState: snapshot.completeSurfaceState,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

function validateCompleteSurfaceState(state, viewportName, source) {
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
      throw new Error(`Database created views artifact contract missing ${source} ${key} for ${viewportName}: ${JSON.stringify(state?.[key])}`);
    }
  }
  if (
    state.titleText !== "Created Views Smoke DB"
    || !/4 fields?\s*·\s*3 rows?/i.test(state.subtitleText || "")
    || state.activeTabText !== "Created date desc"
    || state.renderedDataRowCount !== 3
    || !state.rowTexts?.[0]?.includes("Newest created row")
    || !state.rowTexts?.[1]?.includes("Middle created row")
    || !state.rowTexts?.[2]?.includes("Oldest created row")
    || !/3\s+of\s+3\s+rows/i.test(state.rowCountText || "")
    || state.filterPopoverCount !== 0
    || state.errorStatusCount !== 0
    || Number(state.documentHorizontalOverflow) > 2
    || !insideViewport(state.surfaceRect, state.viewport)
    || !["surface", "header", "tabs", "table", "footer"].every((name) => (
      state[`${name}Visibility`] === "visible" && Number(state[`${name}Opacity`]) >= 0.99
    ))
  ) {
    throw new Error(`Database created views artifact contract found clipped, hidden, dirty, or incomplete ${source} surface for ${viewportName}: ${JSON.stringify(state)}`);
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
      throw new Error(`Database created views artifact contract found mis-owned ${source} ${ownerName} content for ${viewportName}: ${JSON.stringify({ owner, children })}`);
    }
  }
  if (
    overlaps(state.allTabRect, state.ascTabRect)
    || overlaps(state.ascTabRect, state.descTabRect)
    || overlaps(state.descTabRect, state.viewActionsRect)
    || overlaps(state.footerRect, state.summaryRect)
  ) {
    throw new Error(`Database created views artifact contract found overlapping ${source} controls or regions for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Database created views artifact contract missing committed surface baseline for ${viewportName}`);
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
    throw new Error(`Database created views artifact contract surface baseline failed for ${viewportName}: ${JSON.stringify(baseline)}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path || (await stat(path)).size <= 0) {
      throw new Error(`Database created views artifact contract missing ${label} baseline evidence for ${viewportName}: ${path ?? "missing"}`);
    }
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.actualPath !== baseline.actualPath || diffMetadata.expectedPath !== baseline.expectedPath) {
    throw new Error(`Database created views artifact contract diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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

function isUsableRect(rect) {
  return rect && Number(rect.width) >= 60 && Number(rect.height) >= 20;
}

export function requiredDatabaseCreatedViewTabs() {
  return [...REQUIRED_VIEW_TABS];
}
