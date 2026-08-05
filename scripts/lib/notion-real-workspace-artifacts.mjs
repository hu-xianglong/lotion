import { readFile, stat } from "node:fs/promises";

const WORKSPACE_NAME = "Notion Import";
const NATIVE_VISION_TITLE = "2022敦促爸妈视力检查";
const SEEDED_TOGGLE_TITLE = "2022 爸妈视力检查";
const SEEDED_PROVENANCE = "clone-seeded-exact-importer-regression";

export async function assertNotionRealWorkspaceArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  minSourceFiles = 10_000,
  minSourceBytes = 1_000_000_000,
  maxOpenMs = 20_000
} = {}) {
  if (summary?.status !== "passed") throw new Error(`Notion real-workspace contract requires passed status, saw ${summary?.status ?? "missing"}`);
  if (summary.sourceIdentity?.workspaceName !== WORKSPACE_NAME || summary.sourceIdentity?.directoryName !== WORKSPACE_NAME) {
    throw new Error(`Notion real-workspace source identity mismatch: ${JSON.stringify(summary.sourceIdentity)}`);
  }
  if ("sourceRoot" in summary || "sourcePath" in (summary.sourceIdentity || {})) {
    throw new Error("Notion real-workspace contract must not expose the original workspace path.");
  }
  assertFingerprint(summary.sourceFingerprint, { minSourceBytes, minSourceFiles });
  assertFingerprint(summary.cloneFingerprint, { minSourceBytes, minSourceFiles });
  if (summary.sourceFingerprint.sha256 !== summary.cloneFingerprint.sha256) {
    throw new Error("Notion real-workspace clone fingerprint does not match source.");
  }
  if (summary.isolation?.symlinksAllowed !== false || summary.isolation?.byteIdenticalAtClone !== true) {
    throw new Error(`Notion real-workspace clone isolation is weak: ${JSON.stringify(summary.isolation)}`);
  }
  if (summary.sourceSafety?.unchanged !== true || summary.sourceSafety?.before?.sha256 !== summary.sourceSafety?.after?.sha256) {
    throw new Error(`Notion real-workspace source changed: ${JSON.stringify(summary.sourceSafety)}`);
  }
  if (
    summary.staleSource?.toggleTargetMissing !== true ||
    summary.staleSource?.nativeVisionTitle !== NATIVE_VISION_TITLE ||
    summary.seededRegression?.title !== SEEDED_TOGGLE_TITLE ||
    summary.seededRegression?.provenance !== SEEDED_PROVENANCE ||
    summary.seededRegression?.seededInClone !== true
  ) {
    throw new Error(`Notion real-workspace stale/seed provenance is incomplete: ${JSON.stringify({ staleSource: summary.staleSource, seededRegression: summary.seededRegression })}`);
  }

  const viewports = Array.isArray(summary.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) throw new Error(`Notion real-workspace contract missing viewport(s): ${missing.join(", ")}`);

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry?.activeWorkspaceWasClone || entry.workspaceName !== WORKSPACE_NAME) {
      throw new Error(`Notion real-workspace did not open the isolated clone for ${viewportName}: ${JSON.stringify(entry)}`);
    }
    assertNativeVision(entry.nativeVision, viewportName, maxOpenMs);
    assertSeededToggle(entry.seededToggle, viewportName, maxOpenMs);
    assertImportModal(entry.importModal, viewportName);
    snapshots.push(
      await assertSnapshot(entry.nativeVision.snapshot, viewportName, "native-vision", entry.nativeVision),
      await assertSnapshot(entry.seededToggle.snapshot, viewportName, "seeded-toggle-media", entry.seededToggle),
      await assertSnapshot(entry.importModal.snapshot, viewportName, "import-modal", entry.importModal)
    );
  }

  return {
    status: "passed",
    reproduceCommand: "npm run smoke:real-notion-import-ui",
    workspaceName: WORKSPACE_NAME,
    sourceFingerprint: summary.sourceFingerprint,
    sourceUnchanged: true,
    staleToggleTargetMissing: true,
    seededToggleProvenance: SEEDED_PROVENANCE,
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}
function assertFingerprint(fingerprint, { minSourceBytes, minSourceFiles }) {
  if (fingerprint?.kind !== "lotion-real-workspace-fingerprint" || fingerprint.workspaceName !== WORKSPACE_NAME) {
    throw new Error(`Invalid Notion real-workspace fingerprint: ${JSON.stringify(fingerprint)}`);
  }
  if (!Number.isInteger(fingerprint.fileCount) || fingerprint.fileCount < minSourceFiles) {
    throw new Error(`Notion real-workspace fingerprint has too few files: ${fingerprint.fileCount}`);
  }
  if (!Number.isInteger(fingerprint.totalBytes) || fingerprint.totalBytes < minSourceBytes) {
    throw new Error(`Notion real-workspace fingerprint has too few bytes: ${fingerprint.totalBytes}`);
  }
  if (!/^[a-f0-9]{64}$/.test(fingerprint.sha256 || "")) throw new Error("Notion real-workspace fingerprint is missing SHA-256 evidence.");
}

