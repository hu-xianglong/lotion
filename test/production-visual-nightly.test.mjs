import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES
} from "../scripts/lib/ui-suite-artifacts.mjs";
import {
  buildProductionVisualNightlyReport,
  formatProductionVisualNightlyMarkdown
} from "../scripts/lib/production-visual-nightly.mjs";

test("nightly production visual report groups portable and real-workspace coverage without source paths", () => {
  const fixture = nightlyFixture();
  const report = buildProductionVisualNightlyReport(fixture);
  assert.equal(report.status, "passed");
  assert.equal(report.summary.matrixRowCount, 18);
  assert.equal(report.summary.portableSuiteCount, 16);
  assert.equal(report.summary.realWorkspaceCount, 2);
  assert.equal(report.summary.snapshotCount, 58);
  assert.equal(report.summary.perceptualBaselineCount, 48);
  assert.deepEqual(report.summary.themes, ["light", "workspace-defined"]);
  assert.equal(report.realWorkspaces[0].sourceUnchanged, true);
  assert.equal(report.portable.rendererCoverage.sourceFileCount, 67);
  assert.equal(report.portable.rendererCoverage.canonicalizedAliasCount, 63);
  assert.equal(report.portable.rendererCoverage.sourceInventory.status, "passed");
  assert.equal(report.matrix.at(-1).baselineMode, "structural-contract-only");
  assert.doesNotMatch(JSON.stringify(report), /private-real-workspaces/);
  const markdown = formatProductionVisualNightlyMarkdown(report);
  assert.match(markdown, /Lotion Demo Space/);
  assert.match(markdown, /Notion Import/);
  assert.match(markdown, /committed-perceptual/);
  assert.match(markdown, /structural-contract-only/);
});

test("nightly production visual report rejects missing or failed real-workspace runners", () => {
  const missing = nightlyFixture();
  delete missing.realWorkspaceManifests["real-notion-import-ui"];
  assert.throws(
    () => buildProductionVisualNightlyReport(missing),
    /missing fresh runner real-notion-import-ui/
  );

  const failed = nightlyFixture();
  failed.realWorkspaceManifests["real-demo-workspace-ui"].status = "failed";
  assert.throws(
    () => buildProductionVisualNightlyReport(failed),
    /real-demo-workspace-ui did not pass/
  );
});

test("nightly production visual report rejects incomplete viewport, baseline, and theme coverage", () => {
  const missingRealViewport = nightlyFixture();
  missingRealViewport.realWorkspaceManifests["real-demo-workspace-ui"].result.artifactContract.observedViewportNames = ["desktop"];
  assert.throws(
    () => buildProductionVisualNightlyReport(missingRealViewport),
    /Lotion Demo Space viewport coverage mismatch/
  );

  const missingPortableViewport = nightlyFixture();
  missingPortableViewport.productionGate.contract.suites[0].viewports = ["desktop", "compact"];
  assert.throws(
    () => buildProductionVisualNightlyReport(missingPortableViewport),
    /Portable suite 1 viewport coverage mismatch.*missing wide/
  );

  const missingBaseline = nightlyFixture();
  missingBaseline.productionGate.contract.suites[0].perceptualBaselines.pop();
  assert.throws(
    () => buildProductionVisualNightlyReport(missingBaseline),
    /requires 3 perceptual baselines/
  );

  const missingTheme = nightlyFixture();
  missingTheme.productionGate.contract.suites[0].perceptualBaselines[0].policy.theme = "";
  assert.throws(
    () => buildProductionVisualNightlyReport(missingTheme),
    /missing theme evidence/
  );
});

test("nightly production visual report preserves additional diagnostic viewports", () => {
  const fixture = nightlyFixture();
  fixture.productionGate.contract.suites[0].viewports.push("laptop");
  fixture.productionGate.contract.suites[0].snapshotCount += 1;
  fixture.productionGate.contract.snapshotCount += 1;
  const report = buildProductionVisualNightlyReport(fixture);
  assert.deepEqual(report.matrix[0].viewports, ["desktop", "compact", "wide", "laptop"]);
  assert.equal(report.matrix[0].perceptualBaselineCount, 3);
  assert.equal(report.summary.snapshotCount, 59);
});

test("nightly production visual report rejects weak clone safety and original-path leakage", () => {
  const mutatedSource = nightlyFixture();
  mutatedSource.realWorkspaceManifests["real-notion-import-ui"].result.realWorkspaceEvidence.sourceSafety.after.sha256 = "b".repeat(64);
  assert.throws(
    () => buildProductionVisualNightlyReport(mutatedSource),
    /lacks source-safety or clone-isolation evidence/
  );

  const pathLeak = nightlyFixture();
  const secretRoot = pathLeak.sourceRoots[0];
  pathLeak.realWorkspaceManifests["real-demo-workspace-ui"].result.artifactContract.snapshots[0].imagePath = `${secretRoot}/secret.png`;
  assert.throws(
    () => buildProductionVisualNightlyReport(pathLeak),
    /exposed an original real-workspace path/
  );
});

