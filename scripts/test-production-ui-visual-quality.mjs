#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { readHarnessResultArtifactsSince } from "./ui-harness.mjs";
import {
  DEFAULT_PRODUCTION_VISUAL_FILTER,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORTS,
  assertProductionVisualGateContract,
  DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  productionVisualViewportNamesFromSelection
} from "./lib/ui-suite-artifacts.mjs";

const startedAt = Date.now();
const filter = (process.env.LOTION_PRODUCTION_VISUAL_FILTER || DEFAULT_PRODUCTION_VISUAL_FILTER).trim();
const viewports = (process.env.LOTION_UI_VIEWPORTS || DEFAULT_PRODUCTION_VISUAL_VIEWPORTS).trim();

const result = spawnSync(process.execPath, ["scripts/smoke-ui-suite.mjs"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    LOTION_UI_SUITE_FILTER: filter,
    LOTION_UI_VIEWPORTS: viewports
  },
  encoding: "utf8",
  stdio: "inherit"
});

if (result.status !== 0) {
  throw new Error(`Production visual quality gate UI suite failed with status ${result.status ?? "unknown"}.`);
}

const manifests = await readHarnessResultArtifactsSince({ startedAt });
const suiteManifest = manifests
  .filter((entry) => entry.manifest?.name === "ui-suite")
  .at(-1);

if (!suiteManifest) {
  throw new Error("Production visual quality gate could not find the ui-suite harness manifest.");
}

const indexPath = suiteManifest.manifest?.result?.artifactIndex?.jsonPath;
if (!indexPath) {
  throw new Error(`Production visual quality gate manifest is missing artifact index path: ${suiteManifest.manifestPath}`);
}

const index = JSON.parse(await readFile(indexPath, "utf8"));
const requiredScripts = (process.env.LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);
const contract = assertProductionVisualGateContract(index, {
  requiredSuiteScripts: requiredScripts.length > 0 ? requiredScripts : DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  requiredViewportNames: productionVisualViewportNamesFromSelection(viewports)
});

const gateRoot = join(suiteManifest.manifest.artifactRoot, "production-visual-gate");
await mkdir(gateRoot, { recursive: true });
const jsonPath = join(gateRoot, "production-visual-gate.json");
const markdownPath = join(gateRoot, "production-visual-gate.md");
await writeFile(jsonPath, `${JSON.stringify({
  kind: "lotion-production-visual-quality-gate",
  status: "passed",
  filter,
  viewports,
  uiSuiteManifest: suiteManifest.manifestPath,
  uiSuiteArtifactIndex: indexPath,
  contract
}, null, 2)}\n`, "utf8");
await writeFile(markdownPath, formatGateMarkdown({ contract, filter, indexPath, jsonPath, suiteManifest, viewports }), "utf8");

console.log(JSON.stringify({
  status: "passed",
  filter,
  viewports,
  artifactIndex: indexPath,
  productionVisualGate: jsonPath,
  contract
}, null, 2));

function formatGateMarkdown({ contract, filter, indexPath, jsonPath, suiteManifest, viewports }) {
  const lines = [
    "# Lotion Production Visual Quality Gate",
    "",
    "- Status: passed",
    `- Filter: \`${filter}\``,
    `- Viewports: \`${viewports}\``,
    `- UI suite manifest: \`${suiteManifest.manifestPath}\``,
    `- UI suite artifact index: \`${indexPath}\``,
    `- Machine-readable gate result: \`${jsonPath}\``,
    `- Required suites: ${contract.requiredSuiteCount}`,
    `- Screenshots: ${contract.snapshotCount}`,
    `- Screenshot bytes: ${contract.imageBytesTotal}`,
    "",
    "| Suite | Viewports | Screenshots | Reproduce | Representative snapshots |",
    "| --- | --- | ---: | --- | --- |"
  ];
  for (const suite of contract.suites) {
    lines.push(`| ${escapeTable(suite.name)} | ${escapeTable(suite.viewports.join(", "))} | ${suite.snapshotCount} | \`${escapeTable(suite.reproduceCommand)}\` | ${escapeTable(suite.representativeSnapshotPaths.map((path) => `\`${path}\``).join(", "))} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}
