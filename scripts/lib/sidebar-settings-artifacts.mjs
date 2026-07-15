import { readFile, stat } from "node:fs/promises";

export async function assertSidebarSettingsArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Sidebar settings artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }

  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = [...new Set(viewports.map(viewportNameFromEntry).filter(Boolean))];
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Sidebar settings artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Sidebar settings artifact contract missing entry for ${viewportName}`);
    assertSidebarSettingsEvidence(entry, viewportName);
    snapshots.push(await assertSidebarSettingsSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertSidebarSettingsEvidence(entry, viewportName) {
  const choices = entry?.initial?.choices || {};
  if (choices.pagesPressed !== "true" || choices.databasesPressed !== "true") {
    throw new Error(`Sidebar settings artifact contract missing active default choices for ${viewportName}: ${JSON.stringify(choices)}`);
  }
  if (choices.pagesDisabled !== true || choices.databasesDisabled !== true) {
    throw new Error(`Sidebar settings artifact contract missing locked built-in choices for ${viewportName}: ${JSON.stringify(choices)}`);
  }

  assertOrder(entry.initial?.settingsOrder, ["Pages", "Databases"], `initial settings order ${viewportName}`);
  assertOrder(entry.initial?.sectionOrder, ["Pages", "Databases"], `initial section order ${viewportName}`);
  assertOrder(entry.reordered, ["Databases", "Pages"], `reordered section order ${viewportName}`);
  assertOrder(entry.reset, ["Pages", "Databases"], `reset section order ${viewportName}`);

  const shortcuts = entry?.shortcuts || {};
  if (shortcuts.ordinaryValue !== "f") {
    throw new Error(`Sidebar settings artifact contract missing ordinary shortcut input evidence for ${viewportName}: ${JSON.stringify(shortcuts)}`);
  }
  if (!String(shortcuts.defaultChord || "").includes("F")) {
    throw new Error(`Sidebar settings artifact contract missing readable default shortcut chord for ${viewportName}: ${JSON.stringify(shortcuts)}`);
  }
  if (shortcuts.customChord !== "Alt+Shift+F") {
    throw new Error(`Sidebar settings artifact contract missing custom shortcut evidence for ${viewportName}: ${JSON.stringify(shortcuts)}`);
  }
}

async function assertSidebarSettingsSnapshot(entry, viewportName) {
  const snapshot = entry?.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Sidebar settings artifact contract missing settings snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Sidebar settings artifact contract found empty settings snapshot for ${viewportName}: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Sidebar settings artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if (payload.phase !== "sidebar-settings") {
    throw new Error(`Sidebar settings artifact contract phase mismatch for ${viewportName}: ${JSON.stringify(payload)}`);
  }
  assertOrder(payload.initial?.settingsOrder, ["Pages", "Databases"], `snapshot initial settings order ${viewportName}`);
  assertOrder(payload.reordered, ["Databases", "Pages"], `snapshot reordered order ${viewportName}`);
  assertOrder(payload.reset, ["Pages", "Databases"], `snapshot reset order ${viewportName}`);
  if (payload.shortcuts?.customChord !== "Alt+Shift+F") {
    throw new Error(`Sidebar settings artifact contract snapshot missing shortcut metadata for ${viewportName}: ${JSON.stringify(payload.shortcuts)}`);
  }

  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    resetOrder: payload.reset,
    reorderedOrder: payload.reordered,
    shortcutChord: payload.shortcuts.customChord
  };
}

function assertOrder(actual, expectedPrefix, label) {
  const values = Array.isArray(actual) ? actual : [];
  const ok = expectedPrefix.every((expected, index) => values[index] === expected);
  if (!ok) {
    throw new Error(`Sidebar settings artifact contract unexpected ${label}: ${JSON.stringify(values)}`);
  }
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}