function nightlyFixture() {
  const root = "/repo";
  const productionSuites = DEFAULT_PRODUCTION_VISUAL_SCRIPTS.map((scriptPath, suiteIndex) => {
    const surface = `surface-${suiteIndex + 1}`;
    return {
      name: `Portable suite ${suiteIndex + 1}`,
      scriptPath,
      snapshotCount: 3,
      viewports: [...DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES],
      reproduceCommand: `LOTION_UI_SUITE_FILTER=${scriptPath.replace("scripts/", "")} npm run smoke:ui`,
      representativeSnapshotPaths: [`/repo/artifacts/${surface}-desktop.png`],
      perceptualBaselines: DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES.map((viewport) => ({
        viewport,
        kind: "lotion-png-visual-diff",
        status: "passed",
        policyPath: `/repo/test/baselines/${surface}-${viewport}.json`,
        actualPath: `/repo/artifacts/${surface}-${viewport}.png`,
        expectedPath: `/repo/test/baselines/${surface}-${viewport}.png`,
        diffPath: `/repo/artifacts/${surface}-${viewport}-diff.png`,
        metadataPath: `/repo/artifacts/${surface}-${viewport}-diff.json`,
        diffPixels: 0,
        diffRatio: 0,
        policy: { surface, theme: "light", viewport: { name: viewport } }
      }))
    };
  });
  const realWorkspaceManifests = {
    "real-demo-workspace-ui": realManifest({
      manifestName: "real-demo-workspace-ui",
      phases: ["home", "database500k"],
      workspaceName: "Lotion Demo Space"
    }),
    "real-notion-import-ui": realManifest({
      manifestName: "real-notion-import-ui",
      phases: ["native-vision", "seeded-toggle-media", "import-modal"],
      workspaceName: "Notion Import"
    })
  };
  return {
    root,
    generatedAt: "2026-07-23T20:00:00.000Z",
    sourceRoots: [
      "/private-real-workspaces/Lotion Demo Space",
      "/private-real-workspaces/Notion Import"
    ],
    productionGatePath: "/repo/artifacts/ui-smoke/ui-suite/production-visual-gate/production-visual-gate.json",
    productionGate: {
      kind: "lotion-production-visual-quality-gate",
      status: "passed",
      rendererCoverage: {
        kind: "lotion-renderer-coverage-gate",
        status: "passed",
        path: "/repo/artifacts/coverage/renderer/renderer-coverage-gate.json",
        sourceEntryCount: 130,
        sourceFileCount: 67,
        coveredSourceFileCount: 63,
        canonicalizedAliasCount: 63,
        sourceInventory: {
          status: "passed",
          expectedFileCount: 67,
          observedFileCount: 67,
          missing: [],
          unexpected: []
        },
        total: { lines: { pct: 31.49 } },
        trend: { status: "passed" }
      },
      contract: {
        status: "passed",
        requiredSuiteCount: productionSuites.length,
        requiredViewportNames: [...DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES],
        snapshotCount: productionSuites.length * 3,
        perceptualBaselineCount: productionSuites.length * 3,
        suites: productionSuites
      }
    },
    realWorkspaceManifests,
    realWorkspaceManifestPaths: {
      "real-demo-workspace-ui": "/repo/artifacts/ui-smoke/real-demo/harness-result.json",
      "real-notion-import-ui": "/repo/artifacts/ui-smoke/real-notion/harness-result.json"
    }
  };
}

function realManifest({ manifestName, phases, workspaceName }) {
  const fingerprint = {
    kind: "lotion-real-workspace-fingerprint",
    workspaceName,
    fileCount: 100,
    totalBytes: 1000,
    sha256: "a".repeat(64)
  };
  const snapshots = ["desktop", "compact"].flatMap((viewport) => phases.map((phase) => ({
    viewport,
    phase,
    imageBytes: 1000,
    imagePath: `/repo/artifacts/${manifestName}/${viewport}-${phase}.png`,
    metadataPath: `/repo/artifacts/${manifestName}/${viewport}-${phase}.json`
  })));
  return {
    name: manifestName,
    status: "passed",
    result: {
      artifactContract: {
        status: "passed",
        workspaceName,
        observedViewportNames: ["desktop", "compact"],
        snapshotCount: snapshots.length,
        snapshots,
        reproduceCommand: manifestName === "real-demo-workspace-ui"
          ? "npm run smoke:real-demo-workspace-ui"
          : "npm run smoke:real-notion-import-ui"
      },
      realWorkspaceEvidence: {
        sourceIdentity: { workspaceName, directoryName: workspaceName },
        sourceFingerprint: { ...fingerprint },
        cloneFingerprint: { ...fingerprint },
        isolation: { symlinksAllowed: false, byteIdenticalAtClone: true },
        sourceSafety: {
          unchanged: true,
          before: { ...fingerprint },
          after: { ...fingerprint }
        }
      }
    }
  };
}
