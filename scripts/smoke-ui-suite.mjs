#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoHarnessConsoleErrors,
  readHarnessResultArtifactsSince,
  selectedViewports,
  setLotionLocale,
  withLotionUIHarness
} from "./ui-harness.mjs";
import { writeUiSuiteArtifactIndex } from "./lib/ui-suite-artifacts.mjs";
import { smokeTempWorkspaceNeedles } from "./smoke-workspace-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));

const suite = [
  ["UI harness foundation", "smoke-ui-harness-foundation.mjs"],
  ["Notion import audit UI", "smoke-notion-import-ui.mjs"],
  ["Search popup UI", "smoke-search-ui.mjs"],
  ["Search result title UI", "smoke-search-title-ui.mjs"],
  ["Search & AI UI", "smoke-search-ai-ui.mjs"],
  ["Embedded view UI", "smoke-embedded-view-ui.mjs"],
  ["Editor scroll UI", "smoke-editor-scroll-ui.mjs"],
  ["Editor regression UI", "smoke-editor-regression-ui.mjs"],
  ["Editor link click UI", "smoke-editor-link-click-ui.mjs"],
  ["Navigation anchor UI", "smoke-navigation-anchor-ui.mjs"],
  ["Sidebar navigation UI", "smoke-sidebar-navigation-ui.mjs"],
  ["Sidebar settings UI", "smoke-sidebar-settings-ui.mjs"],
  ["Settings center UI", "smoke-settings-center-ui.mjs"],
  ["Row-page navigation UI", "smoke-row-page-navigation-ui.mjs"],
  ["Row-page property visual UI", "smoke-row-page-property-visual-ui.mjs"],
  ["Source and attachments UI", "smoke-source-attachments-ui.mjs"],
  ["Markdown preview UI", "smoke-markdown-preview-ui.mjs"],
  ["Markdown preview harness UI", "smoke-markdown-preview-harness-ui.mjs"],
  ["Page path slash title UI", "smoke-page-path-slash-ui.mjs"],
  ["Page backlinks UI", "smoke-page-backlinks-ui.mjs"],
  ["Page secondary UI", "smoke-page-secondary-ui.mjs"],
  ["Plugin manager UI", "smoke-plugin-manager-ui.mjs"],
  ["LLM Chat UI", "smoke-llm-chat-ui.mjs"],
  ["Advanced Search UI", "smoke-advanced-search-ui.mjs"],
  ["GitHub backup UI", "smoke-github-backup-ui.mjs"],
  ["URL field UI", "smoke-url-field-ui.mjs"],
  ["White theme UI", "smoke-white-theme-ui.mjs"],
  ["Design system UI", "smoke-design-system-ui.mjs"],
  ["Image lightbox UI", "smoke-image-lightbox-ui.mjs"],
  ["Database created views UI", "smoke-database-created-views-ui.mjs"],
  ["Copy system time UI", "smoke-copy-system-time-ui.mjs"],
  ["Window pop-out UI", "smoke-window-popout-ui.mjs"],
  ["Database template UI", "smoke-database-template-ui.mjs"]
];

const startedAt = Date.now();
const suiteFilters = (process.env.LOTION_UI_SUITE_FILTER || "")
  .split(",")
  .map((filter) => filter.trim().toLowerCase())
  .filter(Boolean);
const selectedSuite = suiteFilters.length > 0
  ? uniqueSuiteEntries(suiteFilters.flatMap((filter) => (
    suite.filter(([name, script]) => (
      name.toLowerCase().includes(filter) ||
      script.toLowerCase().includes(filter)
    ))
  )))
  : suite;

if (selectedSuite.length === 0) {
  throw new Error(`No smoke UI suites match LOTION_UI_SUITE_FILTER=${JSON.stringify(suiteFilters)}.`);
}

