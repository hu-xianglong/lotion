import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { currentNonSmokeWorkspacePath } from "./smoke-workspace-utils.mjs";

export const DEFAULT_UI_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "compact", width: 1040, height: 820 }
];

export async function withLotionUIHarness(name, run, options = {}) {
  const artifactRoot = join(process.cwd(), "artifacts", "ui-smoke", `${safeName(name)}-${timestamp()}`);
  const explicitCdpUrl = (process.env.LOTION_CDP_URL || "").trim();
  const autoPorts = explicitCdpUrl ? null : await allocateUiHarnessPorts();
  const cdpUrl = explicitCdpUrl || `http://127.0.0.1:${autoPorts.cdpPort}`;
  const consoleEvents = [];
  const consoleMessages = [];
  const devLog = [];
  const tempWorkspaces = new Set();
  let browser;
  let page;
  let previousWorkspacePath = "";
  let previousLocale;
  let previousLocaleCaptured = false;
  let devProcess;
  let runResult = null;

  try {
    await mkdir(artifactRoot, { recursive: true });
    devProcess = await ensureAppLifecycle(cdpUrl, devLog, {
      artifactRoot,
      cdpPort: autoPorts?.cdpPort,
      explicitCdpUrl: Boolean(explicitCdpUrl),
      vitePort: autoPorts?.vitePort
    });
    browser = await chromium.connectOverCDP(cdpUrl);
    page = await waitForRendererPage(browser, 30_000, autoPorts?.vitePort);
    page.on("console", (message) => {
      const event = {
        type: message.type(),
        text: message.text(),
        location: message.location(),
        timestamp: new Date().toISOString()
      };
      consoleEvents.push(event);
      consoleMessages.push(formatConsoleEvent(event));
    });
    page.on("pageerror", (error) => {
      const event = {
        type: "pageerror",
        text: error.message || String(error),
        stack: error.stack || "",
        timestamp: new Date().toISOString()
      };
      consoleEvents.push(event);
      consoleMessages.push(formatConsoleEvent(event));
    });
    await page.bringToFront().catch(() => undefined);
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 15_000 });
    await page.evaluate(() => window.lotion.runtime.ready());
    previousWorkspacePath = await currentNonSmokeWorkspacePath(page);
    previousLocale = await page.evaluate(() => window.localStorage.getItem("lotion.locale"));
    previousLocaleCaptured = true;

    const context = {
      artifactRoot,
      browser,
      cdpUrl,
      consoleEvents,
      consoleMessages,
      devLog,
      page,
      registerTempWorkspace(root) {
        tempWorkspaces.add(root);
        return root;
      },
      async openWorkspace(root) {
        tempWorkspaces.add(root);
        await openWorkspaceAndReload(page, root);
      },
      async restoreWorkspace() {
        if (previousWorkspacePath) await openWorkspaceAndReload(page, previousWorkspacePath);
      },
      async forgetWorkspace(root) {
        await forgetWorkspace(page, root);
        tempWorkspaces.delete(root);
      }
    };

    runResult = await run(context);
    if (options.failOnConsoleErrors !== false) {
      const consoleIssues = consoleIssuesFromEvents(consoleEvents, consoleMessages);
      if (consoleIssues.length > 0) {
        throw new Error(`${name} emitted console/page errors: ${JSON.stringify(consoleIssues.slice(0, 10))}`);
      }
    }
    await writeHarnessResultArtifact({
      artifactRoot,
      cdpUrl,
      consoleEvents,
      consoleMessages,
      devLog,
      name,
      page,
      result: runResult,
      status: "passed"
    });
    return runResult;
  } catch (error) {
    if (page) {
      await captureFailureArtifacts({
        artifactRoot,
        consoleEvents,
        consoleMessages,
        devLog,
        error,
        name,
        page
      }).catch(() => undefined);
    } else {
      await writeStartupFailureArtifacts({ artifactRoot, devLog, error, name }).catch(() => undefined);
    }
    await writeHarnessResultArtifact({
      artifactRoot,
      cdpUrl,
      consoleEvents,
      consoleMessages,
      devLog,
      error,
      name,
      page,
      result: runResult,
      status: "failed"
    }).catch(() => undefined);
    throw error;
  } finally {
    if (page && previousLocaleCaptured) {
      await restoreLocalStorageValue(page, "lotion.locale", previousLocale).catch(() => undefined);
    }
    if (page && previousWorkspacePath) {
      await openWorkspaceAndReload(page, previousWorkspacePath).catch(() => undefined);
    } else if (page && previousLocaleCaptured) {
      await reloadRendererPage(page).catch(() => undefined);
    }
    if (page) {
      for (const root of tempWorkspaces) {
        await forgetWorkspace(page, root).catch(() => undefined);
      }
    }
    for (const root of tempWorkspaces) {
      await rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
    await browser?.close().catch(() => undefined);
    await stopDevProcess(devProcess);
  }
}

export function selectedViewports() {
  const raw = (process.env.LOTION_UI_VIEWPORTS || "").trim();
  if (!raw) return DEFAULT_UI_VIEWPORTS;
  const selected = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return selected.map((item) => {
    const preset = DEFAULT_UI_VIEWPORTS.find((viewport) => viewport.name === item);
    if (preset) return preset;
    const match = /^([a-z0-9_-]+):(\d+)x(\d+)$/i.exec(item);
    if (!match) throw new Error(`Invalid LOTION_UI_VIEWPORTS item: ${item}`);
    return { name: match[1], width: Number(match[2]), height: Number(match[3]) };
  });
}

export async function forEachViewport(page, viewports, run) {
  const previous = page.viewportSize();
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForFunction(
      ({ width, height }) => window.innerWidth === width && window.innerHeight === height,
      { width: viewport.width, height: viewport.height },
      { timeout: 5_000 }
    );
    await nextAnimationFrame(page);
    await run(viewport);
  }
  if (previous) await page.setViewportSize(previous);
}

