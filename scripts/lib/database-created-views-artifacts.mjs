import { readFile, stat } from "node:fs/promises";

const REQUIRED_VIEW_TABS = ["All", "Created date asc", "Created date desc"];
const CREATED_ASC_VIEW_ID = "view_created_time_asc";
const CREATED_DESC_VIEW_ID = "view_created_time_desc";

export async function assertDatabaseCreatedViewsArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Database created views artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry?.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Database created views artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Database created views artifact contract missing entry for ${viewportName}`);
    assertCreatedViewsEvidence(entry, viewportName);
    snapshots.push(await assertCreatedViewsSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertCreatedViewsEvidence(entry, viewportName) {
  const generatedIds = Array.isArray(entry.generatedViewIds) ? entry.generatedViewIds : [];
  if (!generatedIds.includes(CREATED_ASC_VIEW_ID) || !generatedIds.includes(CREATED_DESC_VIEW_ID)) {
    throw new Error(`Database created views artifact contract missing generated view ids for ${viewportName}: ${JSON.stringify(generatedIds)}`);
  }
  if (entry.generatedViewCountAfterReload !== 2) {
    throw new Error(`Database created views artifact contract expected idempotent generated views for ${viewportName}: ${JSON.stringify(entry.generatedViewCountAfterReload)}`);
  }
  if (!String(entry.ascFirstTitle || "").includes("Oldest created row")) {
    throw new Error(`Database created views artifact contract missing ascending row order for ${viewportName}: ${JSON.stringify(entry.ascFirstTitle)}`);
  }
  if (!String(entry.descFirstTitle || "").includes("Newest created row")) {
    throw new Error(`Database created views artifact contract missing descending row order for ${viewportName}: ${JSON.stringify(entry.descFirstTitle)}`);
  }

  const tabs = Array.isArray(entry.visibleTabs) ? entry.visibleTabs : [];
  const missingTabs = REQUIRED_VIEW_TABS.filter((label) => !tabs.some((tab) => tab.includes(label)));
  if (missingTabs.length > 0) {
    throw new Error(`Database created views artifact contract missing visible tab(s) for ${viewportName}: ${missingTabs.join(", ")}`);
  }
  if (!String(entry.keyboardActivatedTab || "").includes("Created date asc")) {
    throw new Error(`Database created views artifact contract missing keyboard tab activation evidence for ${viewportName}: ${JSON.stringify(entry.keyboardActivatedTab)}`);
  }
  if (!String(entry.activeTabText || "").includes("Created date desc")) {
    throw new Error(`Database created views artifact contract missing final desc active tab for ${viewportName}: ${JSON.stringify(entry.activeTabText)}`);
  }
  if (entry.noHorizontalOverflow !== true) {
    throw new Error(`Database created views artifact contract missing no-overflow evidence for ${viewportName}`);
  }

  if (!isUsableRect(entry.tableRect) || !isUsableRect(entry.tabsRect) || !isUsableRect(entry.activeTabRect)) {
    throw new Error(`Database created views artifact contract missing usable geometry for ${viewportName}: ${JSON.stringify({
      activeTabRect: entry.activeTabRect,
      tableRect: entry.tableRect,
      tabsRect: entry.tabsRect
    })}`);
  }
}

async function assertCreatedViewsSnapshot(entry, viewportName) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Database created views artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Database created views artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Database created views artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "database-created-views") {
    throw new Error(`Database created views artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertCreatedViewsEvidence(payload, viewportName);

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    activeTabText: payload.activeTabText,
    visibleTabs: payload.visibleTabs
  };
}

function isUsableRect(rect) {
  return rect && Number(rect.width) >= 60 && Number(rect.height) >= 20;
}

export function requiredDatabaseCreatedViewTabs() {
  return [...REQUIRED_VIEW_TABS];
}
