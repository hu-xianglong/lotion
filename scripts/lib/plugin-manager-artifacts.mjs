import { readFile, stat } from "node:fs/promises";

const REQUIRED_PLUGINS = [
  "Default Field Types",
  "Kanban View",
  "Notion Import",
  "LLM Providers",
  "Git Sync"
];

const REQUIRED_PERMISSION_SUMMARY = {
  "Notion Import": ["workspace.read", "workspace.write", "vault.fs"],
  "Git Sync": ["workspace.write", "network", "shell"]
};

const REQUIRED_DETAIL_PLUGINS = [
  "Notion Import",
  "LLM Providers",
  "Git Sync"
];

export async function assertPluginManagerArtifactContract(summary, {
  expectedViewportNames = ["desktop", "compact"]
} = {}) {
  if (summary?.status !== "passed") {
    throw new Error(`Plugin manager artifact contract requires passed smoke status, saw ${summary?.status ?? "missing"}`);
  }
  const viewports = Array.isArray(summary?.viewports) ? summary.viewports : [];
  const observedViewportNames = viewports.map(viewportNameFromEntry).filter(Boolean);
  const missing = expectedViewportNames.filter((name) => !observedViewportNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`Plugin manager artifact contract missing viewport(s): ${missing.join(", ")}`);
  }

  const snapshots = [];
  for (const viewportName of expectedViewportNames) {
    const entry = viewports.find((candidate) => viewportNameFromEntry(candidate) === viewportName);
    if (!entry) throw new Error(`Plugin manager artifact contract missing entry for ${viewportName}`);
    assertPluginManagerViewport(entry, viewportName);
    snapshots.push(await assertPluginManagerSnapshot(entry, viewportName));
  }

  return {
    status: "passed",
    expectedViewportNames,
    observedViewportNames,
    snapshotCount: snapshots.length,
    snapshots
  };
}

function assertPluginManagerViewport(entry, viewportName) {
  const summary = entry.summary || {};
  if (!Number.isFinite(summary.pluginRows) || summary.pluginRows < REQUIRED_PLUGINS.length) {
    throw new Error(`Plugin manager artifact contract missing plugin rows for ${viewportName}: ${JSON.stringify(summary)}`);
  }
  if (!Number.isFinite(summary.providerRows) || summary.providerRows < 1) {
    throw new Error(`Plugin manager artifact contract missing provider rows for ${viewportName}: ${JSON.stringify(summary)}`);
  }
  if (!Number.isFinite(summary.settingsHosts) || summary.settingsHosts !== 0) {
    throw new Error(`Plugin manager artifact contract expected settings hosts to be unmounted on list view for ${viewportName}: ${JSON.stringify(summary)}`);
  }
  const listedPlugins = Array.isArray(entry.listedPlugins) ? entry.listedPlugins : [];
  for (const plugin of REQUIRED_PLUGINS) {
    if (!listedPlugins.includes(plugin)) {
      throw new Error(`Plugin manager artifact contract missing listed plugin ${plugin} for ${viewportName}: ${JSON.stringify(listedPlugins)}`);
    }
  }

  assertPermissionSummary(entry.permissionSummary, viewportName);
  for (const title of ["Open Notion Import", "Backup Now"]) {
    if (!Array.isArray(entry.extensionPointTitles) || !entry.extensionPointTitles.includes(title)) {
      throw new Error(`Plugin manager artifact contract missing extension point ${title} for ${viewportName}: ${JSON.stringify(entry.extensionPointTitles)}`);
    }
  }
  if (!String(entry.sourceDrilldown?.sourceText || "").includes("Notion Import")) {
    throw new Error(`Plugin manager artifact contract missing Notion Import extension source drilldown for ${viewportName}: ${JSON.stringify(entry.sourceDrilldown)}`);
  }
  if (!String(entry.providerSourceDrilldown?.sourceText || "").includes("Default Field Types")) {
    throw new Error(`Plugin manager artifact contract missing field provider source drilldown for ${viewportName}: ${JSON.stringify(entry.providerSourceDrilldown)}`);
  }

  assertPluginDetails(entry.details, viewportName);
  assertLifecycleControls(entry.lifecycle, viewportName);
  assertCommandSearch(entry.commandSearch, viewportName);
  if (!String(entry.notification?.renderedText || "").includes("Plugin notify smoke")) {
    throw new Error(`Plugin manager artifact contract missing notification toast evidence for ${viewportName}: ${JSON.stringify(entry.notification)}`);
  }
}

