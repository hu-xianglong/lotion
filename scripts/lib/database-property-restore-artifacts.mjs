import { readFile, stat } from "node:fs/promises";

export async function assertDatabasePropertyRestoreArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database property restore smoke must pass before its artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database property restore evidence missing viewport: ${viewport}`);
    if (entry.tombstoneReloaded !== true || entry.valueRestored !== true || entry.positionRestored !== true || entry.viewStateRestored !== true || entry.dependencyProtected !== true || entry.permanentDeleteConfirmed !== true || entry.permanentDeleted !== true || entry.systemProtected !== true || entry.noHorizontalOverflow !== true) {
      throw new Error(`Database property restore interaction evidence incomplete for ${viewport}`);
    }
    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Database property restore snapshot missing for ${viewport}`);
    const image = await stat(snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database property restore snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "deleted-property") {
      throw new Error(`Database property restore snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...snapshot, viewport, phase: "deleted-property", imageBytes: image.size });
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
