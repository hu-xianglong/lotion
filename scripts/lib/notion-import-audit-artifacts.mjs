import { readFile, stat } from "node:fs/promises";

const REQUIRED_SUMMARY = {
  "Source CSVs": "1 / 1",
  "Source HTMLs": "1 / 1",
  "Imported mappings": "1 database, 1 row/page",
  "Issues": "0",
  "Warnings": "0"
};

const REQUIRED_PATH_BUTTONS = 2;
const REQUIRED_DIAGNOSTIC_KIND = "cell_loss";

export async function assertNotionImportAuditArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map(viewportNameFromEntry).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Notion import audit artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Notion import audit artifact contract missing entry for ${viewportName}`);
    assertAuditViewport(entry, viewportName);

    const snapshot = entry.snapshot;
    if (!snapshot?.imagePath || !snapshot?.metadataPath) {
      throw new Error(`Notion import audit artifact contract missing snapshot paths for ${viewportName}`);
    }
    const imageInfo = await stat(snapshot.imagePath);
    if (imageInfo.size <= 0) {
      throw new Error(`Notion import audit artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
    }
    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    const payload = metadata.metadata || {};
    if (metadata.viewport?.name !== viewportName) {
      throw new Error(`Notion import audit artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
    }
    assertRequiredSummary(payload.summary, `metadata ${viewportName}`);
    if (payload.pathButtons !== REQUIRED_PATH_BUTTONS) {
      throw new Error(`Notion import audit artifact contract expected ${REQUIRED_PATH_BUTTONS} path buttons in metadata for ${viewportName}: ${payload.pathButtons}`);
    }
    assertOpenRequests({
      label: `metadata ${viewportName}`,
      requests: payload.shellOpenDryRunRequests,
      sourceRoot: payload.sourceRoot,
      workspaceRoot: payload.workspaceRoot
    });

    snapshots.push({
      phase: "passing",
      viewport: viewportName,
      imagePath: snapshot.imagePath,
      metadataPath: snapshot.metadataPath,
      imageBytes: imageInfo.size,
      pathButtons: entry.pathButtons,
      openedCount: entry.shellOpenDryRunRequests.length,
      summary: entry.summary
    });
  }

  const diagnostics = Array.isArray(summary?.diagnostics) ? summary.diagnostics : [];
  const diagnosticSnapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = diagnostics.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) {
      throw new Error(`Notion import audit artifact contract missing failing diagnostic for ${viewportName}`);
    }
    diagnosticSnapshots.push(await assertDiagnosticViewport(entry, viewportName));
  }

  const importModal = Array.isArray(summary?.importModal) ? summary.importModal : [];
  const modalSnapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = importModal.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) {
      throw new Error(`Notion import audit artifact contract missing import modal overlay for ${viewportName}`);
    }
    modalSnapshots.push(await assertImportModalViewport(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length + diagnosticSnapshots.length + modalSnapshots.length,
    diagnosticCount: diagnosticSnapshots.length,
    modalCount: modalSnapshots.length,
    snapshots: [...modalSnapshots, ...snapshots, ...diagnosticSnapshots]
  };
}

async function assertImportModalViewport(entry, viewportName) {
  const overlay = entry.overlay || {};
  if (
    overlay.title !== "Import from Notion" ||
    overlay.modalRole !== "dialog" ||
    overlay.ariaModal !== "true" ||
    overlay.backdropCoversViewport !== true ||
    overlay.centerInsideModal !== true ||
    overlay.modalContainsPageTitle !== false
  ) {
    throw new Error(`Notion import audit artifact contract invalid import modal overlay for ${viewportName}: ${JSON.stringify(overlay)}`);
  }
  const snapshot = entry.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Notion import audit artifact contract missing import modal snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Notion import audit artifact contract found empty import modal image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Notion import audit artifact contract import modal viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "command-modal") {
    throw new Error(`Notion import audit artifact contract expected command-modal phase metadata for ${viewportName}, got ${payload.phase ?? "(missing)"}`);
  }
  if (payload.overlay?.title !== "Import from Notion" || payload.overlay?.modalContainsPageTitle !== false) {
    throw new Error(`Notion import audit artifact contract import modal metadata missing overlay evidence for ${viewportName}: ${JSON.stringify(payload.overlay)}`);
  }
  return {
    phase: "command-modal",
    viewport: viewportName,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    imageBytes: imageInfo.size,
    overlay
  };
}

function assertAuditViewport(entry, viewportName) {
  assertRequiredSummary(entry.summary, viewportName);
  if (entry.pathButtons !== REQUIRED_PATH_BUTTONS) {
    throw new Error(`Notion import audit artifact contract expected ${REQUIRED_PATH_BUTTONS} path buttons for ${viewportName}: ${entry.pathButtons}`);
  }
  assertOpenRequests({
    label: viewportName,
    requests: entry.shellOpenDryRunRequests,
    sourceRoot: entry.sourceRoot,
    workspaceRoot: entry.workspaceRoot
  });
}

function assertRequiredSummary(summary, label) {
  if (!summary || typeof summary !== "object") {
    throw new Error(`Notion import audit artifact contract missing summary for ${label}`);
  }
  for (const [key, expected] of Object.entries(REQUIRED_SUMMARY)) {
    if (summary[key] !== expected) {
      throw new Error(`Notion import audit artifact contract expected summary ${key}=${expected} for ${label}, got ${summary[key] ?? "(missing)"}`);
    }
  }
}

async function assertDiagnosticViewport(entry, viewportName) {
  const summary = entry.summary;
  if (!summary || typeof summary !== "object") {
    throw new Error(`Notion import audit artifact contract missing failing diagnostic summary for ${viewportName}`);
  }
  const issueCount = Number(summary.Issues);
  if (!Number.isFinite(issueCount) || issueCount <= 0) {
    throw new Error(`Notion import audit artifact contract expected failing diagnostic issues for ${viewportName}, got ${summary.Issues ?? "(missing)"}`);
  }
  if (!entry.issueKinds || Number(entry.issueKinds[REQUIRED_DIAGNOSTIC_KIND] || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract missing ${REQUIRED_DIAGNOSTIC_KIND} issue kind for ${viewportName}`);
  }
  if (Number(entry.issueRows || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract missing visible issue rows for ${viewportName}`);
  }
  if (!String(entry.failText || "").includes("blocking import issues")) {
    throw new Error(`Notion import audit artifact contract missing failing status text for ${viewportName}`);
  }
  if (Number(entry.pathButtons || 0) <= REQUIRED_PATH_BUTTONS) {
    throw new Error(`Notion import audit artifact contract expected diagnostic path buttons for ${viewportName}, got ${entry.pathButtons}`);
  }
  assertOpenRequests({
    label: `diagnostic ${viewportName}`,
    requests: entry.shellOpenDryRunRequests,
    sourceRoot: entry.sourceRoot,
    workspaceRoot: entry.workspaceRoot
  });

  const snapshot = entry.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Notion import audit artifact contract missing failing diagnostic snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Notion import audit artifact contract found empty failing diagnostic image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Notion import audit artifact contract failing diagnostic viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "diagnostic") {
    throw new Error(`Notion import audit artifact contract expected diagnostic phase metadata for ${viewportName}, got ${payload.phase ?? "(missing)"}`);
  }
  if (Number(payload.issueKinds?.[REQUIRED_DIAGNOSTIC_KIND] || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract metadata missing ${REQUIRED_DIAGNOSTIC_KIND} for ${viewportName}`);
  }
  if (Number(payload.issueRows || 0) <= 0) {
    throw new Error(`Notion import audit artifact contract metadata missing issue rows for ${viewportName}`);
  }

  return {
    phase: "diagnostic",
    viewport: viewportName,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    imageBytes: imageInfo.size,
    pathButtons: entry.pathButtons,
    openedCount: entry.shellOpenDryRunRequests.length,
    summary: entry.summary,
    issueKinds: entry.issueKinds,
    issueRows: entry.issueRows,
    failText: entry.failText
  };
}

function assertOpenRequests({ label, requests, sourceRoot, workspaceRoot }) {
  if (!sourceRoot || !workspaceRoot) {
    throw new Error(`Notion import audit artifact contract missing source/workspace roots for ${label}`);
  }
  if (!Array.isArray(requests)) {
    throw new Error(`Notion import audit artifact contract missing shell-open requests for ${label}`);
  }
  for (const expected of [sourceRoot, workspaceRoot]) {
    if (!requests.includes(expected)) {
      throw new Error(`Notion import audit artifact contract missing opened path ${expected} for ${label}`);
    }
  }
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
