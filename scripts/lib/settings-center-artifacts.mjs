import { readFile, stat } from "node:fs/promises";

const REQUIRED_CATEGORIES = [
  "General",
  "Appearance",
  "Search & AI",
  "Shortcuts",
  "Plugins",
  "Git Sync / Backup",
  "Import",
  "Advanced / Developer"
];

export async function assertSettingsCenterArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  requiredPerceptualBaselineViewportNames = ["desktop", "compact", "wide"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Settings center artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => entry.viewport).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Settings center artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Settings center artifact contract missing entry for ${viewportName}`);
    assertSettingsViewport(entry, viewportName);
    snapshots.push(await assertSettingsSnapshot(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    perceptualBaselineCount: snapshots.filter((snapshot) => snapshot.perceptualBaseline?.status === "passed").length,
    snapshots
  };
}

function assertSettingsViewport(entry, viewportName) {
  const categories = Array.isArray(entry.initial?.categories) ? entry.initial.categories : [];
  const missingCategories = REQUIRED_CATEGORIES.filter((category) => !categories.includes(category));
  if (missingCategories.length > 0) {
    throw new Error(`Settings center artifact contract missing category/categories for ${viewportName}: ${missingCategories.join(", ")}`);
  }
  if (!String(entry.initial?.activeText || "").includes("General")) {
    throw new Error(`Settings center artifact contract did not open General first for ${viewportName}: ${JSON.stringify(entry.initial)}`);
  }
  const searchJumpText = String(entry.searchJump?.paneText || "");
  if (!searchJumpText.includes("Git Sync") || !searchJumpText.includes("GitHub Backup")) {
    throw new Error(`Settings center artifact contract missing Git search jump evidence for ${viewportName}: ${JSON.stringify(entry.searchJump)}`);
  }
  if (!Number.isFinite(entry.searchAiDeepLink?.pluginHosts) || entry.searchAiDeepLink.pluginHosts < 2) {
    throw new Error(`Settings center artifact contract missing Search & AI plugin hosts for ${viewportName}: ${JSON.stringify(entry.searchAiDeepLink)}`);
  }
  const advancedTabClick = entry.searchAiDeepLink?.advancedTabClick;
  if (
    advancedTabClick?.ariaSelectedAfter !== "true"
    || advancedTabClick?.disabled !== false
    || advancedTabClick?.width <= 0
    || advancedTabClick?.height <= 0
  ) {
    throw new Error(`Settings center artifact contract missing visible Advanced tab click evidence for ${viewportName}: ${JSON.stringify(advancedTabClick)}`);
  }
  if (!String(entry.importSection?.paneText || "").includes("Latest import report")) {
    throw new Error(`Settings center artifact contract missing Import settings evidence for ${viewportName}: ${JSON.stringify(entry.importSection)}`);
  }
  if (!String(entry.pluginsSection?.paneText || "").includes("Installed plugins")) {
    throw new Error(`Settings center artifact contract missing Plugins settings evidence for ${viewportName}: ${JSON.stringify(entry.pluginsSection)}`);
  }
  assertSnapshotState(entry.snapshotState, viewportName);
}

async function assertSettingsSnapshot(entry, viewportName, {
  requirePerceptualBaseline = false
} = {}) {
  const snapshot = entry.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Settings center artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Settings center artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Settings center artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (!Array.isArray(payload.initial?.categories) || payload.initial.categories.length < REQUIRED_CATEGORIES.length) {
    throw new Error(`Settings center artifact contract snapshot missing categories for ${viewportName}: ${JSON.stringify(payload.initial)}`);
  }
  if ((payload.searchAiDeepLink?.pluginHosts ?? 0) < 2) {
    throw new Error(`Settings center artifact contract snapshot missing Search & AI plugin host metadata for ${viewportName}: ${JSON.stringify(payload.searchAiDeepLink)}`);
  }
  assertSnapshotState(payload.snapshotState, viewportName);
  const perceptualBaseline = await assertPerceptualBaseline(entry.perceptualBaseline, snapshot, viewportName, {
    required: requirePerceptualBaseline
  });
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    ...(perceptualBaseline ? { perceptualBaseline } : {}),
    categoryCount: payload.initial.categories.length,
    searchAiPluginHosts: payload.searchAiDeepLink.pluginHosts,
    snapshotState: payload.snapshotState
  };
}

function assertSnapshotState(state, viewportName) {
  if (
    state?.activeTab !== "PluginsExtensions"
    || state?.activeTabAriaSelected !== "true"
    || state?.focusedInside !== false
    || state?.lastPluginRowWithinCenter !== true
    || state?.navigationScrollTop !== 0
    || state?.paneScrollTop !== 0
    || state?.paneVisible !== true
    || state?.pluginRowCount < 7
    || state?.visiblePluginRowCount !== state?.pluginRowCount
  ) {
    throw new Error(`Settings center artifact contract final snapshot state is unstable for ${viewportName}: ${JSON.stringify(state)}`);
  }
  const style = state.activeTabStyle || {};
  if (
    style.backgroundColor !== "rgb(232, 237, 248)"
    || style.borderColor !== "rgb(80, 103, 165)"
    || style.color !== "rgb(32, 34, 31)"
  ) {
    throw new Error(`Settings center artifact contract active Plugins tab transition is unsettled for ${viewportName}: ${JSON.stringify(style)}`);
  }
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Settings center artifact contract missing committed perceptual baseline for ${viewportName}`);
    return null;
  }
  if (baseline.kind !== "lotion-png-visual-diff" || baseline.status !== "passed") {
    throw new Error(`Settings center artifact contract perceptual baseline did not pass for ${viewportName}: ${JSON.stringify({ kind: baseline.kind, status: baseline.status })}`);
  }
  if (baseline.actualPath !== snapshot.imagePath) {
    throw new Error(`Settings center artifact contract perceptual baseline actual path mismatch for ${viewportName}: ${baseline.actualPath}`);
  }
  if (!baseline.dimensionsMatch || baseline.diffPixels > baseline.maxDiffPixels || baseline.diffRatio > baseline.maxDiffRatio) {
    throw new Error(`Settings center artifact contract perceptual baseline exceeded tolerance for ${viewportName}: ${JSON.stringify({ dimensionsMatch: baseline.dimensionsMatch, diffPixels: baseline.diffPixels, diffRatio: baseline.diffRatio })}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path) throw new Error(`Settings center artifact contract missing perceptual ${label} path for ${viewportName}`);
    const info = await stat(path);
    if (info.size <= 0) throw new Error(`Settings center artifact contract found empty perceptual ${label} artifact for ${viewportName}: ${path}`);
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.expectedPath !== baseline.expectedPath || diffMetadata.actualPath !== baseline.actualPath) {
    throw new Error(`Settings center artifact contract perceptual metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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

export function requiredSettingsCenterCategories() {
  return [...REQUIRED_CATEGORIES];
}
