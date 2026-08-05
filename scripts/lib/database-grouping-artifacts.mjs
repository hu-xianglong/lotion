import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "groupedTable", "subgroupedTable", "subgroupLocalNew", "groupedList",
  "subgroupedList", "kanbanShared", "kanbanLocalNew", "collapsedReloaded"
];

export async function assertDatabaseGroupingArtifactContract(summary) {
  if (summary?.status !== "passed") throw new Error("Database grouping smoke must pass before artifacts can be verified.");
  if (REQUIRED_FLAGS.some((flag) => summary[flag] !== true)) throw new Error("Database grouping interaction evidence is incomplete.");
  const recovery = summary.saveRecovery;
  if (
    !recovery
    || !String(recovery.message || "").includes("Injected grouping save failure")
    || recovery.dialogRemainedOpen !== true
    || recovery.duplicateSubmitSuppressed !== true
    || recovery.failedStateRolledBack !== true
    || recovery.draftRetained !== true
    || recovery.retryPersistedExactlyOnce !== true
  ) {
    throw new Error("Database grouping save recovery evidence is incomplete.");
  }
  const rowCreation = summary.rowCreationRecovery;
  if (
    !rowCreation
    || !String(rowCreation.message || "").includes("Injected grouped row creation failure")
    || rowCreation.failedStateRolledBack !== true
    || rowCreation.duplicateSubmitSuppressed !== true
    || rowCreation.competingControlsBlocked !== true
    || rowCreation.retryPersistedExactlyOnce !== true
    || rowCreation.initialValuesAtomic !== true
  ) {
    throw new Error("Database grouped-row creation recovery evidence is incomplete.");
  }
  const expected = [
    { snapshot: summary.tableSnapshot, viewport: "desktop", phase: "grouped-table" },
    { snapshot: summary.compactSnapshot, viewport: "compact", phase: "shared-kanban" }
  ];
  const snapshots = [];
  for (const item of expected) {
    if (!item.snapshot?.imagePath || !item.snapshot?.metadataPath) throw new Error(`Database grouping snapshot missing for ${item.viewport}`);
    const image = await stat(item.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database grouping snapshot is too small for ${item.viewport}`);
    const metadata = JSON.parse(await readFile(item.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== item.viewport || metadata.metadata?.phase !== item.phase) throw new Error(`Database grouping snapshot metadata mismatch for ${item.viewport}`);
    if (metadata.rect?.width !== metadata.viewport?.width || metadata.rect?.height !== metadata.viewport?.height) throw new Error(`Database grouping snapshot did not capture the real ${item.viewport} viewport.`);
    snapshots.push({ ...item.snapshot, viewport: item.viewport, phase: item.phase, imageBytes: image.size });
  }
  return {
    status: "passed",
    expectedViewportNames: expected.map((item) => item.viewport),
    observedViewportNames: (summary.viewports ?? []).map((viewport) => viewport.name),
    snapshotCount: snapshots.length,
    imageBytesTotal: snapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0),
    snapshots
  };
}
