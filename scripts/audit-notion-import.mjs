#!/usr/bin/env node
// Roundtrip-audit a Notion HTML/CSV export against an imported Lotion
// workspace. The core audit engine lives in src/main so this CLI and
// the app's Notion Import plugin page report the same issues.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const servicePath = join(repoRoot, "dist-electron", "main", "services", "notion-audit-service.js");

if (!existsSync(servicePath)) {
  console.error("Missing dist-electron/main/services/notion-audit-service.js.");
  console.error("Run `tsc -p tsconfig.main.json` first, or use `npm run audit:notion -- ...`.");
  process.exit(2);
}

const { runNotionAudit, formatNotionAuditMarkdown, formatNotionAuditText } = await import(pathToFileURL(servicePath).href);
const args = parseArgs(process.argv.slice(2));
const sourcePaths = args.sources.length > 0
  ? args.sources.map((source) => resolve(source))
  : [join(repoRoot, ".scratch", "export-html")];
const workspacePath = resolve(args.workspace ?? join(repoRoot, ".scratch", "notion-html-test"));

const result = await runNotionAudit({
  sourcePaths,
  workspacePath,
  csvFilters: args.csvFilters,
  htmlFilters: args.htmlFilters,
  auditAllHtml: args.auditAllHtml,
  keepEmptyRows: args.keepEmptyRows,
  maxRowExplosion: args.maxRowExplosion,
  maxIssues: args.maxIssues
});

process.stdout.write(formatNotionAuditText(result, { verbose: args.verbose, maxIssues: args.maxIssues }));

if (args.jsonOut) {
  await mkdir(dirname(args.jsonOut), { recursive: true });
  await writeFile(args.jsonOut, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`wrote ${args.jsonOut}`);
}

if (args.markdownOut) {
  await mkdir(dirname(args.markdownOut), { recursive: true });
  await writeFile(args.markdownOut, formatNotionAuditMarkdown(result, { maxItems: args.maxIssues }), "utf8");
  console.log(`wrote ${args.markdownOut}`);
}

if (result.summary.issues > 0) process.exit(1);

function parseArgs(argv) {
  const parsed = {
    sources: [],
    workspace: null,
    csvFilters: [],
    htmlFilters: [],
    jsonOut: null,
    markdownOut: null,
    verbose: false,
    keepEmptyRows: false,
    auditAllHtml: false,
    maxRowExplosion: 5,
    maxIssues: 80
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--source") {
      parsed.sources.push(value);
      index += 1;
    } else if (arg === "--workspace" || arg === "--imported") {
      parsed.workspace = value;
      index += 1;
    } else if (arg === "--csv") {
      parsed.csvFilters.push(value);
      index += 1;
    } else if (arg === "--html") {
      parsed.htmlFilters.push(value);
      index += 1;
    } else if (arg === "--all-html") {
      parsed.auditAllHtml = true;
    } else if (arg === "--json") {
      parsed.jsonOut = value;
      index += 1;
    } else if (arg === "--markdown" || arg === "--markdown-report") {
      parsed.markdownOut = value;
      index += 1;
    } else if (arg === "--verbose") {
      parsed.verbose = true;
    } else if (arg === "--keep-empty-rows") {
      parsed.keepEmptyRows = true;
    } else if (arg === "--max-row-explosion") {
      parsed.maxRowExplosion = Number(value);
      index += 1;
    } else if (arg === "--max-issues") {
      parsed.maxIssues = Number(value);
      index += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return parsed;
}
