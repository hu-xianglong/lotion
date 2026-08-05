import { readFile, stat } from "node:fs/promises";

export async function assertSearchAiArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"],
  requiredPerceptualBaselineViewportNames = ["desktop", "compact", "wide"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Search & AI artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map(viewportNameFromEntry).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Search & AI artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Search & AI artifact contract missing entry for ${viewportName}`);
    assertSearchAiEvidence(entry, viewportName);
    snapshots.push(await assertSearchAiSnapshot(entry, viewportName, {
      requirePerceptualBaseline: requiredPerceptualBaselineViewportNames.includes(viewportName)
    }));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    perceptualBaselineCount: snapshots.filter((snapshot) => snapshot.perceptualBaseline?.status === "passed").length,
    snapshots
  };
}

function assertSearchAiEvidence(entry, viewportName) {
  const rows = Array.isArray(entry?.search?.rows) ? entry.search.rows : [];
  const query = String(entry?.search?.query || "");
  if (!query || !rows.some((row) => row.includes(query))) {
    throw new Error(`Search & AI artifact contract missing query result context for ${viewportName}: ${JSON.stringify(entry?.search)}`);
  }
  for (const label of [entry.search?.pageTitle, entry.search?.databaseName, entry.search?.rowTitle].filter(Boolean)) {
    if (!rows.some((row) => row.includes(label))) {
      throw new Error(`Search & AI artifact contract missing search result ${label} for ${viewportName}: ${JSON.stringify(rows)}`);
    }
  }
  assertNoStorageIdentityLeak(rows.join("\n"), `search rows for ${viewportName}`);

  const advancedText = String(entry?.advanced?.text || "");
  for (const text of ["Local semantic index", "Open Advanced results", "Search & AI Settings"]) {
    if (!advancedText.includes(text)) {
      throw new Error(`Search & AI artifact contract missing Advanced tab text ${text} for ${viewportName}: ${JSON.stringify(entry?.advanced)}`);
    }
  }

  const selected = String(entry?.chat?.selected || "");
  if (!selected.includes(entry.search?.rowTitle || "Semantic Orchard Row")) {
    throw new Error(`Search & AI artifact contract missing selected LLM source for ${viewportName}: ${JSON.stringify(entry?.chat)}`);
  }
  assertNoStorageIdentityLeak(selected, `selected source for ${viewportName}`);
}

async function assertSearchAiSnapshot(entry, viewportName, {
  requirePerceptualBaseline = false
} = {}) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Search & AI artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Search & AI artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Search & AI artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "search-ai") {
    throw new Error(`Search & AI artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  if (!Array.isArray(payload.search?.rows) || payload.search.rows.length < 3) {
    throw new Error(`Search & AI artifact contract snapshot missing search rows for ${viewportName}: ${JSON.stringify(payload.search)}`);
  }
  if (!String(payload.advanced?.text || "").includes("Local semantic index")) {
    throw new Error(`Search & AI artifact contract snapshot missing Advanced state for ${viewportName}: ${JSON.stringify(payload.advanced)}`);
  }
  if (!String(payload.chat?.selected || "").includes(payload.search?.rowTitle || "Semantic Orchard Row")) {
    throw new Error(`Search & AI artifact contract snapshot missing Chat selected source for ${viewportName}: ${JSON.stringify(payload.chat)}`);
  }
  assertNoStorageIdentityLeak(payload.search.rows.join("\n"), `snapshot search rows for ${viewportName}`);
  assertNoStorageIdentityLeak(payload.chat.selected, `snapshot selected source for ${viewportName}`);
  assertVisibleState(payload.visibleState, viewportName);
  const perceptualBaseline = await assertPerceptualBaseline(snapshot.perceptualBaseline, snapshot, viewportName, {
    required: requirePerceptualBaseline
  });

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    resultCount: payload.search.rows.length,
    selectedSource: payload.chat.selected,
    ...(perceptualBaseline ? { perceptualBaseline } : {})
  };
}

