#!/usr/bin/env node
// Reimport a Notion export into a scratch Lotion workspace, run the shared
// import audit, and write a concise regression report.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const importerPath = join(repoRoot, "dist-electron", "main", "services", "notion-import-service.js");
const auditPath = join(repoRoot, "dist-electron", "main", "services", "notion-audit-service.js");

if (!existsSync(importerPath) || !existsSync(auditPath)) {
  console.error("Missing dist-electron importer/audit service.");
  console.error("Run `tsc -p tsconfig.main.json` first, or use `npm run regress:notion-import -- ...`.");
  process.exit(2);
}

const { NotionImportService } = await import(pathToFileURL(importerPath).href);
const { runNotionAudit, formatNotionAuditText } = await import(pathToFileURL(auditPath).href);

const args = parseArgs(process.argv.slice(2));
const sourcePath = resolve(args.source ?? join(repoRoot, ".scratch", "export-html"));
const targetPath = resolve(args.target ?? join(repoRoot, ".scratch", "notion-import-regression"));
const reportPath = resolve(args.report ?? join(repoRoot, ".scratch", "notion-import-regression-report.json"));
const markdownReportPath = args.markdownReport
  ? resolve(args.markdownReport)
  : reportPath.replace(/\.json$/i, ".md");

const startedAt = Date.now();
const service = new NotionImportService({ touch: async () => undefined });
const importResult = await service.runImport(sourcePath, targetPath, true, {
  skipEmptyRowsAndPages: !args.keepEmptyRows,
  dedupeMarkdownFiles: true,
  includeOriginalHtml: args.includeOriginalHtml
});
const auditResult = await runNotionAudit({
  sourcePaths: [sourcePath],
  workspacePath: targetPath,
  csvFilters: args.csvFilters,
  htmlFilters: args.htmlFilters,
  auditAllHtml: args.auditAllHtml,
  keepEmptyRows: args.keepEmptyRows,
  maxIssues: args.maxIssues
});
const elapsedMs = Date.now() - startedAt;
const report = {
  createdAt: new Date().toISOString(),
  elapsedMs,
  sourcePath,
  targetPath,
  import: importResult,
  audit: auditResult
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
await mkdir(dirname(markdownReportPath), { recursive: true });
await writeFile(markdownReportPath, formatRegressionMarkdown(report), "utf8");

process.stdout.write(formatNotionAuditText(auditResult, { verbose: args.verbose, maxIssues: args.maxIssues }));
console.log(`wrote ${reportPath}`);
console.log(`wrote ${markdownReportPath}`);
console.log(`elapsed ${(elapsedMs / 1000).toFixed(1)}s`);

if (auditResult.summary.issues > 0) process.exit(1);

function parseArgs(argv) {
  const parsed = {
    source: null,
    target: null,
    report: null,
    markdownReport: null,
    csvFilters: [],
    htmlFilters: [],
    auditAllHtml: false,
    keepEmptyRows: false,
    includeOriginalHtml: true,
    verbose: false,
    maxIssues: 200
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--source") {
      parsed.source = value;
      index += 1;
    } else if (arg === "--target") {
      parsed.target = value;
      index += 1;
    } else if (arg === "--report") {
      parsed.report = value;
      index += 1;
    } else if (arg === "--markdown-report") {
      parsed.markdownReport = value;
      index += 1;
    } else if (arg === "--csv") {
      parsed.csvFilters.push(value);
      index += 1;
    } else if (arg === "--html") {
      parsed.htmlFilters.push(value);
      index += 1;
    } else if (arg === "--all-html") {
      parsed.auditAllHtml = true;
    } else if (arg === "--keep-empty-rows") {
      parsed.keepEmptyRows = true;
    } else if (arg === "--no-original") {
      parsed.includeOriginalHtml = false;
    } else if (arg === "--verbose") {
      parsed.verbose = true;
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

function formatRegressionMarkdown(report) {
  const audit = report.audit;
  const importSummary = report.import?.scan ?? {};
  const databaseRows = Array.isArray(importSummary.databases)
    ? importSummary.databases.reduce((sum, database) => sum + (database.rows ?? 0), 0)
    : undefined;
  const lines = [
    "# Notion Import Regression Report",
    "",
    `- Created: ${report.createdAt}`,
    `- Source: ${report.sourcePath}`,
    `- Workspace: ${report.targetPath}`,
    `- Elapsed: ${(report.elapsedMs / 1000).toFixed(1)}s`,
    `- Import report page: ${report.import?.reportPageId ?? "none"}`,
    "",
    "## Import",
    "",
    `- Databases: ${formatNumber(importSummary.databases?.length)}`,
    `- Rows: ${formatNumber(databaseRows)}`,
    `- Pages: ${formatNumber(importSummary.topLevelPages)}`,
    `- Attachments: ${formatNumber(importSummary.attachments)}`,
    "",
    "## Audit",
    "",
    `- Source CSVs: ${audit.summary.auditedCsvs}/${audit.summary.sourceCsvs}`,
    `- Source HTMLs: ${audit.summary.auditedHtmls}/${audit.summary.sourceHtmls}`,
    `- Workspace DBs: ${audit.summary.workspaceDatabases}`,
    `- Workspace rows: ${audit.summary.workspaceRows}`,
    `- Imported mapping DBs: ${audit.summary.workspaceImportedDatabases}`,
    `- Imported mapping rows/pages: ${audit.summary.workspaceImportedRows}`,
    `- Issues: ${audit.summary.issues}`,
    `- Warnings: ${audit.summary.warnings}`,
    "",
    "## Issue Kinds",
    "",
    formatKindMarkdown(audit.issueKinds),
    "",
    "## Warning Kinds",
    "",
    formatKindMarkdown(audit.warningKinds),
    "",
    "## First Issues",
    "",
    formatItemsMarkdown(audit.issues),
    "",
    "## First Warnings",
    "",
    formatItemsMarkdown(audit.warnings)
  ];
  return `${lines.join("\n")}\n`;
}

function formatNumber(value) {
  return typeof value === "number" ? value.toLocaleString() : "n/a";
}

function formatKindMarkdown(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "None";
  return entries.map(([kind, count]) => `- ${kind}: ${count}`).join("\n");
}

function formatItemsMarkdown(items) {
  if (items.length === 0) return "None";
  return items.slice(0, 40).map((item) => `- [${item.kind}] ${item.source}: ${item.message}`).join("\n");
}