export async function openWorkspaceAndReload(page, root) {
  const previousTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  const openedManifest = await page.evaluate((workspacePath) => {
    window.localStorage.removeItem("lotion.tabs");
    window.localStorage.removeItem("lotion.nextWindowInit");
    return window.lotion.workspace.open(workspacePath);
  }, root);
  await reloadRendererPage(page);
  await page.waitForFunction(async ({ expectedSpaceId, expectedWorkspaceName, staleTimeOrigin }) => {
    if (performance.timeOrigin === staleTimeOrigin || !window.lotion?.workspace) return false;
    const manifest = await window.lotion.workspace.getManifest().catch(() => null);
    return Boolean(
      manifest
      && (!expectedSpaceId || manifest.spaceId === expectedSpaceId)
      && (!expectedWorkspaceName || manifest.name === expectedWorkspaceName)
    );
  }, {
    expectedSpaceId: openedManifest?.spaceId || "",
    expectedWorkspaceName: openedManifest?.name || "",
    staleTimeOrigin: previousTimeOrigin
  }, { timeout: 15_000 });
}

export async function reloadRendererPage(page) {
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!isIgnorableReloadNavigationError(error)) throw error;
  }
}

export async function setLotionLocale(page, locale) {
  if (locale !== "en" && locale !== "zh") throw new Error(`Unsupported Lotion locale: ${locale}`);
  await page.evaluate((nextLocale) => window.localStorage.setItem("lotion.locale", nextLocale), locale);
  await reloadRendererPage(page);
  await page.waitForFunction(
    (nextLocale) => document.documentElement.lang === (nextLocale === "zh" ? "zh-Hans" : "en"),
    locale,
    { timeout: 8_000 }
  );
}

export async function withPreservedLocalStorageValue(page, key, run) {
  const previousValue = await page.evaluate(
    (storageKey) => window.localStorage.getItem(storageKey),
    key
  );
  let restored = false;
  const restore = async () => {
    if (restored) return;
    await restoreLocalStorageValue(page, key, previousValue);
    restored = true;
  };
  try {
    return await run(previousValue, restore);
  } finally {
    await restore();
  }
}

export async function restoreLocalStorageValue(page, key, value) {
  await page.evaluate(({ storageKey, value: previousValue }) => {
    if (previousValue === null) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, previousValue);
  }, { storageKey: key, value });
}

function isIgnorableReloadNavigationError(error) {
  const message = String(error?.message || error || "");
  if (!message.includes("page.reload")) return false;
  return error?.name === "TimeoutError" || message.includes("ERR_NETWORK_CHANGED");
}

export async function forgetWorkspace(page, root) {
  await page.evaluate((workspacePath) => window.lotion.workspace.forget(workspacePath), root);
}

export async function openPage(page, pageId) {
  await page.evaluate((entityId) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "page", entityId }
    }));
  }, pageId);
}

export async function openRowPage(page, databaseId, rowId) {
  await page.evaluate(({ targetDatabaseId, targetRowId }) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", {
      detail: { kind: "row", databaseId: targetDatabaseId, rowId: targetRowId }
    }));
  }, { targetDatabaseId: databaseId, targetRowId: rowId });
}

export async function waitForPageMarkdown(page, pageId, expectedText, label = "page markdown") {
  const deadline = Date.now() + 12_000;
  let lastMarkdown = "";
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async ({ targetPageId, text }) => {
      const doc = await window.lotion.pages.get(targetPageId);
      return {
        ok: doc.markdown.includes(text),
        markdown: doc.markdown
      };
    }, { targetPageId: pageId, text: expectedText });
    if (snapshot.ok) return snapshot.markdown;
    lastMarkdown = snapshot.markdown;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not contain ${JSON.stringify(expectedText)}. Last markdown: ${JSON.stringify(lastMarkdown)}`);
}

export async function waitForRowPageMarkdown(page, databaseId, rowId, expectedText, label = "row-page markdown") {
  const deadline = Date.now() + 12_000;
  let lastMarkdown = "";
  while (Date.now() < deadline) {
    const snapshot = await page.evaluate(async ({ dbId, targetRowId, text }) => {
      const doc = await window.lotion.rowPages.open(dbId, targetRowId);
      return {
        ok: doc.markdown.includes(text),
        markdown: doc.markdown
      };
    }, { dbId: databaseId, targetRowId: rowId, text: expectedText });
    if (snapshot.ok) return snapshot.markdown;
    lastMarkdown = snapshot.markdown;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not contain ${JSON.stringify(expectedText)}. Last markdown: ${JSON.stringify(lastMarkdown)}`);
}

export async function nextAnimationFrame(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
}

export async function readRect(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rectJson(rect);

    function rectJson(value) {
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height
      };
    }
  });
}

export async function assertWithinViewport(page, locator, label, margin = 0) {
  const rect = await readRect(locator);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`Cannot assert viewport bounds for ${label}; missing viewport size.`);
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`${label} has invalid geometry: ${JSON.stringify(rect)}`);
  if (
    rect.left < -margin ||
    rect.top < -margin ||
    rect.right > viewport.width + margin ||
    rect.bottom > viewport.height + margin
  ) {
    throw new Error(`${label} is outside viewport ${JSON.stringify(viewport)}: ${JSON.stringify(rect)}`);
  }
  return rect;
}

export async function assertIntersectsViewport(page, locator, label, margin = 0) {
  const rect = await readRect(locator);
  const viewport = page.viewportSize();
  if (!viewport) throw new Error(`Cannot assert viewport intersection for ${label}; missing viewport size.`);
  if (rect.width <= 0 || rect.height <= 0) throw new Error(`${label} has invalid geometry: ${JSON.stringify(rect)}`);
  const intersects =
    rect.right >= -margin &&
    rect.left <= viewport.width + margin &&
    rect.bottom >= -margin &&
    rect.top <= viewport.height + margin;
  if (!intersects) {
    throw new Error(`${label} is not visible in viewport ${JSON.stringify(viewport)}: ${JSON.stringify(rect)}`);
  }
  return rect;
}

