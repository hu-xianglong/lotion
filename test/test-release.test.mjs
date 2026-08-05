import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  DEFAULT_TEST_RELEASE_GATES,
  TestReleaseGateError,
  buildReleaseManifest,
  collectBuildOutputs,
  collectUiSmokeArtifacts,
  createTestRelease,
  verifyReleaseAppStructure
} from "../scripts/lib/test-release.mjs";
import {
  DEFAULT_PRODUCTION_VISUAL_FILTER,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORTS
} from "../scripts/lib/ui-suite-artifacts.mjs";
import { mergeScriptCoverage } from "../scripts/lib/v8-coverage.mjs";

test("V8 coverage merge keeps distinct anonymous functions by source range", () => {
  const coverage = (firstCount, secondCount) => ({
    functions: [
      { functionName: "", ranges: [{ startOffset: 0, endOffset: 10, count: firstCount }] },
      { functionName: "", ranges: [{ startOffset: 20, endOffset: 30, count: secondCount }] }
    ]
  });
  const merged = mergeScriptCoverage(coverage(1, 0), coverage(0, 2));
  assert.equal(merged.functions.length, 2);
  assert.equal(merged.functions[0].ranges[0].count, 1);
  assert.equal(merged.functions[1].ranges[0].count, 2);
});

test("test release manifest records source, gate, platform, and artifact metadata", () => {
  const manifest = buildReleaseManifest({
    appInfo: { name: "lotion", version: "0.1.0", description: "Local Notion" },
    buildOutputs: {
      outputs: [{ path: "dist/renderer/index.html" }],
      packagedApp: {
        launcherPath: "open-lotion-test-release.sh",
        path: "Lotion Test Release.app",
        snapshotPath: "app-snapshot",
        type: "mac-app",
        userDataPath: "user-data"
      },
      status: "app-snapshot-packaged"
    },
    gateResults: [{ command: "npm run test:fast", status: "passed", durationMs: 10, exitCode: 0, mode: "executed" }],
    gitInfo: { branch: "main", dirty: false, recentCommits: ["abc123 test"], sha: "abcdef123456", shortSha: "abcdef1", statusPorcelain: "" },
    now: new Date("2026-06-16T12:00:00.000Z"),
    packagedAppVerification: { status: "passed", apiMethodCount: 80 },
    prechecked: false,
    releaseDir: "/repo/artifacts/test-releases/lotion-test-2026-06-16-abcdef1",
    root: "/repo",
    uiArtifacts: [{ path: "artifacts/ui-smoke/search/harness-result.json", status: "passed", suite: "search-title", viewports: ["desktop", "compact"] }]
  });

  assert.equal(manifest.artifactKind, "lotion-test-release");
  assert.equal(manifest.preRelease, true);
  assert.equal(manifest.checksumsFile, "checksums.json");
  assert.equal(manifest.app.version, "0.1.0");
  assert.equal(manifest.git.sha, "abcdef123456");
  assert.equal(manifest.git.dirty, false);
  assert.equal(manifest.test.mode, "full");
  assert.equal(manifest.test.gates[0].command, "npm run test:fast");
  assert.equal(manifest.build.status, "app-snapshot-packaged");
  assert.equal(manifest.build.packagedApp.path, "Lotion Test Release.app");
  assert.equal(manifest.build.verification.status, "passed");
  assert.equal(manifest.uiArtifacts.count, 1);
  assert.equal(manifest.node.platform, process.platform);
});

test("default test release gates include the production visual quality gate", () => {
  assert.deepEqual(DEFAULT_TEST_RELEASE_GATES.map((gate) => gate.label), [
    "npm run test:fast",
    "npm run typecheck",
    "npm run test:coverage",
    "npm run test:ui-regression",
    "npm run test:production-visual",
    "npm run build",
    "git diff --check"
  ]);
  const visualGate = DEFAULT_TEST_RELEASE_GATES.find((gate) => gate.label === "npm run test:production-visual");
  assert.deepEqual(visualGate?.args, ["run", "test:production-visual"]);
});

