import { readFile, stat } from "node:fs/promises";

export async function assertSearchAiArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
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
    snapshots.push(await assertSearchAiSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
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
}

async function assertSearchAiSnapshot(entry, viewportName) {
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

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    resultCount: payload.search.rows.length,
    selectedSource: payload.chat.selected
  };
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
