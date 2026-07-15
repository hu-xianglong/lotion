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
  expectedViewportNames = ["desktop", "compact"]
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
    snapshots.push(await assertSettingsSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
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
  if (!String(entry.importSection?.paneText || "").includes("Latest import report")) {
    throw new Error(`Settings center artifact contract missing Import settings evidence for ${viewportName}: ${JSON.stringify(entry.importSection)}`);
  }
  if (!String(entry.pluginsSection?.paneText || "").includes("Installed plugins")) {
    throw new Error(`Settings center artifact contract missing Plugins settings evidence for ${viewportName}: ${JSON.stringify(entry.pluginsSection)}`);
  }
}

async function assertSettingsSnapshot(entry, viewportName) {
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
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    categoryCount: payload.initial.categories.length,
    searchAiPluginHosts: payload.searchAiDeepLink.pluginHosts
  };
}

export function requiredSettingsCenterCategories() {
  return [...REQUIRED_CATEGORIES];
}
