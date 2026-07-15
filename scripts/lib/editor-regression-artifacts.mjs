import { readFile, stat } from "node:fs/promises";

const DEFAULT_EXPECTED_VIEWPORTS = ["desktop", "compact"];

export async function assertEditorRegressionArtifactContract(summary, {
  expectedViewportNames = DEFAULT_EXPECTED_VIEWPORTS
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Editor regression artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => getViewportName(entry)).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Editor regression artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => getViewportName(candidate) === viewportName);
    if (!entry) throw new Error(`Editor regression artifact contract missing entry for ${viewportName}`);
    assertEditorViewport(entry, viewportName);
    snapshots.push(await assertEditorSnapshot(entry.visualSnapshot, viewportName, entry));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertEditorViewport(entry, viewportName) {
  const normal = entry.normal || {};
  const empty = entry.empty || {};
  const large = entry.large || {};

  for (const [key, value] of [
    ["normal.firstToken", normal.firstToken],
    ["normal.selectionReplacement", normal.selectionReplacement],
    ["normal.mergedLine", normal.mergedLine],
    ["normal.switchContinuation", normal.switchContinuation],
    ["empty.firstTyping", empty.firstTyping],
    ["large.largeToken", large.largeToken]
  ]) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Editor regression ${viewportName} missing ${key}`);
    }
  }

  if (typeof normal.typedMs !== "number" || normal.typedMs <= 0 || normal.typedMs > 1_500) {
    throw new Error(`Editor regression ${viewportName} invalid typed latency: ${JSON.stringify(normal.typedMs)}`);
  }
  if (typeof normal.markdownLength !== "number" || normal.markdownLength <= 0) {
    throw new Error(`Editor regression ${viewportName} missing normal markdown persistence length`);
  }
  if (typeof empty.markdownLength !== "number" || empty.markdownLength <= 0) {
    throw new Error(`Editor regression ${viewportName} missing empty-row markdown persistence length`);
  }
  if (!Array.isArray(normal.markdownLinks?.bareUrl?.directClickOpened) || normal.markdownLinks.bareUrl.directClickOpened.length < 1) {
    throw new Error(`Editor regression ${viewportName} missing markdown link click/edit evidence: ${JSON.stringify(normal.markdownLinks)}`);
  }
  for (const key of ["inlineExternal", "decodedExternal", "attachment", "internal"]) {
    if (typeof normal.markdownLinks?.[key]?.editToken !== "string" || normal.markdownLinks[key].editToken.length === 0) {
      throw new Error(`Editor regression ${viewportName} missing ${key} blank-edit evidence: ${JSON.stringify(normal.markdownLinks?.[key])}`);
    }
  }
  if (!normal.markdownEmphasisShortcuts?.boldText || !normal.markdownEmphasisShortcuts?.italicText || !normal.markdownEmphasisShortcuts?.strikeText) {
    throw new Error(`Editor regression ${viewportName} missing markdown emphasis evidence: ${JSON.stringify(normal.markdownEmphasisShortcuts)}`);
  }
  if (!normal.lotionCalloutFence?.rendered || !normal.lotionViewFence?.rendered || !normal.markdownTableSyntax?.rendered) {
    throw new Error(`Editor regression ${viewportName} missing rendered block evidence`);
  }

  const beforeScroll = large.beforeScroll || {};
  const afterScroll = large.afterScroll || {};
  for (const [label, scroll] of [["beforeScroll", beforeScroll], ["afterScroll", afterScroll]]) {
    if (typeof scroll.scrollTop !== "number" || typeof scroll.scrollHeight !== "number" || typeof scroll.clientHeight !== "number") {
      throw new Error(`Editor regression ${viewportName} missing large document ${label}: ${JSON.stringify(scroll)}`);
    }
  }
  if (beforeScroll.scrollHeight > beforeScroll.clientHeight && afterScroll.scrollTop < beforeScroll.scrollTop * 0.35) {
    throw new Error(`Editor regression ${viewportName} large document scroll jumped near top: ${JSON.stringify({ beforeScroll, afterScroll })}`);
  }
}

async function assertEditorSnapshot(snapshot, viewportName, entry) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Editor regression ${viewportName} missing editor snapshot paths`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Editor regression ${viewportName} snapshot image is empty: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Editor regression ${viewportName} snapshot viewport mismatch: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "editor-regression") {
    throw new Error(`Editor regression ${viewportName} snapshot phase mismatch: ${JSON.stringify(payload.phase)}`);
  }
  if (payload.largeToken !== entry.large.largeToken || payload.firstToken !== entry.normal.firstToken) {
    throw new Error(`Editor regression ${viewportName} snapshot metadata did not match edited tokens`);
  }
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    phaseCount: 1,
    phases: ["editor-regression"],
    typedMs: entry.normal.typedMs,
    markdownLength: entry.normal.markdownLength,
    emptyMarkdownLength: entry.empty.markdownLength,
    largeScrollTop: Math.round(entry.large.afterScroll.scrollTop)
  };
}

function getViewportName(entry) {
  const value = entry?.viewport;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.name === "string") return value.name;
  return "";
}
