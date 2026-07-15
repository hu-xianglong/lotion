import { createHash } from "node:crypto";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import type {
  DatabaseSchema,
  EntityRef,
  NotionAuditInput,
  NotionAuditItem,
  NotionAuditResult,
  NotionAuditSummary
} from "../../shared/types.js";
import { fileService } from "./file-service.js";

interface AuditOptions {
  sourceRoots: string[];
  workspaceRoot: string;
  csvFilters: string[];
  htmlFilters: string[];
  auditAllHtml: boolean;
  keepEmptyRows: boolean;
  maxRowExplosion: number;
  maxStoredItems: number;
}

interface SourceCsvRow {
  index: number;
  cells: string[];
  byHeader: Map<string, string>;
}

interface SourceCsv {
  hash: string;
  path: string;
  rel: string;
  displayName: string;
  isAll: boolean;
  headers: string[];
  rows: SourceCsvRow[];
}

interface SourceHtml {
  hash: string;
  path: string;
  rel: string;
  displayName: string;
  bodyText: string;
  hasMaterialBody: boolean;
}

interface SourceIndex {
  csvCandidates: SourceCandidate[];
  htmlCandidates: SourceCandidate[];
  totalCsvs: number;
  totalHtmls: number;
}

interface SourceCandidate {
  hash: string;
  path: string;
  rel: string;
  displayName: string;
  isAll: boolean;
  size: number;
}

interface WorkspaceDatabase {
  group: string;
  abs: string;
  rel: string;
  schema: DatabaseSchema;
  sourceCsvHash: string;
  headers: string[];
  rows: WorkspaceRow[];
}

interface WorkspaceRow {
  id: string;
  db: WorkspaceDatabase;
  record: Record<string, string>;
  sourceCsvHash: string;
  sourceHtmlHash: string;
  originalCsv: string;
  originalHtml: string;
}

interface WorkspaceIndex {
  databases: WorkspaceDatabase[];
  rows: WorkspaceRow[];
  databasesBySourceCsvHash: Map<string, WorkspaceDatabase[]>;
  rowsBySourceCsvHash: Map<string, WorkspaceRow[]>;
  rowsBySourceHtmlHash: Map<string, WorkspaceRow[]>;
  accountedHtmlHashes: Set<string>;
  entitiesById: Map<string, WorkspaceRow>;
}

interface BodyCheckOptions {
  requireTextMatch?: boolean;
}

export async function runNotionAudit(input: NotionAuditInput): Promise<NotionAuditResult> {
  const options = normalizeAuditInput(input);
  const runner = new NotionAuditRunner(options);
  return runner.run();
}

