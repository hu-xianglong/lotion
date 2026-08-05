import { relative, resolve, sep } from "node:path";

import {
  DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES
} from "./ui-suite-artifacts.mjs";
import { assertRendererCoverageSourceIntegrity } from "./renderer-coverage.mjs";

export const DEFAULT_REAL_WORKSPACE_VIEWPORT_NAMES = ["desktop", "compact"];
export const REQUIRED_REAL_WORKSPACE_RUNNERS = [
  {
    manifestName: "real-demo-workspace-ui",
    workspaceName: "Lotion Demo Space"
  },
  {
    manifestName: "real-notion-import-ui",
    workspaceName: "Notion Import"
  }
];

export function buildProductionVisualNightlyReport({
  generatedAt = new Date().toISOString(),
  productionGate,
  productionGatePath,
  realWorkspaceManifests,
  realWorkspaceManifestPaths = {},
  root = process.cwd(),
  sourceRoots = []
}) {
  assertPortableGate(productionGate);
  const realRows = REQUIRED_REAL_WORKSPACE_RUNNERS.map((runner) => buildRealWorkspaceRow({
    manifest: realWorkspaceManifests?.[runner.manifestName],
    manifestPath: realWorkspaceManifestPaths?.[runner.manifestName],
    root,
    runner
  }));
  const portableRows = productionGate.contract.suites.map((suite) => buildPortableRow(suite, root));
  const matrix = [...portableRows, ...realRows];
  const report = {
    kind: "lotion-production-visual-nightly-gate",
    status: "passed",
    generatedAt,
    reproduceCommand: "npm run test:production-visual:nightly",
    policy: {
      portableGate: "required",
      realWorkspaceBehavior: "required-no-silent-skip",
      sourceIsolation: "byte-identical-clone-and-source-unchanged",
      realWorkspaceBaselineMode: "structural-contract-only"
    },
    portable: {
      status: productionGate.status,
      gatePath: artifactPath(productionGatePath, root),
      requiredSuiteCount: productionGate.contract.requiredSuiteCount,
      snapshotCount: productionGate.contract.snapshotCount,
      perceptualBaselineCount: productionGate.contract.perceptualBaselineCount,
      requiredViewportNames: [...productionGate.contract.requiredViewportNames],
      rendererCoverage: {
        status: productionGate.rendererCoverage?.status,
        path: artifactPath(productionGate.rendererCoverage?.path, root),
        sourceEntryCount: productionGate.rendererCoverage?.sourceEntryCount,
        sourceFileCount: productionGate.rendererCoverage?.sourceFileCount,
        coveredSourceFileCount: productionGate.rendererCoverage?.coveredSourceFileCount,
        canonicalizedAliasCount: productionGate.rendererCoverage?.canonicalizedAliasCount,
        sourceInventory: productionGate.rendererCoverage?.sourceInventory,
        total: productionGate.rendererCoverage?.total,
        trend: productionGate.rendererCoverage?.trend
      }
    },
    realWorkspaces: realRows.map((row) => ({
      manifestName: row.manifestName,
      manifestPath: row.manifestPath,
      workspaceName: row.workspace,
      status: row.status,
      sourceFingerprint: row.sourceFingerprint,
      sourceUnchanged: row.sourceUnchanged,
      isolation: row.isolation,
      viewports: row.viewports,
      snapshotCount: row.snapshotCount,
      baselineMode: row.baselineMode,
      reproduceCommand: row.reproduceCommand
    })),
    summary: {
      matrixRowCount: matrix.length,
      portableSuiteCount: portableRows.length,
      realWorkspaceCount: realRows.length,
      snapshotCount: matrix.reduce((sum, row) => sum + row.snapshotCount, 0),
      perceptualBaselineCount: portableRows.reduce((sum, row) => sum + row.perceptualBaselineCount, 0),
      themes: [...new Set(matrix.map((row) => row.theme))],
      workspaces: [...new Set(matrix.map((row) => row.workspace))]
    },
    matrix
  };
  assertNoSourcePathLeak(report, sourceRoots);
  return report;
}