test("test release workflow does not create a release directory when a gate fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-release-fail-"));
  const outputRoot = join(root, "artifacts", "test-releases");
  await seedProject(root);
  try {
    await assert.rejects(
      () => createTestRelease({
        gates: [{ label: "fake failing gate", command: "fake", args: ["fail"] }],
        gitInfo: fakeGitInfo(),
        now: new Date("2026-06-16T12:00:00.000Z"),
        outputRoot,
        root,
        runner: async () => {
          const error = new Error("intentional gate failure");
          error.exitCode = 2;
          error.stderr = "failed before release";
          throw error;
        }
      }),
      (error) => {
        assert.equal(error instanceof TestReleaseGateError, true);
        assert.equal(error.gateResults[0].status, "failed");
        return true;
      }
    );
    assert.equal(existsSync(outputRoot), false, "failed gates should not create the release root");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prechecked test release creates a unique manifest, checksums, UI artifact summary, and build placeholder", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-release-pass-"));
  const outputRoot = join(root, "artifacts", "test-releases");
  await seedProject(root, { withBuildOutputs: false, withUiArtifact: true });
  try {
    const first = await createTestRelease({
      gates: [{ label: "npm run test:fast", command: "npm", args: ["run", "test:fast"] }],
      gitInfo: fakeGitInfo(),
      now: new Date("2026-06-16T12:00:00.000Z"),
      outputRoot,
      prechecked: true,
      root
    });
    const second = await createTestRelease({
      gates: [{ label: "npm run test:fast", command: "npm", args: ["run", "test:fast"] }],
      gitInfo: fakeGitInfo(),
      now: new Date("2026-06-16T12:00:00.000Z"),
      outputRoot,
      prechecked: true,
      root
    });

    assert.notEqual(first.releaseDir, second.releaseDir, "repeated runs should not overwrite prior test releases");
    assert.equal(first.manifestPath, join(first.releaseDir, "release-manifest.json"));
    const manifest = JSON.parse(await readFile(join(first.releaseDir, "release-manifest.json"), "utf8"));
    const buildOutputs = JSON.parse(await readFile(join(first.releaseDir, "build-outputs.json"), "utf8"));
    const uiArtifacts = JSON.parse(await readFile(join(first.releaseDir, "ui-artifacts.json"), "utf8"));
    const checksums = JSON.parse(await readFile(join(first.releaseDir, "checksums.json"), "utf8"));

    assert.equal(manifest.test.mode, "prechecked");
    assert.equal(manifest.test.gates[0].status, "prechecked");
    assert.equal(manifest.git.dirty, true);
    assert.equal(buildOutputs.status, "packaging-placeholder");
    assert.match(buildOutputs.placeholder, /No build output was found/);
    assert.equal(uiArtifacts.length, 1);
    assert.equal(uiArtifacts[0].suite, "row-page-property-visual");
    assert.ok(checksums.some((entry) => entry.path === "release-manifest.json"));
    assert.ok(checksums.some((entry) => entry.path === "README.md"));
    assert.ok((await readdir(outputRoot)).length >= 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("release UI artifact collection indexes production visual gate results", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-release-visual-"));
  await seedProject(root, { withProductionVisualGate: true });
  try {
    const artifacts = await collectUiSmokeArtifacts(root);
    const productionSuite = artifacts.find((entry) => entry.suite === "ui-suite");

    assert.ok(productionSuite, "ui-suite harness artifact should be collected");
    assert.equal(productionSuite.productionVisualGate.kind, "lotion-production-visual-quality-gate");
    assert.equal(productionSuite.productionVisualGate.status, "passed");
    assert.equal(productionSuite.productionVisualGate.filter, DEFAULT_PRODUCTION_VISUAL_FILTER);
    assert.equal(productionSuite.productionVisualGate.viewports, DEFAULT_PRODUCTION_VISUAL_VIEWPORTS);
    assert.equal(
      productionSuite.productionVisualGate.path,
      "artifacts/ui-smoke/ui-suite-production/production-visual-gate/production-visual-gate.json"
    );
    assert.equal(
      productionSuite.productionVisualGate.uiSuiteArtifactIndex,
      "artifacts/ui-smoke/ui-suite-production/ui-suite-artifacts.json"
    );
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.status, "passed");
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.sourceEntryCount, 130);
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.sourceFileCount, 67);
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.canonicalizedAliasCount, 63);
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.sourceInventory.status, "passed");
    assert.equal(
      productionSuite.productionVisualGate.rendererCoverage.path,
      "artifacts/coverage/renderer/renderer-coverage-gate.json"
    );
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.total.lines.pct, 31.44);
    assert.equal(productionSuite.productionVisualGate.rendererCoverage.trend.status, "passed");
    assert.equal(
      productionSuite.productionVisualGate.rendererCoverage.trend.baselinePath,
      "test/baselines/renderer-coverage.json"
    );
    assert.equal(productionSuite.productionVisualGate.perceptualBaselineCount, 48);
    assert.equal(productionSuite.productionVisualGate.perceptualBaselines[0].status, "passed");
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[0].expectedPath,
      "test/baselines/production-visual/design-system-desktop.png"
    );
    assert.equal(productionSuite.productionVisualGate.perceptualBaselines[1].status, "passed");
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[1].expectedPath,
      "test/baselines/production-visual/design-system-compact.png"
    );
    assert.equal(productionSuite.productionVisualGate.perceptualBaselines[2].status, "passed");
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[2].expectedPath,
      "test/baselines/production-visual/design-system-wide.png"
    );
    assert.equal(productionSuite.productionVisualGate.perceptualBaselines[3].status, "passed");
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[3].expectedPath,
      "test/baselines/production-visual/white-theme-page-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[5].expectedPath,
      "test/baselines/production-visual/white-theme-page-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[6].expectedPath,
      "test/baselines/production-visual/settings-center-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[8].expectedPath,
      "test/baselines/production-visual/settings-center-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[9].expectedPath,
      "test/baselines/production-visual/plugin-manager-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[11].expectedPath,
      "test/baselines/production-visual/plugin-manager-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[12].expectedPath,
      "test/baselines/production-visual/llm-chat-conversation-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[14].expectedPath,
      "test/baselines/production-visual/llm-chat-conversation-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[15].expectedPath,
      "test/baselines/production-visual/advanced-search-stale-results-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[17].expectedPath,
      "test/baselines/production-visual/advanced-search-stale-results-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[18].expectedPath,
      "test/baselines/production-visual/search-ai-chat-handoff-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[20].expectedPath,
      "test/baselines/production-visual/search-ai-chat-handoff-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[21].expectedPath,
      "test/baselines/production-visual/github-backup-restore-preview-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[23].expectedPath,
      "test/baselines/production-visual/github-backup-restore-preview-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[24].expectedPath,
      "test/baselines/production-visual/notion-import-command-modal-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[26].expectedPath,
      "test/baselines/production-visual/notion-import-command-modal-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[27].expectedPath,
      "test/baselines/production-visual/markdown-preview-selected-source-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[29].expectedPath,
      "test/baselines/production-visual/markdown-preview-selected-source-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[30].expectedPath,
      "test/baselines/production-visual/row-page-property-panel-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[32].expectedPath,
      "test/baselines/production-visual/row-page-property-panel-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[33].expectedPath,
      "test/baselines/production-visual/embedded-view-table-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[35].expectedPath,
      "test/baselines/production-visual/embedded-view-table-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[36].expectedPath,
      "test/baselines/production-visual/database-created-views-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[38].expectedPath,
      "test/baselines/production-visual/database-created-views-wide.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[39].expectedPath,
      "test/baselines/production-visual/database-interaction-settings-desktop.png"
    );
    assert.equal(
      productionSuite.productionVisualGate.perceptualBaselines[41].expectedPath,
      "test/baselines/production-visual/database-interaction-settings-wide.png"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("build output collection records dist files when build artifacts exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-release-build-"));
  await seedProject(root, { withBuildOutputs: true });
  try {
    const buildOutputs = await collectBuildOutputs(root);
    assert.equal(buildOutputs.status, "build-output-recorded");
    assert.equal(buildOutputs.outputs.length, 3);
    assert.ok(buildOutputs.outputs.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prechecked test release packages an openable app snapshot when build artifacts exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-release-app-"));
  const outputRoot = join(root, "artifacts", "test-releases");
  const electronExecutable = join(root, "fake-electron");
  await seedProject(root, { withBuildOutputs: true });
  await writeFile(electronExecutable, "#!/usr/bin/env bash\nexit 0\n", "utf8");
  await chmod(electronExecutable, 0o755);
  try {
    const release = await createTestRelease({
      electronExecutable,
      gates: [{ label: "npm run test:fast", command: "npm", args: ["run", "test:fast"] }],
      gitInfo: fakeGitInfo(),
      now: new Date("2026-06-16T12:00:00.000Z"),
      outputRoot,
      platformName: "darwin",
      prechecked: true,
      root,
      verifyPackagedAppSnapshot: false
    });
    const manifest = JSON.parse(await readFile(join(release.releaseDir, "release-manifest.json"), "utf8"));
    const buildOutputs = JSON.parse(await readFile(join(release.releaseDir, "build-outputs.json"), "utf8"));
    const checksums = JSON.parse(await readFile(join(release.releaseDir, "checksums.json"), "utf8"));
    const readme = await readFile(join(release.releaseDir, "README.md"), "utf8");

    assert.equal(buildOutputs.status, "app-snapshot-packaged");
    assert.equal(buildOutputs.packagedApp.path, "Lotion Test Release.app");
    assert.equal(buildOutputs.packagedApp.launcherPath, "open-lotion-test-release.sh");
    assert.equal(buildOutputs.packagedApp.snapshotPath, "app-snapshot");
    assert.equal(buildOutputs.packagedApp.userDataPath, "user-data");
    assert.equal(manifest.build.packagedApp.path, "Lotion Test Release.app");
    assert.equal(existsSync(join(release.releaseDir, "app-snapshot", "dist", "renderer", "index.html")), true);
    assert.equal(existsSync(join(release.releaseDir, "app-snapshot", "dist-electron", "main", "index.js")), true);
    assert.equal(existsSync(join(release.releaseDir, "app-snapshot", "dist-electron", "preload", "index.cjs")), true);
    assert.equal(existsSync(join(release.releaseDir, "app-snapshot", "package.json")), true);
    assert.equal(existsSync(join(release.releaseDir, "open-lotion-test-release.sh")), true);
    assert.equal(existsSync(join(release.releaseDir, "Lotion Test Release.app", "Contents", "MacOS", "Lotion Test Release")), true);
    assert.equal(existsSync(join(release.releaseDir, "user-data")), true);
    const structure = await verifyReleaseAppStructure({
      packagedApp: buildOutputs.packagedApp,
      releaseDir: release.releaseDir
    });
    assert.equal(structure.sourceOutputs.length, 3);
    assert.ok(checksums.some((entry) => entry.path === "app-snapshot/package.json"));
    assert.ok(checksums.some((entry) => entry.path === "open-lotion-test-release.sh"));
    assert.ok(checksums.some((entry) => entry.path === "Lotion Test Release.app/Contents/Info.plist"));
    assert.match(readme, /openable test app artifact/);
    assert.match(
      await readFile(join(release.releaseDir, "open-lotion-test-release.sh"), "utf8"),
      /LOTION_RELEASE_CDP_PORT/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function seedProject(root, options = {}) {
  await writeFile(join(root, "package.json"), JSON.stringify({
    description: "An LLM-first local Notion.",
    name: "lotion",
    version: "0.1.0"
  }, null, 2));
  await writeNestedFile(join(root, "tasks", "QUEUE.md"), [
    "| 554 | done | Global search visual artifact contract gate | `tasks/done/global.md` | gates |",
    "| 555 | done | Embedded database table artifact contract gate | `tasks/done/embedded.md` | gates |",
    "| 556 | wip | Test release after passing gates | `tasks/wip/test-release-after-passing-gates.md` | gates |",
    ""
  ].join("\n"));
  if (options.withBuildOutputs) {
    await writeNestedFile(join(root, "dist", "renderer", "index.html"), "<!doctype html><title>Lotion</title>");
    await writeNestedFile(join(root, "dist-electron", "main", "index.js"), "export {};\n");
    await writeNestedFile(join(root, "dist-electron", "preload", "index.cjs"), "module.exports = {};\n");
  }
  if (options.withUiArtifact) {
    await writeNestedFile(
      join(root, "artifacts", "ui-smoke", "row-page-property-visual-2026", "harness-result.json"),
      JSON.stringify({
        coverage: { observedViewportNames: ["desktop", "compact", "wide"] },
        name: "row-page-property-visual",
        status: "passed"
      }, null, 2)
    );
  }
  if (options.withProductionVisualGate) {
    await writeNestedFile(
      join(root, "artifacts", "coverage", "renderer", "renderer-coverage-gate.json"),
      JSON.stringify({
        kind: "lotion-renderer-coverage-gate",
        status: "passed",
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
        thresholds: { lines: 30, statements: 30, functions: 20, branches: 55 },
        total: {
          lines: { total: 48582, covered: 15276, pct: 31.44 },
          statements: { total: 48582, covered: 15276, pct: 31.44 },
          functions: { total: 1186, covered: 273, pct: 23.02 },
          branches: { total: 1879, covered: 1147, pct: 61.04 }
        },
        trend: rendererCoverageTrend()
      }, null, 2)
    );
    await writeNestedFile(
      join(root, "artifacts", "ui-smoke", "ui-suite-production", "harness-result.json"),
      JSON.stringify({
        artifactRoot: join(root, "artifacts", "ui-smoke", "ui-suite-production"),
        coverage: { observedViewportNames: ["desktop", "compact"] },
        name: "ui-suite",
        result: {
          artifactIndex: {
            jsonPath: join(root, "artifacts", "ui-smoke", "ui-suite-production", "ui-suite-artifacts.json")
          }
        },
        status: "passed"
      }, null, 2)
    );
    await writeNestedFile(
      join(root, "artifacts", "ui-smoke", "ui-suite-production", "ui-suite-artifacts.json"),
      JSON.stringify({ status: "passed" }, null, 2)
    );
    await writeNestedFile(
      join(root, "artifacts", "ui-smoke", "ui-suite-production", "production-visual-gate", "production-visual-gate.json"),
      JSON.stringify({
        filter: DEFAULT_PRODUCTION_VISUAL_FILTER,
        kind: "lotion-production-visual-quality-gate",
        rendererCoverage: {
          kind: "lotion-renderer-coverage-gate",
          path: join(root, "artifacts", "coverage", "renderer", "renderer-coverage-gate.json"),
          status: "passed",
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
          thresholds: { lines: 30, statements: 30, functions: 20, branches: 55 },
          total: {
            lines: { total: 48582, covered: 15276, pct: 31.44 },
            statements: { total: 48582, covered: 15276, pct: 31.44 },
            functions: { total: 1186, covered: 273, pct: 23.02 },
            branches: { total: 1879, covered: 1147, pct: 61.04 }
          },
          trend: rendererCoverageTrend()
        },
        contract: {
          perceptualBaselineCount: 48,
          suites: [{
            name: "Design system UI",
            scriptPath: "scripts/smoke-design-system-ui.mjs",
            perceptualBaselines: [{
              viewport: "desktop",
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: "test/baselines/production-visual/design-system-desktop.json",
              actualPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-desktop.png"),
              expectedPath: "test/baselines/production-visual/design-system-desktop.png",
              diffPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-desktop-diff.png"),
              metadataPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-desktop-diff.json")
            }, {
              viewport: "compact",
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: "test/baselines/production-visual/design-system-compact.json",
              actualPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-compact.png"),
              expectedPath: "test/baselines/production-visual/design-system-compact.png",
              diffPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-compact-diff.png"),
              metadataPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-compact-diff.json")
            }, {
              viewport: "wide",
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: "test/baselines/production-visual/design-system-wide.json",
              actualPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-wide.png"),
              expectedPath: "test/baselines/production-visual/design-system-wide.png",
              diffPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-wide-diff.png"),
              metadataPath: join(root, "artifacts", "ui-smoke", "design-system", "design-system-wide-diff.json")
            }]
          }, {
            name: "White theme UI",
            scriptPath: "scripts/smoke-white-theme-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/white-theme-page-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "white-theme", `white-theme-page-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/white-theme-page-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "white-theme", `white-theme-page-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "white-theme", `white-theme-page-${viewport}-diff.json`)
            }))
          }, {
            name: "Settings center UI",
            scriptPath: "scripts/smoke-settings-center-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/settings-center-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "settings-center", `settings-center-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/settings-center-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "settings-center", `settings-center-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "settings-center", `settings-center-${viewport}-diff.json`)
            }))
          }, {
            name: "Plugin manager UI",
            scriptPath: "scripts/smoke-plugin-manager-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/plugin-manager-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "plugin-manager", `plugin-manager-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/plugin-manager-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "plugin-manager", `plugin-manager-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "plugin-manager", `plugin-manager-${viewport}-diff.json`)
            }))
          }, {
            name: "LLM Chat UI",
            scriptPath: "scripts/smoke-llm-chat-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/llm-chat-conversation-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "llm-chat", `llm-chat-conversation-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/llm-chat-conversation-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "llm-chat", `llm-chat-conversation-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "llm-chat", `llm-chat-conversation-${viewport}-diff.json`)
            }))
          }, {
            name: "Advanced Search UI",
            scriptPath: "scripts/smoke-advanced-search-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/advanced-search-stale-results-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "advanced-search", `advanced-search-stale-results-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/advanced-search-stale-results-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "advanced-search", `advanced-search-stale-results-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "advanced-search", `advanced-search-stale-results-${viewport}-diff.json`)
            }))
          }, {
            name: "Search & AI UI",
            scriptPath: "scripts/smoke-search-ai-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/search-ai-chat-handoff-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "search-ai", `search-ai-chat-handoff-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/search-ai-chat-handoff-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "search-ai", `search-ai-chat-handoff-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "search-ai", `search-ai-chat-handoff-${viewport}-diff.json`)
            }))
          }, {
            name: "GitHub backup UI",
            scriptPath: "scripts/smoke-github-backup-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/github-backup-restore-preview-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "github-backup", `github-backup-restore-preview-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/github-backup-restore-preview-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "github-backup", `github-backup-restore-preview-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "github-backup", `github-backup-restore-preview-${viewport}-diff.json`)
            }))
          }, {
            name: "Notion import audit UI",
            scriptPath: "scripts/smoke-notion-import-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/notion-import-command-modal-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "notion-import", `notion-import-command-modal-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/notion-import-command-modal-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "notion-import", `notion-import-command-modal-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "notion-import", `notion-import-command-modal-${viewport}-diff.json`)
            }))
          }, {
            name: "Markdown preview UI",
            scriptPath: "scripts/smoke-markdown-preview-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/markdown-preview-selected-source-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "markdown-preview", `markdown-preview-selected-source-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/markdown-preview-selected-source-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "markdown-preview", `markdown-preview-selected-source-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "markdown-preview", `markdown-preview-selected-source-${viewport}-diff.json`)
            }))
          }, {
            name: "Row-page property visual UI",
            scriptPath: "scripts/smoke-row-page-property-visual-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/row-page-property-panel-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "row-page-property", `row-page-property-panel-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/row-page-property-panel-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "row-page-property", `row-page-property-panel-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "row-page-property", `row-page-property-panel-${viewport}-diff.json`)
            }))
          }, {
            name: "Embedded view UI",
            scriptPath: "scripts/smoke-embedded-view-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/embedded-view-table-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "embedded-view", `embedded-view-table-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/embedded-view-table-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "embedded-view", `embedded-view-table-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "embedded-view", `embedded-view-table-${viewport}-diff.json`)
            }))
          }, {
            name: "Database created views UI",
            scriptPath: "scripts/smoke-database-created-views-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/database-created-views-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "database-created-views", `database-created-views-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/database-created-views-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "database-created-views", `database-created-views-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "database-created-views", `database-created-views-${viewport}-diff.json`)
            }))
          }, {
            name: "Database interaction UI",
            scriptPath: "scripts/smoke-database-interaction-ui.mjs",
            perceptualBaselines: ["desktop", "compact", "wide"].map((viewport) => ({
              viewport,
              kind: "lotion-png-visual-diff",
              status: "passed",
              diffPixels: 0,
              policyPath: `test/baselines/production-visual/database-interaction-settings-${viewport}.json`,
              actualPath: join(root, "artifacts", "ui-smoke", "database-interaction", `database-interaction-settings-${viewport}.png`),
              expectedPath: `test/baselines/production-visual/database-interaction-settings-${viewport}.png`,
              diffPath: join(root, "artifacts", "ui-smoke", "database-interaction", `database-interaction-settings-${viewport}-diff.png`),
              metadataPath: join(root, "artifacts", "ui-smoke", "database-interaction", `database-interaction-settings-${viewport}-diff.json`)
            }))
          }]
        },
        status: "passed",
        uiSuiteArtifactIndex: join(root, "artifacts", "ui-smoke", "ui-suite-production", "ui-suite-artifacts.json"),
        viewports: DEFAULT_PRODUCTION_VISUAL_VIEWPORTS
      }, null, 2)
    );
  }
}

function rendererCoverageTrend() {
  return {
    kind: "lotion-renderer-coverage-trend",
    status: "passed",
    baselinePath: "test/baselines/renderer-coverage.json",
    verifiedAt: "2026-07-22",
    sourceTask: "tasks/done/renderer-source-coverage-gate.md",
    sourceFiles: { baseline: 67, current: 67, delta: 0 },
    coveredSourceFiles: { baseline: 63, current: 63, delta: 0 },
    metrics: {
      lines: { baseline: 31.44, current: 31.44, delta: 0 },
      statements: { baseline: 31.44, current: 31.44, delta: 0 },
      functions: { baseline: 23.02, current: 23.02, delta: 0 },
      branches: { baseline: 61.04, current: 61.04, delta: 0 }
    },
    failures: []
  };
}

async function writeNestedFile(file, contents) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, contents, "utf8");
}

function fakeGitInfo() {
  return {
    branch: "main",
    dirty: true,
    recentCommits: ["abc123 feat: previous queue item"],
    sha: "abcdef1234567890",
    shortSha: "abcdef1",
    statusPorcelain: " M tasks/QUEUE.md"
  };
}
