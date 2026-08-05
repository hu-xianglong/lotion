import { readFile, stat } from "node:fs/promises";

export async function assertDatabaseSettingsMenuArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database settings menu requires passed smoke status.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database settings menu missing viewport: ${viewport}`);
    for (const key of ["keyboardNavigation", "outsideDismissal", "scopeLabelsVerified", "pageOpenModePersisted", "noHorizontalOverflow"]) {
      if (entry[key] !== true) throw new Error(`Database settings menu ${key} evidence missing for ${viewport}`);
    }
    if (entry.escapeLevels !== 2) throw new Error(`Database settings menu Escape evidence invalid for ${viewport}`);
    if (entry.sheetFallback !== (viewport === "compact")) throw new Error(`Database settings menu sheet evidence invalid for ${viewport}`);
    const recovery = entry.actionRecovery;
    if (!recovery || !/Injected database settings failure/.test(recovery.message ?? "")) {
      throw new Error(`Database settings menu injected failure evidence missing for ${viewport}`);
    }
    for (const key of ["menuRemainedOpen", "duplicateSubmitSuppressed", "failedStateRolledBack", "retryLockedExactlyOnce"]) {
      if (recovery[key] !== true) throw new Error(`Database settings menu recovery ${key} evidence missing for ${viewport}`);
    }
    if (viewport === "desktop" && !/system database/i.test(entry.systemDisabledReason ?? "")) {
      throw new Error("Database settings menu system database disabled reason is missing.");
    }
    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) throw new Error(`Database settings menu snapshot missing for ${viewport}`);
    const image = await stat(snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database settings menu snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "view-settings-menu") {
      throw new Error(`Database settings menu snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...snapshot, viewport, phase: "view-settings-menu", imageBytes: image.size });
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