export async function assertNoDocumentHorizontalOverflow(page, label = "document", tolerance = 2) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth
  }));
  const width = Math.max(metrics.bodyScrollWidth, metrics.docScrollWidth);
  const allowed = Math.max(metrics.bodyClientWidth, metrics.docClientWidth, metrics.innerWidth) + tolerance;
  if (width > allowed) {
    throw new Error(`${label} has horizontal overflow: ${JSON.stringify(metrics)}`);
  }
  return metrics;
}

export async function assertStablePageLayout(page, {
  critical = [],
  label = "page layout",
  margin = 8,
  visible = []
} = {}) {
  const overflow = await assertNoDocumentHorizontalOverflow(page, label, margin);
  const criticalRects = [];
  const visibleRects = [];

  for (const item of critical) {
    const entry = normalizeLayoutTarget(item, "critical element");
    criticalRects.push({
      label: entry.label,
      rect: roundRect(await assertWithinViewport(page, entry.locator, `${label} ${entry.label}`, margin))
    });
  }

  for (const item of visible) {
    const entry = normalizeLayoutTarget(item, "visible element");
    visibleRects.push({
      label: entry.label,
      rect: roundRect(await assertIntersectsViewport(page, entry.locator, `${label} ${entry.label}`, margin))
    });
  }

  const focus = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      activeTag: active?.tagName ?? "",
      activeRole: active?.getAttribute?.("role") ?? "",
      activeTestId: active?.closest?.("[data-testid]")?.getAttribute("data-testid") ?? "",
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  });

  return {
    critical: criticalRects,
    focus,
    label,
    overflow,
    visible: visibleRects
  };
}

export async function assertFocusWithin(locator, label = "focused region") {
  const state = await locator.evaluate((element) => {
    const active = element.ownerDocument?.activeElement;
    const containsActive = Boolean(active && element.contains(active));
    const hasFocusedDescendant = Boolean(element.querySelector?.(":focus"));
    const hasCodeMirrorFocus = Boolean(element.querySelector?.(".cm-focused") || element.classList?.contains("cm-focused"));
    return {
      activeClass: typeof active?.className === "string" ? active.className : "",
      activeRole: active?.getAttribute?.("role") ?? "",
      activeTag: active?.tagName ?? "",
      activeTestId: active?.closest?.("[data-testid]")?.getAttribute?.("data-testid") ?? "",
      containsActive,
      hasCodeMirrorFocus,
      hasFocusedDescendant
    };
  });
  if (!state.containsActive && !state.hasFocusedDescendant && !state.hasCodeMirrorFocus) {
    throw new Error(`${label} does not contain keyboard focus: ${JSON.stringify(state)}`);
  }
  return state;
}

