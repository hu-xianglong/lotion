import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { createServer } from "node:net";
import {
  access,
  chmod,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile
} from "node:fs/promises";
import { arch, platform, release as osRelease } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { RELEASE_QUALITY_GATES } from "./quality-gates.mjs";

export const DEFAULT_TEST_RELEASE_GATES = RELEASE_QUALITY_GATES;

export class TestReleaseGateError extends Error {
  constructor(message, gateResults = []) {
    super(message);
    this.name = "TestReleaseGateError";
    this.gateResults = gateResults;
  }
}

export async function createTestRelease(options = {}) {
  const root = resolve(options.root || process.cwd());
  const outputRoot = resolve(options.outputRoot || join(root, "artifacts", "test-releases"));
  const now = options.now instanceof Date ? options.now : new Date();
  const prechecked = Boolean(options.prechecked);
  const gates = options.gates || DEFAULT_TEST_RELEASE_GATES;
  const runner = options.runner || runCommand;
  const logger = options.logger || (() => undefined);
  const gateResults = await runReleaseGates({
    cwd: root,
    gates,
    logger,
    prechecked,
    runner
  });
  const appInfo = await collectAppInfo(root);
  const gitInfo = options.gitInfo || await collectGitInfo(root);
  const uiArtifacts = options.uiArtifacts || await collectUiSmokeArtifacts(root);
  const releaseDir = await createUniqueReleaseDir({
    gitInfo,
    now,
    outputRoot
  });
  let buildOutputs = await collectBuildOutputs(root);
  if (options.packageAppSnapshot !== false) {
    buildOutputs = await attachReleaseAppSnapshot({
      appInfo,
      buildOutputs,
      electronExecutable: options.electronExecutable,
      platformName: options.platformName || process.platform,
      releaseDir,
      root
    });
  }
  let packagedAppVerification = null;
  if (buildOutputs.packagedApp) {
    packagedAppVerification = options.verifyPackagedAppSnapshot === false
      ? { status: "skipped" }
      : await verifyReleaseAppSnapshot({
        packagedApp: buildOutputs.packagedApp,
        releaseDir,
        root
      });
    buildOutputs = { ...buildOutputs, verification: packagedAppVerification };
  }
  const releaseNotes = await buildReleaseNotes({ gitInfo, root });
  const manifest = buildReleaseManifest({
    appInfo,
    buildOutputs,
    gateResults,
    gitInfo,
    now,
    prechecked,
    packagedAppVerification,
    releaseDir,
    root,
    uiArtifacts
  });

  const manifestPath = join(releaseDir, "release-manifest.json");
  await writeJson(manifestPath, manifest);
  await writeJson(join(releaseDir, "build-outputs.json"), buildOutputs);
  await writeJson(join(releaseDir, "ui-artifacts.json"), uiArtifacts);
  await writeFile(join(releaseDir, "RELEASE_NOTES.md"), releaseNotes, "utf8");
  await writeFile(join(releaseDir, "README.md"), buildReleaseReadme(manifest), "utf8");
  const checksums = await writeChecksums(releaseDir);

  return {
    checksums,
    gateResults,
    manifestPath,
    manifest: {
      ...manifest,
      checksumsFile: "checksums.json"
    },
    releaseDir
  };
}

export async function runReleaseGates({ cwd, gates = DEFAULT_TEST_RELEASE_GATES, logger = () => undefined, prechecked = false, runner = runCommand } = {}) {
  if (prechecked) {
    return gates.map((gate) => ({
      command: gate.label || formatCommand(gate.command, gate.args || []),
      durationMs: 0,
      exitCode: 0,
      mode: "prechecked",
      status: "prechecked"
    }));
  }

  const results = [];
  for (const gate of gates) {
    const startedAt = Date.now();
    const commandLabel = gate.label || formatCommand(gate.command, gate.args || []);
    logger(`Running ${commandLabel}`);
    try {
      const result = await runner(gate.command, gate.args || [], { cwd });
      results.push({
        command: commandLabel,
        durationMs: Date.now() - startedAt,
        exitCode: result?.exitCode ?? 0,
        mode: "executed",
        status: "passed",
        stderr: trimForManifest(result?.stderr || ""),
        stdout: trimForManifest(result?.stdout || "")
      });
    } catch (error) {
      results.push({
        command: commandLabel,
        durationMs: Date.now() - startedAt,
        exitCode: typeof error.exitCode === "number" ? error.exitCode : 1,
        mode: "executed",
        status: "failed",
        stderr: trimForManifest(error.stderr || error.message || ""),
        stdout: trimForManifest(error.stdout || "")
      });
      throw new TestReleaseGateError(`Test release gate failed: ${commandLabel}`, results);
    }
  }
  return results;
}

