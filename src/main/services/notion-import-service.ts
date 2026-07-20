import { createHash, randomBytes } from "node:crypto";
import { availableParallelism } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { Worker } from "node:worker_threads";
import { parse as parseHtml, type HTMLElement as NhpElement } from "node-html-parser";
import {
  hasNotionPageBodyContent,
  notionHtmlBodyTextFingerprint,
  parseNotionHtml,
  parseNotionHtmlBody,
  parseNotionHtmlMetadata
} from "./notion-html-converter.js";
import type {
  NotionCollectionResolveContext,
  NotionCollectionRow,
  NotionCollectionView,
  ParsedNotionHtmlPage,
  NotionLinkResolver
} from "./notion-html-converter.js";
import type { AppConfigService } from "./app-config-service.js";
import { normalizeDateValue } from "../../shared/date-values.js";
import { formatEmojiIcon } from "../../shared/entity-icons.js";
import { orderFieldIdsByContentRichness } from "../../shared/field-order.js";
import { workspaceAttachmentPath } from "../../shared/attachments.js";
import { DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID, WORKSPACES_DATABASE_ID } from "../../shared/constants.js";
import type { DatabaseRecord, EntityKind, EntityRecord, EntityRef, FieldSchema, SelectOption, TableView } from "../../shared/types.js";
import { serializePathValue } from "../../shared/path-values.js";
import { databaseWorkspacePathWithName, pageMarkdownFileName, rowPagesWorkspacePath } from "../../shared/workspace-paths.js";
import { createEntitiesDefaultView, createEntitiesFields, entityToRecord } from "./entities-database-service.js";
import { createPagesDefaultView, createPagesFields, pageBodyPath, pageFileName } from "./pages-database-service.js";
import { fileService } from "./file-service.js";

// Public scan result — what we show the user in the confirmation
// dialog before they commit to overwriting their workspace.
export interface NotionScanResult {
  sources: string[];
  /** All non-`_all.csv` files seen, before dedup. */
  databasesRaw: number;
  /** Surviving databases after we drop empties + dedup by title. */
  databasesKept: number;
  /** Per-database row count from the chosen CSV variant. */
  databases: Array<{ title: string; rows: number; userFields: number }>;
  /** Page files that are not direct database rows. Includes nested pages; deduped by Notion hash. */
  topLevelPages: number;
  /** Files copied into the workspace attachments folder. */
  attachments: number;
}

export interface NotionImportResult {
  /** Where the new workspace ended up. */
  workspaceRoot: string;
  /** Page id of the generated import report in the new workspace. */
  reportPageId: string;
  /** Structured counterpart to the generated Markdown report page. */
  report: NotionImportReportSummary;
  scan: NotionScanResult;
}

export interface NotionImportNameConflictEntry {
  id: string;
  notionId?: string;
  name: string;
  kind: "page" | "database";
  source: string;
  target: string;
}

export interface NotionImportNameConflictGroup {
  name: string;
  kinds: Array<"page" | "database">;
  entries: NotionImportNameConflictEntry[];
}

export interface NotionImportReportSummary {
  status: "complete" | "complete_with_warnings";
  generatedAt: string;
  durationMs: number;
  counts: {
    sources: number;
    pages: number;
    databases: number;
    rows: number;
    attachments: number;
    warnings: number;
    reviewItems: number;
  };
  nameConflicts: {
    pageGroups: number;
    databaseGroups: number;
    crossTypeGroups: number;
    groups: NotionImportNameConflictGroup[];
  };
  icons: {
    pagesWithIcon: number;
    pagesWithoutIcon: number;
    databasesWithIcon: number;
    databasesWithoutIcon: number;
    rowsWithIcon: number;
    rowsWithoutIcon: number;
  };
  performance: {
    prepareTargetMs: number;
    resolveSourcesMs: number;
    indexSourcesMs: number;
    selectDatabasesMs: number;
    planAndParseMs: number;
    writeWorkspaceMs: number;
    totalMs: number;
  };
  warnings: string[];
  artifacts: {
    directory: string;
    markdown: string;
    json: string;
    warningsCsv: string;
    manifest: string;
  };
}

interface NotionImportEarlyTimings {
  startedAt: number;
  prepareTargetMs: number;
  resolveSourcesMs: number;
  indexSourcesMs: number;
  selectDatabasesMs: number;
}

/**
 * Progress event emitted while `runImport` runs. `phase` identifies
 * the section of work; `current` / `total` carry a determinate
 * counter for phases that can measure ahead of time. `message` is a
 * free-form one-liner for indeterminate phases. The renderer treats
 * `total === undefined` as "show a spinner instead of a bar".
 */
export interface NotionImportProgress {
  phase: "scanning" | "indexing" | "parsing" | "writing" | "done";
  current?: number;
  total?: number;
  message?: string;
  elapsedMs?: number;
  phaseElapsedMs?: number;
  stats?: NotionImportStats;
}

export type NotionImportProgressCallback = (event: NotionImportProgress) => void;

export interface NotionImportStats {
  sources: number;
  databasesRaw: number;
  databasesKept: number;
  totalRows: number;
  rowPages: number;
  freePages: number;
  pages: number;
  attachments: number;
  attachmentSourceFiles: number;
  topDatabases: Array<{ title: string; rows: number; userFields: number }>;
}

export interface NotionImportOptions {
  /**
   * Do not import standalone pages or database rows that have no material
   * body content and no material user field values.
   */
  skipEmptyRowsAndPages?: boolean;
  /**
   * Drop duplicate standalone page bodies when the same Notion page hash
   * has already been imported as a database row page, or when another
   * standalone/nested page has the same cleaned title + body.
   */
  dedupeMarkdownFiles?: boolean;
  /**
   * Preserve a browsable copy of the original Notion export tree under
   * `attachments/original/...` and add clickable HTML/CSV source fields.
   * The source copy keeps Notion's relative file layout intact so opening
   * a raw HTML page can still load its adjacent images and web assets.
   */
  includeOriginalHtml?: boolean;
}

const DEFAULT_NOTION_IMPORT_OPTIONS: Required<NotionImportOptions> = {
  skipEmptyRowsAndPages: true,
  dedupeMarkdownFiles: true,
  includeOriginalHtml: true
};

const NOTION_HASH = /\s+([0-9a-f]{32})$/i;
// Known extensions are still used to distinguish pages/databases above,
// but any other source file with an extension should become an attachment
// too. Unknown extensions are categorized as `misc` by
// workspaceAttachmentPath().
const ATTACHMENT_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".heic", ".heif", ".tif", ".tiff",
  ".html", ".htm", ".css", ".js", ".mjs",
  ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt",
  ".txt", ".rtf", ".pages", ".key", ".numbers",
  ".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz",
  ".mp3", ".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv",
  ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus", ".aiff",
  ".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml"
]);
const IGNORED_ATTACHMENT_FILENAMES = new Set([".ds_store"]);
const ROW_ICON_FIELD_ID = "row_icon";
const ROW_COVER_FIELD_ID = "cover";
const ROW_COVER_OFFSET_FIELD_ID = "cover_offset";
const ORIGINAL_NOTION_HTML_FIELD_ID = "notion_original_html";
const ORIGINAL_NOTION_HTML_FIELD_NAME = "Original Notion HTML";
const ORIGINAL_NOTION_CSV_FIELD_ID = "notion_original_csv";
const ORIGINAL_NOTION_CSV_FIELD_NAME = "Original Notion CSV";
const IMPORT_REVIEW_DATABASE_ID = "db_import_review";
const IMPORT_REVIEW_DATABASE_NAME = "Import review";
const IMPORT_REPORT_SUMMARY_LIMIT = 40;
const DISPOSABLE_IMPORT_TARGET_ENTRIES = new Set([".DS_Store", ".lotion-cache"]);

// ── public service ────────────────────────────────────────────────────

export class NotionImportService {
  constructor(private readonly config: AppConfigService) {}

