import { readFile, stat } from "node:fs/promises";

const REQUIRED_PROPERTY_ROWS = [
  "Original Notion HTML",
  "Original Notion CSV",
  "Notes",
  "Empty text",
  "Status",
  "Tags",
  "Done",
  "Blocked",
  "Due date",
  "Empty date",
  "Score",
  "Related"
];

const REQUIRED_SOURCE_ROWS = ["Original Notion HTML", "Original Notion CSV"];

export async function assertRowPagePropertyVisualArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  horizontalOverflowTolerancePx = 2,
  minRowCount = REQUIRED_PROPERTY_ROWS.length
} = {}) {
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => viewportName(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Row-property visual artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    const visual = entry?.propertyVisuals;
    if (!visual) {
      throw new Error(`Row-property visual artifact contract missing propertyVisuals for ${viewportName}`);
    }
    if (visual.rowCount < minRowCount) {
      throw new Error(`Row-property visual artifact contract row count too small for ${viewportName}: ${visual.rowCount}`);
    }
    if (!Number.isFinite(visual.valueColumnLeft) || visual.valueColumnLeft <= 0) {
      throw new Error(`Row-property visual artifact contract missing value column metric for ${viewportName}`);
    }
    if (!Array.isArray(visual.focus) || visual.focus.length < 4) {
      throw new Error(`Row-property visual artifact contract missing focus summaries for ${viewportName}`);
    }
    if (!Array.isArray(visual.sourceOpen) || visual.sourceOpen.length !== REQUIRED_SOURCE_ROWS.length) {
      throw new Error(`Row-property visual artifact contract missing source-open captures for ${viewportName}`);
    }
    const overflow = assertDocumentViewportMetrics(visual.viewport, {
      horizontalOverflowTolerancePx,
      viewportName
    });

    const snapshot = visual.snapshot;
    const baseline = visual.snapshotBaseline;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) {
      throw new Error(`Row-property visual artifact contract missing snapshot paths for ${viewportName}`);
    }
    if (!baseline?.imageBytes || baseline.imageBytes <= 0) {
      throw new Error(`Row-property visual artifact contract missing baseline image bytes for ${viewportName}`);
    }

    const imageInfo = await stat(snapshot.imagePath);
    if (imageInfo.size <= 0) {
      throw new Error(`Row-property visual artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
    }
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const metadataPayload = metadata.metadata || {};
    if (metadata.viewport?.name !== viewportName) {
      throw new Error(`Row-property visual artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
    }
    for (const rowName of REQUIRED_SOURCE_ROWS) {
      if (!Array.isArray(metadataPayload.sourceRows) || !metadataPayload.sourceRows.includes(rowName)) {
        throw new Error(`Row-property visual artifact contract missing source row ${rowName} for ${viewportName}`);
      }
    }
    for (const rowName of REQUIRED_PROPERTY_ROWS) {
      if (!Array.isArray(metadataPayload.visibleRows) || !metadataPayload.visibleRows.includes(rowName)) {
        throw new Error(`Row-property visual artifact contract missing visible row ${rowName} for ${viewportName}`);
      }
    }
    if (!Number.isFinite(metadataPayload.valueColumnLeft) || metadataPayload.valueColumnLeft <= 0) {
      throw new Error(`Row-property visual artifact contract missing metadata value column for ${viewportName}`);
    }

    snapshots.push({
      viewport: viewportName,
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      imageBytes: imageInfo.size,
      rowCount: visual.rowCount,
      horizontalOverflowPx: overflow.horizontalOverflowPx,
      scrollWidth: overflow.scrollWidth,
      valueColumnLeft: visual.valueColumnLeft,
      sourceRows: metadataPayload.sourceRows,
      viewportWidth: overflow.width,
      visibleRowCount: metadataPayload.visibleRows.length
    });
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertDocumentViewportMetrics(viewport, { horizontalOverflowTolerancePx, viewportName }) {
  if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.scrollWidth)) {
    throw new Error(`Row-property visual artifact contract missing document viewport metrics for ${viewportName}: ${JSON.stringify(viewport)}`);
  }
  const horizontalOverflowPx = Math.max(0, viewport.scrollWidth - viewport.width);
  if (horizontalOverflowPx > horizontalOverflowTolerancePx) {
    throw new Error(`Row-property visual artifact contract found horizontal overflow for ${viewportName}: ${JSON.stringify({
      horizontalOverflowPx,
      scrollWidth: viewport.scrollWidth,
      tolerance: horizontalOverflowTolerancePx,
      width: viewport.width
    })}`);
  }
  return {
    horizontalOverflowPx,
    scrollWidth: viewport.scrollWidth,
    width: viewport.width
  };
}

function viewportName(entry) {
  return viewportNameFromEntry(entry);
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
