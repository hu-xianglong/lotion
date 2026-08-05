import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "sidePeek", "centerPeek", "fullPage", "list", "gallery", "calendar",
  "kanban", "editShared", "focusRestored", "scrollPreserved",
  "selectionPreserved", "backClosesPeek", "reloadTransientClear",
  "deepLinkFullPage"
];

export async function assertDatabasePageOpenArtifactContract(summary, { expectedViewportNames = ["desktop", "compact"] } = {}) {
  if (summary?.status !== "passed") throw new Error("Database page-open smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database page-open evidence missing viewport: ${viewport}`);
    if (REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) throw new Error(`Database page-open interaction evidence incomplete for ${viewport}`);
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database page-open snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database page-open snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "center-peek") throw new Error(`Database page-open snapshot metadata mismatch for ${viewport}`);
    if (metadata.rect?.width !== metadata.viewport?.width || metadata.rect?.height !== metadata.viewport?.height) throw new Error(`Database page-open snapshot did not capture the real ${viewport} viewport.`);
    snapshots.push({ ...entry.snapshot, viewport, phase: "center-peek", imageBytes: image.size });
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