export async function captureElementSnapshot({
  artifactRoot,
  deterministicTypography = true,
  locator,
  metadata = {},
  name,
  page,
  viewport,
  waitForStable = true
}) {
  if (!artifactRoot) throw new Error("captureElementSnapshot requires artifactRoot");
  if (!locator) throw new Error("captureElementSnapshot requires locator");
  const snapshotRoot = join(artifactRoot, "snapshots");
  const snapshotName = safeName(name || "element");
  const imagePath = join(snapshotRoot, `${snapshotName}.png`);
  const metadataPath = join(snapshotRoot, `${snapshotName}.json`);

  await mkdir(snapshotRoot, { recursive: true });
  await locator.waitFor({ state: "visible", timeout: 5_000 });
  const snapshotAttribute = "data-ui-harness-deterministic-snapshot";
  const previousSnapshotAttribute = deterministicTypography
    ? await locator.getAttribute(snapshotAttribute)
    : null;
  if (deterministicTypography) {
    await locator.evaluate((node, attribute) => node.setAttribute(attribute, "true"), snapshotAttribute);
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.setAttribute("data-ui-harness-deterministic-snapshot-style", "true");
      style.textContent = `
        [data-ui-harness-deterministic-snapshot],
        [data-ui-harness-deterministic-snapshot] *,
        [data-ui-harness-deterministic-snapshot] *::before,
        [data-ui-harness-deterministic-snapshot] *::after {
          -webkit-font-smoothing: antialiased !important;
          font-feature-settings: normal !important;
          font-kerning: none !important;
          font-optical-sizing: none !important;
          font-variant-ligatures: none !important;
          text-rendering: geometricPrecision !important;
        }
      `;
      document.head.appendChild(style);
    });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  let rect;
  try {
    rect = await readRect(locator);
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Cannot capture ${snapshotName}; invalid element geometry: ${JSON.stringify(rect)}`);
    }
    if (waitForStable) {
      await locator.screenshot({ path: imagePath });
    } else {
      await page.screenshot({
        animations: "disabled",
        clip: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        },
        path: imagePath
      });
    }
  } finally {
    if (deterministicTypography) {
      await locator.evaluate((node, payload) => {
        if (payload.previous === null) node.removeAttribute(payload.attribute);
        else node.setAttribute(payload.attribute, payload.previous);
      }, { attribute: snapshotAttribute, previous: previousSnapshotAttribute });
      await page.evaluate(() => {
        for (const style of document.querySelectorAll("[data-ui-harness-deterministic-snapshot-style]")) style.remove();
      });
    }
  }
  const currentViewport = typeof page?.viewportSize === "function" ? page.viewportSize() : null;
  const url = typeof page?.url === "function" ? page.url() : "";
  await writeFile(metadataPath, `${JSON.stringify({
    name: snapshotName,
    capturedAt: new Date().toISOString(),
    url,
    viewport: viewport ?? currentViewport,
    rect,
    image: imagePath,
    metadata
  }, null, 2)}\n`, "utf8");

  return {
    imagePath,
    metadataPath,
    rect,
    viewport: viewport ?? currentViewport
  };
}

export async function assertElementSnapshotBaseline(snapshot, baseline = {}) {
  if (!snapshot?.imagePath) throw new Error("assertElementSnapshotBaseline requires snapshot.imagePath");
  if (!snapshot?.metadataPath) throw new Error("assertElementSnapshotBaseline requires snapshot.metadataPath");
  const label = baseline.label || snapshot.name || "element snapshot";
  const [imageInfo, rawMetadata] = await Promise.all([
    stat(snapshot.imagePath),
    readFile(snapshot.metadataPath, "utf8")
  ]);
  if (imageInfo.size <= 0) {
    throw new Error(`${label} snapshot image is empty: ${snapshot.imagePath}`);
  }

  const metadata = JSON.parse(rawMetadata);
  const rect = snapshot.rect || metadata.rect;
  const viewport = snapshot.viewport || metadata.viewport;
  if (!rect || typeof rect.width !== "number" || typeof rect.height !== "number") {
    throw new Error(`${label} snapshot metadata is missing a valid rect: ${JSON.stringify(metadata.rect)}`);
  }
  if (metadata.image !== snapshot.imagePath) {
    throw new Error(`${label} snapshot metadata image path mismatch: ${JSON.stringify({ expected: snapshot.imagePath, actual: metadata.image })}`);
  }
  if (baseline.viewportName && viewport?.name !== baseline.viewportName) {
    throw new Error(`${label} snapshot viewport mismatch: ${JSON.stringify({ expected: baseline.viewportName, actual: viewport })}`);
  }

  const rectBaseline = baseline.rect || {};
  for (const [metric, expected] of Object.entries(rectBaseline)) {
    assertNumberInRange(rect[metric], expected, `${label} rect.${metric}`);
  }

  const actualMetadata = metadata.metadata || {};
  for (const [key, expected] of Object.entries(baseline.metadata || {})) {
    if (actualMetadata[key] !== expected) {
      throw new Error(`${label} snapshot metadata.${key} mismatch: ${JSON.stringify({ expected, actual: actualMetadata[key] })}`);
    }
  }
  for (const key of baseline.requiredMetadataKeys || []) {
    if (!(key in actualMetadata)) {
      throw new Error(`${label} snapshot metadata is missing required key: ${key}`);
    }
  }

  return {
    imageBytes: imageInfo.size,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    metadataName: metadata.name,
    rect: {
      left: Number(rect.left.toFixed(1)),
      top: Number(rect.top.toFixed(1)),
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1))
    },
    viewportName: viewport?.name || "",
    checkedRectMetrics: Object.keys(rectBaseline),
    checkedMetadataKeys: [
      ...Object.keys(baseline.metadata || {}),
      ...(baseline.requiredMetadataKeys || []).filter((key) => !(key in (baseline.metadata || {})))
    ]
  };
}

export async function writeHarnessResultArtifact({
  artifactRoot,
  cdpUrl = "",
  consoleEvents = [],
  consoleMessages = [],
  devLog = [],
  error = null,
  name = "ui",
  page = null,
  result = null,
  status = "passed"
}) {
  if (!artifactRoot) throw new Error("writeHarnessResultArtifact requires artifactRoot");
  await mkdir(artifactRoot, { recursive: true });
  const manifest = buildHarnessResultManifest({
    artifactRoot,
    cdpUrl,
    consoleEvents,
    consoleMessages,
    devLog,
    error,
    name,
    page,
    result,
    status
  });
  const manifestPath = join(artifactRoot, "harness-result.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath };
}

export async function readHarnessResultArtifactsSince({
  artifactParent = join(process.cwd(), "artifacts", "ui-smoke"),
  startedAt = 0
} = {}) {
  const entries = await readdir(artifactParent, { withFileTypes: true }).catch(() => []);
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(artifactParent, entry.name, "harness-result.json");
    const info = await stat(manifestPath).catch(() => null);
    if (!info || info.mtimeMs < startedAt) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifests.push({
      dir: entry.name,
      manifest,
      manifestPath,
      mtimeMs: info.mtimeMs
    });
  }
  return manifests.sort((a, b) => a.mtimeMs - b.mtimeMs);
}

export function assertHarnessViewportCoverage(result, expectedViewports = selectedViewports()) {
  const expectedNames = expectedViewports.map((viewport) => viewport.name);
  const observedNames = observedViewportNames(result);
  const missing = expectedNames.filter((name) => !observedNames.includes(name));
  if (missing.length > 0) {
    throw new Error(`UI smoke did not cover required viewport(s): ${missing.join(", ")}. Observed: ${observedNames.join(", ") || "none"}`);
  }
  return {
    expected: expectedNames,
    observed: observedNames
  };
}

export function assertNoHarnessConsoleErrors(manifest, label = "UI harness") {
  const issues = consoleIssuesFromManifest(manifest);
  if (issues.length > 0) {
    throw new Error(`${label} emitted console/page errors: ${JSON.stringify(issues.slice(0, 10))}`);
  }
  return {
    consoleCount: manifest?.logs?.consoleCount ?? 0,
    consoleErrorCount: 0
  };
}

export function assertRectsDoNotOverlap(a, b, label) {
  const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  if (overlap) throw new Error(`${label} overlap: ${JSON.stringify({ a, b })}`);
}

function normalizeLayoutTarget(item, fallbackLabel) {
  if (!item) throw new Error(`Missing ${fallbackLabel} for stable layout assertion.`);
  if (typeof item.evaluate === "function") return { label: fallbackLabel, locator: item };
  if (item.locator && typeof item.locator.evaluate === "function") {
    return { label: item.label || fallbackLabel, locator: item.locator };
  }
  throw new Error(`Invalid ${fallbackLabel} for stable layout assertion.`);
}

function roundRect(rect) {
  return {
    top: Number(rect.top.toFixed(1)),
    right: Number(rect.right.toFixed(1)),
    bottom: Number(rect.bottom.toFixed(1)),
    left: Number(rect.left.toFixed(1)),
    width: Number(rect.width.toFixed(1)),
    height: Number(rect.height.toFixed(1))
  };
}

function assertNumberInRange(actual, expected, label) {
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    throw new Error(`${label} is not a finite number: ${actual}`);
  }
  if (typeof expected === "number") {
    if (actual !== expected) {
      throw new Error(`${label} expected ${expected}, got ${actual}`);
    }
    return;
  }
  const min = typeof expected?.min === "number" ? expected.min : -Infinity;
  const max = typeof expected?.max === "number" ? expected.max : Infinity;
  if (actual < min || actual > max) {
    throw new Error(`${label} outside baseline range: ${JSON.stringify({ actual, min, max })}`);
  }
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeCsv(path, fields, records) {
  const lines = [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field] ?? "")).join(","))
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

export function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function workspacePath(group, dbFolder, ...parts) {
  return ["databases", group, dbFolder, ...parts].join("/");
}

async function ensureAppLifecycle(cdpUrl, devLog, options = {}) {
  if (options.explicitCdpUrl && await canReachCdp(cdpUrl)) return null;
  if (process.env.LOTION_UI_HARNESS_NO_AUTOSTART === "1") {
    throw new Error(`Cannot reach Lotion CDP at ${cdpUrl}. Start npm run dev or unset LOTION_UI_HARNESS_NO_AUTOSTART.`);
  }
  const attempts = 2;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const child = spawn("npm", ["run", "dev"], {
      cwd: process.cwd(),
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        LOTION_CDP_PORT: String(options.cdpPort ?? cdpPortFromUrl(cdpUrl) ?? 9222),
        LOTION_DEV_SKIP_STRAY_KILL: options.explicitCdpUrl ? process.env.LOTION_DEV_SKIP_STRAY_KILL : "1",
        LOTION_ELECTRON_USER_DATA_DIR: options.artifactRoot
          ? join(options.artifactRoot, "electron-user-data")
          : process.env.LOTION_ELECTRON_USER_DATA_DIR,
        LOTION_VITE_PORT: String(options.vitePort ?? process.env.LOTION_VITE_PORT ?? 5173)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk) => devLog.push(chunk.toString()));
    child.stderr?.on("data", (chunk) => devLog.push(chunk.toString()));
    child.on("exit", (code, signal) => {
      devLog.push(`[dev exit] attempt=${attempt} code=${code ?? ""} signal=${signal ?? ""}`);
    });
    try {
      await waitForCdp(cdpUrl, 60_000);
      return child;
    } catch (error) {
      devLog.push(`[cdp startup] attempt=${attempt}/${attempts} failed: ${String(error?.message || error)}`);
      await stopDevProcess(child);
      if (attempt === attempts) throw error;
    }
  }
  throw new Error(`Could not start Lotion CDP at ${cdpUrl}.`);
}

async function allocateUiHarnessPorts() {
  const vitePort = await getFreePort();
  const cdpPort = await getFreePort();
  return { cdpPort, vitePort };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate a local TCP port.")));
        return;
      }
      const { port } = address;
      // Chromium treats 65535 as the "pick a random debugging port" sentinel,
      // so the URL selected by the harness would no longer match the actual CDP
      // listener. Let the kernel choose again instead.
      if (port === 65_535) {
        server.close(() => getFreePort().then(resolve, reject));
        return;
      }
      server.close(() => resolve(port));
    });
  });
}

function cdpPortFromUrl(cdpUrl) {
  try {
    const parsed = new URL(cdpUrl);
    return parsed.port ? Number(parsed.port) : undefined;
  } catch {
    return undefined;
  }
}

async function waitForCdp(cdpUrl, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canReachCdp(cdpUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for Lotion CDP at ${cdpUrl}.`);
}

