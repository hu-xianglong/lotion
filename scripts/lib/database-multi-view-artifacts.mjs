import { readFile, stat } from "node:fs/promises";

export async function assertDatabaseMultiViewArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database multi-view smoke must pass before its artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database multi-view evidence missing viewport: ${viewport}`);
    if (entry.viewCount < 10 || entry.orderPersisted !== true || entry.keyboardFocusFollowed !== true || entry.sidebarViewsVerified !== true) {
      throw new Error(`Database multi-view interaction evidence incomplete for ${viewport}`);
    }
    const recovery = entry.createViewFailureRecovery;
    if (
      !recovery?.message?.includes("Injected create view failure")
      || recovery.dialogRemainedOpen !== true
      || recovery.duplicateSubmitSuppressed !== true
      || recovery.retryCreatedExactlyOne !== true
    ) {
      throw new Error(`Database create-view failure recovery evidence incomplete for ${viewport}`);
    }
    const reorderRecovery = entry.viewOrderFailureRecovery;
    if (
      !reorderRecovery?.message?.includes("Injected view reorder failure")
      || reorderRecovery.controlsBlockedUntilResolution !== true
      || reorderRecovery.rollbackPreservedOrder !== true
      || reorderRecovery.rollbackPreservedRevisions !== true
      || reorderRecovery.duplicateDropSuppressed !== true
      || reorderRecovery.retryPersistedExactlyOnce !== true
    ) {
      throw new Error(`Database view-order failure recovery evidence incomplete for ${viewport}`);
    }
    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Database multi-view snapshot missing for ${viewport}`);
    const image = await stat(snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database multi-view snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "multi-view-overflow") {
      throw new Error(`Database multi-view snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...snapshot, viewport, phase: "multi-view-overflow", imageBytes: image.size });
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