export function buildReleaseManifest({ appInfo, buildOutputs, gateResults, gitInfo, now, packagedAppVerification = null, prechecked, releaseDir, root, uiArtifacts }) {
  const releasePath = relative(root, releaseDir).replaceAll("\\", "/");
  return {
    artifactKind: "lotion-test-release",
    app: appInfo,
    build: {
      status: buildOutputs.status,
      outputCount: buildOutputs.outputs.length,
      packagedApp: buildOutputs.packagedApp || null,
      verification: packagedAppVerification
    },
    createdAt: now.toISOString(),
    git: gitInfo,
    node: {
      arch: process.arch,
      platform: process.platform,
      version: process.version
    },
    os: {
      arch: arch(),
      platform: platform(),
      release: osRelease()
    },
    preRelease: true,
    releasePath,
    checksumsFile: "checksums.json",
    test: {
      mode: prechecked ? "prechecked" : "full",
      gates: gateResults
    },
    uiArtifacts: {
      count: uiArtifacts.length,
      latest: uiArtifacts.slice(0, 8)
    }
  };
}

export async function collectGitInfo(root) {
  const [sha, branch, status, recentLog] = await Promise.all([
    gitOutput(root, ["rev-parse", "HEAD"]),
    gitOutput(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    gitOutput(root, ["status", "--porcelain"]),
    gitOutput(root, ["log", "-5", "--pretty=format:%h %s"])
  ]);
  return {
    branch: branch || "unknown",
    dirty: status.trim().length > 0,
    recentCommits: recentLog ? recentLog.split("\n").filter(Boolean) : [],
    sha: sha || "unknown",
    shortSha: sha ? sha.slice(0, 7) : "unknown",
    statusPorcelain: status
  };
}

export async function collectUiSmokeArtifacts(root, limit = 12) {
  const uiRoot = join(root, "artifacts", "ui-smoke");
  if (!await exists(uiRoot)) return [];
  const entries = await readdir(uiRoot, { withFileTypes: true });
  const artifacts = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(uiRoot, entry.name, "harness-result.json");
    const info = await stat(manifestPath).catch(() => null);
    if (!info) continue;
    let manifest = null;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      manifest = null;
    }
    const productionVisualGate = await collectProductionVisualGateSummary(root, manifestPath);
    artifacts.push({
      mtimeMs: info.mtimeMs,
      path: relative(root, manifestPath).replaceAll("\\", "/"),
      productionVisualGate,
      status: manifest?.status || "unknown",
      suite: manifest?.name || entry.name,
      viewports: manifest?.coverage?.observedViewportNames || manifest?.observedViewports || []
    });
  }
  return artifacts
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map(({ mtimeMs, ...artifact }) => artifact);
}

async function collectProductionVisualGateSummary(root, manifestPath) {
  const gatePath = join(dirname(manifestPath), "production-visual-gate", "production-visual-gate.json");
  const info = await stat(gatePath).catch(() => null);
  if (!info?.isFile()) return null;
  try {
    const gate = JSON.parse(await readFile(gatePath, "utf8"));
    return {
      filter: gate.filter || "",
      kind: gate.kind || "lotion-production-visual-quality-gate",
      path: relative(root, gatePath).replaceAll("\\", "/"),
      status: gate.status || "unknown",
      uiSuiteArtifactIndex: gate.uiSuiteArtifactIndex
        ? relative(root, resolvePathMaybeAbsolute(root, gate.uiSuiteArtifactIndex)).replaceAll("\\", "/")
        : null,
      viewports: gate.viewports || ""
    };
  } catch {
    return {
      filter: "",
      kind: "lotion-production-visual-quality-gate",
      path: relative(root, gatePath).replaceAll("\\", "/"),
      status: "unreadable",
      uiSuiteArtifactIndex: null,
      viewports: ""
    };
  }
}