export function formatNotionAuditText(
  result: NotionAuditResult,
  options: { verbose?: boolean; maxIssues?: number } = {}
): string {
  const issueLimit = options.maxIssues ?? 80;
  const lines = [
    "Notion import audit",
    `  source: ${result.summary.sourceRoots.join(", ")}`,
    `  workspace: ${result.summary.workspaceRoot}`,
    `  audited ${result.summary.auditedCsvs}/${result.summary.sourceCsvs} CSV(s), ${result.summary.auditedHtmls}/${result.summary.sourceHtmls} HTML file(s)`,
    `  workspace: ${result.summary.workspaceDatabases} DB(s), ${result.summary.workspaceRows} row(s)`,
    `  imported mappings: ${result.summary.workspaceImportedDatabases} DB(s), ${result.summary.workspaceImportedRows} row/page(s)`,
    `  issues=${result.summary.issues}, warnings=${result.summary.warnings}`
  ];

  if (result.issues.length > 0) {
    const kindSummary = formatKindSummary(result.issueKinds);
    if (kindSummary) lines.push("", `Issue kinds: ${kindSummary}`);
    lines.push("", "Issues:");
    for (const item of result.issues.slice(0, issueLimit)) {
      lines.push(`  [${item.kind}] ${item.source ? `${item.source}: ` : ""}${item.message}`);
    }
    const hiddenIssues = result.summary.issues - Math.min(result.issues.length, issueLimit);
    if (hiddenIssues > 0) {
      lines.push(`  ... ${hiddenIssues} more`);
    }
  }

  if (result.warnings.length > 0 && options.verbose) {
    const kindSummary = formatKindSummary(result.warningKinds);
    if (kindSummary) lines.push("", `Warning kinds: ${kindSummary}`);
    lines.push("", "Warnings:");
    for (const item of result.warnings.slice(0, issueLimit)) {
      lines.push(`  [${item.kind}] ${item.source ? `${item.source}: ` : ""}${item.message}`);
    }
    const hiddenWarnings = result.summary.warnings - Math.min(result.warnings.length, issueLimit);
    if (hiddenWarnings > 0) {
      lines.push(`  ... ${hiddenWarnings} more`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function formatNotionAuditMarkdown(
  result: NotionAuditResult,
  options: { maxItems?: number } = {}
): string {
  const itemLimit = options.maxItems ?? 40;
  const summary = result.summary;
  const lines = [
    "# Notion Import Audit Report",
    "",
    "## Sources",
    "",
    ...summary.sourceRoots.map((source) => `- Source: ${source}`),
    `- Workspace: ${summary.workspaceRoot}`,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Source CSVs | ${summary.auditedCsvs} / ${summary.sourceCsvs} |`,
    `| Source HTMLs | ${summary.auditedHtmls} / ${summary.sourceHtmls} |`,
    `| Workspace databases | ${summary.workspaceDatabases} |`,
    `| Workspace rows | ${summary.workspaceRows} |`,
    `| Imported mapping databases | ${summary.workspaceImportedDatabases} |`,
    `| Imported mapping rows/pages | ${summary.workspaceImportedRows} |`,
    `| Issues | ${summary.issues} |`,
    `| Warnings | ${summary.warnings} |`,
    "",
    "## Issue Kinds",
    "",
    formatKindMarkdown(result.issueKinds),
    "",
    "## Warning Kinds",
    "",
    formatKindMarkdown(result.warningKinds),
    "",
    "## First Issues",
    "",
    formatItemsMarkdown(result.issues, itemLimit),
    "",
    "## First Warnings",
    "",
    formatItemsMarkdown(result.warnings, itemLimit)
  ];
  return `${lines.join("\n")}\n`;
}

function formatKindSummary(counts: Record<string, number>): string {
  return Object.entries(counts)
    .slice(0, 12)
    .map(([kind, count]) => `${kind}=${count.toLocaleString()}`)
    .join(", ");
}

function formatKindMarkdown(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "None";
  return entries.map(([kind, count]) => `- ${kind}: ${count}`).join("\n");
}

function formatItemsMarkdown(items: NotionAuditItem[], limit: number): string {
  if (items.length === 0) return "None";
  return items.slice(0, limit).map((item) => {
    const source = item.source ? `${sanitizeMarkdownCell(item.source)}: ` : "";
    return `- [${sanitizeMarkdownCell(item.kind)}] ${source}${sanitizeMarkdownCell(item.message)}`;
  }).join("\n");
}

function sanitizeMarkdownCell(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAuditInput(input: NotionAuditInput): AuditOptions {
  return {
    sourceRoots: (input.sourcePaths ?? []).filter(Boolean).map((source) => resolve(source)),
    workspaceRoot: resolve(input.workspacePath ?? ""),
    csvFilters: input.csvFilters?.filter(Boolean) ?? [],
    htmlFilters: input.htmlFilters?.filter(Boolean) ?? [],
    auditAllHtml: Boolean(input.auditAllHtml),
    keepEmptyRows: Boolean(input.keepEmptyRows),
    maxRowExplosion: input.maxRowExplosion ?? 5,
    maxStoredItems: Math.max(1, input.maxIssues ?? 500)
  };
}

class NotionAuditRunner {
  private readonly issues: NotionAuditItem[] = [];
  private readonly warnings: NotionAuditItem[] = [];
  private readonly issueKinds = new Map<string, number>();
  private readonly warningKinds = new Map<string, number>();
  private issueCount = 0;
  private warningCount = 0;
  private source?: SourceIndex;
  private readonly workspaceCsvCache = new Map<string, SourceCsv | null>();
  private readonly workspaceHtmlCache = new Map<string, SourceHtml | null>();
  private readonly workspaceHtmlHashCache = new Map<string, string>();
  private readonly auditedOriginalHtmlResources = new Set<string>();
  private sourceCsvHashByContentDigest?: Map<string, string | null>;

  constructor(private readonly options: AuditOptions) {}

  async run(): Promise<NotionAuditResult> {
    if (this.options.sourceRoots.length === 0 || !this.options.sourceRoots.some((root) => fileService.exists(root))) {
      this.issue("assertion", "", `at least one source exists: ${this.options.sourceRoots.join(", ") || "(none)"}`);
    }
    if (!fileService.exists(join(this.options.workspaceRoot, "lotion.json"))) {
      this.issue("assertion", "", `workspace has lotion.json: ${this.options.workspaceRoot}`);
    }

    const source = await this.indexSource(this.options.sourceRoots);
    this.source = source;
    const workspace = await this.indexWorkspace(this.options.workspaceRoot);
    this.auditEntityRefs(workspace);

    const selectedCsvs = this.selectSourceCsvCandidates(source.csvCandidates, this.options.csvFilters);
    const selectedHtmls = this.selectSourceHtmlCandidates(source.htmlCandidates, this.options.htmlFilters);

    for (const candidate of selectedCsvs) {
      const csv = await this.readSourceCsv(candidate);
      await this.auditCsv(csv, workspace);
    }
    for (const candidate of selectedHtmls) {
      const html = await this.readSourceHtml(candidate);
      await this.auditHtml(html, workspace);
    }

    const summary: NotionAuditSummary = {
      sourceRoots: this.options.sourceRoots,
      workspaceRoot: this.options.workspaceRoot,
      sourceCsvs: source.totalCsvs,
      sourceHtmls: source.totalHtmls,
      auditedCsvs: selectedCsvs.length,
      auditedHtmls: selectedHtmls.length,
      workspaceDatabases: workspace.databases.length,
      workspaceRows: workspace.rows.length,
      workspaceImportedDatabases: workspace.databases.filter((database) => Boolean(database.sourceCsvHash)).length,
      workspaceImportedRows: workspace.rows.filter((row) =>
        Boolean(row.sourceCsvHash || row.sourceHtmlHash || row.originalCsv || row.originalHtml)
      ).length,
      issues: this.issueCount,
      warnings: this.warningCount
    };

    return {
      summary,
      issueKinds: Object.fromEntries([...this.issueKinds.entries()].sort((a, b) => b[1] - a[1])),
      warningKinds: Object.fromEntries([...this.warningKinds.entries()].sort((a, b) => b[1] - a[1])),
      issues: this.issues,
      warnings: this.warnings
    };
  }

  private async auditCsv(csv: SourceCsv, workspaceIndex: WorkspaceIndex): Promise<void> {
    const importedDbs = workspaceIndex.databasesBySourceCsvHash.get(csv.hash) ?? [];
    if (importedDbs.length === 0) {
      this.issue("missing_database", csv.path, `No imported Lotion database references source CSV ${csv.displayName}`);
      return;
    }
    if (importedDbs.length > 1) {
      this.issue(
        "duplicate_database_mapping",
        csv.path,
        `${importedDbs.length} Lotion databases reference source CSV ${csv.displayName}`
      );
    }

    const imported = importedDbs[0];
    this.auditDatabasePath(csv, imported);
    this.auditDatabaseOriginalCsvLink(imported);
    this.auditImportedNumberCells(imported);
    this.auditImportedUrlCells(imported);
    this.auditImportedOptionCells(imported);
    this.auditImportedDateCells(imported);
    this.auditImportedCheckboxCells(imported);
    const importedRows = workspaceIndex.rowsBySourceCsvHash.get(csv.hash) ?? [];
    const sourceCsv = (await this.readWorkspaceCsv(importedRows[0]?.originalCsv, csv.hash)) ?? csv;
    const fieldByName = new Map<string, string>();
    for (const field of imported.schema.fields ?? []) {
      if (!fieldByName.has(field.name)) fieldByName.set(field.name, field.id);
    }
    const [titleHeader = "", ...otherHeaders] = sourceCsv.headers;
    const titleField = imported.schema.fields.find((field) => field.id === "title");
    if (titleField?.name !== titleHeader) {
      this.warn(
        "title_field_name",
        imported.rel,
        `Title field is "${titleField?.name}", source title column is "${titleHeader}"`
      );
    }

    const fieldIdBySourceHeader = new Map<string, string>();
    fieldIdBySourceHeader.set(titleHeader, "title");
    for (const header of otherHeaders) {
      const fieldId = fieldByName.get(header) ?? fieldByName.get(`${header} (Notion)`);
      if (!fieldId) {
        this.issue("missing_field", imported.rel, `Source column "${header}" from ${sourceCsv.displayName} was not imported`);
        continue;
      }
      fieldIdBySourceHeader.set(header, fieldId);
    }

    const expectedRows = this.options.keepEmptyRows
      ? sourceCsv.rows
      : sourceCsv.rows.filter((row) => !row.cells.every((cell) => isBlank(cell)));

    if (importedRows.length < expectedRows.length) {
      this.issue(
        "rows_lost",
        imported.rel,
        `${sourceCsv.displayName}: source rows=${expectedRows.length}, imported rows=${importedRows.length}`
      );
    }
    if (expectedRows.length > 0 && importedRows.length / expectedRows.length > this.options.maxRowExplosion) {
      this.issue(
        "row_explosion",
        imported.rel,
        `${sourceCsv.displayName}: source rows=${expectedRows.length}, imported rows=${importedRows.length}`
      );
    }

    const importedRowsByFingerprint = this.indexImportedRowsByFingerprint(
      sourceCsv.headers,
      importedRows,
      fieldIdBySourceHeader
    );
    const importedRowsByTitle = this.indexImportedRowsByTitle(importedRows);
    const usedImportedRows = new Set<WorkspaceRow>();
    let importedIndex = 0;
    for (const srcRow of expectedRows) {
      const exactRow = this.claimImportedRowByFingerprint(
        srcRow,
        sourceCsv.headers,
        importedRowsByFingerprint,
        fieldIdBySourceHeader,
        usedImportedRows
      );
      if (exactRow) {
        usedImportedRows.add(exactRow);
        this.compareCsvRow(sourceCsv, imported, srcRow, exactRow, fieldIdBySourceHeader, srcRow.index + 2);
        continue;
      }
      const titleRow = this.claimImportedRowByTitle(srcRow, titleHeader, importedRowsByTitle, usedImportedRows);
      if (titleRow) {
        usedImportedRows.add(titleRow);
        this.compareCsvRow(sourceCsv, imported, srcRow, titleRow, fieldIdBySourceHeader, srcRow.index + 2);
        continue;
      }
      const match = this.findImportedRowMatch(
        srcRow,
        importedRows,
        importedIndex,
        fieldIdBySourceHeader,
        usedImportedRows
      );
      if (!match.row) break;
      usedImportedRows.add(match.row);
      this.compareCsvRow(sourceCsv, imported, srcRow, match.row, fieldIdBySourceHeader, srcRow.index + 2);
      importedIndex = match.index + 1;
    }

    for (const row of importedRows) {
      if (!row.originalCsv) {
        this.issue("missing_original_csv_link", imported.rel, `Row ${row.id} has no notion_original_csv link`);
      } else {
        this.assertWorkspaceFile(row.originalCsv, imported.rel, "notion_original_csv");
      }
      if (row.originalHtml) {
        this.assertWorkspaceFile(row.originalHtml, imported.rel, "notion_original_html");
      } else if (row.record.body_path || row.record.page_file) {
        this.issue(
          "missing_original_html_link",
          imported.rel,
          `Row ${row.id} has imported body content but no notion_original_html link`
        );
      }
    }
  }

  private findImportedRowMatch(
    srcRow: SourceCsvRow,
    importedRows: WorkspaceRow[],
    startIndex: number,
    fieldIdBySourceHeader: Map<string, string>,
    usedRows: Set<WorkspaceRow>
  ): { row?: WorkspaceRow; index: number } {
    const firstIndex = nextUnusedIndex(importedRows, startIndex, usedRows);
    if (firstIndex >= importedRows.length) return { index: firstIndex };
    const currentScore = this.csvRowMatchScore(srcRow, importedRows[firstIndex], fieldIdBySourceHeader);
    let bestIndex = firstIndex;
    let bestScore = currentScore;
    const end = Math.min(importedRows.length, firstIndex + 50);
    for (let index = firstIndex + 1; index < end; index += 1) {
      if (usedRows.has(importedRows[index])) continue;
      const score = this.csvRowMatchScore(srcRow, importedRows[index], fieldIdBySourceHeader);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const index = bestIndex !== firstIndex && bestScore > currentScore + 4 ? bestIndex : firstIndex;
    return { row: importedRows[index], index };
  }

  private indexImportedRowsByFingerprint(
    headers: string[],
    importedRows: WorkspaceRow[],
    fieldIdBySourceHeader: Map<string, string>
  ): Map<string, WorkspaceRow[]> {
    const rowsByFingerprint = new Map<string, WorkspaceRow[]>();
    for (const row of importedRows) {
      const fingerprint = importedRowFingerprint(headers, row, fieldIdBySourceHeader);
      if (!fingerprint) continue;
      pushMap(rowsByFingerprint, fingerprint, row);
    }
    return rowsByFingerprint;
  }

  private indexImportedRowsByTitle(importedRows: WorkspaceRow[]): Map<string, WorkspaceRow[]> {
    const rowsByTitle = new Map<string, WorkspaceRow[]>();
    for (const row of importedRows) {
      const title = titleMatchKey(row.record.title ?? "");
      if (!title) continue;
      pushMap(rowsByTitle, title, row);
    }
    return rowsByTitle;
  }

  private claimImportedRowByFingerprint(
    srcRow: SourceCsvRow,
    headers: string[],
    importedRowsByFingerprint: Map<string, WorkspaceRow[]>,
    fieldIdBySourceHeader: Map<string, string>,
    usedRows: Set<WorkspaceRow>
  ): WorkspaceRow | undefined {
    const fingerprint = sourceRowFingerprint(headers, srcRow, fieldIdBySourceHeader);
    const candidates = importedRowsByFingerprint.get(fingerprint);
    while (candidates?.length) {
      const row = candidates.shift();
      if (row && !usedRows.has(row)) return row;
    }
    return undefined;
  }

  private claimImportedRowByTitle(
    srcRow: SourceCsvRow,
    titleHeader: string,
    importedRowsByTitle: Map<string, WorkspaceRow[]>,
    usedRows: Set<WorkspaceRow>
  ): WorkspaceRow | undefined {
    const title = titleMatchKey(srcRow.byHeader.get(titleHeader) ?? "");
    const candidates = importedRowsByTitle.get(title);
    while (candidates?.length) {
      const row = candidates.shift();
      if (row && !usedRows.has(row)) return row;
    }
    return undefined;
  }

  private csvRowMatchScore(
    srcRow: SourceCsvRow,
    impRow: WorkspaceRow,
    fieldIdBySourceHeader: Map<string, string>
  ): number {
    let score = 0;
    let compared = 0;
    for (const [header, sourceValue] of srcRow.byHeader) {
      if (isBlank(sourceValue)) continue;
      const fieldId = fieldIdBySourceHeader.get(header);
      if (!fieldId) continue;
      compared += 1;
      const importedValue = impRow.record[fieldId] ?? "";
      if (isBlank(importedValue)) score -= 3;
      else if (compatibleValue(sourceValue, importedValue)) score += 4;
      else score -= 1;
    }
    return compared === 0 ? 0 : score;
  }

  private compareCsvRow(
    csv: SourceCsv,
    imported: WorkspaceDatabase,
    srcRow: SourceCsvRow,
    impRow: WorkspaceRow,
    fieldIdBySourceHeader: Map<string, string>,
    sourceLine: number
  ): void {
    for (const header of csv.headers) {
      const sourceValue = srcRow.byHeader.get(header) ?? "";
      const fieldId = fieldIdBySourceHeader.get(header);
      if (!fieldId) continue;
      const importedValue = impRow.record[fieldId] ?? "";
      if (isBlank(sourceValue)) continue;
      if (isBlank(importedValue)) {
        this.issue(
          "cell_loss",
          imported.rel,
          `${csv.displayName}:${sourceLine}: source column "${header}" is populated but imported row ${impRow.id} is empty`
        );
        continue;
      }
      if (!compatibleValue(sourceValue, importedValue)) {
        this.warn(
          "cell_value_changed",
          imported.rel,
          `${csv.displayName}:${sourceLine}: "${header}" source=${quote(sourceValue)} imported=${quote(importedValue)}`
        );
      }
    }
  }

  private async auditHtml(html: SourceHtml, workspaceIndex: WorkspaceIndex): Promise<void> {
    const rows = workspaceIndex.rowsBySourceHtmlHash.get(html.hash) ?? [];
    if (rows.length === 0) {
      if (workspaceIndex.accountedHtmlHashes.has(html.hash)) return;
      this.issue("missing_html_mapping", html.path, `No Lotion row/page references source HTML ${html.displayName}`);
      return;
    }
    for (const row of rows) {
      if (!row.originalHtml) {
        this.issue("missing_original_html_link", row.db.rel, `Imported row/page ${row.id} does not preserve original HTML link`);
      } else {
        this.assertWorkspaceFile(row.originalHtml, row.db.rel, "notion_original_html");
        await this.auditOriginalHtmlResources(row.originalHtml, row.db.rel);
      }
      const sourceHtml = (await this.readWorkspaceHtml(row.originalHtml, html.hash)) ?? html;
      await this.checkImportedBodyForHtml(sourceHtml, row, row.db, { requireTextMatch: true });
    }
  }

  private async checkImportedBodyForHtml(
    html: SourceHtml,
    row: WorkspaceRow,
    db: WorkspaceDatabase,
    options: BodyCheckOptions = {}
  ): Promise<void> {
    if (!html.hasMaterialBody) return;
    const bodyRel = row.record.body_path || (row.record.page_file ? `${db.rel}/pages/${row.record.page_file}` : "");
    if (!bodyRel) {
      this.issue(
        "missing_body_path",
        db.rel,
        `${html.displayName}: source HTML has body content but imported row ${row.id} has no body_path/page_file`
      );
      return;
    }
    const abs = resolve(this.options.workspaceRoot, bodyRel);
    if (!this.isInsideWorkspace(abs) || !fileService.exists(abs)) {
      this.issue("missing_body_file", db.rel, `${html.displayName}: source HTML has body content but ${bodyRel} is missing`);
      return;
    }
    const info = await fileService.stat(abs);
    if (info.size === 0) {
      this.issue("empty_body_file", db.rel, `${html.displayName}: ${bodyRel} is 0 bytes`);
      return;
    }
    if (options.requireTextMatch) {
      const markdown = normalizeText(await fileService.readText(abs));
      const snippet = firstUsefulSnippet(html.bodyText);
      if (snippet && !markdown.includes(normalizeText(snippet))) {
        this.warn(
          "html_body_text_not_found",
          db.rel,
          `${html.displayName}: body text snippet not found in ${bodyRel}: ${quote(snippet)}`
        );
      }
    }
  }

  private async indexSource(roots: string[]): Promise<SourceIndex> {
    const csvFileCandidates: SourceCandidate[] = [];
    const htmlFileCandidates: SourceCandidate[] = [];
    for (const root of roots) {
      const files = await listFiles(root, isSourceFileCandidate);
      for (const path of files) {
        const ext = extname(path).toLowerCase();
        const hash = notionFileHash(path);
        if (!hash) continue;
        const info = await fileService.stat(path);
        const candidate = {
          hash,
          path,
          rel: this.sourceRelative(path),
          displayName: basename(path),
          isAll: /_all\.csv$/i.test(path),
          size: info.size
        };
        if (ext === ".csv") {
          csvFileCandidates.push(candidate);
        } else if (ext === ".html" || ext === ".htm") {
          htmlFileCandidates.push(candidate);
        }
      }
    }

    return {
      csvCandidates: csvFileCandidates,
      htmlCandidates: htmlFileCandidates,
      totalCsvs: uniqueCount(csvFileCandidates, (candidate) => candidate.hash),
      totalHtmls: uniqueCount(htmlFileCandidates, (candidate) => candidate.hash)
    };
  }

  private async readSourceCsv(candidate: SourceCandidate): Promise<SourceCsv> {
    const raw = await fileService.readText(candidate.path);
    const grid = parseCsv(raw);
    const headers = grid[0] ?? [];
    const rows = grid.slice(1).map((cells, index) => ({
      index,
      cells,
      byHeader: new Map(headers.map((header, column) => [header, cells[column] ?? ""]))
    }));
    return {
      hash: candidate.hash,
      path: candidate.path,
      rel: candidate.rel,
      displayName: candidate.displayName,
      isAll: candidate.isAll,
      headers,
      rows
    };
  }

  private async readSourceHtml(candidate: SourceCandidate): Promise<SourceHtml> {
    const raw = await fileService.readText(candidate.path);
    const bodyText = htmlBodyText(raw);
    return {
      hash: candidate.hash || htmlNotionHash(raw),
      path: candidate.path,
      rel: candidate.rel,
      displayName: candidate.displayName,
      bodyText,
      hasMaterialBody: bodyText.length > 0
    };
  }

  private selectSourceCsvCandidates(candidates: SourceCandidate[], filters: string[]): SourceCandidate[] {
    const matched =
      filters.length === 0
        ? this.defaultSourceCsvCandidates(candidates)
        : candidates.filter((candidate) => filters.some((filter) => matchesSourceFilter(candidate, filter)));
    for (const filter of filters) {
      if (!this.source?.csvCandidates.some((csv) => matchesSourceFilter(csv, filter))) {
        this.issue("source_csv_filter_not_found", this.options.sourceRoots.join(", "), `No source CSV matches ${filter}`);
      }
    }
    const byHash = new Map<string, SourceCandidate>();
    for (const candidate of matched) {
      const existing = byHash.get(candidate.hash);
      if (!existing || scoreCsvCandidate(candidate) > scoreCsvCandidate(existing)) {
        byHash.set(candidate.hash, candidate);
      }
    }
    return [...byHash.values()];
  }

  private defaultSourceCsvCandidates(candidates: SourceCandidate[]): SourceCandidate[] {
    const allViewCandidates = candidates.filter((candidate) => candidate.isAll);
    return allViewCandidates.length > 0 ? allViewCandidates : candidates;
  }

  private selectSourceHtmlCandidates(candidates: SourceCandidate[], filters: string[]): SourceCandidate[] {
    const matched = this.options.auditAllHtml
      ? candidates
      : filters.length === 0
        ? []
        : candidates.filter((candidate) => filters.some((filter) => matchesSourceFilter(candidate, filter)));
    for (const filter of filters) {
      if (!this.source?.htmlCandidates.some((html) => matchesSourceFilter(html, filter))) {
        this.issue("source_html_filter_not_found", this.options.sourceRoots.join(", "), `No source HTML matches ${filter}`);
      }
    }
    const byHash = new Map<string, SourceCandidate>();
    for (const candidate of matched) {
      const existing = byHash.get(candidate.hash);
      if (!existing || candidate.size > existing.size) {
        byHash.set(candidate.hash, candidate);
      }
    }
    return [...byHash.values()];
  }

  private async indexWorkspace(root: string): Promise<WorkspaceIndex> {
    const databases: WorkspaceDatabase[] = [];
    const databasesBySourceCsvHash = new Map<string, WorkspaceDatabase[]>();
    const rows: WorkspaceRow[] = [];
    const rowsBySourceCsvHash = new Map<string, WorkspaceRow[]>();
    const rowsBySourceHtmlHash = new Map<string, WorkspaceRow[]>();
    const accountedHtmlHashes = new Set<string>();
    const entitiesById = new Map<string, WorkspaceRow>();
    for (const group of ["user", "system"]) {
      const groupRoot = join(root, "databases", group);
      if (!fileService.exists(groupRoot)) continue;
      const entries = await fileService.readDir(groupRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const abs = join(groupRoot, entry.name);
        const schemaPath = join(abs, "schema.json");
        const dataPath = join(abs, "data.csv");
        if (!fileService.exists(schemaPath) || !fileService.exists(dataPath)) continue;
        const schema = JSON.parse(await fileService.readText(schemaPath)) as DatabaseSchema;
        const grid = parseCsv(await fileService.readText(dataPath));
        const headers = grid[0] ?? [];
        const schemaSourceCsvHash =
          normalizeNotionHash(schema.notion_source_hash) || (await this.extractWorkspaceCsvHash(schema.notion_original_csv));
        const db: WorkspaceDatabase = {
          group,
          abs,
          rel: this.workspaceRelative(abs),
          schema,
          sourceCsvHash: schemaSourceCsvHash,
          headers,
          rows: []
        };
        databases.push(db);
        if (schemaSourceCsvHash) pushMap(databasesBySourceCsvHash, schemaSourceCsvHash, db);
        for (const cells of grid.slice(1)) {
          const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
          const sourceCsvHash = schemaSourceCsvHash || (await this.extractWorkspaceCsvHash(record.notion_original_csv));
          const sourceHtmlHash = await this.extractWorkspaceHtmlHash(record.notion_original_html);
          const reviewHash =
            normalizeNotionHash(record.notion_hash) ||
            notionFileHash(record.source_path) ||
            notionFileHash(record.source_file);
          if (reviewHash && isAccountedImportReviewRecord(record)) accountedHtmlHashes.add(reviewHash);
          const row: WorkspaceRow = {
            id: record.id ?? "",
            db,
            record,
            sourceCsvHash,
            sourceHtmlHash,
            originalCsv: record.notion_original_csv ?? "",
            originalHtml: record.notion_original_html ?? ""
          };
          db.rows.push(row);
          rows.push(row);
          if (schema.id === "entities" && row.id) entitiesById.set(row.id, row);
          if (sourceCsvHash) {
            pushMap(databasesBySourceCsvHash, sourceCsvHash, db);
            pushMap(rowsBySourceCsvHash, sourceCsvHash, row);
          }
          if (sourceHtmlHash) pushMap(rowsBySourceHtmlHash, sourceHtmlHash, row);
        }
      }
    }
    for (const [hash, dbs] of databasesBySourceCsvHash) {
      databasesBySourceCsvHash.set(hash, uniqueBy(dbs, (db) => db.rel));
    }
    this.auditDatabasePathCollisions(databases);
    return { databases, rows, databasesBySourceCsvHash, rowsBySourceCsvHash, rowsBySourceHtmlHash, accountedHtmlHashes, entitiesById };
  }

  private auditEntityRefs(workspace: WorkspaceIndex): void {
    for (const db of workspace.databases) {
      const entityRefFields = db.schema.fields.filter((field) => field.type === "entity_ref");
      if (entityRefFields.length === 0) continue;
      for (const row of db.rows) {
        for (const field of entityRefFields) {
          const raw = row.record[field.id] ?? "";
          if (!raw) continue;
          const parsed = parseEntityRefAuditValue(raw);
          if (!parsed.ok) {
            this.warn("unstructured_entity_ref", db.rel, `${db.schema.name}.${field.name}: row ${row.id} has a non-JSON entity_ref value`);
            continue;
          }
          for (const ref of parsed.refs) {
            if (!workspace.entitiesById.has(ref.entityId)) {
              this.issue(
                "missing_entity_ref_target",
                db.rel,
                `${db.schema.name}.${field.name}: row ${row.id} references missing entity ${ref.entityId}`
              );
            }
          }
        }
      }
    }
  }

  private auditDatabasePath(csv: SourceCsv, imported: WorkspaceDatabase): void {
    const expected = sourceDatabasePath(csv.path, this.options.sourceRoots);
    const actual = schemaPathSegments(imported.schema);
    if (expected.length === 0) return;
    if (!sameStringArray(expected, actual)) {
      this.issue(
        "database_path_mismatch",
        imported.rel,
        `${csv.displayName}: expected path ${quote(expected.join(" / "))}, imported ${quote(actual.join(" / "))}`
      );
    }
  }

  private auditDatabaseOriginalCsvLink(imported: WorkspaceDatabase): void {
    if (!imported.schema.notion_original_csv) {
      this.issue("missing_original_csv_link", imported.rel, `Database ${imported.schema.id} has no notion_original_csv link`);
      return;
    }
    this.assertWorkspaceFile(imported.schema.notion_original_csv, imported.rel, "notion_original_csv");
  }

  private auditImportedNumberCells(imported: WorkspaceDatabase): void {
    const numberFields = (imported.schema.fields ?? []).filter((field) => field.type === "number");
    if (numberFields.length === 0) return;
    for (const row of imported.rows) {
      for (const field of numberFields) {
        const value = row.record[field.id] ?? "";
        if (isBlank(value)) continue;
        const canonical = canonicalNumber(value);
        if (!canonical) {
          this.issue(
            "invalid_number_cell",
            imported.rel,
            `Row ${row.id} number field "${field.name}" is not numeric: ${quote(value)}`
          );
        } else if (canonical !== normalizeValue(value)) {
          this.issue(
            "noncanonical_number_cell",
            imported.rel,
            `Row ${row.id} number field "${field.name}" stores ${quote(value)}, expected ${quote(canonical)}`
          );
        }
      }
    }
  }

  private auditImportedUrlCells(imported: WorkspaceDatabase): void {
    const urlFields = (imported.schema.fields ?? []).filter(
      (field) => field.type === "url" && field.id !== "notion_original_html" && field.id !== "notion_original_csv"
    );
    if (urlFields.length === 0) return;
    for (const row of imported.rows) {
      for (const field of urlFields) {
        const value = normalizeValue(row.record[field.id] ?? "");
        if (isBlank(value)) continue;
        if (!isValidUrlCell(value)) {
          this.issue(
            "invalid_url_cell",
            imported.rel,
            `Row ${row.id} URL field "${field.name}" is not openable: ${quote(value)}`
          );
        }
      }
    }
  }

  private auditImportedOptionCells(imported: WorkspaceDatabase): void {
    const optionFields = (imported.schema.fields ?? []).filter(
      (field) => field.type === "select" || field.type === "multi_select"
    );
    if (optionFields.length === 0) return;
    for (const row of imported.rows) {
      for (const field of optionFields) {
        const values = optionCellValues(row.record[field.id] ?? "", field.type);
        if (values.length === 0) continue;
        const options = new Set((field.options ?? []).map((option) => canonicalOptionName(option.name)));
        if (options.size === 0) {
          this.issue(
            "missing_select_options",
            imported.rel,
            `Row ${row.id} field "${field.name}" stores options but schema has no selectable options`
          );
          continue;
        }
        for (const value of values) {
          if (options.has(canonicalOptionName(value))) continue;
          this.issue(
            "invalid_select_option_cell",
            imported.rel,
            `Row ${row.id} field "${field.name}" stores unknown option ${quote(value)}`
          );
        }
      }
    }
  }

  private auditImportedDateCells(imported: WorkspaceDatabase): void {
    const dateFields = (imported.schema.fields ?? []).filter((field) => field.type === "date");
    if (dateFields.length === 0) return;
    for (const row of imported.rows) {
      for (const field of dateFields) {
        const value = normalizeValue(row.record[field.id] ?? "");
        if (isBlank(value)) continue;
        if (!canonicalDate(value)) {
          this.issue(
            "invalid_date_cell",
            imported.rel,
            `Row ${row.id} date field "${field.name}" is not parseable: ${quote(value)}`
          );
        }
      }
    }
  }

  private auditImportedCheckboxCells(imported: WorkspaceDatabase): void {
    const checkboxFields = (imported.schema.fields ?? []).filter((field) => field.type === "checkbox");
    if (checkboxFields.length === 0) return;
    for (const row of imported.rows) {
      for (const field of checkboxFields) {
        const value = normalizeValue(row.record[field.id] ?? "");
        if (isBlank(value)) continue;
        if (!isCanonicalCheckboxCell(value)) {
          this.issue(
            "invalid_checkbox_cell",
            imported.rel,
            `Row ${row.id} checkbox field "${field.name}" stores non-boolean value: ${quote(value)}`
          );
        }
      }
    }
  }

  private auditDatabasePathCollisions(databases: WorkspaceDatabase[]): void {
    const byPath = new Map<string, WorkspaceDatabase[]>();
    for (const db of databases) {
      if (db.group !== "user") continue;
      const path = schemaPathSegments(db.schema);
      if (path.length === 0) continue;
      pushMap(byPath, path.join("\x1f"), db);
    }
    for (const group of byPath.values()) {
      if (group.length <= 1) continue;
      this.issue(
        "duplicate_database_path",
        group[0].rel,
        `Multiple databases share path ${quote(schemaPathSegments(group[0].schema).join(" / "))}: ${group.map((db) => db.rel).join(", ")}`
      );
    }
  }

  private async readWorkspaceCsv(relPath: string | undefined, fallbackHash = ""): Promise<SourceCsv | null> {
    if (!relPath || /^[a-z][a-z0-9+.-]*:/i.test(relPath)) return null;
    const key = relPath;
    if (this.workspaceCsvCache.has(key)) return this.workspaceCsvCache.get(key) ?? null;
    const abs = resolve(this.options.workspaceRoot, relPath);
    if (!this.isInsideWorkspace(abs) || !fileService.exists(abs)) {
      this.workspaceCsvCache.set(key, null);
      return null;
    }
    try {
      const raw = await fileService.readText(abs);
      const grid = parseCsv(raw);
      const headers = grid[0] ?? [];
      const hash = fallbackHash || extractNotionHash(relPath) || (await this.inferSourceCsvHashFromRaw(raw));
      if (!hash) {
        this.workspaceCsvCache.set(key, null);
        return null;
      }
      const csv: SourceCsv = {
        hash,
        path: abs,
        rel: this.workspaceRelative(abs),
        displayName: basename(abs),
        isAll: /_all\.csv$/i.test(abs),
        headers,
        rows: grid.slice(1).map((cells, index) => ({
          index,
          cells,
          byHeader: new Map(headers.map((header, column) => [header, cells[column] ?? ""]))
        }))
      };
      this.workspaceCsvCache.set(key, csv);
      return csv;
    } catch {
      this.workspaceCsvCache.set(key, null);
      return null;
    }
  }

  private async readWorkspaceHtml(relPath: string | undefined, fallbackHash = ""): Promise<SourceHtml | null> {
    if (!relPath || /^[a-z][a-z0-9+.-]*:/i.test(relPath)) return null;
    const key = relPath;
    if (this.workspaceHtmlCache.has(key)) return this.workspaceHtmlCache.get(key) ?? null;
    const abs = resolve(this.options.workspaceRoot, relPath);
    if (!this.isInsideWorkspace(abs) || !fileService.exists(abs)) {
      this.workspaceHtmlCache.set(key, null);
      return null;
    }
    try {
      const raw = await fileService.readText(abs);
      const bodyText = htmlBodyText(raw);
      const hash = extractNotionHash(relPath) || htmlNotionHash(raw) || fallbackHash;
      if (!hash) {
        this.workspaceHtmlCache.set(key, null);
        return null;
      }
      const html: SourceHtml = {
        hash,
        path: abs,
        rel: this.workspaceRelative(abs),
        displayName: basename(abs),
        bodyText,
        hasMaterialBody: bodyText.length > 0
      };
      this.workspaceHtmlCache.set(key, html);
      return html;
    } catch {
      this.workspaceHtmlCache.set(key, null);
      return null;
    }
  }

  private async extractWorkspaceHtmlHash(relPath: string | undefined): Promise<string> {
    if (!relPath) return "";
    const cached = this.workspaceHtmlHashCache.get(relPath);
    if (cached !== undefined) return cached;
    const hash = extractNotionHash(relPath) || (await this.readWorkspaceHtml(relPath))?.hash || "";
    this.workspaceHtmlHashCache.set(relPath, hash);
    return hash;
  }

  private async extractWorkspaceCsvHash(relPath: string | undefined): Promise<string> {
    if (!relPath) return "";
    return extractNotionHash(relPath) || (await this.readWorkspaceCsv(relPath))?.hash || "";
  }

  private async inferSourceCsvHashFromRaw(raw: string): Promise<string> {
    const digest = contentDigest(raw);
    const map = await this.sourceCsvContentDigestMap();
    return map.get(digest) ?? "";
  }

  private async sourceCsvContentDigestMap(): Promise<Map<string, string | null>> {
    if (this.sourceCsvHashByContentDigest) return this.sourceCsvHashByContentDigest;
    const map = new Map<string, string | null>();
    for (const candidate of this.source?.csvCandidates ?? []) {
      try {
        const raw = await fileService.readText(candidate.path);
        const digest = contentDigest(raw);
        const existing = map.get(digest);
        if (existing === undefined) {
          map.set(digest, candidate.hash);
        } else if (existing !== candidate.hash) {
          map.set(digest, null);
        }
      } catch {
        // Ignore unreadable source candidates; the audit will report
        // missing mappings through the normal source CSV checks.
      }
    }
    this.sourceCsvHashByContentDigest = map;
    return map;
  }

  private assertWorkspaceFile(relPath: string, source: string, label: string): void {
    if (!relPath) return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(relPath)) return;
    const abs = resolve(this.options.workspaceRoot, relPath);
    if (!this.isInsideWorkspace(abs) || !fileService.exists(abs)) {
      this.issue("missing_workspace_file", source, `${label} points to a missing workspace file: ${relPath}`);
    }
  }

  private async auditOriginalHtmlResources(relPath: string, source: string): Promise<void> {
    if (!relPath || /^[a-z][a-z0-9+.-]*:/i.test(relPath)) return;
    if (this.auditedOriginalHtmlResources.has(relPath)) return;
    this.auditedOriginalHtmlResources.add(relPath);

    const abs = resolve(this.options.workspaceRoot, relPath);
    if (!this.isInsideWorkspace(abs) || !fileService.exists(abs)) return;

    let raw = "";
    try {
      raw = await fileService.readText(abs);
    } catch {
      return;
    }

    const base = dirname(abs);
    for (const resourcePath of extractHtmlResourceRefs(raw)) {
      const resourceAbs = resolve(base, resourcePath);
      if (!this.isInsideWorkspace(resourceAbs) || !fileService.exists(resourceAbs)) {
        this.issue(
          "missing_original_html_resource",
          source,
          `${relPath} references a missing original resource: ${resourcePath}`
        );
      }
    }
  }

  private isInsideWorkspace(abs: string): boolean {
    const root = this.options.workspaceRoot;
    return abs === root || abs.startsWith(root.endsWith(sep) ? root : root + sep);
  }

  private sourceRelative(path: string): string {
    for (const root of this.options.sourceRoots) {
      const rel = relative(root, path);
      if (!rel.startsWith("..")) return rel.split("\\").join("/");
    }
    return path;
  }

  private workspaceRelative(path: string): string {
    return relative(this.options.workspaceRoot, path).split("\\").join("/");
  }

  private issue(kind: string, source: string, message: string): void {
    this.issueCount += 1;
    this.issueKinds.set(kind, (this.issueKinds.get(kind) ?? 0) + 1);
    if (this.issues.length < this.options.maxStoredItems) {
      this.issues.push({ kind, source, message });
    }
  }

  private warn(kind: string, source: string, message: string): void {
    this.warningCount += 1;
    this.warningKinds.set(kind, (this.warningKinds.get(kind) ?? 0) + 1);
    if (this.warnings.length < this.options.maxStoredItems) {
      this.warnings.push({ kind, source, message });
    }
  }
}

async function listFiles(root: string, predicate: (path: string) => boolean): Promise<string[]> {
  if (!fileService.exists(root)) return [];
  const entries = await fileService.readDir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path, predicate)));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

function isSourceFileCandidate(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === ".csv" || ext === ".html" || ext === ".htm";
}

function matchesSourceFilter(entry: SourceCandidate | SourceCsv | SourceHtml, filter: string): boolean {
  if (filter === "*") return true;
  const needle = filter.toLowerCase();
  return (
    entry.hash.toLowerCase() === needle ||
    entry.path.toLowerCase().includes(needle) ||
    entry.rel.toLowerCase().includes(needle) ||
    entry.displayName.toLowerCase().includes(needle)
  );
}

function uniqueCount<T>(items: T[], keyFn: (item: T) => string): number {
  return new Set(items.map(keyFn)).size;
}

function htmlBodyText(raw: string): string {
  const withoutHeader = raw.replace(/<header\b[\s\S]*?<\/header>/gi, " ");
  const body =
    /<div\b[^>]*class=["'][^"']*\bpage-body\b[^"']*["'][^>]*>([\s\S]*?)<\/article>/i.exec(withoutHeader)?.[1] ??
    withoutHeader;
  return normalizeText(
    decodeHtml(
      body
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function htmlNotionHash(raw: string): string {
  const articleId = /<article\s+id=["']([0-9a-f-]{32,36})["']/i.exec(raw)?.[1];
  if (articleId) return normalizeNotionHash(articleId);
  const pageTitleId = /<h1\b(?=[^>]*\bclass=["'][^"']*\bpage-title\b[^"']*["'])[^>]*\sid=["']([0-9a-f-]{32,36})["']/i.exec(raw)?.[1];
  return normalizeNotionHash(pageTitleId);
}

function firstUsefulSnippet(text: string): string {
  const parts = normalizeText(text)
    .split(/(?<=[。.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 18);
  return parts[0]?.slice(0, 120) ?? "";
}

function compatibleValue(sourceValue: string, importedValue: string): boolean {
  const source = normalizeValue(sourceValue);
  const imported = normalizeValue(importedValue);
  if (source === imported) return true;
  const sourceDisplay = canonicalDisplayValue(source);
  const importedDisplay = canonicalDisplayValue(imported);
  if (sourceDisplay && importedDisplay && sourceDisplay === importedDisplay) return true;
  if (sameOptionSet(sourceDisplay, importedDisplay)) return true;
  const sourceNumber = canonicalNumber(source);
  const importedNumber = canonicalNumber(imported);
  if (sourceNumber && importedNumber && sourceNumber === importedNumber) return true;
  const sourceDate = canonicalDate(source);
  const importedDate = canonicalDate(imported);
  if (sourceDate && importedDate && sourceDate === importedDate) return true;
  const sourceCheckbox = canonicalCheckbox(source);
  const importedCheckbox = canonicalCheckbox(imported);
  if (sourceCheckbox && importedCheckbox && sourceCheckbox === importedCheckbox) return true;
  return imported.includes(source) || source.includes(imported);
}

function canonicalNumber(value: string): string {
  const trimmed = normalizeValue(value);
  if (!trimmed) return "";
  let text = trimmed.replace(/\s+/g, "");
  let negative = false;
  const accounting = /^\((.*)\)$/.exec(text);
  if (accounting) {
    negative = true;
    text = accounting[1];
  }
  text = text.replace(/\p{Sc}/gu, "");
  if (text.startsWith("+") || text.startsWith("-")) {
    negative = text[0] === "-";
    text = text.slice(1);
  }
  if (text.includes("%")) return "";
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^\.\d+$/.test(text)) return "";
  const normalized = text.replace(/,/g, "");
  return negative ? `-${normalized}` : normalized;
}

function isValidUrlCell(value: string): boolean {
  const text = normalizeValue(value);
  if (!text) return true;
  try {
    const parsed = new URL(text);
    const protocol = parsed.protocol.toLowerCase();
    return Boolean(protocol) && protocol !== "javascript:" && protocol !== "data:";
  } catch {
    return false;
  }
}

function canonicalDate(value: string): string {
  const simple = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(value);
  if (simple) return `${simple[1]}-${simple[2].padStart(2, "0")}-${simple[3].padStart(2, "0")}`;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return "";
}

function canonicalCheckbox(value: string): string {
  const text = normalizeValue(value).toLowerCase();
  if (!text) return "";
  if (["true", "yes", "y", "1", "checked", "check", "\u2713", "\u2714", "\u2611"].includes(text)) return "true";
  if (["false", "no", "n", "0", "unchecked", "uncheck", "\u2717", "\u00d7", "\u2610"].includes(text)) return "false";
  return "";
}

function isCanonicalCheckboxCell(value: string): boolean {
  const text = normalizeValue(value).toLowerCase();
  return text === "true" || text === "false";
}

function normalizeValue(value: unknown): string {
  return normalizeText(String(value ?? "")).replace(/\u00a0/g, " ");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalDisplayValue(value: string): string {
  return normalizeText(value)
    .replace(/\[([\s\S]+?)\]\([^)]+\)/g, "$1")
    .replace(/\\([\\[\]()])/g, "$1")
    .replace(/([^,;()[\]]+?)\s*\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+([,;])/g, "$1")
    .replace(/([,;])\s+/g, "$1")
    .trim();
}

function sameOptionSet(source: string, imported: string): boolean {
  const sourceOptions = optionSet(source);
  const importedOptions = optionSet(imported);
  if (sourceOptions.length <= 1 || importedOptions.length <= 1) return false;
  if (sourceOptions.length !== importedOptions.length) return false;
  return sourceOptions.every((option, index) => option === importedOptions[index]);
}

function optionSet(value: string): string[] {
  if (!/[;,]/.test(value)) return [];
  return value
    .split(/[;,]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .sort();
}

function optionCellValues(value: unknown, fieldType: string): string[] {
  const display = canonicalDisplayValue(normalizeValue(value));
  if (!display) return [];
  if (fieldType !== "multi_select") return [display];
  return display
    .split(/[;,]/)
    .map((item) => canonicalOptionName(item))
    .filter(Boolean);
}

function canonicalOptionName(value: unknown): string {
  return normalizeText(value);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

function scoreCsvCandidate(candidate: SourceCandidate): number {
  return (candidate.isAll ? 1_000_000_000 : 0) + candidate.size;
}

function notionFileHash(pathOrHref: string | undefined): string | null {
  if (!pathOrHref) return null;
  const stem = basename(pathOrHref).replace(/\.(?:html?|md|csv)$/i, "").replace(/_all$/i, "");
  return /(?:^|[\s_-])([0-9a-f]{32})$/i.exec(stem)?.[1]?.toLowerCase() ?? null;
}

function extractNotionHash(pathOrHref: string | undefined): string {
  if (!pathOrHref) return "";
  return notionFileHash(pathOrHref) ?? "";
}

const EXPORT_DIR_RE = /^Export-[0-9a-f-]+(?:-Part-\d+)?$/i;

function sourceDatabasePath(csvPath: string, sourceRoots: string[]): string[] {
  const rel = notionRelativePath(csvPath, sourceRoots);
  const segments = rel.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  const file = segments[segments.length - 1];
  const ext = extname(file);
  segments[segments.length - 1] = file.slice(0, file.length - ext.length).replace(/_all$/i, "");
  return normalizePathSegments(segments.map(notionPathSegment), notionPathSegment(segments[segments.length - 1]) || "Untitled database");
}

function notionRelativePath(absPath: string, sourceRoots: string[]): string {
  const abs = resolve(absPath);
  const exportLogical = logicalPath(abs);
  if (exportLogical !== abs) return exportLogical;
  const roots = sourceRoots.map((source) => resolve(source)).sort((a, b) => b.length - a.length);
  for (const root of roots) {
    if (abs === root) return "";
    if (abs.startsWith(`${root}${sep}`)) return abs.slice(root.length + 1).split(sep).join("/");
  }
  return abs.split(sep).join("/");
}

function logicalPath(absOrRel: string): string {
  const abs = resolve(absOrRel);
  const segs = abs.split(sep);
  let lastIdx = -1;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    if (EXPORT_DIR_RE.test(segs[i])) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx === -1) return abs;
  return segs.slice(lastIdx + 1).join("/");
}

function notionPathSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  return stripNotionHash(decoded).replace(/\s+/g, " ").trim();
}

function stripNotionHash(name: string): string {
  const match = /\s+[0-9a-f]{32}$/i.exec(name);
  return match ? name.slice(0, match.index) : name;
}

function normalizePathSegments(path: string[] | undefined, fallbackName: string): string[] {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 ? segments : [fallbackName.trim() || "Untitled database"];
}

function schemaPathSegments(schema: DatabaseSchema): string[] {
  return normalizePathSegments(schema.path, schema.name);
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function contentDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRowFingerprint(
  headers: string[],
  srcRow: SourceCsvRow,
  fieldIdBySourceHeader: Map<string, string>
): string {
  return headers
    .map((header) => {
      const fieldId = fieldIdBySourceHeader.get(header);
      return fieldId ? `${fieldId}=${fingerprintValue(srcRow.byHeader.get(header) ?? "")}` : "";
    })
    .filter(Boolean)
    .join("\u001f");
}

function importedRowFingerprint(
  headers: string[],
  impRow: WorkspaceRow,
  fieldIdBySourceHeader: Map<string, string>
): string {
  return headers
    .map((header) => {
      const fieldId = fieldIdBySourceHeader.get(header);
      return fieldId ? `${fieldId}=${fingerprintValue(impRow.record[fieldId] ?? "")}` : "";
    })
    .filter(Boolean)
    .join("\u001f");
}

function fingerprintValue(value: string): string {
  const display = canonicalDisplayValue(value);
  const date = canonicalDate(display);
  if (date) return date;
  const options = optionSet(display);
  return options.length > 1 ? options.join(";") : display;
}

function titleMatchKey(value: string): string {
  return canonicalDisplayValue(value).toLowerCase();
}

function nextUnusedIndex(rows: WorkspaceRow[], startIndex: number, usedRows: Set<WorkspaceRow>): number {
  let index = startIndex;
  while (index < rows.length && usedRows.has(rows[index])) index += 1;
  return index;
}

function normalizeNotionHash(value: string | undefined): string {
  if (!value) return "";
  const compact = value.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(compact) ? compact : "";
}

function isAccountedImportReviewRecord(record: Record<string, string>): boolean {
  return (
    record.issue_type === "Deduped/redirected page" ||
    record.issue_type === "Empty standalone page" ||
    record.issue_type === "Empty row page body"
  );
}

function parseEntityRefAuditValue(raw: string): { ok: true; refs: EntityRef[] } | { ok: false } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const refs: EntityRef[] = [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") return { ok: false };
      const value = candidate as Record<string, unknown>;
      const entityId = typeof value.entityId === "string" ? value.entityId : "";
      const kind = value.kind === "page" || value.kind === "database" || value.kind === "row" ? value.kind : undefined;
      if (!entityId || !kind) return { ok: false };
      refs.push({ entityId, kind });
    }
    return { ok: true, refs };
  } catch {
    return { ok: false };
  }
}

function extractHtmlResourceRefs(raw: string): string[] {
  const refs: string[] = [];
  const attrPattern = /\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi;
  let match: RegExpExecArray | null;
  while ((match = attrPattern.exec(raw))) {
    const value = decodeHtmlAttribute(match[2].trim());
    if (!value || value.startsWith("#") || value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) continue;
    const withoutHash = value.split("#", 1)[0];
    const pathOnly = withoutHash.split("?", 1)[0];
    if (!pathOnly || pathOnly.startsWith("/")) continue;
    refs.push(safeDecodeUri(pathOnly));
  }
  return uniqueStrings(refs);
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)?.push(value);
}

function uniqueBy<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function isBlank(value: unknown): boolean {
  return normalizeValue(value) === "";
}

function quote(value: string): string {
  const normalized = normalizeValue(value);
  return JSON.stringify(normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized);
}
