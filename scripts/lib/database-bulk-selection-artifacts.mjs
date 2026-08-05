import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "atomicEdit", "modifierToggle", "escapeClear", "viewScopeClear", "typedEditors",
  "duplicate", "duplicateBody", "duplicateMetadata", "recoverableDelete",
  "ghostPageRemoved", "restoredBody", "restoredMetadata", "noHorizontalOverflow"
];

export async function assertDatabaseBulkSelectionArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database bulk selection smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database bulk selection evidence missing viewport: ${viewport}`);
    if (!(entry.virtualRange > 100) || REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) throw new Error(`Database bulk selection interaction evidence incomplete for ${viewport}`);
    const recovery = entry.mutationRecovery;
    if (
      !recovery?.message?.includes("Injected bulk row persistence failure")
      || recovery.selectionRetained !== true
      || recovery.failedMutationRolledBack !== true
      || recovery.duplicateSubmitSuppressed !== true
      || recovery.retryCreatedExactlyOnce !== true
    ) {
      throw new Error(`Database bulk row mutation recovery evidence incomplete for ${viewport}`);
    }
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database bulk selection snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database bulk selection snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "bulk-deleted") throw new Error(`Database bulk selection snapshot metadata mismatch for ${viewport}`);
    snapshots.push({ ...entry.snapshot, viewport, phase: "bulk-deleted", imageBytes: image.size });
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
