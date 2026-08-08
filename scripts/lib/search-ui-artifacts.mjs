import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];
const REQUIRED_SORT_VALUES = ["relevance", "updated_desc", "updated_asc", "created_desc", "created_asc"];

export async function assertSearchUiArtifactContract(summary, {
  expectedViewportNames = DEFAULT_EXPECTED_VIEWPORTS,
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Search UI artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportNameFromEntry(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Search UI artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Search UI artifact contract missing entry for ${viewportName}`);
    assertSearchEvidence(entry, summary, viewportName);
    snapshots.push(await assertSearchSnapshot(entry.visualSnapshot, entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    perceptualBaselineCount: snapshots.filter((snapshot) => snapshot.perceptualBaseline?.status === "passed").length,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertSearchEvidence(entry, summary, viewportName) {
  if (!entry.query || typeof entry.query !== "string") {
    throw new Error(`Search UI ${viewportName} missing query evidence: ${JSON.stringify(entry.query)}`);
  }
  if (!Array.isArray(entry.candidateChecks) || entry.candidateChecks.length < 1) {
    throw new Error(`Search UI ${viewportName} missing backend candidate checks.`);
  }
  if (!Number.isFinite(entry.hits) || entry.hits < summary.visibleHits) {
    throw new Error(`Search UI ${viewportName} hit count is below visible target: ${JSON.stringify({ hits: entry.hits, visibleHits: summary.visibleHits })}`);
  }
  assertTiming(entry.firstRenderMs, summary.thresholdMs, `${viewportName} first render`);
  assertTiming(entry.repeatedRenderMs, summary.thresholdMs, `${viewportName} repeated render`);
  assertSearchHarnessCacheEvidence(entry.harnessCache, viewportName);
  assertSearchInputLatencyEvidence(entry.inputLatency, summary.inputThresholdMs, viewportName);
  assertSorting(entry.sorting, viewportName);
  assertJump(entry.jump, viewportName);
  assertOverflow(entry.renderOverflow, viewportName, "render");
  assertOverflow(entry.inputOverflow, viewportName, "input");
  assertKeyboard(entry.keyboardNavigation, viewportName);
}

export function assertSearchHarnessCacheEvidence(evidence, viewportName = "unknown") {
  const generationCounts = evidence?.generationCounts;
  const queryCounts = evidence?.queryCounts;
  const queryTimings = evidence?.queryTimings;
  if (
    !generationCounts || typeof generationCounts !== "object" ||
    !queryCounts || typeof queryCounts !== "object" ||
    !Array.isArray(queryTimings)
  ) {
    throw new Error(`Search UI ${viewportName} missing harness cache evidence: ${JSON.stringify(evidence)}`);
  }
  const generatedSorts = Object.keys(generationCounts);
  if (!generatedSorts.includes("relevance")) {
    throw new Error(`Search UI ${viewportName} harness did not cache relevance results: ${JSON.stringify(evidence)}`);
  }
  for (const sortMode of generatedSorts) {
    const generations = generationCounts[sortMode];
    const queries = queryCounts[sortMode];
    if (generations !== 1 || !Number.isFinite(queries) || queries < generations) {
      throw new Error(
        `Search UI ${viewportName} regenerated synthetic hits for ${sortMode}: ${JSON.stringify({ generations, queries })}`
      );
    }
  }
  if (!queryTimings.some((timing) => (
    timing?.cacheHit === true &&
    Number.isFinite(timing.originalMs) &&
    Number.isFinite(timing.delayMs) &&
    Number.isFinite(timing.prepareMs) &&
    Number.isFinite(timing.totalMs)
  ))) {
    throw new Error(`Search UI ${viewportName} missing cached-query timing evidence: ${JSON.stringify(queryTimings)}`);
  }
  return {
    generationCounts: { ...generationCounts },
    queryCounts: { ...queryCounts },
    queryTimings: queryTimings.map((timing) => ({ ...timing }))
  };
}

function assertTiming(actual, threshold, label) {
  if (!Number.isFinite(actual) || actual <= 0) {
    throw new Error(`Search UI ${label} missing timing: ${actual}`);
  }
  if (Number.isFinite(threshold) && actual > threshold) {
    throw new Error(`Search UI ${label} ${actual}ms exceeds ${threshold}ms`);
  }
}

export function assertSearchInputLatencyEvidence(inputLatency, threshold, viewportName = "unknown") {
  if (!inputLatency || !Array.isArray(inputLatency.samples) || inputLatency.samples.length < 4) {
    throw new Error(`Search UI ${viewportName} missing input latency samples: ${JSON.stringify(inputLatency)}`);
  }
  if (!Number.isFinite(inputLatency.maxMs) || !Number.isFinite(inputLatency.avgMs)) {
    throw new Error(`Search UI ${viewportName} missing input latency aggregates: ${JSON.stringify(inputLatency)}`);
  }
  if (Number.isFinite(threshold)) {
    const overBudget = inputLatency.samples.filter((sample) => sample > threshold);
    const hardLimit = threshold * 4;
    if (overBudget.length > 1 || inputLatency.maxMs > hardLimit) {
      throw new Error(
        `Search UI ${viewportName} input latency is not responsive: ` +
        JSON.stringify({ threshold, hardLimit, overBudget, inputLatency })
      );
    }
  }
}

function assertSorting(sorting, viewportName) {
  const options = Array.isArray(sorting?.options) ? sorting.options : [];
  const values = options.map((option) => option.value);
  const missing = REQUIRED_SORT_VALUES.filter((value) => !values.includes(value));
  if (missing.length > 0) {
    throw new Error(`Search UI ${viewportName} missing sort option(s): ${missing.join(", ")}`);
  }
  if (sorting.createdAsc !== "Search UI Hit 0") {
    throw new Error(`Search UI ${viewportName} created ascending sort did not put oldest first: ${JSON.stringify(sorting)}`);
  }
  if (!/^Search UI Hit \d+$/.test(sorting.updatedDesc || "")) {
    throw new Error(`Search UI ${viewportName} updated descending sort missing newest title: ${JSON.stringify(sorting)}`);
  }
  if (
    !sorting.geometry?.active ||
    !sorting.geometry?.dialogInsideViewport ||
    !sorting.geometry?.sortInsideViewport ||
    !sorting.geometry?.filtersInsideDialog ||
    !sorting.geometry?.sortInsideDialog ||
    !sorting.geometry?.sortInsideFilters ||
    sorting.geometry?.sortOverlapsFilter ||
    sorting.geometry?.filtersOverflowX > 1
  ) {
    throw new Error(`Search UI ${viewportName} sort geometry/focus failed: ${JSON.stringify(sorting.geometry)}`);
  }
}

function assertJump(jump, viewportName) {
  if (!jump || jump.matchVisible !== true || !Number.isFinite(jump.visibleLineCount) || jump.visibleLineCount < 1) {
    throw new Error(`Search UI ${viewportName} missing jump-to-line evidence: ${JSON.stringify(jump)}`);
  }
  if (typeof jump.firstVisibleLine !== "string" || typeof jump.lastVisibleLine !== "string") {
    throw new Error(`Search UI ${viewportName} jump-to-line visible lines are missing: ${JSON.stringify(jump)}`);
  }
}

function assertKeyboard(keyboardNavigation, viewportName) {
  if (!keyboardNavigation?.active || keyboardNavigation.activeHitCount !== 1 || !keyboardNavigation.inputFocused) {
    throw new Error(`Search UI ${viewportName} keyboard navigation evidence missing: ${JSON.stringify(keyboardNavigation)}`);
  }
}

function assertOverflow(metrics, viewportName, phase) {
  if (!metrics || !Number.isFinite(metrics.bodyScrollWidth) || !Number.isFinite(metrics.innerWidth)) {
    throw new Error(`Search UI ${viewportName} missing ${phase} overflow evidence: ${JSON.stringify(metrics)}`);
  }
  const maxDocumentWidth = Math.max(metrics.bodyScrollWidth, metrics.docScrollWidth || 0);
  const allowedWidth = Math.max(metrics.bodyClientWidth || 0, metrics.docClientWidth || 0, metrics.innerWidth) + 8;
  if (maxDocumentWidth > allowedWidth) {
    throw new Error(`Search UI ${viewportName} ${phase} overflow evidence exceeds viewport: ${JSON.stringify(metrics)}`);
  }
}

async function assertSearchSnapshot(snapshot, entry, viewportName, {
  requirePerceptualBaseline = false
} = {}) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Search UI ${viewportName} missing snapshot paths`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Search UI ${viewportName} snapshot image is empty: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Search UI ${viewportName} snapshot viewport mismatch: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "search-latency") {
    throw new Error(`Search UI ${viewportName} snapshot phase mismatch: ${JSON.stringify(payload.phase)}`);
  }
  if (payload.query !== entry.query || payload.visibleHitCount < 1 || payload.firstVisibleTitle !== "Search UI Hit 0") {
    throw new Error(`Search UI ${viewportName} snapshot search metadata mismatch: ${JSON.stringify(payload)}`);
  }
  assertSearchLayout(payload.layout, viewportName);
  for (const key of ["firstRenderMs", "repeatedRenderMs", "inputMaxMs"]) {
    if (!Number.isFinite(payload[key])) {
      throw new Error(`Search UI ${viewportName} snapshot missing numeric ${key}: ${JSON.stringify(payload)}`);
    }
  }
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
    phaseCount: 1,
    phases: ["search-latency"],
    visibleHitCount: payload.visibleHitCount,
    firstRenderMs: payload.firstRenderMs,
    repeatedRenderMs: payload.repeatedRenderMs,
    inputMaxMs: payload.inputMaxMs,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

function assertSearchLayout(layout, viewportName) {
  for (const key of ["panel", "filters", "sortLabel", "sortSelect", "results"]) {
    const rect = layout?.[key];
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Search UI ${viewportName} snapshot missing ${key} geometry: ${JSON.stringify(rect)}`);
    }
  }
  if (
    layout.filterCount !== 6 ||
    !Array.isArray(layout.filterButtons) ||
    layout.filterButtons.length !== 6 ||
    !layout.sortInsidePanel ||
    !layout.sortInsideFilters ||
    layout.sortOverlapsFilter ||
    layout.filtersOverflowX > 1
  ) {
    throw new Error(`Search UI ${viewportName} snapshot clipped or overlapping controls: ${JSON.stringify(layout)}`);
  }
  if (!Array.isArray(layout.visibleRows) || layout.visibleRows.length < 1 || !layout.visibleRows[0]?.fullyVisible) {
    throw new Error(`Search UI ${viewportName} snapshot missing a fully visible result row: ${JSON.stringify(layout?.visibleRows)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Search UI artifact contract missing committed result baseline for ${viewportName}`);
    return null;
  }
  if (baseline.kind !== "lotion-png-visual-diff" || baseline.status !== "passed") {
    throw new Error(`Search UI artifact contract result baseline did not pass for ${viewportName}: ${JSON.stringify({ kind: baseline.kind, status: baseline.status })}`);
  }
  if (baseline.actualPath !== snapshot.imagePath) {
    throw new Error(`Search UI artifact contract result baseline actual path mismatch for ${viewportName}: ${baseline.actualPath}`);
  }
  if (!baseline.dimensionsMatch || baseline.diffPixels > baseline.maxDiffPixels || baseline.diffRatio > baseline.maxDiffRatio) {
    throw new Error(`Search UI artifact contract result baseline exceeded tolerance for ${viewportName}: ${JSON.stringify({ dimensionsMatch: baseline.dimensionsMatch, diffPixels: baseline.diffPixels, diffRatio: baseline.diffRatio })}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path) throw new Error(`Search UI artifact contract missing result ${label} path for ${viewportName}`);
    const info = await stat(path);
    if (info.size <= 0) throw new Error(`Search UI artifact contract found empty result ${label} artifact for ${viewportName}: ${path}`);
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.expectedPath !== baseline.expectedPath || diffMetadata.actualPath !== baseline.actualPath) {
    throw new Error(`Search UI artifact contract result diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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

function viewportNameFromEntry(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}
