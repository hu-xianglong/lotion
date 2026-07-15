import { readFile, stat } from "node:fs/promises";

export async function assertPageBacklinksArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Page backlinks artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map((entry) => entry?.viewport).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Page backlinks artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Page backlinks artifact contract missing entry for ${viewportName}`);
    assertPageBacklinksEvidence(entry, viewportName);
    snapshots.push(await assertPageBacklinksSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertPageBacklinksEvidence(entry, viewportName) {
  const rendered = entry.rendered || {};
  const renderedCount = Number.parseInt(String(rendered.count ?? ""), 10);
  if (!Number.isFinite(renderedCount) || renderedCount < 2 || !Array.isArray(rendered.items) || rendered.items.length < 2) {
    throw new Error(`Page backlinks artifact contract missing rendered backlink count for ${viewportName}: ${JSON.stringify(rendered)}`);
  }
  const pageItem = rendered.items.find((item) => item.sourceType === "Page" || item.sourceType === "页面");
  const rowItem = rendered.items.find((item) => item.sourceType === "Database row" || item.sourceType === "数据库行");
  if (!pageItem?.sourceTitle || !pageItem?.context?.includes("L5") || !pageItem?.excerpt?.includes("[Backlink Target Page]")) {
    throw new Error(`Page backlinks artifact contract missing markdown backlink evidence for ${viewportName}: ${JSON.stringify(pageItem)}`);
  }
  if (!rowItem?.sourceTitle || !rowItem?.sourcePath?.includes("Property Sources") || !rowItem?.context?.includes("Related Page")) {
    throw new Error(`Page backlinks artifact contract missing property backlink evidence for ${viewportName}: ${JSON.stringify(rowItem)}`);
  }

  if (entry.opened?.activation !== "keyboard-enter" || entry.opened.titleInput !== pageItem.sourceTitle) {
    throw new Error(`Page backlinks artifact contract missing markdown keyboard navigation for ${viewportName}: ${JSON.stringify(entry.opened)}`);
  }
  if (entry.openedPropertyRow?.activation !== "keyboard-enter" || entry.openedPropertyRow.titleInput !== rowItem.sourceTitle) {
    throw new Error(`Page backlinks artifact contract missing property-row keyboard navigation for ${viewportName}: ${JSON.stringify(entry.openedPropertyRow)}`);
  }
  if (!entry.opened.ariaLabel?.includes(pageItem.sourceTitle) || !entry.openedPropertyRow.ariaLabel?.includes(rowItem.sourceTitle)) {
    throw new Error(`Page backlinks artifact contract missing descriptive aria labels for ${viewportName}: ${JSON.stringify({
      opened: entry.opened,
      openedPropertyRow: entry.openedPropertyRow
    })}`);
  }
  if (entry.noHorizontalOverflow !== true) {
    throw new Error(`Page backlinks artifact contract missing no-overflow evidence for ${viewportName}`);
  }
  if (!isUsableRect(entry.panelRect)) {
    throw new Error(`Page backlinks artifact contract missing panel geometry for ${viewportName}: ${JSON.stringify(entry.panelRect)}`);
  }
  assertLatencyEvidence(entry.repeatedPageOpens, viewportName, "repeated");
  assertLatencyEvidence(entry.seededPageOpens, viewportName, "seeded");
}

function assertLatencyEvidence(value, viewportName, label) {
  if (!value || !Number.isFinite(value.thresholdMs) || value.thresholdMs <= 0) {
    throw new Error(`Page backlinks artifact contract missing ${label} latency threshold for ${viewportName}: ${JSON.stringify(value)}`);
  }
  const timings = Array.isArray(value.timings) ? value.timings : [];
  const count = Number.isFinite(value.count) ? value.count : timings.length;
  if (count < 4 || timings.length < 4) {
    throw new Error(`Page backlinks artifact contract missing ${label} latency samples for ${viewportName}: ${JSON.stringify(value)}`);
  }
  const slow = timings.find((item) => Number(item.openMs) > value.thresholdMs || Number(item.backlinkMs) > value.backlinkThresholdMs);
  if (slow) {
    throw new Error(`Page backlinks artifact contract found ${label} latency sample above threshold for ${viewportName}: ${JSON.stringify(slow)}`);
  }
}

async function assertPageBacklinksSnapshot(entry, viewportName) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Page backlinks artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Page backlinks artifact contract found empty snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Page backlinks artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "page-backlinks") {
    throw new Error(`Page backlinks artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertPageBacklinksEvidence(payload, viewportName);

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    count: payload.rendered.count,
    sourceTitles: payload.rendered.items.map((item) => item.sourceTitle)
  };
}

function isUsableRect(rect) {
  return rect && Number(rect.width) >= 220 && Number(rect.height) >= 80;
}
