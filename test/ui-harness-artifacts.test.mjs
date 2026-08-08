import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  assertElementSnapshotBaseline,
  assertFocusWithin,
  assertHarnessViewportCoverage,
  assertNoHarnessConsoleErrors,
  assertStablePageLayout,
  captureElementSnapshot,
  captureFailureArtifacts,
  openWorkspaceAndReload,
  readHarnessResultArtifactsSince,
  withPreservedLocalStorageValue,
  writeHarnessResultArtifact
} from "../scripts/ui-harness.mjs";
import { assertEmbeddedViewArtifactContract } from "../scripts/lib/embedded-view-artifacts.mjs";
import { assertAdvancedSearchArtifactContract, requiredAdvancedSearchSnapshotPhases } from "../scripts/lib/advanced-search-artifacts.mjs";
import { assertEditorLinkClickArtifactContract } from "../scripts/lib/editor-link-click-artifacts.mjs";
import { assertEditorRegressionArtifactContract } from "../scripts/lib/editor-regression-artifacts.mjs";
import { assertEditorScrollArtifactContract } from "../scripts/lib/editor-scroll-artifacts.mjs";
import { assertGlobalSearchVisualArtifactContract } from "../scripts/lib/global-search-visual-artifacts.mjs";
import { assertImageLightboxArtifactContract, requiredImageLightboxControls } from "../scripts/lib/image-lightbox-artifacts.mjs";
import { assertDatabaseCreatedViewsArtifactContract, requiredDatabaseCreatedViewTabs } from "../scripts/lib/database-created-views-artifacts.mjs";
import { assertDatabaseInteractionArtifactContract } from "../scripts/lib/database-interaction-artifacts.mjs";
import { assertDatabaseMultiViewArtifactContract } from "../scripts/lib/database-multi-view-artifacts.mjs";
import { assertLLMChatArtifactContract, requiredLLMChatSnapshotPhases } from "../scripts/lib/llm-chat-artifacts.mjs";
import { assertMarkdownPreviewArtifactContract } from "../scripts/lib/markdown-preview-artifacts.mjs";
import { assertNavigationAnchorArtifactContract } from "../scripts/lib/navigation-anchor-artifacts.mjs";
import { assertNotionImportAuditArtifactContract } from "../scripts/lib/notion-import-audit-artifacts.mjs";
import { assertPageBacklinksArtifactContract } from "../scripts/lib/page-backlinks-artifacts.mjs";
import { assertPageSecondaryArtifactContract } from "../scripts/lib/page-secondary-artifacts.mjs";
import { assertPluginManagerArtifactContract, requiredPluginManagerPlugins } from "../scripts/lib/plugin-manager-artifacts.mjs";
import { assertRowPageNavigationArtifactContract } from "../scripts/lib/row-page-navigation-artifacts.mjs";
import { assertRowPagePropertyVisualArtifactContract } from "../scripts/lib/row-page-property-visual-artifacts.mjs";
import { assertSearchAiArtifactContract } from "../scripts/lib/search-ai-artifacts.mjs";
import {
  assertSearchHarnessCacheEvidence,
  assertSearchInputLatencyEvidence,
  assertSearchUiArtifactContract
} from "../scripts/lib/search-ui-artifacts.mjs";
import { assertSettingsCenterArtifactContract, requiredSettingsCenterCategories } from "../scripts/lib/settings-center-artifacts.mjs";
import { assertSidebarSettingsArtifactContract } from "../scripts/lib/sidebar-settings-artifacts.mjs";
import { assertSourceAttachmentArtifactContract } from "../scripts/lib/source-attachment-artifacts.mjs";
import { assertTagPagesArtifactContract } from "../scripts/lib/tag-pages-artifacts.mjs";
import { assertUrlFieldArtifactContract } from "../scripts/lib/url-field-artifacts.mjs";
import { assertWhiteThemeArtifactContract, requiredWhiteThemePhases } from "../scripts/lib/white-theme-artifacts.mjs";
import {
  DEFAULT_PRODUCTION_VISUAL_FILTER,
  DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORTS,
  assertProductionVisualGateContract,
  assertUiSuiteArtifactIndexContract,
  buildUiSuiteArtifactIndex,
  formatUiSuiteArtifactIndexMarkdown,
  productionVisualViewportNamesFromSelection,
  uiSuiteHarnessConnection,
  writeUiSuiteArtifactIndex
} from "../scripts/lib/ui-suite-artifacts.mjs";
import { assertDesignSystemArtifactContract, requiredDesignSystemStatusPills } from "../scripts/lib/design-system-artifacts.mjs";

test("database multi-view artifact contract requires create-view failure recovery evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-multi-view-contract-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact"]) {
      const imagePath = join(root, `${viewport}.png`);
      const metadataPath = join(root, `${viewport}.json`);
      await writeFile(imagePath, Buffer.alloc(1024, 1));
      await writeFile(metadataPath, JSON.stringify({
        viewport: { name: viewport },
        metadata: { phase: "multi-view-overflow" }
      }));
      viewports.push({
        viewport,
        viewCount: 12,
        orderPersisted: true,
        keyboardFocusFollowed: true,
        sidebarViewsVerified: true,
        createViewFailureRecovery: {
          message: "Injected create view failure",
          dialogRemainedOpen: true,
          duplicateSubmitSuppressed: true,
          retryCreatedExactlyOne: true
        },
        viewOrderFailureRecovery: {
          message: "Injected view reorder failure",
          controlsBlockedUntilResolution: true,
          rollbackPreservedOrder: true,
          rollbackPreservedRevisions: true,
          duplicateDropSuppressed: true,
          retryPersistedExactlyOnce: true
        },
        snapshot: { imagePath, metadataPath }
      });
    }
    const summary = { status: "passed", viewports };
    const contract = await assertDatabaseMultiViewArtifactContract(summary);
    assert.equal(contract.snapshotCount, 2);

    summary.viewports[0].createViewFailureRecovery.duplicateSubmitSuppressed = false;
    await assert.rejects(
      () => assertDatabaseMultiViewArtifactContract(summary),
      /create-view failure recovery evidence incomplete for desktop/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness restores preserved local storage state after success and failure", async () => {
  for (const shouldThrow of [false, true]) {
    const evaluations = [];
    const page = {
      async evaluate(_callback, argument) {
        evaluations.push(argument);
        if (evaluations.length === 1) return "en";
        return undefined;
      }
    };
    const run = withPreservedLocalStorageValue(page, "lotion.locale", async (previousValue, restore) => {
      assert.equal(previousValue, "en");
      await restore();
      await restore();
      if (shouldThrow) throw new Error("simulated suite failure");
      return "passed";
    });
    if (shouldThrow) await assert.rejects(run, /simulated suite failure/);
    else assert.equal(await run, "passed");
    assert.deepEqual(evaluations, [
      "lotion.locale",
      { storageKey: "lotion.locale", value: "en" }
    ]);
  }
});

test("ui harness failure artifacts include readable diagnostics and metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-artifacts-"));
  const artifactRoot = join(root, "failure");
  try {
    const error = new Error("simulated layout failure");
    const page = {
      async screenshot({ path }) {
        await writeFile(path, "fake png", "utf8");
      },
      async content() {
        return "<main><button>Search</button></main>";
      },
      url() {
        return "http://127.0.0.1:5173/#/search";
      },
      viewportSize() {
        return { width: 1040, height: 820 };
      }
    };

    await captureFailureArtifacts({
      artifactRoot,
      consoleMessages: ["[error] overlap detected"],
      devLog: ["dev server ready\n"],
      error,
      name: "search-ui",
      page
    });

    for (const filename of [
      "failure.png",
      "dom.html",
      "console.log",
      "console.json",
      "dev.log",
      "error.txt",
      "state.json",
      "metadata.json",
      "README.md"
    ]) {
      const file = await stat(join(artifactRoot, filename));
      assert.ok(file.size > 0, `${filename} should be written`);
    }

    const metadata = JSON.parse(await readFile(join(artifactRoot, "metadata.json"), "utf8"));
    assert.equal(metadata.name, "search-ui");
    assert.equal(metadata.url, "http://127.0.0.1:5173/#/search");
    assert.deepEqual(metadata.viewport, { width: 1040, height: 820 });
    assert.equal(metadata.error.message, "simulated layout failure");
    assert.equal(metadata.artifacts.screenshot, join(artifactRoot, "failure.png"));
    assert.equal(metadata.artifacts.metadata, join(artifactRoot, "metadata.json"));

    const readme = await readFile(join(artifactRoot, "README.md"), "utf8");
    assert.match(readme, /Smoke: search-ui/);
    assert.match(readme, /Viewport: 1040x820/);
    assert.match(readme, /Error: simulated layout failure/);
    assert.match(readme, /Screenshot:/);

    const state = JSON.parse(await readFile(join(artifactRoot, "state.json"), "utf8"));
    assert.deepEqual(state, {
      url: "http://127.0.0.1:5173/#/search",
      viewport: { width: 1040, height: 820 }
    });

    const consoleEvents = JSON.parse(await readFile(join(artifactRoot, "console.json"), "utf8"));
    assert.deepEqual(consoleEvents, [{
      type: "error",
      text: "overlap detected",
      location: null,
      stack: "",
      timestamp: ""
    }]);

    const { manifest, manifestPath } = await writeHarnessResultArtifact({
      artifactRoot,
      consoleMessages: ["[error] overlap detected"],
      devLog: ["dev server ready\n"],
      error,
      name: "search-ui",
      page,
      status: "failed"
    });
    assert.equal(manifest.failureArtifacts.readme, join(artifactRoot, "README.md"));
    assert.equal(manifest.failureArtifacts.screenshot, join(artifactRoot, "failure.png"));
    assert.equal(manifest.failureArtifacts.dom, join(artifactRoot, "dom.html"));
    assert.equal(manifest.failureArtifacts.consoleJson, join(artifactRoot, "console.json"));
    assert.equal(manifest.failureArtifacts.error, join(artifactRoot, "error.txt"));
    const persistedManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.deepEqual(persistedManifest.failureArtifacts, manifest.failureArtifacts);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness workspace reload tolerates reload navigation timeout", async () => {
  const calls = [];
  const timeout = new Error("page.reload: Timeout 30000ms exceeded.");
  timeout.name = "TimeoutError";
  const page = {
    async evaluate(callback, argument) {
      calls.push(["evaluate", argument]);
      assert.equal(typeof callback, "function");
      if (argument === undefined) return 1234;
      return { name: "Fixture", spaceId: "sp_fixture" };
    },
    async reload(options) {
      calls.push(["reload", options]);
      throw timeout;
    },
    async waitForFunction(callback, arg, options) {
      calls.push(["waitForFunction", options]);
      assert.equal(typeof callback, "function");
    }
  };

  await openWorkspaceAndReload(page, "/tmp/lotion-workspace");

  assert.deepEqual(calls, [
    ["evaluate", undefined],
    ["evaluate", "/tmp/lotion-workspace"],
    ["reload", { waitUntil: "domcontentloaded" }],
    ["waitForFunction", { timeout: 15_000 }]
  ]);
});