function assertVisibleState(state, viewportName) {
  if (state?.activePrimaryTab !== "LLM Chat") {
    throw new Error(`Search & AI artifact contract chat handoff tab is not active for ${viewportName}: ${JSON.stringify(state?.activePrimaryTab)}`);
  }
  if (
    !Array.isArray(state.primaryTabs)
    || !["Search", "LLM Chat"].every((label) => state.primaryTabs.some((tab) => tab.label === label && tab.fullyVisible))
  ) {
    throw new Error(`Search & AI artifact contract primary tabs are clipped for ${viewportName}: ${JSON.stringify(state?.primaryTabs)}`);
  }
  const selected = state.selectedSource || {};
  if (
    selected.title !== "Semantic Orchard Row"
    || selected.subtitle !== "Row page · Knowledge Base"
    || !selected.fullyVisible
    || selected.clientWidth <= 0
    || selected.scrollWidth > selected.clientWidth
    || !selected.rect
    || selected.rect.width <= 0
    || selected.rect.height <= 0
  ) {
    throw new Error(`Search & AI artifact contract selected source is clipped or unreadable for ${viewportName}: ${JSON.stringify(selected)}`);
  }
  if (!Array.isArray(state.storageLeakMatches) || state.storageLeakMatches.length !== 0) {
    throw new Error(`Search & AI artifact contract found visible storage identity leaks for ${viewportName}: ${JSON.stringify(state.storageLeakMatches)}`);
  }
  assertNoStorageIdentityLeak(selected.subtitle, `visible selected-source subtitle for ${viewportName}`);
}

async function assertPerceptualBaseline(baseline, snapshot, viewportName, { required }) {
  if (!baseline) {
    if (required) throw new Error(`Search & AI artifact contract missing committed chat-handoff baseline for ${viewportName}`);
    return null;
  }
  if (baseline.kind !== "lotion-png-visual-diff" || baseline.status !== "passed") {
    throw new Error(`Search & AI artifact contract chat-handoff baseline did not pass for ${viewportName}: ${JSON.stringify({ kind: baseline.kind, status: baseline.status })}`);
  }
  if (baseline.actualPath !== snapshot.imagePath) {
    throw new Error(`Search & AI artifact contract chat-handoff baseline actual path mismatch for ${viewportName}: ${baseline.actualPath}`);
  }
  if (!baseline.dimensionsMatch || baseline.diffPixels > baseline.maxDiffPixels || baseline.diffRatio > baseline.maxDiffRatio) {
    throw new Error(`Search & AI artifact contract chat-handoff baseline exceeded tolerance for ${viewportName}: ${JSON.stringify({ dimensionsMatch: baseline.dimensionsMatch, diffPixels: baseline.diffPixels, diffRatio: baseline.diffRatio })}`);
  }
  for (const [label, path] of Object.entries({
    expected: baseline.expectedPath,
    diff: baseline.diffPath,
    metadata: baseline.metadataPath,
    policy: baseline.policyPath
  })) {
    if (!path) throw new Error(`Search & AI artifact contract missing chat-handoff ${label} path for ${viewportName}`);
    const info = await stat(path);
    if (info.size <= 0) throw new Error(`Search & AI artifact contract found empty chat-handoff ${label} artifact for ${viewportName}: ${path}`);
  }
  const diffMetadata = JSON.parse(await readFile(baseline.metadataPath, "utf8"));
  if (diffMetadata.status !== "passed" || diffMetadata.expectedPath !== baseline.expectedPath || diffMetadata.actualPath !== baseline.actualPath) {
    throw new Error(`Search & AI artifact contract chat-handoff diff metadata mismatch for ${viewportName}: ${JSON.stringify(diffMetadata)}`);
  }
  return {
    kind: baseline.kind,
    status: baseline.status,
    policyPath: baseline.policyPath,
    actualPath: baseline.actualPath,
    expectedPath: baseline.expectedPath,
    diffPath: baseline.diffPath,
    metadataPath: baseline.metadataPath,
    dimensionsMatch: baseline.dimensionsMatch,
    diffPixels: baseline.diffPixels,
    diffRatio: baseline.diffRatio,
    maxDiffPixels: baseline.maxDiffPixels,
    maxDiffRatio: baseline.maxDiffRatio,
    threshold: baseline.threshold,
    includeAA: baseline.includeAA,
    policy: baseline.policy
  };
}

function assertNoStorageIdentityLeak(value, label) {
  const text = String(value || "");
  if (/databases\/(?:user|system)\/|--(?:db|row|pg)_[a-z0-9_-]+|(?:^|[\s/])data\.csv(?:$|[\s#])|[A-Za-z0-9_-]+--(?:row|pg)_[A-Za-z0-9_-]+\.md/i.test(text)) {
    throw new Error(`Search & AI artifact contract found internal storage path or ID in ${label}: ${JSON.stringify(text)}`);
  }
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
