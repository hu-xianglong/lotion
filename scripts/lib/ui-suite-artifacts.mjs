import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_PRODUCTION_VISUAL_SCRIPTS = [
  "scripts/smoke-design-system-ui.mjs",
  "scripts/smoke-white-theme-ui.mjs",
  "scripts/smoke-search-ui.mjs",
  "scripts/smoke-search-ai-ui.mjs",
  "scripts/smoke-markdown-preview-ui.mjs",
  "scripts/smoke-embedded-view-ui.mjs",
  "scripts/smoke-database-created-views-ui.mjs",
  "scripts/smoke-row-page-property-visual-ui.mjs",
  "scripts/smoke-page-secondary-ui.mjs",
  "scripts/smoke-notion-import-ui.mjs",
  "scripts/smoke-settings-center-ui.mjs",
  "scripts/smoke-plugin-manager-ui.mjs",
  "scripts/smoke-llm-chat-ui.mjs",
  "scripts/smoke-advanced-search-ui.mjs"
];

export const DEFAULT_PRODUCTION_VISUAL_FILTER = DEFAULT_PRODUCTION_VISUAL_SCRIPTS
  .map((scriptPath) => scriptPath.replace(/^scripts\//, ""))
  .join(",");

export const DEFAULT_PRODUCTION_VISUAL_VIEWPORTS = "desktop,compact,wide:1728x1100";
export const DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES = ["desktop", "compact", "wide"];

export function productionVisualViewportNamesFromSelection(selection = DEFAULT_PRODUCTION_VISUAL_VIEWPORTS) {
  const raw = String(selection || "").trim();
  if (!raw) return [...DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES];
  const names = raw.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = /^([a-z0-9_-]+)(?::(\d+)x(\d+))?$/i.exec(entry);
      if (!match) {
        throw new Error(`Invalid production visual viewport selection: ${entry}`);
      }
      return match[1];
    });
  if (names.length === 0) return [...DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES];
  return uniqueStrings(names);
}

export function buildUiSuiteArtifactIndex(summary, {
  generatedAt = new Date().toISOString()
} = {}) {
  const suites = Array.isArray(summary?.results)
    ? summary.results.map((entry) => suiteEntry(entry))
    : [];
  const passedCount = suites.filter((entry) => entry.status === "passed").length;
  const consoleErrorCount = suites.reduce((total, entry) => total + entry.consoleErrorCount, 0);
  const snapshotCount = suites.reduce((total, entry) => total + (entry.artifactContract?.snapshotCount || 0), 0);
  const imageBytesTotal = suites.reduce((total, entry) => total + (entry.artifactContract?.imageBytesTotal || 0), 0);
  const missingArtifactContractCount = suites.filter((entry) => entry.artifactContractStatus === "missing").length;
  const slowestSuites = [...suites]
    .sort((left, right) => right.elapsedMs - left.elapsedMs)
    .slice(0, 3)
    .map((suite) => ({
      name: suite.name,
      elapsedMs: suite.elapsedMs,
      reproduceCommand: suite.reproduceCommand
    }));
  const environment = environmentEntry(summary?.environment, {
    filter: summary?.filter,
    suites
  });

  return {
    kind: "lotion-ui-suite-artifact-index",
    generatedAt,
    environment,
    filter: summary?.filter || null,
    selectedCount: typeof summary?.selectedCount === "number" ? summary.selectedCount : suites.length,
    passedCount,
    totalMs: typeof summary?.totalMs === "number" ? summary.totalMs : 0,
    consoleErrorCount,
    snapshotCount,
    imageBytesTotal,
    missingArtifactContractCount,
    slowestSuites,
    suites
  };
}

