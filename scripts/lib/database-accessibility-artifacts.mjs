import { readFile, stat } from "node:fs/promises";

const REQUIRED_FLAGS = [
  "keyboardMenus", "focusReturn", "layeredEscape", "singleMenuLayer",
  "overflowMenuKeyboard", "shortcuts", "sortAutoFocus", "viewFailureRecovery",
  "rowDeleteFailureRecovery", "rowUndoFailureRecovery", "dangerConfirmation",
  "screenReaderNames", "responsiveMenu", "noHorizontalOverflow"
];

export async function assertDatabaseAccessibilityArtifactContract(summary, { expectedViewportNames = ["desktop", "compact"] } = {}) {
  if (summary?.status !== "passed") throw new Error("Database accessibility smoke must pass before artifacts can be verified.");
  const entries = Array.isArray(summary.viewports) ? summary.viewports : [];
  const snapshots = [];
  for (const viewport of expectedViewportNames) {
    const entry = entries.find((candidate) => candidate.viewport === viewport);
    if (!entry) throw new Error(`Database accessibility evidence missing viewport: ${viewport}`);
    if (REQUIRED_FLAGS.some((flag) => entry[flag] !== true)) throw new Error(`Database accessibility interaction evidence incomplete for ${viewport}`);
    if (!entry.snapshot?.imagePath || !entry.snapshot?.metadataPath) throw new Error(`Database accessibility snapshot missing for ${viewport}`);
    const image = await stat(entry.snapshot.imagePath);
    if (image.size < 512) throw new Error(`Database accessibility snapshot is too small for ${viewport}`);
    const metadata = JSON.parse(await readFile(entry.snapshot.metadataPath, "utf8"));
    if (metadata.viewport?.name !== viewport || metadata.metadata?.phase !== "recoverable-errors") throw new Error(`Database accessibility snapshot metadata mismatch for ${viewport}`);
    if (metadata.rect?.left !== 0 || metadata.rect?.width !== metadata.viewport?.width || metadata.rect?.height !== metadata.viewport?.height) throw new Error(`Database accessibility snapshot did not capture the real, non-overflowing ${viewport} viewport.`);
    snapshots.push({ ...entry.snapshot, viewport, phase: "recoverable-errors", imageBytes: image.size });
  }
  return { status: "passed", expectedViewportNames, observedViewportNames: entries.map((entry) => entry.viewport), snapshotCount: snapshots.length, imageBytesTotal: snapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0), snapshots };
}