  /**
   * Pops a native folder picker and returns the chosen path, or null
   * if cancelled. The renderer can't open dialogs in modern Electron,
   * so this lives in main.
   */
  async pickFolder(kind?: "markdown_csv" | "html"): Promise<string | null> {
    const dialog = await getElectronDialog();
    const title = kind === "markdown_csv"
      ? "Choose your Notion Markdown & CSV export"
      : kind === "html"
        ? "Choose your Notion HTML export"
        : "Choose your Notion export folder";
    const message = kind === "markdown_csv"
      ? "Pick the folder extracted from Notion's Markdown & CSV export."
      : kind === "html"
        ? "Pick the folder extracted from Notion's HTML export."
        : "Pick the folder containing your Notion `Export-…` subfolders, or a single Export folder.";
    const result = await dialog.showOpenDialog({
      title,
      properties: ["openDirectory"],
      message
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  /**
   * Folder picker for where to *write* the imported workspace.
   * `createDirectory: true` lets the user make a new sibling folder
   * inline.
   */
  async pickTargetFolder(): Promise<string | null> {
    const dialog = await getElectronDialog();
    const result = await dialog.showOpenDialog({
      title: "Choose a folder for the imported workspace",
      properties: ["openDirectory", "createDirectory"],
      message:
        "Pick (or create) an empty folder for the new workspace. The current workspace is untouched."
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  /** Inspect the folder and report what an import would produce. */
  async scan(sourcePaths: string | string[]): Promise<NotionScanResult> {
    const sources = await resolveSourceParts(sourcePaths);
    const inventory = await buildInventory(sources);
    const choice = await chooseDatabasesByTitle(inventory.databasesByHash);
    return {
      sources,
      databasesRaw: inventory.databasesByHash.size,
      databasesKept: choice.kept.length,
      databases: choice.preview.slice(0, 64),
      topLevelPages: inventory.pagesByHash.size,
      attachments: inventory.attachments.size
    };
  }

  /**
   * Emit the imported workspace into `targetPath`. Refuses to write
   * into a non-empty directory unless `force` is set, so a stray
   * click can't shred existing data. Marks the new workspace as
   * active in app-config; the renderer reloads after this resolves
   * and picks it up.
   */
  async runImport(
    sourcePaths: string | string[],
    targetPath: string,
    force = false,
    optionsOrProgress?: NotionImportOptions | NotionImportProgressCallback,
    maybeOnProgress?: NotionImportProgressCallback
  ): Promise<NotionImportResult> {
    const options = normalizeImportOptions(
      typeof optionsOrProgress === "function" ? undefined : optionsOrProgress
    );
    const onProgress =
      typeof optionsOrProgress === "function" ? optionsOrProgress : maybeOnProgress;
    const startedAt = Date.now();
    const emitProgress = createProgressReporter(onProgress, startedAt);
    const normalizedSourcePaths = normalizeSourcePathInput(sourcePaths);
    if (normalizedSourcePaths.length === 0) throw new Error("At least one Notion export folder is required");
    console.log(
      `[lotion main] notion import start sources=${JSON.stringify(normalizedSourcePaths)} target=${targetPath} ` +
      `force=${force} options=${JSON.stringify(options)}`
    );
    if (!targetPath) throw new Error("targetPath is required");

    const tTarget = Date.now();
    if (!force) {
      let existing: string[] = [];
      try {
        existing = await fileService.readDir(targetPath);
      } catch {
        // ENOENT — empty / not yet created, fine.
      }
      const materialEntries = existing.filter((entry) => !DISPOSABLE_IMPORT_TARGET_ENTRIES.has(entry));
      if (materialEntries.length > 0) {
        throw new Error(`Target folder is not empty: ${targetPath}`);
      }
      if (existing.length > 0) {
        console.log(
          `[lotion main] notion import target contains disposable entries only: ${existing.join(", ")}`
        );
      }
    } else {
      await fileService.remove(targetPath, { recursive: true, force: true });
    }
    const prepareTargetMs = Date.now() - tTarget;
    console.log(`[lotion main] notion import prepare target elapsed=${formatDuration(prepareTargetMs)} total=${formatDuration(Date.now() - startedAt)}`);

    emitProgress({ phase: "scanning", message: "Indexing source files" });
    const tResolve = Date.now();
    const sources = await resolveSourceParts(normalizedSourcePaths);
    const resolveSourcesMs = Date.now() - tResolve;
    console.log(`[lotion main] notion import sources count=${sources.length} elapsed=${formatDuration(resolveSourcesMs)}`);
    const tInventory = Date.now();
    const inventory = await buildInventory(sources, emitProgress);
    const indexSourcesMs = Date.now() - tInventory;
    console.log(
      `[lotion main] notion import indexed rawDbs=${inventory.databasesByHash.size} ` +
      `rowPages=${inventory.rowsByKey.size} freePages=${inventory.pagesByHash.size} ` +
      `attachments=${inventory.attachments.size} attachmentSources=${attachmentSourceCount(inventory)} ` +
      `elapsed=${formatDuration(indexSourcesMs)} total=${formatDuration(Date.now() - startedAt)}`
    );
    const tChoice = Date.now();
    const choice = await chooseDatabasesByTitle(inventory.databasesByHash);
    const selectDatabasesMs = Date.now() - tChoice;
    const stats = makeImportStats(sources, inventory, choice);
    console.log(
      `[lotion main] notion import selected keptDbs=${stats.databasesKept}/${stats.databasesRaw} ` +
      `totalRows=${stats.totalRows} elapsed=${formatDuration(selectDatabasesMs)} total=${formatDuration(Date.now() - startedAt)}`
    );
    console.log(
      `[lotion main] notion import top databases ` +
      stats.topDatabases.slice(0, 20).map((db) => `${db.title}:${db.rows}`).join(", ")
    );
    emitProgress({
      phase: "indexing",
      current: stats.sources,
      total: stats.sources,
      message: "Indexed source files",
      stats
    });

    const tEmit = Date.now();
    const emitted = await emitWorkspace(targetPath, sources, inventory, choice, emitProgress, options, {
      startedAt,
      prepareTargetMs,
      resolveSourcesMs,
      indexSourcesMs,
      selectDatabasesMs
    });
    console.log(`[lotion main] notion import emitted workspace elapsed=${formatDuration(Date.now() - tEmit)} total=${formatDuration(Date.now() - startedAt)}`);

    // Read back the manifest name so app-config can display it.
    let name = "Notion Import";
    try {
      const raw = await fileService.readText(join(targetPath, "lotion.json"));
      const parsed = JSON.parse(raw);
      if (typeof parsed?.name === "string") name = parsed.name;
    } catch {
      // shrug
    }
    await this.config.touch(targetPath, name);
    emitProgress({ phase: "done", current: 1, total: 1, message: "Import complete", stats });
    console.log(`[lotion main] notion import done total=${formatDuration(Date.now() - startedAt)}`);

    return {
      workspaceRoot: targetPath,
      reportPageId: emitted.reportPageId,
      report: emitted.report,
      scan: {
        sources,
        databasesRaw: inventory.databasesByHash.size,
        databasesKept: choice.kept.length,
        databases: choice.preview.slice(0, 64),
        topLevelPages: inventory.pagesByHash.size,
        attachments: inventory.attachments.size
      }
    };
  }
}

// ── source detection ──────────────────────────────────────────────────

type ElectronDialog = typeof import("electron")["dialog"];

async function getElectronDialog(): Promise<ElectronDialog> {
  const electron = await import("electron");
  const dialog =
    electron.dialog ??
    (electron as typeof electron & { default?: { dialog?: ElectronDialog } }).default?.dialog;
  if (!dialog) throw new Error("Electron dialog is unavailable");
  return dialog;
}

function createProgressReporter(
  callback: NotionImportProgressCallback | undefined,
  startedAt: number
): NotionImportProgressCallback {
  const phaseStartedAt = new Map<NotionImportProgress["phase"], number>();
  return (event) => {
    const now = Date.now();
    if (!phaseStartedAt.has(event.phase)) phaseStartedAt.set(event.phase, now);
    callback?.({
      ...event,
      elapsedMs: now - startedAt,
      phaseElapsedMs: now - (phaseStartedAt.get(event.phase) ?? now)
    });
  };
}

function normalizeImportOptions(options: NotionImportOptions | undefined): Required<NotionImportOptions> {
  return {
    ...DEFAULT_NOTION_IMPORT_OPTIONS,
    ...(options ?? {})
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatImportMemory(): string {
  const usage = process.memoryUsage();
  return `heap=${formatBytes(usage.heapUsed)}/${formatBytes(usage.heapTotal)} rss=${formatBytes(usage.rss)}`;
}

async function hashFile(sourcePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha256");
    const stream = fileService.createReadStream(sourcePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectHash);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

const HEADER_READ_CHUNK_BYTES = 64 * 1024;
const MAX_HEADER_READ_BYTES = 1024 * 1024;
const LARGE_HTML_BYTES = 2 * 1024 * 1024;
const SLOW_HTML_MS = 1000;

interface HeaderReadResult {
  headerHtml: string;
  sampleHtml: string;
  bytesRead: number;
  fileSize: number;
}

async function readNotionHtmlHeader(sourcePath: string): Promise<HeaderReadResult> {
  const info = await fileService.stat(sourcePath);
  const handle = await fileService.open(sourcePath, "r");
  const chunks: Buffer[] = [];
  let bytesReadTotal = 0;
  let headerHtml: string | null = null;
  let headerSampleMinBytes = 0;
  try {
    const limit = Math.min(info.size, MAX_HEADER_READ_BYTES);
    while (bytesReadTotal < limit) {
      const buffer = Buffer.alloc(Math.min(HEADER_READ_CHUNK_BYTES, limit - bytesReadTotal));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, bytesReadTotal);
      if (bytesRead <= 0) break;
      chunks.push(buffer.subarray(0, bytesRead));
      bytesReadTotal += bytesRead;
      const sampleHtml = Buffer.concat(chunks).toString("utf8");
      if (!headerHtml) {
        const headerEnd = sampleHtml.toLowerCase().indexOf("</header>");
        if (headerEnd >= 0) {
          headerHtml = sampleHtml.slice(0, headerEnd + "</header>".length);
          headerSampleMinBytes = Math.min(info.size, bytesReadTotal + HEADER_READ_CHUNK_BYTES);
        }
      }
      if (headerHtml && (bodyContentHint(sampleHtml) !== undefined || bytesReadTotal >= headerSampleMinBytes)) {
        return {
          headerHtml,
          sampleHtml,
          bytesRead: bytesReadTotal,
          fileSize: info.size
        };
      }
    }
  } finally {
    await handle.close();
  }

  // Malformed/unexpected export: fall back to full read so import stays correct.
  const full = await fileService.readText(sourcePath);
  return {
    headerHtml: full,
    sampleHtml: full,
    bytesRead: Buffer.byteLength(full),
    fileSize: info.size
  };
}

function bodyContentHint(sampleHtml: string): boolean | undefined {
  const match = /<div\b[^>]*class=(["'])[^"']*\bpage-body\b[^"']*\1[^>]*>/i.exec(sampleHtml);
  if (!match) return undefined;
  const afterOpen = sampleHtml.slice(match.index + match[0].length);
  const trimmed = afterOpen
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, "")
    .trimStart();
  if (/^<\/div>\s*(?:<\/article>)?/i.test(trimmed)) return false;
  return trimmed.length > 0 ? true : undefined;
}

function htmlMentionsNotionCollection(sampleHtml: string): boolean {
  return /\bcollection-content\b/i.test(sampleHtml);
}

function logSlowImportHtml(stage: string, sourcePath: string, bytes: number, elapsedMs: number): void {
  const isSlow = elapsedMs >= SLOW_HTML_MS;
  const isLargeBody = stage === "body" && bytes >= LARGE_HTML_BYTES && elapsedMs >= 100;
  if (!isSlow && !isLargeBody) return;
  console.log(
    `[lotion main] notion import slow-html stage=${stage} ` +
    `file=${sourcePath} size=${formatBytes(bytes)} elapsed=${formatDuration(elapsedMs)}`
  );
}

function isHtmlSource(sourcePath: string): boolean {
  return /\.html?$/i.test(sourcePath);
}

function isMarkdownSource(sourcePath: string): boolean {
  return /\.md$/i.test(sourcePath);
}

interface MarkdownExportIcon {
  iconSrc: string;
  iconEmoji: string;
}

function extractMarkdownExportIcon(raw: string): MarkdownExportIcon | null {
  const leading = leadingMarkdownContentAfterTitle(raw);
  const asideMatch = /^<aside\b[\s\S]*?<\/aside>/i.exec(leading);
  if (!asideMatch) return null;
  const aside = parseHtml(asideMatch[0]);
  const iconSrc = aside.querySelector("img")?.getAttribute("src")?.trim() ?? "";
  const iconEmoji = aside.querySelector("span.icon")?.text.trim() ?? "";
  const textWithoutEmoji = aside.text
    .replace(iconEmoji, "")
    .replace(/\s+/g, "")
    .trim();
  if (!iconSrc && !iconEmoji) return null;
  if (textWithoutEmoji) return null;
  return { iconSrc, iconEmoji };
}

function stripLeadingMarkdownExportIcon(raw: string): string {
  const prefixMatch = leadingMarkdownPrefixBeforeContent(raw);
  if (prefixMatch === null) return raw;
  const leading = raw.slice(prefixMatch.length);
  const asideMatch = /^<aside\b[\s\S]*?<\/aside>\s*/i.exec(leading);
  if (!asideMatch) return raw;
  if (!extractMarkdownExportIcon(raw)) return raw;
  return `${raw.slice(0, prefixMatch.length)}${leading.slice(asideMatch[0].length)}`;
}

function leadingMarkdownContentAfterTitle(raw: string): string {
  const prefix = leadingMarkdownPrefixBeforeContent(raw);
  return prefix === null ? raw : raw.slice(prefix.length);
}

function leadingMarkdownPrefixBeforeContent(raw: string): string | null {
  const normalized = raw.replace(/^\uFEFF/, "");
  const match = /^(?:\s*\n)*(?:#{1,6}[^\n]*\n(?:\s*\n)*)?/.exec(normalized);
  return match ? raw.slice(0, match[0].length + (raw.length - normalized.length)) : null;
}

function markdownCsvWrapperTarget(raw: string): string | null {
  const withoutIcon = stripLeadingMarkdownExportIcon(raw);
  const body = leadingMarkdownContentAfterTitle(withoutIcon).trim();
  const match = /^\[[\s\S]*\]\(([^)\r\n]+\.csv)\)$/i.exec(body);
  if (!match) return null;
  const href = match[1].trim();
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  let decoded = href;
  try {
    decoded = decodeURIComponent(href);
  } catch {
    return null;
  }
  return notionFileHash(decoded) ? decoded : null;
}

function htmlCsvWrapperTarget(raw: string): string | null {
  const root = parseHtml(raw, { lowerCaseTagName: true });
  const body = root.querySelector("div.page-body");
  if (!body) return null;

  let csvTarget: string | null = null;
  for (const node of body.childNodes) {
    const element = node as NhpElement;
    const tag = element.tagName?.toLowerCase();
    if (!tag) {
      if ((node as { rawText?: string }).rawText?.trim()) return null;
      continue;
    }
    if (tag === "br") continue;
    if (tag === "a") {
      if (csvTarget) return null;
      const href = element.getAttribute("href")?.trim() ?? "";
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
      let decoded = href;
      try {
        decoded = decodeURIComponent(href);
      } catch {
        return null;
      }
      if (!/\.csv$/i.test(decoded) || !notionFileHash(decoded)) return null;
      csvTarget = decoded;
      continue;
    }
    if (tag === "div" && /^Metadata:\s*Filters\s*&\s*Sorts\b/i.test(element.text.trim())) {
      continue;
    }
    return null;
  }
  return csvTarget;
}

interface OriginalSourceFile {
  sourcePath: string;
  rel: string;
}

interface OriginalSourceArchive {
  files: OriginalSourceFile[];
  relByAbs: Map<string, string>;
  dedupedFiles: number;
  conflictFiles: number;
}

async function buildOriginalSourceArchive(sourceRoots: string[]): Promise<OriginalSourceArchive> {
  const files: OriginalSourceFile[] = [];
  const relByAbs = new Map<string, string>();
  const fileByRel = new Map<string, OriginalSourceFile>();
  let dedupedFiles = 0;
  let conflictFiles = 0;

  for (const sourceRoot of sourceRoots) {
    const root = resolve(sourceRoot);
    const { contentRoot, rootName } = await resolveOriginalSourceRoot(root);
    await walkOriginalSourceRoot(contentRoot, rootName, "");
  }

  return { files, relByAbs, dedupedFiles, conflictFiles };

  async function walkOriginalSourceRoot(dir: string, rootName: string, relDir: string): Promise<void> {
    let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
    try {
      entries = await fileService.readDir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const sourcePath = join(dir, entry.name);
      const sourceRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walkOriginalSourceRoot(sourcePath, rootName, sourceRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (IGNORED_ATTACHMENT_FILENAMES.has(entry.name.toLowerCase())) continue;

      const rel = ["attachments", "original", rootName, ...sourceRel.split("/")].join("/");
      await addOriginalSourceFile({ sourcePath, rel });
    }
  }

  async function addOriginalSourceFile(file: OriginalSourceFile): Promise<void> {
    const existing = fileByRel.get(file.rel);
    if (!existing) {
      files.push(file);
      fileByRel.set(file.rel, file);
      relByAbs.set(normalizeAbs(file.sourcePath), file.rel);
      return;
    }

    const [existingHash, incomingHash] = await Promise.all([
      hashFile(existing.sourcePath),
      hashFile(file.sourcePath)
    ]);
    if (existingHash === incomingHash) {
      dedupedFiles += 1;
      relByAbs.set(normalizeAbs(file.sourcePath), existing.rel);
      return;
    }

    conflictFiles += 1;
    const conflictRel = uniqueOriginalConflictRel(file.rel, incomingHash, fileByRel);
    const conflictFile = { sourcePath: file.sourcePath, rel: conflictRel };
    files.push(conflictFile);
    fileByRel.set(conflictRel, conflictFile);
    relByAbs.set(normalizeAbs(file.sourcePath), conflictRel);
  }
}

async function resolveOriginalSourceRoot(sourceRoot: string): Promise<{ contentRoot: string; rootName: string }> {
  const contentRoot = await findOriginalExportContentRoot(sourceRoot);
  return {
    contentRoot,
    rootName: safeOriginalSourceSegment(logicalOriginalSourceRootName(basename(contentRoot) || basename(sourceRoot) || "notion-export"))
  };
}

async function findOriginalExportContentRoot(sourceRoot: string): Promise<string> {
  const base = basename(sourceRoot);
  if (!/^Export-[0-9a-f-]+-Part-\d+$/i.test(base)) return sourceRoot;
  try {
    const entries = await fileService.readDir(sourceRoot, { withFileTypes: true });
    const exportChildren = entries.filter((entry) => entry.isDirectory() && /^Export-[0-9a-f-]+(?:\s+\d+)?$/i.test(entry.name));
    if (exportChildren.length === 1) return join(sourceRoot, exportChildren[0]!.name);
  } catch {
    // Fall through to the wrapper directory when the part cannot be inspected.
  }
  return sourceRoot;
}

function logicalOriginalSourceRootName(rootName: string): string {
  const directPartMatch = /^(Export-[0-9a-f-]+)(?:\s+\d+)$/i.exec(rootName);
  if (directPartMatch) return directPartMatch[1]!;
  const wrapperPartMatch = /^(Export-[0-9a-f-]+)-Part-\d+$/i.exec(rootName);
  if (wrapperPartMatch) return wrapperPartMatch[1]!;
  return rootName;
}

function uniqueOriginalConflictRel(
  rel: string,
  hash: string,
  used: Map<string, OriginalSourceFile>
): string {
  const ext = extname(rel);
  const stem = rel.slice(0, rel.length - ext.length);
  let candidate = `${stem}--${hash.slice(0, 8)}${ext}`;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${stem}--${hash.slice(0, 8)}-${counter}${ext}`;
    counter += 1;
  }
  return candidate;
}

async function standalonePageDedupeKey(
  sourcePath: string,
  title: string,
  rawHtml?: string
): Promise<string | null> {
  try {
    const raw = rawHtml ?? await fileService.readText(sourcePath);
    const normalizedBody = isHtmlSource(sourcePath)
      ? notionHtmlBodyTextFingerprint(raw)
      : cleanNotionBody(raw, title).trim().replace(/\r\n/g, "\n");
    if (!normalizedBody) return null;
    const titleKey = collapseTitle(title).toLowerCase();
    const bodyHash = createHash("sha256").update(normalizedBody).digest("hex");
    return `${titleKey}\0${bodyHash}`;
  } catch (error) {
    console.warn(
      `[lotion main] notion import dedupe fingerprint failed file=${sourcePath} ` +
      `error=${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

interface BodyWorkerJob {
  sourcePath: string;
  parsed?: ParsedNotionHtmlPage;
  hasBodyHint?: boolean;
  sourceSize?: number;
}

interface BodyWorkerResult {
  id: number;
  sourcePath: string;
  bodyMarkdown: string;
  sourceSize: number;
  elapsedMs: number;
  stage: "body" | "body-empty" | "body-skip";
}

interface BodyWorkerError {
  id: number;
  sourcePath: string;
  error: string;
}

type BodyWorkerMessage = BodyWorkerResult | BodyWorkerError;

interface BodyWorkerSlot {
  worker: Worker;
  busy: boolean;
  current?: PendingBodyWorkerJob;
}

interface PendingBodyWorkerJob {
  payload: BodyWorkerJob & { id: number };
  resolve: (result: BodyWorkerResult) => void;
  reject: (error: Error) => void;
}

function bodyWorkerCount(): number {
  const fromEnv = Number(process.env.LOTION_NOTION_IMPORT_WORKERS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.min(8, Math.floor(fromEnv));
  return Math.max(1, Math.min(4, availableParallelism() - 1));
}

function bodyWorkerExecArgv(): string[] {
  const execArgv: string[] = [];
  for (let index = 0; index < process.execArgv.length; index += 1) {
    const arg = process.execArgv[index] ?? "";
    if (arg === "--input-type") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--input-type=")) continue;
    execArgv.push(arg);
  }
  return execArgv;
}

class NotionBodyWorkerPool {
  private readonly slots: BodyWorkerSlot[] = [];
  private readonly queue: PendingBodyWorkerJob[] = [];
  private nextId = 1;
  private closed = false;
  private fallbackLogCount = 0;

  constructor(private readonly rewrites: Map<string, string>, count = bodyWorkerCount()) {
    const workerUrl = new URL("./notion-body-worker.js", import.meta.url);
    const workerData = { rewrites: Array.from(this.rewrites.entries()) };
    for (let i = 0; i < count; i += 1) {
      const slot: BodyWorkerSlot = {
        worker: new Worker(workerUrl, { workerData, execArgv: bodyWorkerExecArgv() }),
        busy: false
      };
      slot.worker.on("message", (message: BodyWorkerMessage) => this.handleMessage(slot, message));
      slot.worker.on("error", (error) => this.handleWorkerFailure(slot, error));
      slot.worker.on("exit", (code) => {
        if (!this.closed && code !== 0) {
          this.handleWorkerFailure(slot, new Error(`notion body worker exited with code ${code}`));
        }
      });
      this.slots.push(slot);
    }
  }

  get size(): number {
    return this.slots.length;
  }

  async loadBody(job: BodyWorkerJob): Promise<string> {
    if (!job.sourcePath.endsWith(".html")) {
      const raw = await fileService.readText(job.sourcePath);
      return rewriteNotionTargets(raw, this.rewrites, dirname(job.sourcePath));
    }
    if (this.closed) {
      return this.loadBodyInline(job, "closed");
    }
    const payload = { ...job, id: this.nextId++ };
    let result: BodyWorkerResult;
    try {
      result = await new Promise<BodyWorkerResult>((resolveJob, rejectJob) => {
        this.queue.push({ payload, resolve: resolveJob, reject: rejectJob });
        this.pump();
      });
    } catch (error) {
      this.logFallback(
        `[lotion main] notion import body worker fallback file=${job.sourcePath} ` +
        `reason=${error instanceof Error ? error.message : String(error)}`
      );
      return this.loadBodyInline(job, "failure");
    }
    if (result.stage !== "body-skip") {
      logSlowImportHtml(result.stage, result.sourcePath, result.sourceSize, result.elapsedMs);
    }
    return result.bodyMarkdown;
  }

  private async loadBodyInline(job: BodyWorkerJob, reason: "closed" | "failure"): Promise<string> {
    this.logFallback(`[lotion main] notion import body inline fallback reason=${reason} file=${job.sourcePath}`);
    const result = await convertBodyInProcess({ ...job, id: this.nextId++ }, this.rewrites);
    if (result.stage !== "body-skip") {
      logSlowImportHtml(result.stage, result.sourcePath, result.sourceSize, result.elapsedMs);
    }
    return result.bodyMarkdown;
  }

  private logFallback(message: string): void {
    this.fallbackLogCount += 1;
    if (this.fallbackLogCount <= 20 || this.fallbackLogCount % 500 === 0) {
      console.warn(`${message} fallbackCount=${this.fallbackLogCount}`);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    while (this.queue.length > 0) {
      this.queue.shift()?.reject(new Error("notion body worker pool closed"));
    }
    await Promise.all(this.slots.map((slot) => slot.worker.terminate()));
  }

  private pump(): void {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (slot.busy) continue;
      const next = this.queue.shift();
      if (!next) return;
      slot.busy = true;
      slot.current = next;
      slot.worker.postMessage(next.payload);
    }
  }

  private handleMessage(slot: BodyWorkerSlot, message: BodyWorkerMessage): void {
    const current = slot.current;
    slot.current = undefined;
    slot.busy = false;
    if (!current) {
      this.pump();
      return;
    }
    if ("error" in message) {
      current.reject(new Error(`Failed to convert ${message.sourcePath}: ${message.error}`));
    } else {
      current.resolve(message);
    }
    this.pump();
  }

  private handleWorkerFailure(slot: BodyWorkerSlot, error: Error): void {
    const current = slot.current;
    slot.current = undefined;
    slot.busy = false;
    this.closed = true;
    console.warn(`[lotion main] notion import body worker failed: ${error.message}`);
    if (current) current.reject(error);
    while (this.queue.length > 0) {
      this.queue.shift()?.reject(error);
    }
  }
}

async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  const workerCount = Math.max(1, Math.min(Math.floor(limit), items.length || 1));
  let nextIndex = 0;
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) continue;
      await fn(item, index);
    }
  }));
}

async function convertBodyInProcess(
  job: BodyWorkerJob & { id: number },
  rewrites: Map<string, string>
): Promise<BodyWorkerResult> {
  const startedAt = Date.now();
  if (job.hasBodyHint === false) {
    return {
      id: job.id,
      sourcePath: job.sourcePath,
      bodyMarkdown: "",
      sourceSize: job.sourceSize ?? 0,
      elapsedMs: Date.now() - startedAt,
      stage: "body-skip"
    };
  }

  const raw = await fileService.readText(job.sourcePath);
  const sourceSize = job.sourceSize ?? Buffer.byteLength(raw);
  if (!hasNotionPageBodyContent(raw)) {
    return {
      id: job.id,
      sourcePath: job.sourcePath,
      bodyMarkdown: "",
      sourceSize,
      elapsedMs: Date.now() - startedAt,
      stage: "body-empty"
    };
  }

  const metadata = job.parsed ?? parseNotionHtmlMetadata(raw);
  const parsedBody = parseNotionHtmlBody(raw, metadata, {
    resolveLink: makeBodyResolveLink(job.sourcePath, rewrites),
    resolveCollection: makeBodyResolveCollection(rewrites),
    collectCollectionRows: false
  });
  return {
    id: job.id,
    sourcePath: job.sourcePath,
    bodyMarkdown: parsedBody.bodyMarkdown,
    sourceSize,
    elapsedMs: Date.now() - startedAt,
    stage: "body"
  };
}

function makeBodyResolveLink(sourcePath: string, rewrites: Map<string, string>): NotionLinkResolver {
  const sourceDir = dirname(sourcePath);
  return (decoded) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
    const absSource = resolve(sourceDir, decoded);
    const direct = rewrites.get(normalizeAbs(absSource));
    if (direct) return direct;
    const byExportRelativePath = rewrites.get(exportRelativeRewriteKey(absSource));
    if (byExportRelativePath) return byExportRelativePath;
    const hashMatch = /\s([0-9a-f]{32})(?:_all)?\.(?:html|md|csv)$/i.exec(decoded);
    if (hashMatch) {
      const hash = hashMatch[1].toLowerCase();
      const internal = rewrites.get(`notion-hash:${hash}`);
      if (internal) return internal;
      return `https://www.notion.so/${hash}`;
    }
    return null;
  };
}

function makeBodyResolveCollection(
  rewrites: Map<string, string>
): (hashNoDashes: string, title: string, context?: NotionCollectionResolveContext) => string | null {
  return (hashNoDashes, title, context) => {
    const directId = rewrites.get(`notion-db-id:${hashNoDashes}`);
    if (directId) return `lotion-db:${directId}`;
    const direct = rewrites.get(`notion-db:${hashNoDashes}`);
    if (direct) return direct;
    const dbIdsByRows = new Set<string>();
    for (const rowHash of context?.rowHashes ?? []) {
      const dbId = rewrites.get(`notion-row-db-id:${rowHash.toLowerCase()}`);
      if (dbId) dbIdsByRows.add(dbId);
    }
    if (dbIdsByRows.size === 1) {
      return `lotion-db:${Array.from(dbIdsByRows)[0]!}`;
    }
    if (!title) return null;
    const titleEnc = Buffer.from(title).toString("base64").replace(/=+$/, "");
    const titleId = rewrites.get(`notion-db-title-id:${titleEnc}`);
    if (titleId) return `lotion-db:${titleId}`;
    return rewrites.get(`notion-db-title:${titleEnc}`) ?? null;
  };
}

function attachmentSourceCount(inventory: Inventory): number {
  let count = 0;
  for (const attachment of inventory.attachments.values()) count += attachment.sourcePaths.length;
  return count;
}

function makeImportStats(
  sources: string[],
  inventory: Inventory,
  choice: DatabaseChoice
): NotionImportStats {
  const totalRows = choice.preview.reduce((sum, db) => sum + db.rows, 0);
  const rowPages = inventory.rowsByKey.size;
  const freePages = inventory.pagesByHash.size;
  return {
    sources: sources.length,
    databasesRaw: inventory.databasesByHash.size,
    databasesKept: choice.kept.length,
    totalRows,
    rowPages,
    freePages,
    pages: rowPages + freePages,
    attachments: inventory.attachments.size,
    attachmentSourceFiles: attachmentSourceCount(inventory),
    topDatabases: choice.preview.slice(0, 64)
  };
}

/**
 * If the user picked the parent of `Export-…` folders, gather all of
 * them. If they picked a single export, treat it as one source.
 */
async function resolveSourceParts(sourcePaths: string | string[]): Promise<string[]> {
  const roots = normalizeSourcePathInput(sourcePaths);
  if (roots.length === 0) throw new Error("At least one Notion export folder is required");

  const sources: string[] = [];
  for (const rootPath of roots) {
    const entries = await fileService.readDir(rootPath, { withFileTypes: true });
    const parts = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("Export-"))
      .map((entry) => resolve(rootPath, entry.name))
      .sort();
    sources.push(...(parts.length > 0 ? parts : [resolve(rootPath)]));
  }
  return [...new Set(sources)];
}

function normalizeSourcePathInput(sourcePaths: string | string[]): string[] {
  const candidates = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  return [...new Set(candidates.map((source) => String(source ?? "").trim()).filter(Boolean).map((source) => resolve(source)))];
}

// ── inventory pass ────────────────────────────────────────────────────

interface DatabaseEntry { title: string; rawTitle: string; path: string[]; hash: string; csvPath: string }
interface PageEntry { title: string; hash: string; sourcePath: string }
interface RowEntry { dbHash: string; title: string; hash: string; sourcePath: string }
interface AttachmentEntry { sourcePaths: string[]; fileName: string }

interface Inventory {
  pagesByHash: Map<string, PageEntry>;
  databasesByHash: Map<string, DatabaseEntry>;
  rowsByKey: Map<string, RowEntry>;
  attachments: Map<string, AttachmentEntry>;
}

async function buildInventory(
  sources: string[],
  onProgress?: NotionImportProgressCallback
): Promise<Inventory> {
  const pagesByHash = new Map<string, PageEntry>();
  const databasesByHash = new Map<string, DatabaseEntry>();
  const rowsByKey = new Map<string, RowEntry>();
  const attachments = new Map<string, AttachmentEntry>();
  let attachmentIndexCount = 0;

  // Pass 1: every CSV, so .md classification later can see all db
  // hashes (CSVs and row .md files often live in different parts).
  onProgress?.({ phase: "scanning", current: 0, total: sources.length, message: "Scanning CSV files" });
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    await walk(source, "csv");
    onProgress?.({ phase: "scanning", current: index + 1, total: sources.length, message: "Scanning CSV files" });
  }
  disambiguateDatabaseDisplayTitles(databasesByHash);

  // For each registered DB, compute the LOGICAL path of its row
  // folder — i.e. the path relative to the Notion export root, with
  // the part-specific prefix (`.../Export-<uuid>-Part-N/Export-<uuid>/`)
  // stripped. Without this normalisation, CSVs land in Part-1 while
  // their row HTMLs land in Part-2 (Notion splits big exports across
  // multiple zip parts) and the parent-dir lookup misses every time.
  const dbHashByRowFolder = new Map<string, string>();
  for (const [hash, db] of databasesByHash) {
    // Strip the `_all` and hash suffix from the CSV basename to get
    // the "DB folder name", which is the directory next to the CSV.
    const csvBase = db.csvPath.split(sep).pop() ?? "";
    const csvStem = csvBase.replace(/\.csv$/i, "").replace(/_all$/, "");
    const { title: dbFolderName } = stripHash(csvStem);
    if (!dbFolderName) continue;
    const csvDir = dirname(db.csvPath);
    const rowFolderKey = logicalPath(join(csvDir, dbFolderName));
    if (!dbHashByRowFolder.has(rowFolderKey)) dbHashByRowFolder.set(rowFolderKey, hash);
  }

  // Pass 2: .md + attachments.
  onProgress?.({
    phase: "indexing",
    current: 0,
    total: sources.length,
    message: `Indexing pages and attachments`
  });
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    await walk(source, "rest");
    onProgress?.({
      phase: "indexing",
      current: index + 1,
      total: sources.length,
      message: `Indexed source part ${index + 1} of ${sources.length}`
    });
  }

  return { pagesByHash, databasesByHash, rowsByKey, attachments };

  async function walk(dir: string, phase: "csv" | "rest"): Promise<void> {
    let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
    try {
      entries = await fileService.readDir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, phase);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      const stem = entry.name.slice(0, entry.name.length - ext.length);

      if (phase === "csv") {
        if (ext !== ".csv") continue;
        // Notion exports each database as TWO CSVs:
        //   `<title> <hash>.csv`        current view (often filtered)
        //   `<title> <hash>_all.csv`    every row, no filter
        // We prefer `_all.csv` because the filtered view drops rows
        // the user can still see by switching views. Strip the
        // `_all` suffix so both variants resolve to the same hash.
        const isAll = entry.name.endsWith("_all.csv");
        const stemSansAll = isAll ? stem.slice(0, -"_all".length) : stem;
        const { title, hash } = stripHash(stemSansAll);
        if (!hash) continue;
        const existing = databasesByHash.get(hash);
        if (!existing) {
          databasesByHash.set(hash, {
            title: displayDatabaseName(title),
            rawTitle: title,
            path: notionDatabasePath(fullPath, sources),
            hash,
            csvPath: fullPath
          });
        } else if (isAll && !existing.csvPath.endsWith("_all.csv")) {
          // Upgrade to the fuller `_all.csv` variant if we already
          // registered the filtered one.
          databasesByHash.set(hash, {
            title: displayDatabaseName(title),
            rawTitle: title,
            path: notionDatabasePath(fullPath, sources),
            hash,
            csvPath: fullPath
          });
        }
        continue;
      }

      // Notion ships two body formats: ".md" (markdown export) and
      // ".html" (HTML export). Treat them interchangeably — the rest
      // of the importer dispatches on file extension when reading.
      if (ext === ".md" || ext === ".html" || ext === ".htm") {
        const { title, hash } = stripHash(stem);
        if (!hash) {
          if (ext === ".html" || ext === ".htm") await indexAttachment(fullPath, ext);
          continue;
        }
        const dbHash = enclosingDbHash(dir);
        if (dbHash) {
          const key = `${dbHash}::${hash}`;
          const existing = rowsByKey.get(key);
          // Prefer .html when both are present — it preserves more
          // information (select colors, embedded views, etc.).
          if (!existing || (ext === ".html" && existing.sourcePath.endsWith(".md"))) {
            rowsByKey.set(key, { dbHash, title, hash, sourcePath: fullPath });
          }
        } else {
          // Any HTML/MD file that is not the direct row page of a
          // database is a normal Lotion page. This includes pages
          // nested under database rows; the model no longer treats
          // them as a separate class. Dedup by Notion hash so the same
          // page repeated across export parts or link contexts only
          // appears once.
          const existing = pagesByHash.get(hash);
          if (!existing || (ext === ".html" && existing.sourcePath.endsWith(".md"))) {
            pagesByHash.set(hash, { title, hash, sourcePath: fullPath });
          }
        }
      } else if (shouldIndexAttachment(entry.name, ext)) {
        await indexAttachment(fullPath, ext);
      }
    }
  }

  function shouldIndexAttachment(fileName: string, ext: string): boolean {
    if (!ext) return false;
    if (IGNORED_ATTACHMENT_FILENAMES.has(fileName.toLowerCase())) return false;
    return ATTACHMENT_EXTS.has(ext) || ext.length > 1;
  }

  function enclosingDbHash(dir: string): string | null {
    // The HTML/MD file's direct parent should be the DB's row folder
    // (as a logical path, with the Notion part-split prefix stripped).
    // We require an EXACT match so a nested inline DB with a name
    // colliding with a top-level DB doesn't get misclassified.
    return dbHashByRowFolder.get(logicalPath(dir)) ?? null;
  }

  async function indexAttachment(sourcePath: string, ext: string): Promise<void> {
    const hash = await hashFile(sourcePath);
    const shortHash = hash.slice(0, 24);
    const key = `${hash}:${ext}`;
    const fileName = `${shortHash}-${safeAttachmentStem(sourcePath)}${ext}`;
    // Notion exports often duplicate the same file content across
    // multiple DB row sub-folders (and across `Part-N` zip splits).
    // Dedup by full SHA + extension in the workspace, but remember
    // EVERY source path — the resolver builds rewrites from these, and
    // a link from a page in Part-2 has to find the attachment even if
    // the workspace's canonical copy was indexed from Part-1.
    const existing = attachments.get(key);
    if (existing) {
      if (!existing.sourcePaths.includes(sourcePath)) {
        existing.sourcePaths.push(sourcePath);
      }
      return;
    }
    attachments.set(key, { sourcePaths: [sourcePath], fileName });
    attachmentIndexCount += 1;
    // Throttle: every 50 attachments. Posting on every file makes the
    // IPC busy enough that the renderer can't repaint.
    if (attachmentIndexCount % 50 === 0) {
      onProgress?.({ phase: "indexing", current: attachmentIndexCount, message: "Indexing attachments" });
    }
  }
}

// ── database dedup choice ─────────────────────────────────────────────

interface DatabaseChoice {
  /** Hashes of kept databases. */
  kept: string[];
  /** Sorted by row count desc, for preview display. */
  preview: Array<{ title: string; rows: number; userFields: number }>;
  /** Map of db hash → row count (computed from CSV). */
  rowCounts: Map<string, number>;
  /** Map of db hash → user-field count. */
  fieldCounts: Map<string, number>;
}

async function chooseDatabasesByTitle(databasesByHash: Map<string, DatabaseEntry>): Promise<DatabaseChoice> {
  // Hash is the identity. Titles are only labels, and Notion exports
  // can contain many real databases named "Untitled" under different
  // parents. We still compute row/field counts here for previews, but
  // we no longer dedupe by display title.
  const rowCounts = new Map<string, number>();
  const fieldCounts = new Map<string, number>();
  const preview: Array<{ hash: string; title: string; rows: number; userFields: number }> = [];

  for (const [hash, db] of databasesByHash) {
    if (!db.title) continue;
    const csvRaw = await fileService.readText(db.csvPath);
    const lines = csvRaw.split(/\r?\n/).filter((line) => line.length > 0);
    const rows = Math.max(lines.length - 1, 0);
    const headerCols = lines[0] ? parseCsvLine(lines[0]).length : 0;
    const fields = Math.max(headerCols - 1, 0); // first col is title
    rowCounts.set(hash, rows);
    fieldCounts.set(hash, fields);
    preview.push({ hash, title: db.title, rows, userFields: fields });
  }

  const kept = preview.map((db) => db.hash);
  const sortedPreview = preview
    .map(({ title, rows, userFields }) => ({ title, rows, userFields }))
    .sort((a, b) => b.rows - a.rows);

  return { kept, preview: sortedPreview, rowCounts, fieldCounts };
}

interface LinkToPageHint {
  title: string;
  hash: string;
  icon?: string;
}

interface SyntheticInlineRow extends NotionCollectionRow {
  sourcePath?: string;
}

interface SyntheticEmptyDatabase {
  title: string;
  path?: string[];
  icon?: string;
  fieldNames?: string[];
  rows?: SyntheticInlineRow[];
  includeInManifest?: boolean;
}

async function collectLinkToPageHints(
  inventory: Inventory,
  resolveIcon: (iconSrc: string, sourceDir: string) => string | undefined
): Promise<{ byHash: Map<string, LinkToPageHint>; bySource: Map<string, LinkToPageHint[]> }> {
  const byHash = new Map<string, LinkToPageHint>();
  const bySource = new Map<string, LinkToPageHint[]>();

  for (const entry of inventory.pagesByHash.values()) {
    if (!entry.sourcePath.endsWith(".html")) continue;
    let root;
    try {
      const raw = await fileService.readText(entry.sourcePath);
      if (!raw.includes("link-to-page")) continue;
      root = parseHtml(raw);
    } catch {
      continue;
    }
    const sourceDir = dirname(entry.sourcePath);
    const hints: LinkToPageHint[] = [];
    for (const figure of root.querySelectorAll("figure.link-to-page")) {
      const anchor = figure.querySelector("a");
      const href = anchor?.getAttribute("href") ?? "";
      if (!href) continue;
      let decoded = href;
      if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        try { decoded = decodeURIComponent(href); } catch { /* keep href */ }
      }
      const hash = notionFileHash(decoded);
      if (!hash) continue;
      const titleFromAnchor = anchor ? textWithoutInlineIcon(anchor) : "";
      const hint: LinkToPageHint = {
        title: titleFromAnchor || stripHash(decoded.slice(0, decoded.lastIndexOf("."))).title,
        hash,
        icon: anchor ? resolveElementIcon(anchor, sourceDir, resolveIcon) : undefined
      };
      hints.push(hint);
      const existing = byHash.get(hash);
      if (!existing || (!existing.icon && hint.icon)) byHash.set(hash, hint);
    }
    if (hints.length > 0) bySource.set(entry.sourcePath, hints);
  }

  return { byHash, bySource };
}

function resolveElementIcon(
  element: NhpElement,
  sourceDir: string,
  resolveIcon: (iconSrc: string, sourceDir: string) => string | undefined
): string | undefined {
  const iconSrc = element.querySelector("img.icon")?.getAttribute("src") ?? "";
  return resolveIcon(iconSrc, sourceDir) ?? formatEmojiIcon(element.querySelector("span.icon")?.text ?? "");
}

function textWithoutInlineIcon(element: NhpElement): string {
  const text = element.text.trim();
  const iconText = element.querySelector("span.icon")?.text.trim() ?? "";
  if (iconText && text.startsWith(iconText)) return text.slice(iconText.length).trim();
  return text;
}

function collectSyntheticEmptyDatabases(
  hintsBySource: Map<string, LinkToPageHint[]>,
  inventory: Inventory,
  keptDbTitles: Set<string>,
  sourceRoots: string[]
): Map<string, SyntheticEmptyDatabase> {
  const synthetic = new Map<string, SyntheticEmptyDatabase>();
  const knownRowHashes = new Set(Array.from(inventory.rowsByKey.values()).map((row) => row.hash));

  for (const [sourcePath, hints] of hintsBySource) {
    const dbLike = hints.filter((hint) => keptDbTitles.has(hint.title)).length;
    const pageLike = hints.filter((hint) =>
      inventory.pagesByHash.has(hint.hash) && !keptDbTitles.has(hint.title)
    ).length;

    // A Notion "database index" page is just a list of link-to-page
    // figures. Empty databases can be omitted from the export, leaving
    // only a dangling `<title> <hash>.html` link. When most sibling
    // links resolve to databases, synthesize an empty DB for missing
    // siblings instead of sending users out to notion.so.
    if (dbLike < 3 || dbLike <= pageLike) continue;

    for (const hint of hints) {
      const known =
        inventory.pagesByHash.has(hint.hash) ||
        inventory.databasesByHash.has(hint.hash) ||
        knownRowHashes.has(hint.hash);
      if (known || !hint.title || keptDbTitles.has(hint.title)) continue;
      if (!synthetic.has(hint.hash)) {
        synthetic.set(hint.hash, {
          title: hint.title,
          path: [...notionPagePath(sourcePath, sourceRoots), hint.title].filter(Boolean),
          icon: hint.icon
        });
      }
    }
  }

  return synthetic;
}