function resolvePathMaybeAbsolute(root, filePath) {
  if (!filePath) return root;
  return resolve(filePath) === filePath ? filePath : join(root, filePath);
}

export async function collectBuildOutputs(root) {
  const candidates = [
    join(root, "dist", "renderer", "index.html"),
    join(root, "dist-electron", "main", "index.js"),
    join(root, "dist-electron", "preload", "index.cjs")
  ];
  const outputs = [];
  for (const file of candidates) {
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) continue;
    outputs.push({
      bytes: info.size,
      path: relative(root, file).replaceAll("\\", "/"),
      sha256: await sha256File(file)
    });
  }
  return {
    outputs,
    packagedApp: null,
    placeholder: outputs.length === 0
      ? "No build output was found. Run npm run build before generating an inspectable test release."
      : "No packaged Electron app is configured yet; this test release records build output files for inspection.",
    status: outputs.length > 0 ? "build-output-recorded" : "packaging-placeholder"
  };
}

export async function attachReleaseAppSnapshot({
  appInfo,
  buildOutputs,
  electronExecutable,
  platformName = process.platform,
  releaseDir,
  root
}) {
  const appSnapshot = await createReleaseAppSnapshot({
    appInfo,
    buildOutputs,
    electronExecutable,
    platformName,
    releaseDir,
    root
  });
  if (!appSnapshot) return buildOutputs;
  return {
    ...buildOutputs,
    packagedApp: appSnapshot,
    placeholder: null,
    status: "app-snapshot-packaged"
  };
}

export async function createReleaseAppSnapshot({
  appInfo,
  buildOutputs,
  electronExecutable,
  platformName = process.platform,
  releaseDir,
  root
}) {
  const requiredFiles = [
    join(root, "dist", "renderer", "index.html"),
    join(root, "dist-electron", "main", "index.js"),
    join(root, "dist-electron", "preload", "index.cjs")
  ];
  const requiredReady = await Promise.all(requiredFiles.map((file) => exists(file)));
  if (requiredReady.some((ready) => !ready)) return null;
  if (!Array.isArray(buildOutputs?.outputs) || buildOutputs.outputs.length === 0) return null;

  const electronPath = electronExecutable || await findElectronExecutable(root, platformName);
  if (!electronPath || !await exists(electronPath)) return null;

  const snapshotDir = join(releaseDir, "app-snapshot");
  const userDataDir = join(releaseDir, "user-data");
  const launcherPath = join(releaseDir, "open-lotion-test-release.sh");
  const displayName = releaseDisplayName(appInfo);
  await rm(snapshotDir, { recursive: true, force: true });
  await mkdir(snapshotDir, { recursive: true });
  await mkdir(userDataDir, { recursive: true });
  await cp(join(root, "dist"), join(snapshotDir, "dist"), {
    dereference: false,
    force: true,
    recursive: true
  });
  await cp(join(root, "dist-electron"), join(snapshotDir, "dist-electron"), {
    dereference: false,
    force: true,
    recursive: true
  });

  await writeJson(join(snapshotDir, "package.json"), {
    description: appInfo.description || "",
    main: "dist-electron/main/index.js",
    name: `${appInfo.name || "lotion"}-test-release-snapshot`,
    private: true,
    type: "module",
    version: appInfo.version || "0.0.0"
  });

  const nodeModulesPath = await findRuntimeNodeModules(root, platformName);
  if (await exists(nodeModulesPath)) {
    await symlink(nodeModulesPath, join(snapshotDir, "node_modules"), "dir").catch(() => undefined);
  }

  await writeJson(join(snapshotDir, "snapshot-info.json"), {
    app: appInfo,
    createdAt: new Date().toISOString(),
    electronExecutable: electronPath,
    isolatedUserData: relative(releaseDir, userDataDir).replaceAll("\\", "/"),
    sourceBuildOutputs: buildOutputs.outputs
  });

  await writeExecutable(
    launcherPath,
    `#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$RELEASE_DIR/app-snapshot"
DEFAULT_ELECTRON=${shellQuote(electronPath)}
USER_DATA="\${LOTION_RELEASE_USER_DATA:-$RELEASE_DIR/user-data}"
ELECTRON="\${LOTION_RELEASE_ELECTRON:-$DEFAULT_ELECTRON}"

cd "$APP_DIR"
if [ -n "\${LOTION_RELEASE_CDP_PORT:-}" ]; then
  exec "$ELECTRON" --remote-debugging-address=127.0.0.1 --remote-debugging-port="$LOTION_RELEASE_CDP_PORT" --user-data-dir="$USER_DATA" "$APP_DIR"
fi
exec "$ELECTRON" --user-data-dir="$USER_DATA" "$APP_DIR"
`
  );

  const result = {
    launcherPath: relative(releaseDir, launcherPath).replaceAll("\\", "/"),
    path: relative(releaseDir, launcherPath).replaceAll("\\", "/"),
    platform: platformName,
    snapshotPath: relative(releaseDir, snapshotDir).replaceAll("\\", "/"),
    type: "launcher-script",
    userDataPath: relative(releaseDir, userDataDir).replaceAll("\\", "/")
  };

  if (platformName === "darwin") {
    const appBundle = join(releaseDir, `${displayName}.app`);
    await createMacAppLauncher({
      appBundle,
      displayName,
      launcherPath,
      version: appInfo.version || "0.0.0"
    });
    result.path = relative(releaseDir, appBundle).replaceAll("\\", "/");
    result.type = "mac-app";
  }

  return result;
}