export function formatProductionVisualNightlyMarkdown(report) {
  const lines = [
    "# Lotion Production Visual Nightly Gate",
    "",
    `- Status: ${report.status}`,
    `- Generated: ${report.generatedAt}`,
    `- Reproduce: \`${report.reproduceCommand}\``,
    `- Portable suites: ${report.summary.portableSuiteCount}`,
    `- Real workspaces: ${report.summary.realWorkspaceCount}`,
    `- Screenshots: ${report.summary.snapshotCount}`,
    `- Committed perceptual baselines: ${report.summary.perceptualBaselineCount}`,
    `- Themes: ${report.summary.themes.join(", ")}`,
    "",
    "| Fixture kind | Workspace / fixture | Theme | Viewports | Screenshots | Baseline mode | Baseline status | Reproduce |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- |"
  ];
  for (const row of report.matrix) {
    lines.push(`| ${escapeTable(row.fixtureKind)} | ${escapeTable(row.workspace)} | ${escapeTable(row.theme)} | ${escapeTable(row.viewports.join(", "))} | ${row.snapshotCount} | ${escapeTable(row.baselineMode)} | ${escapeTable(row.baselineStatus)} | \`${escapeTable(row.reproduceCommand)}\` |`);
  }
  lines.push("", "## Artifact links", "");
  lines.push(`- Portable production gate: \`${report.portable.gatePath}\``);
  for (const workspace of report.realWorkspaces) {
    lines.push(`- ${workspace.workspaceName}: \`${workspace.manifestPath}\``);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function assertPortableGate(gate) {
  if (gate?.kind !== "lotion-production-visual-quality-gate" || gate.status !== "passed") {
    throw new Error(`Nightly production visual gate requires a passing portable gate, saw ${gate?.kind ?? "missing"}/${gate?.status ?? "missing"}.`);
  }
  const contract = gate.contract;
  if (contract?.status !== "passed") {
    throw new Error(`Nightly production visual gate requires a passing portable contract, saw ${contract?.status ?? "missing"}.`);
  }
  assertRendererCoverageSourceIntegrity(gate.rendererCoverage);
  if (contract.requiredSuiteCount !== DEFAULT_PRODUCTION_VISUAL_SCRIPTS.length || contract.suites?.length !== DEFAULT_PRODUCTION_VISUAL_SCRIPTS.length) {
    throw new Error(`Nightly production visual gate requires all ${DEFAULT_PRODUCTION_VISUAL_SCRIPTS.length} portable suites, saw ${contract?.suites?.length ?? 0}.`);
  }
  assertSameSet(contract.requiredViewportNames, DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES, "portable viewport");
  const scripts = contract.suites.map((suite) => suite.scriptPath);
  assertSameSet(scripts, DEFAULT_PRODUCTION_VISUAL_SCRIPTS, "portable suite");
  for (const suite of contract.suites) {
    assertContainsSet(suite.viewports, DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES, `${suite.name} viewport`);
    const baselines = Array.isArray(suite.perceptualBaselines) ? suite.perceptualBaselines : [];
    if (baselines.length !== DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES.length) {
      throw new Error(`Nightly production visual gate suite ${suite.name} requires ${DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES.length} perceptual baselines, saw ${baselines.length}.`);
    }
    for (const viewport of DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES) {
      const baseline = baselines.find((entry) => entry.viewport === viewport);
      if (baseline?.status !== "passed" || baseline?.kind !== "lotion-png-visual-diff") {
        throw new Error(`Nightly production visual gate suite ${suite.name} lacks a passing ${viewport} baseline.`);
      }
      if (typeof baseline.policy?.theme !== "string" || baseline.policy.theme.trim() === "") {
        throw new Error(`Nightly production visual gate suite ${suite.name} baseline ${viewport} is missing theme evidence.`);
      }
    }
  }
}

function buildPortableRow(suite, root) {
  const themes = [...new Set(suite.perceptualBaselines.map((entry) => entry.policy.theme))];
  if (themes.length !== 1) {
    throw new Error(`Nightly production visual gate suite ${suite.name} has inconsistent baseline themes: ${themes.join(", ")}.`);
  }
  return {
    fixtureKind: "deterministic-fixture",
    manifestName: "",
    manifestPath: "",
    workspace: suite.name,
    theme: themes[0],
    status: "passed",
    viewports: [...suite.viewports],
    snapshotCount: suite.snapshotCount,
    perceptualBaselineCount: suite.perceptualBaselines.length,
    baselineMode: "committed-perceptual",
    baselineStatus: "passed",
    reproduceCommand: suite.reproduceCommand,
    evidence: suite.perceptualBaselines.map((baseline) => ({
      viewport: baseline.viewport,
      policyPath: artifactPath(baseline.policyPath, root),
      expectedPath: artifactPath(baseline.expectedPath, root),
      diffPath: artifactPath(baseline.diffPath, root),
      metadataPath: artifactPath(baseline.metadataPath, root),
      diffPixels: baseline.diffPixels,
      diffRatio: baseline.diffRatio
    }))
  };
}

function buildRealWorkspaceRow({ manifest, manifestPath, root, runner }) {
  if (!manifest) throw new Error(`Nightly production visual gate is missing fresh runner ${runner.manifestName}.`);
  if (manifest.name !== runner.manifestName || manifest.status !== "passed") {
    throw new Error(`Nightly production visual gate runner ${runner.manifestName} did not pass: ${manifest.name ?? "missing"}/${manifest.status ?? "missing"}.`);
  }
  const contract = manifest.result?.artifactContract;
  const evidence = manifest.result?.realWorkspaceEvidence;
  if (contract?.status !== "passed" || contract.workspaceName !== runner.workspaceName) {
    throw new Error(`Nightly production visual gate runner ${runner.manifestName} has invalid workspace contract.`);
  }
  assertSameSet(contract.observedViewportNames, DEFAULT_REAL_WORKSPACE_VIEWPORT_NAMES, `${runner.workspaceName} viewport`);
  for (const viewport of DEFAULT_REAL_WORKSPACE_VIEWPORT_NAMES) {
    if (!contract.snapshots?.some((snapshot) => snapshot.viewport === viewport && snapshot.imageBytes > 0)) {
      throw new Error(`Nightly production visual gate runner ${runner.manifestName} lacks ${viewport} screenshot evidence.`);
    }
  }
  const sourceSha = evidence?.sourceFingerprint?.sha256;
  const cloneSha = evidence?.cloneFingerprint?.sha256;
  const beforeSha = evidence?.sourceSafety?.before?.sha256;
  const afterSha = evidence?.sourceSafety?.after?.sha256;
  if (
    evidence?.sourceIdentity?.workspaceName !== runner.workspaceName
    || evidence?.sourceIdentity?.directoryName !== runner.workspaceName
    || evidence?.isolation?.symlinksAllowed !== false
    || evidence?.isolation?.byteIdenticalAtClone !== true
    || evidence?.sourceSafety?.unchanged !== true
    || !sourceSha
    || sourceSha !== cloneSha
    || sourceSha !== beforeSha
    || sourceSha !== afterSha
  ) {
    throw new Error(`Nightly production visual gate runner ${runner.manifestName} lacks source-safety or clone-isolation evidence.`);
  }
  return {
    fixtureKind: "real-workspace-clone",
    manifestName: runner.manifestName,
    manifestPath: artifactPath(manifestPath, root),
    workspace: runner.workspaceName,
    theme: "workspace-defined",
    status: "passed",
    sourceFingerprint: evidence.sourceFingerprint,
    sourceUnchanged: true,
    isolation: evidence.isolation,
    viewports: [...contract.observedViewportNames],
    snapshotCount: contract.snapshotCount,
    perceptualBaselineCount: 0,
    baselineMode: "structural-contract-only",
    baselineStatus: "passed",
    reproduceCommand: contract.reproduceCommand,
    evidence: contract.snapshots.map((snapshot) => ({
      viewport: snapshot.viewport,
      phase: snapshot.phase,
      imageBytes: snapshot.imageBytes,
      imagePath: artifactPath(snapshot.imagePath, root),
      metadataPath: artifactPath(snapshot.metadataPath, root)
    }))
  };
}

function assertSameSet(actual, expected, label) {
  const actualValues = [...new Set(Array.isArray(actual) ? actual : [])].sort();
  const expectedValues = [...new Set(expected)].sort();
  if (JSON.stringify(actualValues) !== JSON.stringify(expectedValues)) {
    throw new Error(`Nightly production visual gate ${label} coverage mismatch: expected ${expectedValues.join(", ")}, saw ${actualValues.join(", ") || "none"}.`);
  }
}

function assertContainsSet(actual, expected, label) {
  const actualValues = [...new Set(Array.isArray(actual) ? actual : [])].sort();
  const expectedValues = [...new Set(expected)].sort();
  const missingValues = expectedValues.filter((value) => !actualValues.includes(value));
  if (missingValues.length > 0) {
    throw new Error(`Nightly production visual gate ${label} coverage mismatch: required ${expectedValues.join(", ")}, saw ${actualValues.join(", ") || "none"}; missing ${missingValues.join(", ")}.`);
  }
}

function assertNoSourcePathLeak(report, sourceRoots) {
  const serialized = JSON.stringify(report);
  for (const sourceRoot of sourceRoots.filter(Boolean)) {
    if (serialized.includes(String(sourceRoot))) {
      throw new Error("Nightly production visual gate artifact exposed an original real-workspace path.");
    }
  }
  if (/"source(?:Root|Path)"\s*:/.test(serialized)) {
    throw new Error("Nightly production visual gate artifact exposed a source path field.");
  }
}

function artifactPath(path, root) {
  if (!path) return "";
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(path);
  const rel = relative(absoluteRoot, absolutePath);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`))
    ? rel.replaceAll("\\", "/")
    : String(path);
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}
