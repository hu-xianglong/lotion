import { readFile, stat } from "node:fs/promises";

const REQUIRED_PHASES = [
  "initial",
  "ollama-error",
  "missing-model-error",
  "ready",
  "stale-results",
  "empty",
  "lancedb-error",
  "external-error"
];

export async function assertAdvancedSearchArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Advanced Search artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map((entry) => entry.viewport).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Advanced Search artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => candidate.viewport === viewportName);
    if (!entry) throw new Error(`Advanced Search artifact contract missing entry for ${viewportName}`);
    assertAdvancedSearchViewport(entry, viewportName);
    const phaseSnapshots = await assertAdvancedSearchSnapshots(entry, viewportName);
    const representative = phaseSnapshots[0];
    snapshots.push({
      viewport: viewportName,
      imageBytes: phaseSnapshots.reduce((total, snapshot) => total + snapshot.imageBytes, 0),
      imagePath: representative?.imagePath || "",
      metadataPath: representative?.metadataPath || "",
      phaseCount: phaseSnapshots.length,
      phases: phaseSnapshots.map((snapshot) => snapshot.phase),
      resultCountMax: Math.max(...phaseSnapshots.map((snapshot) => snapshot.resultCount)),
      statusLabels: phaseSnapshots.map((snapshot) => snapshot.statusLabel)
    });
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertAdvancedSearchViewport(entry, viewportName) {
  if (!entry.workspaceRoot) {
    throw new Error(`Advanced Search artifact contract missing workspace root for ${viewportName}`);
  }

  const navigation = entry.navigation || {};
  if (navigation.rowPage?.openedTitle !== "Customer Feedback") {
    throw new Error(`Advanced Search artifact contract missing row-page navigation for ${viewportName}: ${JSON.stringify(navigation.rowPage)}`);
  }
  if (navigation.page?.openedTitle !== "Research Notes") {
    throw new Error(`Advanced Search artifact contract missing page navigation for ${viewportName}: ${JSON.stringify(navigation.page)}`);
  }
  if (navigation.database?.openedTitle !== "Research DB") {
    throw new Error(`Advanced Search artifact contract missing database navigation for ${viewportName}: ${JSON.stringify(navigation.database)}`);
  }
}

async function assertAdvancedSearchSnapshots(entry, viewportName) {
  const snapshots = Array.isArray(entry.visualSnapshots) ? entry.visualSnapshots : [];
  const phases = snapshots.map((snapshot) => snapshot.phase);
  const missingPhases = REQUIRED_PHASES.filter((phase) => !phases.includes(phase));
  if (missingPhases.length > 0) {
    throw new Error(`Advanced Search artifact contract missing snapshot phase(s) for ${viewportName}: ${missingPhases.join(", ")}`);
  }

  const checked = [];
  for (const snapshot of snapshots.filter((candidate) => REQUIRED_PHASES.includes(candidate.phase))) {
    checked.push(await assertSnapshot(snapshot, viewportName));
  }
  return checked;
}

async function assertSnapshot(snapshot, viewportName) {
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Advanced Search artifact contract missing snapshot paths for ${viewportName} ${snapshot?.phase ?? "unknown"}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Advanced Search artifact contract found empty snapshot image for ${viewportName} ${snapshot.phase}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Advanced Search artifact contract viewport mismatch for ${viewportName} ${snapshot.phase}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== snapshot.phase) {
    throw new Error(`Advanced Search artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }

  const visibleState = payload.visibleState || {};
  assertGeometry(payload.geometry, viewportName, snapshot.phase);
  assertVisibleState(visibleState, viewportName, snapshot.phase);
  return {
    phase: snapshot.phase,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    resultCount: visibleState.resultCount ?? 0,
    statusLabel: visibleState.statusLabel || ""
  };
}

function assertGeometry(geometry, viewportName, phase) {
  for (const key of ["panel", "controls", "query", "meta", "results"]) {
    const rect = geometry?.[key];
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Advanced Search artifact contract missing ${key} geometry for ${viewportName} ${phase}: ${JSON.stringify(rect)}`);
    }
  }
  if (geometry.query.top < geometry.controls.top) {
    throw new Error(`Advanced Search artifact contract invalid controls/query geometry for ${viewportName} ${phase}: ${JSON.stringify(geometry)}`);
  }
  if (geometry.results.top < geometry.query.top) {
    throw new Error(`Advanced Search artifact contract invalid query/results geometry for ${viewportName} ${phase}: ${JSON.stringify(geometry)}`);
  }
}

function assertVisibleState(visibleState, viewportName, phase) {
  if (!visibleState.statusLabel) {
    throw new Error(`Advanced Search artifact contract missing status label for ${viewportName} ${phase}: ${JSON.stringify(visibleState)}`);
  }
  if (!visibleState.providerValue || !visibleState.storeValue) {
    throw new Error(`Advanced Search artifact contract missing provider/store controls for ${viewportName} ${phase}: ${JSON.stringify(visibleState)}`);
  }
  if (!visibleState.queryPlaceholder?.includes("Ask semantically")) {
    throw new Error(`Advanced Search artifact contract missing query affordance for ${viewportName} ${phase}: ${JSON.stringify(visibleState)}`);
  }

  switch (phase) {
    case "initial":
      if (visibleState.statusLabel !== "Not built" || !visibleState.noteText.includes("Qwen3 local semantic index")) {
        throw new Error(`Advanced Search initial state mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "ollama-error":
      if (visibleState.statusLabel !== "Error" || !visibleState.metaText.includes("Ollama is not reachable")) {
        throw new Error(`Advanced Search Ollama error state mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "missing-model-error":
      if (visibleState.statusLabel !== "Error" || !visibleState.metaText.includes("Ollama model")) {
        throw new Error(`Advanced Search missing model state mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "ready":
      if (visibleState.statusLabel !== "Ready" || visibleState.progressPhase !== "done" || !visibleState.metaText.includes("Indexed")) {
        throw new Error(`Advanced Search ready state mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "stale-results":
      if (
        visibleState.statusLabel !== "Stale" ||
        visibleState.resultCount < 1 ||
        !visibleState.sources.some((source) => String(source).startsWith("Row page"))
      ) {
        throw new Error(`Advanced Search stale results mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      if (!visibleState.titles.includes("Customer Feedback") || !visibleState.snippets.some((snippet) => /retention|complaints/i.test(snippet))) {
        throw new Error(`Advanced Search stale result content mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "empty":
      if (!visibleState.emptyText.includes("No results")) {
        throw new Error(`Advanced Search empty state mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "lancedb-error":
      if (visibleState.statusLabel !== "Error" || !visibleState.metaText.includes("LanceDB vector storage")) {
        throw new Error(`Advanced Search LanceDB error state mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    case "external-error":
      if (visibleState.statusLabel !== "Error" || !visibleState.metaText.includes("External embeddings require")) {
        throw new Error(`Advanced Search external provider error mismatch for ${viewportName}: ${JSON.stringify(visibleState)}`);
      }
      break;
    default:
      throw new Error(`Unknown Advanced Search artifact phase: ${phase}`);
  }
}

export function requiredAdvancedSearchSnapshotPhases() {
  return [...REQUIRED_PHASES];
}
