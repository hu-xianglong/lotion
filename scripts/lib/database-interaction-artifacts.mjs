import { readFile, stat } from "node:fs/promises";

const REQUIRED_FILES = ["viewJson", "schemaJson", "dataCsv"];
const REQUIRED_PHASES = ["settings-scope-menu", "filter-menu", "sort-menu"];
const REQUIRED_FILE_SUFFIXES = {
  viewJson: "databases/user/Tasks--db_tasks/views/view_default.json",
  schemaJson: "databases/user/Tasks--db_tasks/schema.json",
  dataCsv: "databases/user/Tasks--db_tasks/data.csv"
};

export async function assertDatabaseInteractionArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact", "wide"],
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database interaction lab requires passed smoke status.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const observedViewportNames = entries.map((entry) => entry.viewport);
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database interaction lab missing viewport: ${viewport}`);
    if (entry.noHorizontalOverflow !== true || entry.reloadVerified !== true || entry.staleConflictCode !== "VIEW_CONFLICT") {
      throw new Error(`Database interaction evidence incomplete for ${viewport}: ${JSON.stringify(entry)}`);
    }
    const recovery = entry.cellEditRecovery;
    if (
      !recovery
      || !String(recovery.message || "").includes("Injected inline cell persistence failure")
      || recovery.failedValueRolledBack !== true
      || recovery.laterEditPaused !== true
      || recovery.queuedEditVisible !== true
      || recovery.duplicateRetrySuppressed !== true
      || recovery.retryPersistedFailedEdit !== true
      || recovery.queueResumedInOrder !== true
      || recovery.discardPreservedStoredValue !== true
      || recovery.discardResetDraft !== true
    ) {
      throw new Error(`Database interaction cell-edit recovery evidence incomplete for ${viewport}: ${JSON.stringify(recovery)}`);
    }
    for (const key of ["firstPaintMs", "menuOpenMs", "sortCommitMs", "viewSwitchMs"]) {
      if (!Number.isFinite(entry.timings?.[key]) || entry.timings[key] < 0) {
        throw new Error(`Database interaction timing ${key} missing for ${viewport}`);
      }
    }
    for (const key of REQUIRED_FILES) {
      if (!entry.persistedFiles?.[key]) throw new Error(`Database interaction persisted file ${key} missing for ${viewport}`);
      if (!entry.persistedFiles[key].endsWith(REQUIRED_FILE_SUFFIXES[key])) {
        throw new Error(`Database interaction persisted file ${key} is not the exercised fixture path for ${viewport}`);
      }
    }
    if (!entry.fixture?.hasEmbeddedReference || !entry.fixture?.hasVirtualRows || entry.fixture?.fieldTypeCount < 8) {
      throw new Error(`Database interaction fixture coverage incomplete for ${viewport}`);
    }
    if (!Array.isArray(entry.snapshots) || entry.snapshots.length !== REQUIRED_PHASES.length) {
      throw new Error(`Database interaction snapshots missing for ${viewport}`);
    }
    for (const phase of REQUIRED_PHASES) {
      if (entry.snapshots.filter((snapshot) => snapshot.phase === phase).length !== 1) {
        throw new Error(`Database interaction snapshot phase ${phase} missing or duplicated for ${viewport}`);
      }
    }
    for (const snapshot of entry.snapshots) {
      await assertSnapshot(snapshot, viewport, {
        requirePerceptualBaseline: snapshot.phase === "settings-scope-menu"
          && requiredPerceptualBaselineViewportNames.includes(viewport)
      });
    }
  }
  const snapshots = entries.flatMap((entry) => entry.snapshots.map((snapshot) => ({ viewport: entry.viewport, ...snapshot })));
  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    imageBytesTotal: snapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0),
    snapshots
  };
}

async function assertSnapshot(snapshot, viewport, { requirePerceptualBaseline }) {
  if (!snapshot.imagePath || !snapshot.metadataPath) throw new Error(`Database interaction snapshot paths missing for ${viewport}`);
  const image = await stat(snapshot.imagePath);
  if (image.size < 512) throw new Error(`Database interaction snapshot is too small for ${viewport}`);
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  if (metadata.viewport?.name !== viewport) throw new Error(`Database interaction snapshot viewport mismatch for ${viewport}`);
  if (metadata.metadata?.phase !== snapshot.phase) throw new Error(`Database interaction snapshot phase mismatch for ${viewport}`);
  if (snapshot.horizontalOverflowPx !== 0 || !Number.isFinite(snapshot.viewportWidth) || !Number.isFinite(snapshot.scrollWidth) || snapshot.scrollWidth > snapshot.viewportWidth) {
    throw new Error(`Database interaction snapshot overflow evidence invalid for ${viewport}/${snapshot.phase}`);
  }
  validateCompleteSurfaceState(snapshot.completeSurfaceState, viewport, snapshot.phase, "entry");
  validateCompleteSurfaceState(metadata.metadata?.completeSurfaceState, viewport, snapshot.phase, "metadata");
  const perceptualBaseline = await assertPerceptualBaseline(
    snapshot.perceptualBaseline,
    snapshot,
    viewport,
    { required: requirePerceptualBaseline }
  );
  if (perceptualBaseline) snapshot.perceptualBaseline = perceptualBaseline;
  snapshot.imageBytes = image.size;
}

function validateCompleteSurfaceState(state, viewport, phase, source) {
  for (const key of ["surfaceRect", "tableRect", "activeTabRect"]) {
    if (!positiveRect(state?.[key])) {
      throw new Error(`Database interaction ${phase} missing ${source} ${key} for ${viewport}: ${JSON.stringify(state?.[key])}`);
    }
  }
  if (
    state.phase !== phase
    || state.activeTabText !== "Default"
    || state.surfaceVisibility !== "visible"
    || Number(state.surfaceOpacity) < 0.99
    || state.runningAnimationCount !== 0
    || Number(state.documentHorizontalOverflow) > 0
    || !insideViewport(state.surfaceRect, state.viewport)
    || !insideViewport(state.tableRect, state.viewport)
    || !containsRect(state.tableRect, state.activeTabRect)
  ) {
    throw new Error(`Database interaction ${phase} found clipped, transparent, animating, or offscreen ${source} surface for ${viewport}: ${JSON.stringify(state)}`);
  }
  const requiredControls = {
    "settings-scope-menu": ["header", "viewSettings", "databaseSettings"],
    "filter-menu": ["header", "empty", "rootGroup", "conjunction", "addCondition", "addGroup"],
    "sort-menu": ["header", "priority", "rule", "property", "direction", "addSort", "clearAll"]
  }[phase];
  if (!requiredControls) throw new Error(`Database interaction has unknown phase ${phase} for ${viewport}`);
  for (const key of requiredControls) {
    const control = state.controlRects?.[key];
    if (!positiveRect(control) || !containsRect(state.surfaceRect, control)) {
      throw new Error(`Database interaction ${phase} found missing, clipped, or mis-owned ${source} ${key} for ${viewport}: ${JSON.stringify({ control, state })}`);
    }
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewport, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Database interaction artifact contract missing committed settings baseline for ${viewport}`);
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
    throw new Error(`Database interaction settings baseline failed for ${viewport}: ${JSON.stringify(baseline)}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path || (await stat(path)).size <= 0) {
      throw new Error(`Database interaction missing ${label} settings baseline evidence for ${viewport}: ${path ?? "missing"}`);
    }
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.actualPath !== baseline.actualPath || diffMetadata.expectedPath !== baseline.expectedPath) {
    throw new Error(`Database interaction settings diff metadata mismatch for ${viewport}: ${JSON.stringify(diffMetadata)}`);
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
