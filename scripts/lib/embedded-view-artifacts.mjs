import { readFile, stat } from "node:fs/promises";

const REQUIRED_COLUMN_ORDER = ["Name", "Notes", "Score"];

export async function assertEmbeddedViewArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  minTotalRows = 120
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Embedded view artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const results = Array.isArray(summary?.results) ? summary.results : [];
  const observedViewportNames = [...new Set(results.map((entry) => entry.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Embedded view artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = results.find((candidate) => candidate.viewport === viewportName && candidate.visualSnapshot);
    if (!entry) {
      throw new Error(`Embedded view artifact contract missing table snapshot for ${viewportName}`);
    }
    assertEmbeddedResult(entry, viewportName, minTotalRows);
    const snapshot = await assertEmbeddedSnapshot(entry, viewportName);
    snapshots.push(snapshot);
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertEmbeddedResult(entry, viewportName, minTotalRows) {
  if (!Number.isFinite(entry.renderMs) || entry.renderMs <= 0) {
    throw new Error(`Embedded view artifact contract missing render timing for ${viewportName}: ${JSON.stringify(entry.renderMs)}`);
  }
  if (!Number.isFinite(entry.embeddedViews) || entry.rendered < entry.embeddedViews) {
    throw new Error(`Embedded view artifact contract rendered view count mismatch for ${viewportName}: ${JSON.stringify(entry)}`);
  }
  if (JSON.stringify(entry.columnOrder) !== JSON.stringify(REQUIRED_COLUMN_ORDER)) {
    throw new Error(`Embedded view artifact contract column order mismatch for ${viewportName}: ${JSON.stringify(entry.columnOrder)}`);
  }
  assertHeaderActions(entry.headerActions, viewportName);
  const pagination = entry.pagination;
  if (!pagination || pagination.defaultShown !== 20 || pagination.configuredShown !== 50 || pagination.loadMoreShown !== 100 || pagination.persistedPageSize !== 50) {
    throw new Error(`Embedded view artifact contract pagination mismatch for ${viewportName}: ${JSON.stringify(pagination)}`);
  }
  if (pagination.totalRows < minTotalRows) {
    throw new Error(`Embedded view artifact contract expected at least ${minTotalRows} rows for ${viewportName}: ${pagination.totalRows}`);
  }
  assertLoadMoreAffordance(pagination.loadMoreAffordance, viewportName);
}

function assertHeaderActions(headerActions, viewportName) {
  if (!headerActions || typeof headerActions !== "object") {
    throw new Error(`Embedded view artifact contract missing header action evidence for ${viewportName}`);
  }
  if (headerActions.title !== "Embedded DB 1" || !String(headerActions.subtitle || "").includes("All")) {
    throw new Error(`Embedded view artifact contract header title/subtitle mismatch for ${viewportName}: ${JSON.stringify(headerActions)}`);
  }
  if (!Number.isFinite(headerActions.actionCount) || headerActions.actionCount < 3) {
    throw new Error(`Embedded view artifact contract expected Open/Refresh/Settings actions for ${viewportName}: ${JSON.stringify(headerActions)}`);
  }
  for (const [label, action] of [
    ["Open", headerActions.openButton],
    ["Refresh", headerActions.refreshButton],
    ["Settings", headerActions.settingsButton]
  ]) {
    if (!action || action.height < 28 || action.width < 28) {
      throw new Error(`Embedded view artifact contract weak ${label} action for ${viewportName}: ${JSON.stringify(action)}`);
    }
  }
  if (!headerActions.settingsFocused) {
    throw new Error(`Embedded view artifact contract Settings action was not focusable for ${viewportName}`);
  }
  if (headerActions.refreshAfter?.disabled) {
    throw new Error(`Embedded view artifact contract Refresh action stayed disabled for ${viewportName}: ${JSON.stringify(headerActions.refreshAfter)}`);
  }
  if (!headerActions.settingsDialog?.hasRowsPerPage) {
    throw new Error(`Embedded view artifact contract Settings did not expose view settings for ${viewportName}: ${JSON.stringify(headerActions.settingsDialog)}`);
  }
  if (!headerActions.openResult?.hasStandaloneDatabase || !headerActions.openResult?.textIncludesTitle) {
    throw new Error(`Embedded view artifact contract Open action did not navigate for ${viewportName}: ${JSON.stringify(headerActions.openResult)}`);
  }
  const buttons = Array.isArray(headerActions.buttons) ? headerActions.buttons : [];
  if (buttons.length < 3 || buttons.some((button) => !button.visible || button.type !== "button")) {
    throw new Error(`Embedded view artifact contract header buttons lost semantics for ${viewportName}: ${JSON.stringify(buttons)}`);
  }
}

function assertLoadMoreAffordance(affordance, viewportName) {
  if (!affordance || affordance.iconText !== "+") {
    throw new Error(`Embedded view artifact contract missing plus marker for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  if (!/load\s+50\s+more|加载\s*50\s*行/i.test(affordance.buttonText || "")) {
    throw new Error(`Embedded view artifact contract missing strong load-more label for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  if (!/\d/.test(affordance.rowCountText || "")) {
    throw new Error(`Embedded view artifact contract missing secondary row count for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  if (!Number.isFinite(affordance.horizontalGap) || affordance.horizontalGap < 4) {
    throw new Error(`Embedded view artifact contract load-more row count overlaps button for ${viewportName}: ${JSON.stringify(affordance)}`);
  }
  const metrics = affordance.buttonMetrics || {};
  if (metrics.tagName !== "button" || metrics.type !== "button" || metrics.cursor !== "pointer") {
    throw new Error(`Embedded view artifact contract load-more lost button semantics for ${viewportName}: ${JSON.stringify(metrics)}`);
  }
}

async function assertEmbeddedSnapshot(entry, viewportName) {
  const snapshot = entry.visualSnapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Embedded view artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Embedded view artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const metadataPayload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Embedded view artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (metadataPayload.phase !== "embedded-table") {
    throw new Error(`Embedded view artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
  }
  if (metadataPayload.embeddedViews !== entry.embeddedViews || metadataPayload.rowsPerDatabase !== entry.rowsPerDatabase) {
    throw new Error(`Embedded view artifact contract snapshot metadata mismatch for ${viewportName}: ${JSON.stringify(metadataPayload)}`);
  }
  if (JSON.stringify(metadataPayload.columnOrder) !== JSON.stringify(REQUIRED_COLUMN_ORDER)) {
    throw new Error(`Embedded view artifact contract snapshot column order mismatch for ${viewportName}: ${JSON.stringify(metadataPayload.columnOrder)}`);
  }
  if (!metadataPayload.pagination || metadataPayload.pagination.loadMoreShown !== 100) {
    throw new Error(`Embedded view artifact contract snapshot pagination missing load-more state for ${viewportName}: ${JSON.stringify(metadataPayload.pagination)}`);
  }

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    columnOrder: metadataPayload.columnOrder,
    headerActionCount: entry.headerActions?.actionCount ?? 0,
    headerTitle: entry.headerActions?.title ?? "",
    loadMoreShown: metadataPayload.pagination.loadMoreShown,
    rowCountText: metadataPayload.pagination.loadMoreAffordance?.rowCountText ?? ""
  };
}
