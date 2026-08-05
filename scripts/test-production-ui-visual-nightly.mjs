#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { readHarnessResultArtifactsSince } from "./ui-harness.mjs";
import {
  REQUIRED_REAL_WORKSPACE_RUNNERS,
  buildProductionVisualNightlyReport,
  formatProductionVisualNightlyMarkdown
} from "./lib/production-visual-nightly.mjs";
import {
  DEFAULT_PRODUCTION_VISUAL_FILTER,
  DEFAULT_PRODUCTION_VISUAL_SCRIPTS,
  DEFAULT_PRODUCTION_VISUAL_VIEWPORTS
} from "./lib/ui-suite-artifacts.mjs";

const root = process.cwd();
const sourceRoots = {
  "real-demo-workspace-ui": process.env.LOTION_REAL_DEMO_WORKSPACE_PATH
    || join(homedir(), "Documents", "Lotion Workspaces", "Lotion Demo Space"),
  "real-notion-import-ui": process.env.LOTION_REAL_NOTION_WORKSPACE_PATH
    || join(homedir(), "Documents", "Lotion Workspaces", "Notion Import")
};

await assertWorkspacePrerequisites(sourceRoots);
const startedAt = Date.now();
run("npm", ["run", "test:production-visual"], {
  ...process.env,
  LOTION_PRODUCTION_VISUAL_FILTER: DEFAULT_PRODUCTION_VISUAL_FILTER,
  LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS: DEFAULT_PRODUCTION_VISUAL_SCRIPTS.join(","),
  LOTION_UI_VIEWPORTS: DEFAULT_PRODUCTION_VISUAL_VIEWPORTS
});
run(process.execPath, ["scripts/smoke-real-demo-workspace-ui.mjs"], {
  ...process.env,
  LOTION_REAL_WORKSPACE_PATH: sourceRoots["real-demo-workspace-ui"],
  LOTION_UI_VIEWPORTS: "desktop,compact"
});
run(process.execPath, ["scripts/smoke-real-notion-import-ui.mjs"], {
  ...process.env,
  LOTION_REAL_WORKSPACE_PATH: sourceRoots["real-notion-import-ui"],
  LOTION_UI_VIEWPORTS: "desktop,compact"
});

const manifests = await readHarnessResultArtifactsSince({ startedAt });
const portableManifest = manifests.filter((entry) => entry.manifest?.name === "ui-suite").at(-1);
if (!portableManifest) throw new Error("Nightly production visual gate could not find a fresh portable ui-suite manifest.");
const portableIndexPath = portableManifest.manifest.result?.artifactIndex?.jsonPath;
if (!portableIndexPath) throw new Error("Nightly production visual gate fresh portable manifest is missing its artifact index path.");
const productionGatePath = join(dirname(portableIndexPath), "production-visual-gate", "production-visual-gate.json");
const productionGate = JSON.parse(await readFile(productionGatePath, "utf8"));
const realWorkspaceManifests = {};
const realWorkspaceManifestPaths = {};
for (const runner of REQUIRED_REAL_WORKSPACE_RUNNERS) {
  const entry = manifests.filter((candidate) => candidate.manifest?.name === runner.manifestName).at(-1);
  if (!entry) throw new Error(`Nightly production visual gate could not find a fresh ${runner.manifestName} manifest.`);
  realWorkspaceManifests[runner.manifestName] = entry.manifest;
  realWorkspaceManifestPaths[runner.manifestName] = entry.manifestPath;
}

const generatedAt = new Date().toISOString();
const report = buildProductionVisualNightlyReport({
  generatedAt,
  productionGate,
  productionGatePath,
  realWorkspaceManifests,
  realWorkspaceManifestPaths,
  root,
  sourceRoots: Object.values(sourceRoots)
});
const artifactRoot = join(root, "artifacts", "ui-smoke", `production-visual-nightly-${generatedAt.replace(/[:.]/g, "-")}`);
await mkdir(artifactRoot, { recursive: true });
const jsonPath = join(artifactRoot, "production-visual-nightly.json");
const markdownPath = join(artifactRoot, "production-visual-nightly.md");
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, formatProductionVisualNightlyMarkdown(report), "utf8");
console.log(JSON.stringify({ status: report.status, jsonPath, markdownPath, summary: report.summary }, null, 2));

async function assertWorkspacePrerequisites(paths) {
  for (const runner of REQUIRED_REAL_WORKSPACE_RUNNERS) {
    const path = paths[runner.manifestName];
    const info = await stat(path).catch(() => null);
    if (!info?.isDirectory()) {
      const envName = runner.manifestName === "real-demo-workspace-ui"
        ? "LOTION_REAL_DEMO_WORKSPACE_PATH"
        : "LOTION_REAL_NOTION_WORKSPACE_PATH";
      throw new Error(`Nightly production visual gate requires the ${runner.workspaceName} source directory. Set ${envName} to a valid workspace path.`);
    }
    const manifest = await stat(join(path, "lotion.json")).catch(() => null);
    if (!manifest?.isFile()) {
      throw new Error(`Nightly production visual gate requires ${runner.workspaceName} to contain lotion.json.`);
    }
  }
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`Nightly production visual gate command failed (${command} ${args.join(" ")}) with status ${result.status ?? "unknown"}.`);
  }
}
