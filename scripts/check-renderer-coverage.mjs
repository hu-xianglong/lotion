#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/v8-coverage.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const reportsDir = await mkdtemp(join(tmpdir(), "lotion-renderer-coverage-"));
const threshold = Number(process.env.LOTION_RENDERER_COVERAGE_THRESHOLD ?? "90");

assert.ok(
  Number.isFinite(threshold) && threshold >= 0 && threshold <= 100,
  "LOTION_RENDERER_COVERAGE_THRESHOLD must be a number from 0 to 100"
);

const includes = [
  "src/renderer/lib/**/*.ts",
  "src/renderer/lib/**/*.tsx",
  "src/renderer/state/**/*.ts",
  "src/renderer/state/**/*.tsx",
  "src/renderer/features/pages/workspace-link-routing.ts",
  "src/renderer/features/databases/option-colors.ts",
  "src/renderer/features/databases/templates.ts"
];

try {
  const args = [
    "--all",
    "--check-coverage",
    "--lines",
    String(threshold),
    "--reporter",
    "text-summary",
    "--reports-dir",
    reportsDir
  ];
  for (const include of includes) args.push("--include", include);
  args.push(
    tsxCommand(),
    "--tsconfig",
    "tsconfig.renderer-tests.json",
    "scripts/test-renderer-components.mjs"
  );

  console.log(`Renderer core line coverage threshold: ${threshold}%`);
  await run(c8Command(), args, { cwd: root });
} finally {
  await rm(reportsDir, { recursive: true, force: true });
}

function c8Command() {
  return join(root, "node_modules", ".bin", process.platform === "win32" ? "c8.cmd" : "c8");
}

function tsxCommand() {
  return join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
}
