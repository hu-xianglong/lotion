import { readFile, stat } from "node:fs/promises";

export async function assertDatabasePropertyManagerArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database property manager smoke must pass before its artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database property manager evidence missing viewport: ${viewport}`);
    if (entry.search !== true || entry.currentVisibility !== true || entry.allVisibility !== true || entry.hiddenVisibility !== true || entry.reordered !== true || entry.focusedEditor !== true || entry.noHorizontalOverflow !== true) {
      throw new Error(`Database property manager interaction evidence incomplete for ${viewport}`);
    }
    const recovery = entry.mutationRecovery;
    if (
      !recovery?.message?.includes("Injected property manager failure")
      || recovery.dialogRemainedOpen !== true
      || recovery.duplicateSubmitSuppressed !== true
      || recovery.retryCreatedExactlyOne !== true
    ) {
      throw new Error(`Database property manager mutation recovery evidence incomplete for ${viewport}`);
    }
    assertFieldSettingsRecoveryEvidence(entry.fieldSettingsRecovery, viewport);
    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Database property manager snapshot missing for ${viewport}`);
    const image = await stat(snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database property manager snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "property-manager") {
      throw new Error(`Database property manager snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...snapshot, viewport, phase: "property-manager", imageBytes: image.size });
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

export function assertFieldSettingsRecoveryEvidence(recovery, viewport = "unknown") {
  if (
    !recovery?.message?.includes("Injected field settings persistence failure")
    || recovery.dialogRemainedOpen !== true
    || recovery.failedMutationRolledBack !== true
    || recovery.draftRetained !== true
    || recovery.duplicateSubmitSuppressed !== true
    || recovery.pendingDismissalBlocked !== true
    || recovery.retryDismissalBlocked !== true
    || recovery.retryCommittedExactlyOnce !== true
    || recovery.competingHideSuppressed !== true
  ) {
    throw new Error(`Database field settings recovery evidence incomplete for ${viewport}`);
  }
  return recovery;
}
