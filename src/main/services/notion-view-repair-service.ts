import { join, relative, resolve, sep } from "node:path";
import { PAGES_DATABASE_ID } from "../../shared/constants.js";
import type { DatabaseRecord, DatabaseSchema } from "../../shared/types.js";
import { databaseFolderName } from "../../shared/workspace-paths.js";
import { readCsvFile } from "../storage/csv-file.js";
import { readJsonFile, writeJsonFile } from "../storage/json-file.js";
import { fileService } from "./file-service.js";
import { parseNotionHtml, type NotionCollectionView } from "./notion-html-converter.js";
import {
  notionFullIdFromHref,
  notionShortIdFromHash,
  notionShortIdFromHref
} from "./notion-short-id.js";

const MISSING_VIEW_RE = /^([ \t]*)_\u{1f4c2} (.+?) \(database not found\)_([ \t]*)$/gmu;

export interface NotionViewRepairChange {
  bodyPath: string;
  originalHtmlPath: string;
  title: string;
  databaseId: string;
  shortId: string;
}

export interface NotionViewRepairUnresolved {
  bodyPath: string;
  originalHtmlPath: string;
  title: string;
  reason: "missing_original_html" | "no_matching_source_view" | "no_unique_short_id";
}

export interface NotionViewRepairReport {
  mode: "dry-run" | "apply";
  workspacePath: string;
  generatedAt: string;
  databaseSchemas: number;
  ambiguousShortIds: string[];
  pageRecords: number;
  markdownFilesRead: number;
  sourcePlaceholders: number;
  repairablePlaceholders: number;
  unresolvedPlaceholders: number;
  changedFiles: number;
  backupRoot?: string;
  changes: NotionViewRepairChange[];
  unresolved: NotionViewRepairUnresolved[];
}

export interface RepairMissingNotionViewsOptions {
  workspacePath: string;
  apply?: boolean;
  runId?: string;
}

interface DatabaseIndexes {
  schemas: DatabaseSchema[];
  idByFullHash: Map<string, string>;
  idByShortHash: Map<string, string>;
  ambiguousShortIds: Set<string>;
  idByUniqueTitle: Map<string, string>;
}

interface PlannedFile {
  bodyPath: string;
  before: string;
  after: string;
}

interface SourceCandidate {
  view: NotionCollectionView;
  databaseId: string;
  shortId: string;
}

