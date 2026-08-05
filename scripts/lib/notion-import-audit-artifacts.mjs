import { readFile, stat } from "node:fs/promises";

const REQUIRED_SUMMARY = {
  "Source CSVs": "1 / 1",
  "Source HTMLs": "1 / 1",
  "Imported mappings": "1 database, 1 row/page",
  "Issues": "0",
  "Warnings": "0"
};

const REQUIRED_PATH_BUTTONS = 2;
const REQUIRED_DIAGNOSTIC_KIND = "cell_loss";

export async function assertNotionImportAuditArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map(viewportNameFromEntry).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Notion import audit artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Notion import audit artifact contract missing entry for ${viewportName}`);
    assertAuditViewport(entry, viewportName);
    assertSingleFlightSubmission(entry.singleFlightSubmission, viewportName);

    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) {
      throw new Error(`Notion import audit artifact contract missing snapshot paths for ${viewportName}`);
    }
    const imageInfo = await stat(snapshot.imagePath);
    if (imageInfo.size <= 0) {
      throw new Error(`Notion import audit artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
    }
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const payload = metadata.metadata || {};
    if (metadata.viewport?.name !== viewportName) {
      throw new Error(`Notion import audit artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
    }
    assertRequiredSummary(payload.summary, `metadata ${viewportName}`);
    if (payload.pathButtons !== REQUIRED_PATH_BUTTONS) {
      throw new Error(`Notion import audit artifact contract expected ${REQUIRED_PATH_BUTTONS} path buttons in metadata for ${viewportName}: ${payload.pathButtons}`);
    }
    assertOpenRequests({
      label: `metadata ${viewportName}`,
      requests: payload.shellOpenDryRunRequests,
      sourceRoot: payload.sourceRoot,
      workspaceRoot: payload.workspaceRoot
    });
    assertSingleFlightSubmission(payload.singleFlightSubmission, `metadata ${viewportName}`);

    snapshots.push({
      phase: "passing",
      viewport: viewportName,
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      imageBytes: imageInfo.size,
      pathButtons: entry.pathButtons,
      openedCount: entry.shellOpenDryRunRequests.length,
      singleFlightSubmission: entry.singleFlightSubmission,
      summary: entry.summary
    });
  }

  const diagnostics = Array.isArray(summary?.diagnostics) ? summary.diagnostics : [];
  const diagnosticSnapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = diagnostics.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) {
      throw new Error(`Notion import audit artifact contract missing failing diagnostic for ${viewportName}`);
    }
    diagnosticSnapshots.push(await assertDiagnosticViewport(entry, viewportName));
  }

  const importModal = Array.isArray(summary?.importModal) ? summary.importModal : [];
  const modalSnapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = importModal.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) {
      throw new Error(`Notion import audit artifact contract missing import modal overlay for ${viewportName}`);
    }
    modalSnapshots.push(await assertImportModalViewport(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length + diagnosticSnapshots.length + modalSnapshots.length,
    diagnosticCount: diagnosticSnapshots.length,
    modalCount: modalSnapshots.length,
    snapshots: [...modalSnapshots, ...snapshots, ...diagnosticSnapshots]
  };
}

async function assertImportModalViewport(entry, viewportName, { requirePerceptualBaseline }) {
  const overlay = entry.overlay || {};
  if (
    overlay.title !== "Import from Notion" ||
    overlay.modalRole !== "dialog" ||
    overlay.ariaModal !== "true" ||
    overlay.backdropCoversViewport !== true ||
    overlay.centerInsideModal !== true ||
    overlay.modalContainsPageTitle !== false
  ) {
    throw new Error(`Notion import audit artifact contract invalid import modal overlay for ${viewportName}: ${JSON.stringify(overlay)}`);
  }
  const snapshot = entry.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Notion import audit artifact contract missing import modal snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Notion import audit artifact contract found empty import modal image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Notion import audit artifact contract import modal viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "command-modal") {
    throw new Error(`Notion import audit artifact contract expected command-modal phase metadata for ${viewportName}, got ${payload.phase ?? "(missing)"}`);
  }
  if (payload.overlay?.title !== "Import from Notion" || payload.overlay?.modalContainsPageTitle !== false) {
    throw new Error(`Notion import audit artifact contract import modal metadata missing overlay evidence for ${viewportName}: ${JSON.stringify(payload.overlay)}`);
  }
  assertImportModalControlState(entry.controlState, viewportName, "entry");
  assertImportModalControlState(payload.controlState, viewportName, "metadata");
  const perceptualBaseline = await assertPerceptualBaseline(
    entry.perceptualBaseline,
    snapshot,
    viewportName,
    { required: requirePerceptualBaseline }
  );
  return {
    phase: "command-modal",
    viewport: viewportName,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    imageBytes: imageInfo.size,
    overlay,
    controlState: entry.controlState,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

function assertImportModalControlState(state, viewportName, phase) {
  for (const key of ["modalRect", "bodyRect", "panelRect", "titleRect", "closeRect", "optionsRect", "actionsRect", "cancelRect", "scanRect"]) {
    const rect = state?.[key];
    if (!rect || Number(rect.width) <= 0 || Number(rect.height) <= 0) {
      throw new Error(`Notion import audit artifact contract missing ${phase} import modal ${key} geometry for ${viewportName}: ${JSON.stringify(rect)}`);
    }
  }
  for (const [key, expectedCount] of [["optionRects", 3], ["sourceCardRects", 2], ["sourceButtonRects", 2]]) {
    const rects = state?.[key];
    if (!Array.isArray(rects) || rects.length !== expectedCount || rects.some((rect) => !rect || Number(rect.width) <= 0 || Number(rect.height) <= 0)) {
      throw new Error(`Notion import audit artifact contract missing complete ${phase} import modal ${key} for ${viewportName}: ${JSON.stringify(rects)}`);
    }
  }
  if (
    state.titleText !== "Import from Notion"
    || state.optionTexts?.length !== 3
    || state.optionChecked?.length !== 3
    || !state.optionChecked.every(Boolean)
    || state.sourceTexts?.length !== 2
    || state.sourceButtonTexts?.length !== 2
    || !state.sourceTexts[0].includes("Markdown & CSV export")
    || !state.sourceTexts[1].includes("HTML export")
    || !state.sourceButtonTexts.every((text) => text === "Choose folder…")
    || state.actionTexts?.[0] !== "Cancel"
    || state.actionTexts?.[1] !== "Scan exports"
    || state.scanDisabled !== true
    || state.panelInsideModal !== true
    || state.titleInsideModal !== true
    || state.closeInsideModal !== true
    || state.optionsInsideModal !== true
    || state.optionsInsidePanel !== true
    || state.optionControlsInsideOptions !== true
    || state.sourceCardsInsidePanel !== true
    || state.sourceButtonsInsideCards !== true
    || state.actionsInsidePanel !== true
    || state.actionButtonsInsideActions !== true
    || state.modalInsideViewport !== true
    || state.bodyOwnsVerticalScroll !== true
    || Number(state.bodyScrollHeight) < Number(state.bodyClientHeight)
    || state.visibility !== "visible"
    || Number(state.opacity) < 0.99
    || Number(state.horizontalOverflow) > 2
  ) {
    throw new Error(`Notion import audit artifact contract found clipped, transparent, or incomplete ${phase} import modal for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Notion import audit artifact contract missing committed command-modal baseline for ${viewportName}`);
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
    throw new Error(`Notion import audit artifact contract command-modal baseline failed for ${viewportName}: ${JSON.stringify(baseline)}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path || (await stat(path)).size <= 0) {
      throw new Error(`Notion import audit artifact contract missing ${label} baseline evidence for ${viewportName}: ${path ?? "missing"}`);
    }
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.actualPath !== baseline.actualPath || diffMetadata.expectedPath !== baseline.expectedPath) {
    throw new Error(`Notion import audit artifact contract diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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

function assertAuditViewport(entry, viewportName) {
  assertRequiredSummary(entry.summary, viewportName);
  if (entry.pathButtons !== REQUIRED_PATH_BUTTONS) {
    throw new Error(`Notion import audit artifact contract expected ${REQUIRED_PATH_BUTTONS} path buttons for ${viewportName}: ${entry.pathButtons}`);
  }
  assertOpenRequests({
    label: viewportName,
    requests: entry.shellOpenDryRunRequests,
    sourceRoot: entry.sourceRoot,
    workspaceRoot: entry.workspaceRoot
  });
}

function assertSingleFlightSubmission(evidence, label) {
  if (
    evidence?.attemptedClicks !== 2
    || typeof evidence.disabledAfterFirstClick !== "boolean"
    || typeof evidence.disabledAfterDispatch !== "boolean"
    || evidence.resultCount !== 1
    || evidence.errorCount !== 0
  ) {
    throw new Error(`Notion import audit artifact contract missing single-flight submission evidence for ${label}: ${JSON.stringify(evidence)}`);
  }
}

function assertRequiredSummary(summary, label) {
  if (!summary || typeof summary !== "object") {
    throw new Error(`Notion import audit artifact contract missing summary for ${label}`);
  }
  for (const [key, expected] of Object.entries(REQUIRED_SUMMARY)) {
    if (summary[key] !== expected) {
      throw new Error(`Notion import audit artifact contract expected summary ${key}=${expected} for ${label}, got ${summary[key] ?? "(missing)"}`);
    }
  }
}

async function assertDiagnosticViewport(entry, viewportName) {
  assertSingleFlightSubmission(entry.singleFlightSubmission, `diagnostic ${viewportName}`);
  const summary = entry.summary;
  if (!summary || typeof summary !== "object") {
    throw new Error(`Notion import audit artifact contract missing failing diagnostic summary for ${viewportName}`);
  }
  const issueCount = Number(summary.Issues);
  if (!Number.isFinite(issueCount) || issueCount <= 0) {
    throw new Error(`Notion import audit artifact contract expected failing diagnostic issues for ${viewportName}, got ${summary.Issues ?? "(missing)"}`);
  }
  if (!entry.issueKinds || Number(entry.issueKinds[REQUIRED_DIAGNOSTIC_KIND] || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract missing ${REQUIRED_DIAGNOSTIC_KIND} issue kind for ${viewportName}`);
  }
  if (Number(entry.issueRows || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract missing visible issue rows for ${viewportName}`);
  }
  if (!String(entry.failText || "").includes("blocking import issues")) {
    throw new Error(`Notion import audit artifact contract missing failing status text for ${viewportName}`);
  }
  if (Number(entry.pathButtons || 0) <= REQUIRED_PATH_BUTTONS) {
    throw new Error(`Notion import audit artifact contract expected diagnostic path buttons for ${viewportName}, got ${entry.pathButtons}`);
  }
  assertOpenRequests({
    label: `diagnostic ${viewportName}`,
    requests: entry.shellOpenDryRunRequests,
    sourceRoot: entry.sourceRoot,
    workspaceRoot: entry.workspaceRoot
  });

  const snapshot = entry.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Notion import audit artifact contract missing failing diagnostic snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Notion import audit artifact contract found empty failing diagnostic image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Notion import audit artifact contract failing diagnostic viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "diagnostic") {
    throw new Error(`Notion import audit artifact contract expected diagnostic phase metadata for ${viewportName}, got ${payload.phase ?? "(missing)"}`);
  }
  if (Number(payload.issueKinds?.[REQUIRED_DIAGNOSTIC_KIND] || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract metadata missing ${REQUIRED_DIAGNOSTIC_KIND} for ${viewportName}`);
  }
  if (Number(payload.issueRows || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract metadata missing issue rows for ${viewportName}`);
  }
  assertSingleFlightSubmission(payload.singleFlightSubmission, `diagnostic metadata ${viewportName}`);

  return {
    phase: "diagnostic",
    viewport: viewportName,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    imageBytes: imageInfo.size,
    pathButtons: entry.pathButtons,
    openedCount: entry.shellOpenDryRunRequests.length,
    singleFlightSubmission: entry.singleFlightSubmission,
    summary: entry.summary,
    issueKinds: entry.issueKinds,
    issueRows: entry.issueRows,
    failText: entry.failText
  };
}

function assertOpenRequests({ label, requests, sourceRoot, workspaceRoot }) {
  if (!sourceRoot || !workspaceRoot) {
    throw new Error(`Notion import audit artifact contract missing source/workspace roots for ${label}`);
  }
  if (!Array.isArray(requests)) {
    throw new Error(`Notion import audit artifact contract missing shell-open requests for ${label}`);
  }
  for (const expected of [sourceRoot, workspaceRoot]) {
    if (!requests.includes(expected)) {
      throw new Error(`Notion import audit artifact contract missing opened path ${expected} for ${label}`);
    }
  }
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