const summary = await withLotionUIHarness("ui-suite", async ({ artifactRoot, cdpUrl, page }) => {
  const results = [];
  for (const [name, script] of selectedSuite) {
    const started = Date.now();
    await resetSharedHarnessState(page);
    console.log(`\n[smoke:ui] ${name}`);
    const result = spawnSync(process.execPath, [join(scriptDir, script)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LOTION_CDP_URL: cdpUrl,
        LOTION_RENDERER_COVERAGE_FILE: "",
        LOTION_UI_HARNESS_NO_AUTOSTART: "1"
      },
      encoding: "utf8",
      stdio: "inherit"
    });
    const elapsedMs = Date.now() - started;
    if (result.status !== 0) {
      throw new Error(`[smoke:ui] FAILED ${name} after ${elapsedMs}ms`);
    }
    const childManifest = await readLatestChildManifest(started);
    results.push({
      name,
      elapsedMs,
      reproduceCommand: `LOTION_UI_SUITE_FILTER=${script} npm run smoke:ui`,
      scriptPath: relative(process.cwd(), join(scriptDir, script)),
      status: result.status ?? 1,
      harnessManifest: childManifest
    });
  }

  const tempRecentsRemoved = await cleanupTempRecents(page);
  const summary = {
    environment: buildUiSuiteEnvironment(),
    filter: suiteFilters.length > 0 ? suiteFilters : null,
    selectedCount: selectedSuite.length,
    totalMs: Date.now() - startedAt,
    tempRecentsRemoved,
    results
  };
  summary.artifactIndex = await writeUiSuiteArtifactIndex({ artifactRoot, summary });
  return summary;
}, { collectRendererCoverage: false });

console.log("\n[smoke:ui] passed");
console.log(JSON.stringify(summary, null, 2));

function uniqueSuiteEntries(entries) {
  const seen = new Set();
  const selected = [];
  for (const entry of entries) {
    const script = entry[1];
    if (seen.has(script)) continue;
    seen.add(script);
    selected.push(entry);
  }
  return selected;
}

async function resetSharedHarnessState(page) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 8_000 }).catch(() => undefined);
      await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 8_000 });
      await setLotionLocale(page, "en");
      await page.evaluate(() => window.localStorage.removeItem("lotion.debug.startupPhaseDelayMs"));
      return;
    } catch (error) {
      lastError = error;
      if (!isNavigationRace(error) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError;
}

function isNavigationRace(error) {
  const message = String(error?.message || error || "");
  return message.includes("Execution context was destroyed") ||
    message.includes("most likely because of a navigation") ||
    message.includes("ERR_NETWORK_CHANGED");
}

async function cleanupTempRecents(page) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => undefined);
      await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 10_000 });
      return await page.evaluate(async (needles) => {
        const recents = await window.lotion.workspace.listRecent();
        const stale = recents.filter((recent) => needles.some((needle) => recent.path.includes(needle)));
        for (const recent of stale) {
          await window.lotion.workspace.forget(recent.path);
        }
        return stale.map((recent) => recent.path);
      }, smokeTempWorkspaceNeedles);
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(250);
    }
  }
  throw lastError;
}

async function readLatestChildManifest(startedAt) {
  const manifests = await readHarnessResultArtifactsSince({ startedAt });
  const latest = manifests.at(-1);
  if (!latest) {
    throw new Error("[smoke:ui] Child smoke did not produce a harness-result.json manifest.");
  }
  const missing = latest.manifest?.coverage?.missingViewportNames || [];
  if (latest.manifest?.status !== "passed" || missing.length > 0) {
    throw new Error(`[smoke:ui] Child smoke manifest failed compliance: ${JSON.stringify({
      manifestPath: latest.manifestPath,
      status: latest.manifest?.status,
      missingViewportNames: missing
    })}`);
  }
  assertNoHarnessConsoleErrors(latest.manifest, `[smoke:ui] ${latest.manifest.name}`);
  return {
    path: relative(process.cwd(), latest.manifestPath),
    name: latest.manifest.name,
    status: latest.manifest.status,
    artifactRoot: relative(process.cwd(), latest.manifest.artifactRoot || ""),
    consoleErrorCount: latest.manifest.logs?.consoleErrorCount ?? 0,
    consoleIssues: latest.manifest.logs?.consoleIssues || [],
    observedViewports: latest.manifest.coverage?.observedViewportNames || [],
    missingViewportNames: missing,
    artifactContract: latest.manifest.result?.artifactContract || null
  };
}

function buildUiSuiteEnvironment() {
  const viewports = selectedViewports().map((viewport) => ({
    name: viewport.name,
    width: viewport.width,
    height: viewport.height
  }));
  return {
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    ci: truthyEnv(process.env.CI),
    selectedViewportNames: viewports.map((viewport) => viewport.name),
    selectedViewports: viewports,
    filter: suiteFilters.length > 0 ? suiteFilters : [],
    selectedSuiteScripts: selectedSuite.map(([, script]) => script),
    runner: "npm run smoke:ui"
  };
}

function truthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}
