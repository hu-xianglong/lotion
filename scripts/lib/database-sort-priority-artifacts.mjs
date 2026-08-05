import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "typeLabels", "keyboardPriority", "dragPriority", "moveControls",
  "priorityChips", "duplicatePrevented", "clearAll", "reloaded",
  "optionOrderChangedResults", "optionOrderPreservedCells", "noHorizontalOverflow"
];

export async function assertDatabaseSortPriorityArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database sort priority smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database sort priority evidence missing viewport: ${viewport}`);
    if (REQUIRED_FLAGS.some((flag) => entry[flag] !== true) || entry.before?.join(",") !== "row_task_2,row_task_1,row_task_3,row_task_4" || entry.after?.join(",") !== "row_task_4,row_task_3,row_task_2,row_task_1") {
      throw new Error(`Database sort priority interaction evidence incomplete for ${viewport}`);
    }
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database sort priority snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database sort priority snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "reloaded-sort-priority") throw new Error(`Database sort priority snapshot metadata mismatch for ${viewport}`);
    snapshots.push({ ...entry.snapshot, viewport, phase: "reloaded-sort-priority", imageBytes: image.size });
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
