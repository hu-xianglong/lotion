import { readFile, stat } from "node:fs/promises";

export async function assertDatabaseViewMenuArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database view-menu smoke must pass before its artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database view-menu evidence missing viewport: ${viewport}`);
    for (const key of ["inactiveRightClickIsolated", "uniqueRenameValidated", "renameEscapeStayedInMenu", "renamed", "duplicated", "defaultDeleteRecovered", "noHorizontalOverflow"]) {
      if (entry[key] !== true) throw new Error(`Database view-menu ${key} evidence missing for ${viewport}`);
    }
    const recovery = entry.actionRecovery;
    if (!recovery || !/Injected view menu failure/.test(recovery.message ?? "")) {
      throw new Error(`Database view-menu injected failure evidence missing for ${viewport}`);
    }
    for (const key of ["menuRemainedOpen", "duplicateSubmitSuppressed", "retryCreatedExactlyOne"]) {
      if (recovery[key] !== true) throw new Error(`Database view-menu recovery ${key} evidence missing for ${viewport}`);
    }
    if (!/^lotion:\/\/database\/.+\?view=/.test(entry.deepLink ?? "")) throw new Error(`Database view-menu deep-link evidence invalid for ${viewport}`);
    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Database view-menu snapshot missing for ${viewport}`);
    const image = await stat(snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database view-menu snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "view-menu-lifecycle") {
      throw new Error(`Database view-menu snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...snapshot, viewport, phase: "view-menu-lifecycle", imageBytes: image.size });
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
