#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright-core";

import { createLotionCustomerApi } from "../dist-electron/main/customer-api.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import { createStartupWorkspaceFixture } from "./startup-workspace-fixture.mjs";

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const userDataDir = await mkdtemp(join(tmpdir(), "lotion-e2e-startup-user-"));
let fixture;

try {
  const workspaceRoot = args.workspace
    ? resolve(args.workspace)
    : (fixture = await createStartupWorkspaceFixture({
      name: "e2e_startup",
      pageCount: 300,
      pageIndexRecordCount: 43_320,
      databaseCount: 1_186,
      rowsPerDatabase: 1,
      sparsePageBodies: true
    })).root;
  await mkdir(userDataDir, { recursive: true });
  const primer = createLotionCustomerApi({
    appConfig: new AppConfigService(join(userDataDir, "app-config.json"))
  });
  await primer.workspace.open(workspaceRoot);
  const primed = await primer.workspace.getStartupIndex();

  if (args.warmup) await launchOnce({ args, root, userDataDir, measured: false });
  const runs = [];
  for (let index = 0; index < args.iterations; index += 1) {
    runs.push(await launchOnce({ args, root, userDataDir, measured: true }));
  }
  const launchTimes = runs.map((run) => run.launchToInteractiveMs);
  const summary = {
    cachePrimedAs: primed.cache.status,
    startupCacheBytes: primed.cache.bytes,
    maxStartupCacheBytes: args.maxCacheBytes,
    thresholdMs: args.thresholdMs,
    maxLaunchThresholdMs: args.maxLaunchThresholdMs,
    warmup: args.warmup,
    iterations: runs.length,
    medianLaunchToInteractiveMs: median(launchTimes),
    maxLaunchToInteractiveMs: Math.max(...launchTimes),
    runs
  };
  console.log(JSON.stringify(summary, null, 2));
  if (args.check) {
    assert.equal(
      runs.every((run) => run.cacheStatus === "hit"),
      true,
      "all measured launches must hit the persistent startup cache"
    );
    assert.ok(
      summary.medianLaunchToInteractiveMs < args.thresholdMs,
      `Warm end-to-end startup median ${summary.medianLaunchToInteractiveMs}ms exceeds ${args.thresholdMs}ms`
    );
    assert.ok(
      summary.maxLaunchToInteractiveMs < args.maxLaunchThresholdMs,
      `Warm end-to-end startup max ${summary.maxLaunchToInteractiveMs}ms exceeds ${args.maxLaunchThresholdMs}ms`
    );
    assert.equal(
      runs.every((run) => (
        Number.isFinite(run.rendererStartupMs) && run.rendererStartupMs < args.thresholdMs
      )),
      true,
      `Renderer startup report must stay below ${args.thresholdMs}ms`
    );
    assert.equal(
      runs.every((run) => (
        Number.isFinite(run.workspaceIndexMs) && run.workspaceIndexMs < args.thresholdMs
      )),
      true,
      `Workspace index operation must stay below ${args.thresholdMs}ms`
    );
    assert.ok(
      primed.cache.bytes <= args.maxCacheBytes,
      `Startup SQLite projection ${primed.cache.bytes} bytes exceeds ${args.maxCacheBytes} bytes`
    );
  }
} finally {
  await rm(userDataDir, { recursive: true, force: true });
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
}