function collectInlineCollectionViews(
  parsed: ParsedNotionHtmlPage,
  synthetic: Map<string, SyntheticEmptyDatabase>,
  inventory: Inventory,
  parentTitle: string,
  parentSourcePath: string,
  sourceRoots: string[],
  shouldSkipView?: (view: NotionCollectionView, parentSourcePath: string) => boolean,
  materializeUnknownViews = false
): void {
  for (const view of parsed.collectionViews) {
    if (!view.hash) continue;
    if (shouldSkipView?.(view, parentSourcePath)) continue;
    // Notion HTML exports include rendered collection snapshots for
    // linked views and historical inline tables. Materialising every
    // HTML-only snapshot as a Lotion database explodes real workspaces
    // into hundreds of thousands of synthetic row pages. Only import a
    // collection as a database when it has a CSV/database source; unknown
    // HTML snapshots remain inspectable through the preserved original
    // Notion HTML.
    if (!materializeUnknownViews) continue;
    const fieldNames = (view.fieldNames || []).map((name) => name.trim()).filter(Boolean);
    if (view.rowCount === 0 && fieldNames.length === 0) continue;
    const title = materialTitle(view.title) || `${materialTitle(parentTitle) || "Page"} / Untitled`;
    const path = [...notionPagePath(parentSourcePath, sourceRoots), materialTitle(view.title) || "Untitled"].filter(Boolean);
    const rows = (view.rows || []).map((row) => ({
      ...row,
      sourcePath: inventorySourcePathByHash(inventory, row.hash) ?? resolveInlineRowSource(parentSourcePath, row.href)
    }));
    const existing = synthetic.get(view.hash);
    if (existing) {
      const existingHashes = new Set((existing.rows || []).map((row) => row.hash));
      existing.rows = [
        ...(existing.rows || []),
        ...rows.filter((row) => row.hash && !existingHashes.has(row.hash))
      ];
      if (fieldNames.length > (existing.fieldNames?.length ?? 0)) existing.fieldNames = fieldNames;
      if (!existing.path && path.length > 0) existing.path = path;
    } else {
      synthetic.set(view.hash, {
        title,
        path,
        fieldNames,
        rows,
        includeInManifest: false
      });
    }
  }
}

function resolveInlineRowSource(parentSourcePath: string, href: string): string | undefined {
  if (!href) return undefined;
  try {
    const sourcePath = resolve(dirname(parentSourcePath), decodeURIComponent(href));
    return fileService.exists(sourcePath) ? sourcePath : undefined;
  } catch {
    return undefined;
  }
}

function inventorySourcePathByHash(inventory: Inventory, hash: string | undefined): string | undefined {
  if (!hash) return undefined;
  const pageSource = inventory.pagesByHash.get(hash)?.sourcePath;
  if (pageSource) return pageSource;
  for (const row of inventory.rowsByKey.values()) {
    if (row.hash === hash) return row.sourcePath;
  }
  return undefined;
}

interface ImportReportDatabaseSummary {
  id: string;
  name: string;
  originalName: string;
  path: string[];
  source: string;
  notionId?: string;
  sourceRows: number;
  rows: number;
  rowsWithIcon: number;
  rowPages: number;
  fields: number;
  userFields: number;
  visibleFields: number;
  skippedEmptyRowPages: number;
  includeInManifest: boolean;
  icon?: string;
}

interface ImportReportImportedPage {
  id: string;
  title: string;
  hash?: string;
  path: string[];
  source: string;
  target: string;
  icon?: string;
}

interface ImportReportImportedRow {
  databaseId: string;
  database: string;
  rowId: string;
  title: string;
  notionId?: string;
  source: string;
  target: string;
  icon?: string;
}

interface ImportReportPageDetail {
  title: string;
  id?: string;
  hash?: string;
  source: string;
  target?: string;
  targetHash?: string;
  reason: string;
}

interface ImportReportRowDetail {
  database: string;
  databaseId: string;
  rowId: string;
  title: string;
  hash?: string;
  source: string;
  target: string;
  reason: string;
}

interface ImportReportDuplicateRowSummary {
  database: string;
  databaseId: string;
  name: string;
  count: number;
  sampleRowIds: string[];
  sampleValues: string;
}

interface ImportReviewArtifacts {
  databaseId: string;
  databaseName: string;
  databasePath: string;
  totalIssues: number;
  dedupedPages: number;
  emptyStandalonePages: number;
  emptyRowPages: number;
}

interface BuildImportReportInput {
  now: string;
  target: string;
  sources: string[];
  options: Required<NotionImportOptions>;
  inventory: Inventory;
  choice: DatabaseChoice;
  pagePlans: number;
  pageRecords: number;
  importedPages: ImportReportImportedPage[];
  importedRows: ImportReportImportedRow[];
  databases: ImportReportDatabaseSummary[];
  manifestDatabases: number;
  parsedRowsDone: number;
  parsedRowsTotal: number;
  skippedDuplicateStandalonePages: number;
  skippedEmptyStandalonePages: number;
  syntheticEmptyDatabases: number;
  inlineEmptyDatabases: number;
  rewrites: number;
  duplicatePageRedirects: number;
  phantomPageRedirects: number;
  originalSourceFiles: number;
  reportPageId: string;
  reportBodyPath: string;
  review: ImportReviewArtifacts;
  dedupedPages: ImportReportPageDetail[];
  emptyStandalonePages: ImportReportPageDetail[];
  emptyRowPages: ImportReportRowDetail[];
  duplicateRows: ImportReportDuplicateRowSummary[];
  report: NotionImportReportSummary;
}

function buildNameConflictSummary(
  pages: ImportReportImportedPage[],
  databases: ImportReportDatabaseSummary[]
): NotionImportReportSummary["nameConflicts"] {
  const byName = new Map<string, { name: string; entries: NotionImportNameConflictEntry[] }>();
  const add = (name: string, entry: NotionImportNameConflictEntry) => {
    const displayName = name.replace(/\s+/g, " ").trim() || "Untitled";
    const key = displayName.toLocaleLowerCase();
    const group = byName.get(key) ?? { name: displayName, entries: [] };
    group.entries.push(entry);
    byName.set(key, group);
  };
  for (const page of pages) {
    add(page.title, {
      id: page.id,
      notionId: page.hash,
      name: page.title,
      kind: "page",
      source: page.source,
      target: page.target
    });
  }
  for (const database of databases) {
    add(database.originalName, {
      id: database.id,
      notionId: database.notionId,
      name: database.name,
      kind: "database",
      source: database.source,
      target: databaseWorkspacePathWithName(database.id, false, database.name)
    });
  }
  const groups = Array.from(byName.values())
    .map((group): NotionImportNameConflictGroup | null => {
      const pageCount = group.entries.filter((entry) => entry.kind === "page").length;
      const databaseCount = group.entries.filter((entry) => entry.kind === "database").length;
      if (pageCount < 2 && databaseCount < 2 && !(pageCount > 0 && databaseCount > 0)) return null;
      return {
        name: group.name,
        kinds: [...new Set(group.entries.map((entry) => entry.kind))],
        entries: group.entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.target.localeCompare(b.target))
      };
    })
    .filter((group): group is NotionImportNameConflictGroup => Boolean(group))
    .sort((a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name));
  return {
    pageGroups: groups.filter((group) => group.entries.filter((entry) => entry.kind === "page").length >= 2).length,
    databaseGroups: groups.filter((group) => group.entries.filter((entry) => entry.kind === "database").length >= 2).length,
    crossTypeGroups: groups.filter((group) => group.kinds.length > 1).length,
    groups
  };
}

function buildImportReportSummary(input: {
  now: string;
  target: string;
  sources: string[];
  inventory: Inventory;
  stats: NotionImportStats;
  importedPages: ImportReportImportedPage[];
  databases: ImportReportDatabaseSummary[];
  parsedRowsDone: number;
  parsedRowsTotal: number;
  review: ImportReviewArtifacts;
  timings: NotionImportReportSummary["performance"];
}): NotionImportReportSummary {
  const rows = input.databases.reduce((sum, database) => sum + database.rows, 0);
  const sourceRows = input.databases.reduce((sum, database) => sum + database.sourceRows, 0);
  const skippedRows = input.databases.reduce((sum, database) => sum + database.skippedEmptyRowPages, 0);
  const rowsWithIcon = input.databases.reduce((sum, database) => sum + database.rowsWithIcon, 0);
  const warnings: string[] = [];
  if (input.stats.totalRows !== sourceRows) {
    warnings.push(
      `Fast scan estimated ${input.stats.totalRows} database rows; the CSV parser found ${sourceRows}. Parsed CSV rows are the import source of truth.`
    );
  }
  if (input.parsedRowsDone !== input.parsedRowsTotal) {
    warnings.push(`Only parsed ${input.parsedRowsDone} of ${input.parsedRowsTotal} row HTML metadata files.`);
  }
  if (sourceRows !== rows + skippedRows) {
    warnings.push(
      `Database row reconciliation differs: ${sourceRows} parsed source rows, ${rows} emitted rows, and ${skippedRows} intentionally skipped blank rows.`
    );
  }
  if (input.review.totalIssues > 0) {
    warnings.push(`${input.review.totalIssues} intentionally skipped or redirected item(s) are available in Import review.`);
  }
  const nameConflicts = buildNameConflictSummary(input.importedPages, input.databases);
  const artifactDir = `reports/import-${input.now.replace(/[:.]/g, "-")}`;
  const report: NotionImportReportSummary = {
    status: warnings.length > 0 ? "complete_with_warnings" : "complete",
    generatedAt: input.now,
    durationMs: input.timings.totalMs,
    counts: {
      sources: input.sources.length,
      pages: input.importedPages.length,
      databases: input.databases.length,
      rows,
      attachments: input.inventory.attachments.size,
      warnings: warnings.length,
      reviewItems: input.review.totalIssues
    },
    nameConflicts,
    icons: {
      pagesWithIcon: input.importedPages.filter((page) => Boolean(page.icon)).length,
      pagesWithoutIcon: input.importedPages.filter((page) => !page.icon).length,
      databasesWithIcon: input.databases.filter((database) => Boolean(database.icon)).length,
      databasesWithoutIcon: input.databases.filter((database) => !database.icon).length,
      rowsWithIcon,
      rowsWithoutIcon: Math.max(0, rows - rowsWithIcon)
    },
    performance: input.timings,
    warnings,
    artifacts: {
      directory: join(input.target, artifactDir),
      markdown: join(input.target, artifactDir, "report.md"),
      json: join(input.target, artifactDir, "report.json"),
      warningsCsv: join(input.target, artifactDir, "warnings.csv"),
      manifest: join(input.target, artifactDir, "manifest.json")
    }
  };
  return report;
}

function buildImportReportMarkdown(input: BuildImportReportInput): string {
  const stats = makeImportStats(input.sources, input.inventory, input.choice);
  const skippedEmptyRowPages = input.databases.reduce((sum, db) => sum + db.skippedEmptyRowPages, 0);
  const outputRows = input.databases.reduce((sum, db) => sum + db.rows, 0);
  const outputRowPages = input.databases.reduce((sum, db) => sum + db.rowPages, 0);
  const outputFields = input.databases.reduce((sum, db) => sum + db.fields, 0);
  const outputUserFields = input.databases.reduce((sum, db) => sum + db.userFields, 0);
  const duplicateRowCount = input.duplicateRows.reduce((sum, group) => sum + group.count, 0);
  const warnings = [...input.report.warnings];
  const sourceLines = input.sources.length > 0
    ? input.sources.map((source) => `- ${markdownInlineCode(source)}`).join("\n")
    : "- None";
  const largestDatabases = [...input.databases]
    .sort((a, b) => b.rows - a.rows || a.name.localeCompare(b.name))
    .slice(0, 32);
  const reviewLink = `[Open ${input.review.databaseName} database](${input.review.databasePath})`;

  return [
    "# Notion import report",
    "",
    `Generated: ${markdownInlineCode(input.now)}`,
    `Workspace: ${markdownInlineCode(basename(input.target) || "Notion Import")}`,
    `Target: ${markdownInlineCode(input.target)}`,
    `Report page: ${markdownInlineCode(input.reportPageId)} (${markdownInlineCode(input.reportBodyPath)})`,
    "",
    "## Same-name Pages And Databases",
    "",
    "Names are labels, not identity. Lotion only merges matching stable Notion IDs; every object that merely shares a name is retained.",
    "",
    formatMarkdownTable(
      ["Conflict type", "Groups"],
      [
        ["Same-name pages", reportNumber(input.report.nameConflicts.pageGroups)],
        ["Same-name databases", reportNumber(input.report.nameConflicts.databaseGroups)],
        ["Page and database share a name", reportNumber(input.report.nameConflicts.crossTypeGroups)]
      ]
    ),
    "",
    formatNameConflictTable(input.report.nameConflicts.groups),
    "",
    "## Icon Coverage",
    "",
    formatMarkdownTable(
      ["Object", "With icon", "Without icon"],
      [
        ["Pages", reportNumber(input.report.icons.pagesWithIcon), reportNumber(input.report.icons.pagesWithoutIcon)],
        ["Databases", reportNumber(input.report.icons.databasesWithIcon), reportNumber(input.report.icons.databasesWithoutIcon)],
        ["Database rows", reportNumber(input.report.icons.rowsWithIcon), reportNumber(input.report.icons.rowsWithoutIcon)]
      ]
    ),
    "",
    "_Without icon means no icon was emitted. It can be intentional; the importer does not treat it as data loss by itself._",
    "",
    "### Objects Without An Emitted Icon",
    "",
    formatObjectsWithoutIconTable(input.importedPages, input.databases, input.importedRows),
    "",
    "## Summary",
    "",
    formatMarkdownTable(
      ["Metric", "Value"],
      [
        ["Source export parts", reportNumber(input.sources.length)],
        ["Raw databases found", reportNumber(input.inventory.databasesByHash.size)],
        ["Databases selected by title", reportNumber(input.choice.kept.length)],
        ["Databases emitted", reportNumber(input.databases.length)],
        ["Databases in sidebar manifest", reportNumber(input.manifestDatabases)],
        ["Fast scan row estimate", reportNumber(stats.totalRows)],
        ["Rows emitted", reportNumber(outputRows)],
        ["Row page sources indexed", reportNumber(input.inventory.rowsByKey.size)],
        ["Row page records emitted", reportNumber(outputRowPages)],
        ["Standalone/nested page sources indexed", reportNumber(input.inventory.pagesByHash.size)],
        ["Standalone/nested page records emitted", reportNumber(input.pagePlans)],
        ["Total page records emitted", reportNumber(input.pageRecords)],
        ["Possible duplicate row groups", reportNumber(input.duplicateRows.length)],
        ["Possible duplicate rows in those groups", reportNumber(duplicateRowCount)],
        ["Attachments emitted", reportNumber(input.inventory.attachments.size)],
        ["Original Notion source files copied", reportNumber(input.originalSourceFiles)],
        ["Attachment source files", reportNumber(attachmentSourceCount(input.inventory))],
        ["Fields emitted", reportNumber(outputFields)],
        ["User fields emitted", reportNumber(outputUserFields)]
      ]
    ),
    "",
    "## Options",
    "",
    formatMarkdownTable(
      ["Option", "Value"],
      [
        ["Do not import blank rows and pages", input.options.skipEmptyRowsAndPages ? "on" : "off"],
        ["Auto-dedupe standalone Markdown files", input.options.dedupeMarkdownFiles ? "on" : "off"],
        ["Preserve original Notion export for audit", input.options.includeOriginalHtml ? "on" : "off"]
      ]
    ),
    "",
    "## Parsing And Rewrites",
    "",
    formatMarkdownTable(
      ["Metric", "Value"],
      [
        ["Row HTML metadata parsed", `${reportNumber(input.parsedRowsDone)} / ${reportNumber(input.parsedRowsTotal)}`],
        ["Link rewrite entries", reportNumber(input.rewrites)],
        ["Duplicate standalone page redirects", reportNumber(input.duplicatePageRedirects)],
        ["Phantom database-page redirects", reportNumber(input.phantomPageRedirects)],
        ["Synthetic empty databases", reportNumber(input.syntheticEmptyDatabases)],
        ["Inline empty databases", reportNumber(input.inlineEmptyDatabases)]
      ]
    ),
    "",
    "## Skipped Items",
    "",
    formatMarkdownTable(
      ["Kind", "Count"],
      [
        ["Duplicate standalone pages", reportNumber(input.skippedDuplicateStandalonePages)],
        ["Blank standalone/nested pages not imported", reportNumber(input.skippedEmptyStandalonePages)],
        ["Blank database rows not imported", reportNumber(skippedEmptyRowPages)],
        ["Detailed deduped/redirected page rows", reportNumber(input.dedupedPages.length)],
        ["Detailed skipped blank page rows", reportNumber(input.emptyStandalonePages.length)],
        ["Detailed skipped blank row rows", reportNumber(input.emptyRowPages.length)]
      ]
    ),
    "",
    "## Review Queues",
    "",
    `${reviewLink}. Use the status column to mark rows as reviewed.`,
    "",
    formatMarkdownTable(
      ["Queue", "Rows"],
      [
        ["All import review issues", reportNumber(input.review.totalIssues)],
        ["Deduped or redirected pages", reportNumber(input.review.dedupedPages)],
        ["Blank standalone/nested pages not imported", reportNumber(input.review.emptyStandalonePages)],
        ["Blank database rows not imported", reportNumber(input.review.emptyRowPages)]
      ]
    ),
    "",
    "## Human Review Summary",
    "",
    ...formatHumanReviewSummary(input),
    "",
    "## Data Integrity",
    "",
    formatMarkdownTable(
      ["Check", "Result"],
      [
        ["Source export modified", "No — source folders are read-only inputs"],
        ["Identity rule", "Stable Notion ID; names never overwrite another object"],
        ["Parsed database rows", reportNumber(input.databases.reduce((sum, database) => sum + database.sourceRows, 0))],
        ["Rows emitted", reportNumber(outputRows)],
        ["Blank rows intentionally skipped", reportNumber(skippedEmptyRowPages)],
        ["Core workspace manifest", "Written"],
        ["Detailed source-to-target manifest", "Written"]
      ]
    ),
    "",
    "## Performance",
    "",
    formatMarkdownTable(
      ["Stage", "Time"],
      [
        ["Prepare target", formatDuration(input.report.performance.prepareTargetMs)],
        ["Resolve export folders", formatDuration(input.report.performance.resolveSourcesMs)],
        ["Index sources", formatDuration(input.report.performance.indexSourcesMs)],
        ["Select databases", formatDuration(input.report.performance.selectDatabasesMs)],
        ["Plan and parse", formatDuration(input.report.performance.planAndParseMs)],
        ["Write workspace", formatDuration(input.report.performance.writeWorkspaceMs)],
        ["Total", formatDuration(input.report.performance.totalMs)]
      ]
    ),
    "",
    "## Sources",
    "",
    sourceLines,
    "",
    "## Warnings",
    "",
    warnings.length > 0
      ? warnings.map((warning) => `- ${warning}`).join("\n")
      : "_No import warnings were generated._",
    "",
    "## Report Files",
    "",
    `- Markdown: ${markdownInlineCode(input.report.artifacts.markdown)}`,
    `- JSON: ${markdownInlineCode(input.report.artifacts.json)}`,
    `- Warnings CSV: ${markdownInlineCode(input.report.artifacts.warningsCsv)}`,
    `- Source-to-target manifest: ${markdownInlineCode(input.report.artifacts.manifest)}`,
    "",
    "## Largest Databases",
    "",
    largestDatabases.length > 0
      ? formatMarkdownTable(
          ["Database", "Path", "Rows", "Row pages", "Fields", "Blank rows skipped"],
          largestDatabases.map((db) => [
            db.name,
            db.path.join(" / "),
            reportNumber(db.rows),
            reportNumber(db.rowPages),
            reportNumber(db.fields),
            reportNumber(db.skippedEmptyRowPages)
          ])
      )
      : "_No databases were emitted._",
    "",
    "## Notes",
    "",
    `- Detailed issue rows live in ${input.review.databaseName}, not in this Markdown page, so the report remains readable.`,
    "- Blank standalone/nested pages and blank database rows are omitted when the import option is enabled.",
    "- Standalone duplicate pages are deduped against database row pages and other standalone pages, then links are redirected to the kept page.",
    "- Database rows are intentionally not content-deduped, because repeated rows can be real user data.",
    "- Empty databases reconstructed from Notion links are emitted so existing links still open inside Lotion.",
    ""
  ].join("\n");
}

function formatNameConflictTable(groups: NotionImportNameConflictGroup[]): string {
  if (groups.length === 0) return "_No same-name pages or databases were found._";
  const rows: string[][] = [];
  for (const group of groups.slice(0, IMPORT_REPORT_SUMMARY_LIMIT)) {
    for (const entry of group.entries) {
      rows.push([
        group.name,
        entry.kind === "page" ? "Page" : "Database",
        entry.notionId ?? "—",
        entry.target,
        basename(entry.source)
      ]);
    }
  }
  const table = formatMarkdownTable(["Name", "Type", "Notion ID", "Imported target", "Source"], rows);
  if (groups.length <= IMPORT_REPORT_SUMMARY_LIMIT) return table;
  return `${table}\n\n_Showing ${IMPORT_REPORT_SUMMARY_LIMIT} of ${reportNumber(groups.length)} conflict groups. The JSON report contains every group._`;
}

function formatObjectsWithoutIconTable(
  pages: ImportReportImportedPage[],
  databases: ImportReportDatabaseSummary[],
  rows: ImportReportImportedRow[]
): string {
  const objects = [
    ...pages.filter((page) => !page.icon).map((page) => ({ type: "Page", name: page.title, target: page.target })),
    ...databases.filter((database) => !database.icon).map((database) => ({
      type: "Database",
      name: database.name,
      target: databaseWorkspacePathWithName(database.id, false, database.name)
    })),
    ...rows.filter((row) => !row.icon).map((row) => ({
      type: "Database row",
      name: `${row.database} / ${row.title}`,
      target: row.target
    }))
  ];
  if (objects.length === 0) return "_Every imported page, database, and database row has an emitted icon._";
  const table = formatMarkdownTable(
    ["Type", "Object", "Imported target"],
    objects.slice(0, IMPORT_REPORT_SUMMARY_LIMIT).map((object) => [object.type, object.name, object.target])
  );
  if (objects.length <= IMPORT_REPORT_SUMMARY_LIMIT) return table;
  return `${table}\n\n_Showing ${IMPORT_REPORT_SUMMARY_LIMIT} of ${reportNumber(objects.length)} objects. The source-to-target manifest contains the complete list._`;
}

interface ImportReportGroupedSummary {
  name: string;
  count: number;
  rule: string;
  reason: string;
  target: string;
  examples: string[];
}

function formatHumanReviewSummary(input: BuildImportReportInput): string[] {
  const duplicatePages = summarizeDuplicatePages(input.dedupedPages);
  const emptyPages = summarizeEmptyStandalonePages(input.emptyStandalonePages);
  const emptyRowPages = summarizeEmptyRowPages(input.emptyRowPages);
  return [
    "### Duplicate Or Redirected Pages",
    "",
    "Rule: standalone pages are skipped only when they match a canonical import target by Notion page hash, by standalone database-wrapper redirect, or by normalized title plus cleaned Markdown body hash. Database rows are not removed by this rule.",
    "",
    formatGroupedSummaryTable(
      ["Page name", "Skipped copies", "How it was judged", "Kept target", "Example source files"],
      duplicatePages,
      (group) => [group.name, reportNumber(group.count), group.rule, group.target, group.examples.join("<br>")],
      "_No duplicate or redirected standalone pages were found._"
    ),
    ...formatSummaryOverflowNote(duplicatePages.length),
    "",
    "### Possible Duplicate Rows",
    "",
    "Rule: rows are only reported, not removed. A row group is flagged when rows in the same database have identical normalized values across every imported user field, including the title field; system fields such as ID, created time, updated time, row icon, and page file are ignored.",
    "",
    input.duplicateRows.length > 0
      ? formatMarkdownTable(
          ["Database", "Row name/value", "Rows", "Sample row IDs", "Sample values"],
          input.duplicateRows.slice(0, IMPORT_REPORT_SUMMARY_LIMIT).map((group) => [
            group.database,
            group.name,
            reportNumber(group.count),
            group.sampleRowIds.join("<br>"),
            group.sampleValues
          ])
        )
      : "_No exact duplicate row groups were detected by the conservative row fingerprint rule._",
    ...formatSummaryOverflowNote(input.duplicateRows.length),
    "",
    "### Empty Standalone Pages",
    "",
    "Rule: standalone/nested pages are not imported when the cleaned Markdown body is empty after removing Notion's duplicated title/property wrapper.",
    "",
    formatGroupedSummaryTable(
      ["Page name", "Empty pages", "How it was judged", "Target body path", "Example source files"],
      emptyPages,
      (group) => [group.name, reportNumber(group.count), group.rule, group.target, group.examples.join("<br>")],
      "_No blank standalone/nested pages were skipped._"
    ),
    ...formatSummaryOverflowNote(emptyPages.length),
    "",
    "### Blank Database Rows",
    "",
    "Rule: database rows are not imported when the cleaned row-page body is empty or missing and every meaningful user field is empty. System fields, row id, row icon, page file, generated timestamps, and Original Notion HTML/CSV links are ignored for this check.",
    "",
    formatGroupedSummaryTable(
      ["Database", "Blank rows", "How it was judged", "Example row names", "Example targets"],
      emptyRowPages,
      (group) => [group.name, reportNumber(group.count), group.rule, group.examples.join("<br>"), group.target],
      "_No blank database rows were skipped._"
    ),
    ...formatSummaryOverflowNote(emptyRowPages.length)
  ];
}

function formatGroupedSummaryTable(
  headers: string[],
  groups: ImportReportGroupedSummary[],
  rowForGroup: (group: ImportReportGroupedSummary) => string[],
  emptyText: string
): string {
  if (groups.length === 0) return emptyText;
  return formatMarkdownTable(headers, groups.slice(0, IMPORT_REPORT_SUMMARY_LIMIT).map(rowForGroup));
}

