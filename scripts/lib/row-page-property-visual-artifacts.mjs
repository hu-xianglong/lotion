import { readFile, stat } from "node:fs/promises";

const REQUIRED_PROPERTY_ROWS = [
  "Original Notion HTML",
  "Original Notion CSV",
  "Notes",
  "Empty text",
  "Status",
  "Tags",
  "Done",
  "Blocked",
  "Due date",
  "Empty date",
  "Score",
  "Related"
];

const REQUIRED_SOURCE_ROWS = ["Original Notion HTML", "Original Notion CSV"];

export async function assertRowPagePropertyVisualArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  horizontalOverflowTolerancePx = 2,
  minRowCount = REQUIRED_PROPERTY_ROWS.length,
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportName(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Row-property visual artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    validateRecovery(entry?.recovery, viewportName);
    validateOptionRecovery(entry?.optionRecovery, viewportName);
    const visual = entry?.propertyVisuals;
    if (!visual) {
      throw new Error(`Row-property visual artifact contract missing propertyVisuals for ${viewportName}`);
    }
    if (visual.rowCount < minRowCount) {
      throw new Error(`Row-property visual artifact contract row count too small for ${viewportName}: ${visual.rowCount}`);
    }
    if (!Number.isFinite(visual.valueColumnLeft) || visual.valueColumnLeft <= 0) {
      throw new Error(`Row-property visual artifact contract missing value column metric for ${viewportName}`);
    }
    if (!Array.isArray(visual.focus) || visual.focus.length < 4) {
      throw new Error(`Row-property visual artifact contract missing focus summaries for ${viewportName}`);
    }
    if (!Array.isArray(visual.sourceOpen) || visual.sourceOpen.length !== REQUIRED_SOURCE_ROWS.length) {
      throw new Error(`Row-property visual artifact contract missing source-open captures for ${viewportName}`);
    }
    const overflow = assertDocumentViewportMetrics(visual.viewport, {
      horizontalOverflowTolerancePx,
      viewportName
    });
    validateCompletePanelState(visual.completePanelState, viewportName, "entry");

    const snapshot = visual.snapshot;
    const baseline = visual.snapshotBaseline;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) {
      throw new Error(`Row-property visual artifact contract missing snapshot paths for ${viewportName}`);
    }
    if (!baseline?.imageBytes || baseline.imageBytes <= 0) {
      throw new Error(`Row-property visual artifact contract missing baseline image bytes for ${viewportName}`);
    }

    const imageInfo = await stat(snapshot.imagePath);
    if (imageInfo.size <= 0) {
      throw new Error(`Row-property visual artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
    }
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const metadataPayload = metadata.metadata || {};
    if (metadata.viewport?.name !== viewportName) {
      throw new Error(`Row-property visual artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
    }
    for (const rowName of REQUIRED_SOURCE_ROWS) {
      if (!Array.isArray(metadataPayload.sourceRows) || !metadataPayload.sourceRows.includes(rowName)) {
        throw new Error(`Row-property visual artifact contract missing source row ${rowName} for ${viewportName}`);
      }
    }
    for (const rowName of REQUIRED_PROPERTY_ROWS) {
      if (!Array.isArray(metadataPayload.visibleRows) || !metadataPayload.visibleRows.includes(rowName)) {
        throw new Error(`Row-property visual artifact contract missing visible row ${rowName} for ${viewportName}`);
      }
    }
    if (!Number.isFinite(metadataPayload.valueColumnLeft) || metadataPayload.valueColumnLeft <= 0) {
      throw new Error(`Row-property visual artifact contract missing metadata value column for ${viewportName}`);
    }
    validateCompletePanelState(metadataPayload.completePanelState, viewportName, "metadata");
    const perceptualBaseline = await assertPerceptualBaseline(
      visual.perceptualBaseline,
      { imagePath: snapshot.imagePath, metadataPath: snapshot.metadataPath },
      viewportName,
      { required: requiredPerceptualBaselineViewportNames.includes(viewportName) }
    );

    snapshots.push({
      viewport: viewportName,
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      imageBytes: imageInfo.size,
      rowCount: visual.rowCount,
      horizontalOverflowPx: overflow.horizontalOverflowPx,
      scrollWidth: overflow.scrollWidth,
      valueColumnLeft: visual.valueColumnLeft,
      sourceRows: metadataPayload.sourceRows,
      viewportWidth: overflow.width,
      visibleRowCount: metadataPayload.visibleRows.length,
      completePanelState: visual.completePanelState,
      ...(perceptualBaseline ? { perceptualBaseline } : {})
    });
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function validateOptionRecovery(recovery, viewportName) {
  if (
    typeof recovery?.message !== "string"
    || !recovery.message.includes("Injected row-property option persistence failure")
    || recovery.failedInput?.find?.((option) => option.id === "status_done")?.color !== "blue"
    || recovery.failedSchemaRolledBack !== true
    || recovery.dismissalBlocked !== true
    || recovery.duplicateRetrySuppressed !== true
    || recovery.retryPersisted !== true
    || recovery.discardPreservedStoredSchema !== true
    || recovery.discardResetControl !== true
    || recovery.baselineRestored !== true
    || recovery.viewport !== viewportName
  ) {
    throw new Error(`Row-property visual artifact contract missing option mutation recovery evidence for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
}

function validateRecovery(recovery, viewportName) {
  if (
    typeof recovery?.message !== "string"
    || !recovery.message.includes("Injected row-property persistence failure")
    || recovery.failedInput?.fieldId !== "notes"
    || !recovery.failedInput?.rowId
    || !recovery.failedInput?.value
    || recovery.failedValueRolledBack !== true
    || recovery.draftRetained !== true
    || recovery.controlsBlocked !== true
    || recovery.duplicateRetrySuppressed !== true
    || recovery.retryPersisted !== true
    || recovery.discardPreservedStoredValue !== true
    || recovery.discardResetDraft !== true
    || recovery.baselineRestored !== true
  ) {
    throw new Error(`Row-property visual artifact contract missing transactional recovery evidence for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
}

function validateCompletePanelState(state, viewportName, source) {
  for (const key of ["panelRect", "contentRect", "propertiesRect"]) {
    if (!positiveRect(state?.[key])) {
      throw new Error(`Row-property visual artifact contract missing ${source} ${key} for ${viewportName}: ${JSON.stringify(state?.[key])}`);
    }
  }
  if (
    state.panelVisibility !== "visible"
    || state.contentVisibility !== "visible"
    || state.propertiesVisibility !== "visible"
    || Number(state.panelOpacity) < 0.99
    || Number(state.contentOpacity) < 0.99
    || Number(state.propertiesOpacity) < 0.99
    || Number(state.contentScrollTop) !== 0
    || !containsRect(state.panelRect, state.contentRect)
    || !containsRect(state.contentRect, state.propertiesRect)
    || !insideViewport(state.propertiesRect, state.viewport)
  ) {
    throw new Error(`Row-property visual artifact contract found clipped, hidden, or mis-owned ${source} panel for ${viewportName}: ${JSON.stringify(state)}`);
  }

  let previousRowRect = null;
  for (const rowName of REQUIRED_PROPERTY_ROWS) {
    const row = state.rows?.[rowName];
    if (
      !positiveRect(row?.rowRect)
      || !positiveRect(row?.labelRect)
      || !positiveRect(row?.valueRect)
      || row.rowVisibility !== "visible"
      || Number(row.rowOpacity) < 0.99
      || !containsRect(state.propertiesRect, row.rowRect)
      || !containsRect(row.rowRect, row.labelRect)
      || !containsRect(row.rowRect, row.valueRect)
      || row.labelRect.right > row.valueRect.left - 8
    ) {
      throw new Error(`Row-property visual artifact contract found clipped, hidden, overlapping, or mis-owned ${source} row ${rowName} for ${viewportName}: ${JSON.stringify(row)}`);
    }
    if (previousRowRect && row.rowRect.top < previousRowRect.bottom - 1) {
      throw new Error(`Row-property visual artifact contract found overlapping ${source} rows before ${rowName} for ${viewportName}: ${JSON.stringify({ previousRowRect, rowRect: row.rowRect })}`);
    }
    previousRowRect = row.rowRect;
    for (const [controlName, controlRect] of Object.entries({
      control: row.controlRect,
      entityChip: row.entityChipRect,
      input: row.inputRect,
      link: row.linkRect,
      linkOpen: row.linkOpenRect,
      optionPill: row.optionPillRect,
      searchChip: row.searchChipRect
    })) {
      if (controlRect && (!positiveRect(controlRect) || !containsRect(row.valueRect, controlRect))) {
        throw new Error(`Row-property visual artifact contract found invalid ${source} ${rowName} ${controlName} for ${viewportName}: ${JSON.stringify({ controlRect, valueRect: row.valueRect })}`);
      }
    }
    if (overlaps(row.optionPillRect, row.searchChipRect)) {
      throw new Error(`Row-property visual artifact contract found overlapping ${source} selected option/search action for ${rowName} ${viewportName}: ${JSON.stringify(row)}`);
    }
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Row-property visual artifact contract missing committed panel baseline for ${viewportName}`);
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
    throw new Error(`Row-property visual artifact contract panel baseline failed for ${viewportName}: ${JSON.stringify(baseline)}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path || (await stat(path)).size <= 0) {
      throw new Error(`Row-property visual artifact contract missing ${label} panel baseline evidence for ${viewportName}: ${path ?? "missing"}`);
    }
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.actualPath !== baseline.actualPath || diffMetadata.expectedPath !== baseline.expectedPath) {
    throw new Error(`Row-property visual artifact contract panel diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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
  if (!left || !right) return false;
  return Number(left.right) > Number(right.left) + tolerance
    && Number(left.left) < Number(right.right) - tolerance
    && Number(left.bottom) > Number(right.top) + tolerance
    && Number(left.top) < Number(right.bottom) - tolerance;
}

function assertDocumentViewportMetrics(viewport, { horizontalOverflowTolerancePx, viewportName }) {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.scrollWidth)) {
    throw new Error(`Row-property visual artifact contract missing document viewport metrics for ${viewportName}: ${JSON.stringify(viewport)}`);
  }
  const horizontalOverflowPx = Math.max(0, viewport.scrollWidth - viewport.width);
  if (horizontalOverflowPx > horizontalOverflowTolerancePx) {
    throw new Error(`Row-property visual artifact contract found horizontal overflow for ${viewportName}: ${JSON.stringify({
      horizontalOverflowPx,
      scrollWidth: viewport.scrollWidth,
      tolerance: horizontalOverflowTolerancePx,
      width: viewport.width
    })}`);
  }
  return {
    horizontalOverflowPx,
    scrollWidth: viewport.scrollWidth,
    width: viewport.width
  };
}

function viewportName(entry) {
  return viewportNameFromEntry(entry);
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