async function canReachCdp(cdpUrl) {
  try {
    const response = await fetch(`${cdpUrl.replace(/\/$/, "")}/json/version`, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForRendererPage(browser, timeoutMs, vitePort) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const context of browser.contexts()) {
      const pages = context.pages();
      const renderer =
        pages.find((candidate) => isLotionRendererUrl(candidate.url(), vitePort)) ||
        pages.find((candidate) => isLikelyRendererUrl(candidate.url()));
      if (renderer) return renderer;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("No Lotion renderer page is open.");
}

function isLotionRendererUrl(url, vitePort) {
  if (!vitePort) return false;
  return url.includes(`127.0.0.1:${vitePort}`) || url.includes(`localhost:${vitePort}`);
}

function isLikelyRendererUrl(url) {
  return /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\//.test(url);
}

export async function captureFailureArtifacts({ artifactRoot, consoleEvents = [], consoleMessages, devLog, error, name = "ui", page }) {
  await mkdir(artifactRoot, { recursive: true });
  const artifactPaths = failureArtifactPaths(artifactRoot);
  const url = typeof page.url === "function" ? page.url() : "";
  const viewport = typeof page.viewportSize === "function" ? page.viewportSize() : null;
  const errorText = `${error?.stack || error?.message || error}\n`;

  await page.screenshot({ path: artifactPaths.screenshot, fullPage: true }).catch(() => undefined);
  await writeFile(artifactPaths.dom, await page.content().catch(() => ""), "utf8");
  await writeFile(artifactPaths.console, `${consoleMessages.join("\n")}\n`, "utf8");
  await writeFile(artifactPaths.consoleJson, `${JSON.stringify(normalizeConsoleEvents(consoleEvents, consoleMessages), null, 2)}\n`, "utf8");
  await writeFile(artifactPaths.devLog, `${devLog.join("")}\n`, "utf8");
  await writeFile(artifactPaths.error, errorText, "utf8");
  await writeFile(artifactPaths.state, `${JSON.stringify({ url, viewport }, null, 2)}\n`, "utf8");
  await writeFile(artifactPaths.metadata, `${JSON.stringify({
    name,
    capturedAt: new Date().toISOString(),
    url,
    viewport,
    error: {
      message: error?.message || String(error),
      stack: error?.stack || ""
    },
    artifacts: artifactPaths
  }, null, 2)}\n`, "utf8");
  await writeFile(artifactPaths.readme, failureArtifactReadme({ artifactPaths, error, name, url, viewport }), "utf8");
}

function buildHarnessResultManifest({ artifactRoot, cdpUrl, consoleEvents, consoleMessages, devLog, error, name, page, result, status }) {
  const url = typeof page?.url === "function" ? page.url() : "";
  const viewport = typeof page?.viewportSize === "function" ? page.viewportSize() : null;
  const expectedViewports = selectedViewports().map((candidate) => ({
    name: candidate.name,
    width: candidate.width,
    height: candidate.height
  }));
  const observedViewports = observedViewportNames(result);
  const normalizedConsoleEvents = normalizeConsoleEvents(consoleEvents, consoleMessages);
  const consoleIssues = normalizedConsoleEvents.filter(isConsoleIssue);
  return {
    name,
    status,
    capturedAt: new Date().toISOString(),
    artifactRoot,
    cdpUrl,
    url,
    viewport,
    expectedViewports,
    observedViewports,
    coverage: {
      requiredViewportNames: expectedViewports.map((candidate) => candidate.name),
      observedViewportNames: observedViewports,
      missingViewportNames: expectedViewports
        .map((candidate) => candidate.name)
        .filter((candidate) => !observedViewports.includes(candidate))
    },
    result: summarizeHarnessResult(result),
    logs: {
      consoleCount: normalizedConsoleEvents.length,
      consoleErrorCount: consoleIssues.length,
      recentConsole: consoleMessages.slice(-20),
      recentConsoleEvents: normalizedConsoleEvents.slice(-20),
      consoleIssues: consoleIssues.slice(-20),
      devLogBytes: devLog.join("").length
    },
    error: error ? {
      message: error.message || String(error),
      stack: error.stack || ""
    } : null,
    failureArtifacts: error
      ? page
        ? failureArtifactPaths(artifactRoot)
        : startupFailureArtifactPaths(artifactRoot)
      : null
  };
}

function consoleIssuesFromManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return [];
  const logs = manifest.logs || {};
  if (Array.isArray(logs.consoleIssues)) return logs.consoleIssues.filter(isConsoleIssue);
  const events = Array.isArray(logs.recentConsoleEvents) ? logs.recentConsoleEvents : [];
  const parsedMessages = Array.isArray(logs.recentConsole) ? logs.recentConsole.map(parseConsoleMessage) : [];
  return [...events, ...parsedMessages].filter(isConsoleIssue);
}

function consoleIssuesFromEvents(consoleEvents = [], consoleMessages = []) {
  return normalizeConsoleEvents(consoleEvents, consoleMessages).filter(isConsoleIssue);
}

function normalizeConsoleEvents(consoleEvents = [], consoleMessages = []) {
  if (Array.isArray(consoleEvents) && consoleEvents.length > 0) {
    return consoleEvents.map((event) => ({
      type: String(event?.type || "log"),
      text: String(event?.text || ""),
      location: event?.location || null,
      stack: event?.stack || "",
      timestamp: event?.timestamp || ""
    }));
  }
  return consoleMessages.map(parseConsoleMessage);
}

function parseConsoleMessage(message) {
  const text = String(message || "");
  const match = /^\[([^\]]+)\]\s*(.*)$/s.exec(text);
  return {
    type: match?.[1] || "log",
    text: match?.[2] || text,
    location: null,
    stack: "",
    timestamp: ""
  };
}

