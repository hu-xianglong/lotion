import { readFile, stat } from "node:fs/promises";

export async function assertPageSecondaryArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact", "laptop"],
  requiredPerceptualBaselineViewportNames = []
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Page secondary artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry?.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Page secondary artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  const tocCollapsedSnapshots = [];
  const tocSnapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Page secondary artifact contract missing entry for ${viewportName}`);
    assertPageSecondaryEvidence(entry, viewportName);
    snapshots.push(await assertPageSecondarySnapshot(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
    tocCollapsedSnapshots.push(await assertTocCollapsedSnapshot(entry, viewportName));
    tocSnapshots.push(await assertTocSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    perceptualBaselineCount: snapshots.filter((snapshot) => snapshot.perceptualBaseline?.status === "passed").length,
    snapshotCount: snapshots.length,
    snapshots,
    tocCollapsedSnapshotCount: tocCollapsedSnapshots.length,
    tocCollapsedSnapshots,
    tocSnapshotCount: tocSnapshots.length,
    tocSnapshots
  };
}

function assertPageSecondaryEvidence(entry, viewportName) {
  const collapsed = entry?.collapsed;
  const collapsedState = collapsed?.state || {};
  if (collapsedState.expanded !== "false" || !String(collapsedState.className || "").includes("collapsed")) {
    throw new Error(`Page secondary artifact contract missing collapsed panel state for ${viewportName}: ${JSON.stringify(collapsedState)}`);
  }
  if (collapsedState.contentVisibility !== "hidden" || Number(collapsedState.contentHeight) > 2) {
    throw new Error(`Page secondary artifact contract found leaked collapsed content for ${viewportName}: ${JSON.stringify(collapsedState)}`);
  }
  if (!isUsableRect(collapsed?.panelRect, { minWidth: 24, minHeight: 24 })) {
    throw new Error(`Page secondary artifact contract missing collapsed panel geometry for ${viewportName}: ${JSON.stringify(collapsed?.panelRect)}`);
  }

  const expanded = entry?.expanded || {};
  if (expanded.expanded !== "true" || !String(expanded.className || "").includes("expanded") || expanded.contentVisibility === "hidden") {
    throw new Error(`Page secondary artifact contract missing expanded panel state for ${viewportName}: ${JSON.stringify(expanded)}`);
  }
  if (expanded.sourceLinkMounted !== true) {
    throw new Error(`Page secondary artifact contract missing source link evidence for ${viewportName}: ${JSON.stringify(expanded)}`);
  }
  if (Number(expanded.backlinkItems) < 5) {
    throw new Error(`Page secondary artifact contract missing backlink evidence for ${viewportName}: ${JSON.stringify(expanded)}`);
  }

  if (entry.noHorizontalOverflow !== true) {
    throw new Error(`Page secondary artifact contract missing no-overflow evidence for ${viewportName}`);
  }
  if (entry.editor?.persisted !== true || !entry.editor?.marker) {
    throw new Error(`Page secondary artifact contract missing collapsed-editor typing persistence for ${viewportName}: ${JSON.stringify(entry.editor)}`);
  }
  const coverRecovery = entry.coverOffsetRecovery;
  if (
    !String(coverRecovery?.message || "").includes("Injected cover position persistence failure")
    || coverRecovery.failedValueRolledBack !== true
    || coverRecovery.retainedDraft !== true
    || coverRecovery.competingControlsBlocked !== true
    || coverRecovery.duplicateRetrySuppressed !== true
    || coverRecovery.retryPersistedExactInput !== true
    || coverRecovery.discardPreservedStoredValue !== true
    || coverRecovery.discardResetDraft !== true
    || coverRecovery.discardedDraftDiffered !== true
    || coverRecovery.baselineCoverCleared !== true
    || Math.abs(Number(coverRecovery.baselineOffset) - 50) >= 0.01
    || coverRecovery.baselineStateRestored !== true
  ) {
    throw new Error(`Page secondary artifact contract missing cover-offset recovery for ${viewportName}: ${JSON.stringify(coverRecovery)}`);
  }
  const recovery = entry.pagePropertyRecovery;
  if (
    !String(recovery?.message || "").includes("Injected page property persistence failure")
    || recovery.failedValueRolledBack !== true
    || recovery.draftRetained !== true
    || recovery.competingControlsBlocked !== true
    || recovery.duplicateRetrySuppressed !== true
    || recovery.retryPersistedExactInput !== true
    || recovery.discardPreservedStoredValue !== true
    || recovery.discardResetDraft !== true
    || recovery.baselineStateRestored !== true
  ) {
    throw new Error(`Page secondary artifact contract missing page-property recovery for ${viewportName}: ${JSON.stringify(recovery)}`);
  }
  const titleRecovery = entry.pageTitleRecovery;
  if (
    !String(titleRecovery?.message || "").includes("Injected page title persistence failure")
    || titleRecovery.failedMetadataRolledBack !== true
    || titleRecovery.failedMarkdownRolledBack !== true
    || titleRecovery.draftRetained !== true
    || titleRecovery.competingControlsBlocked !== true
    || titleRecovery.duplicateRetrySuppressed !== true
    || titleRecovery.retryPersistedExactInput !== true
    || titleRecovery.discardPreservedStoredTitle !== true
    || titleRecovery.discardResetDraft !== true
    || titleRecovery.baselineStateRestored !== true
  ) {
    throw new Error(`Page secondary artifact contract missing page-title recovery for ${viewportName}: ${JSON.stringify(titleRecovery)}`);
  }
  assertHistoryEvidence(entry, viewportName);

  const toc = entry.toc || {};
  assertAutoHiddenTocState(toc.collapsed, viewportName, "default state");
  assertExpandedTocState(toc.hoverExpanded, viewportName, "hover state");
  assertExpandedTocState(toc.pointerNavigation, viewportName, "pointer-navigation state");
  assertKeyboardOwnedTocState(toc.keyboardAfterPointer, viewportName, "pointer-to-keyboard TOC ownership state");
  assertAutoHiddenTocState(toc.autoHidden, viewportName, "pointer-navigation exit state");
  assertExpandedTocState(toc.focusExpanded, viewportName, "focus state");
  assertAutoHiddenTocState(toc.escaped, viewportName, "Escape state");
  if (toc.hoverExpanded?.hovered !== true) {
    throw new Error(`Page secondary artifact contract missing TOC hover expansion for ${viewportName}: ${JSON.stringify(toc.hoverExpanded)}`);
  }
  if (toc.focusExpanded?.focusedWithin !== true || toc.focusExpanded?.activeIsToggle !== true) {
    throw new Error(`Page secondary artifact contract missing TOC focus expansion for ${viewportName}: ${JSON.stringify(toc.focusExpanded)}`);
  }
  if (toc.pointerNavigation?.focusedWithin !== true || toc.pointerNavigation?.activeIsTocItem !== true) {
    throw new Error(`Page secondary artifact contract missing pointer-owned TOC focus for ${viewportName}: ${JSON.stringify(toc.pointerNavigation)}`);
  }
  const itemTexts = Array.isArray(toc.expanded?.itemTexts) ? toc.expanded.itemTexts : [];
  if (
    itemTexts.length < 5 ||
    !itemTexts.includes("Nested Insight") ||
    !itemTexts.includes("Work reflectionJump") ||
    itemTexts.some((text) => String(text).includes("[[") || String(text).includes("https://"))
  ) {
    throw new Error(`Page secondary artifact contract missing expanded TOC heading evidence for ${viewportName}: ${JSON.stringify(toc.expanded)}`);
  }
  const navigation = toc.navigation || {};
  if (
    navigation.activeInEditor !== false ||
    navigation.activeIsTocItem !== true ||
    navigation.headingIsActiveLine !== false ||
    /^#{1,6}\s/.test(String(navigation.headingText || ""))
  ) {
    throw new Error(`Page secondary artifact contract missing source-safe TOC navigation for ${viewportName}: ${JSON.stringify(navigation)}`);
  }
  const layout = toc.layout || {};
  if (
    !["auto", "scroll"].includes(layout.navOverflowY) ||
    layout.layoutStable !== true ||
    layout.hostPosition !== "fixed" ||
    (Number(layout.viewportWidth) <= 1120 && /rgba?\([^)]*,\s*0(?:\.0+)?\)$/.test(String(layout.backgroundColor || "")))
  ) {
    throw new Error(`Page secondary artifact contract missing reflow-free TOC layout for ${viewportName}: ${JSON.stringify(layout)}`);
  }
}

async function assertPageSecondarySnapshot(entry, viewportName, {
  requirePerceptualBaseline = false
} = {}) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Page secondary artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Page secondary artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Page secondary artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "page-history-restore-preview") {
    throw new Error(`Page secondary artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (payload.collapsed?.state?.expanded !== "false") {
    throw new Error(`Page secondary artifact contract snapshot missing collapsed evidence for ${viewportName}: ${JSON.stringify(payload.collapsed)}`);
  }
  if (payload.expanded?.expanded !== "true" || payload.expanded?.sourceLinkMounted !== true) {
    throw new Error(`Page secondary artifact contract snapshot missing expanded source-link evidence for ${viewportName}: ${JSON.stringify(payload.expanded)}`);
  }
  if (Number(payload.expanded?.backlinkItems) < Number(payload.expectedBacklinks || 1)) {
    throw new Error(`Page secondary artifact contract snapshot missing backlink count evidence for ${viewportName}: ${JSON.stringify(payload.expanded)}`);
  }
  assertHistoryVisibleState(payload.history, viewportName, "snapshot");

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
    backlinkItems: payload.expanded.backlinkItems,
    expectedTocItems: payload.expectedTocItems,
    historyVersionCount: payload.history.versionCount,
    historyDiffLineCount: payload.history.diffLineCount,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