export function assertProductionVisualGateContract(index, {
  requiredSuiteScripts = DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  requiredViewportNames = DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES,
  minImageBytesPerRequiredSnapshot = 512,
  minSnapshotsPerRequiredSuite = 2
} = {}) {
  const base = assertUiSuiteArtifactIndexContract(index, { requiredViewportNames });
  if (base.consoleErrorCount !== 0) {
    throw new Error(`Production visual gate found console errors: ${base.consoleErrorCount}`);
  }
  if (base.missingArtifactContractCount !== 0) {
    throw new Error(`Production visual gate found missing artifact contract(s): ${base.missingArtifactContractCount}`);
  }

  const suitesByScript = new Map(index.suites.map((suite) => [normalizeScriptPath(suite.scriptPath), suite]));
  const requiredSuites = [];
  for (const script of requiredSuiteScripts.map(normalizeScriptPath)) {
    const suite = suitesByScript.get(script);
    if (!suite) {
      throw new Error(`Production visual gate missing required suite script: ${script}`);
    }
    assertProductionSuiteEvidence(suite, {
      minImageBytesPerRequiredSnapshot,
      minSnapshotsPerRequiredSuite,
      requiredViewportNames
    });
    requiredSuites.push({
      name: suite.name,
      scriptPath: suite.scriptPath,
      snapshotCount: suite.artifactContract.snapshotCount,
      viewports: suite.observedViewportNames,
      reproduceCommand: suite.reproduceCommand,
      representativeSnapshotPaths: suite.artifactContract.representativeSnapshotPaths
    });
  }

  return {
    status: "passed",
    requiredSuiteCount: requiredSuites.length,
    requiredViewportNames,
    snapshotCount: base.snapshotCount,
    imageBytesTotal: base.imageBytesTotal,
    suites: requiredSuites
  };
}

export function assertUiSuiteArtifactIndexContract(index, {
  requiredViewportNames = ["desktop", "compact"]
} = {}) {
  if (!index || index.kind !== "lotion-ui-suite-artifact-index") {
    throw new Error(`Invalid UI suite artifact index kind: ${JSON.stringify(index?.kind)}`);
  }
  if (!Array.isArray(index.suites) || index.suites.length === 0) {
    throw new Error("UI suite artifact index has no child suites.");
  }
  if (typeof index.selectedCount === "number" && index.selectedCount !== index.suites.length) {
    throw new Error(`UI suite artifact index selectedCount mismatch: ${JSON.stringify({
      selectedCount: index.selectedCount,
      suites: index.suites.length
    })}`);
  }

  for (const suite of index.suites) {
    assertSuiteEntry(suite, requiredViewportNames);
  }
  assertEnvironmentEntry(index.environment, requiredViewportNames);

  return {
    suiteCount: index.suites.length,
    passedCount: index.passedCount,
    consoleErrorCount: index.consoleErrorCount,
    snapshotCount: index.snapshotCount,
    imageBytesTotal: index.imageBytesTotal,
    missingArtifactContractCount: index.missingArtifactContractCount
  };
}

function assertProductionSuiteEvidence(suite, {
  minImageBytesPerRequiredSnapshot,
  minSnapshotsPerRequiredSuite,
  requiredViewportNames
}) {
  if (!suite.artifactContract) {
    throw new Error(`Production visual gate suite ${suite.name} is missing artifact contract evidence.`);
  }
  if (suite.artifactContract.snapshotCount < minSnapshotsPerRequiredSuite) {
    throw new Error(`Production visual gate suite ${suite.name} has too few screenshots: ${suite.artifactContract.snapshotCount}`);
  }
  for (const viewportName of requiredViewportNames) {
    const snapshot = suite.artifactContract.snapshots.find((candidate) => candidate.viewport === viewportName);
    if (!snapshot) {
      throw new Error(`Production visual gate suite ${suite.name} lacks a ${viewportName} screenshot.`);
    }
    if (!snapshot.imagePath || !snapshot.metadataPath || snapshot.imageBytes <= 0) {
      throw new Error(`Production visual gate suite ${suite.name} has weak ${viewportName} screenshot evidence: ${JSON.stringify(snapshot)}`);
    }
    if (snapshot.imageBytes < minImageBytesPerRequiredSnapshot) {
      throw new Error(`Production visual gate suite ${suite.name} has undersized ${viewportName} screenshot evidence: ${snapshot.imageBytes}`);
    }
    assertProductionSnapshotMetrics(snapshot, suite.name, viewportName);
  }
  if (!suite.artifactContract.detailText) {
    throw new Error(`Production visual gate suite ${suite.name} has no readable artifact detail text.`);
  }
  if (!/^LOTION_UI_SUITE_FILTER=.+ npm run smoke:ui$/.test(suite.reproduceCommand)) {
    throw new Error(`Production visual gate suite ${suite.name} has no focused reproduce command: ${suite.reproduceCommand}`);
  }
}

