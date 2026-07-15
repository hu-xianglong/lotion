import { readFile, stat } from "node:fs/promises";

export async function assertTagPagesArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Tag pages artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map(viewportNameFromEntry).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Tag pages artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Tag pages artifact contract missing entry for ${viewportName}`);
    assertTagNavigationEvidence(entry, viewportName);
    snapshots.push(await assertTagManagementSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertTagNavigationEvidence(entry, viewportName) {
  const tagPage = entry?.tagPage;
  if (!tagPage || typeof tagPage !== "object") {
    throw new Error(`Tag pages artifact contract missing tag-page evidence for ${viewportName}`);
  }
  if (!tagPage.focusedOpen?.label?.includes(tagPage.tagName)) {
    throw new Error(`Tag pages artifact contract missing keyboard-focusable open affordance for ${viewportName}: ${JSON.stringify(tagPage.focusedOpen)}`);
  }
  if (!tagPage.rows?.pageVisible || !tagPage.rows?.databaseVisible || tagPage.rows.count < 2) {
    throw new Error(`Tag pages artifact contract missing page/database rows for ${viewportName}: ${JSON.stringify(tagPage.rows)}`);
  }
  if (!tagPage.openedPage?.bodyVisible || !String(tagPage.openedPage?.activeTabText || "").includes(tagPage.pageTitle)) {
    throw new Error(`Tag pages artifact contract missing keyboard page navigation for ${viewportName}: ${JSON.stringify(tagPage.openedPage)}`);
  }
  if (!tagPage.openedDatabase?.tableVisible || !String(tagPage.openedDatabase?.activeTabText || "").includes(tagPage.databaseName)) {
    throw new Error(`Tag pages artifact contract missing keyboard database navigation for ${viewportName}: ${JSON.stringify(tagPage.openedDatabase)}`);
  }
}

async function assertTagManagementSnapshot(entry, viewportName) {
  const snapshot = entry?.tagPage?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Tag pages artifact contract missing tag management snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Tag pages artifact contract found empty tag management snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Tag pages artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "tag-management") {
    throw new Error(`Tag pages artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (payload.tagName !== entry.tagPage.tagName || payload.token !== `#${entry.tagPage.tagName}`) {
    throw new Error(`Tag pages artifact contract tag identity mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (!payload.heading?.includes(entry.tagPage.tagName)) {
    throw new Error(`Tag pages artifact contract missing heading evidence for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (payload.pageCount !== 1 || payload.databaseCount !== 1 || payload.totalCount < 2) {
    throw new Error(`Tag pages artifact contract summary counts regressed for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (!Array.isArray(payload.rows) || !payload.rows.some((row) => row.includes(entry.tagPage.pageTitle)) || !payload.rows.some((row) => row.includes(entry.tagPage.databaseName))) {
    throw new Error(`Tag pages artifact contract snapshot rows missing page/database for ${viewportName}: ${JSON.stringify(payload.rows)}`);
  }

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    tagName: entry.tagPage.tagName,
    pageCount: payload.pageCount,
    databaseCount: payload.databaseCount,
    totalCount: payload.totalCount
  };
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