function formatSummaryOverflowNote(totalGroups: number): string[] {
  if (totalGroups <= IMPORT_REPORT_SUMMARY_LIMIT) return [];
  return [
    "",
    `_Showing top ${IMPORT_REPORT_SUMMARY_LIMIT} of ${reportNumber(totalGroups)} groups. Open ${IMPORT_REVIEW_DATABASE_NAME} for the full row-level list._`
  ];
}

function summarizeDuplicatePages(pages: ImportReportPageDetail[]): ImportReportGroupedSummary[] {
  const groups = new Map<string, ImportReportGroupedSummary>();
  for (const page of pages) {
    const name = page.title.trim() || "Untitled";
    const target = page.target ?? (page.targetHash ? `database hash ${page.targetHash}` : "canonical imported row/page");
    const rule = duplicatePageRule(page.reason);
    const key = `${name}\0${page.reason}\0${target}`;
    const group = groups.get(key) ?? {
      name,
      count: 0,
      rule,
      reason: page.reason,
      target,
      examples: []
    };
    group.count += 1;
    pushExample(group.examples, basename(page.source));
    groups.set(key, group);
  }
  return sortGroupedSummaries(groups);
}

function duplicatePageRule(reason: string): string {
  if (reason.includes("same Notion page hash")) return "same Notion page hash as an imported database row page";
  if (reason.includes("same cleaned title and body")) return "same normalized title plus cleaned Markdown body hash";
  if (reason.includes("standalone Notion database wrapper")) return "standalone database-wrapper page redirected to the canonical database";
  return reason;
}

function summarizeEmptyStandalonePages(pages: ImportReportPageDetail[]): ImportReportGroupedSummary[] {
  const groups = new Map<string, ImportReportGroupedSummary>();
  for (const page of pages) {
    const name = page.title.trim() || "Untitled";
    const key = `${name}\0${page.reason}`;
    const group = groups.get(key) ?? {
      name,
      count: 0,
      rule: "cleaned Markdown body is empty; page is not imported",
      reason: page.reason,
      target: "",
      examples: []
    };
    group.count += 1;
    pushExample(group.examples, basename(page.source));
    pushExampleTarget(group, page.target ?? "");
    groups.set(key, group);
  }
  return sortGroupedSummaries(groups);
}

function summarizeEmptyRowPages(rows: ImportReportRowDetail[]): ImportReportGroupedSummary[] {
  const groups = new Map<string, ImportReportGroupedSummary>();
  for (const row of rows) {
    const key = `${row.database}\0${row.reason}`;
    const group = groups.get(key) ?? {
      name: row.database || "Unknown database",
      count: 0,
      rule: row.source
        ? "cleaned row-page body and meaningful user fields are empty"
        : "no row-page source and meaningful user fields are empty",
      reason: row.reason,
      target: "",
      examples: []
    };
    group.count += 1;
    pushExample(group.examples, row.title.trim() || row.rowId);
    pushExampleTarget(group, row.target);
    groups.set(key, group);
  }
  return sortGroupedSummaries(groups);
}

function pushExample(examples: string[], value: string): void {
  if (!value || examples.includes(value) || examples.length >= 5) return;
  examples.push(value);
}

function pushExampleTarget(group: ImportReportGroupedSummary, target: string): void {
  if (!target) return;
  const targets = group.target ? group.target.split("<br>") : [];
  if (targets.includes(target) || targets.length >= 5) return;
  targets.push(target);
  group.target = targets.join("<br>");
}

function sortGroupedSummaries(groups: Map<string, ImportReportGroupedSummary>): ImportReportGroupedSummary[] {
  return [...groups.values()].sort((a, b) =>
    b.count - a.count ||
    a.name.localeCompare(b.name) ||
    a.reason.localeCompare(b.reason)
  );
}

function buildDuplicateRowSummaries(
  dbPlans: Array<{
    id: string;
    name: string;
    fields: Array<{ id: string; name: string; system?: boolean }>;
    records: Array<Record<string, string>>;
  }>
): ImportReportDuplicateRowSummary[] {
  const summaries: ImportReportDuplicateRowSummary[] = [];
  for (const dbPlan of dbPlans) {
    const fields = dbPlan.fields.filter((field) => !field.system);
    if (fields.length === 0) continue;
    const groups = new Map<string, {
      name: string;
      sampleValues: string;
      rowIds: string[];
      count: number;
    }>();
    for (const record of dbPlan.records) {
      const fingerprintValues = fields.map((field) => normalizeDuplicateRowCell(record[field.id] ?? ""));
      const displayValues = fields.map((field) => displayDuplicateRowCell(record[field.id] ?? ""));
      const hasMeaningfulValue = fields.some((field, index) => {
        const value = fingerprintValues[index];
        if (!value) return false;
        return field.id !== "title" || !isGeneratedUntitled(value);
      });
      if (!hasMeaningfulValue) continue;
      const key = fields.map((field, index) => `${field.id}=${fingerprintValues[index]}`).join("\x1F");
      const sampleValues = fields
        .map((field, index) => displayValues[index] ? `${field.name}: ${truncateReportValue(displayValues[index])}` : "")
        .filter(Boolean)
        .slice(0, 5)
        .join("; ");
      const title = displayDuplicateRowCell(record.title ?? "");
      const name = title && !isGeneratedUntitled(normalizeDuplicateRowCell(title)) ? title : sampleValues || "Untitled";
      const group = groups.get(key) ?? { name, sampleValues, rowIds: [], count: 0 };
      group.count += 1;
      if (group.rowIds.length < 5) group.rowIds.push(record.id ?? "");
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.count <= 1) continue;
      summaries.push({
        database: dbPlan.name,
        databaseId: dbPlan.id,
        name: group.name,
        count: group.count,
        sampleRowIds: group.rowIds.filter(Boolean),
        sampleValues: group.sampleValues
      });
    }
  }
  return summaries.sort((a, b) =>
    b.count - a.count ||
    a.database.localeCompare(b.database) ||
    a.name.localeCompare(b.name)
  );
}