export async function verifyReleaseAppSnapshot({
  packagedApp,
  releaseDir,
  root,
  timeoutMs = 30_000
}) {
  const reportPath = join(releaseDir, "packaged-app-verification.json");
  const structure = await verifyReleaseAppStructure({ packagedApp, releaseDir });
  const port = await allocateLoopbackPort();
  const launcherPath = join(releaseDir, packagedApp.launcherPath);
  const userDataPath = join(releaseDir, packagedApp.userDataPath);
  const output = { stdout: "", stderr: "" };
  let exitState = null;
  let browser;
  const child = spawn(launcherPath, [], {
    cwd: releaseDir,
    env: {
      ...process.env,
      LOTION_RELEASE_CDP_PORT: String(port),
      LOTION_RELEASE_USER_DATA: userDataPath
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk) => {
    output.stdout = appendProcessOutput(output.stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output.stderr = appendProcessOutput(output.stderr, chunk);
  });
  child.once("exit", (code, signal) => {
    exitState = { code, signal };
  });

  try {
    await waitForDevTools(port, timeoutMs, () => exitState);
    const { chromium } = await import("playwright-core");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const page = await waitForPackagedRendererPage(browser, timeoutMs);
    await page.waitForFunction(() => Boolean(window.lotion), null, { timeout: timeoutMs });
    const contractModuleUrl = `${pathToFileURL(join(releaseDir, packagedApp.snapshotPath, "dist-electron", "shared", "customer-api-contract.js")).href}?release=${Date.now()}`;
    const { LOTION_RENDERER_API_CONTRACT } = await import(contractModuleUrl);
    const renderer = await page.evaluate((contract) => {
      const missing = [];
      for (const group of contract) {
        for (const method of group.methods) {
          if (typeof window.lotion?.[group.group]?.[method] !== "function") {
            missing.push(`${group.group}.${method}`);
          }
        }
      }
      return {
        bodyTextLength: document.body.innerText.length,
        methodCount: contract.reduce((total, group) => total + group.methods.length, 0),
        missing,
        title: document.title,
        url: location.href
      };
    }, LOTION_RENDERER_API_CONTRACT);
    if (renderer.title !== "Lotion") {
      throw new Error(`Packaged renderer title mismatch: ${renderer.title}`);
    }
    if (!renderer.url.startsWith("file:")) {
      throw new Error(`Packaged renderer did not load from the app snapshot: ${renderer.url}`);
    }
    if (renderer.missing.length > 0) {
      throw new Error(`Packaged preload API is incomplete: ${renderer.missing.join(", ")}`);
    }
    if (renderer.bodyTextLength <= 0) {
      throw new Error("Packaged renderer produced an empty document body.");
    }
    const report = {
      apiMethodCount: renderer.methodCount,
      appPath: packagedApp.path,
      launcherPath: packagedApp.launcherPath,
      rendererTitle: renderer.title,
      rendererUrl: renderer.url,
      sourceOutputCount: structure.sourceOutputs.length,
      status: "passed"
    };
    await writeJson(reportPath, report);
    return report;
  } catch (error) {
    await writeJson(reportPath, {
      error: error?.message || String(error),
      exitState,
      status: "failed",
      stderr: output.stderr,
      stdout: output.stdout,
      structure
    }).catch(() => undefined);
    throw new TestReleaseGateError(`Packaged app verification failed: ${error?.message || String(error)}`);
  } finally {
    await browser?.close().catch(() => undefined);
    await stopChildProcess(child, () => exitState);
  }
}

export async function verifyReleaseAppStructure({ packagedApp, releaseDir }) {
  const snapshotDir = join(releaseDir, packagedApp.snapshotPath);
  const launcherPath = join(releaseDir, packagedApp.launcherPath);
  const snapshotInfoPath = join(snapshotDir, "snapshot-info.json");
  const snapshotInfo = JSON.parse(await readFile(snapshotInfoPath, "utf8"));
  const launcherInfo = await stat(launcherPath);
  if (!launcherInfo.isFile() || (launcherInfo.mode & 0o111) === 0) {
    throw new Error(`Packaged app launcher is not executable: ${launcherPath}`);
  }
  if (packagedApp.type === "mac-app") {
    const appInfo = await stat(join(releaseDir, packagedApp.path, "Contents", "Info.plist"));
    if (!appInfo.isFile()) throw new Error(`Packaged macOS app is missing Info.plist: ${packagedApp.path}`);
  }
  const sourceOutputs = [];
  for (const expected of snapshotInfo.sourceBuildOutputs || []) {
    const file = join(snapshotDir, expected.path);
    const info = await stat(file);
    const sha256 = await sha256File(file);
    if (info.size !== expected.bytes || sha256 !== expected.sha256) {
      throw new Error(`Packaged build output differs from the tested source output: ${expected.path}`);
    }
    sourceOutputs.push({ bytes: info.size, path: expected.path, sha256 });
  }
  if (sourceOutputs.length === 0) {
    throw new Error("Packaged app snapshot does not record any tested build outputs.");
  }
  return {
    launcherPath: packagedApp.launcherPath,
    snapshotPath: packagedApp.snapshotPath,
    sourceOutputs
  };
}

async function waitForPackagedRendererPage(browser, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => candidate.url().startsWith("file:"));
      if (page) return page;
    }
    await delay(100);
  }
  throw new Error("Packaged app did not expose a file-backed renderer page.");
}

