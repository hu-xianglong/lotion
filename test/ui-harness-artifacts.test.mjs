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
import { assertSearchUiArtifactContract } from "../scripts/lib/search-ui-artifacts.mjs";
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
  writeUiSuiteArtifactIndex
} from "../scripts/lib/ui-suite-artifacts.mjs";
import { assertDesignSystemArtifactContract, requiredDesignSystemStatusPills } from "../scripts/lib/design-system-artifacts.mjs";

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
    async evaluate(callback, root) {
      calls.push(["evaluate", root]);
      assert.equal(typeof callback, "function");
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
    ["evaluate", "/tmp/lotion-workspace"],
    ["reload", { waitUntil: "domcontentloaded" }],
    ["waitForFunction", { timeout: 15_000 }]
  ]);
});

test("ui harness workspace reload tolerates transient network changes", async () => {
  const calls = [];
  const networkChanged = new Error("page.reload: net::ERR_NETWORK_CHANGED");
  const page = {
    async evaluate(callback, root) {
      calls.push(["evaluate", root]);
      assert.equal(typeof callback, "function");
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
      await writeFile(metadataPath, `${JSON.stringify({
        name: `row-property-${viewportName}`,
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
        rect: { top: 20, right: 820, bottom: 620, left: 120, width: 700, height: 600 },
        image: imagePath,
        metadata: {
          rowId: "row_visual",
          rowTitle: "Row Property Visual Row",
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
        propertyVisuals: {
          rowCount: 12,
          valueColumnLeft: 420,
          focus: [{}, {}, {}, {}],
          sourceOpen: [
            { label: "Original Notion HTML", requests: ["attachments/original/export/source.html"] },
            { label: "Original Notion CSV", requests: ["attachments/original/export/source.csv"] }
          ],
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
          propertyVisuals: {
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
          propertyVisuals: {
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
    assert.equal(contract.snapshots[2].pathButtons, 2);
    assert.equal(contract.snapshots[2].openedCount, 2);
    assert.equal(contract.snapshots[2].summary.Issues, "0");
    assert.equal(contract.snapshots[4].phase, "diagnostic");
    assert.equal(contract.snapshots[4].issueKinds.cell_loss, 1);
    assert.equal(contract.snapshots[4].summary.Issues, "1");
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
      const widgetsImagePath = join(snapshotRoot, "markdown-preview-widgets.png");
      const widgetsMetadataPath = join(snapshotRoot, "markdown-preview-widgets.json");
      await writeMarkdownSnapshotFiles({
        imagePath: initialImagePath,
        metadataPath: initialMetadataPath,
        phase: "initial",
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
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].phases, ["initial", "widgets"]);
    assert.equal(contract.snapshots[0].imagePath, join(artifactRoot, "desktop", "markdown-preview-initial.png"));
    assert.equal(contract.snapshots[0].metadataPath, join(artifactRoot, "desktop", "markdown-preview-initial.json"));
    assert.deepEqual(contract.snapshots[0].phaseSnapshots.map((entry) => entry.phase), ["initial", "widgets"]);
    assert.equal(contract.snapshots[0].previews.callout, true);
    assert.equal(contract.snapshots[0].previews.missingDatabase, true);
    assert.equal(contract.snapshots[0].sourceHidden, true);
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
    const widgetsImagePath = join(artifactRoot, "markdown-preview-widgets.png");
    const widgetsMetadataPath = join(artifactRoot, "markdown-preview-widgets.json");
    await writeMarkdownSnapshotFiles({
      imagePath: initialImagePath,
      metadataPath: initialMetadataPath,
      phase: "initial",
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
      widgetsImagePath,
      widgetsMetadataPath
    });
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
          pagination: entry.pagination
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
    assert.equal(contract.snapshotCount, 2);
    assert.deepEqual(contract.snapshots[0].columnOrder, ["Name", "Notes", "Score"]);
    assert.equal(contract.snapshots[0].loadMoreShown, 100);
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
        pagination: entry.pagination
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
    delete entry.headerActions.settingsButton;
    await writeFile(imagePath, "fake screenshot", "utf8");
    await writeFile(metadataPath, `${JSON.stringify({
      viewport: { name: "desktop", width: 1440, height: 1000 },
      metadata: {
        phase: "embedded-table",
        embeddedViews: entry.embeddedViews,
        rowsPerDatabase: entry.rowsPerDatabase,
        columnOrder: entry.columnOrder,
        pagination: entry.pagination
      }
    })}\n`, "utf8");

    await assert.rejects(
      () => assertEmbeddedViewArtifactContract({
        status: "passed",
        results: [entry]
      }, { expectedViewportNames: ["desktop"] }),
      /weak Settings action/
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
    assert.equal(contract.snapshots[0].categoryCount, requiredSettingsCenterCategories().length);
    assert.equal(contract.snapshots[0].searchAiPluginHosts, 2);
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
    assert.equal(contract.snapshots[0].pluginRows, requiredPluginManagerPlugins().length);
    assert.equal(contract.snapshots[0].detailCount, 3);
    assert.equal(contract.snapshots[0].commandQuery, "Open Notion Import");
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
    assert.equal(contract.snapshots[0].phase, "page");
    assert.equal(contract.snapshots[0].surfaceCount > 0, true);
    assert.equal(contract.snapshots[0].tokenCount, 8);
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
      await writeFile(metadataPath, JSON.stringify({
        viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: viewportName === "desktop" ? 1000 : 820 },
        metadata: {
          phase: "search-ai",
          search: entry.search,
          advanced: entry.advanced,
          chat: entry.chat,
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
    assert.equal(contract.snapshots[0].resultCount, 3);
    assert.match(contract.snapshots[0].selectedSource, /Semantic Orchard Row/);
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
    assert.deepEqual(contract.snapshots[0].phases, requiredAdvancedSearchSnapshotPhases());
    assert.equal(contract.snapshots[0].phaseCount, requiredAdvancedSearchSnapshotPhases().length);
    assert.match(contract.snapshots[0].imagePath, /\/desktop\/advanced-search-initial\.png$/);
    assert.match(contract.snapshots[0].metadataPath, /\/desktop\/advanced-search-initial\.json$/);
    assert.ok(contract.snapshots[0].resultCountMax >= 1, "contract should count semantic results");
    assert.ok(contract.snapshots[0].statusLabels.includes("Stale"), "contract should include stale status evidence");
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
            previews: { pdf: true, video: true, audio: true, image: true }
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
          previews: { pdf: true, video: true, audio: true, image: true }
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
    ["Row-page property visual UI", "scripts/smoke-row-page-property-visual-ui.mjs", "row-page-property-visual"],
    ["Page secondary UI", "scripts/smoke-page-secondary-ui.mjs", "page-secondary"],
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
  assert.deepEqual(contract.suites.map((suite) => suite.scriptPath), criticalSuites.map(([, script]) => script));
  assert.match(contract.suites[0].reproduceCommand, /^LOTION_UI_SUITE_FILTER=smoke-design-system-ui\.mjs npm run smoke:ui$/);
  const databaseCreatedViewsSuite = index.suites.find((suite) => suite.scriptPath === "scripts/smoke-database-created-views-ui.mjs");
  assert.match(databaseCreatedViewsSuite.artifactContract.detailText, /activeTabText=Created date desc/);
  assert.match(databaseCreatedViewsSuite.artifactContract.detailText, /visibleTabs=All,Created date asc,Created date desc/);

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
  return uiSuiteChild({
    artifactRoot: `artifacts/ui-smoke/${artifactName}-2026`,
    manifestPath: `artifacts/ui-smoke/${artifactName}-2026/harness-result.json`,
    name,
    scriptPath,
    observedViewports: options.observedViewports || DEFAULT_PRODUCTION_VISUAL_VIEWPORT_NAMES,
    snapshotBytes: options.snapshotBytes || [1200, 1100, 1300],
    snapshotDetails: options.snapshotDetails || [
      { phase: "desktop-visual", horizontalOverflowPx: 0, scrollWidth: 1440, viewportWidth: 1440 },
      { phase: "compact-visual", horizontalOverflowPx: 0, scrollWidth: 1040, viewportWidth: 1040 },
      { phase: "wide-visual", horizontalOverflowPx: 0, scrollWidth: 1728, viewportWidth: 1728 }
    ],
    snapshotViewports: options.snapshotViewports,
    reproduceCommand: options.reproduceCommand
  });
}

function uiSuiteChild({
  artifactRoot,
  consoleErrorCount = 0,
  consoleIssues = [],
  elapsedMs = 100,
  failureArtifacts = null,
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
    shellOpenDryRunRequests: [sourceRoot, workspaceRoot]
  };
}

function notionImportModalContractEntry(viewportName, { imagePath, metadataPath }) {
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
    shellOpenDryRunRequests: [sourceRoot, workspaceRoot, "databases/user/Tasks--db_audit_ui"]
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
      ...(entry.failText ? { failText: entry.failText } : {}),
      ...(entry.issueKinds ? { issueKinds: entry.issueKinds } : {}),
      ...(entry.issueRows ? { issueRows: entry.issueRows } : {}),
      ...(entry.failText ? { phase: "diagnostic" } : { phase: "passing" })
    }
  }, null, 2)}\n`, "utf8");
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
      markdownTableSyntax: { rendered: true }
    },
    empty: {
      firstTyping: `Empty row first typing ${viewportName}`,
      markdownLength: 256
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

async function writeMarkdownSnapshotFiles({ imagePath, metadataPath, phase, viewportName }) {
  await writeFile(imagePath, `fake ${viewportName} ${phase} markdown preview screenshot`, "utf8");
  await writeFile(metadataPath, `${JSON.stringify({
    name: `markdown-preview-${phase}-${viewportName}`,
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 80, right: 900, bottom: 680, left: 120, width: 780, height: 600 },
    image: imagePath,
    metadata: {
      phase,
      pageId: `pg_markdown_${viewportName}`,
      pageTitle: `Markdown Preview ${viewportName}`
    }
  }, null, 2)}\n`, "utf8");
}

function markdownPreviewContractEntry(viewportName, {
  initialImagePath,
  initialMetadataPath,
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
        editableCellContentEditable: "plaintext-only"
      },
      importedNotionToggle: {
        summaryText: "收据",
        summaryEditable: "SPAN",
        summaryContentEditable: "plaintext-only",
        bodyEditable: "DIV",
        bodyText: "Example vision appointment",
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
      width: 940
    }
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
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 1040, height: 820 },
    rect: { top: 72, right: 1180, bottom: 760, left: 280, width: 900, height: 688 },
    image: imagePath,
    metadata: {
      initial: entry.initial,
      importSection: entry.importSection,
      pluginsSection: entry.pluginsSection,
      searchAiDeepLink: entry.searchAiDeepLink,
      searchJump: entry.searchJump,
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
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
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
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
}

function designSystemContractEntry(viewportName, snapshotPaths) {
  return {
    viewport: { name: viewportName, width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 },
    controlState: {
      focusState: {
        activeClass: "lotion-ui-button primary",
        activeText: "New page",
        isPrimary: true,
        outlineColor: "rgb(32, 32, 30)"
      },
      statusPills: requiredDesignSystemStatusPills()
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
  const viewport = { width: viewportName === "desktop" ? 1440 : 390, height: viewportName === "desktop" ? 1000 : 820 };
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
      phase: "database-created-views"
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
    tableRect: { top: 180, right: 1180, bottom: 760, left: 120, width: 1060, height: 580 },
    tabsRect: { top: 126, right: 620, bottom: 176, left: 110, width: 510, height: 50 },
    visibleTabs: requiredDatabaseCreatedViewTabs(),
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 580,
      width: 1060
    }
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
        excerpt: "See [Backlink Target Page](databases/system/pages--db_pages/pages/Backlink_Target_Page--pg_backlink_target.md)."
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
      phase: "page-secondary"
    }
  }, null, 2)}\n`, "utf8");
}

function pageSecondaryContractEntry(viewportName, snapshotPaths) {
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
    snapshot: {
      imagePath: snapshotPaths.imagePath,
      metadataPath: snapshotPaths.metadataPath,
      height: 424,
      width: 280
    },
    toc: {
      collapsed: {
        hostClass: "cm-md-floating-toc-host cm-md-toc-collapsed",
        itemTexts: [],
        navDisplay: "none",
        toggleExpanded: "false"
      },
      expanded: {
        hostClass: "cm-md-floating-toc-host cm-md-toc-expanded",
        itemTexts: ["Page Secondary Target", "Overview", "Deep Work", "Nested Insight", "Final Section"],
        navDisplay: "block",
        toggleExpanded: "true"
      }
    }
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
      sourceDrilldown: entry.sourceDrilldown,
      summary: entry.summary,
      viewport: viewportName
    }
  }, null, 2)}\n`, "utf8");
}