function normalizeDuplicateRowCell(value: string): string {
  return value
    .replace(/\u200B/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function displayDuplicateRowCell(value: string): string {
  return value
    .replace(/\u200B/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneratedUntitled(value: string): boolean {
  return value === "untitled";
}

function truncateReportValue(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildImportReviewIssues(input: {
  now: string;
  dedupedPages: ImportReportPageDetail[];
  emptyStandalonePages: ImportReportPageDetail[];
  emptyRowPages: ImportReportRowDetail[];
}): DatabaseRecord[] {
  const rows: DatabaseRecord[] = [];
  let index = 1;
  const nextId = () => `issue_${String(index++).padStart(6, "0")}`;
  const push = (row: DatabaseRecord) => {
    rows.push({
      id: nextId(),
      created_time: input.now,
      updated_time: input.now,
      status: "Needs review",
      ...row
    });
  };

  for (const page of [...input.dedupedPages].sort((a, b) => a.title.localeCompare(b.title) || a.source.localeCompare(b.source))) {
    push({
      title: page.title || "Untitled",
      issue_type: "Deduped/redirected page",
      database: "",
      reason: page.reason,
      source_file: basename(page.source),
      source_path: page.source,
      target_path: page.target ?? "",
      page_id: page.id ?? "",
      database_id: "",
      row_id: "",
      notion_hash: page.hash ?? ""
    });
  }

  for (const page of [...input.emptyStandalonePages].sort((a, b) => a.title.localeCompare(b.title) || a.source.localeCompare(b.source))) {
    push({
      title: page.title || "Untitled",
      issue_type: "Empty standalone page",
      database: "",
      reason: page.reason,
      source_file: basename(page.source),
      source_path: page.source,
      target_path: page.target ?? "",
      page_id: page.id ?? "",
      database_id: "",
      row_id: "",
      notion_hash: page.hash ?? ""
    });
  }

  for (const row of [...input.emptyRowPages].sort((a, b) =>
    a.database.localeCompare(b.database) ||
    a.title.localeCompare(b.title) ||
    a.rowId.localeCompare(b.rowId)
  )) {
    push({
      title: row.title || "Untitled",
      issue_type: "Empty row page body",
      database: row.database,
      reason: row.reason,
      source_file: row.source ? basename(row.source) : "",
      source_path: row.source,
      target_path: row.target,
      page_id: "",
      database_id: row.databaseId,
      row_id: row.rowId,
      notion_hash: row.hash ?? notionFileHash(row.source) ?? ""
    });
  }

  return rows;
}

async function writeImportReviewDatabase(
  target: string,
  now: string,
  issues: DatabaseRecord[],
  counts: Pick<ImportReviewArtifacts, "dedupedPages" | "emptyStandalonePages" | "emptyRowPages">
): Promise<ImportReviewArtifacts> {
  const fields: FieldSchema[] = [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "status", name: "Status", type: "select", options: [
      { id: "needs_review", name: "Needs review", color: "yellow" },
      { id: "accepted", name: "Accepted", color: "green" },
      { id: "investigate", name: "Investigate", color: "red" },
      { id: "fixed", name: "Fixed", color: "blue" }
    ] },
    { id: "issue_type", name: "Type", type: "select", options: [
      { id: "deduped_page", name: "Deduped/redirected page", color: "purple" },
      { id: "empty_standalone_page", name: "Skipped blank page", color: "gray" },
      { id: "empty_row_page_body", name: "Skipped blank row", color: "orange" }
    ] },
    { id: "database", name: "Database", type: "text" },
    { id: "reason", name: "Reason", type: "text" },
    { id: "source_file", name: "Source file", type: "text" },
    { id: "target_path", name: "Target path", type: "text" },
    { id: "source_path", name: "Source path", type: "text" },
    { id: "page_id", name: "Page ID", type: "text", hidden: true },
    { id: "database_id", name: "Database ID", type: "text", hidden: true },
    { id: "row_id", name: "Row ID", type: "text", hidden: true },
    { id: "notion_hash", name: "Notion hash", type: "text", hidden: true },
    { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
  ];
  const visibleFieldIds = ["status", "issue_type", "title", "database", "reason", "source_file", "target_path"];
  const view: TableView = {
    id: DEFAULT_VIEW_ID,
    databaseId: IMPORT_REVIEW_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: visibleFieldIds,
    sorts: [
      { fieldId: "status", direction: "asc" },
      { fieldId: "issue_type", direction: "asc" },
      { fieldId: "database", direction: "asc" }
    ],
    filters: [],
    columnWidths: {
      title: 260,
      database: 180,
      reason: 300,
      source_file: 240,
      target_path: 360
    },
    pageSize: 50
  };
  const databasePath = databaseWorkspacePathWithName(IMPORT_REVIEW_DATABASE_ID, false, IMPORT_REVIEW_DATABASE_NAME);
  await writeJson(join(target, databasePath, "schema.json"), {
    id: IMPORT_REVIEW_DATABASE_ID,
    name: IMPORT_REVIEW_DATABASE_NAME,
    created_time: now,
    updated_time: now,
    fields,
    defaultViewId: DEFAULT_VIEW_ID,
    icon: formatEmojiIcon("🔎") ?? ""
  });
  await writeText(join(target, databasePath, "data.csv"), rowsToCsv(fields.map((field) => field.id), issues));
  await writeJson(join(target, databasePath, "views", `${DEFAULT_VIEW_ID}.json`), view);
  return {
    databaseId: IMPORT_REVIEW_DATABASE_ID,
    databaseName: IMPORT_REVIEW_DATABASE_NAME,
    databasePath,
    totalIssues: issues.length,
    ...counts
  };
}

// ── emission ──────────────────────────────────────────────────────────

interface ChoiceFull extends DatabaseChoice { }

async function emitWorkspace(
  target: string,
  sources: string[],
  inventory: Inventory,
  choice: ChoiceFull,
  onProgress?: NotionImportProgressCallback,
  options?: NotionImportOptions,
  earlyTimings: NotionImportEarlyTimings = {
    startedAt: Date.now(),
    prepareTargetMs: 0,
    resolveSourcesMs: 0,
    indexSourcesMs: 0,
    selectDatabasesMs: 0
  }
): Promise<{ reportPageId: string; report: NotionImportReportSummary }> {
  const emitStartedAt = Date.now();
  const importOptions = normalizeImportOptions(options);
  await fileService.remove(target, { recursive: true, force: true });
  await fileService.ensureDir(target);
  await fileService.ensureDir(join(target, "databases", "user"));
  await fileService.ensureDir(join(target, "databases", "system"));
  await fileService.ensureDir(join(target, "attachments"));

  const now = new Date().toISOString();
  const pageIdByHash = new Map<string, string>();
  const databaseIdByHash = new Map<string, string>();
  for (const hash of inventory.pagesByHash.keys()) pageIdByHash.set(hash, shortId("pg"));
  for (const hash of choice.kept) databaseIdByHash.set(hash, shortId("db"));

  // Pass A: plan all writes (read bodies, allocate row filenames, build
  // record structures) so we know enough to construct a complete
  // rewrites map BEFORE any markdown body actually hits disk.
  interface PagePlan {
    id: string;
    hash: string;
    title: string;
    path: string[];
    sourcePath: string;
    /** Workspace-relative path to the page's icon image once the
     *  attachment has been emitted, or undefined. */
    icon?: string;
    /** Workspace-relative path or remote URL for the page cover image. */
    cover?: string;
    coverOffset?: number;
  }
  interface RowPlan {
    rowId: string;
    fileName: string;
    title: string;
    hash?: string;
    sourcePath: string | undefined;
    icon?: string;
    cover?: string;
    coverOffset?: number;
    parsed?: ParsedNotionHtmlPage;
    hasBody?: boolean;
    sourceSize?: number;
  }
  interface DbPlan {
    id: string;
    name: string;
    /** Name before Lotion adds a short Notion-id suffix to avoid a path collision. */
    originalName?: string;
    path?: string[];
    csvPath?: string;
    originalCsvAttachment?: string;
    /** Notion hash from a missing page/database link when we synthesize
     *  an empty DB placeholder for an export that omitted the file. */
    sourceHash?: string;
    /** Workspace-relative path to the DB's icon image (from the
     *  standalone HTML "database page" if it was skipped as phantom),
     *  or undefined. */
    icon?: string;
    /** Workspace-relative path or remote URL for the database cover image. */
    cover?: string;
    coverOffset?: number;
    fields: Array<{ id: string; name: string; type: string; system?: boolean; hidden?: boolean; options?: SelectOption[] }>;
    /** Parsed CSV/inline rows before the optional blank-row filter. */
    sourceRows: number;
    records: Array<Record<string, string>>;
    view: {
      id: string;
      databaseId: string;
      name: string;
      type: string;
      visibleFieldIds: string[];
      fieldOrder: string[];
      wrapFieldIds?: string[];
      sorts: unknown[];
      filters: unknown[];
    };
    rowPlans: RowPlan[];
    includeInManifest?: boolean;
  }

  // Set of titles for kept databases — used below to skip top-level
  // pages that are just a Notion "standalone database page" duplicate.
  const keptDbTitles = new Set<string>();
  for (const dbHash of choice.kept) {
    const t = inventory.databasesByHash.get(dbHash)?.title;
    if (t) keptDbTitles.add(t);
  }
  const keptDbHashes = new Set(choice.kept);
  const dbHashByCsvSourceAbs = new Map<string, string>();
  const rememberCsvSource = (csvPath: string, dbHash: string): void => {
    dbHashByCsvSourceAbs.set(normalizeAbs(csvPath), dbHash);
  };
  for (const dbHash of choice.kept) {
    const csvPath = inventory.databasesByHash.get(dbHash)?.csvPath;
    if (!csvPath) continue;
    rememberCsvSource(csvPath, dbHash);
    if (csvPath.endsWith("_all.csv")) {
      rememberCsvSource(csvPath.replace(/_all\.csv$/, ".csv"), dbHash);
    } else {
      rememberCsvSource(csvPath.replace(/\.csv$/, "_all.csv"), dbHash);
    }
  }
  const markdownWrapperTargetDbHash = (raw: string, sourcePath: string): string | undefined => {
    const csvTarget = markdownCsvWrapperTarget(raw);
    if (!csvTarget) return undefined;
    const resolved = normalizeAbs(resolve(dirname(sourcePath), csvTarget));
    const dbHash = dbHashByCsvSourceAbs.get(resolved);
    if (dbHash) return dbHash;
    const hash = notionFileHash(csvTarget);
    return hash && keptDbHashes.has(hash) ? hash : undefined;
  };
  const htmlWrapperTargetDbHash = (raw: string, sourcePath: string): string | undefined => {
    const csvTarget = htmlCsvWrapperTarget(raw);
    if (!csvTarget) return undefined;
    const resolved = normalizeAbs(resolve(dirname(sourcePath), csvTarget));
    const dbHash = dbHashByCsvSourceAbs.get(resolved);
    if (dbHash) return dbHash;
    const hash = notionFileHash(csvTarget);
    return hash && keptDbHashes.has(hash) ? hash : undefined;
  };
  const keptRowHashes = new Set<string>();
  if (importOptions.dedupeMarkdownFiles) {
    for (const row of inventory.rowsByKey.values()) {
      if (keptDbHashes.has(row.dbHash)) keptRowHashes.add(row.hash);
    }
  }

  // Build unique title fallbacks for old/odd exports where the
  // standalone database wrapper does not share the CSV/database hash.
  // These maps only keep unambiguous titles; duplicate titles must be
  // resolved by hash, never by display text.
  const dbHashByTitle = new Map<string, string>();
  const dbHashByRawTitle = new Map<string, string>();
  const ambiguousDbTitles = new Set<string>();
  const ambiguousDbRawTitles = new Set<string>();
  for (const dbHash of choice.kept) {
    const db = inventory.databasesByHash.get(dbHash);
    if (!db) continue;
    rememberUnique(dbHashByTitle, ambiguousDbTitles, db.title, dbHash);
    rememberUnique(dbHashByRawTitle, ambiguousDbRawTitles, db.rawTitle, dbHash);
  }
  const rowDbHashesByRowHash = new Map<string, Set<string>>();
  const rowDbHashBySourceAbs = new Map<string, string>();
  for (const row of inventory.rowsByKey.values()) {
    if (!keptDbHashes.has(row.dbHash)) continue;
    const set = rowDbHashesByRowHash.get(row.hash) ?? new Set<string>();
    set.add(row.dbHash);
    rowDbHashesByRowHash.set(row.hash, set);
    rowDbHashBySourceAbs.set(normalizeAbs(row.sourcePath), row.dbHash);
  }
  const linkedCollectionViewDbHashByViewHash = new Map<string, string>();
  let skippedKnownInlineCollectionViews = 0;
  const shouldSkipKnownCollectionView = (view: NotionCollectionView, parentSourcePath: string): boolean => {
    const hash = view.hash.toLowerCase();
    if (keptDbHashes.has(hash)) {
      linkedCollectionViewDbHashByViewHash.set(hash, hash);
      skippedKnownInlineCollectionViews += 1;
      return true;
    }

    const title = materialTitle(view.title);
    const titleDbHash = title
      ? dbHashByRawTitle.get(title) ?? dbHashByTitle.get(title)
      : undefined;

    const rows = view.rows ?? [];
    const rowHashes = new Set<string>(view.rowHashes ?? []);
    const rowHrefs = new Set<string>(view.rowHrefs ?? []);
    for (const row of rows) {
      if (row.hash) rowHashes.add(row.hash);
      if (row.href) rowHrefs.add(row.href);
    }
    if (rows.length === 0 && rowHashes.size === 0 && rowHrefs.size === 0) {
      if (!titleDbHash || !keptDbHashes.has(titleDbHash)) return false;
      linkedCollectionViewDbHashByViewHash.set(hash, titleDbHash);
      skippedKnownInlineCollectionViews += 1;
      return true;
    }
    const matchedDbHashes = new Set<string>();
    for (const href of rowHrefs) {
      const resolvedSource = resolveInlineRowSource(parentSourcePath, href);
      const sourceDbHash = resolvedSource ? rowDbHashBySourceAbs.get(normalizeAbs(resolvedSource)) : undefined;
      if (sourceDbHash) matchedDbHashes.add(sourceDbHash);
    }
    for (const rowHash of rowHashes) {
      for (const dbHash of rowDbHashesByRowHash.get(rowHash) ?? []) {
        matchedDbHashes.add(dbHash);
      }
    }
    if (matchedDbHashes.size > 0) {
      if (matchedDbHashes.size === 1) {
        linkedCollectionViewDbHashByViewHash.set(hash, Array.from(matchedDbHashes)[0]!);
      } else if (titleDbHash && matchedDbHashes.has(titleDbHash)) {
        linkedCollectionViewDbHashByViewHash.set(hash, titleDbHash);
      }
      skippedKnownInlineCollectionViews += 1;
      return true;
    }
    return false;
  };

  // Map of dbHash → workspace-relative icon path, populated when we
  // skip a phantom standalone-DB page that had an icon set.
  const dbIconByHash = new Map<string, string>();
  const dbCoverByHash = new Map<string, { cover: string; coverOffset?: number }>();

  // Map absolute source path → `attachments/<type>/<file>` for use
  // by both `resolveIcon` above and the standard link rewriter below.
  const attachmentRelByAbsSource = new Map<string, string>();
  const attachmentRelByBasename = new Map<string, string | null>();
  for (const att of inventory.attachments.values()) {
    const rel = workspaceAttachmentPath(att.fileName);
    for (const p of att.sourcePaths) {
      attachmentRelByAbsSource.set(normalizeAbs(p), rel);
      const key = basename(p).toLowerCase();
      const existing = attachmentRelByBasename.get(key);
      if (existing === undefined) attachmentRelByBasename.set(key, rel);
      else if (existing !== rel) attachmentRelByBasename.set(key, null);
    }
  }

  const resolveAttachmentByBasename = (decodedPath: string): string | undefined => {
    const rel = attachmentRelByBasename.get(basename(decodedPath).toLowerCase());
    return rel ?? undefined;
  };

  // Resolve a Notion-extracted `iconSrc` (relative path inside the
  // export, percent-encoded) against `sourceDir` and look up the
  // resulting absolute path in the attachments rewrite map. Returns
  // the workspace-relative attachment path when the attachment was
  // indexed. If Notion moved a link-page icon between folders, fall
  // back to a unique attachment basename.
  const resolveIcon = (iconSrc: string, sourceDir: string): string | undefined => {
    if (!iconSrc) return undefined;
    if (/^https?:\/\//i.test(iconSrc)) return iconSrc;
    if (/^[a-z][a-z0-9+.-]*:/i.test(iconSrc)) return undefined;
    let decoded: string;
    try {
      decoded = decodeURIComponent(iconSrc);
    } catch {
      return undefined;
    }
    const abs = normalizeAbs(resolve(sourceDir, decoded));
    return attachmentRelByAbsSource.get(abs) ?? resolveAttachmentByBasename(decoded);
  };

  const resolveParsedIcon = (parsed: ParsedNotionHtmlPage, sourceDir: string): string | undefined =>
    resolveIcon(parsed.iconSrc, sourceDir) ?? formatEmojiIcon(parsed.iconEmoji);
  const resolveParsedCover = (parsed: ParsedNotionHtmlPage, sourceDir: string): { cover?: string; coverOffset?: number } => ({
    cover: resolveIcon(parsed.coverSrc, sourceDir),
    coverOffset: parsed.coverOffset
  });
  const markdownIconByPath = new Map<string, string | undefined>();
  const resolveMarkdownIcon = async (sourcePath: string): Promise<string | undefined> => {
    if (!isMarkdownSource(sourcePath)) return undefined;
    if (markdownIconByPath.has(sourcePath)) return markdownIconByPath.get(sourcePath);
    const raw = await fileService.readText(sourcePath);
    const parsed = extractMarkdownExportIcon(raw);
    const icon = parsed
      ? resolveIcon(parsed.iconSrc, dirname(sourcePath)) ?? formatEmojiIcon(parsed.iconEmoji)
      : undefined;
    markdownIconByPath.set(sourcePath, icon);
    return icon;
  };

  const originalSourceArchive = importOptions.includeOriginalHtml
    ? await buildOriginalSourceArchive(sources)
    : { files: [], relByAbs: new Map<string, string>(), dedupedFiles: 0, conflictFiles: 0 };
  if (importOptions.includeOriginalHtml) {
    console.log(
      `[lotion main] notion import original archive files=${originalSourceArchive.files.length} ` +
      `deduped=${originalSourceArchive.dedupedFiles} conflicts=${originalSourceArchive.conflictFiles}`
    );
  }
  const originalHtmlAttachmentForSource = (sourcePath: string | undefined): string => {
    if (!importOptions.includeOriginalHtml || !sourcePath || !isHtmlSource(sourcePath)) return "";
    if (!fileService.exists(sourcePath)) return "";
    return originalSourceArchive.relByAbs.get(normalizeAbs(sourcePath)) ?? "";
  };
  const originalCsvAttachmentForSource = (sourcePath: string | undefined): string => {
    if (!importOptions.includeOriginalHtml || !sourcePath) return "";
    if (!fileService.exists(sourcePath) || extname(sourcePath).toLowerCase() !== ".csv") return "";
    return originalSourceArchive.relByAbs.get(normalizeAbs(sourcePath)) ?? "";
  };

  const linkToPageHints = await collectLinkToPageHints(inventory, resolveIcon);
  const inlineDatabases = new Map<string, SyntheticEmptyDatabase>();

  // Populated when phantom standalone-DB pages get skipped — links in
  // other pages that point at the phantom's HTML file should resolve
  // to the database view instead of breaking. Keyed by source abs
  // path → DB hash; pass B turns that into the workspace path.
  const phantomPageRedirects = new Map<string, string>();

  let pagePlans: PagePlan[] = [];
  const pageDedupeTargets = new Map<string, string>();
  const duplicatePageRedirectBySource = new Map<string, string>();
  const duplicatePageRedirectByHash = new Map<string, string>();
  const dedupedPageDetails: ImportReportPageDetail[] = [];
  const preSkippedEmptyStandalonePageDetails: ImportReportPageDetail[] = [];
  let skippedDuplicateStandalonePages = 0;
  for (const [hash, entry] of inventory.pagesByHash) {
    if (importOptions.dedupeMarkdownFiles && keptRowHashes.has(hash)) {
      pageIdByHash.delete(hash);
      dedupedPageDetails.push({
        title: entry.title || "Untitled",
        hash,
        source: entry.sourcePath,
        reason: "same Notion page hash as an imported database row page"
      });
      skippedDuplicateStandalonePages += 1;
      continue;
    }
    const id = pageIdByHash.get(hash)!;
    let icon: string | undefined;
    let cover: string | undefined;
    let coverOffset: number | undefined;
    let title = entry.title || "Untitled";
    let rawHtmlForDedupe: string | undefined;
    if (isHtmlSource(entry.sourcePath)) {
      // Pass A: metadata only. The body→markdown conversion is
      // deferred to pass C where the link-resolver (built from the
      // rewrites map) is available — so links get rewritten at the
      // DOM level by the converter rather than after-the-fact with
      // a markdown-level regex.
      const headerRead = await readNotionHtmlHeader(entry.sourcePath);
      const hasInlineCollection = htmlMentionsNotionCollection(headerRead.sampleHtml);
      const rawHtmlForCollections = hasInlineCollection
        ? (headerRead.bytesRead >= headerRead.fileSize
            ? headerRead.sampleHtml
            : await fileService.readText(entry.sourcePath))
        : undefined;
      const parsed = hasInlineCollection
        ? parseNotionHtml(rawHtmlForCollections ?? headerRead.sampleHtml, {
            convertBody: false,
            collectCollectionRows: false
          })
        : parseNotionHtmlMetadata(headerRead.headerHtml);
      if (hasInlineCollection) {
        collectInlineCollectionViews(
          parsed,
          inlineDatabases,
          inventory,
          title,
          entry.sourcePath,
          sources,
          shouldSkipKnownCollectionView
        );
      }
      title = parsed.title || entry.title || "Untitled";
      icon = resolveParsedIcon(parsed, dirname(entry.sourcePath)) ?? linkToPageHints.byHash.get(hash)?.icon;
      const parsedCover = resolveParsedCover(parsed, dirname(entry.sourcePath));
      cover = parsedCover.cover;
      coverOffset = parsedCover.coverOffset;
      const directDatabaseHash = databaseIdByHash.has(hash) ? hash : undefined;
      const csvWrapperTargetHash = htmlWrapperTargetDbHash(headerRead.sampleHtml, entry.sourcePath);
      const metadataTargetHash = directDatabaseHash ?? csvWrapperTargetHash;
      if (metadataTargetHash) {
        if (icon) dbIconByHash.set(metadataTargetHash, icon);
        if (cover) dbCoverByHash.set(metadataTargetHash, { cover, coverOffset });
      }
      // Notion's HTML export emits a standalone page for every inline
      // database — these pages are identical to the database itself
      // and showed up in the sidebar as "phantom" pages. Skip the page
      // entirely when its body is just the wrapper AND we already have
      // a database with the same title in the sidebar. We carry the
      // page's icon forward to the database so the DB sidebar entry
      // doesn't end up iconless.
      const targetHashForLink = directDatabaseHash
        ?? csvWrapperTargetHash
        ?? dbHashByRawTitle.get(entry.title)
        ?? dbHashByTitle.get(entry.title);
      if ((parsed.isCollectionWrapperOnly || csvWrapperTargetHash) && targetHashForLink) {
        if (icon) {
          dbIconByHash.set(targetHashForLink, icon);
        }
        if (cover) {
          dbCoverByHash.set(targetHashForLink, { cover, coverOffset });
        }
        // Cross-page links in other pages (e.g. the "数据库" index
        // page) point at the standalone DB HTML we're about to skip.
        // Register the source path → DB URL so the link resolver
        // routes those links to the canonical database folder instead of
        // leaving them as broken URL-encoded `.html` refs.
        phantomPageRedirects.set(normalizeAbs(entry.sourcePath), targetHashForLink);
        dedupedPageDetails.push({
          title,
          hash,
          source: entry.sourcePath,
          targetHash: targetHashForLink,
          reason: "standalone Notion database wrapper redirected to the imported database"
        });
        pageIdByHash.delete(hash);
        continue;
      }
      const bodyHint = bodyContentHint(headerRead.sampleHtml);
      const fullSampleHasNoBody =
        headerRead.bytesRead >= headerRead.fileSize &&
        !hasNotionPageBodyContent(headerRead.sampleHtml);
      if (importOptions.skipEmptyRowsAndPages && (bodyHint === false || fullSampleHasNoBody)) {
        pageIdByHash.delete(hash);
        preSkippedEmptyStandalonePageDetails.push({
          title: title.trim() || "Untitled",
          id,
          hash,
          source: entry.sourcePath,
          target: pageBodyPath(id, title),
          reason: "blank standalone/nested page not imported: cleaned Markdown body is empty after removing Notion's exported title/property wrapper"
        });
        continue;
      }
      if (headerRead.bytesRead >= headerRead.fileSize) {
        rawHtmlForDedupe = headerRead.sampleHtml;
      }
    } else {
      const rawMarkdown = await fileService.readText(entry.sourcePath);
      const parsedIcon = extractMarkdownExportIcon(rawMarkdown);
      icon = parsedIcon
        ? resolveIcon(parsedIcon.iconSrc, dirname(entry.sourcePath)) ?? formatEmojiIcon(parsedIcon.iconEmoji)
        : linkToPageHints.byHash.get(hash)?.icon;
      const targetHashForLink = markdownWrapperTargetDbHash(rawMarkdown, entry.sourcePath);
      if (targetHashForLink) {
        if (icon) {
          dbIconByHash.set(targetHashForLink, icon);
        }
        phantomPageRedirects.set(normalizeAbs(entry.sourcePath), targetHashForLink);
        dedupedPageDetails.push({
          title,
          hash,
          source: entry.sourcePath,
          targetHash: targetHashForLink,
          reason: "Markdown standalone database wrapper redirected to the imported database"
        });
        pageIdByHash.delete(hash);
        continue;
      }
    }
    if (importOptions.dedupeMarkdownFiles) {
      const dedupeKey = isHtmlSource(entry.sourcePath) && rawHtmlForDedupe === undefined
        ? null
        : await standalonePageDedupeKey(entry.sourcePath, title, rawHtmlForDedupe);
      if (dedupeKey) {
        const existing = pageDedupeTargets.get(dedupeKey);
        if (existing) {
          pageIdByHash.delete(hash);
          duplicatePageRedirectBySource.set(entry.sourcePath, existing);
          duplicatePageRedirectByHash.set(hash, existing);
          dedupedPageDetails.push({
            title,
            hash,
            source: entry.sourcePath,
            target: existing,
            reason: "same cleaned title and body as an earlier standalone page"
          });
          skippedDuplicateStandalonePages += 1;
          continue;
        }
        pageDedupeTargets.set(dedupeKey, pageBodyPath(id, title));
      }
    }
    pagePlans.push({
      id,
      hash,
      title,
      path: pagePathFromSource(entry.sourcePath, sources, title),
      sourcePath: entry.sourcePath,
      icon,
      cover,
      coverOffset
    });
  }
  if (skippedDuplicateStandalonePages > 0) {
    console.log(
      `[lotion main] notion import skipped duplicate standalone pages count=${skippedDuplicateStandalonePages}`
    );
  }

  const inlineRowHashes = new Set<string>();
  for (const db of inlineDatabases.values()) {
    for (const row of db.rows || []) {
      if (row.hash) inlineRowHashes.add(row.hash);
    }
  }
  if (inlineRowHashes.size > 0) {
    pagePlans = pagePlans.filter((plan) => {
      if (!inlineRowHashes.has(plan.hash)) return true;
      pageIdByHash.delete(plan.hash);
      dedupedPageDetails.push({
        title: plan.title || "Untitled",
        hash: plan.hash,
        source: plan.sourcePath,
        reason: "inline Notion database row redirected to its imported inline database"
      });
      return false;
    });
  }

  const syntheticEmptyDatabases = collectSyntheticEmptyDatabases(linkToPageHints.bySource, inventory, keptDbTitles, sources);
  for (const [hash, db] of syntheticEmptyDatabases) {
    if (databaseIdByHash.has(hash)) continue;
    databaseIdByHash.set(hash, shortId("db"));
    keptDbTitles.add(db.title);
    if (!dbHashByTitle.has(db.title)) dbHashByTitle.set(db.title, hash);
    if (db.icon) dbIconByHash.set(hash, db.icon);
  }

  // Count HTML row files across all kept DBs up-front so the progress
  // bar has a deterministic `total`. Parsing each HTML is the slowest
  // phase of the import (≈30 ms per file × ~5,000 files = ~2.5 min).
  let parsedRowsTotal = 0;
  for (const hash of choice.kept) {
    for (const row of inventory.rowsByKey.values()) {
      if (row.dbHash === hash && row.sourcePath.endsWith(".html")) parsedRowsTotal += 1;
    }
  }
  const tParseRows = Date.now();
  let parsedRowsDone = 0;
  onProgress?.({ phase: "parsing", current: 0, total: parsedRowsTotal, message: "Parsing row HTMLs" });
  console.log(`[lotion main] notion import row metadata start rows=${parsedRowsTotal} ${formatImportMemory()}`);

  const dbPlans: DbPlan[] = [];
  let plannedDatabasesDone = 0;
  for (const [hash, db] of inventory.databasesByHash) {
    if (!databaseIdByHash.has(hash)) continue;
    plannedDatabasesDone += 1;
    if (plannedDatabasesDone === 1 || plannedDatabasesDone % 25 === 0) {
      console.log(
        `[lotion main] notion import row metadata db=${plannedDatabasesDone}/${databaseIdByHash.size} ` +
        `rows=${parsedRowsDone}/${parsedRowsTotal} current=${db.title} ${formatImportMemory()}`
      );
    }
    const dbId = databaseIdByHash.get(hash)!;

    const csvRaw = (await fileService.readText(db.csvPath)).trim();
    const grid = parseCsv(csvRaw);
    if (grid.length === 0) continue;
    const notionHeaders = grid[0];
    const notionRecords = grid.slice(1).map((cells) =>
      Object.fromEntries(notionHeaders.map((h, i) => [h, cells[i] ?? ""]))
    );
    const [notionTitleHeader, ...notionOtherHeaders] = notionHeaders;
    const hasNotionTitleColumn = notionTitleHeader.trim().length > 0;
    const originalCsvAttachment = originalCsvAttachmentForSource(db.csvPath);

    const rowsForDb = Array.from(inventory.rowsByKey.values()).filter((r) => r.dbHash === hash);

    // Parse every HTML row file up-front so we can use its real title
    // (the `<h1 class="page-title">` preserves `/`, `:` etc. that
    // Notion's filename sanitiser replaces with spaces) and its
    // property table — both are needed to match CSV rows reliably.
    // Done BEFORE fields[] is built so we can use the HTML-declared
    // property types when assembling the schema.
    // Metadata-only parse (convertBody=false). Pass A only needs the
    // properties + title + propertyTypes from each row to match against
    // the CSV. The body→markdown conversion happens in pass C where
    // we have a working link-resolver built from the rewrites map.
    const parsedByPath = new Map<string, ParsedNotionHtmlPage>();
    const bodyHintByPath = new Map<string, boolean | undefined>();
    const sourceSizeByPath = new Map<string, number>();
    for (const row of rowsForDb) {
      if (row.sourcePath.endsWith(".html")) {
        const tRow = Date.now();
        const headerRead = await readNotionHtmlHeader(row.sourcePath);
        const hasInlineCollection = htmlMentionsNotionCollection(headerRead.sampleHtml);
        const parsed = hasInlineCollection
          ? parseNotionHtml(
              headerRead.bytesRead >= headerRead.fileSize
                ? headerRead.sampleHtml
                : await fileService.readText(row.sourcePath),
              { convertBody: false, collectCollectionRows: false }
            )
          : parseNotionHtmlMetadata(headerRead.headerHtml);
        if (hasInlineCollection) {
          collectInlineCollectionViews(
            parsed,
            inlineDatabases,
            inventory,
            parsed.title || row.title,
            row.sourcePath,
            sources,
            shouldSkipKnownCollectionView
          );
        }
        parsedByPath.set(row.sourcePath, parsed);
        bodyHintByPath.set(row.sourcePath, bodyContentHint(headerRead.sampleHtml));
        sourceSizeByPath.set(row.sourcePath, headerRead.fileSize);
        logSlowImportHtml(hasInlineCollection ? "metadata+collections" : "metadata", row.sourcePath, headerRead.fileSize, Date.now() - tRow);
        parsedRowsDone += 1;
        if (parsedRowsDone % 500 === 0) {
          console.log(
            `[lotion main] notion import row metadata rows=${parsedRowsDone}/${parsedRowsTotal} ` +
            `currentDb=${db.title} ${formatImportMemory()}`
          );
        }
        if (parsedRowsDone % 100 === 0) {
          onProgress?.({ phase: "parsing", current: parsedRowsDone, total: parsedRowsTotal, message: "Parsing row HTMLs" });
        }
      }
    }

    // Collapse type info across all parsed rows: any row that declares
    // a type for a header wins (first non-empty). All rows for the same
    // DB should agree, but the union is defensive.
    const notionTypeByHeader = new Map<string, string>();
    for (const parsed of parsedByPath.values()) {
      for (const [k, t] of Object.entries(parsed.propertyTypes)) {
        if (!notionTypeByHeader.has(k) && t) notionTypeByHeader.set(k, t);
      }
    }
    const effectiveNotionTypeByHeader = new Map(notionTypeByHeader);
    for (const header of notionOtherHeaders) {
      if (effectiveNotionTypeByHeader.has(header)) continue;
      const inferredType = inferNotionTypeFromCsv(header, notionRecords);
      if (inferredType) effectiveNotionTypeByHeader.set(header, inferredType);
    }

    const systemTimeHeaderByFieldId = chooseSystemTimeHeaders(notionOtherHeaders, effectiveNotionTypeByHeader);
    const systemTimeFieldByHeader = new Map(
      Array.from(systemTimeHeaderByFieldId.entries()).map(([fieldId, header]) => [header, fieldId])
    );

    const fields: DbPlan["fields"] = [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true, hidden: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true, hidden: true },
      { id: "title", name: notionTitleHeader || "Title", type: "text" },
      { id: ROW_ICON_FIELD_ID, name: "Row icon", type: "text", system: true, hidden: true },
      { id: ROW_COVER_FIELD_ID, name: "Cover", type: "text", system: true, hidden: true },
      { id: ROW_COVER_OFFSET_FIELD_ID, name: "Cover offset", type: "number", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "page_full_width", name: "Full width", type: "checkbox", system: true, hidden: true }
    ];
    const userFieldIds: string[] = [];
    if (importOptions.includeOriginalHtml) {
      fields.push({ id: ORIGINAL_NOTION_HTML_FIELD_ID, name: ORIGINAL_NOTION_HTML_FIELD_NAME, type: "url" });
      userFieldIds.push(ORIGINAL_NOTION_HTML_FIELD_ID);
      if (originalCsvAttachment) {
        fields.push({ id: ORIGINAL_NOTION_CSV_FIELD_ID, name: ORIGINAL_NOTION_CSV_FIELD_NAME, type: "url" });
        userFieldIds.push(ORIGINAL_NOTION_CSV_FIELD_ID);
      }
    }
    // Map<originalCsvHeader, fieldId>, so the record-builder later can
    // look up the right field even when the user's column id had to
    // be made unique. Notion CSV properties are user data, so every
    // exported column stays as its own field; canonical Notion created
    // / last-edited values are additionally copied into Lotion's hidden
    // system timestamps below.
    const fieldIdByCsvHeader = new Map<string, string>();
    for (const header of notionOtherHeaders) {
      const safeName = header;
      const fieldId = uniqueFieldId(safeName, fields);
      const notionType = effectiveNotionTypeByHeader.get(header);
      const lotionType = notionTypeToLotion(notionType);
      fields.push({
        id: fieldId,
        name: safeName,
        type: lotionType,
        options: inferNotionOptions(header, notionType, notionRecords, parsedByPath)
      });
      fieldIdByCsvHeader.set(header, fieldId);
      userFieldIds.push(fieldId);
    }
    const fieldById = new Map(fields.map((field) => [field.id, field]));

    // Primary index: title → row entries. Use the parsed `<h1>` when
    // available so "2023/08/29 …" in CSV matches the HTML body whose
    // filename has been sanitised to "2023 08 29 …". Normalise titles
    // on both sides (trim + collapse whitespace) — Notion's CSV
    // sometimes appends a trailing space that the `<h1>` doesn't have,
    // which previously broke matching and caused every CSV row to
    // appear twice in our import.
    const titleKey = (t: string): string => t.replace(/\s+/g, " ").trim();
    const rowMatchByTitle = new Map<string, RowEntry[]>();
    for (const row of rowsForDb) {
      const parsed = parsedByPath.get(row.sourcePath);
      const matchTitle = titleKey(parsed?.title || row.title);
      if (!matchTitle) continue;
      if (!rowMatchByTitle.has(matchTitle)) rowMatchByTitle.set(matchTitle, []);
      rowMatchByTitle.get(matchTitle)!.push(row);
    }

    // Fallback index: per (key,value) pair, list of HTML rows where that
    // pair appears. Used by `matchBySubset` below. Notion sometimes
    // exports CSVs whose title column is empty (e.g. a "diary" DB whose
    // visible title is empty and rows are differentiated only by their
    // 日期 / 周数 / 天数 properties); the CSV's row may only have one or
    // two non-empty cells while the HTML row has six. A direct
    // fingerprint equality fails — but we can require every non-empty
    // CSV cell to *appear* in the HTML's properties, then intersect the
    // candidate sets to identify a unique HTML row.
    const SEP = "\x1F";
    const normVal = (v: string): string => v.replace(/\s+/g, " ").trim();
    const htmlIndexByKv = new Map<string, RowEntry[]>();
    for (const row of rowsForDb) {
      const parsed = parsedByPath.get(row.sourcePath);
      if (!parsed) continue;
      for (const [k, v] of Object.entries(parsed.properties)) {
        const trimmed = normVal(v);
        if (!trimmed) continue;
        const kv = `${k}${SEP}${trimmed}`;
        if (!htmlIndexByKv.has(kv)) htmlIndexByKv.set(kv, []);
        htmlIndexByKv.get(kv)!.push(row);
      }
    }

    const consumed = new Set<RowEntry>();
    const claim = (pool: RowEntry[] | undefined): RowEntry | undefined => {
      if (!pool) return undefined;
      for (const candidate of pool) {
        if (!consumed.has(candidate)) {
          consumed.add(candidate);
          return candidate;
        }
      }
      return undefined;
    };

    const scoreTitleCandidate = (candidate: RowEntry, notionRow: Record<string, string>): number => {
      const parsed = parsedByPath.get(candidate.sourcePath);
      if (!parsed) return 0;
      let score = 0;
      let compared = 0;
      for (const h of notionOtherHeaders) {
        const csvValue = normVal(notionRow[h] || "");
        if (!csvValue) continue;
        compared += 1;
        const htmlValue = normVal(parsed.properties[h] || "");
        if (!htmlValue) {
          score -= 2;
        } else if (notionImportValuesCompatible(csvValue, htmlValue)) {
          score += 4;
        } else {
          score -= 1;
        }
      }
      return compared === 0 ? 0 : score;
    };

    const claimBestTitleMatch = (pool: RowEntry[] | undefined, notionRow: Record<string, string>): RowEntry | undefined => {
      if (!pool) return undefined;
      let best: RowEntry | undefined;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const candidate of pool) {
        if (consumed.has(candidate)) continue;
        const score = scoreTitleCandidate(candidate, notionRow);
        if (!best || score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      if (!best) return undefined;
      consumed.add(best);
      return best;
    };

    // Subset match: every non-empty CSV cell must appear in some HTML
    // row's properties with the same value. Intersect candidate sets;
    // if exactly one row survives, claim it. Returns undefined when no
    // CSV cell is informative or no row matches all constraints.
    const matchBySubset = (notionRow: Record<string, string>): RowEntry | undefined => {
      let candidates: Set<RowEntry> | null = null;
      for (const h of notionOtherHeaders) {
        const v = normVal(notionRow[h] || "");
        if (!v) continue;
        const kv = `${h}${SEP}${v}`;
        const rows = htmlIndexByKv.get(kv);
        if (!rows) return undefined;
        if (candidates === null) {
          candidates = new Set(rows.filter((r) => !consumed.has(r)));
        } else {
          const next = new Set<RowEntry>();
          for (const r of candidates) if (rows.includes(r) && !consumed.has(r)) next.add(r);
          candidates = next;
        }
        if (candidates.size === 0) return undefined;
      }
      if (!candidates || candidates.size === 0) return undefined;
      const csvHasMaterialTitle = !!materialTitle(notionRow[notionTitleHeader]);
      if (!csvHasMaterialTitle) {
        const untitledCandidates = Array.from(candidates).filter((candidate) => {
          const parsed = parsedByPath.get(candidate.sourcePath);
          return !materialTitle(parsed?.title) && !materialTitle(candidate.title);
        });
        if (untitledCandidates.length > 0) candidates = new Set(untitledCandidates);
      }
      const first = candidates.values().next().value;
      if (!first) return undefined;
      consumed.add(first);
      return first;
    };

    const records: Array<Record<string, string>> = [];
    const rowPlans: RowPlan[] = [];
    const seenFiles = new Set<string>();
    const syntheticTitle = (candidate: string): string => candidate.trim() || "Untitled";

    const allocFileName = (title: string, rowId: string): string => {
      let fileName = pageMarkdownFileName(rowId, title);
      let suffix = 2;
      while (seenFiles.has(fileName)) {
        fileName = `${fileName.replace(/\.md$/i, "")}_${suffix}.md`;
        suffix += 1;
      }
      seenFiles.add(fileName);
      return fileName;
    };

    for (const notionRow of notionRecords) {
      const rowId = shortId("row");
      const csvTitle = notionRow[notionTitleHeader] || "";

      // 1. Try CSV title (normalised). 2. Property-subset match fallback.
      let match: RowEntry | undefined;
      const csvTitleKey = titleKey(csvTitle);
      if (csvTitleKey) match = claimBestTitleMatch(rowMatchByTitle.get(csvTitleKey), notionRow);
      if (!match) match = matchBySubset(notionRow);

      const parsed = match ? parsedByPath.get(match.sourcePath) : undefined;
      // If Notion exported a real title column, an empty title cell is
      // semantically untitled. Do not synthesize a name from Date/Status:
      // that makes blank row pages look like different user-authored
      // pages and breaks matching audits.
      const propFallback = (() => {
        const vals: string[] = [];
        for (const h of notionOtherHeaders) {
          const v = normVal(notionRow[h] || parsed?.properties[h] || "");
          if (!v) continue;
          vals.push(v);
          if (vals.length === 2) break;
        }
        return vals.join(" · ");
      })();
      const csvMaterialTitle = materialTitle(csvTitle);
      const parsedMaterialTitle = materialTitle(parsed?.title);
      const matchTitleNotUntitled = materialTitle(match?.title);
      let title =
        csvMaterialTitle ||
        parsedMaterialTitle ||
        matchTitleNotUntitled ||
        (hasNotionTitleColumn ? "Untitled" : propFallback || "Untitled");
      // Synthesised titles are only labels; row/page identity lives in
      // ids and links, so duplicate labels are fine.
      const isSynth = !csvMaterialTitle && !parsedMaterialTitle && !matchTitleNotUntitled;
      if (isSynth) title = syntheticTitle(title);
      const sourcePath = match?.sourcePath;
      const fileName = allocFileName(title, rowId);
      const rowIcon = parsed && sourcePath
        ? resolveParsedIcon(parsed, dirname(sourcePath))
        : sourcePath
          ? await resolveMarkdownIcon(sourcePath)
          : undefined;
      const parsedCover = parsed && sourcePath ? resolveParsedCover(parsed, dirname(sourcePath)) : {};

      const record: Record<string, string> = {
        id: rowId,
        created_time: now,
        updated_time: now,
        title,
        [ROW_ICON_FIELD_ID]: rowIcon ?? "",
        [ROW_COVER_FIELD_ID]: parsedCover.cover ?? "",
        [ROW_COVER_OFFSET_FIELD_ID]: parsedCover.coverOffset === undefined ? "" : String(parsedCover.coverOffset),
        page_file: fileName,
        page_full_width: "",
        [ORIGINAL_NOTION_HTML_FIELD_ID]: originalHtmlAttachmentForSource(sourcePath),
        [ORIGINAL_NOTION_CSV_FIELD_ID]: originalCsvAttachment
      };
      for (const header of notionOtherHeaders) {
        const fieldId = fieldIdByCsvHeader.get(header);
        if (!fieldId) continue;
        // CSV is canonical for the table view; fall back to HTML's
        // property if CSV cell is empty (Notion HTML preserves some
        // values, like multi-select colors and time strings, that the
        // CSV can drop).
        const csvVal = notionRow[header] ?? "";
        const parsedValue = parsed?.properties[header] ?? "";
        const fieldType = fieldById.get(fieldId)?.type;
        const rawValue = chooseImportedPropertyValue(csvVal, parsedValue, fieldType);
        const normalizedValue = normalizeImportedCellValue(fieldType, rawValue);
        record[fieldId] = normalizedValue;
        const systemTimeFieldId = systemTimeFieldByHeader.get(header);
        if (systemTimeFieldId && normalizedValue) record[systemTimeFieldId] = normalizedValue;
      }
      records.push(record);
      rowPlans.push({
        rowId,
        fileName,
        title,
        hash: match?.hash,
        sourcePath,
        icon: rowIcon,
        cover: parsedCover.cover,
        coverOffset: parsedCover.coverOffset,
        parsed,
        hasBody: sourcePath ? bodyHintByPath.get(sourcePath) : undefined,
        sourceSize: sourcePath ? sourceSizeByPath.get(sourcePath) : undefined
      });
    }

    // Append HTML rows that no CSV row claimed — typically rows the
    // user filtered out of the visible view but still exported as
    // bodies. Without this, those rows would silently disappear.
    for (const row of rowsForDb) {
      if (consumed.has(row)) continue;
      const parsed = parsedByPath.get(row.sourcePath);
      const propFallback = parsed
        ? (() => {
            const vals: string[] = [];
            for (const h of notionOtherHeaders) {
              const v = normVal(parsed.properties[h] || "");
              if (!v) continue;
              vals.push(v);
              if (vals.length === 2) break;
            }
            return vals.join(" · ");
          })()
        : "";
      const parsedMaterialTitle = materialTitle(parsed?.title);
      const matchTitleNotUntitled = materialTitle(row.title);
      let title =
        parsedMaterialTitle ||
        matchTitleNotUntitled ||
        (hasNotionTitleColumn ? "Untitled" : propFallback || "Untitled");
      const isSynth = !parsedMaterialTitle && !matchTitleNotUntitled;
      if (isSynth) title = syntheticTitle(title);
      const rowId = shortId("row");
      const fileName = allocFileName(title, rowId);
      const rowIcon = parsed
        ? resolveParsedIcon(parsed, dirname(row.sourcePath))
        : await resolveMarkdownIcon(row.sourcePath);
      const parsedCover = parsed ? resolveParsedCover(parsed, dirname(row.sourcePath)) : {};

      const record: Record<string, string> = {
        id: rowId,
        created_time: now,
        updated_time: now,
        title,
        [ROW_ICON_FIELD_ID]: rowIcon ?? "",
        [ROW_COVER_FIELD_ID]: parsedCover.cover ?? "",
        [ROW_COVER_OFFSET_FIELD_ID]: parsedCover.coverOffset === undefined ? "" : String(parsedCover.coverOffset),
        page_file: fileName,
        page_full_width: "",
        [ORIGINAL_NOTION_HTML_FIELD_ID]: originalHtmlAttachmentForSource(row.sourcePath),
        [ORIGINAL_NOTION_CSV_FIELD_ID]: originalCsvAttachment
      };
      if (parsed) {
        for (const header of notionOtherHeaders) {
          const fieldId = fieldIdByCsvHeader.get(header);
          if (!fieldId) continue;
          const fieldType = fieldById.get(fieldId)?.type;
          const normalizedValue = normalizeImportedCellValue(fieldType, parsed.properties[header] ?? "");
          record[fieldId] = normalizedValue;
          const systemTimeFieldId = systemTimeFieldByHeader.get(header);
          if (systemTimeFieldId && normalizedValue) record[systemTimeFieldId] = normalizedValue;
        }
      }
      records.push(record);
      rowPlans.push({
        rowId,
        fileName,
        title,
        hash: row.hash,
        sourcePath: row.sourcePath,
        icon: rowIcon,
        cover: parsedCover.cover,
        coverOffset: parsedCover.coverOffset,
        parsed,
        hasBody: bodyHintByPath.get(row.sourcePath),
        sourceSize: sourceSizeByPath.get(row.sourcePath)
      });
    }

    const visibleFieldIds = orderVisibleFieldsByContentRichness(records, ["title", ...userFieldIds]);
    const view: DbPlan["view"] = {
      id: DEFAULT_VIEW_ID,
      databaseId: dbId,
      name: "All",
      type: "table",
      visibleFieldIds,
      fieldOrder: visibleFieldIds,
      wrapFieldIds: visibleFieldIds,
      sorts: [],
      filters: []
    };

    const dbCover = dbCoverByHash.get(hash);
    dbPlans.push({
      id: dbId,
      name: db.title,
      originalName: displayDatabaseName(db.rawTitle),
      path: db.path,
      csvPath: db.csvPath,
      originalCsvAttachment,
      sourceHash: hash,
      icon: dbIconByHash.get(hash),
      cover: dbCover?.cover,
      coverOffset: dbCover?.coverOffset,
      fields,
      sourceRows: records.length,
      records,
      view,
      rowPlans
    });
  }
  onProgress?.({ phase: "parsing", current: parsedRowsDone, total: parsedRowsTotal, message: "Parsed row HTML metadata" });
  console.log(`[lotion main] notion import parsed row metadata rows=${parsedRowsDone}/${parsedRowsTotal} elapsed=${formatDuration(Date.now() - tParseRows)}`);

  const lateInlineRowHashes = new Set<string>();
  for (const db of inlineDatabases.values()) {
    for (const row of db.rows || []) {
      if (row.hash) lateInlineRowHashes.add(row.hash);
    }
  }
  if (lateInlineRowHashes.size > 0) {
    pagePlans = pagePlans.filter((plan) => {
      if (!lateInlineRowHashes.has(plan.hash)) return true;
      pageIdByHash.delete(plan.hash);
      dedupedPageDetails.push({
        title: plan.title || "Untitled",
        hash: plan.hash,
        source: plan.sourcePath,
        reason: "inline Notion database row redirected to its imported inline database"
      });
      return false;
    });
  }

  for (const [hash] of inlineDatabases) {
    if (databaseIdByHash.has(hash)) continue;
    databaseIdByHash.set(hash, shortId("db"));
  }

  const buildEmptyDbPlan = (hash: string, db: SyntheticEmptyDatabase): DbPlan | null => {
    const dbId = databaseIdByHash.get(hash);
    if (!dbId) return null;
    const rawFieldNames = (db.fieldNames || []).map((name) => name.trim()).filter(Boolean);
    const titleName = rawFieldNames[0] || "Name";
    const fields: DbPlan["fields"] = [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: titleName, type: "text" },
      { id: ROW_ICON_FIELD_ID, name: "Row icon", type: "text", system: true, hidden: true },
      { id: ROW_COVER_FIELD_ID, name: "Cover", type: "text", system: true, hidden: true },
      { id: ROW_COVER_OFFSET_FIELD_ID, name: "Cover offset", type: "number", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "page_full_width", name: "Full width", type: "checkbox", system: true, hidden: true }
    ];
    const userFieldIds: string[] = [];
    if (importOptions.includeOriginalHtml) {
      fields.push({ id: ORIGINAL_NOTION_HTML_FIELD_ID, name: ORIGINAL_NOTION_HTML_FIELD_NAME, type: "url" });
      userFieldIds.push(ORIGINAL_NOTION_HTML_FIELD_ID);
    }
    const systemNames = new Set(fields.filter((field) => field.system).map((field) => field.name));
    for (const fieldName of rawFieldNames.slice(1)) {
      const safeName = systemNames.has(fieldName) ? `${fieldName} (Notion)` : fieldName;
      const fieldId = uniqueFieldId(safeName, fields);
      fields.push({ id: fieldId, name: safeName, type: "text" });
      userFieldIds.push(fieldId);
    }
    const visibleFieldIds = orderVisibleFieldsByContentRichness(
      [],
      rawFieldNames.length > 0
        ? ["title", ...userFieldIds]
        : ["title", "created_time", "updated_time"]
    );
    return {
      id: dbId,
      name: db.title,
      originalName: db.title,
      path: db.path,
      sourceHash: hash,
      icon: db.icon,
      fields,
      sourceRows: 0,
      records: [],
      view: {
        id: DEFAULT_VIEW_ID,
        databaseId: dbId,
        name: "All",
        type: "table",
        visibleFieldIds,
        fieldOrder: visibleFieldIds,
        wrapFieldIds: visibleFieldIds,
        sorts: [],
        filters: []
      },
      rowPlans: [],
      includeInManifest: db.includeInManifest
    };
  };

  const buildInlineDbPlan = (hash: string, db: SyntheticEmptyDatabase): DbPlan | null => {
    const dbId = databaseIdByHash.get(hash);
    if (!dbId) return null;
    const rawFieldNames = (db.fieldNames || []).map((name) => name.trim()).filter(Boolean);
    const titleName = rawFieldNames[0] || "Name";
    const fields: DbPlan["fields"] = [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: titleName, type: "text" },
      { id: ROW_ICON_FIELD_ID, name: "Row icon", type: "text", system: true, hidden: true },
      { id: ROW_COVER_FIELD_ID, name: "Cover", type: "text", system: true, hidden: true },
      { id: ROW_COVER_OFFSET_FIELD_ID, name: "Cover offset", type: "number", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "page_full_width", name: "Full width", type: "checkbox", system: true, hidden: true }
    ];
    const userFieldIds: string[] = [];
    if (importOptions.includeOriginalHtml) {
      fields.push({ id: ORIGINAL_NOTION_HTML_FIELD_ID, name: ORIGINAL_NOTION_HTML_FIELD_NAME, type: "url" });
      userFieldIds.push(ORIGINAL_NOTION_HTML_FIELD_ID);
    }
    const fieldIdByName = new Map<string, string>();
    for (const fieldName of rawFieldNames.slice(1)) {
      const fieldId = uniqueFieldId(fieldName, fields);
      fields.push({ id: fieldId, name: fieldName, type: "text" });
      fieldIdByName.set(fieldName, fieldId);
      userFieldIds.push(fieldId);
    }

    const records: Array<Record<string, string>> = [];
    const rowPlans: RowPlan[] = [];
    const rows = db.rows || [];
    for (const row of rows) {
      const rowId = shortId("row");
      const values = row.values || {};
      const propFallback = rawFieldNames
        .slice(1)
        .map((fieldName) => displayDuplicateRowCell(values[fieldName] ?? ""))
        .filter(Boolean)
        .slice(0, 2)
        .join(" · ");
      let title = materialTitle(values[titleName]) || materialTitle(row.title) || propFallback || "Untitled";
      const isSynth = !materialTitle(values[titleName]) && !materialTitle(row.title);
      if (isSynth) title = title.trim() || "Untitled";
      const fileName = pageMarkdownFileName(rowId, title);
      const record: Record<string, string> = {
        id: rowId,
        created_time: now,
        updated_time: now,
        title,
        [ROW_ICON_FIELD_ID]: "",
        [ROW_COVER_FIELD_ID]: "",
        [ROW_COVER_OFFSET_FIELD_ID]: "",
        page_file: fileName,
        page_full_width: "",
        [ORIGINAL_NOTION_HTML_FIELD_ID]: originalHtmlAttachmentForSource(row.sourcePath)
      };
      for (const [fieldName, fieldId] of fieldIdByName) {
        record[fieldId] = values[fieldName] ?? "";
      }
      records.push(record);
      rowPlans.push({
        rowId,
        fileName,
        title,
        hash: row.hash,
        sourcePath: row.sourcePath,
        hasBody: undefined,
        sourceSize: undefined
      });
    }

    const visibleFieldIds = orderVisibleFieldsByContentRichness(records, ["title", ...userFieldIds]);
    return {
      id: dbId,
      name: db.title,
      originalName: db.title,
      path: db.path,
      sourceHash: hash,
      icon: db.icon,
      fields,
      sourceRows: records.length,
      records,
      view: {
        id: DEFAULT_VIEW_ID,
        databaseId: dbId,
        name: "All",
        type: "table",
        visibleFieldIds,
        fieldOrder: visibleFieldIds,
        wrapFieldIds: visibleFieldIds,
        sorts: [],
        filters: []
      },
      rowPlans,
      includeInManifest: db.includeInManifest
    };
  };

  for (const [hash, db] of syntheticEmptyDatabases) {
    const plan = buildEmptyDbPlan(hash, db);
    if (plan) dbPlans.push(plan);
  }

  for (const [hash, db] of inlineDatabases) {
    if (syntheticEmptyDatabases.has(hash)) continue;
    if (inventory.databasesByHash.has(hash)) continue;
    const plan = db.rows && db.rows.length > 0
      ? buildInlineDbPlan(hash, db)
      : buildEmptyDbPlan(hash, db);
    if (plan) dbPlans.push(plan);
  }

  // Pass B: build the link-rewrite table. Notion's exports embed
  // links that point at the original folder structure (`<title> <hash>.csv`,
  // `<title> <hash>.md`, attachments by filename). We need to map every
  // such absolute source path to its post-import Lotion path.
  const rewrites = new Map<string, string>();
  const dbPlanById = new Map(dbPlans.map((plan) => [plan.id, plan]));
  const dbPathFor = (id: string): string => {
    const plan = dbPlanById.get(id);
    return databaseWorkspacePathWithName(id, false, plan?.name);
  };
  const dbIdsByRowHash = new Map<string, Set<string>>();
  for (const dbPlan of dbPlans) {
    for (const rowPlan of dbPlan.rowPlans) {
      if (!rowPlan.hash) continue;
      const set = dbIdsByRowHash.get(rowPlan.hash) ?? new Set<string>();
      set.add(dbPlan.id);
      dbIdsByRowHash.set(rowPlan.hash, set);
    }
  }
  const uniqueDbPlanIdByName = new Map<string, string>();
  const ambiguousDbPlanNames = new Set<string>();
  for (const dbPlan of dbPlans) {
    rememberUnique(uniqueDbPlanIdByName, ambiguousDbPlanNames, dbPlan.name, dbPlan.id);
  }
  for (const att of inventory.attachments.values()) {
    const rel = workspaceAttachmentPath(att.fileName);
    // Notion duplicates the same file under multiple paths (per DB
    // row sub-folder, per Part-N zip); registering EVERY known source
    // path lets a link in any of those locations resolve to the
    // single deduped workspace copy.
    for (const p of att.sourcePaths) {
      setSourceRewrite(rewrites, p, rel);
    }
  }
  for (const plan of pagePlans) {
    setSourceRewrite(rewrites, plan.sourcePath, pageBodyPath(plan.id, plan.title));
  }
  for (const [sourcePath, target] of duplicatePageRedirectBySource) {
    setSourceRewrite(rewrites, sourcePath, target);
  }
  // Phantom standalone-DB pages we skipped above: redirect their HTML
  // source paths to the kept database's view URL so cross-page links
  // in index pages (e.g. 数据库) don't dead-end at URL-encoded paths.
  for (const [absPath, dbHash] of phantomPageRedirects) {
    const dbId = databaseIdByHash.get(dbHash);
    if (dbId) setSourceRewrite(rewrites, absPath, dbPathFor(dbId));
  }
  // Hash-based fallback index: a Notion link in one page might point
  // at a `.html` path that doesn't match the file's actual location
  // (e.g. 数据库 index page references `数据库/起床时间 <hash>.html`,
  // but the file lives under `收集箱/`). The hash uniquely identifies
  // the entity, so register `notion-hash:<hash>` → workspace path for
  // every kept page and DB.
  for (const plan of pagePlans) {
    rewrites.set(`notion-hash:${plan.hash}`, pageBodyPath(plan.id, plan.title));
  }
  for (const [hash, target] of duplicatePageRedirectByHash) {
    rewrites.set(`notion-hash:${hash}`, target);
  }
  for (const [absPath, dbHash] of phantomPageRedirects) {
    const dbId = databaseIdByHash.get(dbHash);
    if (!dbId) continue;
    const m = /\s([0-9a-f]{32})\.html$/i.exec(basename(absPath));
    if (m) rewrites.set(`notion-hash:${m[1].toLowerCase()}`, dbPathFor(dbId));
  }
  for (const dbPlan of dbPlans) {
    const dbPath = dbPathFor(dbPlan.id);
    if (dbPlan.sourceHash) {
      rewrites.set(`notion-hash:${dbPlan.sourceHash}`, dbPath);
      rewrites.set(`notion-db:${dbPlan.sourceHash}`, dbPath);
      rewrites.set(`notion-db-id:${dbPlan.sourceHash}`, dbPlan.id);
    }
    if (!dbPlan.csvPath) continue;
    const m = /\s([0-9a-f]{32})(?:_all)?\.csv$/i.exec(basename(dbPlan.csvPath));
    if (m) rewrites.set(`notion-hash:${m[1].toLowerCase()}`, dbPath);
  }
  for (const dbPlan of dbPlans) {
    if (!dbPlan.csvPath) continue;
    const dbPath = dbPathFor(dbPlan.id);
    setSourceRewrite(rewrites, dbPlan.csvPath, dbPath);
    // Notion ships both `<title> <hash>.csv` (filtered view) and
    // `<title> <hash>_all.csv` (everything). The link in a page body
    // might reference either, so map both to the same target.
    if (dbPlan.csvPath.endsWith("_all.csv")) {
      setSourceRewrite(rewrites, dbPlan.csvPath.replace(/_all\.csv$/, ".csv"), dbPath);
    } else {
      setSourceRewrite(rewrites, dbPlan.csvPath.replace(/\.csv$/, "_all.csv"), dbPath);
    }
    // Also register a hash sentinel so the converter's `<a href=
    // "notion-db:<hash>">` placeholder for inline-database views can be
    // resolved without us having to reconstruct Notion's nested-folder
    // filename (which depends on the parent page title's sanitisation).
    // The target is the canonical database folder (no `/data.csv`) so the
    // renderer's link router can recognise it as "open database view"
    // rather than treating it as a CSV file open.
    const hashMatch = /\s([0-9a-f]{32})(?:_all)?\.csv$/i.exec(basename(dbPlan.csvPath));
    if (hashMatch) {
      rewrites.set(`notion-db:${hashMatch[1].toLowerCase()}`, dbPath);
      rewrites.set(`notion-db-id:${hashMatch[1].toLowerCase()}`, dbPlan.id);
    }
    for (const rowPlan of dbPlan.rowPlans) {
      if (rowPlan.sourcePath) {
        const rowPagePath = `${rowPagesWorkspacePath(dbPlan.id, false, dbPlan.name)}/${rowPlan.fileName}`;
        setSourceRewrite(rewrites, rowPlan.sourcePath, rowPagePath);
        const rowHash = /\s([0-9a-f]{32})\.(html|md)$/i.exec(basename(rowPlan.sourcePath));
        if (rowHash) rewrites.set(`notion-hash:${rowHash[1].toLowerCase()}`, rowPagePath);
      }
    }
  }
  for (const [rowHash, dbIds] of dbIdsByRowHash) {
    if (dbIds.size === 1) {
      rewrites.set(`notion-row-db-id:${rowHash}`, Array.from(dbIds)[0]!);
    }
  }
  for (const [title, dbId] of uniqueDbPlanIdByName) {
    if (!materialTitle(title)) continue;
    const titleEnc = Buffer.from(title).toString("base64").replace(/=+$/, "");
    rewrites.set(`notion-db-title:${titleEnc}`, dbPathFor(dbId));
    rewrites.set(`notion-db-title-id:${titleEnc}`, dbId);
  }
  for (const [viewHash, dbHash] of linkedCollectionViewDbHashByViewHash) {
    const dbId = databaseIdByHash.get(dbHash);
    if (!dbId) continue;
    const dbPath = dbPathFor(dbId);
    rewrites.set(`notion-db:${viewHash}`, dbPath);
    rewrites.set(`notion-db-id:${viewHash}`, dbId);
  }

  for (const page of dedupedPageDetails) {
    if (!page.target && page.targetHash) {
      const dbId = databaseIdByHash.get(page.targetHash);
      if (dbId) page.target = dbPathFor(dbId);
    }
    if (!page.target && page.hash) {
      page.target = rewrites.get(`notion-hash:${page.hash}`) ?? "";
    }
    if (!page.target && page.source) {
      page.target = rewrites.get(normalizeAbs(page.source)) ?? "";
    }
  }

  rewriteRecordNotionLinks(dbPlans, rewrites);
  const entityTargetMap = buildImportEntityTargetMap(pagePlans, dbPlans, dbPathFor);
  const entityPathIndex = buildImportEntityPathIndex(pagePlans, dbPlans);

  // Pass C: write everything. For HTML sources, this is where the
  // body→markdown conversion actually happens — `parseNotionHtml` is
  // called with `resolveLink` + `resolveCollection`, so links are
  // resolved during conversion and collection-content blocks are
  // stripped/replaced at the raw HTML level before DOM parsing. MD
  // sources fall through to cleanNotionBody directly.

  /** Convert one (decoded) Notion href/src into the workspace-relative
   *  URL the page should point at. `sourcePath` is the page being
   *  emitted; relative paths are resolved against its directory. */
  const makeResolveLink = (sourcePath: string): NotionLinkResolver => {
    const sourceDir = dirname(sourcePath);
    return (decoded) => {
      // External URLs (http:, mailto:, etc.) — leave to the resolver
      // caller. Notion never emits `notion-db:` in HTML href, so we
      // don't need a sentinel branch here.
      if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return null;
      const absSource = resolve(sourceDir, decoded);
      const direct = rewrites.get(normalizeAbs(absSource));
      if (direct) return direct;
      const byExportRelativePath = rewrites.get(exportRelativeRewriteKey(absSource));
      if (byExportRelativePath) return byExportRelativePath;
      // Hash fallback — a link from one page may point at a `.html`
      // whose actual location in the export differs from the link
      // path (Notion regenerates link paths per-export but the file
      // tree groups pages by parent). Match by the 32-hex Notion hash
      // that's part of every page/DB filename.
      const hashMatch = /\s([0-9a-f]{32})(?:_all)?\.(?:html|md|csv)$/i.exec(decoded);
      if (hashMatch) {
        const hash = hashMatch[1].toLowerCase();
        const internal = rewrites.get(`notion-hash:${hash}`);
        if (internal) return internal;
        // Some exports contain relative links to Notion hashes that
        // are not present in any selected zip part. Keep the link
        // useful instead of preserving a broken URL-encoded local path.
        return `https://www.notion.so/${hash}`;
      }
      return null;
    };
  };

  /** Resolve a `<div class="collection-content">` block's hash + title
   *  to the workspace database path. Tries hash-direct first (the
   *  common case for inline DBs whose own CSV we kept), then falls
   *  back on a title match (Notion's "linked database" views whose
   *  hash has no CSV of its own but whose title matches a kept DB). */
  const resolveCollection = (
    hashNoDashes: string,
    title: string,
    context?: NotionCollectionResolveContext
  ): string | null => {
    const directId = rewrites.get(`notion-db-id:${hashNoDashes}`);
    if (directId) return `lotion-db:${directId}`;
    const direct = rewrites.get(`notion-db:${hashNoDashes}`);
    if (direct) return direct;
    const dbIdsByRows = new Set<string>();
    for (const rowHash of context?.rowHashes ?? []) {
      const dbId = rewrites.get(`notion-row-db-id:${rowHash.toLowerCase()}`);
      if (dbId) dbIdsByRows.add(dbId);
    }
    if (dbIdsByRows.size === 1) {
      return `lotion-db:${Array.from(dbIdsByRows)[0]!}`;
    }
    if (title) {
      const titleEnc = Buffer.from(title).toString("base64").replace(/=+$/, "");
      const titleId = rewrites.get(`notion-db-title-id:${titleEnc}`);
      if (titleId) return `lotion-db:${titleId}`;
      const titleFallback = rewrites.get(`notion-db-title:${titleEnc}`);
      if (titleFallback) return titleFallback;
    }
    return null;
  };

  const bodyPool = new NotionBodyWorkerPool(rewrites);
  console.log(`[lotion main] notion import body workers count=${bodyPool.size}`);

  /** Read a Notion source (HTML or MD) and produce the body markdown
   *  with all link rewrites already applied. HTML conversion is CPU
   *  heavy, so it runs in a bounded worker pool; MD sources pass
   *  straight through (legacy export format — no inline DBs, link
   *  paths are already markdown-relative). */
  const loadBody = async (
    sourcePath: string,
    parsed?: ParsedNotionHtmlPage,
    hasBodyHint?: boolean,
    knownSize?: number
  ): Promise<string> => {
    if (!fileService.exists(sourcePath)) return "";
    return bodyPool.loadBody({ sourcePath, parsed, hasBodyHint, sourceSize: knownSize });
  };

  try {
  for (const plan of pagePlans) originalHtmlAttachmentForSource(plan.sourcePath);
  for (const dbPlan of dbPlans) {
    for (const rowPlan of dbPlan.rowPlans) originalHtmlAttachmentForSource(rowPlan.sourcePath);
  }
  const plannedRowPages = dbPlans.reduce((sum, plan) => sum + plan.rowPlans.length, 0);
  console.log(
    `[lotion main] notion import planned output ` +
    `databases=${dbPlans.length} rowPages=${plannedRowPages} standalonePages=${pagePlans.length} ` +
    `inlineDatabases=${inlineDatabases.size} linkedCollectionViews=${linkedCollectionViewDbHashByViewHash.size} ` +
    `skippedLinkedCollectionViews=${skippedKnownInlineCollectionViews}`
  );
  const writeTotal =
    inventory.attachments.size +
    originalSourceArchive.files.length +
    pagePlans.length +
    dbPlans.reduce((sum, plan) => sum + plan.rowPlans.length + 3, 0) +
    19; // system DBs, review DB, report page, workspace manifest, and four detailed report artifacts
  let writeCurrent = 0;
  const tWrite = Date.now();
  const markWrite = (message: string, amount = 1) => {
    writeCurrent += amount;
    if (writeCurrent === writeTotal || writeCurrent % 50 === 0 || amount > 1) {
      onProgress?.({ phase: "writing", current: writeCurrent, total: writeTotal, message });
    }
  };

  onProgress?.({ phase: "writing", current: 0, total: writeTotal, message: "Writing workspace files" });
  for (const item of inventory.attachments.values()) {
    const rel = workspaceAttachmentPath(item.fileName);
    const targetPath = join(target, rel);
    const sourcePath = item.sourcePaths[0];
    if (!sourcePath) continue;
    await fileService.ensureDir(dirname(targetPath));
    await fileService.copy(sourcePath, targetPath);
    markWrite("Writing attachments");
  }
  for (const file of originalSourceArchive.files) {
    const targetPath = join(target, file.rel);
    await fileService.ensureDir(dirname(targetPath));
    await fileService.copy(file.sourcePath, targetPath);
    markWrite("Copying original Notion export");
  }
  console.log(
    `[lotion main] notion import wrote attachments count=${inventory.attachments.size} ` +
    `originalSources=${originalSourceArchive.files.length} elapsed=${formatDuration(Date.now() - tWrite)}`
  );

  const pageIds: string[] = [];
  const pageRecords: Array<Record<string, unknown>> = [];
  const entityRecords: EntityRecord[] = [];
  const importedPages: ImportReportImportedPage[] = [];
  const emptyStandalonePageDetails: ImportReportPageDetail[] = [...preSkippedEmptyStandalonePageDetails];
  const standalonePageResults: Array<{
    plan: PagePlan;
    skipped: ImportReportPageDetail | null;
  } | undefined> = new Array(pagePlans.length);
  await forEachConcurrent(pagePlans, bodyPool.size, async (plan, index) => {
    const bodyMd = await loadBody(plan.sourcePath);
    const cleaned = cleanNotionBody(bodyMd, plan.title);
    const isBlankPage = cleaned.trim().length === 0;
    if (isBlankPage && importOptions.skipEmptyRowsAndPages) {
      markWrite("Writing pages");
      standalonePageResults[index] = {
        plan,
        skipped: {
          title: plan.title.trim() || "Untitled",
          id: plan.id,
          hash: plan.hash,
          source: plan.sourcePath,
          target: pageBodyPath(plan.id, plan.title),
          reason: "blank standalone/nested page not imported: cleaned Markdown body is empty after removing Notion's exported title/property wrapper"
        } satisfies ImportReportPageDetail
      };
      return;
    }
    {
      const md = formatPage(cleaned);
      await writeText(join(target, pageBodyPath(plan.id, plan.title)), md);
      markWrite("Writing pages");
      standalonePageResults[index] = { plan, skipped: null };
    }
  });
  for (const result of standalonePageResults) {
    if (!result) continue;
    if (result.skipped) {
      emptyStandalonePageDetails.push(result.skipped);
      continue;
    }
    const plan = result.plan;
    const pagePathSegments = normalizePathSegments(plan.path, plan.title.trim() || "Untitled");
    const parent = importEntityParent(entityPathIndex, pagePathSegments, plan.id);
    pageIds.push(plan.id);
    pageRecords.push({
      id: plan.id,
      created_time: now,
      updated_time: now,
      title: plan.title.trim() || "Untitled",
      kind: "row_page",
      body_path: pageBodyPath(plan.id, plan.title),
      icon: plan.icon ?? "",
      cover: plan.cover ?? "",
      cover_offset: plan.coverOffset === undefined ? "" : String(plan.coverOffset),
      path: serializePathValue(pagePathSegments),
      parent_id: parent ? JSON.stringify([{ entityId: parent.id, kind: parent.kind }]) : "",
      full_width: "",
      database_id: PAGES_DATABASE_ID,
      row_id: plan.id,
      page_file: pageFileName(plan.id, plan.title),
      [ORIGINAL_NOTION_HTML_FIELD_ID]: originalHtmlAttachmentForSource(plan.sourcePath)
    });
    entityRecords.push({
      id: plan.id,
      kind: "page",
      title: plan.title.trim() || "Untitled",
      created_time: now,
      updated_time: now,
      icon: plan.icon,
      path: pagePathSegments,
      parentId: parent?.id,
      parentKind: parent?.kind,
      databaseId: PAGES_DATABASE_ID,
      rowId: plan.id,
      bodyPath: pageBodyPath(plan.id, plan.title),
      sourceNotionHash: plan.hash
    });
    importedPages.push({
      id: plan.id,
      title: plan.title.trim() || "Untitled",
      hash: plan.hash,
      path: pagePathSegments,
      source: plan.sourcePath,
      target: pageBodyPath(plan.id, plan.title),
      icon: plan.icon
    });
  }
  const skippedEmptyPages = emptyStandalonePageDetails.length;
  if (skippedEmptyPages > 0) {
    console.log(`[lotion main] notion import skipped empty standalone pages count=${skippedEmptyPages}`);
  }

  const databaseIds: string[] = [];
  const skippedEmptyRowPagesByDbId = new Map<string, number>();
  const emptyRowPageDetails: ImportReportRowDetail[] = [];
  for (const dbPlan of dbPlans) {
    if (dbPlan.includeInManifest !== false) databaseIds.push(dbPlan.id);
    const dbWorkspacePath = databaseWorkspacePathWithName(dbPlan.id, false, dbPlan.name);
    const dbRowPagesPath = rowPagesWorkspacePath(dbPlan.id, false, dbPlan.name);
    const dbPathSegments = normalizePathSegments(dbPlan.path, dbPlan.name);
    const dbParent = importEntityParent(entityPathIndex, dbPathSegments, dbPlan.id);
    entityRecords.push({
      id: dbPlan.id,
      kind: "database",
      title: dbPlan.name.trim() || "Untitled",
      created_time: now,
      updated_time: now,
      icon: dbPlan.icon,
      path: dbPathSegments,
      parentId: dbParent?.id,
      parentKind: dbParent?.kind,
      sourceNotionHash: dbPlan.sourceHash
    });
    await fileService.ensureDir(join(target, dbRowPagesPath));
    await fileService.ensureDir(join(target, dbWorkspacePath, "templates", "pages"));
    let skippedEmptyRowPages = 0;
    const recordById = new Map(dbPlan.records.map((record) => [String(record.id ?? ""), record]));
    const skippedRowIds = new Set<string>();
    await forEachConcurrent(dbPlan.rowPlans, bodyPool.size, async (rowPlan) => {
      const rowPagePath = `${dbRowPagesPath}/${rowPlan.fileName}`;
      const bodyMd = rowPlan.sourcePath
        ? await loadBody(rowPlan.sourcePath, rowPlan.parsed, rowPlan.hasBody, rowPlan.sourceSize)
        : "";
      const cleaned = bodyMd
        ? cleanNotionBody(bodyMd, rowPlan.title, dbPlan.fields.map((field) => field.name))
        : "";
      const record = recordById.get(rowPlan.rowId);
      const isBlankRow =
        cleaned.trim().length === 0 &&
        (!record || isBlankImportedRowRecord(record, dbPlan.fields));
      if (isBlankRow && importOptions.skipEmptyRowsAndPages) {
        skippedRowIds.add(rowPlan.rowId);
        skippedEmptyRowPages += 1;
        emptyRowPageDetails.push({
          database: dbPlan.name,
          databaseId: dbPlan.id,
          rowId: rowPlan.rowId,
          title: rowPlan.title.trim() || "Untitled",
          hash: rowPlan.hash ?? notionFileHash(rowPlan.sourcePath ?? "") ?? undefined,
          source: rowPlan.sourcePath ?? "",
          target: rowPagePath,
          reason: rowPlan.sourcePath
            ? "blank database row not imported: cleaned row-page body and all meaningful user fields are empty"
            : "blank database row not imported: no row-page source and all meaningful user fields are empty"
        });
      } else {
        await writeText(join(target, rowPagePath), cleaned);
      }
      markWrite(`Writing row pages for ${dbPlan.name}`);
    });
    if (skippedRowIds.size > 0) {
      dbPlan.records = dbPlan.records.filter((record) => !skippedRowIds.has(String(record.id ?? "")));
      dbPlan.rowPlans = dbPlan.rowPlans.filter((rowPlan) => !skippedRowIds.has(rowPlan.rowId));
    }
    for (const rowPlan of dbPlan.rowPlans) {
      const record = recordById.get(rowPlan.rowId);
      const rowPathSegments = [...dbPathSegments, rowPlan.title.trim() || "Untitled"];
      pageRecords.push({
        id: rowPlan.rowId,
        created_time: record?.created_time ?? now,
        updated_time: record?.updated_time ?? now,
        title: rowPlan.title.trim() || "Untitled",
        kind: "row_page",
        body_path: `${dbRowPagesPath}/${rowPlan.fileName}`,
        icon: rowPlan.icon ?? "",
        cover: rowPlan.cover ?? "",
        cover_offset: rowPlan.coverOffset === undefined ? "" : String(rowPlan.coverOffset),
        path: serializePathValue(rowPathSegments),
        parent_id: JSON.stringify([{ entityId: dbPlan.id, kind: "database" }]),
        full_width: record?.page_full_width ?? "",
        database_id: dbPlan.id,
        row_id: rowPlan.rowId,
        page_file: rowPlan.fileName,
        [ORIGINAL_NOTION_HTML_FIELD_ID]: originalHtmlAttachmentForSource(rowPlan.sourcePath)
      });
      entityRecords.push({
        id: rowPlan.rowId,
        kind: "row",
        title: rowPlan.title.trim() || "Untitled",
        created_time: String(record?.created_time ?? now),
        updated_time: String(record?.updated_time ?? now),
        icon: rowPlan.icon,
        path: rowPathSegments,
        parentId: dbPlan.id,
        parentKind: "database",
        databaseId: dbPlan.id,
        rowId: rowPlan.rowId,
        bodyPath: `${dbRowPagesPath}/${rowPlan.fileName}`,
        sourceNotionHash: rowPlan.hash
      });
    }
    if (skippedEmptyRowPages > 0) {
      skippedEmptyRowPagesByDbId.set(dbPlan.id, skippedEmptyRowPages);
      console.log(
        `[lotion main] notion import skipped empty row pages db=${dbPlan.name} count=${skippedEmptyRowPages}`
      );
    }
    const schema: Record<string, unknown> = {
      id: dbPlan.id,
      name: dbPlan.name,
      path: normalizePathSegments(dbPlan.path, dbPlan.name),
      created_time: now,
      updated_time: now,
      fields: dbPlan.fields,
      defaultViewId: DEFAULT_VIEW_ID
    };
    if (dbPlan.originalCsvAttachment) schema.notion_original_csv = dbPlan.originalCsvAttachment;
    if (dbPlan.sourceHash) schema.notion_source_hash = dbPlan.sourceHash;
    if (dbPlan.icon) schema.icon = dbPlan.icon;
    if (dbPlan.cover) schema.cover = dbPlan.cover;
    if (dbPlan.coverOffset !== undefined) schema.coverOffset = dbPlan.coverOffset;
    upgradeEntityRefFields(dbPlan, entityTargetMap);
    await writeJson(join(target, dbWorkspacePath, "schema.json"), schema);
    markWrite(`Writing schema for ${dbPlan.name}`);

    const headers = dbPlan.fields.map((f) => f.id);
    const csv = rowsToCsv(headers, dbPlan.records);
    await writeText(join(target, dbWorkspacePath, "data.csv"), csv);
    markWrite(`Writing data for ${dbPlan.name}`);

    await writeJson(join(target, dbWorkspacePath, "views", `${DEFAULT_VIEW_ID}.json`), dbPlan.view);
    markWrite(`Writing view for ${dbPlan.name}`);
  }

  const reportPageId = shortId("pg");
  const reportTitle = `Import report ${now.slice(0, 16).replace("T", " ")}`;
  const reportBodyPath = pageBodyPath(reportPageId, reportTitle);
  const databaseSummaries: ImportReportDatabaseSummary[] = dbPlans.map((dbPlan) => ({
    id: dbPlan.id,
    name: dbPlan.name,
    originalName: dbPlan.originalName ?? dbPlan.name,
    path: normalizePathSegments(dbPlan.path, dbPlan.name),
    source: dbPlan.csvPath ?? (dbPlan.sourceHash ? `synthetic:${dbPlan.sourceHash}` : "inline/synthetic"),
    notionId: dbPlan.sourceHash,
    sourceRows: dbPlan.sourceRows,
    rows: dbPlan.records.length,
    rowsWithIcon: dbPlan.rowPlans.filter((row) => Boolean(row.icon)).length,
    rowPages: dbPlan.rowPlans.length,
    fields: dbPlan.fields.length,
    userFields: dbPlan.fields.filter((field) => !field.system).length,
    visibleFields: dbPlan.view.visibleFieldIds.length,
    skippedEmptyRowPages: skippedEmptyRowPagesByDbId.get(dbPlan.id) ?? 0,
    includeInManifest: dbPlan.includeInManifest !== false,
    icon: dbPlan.icon
  }));
  const importedRows: ImportReportImportedRow[] = dbPlans.flatMap((dbPlan) => {
    const rowPagesPath = rowPagesWorkspacePath(dbPlan.id, false, dbPlan.name);
    return dbPlan.rowPlans.map((row) => ({
      databaseId: dbPlan.id,
      database: dbPlan.name,
      rowId: row.rowId,
      title: row.title,
      notionId: row.hash,
      source: row.sourcePath ?? "",
      target: `${rowPagesPath}/${row.fileName}`,
      icon: row.icon
    }));
  });
  const duplicateRows = buildDuplicateRowSummaries(dbPlans);
  const importReviewIssues = buildImportReviewIssues({
    now,
    dedupedPages: dedupedPageDetails,
    emptyStandalonePages: emptyStandalonePageDetails,
    emptyRowPages: emptyRowPageDetails
  });
  const importReview = await writeImportReviewDatabase(target, now, importReviewIssues, {
    dedupedPages: dedupedPageDetails.length,
    emptyStandalonePages: emptyStandalonePageDetails.length,
    emptyRowPages: emptyRowPageDetails.length
  });
  databaseIds.unshift(IMPORT_REVIEW_DATABASE_ID);
  markWrite("Writing import review database", 3);
  const reportInputBase: Omit<BuildImportReportInput, "report"> = {
    now,
    target,
    sources,
    options: importOptions,
    inventory,
    choice,
    pagePlans: pagePlans.length,
    pageRecords: pageRecords.length + 1,
    importedPages,
    importedRows,
    databases: databaseSummaries,
    manifestDatabases: databaseIds.length,
    parsedRowsDone,
    parsedRowsTotal,
    skippedDuplicateStandalonePages,
    skippedEmptyStandalonePages: skippedEmptyPages,
    syntheticEmptyDatabases: syntheticEmptyDatabases.size,
    inlineEmptyDatabases: inlineDatabases.size,
    rewrites: rewrites.size,
    duplicatePageRedirects: duplicatePageRedirectBySource.size,
    phantomPageRedirects: phantomPageRedirects.size,
    originalSourceFiles: originalSourceArchive.files.length,
    reportPageId,
    reportBodyPath,
    review: importReview,
    dedupedPages: dedupedPageDetails,
    emptyStandalonePages: emptyStandalonePageDetails,
    emptyRowPages: emptyRowPageDetails,
    duplicateRows
  };
  await writeText(join(target, reportBodyPath), "# Notion import report\n\nFinalizing detailed import report…\n");
  pageIds.unshift(reportPageId);
  pageRecords.unshift({
    id: reportPageId,
    created_time: now,
    updated_time: now,
    title: reportTitle,
    kind: "row_page",
    body_path: reportBodyPath,
    icon: formatEmojiIcon("📥") ?? "",
    path: serializePathValue([reportTitle]),
    parent_id: "",
    full_width: "true",
    database_id: PAGES_DATABASE_ID,
    row_id: reportPageId,
    page_file: pageFileName(reportPageId, reportTitle),
    [ORIGINAL_NOTION_HTML_FIELD_ID]: ""
  });
  entityRecords.unshift({
    id: reportPageId,
    kind: "page",
    title: reportTitle,
    created_time: now,
    updated_time: now,
    icon: formatEmojiIcon("📥") ?? undefined,
    path: [reportTitle],
    databaseId: PAGES_DATABASE_ID,
    rowId: reportPageId,
    bodyPath: reportBodyPath
  });
  markWrite("Writing import report");

  const manifest = {
    version: 1,
    spaceId: shortId("sp"),
    // Workspace name = target folder basename — lets users keep
    // multiple imports side by side without the manifest claiming
    // they're all called "Notion Import".
    name: basename(target) || "Notion Import",
    pages: pageIds,
    databases: databaseIds,
    systemDatabases: [WORKSPACES_DATABASE_ID, PAGES_DATABASE_ID, ENTITIES_DATABASE_ID],
    activePageId: reportPageId
  };
  await writeSystemDatabases(target, manifest.spaceId, manifest.name, now, pageRecords, entityRecords, importOptions.includeOriginalHtml);
  markWrite("Writing system databases", 9);
  await writeJson(join(target, "lotion.json"), manifest);
  markWrite("Writing workspace manifest");
  const reportBuildStartedAt = Date.now();
  const performance: NotionImportReportSummary["performance"] = {
    prepareTargetMs: earlyTimings.prepareTargetMs,
    resolveSourcesMs: earlyTimings.resolveSourcesMs,
    indexSourcesMs: earlyTimings.indexSourcesMs,
    selectDatabasesMs: earlyTimings.selectDatabasesMs,
    planAndParseMs: Math.max(0, tWrite - emitStartedAt),
    writeWorkspaceMs: Math.max(0, reportBuildStartedAt - tWrite),
    totalMs: Math.max(0, reportBuildStartedAt - earlyTimings.startedAt)
  };
  const report = buildImportReportSummary({
    now,
    target,
    sources,
    inventory,
    stats: makeImportStats(sources, inventory, choice),
    importedPages,
    databases: databaseSummaries,
    parsedRowsDone,
    parsedRowsTotal,
    review: importReview,
    timings: performance
  });
  const reportInput: BuildImportReportInput = { ...reportInputBase, report };
  const reportMarkdown = formatPage(buildImportReportMarkdown(reportInput));
  const reportManifest = {
    version: 1,
    generatedAt: now,
    workspaceRoot: target,
    sources,
    identityRule: "stable_notion_id",
    nameCollisionRule: "retain_all",
    pages: importedPages,
    databases: databaseSummaries,
    rows: importedRows,
    skipped: {
      dedupedPages: dedupedPageDetails,
      blankPages: emptyStandalonePageDetails,
      blankRows: emptyRowPageDetails
    },
    nameConflicts: report.nameConflicts.groups
  };
  await fileService.ensureDir(report.artifacts.directory);
  await Promise.all([
    fileService.writeTextAtomic(join(target, reportBodyPath), reportMarkdown),
    fileService.writeTextAtomic(report.artifacts.markdown, reportMarkdown),
    fileService.writeTextAtomic(
      report.artifacts.json,
      JSON.stringify({ report, options: importOptions, sources, databases: databaseSummaries }, null, 2) + "\n"
    ),
    fileService.writeTextAtomic(
      report.artifacts.warningsCsv,
      rowsToCsv(
        ["number", "warning"],
        report.warnings.map((warning, index) => ({ number: index + 1, warning }))
      )
    ),
    fileService.writeTextAtomic(report.artifacts.manifest, JSON.stringify(reportManifest, null, 2) + "\n")
  ]);
  markWrite("Writing detailed import report", 5);
  console.log(
    `[lotion main] notion import wrote workspace files totalItems=${writeTotal} ` +
    `elapsed=${formatDuration(Date.now() - tWrite)} report=${report.artifacts.directory}`
  );
  return { reportPageId, report };
  } finally {
    await bodyPool.close();
  }

  // The workspace service caches the manifest at module load; nothing
  // here invalidates that. Callers reload the renderer (which calls
  // `workspace:open` again) so the cache rebuilds itself.
}

async function writeSystemDatabases(
  target: string,
  spaceId: string,
  name: string,
  now: string,
  pageRecords: Array<Record<string, unknown>>,
  entityRecords: EntityRecord[],
  includeOriginalHtml: boolean
): Promise<void> {
  const workspaceFields = [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "icon", name: "Icon", type: "text" }
  ];
  const workspaceVisibleFields = ["title", "icon", "updated_time"];
  const workspacesPath = databaseWorkspacePathWithName(WORKSPACES_DATABASE_ID, true, "workspaces");
  const pagesPath = databaseWorkspacePathWithName(PAGES_DATABASE_ID, true, "pages");
  const entitiesPath = databaseWorkspacePathWithName(ENTITIES_DATABASE_ID, true, "entities");
  await writeJson(join(target, workspacesPath, "schema.json"), {
    id: WORKSPACES_DATABASE_ID,
    name: "workspaces",
    created_time: now,
    updated_time: now,
    fields: workspaceFields,
    defaultViewId: DEFAULT_VIEW_ID
  });
  await writeText(
    join(target, workspacesPath, "data.csv"),
    rowsToCsv(workspaceFields.map((field) => field.id), [{
      id: spaceId,
      created_time: now,
      updated_time: now,
      title: name,
      icon: ""
    }])
  );
  await writeJson(join(target, workspacesPath, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId: WORKSPACES_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds: workspaceVisibleFields,
    fieldOrder: workspaceVisibleFields,
    wrapFieldIds: workspaceVisibleFields,
    sorts: [],
    filters: []
  });

  const pageFields = includeOriginalHtml
    ? [
        ...createPagesFields(),
        { id: ORIGINAL_NOTION_HTML_FIELD_ID, name: ORIGINAL_NOTION_HTML_FIELD_NAME, type: "url" }
      ]
    : createPagesFields();
  const pagesView = createPagesDefaultView();
  if (includeOriginalHtml) {
    pagesView.visibleFieldIds = [...pagesView.visibleFieldIds, ORIGINAL_NOTION_HTML_FIELD_ID];
    pagesView.fieldOrder = [...pagesView.fieldOrder, ORIGINAL_NOTION_HTML_FIELD_ID];
    pagesView.wrapFieldIds = [...(pagesView.wrapFieldIds ?? []), ORIGINAL_NOTION_HTML_FIELD_ID];
  }
  await writeJson(join(target, pagesPath, "schema.json"), {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    fields: pageFields,
    defaultViewId: DEFAULT_VIEW_ID
  });
  await writeText(
    join(target, pagesPath, "data.csv"),
    rowsToCsv(pageFields.map((field) => field.id), pageRecords)
  );
  await writeJson(
    join(target, pagesPath, "views", `${DEFAULT_VIEW_ID}.json`),
    pagesView
  );

  const entityFields = createEntitiesFields();
  const entityView = createEntitiesDefaultView();
  await writeJson(join(target, entitiesPath, "schema.json"), {
    id: ENTITIES_DATABASE_ID,
    name: "entities",
    created_time: now,
    updated_time: now,
    fields: entityFields,
    defaultViewId: DEFAULT_VIEW_ID
  });
  await writeText(
    join(target, entitiesPath, "data.csv"),
    rowsToCsv(entityFields.map((field) => field.id), entityRecords.map((entity) => entityToRecord(entity, now)))
  );
  await writeJson(
    join(target, entitiesPath, "views", `${DEFAULT_VIEW_ID}.json`),
    entityView
  );
}

// ── helpers ───────────────────────────────────────────────────────────

/**
 * Strip Notion-export artifacts from a page or row body markdown.
 *
 * Link / image / inline-DB rewriting is NOT done here — that happens
 * at the HTML level inside `parseNotionHtml` (resolveLink +
 * resolveCollection), so by the time this runs the body is already
 * fully resolved. We only handle three text-level transforms:
 *
 *   1. Drop the leading "# <Title>" line — Lotion already renders the
 *      title above the body, so leaving it in gives a duplicate H1.
 *   2. Drop the leading metadata lines Notion auto-inserts (Owner,
 *      Last edited time, Tags, Status, Date, etc.) up to the first
 *      content line.
 *   3. Expand the converter's pre-resolved sentinels for inline
 *      database views and table-of-contents blocks into Lotion fenced
 *      blocks.
 */
function cleanNotionBody(raw: string, title: string, databasePropertyNames: string[] = []): string {
  const lines = stripLeadingMarkdownExportIcon(raw).split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i += 1;

  // Strip the leading "# Title" duplicate. Notion sometimes escapes
  // colons → spaces in filenames but keeps them in the heading, so
  // compare against a relaxed normalised form.
  if (i < lines.length) {
    const headingMatch = /^#+\s+(.+?)\s*$/.exec(lines[i]);
    if (headingMatch) {
      const headingTitle = headingMatch[1];
      if (relaxedEquals(headingTitle, title)) {
        lines.splice(i, 1);
        while (i < lines.length && lines[i].trim() === "") {
          lines.splice(i, 1);
        }
      }
    }
  }

  // Strip leading metadata lines. We accept "Foo:" prefixes from a
  // small fixed set, intermixed with blank lines, until the first
  // line that isn't one of these.
  const META = /^(Owner|Last edited time|Last edited by|Created by|Created time|Tags|Status|Type|Category|Priority|Date(?: \d+)?)\s*:\s/;
  const databaseProperties = new Set(databasePropertyNames.map((name) => name.trim()).filter(Boolean));
  if (databaseProperties.size > 0) {
    let metadataEnd = i;
    let hasRecognizedProperty = false;
    while (metadataEnd < lines.length && lines[metadataEnd].trim() !== "") {
      const propertyName = /^([^:\n]+?)\s*:\s*/.exec(lines[metadataEnd])?.[1]?.trim() ?? "";
      if (!propertyName) break;
      hasRecognizedProperty ||= META.test(lines[metadataEnd]) || databaseProperties.has(propertyName);
      metadataEnd += 1;
    }
    if (hasRecognizedProperty && (metadataEnd === lines.length || lines[metadataEnd].trim() === "")) {
      lines.splice(i, metadataEnd - i);
    }
  } else {
    while (i < lines.length) {
      if (lines[i].trim() === "") {
        lines.splice(i, 1);
        continue;
      }
      if (META.test(lines[i])) {
        lines.splice(i, 1);
        continue;
      }
      break;
    }
  }

  let body = lines.join("\n").replace(/^\n+/, "");

  // Inline-DB embed sentinel — the converter emits these as
  // `<p>{{LOTIONVIEW:db_<id>}}</p>` whenever a `collection-content`
  // block resolves via `resolveCollection`. Turndown escapes the `_`
  // (it's significant in markdown — `_x_` is italics), so the literal
  // text we see here is `{{LOTIONVIEW:db\_<id>}}`. Strip any backslash
  // escapes inside the capture and emit a `lotion-view` fenced block.
  body = body.replace(/\{\{LOTIONVIEW:([^}]+)\}\}/g, (_match, escaped: string) => {
    const dbId = escaped.replace(/\\(.)/g, "$1");
    return "```lotion-view\ndatabase: " + dbId + "\nview: view_default\n```";
  });
  body = body.replace(/\{\{LOTIONTOC\}\}/g, "```lotion-toc\n```");

  return body.trimEnd();
}

function relaxedEquals(a: string, b: string): boolean {
  return collapseTitle(a) === collapseTitle(b);
}
function collapseTitle(value: string): string {
  // Notion's filename sanitiser turns ":" into " " (sometimes "  "),
  // so the heading's "X: Y" vs filename "X  Y" mismatch. Treat any run
  // of whitespace + the colon character as equivalent for comparison.
  return value.replace(/[\s:]+/g, " ").trim();
}

function normalizeAbs(absPath: string): string {
  // macOS HFS+/APFS is case-preserving but case-insensitive by
  // default, and our inventory + body-resolved paths come from the
  // same source root, so just collapse to a resolved canonical form.
  return resolve(absPath);
}

function setSourceRewrite(rewrites: Map<string, string>, sourcePath: string, target: string): void {
  rewrites.set(normalizeAbs(sourcePath), target);
  const exportRelativeKey = exportRelativeRewriteKey(sourcePath);
  if (!rewrites.has(exportRelativeKey)) rewrites.set(exportRelativeKey, target);
}

function exportRelativeRewriteKey(sourcePath: string): string {
  const normalized = normalizeAbs(sourcePath).replace(/\\/g, "/");
  const parts = normalized.split("/");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (/^Export-[0-9a-f-]+$/i.test(parts[index] ?? "")) {
      return `notion-path:${parts.slice(index + 1).join("/")}`;
    }
  }
  return `notion-path:${normalized}`;
}

function notionFileHash(pathOrHref: string): string | null {
  return /\s([0-9a-f]{32})(?:_all)?\.(?:html|md|csv)$/i.exec(pathOrHref)?.[1]?.toLowerCase() ?? null;
}

/**
 * Strip Notion's part-specific prefix so paths from different parts of
 * a multi-part export compare equal. Notion's layout is
 *
 *   .../Export-<uuid>-Part-N/Export-<uuid>/<logical path>
 *   .../Export-<uuid> 2/<logical path>
 *
 * Big exports put CSVs in Part-1 and row HTMLs in Part-2 — the same
 * Notion row lives under different physical paths in different parts,
 * but the logical path after `Export-<uuid>/` is identical. We key
 * row-folder lookups on the logical path so they match across parts.
 */
const EXPORT_DIR_RE = /^Export-[0-9a-f-]+(?:-Part-\d+|\s+\d+)?$/i;
function logicalPath(absOrRel: string): string {
  const abs = resolve(absOrRel);
  const segs = abs.split(sep);
  // Walk from the END forward (so we strip the right-most Export-…
  // boundary) and find the LAST segment matching the Notion export
  // dir pattern. Everything after that is the logical path.
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

function notionDatabasePath(csvPath: string, sourceRoots: string[]): string[] {
  const rel = notionRelativePath(csvPath, sourceRoots);
  const segments = rel.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  const file = segments[segments.length - 1];
  const ext = extname(file);
  segments[segments.length - 1] = file.slice(0, file.length - ext.length).replace(/_all$/i, "");
  return normalizePathSegments(segments.map(notionPathSegment), notionPathSegment(segments[segments.length - 1]) || "Untitled database");
}

function notionPagePath(sourcePath: string, sourceRoots: string[]): string[] {
  const rel = notionRelativePath(sourcePath, sourceRoots);
  const segments = rel.split("/").filter(Boolean);
  if (segments.length === 0) return [];
  const file = segments[segments.length - 1];
  const ext = extname(file);
  segments[segments.length - 1] = file.slice(0, file.length - ext.length);
  return segments.map(notionPathSegment).filter(Boolean);
}

function pagePathFromSource(sourcePath: string, sourceRoots: string[], title: string): string[] {
  const path = notionPagePath(sourcePath, sourceRoots);
  const cleanTitle = title.trim();
  if (cleanTitle) {
    if (path.length === 0) return [cleanTitle];
    path[path.length - 1] = cleanTitle;
  }
  return normalizePathSegments(path, cleanTitle || "Untitled");
}

function notionPathSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  return stripHash(decoded).title.replace(/\s+/g, " ").trim();
}

function normalizePathSegments(path: string[] | undefined, fallbackName: string): string[] {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 ? segments : [fallbackName.trim() || "Untitled database"];
}

interface ImportEntityPathTarget {
  id: string;
  kind: EntityKind;
}

function buildImportEntityPathIndex(
  pagePlans: Array<{ id: string; title: string; path?: string[] }>,
  dbPlans: Array<{
    id: string;
    name: string;
    path?: string[];
    rowPlans: Array<{ rowId: string; title: string }>;
  }>
): Map<string, ImportEntityPathTarget[]> {
  const index = new Map<string, ImportEntityPathTarget[]>();
  for (const page of pagePlans) {
    registerImportEntityPath(index, normalizePathSegments(page.path, page.title || "Untitled"), {
      id: page.id,
      kind: "page"
    });
  }
  for (const dbPlan of dbPlans) {
    const dbPath = normalizePathSegments(dbPlan.path, dbPlan.name || "Untitled");
    registerImportEntityPath(index, dbPath, { id: dbPlan.id, kind: "database" });
    for (const rowPlan of dbPlan.rowPlans) {
      registerImportEntityPath(index, [...dbPath, rowPlan.title || "Untitled"], {
        id: rowPlan.rowId,
        kind: "row"
      });
    }
  }
  return index;
}

function registerImportEntityPath(
  index: Map<string, ImportEntityPathTarget[]>,
  path: string[],
  target: ImportEntityPathTarget
): void {
  const key = importEntityPathKey(path);
  const existing = index.get(key);
  if (existing) existing.push(target);
  else index.set(key, [target]);
}

function importEntityParent(
  index: Map<string, ImportEntityPathTarget[]>,
  path: string[],
  selfId: string
): ImportEntityPathTarget | undefined {
  for (let length = path.length - 1; length > 0; length -= 1) {
    const candidates = (index.get(importEntityPathKey(path.slice(0, length))) ?? [])
      .filter((candidate) => candidate.id !== selfId);
    if (candidates.length === 1) return candidates[0];
  }
  return undefined;
}

function importEntityPathKey(path: string[]): string {
  return path.map((segment) => segment.trim()).filter(Boolean).join("\u001f");
}

function stripHash(name: string): { title: string; hash: string | null } {
  const match = NOTION_HASH.exec(name);
  if (!match) return { title: name, hash: null };
  return { title: name.slice(0, match.index), hash: match[1].toLowerCase() };
}

function displayDatabaseName(rawTitle: string): string {
  const title = materialTitle(rawTitle);
  if (title) return title;
  return "Untitled";
}

function disambiguateDatabaseDisplayTitles(databasesByHash: Map<string, DatabaseEntry>): void {
  const pathCounts = new Map<string, number>();
  for (const db of databasesByHash.values()) {
    const pathKey = db.path.join("\x1f");
    pathCounts.set(pathKey, (pathCounts.get(pathKey) ?? 0) + 1);
  }
  for (const [hash, db] of databasesByHash) {
    const path = normalizePathSegments(db.path, db.title);
    const pathKey = db.path.join("\x1f");
    if ((pathCounts.get(pathKey) ?? 0) > 1) {
      const last = `${path[path.length - 1]} · ${hash.slice(0, 8)}`;
      db.path = [...path.slice(0, -1), last];
      db.title = last;
    } else {
      db.path = path;
      db.title = path[path.length - 1] || db.title;
    }
  }
}

function rememberUnique(target: Map<string, string>, ambiguous: Set<string>, key: string | undefined, value: string): void {
  const normalized = String(key ?? "").replace(/\s+/g, " ").trim();
  if (!normalized || ambiguous.has(normalized)) return;
  const existing = target.get(normalized);
  if (!existing) {
    target.set(normalized, value);
    return;
  }
  if (existing !== value) {
    target.delete(normalized);
    ambiguous.add(normalized);
  }
}

function materialTitle(value: string | undefined): string {
  const title = String(value ?? "").replace(/\s+/g, " ").trim();
  return title && title !== "Untitled" && title !== "Embedded database" ? title : "";
}

function orderVisibleFieldsByContentRichness(
  records: Array<Record<string, string>>,
  visibleFieldIds: string[]
): string[] {
  return orderFieldIdsByContentRichness(records, visibleFieldIds, {
    pinnedFirst: ["title"],
    pinnedLast: [ORIGINAL_NOTION_HTML_FIELD_ID, ORIGINAL_NOTION_CSV_FIELD_ID]
  });
}

function shortId(prefix: string): string {
  let suffix = "";
  do {
    suffix = randomBytes(4).toString("hex");
  } while (suffix.startsWith(prefix));
  return `${prefix}_${suffix}`;
}

/**
 * Map Notion's `property-row-<type>` class suffix to Lotion's
 * FieldType. Notion's set is broader than Lotion's, so types Lotion
 * doesn't natively support degrade to a sensible neighbour:
 *
 *   - status → select (closest semantic; we already drop the dot color)
 *   - url → url
 *   - relation → entity_ref
 *   - person → person (static display names; no user directory yet)
 *   - email / phone / rollup / files → text
 *
 * Returns "text" for unknown / missing inputs, which preserves the
 * pre-inference behaviour when the HTML didn't expose a type at all.
 */
function notionTypeToLotion(notionType: string | undefined): string {
  switch (notionType) {
    case "multi_select":
    case "select":
    case "date":
    case "checkbox":
    case "number":
    case "formula":
    case "created_time":
    case "url":
    case "person":
      return notionType;
    case "relation":
      return "entity_ref";
    case "last_edited_time":
      return "updated_time";
    case "status":
      return "select";
    default:
      return "text";
  }
}

function notionSystemTimeField(header: string, notionType: string | undefined): "created_time" | "updated_time" | null {
  if (notionType === "created_time") return "created_time";
  if (notionType === "last_edited_time") return "updated_time";
  if (notionType) return null;

  const normalized = header.trim().toLowerCase();
  if (normalized === "created time") return "created_time";
  if (normalized === "last edited time") return "updated_time";
  return null;
}

function chooseSystemTimeHeaders(
  headers: string[],
  notionTypeByHeader: Map<string, string>
): Map<"created_time" | "updated_time", string> {
  const result = new Map<"created_time" | "updated_time", string>();
  for (const systemFieldId of ["created_time", "updated_time"] as const) {
    const candidates = headers.filter((header) => notionSystemTimeField(header, notionTypeByHeader.get(header)) === systemFieldId);
    if (candidates.length === 0) continue;
    result.set(systemFieldId, preferredSystemTimeHeader(candidates, systemFieldId));
  }
  return result;
}

function preferredSystemTimeHeader(headers: string[], systemFieldId: "created_time" | "updated_time"): string {
  const canonical = systemFieldId === "created_time" ? "created time" : "last edited time";
  return headers.find((header) => header.trim().toLowerCase() === canonical) ?? headers[0];
}

function inferNotionTypeFromCsv(header: string, records: Array<Record<string, string>>): string | undefined {
  const values = records
    .map((record) => (record[header] ?? "").trim())
    .filter(Boolean);
  const headerText = header.trim().toLowerCase();
  const looksUrlHeader = /^(url|urls?|link|links?)(?:\s*\d+)?$/.test(headerText) || /(?:链接|网址)/.test(header);
  const looksCheckboxHeader = /(?:done|complete|completed|checked|checkbox|是否|完成)/.test(headerText) || /(?:完成|是否)/.test(header);
  const looksDateHeader = /(?:\bdate\b|日期|日程)/.test(headerText) || /(?:日期|日程)/.test(header);

  if (values.length === 0) {
    return looksUrlHeader ? "url" : undefined;
  }
  if ((looksUrlHeader || values.some(isImportUrlValue)) && values.every(isImportUrlValue)) return "url";
  if ((looksCheckboxHeader || values.some(hasExplicitCheckboxSignal)) && values.every((value) => !!canonicalCheckboxCellValue(value))) {
    return "checkbox";
  }
  if ((looksDateHeader || values.some(looksImportDateValue)) && values.every((value) => !!normalizeDateValue(value))) return "date";
  if (values.every(isImportNumberValue)) return "number";
  return undefined;
}

function isImportUrlValue(value: string): boolean {
  return /^https?:\/\//i.test(normalizeUrlCellValue(value));
}

function hasExplicitCheckboxSignal(value: string): boolean {
  return /^(?:true|false|yes|no|y|n|checked|unchecked|check|uncheck|\u2713|\u2714|\u2717|\u00d7|\u2611|\u2610)$/i.test(
    normalizeImportMatchValue(value)
  );
}

function isImportNumberValue(value: string): boolean {
  return /^-?(?:\d+|\d*\.\d+)$/.test(normalizeNumberCellValue(value));
}

function looksImportDateValue(value: string): boolean {
  return (
    /\d{4}[-/.年]\d{1,2}(?:[-/.月]\d{1,2})?/.test(value) ||
    /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(value) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(value)
  );
}

function inferNotionOptions(
  header: string,
  notionType: string | undefined,
  notionRecords: Array<Record<string, string>>,
  parsedByPath: Map<string, ParsedNotionHtmlPage>
): SelectOption[] | undefined {
  if (!notionTypeNeedsOptions(notionType)) return undefined;

  const seen = new Set<string>();
  const options: SelectOption[] = [];
  const addOption = (name: string, color?: string) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const key = cleanName.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    options.push({
      id: optionIdForName(cleanName),
      name: cleanName,
      color: color || "gray"
    });
  };

  for (const parsed of parsedByPath.values()) {
    for (const option of parsed.propertyOptions[header] ?? []) {
      addOption(option.name, option.color);
    }
  }

  for (const row of notionRecords) {
    for (const name of splitNotionOptionValue(row[header] ?? "", notionType)) {
      addOption(name);
    }
  }

  for (const parsed of parsedByPath.values()) {
    for (const name of splitNotionOptionValue(parsed.properties[header] ?? "", notionType)) {
      addOption(name);
    }
  }

  return options.length > 0 ? options : undefined;
}