async function assertTocSnapshot(entry, viewportName) {
  const snapshot = entry?.toc?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Page secondary artifact contract missing TOC snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Page secondary artifact contract found empty TOC snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Page secondary artifact contract TOC viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "floating-toc-navigation") {
    throw new Error(`Page secondary artifact contract TOC phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (
    payload.navigation?.activeInEditor !== false ||
    payload.navigation?.activeIsTocItem !== true ||
    payload.navigation?.headingIsActiveLine !== false ||
    /^#{1,6}\s/.test(String(payload.navigation?.headingText || ""))
  ) {
    throw new Error(`Page secondary artifact contract TOC snapshot exposes heading source for ${viewportName}: ${JSON.stringify(payload.navigation)}`);
  }
  if (
    !["auto", "scroll"].includes(payload.layout?.navOverflowY) ||
    payload.layout?.layoutStable !== true ||
    payload.layout?.hostPosition !== "fixed"
  ) {
    throw new Error(`Page secondary artifact contract TOC snapshot changed document layout for ${viewportName}: ${JSON.stringify(payload.layout)}`);
  }
  const itemTexts = Array.isArray(payload.itemTexts) ? payload.itemTexts : [];
  if (
    !itemTexts.includes("Nested Insight") ||
    !itemTexts.includes("Work reflectionJump") ||
    itemTexts.some((text) => String(text).includes("[[") || String(text).includes("https://"))
  ) {
    throw new Error(`Page secondary artifact contract TOC snapshot leaks raw heading markup for ${viewportName}: ${JSON.stringify(itemTexts)}`);
  }

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: snapshot.height,
    width: snapshot.width
  };
}

async function assertTocCollapsedSnapshot(entry, viewportName) {
  const snapshot = entry?.toc?.collapsedSnapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Page secondary artifact contract missing auto-hidden TOC snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Page secondary artifact contract found empty auto-hidden TOC snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Page secondary artifact contract auto-hidden TOC viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "floating-toc-auto-hidden") {
    throw new Error(`Page secondary artifact contract auto-hidden TOC phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertExpandedTocState(payload.hoverExpanded, viewportName, "snapshot hover state");
  assertExpandedTocState(payload.pointerNavigation, viewportName, "snapshot pointer-navigation state");
  assertKeyboardOwnedTocState(payload.keyboardAfterPointer, viewportName, "snapshot pointer-to-keyboard TOC ownership state");
  assertAutoHiddenTocState(payload.autoHidden, viewportName, "snapshot pointer-navigation exit state");

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    height: snapshot.height,
    width: snapshot.width
  };
}