test("ui harness startup failures expose only the diagnostics available before a page exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-startup-failure-"));
  try {
    const { manifest } = await writeHarnessResultArtifact({
      artifactRoot: root,
      cdpUrl: "http://127.0.0.1:59999",
      devLog: ["vite ready\n", "electron exited\n"],
      error: new Error("Timed out waiting for Lotion CDP"),
      name: "startup-failure",
      page: null,
      status: "failed"
    });
    assert.deepEqual(Object.keys(manifest.failureArtifacts).sort(), ["devLog", "error", "readme"]);
    assert.equal(manifest.failureArtifacts.devLog, join(root, "dev.log"));
    assert.equal(manifest.failureArtifacts.error, join(root, "error.txt"));
    assert.equal(manifest.failureArtifacts.readme, join(root, "README.md"));
    assert.equal("screenshot" in manifest.failureArtifacts, false);
    assert.equal(manifest.logs.devLogBytes > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness persists redacted real-workspace immutability evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-real-workspace-evidence-"));
  try {
    const fingerprint = {
      kind: "lotion-real-workspace-fingerprint",
      workspaceName: "Lotion Demo Space",
      fileCount: 183,
      directoryCount: 36,
      totalBytes: 228_505_681,
      sha256: "a".repeat(64),
      sourceRoot: "/must/not/persist"
    };
    const { manifest } = await writeHarnessResultArtifact({
      artifactRoot: root,
      consoleMessages: [],
      devLog: [],
      name: "real-demo-workspace-ui",
      page: {
        url: () => "http://127.0.0.1:5173/#/page",
        viewportSize: () => ({ width: 1440, height: 1000 })
      },
      result: {
        status: "passed",
        sourceRoot: "/must/not/persist",
        sourceIdentity: {
          workspaceName: "Lotion Demo Space",
          directoryName: "Lotion Demo Space",
          sourcePath: "/must/not/persist"
        },
        sourceFingerprint: fingerprint,
        cloneFingerprint: fingerprint,
        isolation: {
          mode: "COPYFILE_FICLONE with platform fallback",
          symlinksAllowed: false,
          byteIdenticalAtClone: true,
          cloneRoot: "/must/not/persist"
        },
        sourceSafety: { unchanged: true, before: fingerprint, after: fingerprint },
        viewports: [
          {
            viewport: "desktop",
            workspaceName: "Lotion Demo Space",
            activeWorkspaceWasClone: true,
            homeOpenMs: 120,
            databaseOpenMs: 2400,
            databaseState: { rowCountText: "500000 rows", renderedRowCount: 20, virtualSpacerCount: 2, virtualized: true, documentHorizontalOverflowPx: 0 }
          },
          { viewport: "compact" }
        ],
        artifactContract: {
          status: "passed",
          reproduceCommand: "npm run smoke:real-demo-workspace-ui",
          workspaceName: "Lotion Demo Space",
          sourceFingerprint: fingerprint,
          sourceUnchanged: true,
          staleToggleTargetMissing: true,
          seededToggleProvenance: "clone-only-importer-regression-shape",
          expectedViewportNames: ["desktop", "compact"],
          observedViewportNames: ["desktop", "compact"],
          snapshotCount: 1,
          snapshots: [{
            viewport: "desktop",
            imagePath: "desktop-toggle.png",
            metadataPath: "desktop-toggle.json",
            imageBytes: 1234,
            provenance: "clone-seeded",
            title: "2022 爸妈视力检查",
            openMs: 321,
            toggleCount: 1,
            loadedImageCount: 1,
            documentHorizontalOverflowPx: 0,
            toggleSummary: "收据",
            collapsed: true,
            reexpanded: true,
            overlay: { kind: "command-modal", visible: true, sourcePath: "/must/not/persist" }
          }]
        }
      },
      status: "passed"
    });

    assert.equal(manifest.result.realWorkspaceEvidence.sourceSafety.unchanged, true);
    assert.equal(manifest.result.realWorkspaceEvidence.isolation.mode, "COPYFILE_FICLONE with platform fallback");
    assert.equal(manifest.result.realWorkspaceEvidence.viewports[0].databaseState.renderedRowCount, 20);
    assert.equal(manifest.result.artifactContract.reproduceCommand, "npm run smoke:real-demo-workspace-ui");
    assert.equal(manifest.result.realWorkspaceEvidence.sourceFingerprint.sha256, "a".repeat(64));
    assert.equal(manifest.result.artifactContract.sourceUnchanged, true);
    assert.equal(manifest.result.artifactContract.sourceFingerprint.totalBytes, 228_505_681);
    assert.equal(manifest.result.artifactContract.staleToggleTargetMissing, true);
    assert.equal(manifest.result.artifactContract.seededToggleProvenance, "clone-only-importer-regression-shape");
    assert.equal(manifest.result.artifactContract.snapshots[0].loadedImageCount, 1);
    assert.equal(manifest.result.artifactContract.snapshots[0].overlay.visible, true);
    assert.doesNotMatch(JSON.stringify(manifest), /must\/not\/persist/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness workspace reload tolerates transient network changes", async () => {
  const calls = [];
  const networkChanged = new Error("page.reload: net::ERR_NETWORK_CHANGED");
  const page = {
    async evaluate(callback, argument) {
      calls.push(["evaluate", argument]);
      assert.equal(typeof callback, "function");
      if (argument === undefined) return 1234;
      return { name: "Fixture", spaceId: "sp_fixture" };
    },
    async reload(options) {
      calls.push(["reload", options]);
      throw networkChanged;
    },
    async waitForFunction(callback, arg, options) {
      calls.push(["waitForFunction", options]);
      assert.equal(typeof callback, "function");
    }
  };

  await openWorkspaceAndReload(page, "/tmp/lotion-workspace");

  assert.deepEqual(calls, [
    ["evaluate", undefined],
    ["evaluate", "/tmp/lotion-workspace"],
    ["reload", { waitUntil: "domcontentloaded" }],
    ["waitForFunction", { timeout: 15_000 }]
  ]);
});

test("ui harness element snapshots include image and metadata artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-snapshot-"));
  const artifactRoot = join(root, "visual");
  try {
    let waitOptions;
    const page = {
      url() {
        return "http://127.0.0.1:5173/#/row";
      },
      viewportSize() {
        return { width: 1040, height: 820 };
      }
    };
    const locator = {
      async waitFor(options) {
        waitOptions = options;
      },
      async evaluate(fn) {
        return fn({
          getBoundingClientRect() {
            return {
              top: 24,
              right: 624,
              bottom: 224,
              left: 64,
              width: 560,
              height: 200
            };
          }
        });
      },
      async screenshot({ path }) {
        await writeFile(path, "fake row-property screenshot", "utf8");
      }
    };

    const snapshot = await captureElementSnapshot({
      artifactRoot,
      deterministicTypography: false,
      locator,
      metadata: { rowId: "row_visual", fieldCount: 8 },
      name: "Row Page Property Panel / compact",
      page,
      viewport: { name: "compact", width: 1040, height: 820 }
    });

    assert.deepEqual(waitOptions, { state: "visible", timeout: 5_000 });
    assert.equal(snapshot.imagePath, join(artifactRoot, "snapshots", "Row-Page-Property-Panel-compact.png"));
    assert.equal(snapshot.metadataPath, join(artifactRoot, "snapshots", "Row-Page-Property-Panel-compact.json"));

    const image = await readFile(snapshot.imagePath, "utf8");
    assert.equal(image, "fake row-property screenshot");

    const metadata = JSON.parse(await readFile(snapshot.metadataPath, "utf8"));
    assert.equal(metadata.name, "Row-Page-Property-Panel-compact");
    assert.equal(metadata.url, "http://127.0.0.1:5173/#/row");
    assert.deepEqual(metadata.viewport, { name: "compact", width: 1040, height: 820 });
    assert.deepEqual(metadata.rect, {
      top: 24,
      right: 624,
      bottom: 224,
      left: 64,
      width: 560,
      height: 200
    });
    assert.equal(metadata.image, snapshot.imagePath);
    assert.deepEqual(metadata.metadata, { rowId: "row_visual", fieldCount: 8 });

    const baseline = await assertElementSnapshotBaseline(snapshot, {
      label: "row property panel compact",
      metadata: { rowId: "row_visual" },
      rect: {
        width: { min: 550, max: 570 },
        height: { min: 190, max: 210 }
      },
      requiredMetadataKeys: ["fieldCount"],
      viewportName: "compact"
    });
    assert.equal(baseline.imageBytes, "fake row-property screenshot".length);
    assert.equal(baseline.viewportName, "compact");
    assert.deepEqual(baseline.checkedRectMetrics, ["width", "height"]);
    assert.deepEqual(baseline.checkedMetadataKeys, ["rowId", "fieldCount"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness element snapshot baseline reports geometry drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-snapshot-drift-"));
  const artifactRoot = join(root, "visual");
  try {
    const page = {
      url() {
        return "http://127.0.0.1:5173/#/row";
      },
      viewportSize() {
        return { width: 1440, height: 1000 };
      }
    };
    const locator = {
      async waitFor() {},
      async evaluate(fn) {
        return fn({
          getBoundingClientRect() {
            return {
              top: 10,
              right: 310,
              bottom: 130,
              left: 10,
              width: 300,
              height: 120
            };
          }
        });
      },
      async screenshot({ path }) {
        await writeFile(path, "fake screenshot", "utf8");
      }
    };

    const snapshot = await captureElementSnapshot({
      artifactRoot,
      deterministicTypography: false,
      locator,
      metadata: { rowId: "row_drift" },
      name: "Row property drift",
      page,
      viewport: { name: "desktop", width: 1440, height: 1000 }
    });

    await assert.rejects(
      () => assertElementSnapshotBaseline(snapshot, {
        label: "row property panel desktop",
        rect: { width: { min: 700, max: 780 } },
        viewportName: "desktop"
      }),
      /rect\.width/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-property visual artifact contract validates viewport screenshots and metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-property-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const imagePath = join(snapshotRoot, "row-property.png");
      const metadataPath = join(snapshotRoot, "row-property.json");
      await writeFile(imagePath, `fake ${viewportName} row-property screenshot`, "utf8");
      const completePanelState = createRowPropertyCompletePanelState(viewportName);
      await writeFile(metadataPath, `${JSON.stringify({
        name: `row-property-${viewportName}`,
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
        rect: { top: 20, right: 820, bottom: 620, left: 120, width: 700, height: 600 },
        image: imagePath,
        metadata: {
          rowId: "row_visual",
          rowTitle: "Row Property Visual Row",
          completePanelState,
          sourceRows: ["Original Notion HTML", "Original Notion CSV"],
          valueColumnLeft: 420,
          visibleRows: [
            "Original Notion HTML",
            "Original Notion CSV",
            "Notes",
            "Empty text",
            "Status",
            "Tags",
            "Done",
            "Blocked",
            "Due date",
            "Empty date",
            "Score",
            "Related"
          ]
        }
      }, null, 2)}\n`, "utf8");
      viewports.push({
        viewport: viewportName,
        recovery: createRowPropertyRecoveryEvidence(viewportName),
        optionRecovery: createRowPropertyOptionRecoveryEvidence(viewportName),
        propertyVisuals: {
          rowCount: 12,
          valueColumnLeft: 420,
          focus: [{}, {}, {}, {}],
          sourceOpen: [
            { label: "Original Notion HTML", requests: ["attachments/original/export/source.html"] },
            { label: "Original Notion CSV", requests: ["attachments/original/export/source.csv"] }
          ],
          completePanelState,
          snapshot: {
            imagePath,
            metadataPath,
            height: 600,
            width: 700
          },
          snapshotBaseline: {
            imageBytes: 24,
            viewportName
          },
          viewport: {
            height: 820,
            scrollWidth: viewportName === "desktop" ? 1440 : 1040,
            width: viewportName === "desktop" ? 1440 : 1040
          }
        }
      });
    }

    const contract = await assertRowPagePropertyVisualArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.snapshots[0].visibleRowCount, 12);
    assert.equal(contract.snapshots[0].horizontalOverflowPx, 0);
    assert.equal(contract.snapshots[0].scrollWidth, 1440);
    assert.deepEqual(contract.snapshots[0].sourceRows, ["Original Notion HTML", "Original Notion CSV"]);
    assert.equal(contract.snapshots[0].completePanelState.rows.Status.searchChipText, "Done");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-property visual artifact contract reports horizontal overflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-property-contract-overflow-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "row-property.png");
    const metadataPath = join(artifactRoot, "row-property.json");
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        sourceRows: ["Original Notion HTML", "Original Notion CSV"],
        valueColumnLeft: 420,
        visibleRows: [
          "Original Notion HTML",
          "Original Notion CSV",
          "Notes",
          "Empty text",
          "Status",
          "Tags",
          "Done",
          "Blocked",
          "Due date",
          "Empty date",
          "Score",
          "Related"
        ]
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertRowPagePropertyVisualArtifactContract({
        status: "passed",
        viewports: [{
          viewport: "desktop",
          recovery: createRowPropertyRecoveryEvidence("desktop"),
          optionRecovery: createRowPropertyOptionRecoveryEvidence("desktop"),
          propertyVisuals: {
            completePanelState: createRowPropertyCompletePanelState("desktop"),
            rowCount: 12,
            valueColumnLeft: 420,
            focus: [{}, {}, {}, {}],
            sourceOpen: [{}, {}],
            snapshot: { imagePath, metadataPath },
            snapshotBaseline: { imageBytes: 15 },
            viewport: { width: 1440, height: 1000, scrollWidth: 1450 }
          }
        }]
      }, { expectedViewportNames: ["desktop"] }),
      /horizontal overflow/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-property visual artifact contract requires transactional recovery evidence", async () => {
  await assert.rejects(
    () => assertRowPagePropertyVisualArtifactContract({
      status: "passed",
      viewports: [{ viewport: "desktop", propertyVisuals: {} }]
    }, { expectedViewportNames: ["desktop"] }),
    /missing transactional recovery evidence/
  );
});

test("row-property visual artifact contract requires option mutation recovery evidence", async () => {
  await assert.rejects(
    () => assertRowPagePropertyVisualArtifactContract({
      status: "passed",
      viewports: [{
        viewport: "desktop",
        recovery: createRowPropertyRecoveryEvidence("desktop"),
        propertyVisuals: {}
      }]
    }, { expectedViewportNames: ["desktop"] }),
    /missing option mutation recovery evidence/
  );
});

test("row-property visual artifact contract reports missing metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-property-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "row-property.png");
    const metadataPath = join(artifactRoot, "row-property.json");
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        sourceRows: ["Original Notion HTML"],
        valueColumnLeft: 420,
        visibleRows: ["Original Notion HTML"]
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertRowPagePropertyVisualArtifactContract({
        status: "passed",
        viewports: [{
          viewport: "desktop",
          recovery: createRowPropertyRecoveryEvidence("desktop"),
          optionRecovery: createRowPropertyOptionRecoveryEvidence("desktop"),
          propertyVisuals: {
            completePanelState: createRowPropertyCompletePanelState("desktop"),
            rowCount: 12,
            valueColumnLeft: 420,
            focus: [{}, {}, {}, {}],
            sourceOpen: [{}, {}],
            snapshot: { imagePath, metadataPath },
            snapshotBaseline: { imageBytes: 15 },
            viewport: { width: 1440, height: 1000, scrollWidth: 1440 }
          }
        }]
      }, { expectedViewportNames: ["desktop"] }),
      /missing source row Original Notion CSV/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-property visual artifact contract rejects a clipped or transparent complete panel", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-property-contract-clipped-"));
  try {
    const imagePath = join(root, "row-property.png");
    const metadataPath = join(root, "row-property.json");
    const completePanelState = createRowPropertyCompletePanelState("compact");
    completePanelState.propertiesOpacity = 0;
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "compact", width: 1040, height: 820 },
      metadata: {
        completePanelState,
        sourceRows: ["Original Notion HTML", "Original Notion CSV"],
        valueColumnLeft: 420,
        visibleRows: rowPropertyNames()
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertRowPagePropertyVisualArtifactContract({
        status: "passed",
        viewports: [{
          viewport: "compact",
          recovery: createRowPropertyRecoveryEvidence("compact"),
          optionRecovery: createRowPropertyOptionRecoveryEvidence("compact"),
          propertyVisuals: {
            completePanelState,
            rowCount: 12,
            valueColumnLeft: 420,
            focus: [{}, {}, {}, {}],
            sourceOpen: [{}, {}],
            snapshot: { imagePath, metadataPath },
            snapshotBaseline: { imageBytes: 15 },
            viewport: { width: 1040, height: 820, scrollWidth: 1040 }
          }
        }]
      }, { expectedViewportNames: ["compact"] }),
      /clipped, hidden, or mis-owned entry panel/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-property visual artifact contract rejects a missing required panel baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-property-contract-baseline-"));
  try {
    const imagePath = join(root, "row-property.png");
    const metadataPath = join(root, "row-property.json");
    const completePanelState = createRowPropertyCompletePanelState("desktop");
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        completePanelState,
        sourceRows: ["Original Notion HTML", "Original Notion CSV"],
        valueColumnLeft: 420,
        visibleRows: rowPropertyNames()
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertRowPagePropertyVisualArtifactContract({
        status: "passed",
        viewports: [{
          viewport: "desktop",
          recovery: createRowPropertyRecoveryEvidence("desktop"),
          optionRecovery: createRowPropertyOptionRecoveryEvidence("desktop"),
          propertyVisuals: {
            completePanelState,
            rowCount: 12,
            valueColumnLeft: 420,
            focus: [{}, {}, {}, {}],
            sourceOpen: [{}, {}],
            snapshot: { imagePath, metadataPath },
            snapshotBaseline: { imageBytes: 15 },
            viewport: { width: 1440, height: 1000, scrollWidth: 1440 }
          }
        }]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed panel baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-page navigation artifact contract validates navigation screenshots and evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-page-navigation-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const imagePath = join(snapshotRoot, "row-page-navigation.png");
      const metadataPath = join(snapshotRoot, "row-page-navigation.json");
      const entry = rowPageNavigationContractEntry(viewportName, { imagePath, metadataPath });
      await writeFile(imagePath, `fake ${viewportName} row-page navigation screenshot`, "utf8");
      await writeFile(metadataPath, `${JSON.stringify({
        name: `row-page-navigation-${viewportName}`,
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
        rect: { top: 30, right: 850, bottom: 520, left: 120, width: 730, height: 490 },
        image: imagePath,
        metadata: {
          databaseId: entry.databaseId,
          rowId: entry.rowId,
          rowTitle: "Row Page Navigation Row",
          visibleRows: [
            "Original Notion HTML",
            "Original Notion CSV",
            "Notes",
            "Status",
            "Tags",
            "Done",
            "Blocked",
            "Due date",
            "Empty date",
            "Score"
          ],
          sourceLinkWidth: 532,
          tagPillHeight: 22
        }
      }, null, 2)}\n`, "utf8");
      viewports.push(entry);
    }

    const contract = await assertRowPageNavigationArtifactContract({
      status: "passed",
      thresholdMs: 1500,
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.snapshots[0].sourceLinkCount, 2);
    assert.equal(contract.snapshots[0].visibleRowCount, 10);
    assert.equal(contract.snapshots[0].rowPageFile, "Row_Page_Navigation_Row--row_row_nav.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-page navigation artifact contract reports missing source opens", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-page-navigation-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "row-page-navigation.png");
    const metadataPath = join(artifactRoot, "row-page-navigation.json");
    const entry = rowPageNavigationContractEntry("desktop", { imagePath, metadataPath });
    entry.sourceLinks[0].opened = [];
    await writeFile(imagePath, "fake row-page navigation screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        databaseId: entry.databaseId,
        rowId: entry.rowId,
        rowTitle: "Row Page Navigation Row",
        visibleRows: ["Original Notion HTML", "Original Notion CSV", "Notes", "Status", "Tags", "Done", "Blocked", "Due date", "Empty date", "Score"],
        sourceLinkWidth: 532,
        tagPillHeight: 22
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertRowPageNavigationArtifactContract({
        status: "passed",
        thresholdMs: 1500,
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing opened request/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("URL field artifact contract validates editable links and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-url-field-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const tableImagePath = join(snapshotRoot, "url-table.png");
      const tableMetadataPath = join(snapshotRoot, "url-table.json");
      const pageImagePath = join(snapshotRoot, "url-page-property.png");
      const pageMetadataPath = join(snapshotRoot, "url-page-property.json");
      const entry = urlFieldContractEntry(viewportName, {
        tableImagePath,
        tableMetadataPath,
        pageImagePath,
        pageMetadataPath
      });
      await writeFile(tableImagePath, `fake ${viewportName} URL table screenshot`, "utf8");
      await writeFile(pageImagePath, `fake ${viewportName} URL page-property screenshot`, "utf8");
      await writeUrlFieldMetadata(tableMetadataPath, viewportName, {
        phase: "table",
        databaseId: entry.databaseId,
        editedNormalizedUrl: entry.editedNormalizedUrl,
        openButtonCount: 1
      });
      await writeUrlFieldMetadata(pageMetadataPath, viewportName, {
        phase: "top-level-page-property",
        pageId: entry.pageUrlProperty.pageId,
        editedNormalizedUrl: entry.pageEditedNormalizedUrl,
        openButtonCount: 1
      });
      viewports.push(entry);
    }

    const contract = await assertUrlFieldArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 4);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.phase), [
      "table",
      "top-level-page-property",
      "table",
      "top-level-page-property"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("URL field artifact contract reports URL text clicks that open links", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-url-field-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const tableImagePath = join(artifactRoot, "url-table.png");
    const tableMetadataPath = join(artifactRoot, "url-table.json");
    const pageImagePath = join(artifactRoot, "url-page-property.png");
    const pageMetadataPath = join(artifactRoot, "url-page-property.json");
    const entry = urlFieldContractEntry("desktop", {
      tableImagePath,
      tableMetadataPath,
      pageImagePath,
      pageMetadataPath
    });
    entry.tableEdit.openedAfterTextClick = [entry.editedNormalizedUrl];
    await writeFile(tableImagePath, "fake URL table screenshot", "utf8");
    await writeFile(pageImagePath, "fake URL page-property screenshot", "utf8");
    await writeUrlFieldMetadata(tableMetadataPath, "desktop", {
      phase: "table",
      databaseId: entry.databaseId,
      editedNormalizedUrl: entry.editedNormalizedUrl,
      openButtonCount: 1
    });
    await writeUrlFieldMetadata(pageMetadataPath, "desktop", {
      phase: "top-level-page-property",
      pageId: entry.pageUrlProperty.pageId,
      editedNormalizedUrl: entry.pageEditedNormalizedUrl,
      openButtonCount: 1
    });

    await assert.rejects(
      () => assertUrlFieldArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /text click opened a table URL/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor regression artifact contract validates editing evidence and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-regression-contract-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor screenshot", "utf8");
    await writeFile(compactImage, "compact editor screenshot", "utf8");
    await writeEditorRegressionMetadata(desktopMetadata, "desktop", editorRegressionMetadata("desktop"));
    await writeEditorRegressionMetadata(compactMetadata, "compact", editorRegressionMetadata("compact"));

    const contract = await assertEditorRegressionArtifactContract({
      status: "passed",
      viewports: [
        editorRegressionContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
        editorRegressionContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
      ]
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.phases), [["editor-regression"], ["editor-regression"]]);
    assert.equal(contract.snapshots[0].typedMs, 42);
    assert.equal(contract.snapshots[1].emptyMarkdownLength, 256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor regression artifact contract reports missing link click evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-regression-contract-fail-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor screenshot", "utf8");
    await writeFile(compactImage, "compact editor screenshot", "utf8");
    await writeEditorRegressionMetadata(desktopMetadata, "desktop", editorRegressionMetadata("desktop"));
    await writeEditorRegressionMetadata(compactMetadata, "compact", editorRegressionMetadata("compact"));
    const desktopEntry = editorRegressionContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata });
    desktopEntry.normal.markdownLinks.bareUrl.directClickOpened = [];

    await assert.rejects(
      () => assertEditorRegressionArtifactContract({
        status: "passed",
        viewports: [
          desktopEntry,
          editorRegressionContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /missing markdown link click\/edit evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor regression artifact contract rejects incomplete page layout recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-layout-recovery-contract-fail-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor screenshot", "utf8");
    await writeFile(compactImage, "compact editor screenshot", "utf8");
    await writeEditorRegressionMetadata(desktopMetadata, "desktop", editorRegressionMetadata("desktop"));
    await writeEditorRegressionMetadata(compactMetadata, "compact", editorRegressionMetadata("compact"));
    const desktopEntry = editorRegressionContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata });
    desktopEntry.empty.layoutRecovery.discardResetDraft = false;

    await assert.rejects(
      () => assertEditorRegressionArtifactContract({
        status: "passed",
        viewports: [
          desktopEntry,
          editorRegressionContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /empty row page layout recovery failed discardResetDraft/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor link-click artifact contract validates open, navigation, editing, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-link-click-contract-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor link-click screenshot", "utf8");
    await writeFile(compactImage, "compact editor link-click screenshot", "utf8");
    await writeEditorLinkClickMetadata(desktopMetadata, "desktop", editorLinkClickMetadata("desktop"));
    await writeEditorLinkClickMetadata(compactMetadata, "compact", editorLinkClickMetadata("compact"));

    const contract = await assertEditorLinkClickArtifactContract({
      status: "passed",
      viewports: [
        editorLinkClickContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
        editorLinkClickContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
      ]
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.phases), [["editor-link-click"], ["editor-link-click"]]);
    assert.equal(contract.snapshots[0].externalOpenedCount, 1);
    assert.equal(contract.snapshots[1].internalNavigatedTitle, "Editor Link Click Secondary compact");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor link-click artifact contract reports missing external open evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-link-click-contract-fail-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor link-click screenshot", "utf8");
    await writeFile(compactImage, "compact editor link-click screenshot", "utf8");
    await writeEditorLinkClickMetadata(desktopMetadata, "desktop", editorLinkClickMetadata("desktop"));
    await writeEditorLinkClickMetadata(compactMetadata, "compact", editorLinkClickMetadata("compact"));
    const desktopEntry = editorLinkClickContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata });
    desktopEntry.external.opened = [];

    await assert.rejects(
      () => assertEditorLinkClickArtifactContract({
        status: "passed",
        viewports: [
          desktopEntry,
          editorLinkClickContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /missing external shell-open evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor scroll artifact contract validates latency, scrollability, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-scroll-contract-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor scroll screenshot", "utf8");
    await writeFile(compactImage, "compact editor scroll screenshot", "utf8");
    await writeEditorScrollMetadata(desktopMetadata, "desktop", editorScrollMetadata("desktop"));
    await writeEditorScrollMetadata(compactMetadata, "compact", editorScrollMetadata("compact"));

    const contract = await assertEditorScrollArtifactContract({
      status: "passed",
      viewports: [
        editorScrollContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
        editorScrollContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
      ]
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.phases), [["editor-scroll"], ["editor-scroll"]]);
    assert.equal(contract.snapshots[0].totalMs, 140);
    assert.equal(contract.snapshots[1].embeddedTablesAfterScroll, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editor scroll artifact contract reports missing embedded table evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-editor-scroll-contract-fail-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop editor scroll screenshot", "utf8");
    await writeFile(compactImage, "compact editor scroll screenshot", "utf8");
    await writeEditorScrollMetadata(desktopMetadata, "desktop", editorScrollMetadata("desktop"));
    await writeEditorScrollMetadata(compactMetadata, "compact", editorScrollMetadata("compact"));
    const desktopEntry = editorScrollContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata });
    desktopEntry.embeddedTablesAfterScroll = 0;

    await assert.rejects(
      () => assertEditorScrollArtifactContract({
        status: "passed",
        viewports: [
          desktopEntry,
          editorScrollContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /lost embedded table after scroll/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search UI artifact contract validates latency, sorting, keyboard, jump, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ui-contract-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop search latency screenshot", "utf8");
    await writeFile(compactImage, "compact search latency screenshot", "utf8");
    await writeSearchUiMetadata(desktopMetadata, "desktop", searchUiMetadata("desktop"));
    await writeSearchUiMetadata(compactMetadata, "compact", searchUiMetadata("compact"));

    const contract = await assertSearchUiArtifactContract({
      status: "passed",
      visibleHits: 100,
      thresholdMs: 1500,
      inputThresholdMs: 80,
      viewports: [
        searchUiContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
        searchUiContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
      ]
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.phases), [["search-latency"], ["search-latency"]]);
    assert.equal(contract.snapshots[0].visibleHitCount, 100);
    assert.equal(contract.snapshots[1].inputMaxMs, 9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search UI performance harness evidence rejects regenerated synthetic hit sets", () => {
  assert.deepEqual(assertSearchHarnessCacheEvidence({
    generationCounts: { relevance: 1, created_asc: 1, updated_desc: 1 },
    queryCounts: { relevance: 4, created_asc: 1, updated_desc: 2 },
    queryTimings: [{ cacheHit: true, delayMs: 350.1, originalMs: 12.2, prepareMs: 0.1, sortMode: "relevance", totalMs: 362.4 }]
  }, "desktop"), {
    generationCounts: { relevance: 1, created_asc: 1, updated_desc: 1 },
    queryCounts: { relevance: 4, created_asc: 1, updated_desc: 2 },
    queryTimings: [{ cacheHit: true, delayMs: 350.1, originalMs: 12.2, prepareMs: 0.1, sortMode: "relevance", totalMs: 362.4 }]
  });
  assert.throws(() => assertSearchHarnessCacheEvidence({
    generationCounts: { relevance: 2 },
    queryCounts: { relevance: 4 },
    queryTimings: [{ cacheHit: true, delayMs: 350, originalMs: 12, prepareMs: 0.1, sortMode: "relevance", totalMs: 362.1 }]
  }, "desktop"), /regenerated synthetic hits/);
});

test("search UI input latency tolerates one scheduler spike but rejects sustained stalls", () => {
  assert.doesNotThrow(() => assertSearchInputLatencyEvidence({
    samples: [8, 9, 7, 227, 8, 10, 9, 8],
    maxMs: 227,
    avgMs: 35.8
  }, 80, "desktop"));
  assert.throws(() => assertSearchInputLatencyEvidence({
    samples: [8, 81, 7, 95, 8, 10, 9, 8],
    maxMs: 95,
    avgMs: 28.3
  }, 80, "desktop"), /not responsive/);
  assert.throws(() => assertSearchInputLatencyEvidence({
    samples: [8, 9, 7, 321, 8, 10, 9, 8],
    maxMs: 321,
    avgMs: 47.5
  }, 80, "desktop"), /not responsive/);
});

test("search UI artifact contract reports missing sort options", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ui-contract-fail-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop search latency screenshot", "utf8");
    await writeFile(compactImage, "compact search latency screenshot", "utf8");
    await writeSearchUiMetadata(desktopMetadata, "desktop", searchUiMetadata("desktop"));
    await writeSearchUiMetadata(compactMetadata, "compact", searchUiMetadata("compact"));
    const desktopEntry = searchUiContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata });
    desktopEntry.sorting.options = desktopEntry.sorting.options.filter((option) => option.value !== "created_asc");

    await assert.rejects(
      () => assertSearchUiArtifactContract({
        status: "passed",
        visibleHits: 100,
        thresholdMs: 1500,
        inputThresholdMs: 80,
        viewports: [
          desktopEntry,
          searchUiContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /missing sort option/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search UI artifact contract rejects clipped or overlapping controls", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ui-clipped-controls-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop search latency screenshot", "utf8");
    await writeFile(compactImage, "compact search latency screenshot", "utf8");
    const clipped = searchUiMetadata("desktop");
    clipped.layout.sortInsideFilters = false;
    clipped.layout.sortOverlapsFilter = true;
    clipped.layout.filtersOverflowX = 72;
    await writeSearchUiMetadata(desktopMetadata, "desktop", clipped);
    await writeSearchUiMetadata(compactMetadata, "compact", searchUiMetadata("compact"));

    await assert.rejects(
      () => assertSearchUiArtifactContract({
        status: "passed",
        visibleHits: 100,
        thresholdMs: 1500,
        inputThresholdMs: 80,
        viewports: [
          searchUiContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
          searchUiContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /clipped or overlapping controls/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search UI artifact contract rejects a missing required result baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ui-missing-baseline-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop search latency screenshot", "utf8");
    await writeFile(compactImage, "compact search latency screenshot", "utf8");
    await writeSearchUiMetadata(desktopMetadata, "desktop", searchUiMetadata("desktop"));
    await writeSearchUiMetadata(compactMetadata, "compact", searchUiMetadata("compact"));

    await assert.rejects(
      () => assertSearchUiArtifactContract({
        status: "passed",
        visibleHits: 100,
        thresholdMs: 1500,
        inputThresholdMs: 80,
        viewports: [
          searchUiContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
          searchUiContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }, {
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed result baseline for desktop/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("navigation anchor artifact contract validates restored scroll, forward navigation, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-navigation-anchor-contract-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop navigation anchor screenshot", "utf8");
    await writeFile(compactImage, "compact navigation anchor screenshot", "utf8");
    await writeNavigationAnchorMetadata(desktopMetadata, "desktop", navigationAnchorMetadata("desktop"));
    await writeNavigationAnchorMetadata(compactMetadata, "compact", navigationAnchorMetadata("compact"));

    const contract = await assertNavigationAnchorArtifactContract({
      status: "passed",
      viewports: [
        navigationAnchorContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata }),
        navigationAnchorContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
      ]
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.phases), [["navigation-anchor-restored"], ["navigation-anchor-restored"]]);
    assert.equal(contract.snapshots[0].restoredScrollTop, 620);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("navigation anchor artifact contract reports missing visible anchor text", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-navigation-anchor-contract-fail-"));
  try {
    const desktopImage = join(root, "desktop.png");
    const desktopMetadata = join(root, "desktop.json");
    const compactImage = join(root, "compact.png");
    const compactMetadata = join(root, "compact.json");
    await writeFile(desktopImage, "desktop navigation anchor screenshot", "utf8");
    await writeFile(compactImage, "compact navigation anchor screenshot", "utf8");
    await writeNavigationAnchorMetadata(desktopMetadata, "desktop", navigationAnchorMetadata("desktop"));
    await writeNavigationAnchorMetadata(compactMetadata, "compact", navigationAnchorMetadata("compact"));
    const desktopEntry = navigationAnchorContractEntry("desktop", { imagePath: desktopImage, metadataPath: desktopMetadata });
    desktopEntry.visibleTextSample = "Anchor paragraph 2: stale top text";

    await assert.rejects(
      () => assertNavigationAnchorArtifactContract({
        status: "passed",
        viewports: [
          desktopEntry,
          navigationAnchorContractEntry("compact", { imagePath: compactImage, metadataPath: compactMetadata })
        ]
      }),
      /visible text did not preserve anchor line/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source attachment artifact contract validates source links and previews", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-source-attachment-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const imagePath = join(snapshotRoot, "source-attachments.png");
      const metadataPath = join(snapshotRoot, "source-attachments.json");
      const entry = sourceAttachmentContractEntry(viewportName, { imagePath, metadataPath });
      await writeFile(imagePath, `fake ${viewportName} source attachment screenshot`, "utf8");
      await writeFile(metadataPath, `${JSON.stringify({
        name: `source-attachments-${viewportName}`,
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
        rect: { top: 30, right: 850, bottom: 260, left: 120, width: 730, height: 230 },
        image: imagePath,
        metadata: {
          databaseId: "db_source_attachment",
          rowId: "row_source_attachment",
          rowTitle: "Source Attachment Row",
          originalHtmlRel: entry.originalHtmlRel,
          originalCsvRel: entry.originalCsvRel,
          sourceLinkCount: 2
        }
      }, null, 2)}\n`, "utf8");
      viewports.push(entry);
    }

    const contract = await assertSourceAttachmentArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].previews, {
      pdf: true,
      video: true,
      audio: true,
      image: true
    });
    assert.equal(contract.snapshots[0].sourceLinkCount, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("source attachment artifact contract reports missing rendered previews", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-source-attachment-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "source-attachments.png");
    const metadataPath = join(artifactRoot, "source-attachments.json");
    const entry = sourceAttachmentContractEntry("desktop", { imagePath, metadataPath });
    entry.rendered.audioPreview = { src: "", controls: false };
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        originalHtmlRel: entry.originalHtmlRel,
        originalCsvRel: entry.originalCsvRel,
        sourceLinkCount: 2
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertSourceAttachmentArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing audio preview controls/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notion import audit artifact contract validates summary screenshots and open paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-audit-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    const diagnostics = [];
    const importModal = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const modalImagePath = join(snapshotRoot, "notion-import-command-modal.png");
      const modalMetadataPath = join(snapshotRoot, "notion-import-command-modal.json");
      const modalEntry = notionImportModalContractEntry(viewportName, {
        imagePath: modalImagePath,
        metadataPath: modalMetadataPath
      });
      await writeNotionImportModalSnapshotFiles({
        entry: modalEntry,
        imagePath: modalImagePath,
        metadataPath: modalMetadataPath,
        viewportName
      });
      importModal.push(modalEntry);

      const imagePath = join(snapshotRoot, "notion-audit-result.png");
      const metadataPath = join(snapshotRoot, "notion-audit-result.json");
      const entry = notionImportAuditContractEntry(viewportName, { imagePath, metadataPath });
      await writeNotionImportAuditSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);

      const diagnosticImagePath = join(snapshotRoot, "notion-audit-diagnostic.png");
      const diagnosticMetadataPath = join(snapshotRoot, "notion-audit-diagnostic.json");
      const diagnosticEntry = notionImportAuditDiagnosticEntry(viewportName, {
        imagePath: diagnosticImagePath,
        metadataPath: diagnosticMetadataPath
      });
      await writeNotionImportAuditSnapshotFiles({
        entry: diagnosticEntry,
        imagePath: diagnosticImagePath,
        metadataPath: diagnosticMetadataPath,
        viewportName
      });
      diagnostics.push(diagnosticEntry);
    }

    const contract = await assertNotionImportAuditArtifactContract({
      diagnostics,
      importModal,
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 6);
    assert.equal(contract.modalCount, 2);
    assert.equal(contract.diagnosticCount, 2);
    assert.equal(contract.snapshots[0].phase, "command-modal");
    assert.equal(contract.snapshots[0].overlay.title, "Import from Notion");
    assert.equal(contract.snapshots[0].controlState.scanDisabled, true);
    assert.equal(contract.snapshots[2].pathButtons, 2);
    assert.equal(contract.snapshots[2].openedCount, 2);
    assert.equal(contract.snapshots[2].summary.Issues, "0");
    assert.equal(contract.snapshots[2].singleFlightSubmission.resultCount, 1);
    assert.equal(contract.snapshots[4].phase, "diagnostic");
    assert.equal(contract.snapshots[4].issueKinds.cell_loss, 1);
    assert.equal(contract.snapshots[4].summary.Issues, "1");
    viewports[0].singleFlightSubmission.resultCount = 2;
    await assert.rejects(
      () => assertNotionImportAuditArtifactContract({
        diagnostics,
        importModal,
        status: "passed",
        viewports
      }),
      /single-flight submission evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notion import audit artifact contract reports missing failing diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-audit-contract-missing-diagnostic-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    const importModal = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const modalImagePath = join(snapshotRoot, "notion-import-command-modal.png");
      const modalMetadataPath = join(snapshotRoot, "notion-import-command-modal.json");
      const modalEntry = notionImportModalContractEntry(viewportName, {
        imagePath: modalImagePath,
        metadataPath: modalMetadataPath
      });
      await writeNotionImportModalSnapshotFiles({
        entry: modalEntry,
        imagePath: modalImagePath,
        metadataPath: modalMetadataPath,
        viewportName
      });
      importModal.push(modalEntry);
      const imagePath = join(snapshotRoot, "notion-audit-result.png");
      const metadataPath = join(snapshotRoot, "notion-audit-result.json");
      const entry = notionImportAuditContractEntry(viewportName, { imagePath, metadataPath });
      await writeNotionImportAuditSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    await assert.rejects(
      () => assertNotionImportAuditArtifactContract({
        importModal,
        status: "passed",
        viewports
      }),
      /missing failing diagnostic/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notion import audit artifact contract rejects clipped or transparent modal controls", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-audit-contract-clipped-modal-"));
  try {
    const modalImagePath = join(root, "notion-import-command-modal.png");
    const modalMetadataPath = join(root, "notion-import-command-modal.json");
    const modalEntry = notionImportModalContractEntry("desktop", {
      imagePath: modalImagePath,
      metadataPath: modalMetadataPath
    });
    modalEntry.controlState.opacity = 0;
    modalEntry.controlState.sourceButtonRects[1] = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    await writeNotionImportModalSnapshotFiles({
      entry: modalEntry,
      imagePath: modalImagePath,
      metadataPath: modalMetadataPath,
      viewportName: "desktop"
    });
    const auditImagePath = join(root, "notion-audit.png");
    const auditMetadataPath = join(root, "notion-audit.json");
    const auditEntry = notionImportAuditContractEntry("desktop", {
      imagePath: auditImagePath,
      metadataPath: auditMetadataPath
    });
    await writeNotionImportAuditSnapshotFiles({
      entry: auditEntry,
      imagePath: auditImagePath,
      metadataPath: auditMetadataPath,
      viewportName: "desktop"
    });
    const diagnosticImagePath = join(root, "notion-diagnostic.png");
    const diagnosticMetadataPath = join(root, "notion-diagnostic.json");
    const diagnosticEntry = notionImportAuditDiagnosticEntry("desktop", {
      imagePath: diagnosticImagePath,
      metadataPath: diagnosticMetadataPath
    });
    await writeNotionImportAuditSnapshotFiles({
      entry: diagnosticEntry,
      imagePath: diagnosticImagePath,
      metadataPath: diagnosticMetadataPath,
      viewportName: "desktop"
    });

    await assert.rejects(
      () => assertNotionImportAuditArtifactContract({
        importModal: [modalEntry],
        diagnostics: [diagnosticEntry],
        status: "passed",
        viewports: [auditEntry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing complete entry import modal sourceButtonRects|clipped, transparent, or incomplete/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notion import audit artifact contract requires a committed modal baseline when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-audit-contract-missing-modal-baseline-"));
  try {
    const imagePath = join(root, "notion-import-command-modal.png");
    const metadataPath = join(root, "notion-import-command-modal.json");
    const modalEntry = notionImportModalContractEntry("desktop", { imagePath, metadataPath });
    await writeNotionImportModalSnapshotFiles({ entry: modalEntry, imagePath, metadataPath, viewportName: "desktop" });
    const auditImagePath = join(root, "notion-audit.png");
    const auditMetadataPath = join(root, "notion-audit.json");
    const auditEntry = notionImportAuditContractEntry("desktop", { imagePath: auditImagePath, metadataPath: auditMetadataPath });
    await writeNotionImportAuditSnapshotFiles({ entry: auditEntry, imagePath: auditImagePath, metadataPath: auditMetadataPath, viewportName: "desktop" });
    const diagnosticImagePath = join(root, "notion-diagnostic.png");
    const diagnosticMetadataPath = join(root, "notion-diagnostic.json");
    const diagnosticEntry = notionImportAuditDiagnosticEntry("desktop", {
      imagePath: diagnosticImagePath,
      metadataPath: diagnosticMetadataPath
    });
    await writeNotionImportAuditSnapshotFiles({
      entry: diagnosticEntry,
      imagePath: diagnosticImagePath,
      metadataPath: diagnosticMetadataPath,
      viewportName: "desktop"
    });

    await assert.rejects(
      () => assertNotionImportAuditArtifactContract({
        importModal: [modalEntry],
        diagnostics: [diagnosticEntry],
        status: "passed",
        viewports: [auditEntry]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed command-modal baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("notion import audit artifact contract reports missing path evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-audit-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const modalImagePath = join(artifactRoot, "notion-import-command-modal.png");
    const modalMetadataPath = join(artifactRoot, "notion-import-command-modal.json");
    const modalEntry = notionImportModalContractEntry("desktop", {
      imagePath: modalImagePath,
      metadataPath: modalMetadataPath
    });
    await writeNotionImportModalSnapshotFiles({
      entry: modalEntry,
      imagePath: modalImagePath,
      metadataPath: modalMetadataPath,
      viewportName: "desktop"
    });
    const imagePath = join(artifactRoot, "notion-audit-result.png");
    const metadataPath = join(artifactRoot, "notion-audit-result.json");
    const entry = notionImportAuditContractEntry("desktop", { imagePath, metadataPath });
    entry.shellOpenDryRunRequests = [entry.sourceRoot];
    await writeNotionImportAuditSnapshotFiles({
      entry,
      imagePath,
      metadataPath,
      viewportName: "desktop"
    });

    await assert.rejects(
      () => assertNotionImportAuditArtifactContract({
        importModal: [modalEntry],
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing opened path/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markdown preview artifact contract validates screenshots and rendered widgets", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-markdown-preview-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const initialImagePath = join(snapshotRoot, "markdown-preview-initial.png");
      const initialMetadataPath = join(snapshotRoot, "markdown-preview-initial.json");
      const selectedImagePath = join(snapshotRoot, "markdown-preview-selected-imported-highlight.png");
      const selectedMetadataPath = join(snapshotRoot, "markdown-preview-selected-imported-highlight.json");
      const importedToggleImagePath = join(snapshotRoot, "markdown-preview-imported-toggle.png");
      const importedToggleMetadataPath = join(snapshotRoot, "markdown-preview-imported-toggle.json");
      const widgetsImagePath = join(snapshotRoot, "markdown-preview-widgets.png");
      const widgetsMetadataPath = join(snapshotRoot, "markdown-preview-widgets.json");
      await writeMarkdownSnapshotFiles({
        imagePath: initialImagePath,
        metadataPath: initialMetadataPath,
        phase: "initial",
        viewportName
      });
      await writeMarkdownSnapshotFiles({
        imagePath: selectedImagePath,
        metadataPath: selectedMetadataPath,
        phase: "selected-imported-highlight",
        viewportName
      });
      await writeMarkdownSnapshotFiles({
        imagePath: importedToggleImagePath,
        metadataPath: importedToggleMetadataPath,
        phase: "imported-toggle",
        viewportName
      });
      await writeMarkdownSnapshotFiles({
        imagePath: widgetsImagePath,
        metadataPath: widgetsMetadataPath,
        phase: "widgets",
        viewportName
      });
      viewports.push(markdownPreviewContractEntry(viewportName, {
        initialImagePath,
        initialMetadataPath,
        selectedImagePath,
        selectedMetadataPath,
        importedToggleImagePath,
        importedToggleMetadataPath,
        widgetsImagePath,
        widgetsMetadataPath
      }));
    }

    const contract = await assertMarkdownPreviewArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 8);
    assert.deepEqual(contract.viewports[0].phases, ["initial", "selected-imported-highlight", "imported-toggle", "widgets"]);
    assert.equal(contract.snapshots[0].imagePath, join(artifactRoot, "desktop", "markdown-preview-selected-imported-highlight.png"));
    assert.equal(contract.snapshots[0].metadataPath, join(artifactRoot, "desktop", "markdown-preview-selected-imported-highlight.json"));
    assert.deepEqual(contract.viewports[0].phaseSnapshots.map((entry) => entry.phase), ["initial", "selected-imported-highlight", "imported-toggle", "widgets"]);
    assert.equal(contract.viewports[0].previews.callout, true);
    assert.equal(contract.viewports[0].previews.missingDatabase, true);
    assert.equal(contract.viewports[0].sourceHidden, true);
    assert.equal(contract.viewports[0].phaseSnapshots[1].selectedSourceState.editSourceText, "Edit source");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markdown preview artifact contract reports missing high-risk widgets", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-markdown-preview-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const initialImagePath = join(artifactRoot, "markdown-preview-initial.png");
    const initialMetadataPath = join(artifactRoot, "markdown-preview-initial.json");
    const selectedImagePath = join(artifactRoot, "markdown-preview-selected-imported-highlight.png");
    const selectedMetadataPath = join(artifactRoot, "markdown-preview-selected-imported-highlight.json");
    const importedToggleImagePath = join(artifactRoot, "markdown-preview-imported-toggle.png");
    const importedToggleMetadataPath = join(artifactRoot, "markdown-preview-imported-toggle.json");
    const widgetsImagePath = join(artifactRoot, "markdown-preview-widgets.png");
    const widgetsMetadataPath = join(artifactRoot, "markdown-preview-widgets.json");
    await writeMarkdownSnapshotFiles({
      imagePath: initialImagePath,
      metadataPath: initialMetadataPath,
      phase: "initial",
      viewportName: "desktop"
    });
    await writeMarkdownSnapshotFiles({
      imagePath: selectedImagePath,
      metadataPath: selectedMetadataPath,
      phase: "selected-imported-highlight",
      viewportName: "desktop"
    });
    await writeMarkdownSnapshotFiles({
      imagePath: importedToggleImagePath,
      metadataPath: importedToggleMetadataPath,
      phase: "imported-toggle",
      viewportName: "desktop"
    });
    await writeMarkdownSnapshotFiles({
      imagePath: widgetsImagePath,
      metadataPath: widgetsMetadataPath,
      phase: "widgets",
      viewportName: "desktop"
    });
    const entry = markdownPreviewContractEntry("desktop", {
      initialImagePath,
      initialMetadataPath,
      selectedImagePath,
      selectedMetadataPath,
      importedToggleImagePath,
      importedToggleMetadataPath,
      widgetsImagePath,
      widgetsMetadataPath
    });
    const missingSelectedSnapshot = structuredClone(entry);
    missingSelectedSnapshot.visualSnapshots = missingSelectedSnapshot.visualSnapshots
      .filter((snapshot) => snapshot.phase !== "selected-imported-highlight");
    await assert.rejects(
      () => assertMarkdownPreviewArtifactContract({
        status: "passed",
        viewports: [missingSelectedSnapshot]
      }, { expectedViewportNames: ["desktop"] }),
      /missing selected-imported-highlight snapshot/
    );
    entry.rendered.iframePreview = null;

    await assert.rejects(
      () => assertMarkdownPreviewArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /iframe preview src mismatch/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("markdown preview artifact contract rejects clipped or transparent selected-source controls", async () => {
  const fixture = await createMarkdownPreviewArtifactFixture("desktop");
  try {
    fixture.entry.visualSnapshots[1].selectedSourceState.editSourceOpacity = 0;
    fixture.entry.visualSnapshots[1].selectedSourceState.selectionRect.width = 0;
    fixture.entry.visualSnapshots[1].selectedSourceState.selectionOverlapsEditSource = true;
    await writeMarkdownSnapshotFiles({
      imagePath: fixture.paths.selectedImagePath,
      metadataPath: fixture.paths.selectedMetadataPath,
      phase: "selected-imported-highlight",
      viewportName: "desktop",
      selectedSourceState: fixture.entry.visualSnapshots[1].selectedSourceState
    });
    await assert.rejects(
      () => assertMarkdownPreviewArtifactContract({
        status: "passed",
        viewports: [fixture.entry]
      }, { expectedViewportNames: ["desktop"] }),
      /selected-source selectionRect geometry|clipped, hidden, or incomplete/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("markdown preview artifact contract requires a committed selected-source baseline when requested", async () => {
  const fixture = await createMarkdownPreviewArtifactFixture("desktop");
  try {
    await assert.rejects(
      () => assertMarkdownPreviewArtifactContract({
        status: "passed",
        viewports: [fixture.entry]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed selected-source baseline/
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("embedded view artifact contract validates table screenshots and load-more affordance", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const results = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const imagePath = join(snapshotRoot, "embedded-table.png");
      const metadataPath = join(snapshotRoot, "embedded-table.json");
      const entry = embeddedViewContractEntry(viewportName, { imagePath, metadataPath });
      await writeFile(imagePath, `fake ${viewportName} embedded table screenshot`, "utf8");
      await writeFile(metadataPath, `${JSON.stringify({
        name: `embedded-table-${viewportName}`,
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
        rect: { top: 100, right: 1060, bottom: 720, left: 120, width: 940, height: 620 },
        image: imagePath,
        metadata: {
          phase: "embedded-table",
          embeddedViews: entry.embeddedViews,
          rowsPerDatabase: entry.rowsPerDatabase,
          columnOrder: entry.columnOrder,
          pagination: entry.pagination,
          completeSurfaceState: entry.visualSnapshot.completeSurfaceState
        }
      }, null, 2)}\n`, "utf8");
      results.push(entry);
    }

    const contract = await assertEmbeddedViewArtifactContract({
      status: "passed",
      results
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.renderThresholdMs, 1000);
    assert.equal(contract.coldStartRenderThresholdMs, 1250);
    assert.equal(contract.maxRenderMs, 120);
    assert.deepEqual(contract.renderTimings, [
      { viewport: "desktop", embeddedViews: 1, rowsPerDatabase: 120, renderMs: 120 },
      { viewport: "compact", embeddedViews: 1, rowsPerDatabase: 120, renderMs: 120 }
    ]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].columnOrder, ["Name", "Notes", "Score"]);
    assert.equal(contract.snapshots[0].loadMoreShown, 100);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("embedded view artifact contract rejects any over-budget non-snapshot scenario", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-budget-contract-fail-"));
  try {
    const imagePath = join(root, "embedded-table.png");
    const metadataPath = join(root, "embedded-table.json");
    const entry = embeddedViewContractEntry("desktop", { imagePath, metadataPath });
    const slowEntry = {
      ...entry,
      embeddedViews: 10,
      rendered: 10,
      renderMs: 1000.1,
      visualSnapshot: null,
      columnOrder: null,
      headerActions: null,
      pagination: null
    };
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        phase: "embedded-table",
        embeddedViews: entry.embeddedViews,
        rowsPerDatabase: entry.rowsPerDatabase,
        columnOrder: entry.columnOrder,
        pagination: entry.pagination,
        completeSurfaceState: entry.visualSnapshot.completeSurfaceState
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry, slowEntry]
      }, { expectedViewportNames: ["desktop"], renderThresholdMs: 1000 }),
      /10 embedded views rendered in 1000\.1ms for desktop, exceeding the steady-state budget of 1000ms/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("embedded view artifact contract gives only the first cold render a separate budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-cold-budget-contract-"));
  try {
    const imagePath = join(root, "embedded-table.png");
    const metadataPath = join(root, "embedded-table.json");
    const entry = embeddedViewContractEntry("desktop", { imagePath, metadataPath });
    entry.renderMs = 1100;
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        phase: "embedded-table",
        embeddedViews: entry.embeddedViews,
        rowsPerDatabase: entry.rowsPerDatabase,
        columnOrder: entry.columnOrder,
        pagination: entry.pagination,
        completeSurfaceState: entry.visualSnapshot.completeSurfaceState
      }
    })}\n`, "utf8");

    const contract = await assertEmbeddedViewArtifactContract({ status: "passed", results: [entry] }, {
      expectedViewportNames: ["desktop"],
      renderThresholdMs: 1000,
      coldStartRenderThresholdMs: 1250
    });
    assert.equal(contract.maxRenderMs, 1100);

    entry.renderMs = 1250.1;
    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({ status: "passed", results: [entry] }, {
        expectedViewportNames: ["desktop"],
        renderThresholdMs: 1000,
        coldStartRenderThresholdMs: 1250
      }),
      /exceeding the cold-start budget of 1250ms/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("embedded view artifact contract reports weak load-more controls", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "embedded-table.png");
    const metadataPath = join(artifactRoot, "embedded-table.json");
    const entry = embeddedViewContractEntry("desktop", { imagePath, metadataPath });
    entry.pagination.loadMoreAffordance.buttonMetrics.cursor = "default";
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        phase: "embedded-table",
        embeddedViews: entry.embeddedViews,
        rowsPerDatabase: entry.rowsPerDatabase,
        columnOrder: entry.columnOrder,
        pagination: entry.pagination,
        completeSurfaceState: entry.visualSnapshot.completeSurfaceState
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /lost button semantics/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("embedded view artifact contract reports missing header actions", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-header-contract-fail-"));
  try {
    await mkdir(root, { recursive: true });
    const imagePath = join(root, "embedded-table.png");
    const metadataPath = join(root, "embedded-table.json");
    const entry = embeddedViewContractEntry("desktop", { imagePath, metadataPath });
    const settingsButton = entry.headerActions.settingsButton;
    delete entry.headerActions.settingsButton;
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        phase: "embedded-table",
        embeddedViews: entry.embeddedViews,
        rowsPerDatabase: entry.rowsPerDatabase,
        columnOrder: entry.columnOrder,
        pagination: entry.pagination,
        completeSurfaceState: entry.visualSnapshot.completeSurfaceState
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /weak Settings action/
    );

    entry.headerActions.settingsButton = settingsButton;
    entry.headerActions.settingsMenu.viewHasLayout = false;
    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /scoped settings menu/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("embedded view artifact contract rejects clipped geometry and requires committed baselines", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-embedded-view-complete-surface-fail-"));
  try {
    const imagePath = join(root, "embedded-table.png");
    const metadataPath = join(root, "embedded-table.json");
    const entry = embeddedViewContractEntry("desktop", { imagePath, metadataPath });
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        phase: "embedded-table",
        embeddedViews: entry.embeddedViews,
        rowsPerDatabase: entry.rowsPerDatabase,
        columnOrder: entry.columnOrder,
        pagination: entry.pagination,
        completeSurfaceState: entry.visualSnapshot.completeSurfaceState
      }
    })}\n`, "utf8");

    entry.visualSnapshot.completeSurfaceState.surfaceOpacity = 0;
    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /clipped, hidden, incomplete, or offscreen entry table/
    );

    entry.visualSnapshot.completeSurfaceState.surfaceOpacity = 1;
    entry.visualSnapshot.completeSurfaceState.footerRect.left = 900;
    entry.visualSnapshot.completeSurfaceState.footerRect.right = 1612;
    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /mis-owned entry surface content/
    );

    entry.visualSnapshot.completeSurfaceState = embeddedCompleteSurfaceState("desktop");
    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed table baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global search visual artifact contract validates screenshots and command palette states", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-global-search-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const snapshotPaths = {};
      for (const phase of searchContractPhases()) {
        const imagePath = join(snapshotRoot, `${phase}.png`);
        const metadataPath = join(snapshotRoot, `${phase}.json`);
        await writeSearchSnapshotFiles({
          imagePath,
          metadataPath,
          phase,
          viewportName
        });
        snapshotPaths[phase] = { imagePath, metadataPath };
      }
      viewports.push(globalSearchContractEntry(viewportName, snapshotPaths));
    }

    const contract = await assertGlobalSearchVisualArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].phases, searchContractPhases());
    assert.equal(contract.snapshots[0].commandRowCount >= 2, true);
    assert.equal(contract.snapshots[0].recentRowCount >= 3, true);
    assert.equal(contract.snapshots[0].tagRows, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global search visual artifact contract reports raw page-id leaks", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-global-search-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const snapshotPaths = {};
    for (const phase of searchContractPhases()) {
      const imagePath = join(artifactRoot, `${phase}.png`);
      const metadataPath = join(artifactRoot, `${phase}.json`);
      await writeSearchSnapshotFiles({
        imagePath,
        metadataPath,
        phase,
        viewportName: "desktop",
        extraVisibleRows: phase === "typed"
          ? [{ title: "pg_search_contract_desktop", badge: "页面", type: "page", preview: "raw id leak" }]
          : []
      });
      snapshotPaths[phase] = { imagePath, metadataPath };
    }
    const entry = globalSearchContractEntry("desktop", snapshotPaths);

    await assert.rejects(
      () => assertGlobalSearchVisualArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /leaked raw page id/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings center artifact contract validates category snapshots and deep-link evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-center-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const imagePath = join(snapshotRoot, "settings-center.png");
      const metadataPath = join(snapshotRoot, "settings-center.json");
      const entry = settingsCenterContractEntry(viewportName, { imagePath, metadataPath });
      await writeSettingsCenterSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertSettingsCenterArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.equal(contract.snapshots[0].perceptualBaseline.status, "passed");
    assert.equal(contract.snapshots[0].categoryCount, requiredSettingsCenterCategories().length);
    assert.equal(contract.snapshots[0].searchAiPluginHosts, 2);
    assert.equal(contract.snapshots[0].snapshotState.activeTab, "PluginsExtensions");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings center artifact contract rejects missing committed baseline evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-center-baseline-fail-"));
  try {
    const imagePath = join(root, "settings-center-wide.png");
    const metadataPath = join(root, "settings-center-wide.json");
    const entry = settingsCenterContractEntry("wide", { imagePath, metadataPath });
    await writeSettingsCenterSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "wide" });
    delete entry.perceptualBaseline;

    await assert.rejects(
      () => assertSettingsCenterArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["wide"] }),
      /missing committed perceptual baseline for wide/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings center artifact contract rejects an in-flight active-tab transition", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-center-transition-fail-"));
  try {
    const imagePath = join(root, "settings-center-desktop.png");
    const metadataPath = join(root, "settings-center-desktop.json");
    const entry = settingsCenterContractEntry("desktop", { imagePath, metadataPath });
    entry.snapshotState.activeTabStyle.backgroundColor = "rgb(235, 239, 248)";
    await writeSettingsCenterSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertSettingsCenterArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /active Plugins tab transition is unsettled/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings center artifact contract rejects a clipped final plugin row", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-center-clipped-row-fail-"));
  try {
    const imagePath = join(root, "settings-center-compact.png");
    const metadataPath = join(root, "settings-center-compact.json");
    const entry = settingsCenterContractEntry("compact", { imagePath, metadataPath });
    entry.snapshotState.lastPluginRowWithinCenter = false;
    entry.snapshotState.visiblePluginRowCount = 6;
    await writeSettingsCenterSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "compact" });

    await assert.rejects(
      () => assertSettingsCenterArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["compact"] }),
      /final snapshot state is unstable/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings center artifact contract reports missing plugin settings evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-settings-center-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "settings-center.png");
    const metadataPath = join(artifactRoot, "settings-center.json");
    const entry = settingsCenterContractEntry("desktop", { imagePath, metadataPath });
    entry.searchAiDeepLink.pluginHosts = 1;
    await writeSettingsCenterSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertSettingsCenterArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /Search & AI plugin hosts/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system artifact contract validates token, control, and layout evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `${viewportName}.png`);
      const metadataPath = join(artifactRoot, `${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      const entry = designSystemContractEntry(viewportName, { imagePath, metadataPath });
      await writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertDesignSystemArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.equal(contract.snapshots[0].perceptualBaseline.status, "passed");
    assert.match(contract.snapshots[0].perceptualBaseline.expectedPath, /desktop\.expected\.png$/);
    assert.equal(contract.snapshots[1].perceptualBaseline.status, "passed");
    assert.match(contract.snapshots[1].perceptualBaseline.expectedPath, /compact\.expected\.png$/);
    assert.equal(contract.snapshots[0].tokenCount, 4);
    assert.deepEqual(contract.snapshots[0].statusPills, requiredDesignSystemStatusPills());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system artifact contract reports missing token evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "design-system.png");
    const metadataPath = join(artifactRoot, "design-system.json");
    const entry = designSystemContractEntry("desktop", { imagePath, metadataPath });
    entry.themeState.tokens.paper = "#f4f4f2";
    await writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertDesignSystemArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /token paper mismatch/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system artifact contract rejects missing committed desktop baseline evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-baseline-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "design-system.png");
    const metadataPath = join(artifactRoot, "design-system.json");
    const entry = designSystemContractEntry("desktop", { imagePath, metadataPath });
    await writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    delete entry.perceptualBaseline;

    await assert.rejects(
      () => assertDesignSystemArtifactContract({ status: "passed", viewports: [entry] }, { expectedViewportNames: ["desktop"] }),
      /missing committed perceptual baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system artifact contract rejects missing committed compact baseline evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-compact-baseline-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `${viewportName}.png`);
      const metadataPath = join(artifactRoot, `${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      const entry = designSystemContractEntry(viewportName, { imagePath, metadataPath });
      await writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      if (viewportName === "compact") delete entry.perceptualBaseline;
      viewports.push(entry);
    }
    await assert.rejects(
      () => assertDesignSystemArtifactContract({ status: "passed", viewports }),
      /missing committed perceptual baseline for compact/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system artifact contract rejects missing committed wide baseline evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-wide-baseline-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "wide.png");
    const metadataPath = join(artifactRoot, "wide.json");
    const entry = designSystemContractEntry("wide", { imagePath, metadataPath });
    await writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "wide" });
    delete entry.perceptualBaseline;
    await assert.rejects(
      () => assertDesignSystemArtifactContract({ status: "passed", viewports: [entry] }, { expectedViewportNames: ["wide"] }),
      /missing committed perceptual baseline for wide/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design system artifact contract rejects clipped quality-gate pill geometry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-pill-geometry-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "desktop.png");
    const metadataPath = join(artifactRoot, "desktop.json");
    const entry = designSystemContractEntry("desktop", { imagePath, metadataPath });
    entry.controlState.statusPillGeometry.find((pill) => pill.label === "Local").withinLab = false;
    await writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertDesignSystemArtifactContract({ status: "passed", viewports: [entry] }, { expectedViewportNames: ["desktop"] }),
      /status pill Local is missing or clipped/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("image lightbox artifact contract validates zoom controls and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-image-lightbox-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `${viewportName}.png`);
      const metadataPath = join(artifactRoot, `${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      const entry = imageLightboxContractEntry(viewportName, { imagePath, metadataPath });
      await writeImageLightboxSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertImageLightboxArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].controls, requiredImageLightboxControls());
    assert.equal(contract.snapshots[0].zoomedWidth > 180, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("image lightbox artifact contract reports missing keyboard zoom evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-image-lightbox-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "image-lightbox.png");
    const metadataPath = join(artifactRoot, "image-lightbox.json");
    const entry = imageLightboxContractEntry("desktop", { imagePath, metadataPath });
    entry.geometry.keyboardZoomRect.width = entry.geometry.zoomedRect.width;
    await writeImageLightboxSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertImageLightboxArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /keyboard zoom-in evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database created views artifact contract validates generated views and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-created-views-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `${viewportName}.png`);
      const metadataPath = join(artifactRoot, `${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      const entry = databaseCreatedViewsContractEntry(viewportName, { imagePath, metadataPath });
      await writeDatabaseCreatedViewsSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertDatabaseCreatedViewsArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].visibleTabs, requiredDatabaseCreatedViewTabs());
    assert.match(contract.snapshots[0].activeTabText, /Created date desc/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database created views artifact contract reports missing generated tab evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-created-views-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "database-created-views.png");
    const metadataPath = join(artifactRoot, "database-created-views.json");
    const entry = databaseCreatedViewsContractEntry("desktop", { imagePath, metadataPath });
    entry.visibleTabs = ["All", "Created date asc"];
    await writeDatabaseCreatedViewsSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertDatabaseCreatedViewsArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing visible tab/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database created views artifact contract rejects dirty geometry and requires committed baselines", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-created-views-surface-fail-"));
  try {
    const imagePath = join(root, "database-created-views.png");
    const metadataPath = join(root, "database-created-views.json");
    const entry = databaseCreatedViewsContractEntry("desktop", { imagePath, metadataPath });
    await writeDatabaseCreatedViewsSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    entry.snapshot.completeSurfaceState.filterPopoverCount = 1;
    await assert.rejects(
      () => assertDatabaseCreatedViewsArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /clipped, hidden, dirty, or incomplete entry surface/
    );

    entry.snapshot.completeSurfaceState = databaseCreatedViewsCompleteSurfaceState("desktop");
    entry.snapshot.completeSurfaceState.footerRect.left = 100;
    await assert.rejects(
      () => assertDatabaseCreatedViewsArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /mis-owned entry surface content/
    );

    entry.snapshot.completeSurfaceState = databaseCreatedViewsCompleteSurfaceState("desktop");
    await assert.rejects(
      () => assertDatabaseCreatedViewsArtifactContract({
        status: "passed",
        viewports: [entry]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed surface baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database interaction artifact contract validates persistence, timing, and viewport evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-interaction-contract-"));
  try {
    const viewports = [];
    for (const viewport of ["desktop", "compact", "wide"]) {
      const snapshots = [];
      for (const phase of ["settings-scope-menu", "filter-menu", "sort-menu"]) {
        const imagePath = join(root, `${viewport}-${phase}.png`);
        const metadataPath = join(root, `${viewport}-${phase}.json`);
        const completeSurfaceState = databaseInteractionCompleteSurfaceState(viewport, phase);
        await writeFile(imagePath, "x".repeat(1024), "utf8");
        await writeFile(metadataPath, `${JSON.stringify({ viewport: { name: viewport }, metadata: { completeSurfaceState, phase } })}\n`, "utf8");
        snapshots.push({
          imagePath,
          metadataPath,
          imageBytes: 0,
          phase,
          completeSurfaceState,
          horizontalOverflowPx: 0,
          viewportWidth: viewport === "wide" ? 1728 : viewport === "compact" ? 1040 : 1440,
          scrollWidth: viewport === "wide" ? 1728 : viewport === "compact" ? 1040 : 1440
        });
      }
      viewports.push({
        viewport,
        noHorizontalOverflow: true,
        reloadVerified: true,
        staleConflictCode: "VIEW_CONFLICT",
        cellEditRecovery: {
          message: "Injected inline cell persistence failure",
          failedValueRolledBack: true,
          laterEditPaused: true,
          queuedEditVisible: true,
          duplicateRetrySuppressed: true,
          retryPersistedFailedEdit: true,
          queueResumedInOrder: true,
          discardPreservedStoredValue: true,
          discardResetDraft: true
        },
        timings: { firstPaintMs: 12, menuOpenMs: 3, sortCommitMs: 8, viewSwitchMs: 4 },
        persistedFiles: {
          viewJson: "databases/user/Tasks--db_tasks/views/view_default.json",
          schemaJson: "databases/user/Tasks--db_tasks/schema.json",
          dataCsv: "databases/user/Tasks--db_tasks/data.csv"
        },
        fixture: { fieldTypeCount: 10, hasVirtualRows: true, hasEmbeddedReference: true },
        snapshots
      });
    }
    const contract = await assertDatabaseInteractionArtifactContract({ status: "passed", viewports });
    assert.equal(contract.snapshotCount, 9);
    assert.ok(contract.imageBytesTotal > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database interaction artifact contract rejects transparent phases and missing baselines", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-interaction-surface-fail-"));
  try {
    const snapshots = [];
    for (const phase of ["settings-scope-menu", "filter-menu", "sort-menu"]) {
      const imagePath = join(root, `${phase}.png`);
      const metadataPath = join(root, `${phase}.json`);
      const completeSurfaceState = databaseInteractionCompleteSurfaceState("desktop", phase);
      await writeFile(imagePath, "x".repeat(1024), "utf8");
      await writeFile(metadataPath, `${JSON.stringify({
        viewport: { name: "desktop" },
        metadata: { completeSurfaceState, phase }
      })}\n`, "utf8");
      snapshots.push({
        imagePath,
        metadataPath,
        imageBytes: 0,
        phase,
        completeSurfaceState,
        horizontalOverflowPx: 0,
        viewportWidth: 1440,
        scrollWidth: 1440
      });
    }
    const entry = {
      viewport: "desktop",
      noHorizontalOverflow: true,
      reloadVerified: true,
      staleConflictCode: "VIEW_CONFLICT",
      cellEditRecovery: {
        message: "Injected inline cell persistence failure",
        failedValueRolledBack: true,
        laterEditPaused: true,
        queuedEditVisible: true,
        duplicateRetrySuppressed: true,
        retryPersistedFailedEdit: true,
        queueResumedInOrder: true,
        discardPreservedStoredValue: true,
        discardResetDraft: true
      },
      timings: { firstPaintMs: 12, menuOpenMs: 3, sortCommitMs: 8, viewSwitchMs: 4 },
      persistedFiles: {
        viewJson: "databases/user/Tasks--db_tasks/views/view_default.json",
        schemaJson: "databases/user/Tasks--db_tasks/schema.json",
        dataCsv: "databases/user/Tasks--db_tasks/data.csv"
      },
      fixture: { fieldTypeCount: 10, hasVirtualRows: true, hasEmbeddedReference: true },
      snapshots
    };

    snapshots[1].completeSurfaceState.surfaceOpacity = 0.05;
    await assert.rejects(
      () => assertDatabaseInteractionArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /clipped, transparent, animating, or offscreen entry surface/
    );

    snapshots[1].completeSurfaceState = databaseInteractionCompleteSurfaceState("desktop", "filter-menu");
    await assert.rejects(
      () => assertDatabaseInteractionArtifactContract({
        status: "passed",
        viewports: [entry]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed settings baseline/
    );

    entry.cellEditRecovery.queueResumedInOrder = false;
    await assert.rejects(
      () => assertDatabaseInteractionArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /cell-edit recovery evidence incomplete/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page backlinks artifact contract validates source rows and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-backlinks-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `${viewportName}.png`);
      const metadataPath = join(artifactRoot, `${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      const entry = pageBacklinksContractEntry(viewportName, { imagePath, metadataPath });
      await writePageBacklinksSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertPageBacklinksArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].sourceTitles, ["Backlink Source Page", "Property Source Row"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page backlinks artifact contract reports missing property backlink evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-backlinks-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "page-backlinks.png");
    const metadataPath = join(artifactRoot, "page-backlinks.json");
    const entry = pageBacklinksContractEntry("desktop", { imagePath, metadataPath });
    const externalRefresh = entry.externalRefresh;
    delete entry.externalRefresh;
    await assert.rejects(
      () => assertPageBacklinksArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /external incremental refresh evidence/
    );
    entry.externalRefresh = externalRefresh;
    entry.rendered.items[1].sourceType = "Text";
    await writePageBacklinksSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertPageBacklinksArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /property backlink evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page backlinks artifact contract rejects internal ids in readable markdown excerpts", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-backlinks-identity-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "page-backlinks.png");
    const metadataPath = join(artifactRoot, "page-backlinks.json");
    const entry = pageBacklinksContractEntry("desktop", { imagePath, metadataPath });
    entry.rendered.items[0].excerpt = "See Backlink Target Page (pg_backlink_target).";
    await writePageBacklinksSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageBacklinksArtifactContract(
        { status: "passed", viewports: [entry] },
        { expectedViewportNames: ["desktop"] }
      ),
      /missing markdown backlink evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract validates panel states, TOC, editor persistence, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact", "laptop"]) {
      const imagePath = join(artifactRoot, `${viewportName}.png`);
      const metadataPath = join(artifactRoot, `${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      const entry = pageSecondaryContractEntry(viewportName, { imagePath, metadataPath });
      await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertPageSecondaryArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact", "laptop"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact", "laptop"]);
    assert.equal(contract.snapshotCount, 3);
    assert.equal(contract.tocCollapsedSnapshotCount, 3);
    assert.equal(contract.tocSnapshotCount, 3);
    assert.deepEqual(contract.snapshots.map((snapshot) => snapshot.backlinkItems), [5, 5, 5]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract reports missing source-link evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "page-secondary.png");
    const metadataPath = join(artifactRoot, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.expanded.sourceLinkMounted = false;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /source link evidence/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects TOC navigation that exposes heading source", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-toc-source-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.toc.navigation.activeInEditor = true;
    entry.toc.navigation.activeIsTocItem = false;
    entry.toc.navigation.headingIsActiveLine = true;
    entry.toc.navigation.headingText = "### Nested Insight";
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /source-safe TOC navigation/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects TOC-driven document reflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-toc-overlap-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("laptop", { imagePath, metadataPath });
    entry.toc.layout.layoutStable = false;
    entry.toc.layout.contentRect.width -= 120;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "laptop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["laptop"] }),
      /reflow-free TOC layout/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects a TOC that stays open after pointer exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-toc-recollapse-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.toc.autoHidden.hostRect.width = 240;
    entry.toc.autoHidden.navDisplay = "block";
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /auto-hidden TOC pointer-navigation exit state/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects pointer-owned TOC focus after pointer exit", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-toc-pointer-focus-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.toc.autoHidden.focusedWithin = true;
    entry.toc.autoHidden.activeIsTocItem = true;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /auto-hidden TOC pointer-navigation exit state/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects pointer-to-keyboard TOC focus loss", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-toc-keyboard-ownership-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.toc.keyboardAfterPointer.focusedWithin = false;
    entry.toc.keyboardAfterPointer.activeIsTocItem = false;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /pointer-to-keyboard TOC ownership/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects pointer-to-keyboard focus loss in the persisted snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-toc-keyboard-snapshot-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    const snapshotMetadata = JSON.parse(await readFile(entry.toc.collapsedSnapshot.metadataPath, "utf8"));
    snapshotMetadata.metadata.keyboardAfterPointer.focusedWithin = false;
    snapshotMetadata.metadata.keyboardAfterPointer.activeIsTocItem = false;
    snapshotMetadata.metadata.keyboardAfterPointer.hovered = true;
    await writeFile(entry.toc.collapsedSnapshot.metadataPath, `${JSON.stringify(snapshotMetadata, null, 2)}\n`, "utf8");
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /snapshot pointer-to-keyboard TOC ownership state/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects incomplete page-property recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-property-recovery-contract-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.pagePropertyRecovery.retryPersistedExactInput = false;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /page-property recovery/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects incomplete page-title recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-title-recovery-contract-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.pageTitleRecovery.retryPersistedExactInput = false;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /page-title recovery/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects incomplete cover-offset recovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-cover-offset-recovery-contract-"));
  try {
    const imagePath = join(root, "page-secondary.png");
    const metadataPath = join(root, "page-secondary.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.coverOffsetRecovery.retryPersistedExactInput = false;
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });
    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /cover-offset recovery/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects history storage-path leaks", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-history-leak-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "page-history.png");
    const metadataPath = join(artifactRoot, "page-history.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.history.storageLeakMatches = ["databases/system/pages--db_pages/pages/Target--pg_target.md"];
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /storage identity leaks/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects a collapsed or transparent history capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-history-hidden-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "page-history.png");
    const metadataPath = join(artifactRoot, "page-history.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    entry.history.secondaryExpanded = false;
    entry.history.contentOpacity = "0.04";
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /clipped history interaction/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page secondary artifact contract rejects a missing required history baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-secondary-history-baseline-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "page-history.png");
    const metadataPath = join(artifactRoot, "page-history.json");
    const entry = pageSecondaryContractEntry("desktop", { imagePath, metadataPath });
    await writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertPageSecondaryArtifactContract({
        status: "passed",
        viewports: [entry]
      }, {
        expectedViewportNames: ["desktop"],
        requiredPerceptualBaselineViewportNames: ["desktop"]
      }),
      /missing committed history baseline for desktop/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager artifact contract validates plugin settings and command evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-plugin-manager-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const imagePath = join(snapshotRoot, "plugin-manager.png");
      const metadataPath = join(snapshotRoot, "plugin-manager.json");
      const entry = pluginManagerContractEntry(viewportName, { imagePath, metadataPath });
      await writePluginManagerSnapshotFiles({ entry, imagePath, metadataPath, viewportName });
      viewports.push(entry);
    }

    const contract = await assertPluginManagerArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.equal(contract.snapshots[0].perceptualBaseline.status, "passed");
    assert.equal(contract.snapshots[0].pluginRows, requiredPluginManagerPlugins().length);
    assert.equal(contract.snapshots[0].snapshotState.providerRowCount, 14);
    assert.equal(contract.snapshots[0].detailCount, 3);
    assert.equal(contract.snapshots[0].commandQuery, "Open Notion Import");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager artifact contract rejects missing committed baseline evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-plugin-manager-baseline-fail-"));
  try {
    const imagePath = join(root, "plugin-manager-wide.png");
    const metadataPath = join(root, "plugin-manager-wide.json");
    const entry = pluginManagerContractEntry("wide", { imagePath, metadataPath });
    await writePluginManagerSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "wide" });
    delete entry.perceptualBaseline;

    await assert.rejects(
      () => assertPluginManagerArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["wide"] }),
      /missing committed perceptual baseline for wide/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager artifact contract rejects an incomplete provider surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-plugin-manager-clipped-provider-fail-"));
  try {
    const imagePath = join(root, "plugin-manager-compact.png");
    const metadataPath = join(root, "plugin-manager-compact.json");
    const entry = pluginManagerContractEntry("compact", { imagePath, metadataPath });
    entry.snapshotState.allProviderRowsWithinManager = false;
    entry.snapshotState.providerRowCount = 11;
    await writePluginManagerSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "compact" });

    await assert.rejects(
      () => assertPluginManagerArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["compact"] }),
      /final snapshot surface is incomplete/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugin manager artifact contract reports missing permission evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-plugin-manager-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "plugin-manager.png");
    const metadataPath = join(artifactRoot, "plugin-manager.json");
    const entry = pluginManagerContractEntry("desktop", { imagePath, metadataPath });
    entry.permissionSummary["Git Sync"] = ["workspace.write", "shell"];
    await writePluginManagerSnapshotFiles({ entry, imagePath, metadataPath, viewportName: "desktop" });

    await assert.rejects(
      () => assertPluginManagerArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing permission network/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("white theme artifact contract validates theme phases and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-white-theme-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const snapshotRoot = join(artifactRoot, viewportName);
      await mkdir(snapshotRoot, { recursive: true });
      const entry = whiteThemeContractEntry(viewportName, snapshotRoot);
      for (const snapshot of entry.snapshots) {
        await writeWhiteThemeSnapshotFiles({ snapshot, viewportName });
      }
      viewports.push(entry);
    }

    const contract = await assertWhiteThemeArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, requiredWhiteThemePhases().length * 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.equal(contract.snapshots[0].phase, "page");
    assert.equal(contract.snapshots[0].perceptualBaseline.status, "passed");
    assert.equal(contract.snapshots[0].surfaceCount > 0, true);
    assert.equal(contract.snapshots[0].tokenCount, 8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("white theme artifact contract rejects missing committed page baseline evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-white-theme-baseline-fail-"));
  const snapshotRoot = join(root, "wide");
  try {
    await mkdir(snapshotRoot, { recursive: true });
    const entry = whiteThemeContractEntry("wide", snapshotRoot);
    for (const snapshot of entry.snapshots) {
      await writeWhiteThemeSnapshotFiles({ snapshot, viewportName: "wide" });
    }
    delete entry.snapshots.find((snapshot) => snapshot.phase === "page").perceptualBaseline;

    await assert.rejects(
      () => assertWhiteThemeArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["wide"] }),
      /missing committed page perceptual baseline for wide/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("white theme artifact contract rejects an asynchronously scrolled page phase", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-white-theme-scroll-fail-"));
  const snapshotRoot = join(root, "desktop");
  try {
    await mkdir(snapshotRoot, { recursive: true });
    const entry = whiteThemeContractEntry("desktop", snapshotRoot);
    entry.pageState.scrollState.scrollTop[".main-content"] = 43;
    for (const snapshot of entry.snapshots) {
      await writeWhiteThemeSnapshotFiles({ snapshot, viewportName: "desktop" });
    }

    await assert.rejects(
      () => assertWhiteThemeArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /page scroll is unstable/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tag pages artifact contract validates management snapshots and navigation evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-tag-pages-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `tag-${viewportName}.png`);
      const metadataPath = join(artifactRoot, `tag-${viewportName}.json`);
      await mkdir(artifactRoot, { recursive: true });
      await writeFile(imagePath, `fake tag page ${viewportName}`, "utf8");
      await writeFile(metadataPath, JSON.stringify({
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
        metadata: {
          phase: "tag-management",
          databaseCount: 1,
          databaseName: "Content Projects",
          heading: "Tag Focus",
          pageCount: 1,
          pageTitle: "Weekly Review",
          rows: ["Weekly Review Page Workspace / Weekly Review", "Content Projects Database Workspace / Content Projects"],
          tagName: "Focus",
          token: "#Focus",
          totalCount: 2
        }
      }, null, 2), "utf8");
      viewports.push({
        viewport: viewportName,
        tagPage: {
          databaseName: "Content Projects",
          focusedOpen: { label: "Open tag page Focus" },
          openedDatabase: { activeTabText: "Content Projects", databaseTitle: "Content Projects", tableVisible: true },
          openedPage: { activeTabText: "Weekly Review", bodyVisible: true, titleInput: "Weekly Review" },
          pageTitle: "Weekly Review",
          rows: { count: 2, databaseVisible: true, pageVisible: true },
          snapshot: { imagePath, metadataPath },
          tagName: "Focus"
        }
      });
    }

    const contract = await assertTagPagesArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.snapshots[0].tagName, "Focus");
    assert.equal(contract.snapshots[0].pageCount, 1);
    assert.equal(contract.snapshots[0].databaseCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tag pages artifact contract reports missing keyboard navigation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-tag-pages-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "tag-desktop.png");
    const metadataPath = join(artifactRoot, "tag-desktop.json");
    await writeFile(imagePath, "fake", "utf8");
    await writeFile(metadataPath, JSON.stringify({
      viewport: { name: "desktop" },
      metadata: {
        phase: "tag-management",
        databaseCount: 1,
        databaseName: "Content Projects",
        heading: "Tag Focus",
        pageCount: 1,
        pageTitle: "Weekly Review",
        rows: ["Weekly Review", "Content Projects"],
        tagName: "Focus",
        token: "#Focus",
        totalCount: 2
      }
    }), "utf8");

    await assert.rejects(
      () => assertTagPagesArtifactContract({
        status: "passed",
        viewports: [{
          viewport: "desktop",
          tagPage: {
            databaseName: "Content Projects",
            focusedOpen: { label: "Open tag page Focus" },
            openedDatabase: { activeTabText: "Content Projects", tableVisible: true },
            openedPage: { activeTabText: "", bodyVisible: false },
            pageTitle: "Weekly Review",
            rows: { count: 2, databaseVisible: true, pageVisible: true },
            snapshot: { imagePath, metadataPath },
            tagName: "Focus"
          }
        }]
      }, { expectedViewportNames: ["desktop"] }),
      /keyboard page navigation/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sidebar settings artifact contract validates ordering, shortcut, and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-sidebar-settings-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `sidebar-settings-${viewportName}.png`);
      const metadataPath = join(artifactRoot, `sidebar-settings-${viewportName}.json`);
      await writeFile(imagePath, `fake sidebar settings ${viewportName}`, "utf8");
      const entry = sidebarSettingsContractEntry(viewportName, { imagePath, metadataPath });
      await writeFile(metadataPath, JSON.stringify({
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
        metadata: {
          phase: "sidebar-settings",
          initial: entry.initial,
          reordered: entry.reordered,
          reset: entry.reset,
          shortcuts: entry.shortcuts,
          settingsOrder: entry.reset,
          sectionOrder: entry.reset
        }
      }, null, 2), "utf8");
      viewports.push(entry);
    }

    const contract = await assertSidebarSettingsArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].reorderedOrder, ["Databases", "Pages"]);
    assert.equal(contract.snapshots[0].shortcutChord, "Alt+Shift+F");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("sidebar settings artifact contract reports missing reset evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-sidebar-settings-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "sidebar-settings-desktop.png");
    const metadataPath = join(artifactRoot, "sidebar-settings-desktop.json");
    await writeFile(imagePath, "fake", "utf8");
    const entry = sidebarSettingsContractEntry("desktop", { imagePath, metadataPath });
    entry.reset = ["Databases", "Pages"];
    await writeFile(metadataPath, JSON.stringify({
      viewport: { name: "desktop" },
      metadata: {
        phase: "sidebar-settings",
        initial: entry.initial,
        reordered: entry.reordered,
        reset: entry.reset,
        shortcuts: entry.shortcuts
      }
    }), "utf8");

    await assert.rejects(
      () => assertSidebarSettingsArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /unexpected reset section order/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Search & AI artifact contract validates unified tabs and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ai-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const imagePath = join(artifactRoot, `search-ai-${viewportName}.png`);
      const metadataPath = join(artifactRoot, `search-ai-${viewportName}.json`);
      await writeFile(imagePath, `fake search ai ${viewportName}`, "utf8");
      const entry = searchAiContractEntry(viewportName, { imagePath, metadataPath });
      await attachSearchAiPerceptualBaseline(entry.snapshot, viewportName);
      await writeFile(metadataPath, JSON.stringify({
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: viewportName === "desktop" ? 1000 : 820 },
        metadata: {
          phase: "search-ai",
          search: entry.search,
          advanced: entry.advanced,
          chat: entry.chat,
          visibleState: entry.visibleState,
          viewport: viewportName
        }
      }, null, 2), "utf8");
      viewports.push(entry);
    }

    const contract = await assertSearchAiArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.equal(contract.snapshots[0].resultCount, 3);
    assert.match(contract.snapshots[0].selectedSource, /Semantic Orchard Row/);
    assert.match(contract.snapshots[0].perceptualBaseline.expectedPath, /search-ai-desktop\.expected\.png$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Search & AI artifact contract rejects missing committed chat-handoff baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ai-contract-baseline-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "search-ai-desktop.png");
    const metadataPath = join(artifactRoot, "search-ai-desktop.json");
    await writeFile(imagePath, "fake Search & AI screenshot", "utf8");
    const entry = searchAiContractEntry("desktop", { imagePath, metadataPath });
    await writeFile(metadataPath, JSON.stringify({
      viewport: { name: "desktop" },
      metadata: {
        phase: "search-ai",
        search: entry.search,
        advanced: entry.advanced,
        chat: entry.chat,
        visibleState: entry.visibleState
      }
    }), "utf8");
    await assert.rejects(
      () => assertSearchAiArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing committed chat-handoff baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Search & AI artifact contract rejects internal storage identity leaks", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ai-contract-leak-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "search-ai-desktop.png");
    const metadataPath = join(artifactRoot, "search-ai-desktop.json");
    await writeFile(imagePath, "fake Search & AI screenshot", "utf8");
    const entry = searchAiContractEntry("desktop", { imagePath, metadataPath });
    entry.search.rows[0] += " databases/user/Knowledge_Base--db_leak/data.csv";
    await assert.rejects(
      () => assertSearchAiArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /internal storage path or ID/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Search & AI artifact contract rejects a clipped selected source", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ai-contract-clipped-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "search-ai-compact.png");
    const metadataPath = join(artifactRoot, "search-ai-compact.json");
    await writeFile(imagePath, "fake Search & AI screenshot", "utf8");
    const entry = searchAiContractEntry("compact", { imagePath, metadataPath });
    entry.visibleState.selectedSource.scrollWidth = 900;
    entry.visibleState.selectedSource.clientWidth = 500;
    entry.visibleState.selectedSource.fullyVisible = false;
    await attachSearchAiPerceptualBaseline(entry.snapshot, "compact");
    await writeFile(metadataPath, JSON.stringify({
      viewport: { name: "compact" },
      metadata: {
        phase: "search-ai",
        search: entry.search,
        advanced: entry.advanced,
        chat: entry.chat,
        visibleState: entry.visibleState
      }
    }), "utf8");
    await assert.rejects(
      () => assertSearchAiArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["compact"] }),
      /selected source is clipped or unreadable/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Search & AI artifact contract reports missing selected source", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-ai-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const imagePath = join(artifactRoot, "search-ai-desktop.png");
    const metadataPath = join(artifactRoot, "search-ai-desktop.json");
    await writeFile(imagePath, "fake", "utf8");
    const entry = searchAiContractEntry("desktop", { imagePath, metadataPath });
    entry.chat.selected = "Selected Source: Missing";
    await writeFile(metadataPath, JSON.stringify({
      viewport: { name: "desktop" },
      metadata: {
        phase: "search-ai",
        search: entry.search,
        advanced: entry.advanced,
        chat: entry.chat
      }
    }), "utf8");

    await assert.rejects(
      () => assertSearchAiArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing selected LLM source/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("white theme artifact contract reports missing plugin phase", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-white-theme-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    await mkdir(artifactRoot, { recursive: true });
    const entry = whiteThemeContractEntry("desktop", artifactRoot);
    entry.snapshots = entry.snapshots.filter((snapshot) => snapshot.phase !== "plugin");
    entry.pluginState = null;
    for (const snapshot of entry.snapshots) {
      await writeWhiteThemeSnapshotFiles({ snapshot, viewportName: "desktop" });
    }

    await assert.rejects(
      () => assertWhiteThemeArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing phase\(s\).*plugin/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Advanced Search artifact contract validates semantic-search states and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      viewports.push(await advancedSearchContractEntry({ artifactRoot, viewportName }));
    }

    const contract = await assertAdvancedSearchArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.deepEqual(contract.snapshots[0].phases, requiredAdvancedSearchSnapshotPhases());
    assert.equal(contract.snapshots[0].phaseCount, requiredAdvancedSearchSnapshotPhases().length);
    assert.match(contract.snapshots[0].imagePath, /\/desktop\/advanced-search-initial\.png$/);
    assert.match(contract.snapshots[0].metadataPath, /\/desktop\/advanced-search-initial\.json$/);
    assert.ok(contract.snapshots[0].resultCountMax >= 1, "contract should count semantic results");
    assert.ok(contract.snapshots[0].statusLabels.includes("Stale"), "contract should include stale status evidence");
    assert.match(contract.snapshots[0].perceptualBaseline.expectedPath, /desktop\/advanced-search-stale-results\.expected\.png$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Advanced Search artifact contract rejects missing committed stale-result baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-contract-baseline-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await advancedSearchContractEntry({ artifactRoot, viewportName: "desktop" });
    entry.visualSnapshots.find((snapshot) => snapshot.phase === "stale-results").perceptualBaseline = null;
    await assert.rejects(
      () => assertAdvancedSearchArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing committed stale-result baseline/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Advanced Search artifact contract rejects clipped stale-result cards", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-contract-clipped-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await advancedSearchContractEntry({ artifactRoot, viewportName: "compact" });
    const stale = entry.visualSnapshots.find((snapshot) => snapshot.phase === "stale-results");
    stale.visibleState.resultsViewport = { clientHeight: 28, scrollHeight: 230, scrollTop: 0 };
    stale.visibleState.resultVisibility[0].fullyVisible = false;
    await writeAdvancedSearchSnapshotFiles({
      imagePath: stale.imagePath,
      metadataPath: stale.metadataPath,
      phase: stale.phase,
      visibleState: stale.visibleState,
      viewportName: "compact"
    });
    await assert.rejects(
      () => assertAdvancedSearchArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["compact"] }),
      /stale result viewport is clipped/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Advanced Search artifact contract reports missing stale result evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await advancedSearchContractEntry({ artifactRoot, viewportName: "desktop" });
    const stale = entry.visualSnapshots.find((snapshot) => snapshot.phase === "stale-results");
    stale.visibleState.sources = ["Page"];
    await writeAdvancedSearchSnapshotFiles({
      imagePath: stale.imagePath,
      metadataPath: stale.metadataPath,
      phase: stale.phase,
      visibleState: stale.visibleState,
      viewportName: "desktop"
    });

    await assert.rejects(
      () => assertAdvancedSearchArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /stale results mismatch/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LLM Chat artifact contract validates assistant states and snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-llm-chat-contract-"));
  const artifactRoot = join(root, "visual");
  try {
    const viewports = [];
    for (const viewportName of ["desktop", "compact"]) {
      const entry = await llmChatContractEntry({ artifactRoot, viewportName });
      viewports.push(entry);
    }

    const contract = await assertLLMChatArtifactContract({
      status: "passed",
      viewports
    });

    assert.equal(contract.status, "passed");
    assert.deepEqual(contract.expectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(contract.observedViewportNames, ["desktop", "compact"]);
    assert.equal(contract.snapshotCount, 2);
    assert.equal(contract.perceptualBaselineCount, 2);
    assert.equal(contract.snapshots[0].perceptualBaseline.status, "passed");
    assert.deepEqual(contract.snapshots[0].phases, requiredLLMChatSnapshotPhases());
    assert.equal(contract.snapshots[0].phaseCount, requiredLLMChatSnapshotPhases().length);
    assert.match(contract.snapshots[0].imagePath, /\/desktop\/llm-chat-empty\.png$/);
    assert.match(contract.snapshots[0].metadataPath, /\/desktop\/llm-chat-empty\.json$/);
    assert.ok(contract.snapshots[0].messageCount >= 8, "contract should count transcript messages");
    assert.equal(contract.snapshots[0].historyItems, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LLM Chat artifact contract rejects missing committed conversation baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-llm-chat-contract-baseline-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await llmChatContractEntry({ artifactRoot, viewportName: "wide" });
    const conversation = entry.interactionState.visualSnapshots.find((snapshot) => snapshot.phase === "conversation");
    delete conversation.perceptualBaseline;

    await assert.rejects(
      () => assertLLMChatArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["wide"] }),
      /missing committed conversation baseline for wide/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LLM Chat artifact contract reports missing Q&A citation evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-llm-chat-contract-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await llmChatContractEntry({ artifactRoot, viewportName: "desktop" });
    entry.interactionState.qaState.citationText = "Customer Feedback";

    await assert.rejects(
      () => assertLLMChatArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing local Q&A citation/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LLM Chat artifact contract reports missing JSONL history evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-llm-chat-contract-history-fail-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await llmChatContractEntry({ artifactRoot, viewportName: "desktop" });
    entry.interactionState.historyEvidence.persistedAssistantResponse = false;

    await assert.rejects(
      () => assertLLMChatArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /missing JSONL history/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("LLM Chat artifact contract rejects a clipped compact conversation transcript", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-llm-chat-contract-clipped-"));
  const artifactRoot = join(root, "visual");
  try {
    const entry = await llmChatContractEntry({ artifactRoot, viewportName: "compact" });
    const conversation = entry.interactionState.visualSnapshots.find((snapshot) => snapshot.phase === "conversation");
    conversation.visibleState.transcriptViewport.clientHeight = 28;
    conversation.visibleState.messages[0].fullyVisible = false;
    await writeLLMChatSnapshotFiles({
      extraMetadata: {
        prompt: "Summarize this smoke page.",
        assistantText: "Smoke response for: Summarize this smoke page.",
        requestCount: 1
      },
      imagePath: conversation.imagePath,
      metadataPath: conversation.metadataPath,
      phase: conversation.phase,
      visibleState: conversation.visibleState,
      viewportName: "compact"
    });

    await assert.rejects(
      () => assertLLMChatArtifactContract({
        status: "passed",
        viewports: [entry]
      }, { expectedViewportNames: ["compact"] }),
      /conversation transcript is clipped/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness result manifests summarize success and viewport coverage", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-result-"));
  const artifactRoot = join(root, "result");
  try {
    const page = {
      url() {
        return "http://127.0.0.1:5173/#/page";
      },
      viewportSize() {
        return { width: 1440, height: 1000 };
      }
    };
    const smokeResult = {
      status: "passed",
      totalMs: 1234,
      artifactContract: {
        status: "passed",
        expectedViewportNames: ["desktop", "compact"],
        observedViewportNames: ["desktop", "compact"],
        diagnosticCount: 1,
        perceptualBaselineCount: 1,
        renderThresholdMs: 1000,
        maxRenderMs: 537,
        renderTimings: [
          { viewport: "desktop", embeddedViews: 1, rowsPerDatabase: 500, renderMs: 117.5 },
          { viewport: "desktop", embeddedViews: 10, rowsPerDatabase: 500, renderMs: 537 }
        ],
        snapshotCount: 3,
        snapshots: [
          {
            viewport: "desktop",
            imagePath: "artifacts/ui-smoke/foundation/snapshots/desktop.png",
            metadataPath: "artifacts/ui-smoke/foundation/snapshots/desktop.json",
            imageBytes: 1024,
            activeTabText: "Created date desc",
            backlinkItems: 5,
            expectedTocItems: 4,
            horizontalOverflowPx: 0,
            headerActionCount: 3,
            headerTitle: "Embedded DB 1",
            loadMoreShown: 100,
            rowCount: 12,
            rowCountText: "50 of 500 rows",
            scrollWidth: 1440,
            resultCount: 3,
            selectedSource: "S1Row page · Customer Feedback",
            visibleRowCount: 12,
            viewportWidth: 1440,
            sourceLinkCount: 2,
            pathButtons: 2,
            openedCount: 3,
            visibleTabs: ["All", "Created date asc", "Created date desc"],
            summary: notionImportAuditSummary(),
            previews: { pdf: true, video: true, audio: true, image: true },
            perceptualBaseline: productionPerceptualBaseline()
          },
          {
            viewport: "compact",
            imagePath: "artifacts/ui-smoke/foundation/snapshots/compact.png",
            metadataPath: "artifacts/ui-smoke/foundation/snapshots/compact.json",
            imageBytes: 900,
            horizontalOverflowPx: 0,
            rowCount: 12,
            scrollWidth: 1040,
            visibleRowCount: 12,
            viewportWidth: 1040,
            sourceLinkCount: 2,
            pathButtons: 2,
            openedCount: 3,
            summary: notionImportAuditSummary(),
            previews: { pdf: true, video: true, audio: true, image: true }
          },
          {
            viewport: "desktop",
            imagePath: "artifacts/ui-smoke/foundation/snapshots/diagnostic.png",
            metadataPath: "artifacts/ui-smoke/foundation/snapshots/diagnostic.json",
            imageBytes: 777,
            phase: "diagnostic",
            pathButtons: 3,
            openedCount: 3,
            issueRows: 1,
            issueKinds: { cell_loss: 1 },
            failText: "Audit found blocking import issues.",
            summary: notionImportAuditDiagnosticSummary()
          }
        ]
      },
      viewports: [
        { viewport: { name: "desktop", width: 1440, height: 1000 }, geometry: { ok: true } },
        { viewport: "compact", focus: { active: true } }
      ]
    };

    assert.deepEqual(assertHarnessViewportCoverage(smokeResult), {
      expected: ["desktop", "compact"],
      observed: ["desktop", "compact"]
    });

    const { manifest, manifestPath } = await writeHarnessResultArtifact({
      artifactRoot,
      cdpUrl: "http://127.0.0.1:9222",
      consoleEvents: [{
        type: "log",
        text: "ready",
        location: { url: "http://127.0.0.1:5173/src/App.tsx", lineNumber: 10, columnNumber: 2 },
        timestamp: "2026-06-15T00:00:00.000Z"
      }],
      consoleMessages: ["[log] ready"],
      devLog: ["dev server ready\n"],
      name: "foundation-smoke",
      page,
      result: smokeResult,
      status: "passed"
    });

    assert.equal(manifestPath, join(artifactRoot, "harness-result.json"));
    assert.equal(manifest.name, "foundation-smoke");
    assert.equal(manifest.status, "passed");
    assert.equal(manifest.cdpUrl, "http://127.0.0.1:9222");
    assert.equal(manifest.url, "http://127.0.0.1:5173/#/page");
    assert.deepEqual(manifest.viewport, { width: 1440, height: 1000 });
    assert.deepEqual(manifest.observedViewports, ["desktop", "compact"]);
    assert.deepEqual(manifest.coverage.missingViewportNames, []);
    assert.equal(manifest.result.status, "passed");
    assert.equal(manifest.result.viewportCount, 2);
    assert.deepEqual(manifest.result.artifactContract, {
      status: "passed",
      expectedViewportNames: ["desktop", "compact"],
      observedViewportNames: ["desktop", "compact"],
      diagnosticCount: 1,
      perceptualBaselineCount: 1,
      renderThresholdMs: 1000,
      maxRenderMs: 537,
      renderTimings: [
        { viewport: "desktop", embeddedViews: 1, rowsPerDatabase: 500, renderMs: 117.5 },
        { viewport: "desktop", embeddedViews: 10, rowsPerDatabase: 500, renderMs: 537 }
      ],
      snapshotCount: 3,
      snapshots: [
        {
          viewport: "desktop",
          imagePath: "artifacts/ui-smoke/foundation/snapshots/desktop.png",
          metadataPath: "artifacts/ui-smoke/foundation/snapshots/desktop.json",
          imageBytes: 1024,
          activeTabText: "Created date desc",
          backlinkItems: 5,
          expectedTocItems: 4,
          horizontalOverflowPx: 0,
          headerActionCount: 3,
          headerTitle: "Embedded DB 1",
          loadMoreShown: 100,
          rowCount: 12,
          rowCountText: "50 of 500 rows",
          scrollWidth: 1440,
          resultCount: 3,
          selectedSource: "S1Row page · Customer Feedback",
          visibleRowCount: 12,
          viewportWidth: 1440,
          sourceLinkCount: 2,
          pathButtons: 2,
          openedCount: 3,
          visibleTabs: ["All", "Created date asc", "Created date desc"],
          summary: notionImportAuditSummary(),
          previews: { pdf: true, video: true, audio: true, image: true },
          perceptualBaseline: productionPerceptualBaseline()
        },
        {
          viewport: "compact",
          imagePath: "artifacts/ui-smoke/foundation/snapshots/compact.png",
          metadataPath: "artifacts/ui-smoke/foundation/snapshots/compact.json",
          imageBytes: 900,
          horizontalOverflowPx: 0,
          rowCount: 12,
          scrollWidth: 1040,
          visibleRowCount: 12,
          viewportWidth: 1040,
          sourceLinkCount: 2,
          pathButtons: 2,
          openedCount: 3,
          summary: notionImportAuditSummary(),
          previews: { pdf: true, video: true, audio: true, image: true }
        },
        {
          viewport: "desktop",
          imagePath: "artifacts/ui-smoke/foundation/snapshots/diagnostic.png",
          metadataPath: "artifacts/ui-smoke/foundation/snapshots/diagnostic.json",
          imageBytes: 777,
          pathButtons: 3,
          openedCount: 3,
          issueRows: 1,
          phase: "diagnostic",
          failText: "Audit found blocking import issues.",
          issueKinds: { cell_loss: 1 },
          summary: notionImportAuditDiagnosticSummary()
        }
      ]
    });
    assert.equal(manifest.logs.consoleCount, 1);
    assert.equal(manifest.logs.consoleErrorCount, 0);
    assert.equal(manifest.logs.recentConsoleEvents[0].type, "log");
    assert.deepEqual(assertNoHarnessConsoleErrors(manifest, "foundation-smoke"), {
      consoleCount: 1,
      consoleErrorCount: 0
    });
    assert.ok(manifest.logs.devLogBytes > 0);

    const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.deepEqual(persisted.coverage.requiredViewportNames, ["desktop", "compact"]);
    assert.deepEqual(persisted.coverage.observedViewportNames, ["desktop", "compact"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness viewport coverage recognizes result arrays and artifact contracts", () => {
  assert.deepEqual(assertHarnessViewportCoverage({
    status: "passed",
    results: [
      { viewport: "desktop", renderMs: 100 },
      { viewport: "compact", renderMs: 80 }
    ],
    artifactContract: {
      observedViewportNames: ["desktop", "compact"]
    }
  }), {
    expected: ["desktop", "compact"],
    observed: ["desktop", "compact"]
  });

  assert.deepEqual(assertHarnessViewportCoverage({
    status: "passed",
    artifactContract: {
      observedViewportNames: ["desktop", "compact"]
    }
  }), {
    expected: ["desktop", "compact"],
    observed: ["desktop", "compact"]
  });
});

test("ui suite isolates the synthetic 10k Search benchmark from shared renderer load", () => {
  assert.deepEqual(
    uiSuiteHarnessConnection("smoke-embedded-view-ui.mjs", "http://127.0.0.1:9222"),
    {
      mode: "shared",
      env: {
        LOTION_CDP_URL: "http://127.0.0.1:9222",
        LOTION_UI_HARNESS_NO_AUTOSTART: "1"
      }
    }
  );
  assert.deepEqual(
    uiSuiteHarnessConnection("smoke-search-ui.mjs", "http://127.0.0.1:9222"),
    {
      mode: "isolated",
      env: {
        LOTION_CDP_URL: "",
        LOTION_UI_HARNESS_NO_AUTOSTART: "0"
      }
    }
  );
  assert.deepEqual(
    uiSuiteHarnessConnection("smoke-search-ai-ui.mjs", "http://127.0.0.1:9222"),
    {
      mode: "shared",
      env: {
        LOTION_CDP_URL: "http://127.0.0.1:9222",
        LOTION_UI_HARNESS_NO_AUTOSTART: "1"
      }
    }
  );
});

test("ui suite artifact index summarizes child manifests and screenshot contracts", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-suite-index-"));
  const artifactRoot = join(root, "ui-suite");
  try {
    const summary = {
      environment: {
        nodeVersion: "22.13.1",
        platform: "darwin",
        arch: "arm64",
        ci: false,
        selectedViewportNames: ["desktop", "compact"],
        selectedViewports: [
          { name: "desktop", width: 1440, height: 1000 },
          { name: "compact", width: 1040, height: 820 }
        ],
        filter: ["notion-import", "embedded-view"],
        selectedSuiteScripts: [
          "smoke-notion-import-ui.mjs",
          "smoke-embedded-view-ui.mjs"
        ],
        runner: "npm run smoke:ui"
      },
      filter: ["notion-import", "embedded-view"],
      selectedCount: 2,
      totalMs: 2450,
      results: [
        uiSuiteChild({
          artifactRoot: "artifacts/ui-smoke/notion-import-audit-2026",
          elapsedMs: 1100,
          manifestPath: "artifacts/ui-smoke/notion-import-audit-2026/harness-result.json",
          name: "Notion import audit UI",
          observedViewports: ["desktop", "compact", "desktop", "compact"],
          scriptPath: "scripts/smoke-notion-import-ui.mjs",
          snapshotBytes: [1200, 980, 720, 710],
          snapshotDetails: [
            {
              phase: "passing",
              pathButtons: 2,
              openedCount: 2,
              horizontalOverflowPx: 0,
              scrollWidth: 1440,
              viewportWidth: 1440,
              summary: notionImportAuditSummary()
            },
            {
              phase: "passing",
              pathButtons: 2,
              openedCount: 2,
              horizontalOverflowPx: 0,
              scrollWidth: 1040,
              viewportWidth: 1040,
              summary: notionImportAuditSummary()
            },
            { phase: "diagnostic", pathButtons: 3, openedCount: 3, summary: notionImportAuditDiagnosticSummary(), issueKinds: { cell_loss: 1 } },
            { phase: "diagnostic", pathButtons: 3, openedCount: 3, summary: notionImportAuditDiagnosticSummary(), issueKinds: { cell_loss: 1 } }
          ]
        }),
        uiSuiteChild({
          artifactRoot: "artifacts/ui-smoke/embedded-view-ui-2026",
          elapsedMs: 1350,
          harnessMode: "isolated",
          manifestPath: "artifacts/ui-smoke/embedded-view-ui-2026/harness-result.json",
          name: "Embedded view UI",
          scriptPath: "scripts/smoke-embedded-view-ui.mjs",
          snapshotBytes: [1500, 1400]
        })
      ]
    };

    const index = buildUiSuiteArtifactIndex(summary, { generatedAt: "2026-06-16T19:00:00.000Z" });
    assert.equal(index.kind, "lotion-ui-suite-artifact-index");
    assert.deepEqual(index.environment, {
      nodeVersion: "22.13.1",
      platform: "darwin",
      arch: "arm64",
      ci: false,
      selectedViewportNames: ["desktop", "compact"],
      selectedViewports: [
        { name: "desktop", width: 1440, height: 1000 },
        { name: "compact", width: 1040, height: 820 }
      ],
      filter: ["notion-import", "embedded-view"],
      selectedSuiteScripts: [
        "smoke-notion-import-ui.mjs",
        "smoke-embedded-view-ui.mjs"
      ],
      runner: "npm run smoke:ui"
    });
    assert.equal(index.selectedCount, 2);
    assert.equal(index.passedCount, 2);
    assert.equal(index.consoleErrorCount, 0);
    assert.equal(index.snapshotCount, 6);
    assert.equal(index.imageBytesTotal, 6510);
    assert.equal(index.missingArtifactContractCount, 0);
    assert.deepEqual(index.slowestSuites, [
      {
        name: "Embedded view UI",
        elapsedMs: 1350,
        reproduceCommand: "LOTION_UI_SUITE_FILTER=smoke-embedded-view-ui.mjs npm run smoke:ui"
      },
      {
        name: "Notion import audit UI",
        elapsedMs: 1100,
        reproduceCommand: "LOTION_UI_SUITE_FILTER=smoke-notion-import-ui.mjs npm run smoke:ui"
      }
    ]);
    assert.deepEqual(index.suites.map((suite) => suite.artifactContractStatus), ["present", "present"]);
    assert.deepEqual(index.suites.map((suite) => suite.scriptPath), [
      "scripts/smoke-notion-import-ui.mjs",
      "scripts/smoke-embedded-view-ui.mjs"
    ]);
    assert.deepEqual(index.suites.map((suite) => suite.harnessMode), ["shared", "isolated"]);
    assert.deepEqual(index.suites.map((suite) => suite.reproduceCommand), [
      "LOTION_UI_SUITE_FILTER=smoke-notion-import-ui.mjs npm run smoke:ui",
      "LOTION_UI_SUITE_FILTER=smoke-embedded-view-ui.mjs npm run smoke:ui"
    ]);
    assert.match(index.suites[0].artifactContract.detailText, /desktop: phase=passing, pathButtons=2, openedCount=2/);
    assert.match(index.suites[0].artifactContract.detailText, /horizontalOverflowPx=0/);
    assert.match(index.suites[0].artifactContract.detailText, /scrollWidth=1440/);
    assert.match(index.suites[0].artifactContract.detailText, /phase=diagnostic/);
    assert.match(index.suites[0].artifactContract.detailText, /cell_loss=1/);
    assert.match(index.suites[0].artifactContract.detailText, /Source CSVs=1 \/ 1/);
    assert.match(index.suites[0].artifactContract.detailText, /Imported mappings=1 database, 1 row\/page/);
    assert.deepEqual(index.suites[0].artifactContract.representativeSnapshotPaths, [
      "artifacts/ui-smoke/notion-import-audit-2026/snapshots/desktop-0.png",
      "artifacts/ui-smoke/notion-import-audit-2026/snapshots/compact-1.png",
      "artifacts/ui-smoke/notion-import-audit-2026/snapshots/desktop-2.png"
    ]);
    assert.deepEqual(index.suites[0].artifactContract.screenshotViewportNames, ["desktop", "compact"]);
    assert.deepEqual(index.suites[0].missingScreenshotViewportNames, []);
    assert.equal(
      index.suites[0].artifactContract.snapshots[0].imagePath,
      "artifacts/ui-smoke/notion-import-audit-2026/snapshots/desktop-0.png"
    );
    assert.equal(
      index.suites[0].artifactContract.snapshots[0].metadataPath,
      "artifacts/ui-smoke/notion-import-audit-2026/snapshots/desktop-0.json"
    );
    assert.equal(index.suites[0].artifactContract.snapshots[0].details.pathButtons, 2);
    assert.equal(index.suites[0].artifactContract.snapshots[0].details.horizontalOverflowPx, 0);
    assert.equal(index.suites[0].artifactContract.snapshots[0].details.scrollWidth, 1440);
    assert.equal(index.suites[0].artifactContract.snapshots[0].details.viewportWidth, 1440);
    assert.equal(index.suites[0].artifactContract.snapshots[0].details.openedCount, 2);
    assert.deepEqual(index.suites[0].artifactContract.snapshots[0].details.summary, notionImportAuditSummary());
    assert.deepEqual(index.suites.map((suite) => suite.observedViewportNames), [
      ["desktop", "compact"],
      ["desktop", "compact"]
    ]);
    assert.deepEqual(assertUiSuiteArtifactIndexContract(index), {
      suiteCount: 2,
      passedCount: 2,
      consoleErrorCount: 0,
      snapshotCount: 6,
      imageBytesTotal: 6510,
      missingArtifactContractCount: 0
    });

    const written = await writeUiSuiteArtifactIndex({ artifactRoot, summary });
    const json = JSON.parse(await readFile(written.jsonPath, "utf8"));
    const markdown = await readFile(written.markdownPath, "utf8");
    assert.equal(json.kind, "lotion-ui-suite-artifact-index");
    assert.equal(json.environment.nodeVersion, "22.13.1");
    assert.deepEqual(json.environment.selectedViewportNames, ["desktop", "compact"]);
    assert.deepEqual(json.environment.selectedSuiteScripts, [
      "smoke-notion-import-ui.mjs",
      "smoke-embedded-view-ui.mjs"
    ]);
    assert.equal(json.suites.length, 2);
    assert.deepEqual(json.slowestSuites.map((suite) => suite.name), [
      "Embedded view UI",
      "Notion import audit UI"
    ]);
    assert.equal(json.suites[0].artifactContract.snapshots[0].details.pathButtons, 2);
    assert.equal(json.suites[0].artifactContract.snapshots[2].details.issueKinds.cell_loss, 1);
    assert.match(markdown, /Lotion UI Regression Artifact Index/);
    assert.match(markdown, /Environment: node=22\.13\.1, platform=darwin\/arm64, ci=false, viewports=desktop\(1440x1000\), compact\(1040x820\), filter=notion-import, embedded-view/);
    assert.match(markdown, /Suite scripts: smoke-notion-import-ui\.mjs, smoke-embedded-view-ui\.mjs/);
    assert.match(markdown, /Total duration: 2\.5s/);
    assert.match(markdown, /Slowest suites: Embedded view UI 1\.4s, Notion import audit UI 1\.1s/);
    assert.match(markdown, /Missing artifact contracts: 0/);
    assert.match(markdown, /Notion import audit UI \| passed \| 1\.1s/);
    assert.match(markdown, /Embedded view UI \| passed \| 1\.4s/);
    assert.match(markdown, /Notion import audit UI/);
    assert.match(markdown, /pathButtons=2/);
    assert.match(markdown, /horizontalOverflowPx=0/);
    assert.match(markdown, /scrollWidth=1440/);
    assert.match(markdown, /Source CSVs=1 \/ 1/);
    assert.match(markdown, /cell_loss=1/);
    assert.match(markdown, /root=artifacts\/ui-smoke\/notion-import-audit-2026/);
    assert.match(markdown, /screenshots=`artifacts\/ui-smoke\/notion-import-audit-2026\/snapshots\/desktop-0\.png`/);
    assert.match(markdown, /LOTION_UI_SUITE_FILTER=smoke-notion-import-ui\.mjs npm run smoke:ui/);
    assert.match(markdown, /LOTION_UI_SUITE_FILTER=smoke-embedded-view-ui\.mjs npm run smoke:ui/);
    assert.match(markdown, /Embedded view UI/);
    assert.deepEqual(written.contract, {
      suiteCount: 2,
      passedCount: 2,
      consoleErrorCount: 0,
      snapshotCount: 6,
      imageBytesTotal: 6510,
      missingArtifactContractCount: 0
    });
    assert.deepEqual(written.summary.slowestSuites.map((suite) => suite.elapsedMs), [1350, 1100]);
    assert.equal((await stat(written.jsonPath)).size > 0, true);
    assert.equal((await stat(written.markdownPath)).size > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui suite artifact index records missing child artifact contracts", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-suite-missing-contract-"));
  const artifactRoot = join(root, "ui-suite");
  try {
    const summary = {
      selectedCount: 1,
      results: [
        uiSuiteChild({
          artifactRoot: "artifacts/ui-smoke/row-page-navigation-ui-2026",
          includeArtifactContract: false,
          manifestPath: "artifacts/ui-smoke/row-page-navigation-ui-2026/harness-result.json",
          name: "Row-page navigation UI",
          scriptPath: "scripts/smoke-row-page-navigation-ui.mjs"
        })
      ]
    };

    const index = buildUiSuiteArtifactIndex(summary, { generatedAt: "2026-06-16T19:03:00.000Z" });
    assert.equal(index.snapshotCount, 0);
    assert.equal(index.imageBytesTotal, 0);
    assert.equal(index.missingArtifactContractCount, 1);
    assert.equal(index.suites[0].artifactContractStatus, "missing");
    assert.equal(index.suites[0].artifactContract, null);
    assert.equal(index.suites[0].scriptPath, "scripts/smoke-row-page-navigation-ui.mjs");
    assert.equal(index.suites[0].reproduceCommand, "LOTION_UI_SUITE_FILTER=smoke-row-page-navigation-ui.mjs npm run smoke:ui");
    assert.deepEqual(assertUiSuiteArtifactIndexContract(index), {
      suiteCount: 1,
      passedCount: 1,
      consoleErrorCount: 0,
      snapshotCount: 0,
      imageBytesTotal: 0,
      missingArtifactContractCount: 1
    });

    const written = await writeUiSuiteArtifactIndex({ artifactRoot, summary });
    const json = JSON.parse(await readFile(written.jsonPath, "utf8"));
    const markdown = await readFile(written.markdownPath, "utf8");
    assert.equal(json.missingArtifactContractCount, 1);
    assert.equal(json.suites[0].artifactContractStatus, "missing");
    assert.match(markdown, /Missing artifact contracts: 1/);
    assert.match(markdown, /Row-page navigation UI/);
    assert.match(markdown, /missing artifact contract/);
    assert.match(markdown, /LOTION_UI_SUITE_FILTER=smoke-row-page-navigation-ui\.mjs npm run smoke:ui/);
    assert.deepEqual(written.contract, {
      suiteCount: 1,
      passedCount: 1,
      consoleErrorCount: 0,
      snapshotCount: 0,
      imageBytesTotal: 0,
      missingArtifactContractCount: 1
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui suite artifact writer honors an explicitly selected single viewport", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-suite-single-viewport-"));
  try {
    const summary = {
      environment: {
        nodeVersion: "22.13.1",
        platform: "darwin",
        arch: "arm64",
        selectedViewportNames: ["desktop"],
        selectedViewports: [{ name: "desktop", width: 1440, height: 1000 }],
        selectedSuiteScripts: ["smoke-design-system-ui.mjs"],
        runner: "npm run smoke:ui"
      },
      selectedCount: 1,
      results: [
        uiSuiteChild({
          artifactRoot: "artifacts/ui-smoke/design-system-ui-2026",
          manifestPath: "artifacts/ui-smoke/design-system-ui-2026/harness-result.json",
          name: "Design system UI",
          scriptPath: "scripts/smoke-design-system-ui.mjs",
          observedViewports: ["desktop"],
          snapshotBytes: [1000]
        })
      ]
    };
    const written = await writeUiSuiteArtifactIndex({ artifactRoot: root, summary });
    assert.equal(written.contract.suiteCount, 1);
    assert.deepEqual(JSON.parse(await readFile(written.jsonPath, "utf8")).environment.selectedViewportNames, ["desktop"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui suite artifact index rejects missing viewport and console-error regressions", () => {
  const missingViewport = buildUiSuiteArtifactIndex({
    selectedCount: 1,
    results: [
      uiSuiteChild({
        artifactRoot: "artifacts/ui-smoke/search-title-2026",
        manifestPath: "artifacts/ui-smoke/search-title-2026/harness-result.json",
        name: "Search title UI",
        observedViewports: ["desktop"],
        snapshotBytes: [1000]
      })
    ]
  }, { generatedAt: "2026-06-16T19:01:00.000Z" });

  assert.throws(
    () => assertUiSuiteArtifactIndexContract(missingViewport),
    /did not observe viewport compact/
  );

  const consoleError = buildUiSuiteArtifactIndex({
    selectedCount: 1,
    results: [
      uiSuiteChild({
        artifactRoot: "artifacts/ui-smoke/search-title-2026",
        consoleErrorCount: 1,
        consoleIssues: [{
          type: "error",
          text: "ReferenceError: selectedRow is not defined",
          location: {
            url: "http://127.0.0.1:5173/src/renderer/features/search/GlobalSearch.tsx",
            lineNumber: 42,
            columnNumber: 7
          }
        }],
        manifestPath: "artifacts/ui-smoke/search-title-2026/harness-result.json",
        name: "Search title UI",
        snapshotBytes: [1000, 1000]
      })
    ]
  }, { generatedAt: "2026-06-16T19:02:00.000Z" });

  assert.throws(
    () => assertUiSuiteArtifactIndexContract(consoleError),
    /has console errors/
  );
  assert.deepEqual(consoleError.suites[0].consoleIssues, [{
    type: "error",
    text: "ReferenceError: selectedRow is not defined",
    location: {
      url: "http://127.0.0.1:5173/src/renderer/features/search/GlobalSearch.tsx",
      lineNumber: 42,
      columnNumber: 7
    }
  }]);
  assert.match(
    formatUiSuiteArtifactIndexMarkdown(consoleError),
    /console=error: ReferenceError: selectedRow is not defined/
  );

  const missingReproduceCommand = buildUiSuiteArtifactIndex({
    selectedCount: 1,
    results: [
      uiSuiteChild({
        artifactRoot: "artifacts/ui-smoke/search-title-2026",
        manifestPath: "artifacts/ui-smoke/search-title-2026/harness-result.json",
        name: "Search title UI",
        reproduceCommand: "",
        scriptPath: "",
        snapshotBytes: [1000, 1000]
      })
    ]
  }, { generatedAt: "2026-06-16T19:04:00.000Z" });

  assert.throws(
    () => assertUiSuiteArtifactIndexContract(missingReproduceCommand),
    /missing a script path/
  );

  const missingCompactScreenshot = buildUiSuiteArtifactIndex({
    selectedCount: 1,
    results: [
      uiSuiteChild({
        artifactRoot: "artifacts/ui-smoke/search-title-2026",
        manifestPath: "artifacts/ui-smoke/search-title-2026/harness-result.json",
        name: "Search title UI",
        observedViewports: ["desktop", "compact"],
        snapshotBytes: [1000],
        snapshotViewports: ["desktop"]
      })
    ]
  }, { generatedAt: "2026-06-16T19:05:00.000Z" });

  assert.deepEqual(missingCompactScreenshot.suites[0].missingScreenshotViewportNames, ["compact"]);
  assert.match(
    formatUiSuiteArtifactIndexMarkdown(missingCompactScreenshot),
    /missing screenshots=compact/
  );
  assert.throws(
    () => assertUiSuiteArtifactIndexContract(missingCompactScreenshot),
    /missing screenshot viewport\(s\): compact/
  );

  const failedWithArtifacts = buildUiSuiteArtifactIndex({
    selectedCount: 1,
    results: [
      uiSuiteChild({
        artifactRoot: "artifacts/ui-smoke/search-title-2026",
        failureArtifacts: {
          readme: "artifacts/ui-smoke/search-title-2026/README.md",
          screenshot: "artifacts/ui-smoke/search-title-2026/failure.png",
          dom: "artifacts/ui-smoke/search-title-2026/dom.html"
        },
        manifestPath: "artifacts/ui-smoke/search-title-2026/harness-result.json",
        name: "Search title UI",
        snapshotBytes: [1000, 1000],
        status: "failed"
      })
    ]
  }, { generatedAt: "2026-06-16T19:06:00.000Z" });

  assert.equal(
    failedWithArtifacts.suites[0].failureArtifacts.readme,
    "artifacts/ui-smoke/search-title-2026/README.md"
  );
  assert.match(
    formatUiSuiteArtifactIndexMarkdown(failedWithArtifacts),
    /failure=`artifacts\/ui-smoke\/search-title-2026\/README\.md`/
  );
  assert.match(
    formatUiSuiteArtifactIndexMarkdown(failedWithArtifacts),
    /failure screenshot=`artifacts\/ui-smoke\/search-title-2026\/failure\.png`/
  );
  assert.throws(
    () => assertUiSuiteArtifactIndexContract(failedWithArtifacts),
    /did not pass: failed/
  );

  const missingEnvironmentViewport = buildUiSuiteArtifactIndex({
    environment: {
      nodeVersion: "22.13.1",
      platform: "linux",
      arch: "x64",
      selectedViewportNames: ["desktop"],
      selectedSuiteScripts: ["smoke-search-title-ui.mjs"],
      runner: "npm run smoke:ui"
    },
    selectedCount: 1,
    results: [
      uiSuiteChild({
        artifactRoot: "artifacts/ui-smoke/search-title-2026",
        manifestPath: "artifacts/ui-smoke/search-title-2026/harness-result.json",
        name: "Search title UI",
        observedViewports: ["desktop", "compact"],
        snapshotBytes: [1000, 1000]
      })
    ]
  }, { generatedAt: "2026-06-16T19:07:00.000Z" });

  assert.throws(
    () => assertUiSuiteArtifactIndexContract(missingEnvironmentViewport),
    /environment did not include selected viewport compact/
  );
});

test("production visual gate requires critical suites with screenshot evidence", () => {
  const criticalSuites = [
    ["Design system UI", "scripts/smoke-design-system-ui.mjs", "design-system"],
    ["White theme UI", "scripts/smoke-white-theme-ui.mjs", "white-theme"],
    ["Search popup UI", "scripts/smoke-search-ui.mjs", "search-ui"],
    ["Search & AI UI", "scripts/smoke-search-ai-ui.mjs", "search-ai"],
    ["Markdown preview UI", "scripts/smoke-markdown-preview-ui.mjs", "markdown-preview"],
    ["Embedded view UI", "scripts/smoke-embedded-view-ui.mjs", "embedded-view"],
    ["Database created views UI", "scripts/smoke-database-created-views-ui.mjs", "database-created-views"],
    ["Database interaction UI", "scripts/smoke-database-interaction-ui.mjs", "database-interaction"],
    ["Row-page property visual UI", "scripts/smoke-row-page-property-visual-ui.mjs", "row-page-property-visual"],
    ["Page secondary UI", "scripts/smoke-page-secondary-ui.mjs", "page-secondary"],
    ["GitHub backup UI", "scripts/smoke-github-backup-ui.mjs", "github-backup"],
    ["Notion import audit UI", "scripts/smoke-notion-import-ui.mjs", "notion-import-audit"],
    ["Settings center UI", "scripts/smoke-settings-center-ui.mjs", "settings-center"],
    ["Plugin manager UI", "scripts/smoke-plugin-manager-ui.mjs", "plugin-manager"],
    ["LLM Chat UI", "scripts/smoke-llm-chat-ui.mjs", "llm-chat"],
    ["Advanced Search UI", "scripts/smoke-advanced-search-ui.mjs", "advanced-search"]
  ];
  const [firstSuiteName, firstSuiteScript, firstSuiteArtifact] = criticalSuites[0];
  assert.deepEqual(DEFAULT_PRODUCTION_VISUAL_SCRIPTS, criticalSuites.map(([, script]) => script));
  assert.equal(
    DEFAULT_PRODUCTION_VISUAL_FILTER,
    criticalSuites.map(([, script]) => script.replace(/^scripts\//, "")).join(",")
  );
  assert.equal(DEFAULT_PRODUCTION_VISUAL_VIEWPORTS, "desktop,compact,wide:1728x1100");
  assert.deepEqual(DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES, ["desktop", "compact", "wide"]);
  assert.deepEqual(productionVisualViewportNamesFromSelection(), ["desktop", "compact", "wide"]);
  assert.deepEqual(productionVisualViewportNamesFromSelection("desktop,review:1200x900"), ["desktop", "review"]);
  assert.deepEqual(productionVisualViewportNamesFromSelection("desktop,desktop,compact"), ["desktop", "compact"]);
  assert.throws(
    () => productionVisualViewportNamesFromSelection("bad viewport"),
    /Invalid production visual viewport selection/
  );
  const index = buildUiSuiteArtifactIndex({
    environment: {
      nodeVersion: "22.13.1",
      platform: "darwin",
      arch: "arm64",
      selectedViewportNames: DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES,
      selectedViewports: [
        { name: "desktop", width: 1440, height: 1000 },
        { name: "compact", width: 1040, height: 820 },
        { name: "wide", width: 1728, height: 1100 }
      ],
      selectedSuiteScripts: criticalSuites.map(([, script]) => script.replace(/^scripts\//, "")),
      runner: "npm run smoke:ui"
    },
    selectedCount: criticalSuites.length,
    totalMs: 4200,
    results: criticalSuites.map(([name, script, artifactName]) => {
      if (script !== "scripts/smoke-database-created-views-ui.mjs") {
        return productionVisualChild(name, script, artifactName);
      }
      return productionVisualChild(name, script, artifactName, {
        snapshotDetails: [
          {
            activeTabText: "Created date desc",
            visibleTabs: requiredDatabaseCreatedViewTabs(),
            horizontalOverflowPx: 0,
            scrollWidth: 1440,
            viewportWidth: 1440
          },
          {
            activeTabText: "Created date desc",
            visibleTabs: requiredDatabaseCreatedViewTabs(),
            horizontalOverflowPx: 0,
            scrollWidth: 1040,
            viewportWidth: 1040
          },
          {
            activeTabText: "Created date desc",
            visibleTabs: requiredDatabaseCreatedViewTabs(),
            horizontalOverflowPx: 0,
            scrollWidth: 1728,
            viewportWidth: 1728
          }
        ]
      });
    })
  }, { generatedAt: "2026-06-17T21:00:00.000Z" });

  const contract = assertProductionVisualGateContract(index);
  assert.equal(contract.status, "passed");
  assert.equal(contract.requiredSuiteCount, criticalSuites.length);
  assert.deepEqual(contract.requiredViewportNames, DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES);
  assert.equal(contract.snapshotCount, criticalSuites.length * 3);
  assert.equal(contract.perceptualBaselineCount, 48);
  assert.equal(contract.suites[0].perceptualBaselines[0].viewport, "desktop");
  assert.match(contract.suites[0].perceptualBaselines[0].expectedPath, /design-system-desktop\.png$/);
  assert.equal(contract.suites[0].perceptualBaselines[1].viewport, "compact");
  assert.match(contract.suites[0].perceptualBaselines[1].expectedPath, /design-system-compact\.png$/);
  assert.equal(contract.suites[0].perceptualBaselines[2].viewport, "wide");
  assert.match(contract.suites[0].perceptualBaselines[2].expectedPath, /design-system-wide\.png$/);
  const whiteThemeProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-white-theme-ui.mjs");
  assert.equal(whiteThemeProductionSuite.perceptualBaselines.length, 3);
  assert.match(whiteThemeProductionSuite.perceptualBaselines[0].expectedPath, /white-theme-page-desktop\.png$/);
  assert.match(whiteThemeProductionSuite.perceptualBaselines[1].expectedPath, /white-theme-page-compact\.png$/);
  assert.match(whiteThemeProductionSuite.perceptualBaselines[2].expectedPath, /white-theme-page-wide\.png$/);
  const globalSearchProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-search-ui.mjs");
  assert.equal(globalSearchProductionSuite.perceptualBaselines.length, 3);
  assert.match(globalSearchProductionSuite.perceptualBaselines[0].expectedPath, /global-search-results-desktop\.png$/);
  assert.match(globalSearchProductionSuite.perceptualBaselines[1].expectedPath, /global-search-results-compact\.png$/);
  assert.match(globalSearchProductionSuite.perceptualBaselines[2].expectedPath, /global-search-results-wide\.png$/);
  const embeddedViewProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-embedded-view-ui.mjs");
  assert.equal(embeddedViewProductionSuite.perceptualBaselines.length, 3);
  assert.match(embeddedViewProductionSuite.perceptualBaselines[0].expectedPath, /embedded-view-table-desktop\.png$/);
  assert.match(embeddedViewProductionSuite.perceptualBaselines[1].expectedPath, /embedded-view-table-compact\.png$/);
  assert.match(embeddedViewProductionSuite.perceptualBaselines[2].expectedPath, /embedded-view-table-wide\.png$/);
  const pageSecondaryProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-page-secondary-ui.mjs");
  assert.equal(pageSecondaryProductionSuite.perceptualBaselines.length, 3);
  assert.match(pageSecondaryProductionSuite.perceptualBaselines[0].expectedPath, /page-history-restore-preview-desktop\.png$/);
  assert.match(pageSecondaryProductionSuite.perceptualBaselines[1].expectedPath, /page-history-restore-preview-compact\.png$/);
  assert.match(pageSecondaryProductionSuite.perceptualBaselines[2].expectedPath, /page-history-restore-preview-wide\.png$/);
  const githubBackupProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-github-backup-ui.mjs");
  assert.equal(githubBackupProductionSuite.perceptualBaselines.length, 3);
  assert.match(githubBackupProductionSuite.perceptualBaselines[0].expectedPath, /github-backup-restore-preview-desktop\.png$/);
  assert.match(githubBackupProductionSuite.perceptualBaselines[1].expectedPath, /github-backup-restore-preview-compact\.png$/);
  assert.match(githubBackupProductionSuite.perceptualBaselines[2].expectedPath, /github-backup-restore-preview-wide\.png$/);
  const notionImportProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-notion-import-ui.mjs");
  assert.equal(notionImportProductionSuite.perceptualBaselines.length, 3);
  assert.match(notionImportProductionSuite.perceptualBaselines[0].expectedPath, /notion-import-command-modal-desktop\.png$/);
  assert.match(notionImportProductionSuite.perceptualBaselines[1].expectedPath, /notion-import-command-modal-compact\.png$/);
  assert.match(notionImportProductionSuite.perceptualBaselines[2].expectedPath, /notion-import-command-modal-wide\.png$/);
  const markdownPreviewProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-markdown-preview-ui.mjs");
  assert.equal(markdownPreviewProductionSuite.perceptualBaselines.length, 3);
  assert.match(markdownPreviewProductionSuite.perceptualBaselines[0].expectedPath, /markdown-preview-selected-source-desktop\.png$/);
  assert.match(markdownPreviewProductionSuite.perceptualBaselines[1].expectedPath, /markdown-preview-selected-source-compact\.png$/);
  assert.match(markdownPreviewProductionSuite.perceptualBaselines[2].expectedPath, /markdown-preview-selected-source-wide\.png$/);
  const rowPropertyProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-row-page-property-visual-ui.mjs");
  assert.equal(rowPropertyProductionSuite.perceptualBaselines.length, 3);
  assert.match(rowPropertyProductionSuite.perceptualBaselines[0].expectedPath, /row-page-property-panel-desktop\.png$/);
  assert.match(rowPropertyProductionSuite.perceptualBaselines[1].expectedPath, /row-page-property-panel-compact\.png$/);
  assert.match(rowPropertyProductionSuite.perceptualBaselines[2].expectedPath, /row-page-property-panel-wide\.png$/);
  const settingsCenterProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-settings-center-ui.mjs");
  assert.equal(settingsCenterProductionSuite.perceptualBaselines.length, 3);
  assert.match(settingsCenterProductionSuite.perceptualBaselines[0].expectedPath, /settings-center-desktop\.png$/);
  assert.match(settingsCenterProductionSuite.perceptualBaselines[2].expectedPath, /settings-center-wide\.png$/);
  const pluginManagerProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-plugin-manager-ui.mjs");
  assert.equal(pluginManagerProductionSuite.perceptualBaselines.length, 3);
  assert.match(pluginManagerProductionSuite.perceptualBaselines[0].expectedPath, /plugin-manager-desktop\.png$/);
  assert.match(pluginManagerProductionSuite.perceptualBaselines[1].expectedPath, /plugin-manager-compact\.png$/);
  assert.match(pluginManagerProductionSuite.perceptualBaselines[2].expectedPath, /plugin-manager-wide\.png$/);
  const llmChatProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-llm-chat-ui.mjs");
  assert.equal(llmChatProductionSuite.perceptualBaselines.length, 3);
  assert.match(llmChatProductionSuite.perceptualBaselines[0].expectedPath, /llm-chat-conversation-desktop\.png$/);
  assert.match(llmChatProductionSuite.perceptualBaselines[1].expectedPath, /llm-chat-conversation-compact\.png$/);
  assert.match(llmChatProductionSuite.perceptualBaselines[2].expectedPath, /llm-chat-conversation-wide\.png$/);
  const advancedSearchProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-advanced-search-ui.mjs");
  assert.equal(advancedSearchProductionSuite.perceptualBaselines.length, 3);
  assert.match(advancedSearchProductionSuite.perceptualBaselines[0].expectedPath, /advanced-search-stale-results-desktop\.png$/);
  assert.match(advancedSearchProductionSuite.perceptualBaselines[1].expectedPath, /advanced-search-stale-results-compact\.png$/);
  assert.match(advancedSearchProductionSuite.perceptualBaselines[2].expectedPath, /advanced-search-stale-results-wide\.png$/);
  const searchAiProductionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-search-ai-ui.mjs");
  assert.equal(searchAiProductionSuite.perceptualBaselines.length, 3);
  assert.match(searchAiProductionSuite.perceptualBaselines[0].expectedPath, /search-ai-chat-handoff-desktop\.png$/);
  assert.match(searchAiProductionSuite.perceptualBaselines[1].expectedPath, /search-ai-chat-handoff-compact\.png$/);
  assert.match(searchAiProductionSuite.perceptualBaselines[2].expectedPath, /search-ai-chat-handoff-wide\.png$/);
  assert.deepEqual(contract.suites.map((suite) => suite.scriptPath), criticalSuites.map(([, script]) => script));
  assert.match(contract.suites[0].reproduceCommand, /^LOTION_UI_SUITE_FILTER=smoke-design-system-ui\.mjs npm run smoke:ui$/);
  const databaseCreatedViewsSuite = index.suites.find((suite) => suite.scriptPath === "scripts/smoke-database-created-views-ui.mjs");
  assert.match(databaseCreatedViewsSuite.artifactContract.detailText, /activeTabText=Created date desc/);
  assert.match(databaseCreatedViewsSuite.artifactContract.detailText, /visibleTabs=All,Created date asc,Created date desc/);
  assert.equal(databaseCreatedViewsSuite.artifactContract.snapshots.filter((snapshot) => snapshot.perceptualBaseline?.status === "passed").length, 3);
  assert.match(databaseCreatedViewsSuite.artifactContract.snapshots[0].perceptualBaseline.expectedPath, /database-created-views-desktop\.png$/);
  assert.match(databaseCreatedViewsSuite.artifactContract.snapshots[1].perceptualBaseline.expectedPath, /database-created-views-compact\.png$/);
  assert.match(databaseCreatedViewsSuite.artifactContract.snapshots[2].perceptualBaseline.expectedPath, /database-created-views-wide\.png$/);
  const databaseInteractionSuite = contract.suites.find((suite) => suite.scriptPath === "scripts/smoke-database-interaction-ui.mjs");
  assert.equal(databaseInteractionSuite.perceptualBaselines.length, 3);
  assert.match(databaseInteractionSuite.perceptualBaselines[0].expectedPath, /database-interaction-settings-desktop\.png$/);
  assert.match(databaseInteractionSuite.perceptualBaselines[1].expectedPath, /database-interaction-settings-compact\.png$/);
  assert.match(databaseInteractionSuite.perceptualBaselines[2].expectedPath, /database-interaction-settings-wide\.png$/);

  const focusedDesktopIndex = buildUiSuiteArtifactIndex({
    environment: {
      selectedViewportNames: ["desktop"],
      selectedViewports: [{ name: "desktop", width: 1440, height: 1000 }],
      selectedSuiteScripts: ["smoke-design-system-ui.mjs"],
      runner: "npm run smoke:ui"
    },
    selectedCount: 1,
    results: [productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
      observedViewports: ["desktop"],
      snapshotBytes: [1200],
      snapshotDetails: [{ phase: "desktop-visual", horizontalOverflowPx: 0, scrollWidth: 1440, viewportWidth: 1440 }],
      snapshotViewports: ["desktop"]
    })]
  }, { generatedAt: "2026-06-17T21:00:30.000Z" });
  const focusedDesktopContract = assertProductionVisualGateContract(focusedDesktopIndex, {
    requiredSuiteScripts: [firstSuiteScript],
    requiredViewportNames: ["desktop"]
  });
  assert.equal(focusedDesktopContract.requiredSuiteCount, 1);
  assert.equal(focusedDesktopContract.snapshotCount, 1);
  assert.equal(focusedDesktopContract.perceptualBaselineCount, 1);

  const missingPerceptualBaseline = buildUiSuiteArtifactIndex({
    environment: {
      selectedViewportNames: ["desktop"],
      selectedViewports: [{ name: "desktop", width: 1440, height: 1000 }],
      selectedSuiteScripts: ["smoke-design-system-ui.mjs"],
      runner: "npm run smoke:ui"
    },
    selectedCount: 1,
    results: [productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
      includePerceptualBaseline: false,
      observedViewports: ["desktop"],
      snapshotBytes: [1200],
      snapshotDetails: [{ phase: "desktop-visual", horizontalOverflowPx: 0, scrollWidth: 1440, viewportWidth: 1440 }]
    })]
  }, { generatedAt: "2026-06-17T21:00:45.000Z" });
  assert.throws(
    () => assertProductionVisualGateContract(missingPerceptualBaseline, {
      requiredSuiteScripts: [firstSuiteScript],
      requiredViewportNames: ["desktop"]
    }),
    /lacks a committed perceptual baseline/
  );

  const focusedReviewIndex = buildUiSuiteArtifactIndex({
    environment: {
      selectedViewportNames: ["review"],
      selectedViewports: [{ name: "review", width: 1200, height: 900 }],
      selectedSuiteScripts: ["smoke-design-system-ui.mjs"],
      runner: "npm run smoke:ui"
    },
    selectedCount: 1,
    results: [productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
      includePerceptualBaseline: false,
      observedViewports: ["review"],
      snapshotBytes: [1200],
      snapshotDetails: [{ phase: "review-visual", horizontalOverflowPx: 0, scrollWidth: 1200, viewportWidth: 1200 }],
      snapshotViewports: ["review"]
    })]
  }, { generatedAt: "2026-06-17T21:00:50.000Z" });
  const focusedReviewContract = assertProductionVisualGateContract(focusedReviewIndex, {
    requiredSuiteScripts: [firstSuiteScript],
    requiredViewportNames: ["review"]
  });
  assert.equal(focusedReviewContract.perceptualBaselineCount, 0);

  const missingCriticalSuite = buildUiSuiteArtifactIndex({
    selectedCount: criticalSuites.length - 1,
    results: criticalSuites
      .filter(([, script]) => script !== "scripts/smoke-advanced-search-ui.mjs")
      .map(([name, script, artifactName]) => productionVisualChild(name, script, artifactName))
  }, { generatedAt: "2026-06-17T21:01:00.000Z" });
  assert.throws(
    () => assertProductionVisualGateContract(missingCriticalSuite),
    /missing required suite script: scripts\/smoke-advanced-search-ui\.mjs/
  );

  const missingCompactScreenshot = buildUiSuiteArtifactIndex({
    selectedCount: criticalSuites.length,
    results: [
      productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
        snapshotBytes: [1000],
        snapshotViewports: ["desktop"]
      }),
      ...criticalSuites
        .slice(1)
        .map(([name, script, artifactName]) => productionVisualChild(name, script, artifactName))
    ]
  }, { generatedAt: "2026-06-17T21:02:00.000Z" });
  assert.throws(
    () => assertProductionVisualGateContract(missingCompactScreenshot),
    /missing screenshot viewport\(s\): compact, wide/
  );

  const missingWideScreenshot = buildUiSuiteArtifactIndex({
    selectedCount: criticalSuites.length,
    results: [
      productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
        snapshotBytes: [1000, 900],
        snapshotViewports: ["desktop", "compact"]
      }),
      ...criticalSuites
        .slice(1)
        .map(([name, script, artifactName]) => productionVisualChild(name, script, artifactName))
    ]
  }, { generatedAt: "2026-06-17T21:02:30.000Z" });
  assert.throws(
    () => assertProductionVisualGateContract(missingWideScreenshot),
    /missing screenshot viewport\(s\): wide/
  );

  const horizontalOverflow = buildUiSuiteArtifactIndex({
    selectedCount: criticalSuites.length,
    results: [
      productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
        snapshotDetails: [
          { phase: "desktop-visual", horizontalOverflowPx: 12, scrollWidth: 1452, viewportWidth: 1440 },
          { phase: "compact-visual", horizontalOverflowPx: 0, scrollWidth: 1040, viewportWidth: 1040 },
          { phase: "wide-visual", horizontalOverflowPx: 0, scrollWidth: 1728, viewportWidth: 1728 }
        ]
      }),
      ...criticalSuites
        .slice(1)
        .map(([name, script, artifactName]) => productionVisualChild(name, script, artifactName))
    ]
  }, { generatedAt: "2026-06-17T21:02:45.000Z" });
  assert.throws(
    () => assertProductionVisualGateContract(horizontalOverflow),
    /horizontal overflow/
  );

  const weakReproduceCommand = buildUiSuiteArtifactIndex({
    selectedCount: criticalSuites.length,
    results: [
      productionVisualChild(firstSuiteName, firstSuiteScript, firstSuiteArtifact, {
        reproduceCommand: "node scripts/smoke-notion-import-ui.mjs"
      }),
      ...criticalSuites
        .slice(1)
        .map(([name, script, artifactName]) => productionVisualChild(name, script, artifactName))
    ]
  }, { generatedAt: "2026-06-17T21:03:00.000Z" });
  assert.throws(
    () => assertProductionVisualGateContract(weakReproduceCommand),
    /no focused reproduce command/
  );
});

function productionVisualChild(name, scriptPath, artifactName, options = {}) {
  const snapshotDetails = options.snapshotDetails || [
    { phase: "desktop-visual", horizontalOverflowPx: 0, scrollWidth: 1440, viewportWidth: 1440 },
    { phase: "compact-visual", horizontalOverflowPx: 0, scrollWidth: 1040, viewportWidth: 1040 },
    { phase: "wide-visual", horizontalOverflowPx: 0, scrollWidth: 1728, viewportWidth: 1728 }
  ];
  const perceptualSurface = scriptPath === "scripts/smoke-design-system-ui.mjs"
    ? "design-system"
    : scriptPath === "scripts/smoke-white-theme-ui.mjs"
      ? "white-theme-page"
      : scriptPath === "scripts/smoke-search-ui.mjs"
        ? "global-search-results"
      : scriptPath === "scripts/smoke-page-secondary-ui.mjs"
        ? "page-history-restore-preview"
      : scriptPath === "scripts/smoke-github-backup-ui.mjs"
        ? "github-backup-restore-preview"
      : scriptPath === "scripts/smoke-notion-import-ui.mjs"
        ? "notion-import-command-modal"
      : scriptPath === "scripts/smoke-markdown-preview-ui.mjs"
        ? "markdown-preview-selected-source"
      : scriptPath === "scripts/smoke-row-page-property-visual-ui.mjs"
        ? "row-page-property-panel"
      : scriptPath === "scripts/smoke-embedded-view-ui.mjs"
        ? "embedded-view-table"
      : scriptPath === "scripts/smoke-database-created-views-ui.mjs"
        ? "database-created-views"
      : scriptPath === "scripts/smoke-database-interaction-ui.mjs"
        ? "database-interaction-settings"
      : scriptPath === "scripts/smoke-settings-center-ui.mjs"
        ? "settings-center"
        : scriptPath === "scripts/smoke-plugin-manager-ui.mjs"
          ? "plugin-manager"
          : scriptPath === "scripts/smoke-llm-chat-ui.mjs"
            ? "llm-chat-conversation"
          : scriptPath === "scripts/smoke-advanced-search-ui.mjs"
            ? "advanced-search-stale-results"
          : scriptPath === "scripts/smoke-search-ai-ui.mjs"
            ? "search-ai-chat-handoff"
        : null;
  const withPerceptualBaseline = perceptualSurface && options.includePerceptualBaseline !== false
    ? snapshotDetails.map((details, index) => index < 3
      ? { ...details, perceptualBaseline: productionPerceptualBaseline(["desktop", "compact", "wide"][index], perceptualSurface) }
      : details)
    : snapshotDetails;
  return uiSuiteChild({
    artifactRoot: `artifacts/ui-smoke/${artifactName}-2026`,
    manifestPath: `artifacts/ui-smoke/${artifactName}-2026/harness-result.json`,
    name,
    scriptPath,
    observedViewports: options.observedViewports || DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES,
    snapshotBytes: options.snapshotBytes || [1200, 1100, 1300],
    snapshotDetails: withPerceptualBaseline,
    snapshotViewports: options.snapshotViewports,
    reproduceCommand: options.reproduceCommand
  });
}

function productionPerceptualBaseline(viewportName = "desktop", surface = "design-system") {
  return {
    kind: "lotion-png-visual-diff",
    status: "passed",
    policyPath: `test/baselines/production-visual/${surface}-${viewportName}.json`,
    actualPath: `artifacts/ui-smoke/${surface}/snapshots/${surface}-${viewportName}.png`,
    expectedPath: `test/baselines/production-visual/${surface}-${viewportName}.png`,
    diffPath: `artifacts/ui-smoke/${surface}/visual-diff/${surface}-${viewportName}-diff.png`,
    metadataPath: `artifacts/ui-smoke/${surface}/visual-diff/${surface}-${viewportName}-diff.json`,
    dimensionsMatch: true,
    diffPixels: 0,
    diffRatio: 0,
    maxDiffPixels: 0,
    maxDiffRatio: 0,
    threshold: 0.1,
    includeAA: false,
    policy: { surface, theme: "light", viewport: { name: viewportName } }
  };
}

function uiSuiteChild({
  artifactRoot,
  consoleErrorCount = 0,
  consoleIssues = [],
  elapsedMs = 100,
  failureArtifacts = null,
  harnessMode = "shared",
  includeArtifactContract = true,
  manifestPath,
  name,
  observedViewports = ["desktop", "compact"],
  reproduceCommand,
  scriptPath,
  snapshotBytes = [1000, 900],
  snapshotDetails = [],
  snapshotViewports,
  status = "passed"
}) {
  return {
    elapsedMs,
    harnessMode,
    reproduceCommand: reproduceCommand ?? `LOTION_UI_SUITE_FILTER=${scriptFilterForPath(scriptPath ?? `scripts/${scriptNameForSuite(name)}`)} npm run smoke:ui`,
    scriptPath: scriptPath ?? `scripts/${scriptNameForSuite(name)}`,
    harnessManifest: {
      artifactRoot,
      ...(includeArtifactContract ? { artifactContract: {
        expectedViewportNames: observedViewports,
        observedViewportNames: observedViewports,
        snapshotCount: snapshotBytes.length,
        snapshots: snapshotBytes.map((imageBytes, index) => ({
          viewport: snapshotViewportName(snapshotViewports, observedViewports, index),
          imagePath: `${artifactRoot}/snapshots/${snapshotViewportName(snapshotViewports, observedViewports, index)}-${index}.png`,
          metadataPath: `${artifactRoot}/snapshots/${snapshotViewportName(snapshotViewports, observedViewports, index)}-${index}.json`,
          imageBytes,
          ...(snapshotDetails[index] || {})
        })),
        status
      } } : {}),
      consoleErrorCount,
      consoleIssues,
      failureArtifacts,
      missingViewportNames: [],
      observedViewports,
      path: manifestPath,
      status
    },
    name,
    status: status === "passed" ? 0 : 1
  };
}

function scriptNameForSuite(name) {
  return `${String(name || "ui-smoke").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.mjs`;
}

function scriptFilterForPath(scriptPath) {
  return String(scriptPath || "").split("/").pop();
}

function snapshotViewportName(snapshotViewports, observedViewports, index) {
  return snapshotViewports?.[index] || observedViewports[index] || `viewport-${index}`;
}

function notionImportAuditContractEntry(viewportName, { imagePath, metadataPath }) {
  const sourceRoot = `/tmp/lotion-notion-audit-${viewportName}/source`;
  const workspaceRoot = `/tmp/lotion-notion-audit-${viewportName}/workspace`;
  return {
    viewport: viewportName,
    sourceRoot,
    workspaceRoot,
    summary: notionImportAuditSummary(),
    pathButtons: 2,
    snapshot: {
      imagePath,
      metadataPath,
      height: 420,
      width: 760
    },
    shellOpenDryRunRequests: [sourceRoot, workspaceRoot],
    singleFlightSubmission: notionAuditSingleFlightEvidence()
  };
}

function notionImportModalContractEntry(viewportName, { imagePath, metadataPath }) {
  const rect = (left, top, width, height) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  });
  return {
    viewport: viewportName,
    overlay: {
      ariaModal: "true",
      backdropCoversViewport: true,
      centerInsideModal: true,
      modalContainsPageTitle: false,
      modalHeight: 425,
      modalRole: "dialog",
      title: "Import from Notion"
    },
    controlState: {
      modalRect: rect(140, 80, 760, 644),
      bodyRect: rect(140, 142, 760, 520),
      panelRect: rect(168, 158, 704, 488),
      titleRect: rect(168, 100, 190, 28),
      closeRect: rect(848, 96, 32, 32),
      optionsRect: rect(168, 158, 704, 166),
      optionRects: [
        rect(184, 188, 430, 30),
        rect(184, 226, 430, 30),
        rect(184, 264, 430, 44)
      ],
      sourceCardRects: [rect(168, 340, 704, 82), rect(168, 434, 704, 82)],
      sourceButtonRects: [rect(726, 360, 126, 40), rect(726, 454, 126, 40)],
      actionsRect: rect(168, 548, 704, 64),
      cancelRect: rect(668, 560, 80, 40),
      scanRect: rect(760, 560, 112, 40),
      titleText: "Import from Notion",
      optionTexts: [
        "Do not import blank rows and pages",
        "Auto-dedupe duplicate Notion pages",
        "Preserve original Notion export for audit"
      ],
      optionChecked: [true, true, true],
      sourceTexts: ["1. Markdown & CSV export Required", "2. HTML export Recommended"],
      sourceButtonTexts: ["Choose folder…", "Choose folder…"],
      actionTexts: ["Cancel", "Scan exports"],
      scanDisabled: true,
      panelInsideModal: true,
      titleInsideModal: true,
      closeInsideModal: true,
      optionsInsideModal: true,
      optionsInsidePanel: true,
      optionControlsInsideOptions: true,
      sourceCardsInsidePanel: true,
      sourceButtonsInsideCards: true,
      actionsInsidePanel: true,
      actionButtonsInsideActions: true,
      modalInsideViewport: true,
      bodyOverflowY: "auto",
      bodyScrollHeight: 520,
      bodyClientHeight: 520,
      bodyOwnsVerticalScroll: true,
      visibility: "visible",
      opacity: 1,
      horizontalOverflow: 0
    },
    snapshot: {
      imagePath,
      metadataPath,
      height: 425,
      width: 760
    },
    workspaceRoot: `/tmp/lotion-notion-audit-${viewportName}/workspace`
  };
}

function notionImportAuditDiagnosticEntry(viewportName, { imagePath, metadataPath }) {
  const sourceRoot = `/tmp/lotion-notion-audit-${viewportName}/diagnostic-source`;
  const workspaceRoot = `/tmp/lotion-notion-audit-${viewportName}/diagnostic-workspace`;
  return {
    viewport: viewportName,
    failText: "Audit found blocking import issues.",
    issueKinds: { cell_loss: 1 },
    issueRows: 1,
    sourceRoot,
    workspaceRoot,
    summary: notionImportAuditDiagnosticSummary(),
    pathButtons: 3,
    snapshot: {
      imagePath,
      metadataPath,
      height: 520,
      width: 760
    },
    shellOpenDryRunRequests: [sourceRoot, workspaceRoot, "databases/user/Tasks--db_audit_ui"],
    singleFlightSubmission: notionAuditSingleFlightEvidence()
  };
}

async function writeNotionImportModalSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} notion import modal screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `notion-import-command-modal-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 120, right: 980, bottom: 545, left: 220, width: 760, height: 425 },
    image: imagePath,
    metadata: {
      overlay: entry.overlay,
      controlState: entry.controlState,
      phase: "command-modal",
      workspaceRoot: entry.workspaceRoot
    }
  }, null, 2)}\n`, "utf8");
}

async function writeNotionImportAuditSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} notion import audit screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `notion-audit-result-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 90, right: 910, bottom: 510, left: 150, width: 760, height: 420 },
    image: imagePath,
    metadata: {
      summary: entry.summary,
      pathButtons: entry.pathButtons,
      sourceRoot: entry.sourceRoot,
      workspaceRoot: entry.workspaceRoot,
      shellOpenDryRunRequests: entry.shellOpenDryRunRequests,
      singleFlightSubmission: entry.singleFlightSubmission,
      ...(entry.failText ? { failText: entry.failText } : {}),
      ...(entry.issueKinds ? { issueKinds: entry.issueKinds } : {}),
      ...(entry.issueRows ? { issueRows: entry.issueRows } : {}),
      ...(entry.failText ? { phase: "diagnostic" } : { phase: "passing" })
    }
  }, null, 2)}\n`, "utf8");
}

function notionAuditSingleFlightEvidence() {
  return {
    attemptedClicks: 2,
    disabledAfterFirstClick: false,
    disabledAfterDispatch: false,
    resultCount: 1,
    errorCount: 0
  };
}

function notionImportAuditSummary() {
  return {
    "Source CSVs": "1 / 1",
    "Source HTMLs": "1 / 1",
    "Imported mappings": "1 database, 1 row/page",
    "Issues": "0",
    "Warnings": "0"
  };
}

function notionImportAuditDiagnosticSummary() {
  return {
    "Source CSVs": "1 / 1",
    "Source HTMLs": "1 / 1",
    "Imported mappings": "1 database, 1 row/page",
    "Issues": "1",
    "Warnings": "0"
  };
}

function rowPageNavigationContractEntry(viewportName, { imagePath, metadataPath }) {
  const originalHtml = "attachments/original/export/Row_Page_Navigation_Row.html";
  const originalCsv = "attachments/original/export/Row_Page_Navigation_DB.csv";
  return {
    viewport: viewportName,
    databaseId: "db_row_nav",
    rowId: "row_row_nav",
    rowPageFile: "Row_Page_Navigation_Row--row_row_nav.md",
    activeTabText: "页面Row Page Navigation DB/Row Page Navigation Row",
    directCellEdit: {
      fieldId: "notes",
      value: "Edited directly in the database table"
    },
    propertyVisuals: {
      sourceLinkWidth: 532,
      tagPillHeight: 22,
      snapshotBaseline: {
        imageBytes: 32,
        viewportName
      },
      snapshot: {
        imagePath,
        metadataPath,
        height: 490,
        width: 730
      }
    },
    propertyFocusGeometry: {
      statusSearch: {
        focus: { containsActive: true }
      },
      sourceLinks: [
        { fieldName: "Original Notion HTML", focus: { containsActive: true } },
        { fieldName: "Original Notion CSV", focus: { containsActive: true } }
      ]
    },
    dateEdit: {
      raw: "2026-02-14",
      display: "February 14, 2026"
    },
    sourceLinks: [
      {
        fieldName: "Original Notion HTML",
        info: {
          rowClass: "row-property read-only source-link-property",
          linkTitle: originalHtml
        },
        opened: [originalHtml]
      },
      {
        fieldName: "Original Notion CSV",
        info: {
          rowClass: "row-property read-only source-link-property",
          linkTitle: originalCsv
        },
        opened: [originalCsv]
      }
    ],
    entityRefOpened: {
      titleInput: "Related Reference Page",
      activeTabText: "页面Related Reference Page"
    },
    openMs: viewportName === "desktop" ? 120.3 : 140
  };
}

function urlFieldContractEntry(viewportName, {
  tableImagePath,
  tableMetadataPath,
  pageImagePath,
  pageMetadataPath
}) {
  const editedRawUrl = "example.com/edited-smoke?x=2";
  const editedNormalizedUrl = `https://${editedRawUrl}`;
  const pageEditedRawUrl = "docs.example.com/top-page-url-edited";
  const pageEditedNormalizedUrl = `https://${pageEditedRawUrl}`;
  return {
    viewport: viewportName,
    databaseId: "db_url_field",
    editedRawUrl,
    editedNormalizedUrl,
    pageEditedRawUrl,
    pageEditedNormalizedUrl,
    tableEdit: {
      openedBeforeTextClick: [],
      openedAfterTextClick: [],
      edited: {
        inputValue: editedRawUrl,
        displayText: editedRawUrl,
        buttonTitle: editedNormalizedUrl
      }
    },
    tableOpenRequests: [editedNormalizedUrl],
    tableSnapshot: {
      imagePath: tableImagePath,
      metadataPath: tableMetadataPath,
      imageBytes: 32
    },
    rowPageProperty: {
      propertyInfo: {
        found: true,
        pagePropertyLinks: 0,
        urlEditors: 1,
        urlCells: 1
      },
      openedAfterTextClick: []
    },
    pageUrlProperty: {
      pageId: "pg_url_field_home",
      initial: {
        buttonDisabled: false,
        matchingOpenButtons: 1
      },
      afterTextClick: [],
      editedLayout: urlFieldLayout({
        displayText: pageEditedRawUrl,
        inputValue: pageEditedRawUrl,
        buttonTitle: pageEditedNormalizedUrl,
        matchedButtons: 1
      }),
      openRequests: [pageEditedNormalizedUrl]
    },
    pageUrlSnapshot: {
      imagePath: pageImagePath,
      metadataPath: pageMetadataPath,
      imageBytes: 32
    },
    rendered: {
      displayLinks: [{
        title: editedRawUrl,
        text: editedRawUrl,
        visible: true,
        textDecorationLine: "underline"
      }],
      layouts: [urlFieldLayout({ displayTitle: editedRawUrl })]
    }
  };
}

function urlFieldLayout(overrides = {}) {
  return {
    displayTitle: overrides.displayTitle || "",
    displayText: overrides.displayText || "",
    inputValue: overrides.inputValue || "",
    buttonTitle: overrides.buttonTitle || "",
    matchedButtons: overrides.matchedButtons ?? 1,
    textDecorationLine: "underline",
    inputOpacity: "0",
    gap: 8,
    buttonWidth: 32,
    buttonHeight: 32,
    buttonCenterY: 42,
    cellCenterY: 42
  };
}

async function writeUrlFieldMetadata(metadataPath, viewportName, metadata) {
  await writeFile(metadataPath, `${JSON.stringify({
    viewport: {
      name: viewportName,
      width: viewportName === "desktop" ? 1440 : 1040,
      height: 820
    },
    metadata
  }, null, 2)}\n`, "utf8");
}

function editorRegressionContractEntry(viewportName, { imagePath, metadataPath }) {
  return {
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: viewportName === "desktop" ? 1000 : 820 },
    normal: {
      firstToken: `Typed insertion ${viewportName}`,
      selectionReplacement: `Selection replacement ${viewportName}`,
      mergedLine: `Merge left ${viewportName}merge right ${viewportName}`,
      switchContinuation: `Page switch continued typing ${viewportName}`,
      typedMs: 42,
      markdownLength: 4096,
      markdownLinks: {
        bareUrl: { directClickOpened: [`https://example.com/editor-link/${viewportName}`], editToken: `edit${viewportName}` },
        inlineExternal: { directClickOpened: [`https://example.com/editor-inline/${viewportName}`], editToken: ` inline${viewportName}` },
        decodedExternal: { directClickOpened: [`https://example.com/editor-decoded-target/${viewportName}`], editToken: ` decoded${viewportName}` },
        attachment: { directClickOpened: [`attachments/documents/editor-link-note.txt`], editToken: ` file${viewportName}` },
        internal: { editToken: ` internal${viewportName}`, navigationTitle: `Editor Regression Secondary ${viewportName}` }
      },
      markdownEmphasisShortcuts: {
        boldText: `Bold ${viewportName}`,
        italicText: `Italic ${viewportName}`,
        strikeText: `Strike ${viewportName}`
      },
      lotionCalloutFence: { rendered: true },
      lotionViewFence: { rendered: true },
      markdownTableSyntax: { rendered: true },
      layoutRecovery: editorLayoutRecoveryEvidence(viewportName, "normal page")
    },
    empty: {
      firstTyping: `Empty row first typing ${viewportName}`,
      markdownLength: 256,
      layoutRecovery: editorLayoutRecoveryEvidence(viewportName, "empty row page")
    },
    large: {
      largeToken: `Large document edit ${viewportName}`,
      beforeScroll: { scrollTop: 3000, scrollHeight: 8000, clientHeight: 900 },
      afterScroll: { scrollTop: 3100, scrollHeight: 8100, clientHeight: 900 }
    },
    visualSnapshot: {
      imagePath,
      metadataPath
    }
  };
}

function editorLayoutRecoveryEvidence(viewportName, scope) {
  return {
    retryMessage: `Injected ${scope} ${viewportName} full-width persistence failure`,
    discardMessage: `Injected ${scope} ${viewportName} small-text persistence failure`,
    failedValueRolledBack: true,
    retainedDraft: true,
    competingControlsBlocked: true,
    duplicateRetrySuppressed: true,
    retryPersistedExactInput: true,
    discardFailureRolledBack: true,
    discardedDraftRetained: true,
    discardPreservedStoredValue: true,
    discardResetDraft: true,
    baselineStateRestored: true
  };
}

function editorRegressionMetadata(viewportName) {
  return {
    phase: "editor-regression",
    pageId: `pg_editor_large_${viewportName}`,
    firstToken: `Typed insertion ${viewportName}`,
    emptyFirstTyping: `Empty row first typing ${viewportName}`,
    largeToken: `Large document edit ${viewportName}`,
    typedMs: 42
  };
}

async function writeEditorRegressionMetadata(metadataPath, viewportName, metadata) {
  await writeFile(metadataPath, `${JSON.stringify({
    viewport: {
      name: viewportName,
      width: viewportName === "desktop" ? 1440 : 1040,
      height: viewportName === "desktop" ? 1000 : 820
    },
    metadata
  }, null, 2)}\n`, "utf8");
}

function editorLinkClickContractEntry(viewportName, { imagePath, metadataPath }) {
  const externalHref = `https://example.com/editor-direct-click/${viewportName}`;
  const internalTarget = `databases/system/pages--db_pages/pages/Editor_Link_Click_Secondary_${viewportName}--pg_editor_link_click_secondary_${viewportName}.md`;
  const blankEditToken = ` blank-edit-${viewportName}`;
  return {
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: viewportName === "desktop" ? 1000 : 820 },
    pageId: `pg_editor_link_click_main_${viewportName}`,
    external: {
      href: externalHref,
      opened: [externalHref],
      lineText: `External link fixture: External direct link ${viewportName}`
    },
    internal: {
      target: internalTarget,
      navigatedTitle: `Editor Link Click Secondary ${viewportName}`
    },
    blankEdit: {
      token: blankEditToken,
      focused: true
    },
    overflow: {
      bodyScrollWidth: 1040,
      bodyClientWidth: 1040,
      docScrollWidth: 1040,
      docClientWidth: 1040,
      innerWidth: 1040
    },
    visualSnapshot: {
      imagePath,
      metadataPath
    }
  };
}

function editorLinkClickMetadata(viewportName) {
  const entry = editorLinkClickContractEntry(viewportName, {
    imagePath: "/tmp/editor-link-click.png",
    metadataPath: "/tmp/editor-link-click.json"
  });
  return {
    phase: "editor-link-click",
    pageId: entry.pageId,
    externalHref: entry.external.href,
    internalTarget: entry.internal.target,
    blankEditToken: entry.blankEdit.token,
    externalOpenedCount: 1,
    internalNavigatedTitle: entry.internal.navigatedTitle
  };
}

async function writeEditorLinkClickMetadata(metadataPath, viewportName, metadata) {
  await writeFile(metadataPath, `${JSON.stringify({
    viewport: {
      name: viewportName,
      width: viewportName === "desktop" ? 1440 : 1040,
      height: viewportName === "desktop" ? 1000 : 820
    },
    metadata
  }, null, 2)}\n`, "utf8");
}

function editorScrollContractEntry(viewportName, { imagePath, metadataPath }) {
  return {
    viewport: viewportName,
    workspaceRoot: `/tmp/lotion-editor-scroll-${viewportName}`,
    lines: 2500,
    embeddedRows: 300,
    thresholdMs: 600,
    overheadThresholdMs: 250,
    steps: 24,
    baselineRafMs: 80,
    totalMs: 140,
    scrollOverheadMs: 60,
    avgStepMs: 5.83,
    scrollHeight: 12000,
    clientHeight: 900,
    embeddedTablesAfterScroll: 1,
    longTaskCount: 0,
    maxLongTaskMs: 0,
    loadedOverflow: editorScrollOverflow(),
    afterOverflow: editorScrollOverflow(),
    visualSnapshot: {
      imagePath,
      metadataPath
    }
  };
}

function editorScrollMetadata(viewportName) {
  const entry = editorScrollContractEntry(viewportName, {
    imagePath: "/tmp/editor-scroll.png",
    metadataPath: "/tmp/editor-scroll.json"
  });
  return {
    phase: "editor-scroll",
    lines: entry.lines,
    embeddedRows: entry.embeddedRows,
    steps: entry.steps,
    totalMs: entry.totalMs,
    scrollOverheadMs: entry.scrollOverheadMs,
    scrollHeight: entry.scrollHeight,
    embeddedTablesAfterScroll: entry.embeddedTablesAfterScroll
  };
}

function editorScrollOverflow() {
  return {
    bodyScrollWidth: 1040,
    bodyClientWidth: 1040,
    docScrollWidth: 1040,
    docClientWidth: 1040,
    innerWidth: 1040
  };
}

async function writeEditorScrollMetadata(metadataPath, viewportName, metadata) {
  await writeFile(metadataPath, `${JSON.stringify({
    viewport: {
      name: viewportName,
      width: viewportName === "desktop" ? 1440 : 1040,
      height: viewportName === "desktop" ? 1000 : 820
    },
    metadata
  }, null, 2)}\n`, "utf8");
}

function sourceAttachmentContractEntry(viewportName, { imagePath, metadataPath }) {
  const originalHtmlRel = "attachments/original/notion-export/source-page.html";
  const originalCsvRel = "attachments/original/notion-export/source-database.csv";
  const documentRel = "attachments/documents/source-note.txt";
  const pdfRel = "attachments/documents/source-preview.pdf";
  const videoRel = "attachments/videos/source-preview.mp4";
  const audioRel = "attachments/audio/source-preview.mp3";
  const imageRel = "attachments/images/tiny-source.png";
  return {
    viewport: viewportName,
    originalHtmlRel,
    originalCsvRel,
    documentRel,
    pdfRel,
    videoRel,
    audioRel,
    imageRel,
    propertySnapshot: {
      imagePath,
      metadataPath,
      imageBytes: 44,
      viewportName
    },
    rendered: {
      sourceLinkButtons: [
        { title: originalHtmlRel, text: "Original Notion HTML", readOnly: true },
        { title: originalCsvRel, text: "Original Notion CSV", readOnly: true }
      ],
      documentLinks: 1,
      shellOpenDryRunRequests: [originalHtmlRel, originalCsvRel, documentRel],
      pdfPreviewSrc: `lotion-workspace://${pdfRel}`,
      videoPreview: { src: `lotion-workspace://${videoRel}`, controls: true },
      audioPreview: { src: `lotion-workspace://${audioRel}`, controls: true },
      imageSrc: `lotion-workspace://${imageRel}`
    }
  };
}

async function writeMarkdownSnapshotFiles({ imagePath, metadataPath, phase, viewportName, selectedSourceState }) {
  await writeFile(imagePath, `fake ${viewportName} ${phase} markdown preview screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `markdown-preview-${phase}-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 80, right: 900, bottom: 680, left: 120, width: 780, height: 600 },
    image: imagePath,
    metadata: {
      phase,
      pageId: `pg_markdown_${viewportName}`,
      pageTitle: `Markdown Preview ${viewportName}`,
      ...(phase === "selected-imported-highlight" ? {
        selectionBackgroundTransparent: true,
        blockBackgroundAlpha: 0.48,
        sourceEditable: true,
        selectedSourceState: selectedSourceState ?? markdownSelectedSourceState()
      } : {}),
      ...(phase === "imported-toggle" ? {
        importedToggleBodyTextPreserved: true,
        importedToggleImageCount: 1,
        importedToggleOpen: true,
        importedToggleSummary: "收据"
      } : {})
    }
  }, null, 2)}\n`, "utf8");
}

function markdownPreviewContractEntry(viewportName, {
  initialImagePath,
  initialMetadataPath,
  selectedImagePath,
  selectedMetadataPath,
  importedToggleImagePath,
  importedToggleMetadataPath,
  widgetsImagePath,
  widgetsMetadataPath
}) {
  return {
    viewport: viewportName,
    visualSnapshots: [
      {
        phase: "initial",
        imagePath: initialImagePath,
        metadataPath: initialMetadataPath,
        height: 600,
        width: 780
      },
      {
        phase: "selected-imported-highlight",
        imagePath: selectedImagePath,
        metadataPath: selectedMetadataPath,
        height: 600,
        width: 780,
        selectedSourceState: markdownSelectedSourceState()
      },
      {
        phase: "imported-toggle",
        imagePath: importedToggleImagePath,
        metadataPath: importedToggleMetadataPath,
        height: 600,
        width: 780
      },
      {
        phase: "widgets",
        imagePath: widgetsImagePath,
        metadataPath: widgetsMetadataPath,
        height: 600,
        width: 780
      }
    ],
    rendered: {
      strongLine: { strongText: ["粗体等待"] },
      emphasisLine: { emphasisText: ["斜体等待"] },
      strikeLine: { strikeText: ["完成的删除线"] },
      importedSingleTildeLine: { strikeText: ["从国内买茶叶，药品，书法用具"] },
      underlineLine: { underlineText: ["重要下划线"] },
      highlightLine: { highlightText: ["重点高亮"] },
      colorLine: { colorText: ["红色文字"] },
      importedHighlightSelection: {
        sourceEditable: true,
        editorHasSelection: true,
        selectedText: "Selection probe",
        bgBackground: "rgba(0, 0, 0, 0)",
        lineBackground: "rgba(243, 238, 255, 0.55)",
        lineHasSelectionClass: true,
        lineIsBlockquote: true,
        editSourceButtonState: { text: "Edit source", opacity: "1" }
      },
      listColorLine: { colorText: ["列表红色"] },
      rawCalloutSourceVisible: false,
      calloutMark: "高亮提示",
      calloutColor: "绿色提示",
      calloutHasEditSource: true,
      calloutClassName: "cm-md-callout-widget cm-md-callout-bg-green",
      imagePreview: {
        rawSourceVisible: false,
        hasEditSource: false,
        src: "data:image/svg+xml,%3Csvg%3E"
      },
      iframePreview: {
        src: "https://indify.co/widgets/live/progressBar/CJC1CaARFbRiUGHJPNdR"
      },
      togglePreview: {
        summary: "计划折叠块",
        summaryEditable: "SPAN",
        summaryContentEditable: "plaintext-only",
        bodyEditable: "DIV",
        bodyContentEditable: "",
        bodyHtml: "<p>折叠内容</p>",
        hasEditSource: false
      },
      equationPreview: {
        text: "ƒE = mc^2",
        hasEditSource: true
      },
      tablePreview: {
        text: "名称 主动增管",
        editableCellContentEditable: "plaintext-only",
        hasEditSource: true,
        controls: [
          { action: "add-row" },
          { action: "add-column" },
          { action: "delete-row" },
          { action: "delete-column" }
        ],
        rowDragHandleCount: 2,
        columnDragHandleCount: 3
      },
      importedNotionToggle: {
        summaryText: "收据",
        summaryEditable: "SPAN",
        summaryContentEditable: "plaintext-only",
        bodyEditable: "DIV",
        bodyText: "在美团上买了视力检查",
        bodyImageCount: 1,
        bodyRawMarkdownVisible: false,
        editSourcePresent: false
      },
      longLinkLine: {
        text: "https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's 100,000 token long context,or even an entire book.",
        links: [{ url: "https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's%20100%2C000%20token" }]
      },
      escapedLabelLine: {
        text: "Project [A]",
        links: [{ url: "https://example.com/project-a" }]
      }
    },
    imageSourceReveal: {
      afterLeavingSource: {
        sourceVisible: false,
        imageVisible: true
      }
    },
    markdownTableEdit: {
      markdownContainsEdit: true,
      tableContainsEdit: true
    },
    markdownTableSourceEdit: {
      buttonState: { text: "Edit source" },
      sourceState: {
        headerLine: { text: "| 名称 | 配额 | 目前余额 |" },
        tableWidgetVisible: false
      }
    },
    markdownTableStructureEdit: { restoredOriginal: true },
    markdownTableDragReorder: { restoredOriginal: true },
    toggleDirectEdit: {
      markdownContainsSummary: true,
      markdownContainsBody: true,
      markdownContainsOpen: true
    },
    importedNotionToggle: {
      snapshot: {
        disclosureVisible: true,
        open: true
      }
    },
    taskCheckboxToggle: {
      markdownContainsToggle: true,
      visibleChecked: true
    },
    missingDatabasePlaceholder: {
      initial: {
        label: "Missing imported view",
        hasSearch: true
      },
      afterLeavingSource: {
        widgetVisible: true
      }
    },
    rawToggle: {
      on: { editorPresent: true },
      off: { editorPresent: true }
    }
  };
}

function markdownSelectedSourceState() {
  const rect = (left, top, width, height) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  });
  return {
    editorRect: rect(120, 80, 780, 600),
    scrollerRect: rect(120, 80, 780, 600),
    lineRect: rect(150, 280, 710, 52),
    highlightRect: rect(290, 284, 390, 42),
    editSourceRect: rect(758, 286, 92, 30),
    selectionRect: rect(310, 286, 330, 38),
    rawSourceText: '> <span data-lotion-bg="yellow">Selection probe: **From now on, make it a personal commitment**</span>Edit source',
    selectedText: "Selection probe",
    selectedRangeCount: 1,
    editSourceText: "Edit source",
    lineInsideEditor: true,
    lineIntersectsScroller: true,
    highlightInsideLine: true,
    selectionInsideLine: true,
    selectionIntersectsScroller: true,
    editSourceInsideLine: true,
    editSourceIntersectsScroller: true,
    selectionOverlapsEditSource: false,
    highlightOverlapsEditSource: false,
    lineVisibility: "visible",
    lineOpacity: 1,
    highlightVisibility: "visible",
    highlightOpacity: 1,
    editSourceVisibility: "visible",
    editSourceOpacity: 1,
    documentHorizontalOverflow: 0,
    editorHorizontalOverflow: 0
  };
}

async function createMarkdownPreviewArtifactFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), "lotion-markdown-preview-artifact-fixture-"));
  const paths = {
    initialImagePath: join(root, "initial.png"),
    initialMetadataPath: join(root, "initial.json"),
    selectedImagePath: join(root, "selected.png"),
    selectedMetadataPath: join(root, "selected.json"),
    importedToggleImagePath: join(root, "imported-toggle.png"),
    importedToggleMetadataPath: join(root, "imported-toggle.json"),
    widgetsImagePath: join(root, "widgets.png"),
    widgetsMetadataPath: join(root, "widgets.json")
  };
  for (const [phase, imageKey, metadataKey] of [
    ["initial", "initialImagePath", "initialMetadataPath"],
    ["selected-imported-highlight", "selectedImagePath", "selectedMetadataPath"],
    ["imported-toggle", "importedToggleImagePath", "importedToggleMetadataPath"],
    ["widgets", "widgetsImagePath", "widgetsMetadataPath"]
  ]) {
    await writeMarkdownSnapshotFiles({
      imagePath: paths[imageKey],
      metadataPath: paths[metadataKey],
      phase,
      viewportName
    });
  }
  return {
    root,
    paths,
    entry: markdownPreviewContractEntry(viewportName, paths)
  };
}

function embeddedViewContractEntry(viewportName, { imagePath, metadataPath }) {
  const columnOrder = ["Name", "Notes", "Score"];
  const pagination = {
    defaultShown: 20,
    configuredShown: 50,
    loadMoreShown: 100,
    totalRows: 120,
    persistedPageSize: 50,
    loadMoreAffordance: {
      buttonText: "Load 50 more",
      iconText: "+",
      rowCountText: "100 of 120 rows",
      horizontalGap: 16,
      buttonMetrics: {
        tagName: "button",
        type: "button",
        display: "inline-flex",
        alignItems: "center",
        cursor: "pointer",
        fontWeight: "600",
        minHeight: "32px",
        borderRadius: "8px",
        borderTopWidth: "1px"
      },
      hoverMetrics: {
        backgroundColor: "rgb(247, 246, 243)",
        borderColor: "rgb(215, 205, 188)",
        color: "rgb(55, 53, 47)"
      }
    }
  };
  return {
    viewport: viewportName,
    embeddedViews: 1,
    rowsPerDatabase: 120,
    renderMs: 120,
    rendered: 1,
    columnOrder,
    headerActions: {
      title: "Embedded DB 1",
      subtitle: "All · Table",
      actionCount: 3,
      openButton: { text: "Open", width: 54, height: 32 },
      refreshButton: { ariaLabel: "Refresh", title: "Refresh", width: 32, height: 32 },
      settingsButton: { ariaLabel: "View settings", title: "View settings", width: 32, height: 32 },
      settingsFocused: true,
      refreshAfter: { disabled: false, ariaLabel: "Refresh", title: "Refresh" },
      settingsMenu: {
        rootAriaLabel: "Database settings",
        rootHasViewSettings: true,
        viewAriaLabel: "View settings menu",
        viewHasLayout: true
      },
      settingsDialog: { ariaLabel: "View settings", hasRowsPerPage: true },
      openResult: { hasStandaloneDatabase: true, textIncludesTitle: true },
      buttons: [
        { text: "Open", ariaLabel: "", title: "", type: "button", visible: true, width: 54, height: 32 },
        { text: "", ariaLabel: "Refresh", title: "Refresh", type: "button", visible: true, width: 32, height: 32 },
        { text: "", ariaLabel: "View settings", title: "View settings", type: "button", visible: true, width: 32, height: 32 }
      ]
    },
    pagination,
    visualSnapshot: {
      imagePath,
      metadataPath,
      height: 620,
      width: 940,
      completeSurfaceState: embeddedCompleteSurfaceState(viewportName)
    }
  };
}

function embeddedCompleteSurfaceState(viewportName) {
  const viewport = {
    width: viewportName === "wide" ? 1728 : viewportName === "desktop" ? 1440 : 1040,
    height: viewportName === "wide" ? 1100 : viewportName === "desktop" ? 1000 : 820
  };
  return {
    surfaceRect: embeddedRect(120, 100, 712, 565),
    headerRect: embeddedRect(120, 100, 712, 44),
    titleRect: embeddedRect(120, 100, 376, 25),
    subtitleRect: embeddedRect(120, 127, 376, 16),
    openRect: embeddedRect(504, 106, 55, 30),
    refreshRect: embeddedRect(562, 107, 28, 28),
    settingsRect: embeddedRect(594, 107, 28, 28),
    tabsRect: embeddedRect(120, 144, 712, 40),
    stickyHeaderRect: embeddedRect(120, 205, 712, 44),
    bodyRect: embeddedRect(120, 249, 712, 335),
    summaryRect: embeddedRect(120, 584, 712, 43),
    footerRect: embeddedRect(120, 627, 712, 38),
    loadMoreRect: embeddedRect(120, 635, 126, 30),
    rowCountRect: embeddedRect(256, 642, 91, 17),
    firstRowRect: embeddedRect(120, 249, 712, 41),
    lastRowRect: embeddedRect(120, 542, 712, 42),
    firstRowText: "Row 0 Open Embedded row 0",
    lastRowText: "Row 7 Open Embedded row 7",
    renderedDataRowCount: 8,
    virtualSpacerCount: 0,
    titleText: "Embedded DB 1",
    subtitleText: "All · Table",
    loadMoreText: "+ Load 50 more",
    rowCountText: "100 of 120 rows",
    surfaceVisibility: "visible",
    surfaceOpacity: 1,
    headerVisibility: "visible",
    headerOpacity: 1,
    footerVisibility: "visible",
    footerOpacity: 1,
    viewport,
    documentHorizontalOverflow: 0
  };
}

function embeddedRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

function searchContractPhases() {
  return [
    "typed",
    "default-command-palette",
    "recent",
    "tag-default",
    "builtin-open-pages",
    "builtin-open-databases"
  ];
}

async function writeSettingsCenterSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} settings center screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `settings-center-${viewportName}`,
    viewport: {
      name: viewportName,
      width: viewportName === "desktop" ? 1440 : viewportName === "wide" ? 1728 : 1040,
      height: viewportName === "desktop" ? 1000 : viewportName === "wide" ? 1100 : 820
    },
    rect: { top: 72, right: 1180, bottom: 760, left: 280, width: 900, height: 688 },
    image: imagePath,
    metadata: {
      initial: entry.initial,
      importSection: entry.importSection,
      pluginsSection: entry.pluginsSection,
      searchAiDeepLink: entry.searchAiDeepLink,
      searchJump: entry.searchJump,
      snapshotState: entry.snapshotState,
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
  const expectedPath = imagePath.replace(/\.png$/, ".expected.png");
  const diffPath = imagePath.replace(/\.png$/, ".diff.png");
  const diffMetadataPath = imagePath.replace(/\.png$/, ".diff.json");
  const policyPath = imagePath.replace(/\.png$/, ".policy.json");
  await Promise.all([
    writeFile(expectedPath, "fake committed settings center baseline", "utf8"),
    writeFile(diffPath, "fake zero-pixel settings center diff", "utf8"),
    writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
    writeFile(diffMetadataPath, JSON.stringify({
      kind: "lotion-png-visual-diff",
      status: "passed",
      actualPath: imagePath,
      expectedPath
    }), "utf8")
  ]);
  entry.perceptualBaseline = {
    kind: "lotion-png-visual-diff",
    status: "passed",
    actualPath: imagePath,
    expectedPath,
    diffPath,
    metadataPath: diffMetadataPath,
    policyPath,
    dimensionsMatch: true,
    diffPixels: 0,
    diffRatio: 0,
    threshold: 0.1,
    includeAA: false,
    maxDiffPixels: 0,
    maxDiffRatio: 0,
    policy: {
      surface: "settings-center",
      viewport: { name: viewportName },
      imageSha256: "c".repeat(64),
      verifiedAt: "2026-07-22",
      sourceTask: "tasks/done/settings-center-committed-perceptual-baselines.md"
    }
  };
}

function settingsCenterContractEntry(viewportName, snapshotPaths) {
  return {
    viewport: viewportName,
    initial: {
      activeText: "General Workspace behavior",
      categories: requiredSettingsCenterCategories()
    },
    searchJump: {
      paneText: "Git Sync / Backup Remote repository URL GitHub Backup"
    },
    searchAiDeepLink: {
      advancedTabClick: {
        ariaSelectedAfter: "true",
        disabled: false,
        height: 30,
        width: 82
      },
      pluginHosts: 2
    },
    importSection: {
      sectionName: "Import",
      paneText: "Latest import report Audit imported workspace"
    },
    pluginsSection: {
      sectionName: "Plugins",
      paneText: "Installed plugins Open plugin manager"
    },
    snapshotState: {
      activeTab: "PluginsExtensions",
      activeTabAriaSelected: "true",
      activeTabStyle: {
        backgroundColor: "rgb(232, 237, 248)",
        borderColor: "rgb(80, 103, 165)",
        color: "rgb(32, 34, 31)"
      },
      focusedInside: false,
      lastPluginRowWithinCenter: true,
      navigationScrollTop: 0,
      paneScrollTop: 0,
      paneVisible: true,
      pluginRowCount: 7,
      visiblePluginRowCount: 7
    },
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 688,
      width: 900
    }
  };
}

async function writeDesignSystemSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} design-system screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `design-system-${viewportName}`,
    viewport: { name: viewportName, ...designSystemViewport(viewportName) },
    rect: { top: 80, right: 1200, bottom: 760, left: 120, width: 1080, height: 680 },
    image: imagePath,
    metadata: {
      controlState: entry.controlState,
      layoutState: entry.layoutState,
      phase: "design-system",
      themeState: entry.themeState,
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
  if (["desktop", "compact", "wide"].includes(viewportName)) {
    const expectedPath = imagePath.replace(/\.png$/, ".expected.png");
    const diffPath = imagePath.replace(/\.png$/, ".diff.png");
    const diffMetadataPath = imagePath.replace(/\.png$/, ".diff.json");
    const policyPath = imagePath.replace(/\.png$/, ".policy.json");
    await Promise.all([
      writeFile(expectedPath, "fake committed design-system baseline", "utf8"),
      writeFile(diffPath, "fake zero-pixel design-system diff", "utf8"),
      writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
      writeFile(diffMetadataPath, JSON.stringify({
        kind: "lotion-png-visual-diff",
        status: "passed",
        actualPath: imagePath,
        expectedPath
      }), "utf8")
    ]);
    entry.perceptualBaseline = {
      kind: "lotion-png-visual-diff",
      status: "passed",
      actualPath: imagePath,
      expectedPath,
      diffPath,
      metadataPath: diffMetadataPath,
      policyPath,
      actual: { width: 1080, height: 680 },
      expected: { width: 1080, height: 680 },
      dimensionsMatch: true,
      totalPixels: 734400,
      diffPixels: 0,
      diffRatio: 0,
      threshold: 0.1,
      includeAA: false,
      maxDiffPixels: 0,
      maxDiffRatio: 0,
      policy: {
        surface: "design-system",
        viewport: {
          name: viewportName,
          width: viewportName === "desktop" ? 1440 : viewportName === "wide" ? 1728 : 1040,
          height: viewportName === "desktop" ? 1000 : viewportName === "wide" ? 1100 : 820
        },
        imageSha256: "a".repeat(64),
        verifiedAt: "2026-07-22",
        sourceTask: "tasks/done/design-system-status-pill-visibility-and-wide-baseline.md"
      }
    };
  }
}

function designSystemContractEntry(viewportName, snapshotPaths) {
  return {
    viewport: { name: viewportName, ...designSystemViewport(viewportName) },
    controlState: {
      focusState: {
        activeClass: "lotion-ui-button primary",
        activeText: "New page",
        isPrimary: true,
        outlineColor: "rgb(32, 32, 30)"
      },
      statusPills: requiredDesignSystemStatusPills(),
      statusPillGeometry: requiredDesignSystemStatusPills().map((label) => ({ label, width: 72, height: 24, top: 100, withinLab: true })),
      statusPillsLayoutValid: true
    },
    layoutState: designSystemLayoutState(viewportName),
    themeState: designSystemThemeState(),
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 680,
      width: 1080
    }
  };
}

function designSystemThemeState() {
  return {
    tokens: {
      paper: "#ffffff",
      sand: "#f7f7f4",
      vellum: "#f0f1ee",
      kraft: "#e7e9e3",
      accent: "#5067a5"
    },
    panel: {
      backgroundColor: "rgb(255, 255, 255)",
      borderColor: "rgb(230, 232, 226)",
      color: "rgb(32, 34, 31)",
      display: "block"
    },
    sourceCard: {
      backgroundColor: "rgb(255, 255, 255)",
      borderColor: "rgb(230, 232, 226)",
      color: "rgb(32, 34, 31)",
      display: "block"
    },
    primary: {
      backgroundColor: "rgb(80, 103, 165)",
      borderColor: "rgb(80, 103, 165)",
      color: "rgb(255, 255, 255)",
      display: "inline-flex"
    },
    iconButton: {
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderColor: "rgba(0, 0, 0, 0)",
      color: "rgb(116, 121, 112)",
      display: "inline-flex"
    }
  };
}

function designSystemLayoutState(viewportName) {
  const viewport = designSystemViewport(viewportName);
  const right = viewport.width - 24;
  const rect = (top, height) => ({
    bottom: top + height,
    height,
    left: 24,
    right,
    top,
    width: right - 24
  });
  return {
    rects: {
      lab: rect(80, 680),
      toolbar: rect(104, 52),
      tokenGrid: rect(176, 140),
      controlGrid: rect(336, 160),
      patternGrid: rect(516, 180),
      sourceCard: rect(716, 44)
    },
    viewport
  };
}

function designSystemViewport(viewportName) {
  if (viewportName === "desktop") return { width: 1440, height: 1000 };
  if (viewportName === "wide") return { width: 1728, height: 1100 };
  return { width: 1040, height: 820 };
}

async function writeImageLightboxSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} image-lightbox screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `image-lightbox-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
    rect: { top: 120, right: 980, bottom: 760, left: 140, width: 840, height: 640 },
    image: imagePath,
    metadata: {
      closed: false,
      controls: entry.controls,
      geometry: entry.geometry,
      imageRel: entry.imageRel,
      noHorizontalOverflow: entry.noHorizontalOverflow,
      opened: entry.opened,
      phase: "image-lightbox",
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
}

function imageLightboxContractEntry(viewportName, snapshotPaths) {
  const initialRect = { width: 180, height: 112, left: 280, right: 460, top: 220, bottom: 332 };
  const zoomedRect = { ...initialRect, width: 232, height: 144, right: 512, bottom: 364 };
  const keyboardZoomRect = { ...initialRect, width: 270, height: 168, right: 550, bottom: 388 };
  const resetRect = { ...initialRect };
  return {
    viewport: viewportName,
    closed: true,
    controls: requiredImageLightboxControls(),
    geometry: {
      initialRect,
      keyboardZoomRect,
      resetRect,
      zoomedRect
    },
    imageRel: "attachments/images/lightbox.svg",
    noHorizontalOverflow: true,
    opened: true,
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 640,
      width: 840
    }
  };
}

async function writeDatabaseCreatedViewsSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} database created views screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `database-created-views-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
    rect: { top: 180, right: 1180, bottom: 760, left: 120, width: 1060, height: 580 },
    image: imagePath,
    metadata: {
      ...entry,
      phase: "database-created-views",
      completeSurfaceState: entry.snapshot.completeSurfaceState
    }
  }, null, 2)}\n`, "utf8");
}

function databaseCreatedViewsContractEntry(viewportName, snapshotPaths) {
  return {
    viewport: viewportName,
    activeTabRect: { top: 140, right: 360, bottom: 174, left: 210, width: 150, height: 34 },
    activeTabText: "Created date desc",
    ascFirstTitle: "Oldest created row — row content",
    databaseName: "Created Views Smoke DB",
    descFirstTitle: "Newest created row — row content",
    generatedViewCountAfterReload: 2,
    generatedViewIds: ["view_created_time_asc", "view_created_time_desc"],
    keyboardActivatedTab: "Created date asc",
    noHorizontalOverflow: true,
    phase: "database-created-views",
    filterRecovery: {
      message: "Injected view persistence failure",
      popoverRemainedOpen: true,
      pendingDismissalBlocked: true,
      draftRetained: true,
      debouncedDismissalFlushed: true,
      failedStateRolledBack: true,
      duplicateSubmitSuppressed: true,
      retryCommittedExactlyOnce: true
    },
    sortRecovery: {
      message: "Injected sort persistence failure",
      popoverRemainedOpen: true,
      pendingDismissalBlocked: true,
      draftRetained: true,
      failedStateRolledBack: true,
      duplicateSubmitSuppressed: true,
      retryCommittedExactlyOnce: true
    },
    viewSettingsRecovery: {
      message: "Injected view settings persistence failure",
      dialogRemainedOpen: true,
      pendingDismissalBlocked: true,
      draftRetained: true,
      failedStateRolledBack: true,
      duplicateSubmitSuppressed: true,
      retryCommittedExactlyOnce: true
    },
    templateRecovery: {
      message: "Injected template persistence failure",
      dialogRemainedOpen: true,
      pendingDismissalBlocked: true,
      draftRetained: true,
      failedStateRolledBack: true,
      duplicateSubmitSuppressed: true,
      retryCommittedExactlyOnce: true
    },
    recoveredCaptureState: { filterCount: 0, revision: 6, sortCount: 1 },
    tableRect: { top: 180, right: 1180, bottom: 760, left: 120, width: 1060, height: 580 },
    tabsRect: { top: 126, right: 620, bottom: 176, left: 110, width: 510, height: 50 },
    visibleTabs: requiredDatabaseCreatedViewTabs(),
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 580,
      width: 1060,
      completeSurfaceState: databaseCreatedViewsCompleteSurfaceState(viewportName)
    }
  };
}

function databaseCreatedViewsCompleteSurfaceState(viewportName) {
  const viewport = viewportName === "wide"
    ? { width: 1728, height: 1100 }
    : viewportName === "desktop"
      ? { width: 1440, height: 1000 }
      : { width: 1040, height: 820 };
  const left = 248;
  const right = viewport.width;
  const width = right - left;
  const tableBottom = viewport.height - 70;
  const summaryTop = viewport.height - 70;
  const footerTop = viewport.height - 27;
  return {
    surfaceRect: createdViewsRect(left, 43, width, viewport.height - 43),
    headerRect: createdViewsRect(264, 43, width - 32, 145),
    titleRect: createdViewsRect(288, 127, 330, 34),
    subtitleRect: createdViewsRect(288, 163, 330, 15),
    openWindowRect: createdViewsRect(right - 72, 136, 32, 32),
    propertiesRect: createdViewsRect(264, 188, width - 32, 54),
    tabsRect: createdViewsRect(left, 242, width, 37),
    allTabRect: createdViewsRect(272, 242, 44, 36),
    ascTabRect: createdViewsRect(332, 242, 133, 36),
    descTabRect: createdViewsRect(481, 242, 142, 36),
    activeTabRect: createdViewsRect(481, 242, 142, 36),
    viewActionsRect: createdViewsRect(right - 245, 244, 221, 32),
    tableScrollRect: createdViewsRect(left, 279, width, tableBottom - 279),
    tableHeaderRect: createdViewsRect(left, 279, width, 53),
    firstRowRect: createdViewsRect(left, 332, width, 69),
    middleRowRect: createdViewsRect(left, 401, width, 69),
    lastRowRect: createdViewsRect(left, 470, width, 69),
    summaryRect: createdViewsRect(left, summaryTop, width, 43),
    footerRect: createdViewsRect(left, footerTop, width, 27),
    rowCountRect: createdViewsRect(right - 174, footerTop + 7, 156, 14),
    titleText: "Created Views Smoke DB",
    subtitleText: "4 fields · 3 rows",
    visibleTabTexts: requiredDatabaseCreatedViewTabs(),
    activeTabText: "Created date desc",
    rowTexts: [
      "Newest created row Open December 31, 2025 Newest row notes",
      "Middle created row Open December 31, 2024 Middle row notes",
      "Oldest created row Open December 31, 2023 Oldest row notes"
    ],
    rowCountText: "3 of 3 rows · loaded in 0 ms",
    renderedDataRowCount: 3,
    filterPopoverCount: 0,
    errorStatusCount: 0,
    surfaceVisibility: "visible",
    surfaceOpacity: 1,
    headerVisibility: "visible",
    headerOpacity: 1,
    tabsVisibility: "visible",
    tabsOpacity: 1,
    tableVisibility: "visible",
    tableOpacity: 1,
    footerVisibility: "visible",
    footerOpacity: 1,
    viewport,
    documentHorizontalOverflow: 0
  };
}

function createdViewsRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

function databaseInteractionCompleteSurfaceState(viewportName, phase) {
  const viewport = viewportName === "wide"
    ? { width: 1728, height: 1100 }
    : viewportName === "compact"
      ? { width: 1040, height: 820 }
      : { width: 1440, height: 1000 };
  const surfaceRect = interactionRect(100, 300, 800, 300);
  const controls = phase === "settings-scope-menu"
    ? {
      header: interactionRect(100, 300, 800, 50),
      viewSettings: interactionRect(110, 360, 780, 44),
      databaseSettings: interactionRect(110, 410, 780, 44)
    }
    : phase === "filter-menu"
      ? {
        header: interactionRect(110, 310, 780, 40),
        empty: interactionRect(120, 355, 300, 24),
        rootGroup: interactionRect(110, 385, 780, 190),
        conjunction: interactionRect(160, 400, 100, 30),
        addCondition: interactionRect(130, 530, 120, 30),
        addGroup: interactionRect(270, 530, 100, 30)
      }
      : {
        header: interactionRect(110, 310, 780, 40),
        priority: interactionRect(120, 355, 160, 28),
        rule: interactionRect(110, 390, 780, 70),
        property: interactionRect(190, 405, 260, 32),
        direction: interactionRect(470, 405, 260, 32),
        addSort: interactionRect(120, 480, 120, 30),
        clearAll: interactionRect(790, 315, 90, 28)
      };
  return {
    phase,
    surfaceRect,
    surfaceVisibility: "visible",
    surfaceOpacity: 1,
    runningAnimationCount: 0,
    controlRects: controls,
    controlTexts: Object.fromEntries(Object.keys(controls).map((key) => [key, key])),
    tableRect: interactionRect(248, 43, viewport.width - 248, viewport.height - 43),
    activeTabRect: interactionRect(272, 242, 72, 36),
    activeTabText: "Default",
    viewport,
    documentHorizontalOverflow: 0
  };
}

function interactionRect(left, top, width, height) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

async function writePageBacklinksSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} page backlinks screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `page-backlinks-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
    rect: entry.panelRect,
    image: imagePath,
    metadata: {
      ...entry,
      phase: "page-backlinks"
    }
  }, null, 2)}\n`, "utf8");
}

function pageBacklinksContractEntry(viewportName, snapshotPaths) {
  const rendered = {
    count: "2",
    items: [
      {
        ariaLabel: "Open Page backlink Backlink Source Page",
        tagName: "BUTTON",
        tabIndex: 0,
        disabled: false,
        sourceTitle: "Backlink Source Page",
        sourceType: "Page",
        sourcePath: "Smoke",
        context: "Body · L5",
        excerpt: "See Backlink Target Page."
      },
      {
        ariaLabel: "Open Database row backlink Property Source Row",
        tagName: "BUTTON",
        tabIndex: 0,
        disabled: false,
        sourceTitle: "Property Source Row",
        sourceType: "Database row",
        sourcePath: "Smoke / Property Sources",
        context: "Property Sources · Related Page",
        excerpt: "Backlink Target Page"
      }
    ]
  };
  return {
    viewport: viewportName,
    noHorizontalOverflow: true,
    externalRefresh: {
      removedWithoutNavigation: true,
      restoredWithoutNavigation: true,
      removedCount: 1,
      restoredCount: 2
    },
    opened: {
      activation: "keyboard-enter",
      ariaLabel: "Open Page backlink Backlink Source Page",
      titleInput: "Backlink Source Page"
    },
    openedPropertyRow: {
      activation: "keyboard-enter",
      ariaLabel: "Open Database row backlink Property Source Row",
      titleInput: "Property Source Row"
    },
    panelRect: { top: 300, right: 920, bottom: 520, left: 260, width: 660, height: 220 },
    phase: "page-backlinks",
    rendered,
    repeatedPageOpens: pageBacklinksLatencyEvidence(),
    seededPageOpens: {
      ...pageBacklinksLatencyEvidence(),
      count: 100,
      p50: 40,
      p95: 70,
      max: 90,
      slowest: { title: "Backlink Target Page", openMs: 90, backlinkMs: 12, backlinkCount: 2 },
      manualSlowFixtureTitle: "[SP][总][重要] 自己创业"
    },
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 220,
      width: 660
    }
  };
}

function pageBacklinksLatencyEvidence() {
  return {
    thresholdMs: 2500,
    backlinkThresholdMs: 250,
    timings: [
      { title: "Backlink Source Page", openMs: 40, backlinkMs: 8, backlinkCount: 0 },
      { title: "Backlink Light Page", openMs: 35, backlinkMs: 5, backlinkCount: 0 },
      { title: "Backlink Target Page", openMs: 42, backlinkMs: 12, backlinkCount: 2 },
      { title: "Backlink Stress Source 1", openMs: 50, backlinkMs: 10, backlinkCount: 0 }
    ]
  };
}

async function writePageSecondarySnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} page secondary screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `page-secondary-${viewportName}`,
    viewport: pageSecondaryViewport(viewportName),
    rect: { top: 96, right: 1180, bottom: 520, left: 900, width: 280, height: 424 },
    image: imagePath,
    metadata: {
      collapsed: entry.collapsed,
      expanded: entry.expanded,
      expectedBacklinks: 5,
      expectedTocItems: 4,
      history: entry.history,
      historyPreview: entry.historyPreview,
      phase: "page-history-restore-preview"
    }
  }, null, 2)}\n`, "utf8");
  await writeFile(entry.toc.snapshot.imagePath, `fake ${viewportName} floating toc screenshot`, "utf8");
  await writeFile(entry.toc.snapshot.metadataPath, `${JSON.stringify({
    name: `floating-toc-navigation-${viewportName}`,
    viewport: pageSecondaryViewport(viewportName),
    rect: { top: 0, right: 1280, bottom: 900, left: 0, width: 1280, height: 900 },
    image: entry.toc.snapshot.imagePath,
    metadata: {
      itemTexts: entry.toc.expanded.itemTexts,
      layout: entry.toc.layout,
      navigation: entry.toc.navigation,
      phase: "floating-toc-navigation"
    }
  }, null, 2)}\n`, "utf8");
  await writeFile(entry.toc.collapsedSnapshot.imagePath, `fake ${viewportName} auto-hidden toc screenshot`, "utf8");
  await writeFile(entry.toc.collapsedSnapshot.metadataPath, `${JSON.stringify({
    name: `floating-toc-auto-hidden-${viewportName}`,
    viewport: pageSecondaryViewport(viewportName),
    rect: { top: 0, right: 1280, bottom: 900, left: 0, width: 1280, height: 900 },
    image: entry.toc.collapsedSnapshot.imagePath,
    metadata: {
      autoHidden: entry.toc.autoHidden,
      hoverExpanded: entry.toc.hoverExpanded,
      keyboardAfterPointer: entry.toc.keyboardAfterPointer,
      pointerNavigation: entry.toc.pointerNavigation,
      phase: "floating-toc-auto-hidden"
    }
  }, null, 2)}\n`, "utf8");
}

function pageSecondaryContractEntry(viewportName, snapshotPaths) {
  const tocImagePath = snapshotPaths.imagePath.replace(/\.png$/, "-toc.png");
  const tocMetadataPath = snapshotPaths.metadataPath.replace(/\.json$/, "-toc.json");
  const tocCollapsedImagePath = snapshotPaths.imagePath.replace(/\.png$/, "-toc-collapsed.png");
  const tocCollapsedMetadataPath = snapshotPaths.metadataPath.replace(/\.json$/, "-toc-collapsed.json");
  const viewport = pageSecondaryViewport(viewportName);
  const contentRect = {
    left: viewportName === "compact" ? 72 : 300,
    right: viewportName === "compact" ? viewport.width - 24 : 1060,
    width: viewportName === "compact" ? viewport.width - 96 : 760
  };
  const itemTexts = ["Page Secondary Target", "Overview", "Deep Work", "Nested Insight", "Final Section", "Work reflectionJump"];
  const collapsedTocState = {
    activeIsTocItem: false,
    activeIsToggle: false,
    contentRect,
    focusedWithin: false,
    hostClass: "cm-md-floating-toc-host cm-md-toc-collapsed",
    hostRect: {
      top: 96,
      right: viewport.width - 12,
      bottom: viewport.height - 32,
      left: viewport.width - 44,
      width: 32,
      height: viewport.height - 128
    },
    hostBackgroundAlpha: 0,
    hostOpacity: "0.34",
    hovered: false,
    itemTexts,
    navDisplay: "none",
    railMarkers: 6,
    toggleExpanded: "false"
  };
  const expandedTocState = {
    ...structuredClone(collapsedTocState),
    hostClass: "cm-md-floating-toc-host cm-md-toc-expanded",
    hostBackgroundAlpha: 0.9,
    hostOpacity: "1",
    hostRect: {
      ...collapsedTocState.hostRect,
      left: viewport.width - (viewportName === "compact" ? 232 : 252),
      width: viewportName === "compact" ? 220 : 240
    },
    navDisplay: "block",
    toggleExpanded: "true"
  };
  return {
    viewport: viewportName,
    collapsed: {
      panelRect: { top: 96, right: 1240, bottom: 760, left: 1200, width: 40, height: 664 },
      state: {
        className: "page-secondary-panel collapsed",
        contentHeight: 0,
        contentVisibility: "hidden",
        expanded: "false"
      }
    },
    editor: {
      marker: `Secondary panel typing ${viewportName}`,
      persisted: true
    },
    expanded: {
      backlinkItems: 5,
      className: "page-secondary-panel expanded",
      contentHeight: 360,
      contentVisibility: "visible",
      expanded: "true",
      sourceLinkMounted: true
    },
    noHorizontalOverflow: true,
    coverOffsetRecovery: {
      message: "Injected cover position persistence failure",
      failedValueRolledBack: true,
      retainedDraft: true,
      competingControlsBlocked: true,
      duplicateRetrySuppressed: true,
      retryPersistedExactInput: true,
      discardPreservedStoredValue: true,
      discardResetDraft: true,
      discardedDraftDiffered: true,
      baselineCoverCleared: true,
      baselineOffset: 50,
      baselineStateRestored: true
    },
    pagePropertyRecovery: {
      message: "Injected page property persistence failure",
      failedValueRolledBack: true,
      draftRetained: true,
      competingControlsBlocked: true,
      duplicateRetrySuppressed: true,
      retryPersistedExactInput: true,
      discardPreservedStoredValue: true,
      discardResetDraft: true,
      baselineStateRestored: true
    },
    pageTitleRecovery: {
      message: "Injected page title persistence failure",
      failedMetadataRolledBack: true,
      failedMarkdownRolledBack: true,
      draftRetained: true,
      competingControlsBlocked: true,
      duplicateRetrySuppressed: true,
      retryPersistedExactInput: true,
      discardPreservedStoredTitle: true,
      discardResetDraft: true,
      baselineStateRestored: true
    },
    history: pageHistoryContractState(viewportName),
    historyPreview: {
      status: "Ready",
      versionCount: 2,
      selectedVersionCount: 1,
      previewLabel: `Page snapshot · Page Secondary Target ${viewportName}`,
      restoreButtonText: "Restore",
      diffLineCount: 20,
      storageLeakMatches: []
    },
    restore: {
      confirmation: `Restore Page Secondary Target ${viewportName} from Jun 11, 2026, 5:00 AM?`,
      message: "Page restored from local Git history.",
      previewCleared: true,
      restoredMarker: `Historical page detail ${viewportName}`,
      persisted: true
    },
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 424,
      width: 280
    },
    toc: {
      autoHidden: structuredClone(collapsedTocState),
      collapsed: structuredClone(collapsedTocState),
      collapsedSnapshot: {
        imagePath: tocCollapsedImagePath,
        metadataPath: tocCollapsedMetadataPath,
        height: pageSecondaryViewport(viewportName).height,
        width: pageSecondaryViewport(viewportName).width
      },
      escaped: structuredClone(collapsedTocState),
      expanded: structuredClone(expandedTocState),
      focusExpanded: {
        ...structuredClone(expandedTocState),
        activeIsToggle: true,
        focusedWithin: true
      },
      hoverExpanded: {
        ...structuredClone(expandedTocState),
        hovered: true
      },
      keyboardAfterPointer: {
        ...structuredClone(expandedTocState),
        activeIsTocItem: true,
        focusedWithin: true,
        hovered: false
      },
      pointerNavigation: {
        ...structuredClone(expandedTocState),
        activeIsTocItem: true,
        focusedWithin: true,
        hovered: true
      },
      navigation: {
        activeClass: "cm-md-toc-item",
        activeInEditor: false,
        activeIsTocItem: true,
        headingText: "Nested Insight",
        headingIsActiveLine: false
      },
      layout: {
        viewportWidth: viewport.width,
        contentRect,
        hostPosition: "fixed",
        layoutStable: true,
        overlapsContent: true,
        backgroundColor: "rgb(255, 255, 255)",
        hostOpacity: "1",
        navOverflowY: "auto",
        navScrollHeight: 600,
        navClientHeight: 420
      },
      snapshot: {
        imagePath: tocImagePath,
        metadataPath: tocMetadataPath,
        height: pageSecondaryViewport(viewportName).height,
        width: pageSecondaryViewport(viewportName).width
      }
    }
  };
}

function pageHistoryContractState(viewportName) {
  return {
    panel: { top: 200, right: 900, bottom: 680, left: 188, width: 712, height: 480 },
    statusRect: { top: 206, right: 898, bottom: 224, left: 850, width: 48, height: 18 },
    previewRect: { top: 378, right: 900, bottom: 670, left: 188, width: 712, height: 292 },
    previewLabelRect: { top: 390, right: 520, bottom: 403, left: 197, width: 323, height: 13 },
    restoreButtonRect: { top: 385, right: 891, bottom: 411, left: 829, width: 62, height: 26 },
    versionRects: [{
      label: "Current page details",
      rect: { top: 290, right: 900, bottom: 330, left: 188, width: 712, height: 40 },
      selected: false
    }, {
      label: "Historical page details",
      rect: { top: 333, right: 900, bottom: 373, left: 188, width: 712, height: 40 },
      selected: true
    }],
    status: "Ready",
    message: "2 local Git versions found.",
    versionCount: 2,
    selectedVersionCount: 1,
    previewLabel: `Page snapshot · Page Secondary Target ${viewportName}`,
    restoreButtonText: "Restore",
    diffLineCount: 20,
    addedLineCount: 1,
    removedLineCount: 1,
    backlinkExcerpts: Array.from({ length: 5 }, (_unused, index) =>
      `Backlink source ${index + 1} links to Page Secondary Target ${viewportName}.`
    ),
    storageLeakMatches: [],
    statusInsidePanel: true,
    versionsInsidePanel: true,
    previewInsidePanel: true,
    previewLabelInsidePreview: true,
    restoreInsidePreview: true,
    horizontalOverflow: 0,
    secondaryExpanded: true,
    contentVisibility: "visible",
    contentOpacity: "1"
  };
}

function pageSecondaryViewport(viewportName) {
  if (viewportName === "compact") return { name: viewportName, width: 1040, height: 820 };
  if (viewportName === "laptop") return { name: viewportName, width: 1280, height: 900 };
  return { name: viewportName, width: 1440, height: 1000 };
}

async function writePluginManagerSnapshotFiles({ entry, imagePath, metadataPath, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} plugin manager screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `plugin-manager-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 80, right: 1220, bottom: 760, left: 280, width: 940, height: 680 },
    image: imagePath,
    metadata: {
      commandSearch: entry.commandSearch,
      details: entry.details,
      extensionPointTitles: entry.extensionPointTitles,
      listedPlugins: entry.listedPlugins,
      permissionSummary: entry.permissionSummary,
      providerSourceDrilldown: entry.providerSourceDrilldown,
      lifecycle: entry.lifecycle,
      snapshotState: entry.snapshotState,
      sourceDrilldown: entry.sourceDrilldown,
      summary: entry.summary,
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
  const expectedPath = imagePath.replace(/\.png$/, ".expected.png");
  const diffPath = imagePath.replace(/\.png$/, ".diff.png");
  const diffMetadataPath = imagePath.replace(/\.png$/, ".diff.json");
  const policyPath = imagePath.replace(/\.png$/, ".policy.json");
  await Promise.all([
    writeFile(expectedPath, "fake committed plugin manager baseline", "utf8"),
    writeFile(diffPath, "fake zero-pixel plugin manager diff", "utf8"),
    writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
    writeFile(diffMetadataPath, JSON.stringify({
      kind: "lotion-png-visual-diff",
      status: "passed",
      actualPath: imagePath,
      expectedPath
    }), "utf8")
  ]);
  entry.perceptualBaseline = {
    kind: "lotion-png-visual-diff",
    status: "passed",
    actualPath: imagePath,
    expectedPath,
    diffPath,
    metadataPath: diffMetadataPath,
    policyPath,
    dimensionsMatch: true,
    diffPixels: 0,
    diffRatio: 0,
    threshold: 0.1,
    includeAA: false,
    maxDiffPixels: 0,
    maxDiffRatio: 0,
    policy: {
      surface: "plugin-manager",
      viewport: { name: viewportName },
      imageSha256: "d".repeat(64),
      verifiedAt: "2026-07-22",
      sourceTask: "tasks/done/plugin-manager-complete-surface-committed-perceptual-baselines.md"
    }
  };
}

function pluginManagerContractEntry(viewportName, snapshotPaths) {
  const listedPlugins = requiredPluginManagerPlugins();
  return {
    viewport: viewportName,
    summary: {
      pluginRows: listedPlugins.length,
      providerRows: 14,
      settingsHosts: 0
    },
    listedPlugins,
    permissionSummary: {
      "Notion Import": ["workspace.read", "workspace.write", "vault.fs"],
      "Git Sync": ["workspace.write", "network", "shell"]
    },
    extensionPointTitles: ["Open Notion Import", "Backup Now"],
    sourceDrilldown: {
      sourceText: "Notion Import · Open Notion Import"
    },
    providerSourceDrilldown: {
      sourceText: "Default Field Types · field providers"
    },
    details: [
      { name: "Notion Import", initialSettingsHosts: 0, settingsHosts: 1 },
      { name: "LLM Providers", initialSettingsHosts: 0, settingsHosts: 1 },
      { name: "Git Sync", initialSettingsHosts: 0, settingsHosts: 1 }
    ],
    lifecycle: {
      disabledStatus: "disabled",
      enabledStatus: "active",
      providerRemovedOnDisable: true,
      requiredControl: "Default Field Types"
    },
    commandSearch: {
      query: "Open Notion Import",
      filter: {
        filterText: "命令 3",
        filterCountText: "3",
        resultCount: 3
      },
      click: {
        activation: "click",
        renderedText: "Open Notion Import 命令",
        modalTitle: "Import from Notion"
      },
      enter: {
        activation: "enter",
        renderedText: "Open Notion Import 命令",
        modalTitle: "Import from Notion"
      }
    },
    notification: {
      text: "Plugin notify smoke",
      renderedText: "Plugin notify smoke"
    },
    snapshotState: {
      allPluginRowsWithinManager: true,
      allProviderRowsWithinManager: true,
      lastSectionWithinManager: true,
      managementScrollTop: 0,
      managerHeight: viewportName === "compact" ? 2598 : 2284,
      pluginRowCount: 7,
      providerRowCount: 14,
      summaryWithinManager: true
    },
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 680,
      width: 940
    }
  };
}

function sidebarSettingsContractEntry(viewportName, { imagePath, metadataPath }) {
  return {
    viewport: viewportName,
    initial: {
      choices: {
        pagesPressed: "true",
        databasesPressed: "true",
        pagesDisabled: true,
        databasesDisabled: true
      },
      settingsOrder: ["Pages", "Databases"],
      sectionOrder: ["Pages", "Databases"]
    },
    reordered: ["Databases", "Pages"],
    reset: ["Pages", "Databases"],
    shortcuts: {
      defaultChord: "Ctrl+Shift+F",
      ordinaryValue: "f",
      customChord: "Alt+Shift+F"
    },
    snapshot: {
      imagePath,
      metadataPath
    }
  };
}

function searchAiContractEntry(viewportName, { imagePath, metadataPath }) {
  const search = {
    databaseName: "Knowledge Base",
    pageTitle: "Search AI Unified Home",
    query: "semantic orchard",
    rowTitle: "Semantic Orchard Row",
    rows: [
      "Search AI Unified Home Page semantic orchard",
      "Knowledge Base Database semantic orchard",
      "Semantic Orchard Row Database row semantic orchard"
    ]
  };
  return {
    viewport: viewportName,
    search,
    advanced: {
      text: "Local semantic index Open Advanced results Search & AI Settings"
    },
    chat: {
      selected: `Selected Source ${search.rowTitle} Row page · ${search.databaseName}`
    },
    visibleState: {
      activePrimaryTab: "LLM Chat",
      primaryTabs: [
        { label: "Search", fullyVisible: true },
        { label: "LLM Chat", fullyVisible: true }
      ],
      selectedSource: {
        title: search.rowTitle,
        subtitle: `Row page · ${search.databaseName}`,
        clientWidth: 806,
        scrollWidth: 806,
        fullyVisible: true,
        rect: { top: 220, right: 840, bottom: 300, left: 40, width: 800, height: 80 }
      },
      storageLeakMatches: [],
      surface: { top: 100, right: 880, bottom: 470, left: 0, width: 880, height: 370 }
    },
    snapshot: {
      imagePath,
      metadataPath
    }
  };
}

async function attachSearchAiPerceptualBaseline(snapshot, viewportName) {
  const expectedPath = snapshot.imagePath.replace(/\.png$/, ".expected.png");
  const diffPath = snapshot.imagePath.replace(/\.png$/, ".diff.png");
  const diffMetadataPath = snapshot.imagePath.replace(/\.png$/, ".diff.json");
  const policyPath = snapshot.imagePath.replace(/\.png$/, ".policy.json");
  await Promise.all([
    writeFile(expectedPath, "fake committed Search & AI chat-handoff baseline", "utf8"),
    writeFile(diffPath, "fake zero-pixel Search & AI chat-handoff diff", "utf8"),
    writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
    writeFile(diffMetadataPath, JSON.stringify({
      kind: "lotion-png-visual-diff",
      status: "passed",
      actualPath: snapshot.imagePath,
      expectedPath
    }), "utf8")
  ]);
  snapshot.perceptualBaseline = {
    kind: "lotion-png-visual-diff",
    status: "passed",
    actualPath: snapshot.imagePath,
    expectedPath,
    diffPath,
    metadataPath: diffMetadataPath,
    policyPath,
    dimensionsMatch: true,
    diffPixels: 0,
    diffRatio: 0,
    threshold: 0.1,
    includeAA: false,
    maxDiffPixels: 0,
    maxDiffRatio: 0,
    policy: {
      surface: "search-ai-chat-handoff",
      viewport: { name: viewportName },
      imageSha256: "d".repeat(64),
      verifiedAt: "2026-07-23",
      sourceTask: "tasks/done/search-ai-selected-source-identity-and-chat-handoff-baselines.md"
    }
  };
}

function whiteThemeContractEntry(viewportName, snapshotRoot) {
  const states = Object.fromEntries(requiredWhiteThemePhases().map((phase) => [phase, whiteThemeState(phase)]));
  states.page.scrollState = {
    scrollTop: {
      ".main-content": 0,
      ".page-editor": 0
    },
    floatingToc: {
      borderLeftColor: "rgba(0, 0, 0, 0)",
      collapsed: true,
      width: viewportName === "compact" ? 38 : 44
    }
  };
  return {
    viewport: viewportName,
    pageState: states.page,
    searchState: {
      ...states.search,
      focusState: {
        activeClass: "global-search-input",
        isInput: true
      }
    },
    databaseState: states.database,
    pluginState: states.plugin,
    snapshots: requiredWhiteThemePhases().map((phase) => ({
      phase,
      imagePath: join(snapshotRoot, `${phase}.png`),
      metadataPath: join(snapshotRoot, `${phase}.json`),
      state: states[phase]
    }))
  };
}

function whiteThemeState(phase) {
  return {
    tokens: {
      paper: "#ffffff",
      sand: "#f7f7f4",
      vellum: "#f0f1ee",
      kraft: "#e7e9e3",
      shell: "#f3f4f0",
      rule: "#e6e8e2",
      ruleStrong: "#d3d8cf",
      accent: "#5067a5"
    },
    surfaces: {
      [phase]: {
        selector: `.${phase}`,
        backgroundColor: "rgb(255, 255, 255)",
        borderColor: "rgb(230, 232, 226)",
        color: "rgb(32, 34, 31)",
        rect: { top: 40, right: 840, bottom: 640, left: 120, width: 720, height: 600 }
      }
    }
  };
}

async function writeWhiteThemeSnapshotFiles({ snapshot, viewportName }) {
  await writeFile(snapshot.imagePath, `fake ${viewportName} ${snapshot.phase} white-theme screenshot`, "utf8");
  await writeFile(snapshot.metadataPath, `${JSON.stringify({
    name: `white-theme-${snapshot.phase}-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 40, right: 840, bottom: 640, left: 120, width: 720, height: 600 },
    image: snapshot.imagePath,
    metadata: { phase: snapshot.phase }
  }, null, 2)}\n`, "utf8");
  if (snapshot.phase === "page" && ["desktop", "compact", "wide"].includes(viewportName)) {
    const expectedPath = snapshot.imagePath.replace(/\.png$/, ".expected.png");
    const diffPath = snapshot.imagePath.replace(/\.png$/, ".diff.png");
    const diffMetadataPath = snapshot.imagePath.replace(/\.png$/, ".diff.json");
    const policyPath = snapshot.imagePath.replace(/\.png$/, ".policy.json");
    await Promise.all([
      writeFile(expectedPath, "fake committed white-theme page baseline", "utf8"),
      writeFile(diffPath, "fake zero-pixel white-theme page diff", "utf8"),
      writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
      writeFile(diffMetadataPath, JSON.stringify({
        kind: "lotion-png-visual-diff",
        status: "passed",
        actualPath: snapshot.imagePath,
        expectedPath
      }), "utf8")
    ]);
    snapshot.perceptualBaseline = {
      kind: "lotion-png-visual-diff",
      status: "passed",
      actualPath: snapshot.imagePath,
      expectedPath,
      diffPath,
      metadataPath: diffMetadataPath,
      policyPath,
      dimensionsMatch: true,
      diffPixels: 0,
      diffRatio: 0,
      threshold: 0.1,
      includeAA: false,
      maxDiffPixels: 0,
      maxDiffRatio: 0,
      policy: {
        surface: "white-theme-page",
        viewport: { name: viewportName },
        imageSha256: "b".repeat(64),
        verifiedAt: "2026-07-22",
        sourceTask: "tasks/done/white-theme-page-committed-perceptual-baselines.md"
      }
    };
  }
}

async function advancedSearchContractEntry({ artifactRoot, viewportName }) {
  const snapshotRoot = join(artifactRoot, viewportName);
  await mkdir(snapshotRoot, { recursive: true });
  const visualSnapshots = [];
  const phaseStates = {
    "initial": advancedSearchVisibleState({
      noteText: "Qwen3 local semantic index uses Ollama on this device.",
      statusLabel: "Not built"
    }),
    "ollama-error": advancedSearchVisibleState({
      metaText: "Ollama is not reachable at http://lotion-advanced-search-unreachable.local. Run ollama pull qwen3-embedding:0.6b",
      progressPhase: "error",
      statusLabel: "Error"
    }),
    "missing-model-error": advancedSearchVisibleState({
      metaText: "Ollama model \"qwen3-embedding:0.6b\" is missing. Run ollama pull qwen3-embedding:0.6b",
      progressPhase: "error",
      statusLabel: "Error"
    }),
    "ready": advancedSearchVisibleState({
      metaText: "Indexed 5 chunks from 3 items.",
      progressPhase: "done",
      progressPercent: "100",
      providerValue: "local",
      statusLabel: "Ready"
    }),
    "stale-results": advancedSearchVisibleState({
      metaText: "Smoke fixture changed.",
      providerValue: "local",
      queryValue: "retention complaints",
      resultCount: 1,
      resultsViewport: { clientHeight: 230, scrollHeight: 230, scrollTop: 0 },
      resultVisibility: [{
        title: "Customer Feedback",
        fullyVisible: true,
        rect: { top: 520, right: 1144, bottom: 590, left: 356, width: 788, height: 70 }
      }],
      snippets: ["Retention complaints from customers and support notes."],
      sources: ["Row page"],
      statusLabel: "Stale",
      titles: ["Customer Feedback"]
    }),
    "empty": advancedSearchVisibleState({
      emptyText: "No results. Rebuild the index or try a different query.",
      providerValue: "local",
      queryValue: "zzzz-no-advanced-result",
      statusLabel: "Stale"
    }),
    "lancedb-error": advancedSearchVisibleState({
      metaText: "LanceDB vector storage requires the backend LanceDB adapter.",
      progressPhase: "error",
      providerValue: "local",
      statusLabel: "Error",
      storeValue: "lancedb"
    }),
    "external-error": advancedSearchVisibleState({
      metaText: "External embeddings require base URL, model, and API key.",
      progressPhase: "error",
      providerValue: "openai-compatible",
      statusLabel: "Error"
    })
  };

  for (const phase of requiredAdvancedSearchSnapshotPhases()) {
    const imagePath = join(snapshotRoot, `advanced-search-${phase}.png`);
    const metadataPath = join(snapshotRoot, `advanced-search-${phase}.json`);
    const visibleState = phaseStates[phase];
    await writeAdvancedSearchSnapshotFiles({ imagePath, metadataPath, phase, visibleState, viewportName });
    visualSnapshots.push({
      phase,
      imagePath,
      metadataPath,
      visibleState,
      height: 680,
      width: 860
    });
    if (phase === "stale-results") {
      await attachAdvancedSearchPerceptualBaseline(visualSnapshots.at(-1), viewportName);
    }
  }

  return {
    viewport: viewportName,
    workspaceRoot: `/tmp/lotion-advanced-search-${viewportName}`,
    visualSnapshots,
    navigation: {
      rowPage: { kind: "rowPage", openedTitle: "Customer Feedback", query: "retention complaints" },
      page: { kind: "page", openedTitle: "Research Notes", query: "Perplexity migration notes" },
      database: { kind: "database", openedTitle: "Research DB", query: "Research DB" }
    }
  };
}

function advancedSearchVisibleState(overrides = {}) {
  return {
    baseUrlValue: "http://127.0.0.1:11434",
    emptyText: "",
    metaText: "",
    modelValue: "qwen3-embedding:0.6b",
    noteText: "Qwen3 local semantic index uses Ollama on this device.",
    progressPercent: "",
    progressPhase: "",
    progressText: "",
    providerValue: "ollama",
    queryPlaceholder: "Ask semantically across pages, databases, and row pages...",
    queryValue: "",
    resultCount: 0,
    resultsViewport: { clientHeight: 180, scrollHeight: 180, scrollTop: 0 },
    resultVisibility: [],
    snippets: [],
    sources: [],
    statusLabel: "Not built",
    storeValue: "json",
    titles: [],
    ...overrides
  };
}

async function attachAdvancedSearchPerceptualBaseline(snapshot, viewportName) {
  const expectedPath = snapshot.imagePath.replace(/\.png$/, ".expected.png");
  const diffPath = snapshot.imagePath.replace(/\.png$/, ".diff.png");
  const diffMetadataPath = snapshot.imagePath.replace(/\.png$/, ".diff.json");
  const policyPath = snapshot.imagePath.replace(/\.png$/, ".policy.json");
  await Promise.all([
    writeFile(expectedPath, "fake committed Advanced Search stale-result baseline", "utf8"),
    writeFile(diffPath, "fake zero-pixel Advanced Search stale-result diff", "utf8"),
    writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
    writeFile(diffMetadataPath, JSON.stringify({
      kind: "lotion-png-visual-diff",
      status: "passed",
      actualPath: snapshot.imagePath,
      expectedPath
    }), "utf8")
  ]);
  snapshot.perceptualBaseline = {
    kind: "lotion-png-visual-diff",
    status: "passed",
    actualPath: snapshot.imagePath,
    expectedPath,
    diffPath,
    metadataPath: diffMetadataPath,
    policyPath,
    dimensionsMatch: true,
    diffPixels: 0,
    diffRatio: 0,
    threshold: 0.1,
    includeAA: false,
    maxDiffPixels: 0,
    maxDiffRatio: 0,
    policy: {
      surface: "advanced-search-stale-results",
      viewport: { name: viewportName },
      imageSha256: "c".repeat(64),
      verifiedAt: "2026-07-23",
      sourceTask: "tasks/done/advanced-search-compact-result-visibility-and-stale-result-baselines.md"
    }
  };
}

async function writeAdvancedSearchSnapshotFiles({ imagePath, metadataPath, phase, visibleState, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} ${phase} Advanced Search screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `advanced-search-${phase}-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 88, right: 1180, bottom: 768, left: 320, width: 860, height: 680 },
    image: imagePath,
    metadata: {
      geometry: advancedSearchGeometry(),
      phase,
      visibleState,
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
}

function advancedSearchGeometry() {
  return {
    panel: { top: 88, right: 1180, bottom: 768, left: 320, width: 860, height: 680 },
    controls: { top: 180, right: 1160, bottom: 270, left: 340, width: 820, height: 90 },
    progress: { top: 300, right: 1160, bottom: 380, left: 340, width: 820, height: 80 },
    query: { top: 410, right: 1160, bottom: 452, left: 340, width: 820, height: 42 },
    meta: { top: 462, right: 1160, bottom: 492, left: 340, width: 820, height: 30 },
    results: { top: 506, right: 1160, bottom: 748, left: 340, width: 820, height: 242 },
    firstHit: { top: 520, right: 1144, bottom: 590, left: 356, width: 788, height: 70 }
  };
}

async function llmChatContractEntry({ artifactRoot, viewportName }) {
  const snapshotRoot = join(artifactRoot, viewportName);
  await mkdir(snapshotRoot, { recursive: true });
  const makeSnapshot = async (phase, visibleState, extraMetadata = {}) => {
    const imagePath = join(snapshotRoot, `llm-chat-${phase}.png`);
    const metadataPath = join(snapshotRoot, `llm-chat-${phase}.json`);
    const normalizedVisibleState = {
      ...visibleState,
      transcriptViewport: visibleState.transcriptViewport || {
        clientHeight: 290,
        scrollHeight: 290,
        scrollTop: 0
      },
      messages: (visibleState.messages || []).map((message, index) => ({
        ...message,
        fullyVisible: true,
        rect: {
          top: 380 + index * 74,
          right: 1020,
          bottom: 440 + index * 74,
          left: 620,
          width: 400,
          height: 60
        }
      }))
    };
    await writeLLMChatSnapshotFiles({
      extraMetadata,
      imagePath,
      metadataPath,
      phase,
      visibleState: normalizedVisibleState,
      viewportName
    });
    const snapshot = {
      phase,
      imagePath,
      metadataPath,
      height: 720,
      width: 440,
      visibleState: normalizedVisibleState
    };
    if (phase === "conversation") {
      const expectedPath = imagePath.replace(/\.png$/, ".expected.png");
      const diffPath = imagePath.replace(/\.png$/, ".diff.png");
      const diffMetadataPath = imagePath.replace(/\.png$/, ".diff.json");
      const policyPath = imagePath.replace(/\.png$/, ".policy.json");
      await Promise.all([
        writeFile(expectedPath, "fake committed LLM Chat conversation baseline", "utf8"),
        writeFile(diffPath, "fake zero-pixel LLM Chat conversation diff", "utf8"),
        writeFile(policyPath, JSON.stringify({ kind: "lotion-production-visual-baseline-policy" }), "utf8"),
        writeFile(diffMetadataPath, JSON.stringify({
          kind: "lotion-png-visual-diff",
          status: "passed",
          actualPath: imagePath,
          expectedPath
        }), "utf8")
      ]);
      snapshot.perceptualBaseline = {
        kind: "lotion-png-visual-diff",
        status: "passed",
        actualPath: imagePath,
        expectedPath,
        diffPath,
        metadataPath: diffMetadataPath,
        policyPath,
        dimensionsMatch: true,
        diffPixels: 0,
        diffRatio: 0,
        threshold: 0.1,
        includeAA: false,
        maxDiffPixels: 0,
        maxDiffRatio: 0,
        policy: {
          surface: "llm-chat-conversation",
          viewport: { name: viewportName },
          imageSha256: "e".repeat(64),
          verifiedAt: "2026-07-23",
          sourceTask: "tasks/done/llm-chat-compact-transcript-visibility-and-conversation-baselines.md"
        }
      };
    }
    return snapshot;
  };

  const emptySnapshot = await makeSnapshot("empty", {
    providerValue: "openai",
    modelValue: "gpt-5-mini",
    permissionText: "Ask before editing",
    statusText: "Ask a question or request a workspace action.",
    historyItems: 0,
    messages: []
  }, {
    statusText: "Ask a question or request a workspace action.",
    providerValue: "openai",
    modelValue: "gpt-5-mini",
    permissionText: "Ask before editing"
  });
  const selectionSnapshot = await makeSnapshot("selection-command", {
    providerValue: "openai",
    modelValue: "gpt-5-mini",
    permissionText: "Ask before editing",
    statusText: "Ready.",
    historyItems: 1,
    messages: [
      { label: "You", content: "Help me work with this selected text:\n\nSmoke workspace for LLM Chat UI coverage." },
      { label: "LLM", content: "Smoke response for: Smoke workspace for LLM Chat UI coverage." }
    ]
  }, {
    selectedText: "Smoke workspace for LLM Chat UI coverage."
  });
  const conversationSnapshot = await makeSnapshot("conversation", {
    providerValue: "openai",
    modelValue: "gpt-5",
    permissionText: "Ask before editing",
    statusText: "Ready.",
    historyItems: 2,
    messages: [
      { label: "You", content: "Summarize this smoke page." },
      { label: "LLM", content: "Smoke response for: Summarize this smoke page." }
    ]
  }, {
    prompt: "Summarize this smoke page.",
    assistantText: "Smoke response for: Summarize this smoke page.",
    requestCount: 1
  });
  const errorSnapshot = await makeSnapshot("error", {
    providerValue: "openai",
    modelValue: "gpt-5",
    permissionText: "Ask before editing",
    statusText: "The LLM request failed.",
    historyItems: 2,
    messages: [
      { label: "You", content: "Force an error." },
      { label: "LLM", content: "Smoke forced error" }
    ]
  }, {
    expectedError: "Smoke forced error"
  });
  const qaSnapshot = await makeSnapshot("qa-sources", {
    providerValue: "openai",
    modelValue: "gpt-5",
    permissionText: "Ask before editing",
    statusText: "Ready.",
    historyItems: 2,
    messages: [
      { label: "You", content: "What are the retention complaints?" },
      { label: "LLM", content: "The strongest local evidence says customers raised retention complaints [S1]." }
    ]
  }, {
    expectedCitation: "Customer Feedback"
  });

  return {
    viewport: viewportName,
    workspaceRoot: `/tmp/lotion-llm-chat-${viewportName}`,
    sidebarEntryText: "Search & AI",
    modalState: {
      title: "LLM Chat",
      emptyTitle: "No conversation yet.",
      emptyHint: "Pick a model and ask Lotion about the current workspace.",
      statusText: "Ask a question or request a workspace action.",
      providerValue: "openai",
      modelValue: "gpt-5-mini",
      modeValue: "ask_before_editing",
      contextValue: "current_page",
      permissionText: "Ask before editing",
      toolEvents: ["ContextCurrent page", "ModeAsk before editing"],
      quickActions: ["Summarize page", "Draft page"],
      clearText: "Clear",
      sendText: "Send",
      visualSnapshot: emptySnapshot
    },
    selectionCommandState: {
      promptPreview: "Help me work with this selected text: Smoke workspace for LLM Chat UI coverage.",
      requestCount: 1,
      snapshot: selectionSnapshot,
      emptyFallback: "focused-empty-composer"
    },
    interactionState: {
      prompt: "Summarize this smoke page.",
      assistantText: "Smoke response for: Summarize this smoke page.",
      requestCount: 1,
      geometry: llmChatGeometry(),
      historyEvidence: {
        jsonlRows: 4,
        persistedUserPrompt: true,
        persistedAssistantResponse: true,
        restoredConversation: true
      },
      qaState: {
        snapshot: qaSnapshot,
        openedTitle: "Customer Feedback",
        citationText: "S1 Row page Customer Feedback Research DB"
      },
      visualSnapshots: [conversationSnapshot, errorSnapshot]
    }
  };
}

async function writeLLMChatSnapshotFiles({ extraMetadata, imagePath, metadataPath, phase, visibleState, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} ${phase} LLM Chat screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `llm-chat-${phase}-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 31, right: 1040, bottom: 820, left: 600, width: 440, height: 789 },
    image: imagePath,
    metadata: {
      pageId: `pg_llm_chat_${viewportName}`,
      pageTitle: "LLM Chat Smoke Home",
      geometry: llmChatGeometry(),
      visibleState,
      phase,
      ...extraMetadata
    }
  }, null, 2)}\n`, "utf8");
}

function llmChatGeometry() {
  return {
    chat: { top: 80, right: 1040, bottom: 820, left: 600, width: 440, height: 740 },
    transcript: { top: 360, right: 1040, bottom: 650, left: 600, width: 440, height: 290 },
    status: { top: 650, right: 1040, bottom: 680, left: 600, width: 440, height: 30 },
    composer: { top: 680, right: 1040, bottom: 820, left: 600, width: 440, height: 140 },
    input: { top: 690, right: 1020, bottom: 760, left: 620, width: 400, height: 70 },
    send: { top: 770, right: 1020, bottom: 805, left: 940, width: 80, height: 35 }
  };
}

async function writeSearchSnapshotFiles({
  extraVisibleRows = [],
  imagePath,
  metadataPath,
  phase,
  viewportName
}) {
  await writeFile(imagePath, `fake ${viewportName} ${phase} global search screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `search-quick-switcher-${phase}-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 80, right: 920, bottom: 680, left: 260, width: 660, height: 600 },
    image: imagePath,
    metadata: {
      pageId: `pg_search_contract_${viewportName}`,
      pageTitle: "[完成] createDeepDive",
      phase,
      query: phase === "typed" ? "createDeepDive" : queryForSearchPhase(phase),
      visibleRows: [...searchRowsForPhase(phase), ...extraVisibleRows]
    }
  }, null, 2)}\n`, "utf8");
}

function globalSearchContractEntry(viewportName, snapshotPaths) {
  const snapshots = searchContractPhases().map((phase) => ({
    phase,
    imagePath: snapshotPaths[phase].imagePath,
    metadataPath: snapshotPaths[phase].metadataPath,
    height: 600,
    width: 660
  }));
  const pageTitle = "[完成] createDeepDive";
  const typedRows = searchRowsForPhase("typed");
  const defaultRows = searchRowsForPhase("default-command-palette");
  const recentRows = searchRowsForPhase("recent");
  const tagRows = searchRowsForPhase("tag-default");
  const tagRow = tagRows.find((row) => row.type === "tag");
  const commandRows = [
    ...searchRowsForPhase("builtin-open-pages"),
    ...searchRowsForPhase("builtin-open-databases"),
    { title: "打开插件", badge: "命令", icon: "⌘", type: "command", preview: "Lotion · 内置 · lotion.open-plugins", path: "" }
  ];
  return {
    viewport: viewportName,
    pageId: `pg_search_contract_${viewportName}`,
    pageTitle,
    rendered: {
      hits: typedRows,
      target: {
        ...typedRows[0],
        kind: "页面",
        matchType: "标题"
      }
    },
    visualSnapshots: snapshots,
    emptyPaletteDefaults: {
      rows: defaultRows,
      progress: {
        label: "最近访问、标签和命令",
        detail: "打开页面、标签或执行命令"
      },
      activeCommand: {
        inputFocused: true,
        title: "打开所有页面",
        badge: "命令",
        type: "command"
      }
    },
    recentDefaults: {
      rendered: recentRows,
      keyboard: {
        pageActive: { inputFocused: true },
        databaseActive: { inputFocused: true },
        rowActive: { inputFocused: true }
      }
    },
    tagPages: {
      tagRow,
      typedTagRow: tagRow,
      typedActive: {
        inputFocused: true,
        title: "#Focus",
        badge: "标签",
        type: "tag",
        preview: "标签页 · 2 个项目 · 页面 1 · 数据库 1"
      }
    },
    builtInCommands: {
      openPagesRow: commandRows.find((row) => row.title === "打开所有页面"),
      newPageRow: defaultRows.find((row) => row.title === "新建页面")
    },
    databasePluginCommands: {
      openDatabasesRow: commandRows.find((row) => row.title === "打开所有数据库"),
      openPluginsRow: commandRows.find((row) => row.title === "打开插件")
    }
  };
}

function queryForSearchPhase(phase) {
  if (phase === "builtin-open-pages") return "open pages";
  if (phase === "builtin-open-databases") return "open databases";
  return "";
}

function searchRowsForPhase(phase) {
  const recentRows = [
    { title: "Recent Switcher Page", badge: "最近", icon: "📄", type: "page", preview: "页面 · Recent Bench", path: "Recent Bench" },
    { title: "Recent Switcher Database", badge: "最近", icon: "🗃️", type: "database", preview: "数据库 · Recent Bench", path: "Recent Bench" },
    { title: "Recent Switcher Row", badge: "最近", icon: "🧭", type: "page", preview: "页面 · Recent Switcher Database · Recent Bench", path: "Recent Bench / Recent Switcher Database" }
  ];
  const tagRow = { title: "#Focus", badge: "标签", icon: "#", type: "tag", preview: "标签页 · 2 个项目 · 页面 1 · 数据库 1", path: "Tags" };
  const commandRows = [
    { title: "新建页面", badge: "命令", icon: "⌘", type: "command", preview: "Lotion · 内置 · lotion.new-page", path: "" },
    { title: "打开所有页面", badge: "命令", icon: "⌘", type: "command", preview: "Lotion · 内置 · lotion.open-pages", path: "" },
    { title: "打开所有数据库", badge: "命令", icon: "⌘", type: "command", preview: "Lotion · 内置 · lotion.open-databases", path: "" }
  ];
  if (phase === "typed") {
    return [{
      title: "[完成] createDeepDive",
      badge: "页面",
      icon: "✅",
      type: "page",
      preview: "标题 · createDeepDive",
      path: "Search Bench"
    }];
  }
  if (phase === "recent") return recentRows;
  if (phase === "tag-default") return [...recentRows, tagRow, ...commandRows];
  if (phase === "builtin-open-pages") return [commandRows[1]];
  if (phase === "builtin-open-databases") return [commandRows[2]];
  return [...recentRows, tagRow, ...commandRows];
}

test("ui harness result manifests expose console errors as focused gate failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-result-console-errors-"));
  const artifactRoot = join(root, "result");
  try {
    const page = {
      url() {
        return "http://127.0.0.1:5173/#/page";
      },
      viewportSize() {
        return { width: 1040, height: 820 };
      }
    };

    const { manifest } = await writeHarnessResultArtifact({
      artifactRoot,
      consoleEvents: [
        { type: "warning", text: "non-fatal warning", timestamp: "2026-06-15T00:00:00.000Z" },
        { type: "error", text: "render exploded", timestamp: "2026-06-15T00:00:01.000Z" },
        { type: "pageerror", text: "Unhandled promise", stack: "Error: Unhandled promise" }
      ],
      consoleMessages: [
        "[warning] non-fatal warning",
        "[error] render exploded",
        "[pageerror] Error: Unhandled promise"
      ],
      devLog: [],
      name: "console-gate-smoke",
      page,
      result: {
        status: "passed",
        viewports: [{ viewport: "desktop" }, { viewport: "compact" }]
      },
      status: "passed"
    });

    assert.equal(manifest.logs.consoleCount, 3);
    assert.equal(manifest.logs.consoleErrorCount, 2);
    assert.deepEqual(manifest.logs.consoleIssues.map((event) => event.type), ["error", "pageerror"]);
    await assert.rejects(
      async () => assertNoHarnessConsoleErrors(manifest, "console-gate-smoke"),
      /console-gate-smoke emitted console\/page errors/
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ui harness stable layout assertion summarizes critical and visible geometry", async () => {
  const page = fakeLayoutPage({
    metrics: {
      bodyScrollWidth: 1000,
      bodyClientWidth: 1000,
      docScrollWidth: 1000,
      docClientWidth: 1000,
      innerWidth: 1000
    },
    viewport: { width: 1000, height: 760 }
  });
  const title = fakeLocatorRect({ top: 40, right: 780, bottom: 100, left: 120, width: 660, height: 60 });
  const editor = fakeLocatorRect({ top: 140, right: 820, bottom: 680, left: 120, width: 700, height: 540 });

  const result = await assertStablePageLayout(page, {
    critical: [{ label: "title", locator: title }],
    label: "stable fixture",
    margin: 4,
    visible: [{ label: "editor", locator: editor }]
  });

  assert.equal(result.label, "stable fixture");
  assert.deepEqual(result.overflow, {
    bodyScrollWidth: 1000,
    bodyClientWidth: 1000,
    docScrollWidth: 1000,
    docClientWidth: 1000,
    innerWidth: 1000
  });
  assert.deepEqual(result.critical, [{
    label: "title",
    rect: { top: 40, right: 780, bottom: 100, left: 120, width: 660, height: 60 }
  }]);
  assert.deepEqual(result.visible, [{
    label: "editor",
    rect: { top: 140, right: 820, bottom: 680, left: 120, width: 700, height: 540 }
  }]);
  assert.deepEqual(result.focus, {
    activeTag: "DIV",
    activeRole: "textbox",
    activeTestId: "markdown-editor",
    viewport: { width: 1000, height: 760 }
  });
});

test("ui harness stable layout assertion rejects offscreen critical elements", async () => {
  const page = fakeLayoutPage({
    metrics: {
      bodyScrollWidth: 1000,
      bodyClientWidth: 1000,
      docScrollWidth: 1000,
      docClientWidth: 1000,
      innerWidth: 1000
    },
    viewport: { width: 1000, height: 760 }
  });
  const offscreenTitle = fakeLocatorRect({ top: 40, right: 1120, bottom: 100, left: 120, width: 1000, height: 60 });

  await assert.rejects(
    () => assertStablePageLayout(page, {
      critical: [{ label: "title", locator: offscreenTitle }],
      label: "overflow fixture"
    }),
    /overflow fixture title is outside viewport/
  );
});

test("ui harness focused-region assertion accepts active descendants", async () => {
  const active = fakeElement({ className: "cm-content", role: "textbox", tagName: "DIV", testId: "markdown-editor" });
  const root = fakeElement({
    active,
    containsActive: true,
    focusedSelector: false,
    tagName: "DIV",
    testId: "markdown-editor"
  });
  const state = await assertFocusWithin(fakeElementLocator(root), "editor focus");

  assert.deepEqual(state, {
    activeClass: "cm-content",
    activeRole: "textbox",
    activeTag: "DIV",
    activeTestId: "markdown-editor",
    containsActive: true,
    hasCodeMirrorFocus: false,
    hasFocusedDescendant: false
  });
});

test("ui harness focused-region assertion accepts CodeMirror focused wrappers", async () => {
  const active = fakeElement({ className: "body", tagName: "BODY" });
  const root = fakeElement({
    active,
    cmFocused: true,
    containsActive: false,
    focusedSelector: false,
    tagName: "DIV",
    testId: "markdown-editor"
  });
  const state = await assertFocusWithin(fakeElementLocator(root), "codemirror focus");

  assert.equal(state.containsActive, false);
  assert.equal(state.hasCodeMirrorFocus, true);
});

test("ui harness focused-region assertion rejects unfocused regions", async () => {
  const active = fakeElement({ className: "outside", tagName: "BUTTON" });
  const root = fakeElement({
    active,
    containsActive: false,
    focusedSelector: false,
    tagName: "DIV",
    testId: "markdown-editor"
  });

  await assert.rejects(
    () => assertFocusWithin(fakeElementLocator(root), "editor focus"),
    /editor focus does not contain keyboard focus/
  );
});

test("ui harness viewport coverage assertion reports missing viewports", () => {
  assert.throws(
    () => assertHarnessViewportCoverage({ status: "passed", viewports: [{ viewport: "desktop" }] }),
    /compact/
  );
});

test("ui harness result artifact reader returns current-run manifests only", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-ui-manifest-reader-"));
  const artifactParent = join(root, "ui-smoke");
  try {
    await mkdir(join(artifactParent, "old-suite"), { recursive: true });
    const oldPath = join(artifactParent, "old-suite", "harness-result.json");
    await writeFile(oldPath, `${JSON.stringify({ name: "old-suite", status: "passed" })}\n`, "utf8");
    const oldTime = new Date(Date.now() - 60_000);
    await utimes(oldPath, oldTime, oldTime);

    const startedAt = Date.now();
    await mkdir(join(artifactParent, "new-suite"), { recursive: true });
    const newPath = join(artifactParent, "new-suite", "harness-result.json");
    await writeFile(newPath, `${JSON.stringify({
      name: "new-suite",
      status: "passed",
      coverage: { missingViewportNames: [] }
    })}\n`, "utf8");

    const manifests = await readHarnessResultArtifactsSince({ artifactParent, startedAt });
    assert.equal(manifests.length, 1);
    assert.equal(manifests[0].manifestPath, newPath);
    assert.equal(manifests[0].manifest.name, "new-suite");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function searchUiContractEntry(viewportName, visualSnapshot) {
  return {
    viewport: viewportName,
    query: "the",
    candidateChecks: [{ query: "the", hits: 140, truncated: true, elapsedMs: 12 }],
    hits: 140,
    firstRenderMs: 110,
    repeatedRenderMs: 90,
    harnessCache: {
      generationCounts: { relevance: 1, created_asc: 1, updated_desc: 1 },
      queryCounts: { relevance: 4, created_asc: 1, updated_desc: 2 },
      queryTimings: [{ cacheHit: true, delayMs: 350, originalMs: 12, prepareMs: 0.1, sortMode: "relevance", totalMs: 362.1 }]
    },
    sorting: {
      createdAsc: "Search UI Hit 0",
      updatedDesc: "Search UI Hit 139",
      options: [
        { label: "Relevance", value: "relevance" },
        { label: "Updated newest", value: "updated_desc" },
        { label: "Updated oldest", value: "updated_asc" },
        { label: "Created newest", value: "created_desc" },
        { label: "Created oldest", value: "created_asc" }
      ],
      geometry: {
        active: true,
        dialogInsideViewport: true,
        sortInsideViewport: true,
        filtersInsideDialog: true,
        sortInsideDialog: true,
        sortInsideFilters: true,
        sortOverlapsFilter: false,
        filtersOverflowX: 0
      }
    },
    inputLatency: {
      warmupMs: 4,
      samples: [6, 7, 8, 9, 7, 8, 6, 7],
      maxMs: 9,
      avgMs: 7.3
    },
    keyboardNavigation: {
      active: true,
      activeHitCount: 1,
      activeTitle: "Search UI Hit 0",
      inputFocused: true
    },
    jump: {
      visibleLineCount: 44,
      matchVisible: true,
      matchIndex: 18,
      firstVisibleLine: "Filler line 92",
      lastVisibleLine: "needle-search-jump-line should be visible after search navigation."
    },
    renderOverflow: searchUiOverflow(),
    inputOverflow: searchUiOverflow(),
    visualSnapshot
  };
}

function searchUiMetadata(viewportName) {
  return {
    phase: "search-latency",
    query: "the",
    visibleHitCount: 100,
    firstVisibleTitle: "Search UI Hit 0",
    firstRenderMs: 110,
    repeatedRenderMs: 90,
    inputMaxMs: 9,
    layout: searchUiLayout(),
    rows: [
      { badge: "页面", match: "标题", title: "Search UI Hit 0", preview: "the deterministic search body 0" },
      { badge: "页面", match: "正文", title: `Search UI Hit ${viewportName === "desktop" ? 1 : 2}`, preview: "the deterministic search body" }
    ]
  };
}

function searchUiLayout() {
  const panel = { top: 80, right: 920, bottom: 680, left: 320, width: 600, height: 600 };
  const filters = { top: 130, right: 919, bottom: 205, left: 321, width: 598, height: 75 };
  const sortLabel = { top: 168, right: 907, bottom: 196, left: 750, width: 157, height: 28 };
  const sortSelect = { top: 168, right: 907, bottom: 196, left: 780, width: 127, height: 28 };
  const results = { top: 245, right: 919, bottom: 679, left: 321, width: 598, height: 434 };
  return {
    panel,
    filters,
    sortLabel,
    sortSelect,
    results,
    filterButtons: Array.from({ length: 6 }, (_unused, index) => ({
      label: `Filter ${index + 1}`,
      rect: { top: 140, right: 390 + index * 55, bottom: 168, left: 340 + index * 55, width: 50, height: 28 }
    })),
    visibleRows: [{
      title: "Search UI Hit 0",
      rect: { top: 250, right: 900, bottom: 310, left: 340, width: 560, height: 60 },
      fullyVisible: true
    }],
    filterCount: 6,
    filtersOverflowX: 0,
    sortInsidePanel: true,
    sortInsideFilters: true,
    sortOverlapsFilter: false
  };
}

async function writeSearchUiMetadata(path, viewportName, metadata) {
  await writeFile(path, `${JSON.stringify({
    name: `Search-Latency-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 80, right: 920, bottom: 680, left: 320, width: 600, height: 600 },
    image: path.replace(/\.json$/, ".png"),
    metadata
  }, null, 2)}\n`, "utf8");
}

function searchUiOverflow() {
  return {
    bodyScrollWidth: 1000,
    bodyClientWidth: 1000,
    docScrollWidth: 1000,
    docClientWidth: 1000,
    innerWidth: 1000
  };
}

function navigationAnchorContractEntry(viewportName, visualSnapshot) {
  return {
    viewport: viewportName,
    secondTitle: `Navigation Anchor Second ${viewportName}`,
    before: {
      scrollTop: 1200,
      scrollHeight: 3200,
      clientHeight: 700
    },
    restored: {
      scrollTop: 620,
      scrollHeight: 3200,
      clientHeight: 700
    },
    anchorLine: "Anchor paragraph 88: stable text for navigation history restoration.",
    visibleTextSample: "Anchor paragraph 88: stable text for navigation history restoration.\nAnchor paragraph 89",
    beforeOverflow: searchUiOverflow(),
    afterBackOverflow: searchUiOverflow(),
    afterForwardOverflow: searchUiOverflow(),
    forward: {
      title: `Navigation Anchor Second ${viewportName}`,
      bodyVisible: true
    },
    visualSnapshot
  };
}

function navigationAnchorMetadata() {
  return {
    phase: "navigation-anchor-restored",
    anchorLine: "Anchor paragraph 88: stable text for navigation history restoration.",
    restoredScrollTop: 620,
    visibleTextSample: "Anchor paragraph 88: stable text for navigation history restoration.\nAnchor paragraph 89",
    overflow: searchUiOverflow()
  };
}

async function writeNavigationAnchorMetadata(path, viewportName, metadata) {
  await writeFile(path, `${JSON.stringify({
    name: `Navigation-Anchor-Restored-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 120, right: 980, bottom: 760, left: 260, width: 720, height: 640 },
    image: path.replace(/\.json$/, ".png"),
    metadata
  }, null, 2)}\n`, "utf8");
}

function rowPropertyNames() {
  return [
    "Original Notion HTML",
    "Original Notion CSV",
    "Notes",
    "Empty text",
    "Status",
    "Tags",
    "Done",
    "Blocked",
    "Due date",
    "Empty date",
    "Score",
    "Related"
  ];
}

function createRowPropertyRecoveryEvidence(viewportName) {
  return {
    message: "Injected row-property persistence failure",
    failedInput: {
      rowId: "row_visual",
      fieldId: "notes",
      value: `Recovered row property ${viewportName}`
    },
    failedValueRolledBack: true,
    draftRetained: true,
    controlsBlocked: true,
    duplicateRetrySuppressed: true,
    retryPersisted: true,
    discardPreservedStoredValue: true,
    discardResetDraft: true,
    baselineRestored: true
  };
}

function createRowPropertyOptionRecoveryEvidence(viewportName) {
  return {
    message: "Injected row-property option persistence failure",
    failedInput: [
      { id: "status_todo", name: "Todo", color: "gray" },
      { id: "status_done", name: "Done", color: "blue" }
    ],
    failedSchemaRolledBack: true,
    dismissalBlocked: true,
    duplicateRetrySuppressed: true,
    retryPersisted: true,
    discardPreservedStoredSchema: true,
    discardResetControl: true,
    baselineRestored: true,
    viewport: viewportName
  };
}

function createRowPropertyCompletePanelState(viewportName) {
  const viewport = {
    width: viewportName === "desktop" ? 1440 : viewportName === "wide" ? 1728 : 1040,
    height: viewportName === "wide" ? 1100 : viewportName === "desktop" ? 1000 : 820
  };
  const rows = {};
  rowPropertyNames().forEach((name, index) => {
    const top = 100 + index * 36;
    const row = {
      labelRect: { left: 140, top: top + 2, right: 300, bottom: top + 32, width: 160, height: 30 },
      rowOpacity: 1,
      rowRect: { left: 130, top, right: 810, bottom: top + 34, width: 680, height: 34 },
      rowVisibility: "visible",
      valueRect: { left: 420, top: top + 2, right: 800, bottom: top + 32, width: 380, height: 30 }
    };
    if (name.startsWith("Original Notion")) {
      row.linkRect = { left: 420, top: top + 4, right: 750, bottom: top + 30, width: 330, height: 26 };
      row.linkOpenRect = { left: 760, top: top + 5, right: 790, bottom: top + 29, width: 30, height: 24 };
    } else if (name === "Status" || name === "Tags") {
      row.optionPillRect = { left: 420, top: top + 5, right: 480, bottom: top + 29, width: 60, height: 24 };
      row.searchChipRect = { left: 490, top: top + 5, right: 560, bottom: top + 29, width: 70, height: 24 };
      row.searchChipText = name === "Status" ? "Done" : "Focus";
    } else if (name === "Done" || name === "Blocked") {
      row.inputRect = { left: 420, top: top + 7, right: 440, bottom: top + 27, width: 20, height: 20 };
    } else if (name === "Related") {
      row.entityChipRect = { left: 420, top: top + 5, right: 650, bottom: top + 29, width: 230, height: 24 };
    } else {
      row.controlRect = { left: 420, top: top + 4, right: 790, bottom: top + 30, width: 370, height: 26 };
    }
    rows[name] = row;
  });
  return {
    contentOpacity: 1,
    contentOverflow: "visible",
    contentRect: { left: 120, top: 90, right: 820, bottom: 550, width: 700, height: 460 },
    contentScrollHeight: 460,
    contentScrollTop: 0,
    contentVisibility: "visible",
    panelOpacity: 1,
    panelRect: { left: 110, top: 60, right: 830, bottom: 570, width: 720, height: 510 },
    panelVisibility: "visible",
    propertiesOpacity: 1,
    propertiesRect: { left: 120, top: 90, right: 820, bottom: 550, width: 700, height: 460 },
    propertiesVisibility: "visible",
    rows,
    valueColumnLeft: 420,
    viewport: {
      ...viewport,
      scrollWidth: viewport.width
    }
  };
}

function fakeLayoutPage({ metrics, viewport }) {
  return {
    viewportSize() {
      return viewport;
    },
    async evaluate(fn) {
      const source = String(fn);
      if (source.includes("document.body.scrollWidth")) return metrics;
      if (source.includes("document.activeElement")) {
        return {
          activeTag: "DIV",
          activeRole: "textbox",
          activeTestId: "markdown-editor",
          viewport
        };
      }
      throw new Error(`Unexpected fake page evaluation: ${source.slice(0, 120)}`);
    }
  };
}

function fakeLocatorRect(rect) {
  return {
    async evaluate(fn) {
      return fn({
        getBoundingClientRect() {
          return rect;
        }
      });
    }
  };
}

function fakeElementLocator(element) {
  return {
    async evaluate(fn) {
      return fn(element);
    }
  };
}

function fakeElement({
  active = null,
  className = "",
  cmFocused = false,
  containsActive = false,
  focusedSelector = false,
  role = "",
  tagName = "DIV",
  testId = ""
} = {}) {
  const element = {
    className,
    ownerDocument: null,
    tagName,
    classList: {
      contains(name) {
        return name === "cm-focused" && cmFocused;
      }
    },
    contains(candidate) {
      return containsActive && candidate === active;
    },
    getAttribute(name) {
      if (name === "role") return role;
      if (name === "data-testid") return testId;
      return "";
    },
    querySelector(selector) {
      if (selector === ":focus") return focusedSelector ? active : null;
      if (selector === ".cm-focused") return cmFocused ? { className: "cm-focused" } : null;
      return null;
    },
    closest(selector) {
      if (selector === "[data-testid]" && testId) return element;
      return null;
    }
  };
  element.ownerDocument = { activeElement: active };
  if (active && !active.ownerDocument) active.ownerDocument = element.ownerDocument;
  return element;
}
