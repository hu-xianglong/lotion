import { readFile, stat } from "node:fs/promises";

const REQUIRED_SOURCE_LINK_FIELDS = ["Original Notion HTML", "Original Notion CSV"];

export async function assertRowPageNavigationArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  maxOpenMs = Number(summary?.thresholdMs ?? 1500)
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Row-page navigation artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map(viewportNameFromEntry).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Row-page navigation artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Row-page navigation artifact contract missing entry for ${viewportName}`);
    assertNavigationEvidence(entry, viewportName, maxOpenMs);
    snapshots.push(await assertPropertySnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertNavigationEvidence(entry, viewportName, maxOpenMs) {
  if (!Number.isFinite(entry.openMs) || entry.openMs <= 0 || entry.openMs > maxOpenMs) {
    throw new Error(`Row-page navigation artifact contract invalid open timing for ${viewportName}: ${entry.openMs}`);
  }
  if (!entry.activeTabText || entry.activeTabText.includes(entry.rowId || "row_")) {
    throw new Error(`Row-page navigation artifact contract active tab leaked an id or title is missing for ${viewportName}: ${JSON.stringify({
      activeTabText: entry.activeTabText,
      rowId: entry.rowId
    })}`);
  }
  if (entry.directCellEdit?.fieldId !== "notes" || !entry.directCellEdit?.value) {
    throw new Error(`Row-page navigation artifact contract missing direct table edit evidence for ${viewportName}: ${JSON.stringify(entry.directCellEdit)}`);
  }
  if (entry.dateEdit?.raw !== "2026-02-14" || !String(entry.dateEdit?.display || "").includes("2026")) {
    throw new Error(`Row-page navigation artifact contract missing persisted date edit evidence for ${viewportName}: ${JSON.stringify(entry.dateEdit)}`);
  }
  if (!entry.entityRefOpened?.titleInput || !entry.entityRefOpened?.activeTabText) {
    throw new Error(`Row-page navigation artifact contract missing entity-ref navigation evidence for ${viewportName}: ${JSON.stringify(entry.entityRefOpened)}`);
  }
  if (!entry.propertyFocusGeometry?.statusSearch?.focus?.containsActive) {
    throw new Error(`Row-page navigation artifact contract missing option-search focus evidence for ${viewportName}`);
  }
  if (!Array.isArray(entry.propertyFocusGeometry?.sourceLinks) || entry.propertyFocusGeometry.sourceLinks.length !== REQUIRED_SOURCE_LINK_FIELDS.length) {
    throw new Error(`Row-page navigation artifact contract missing source-link focus evidence for ${viewportName}`);
  }
  assertSourceOpenEvidence(entry, viewportName);
}

function assertSourceOpenEvidence(entry, viewportName) {
  if (!Array.isArray(entry.sourceLinks) || entry.sourceLinks.length !== REQUIRED_SOURCE_LINK_FIELDS.length) {
    throw new Error(`Row-page navigation artifact contract missing source-link open results for ${viewportName}: ${JSON.stringify(entry.sourceLinks)}`);
  }
  for (const fieldName of REQUIRED_SOURCE_LINK_FIELDS) {
    const source = entry.sourceLinks.find((candidate) => candidate.fieldName === fieldName);
    if (!source) {
      throw new Error(`Row-page navigation artifact contract missing source-link result ${fieldName} for ${viewportName}`);
    }
    if (!source.info?.rowClass?.includes("read-only") || !source.info?.rowClass?.includes("source-link-property")) {
      throw new Error(`Row-page navigation artifact contract source-link row lost read-only/source class for ${viewportName}: ${JSON.stringify(source.info)}`);
    }
    if (!Array.isArray(source.opened) || !source.opened.includes(source.info.linkTitle)) {
      throw new Error(`Row-page navigation artifact contract missing opened request for ${fieldName} in ${viewportName}: ${JSON.stringify(source)}`);
    }
  }
}

async function assertPropertySnapshot(entry, viewportName) {
  const visual = entry.propertyVisuals;
  const snapshot = visual?.snapshot;
  const baseline = visual?.snapshotBaseline;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Row-page navigation artifact contract missing property snapshot paths for ${viewportName}`);
  }
  if (!baseline?.imageBytes || baseline.imageBytes <= 0) {
    throw new Error(`Row-page navigation artifact contract missing non-empty snapshot baseline for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Row-page navigation artifact contract found empty property snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Row-page navigation artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.databaseId !== entry.databaseId || payload.rowId !== entry.rowId || payload.rowTitle !== "Row Page Navigation Row") {
    throw new Error(`Row-page navigation artifact contract snapshot identity mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (!Array.isArray(payload.visibleRows) || payload.visibleRows.length < 10) {
    throw new Error(`Row-page navigation artifact contract missing visible row metadata for ${viewportName}: ${JSON.stringify(payload.visibleRows)}`);
  }
  if (!Number.isFinite(payload.sourceLinkWidth) || payload.sourceLinkWidth < 200) {
    throw new Error(`Row-page navigation artifact contract source-link width regressed for ${viewportName}: ${payload.sourceLinkWidth}`);
  }
  if (!Number.isFinite(payload.tagPillHeight) || payload.tagPillHeight < 18) {
    throw new Error(`Row-page navigation artifact contract tag pill height regressed for ${viewportName}: ${payload.tagPillHeight}`);
  }

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    openMs: entry.openMs,
    sourceLinkCount: entry.sourceLinks.length,
    visibleRowCount: payload.visibleRows.length,
    rowPageFile: String(entry.rowPageFile || "")
  };
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