function isConsoleIssue(event) {
  const type = String(event?.type || "").toLowerCase();
  return type === "error" || type === "pageerror";
}

function formatConsoleEvent(event) {
  const detail = event?.stack || event?.text || "";
  return `[${event?.type || "log"}] ${detail}`;
}

function summarizeHarnessResult(result) {
  if (!result || typeof result !== "object") return result ?? null;
  const summary = {
    type: Array.isArray(result) ? "array" : "object",
    keys: Object.keys(result).slice(0, 40),
    status: typeof result.status === "string" ? result.status : undefined,
    viewportCount: observedViewportNames(result).length
  };
  if (typeof result.totalMs === "number") summary.totalMs = result.totalMs;
  if (typeof result.selectedCount === "number") summary.selectedCount = result.selectedCount;
  if (result.artifactContract && typeof result.artifactContract === "object") {
    summary.artifactContract = summarizeArtifactContract(result.artifactContract);
  }
  if (isRealWorkspaceResult(result)) {
    summary.realWorkspaceEvidence = summarizeRealWorkspaceEvidence(result);
  }
  if (Array.isArray(result.results)) {
    summary.results = result.results.slice(0, 40).map((entry) => ({
      name: entry?.name,
      status: entry?.status,
      elapsedMs: entry?.elapsedMs,
      artifactContract: entry?.harnessManifest?.artifactContract || null
    }));
  }
  if (result.artifactIndex && typeof result.artifactIndex === "object") {
    summary.artifactIndex = summarizeUiSuiteArtifactIndex(result.artifactIndex);
  }
  return summary;
}

function summarizeArtifactContract(contract) {
  return {
    status: contract.status,
    ...(typeof contract.reproduceCommand === "string" ? { reproduceCommand: contract.reproduceCommand } : {}),
    ...(typeof contract.workspaceName === "string" ? { workspaceName: contract.workspaceName } : {}),
    ...(contract.sourceFingerprint && typeof contract.sourceFingerprint === "object"
      ? { sourceFingerprint: summarizeWorkspaceFingerprint(contract.sourceFingerprint) }
      : {}),
    ...(typeof contract.sourceUnchanged === "boolean" ? { sourceUnchanged: contract.sourceUnchanged } : {}),
    ...(typeof contract.staleToggleTargetMissing === "boolean" ? { staleToggleTargetMissing: contract.staleToggleTargetMissing } : {}),
    ...(typeof contract.seededToggleProvenance === "string" ? { seededToggleProvenance: contract.seededToggleProvenance } : {}),
    expectedViewportNames: Array.isArray(contract.expectedViewportNames) ? contract.expectedViewportNames : [],
    observedViewportNames: Array.isArray(contract.observedViewportNames) ? contract.observedViewportNames : [],
    snapshotCount: typeof contract.snapshotCount === "number"
      ? contract.snapshotCount
      : Array.isArray(contract.snapshots) ? contract.snapshots.length : 0,
    ...(typeof contract.perceptualBaselineCount === "number" ? { perceptualBaselineCount: contract.perceptualBaselineCount } : {}),
    ...(typeof contract.diagnosticCount === "number" ? { diagnosticCount: contract.diagnosticCount } : {}),
    ...(typeof contract.renderThresholdMs === "number" ? { renderThresholdMs: contract.renderThresholdMs } : {}),
    ...(typeof contract.coldStartRenderThresholdMs === "number" ? { coldStartRenderThresholdMs: contract.coldStartRenderThresholdMs } : {}),
    ...(typeof contract.maxRenderMs === "number" ? { maxRenderMs: contract.maxRenderMs } : {}),
    ...(Array.isArray(contract.renderTimings)
      ? {
        renderTimings: contract.renderTimings.slice(0, 40).map((entry) => ({
          viewport: entry?.viewport,
          embeddedViews: entry?.embeddedViews,
          rowsPerDatabase: entry?.rowsPerDatabase,
          renderMs: entry?.renderMs
        }))
      }
      : {}),
    snapshots: Array.isArray(contract.snapshots)
      ? contract.snapshots.slice(0, 12).map(summarizeArtifactSnapshot)
      : []
  };
}