function notionTypeNeedsOptions(notionType: string | undefined): boolean {
  return notionType === "select" || notionType === "multi_select" || notionType === "status";
}

function optionIdForName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (slug) return `opt_${slug}`;
  return `opt_${createHash("sha1").update(name).digest("hex").slice(0, 10)}`;
}

function chooseImportedPropertyValue(csvValue: string, parsedValue: string, fieldType: string | undefined): string {
  // CSV is still canonical for ordinary scalar values, but CSV export
  // strips relation/page-link hrefs. When the HTML property parser has
  // preserved a Notion page target, prefer that richer value.
  if (containsNotionLinkPlaceholder(parsedValue)) return parsedValue;
  if ((fieldType === "select" || fieldType === "multi_select") && parsedValue) return parsedValue;
  return csvValue !== "" ? csvValue : parsedValue;
}

function notionImportValuesCompatible(csvValue: string, htmlValue: string): boolean {
  const csv = normalizeImportMatchValue(csvValue);
  const html = normalizeImportMatchValue(htmlValue);
  if (csv === html) return true;

  const csvCheckbox = canonicalCheckboxCellValue(csv);
  const htmlCheckbox = canonicalCheckboxCellValue(html);
  if (csvCheckbox && htmlCheckbox && csvCheckbox === htmlCheckbox) return true;

  const csvDate = normalizeDateValue(csv);
  const htmlDate = normalizeDateValue(html);
  if (csvDate && htmlDate && csvDate === htmlDate) return true;

  const csvHash = firstNotionHash(csv);
  const htmlHash = firstNotionHash(html);
  if (csvHash && htmlHash && csvHash === htmlHash) return true;

  const csvDisplay = normalizeImportMatchValue(stripImportLinkTargets(csv));
  const htmlDisplay = normalizeImportMatchValue(stripImportLinkTargets(html));
  if (csvDisplay && htmlDisplay && csvDisplay === htmlDisplay) return true;

  const csvOptions = importOptionSet(csvDisplay);
  const htmlOptions = importOptionSet(htmlDisplay);
  return (
    csvOptions.length > 1 &&
    csvOptions.length === htmlOptions.length &&
    csvOptions.every((option, index) => option === htmlOptions[index])
  );
}

