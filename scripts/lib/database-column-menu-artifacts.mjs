import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "keyboardNavigation", "editOpened", "renamed", "sortTargeted", "filterTargeted",
  "calculationSet", "wrapToggled", "hiddenInView", "duplicateReloaded", "insertedBothSides",
  "frozenDuringScroll", "unfreezePersisted", "deleteRecoverable", "protectedTitle",
  "resizeIsolation", "dragIsolation", "reloadPersisted", "noHorizontalOverflow"
];

export async function assertDatabaseColumnMenuArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database column menu smoke must pass before its artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database column menu evidence missing viewport: ${viewport}`);
    if (entry.menuActions < 13 || entry.frozenBodyCells < 2 || REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) {
      throw new Error(`Database column menu interaction evidence incomplete for ${viewport}`);
    }
    const recovery = entry.actionRecovery;
    if (
      !recovery
      || !String(recovery.message || "").includes("Injected column menu failure")
      || recovery.menuRemainedOpen !== true
      || recovery.duplicateSubmitSuppressed !== true
      || recovery.failedStateRolledBack !== true
      || recovery.retryCreatedExactlyOnce !== true
    ) {
      throw new Error(`Database column menu recovery evidence incomplete for ${viewport}`);
    }
    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Database column menu snapshot missing for ${viewport}`);
    const image = await stat(snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database column menu snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "frozen-column-menu") {
      throw new Error(`Database column menu snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...snapshot, viewport, phase: "frozen-column-menu", imageBytes: image.size });
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
