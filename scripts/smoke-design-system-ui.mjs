#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertDesignSystemArtifactContract } from "./lib/design-system-artifacts.mjs";
import {
  assertHarnessViewportCoverage,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertNoHarnessConsoleErrors,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const EXPECTED_TOKENS = {
  paper: "#ffffff",
  sand: "#f7f7f4",
  vellum: "#f0f1ee",
  kraft: "#e7e9e3"
};

const result = await withLotionUIHarness("design-system-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page }) => {
  const fixture = await createDesignSystemFixture();
  const expectedViewports = selectedViewports();
  const viewports = [];

  await forEachViewport(page, expectedViewports, async (viewport) => {
    await openWorkspace(fixture.root);
    await page.getByText(fixture.pageTitle).first().waitFor({ state: "visible", timeout: 8_000 });
    await openDesignSystemLab(page);

    const lab = page.locator('[data-testid="design-system-lab"]').first();
    const toolbar = page.locator(".lotion-ui-toolbar").first();
    const tokens = page.locator(".design-token-grid").first();
    const patterns = page.locator(".design-pattern-grid").first();
    await lab.waitFor({ state: "visible", timeout: 8_000 });

    await assertNoDocumentHorizontalOverflow(page, `design system ${viewport.name}`, 8);
    await lab.scrollIntoViewIfNeeded();
    await assertIntersectsViewport(page, lab, `design system lab ${viewport.name}`, 8);
    await toolbar.scrollIntoViewIfNeeded();
    await assertIntersectsViewport(page, toolbar, `design system toolbar ${viewport.name}`, 8);
    await tokens.scrollIntoViewIfNeeded();
    await assertIntersectsViewport(page, tokens, `design system tokens ${viewport.name}`, 8);
    await patterns.scrollIntoViewIfNeeded();
    await assertIntersectsViewport(page, patterns, `design system patterns ${viewport.name}`, 8);
    await assertNoDocumentHorizontalOverflow(page, `design system scrolled ${viewport.name}`, 8);

    const themeState = await assertDesignSystemTheme(page);
    const controlState = await assertDesignSystemControls(page);
    const layoutState = await assertDesignSystemLayout(page, viewport.name);
    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: lab,
      metadata: {
        controlState,
        layoutState,
        phase: "design-system",
        themeState,
        viewport: viewport.name
      },
      name: `design-system-${viewport.name}`,
      page,
      viewport
    });

    viewports.push({
      viewport,
      controlState,
      layoutState,
      themeState,
      snapshot
    });
  });

  const summary = {
    artifactRoot,
    cdpUrl,
    status: "passed",
    viewports
  };
  summary.viewportCoverage = assertHarnessViewportCoverage(summary);
  summary.artifactContract = await assertDesignSystemArtifactContract(summary, {
    expectedViewportNames: expectedViewports.map((viewport) => viewport.name)
  });
  return summary;
});

assertHarnessViewportCoverage(result);
const manifestPath = join(result.artifactRoot, "harness-result.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.status !== "passed") {
  throw new Error(`Design system manifest should record a passed run: ${JSON.stringify(manifest)}`);
}
assertNoHarnessConsoleErrors(manifest, "design-system-ui");

console.log(JSON.stringify({ ...result, harnessManifest: manifestPath }, null, 2));

async function openDesignSystemLab(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent("lotion:open-manage", { detail: { kind: "design-system" } }));
  });
  await page.locator('[data-testid="design-system-lab"]').first().waitFor({ state: "visible", timeout: 8_000 });
}

async function assertDesignSystemTheme(page) {
  const state = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const panel = document.querySelector(".lotion-ui-panel");
    const sourceCard = document.querySelector(".lotion-ui-source-card");
    const primary = document.querySelector(".lotion-ui-button.primary");
    const iconButton = document.querySelector(".lotion-ui-icon-button");
    return {
      tokens: {
        paper: root.getPropertyValue("--paper").trim(),
        sand: root.getPropertyValue("--sand").trim(),
        vellum: root.getPropertyValue("--vellum").trim(),
        kraft: root.getPropertyValue("--kraft").trim(),
        accent: root.getPropertyValue("--accent").trim()
      },
      panel: stylesFor(panel),
      sourceCard: stylesFor(sourceCard),
      primary: stylesFor(primary),
      iconButton: stylesFor(iconButton)
    };

    function stylesFor(element) {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
        display: style.display
      };
    }
  });
  for (const [key, expected] of Object.entries(EXPECTED_TOKENS)) {
    const actual = normalizeColor(state.tokens[key]);
    if (actual !== expected) {
      throw new Error(`Expected ${key} token ${expected}, got ${state.tokens[key]} (${actual})`);
    }
  }
  const accent = normalizeColor(state.tokens.accent);
  if (!/^#[0-9a-f]{6}$/.test(accent)) {
    throw new Error(`Accent token should resolve to a concrete color: ${JSON.stringify(state.tokens)}`);
  }
  assertBackground(state.panel, EXPECTED_TOKENS.paper, "panel");
  assertBackground(state.sourceCard, EXPECTED_TOKENS.paper, "source card");
  if (!state.primary || normalizeColor(state.primary.backgroundColor) !== accent) {
    throw new Error(`Primary button should use accent background: ${JSON.stringify(state.primary)}`);
  }
  if (!state.iconButton || normalizeColor(state.iconButton.backgroundColor) !== "transparent") {
    throw new Error(`Icon button should stay quiet/transparent: ${JSON.stringify(state.iconButton)}`);
  }
  return state;
}