async function launchOnce({ args, root, userDataDir, measured }) {
  const cdpPort = await availablePort();
  const executable = args.executable || defaultElectronExecutable(root);
  const launchArgs = [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`
  ];
  if (!args.packaged) launchArgs.push(root);
  const launchedAtWall = Date.now();
  const launchedAtPerformance = performance.now();
  const stderr = [];
  const child = spawn(executable, launchArgs, {
    cwd: root,
    env: {
      ...process.env,
      LOTION_USER_DATA_DIR: userDataDir,
      LOTION_OPEN_LOGS: "0"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 20) stderr.push(String(chunk));
  });

  let browser;
  try {
    await waitForCdp(cdpPort, child, 20_000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const page = await waitForRendererPage(browser, 20_000);
    await page.waitForFunction(() => Boolean(window.__lotionStartupReport), null, { timeout: 20_000 });
    const result = await page.evaluate(() => ({
      report: window.__lotionStartupReport,
      navigation: performance.getEntriesByType("navigation")[0]?.toJSON?.() ?? null,
      timeOrigin: performance.timeOrigin
    }));
    const capturedAtMs = Date.parse(result.report.capturedAt);
    return {
      measured,
      launchToInteractiveMs: Number((capturedAtMs - launchedAtWall).toFixed(1)),
      observedAfterMs: Number((performance.now() - launchedAtPerformance).toFixed(1)),
      processToRendererOriginMs: Number((result.timeOrigin - launchedAtWall).toFixed(1)),
      rendererStartupMs: result.report.totalMs,
      workspaceIndexMs: round(
        result.report.indexOperations?.find((operation) => operation.key === "workspaceIndex")?.ms
      ),
      cacheStatus: result.report.cache?.status,
      cacheReason: result.report.cache?.reason,
      cacheReadMs: round(result.report.cache?.readMs),
      cacheBytes: result.report.cache?.bytes,
      navigationResponseEndMs: round(result.navigation?.responseEnd),
      domInteractiveMs: round(result.navigation?.domInteractive)
    };
  } catch (error) {
    error.message += `\nElectron stderr:\n${stderr.join("").slice(-4_000)}`;
    throw error;
  } finally {
    await browser?.close().catch(() => undefined);
    await stopChild(child);
  }
}

async function waitForCdp(port, child, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`Electron exited before CDP was ready (${child.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // The debugger socket is not listening yet.
    }
    await delay(25);
  }
  throw new Error(`Electron CDP did not become ready on port ${port}`);
}

async function waitForRendererPage(browser, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => (
        candidate.url().startsWith("file:")
        || candidate.url().startsWith("lotion:")
        || /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\//.test(candidate.url())
      ));
      if (page) return page;
    }
    await delay(20);
  }
  throw new Error("No Lotion renderer page appeared");
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGKILL");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    delay(1_000)
  ]);
}

function defaultElectronExecutable(root) {
  if (process.platform === "darwin") {
    return join(root, "..", "..", "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  }
  return join(root, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
}

async function availablePort() {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    executable: "",
    iterations: 3,
    maxCacheBytes: Number(process.env.LOTION_E2E_STARTUP_MAX_CACHE_MB ?? 12) * 1024 * 1024,
    maxLaunchThresholdMs: Number(
      process.env.LOTION_E2E_STARTUP_MAX_LAUNCH_THRESHOLD_MS ?? 1_200
    ),
    packaged: false,
    thresholdMs: Number(process.env.LOTION_E2E_STARTUP_THRESHOLD_MS ?? 1_000),
    warmup: true,
    workspace: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") parsed.check = true;
    else if (arg === "--no-warmup") parsed.warmup = false;
    else if (arg === "--packaged") parsed.packaged = true;
    else if (arg === "--executable") parsed.executable = resolve(argv[++index]);
    else if (arg === "--workspace") parsed.workspace = argv[++index];
    else if (arg === "--iterations") parsed.iterations = positiveNumber(arg, argv[++index]);
    else if (arg === "--max-cache-mb") {
      parsed.maxCacheBytes = positiveNumber(arg, argv[++index]) * 1024 * 1024;
    }
    else if (arg === "--max-launch-threshold-ms") {
      parsed.maxLaunchThresholdMs = positiveNumber(arg, argv[++index]);
    }
    else if (arg === "--threshold-ms") parsed.thresholdMs = positiveNumber(arg, argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function positiveNumber(name, value) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(`Invalid ${name}: ${value}`);
  return Math.floor(result);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(1)) : null;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