function assertAutoHiddenTocState(state, viewportName, phase) {
  if (
    !String(state?.hostClass || "").includes("cm-md-toc-collapsed") ||
    state?.toggleExpanded !== "false" ||
    state?.navDisplay !== "none" ||
    Number(state?.hostRect?.width) > 36 ||
    Number(state?.hostOpacity) < 0.2 ||
    Number(state?.hostOpacity) > 0.5 ||
    Number(state?.hostBackgroundAlpha) > 0.05 ||
    state?.focusedWithin !== false ||
    state?.activeIsTocItem !== false ||
    Number(state?.railMarkers) < 1
  ) {
    throw new Error(`Page secondary artifact contract missing auto-hidden TOC ${phase} for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

function assertExpandedTocState(state, viewportName, phase) {
  if (
    !String(state?.hostClass || "").includes("cm-md-toc-expanded") ||
    state?.toggleExpanded !== "true" ||
    state?.navDisplay === "none" ||
    Number(state?.hostRect?.width) < 200 ||
    Number(state?.hostOpacity) < 0.95 ||
    Number(state?.hostBackgroundAlpha) < 0.82 ||
    Number(state?.hostBackgroundAlpha) > 0.95
  ) {
    throw new Error(`Page secondary artifact contract missing expanded TOC ${phase} for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

function assertKeyboardOwnedTocState(state, viewportName, phase) {
  assertExpandedTocState(state, viewportName, phase);
  if (
    state?.focusedWithin !== true ||
    state?.activeIsTocItem !== true ||
    state?.hovered !== false
  ) {
    throw new Error(`Page secondary artifact contract missing ${phase} for ${viewportName}: ${JSON.stringify(state)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Page secondary artifact contract missing committed history baseline for ${viewportName}`);
    return null;
  }
  if (baseline.kind !== "lotion-png-visual-diff" || baseline.status !== "passed") {
    throw new Error(`Page secondary artifact contract history baseline did not pass for ${viewportName}: ${JSON.stringify({ kind: baseline.kind, status: baseline.status })}`);
  }
  if (baseline.actualPath !== snapshot.imagePath) {
    throw new Error(`Page secondary artifact contract history baseline actual path mismatch for ${viewportName}: ${baseline.actualPath}`);
  }
  if (!baseline.dimensionsMatch || baseline.diffPixels > baseline.maxDiffPixels || baseline.diffRatio > baseline.maxDiffRatio) {
    throw new Error(`Page secondary artifact contract history baseline exceeded tolerance for ${viewportName}: ${JSON.stringify({ dimensionsMatch: baseline.dimensionsMatch, diffPixels: baseline.diffPixels, diffRatio: baseline.diffRatio })}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path) throw new Error(`Page secondary artifact contract missing history ${label} path for ${viewportName}`);
    const info = await stat(path);
    if (info.size <= 0) throw new Error(`Page secondary artifact contract found empty history ${label} artifact for ${viewportName}: ${path}`);
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.expectedPath !== baseline.expectedPath || diffMetadata.actualPath !== baseline.actualPath) {
    throw new Error(`Page secondary artifact contract history diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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

function assertHistoryEvidence(entry, viewportName) {
  const preview = entry.historyPreview || {};
  if (
    preview.status !== "Ready" ||
    preview.versionCount !== 2 ||
    preview.selectedVersionCount !== 1 ||
    preview.restoreButtonText !== "Restore" ||
    preview.diffLineCount < 2 ||
    !String(preview.previewLabel || "").startsWith("Page snapshot · ") ||
    (preview.storageLeakMatches || []).length > 0
  ) {
    throw new Error(`Page secondary artifact contract missing safe history preview for ${viewportName}: ${JSON.stringify(preview)}`);
  }
  assertHistoryVisibleState(entry.history, viewportName, "interaction");
  const restore = entry.restore || {};
  if (
    restore.persisted !== true ||
    restore.previewCleared !== true ||
    restore.message !== "Page restored from local Git history." ||
    !restore.restoredMarker ||
    !String(restore.confirmation || "").includes("Restore ")
  ) {
    throw new Error(`Page secondary artifact contract missing restore evidence for ${viewportName}: ${JSON.stringify(restore)}`);
  }
}

function assertHistoryVisibleState(state, viewportName, phase) {
  for (const key of ["panel", "statusRect", "previewRect", "previewLabelRect", "restoreButtonRect"]) {
    const rect = state?.[key];
    if (!rect || Number(rect.width) <= 0 || Number(rect.height) <= 0) {
      throw new Error(`Page secondary artifact contract missing ${phase} ${key} geometry for ${viewportName}: ${JSON.stringify(rect)}`);
    }
  }
  if (
    state.status !== "Ready" ||
    state.versionCount !== 2 ||
    state.selectedVersionCount !== 1 ||
    state.restoreButtonText !== "Restore" ||
    state.diffLineCount < 2 ||
    state.addedLineCount < 1 ||
    state.removedLineCount < 1 ||
    state.statusInsidePanel !== true ||
    state.versionsInsidePanel !== true ||
    state.previewInsidePanel !== true ||
    state.previewLabelInsidePreview !== true ||
    state.restoreInsidePreview !== true ||
    Number(state.horizontalOverflow) > 1 ||
    state.secondaryExpanded !== true ||
    state.contentVisibility !== "visible" ||
    Number(state.contentOpacity) < 0.99
  ) {
    throw new Error(`Page secondary artifact contract found clipped history ${phase} for ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (!String(state.previewLabel || "").startsWith("Page snapshot · ")) {
    throw new Error(`Page secondary artifact contract missing logical history identity for ${viewportName}: ${JSON.stringify(state.previewLabel)}`);
  }
  const leaks = Array.isArray(state.storageLeakMatches) ? state.storageLeakMatches : [];
  if (leaks.length > 0) {
    throw new Error(`Page secondary artifact contract found storage identity leaks for ${viewportName}: ${JSON.stringify(leaks)}`);
  }
  const excerpts = Array.isArray(state.backlinkExcerpts) ? state.backlinkExcerpts : [];
  if (excerpts.length < 5 || excerpts.some((excerpt) => /(?:databases|pages)\/|--(?:db|pg|row)_|\.md\b/i.test(excerpt))) {
    throw new Error(`Page secondary artifact contract found unsafe backlink excerpts for ${viewportName}: ${JSON.stringify(excerpts)}`);
  }
}

function isUsableRect(rect, { minWidth = 220, minHeight = 80 } = {}) {
  return rect && Number(rect.width) >= minWidth && Number(rect.height) >= minHeight;
}