function assertProductionSnapshotMetrics(snapshot, suiteName, viewportName) {
  const details = snapshot?.details || {};
  const horizontalOverflowPx = numeric(details.horizontalOverflowPx);
  if (horizontalOverflowPx > 0) {
    throw new Error(`Production visual gate suite ${suiteName} has horizontal overflow in ${viewportName}: ${horizontalOverflowPx}px`);
  }
  const scrollWidth = numeric(details.scrollWidth);
  const viewportWidth = numeric(details.viewportWidth);
  if (scrollWidth > 0 && viewportWidth > 0 && scrollWidth > viewportWidth + 1) {
    throw new Error(`Production visual gate suite ${suiteName} scrolls horizontally in ${viewportName}: ${JSON.stringify({ scrollWidth, viewportWidth })}`);
  }
  const overlappingTabs = numeric(details.overlappingTabs);
  if (overlappingTabs > 0) {
    throw new Error(`Production visual gate suite ${suiteName} has overlapping tabs in ${viewportName}: ${overlappingTabs}`);
  }
}

export async function writeUiSuiteArtifactIndex({ artifactRoot, summary }) {
  if (!artifactRoot) throw new Error("writeUiSuiteArtifactIndex requires artifactRoot");
  await mkdir(artifactRoot, { recursive: true });
  const index = buildUiSuiteArtifactIndex(summary);
  const contract = assertUiSuiteArtifactIndexContract(index);
  const jsonPath = join(artifactRoot, "ui-suite-artifacts.json");
  const markdownPath = join(artifactRoot, "ui-suite-artifacts.md");
  await writeFile(jsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, formatUiSuiteArtifactIndexMarkdown(index), "utf8");
  return {
    contract,
    jsonPath,
    markdownPath,
    summary: {
      kind: index.kind,
      suiteCount: index.suites.length,
      passedCount: index.passedCount,
      consoleErrorCount: index.consoleErrorCount,
      snapshotCount: index.snapshotCount,
      imageBytesTotal: index.imageBytesTotal,
      missingArtifactContractCount: index.missingArtifactContractCount,
      slowestSuites: index.slowestSuites
    }
  };
}