function assertNativeVision(state, viewportName, maxOpenMs) {
  if (
    state?.title !== NATIVE_VISION_TITLE ||
    state?.provenance !== "native-real-workspace" ||
    state?.statusText !== "状态: 完成" ||
    state?.logHeadingVisible !== true
  ) {
    throw new Error(`Notion real-workspace native Chinese page evidence is incomplete for ${viewportName}: ${JSON.stringify(state)}`);
  }
  assertLatency(state.openMs, maxOpenMs, `native Chinese page ${viewportName}`);
  if (state.documentHorizontalOverflowPx !== 0) {
    throw new Error(`Notion real-workspace native Chinese page overflowed for ${viewportName}: ${state.documentHorizontalOverflowPx}px`);
  }
}

function assertSeededToggle(state, viewportName, maxOpenMs) {
  if (
    state?.title !== SEEDED_TOGGLE_TITLE ||
    state?.provenance !== SEEDED_PROVENANCE ||
    state?.summary !== "收据" ||
    !String(state.bodyText || "").includes("在美团上买了视力检查") ||
    state?.toggleCount < 1 ||
    state?.loadedImageCount < 1 ||
    state?.summaryEditable !== true ||
    state?.collapsed !== true ||
    state?.reexpanded !== true ||
    state?.postToggleLogVisible !== true
  ) {
    throw new Error(`Notion real-workspace seeded toggle/media evidence is incomplete for ${viewportName}: ${JSON.stringify(state)}`);
  }
  assertLatency(state.openMs, maxOpenMs, `seeded toggle page ${viewportName}`);
  if (state.documentHorizontalOverflowPx !== 0) {
    throw new Error(`Notion real-workspace seeded toggle page overflowed for ${viewportName}: ${state.documentHorizontalOverflowPx}px`);
  }
}

function assertImportModal(state, viewportName) {
  const overlay = state?.overlay || {};
  if (
    state?.provenance !== "native-real-workspace-plugin" ||
    overlay.title !== "Import from Notion" ||
    overlay.modalRole !== "dialog" ||
    overlay.ariaModal !== "true" ||
    overlay.backdropCoversViewport !== true ||
    overlay.centerInsideModal !== true ||
    overlay.modalContainsPageTitle !== false
  ) {
    throw new Error(`Notion real-workspace import modal evidence is incomplete for ${viewportName}: ${JSON.stringify(state)}`);
  }
  if (state.documentHorizontalOverflowPx !== 0) {
    throw new Error(`Notion real-workspace import modal overflowed for ${viewportName}: ${state.documentHorizontalOverflowPx}px`);
  }
}

function assertLatency(value, max, label) {
  if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Notion real-workspace ${label} latency exceeded: ${value}ms`);
}

async function assertSnapshot(snapshot, viewportName, phase, state) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Notion real-workspace missing ${phase} snapshot paths for ${viewportName}`);
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) throw new Error(`Notion real-workspace found empty ${phase} screenshot for ${viewportName}`);
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  if (metadata.viewport?.name !== viewportName || metadata.metadata?.phase !== phase) {
    throw new Error(`Notion real-workspace ${phase} metadata mismatch for ${viewportName}: ${JSON.stringify(metadata)}`);
  }
  return {
    viewport: viewportName,
    phase,
    provenance: state.provenance,
    title: state.title,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    openMs: state.openMs,
    documentHorizontalOverflowPx: state.documentHorizontalOverflowPx,
    ...(phase === "seeded-toggle-media" ? {
      toggleSummary: state.summary,
      toggleCount: state.toggleCount,
      loadedImageCount: state.loadedImageCount,
      collapsed: state.collapsed,
      reexpanded: state.reexpanded
    } : {}),
    ...(phase === "import-modal" ? { overlay: state.overlay } : {})
  };
}