async function waitForDevTools(port, timeoutMs, getExitState) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    const exitState = getExitState();
    if (exitState) {
      throw new Error(`Packaged app exited before startup completed: ${JSON.stringify(exitState)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
      lastError = new Error(`DevTools returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Packaged app DevTools endpoint did not start: ${lastError?.message || "timeout"}`);
}

async function allocateLoopbackPort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  if (!port) throw new Error("Unable to allocate a packaged-app verification port.");
  return port;
}

async function stopChildProcess(child, getExitState) {
  if (getExitState()) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    new Promise((resolvePromise) => child.once("exit", () => resolvePromise(true))),
    delay(3_000).then(() => false)
  ]);
  if (!stopped) child.kill("SIGKILL");
}

function appendProcessOutput(current, chunk, limit = 20_000) {
  const next = `${current}${chunk.toString()}`;
  return next.length <= limit ? next : next.slice(next.length - limit);
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function collectAppInfo(root) {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  return {
    description: pkg.description || "",
    name: pkg.name || "lotion",
    version: pkg.version || "0.0.0"
  };
}

export async function runCommand(command, args = [], options = {}) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (options.stdio === "inherit") process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (options.stdio === "inherit") process.stderr.write(chunk);
    });
    child.on("error", (error) => {
      error.stdout = stdout;
      error.stderr = stderr;
      rejectPromise(error);
    });
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolvePromise({ exitCode, stderr, stdout });
        return;
      }
      const error = new Error(`${formatCommand(command, args)} exited with ${exitCode}`);
      error.exitCode = exitCode;
      error.stderr = stderr;
      error.stdout = stdout;
      rejectPromise(error);
    });
  });
}

async function createUniqueReleaseDir({ gitInfo, now, outputRoot }) {
  await mkdir(outputRoot, { recursive: true });
  const baseName = `lotion-test-${safeTimestamp(now)}-${safePathSegment(gitInfo.shortSha || "unknown")}`;
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const releaseDir = join(outputRoot, `${baseName}${suffix}`);
    try {
      await mkdir(releaseDir);
      return releaseDir;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Unable to create a unique test release directory for ${baseName}`);
}

