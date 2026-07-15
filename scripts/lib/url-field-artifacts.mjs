import { readFile, stat } from "node:fs/promises";

export async function assertUrlFieldArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`URL field artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map(viewportNameFromEntry).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`URL field artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`URL field artifact contract missing entry for ${viewportName}`);
    assertUrlViewportEvidence(entry, viewportName);
    snapshots.push(await assertUrlSnapshot(entry.tableSnapshot, viewportName, "table", {
      databaseId: entry.databaseId,
      editedNormalizedUrl: entry.editedNormalizedUrl
    }));
    snapshots.push(await assertUrlSnapshot(entry.pageUrlSnapshot, viewportName, "top-level-page-property", {
      pageId: entry.pageUrlProperty?.pageId,
      editedNormalizedUrl: entry.pageEditedNormalizedUrl
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertUrlViewportEvidence(entry, viewportName) {
  assertTableEdit(entry, viewportName);
  assertRowPageProperty(entry, viewportName);
  assertTopLevelPageProperty(entry, viewportName);
  assertRenderedLayout(entry, viewportName);
}

function assertTableEdit(entry, viewportName) {
  const tableEdit = entry.tableEdit || {};
  if (openedCountChanged(tableEdit.openedBeforeTextClick, tableEdit.openedAfterTextClick)) {
    throw new Error(`URL field artifact contract text click opened a table URL in ${viewportName}: ${JSON.stringify(tableEdit)}`);
  }
  if (tableEdit.edited?.inputValue !== entry.editedRawUrl || tableEdit.edited?.displayText !== entry.editedRawUrl) {
    throw new Error(`URL field artifact contract missing persisted table edit for ${viewportName}: ${JSON.stringify(tableEdit.edited)}`);
  }
  if (tableEdit.edited?.buttonTitle !== entry.editedNormalizedUrl) {
    throw new Error(`URL field artifact contract missing normalized table open button for ${viewportName}: ${JSON.stringify(tableEdit.edited)}`);
  }
  if (!Array.isArray(entry.tableOpenRequests) || !entry.tableOpenRequests.includes(entry.editedNormalizedUrl)) {
    throw new Error(`URL field artifact contract missing table open request for ${viewportName}: ${JSON.stringify(entry.tableOpenRequests)}`);
  }
}

function assertRowPageProperty(entry, viewportName) {
  const rowPage = entry.rowPageProperty || {};
  const info = rowPage.propertyInfo || {};
  if (!info.found || info.pagePropertyLinks !== 0 || info.urlEditors !== 1 || info.urlCells !== 1) {
    throw new Error(`URL field artifact contract row-page URL property lost editable editor semantics in ${viewportName}: ${JSON.stringify(info)}`);
  }
  if (Array.isArray(rowPage.openedAfterTextClick) && rowPage.openedAfterTextClick.length > 0) {
    throw new Error(`URL field artifact contract row-page editable URL text click opened a link in ${viewportName}: ${JSON.stringify(rowPage.openedAfterTextClick)}`);
  }
}

function assertTopLevelPageProperty(entry, viewportName) {
  const pageUrl = entry.pageUrlProperty || {};
  const initial = pageUrl.initial || {};
  if (initial.buttonDisabled || initial.matchingOpenButtons !== 1) {
    throw new Error(`URL field artifact contract top-level page URL initial state is not openable in ${viewportName}: ${JSON.stringify(initial)}`);
  }
  if (Array.isArray(pageUrl.afterTextClick) && pageUrl.afterTextClick.length > 0) {
    throw new Error(`URL field artifact contract top-level page URL text click opened a link in ${viewportName}: ${JSON.stringify(pageUrl.afterTextClick)}`);
  }
  const layout = pageUrl.editedLayout || {};
  assertUrlLayout(layout, viewportName, "top-level page URL");
  if (layout.displayText !== entry.pageEditedRawUrl || layout.inputValue !== entry.pageEditedRawUrl) {
    throw new Error(`URL field artifact contract top-level page URL edit did not persist in ${viewportName}: ${JSON.stringify(layout)}`);
  }
  if (layout.buttonTitle !== entry.pageEditedNormalizedUrl || layout.matchedButtons !== 1) {
    throw new Error(`URL field artifact contract top-level page URL normalized open button mismatch in ${viewportName}: ${JSON.stringify(layout)}`);
  }
  if (!Array.isArray(pageUrl.openRequests) || !pageUrl.openRequests.includes(entry.pageEditedNormalizedUrl)) {
    throw new Error(`URL field artifact contract missing top-level page URL open request in ${viewportName}: ${JSON.stringify(pageUrl.openRequests)}`);
  }
}

function assertRenderedLayout(entry, viewportName) {
  const rendered = entry.rendered || {};
  const matchingDisplay = rendered.displayLinks?.find?.((item) => item.title === entry.editedRawUrl);
  if (!matchingDisplay || matchingDisplay.text !== entry.editedRawUrl || !matchingDisplay.visible) {
    throw new Error(`URL field artifact contract missing visible table URL display in ${viewportName}: ${JSON.stringify(rendered.displayLinks)}`);
  }
  if (!String(matchingDisplay.textDecorationLine || "").includes("underline")) {
    throw new Error(`URL field artifact contract table URL display lost underline in ${viewportName}: ${JSON.stringify(matchingDisplay)}`);
  }
  const matchingLayout = rendered.layouts?.find?.((item) => item.displayTitle === entry.editedRawUrl);
  assertUrlLayout(matchingLayout, viewportName, "table URL");
}

function assertUrlLayout(layout, viewportName, label) {
  if (!layout || typeof layout !== "object") {
    throw new Error(`URL field artifact contract missing ${label} layout for ${viewportName}`);
  }
  if (!String(layout.textDecorationLine || "underline").includes("underline")) {
    throw new Error(`URL field artifact contract ${label} lost link underline in ${viewportName}: ${JSON.stringify(layout)}`);
  }
  if (layout.inputOpacity !== "0") {
    throw new Error(`URL field artifact contract ${label} inactive input should be hidden in ${viewportName}: ${JSON.stringify(layout)}`);
  }
  if (!Number.isFinite(layout.gap) || layout.gap < 0) {
    throw new Error(`URL field artifact contract ${label} text overlaps open button in ${viewportName}: ${JSON.stringify(layout)}`);
  }
  if (!Number.isFinite(layout.buttonWidth) || layout.buttonWidth < 30 || !Number.isFinite(layout.buttonHeight) || layout.buttonHeight < 30) {
    throw new Error(`URL field artifact contract ${label} open affordance hit target is too small in ${viewportName}: ${JSON.stringify(layout)}`);
  }
  if (!Number.isFinite(layout.buttonCenterY) || !Number.isFinite(layout.cellCenterY) || Math.abs(layout.buttonCenterY - layout.cellCenterY) > 5) {
    throw new Error(`URL field artifact contract ${label} open affordance is not vertically aligned in ${viewportName}: ${JSON.stringify(layout)}`);
  }
}

async function assertUrlSnapshot(snapshot, viewportName, phase, expected) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath || !snapshot.imageBytes) {
    throw new Error(`URL field artifact contract missing ${phase} snapshot baseline for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`URL field artifact contract found empty ${phase} snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`URL field artifact contract ${phase} viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== phase) {
    throw new Error(`URL field artifact contract ${phase} metadata phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (expected.databaseId && payload.databaseId !== expected.databaseId) {
    throw new Error(`URL field artifact contract ${phase} database mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (expected.pageId && payload.pageId !== expected.pageId) {
    throw new Error(`URL field artifact contract ${phase} page mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (payload.editedNormalizedUrl !== expected.editedNormalizedUrl) {
    throw new Error(`URL field artifact contract ${phase} edited URL mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (!Number.isFinite(payload.openButtonCount) || payload.openButtonCount < 1) {
    throw new Error(`URL field artifact contract ${phase} missing open button metadata for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  return {
    viewport: viewportName,
    phase,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    imageBytes: imageInfo.size,
    openButtonCount: payload.openButtonCount,
    editedNormalizedUrl: payload.editedNormalizedUrl
  };
}

function openedCountChanged(before, after) {
  return Array.isArray(before) && Array.isArray(after) && after.length !== before.length;
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
