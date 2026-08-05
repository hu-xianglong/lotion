import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "keyboardMenu", "rightClickIsolated", "copyLink", "rename", "editProperties",
  "crossView", "focusHandles", "duplicateBody", "duplicateMetadata",
  "duplicateIndependent", "tombstoneReloaded", "ghostPageRemoved", "restoredBody",
  "restoredMetadata", "permanentDelete", "noHorizontalOverflow"
];

export async function assertDatabaseRowMenuArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database row menu smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database row menu evidence missing viewport: ${viewport}`);
    if (entry.menuActions !== 7 || REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) throw new Error(`Database row menu interaction evidence incomplete for ${viewport}`);
    const menuRecovery = entry.menuRecovery;
    if (
      !menuRecovery
      || !String(menuRecovery.message || "").includes("Injected row menu duplicate failure")
      || menuRecovery.menuRemainedOpen !== true
      || menuRecovery.duplicateSubmitSuppressed !== true
      || menuRecovery.failedStateRolledBack !== true
      || menuRecovery.retryCreatedExactlyOnce !== true
    ) {
      throw new Error(`Database row menu action recovery evidence incomplete for ${viewport}`);
    }
    const recovery = entry.restoreRecovery;
    if (
      !recovery
      || !String(recovery.message || "").includes("Injected deleted row restore failure")
      || recovery.dialogRemainedOpen !== true
      || recovery.duplicateSubmitSuppressed !== true
      || recovery.failedStateRolledBack !== true
      || recovery.tombstoneRetained !== true
      || recovery.retryRestoredExactlyOnce !== true
    ) {
      throw new Error(`Database row restore recovery evidence incomplete for ${viewport}`);
    }
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database row menu snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database row menu snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "deleted-row") throw new Error(`Database row menu snapshot metadata mismatch for ${viewport}`);
    snapshots.push({ ...entry.snapshot, viewport, phase: "deleted-row", imageBytes: image.size });
  }
  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames: entries.map((entry) => entry.viewport),
    snapshotCount: snapshots.length,
    imageBytesTotal: snapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0),
    snapshots
  };
}
