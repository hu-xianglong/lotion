import { readFile, stat } from "node:fs/promises";

const REQUIRED_PHASES = ["page", "search", "database", "plugin"];
const REQUIRED_TOKENS = ["paper", "sand", "vellum", "kraft", "shell", "rule", "ruleStrong", "accent"];

export async function assertWhiteThemeArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  requiredPerceptualBaselineViewportNames = ["desktop", "compact", "wide"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`White theme artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => entry.viewport).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`White theme artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`White theme artifact contract missing entry for ${viewportName}`);
    assertWhiteThemeViewport(entry, viewportName);
    for (const phase of REQUIRED_PHASES) {
      snapshots.push(await assertWhiteThemeSnapshot(entry, viewportName, phase, {
        requirePerceptualBaseline: phase === "page"
          && requiredPerceptualBaselineViewportNames.includes(viewportName)
      }));
    }
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

function assertWhiteThemeViewport(entry, viewportName) {
  const snapshots = Array.isArray(entry.snapshots) ? entry.snapshots : [];
  const phases = snapshots.map((snapshot) => snapshot?.phase).filter(Boolean);
  const missingPhases = REQUIRED_PHASES.filter((phase) => !phases.includes(phase));
  if (missingPhases.length > 0) {
    throw new Error(`White theme artifact contract missing phase(s) for ${viewportName}: ${missingPhases.join(", ")}`);
  }

  assertThemeState(entry.pageState, viewportName, "page");
  if (
    entry.pageState?.scrollState?.scrollTop?.[".main-content"] !== 0
    || entry.pageState?.scrollState?.scrollTop?.[".page-editor"] !== 0
  ) {
    throw new Error(`White theme artifact contract page scroll is unstable for ${viewportName}: ${JSON.stringify(entry.pageState?.scrollState)}`);
  }
  if (entry.pageState?.scrollState?.floatingToc?.collapsed !== true) {
    throw new Error(`White theme artifact contract floating TOC is unstable for ${viewportName}: ${JSON.stringify(entry.pageState?.scrollState?.floatingToc)}`);
  }
  assertThemeState(entry.searchState, viewportName, "search");
  assertThemeState(entry.databaseState, viewportName, "database");
  assertThemeState(entry.pluginState, viewportName, "plugin");
  if (entry.searchState?.focusState?.isInput !== true) {
    throw new Error(`White theme artifact contract missing search input focus evidence for ${viewportName}: ${JSON.stringify(entry.searchState?.focusState)}`);
  }
}

function assertThemeState(state, viewportName, phase) {
  if (!state || typeof state !== "object") {
    throw new Error(`White theme artifact contract missing ${phase} theme state for ${viewportName}`);
  }
  const tokens = state.tokens || {};
  const missingTokens = REQUIRED_TOKENS.filter((token) => !tokens[token]);
  if (missingTokens.length > 0) {
    throw new Error(`White theme artifact contract missing token(s) for ${phase} ${viewportName}: ${missingTokens.join(", ")}`);
  }
  const surfaces = state.surfaces || {};
  if (Object.keys(surfaces).filter((key) => surfaces[key]).length === 0) {
    throw new Error(`White theme artifact contract missing surface evidence for ${phase} ${viewportName}`);
  }
}

async function assertWhiteThemeSnapshot(entry, viewportName, phase, {
  requirePerceptualBaseline = false
} = {}) {
  const snapshot = entry.snapshots.find((candidate) => candidate?.phase === phase);
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`White theme artifact contract missing ${phase} snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`White theme artifact contract found empty ${phase} snapshot image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`White theme artifact contract ${phase} viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (metadata.metadata?.phase !== phase) {
    throw new Error(`White theme artifact contract ${phase} metadata mismatch for ${viewportName}: ${JSON.stringify(metadata.metadata)}`);
  }
  const perceptualBaseline = await assertPerceptualBaseline(snapshot.perceptualBaseline, snapshot, viewportName, phase, {
    required: requirePerceptualBaseline
  });
  return {
    viewport: viewportName,
    phase,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    ...(perceptualBaseline ? { perceptualBaseline } : {}),
    tokenCount: REQUIRED_TOKENS.length,
    surfaceCount: surfaceCountForSnapshot(snapshot)
  };
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, phase, { required }) {
  if (!baseline) {
    if (required) throw new Error(`White theme artifact contract missing committed page perceptual baseline for ${viewportName}`);
    return null;
  }
  if (phase !== "page") {
    throw new Error(`White theme artifact contract only accepts perceptual evidence for the page phase, saw ${phase} ${viewportName}`);
  }
  if (baseline.kind !== "lotion-png-visual-diff" || baseline.status !== "passed") {
    throw new Error(`White theme artifact contract page perceptual baseline did not pass for ${viewportName}: ${JSON.stringify({ kind: baseline.kind, status: baseline.status })}`);
  }
  if (baseline.actualPath !== snapshot.imagePath) {
    throw new Error(`White theme artifact contract page perceptual baseline actual path mismatch for ${viewportName}: ${baseline.actualPath}`);
  }
  if (!baseline.dimensionsMatch || baseline.diffPixels > baseline.maxDiffPixels || baseline.diffRatio > baseline.maxDiffRatio) {
    throw new Error(`White theme artifact contract page perceptual baseline exceeded tolerance for ${viewportName}: ${JSON.stringify({ dimensionsMatch: baseline.dimensionsMatch, diffPixels: baseline.diffPixels, diffRatio: baseline.diffRatio })}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path) throw new Error(`White theme artifact contract missing page perceptual ${label} path for ${viewportName}`);
    const info = await stat(path);
    if (info.size <= 0) throw new Error(`White theme artifact contract found empty page perceptual ${label} artifact for ${viewportName}: ${path}`);
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.expectedPath !== baseline.expectedPath || diffMetadata.actualPath !== baseline.actualPath) {
    throw new Error(`White theme artifact contract page perceptual metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
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

function surfaceCountForSnapshot(snapshot) {
  const state = snapshot.state || {};
  const surfaces = state.surfaces || {};
  return Object.keys(surfaces).filter((key) => surfaces[key]).length;
}

export function requiredWhiteThemePhases() {
  return [...REQUIRED_PHASES];
}