function isRealWorkspaceResult(result) {
  return result?.sourceFingerprint?.kind === "lotion-real-workspace-fingerprint";
}

function summarizeRealWorkspaceEvidence(result) {
  return {
    sourceIdentity: {
      workspaceName: result.sourceIdentity?.workspaceName,
      directoryName: result.sourceIdentity?.directoryName
    },
    sourceFingerprint: summarizeWorkspaceFingerprint(result.sourceFingerprint),
    cloneFingerprint: summarizeWorkspaceFingerprint(result.cloneFingerprint),
    isolation: {
      mode: result.isolation?.mode,
      symlinksAllowed: result.isolation?.symlinksAllowed === true,
      byteIdenticalAtClone: result.isolation?.byteIdenticalAtClone === true
    },
    sourceSafety: {
      unchanged: result.sourceSafety?.unchanged === true,
      before: summarizeWorkspaceFingerprint(result.sourceSafety?.before),
      after: summarizeWorkspaceFingerprint(result.sourceSafety?.after)
    },
    viewports: Array.isArray(result.viewports) ? result.viewports.map((entry) => ({
      viewport: entry?.viewport,
      workspaceName: entry?.workspaceName,
      activeWorkspaceWasClone: entry?.activeWorkspaceWasClone === true,
      homeOpenMs: entry?.homeOpenMs,
      databaseOpenMs: entry?.databaseOpenMs,
      databaseState: {
        rowCountText: entry?.databaseState?.rowCountText,
        renderedRowCount: entry?.databaseState?.renderedRowCount,
        firstRenderedRowId: entry?.databaseState?.firstRenderedRowId,
        virtualSpacerCount: entry?.databaseState?.virtualSpacerCount,
        virtualized: entry?.databaseState?.virtualized === true,
        tableScrollHeight: entry?.databaseState?.tableScrollHeight,
        tableClientHeight: entry?.databaseState?.tableClientHeight,
        tableScrollTop: entry?.databaseState?.tableScrollTop,
        documentHorizontalOverflowPx: entry?.databaseState?.documentHorizontalOverflowPx
      }
    })) : []
  };
}

function summarizeWorkspaceFingerprint(fingerprint) {
  if (!fingerprint || typeof fingerprint !== "object") return null;
  return {
    kind: fingerprint.kind,
    workspaceName: fingerprint.workspaceName,
    fileCount: fingerprint.fileCount,
    directoryCount: fingerprint.directoryCount,
    totalBytes: fingerprint.totalBytes,
    sha256: fingerprint.sha256
  };
}

function summarizeArtifactSnapshot(snapshot) {
  const summary = {
    viewport: snapshot.viewport,
    imagePath: snapshot.imagePath,
    metadataPath: snapshot.metadataPath,
    imageBytes: snapshot.imageBytes
  };
  for (const key of [
    "horizontalOverflowPx",
    "backlinkItems",
    "categoryCount",
    "detailCount",
    "expectedTocItems",
    "headerActionCount",
    "historyCount",
    "diffLineCount",
    "historyItems",
    "issueRows",
    "loadMoreShown",
    "messageCount",
    "openMs",
    "openedCount",
    "pathButtons",
    "phaseCount",
    "pluginRows",
    "providerRows",
    "resultCount",
    "rowCount",
    "searchAiPluginHosts",
    "scrollWidth",
    "sourceLinkCount",
    "surfaceCount",
    "viewportWidth",
    "visibleRowCount",
    "tokenCount",
    "toggleCount",
    "loadedImageCount",
    "documentHorizontalOverflowPx"
  ]) {
    if (typeof snapshot[key] === "number") summary[key] = snapshot[key];
  }
  for (const key of ["phase", "activeTabText", "failText", "headerTitle", "rowCountText", "selectedSource", "previewLabel", "provenance", "title", "toggleSummary"]) {
    if (typeof snapshot[key] === "string" && snapshot[key]) summary[key] = snapshot[key];
  }
  if (snapshot.summary && typeof snapshot.summary === "object") {
    summary.summary = sanitizeSummaryRecord(snapshot.summary);
  }
  if (snapshot.issueKinds && typeof snapshot.issueKinds === "object") {
    summary.issueKinds = sanitizeSummaryRecord(snapshot.issueKinds);
  }
  if (snapshot.overlay && typeof snapshot.overlay === "object") {
    summary.overlay = summarizeNotionImportOverlay(snapshot.overlay);
  }
  if (typeof snapshot.collapsed === "boolean") summary.collapsed = snapshot.collapsed;
  if (typeof snapshot.reexpanded === "boolean") summary.reexpanded = snapshot.reexpanded;
  if (Array.isArray(snapshot.phases)) summary.phases = snapshot.phases;
  if (Array.isArray(snapshot.visibleTabs)) summary.visibleTabs = snapshot.visibleTabs;
  if (snapshot.previews && typeof snapshot.previews === "object") {
    summary.previews = snapshot.previews;
  }
  if (typeof snapshot.sourceHidden === "boolean") summary.sourceHidden = snapshot.sourceHidden;
  if (snapshot.perceptualBaseline && typeof snapshot.perceptualBaseline === "object") {
    summary.perceptualBaseline = summarizePerceptualBaseline(snapshot.perceptualBaseline);
  }
  return summary;
}

