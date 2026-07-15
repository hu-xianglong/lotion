import { readFile, stat } from "node:fs/promises";

export async function assertPageSecondaryArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact", "laptop"]
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
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Page secondary artifact contract missing entry for ${viewportName}`);
    assertPageSecondaryEvidence(entry, viewportName);
    snapshots.push(await assertPageSecondarySnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
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

  const toc = entry.toc || {};
  if (!String(toc.collapsed?.hostClass || "").includes("cm-md-toc-collapsed") || toc.collapsed?.toggleExpanded !== "false") {
    throw new Error(`Page secondary artifact contract missing collapsed TOC evidence for ${viewportName}: ${JSON.stringify(toc.collapsed)}`);
  }
  if (toc.collapsed?.navDisplay !== "none") {
    throw new Error(`Page secondary artifact contract found visible collapsed TOC nav for ${viewportName}: ${JSON.stringify(toc.collapsed)}`);
  }
  const itemTexts = Array.isArray(toc.expanded?.itemTexts) ? toc.expanded.itemTexts : [];
  if (itemTexts.length < 4 || !itemTexts.includes("Nested Insight")) {
    throw new Error(`Page secondary artifact contract missing expanded TOC heading evidence for ${viewportName}: ${JSON.stringify(toc.expanded)}`);
  }
}

async function assertPageSecondarySnapshot(entry, viewportName) {
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
  if (payload.phase !== "page-secondary") {
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

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    backlinkItems: payload.expanded.backlinkItems,
    expectedTocItems: payload.expectedTocItems
  };
}

function isUsableRect(rect, { minWidth = 220, minHeight = 80 } = {}) {
  return rect && Number(rect.width) >= minWidth && Number(rect.height) >= minHeight;
}
