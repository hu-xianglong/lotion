import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];

export async function assertNavigationAnchorArtifactContract(summary, {
  expectedViewportNames = DEFAULT_EXPECTED_VIEWPORTS
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Navigation anchor artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportNameFromEntry(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Navigation anchor artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Navigation anchor artifact contract missing entry for ${viewportName}`);
    assertNavigationEvidence(entry, viewportName);
    snapshots.push(await assertNavigationSnapshot(entry.visualSnapshot, entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertNavigationEvidence(entry, viewportName) {
  if (!/^Anchor paragraph \d+/.test(entry.anchorLine || "")) {
    throw new Error(`Navigation anchor ${viewportName} missing clicked anchor line: ${JSON.stringify(entry.anchorLine)}`);
  }
  if (!entry.visibleTextSample?.includes(entry.anchorLine)) {
    throw new Error(`Navigation anchor ${viewportName} visible text did not preserve anchor line: ${JSON.stringify({
      anchorLine: entry.anchorLine,
      visibleTextSample: entry.visibleTextSample
    })}`);
  }
  assertScrollMetrics(entry.before, viewportName, "before", { minScrollTop: 400 });
  assertScrollMetrics(entry.restored, viewportName, "restored", { minScrollTop: 150 });
  if (entry.restored.scrollTop < entry.before.scrollTop * 0.35) {
    throw new Error(`Navigation anchor ${viewportName} restored too close to top: ${JSON.stringify({
      before: entry.before,
      restored: entry.restored
    })}`);
  }
  const forward = entry.forward || {};
  if (forward.title !== entry.secondTitle || !forward.bodyVisible) {
    throw new Error(`Navigation anchor ${viewportName} forward navigation evidence missing: ${JSON.stringify(forward)}`);
  }
  assertOverflow(entry.beforeOverflow, viewportName, "before");
  assertOverflow(entry.afterBackOverflow, viewportName, "after back");
  assertOverflow(entry.afterForwardOverflow, viewportName, "after forward");
}

function assertScrollMetrics(metrics, viewportName, phase, { minScrollTop }) {
  if (!metrics || !Number.isFinite(metrics.scrollTop) || !Number.isFinite(metrics.scrollHeight) || !Number.isFinite(metrics.clientHeight)) {
    throw new Error(`Navigation anchor ${viewportName} missing ${phase} scroll metrics: ${JSON.stringify(metrics)}`);
  }
  if (metrics.scrollTop < minScrollTop || metrics.scrollHeight <= metrics.clientHeight) {
    throw new Error(`Navigation anchor ${viewportName} invalid ${phase} scroll metrics: ${JSON.stringify(metrics)}`);
  }
}

function assertOverflow(metrics, viewportName, phase) {
  if (!metrics || !Number.isFinite(metrics.bodyScrollWidth) || !Number.isFinite(metrics.innerWidth)) {
    throw new Error(`Navigation anchor ${viewportName} missing ${phase} overflow evidence: ${JSON.stringify(metrics)}`);
  }
  const maxDocumentWidth = Math.max(metrics.bodyScrollWidth, metrics.docScrollWidth || 0);
  const allowedWidth = Math.max(metrics.bodyClientWidth || 0, metrics.docClientWidth || 0, metrics.innerWidth) + 8;
  if (maxDocumentWidth > allowedWidth) {
    throw new Error(`Navigation anchor ${viewportName} ${phase} overflow evidence exceeds viewport: ${JSON.stringify(metrics)}`);
  }
}

async function assertNavigationSnapshot(snapshot, entry, viewportName) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Navigation anchor ${viewportName} missing snapshot paths`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Navigation anchor ${viewportName} snapshot image is empty: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Navigation anchor ${viewportName} snapshot viewport mismatch: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "navigation-anchor-restored") {
    throw new Error(`Navigation anchor ${viewportName} snapshot phase mismatch: ${JSON.stringify(payload.phase)}`);
  }
  if (payload.anchorLine !== entry.anchorLine || !payload.visibleTextSample?.includes(entry.anchorLine)) {
    throw new Error(`Navigation anchor ${viewportName} snapshot anchor metadata mismatch: ${JSON.stringify(payload)}`);
  }
  if (!Number.isFinite(payload.restoredScrollTop) || payload.restoredScrollTop < 150) {
    throw new Error(`Navigation anchor ${viewportName} snapshot missing restored scroll top: ${JSON.stringify(payload)}`);
  }
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    phaseCount: 1,
    phases: ["navigation-anchor-restored"],
    anchorLine: payload.anchorLine,
    restoredScrollTop: payload.restoredScrollTop
  };
}

function viewportNameFromEntry(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}