async function writeChecksums(releaseDir) {
  const files = (await walkFiles(releaseDir))
    .filter((file) => basename(file) !== "checksums.json")
    .sort();
  const checksums = [];
  for (const file of files) {
    checksums.push({
      path: relative(releaseDir, file).replaceAll("\\", "/"),
      sha256: await sha256File(file)
    });
  }
  await writeJson(join(releaseDir, "checksums.json"), checksums);
  return checksums;
}

async function walkFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(absolute));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }
  return files;
}

async function buildReleaseNotes({ gitInfo, root }) {
  const queueTail = await readQueueTail(root);
  const commits = gitInfo.recentCommits?.length
    ? gitInfo.recentCommits.map((line) => `- ${line}`).join("\n")
    : "- No recent commits were available.";
  return [
    "# Lotion Test Release",
    "",
    "This is a local test/pre-release artifact generated after the configured gates passed.",
    "",
    "## Source",
    "",
    `- Branch: ${gitInfo.branch}`,
    `- Commit: ${gitInfo.sha}`,
    `- Dirty worktree: ${gitInfo.dirty ? "yes" : "no"}`,
    "",
    "## Recent Commits",
    "",
    commits,
    "",
    "## Recent Queue Items",
    "",
    queueTail || "_No queue summary was available._",
    ""
  ].join("\n");
}

async function readQueueTail(root) {
  const queuePath = join(root, "tasks", "QUEUE.md");
  if (!await exists(queuePath)) return "";
  const lines = (await readFile(queuePath, "utf8")).split("\n");
  return lines
    .filter((line) => /^\| \d+ \|/.test(line))
    .slice(-8)
    .join("\n");
}

function buildReleaseReadme(manifest) {
  const appLines = manifest.build.packagedApp
    ? [
      "- `app-snapshot/`: copied renderer, main, preload, and minimal package metadata for the launchable snapshot.",
      `- \`${manifest.build.packagedApp.path}\`: openable test app artifact.`,
      `- \`${manifest.build.packagedApp.launcherPath}\`: shell launcher with isolated user data by default.`
    ]
    : [
      "- No openable app snapshot was created because required build outputs or the local Electron executable were not available."
    ];
  return [
    "# Lotion Test Release",
    "",
    "This directory is a local test/pre-release artifact. It is not a production release,",
    "does not change Lotion's production version metadata, and is not published to GitHub.",
    "",
    "## Contents",
    "",
    "- `release-manifest.json`: source revision, test gates, platform, app version, and UI artifact references.",
    "- `build-outputs.json`: build output files and app snapshot metadata when available.",
    ...appLines,
    "- `ui-artifacts.json`: recent UI smoke artifact manifests for tester inspection.",
    "- `checksums.json`: SHA-256 checksums for generated release files.",
    "- `packaged-app-verification.json`: cold-start, renderer, API-contract, and build-hash verification evidence when an app snapshot is available.",
    "- `RELEASE_NOTES.md`: short source and queue summary.",
    "",
    "## Source",
    "",
    `- Commit: ${manifest.git.sha}`,
    `- Branch: ${manifest.git.branch}`,
    `- Test mode: ${manifest.test.mode}`,
    ""
  ].join("\n");
}

