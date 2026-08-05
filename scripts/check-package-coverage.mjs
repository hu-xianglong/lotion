#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  collectCoverage,
  fileExists,
  run,
  summarizeCoverage,
  walkJavaScriptFiles
} from "./lib/v8-coverage.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const coverageDir = await mkdtemp(join(tmpdir(), "lotion-package-coverage-"));
const threshold = Number(process.env.LOTION_PACKAGE_COVERAGE_THRESHOLD ?? "80");

try {
  await run(npmCommand(), ["run", "test:fast"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_V8_COVERAGE: coverageDir
    }
  });

  const packageTargets = await packageCoverageTargets();
  const pluginTargets = await pluginCoverageTargets();
  const packageSummary = await collectCoverage(root, coverageDir, packageTargets);
  const pluginSummary = await collectCoverage(root, coverageDir, pluginTargets);
  const overall = summarizeCoverage(packageSummary);
  const pluginOverall = summarizeCoverage(pluginSummary);
  const combinedSummary = [...packageSummary, ...pluginSummary];
  const worst = combinedSummary
    .filter((item) => item.total > 0)
    .sort((a, b) => a.percent - b.percent || b.total - a.total)
    .slice(0, 20);

  console.log(
    `Package runtime coverage: ${overall.percent.toFixed(1)}% ` +
    `(${overall.covered}/${overall.total} lines across ${packageSummary.length} files)`
  );
  console.log(
    `Builtin plugin runtime coverage: ${pluginOverall.percent.toFixed(1)}% ` +
    `(${pluginOverall.covered}/${pluginOverall.total} lines across ${pluginSummary.length} files)`
  );
  for (const item of worst) {
    console.log(
      `${item.percent.toFixed(1).padStart(5)}% ` +
      `${String(item.covered).padStart(4)}/${String(item.total).padEnd(4)} ${item.label}`
    );
  }

  assert.ok(
    overall.percent >= threshold,
    `Package runtime coverage ${overall.percent.toFixed(1)}% is below ${threshold}%`
  );
  const pluginThreshold = Number(process.env.LOTION_PLUGIN_COVERAGE_THRESHOLD ?? "80");
  assert.ok(
    pluginOverall.percent >= pluginThreshold,
    `Builtin plugin runtime coverage ${pluginOverall.percent.toFixed(1)}% is below ${pluginThreshold}%`
  );
} finally {
  await rm(coverageDir, { recursive: true, force: true });
}

async function packageCoverageTargets() {
  const targetRoots = [
    join(root, "dist-electron/main/services"),
    join(root, "dist-electron/main/storage"),
    join(root, "dist-electron/main/plugin-host"),
    join(root, "dist-electron/shared")
  ];
  const files = [];
  for (const targetRoot of targetRoots) {
    files.push(...await walkJavaScriptFiles(targetRoot));
  }
  const customerApi = join(root, "dist-electron/main/customer-api.js");
  if (await fileExists(customerApi)) files.push(customerApi);
  const unique = [...new Set(files)].sort();
  const withSources = [];
  for (const file of unique) {
    if (await hasSourceForDistFile(file)) withSources.push(file);
  }
  return withSources;
}

async function pluginCoverageTargets() {
  const targetRoot = join(root, "dist-electron/builtin-plugins");
  const files = [...new Set(await walkJavaScriptFiles(targetRoot))].sort();
  const withSources = [];
  for (const file of files) {
    if (await hasSourceForDistFile(file)) withSources.push(file);
  }
  return withSources;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

async function hasSourceForDistFile(file) {
  const rel = file.slice(join(root, "dist-electron").length + 1).replace(/\.js$/, "");
  return (
    await fileExists(join(root, "src", `${rel}.ts`)) ||
    await fileExists(join(root, "src", `${rel}.tsx`))
  );
}
