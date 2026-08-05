import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = ["backendStructuralBlocked", "systemLockBlocked", "rowCellEditable", "rowCreateEditable", "rowPageEditable", "persistedAfterReload", "fullViewLocked", "embeddedViewLocked", "embeddedRowEditable", "embeddedUnlock"];

export async function assertDatabaseLockArtifactContract(summary, { expectedViewportNames = ["desktop", "compact"] } = {}) {
  if (summary?.status !== "passed") throw new Error("Database lock smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database lock evidence missing viewport: ${viewport}`);
    if (REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) throw new Error(`Database lock interaction evidence incomplete for ${viewport}`);
    if (!entry.lockedReason || !/locked/i.test(entry.lockedReason)) throw new Error(`Database lock disabled reason missing for ${viewport}`);
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database lock snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database lock snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "locked-embedded") throw new Error(`Database lock snapshot metadata mismatch for ${viewport}`);
    if (metadata.rect?.width !== metadata.viewport?.width || metadata.rect?.height !== metadata.viewport?.height) throw new Error(`Database lock snapshot did not capture the real ${viewport} viewport.`);
    snapshots.push({ ...entry.snapshot, viewport, phase: "locked-embedded", imageBytes: image.size });
  }
  return { status: "passed", expectedViewportNames, observedViewportNames: entries.map((entry) => entry.viewport), snapshotCount: snapshots.length, imageBytesTotal: snapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0), snapshots };
}