async function assertDesignSystemControls(page) {
  const primary = page.locator(".lotion-ui-button.primary").first();
  await primary.focus();
  const focusState = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      activeClass: typeof active?.className === "string" ? active.className : "",
      activeText: active?.textContent?.trim() ?? "",
      isPrimary: active?.classList?.contains("primary") === true,
      outlineColor: active ? getComputedStyle(active).outlineColor : ""
    };
  });
  if (!focusState.isPrimary || focusState.activeText !== "New page") {
    throw new Error(`Primary action did not receive keyboard focus: ${JSON.stringify(focusState)}`);
  }
  const labels = await page.locator(".lotion-ui-status-pill").evaluateAll((items) => items.map((item) => item.textContent?.trim()));
  for (const expected of ["Readable", "Dense", "Tokenized", "Local"]) {
    if (!labels.includes(expected)) throw new Error(`Missing design system status pill ${expected}: ${JSON.stringify(labels)}`);
  }
  return { focusState, statusPills: labels };
}

async function assertDesignSystemLayout(page, viewportName) {
  const state = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const selectorEntries = [
      ["lab", '[data-testid="design-system-lab"]'],
      ["toolbar", ".lotion-ui-toolbar"],
      ["tokenGrid", ".design-token-grid"],
      ["controlGrid", ".design-control-grid"],
      ["patternGrid", ".design-pattern-grid"],
      ["sourceCard", ".lotion-ui-source-card"]
    ];
    const rects = Object.fromEntries(selectorEntries.map(([key, selector]) => {
      const element = document.querySelector(selector);
      if (!element) return [key, null];
      const rect = element.getBoundingClientRect();
      return [key, {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      }];
    }));
    return { rects, viewport };
  });
  for (const [key, rect] of Object.entries(state.rects)) {
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Design system ${key} missing/empty geometry on ${viewportName}: ${JSON.stringify(rect)}`);
    }
    if (rect.left < -8 || rect.right > state.viewport.width + 8) {
      throw new Error(`Design system ${key} overflows horizontally on ${viewportName}: ${JSON.stringify({ rect, viewport: state.viewport })}`);
    }
  }
  return state;
}

function assertBackground(surface, expected, label) {
  if (!surface) throw new Error(`Missing ${label} surface.`);
  const actual = normalizeColor(surface.backgroundColor);
  if (actual !== expected) {
    throw new Error(`Expected ${label} background ${expected}, got ${surface.backgroundColor} (${actual})`);
  }
}

function normalizeColor(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(text);
  if (hex) return `#${hex[1]}`;
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/.exec(text);
  if (!rgb) return text;
  const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (alpha === 0) return "transparent";
  return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, "0")).join("")}`;
}

async function createDesignSystemFixture() {
  const root = await mkdtemp(join(tmpdir(), "lotion-design-system-"));
  const now = "2026-06-16T00:00:00.000Z";
  const pageId = "pg_design_system_home";
  const pageTitle = "Design System Smoke Home";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const bodyPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_design_system_smoke",
    name: "Design System Smoke",
    pages: [pageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "path", name: "Path", type: "text" }
    ]
  });
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId: PAGES_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds: ["title", "path", "icon"],
    fieldOrder: ["title", "path", "icon"],
    wrapFieldIds: ["title", "path", "icon"],
    sorts: [],
    filters: []
  });
  await writeCsv(join(pagesDir, "data.csv"), ["id", "created_time", "updated_time", "title", "kind", "body_path", "icon", "path"], [
    {
      id: pageId,
      created_time: now,
      updated_time: now,
      title: pageTitle,
      kind: "page",
      body_path: bodyPath,
      icon: "emoji:🎨",
      path: serializePathValue(["Testing", pageTitle])
    }
  ]);
  await writeFile(join(root, bodyPath), `# ${pageTitle}\n\nDesign system smoke fixture.\n`, "utf8");
  return { root, pageId, pageTitle };
}