export async function repairMissingNotionViews(
  options: RepairMissingNotionViewsOptions
): Promise<NotionViewRepairReport> {
  const workspacePath = resolve(options.workspacePath);
  const indexes = await readDatabaseIndexes(workspacePath);
  const pagesPath = join(
    workspacePath,
    "databases",
    "system",
    databaseFolderName(PAGES_DATABASE_ID, "pages"),
    "data.csv"
  );
  const pageRecords = await readCsvFile(pagesPath);
  const rowDatabaseIdByHash = buildRowDatabaseIdByHash(pageRecords);
  const report: NotionViewRepairReport = {
    mode: options.apply ? "apply" : "dry-run",
    workspacePath,
    generatedAt: new Date().toISOString(),
    databaseSchemas: indexes.schemas.length,
    ambiguousShortIds: Array.from(indexes.ambiguousShortIds).sort(),
    pageRecords: pageRecords.length,
    markdownFilesRead: 0,
    sourcePlaceholders: 0,
    repairablePlaceholders: 0,
    unresolvedPlaceholders: 0,
    changedFiles: 0,
    changes: [],
    unresolved: []
  };
  const plannedFiles: PlannedFile[] = [];
  const seenBodyPaths = new Set<string>();

  for (const record of pageRecords) {
    const bodyPath = recordText(record, "body_path");
    if (!bodyPath || seenBodyPaths.has(bodyPath)) continue;
    seenBodyPaths.add(bodyPath);
    const bodyAbs = safeWorkspacePath(workspacePath, bodyPath);
    if (!fileService.exists(bodyAbs)) continue;
    const before = await fileService.readText(bodyAbs);
    report.markdownFilesRead += 1;
    const placeholders = Array.from(before.matchAll(MISSING_VIEW_RE));
    if (placeholders.length === 0) continue;
    report.sourcePlaceholders += placeholders.length;

    const originalHtmlPath = recordText(record, "notion_original_html");
    if (!originalHtmlPath) {
      for (const match of placeholders) {
        report.unresolved.push(unresolved(bodyPath, "", match[2] ?? "", "missing_original_html"));
      }
      continue;
    }
    const originalAbs = safeWorkspacePath(workspacePath, originalHtmlPath);
    if (!fileService.exists(originalAbs)) {
      for (const match of placeholders) {
        report.unresolved.push(
          unresolved(bodyPath, originalHtmlPath, match[2] ?? "", "missing_original_html")
        );
      }
      continue;
    }

    const originalHtml = await fileService.readText(originalAbs);
    const parsed = parseNotionHtml(originalHtml, {
      convertBody: false,
      collectCollectionRows: false
    });
    const candidatesByTitle = legacyUnresolvedCandidates(
      parsed.collectionViews,
      indexes,
      rowDatabaseIdByHash
    );
    const replacementByStart = new Map<number, { text: string; change: NotionViewRepairChange }>();

    for (const match of placeholders) {
      const title = normalizeTitle(match[2] ?? "");
      const candidates = candidatesByTitle.get(title) ?? [];
      const candidate = candidates.shift();
      if (!candidate) {
        report.unresolved.push(
          unresolved(bodyPath, originalHtmlPath, title, "no_matching_source_view")
        );
        continue;
      }
      if (!candidate.databaseId) {
        report.unresolved.push(
          unresolved(bodyPath, originalHtmlPath, title, "no_unique_short_id")
        );
        continue;
      }
      const indent = match[1] ?? "";
      const change: NotionViewRepairChange = {
        bodyPath,
        originalHtmlPath,
        title,
        databaseId: candidate.databaseId,
        shortId: candidate.shortId
      };
      replacementByStart.set(match.index ?? -1, {
        text: [
          `${indent}\`\`\`lotion-view`,
          `${indent}database: ${candidate.databaseId}`,
          `${indent}view: view_default`,
          `${indent}\`\`\``
        ].join("\n"),
        change
      });
    }

    if (replacementByStart.size === 0) continue;
    const after = before.replace(MISSING_VIEW_RE, (whole, _indent, _title, _trailing, offset) => {
      return replacementByStart.get(Number(offset))?.text ?? whole;
    });
    if (after === before) continue;
    report.changes.push(...Array.from(replacementByStart.values(), (entry) => entry.change));
    plannedFiles.push({ bodyPath, before, after });
  }

  report.repairablePlaceholders = report.changes.length;
  report.unresolvedPlaceholders = report.unresolved.length;
  report.changedFiles = plannedFiles.length;
  if (!options.apply || plannedFiles.length === 0) return report;

  const runId = sanitizeRunId(options.runId ?? report.generatedAt.replace(/[:.]/g, "-"));
  const repairRoot = join(workspacePath, ".lotion", "repairs", `notion-view-${runId}`);
  const backupRoot = join(repairRoot, "backup");
  if (fileService.exists(repairRoot)) {
    throw new Error(`Repair run already exists and will not be overwritten: ${repairRoot}`);
  }
  report.backupRoot = relative(workspacePath, backupRoot).replaceAll(sep, "/");
  await writeJsonFile(join(repairRoot, "plan.json"), report);

  for (const plan of plannedFiles) {
    const backupPath = safeWorkspacePath(backupRoot, plan.bodyPath);
    await fileService.writeTextAtomic(backupPath, plan.before);
  }
  await writeJsonFile(join(repairRoot, "state.json"), {
    state: "backups-complete",
    files: plannedFiles.length,
    generatedAt: report.generatedAt
  });

  for (const plan of plannedFiles) {
    await fileService.writeTextAtomic(safeWorkspacePath(workspacePath, plan.bodyPath), plan.after);
  }
  await writeJsonFile(join(repairRoot, "result.json"), {
    ...report,
    state: "complete"
  });
  return report;
}

