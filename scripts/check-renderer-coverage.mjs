#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";

import {
  DEFAULT_RENDERER_COVERAGE_THRESHOLDS,
  assertRendererCoverageGate,
  assertRendererCoverageSourceIntegrity,
  buildRendererCoverageGate
} from "./lib/renderer-coverage.mjs";

const require = createRequire(import.meta.url);
const root = process.cwd();
const artifactRoot = join(root, "artifacts", "coverage", "renderer");
const tempRoot = await mkdtemp(join(tmpdir(), "lotion-renderer-coverage-"));
const bundleDir = join(tempRoot, "bundle");
const rawReportDir = join(artifactRoot, "raw");
const baselinePath = join(root, "test", "baselines", "renderer-coverage.json");
const thresholds = coverageThresholds();

try {
  await mkdir(rawReportDir, { recursive: true });
  const c8Path = require.resolve("c8/bin/c8.js");
  const args = [
    c8Path,
    "--allowExternal",
    "--exclude-after-remap",
    "--all",
    "--src=src/renderer",
    "--include=**/src/renderer/**",
    "--reporter=json-summary",
    `--reports-dir=${rawReportDir}`,
    process.execPath,
    "scripts/test-renderer-components.mjs"
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, LOTION_RENDERER_COMPONENT_BUNDLE_DIR: bundleDir },
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`Renderer coverage collection failed with status ${result.status ?? "unknown"}.`);
  }

  const summaryPath = join(rawReportDir, "coverage-summary.json");
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const expectedSourcePaths = await rendererSourceInventory(join(root, "src", "renderer"));
  const gate = assertRendererCoverageSourceIntegrity(assertRendererCoverageGate(buildRendererCoverageGate(summary, {
    baseline,
    baselinePath: relative(root, baselinePath).replaceAll("\\", "/"),
    expectedSourcePaths,
    thresholds
  })));
  const jsonPath = join(artifactRoot, "renderer-coverage-gate.json");
  const markdownPath = join(artifactRoot, "renderer-coverage-gate.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify({
      ...gate,
      rawSummaryPath: relative(root, summaryPath).replaceAll("\\", "/"),
      jsonPath: relative(root, jsonPath).replaceAll("\\", "/"),
      markdownPath: relative(root, markdownPath).replaceAll("\\", "/")
    }, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, formatMarkdown(gate, summaryPath), "utf8")
  ]);
  console.log(JSON.stringify({
    status: gate.status,
    sourceEntryCount: gate.sourceEntryCount,
    sourceFileCount: gate.sourceFileCount,
    coveredSourceFileCount: gate.coveredSourceFileCount,
    canonicalizedAliasCount: gate.canonicalizedAliasCount,
    sourceInventory: gate.sourceInventory,
    total: gate.total,
    trend: gate.trend,
    jsonPath
  }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

function coverageThresholds() {
  const thresholds = {
    lines: numberEnv("LOTION_RENDERER_COVERAGE_LINES", DEFAULT_RENDERER_COVERAGE_THRESHOLDS.lines),
    statements: numberEnv("LOTION_RENDERER_COVERAGE_STATEMENTS", DEFAULT_RENDERER_COVERAGE_THRESHOLDS.statements),
    functions: numberEnv("LOTION_RENDERER_COVERAGE_FUNCTIONS", DEFAULT_RENDERER_COVERAGE_THRESHOLDS.functions),
    branches: numberEnv("LOTION_RENDERER_COVERAGE_BRANCHES", DEFAULT_RENDERER_COVERAGE_THRESHOLDS.branches)
  };
  for (const [metric, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`Invalid renderer ${metric} coverage threshold: ${value}`);
  }
  return thresholds;
}

function numberEnv(name, fallback) {
  const raw = process.env[name];
  return raw == null || raw === "" ? fallback : Number(raw);
}

async function rendererSourceInventory(directory, prefix = "src/renderer") {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(...await rendererSourceInventory(join(directory, entry.name), relativePath));
    } else if (entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      paths.push(relativePath);
    }
  }
  return paths.sort();
}

function formatMarkdown(gate, summaryPath) {
  const lines = [
    "# Lotion Renderer Coverage Gate",
    "",
    `- Status: ${gate.status}`,
    `- Raw source entries: ${gate.sourceEntryCount}`,
    `- Source files: ${gate.coveredSourceFileCount}/${gate.sourceFileCount} with executed lines`,
    `- Canonicalized aliases: ${gate.canonicalizedAliasCount}`,
    `- Source inventory: ${gate.sourceInventory.status} (${gate.sourceInventory.observedFileCount}/${gate.sourceInventory.expectedFileCount ?? "not checked"})`,
    `- Lines: ${gate.total.lines.pct}% (minimum ${gate.thresholds.lines}%)`,
    `- Statements: ${gate.total.statements.pct}% (minimum ${gate.thresholds.statements}%)`,
    `- Functions: ${gate.total.functions.pct}% (minimum ${gate.thresholds.functions}%)`,
    `- Branches: ${gate.total.branches.pct}% (minimum ${gate.thresholds.branches}%)`,
    `- Historical trend: ${gate.trend?.status ?? "not configured"}`,
    `- Verified baseline: ${gate.trend?.baselinePath ?? "not configured"}`,
    `- Raw summary: ${relative(root, summaryPath).replaceAll("\\", "/")}`,
    "",
    "| Category | Covered files | Lines | Functions | Branches |",
    "| --- | ---: | ---: | ---: | ---: |"
  ];
  for (const category of gate.categories) {
    lines.push(`| ${category.category} | ${category.coveredFileCount}/${category.fileCount} | ${category.metrics.lines.pct}% | ${category.metrics.functions.pct}% | ${category.metrics.branches.pct}% |`);
  }
  if (gate.trend) {
    lines.push("", "## Historical trend", "", "| Metric | Verified baseline | Current | Delta |", "| --- | ---: | ---: | ---: |");
    for (const [metric, entry] of Object.entries(gate.trend.metrics)) {
      lines.push(`| ${metric} | ${entry.baseline}% | ${entry.current}% | ${entry.delta >= 0 ? "+" : ""}${entry.delta} pp |`);
    }
  }
  lines.push("", "## Lowest line coverage", "");
  for (const file of gate.lowestLineCoverageFiles) lines.push(`- ${file.path}: ${file.lines.pct}% (${file.lines.covered}/${file.lines.total})`);
  return `${lines.join("\n")}\n`;
}