function summarizePerceptualBaseline(baseline) {
  return {
    kind: baseline.kind,
    status: baseline.status,
    policyPath: baseline.policyPath,
    actualPath: baseline.actualPath,
    expectedPath: baseline.expectedPath,
    diffPath: baseline.diffPath,
    metadataPath: baseline.metadataPath,
    dimensionsMatch: baseline.dimensionsMatch === true,
    diffPixels: baseline.diffPixels,
    diffRatio: baseline.diffRatio,
    maxDiffPixels: baseline.maxDiffPixels,
    maxDiffRatio: baseline.maxDiffRatio,
    threshold: baseline.threshold,
    includeAA: baseline.includeAA === true,
    policy: baseline.policy && typeof baseline.policy === "object" ? baseline.policy : null
  };
}

function sanitizeSummaryRecord(record) {
  const result = {};
  for (const [key, value] of Object.entries(record || {})) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
  }
  return result;
}

function summarizeNotionImportOverlay(overlay) {
  const result = {};
  for (const key of ["ariaModal", "modalRole", "title"]) {
    if (typeof overlay[key] === "string") result[key] = overlay[key];
  }
  for (const key of ["backdropCoversViewport", "centerInsideModal", "modalContainsPageTitle", "visible"]) {
    if (typeof overlay[key] === "boolean") result[key] = overlay[key];
  }
  return result;
}

function summarizeUiSuiteArtifactIndex(artifactIndex) {
  return {
    jsonPath: artifactIndex.jsonPath,
    markdownPath: artifactIndex.markdownPath,
    contract: artifactIndex.contract,
    summary: artifactIndex.summary
  };
}

function observedViewportNames(result) {
  if (!result || typeof result !== "object") return [];
  const names = [];
  const entries = [
    ...(Array.isArray(result.viewports) ? result.viewports : []),
    ...(Array.isArray(result.results) ? result.results : [])
  ];
  for (const entry of entries) {
    const name = viewportNameFromEntry(entry);
    if (name && !names.includes(name)) names.push(name);
  }
  const contractNames = Array.isArray(result.artifactContract?.observedViewportNames)
    ? result.artifactContract.observedViewportNames
    : [];
  for (const name of contractNames) {
    if (typeof name === "string" && name && !names.includes(name)) names.push(name);
  }
  return names;
}

function viewportNameFromEntry(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  if (typeof entry.name === "string") return entry.name;
  if (typeof entry.viewport === "string") return entry.viewport;
  if (entry.viewport && typeof entry.viewport.name === "string") return entry.viewport.name;
  return "";
}

function failureArtifactReadme({ artifactPaths, error, name, url, viewport }) {
  const viewportText = viewport ? `${viewport.width}x${viewport.height}` : "unknown";
  const errorMessage = error?.message || String(error);
  return `# Lotion UI Smoke Failure

- Smoke: ${name}
- URL: ${url || "unknown"}
- Viewport: ${viewportText}
- Error: ${errorMessage}

Artifacts:

- Screenshot: ${artifactPaths.screenshot}
- DOM snapshot: ${artifactPaths.dom}
- Console log: ${artifactPaths.console}
- Structured console log: ${artifactPaths.consoleJson}
- Dev log: ${artifactPaths.devLog}
- Error stack: ${artifactPaths.error}
- State: ${artifactPaths.state}
- Metadata: ${artifactPaths.metadata}
`;
}

function failureArtifactPaths(artifactRoot) {
  return {
    screenshot: join(artifactRoot, "failure.png"),
    dom: join(artifactRoot, "dom.html"),
    console: join(artifactRoot, "console.log"),
    consoleJson: join(artifactRoot, "console.json"),
    devLog: join(artifactRoot, "dev.log"),
    error: join(artifactRoot, "error.txt"),
    state: join(artifactRoot, "state.json"),
    metadata: join(artifactRoot, "metadata.json"),
    readme: join(artifactRoot, "README.md")
  };
}

function startupFailureArtifactPaths(artifactRoot) {
  return {
    devLog: join(artifactRoot, "dev.log"),
    error: join(artifactRoot, "error.txt"),
    readme: join(artifactRoot, "README.md")
  };
}

async function writeStartupFailureArtifacts({ artifactRoot, devLog, error, name }) {
  const paths = startupFailureArtifactPaths(artifactRoot);
  await writeFile(paths.devLog, devLog.join(""), "utf8");
  await writeFile(paths.error, `${error?.stack || error?.message || String(error)}\n`, "utf8");
  await writeFile(paths.readme, [
    `# ${name} startup failure`,
    "",
    `- Error: ${error?.message || String(error)}`,
    `- Dev log: ${paths.devLog}`,
    `- Error stack: ${paths.error}`,
    ""
  ].join("\n"), "utf8");
}

async function stopDevProcess(child) {
  if (!child) return;
  signalDevProcess(child, "SIGINT");
  if (process.platform !== "win32" && child.pid) {
    const deadline = Date.now() + 3_000;
    while (isDevProcessGroupAlive(child.pid) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (isDevProcessGroupAlive(child.pid)) signalDevProcess(child, "SIGKILL");
    return;
  }
  if (child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      signalDevProcess(child, "SIGKILL");
      resolve(undefined);
    }, 3_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

function isDevProcessGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    if (error?.code === "EPERM") return false;
    throw error;
  }
}

function signalDevProcess(child, signal) {
  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, signal);
    } else if (child.exitCode === null) {
      child.kill(signal);
    }
  } catch (error) {
    if (error?.code === "ESRCH") return;
    if (error?.code === "EPERM" && child.exitCode === null) {
      child.kill(signal);
      return;
    }
    throw error;
  }
}

function safeName(value) {
  return String(value || "ui").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "ui";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
