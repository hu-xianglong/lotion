import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];
const REQUIRED_SORT_VALUES = ["relevance", "updated_desc", "updated_asc", "created_desc", "created_asc"];

export async function assertSearchUiArtifactContract(summary, {
  expectedViewportNames = DEFAULT_EXPECTED_VIEWPORTS
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
    snapshots.push(await assertSearchSnapshot(entry.visualSnapshot, entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
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
  assertInputLatency(entry.inputLatency, summary.inputThresholdMs, viewportName);
  assertSorting(entry.sorting, viewportName);
  assertJump(entry.jump, viewportName);
  assertOverflow(entry.renderOverflow, viewportName, "render");
  assertOverflow(entry.inputOverflow, viewportName, "input");
  assertKeyboard(entry.keyboardNavigation, viewportName);
}

function assertTiming(actual, threshold, label) {
  if (!Number.isFinite(actual) || actual <= 0) {
    throw new Error(`Search UI ${label} missing timing: ${actual}`);
  }
  if (Number.isFinite(threshold) && actual > threshold) {
    throw new Error(`Search UI ${label} ${actual}ms exceeds ${threshold}ms`);
  }
}

function assertInputLatency(inputLatency, threshold, viewportName) {
  if (!inputLatency || !Array.isArray(inputLatency.samples) || inputLatency.samples.length < 4) {
    throw new Error(`Search UI ${viewportName} missing input latency samples: ${JSON.stringify(inputLatency)}`);
  }
  if (!Number.isFinite(inputLatency.maxMs) || !Number.isFinite(inputLatency.avgMs)) {
    throw new Error(`Search UI ${viewportName} missing input latency aggregates: ${JSON.stringify(inputLatency)}`);
  }
  if (Number.isFinite(threshold) && inputLatency.maxMs > threshold) {
    throw new Error(`Search UI ${viewportName} input latency ${inputLatency.maxMs}ms exceeds ${threshold}ms`);
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
  if (!sorting.geometry?.active || !sorting.geometry?.dialogInsideViewport || !sorting.geometry?.sortInsideViewport) {
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

async function assertSearchSnapshot(snapshot, entry, viewportName) {
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
  for (const key of ["firstRenderMs", "repeatedRenderMs", "inputMaxMs"]) {
    if (!Number.isFinite(payload[key])) {
      throw new Error(`Search UI ${viewportName} snapshot missing numeric ${key}: ${JSON.stringify(payload)}`);
    }
  }
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
    inputMaxMs: payload.inputMaxMs
  };
}

function viewportNameFromEntry(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}