function normalizeImportMatchValue(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function stripImportLinkTargets(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/([^,;()[\]]+?)\s*\((?:notion-hash:|https?:\/\/|[^)]*[0-9a-f]{32}[^)]*\.(?:html?|md))[^)]*\)/gi, "$1")
    .replace(/\s+([,;])/g, "$1")
    .replace(/([,;])\s+/g, "$1")
    .trim();
}

function firstNotionHash(value: string): string {
  return /([0-9a-f]{32})/i.exec(value)?.[1]?.toLowerCase() ?? "";
}

function importOptionSet(value: string): string[] {
  if (!/[;,]/.test(value)) return [];
  return value
    .split(/[;,]/)
    .map((item) => normalizeImportMatchValue(item))
    .filter(Boolean)
    .sort();
}

function containsNotionLinkPlaceholder(value: string): boolean {
  return /\]\(notion-hash:[0-9a-f]{32}\)/i.test(value);
}

function rewriteRecordNotionLinks(
  dbPlans: Array<{ csvPath?: string; records: Array<Record<string, string>> }>,
  rewrites: Map<string, string>
): void {
  for (const dbPlan of dbPlans) {
    const baseDir = dbPlan.csvPath ? dirname(dbPlan.csvPath) : undefined;
    for (const record of dbPlan.records) {
      for (const [key, value] of Object.entries(record)) {
        if (!containsRewritableNotionLink(value)) continue;
        record[key] = rewriteNotionTargets(value, rewrites, baseDir);
      }
    }
  }
}

