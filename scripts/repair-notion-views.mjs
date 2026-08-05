#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const servicePath = join(
  repoRoot,
  "dist-electron",
  "main",
  "services",
  "notion-view-repair-service.js"
);
if (!existsSync(servicePath)) {
  console.error("Missing compiled Notion view repair service.");
  console.error("Run `tsc -p tsconfig.main.json` first.");
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
if (!args.workspace) {
  console.error("Usage: repair-notion-views.mjs --workspace <path> [--apply] [--run-id <id>]");
  process.exit(2);
}
const { repairMissingNotionViews } = await import(pathToFileURL(servicePath).href);
const report = await repairMissingNotionViews({
  workspacePath: resolve(args.workspace),
  apply: args.apply,
  runId: args.runId
});

console.log(`Notion embedded view repair (${report.mode})`);
console.log(`Workspace: ${report.workspacePath}`);
console.log(`Source placeholders: ${report.sourcePlaceholders}`);
console.log(`Repairable placeholders: ${report.repairablePlaceholders}`);
console.log(`Unresolved placeholders: ${report.unresolvedPlaceholders}`);
console.log(`Changed files: ${report.changedFiles}`);
if (report.backupRoot) console.log(`Backups: ${report.backupRoot}`);
if (!args.apply && report.repairablePlaceholders > 0) {
  console.log("Dry run only. Re-run with --apply to write the planned replacements.");
}

function parseArgs(argv) {
  const parsed = { workspace: "", apply: false, runId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--workspace") {
      parsed.workspace = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--apply") {
      parsed.apply = true;
    } else if (arg === "--run-id") {
      parsed.runId = argv[index + 1] ?? "";
      index += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return parsed;
}