function pluginManagerContractEntry(viewportName, snapshotPaths) {
  const listedPlugins = requiredPluginManagerPlugins();
  return {
    viewport: viewportName,
    summary: {
      pluginRows: listedPlugins.length,
      providerRows: 4,
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
      selected: `Selected Source ${search.rowTitle} Open LLM Chat LLM settings`
    },
    snapshot: {
      imagePath,
      metadataPath
    }
  };
}

function whiteThemeContractEntry(viewportName, snapshotRoot) {
  const states = Object.fromEntries(requiredWhiteThemePhases().map((phase) => [phase, whiteThemeState(phase)]));
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
    snippets: [],
    sources: [],
    statusLabel: "Not built",
    storeValue: "json",
    titles: [],
    ...overrides
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
    await writeLLMChatSnapshotFiles({ extraMetadata, imagePath, metadataPath, phase, visibleState, viewportName });
    return {
      phase,
      imagePath,
      metadataPath,
      height: 720,
      width: 440
    };
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
      pageTitle: "[完成] exampleSearchPage",
      phase,
      query: phase === "typed" ? "exampleSearchPage" : queryForSearchPhase(phase),
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
  const pageTitle = "[完成] exampleSearchPage";
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
      title: "[完成] exampleSearchPage",
      badge: "页面",
      icon: "✅",
      type: "page",
      preview: "标题 · exampleSearchPage",
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
        sortInsideViewport: true
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
    rows: [
      { badge: "页面", match: "标题", title: "Search UI Hit 0", preview: "the deterministic search body 0" },
      { badge: "页面", match: "正文", title: `Search UI Hit ${viewportName === "desktop" ? 1 : 2}`, preview: "the deterministic search body" }
    ]
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
