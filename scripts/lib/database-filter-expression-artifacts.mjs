import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "nestedExpression", "selectEditor", "multiSelectEditor", "checkboxEditor",
  "numberEditor", "relativeDateEditor", "textEditor", "invalidBlocked",
  "depthLimit", "filterChips", "explicitRemoval", "clearAll", "reloaded",
  "noHorizontalOverflow"
];

export async function assertDatabaseFilterExpressionArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") throw new Error("Database filter expression smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database filter expression evidence missing viewport: ${viewport}`);
    if (entry.resultCount !== 2 || REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) {
      throw new Error(`Database filter expression interaction evidence incomplete for ${viewport}`);
    }
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database filter expression snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database filter expression snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "nested-filter-reload") {
      throw new Error(`Database filter expression snapshot metadata mismatch for ${viewport}`);
    }
    snapshots.push({ ...entry.snapshot, viewport, phase: "nested-filter-reload", imageBytes: image.size });
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