function legacyUnresolvedCandidates(
  views: NotionCollectionView[],
  indexes: DatabaseIndexes,
  rowDatabaseIdByHash: Map<string, string>
): Map<string, SourceCandidate[]> {
  const byTitle = new Map<string, SourceCandidate[]>();
  for (const view of views) {
    const title = normalizeTitle(view.title);
    if (!title) continue;
    const fullHash = normalizeFullHash(view.hash);
    if (fullHash && indexes.idByFullHash.has(fullHash)) continue;
    if (indexes.idByUniqueTitle.has(title)) continue;
    const rowDatabaseIds = new Set<string>();
    for (const rowHash of view.rowHashes ?? []) {
      const databaseId = rowDatabaseIdByHash.get(normalizeFullHash(rowHash));
      if (databaseId) rowDatabaseIds.add(databaseId);
    }
    if (rowDatabaseIds.size === 1) continue;

    const ids = new Map<string, string>();
    for (const href of view.rowHrefs ?? []) {
      const fullId = notionFullIdFromHref(href);
      if (fullId) {
        const databaseId = indexes.idByFullHash.get(fullId);
        if (databaseId) ids.set(databaseId, notionShortIdFromHash(fullId));
      }
      const shortId = notionShortIdFromHref(href);
      if (!shortId) continue;
      const databaseId = indexes.idByShortHash.get(shortId);
      if (databaseId) ids.set(databaseId, shortId);
    }
    const unique = ids.size === 1 ? Array.from(ids.entries())[0] : undefined;
    const list = byTitle.get(title) ?? [];
    list.push({
      view,
      databaseId: unique?.[0] ?? "",
      shortId: unique?.[1] ?? ""
    });
    byTitle.set(title, list);
  }
  return byTitle;
}

function buildRowDatabaseIdByHash(records: DatabaseRecord[]): Map<string, string> {
  const unique = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const record of records) {
    const databaseId = recordText(record, "database_id");
    const originalHtml = recordText(record, "notion_original_html");
    const hash = normalizeFullHash(
      /\s([0-9a-f]{32})\.html(?:$|[?#])/i.exec(originalHtml)?.[1]
    );
    if (!databaseId || !hash) continue;
    rememberUnique(unique, ambiguous, hash, databaseId);
  }
  return unique;
}

async function readDatabaseIndexes(workspacePath: string): Promise<DatabaseIndexes> {
  const userDatabaseRoot = join(workspacePath, "databases", "user");
  const entries = await fileService.readDir(userDatabaseRoot, { withFileTypes: true });
  const schemas: DatabaseSchema[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const schemaPath = join(userDatabaseRoot, entry.name, "schema.json");
    if (!fileService.exists(schemaPath)) continue;
    schemas.push(await readJsonFile<DatabaseSchema>(schemaPath));
  }

  const idByFullHash = new Map<string, string>();
  const idByShortHash = new Map<string, string>();
  const ambiguousShortIds = new Set<string>();
  const idByUniqueTitle = new Map<string, string>();
  const ambiguousTitles = new Set<string>();
  for (const schema of schemas) {
    const fullHash = normalizeFullHash(schema.notion_source_hash);
    if (fullHash) {
      idByFullHash.set(fullHash, schema.id);
      rememberUnique(
        idByShortHash,
        ambiguousShortIds,
        notionShortIdFromHash(fullHash),
        schema.id
      );
    }
    rememberUnique(idByUniqueTitle, ambiguousTitles, normalizeTitle(schema.name), schema.id);
  }
  return { schemas, idByFullHash, idByShortHash, ambiguousShortIds, idByUniqueTitle };
}

function rememberUnique(
  target: Map<string, string>,
  ambiguous: Set<string>,
  key: string,
  value: string
): void {
  if (!key || ambiguous.has(key)) return;
  const existing = target.get(key);
  if (!existing) {
    target.set(key, value);
    return;
  }
  if (existing !== value) {
    target.delete(key);
    ambiguous.add(key);
  }
}

function recordText(record: DatabaseRecord, field: string): string {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFullHash(value: string | undefined): string {
  const hash = String(value ?? "").replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hash) ? hash : "";
}

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unresolved(
  bodyPath: string,
  originalHtmlPath: string,
  title: string,
  reason: NotionViewRepairUnresolved["reason"]
): NotionViewRepairUnresolved {
  return { bodyPath, originalHtmlPath, title, reason };
}

function safeWorkspacePath(root: string, relativePath: string): string {
  const absRoot = resolve(root);
  const absPath = resolve(absRoot, relativePath);
  if (absPath !== absRoot && !absPath.startsWith(`${absRoot}${sep}`)) {
    throw new Error(`Path escapes repair root: ${relativePath}`);
  }
  return absPath;
}

function sanitizeRunId(value: string): string {
  const sanitized = value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return sanitized || "repair";
}
