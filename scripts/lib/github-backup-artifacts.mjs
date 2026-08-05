import { readFile, stat } from "node:fs/promises";

export async function assertGitHubBackupArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact", "wide"],
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`GitHub Backup artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry?.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`GitHub Backup artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate?.viewport === viewportName);
    if (!entry) throw new Error(`GitHub Backup artifact contract missing entry for ${viewportName}`);
    assertInteractionEvidence(entry, viewportName);
    snapshots.push(await assertSnapshot(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    perceptualBaselineCount: snapshots.filter((entry) => entry.perceptualBaseline?.status === "passed").length,
    snapshots
  };
}

function assertInteractionEvidence(entry, viewportName) {
  if (
    entry.initial?.status !== "History empty"
    || entry.initial?.historyCount !== 0
    || entry.backups?.commitCount !== 2
    || entry.backups?.historyCount !== 2
    || entry.backups?.status !== "Backed up"
  ) {
    throw new Error(`GitHub Backup artifact contract missing deterministic backup evidence for ${viewportName}: ${JSON.stringify({ initial: entry.initial, backups: entry.backups })}`);
  }
  assertOverlay(entry.overlay, viewportName);
  assertPreviewState(entry.preview, viewportName, "interaction");
  if (
    entry.restore?.persisted !== true
    || entry.restore?.previewCleared !== true
    || entry.restore?.message !== "Page restored from selected version."
    || !String(entry.restore?.confirmation || "").includes("Restore Backup History Page")
  ) {
    throw new Error(`GitHub Backup artifact contract missing restore evidence for ${viewportName}: ${JSON.stringify(entry.restore)}`);
  }
  if (entry.notConfigured?.status !== "Not configured") {
    throw new Error(`GitHub Backup artifact contract missing GitHub API not-configured evidence for ${viewportName}: ${JSON.stringify(entry.notConfigured)}`);
  }
  if (entry.noHorizontalOverflow !== true) {
    throw new Error(`GitHub Backup artifact contract missing no-overflow evidence for ${viewportName}`);
  }
}

function assertOverlay(overlay, viewportName) {
  if (
    overlay?.title !== "GitHub Backup"
    || overlay?.modalRole !== "dialog"
    || overlay?.ariaModal !== "true"
    || overlay?.backdropCoversViewport !== true
    || overlay?.centerInsideModal !== true
    || overlay?.modalContainsPageTitle !== false
    || overlay?.modalInsideViewport !== true
    || overlay?.bodyOwnsVerticalScroll !== true
  ) {
    throw new Error(`GitHub Backup artifact contract invalid modal ownership for ${viewportName}: ${JSON.stringify(overlay)}`);
  }
}

function assertPreviewState(state, viewportName, phase) {
  for (const key of ["modalRect", "panelRect", "statusRect", "selectedRect", "previewRect", "previewLabelRect", "restoreButtonRect", "diffRect"]) {
    const rect = state?.[key];
    if (!rect || Number(rect.width) <= 0 || Number(rect.height) <= 0) {
      throw new Error(`GitHub Backup artifact contract missing ${phase} ${key} geometry for ${viewportName}: ${JSON.stringify(rect)}`);
    }
  }
  if (
    state.status !== "Backed up"
    || state.historyCount !== 2
    || state.selectedCount !== 1
    || state.restoreButtonText !== "Restore this version"
    || state.diffLineCount < 2
    || state.addedLineCount < 1
    || state.removedLineCount < 1
    || state.selectedInsideModal !== true
    || state.previewInsideModal !== true
    || state.previewLabelInsidePreview !== true
    || state.restoreInsidePreview !== true
    || state.diffInsidePreview !== true
    || Number(state.horizontalOverflow) > 1
    || state.visibility !== "visible"
    || Number(state.opacity) < 0.99
  ) {
    throw new Error(`GitHub Backup artifact contract found clipped or incomplete ${phase} state for ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (!String(state.previewLabel || "").startsWith("Page snapshot · Backup History Page")) {
    throw new Error(`GitHub Backup artifact contract missing logical preview identity for ${viewportName}: ${JSON.stringify(state.previewLabel)}`);
  }
  if ((state.storageLeakMatches || []).length > 0) {
    throw new Error(`GitHub Backup artifact contract found storage identity leak for ${viewportName}: ${JSON.stringify(state.storageLeakMatches)}`);
  }
}

async function assertSnapshot(entry, viewportName, { requirePerceptualBaseline }) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`GitHub Backup artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`GitHub Backup artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName || payload.phase !== "github-backup-restore-preview") {
    throw new Error(`GitHub Backup artifact contract snapshot metadata mismatch for ${viewportName}: ${JSON.stringify({ viewport: metadata.viewport, phase: payload.phase })}`);
  }
  assertOverlay(payload.overlay, viewportName);
  assertPreviewState(payload.preview, viewportName, "snapshot");
  assertCompleteSurface(payload.completeSurface, viewportName);
  const perceptualBaseline = await assertPerceptualBaseline(
    entry.perceptualBaseline,
    snapshot,
    viewportName,
    { required: requirePerceptualBaseline }
  );
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    historyCount: payload.preview.historyCount,
    diffLineCount: payload.preview.diffLineCount,
    previewLabel: payload.preview.previewLabel,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

function assertCompleteSurface(state, viewportName) {
  for (const key of ["modalRect", "panelRect", "formRect", "stateRect", "historyRect", "previewRect"]) {
    const rect = state?.[key];
    if (!rect || Number(rect.width) <= 0 || Number(rect.height) <= 0) {
      throw new Error(`GitHub Backup artifact contract missing complete-surface ${key} for ${viewportName}: ${JSON.stringify(rect)}`);
    }
  }
  if (
    state.formInsidePanel !== true
    || state.stateInsidePanel !== true
    || state.historyInsidePanel !== true
    || state.previewInsidePanel !== true
    || state.panelInsideModal !== true
    || state.visibility !== "visible"
    || Number(state.opacity) < 0.99
  ) {
    throw new Error(`GitHub Backup artifact contract snapshot surface is incomplete for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`GitHub Backup artifact contract missing committed restore-preview baseline for ${viewportName}`);
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
    throw new Error(`GitHub Backup artifact contract restore-preview baseline failed for ${viewportName}: ${JSON.stringify(baseline)}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path || (await stat(path)).size <= 0) {
      throw new Error(`GitHub Backup artifact contract missing ${label} baseline evidence for ${viewportName}: ${path ?? "missing"}`);
    }
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.actualPath !== baseline.actualPath || diffMetadata.expectedPath !== baseline.expectedPath) {
    throw new Error(`GitHub Backup artifact contract diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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
