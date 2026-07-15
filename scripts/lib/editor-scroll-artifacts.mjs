import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];

export async function assertEditorScrollArtifactContract(summary, {
  expectedViewportNames = DEFAULT_EXPECTED_VIEWPORTS
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Editor scroll artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportNameFromEntry(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Editor scroll artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Editor scroll artifact contract missing entry for ${viewportName}`);
    assertScrollEvidence(entry, viewportName);
    snapshots.push(await assertSnapshot(entry.visualSnapshot, viewportName, entry));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertScrollEvidence(entry, viewportName) {
  for (const key of ["lines", "embeddedRows", "steps", "baselineRafMs", "totalMs", "scrollOverheadMs", "avgStepMs", "scrollHeight", "clientHeight"]) {
    if (!Number.isFinite(entry[key])) {
      throw new Error(`Editor scroll ${viewportName} missing numeric ${key}: ${JSON.stringify(entry[key])}`);
    }
  }
  if (entry.lines < 100 || entry.embeddedRows < 1 || entry.steps < 1) {
    throw new Error(`Editor scroll ${viewportName} fixture is too small: ${JSON.stringify({ lines: entry.lines, embeddedRows: entry.embeddedRows, steps: entry.steps })}`);
  }
  if (entry.scrollHeight <= entry.clientHeight) {
    throw new Error(`Editor scroll ${viewportName} scroller is not scrollable: ${JSON.stringify({ scrollHeight: entry.scrollHeight, clientHeight: entry.clientHeight })}`);
  }
  if (entry.embeddedTablesAfterScroll < 1) {
    throw new Error(`Editor scroll ${viewportName} lost embedded table after scroll: ${JSON.stringify(entry.embeddedTablesAfterScroll)}`);
  }
  if (entry.totalMs > entry.thresholdMs && entry.scrollOverheadMs > entry.overheadThresholdMs) {
    throw new Error(`Editor scroll ${viewportName} exceeded thresholds: ${JSON.stringify({
      totalMs: entry.totalMs,
      thresholdMs: entry.thresholdMs,
      scrollOverheadMs: entry.scrollOverheadMs,
      overheadThresholdMs: entry.overheadThresholdMs
    })}`);
  }
  if (!Number.isFinite(entry.longTaskCount) || !Number.isFinite(entry.maxLongTaskMs)) {
    throw new Error(`Editor scroll ${viewportName} missing long-task evidence: ${JSON.stringify({ longTaskCount: entry.longTaskCount, maxLongTaskMs: entry.maxLongTaskMs })}`);
  }
  assertOverflow(entry.loadedOverflow, viewportName, "loaded");
  assertOverflow(entry.afterOverflow, viewportName, "after");
}

function assertOverflow(metrics, viewportName, phase) {
  if (!metrics || !Number.isFinite(metrics.bodyScrollWidth) || !Number.isFinite(metrics.innerWidth)) {
    throw new Error(`Editor scroll ${viewportName} missing ${phase} overflow evidence: ${JSON.stringify(metrics)}`);
  }
  const maxDocumentWidth = Math.max(metrics.bodyScrollWidth, metrics.docScrollWidth || 0);
  const allowedWidth = Math.max(metrics.bodyClientWidth || 0, metrics.docClientWidth || 0, metrics.innerWidth) + 8;
  if (maxDocumentWidth > allowedWidth) {
    throw new Error(`Editor scroll ${viewportName} ${phase} overflow evidence exceeds viewport: ${JSON.stringify(metrics)}`);
  }
}

async function assertSnapshot(snapshot, viewportName, entry) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Editor scroll ${viewportName} missing snapshot paths`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Editor scroll ${viewportName} snapshot image is empty: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Editor scroll ${viewportName} snapshot viewport mismatch: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "editor-scroll") {
    throw new Error(`Editor scroll ${viewportName} snapshot phase mismatch: ${JSON.stringify(payload.phase)}`);
  }
  for (const key of ["lines", "embeddedRows", "steps", "totalMs", "scrollHeight", "embeddedTablesAfterScroll"]) {
    if (payload[key] !== entry[key]) {
      throw new Error(`Editor scroll ${viewportName} snapshot metadata.${key} mismatch: ${JSON.stringify({ expected: entry[key], actual: payload[key] })}`);
    }
  }
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    phaseCount: 1,
    phases: ["editor-scroll"],
    totalMs: entry.totalMs,
    scrollOverheadMs: entry.scrollOverheadMs,
    scrollHeight: entry.scrollHeight,
    embeddedTablesAfterScroll: entry.embeddedTablesAfterScroll
  };
}

function viewportNameFromEntry(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}