function assertPermissionSummary(permissionSummary, viewportName) {
  for (const [pluginName, permissions] of Object.entries(REQUIRED_PERMISSION_SUMMARY)) {
    const actual = permissionSummary?.[pluginName];
    if (!Array.isArray(actual)) {
      throw new Error(`Plugin manager artifact contract missing permission summary for ${pluginName} in ${viewportName}: ${JSON.stringify(permissionSummary)}`);
    }
    for (const permission of permissions) {
      if (!actual.includes(permission)) {
        throw new Error(`Plugin manager artifact contract missing permission ${permission} for ${pluginName} in ${viewportName}: ${JSON.stringify(actual)}`);
      }
    }
  }
}

function assertPluginDetails(details, viewportName) {
  const rows = Array.isArray(details) ? details : [];
  for (const name of REQUIRED_DETAIL_PLUGINS) {
    const detail = rows.find((entry) => entry?.name === name);
    if (!detail) {
      throw new Error(`Plugin manager artifact contract missing detail coverage for ${name} in ${viewportName}: ${JSON.stringify(rows)}`);
    }
    if (detail.initialSettingsHosts !== 0 || !Number.isFinite(detail.settingsHosts) || detail.settingsHosts < 1) {
      throw new Error(`Plugin manager artifact contract detail tabs did not mount/unmount settings for ${name} in ${viewportName}: ${JSON.stringify(detail)}`);
    }
  }
}

function assertLifecycleControls(lifecycle, viewportName) {
  if (lifecycle?.disabledStatus !== "disabled" || lifecycle?.enabledStatus !== "active") {
    throw new Error(`Plugin manager artifact contract missing lifecycle status transition for ${viewportName}: ${JSON.stringify(lifecycle)}`);
  }
  if (lifecycle.providerRemovedOnDisable !== true) {
    throw new Error(`Plugin manager artifact contract missing provider unregister evidence for ${viewportName}: ${JSON.stringify(lifecycle)}`);
  }
  if (lifecycle.requiredControl !== "Default Field Types") {
    throw new Error(`Plugin manager artifact contract missing required core plugin evidence for ${viewportName}: ${JSON.stringify(lifecycle)}`);
  }
}

function assertCommandSearch(commandSearch, viewportName) {
  if (commandSearch?.query !== "Open Notion Import") {
    throw new Error(`Plugin manager artifact contract missing command query in ${viewportName}: ${JSON.stringify(commandSearch)}`);
  }
  if (!Number.isFinite(commandSearch.filter?.resultCount) || commandSearch.filter.resultCount < 1) {
    throw new Error(`Plugin manager artifact contract command filter has no results in ${viewportName}: ${JSON.stringify(commandSearch.filter)}`);
  }
  for (const activation of ["click", "enter"]) {
    const result = commandSearch?.[activation];
    if (result?.modalTitle !== "Import from Notion" || !String(result.renderedText || "").includes("Open Notion Import")) {
      throw new Error(`Plugin manager artifact contract command ${activation} did not open Notion Import modal in ${viewportName}: ${JSON.stringify(result)}`);
    }
  }
}

async function assertPluginManagerSnapshot(entry, viewportName) {
  const snapshot = entry.snapshot;
  if (!snapshot?.imagePath || !snapshot?.metadataPath) {
    throw new Error(`Plugin manager artifact contract missing snapshot paths for ${viewportName}`);
  }
  const imageInfo = await stat(snapshot.imagePath);
  if (imageInfo.size <= 0) {
    throw new Error(`Plugin manager artifact contract found empty snapshot image for ${viewportName}: ${snapshot.imagePath}`);
  }
  const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
  const payload = metadata.metadata || {};
  if (metadata.viewport?.name !== viewportName) {
    throw new Error(`Plugin manager artifact contract viewport mismatch for ${viewportName}: ${JSON.stringify(metadata.viewport)}`);
  }
  if ((payload.summary?.pluginRows ?? 0) < REQUIRED_PLUGINS.length) {
    throw new Error(`Plugin manager artifact contract snapshot missing plugin row metadata for ${viewportName}: ${JSON.stringify(payload.summary)}`);
  }
  const listedPlugins = Array.isArray(payload.listedPlugins) ? payload.listedPlugins : [];
  for (const plugin of REQUIRED_PLUGINS) {
    if (!listedPlugins.includes(plugin)) {
      throw new Error(`Plugin manager artifact contract snapshot missing plugin ${plugin} for ${viewportName}: ${JSON.stringify(listedPlugins)}`);
    }
  }
  assertLifecycleControls(payload.lifecycle, viewportName);
  return {
    viewport: viewportName,
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    pluginRows: payload.summary.pluginRows,
    providerRows: payload.summary.providerRows,
    detailCount: Array.isArray(payload.details) ? payload.details.length : 0,
    lifecycle: payload.lifecycle,
    commandQuery: payload.commandSearch?.query || ""
  };
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}

export function requiredPluginManagerPlugins() {
  return [...REQUIRED_PLUGINS];
}