export function formatUiSuiteArtifactIndexMarkdown(index) {
  const lines = [
    "# Lotion UI Regression Artifact Index",
    "",
    `- Generated: ${index.generatedAt}`,
    `- Suites: ${index.passedCount}/${index.suites.length} passed`,
    `- Environment: ${formatEnvironment(index.environment)}`,
    `- Suite scripts: ${formatSelectedScripts(index.environment?.selectedSuiteScripts)}`,
    `- Total duration: ${formatDuration(index.totalMs)}`,
    `- Console errors: ${index.consoleErrorCount}`,
    `- Screenshots: ${index.snapshotCount}`,
    `- Screenshot bytes: ${index.imageBytesTotal}`,
    `- Missing artifact contracts: ${index.missingArtifactContractCount}`,
    `- Slowest suites: ${formatSlowestSuites(index.slowestSuites)}`,
    "",
    "| Suite | Status | Elapsed | Viewports | Console errors | Snapshots | Details | Artifacts | Reproduce | Manifest |",
    "| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | --- |"
  ];

  for (const suite of index.suites) {
    const viewports = suite.observedViewportNames.join(", ") || "none";
    const snapshots = suite.artifactContract?.snapshotCount ?? 0;
    const detailText = suite.artifactContractStatus === "missing"
      ? "missing artifact contract"
      : suite.artifactContract?.detailText || "";
    lines.push(`| ${escapeMarkdownTable(suite.name)} | ${suite.status} | ${formatDuration(suite.elapsedMs)} | ${escapeMarkdownTable(viewports)} | ${suite.consoleErrorCount} | ${snapshots} | ${escapeMarkdownTable(formatSuiteDetails(suite, detailText))} | ${escapeMarkdownTable(formatArtifactLinks(suite))} | \`${escapeMarkdownTable(suite.reproduceCommand)}\` | \`${suite.manifestPath}\` |`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function suiteEntry(entry) {
  const manifest = entry?.harnessManifest || {};
  const artifactContract = artifactContractEntry(manifest.artifactContract);
  const observedViewportNames = uniqueStrings([
    ...(Array.isArray(manifest.observedViewports) ? manifest.observedViewports : []),
    ...(Array.isArray(artifactContract?.observedViewportNames) ? artifactContract.observedViewportNames : [])
  ]);
  return {
    name: String(entry?.name || manifest.name || "Unnamed UI smoke"),
    status: statusFromEntry(entry, manifest),
    elapsedMs: typeof entry?.elapsedMs === "number" ? entry.elapsedMs : 0,
    reproduceCommand: String(entry?.reproduceCommand || manifest.reproduceCommand || ""),
    scriptPath: String(entry?.scriptPath || manifest.scriptPath || ""),
    manifestPath: String(manifest.path || ""),
    artifactRoot: String(manifest.artifactRoot || ""),
    observedViewportNames,
    missingScreenshotViewportNames: artifactContract
      ? observedViewportNames.filter((viewportName) => !artifactContract.screenshotViewportNames.includes(viewportName))
      : [],
    missingViewportNames: uniqueStrings(Array.isArray(manifest.missingViewportNames) ? manifest.missingViewportNames : []),
    consoleErrorCount: typeof manifest.consoleErrorCount === "number" ? manifest.consoleErrorCount : 0,
    consoleIssues: consoleIssueEntries(manifest.consoleIssues || manifest.logs?.consoleIssues),
    artifactContractStatus: artifactContract ? "present" : "missing",
    artifactContract,
    failureArtifacts: failureArtifactsEntry(manifest.failureArtifacts)
  };
}

function environmentEntry(raw, { filter, suites } = {}) {
  const selectedViewports = selectedViewportEntries(raw?.selectedViewports, raw?.selectedViewportNames, suites);
  const selectedViewportNames = uniqueStrings([
    ...(Array.isArray(raw?.selectedViewportNames) && raw.selectedViewportNames.length > 0 ? raw.selectedViewportNames : []),
    ...selectedViewports.map((viewport) => viewport.name)
  ]);
  const explicitSuiteScripts = uniqueStrings([
    ...(Array.isArray(raw?.selectedSuiteScripts) ? raw.selectedSuiteScripts : []),
    ...(Array.isArray(raw?.selectedScripts) ? raw.selectedScripts : [])
  ]);
  const selectedSuiteScripts = explicitSuiteScripts.length > 0
    ? explicitSuiteScripts
    : uniqueStrings(Array.isArray(suites) ? suites.map((suite) => suite.scriptPath) : []);
  return {
    nodeVersion: String(raw?.nodeVersion || process.versions?.node || "unknown"),
    platform: String(raw?.platform || process.platform || "unknown"),
    arch: String(raw?.arch || process.arch || "unknown"),
    ci: Boolean(raw?.ci),
    selectedViewportNames,
    selectedViewports,
    filter: uniqueStrings(Array.isArray(raw?.filter) ? raw.filter : filter),
    selectedSuiteScripts,
    runner: String(raw?.runner || "npm run smoke:ui")
  };
}

function selectedViewportEntries(viewports, viewportNames, suites) {
  const entries = [];
  for (const viewport of Array.isArray(viewports) ? viewports : []) {
    const name = String(viewport?.name || "");
    if (!name) continue;
    entries.push({
      name,
      width: numeric(viewport?.width),
      height: numeric(viewport?.height)
    });
  }
  if (entries.length > 0) return dedupeViewports(entries);

  const explicitNames = uniqueStrings(Array.isArray(viewportNames) ? viewportNames : []);
  const names = explicitNames.length > 0
    ? explicitNames
    : uniqueStrings(Array.isArray(suites) ? suites.flatMap((suite) => suite.observedViewportNames || []) : []);
  return names.map((name) => ({ name, width: 0, height: 0 }));
}

function dedupeViewports(viewports) {
  const seen = new Set();
  const result = [];
  for (const viewport of viewports) {
    if (seen.has(viewport.name)) continue;
    seen.add(viewport.name);
    result.push(viewport);
  }
  return result;
}

function artifactContractEntry(contract) {
  if (!contract || typeof contract !== "object") return null;
  const snapshots = Array.isArray(contract.snapshots) ? contract.snapshots : [];
  const imageBytesTotal = snapshots.reduce((total, snapshot) => total + numeric(snapshot?.imageBytes), 0);
  const mappedSnapshots = snapshots.map((snapshot) => ({
    viewport: String(snapshot?.viewport || ""),
    imagePath: String(snapshot?.imagePath || ""),
    metadataPath: String(snapshot?.metadataPath || ""),
    imageBytes: numeric(snapshot?.imageBytes),
    details: snapshotDetails(snapshot)
  }));
  return {
    status: String(contract.status || ""),
    expectedViewportNames: uniqueStrings(contract.expectedViewportNames),
    observedViewportNames: uniqueStrings(contract.observedViewportNames),
    snapshotCount: typeof contract.snapshotCount === "number" ? contract.snapshotCount : snapshots.length,
    imageBytesTotal,
    detailText: summarizeSnapshotDetails(snapshots),
    representativeSnapshotPaths: uniqueStrings(mappedSnapshots.map((snapshot) => snapshot.imagePath)).slice(0, 3),
    screenshotViewportNames: uniqueStrings(mappedSnapshots.map((snapshot) => snapshot.viewport)),
    snapshots: mappedSnapshots
  };
}

function statusFromEntry(entry, manifest) {
  if (typeof manifest.status === "string" && manifest.status) return manifest.status;
  return entry?.status === 0 ? "passed" : "failed";
}

function failureArtifactsEntry(artifacts) {
  if (!artifacts || typeof artifacts !== "object") return null;
  const result = {};
  for (const key of ["readme", "screenshot", "dom", "console", "consoleJson", "devLog", "error", "state", "metadata"]) {
    const value = artifacts[key];
    if (typeof value === "string" && value) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function consoleIssueEntries(issues) {
  const entries = Array.isArray(issues) ? issues : [];
  return entries.slice(0, 5).map((issue) => ({
    type: String(issue?.type || "error").slice(0, 40),
    text: truncateOneLine(issue?.text || issue?.message || issue?.stack || "", 180),
    location: issue?.location && typeof issue.location === "object"
      ? {
        url: truncateOneLine(issue.location.url || "", 160),
        lineNumber: typeof issue.location.lineNumber === "number" ? issue.location.lineNumber : undefined,
        columnNumber: typeof issue.location.columnNumber === "number" ? issue.location.columnNumber : undefined
      }
      : null
  })).filter((issue) => issue.text);
}

function assertSuiteEntry(suite, requiredViewportNames) {
  if (!suite.name) throw new Error("UI suite artifact index has a child suite without a name.");
  if (!Number.isFinite(suite.elapsedMs) || suite.elapsedMs < 0) {
    throw new Error(`UI suite ${suite.name} has an invalid elapsed time: ${suite.elapsedMs}`);
  }
  if (!suite.scriptPath) throw new Error(`UI suite ${suite.name} is missing a script path.`);
  if (!suite.reproduceCommand) throw new Error(`UI suite ${suite.name} is missing a reproduce command.`);
  if (!suite.manifestPath) throw new Error(`UI suite ${suite.name} is missing a manifest path.`);
  if (!suite.artifactRoot) throw new Error(`UI suite ${suite.name} is missing an artifact root.`);
  if (suite.status !== "passed") throw new Error(`UI suite ${suite.name} did not pass: ${suite.status}`);
  if (suite.consoleErrorCount !== 0) throw new Error(`UI suite ${suite.name} has console errors: ${suite.consoleErrorCount}`);
  if (suite.missingViewportNames.length > 0) {
    throw new Error(`UI suite ${suite.name} is missing viewport(s): ${suite.missingViewportNames.join(", ")}`);
  }
  for (const viewportName of requiredViewportNames) {
    if (!suite.observedViewportNames.includes(viewportName)) {
      throw new Error(`UI suite ${suite.name} did not observe viewport ${viewportName}. Observed: ${suite.observedViewportNames.join(", ") || "none"}`);
    }
  }

  if (suite.artifactContract) {
    if (suite.missingScreenshotViewportNames.length > 0) {
      throw new Error(`UI suite ${suite.name} is missing screenshot viewport(s): ${suite.missingScreenshotViewportNames.join(", ")}`);
    }
    if (suite.artifactContract.status !== "passed") {
      throw new Error(`UI suite ${suite.name} artifact contract did not pass: ${suite.artifactContract.status}`);
    }
    if (suite.artifactContract.snapshotCount <= 0) {
      throw new Error(`UI suite ${suite.name} artifact contract has no screenshots.`);
    }
    if (suite.artifactContract.imageBytesTotal <= 0) {
      throw new Error(`UI suite ${suite.name} artifact contract has no screenshot bytes.`);
    }
  }
}

function assertEnvironmentEntry(environment, requiredViewportNames) {
  if (!environment || typeof environment !== "object") {
    throw new Error("UI suite artifact index is missing environment metadata.");
  }
  for (const key of ["nodeVersion", "platform", "arch", "runner"]) {
    if (!environment[key]) throw new Error(`UI suite artifact index environment is missing ${key}.`);
  }
  if (!Array.isArray(environment.selectedViewportNames) || environment.selectedViewportNames.length === 0) {
    throw new Error("UI suite artifact index environment has no selected viewport names.");
  }
  for (const viewportName of requiredViewportNames) {
    if (!environment.selectedViewportNames.includes(viewportName)) {
      throw new Error(`UI suite artifact index environment did not include selected viewport ${viewportName}.`);
    }
  }
  if (!Array.isArray(environment.selectedSuiteScripts)) {
    throw new Error("UI suite artifact index environment has no selected suite scripts.");
  }
}

function uniqueStrings(values) {
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "");
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

function normalizeScriptPath(value) {
  const text = String(value || "").replace(/\\/g, "/");
  return text.startsWith("./") ? text.slice(2) : text;
}

function numeric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function escapeMarkdownTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function formatArtifactLinks(suite) {
  const parts = [];
  if (suite.artifactRoot) parts.push(`root=${suite.artifactRoot}`);
  const snapshotPaths = suite.artifactContract?.representativeSnapshotPaths || [];
  if (snapshotPaths.length > 0) {
    parts.push(`screenshots=${snapshotPaths.map((snapshotPath) => `\`${snapshotPath}\``).join(", ")}`);
  }
  if (suite.failureArtifacts?.readme) parts.push(`failure=\`${suite.failureArtifacts.readme}\``);
  if (suite.failureArtifacts?.screenshot) parts.push(`failure screenshot=\`${suite.failureArtifacts.screenshot}\``);
  return parts.join("; ");
}

function formatDuration(ms) {
  const value = numeric(ms);
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatSlowestSuites(suites) {
  const entries = Array.isArray(suites) ? suites : [];
  if (entries.length === 0) return "none";
  return entries.map((suite) => `${suite.name} ${formatDuration(suite.elapsedMs)}`).join(", ");
}

function formatEnvironment(environment) {
  if (!environment) return "missing";
  const viewports = environment.selectedViewports
    ?.map((viewport) => viewport.width > 0 && viewport.height > 0
      ? `${viewport.name}(${viewport.width}x${viewport.height})`
      : viewport.name)
    .join(", ") || environment.selectedViewportNames?.join(", ") || "none";
  const filter = environment.filter?.length > 0 ? environment.filter.join(", ") : "none";
  return `node=${environment.nodeVersion}, platform=${environment.platform}/${environment.arch}, ci=${environment.ci ? "true" : "false"}, viewports=${viewports}, filter=${filter}`;
}

function formatSelectedScripts(scripts) {
  const entries = Array.isArray(scripts) ? scripts : [];
  if (entries.length === 0) return "none";
  const shown = entries.slice(0, 6).join(", ");
  return entries.length > 6 ? `${shown}, +${entries.length - 6} more` : shown;
}

function formatSuiteDetails(suite, detailText) {
  const parts = [];
  if (detailText) parts.push(detailText);
  if (suite.missingScreenshotViewportNames?.length > 0) {
    parts.push(`missing screenshots=${suite.missingScreenshotViewportNames.join(", ")}`);
  }
  if (suite.consoleIssues?.length > 0) {
    parts.push(`console=${formatConsoleIssues(suite.consoleIssues)}`);
  }
  return parts.join("; ");
}

function formatConsoleIssues(issues) {
  return issues
    .slice(0, 3)
    .map((issue) => `${issue.type}: ${issue.text}`)
    .join(" | ");
}

function snapshotDetails(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return {};
  const details = {};
  for (const [key, value] of Object.entries(snapshot)) {
    if (["imageBytes", "imagePath", "metadataPath", "viewport"].includes(key)) continue;
    const sanitized = sanitizeDetailValue(value);
    if (sanitized !== undefined) details[key] = sanitized;
  }
  return details;
}

function sanitizeDetailValue(value) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const sanitized = value.map((entry) => sanitizeDetailValue(entry)).filter((entry) => entry !== undefined);
    return sanitized.length > 0 ? sanitized.slice(0, 20) : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const result = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (["imagePath", "metadataPath"].includes(key)) continue;
    const sanitized = sanitizeDetailValue(nestedValue);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function truncateOneLine(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function summarizeSnapshotDetails(snapshots) {
  const parts = [];
  for (const snapshot of snapshots) {
    const details = snapshotDetails(snapshot);
    const viewport = String(snapshot?.viewport || "viewport");
    const summary = [];
    for (const key of [
      "phase",
      "backlinkItems",
      "categoryCount",
      "detailCount",
      "expectedTocItems",
      "pathButtons",
      "openedCount",
      "pluginRows",
      "providerRows",
      "resultCount",
      "sourceLinkCount",
      "phaseCount",
      "searchAiPluginHosts",
      "messageCount",
      "historyItems",
      "rowCountText",
      "activeTabText",
      "visibleTabs",
      "horizontalOverflowPx",
      "scrollWidth",
      "viewportWidth",
      "surfaceCount",
      "tokenCount"
    ]) {
      if (details[key] !== undefined) summary.push(`${key}=${details[key]}`);
    }
    if (details.selectedSource) summary.push(`selectedSource=${truncateOneLine(details.selectedSource, 80)}`);
    if (details.summary && typeof details.summary === "object") {
      for (const key of ["Source CSVs", "Source HTMLs", "Imported mappings", "Issues", "Warnings"]) {
        if (details.summary[key] !== undefined) summary.push(`${key}=${details.summary[key]}`);
      }
    }
    if (details.issueKinds && typeof details.issueKinds === "object") {
      for (const [kind, count] of Object.entries(details.issueKinds).slice(0, 3)) {
        summary.push(`${kind}=${count}`);
      }
    }
    if (summary.length > 0) parts.push(`${viewport}: ${summary.join(", ")}`);
  }
  const text = parts.join("; ");
  return text.length > 720 ? `${text.slice(0, 717)}...` : text;
}