async function gitOutput(root, args) {
  try {
    const result = await runCommand("git", args, { cwd: root });
    return result.stdout.trim();
  } catch {
    return "";
  }
}

async function sha256File(file) {
  const data = await readFile(file);
  return createHash("sha256").update(data).digest("hex");
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeExecutable(file, body) {
  await writeFile(file, body, "utf8");
  await chmod(file, 0o755);
}

async function createMacAppLauncher({ appBundle, displayName, launcherPath, version }) {
  const executablePath = join(appBundle, "Contents", "MacOS", displayName);
  const plistPath = join(appBundle, "Contents", "Info.plist");
  await rm(appBundle, { recursive: true, force: true });
  await mkdir(join(appBundle, "Contents", "MacOS"), { recursive: true });
  await writeExecutable(
    executablePath,
    `#!/usr/bin/env bash
set -euo pipefail
RELEASE_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
exec "$RELEASE_DIR/${basename(launcherPath)}"
`
  );
  await writeFile(
    plistPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${xmlEscape(displayName)}</string>
  <key>CFBundleIdentifier</key>
  <string>local.lotion.test-release</string>
  <key>CFBundleName</key>
  <string>${xmlEscape(displayName)}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${xmlEscape(version)}</string>
  <key>CFBundleVersion</key>
  <string>${Date.now()}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
</dict>
</plist>
`,
    "utf8"
  );
}

async function exists(file) {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function trimForManifest(value) {
  const text = String(value || "");
  if (text.length <= 4_000) return text;
  return `${text.slice(0, 3_800)}\n... <truncated ${text.length - 3_800} chars>`;
}

function formatCommand(command, args = []) {
  return [command, ...args].join(" ");
}

function safeTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function safePathSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "-");
}

function releaseDisplayName(appInfo) {
  const rawName = String(appInfo?.name || "Lotion");
  const name = rawName.toLowerCase() === "lotion"
    ? "Lotion"
    : rawName.replace(/(^|[-_\s])([a-z])/g, (_match, prefix, letter) => `${prefix === "-" || prefix === "_" ? " " : prefix}${letter.toUpperCase()}`).trim();
  return `${name || "Lotion"} Test Release`;
}

function defaultElectronExecutable(root, platformName) {
  if (platformName === "darwin") {
    return join(root, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron");
  }
  if (platformName === "win32") {
    return join(root, "node_modules", "electron", "dist", "electron.exe");
  }
  return join(root, "node_modules", "electron", "dist", "electron");
}

async function findElectronExecutable(root, platformName) {
  for (const candidateRoot of ancestorDirs(root)) {
    const candidate = defaultElectronExecutable(candidateRoot, platformName);
    if (await exists(candidate)) return candidate;
  }
  return defaultElectronExecutable(root, platformName);
}

async function findRuntimeNodeModules(root, platformName) {
  for (const candidateRoot of ancestorDirs(root)) {
    const nodeModulesPath = join(candidateRoot, "node_modules");
    if (await exists(join(nodeModulesPath, "electron")) && await exists(defaultElectronExecutable(candidateRoot, platformName))) {
      return nodeModulesPath;
    }
  }
  for (const candidateRoot of ancestorDirs(root)) {
    const nodeModulesPath = join(candidateRoot, "node_modules");
    if (await exists(nodeModulesPath)) return nodeModulesPath;
  }
  return join(root, "node_modules");
}

function ancestorDirs(root) {
  const dirs = [];
  let current = resolve(root);
  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function isDirectCliRun(importMetaUrl) {
  return process.argv[1] && pathToFileURL(process.argv[1]).href === importMetaUrl;
}