function buildImportEntityTargetMap(
  pagePlans: Array<{ id: string; title: string; path?: string[] }>,
  dbPlans: Array<{
    id: string;
    name: string;
    path?: string[];
    rowPlans: Array<{ rowId: string; fileName: string; title: string }>;
  }>,
  dbPathFor: (id: string) => string
): Map<string, EntityRef> {
  const targets = new Map<string, EntityRef>();
  const add = (target: string, ref: EntityRef) => {
    const key = normalizeEntityTargetKey(target);
    if (key) targets.set(key, ref);
  };

  for (const page of pagePlans) {
    const pagePath = normalizePathSegments(page.path, page.title || "Untitled");
    add(pageBodyPath(page.id, page.title), {
      entityId: page.id,
      kind: "page",
      titleSnapshot: page.title || "Untitled",
      pathSnapshot: pagePath
    });
  }
  for (const dbPlan of dbPlans) {
    const dbWorkspacePath = dbPathFor(dbPlan.id);
    const dbPath = normalizePathSegments(dbPlan.path, dbPlan.name || "Untitled");
    add(dbWorkspacePath, {
      entityId: dbPlan.id,
      kind: "database",
      titleSnapshot: dbPlan.name || "Untitled",
      pathSnapshot: dbPath
    });
    add(`${dbWorkspacePath}/data.csv`, {
      entityId: dbPlan.id,
      kind: "database",
      titleSnapshot: dbPlan.name || "Untitled",
      pathSnapshot: dbPath
    });
    add(`lotion-db:${dbPlan.id}`, {
      entityId: dbPlan.id,
      kind: "database",
      titleSnapshot: dbPlan.name || "Untitled",
      pathSnapshot: dbPath
    });
    for (const rowPlan of dbPlan.rowPlans) {
      const rowPath = `${rowPagesWorkspacePath(dbPlan.id, false, dbPlan.name)}/${rowPlan.fileName}`;
      add(rowPath, {
        entityId: rowPlan.rowId,
        kind: "row",
        databaseId: dbPlan.id,
        rowId: rowPlan.rowId,
        titleSnapshot: rowPlan.title || "Untitled",
        pathSnapshot: [...dbPath, rowPlan.title || "Untitled"]
      });
    }
  }

  return targets;
}

function upgradeEntityRefFields(
  dbPlan: {
    fields: Array<{ id: string; type: string }>;
    records: Array<Record<string, string>>;
  },
  entityTargets: Map<string, EntityRef>
): void {
  const entityRefFieldIds = dbPlan.fields
    .filter((field) => field.type === "entity_ref")
    .map((field) => field.id);
  if (entityRefFieldIds.length === 0) return;

  for (const record of dbPlan.records) {
    for (const fieldId of entityRefFieldIds) {
      const value = record[fieldId] ?? "";
      if (!value) continue;
      const refs = parseImportedEntityRefs(value, entityTargets);
      if (refs.length > 0) record[fieldId] = JSON.stringify(refs);
    }
  }
}

function parseImportedEntityRefs(value: string, entityTargets: Map<string, EntityRef>): EntityRef[] {
  const refs: EntityRef[] = [];
  const seen = new Set<string>();
  const addTarget = (label: string, rawTarget: string) => {
    const key = normalizeEntityTargetKey(rawTarget);
    const ref = key ? entityTargets.get(key) : undefined;
    if (!ref || seen.has(ref.entityId)) return;
    seen.add(ref.entityId);
    refs.push({
      ...ref,
      titleSnapshot: ref.titleSnapshot || cleanEntityRefLabel(label)
    });
  };

  for (const match of value.matchAll(/\[([^\]]+)]\(([^)\n]+)\)/g)) {
    addTarget(match[1] ?? "", match[2] ?? "");
  }
  for (const match of value.matchAll(/([^,;\n]+?)\s*\(([^)\n]+)\)/g)) {
    addTarget(match[1] ?? "", match[2] ?? "");
  }
  return refs;
}

function cleanEntityRefLabel(label: string): string {
  return label.replace(/\\([\\[\]()])/g, "$1").replace(/\s+/g, " ").trim() || "Untitled";
}

function normalizeEntityTargetKey(rawTarget: string): string {
  let target = String(rawTarget ?? "").trim();
  if (!target) return "";
  target = target.replace(/^<|>$/g, "");
  try {
    target = decodeURIComponent(target);
  } catch {
    // Keep the raw value; a plain workspace-relative target can still match.
  }
  if (target.startsWith("lotion-db:")) return target;
  target = target.replace(/[?#].*$/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return target;
}

function containsRewritableNotionLink(value: string): boolean {
  return containsNotionLinkPlaceholder(value) || /\([^)\n]*\.(?:html?|md|csv)(?:[^)\n]*)?\)/i.test(value);
}

function rewriteNotionTargets(value: string, rewrites: Map<string, string>, baseDir: string | undefined): string {
  const placeholderRewritten = value.replace(/\]\(notion-hash:([0-9a-f]{32})\)/gi, (_match, hash: string) => {
    const target = rewrites.get(`notion-hash:${hash.toLowerCase()}`) ?? `https://www.notion.so/${hash}`;
    return `](${target})`;
  });

  // Notion CSV relation fields are often plain text like
  // `Task (../Folder/Task abc123.html)`, not markdown links. Rewrite
  // the parenthesized local target so the cell no longer points back
  // into the vanished export tree.
  return placeholderRewritten.replace(/\(([^)\n]*\.(?:html?|md|csv)(?:[^)\n]*)?)\)/gi, (match, rawTarget: string) => {
    const target = resolveLocalNotionTarget(rawTarget, rewrites, baseDir);
    return target ? `(${target})` : match;
  });
}

function resolveLocalNotionTarget(
  rawTarget: string,
  rewrites: Map<string, string>,
  baseDir: string | undefined
): string | null {
  const trimmed = rawTarget.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // Keep the original string; `resolve` can still handle plain paths.
  }

  if (baseDir) {
    const absSource = resolve(baseDir, decoded);
    const direct = rewrites.get(normalizeAbs(absSource));
    if (direct) return direct;
    const byExportRelativePath = rewrites.get(exportRelativeRewriteKey(absSource));
    if (byExportRelativePath) return byExportRelativePath;
  }

  const hashMatch = /([0-9a-f]{32})(?:_all)?\.(?:html?|md|csv)(?:[#?].*)?$/i.exec(decoded);
  if (hashMatch) {
    const hash = hashMatch[1].toLowerCase();
    const byHash = rewrites.get(`notion-hash:${hash}`);
    if (byHash) return byHash;
    return `https://www.notion.so/${hash}`;
  }

  return null;
}

function isBlankImportedRowRecord(
  record: Record<string, string>,
  fields: Array<{ id: string; name?: string; system?: boolean; hidden?: boolean }>
): boolean {
  const ignoredFieldIds = new Set([
    "id",
    "created_time",
    "updated_time",
    ROW_ICON_FIELD_ID,
    "page_file",
    "page_full_width",
    ORIGINAL_NOTION_HTML_FIELD_ID,
    ORIGINAL_NOTION_CSV_FIELD_ID
  ]);
  for (const field of fields) {
    if (field.system || field.hidden || ignoredFieldIds.has(field.id)) continue;
    const fieldName = (field.name ?? "").trim().toLowerCase();
    if (
      fieldName === "created time" ||
      fieldName === "created time (notion)" ||
      fieldName === "last edited time" ||
      fieldName === "updated time"
    ) {
      continue;
    }
    const value = (record[field.id] ?? "").trim();
    if (!value) continue;
    if (field.id === "title" && value === "Untitled") continue;
    return false;
  }
  return true;
}

function normalizeImportedCellValue(fieldType: string | undefined, value: string): string {
  if (fieldType === "multi_select") return splitNotionOptionValue(value, "multi_select").join(";");
  if (fieldType === "url") return normalizeUrlCellValue(value);
  if (fieldType === "number") return normalizeNumberCellValue(value);
  if (fieldType === "checkbox") return normalizeCheckboxCellValue(value);
  if (fieldType !== "date") return value;
  return normalizeDateValue(value) || value;
}

function normalizeCheckboxCellValue(value: string): string {
  return canonicalCheckboxCellValue(value) || value.trim();
}

function canonicalCheckboxCellValue(value: string): string {
  const text = normalizeImportMatchValue(value).toLowerCase();
  if (!text) return "";
  if (["true", "yes", "y", "1", "checked", "check", "\u2713", "\u2714", "\u2611"].includes(text)) return "true";
  if (["false", "no", "n", "0", "unchecked", "uncheck", "\u2717", "\u00d7", "\u2610"].includes(text)) return "false";
  return "";
}

function normalizeNumberCellValue(value: string): string {
  const trimmed = value.trim();
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
  if (text.includes("%")) return value;
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$|^\.\d+$/.test(text)) return value;
  const normalized = text.replace(/,/g, "");
  return negative ? `-${normalized}` : normalized;
}

function normalizeUrlCellValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const markdownLink = /^\[[^\]]*]\((https?:\/\/[^)\s]+)\)$/.exec(trimmed);
  if (markdownLink) return markdownLink[1];
  const bareUrl = /\bhttps?:\/\/[^\s<>"')，。；,]+/i.exec(trimmed);
  return bareUrl ? bareUrl[0].replace(/[)\],.;:!?，。；]+$/g, "") : trimmed;
}

function splitNotionOptionValue(value: string, notionType: string | undefined): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (notionType === "multi_select") {
    const delimiter = trimmed.includes(";") ? ";" : ",";
    return trimmed.split(delimiter).map((item) => item.trim()).filter(Boolean);
  }
  return [trimmed];
}

function safeAttachmentStem(sourcePath: string): string {
  const rawBase = basename(sourcePath);
  let stem = rawBase.slice(0, rawBase.length - extname(rawBase).length);
  try {
    stem = decodeURIComponent(stem);
  } catch {
    // Keep the filesystem stem when it is not percent-encoded.
  }
  return slugifyFileName(stem, 48);
}

function safeOriginalSourceSegment(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Keep the raw segment when it is not percent-encoded.
  }
  const cleaned = decoded
    .normalize("NFC")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 140)
    .replace(/[ .]+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return "untitled";
  return cleaned;
}

function slugifyFileName(value: string, maxLength = 24): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\x00]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return cleaned || "untitled";
}

function uniqueFieldId(name: string, existing: Array<{ id: string }>): string {
  const base = slugifyFileName(name).toLowerCase() || "field";
  let id = base;
  let suffix = 2;
  while (existing.some((f) => f.id === id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  return id;
}

const REPORT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function reportNumber(value: number): string {
  return REPORT_NUMBER_FORMATTER.format(value);
}

function markdownInlineCode(value: unknown): string {
  return `\`${String(value ?? "").replace(/`/g, "\\`")}\``;
}

function markdownTableCell(value: unknown): string {
  const text = String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\|/g, "\\|")
    .trim();
  return text || " ";
}

function formatMarkdownTable(headers: string[], rows: string[][]): string {
  const header = `| ${headers.map(markdownTableCell).join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) =>
    `| ${headers.map((_, index) => markdownTableCell(row[index] ?? "")).join(" | ")} |`
  );
  return [header, separator, ...body].join("\n");
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\n") + "\n";
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === "\"" && inQuotes && next === "\"") { cell += "\""; i += 1; }
    else if (ch === "\"") inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { row.push(cell); cell = ""; }
    else if (ch === "\n" && !inQuotes) { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  if (rows[0] && rows[0][0] && rows[0][0].charCodeAt(0) === 0xFEFF) {
    rows[0][0] = rows[0][0].slice(1);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  return parseCsv(line)[0] ?? [];
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await fileService.writeText(path, JSON.stringify(value, null, 2) + "\n");
}

async function writeText(path: string, value: string): Promise<void> {
  await fileService.writeText(path, value);
}

function formatPage(body: string): string {
  return `${body.trimEnd()}\n`;
}
