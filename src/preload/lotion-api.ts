import type {
  AddFieldInput,
  CopyFieldToSystemTimeInput,
  CopyFieldToSystemTimeResult,
  CreateDatabaseInput,
  CreatePageInput,
  CreateViewInput,
  CreateWorkspaceInput,
  DatabaseBundle,
  DatabaseStats,
  DatabaseSummary,
  DeleteDatabaseTemplateInput,
  DeleteRowInput,
  DeleteViewInput,
  DuplicateViewInput,
  EntityBacklink,
  EntityLookupResult,
  FavoriteItem,
  GitBackupResult,
  GitPageHistoryPreview,
  GitPageHistoryResult,
  GitSquashPreflightResult,
  GitStatus,
  GitSyncSettings,
  GitSyncSettingsInput,
  NotionAuditInput,
  NotionAuditResult,
  PageDocument,
  PageMeta,
  PagesTree,
  RecentItem,
  RecentItemInput,
  RowPageDocument,
  SaveDatabaseTemplateInput,
  SetDefaultViewInput,
  SetRowPageFullWidthInput,
  SetRowPageSmallTextInput,
  SpaceManifest,
  TableView,
  UpdateCellInput,
  UpdateDatabaseMetaInput,
  UpdateFieldInput,
  UpdatePageInput,
  UpdateRowPageInput,
  UpdateViewInput
} from "../shared/types.js";
import type { AttachmentRef, ImportedAttachment } from "../shared/attachments.js";
import type { LotionApiMetricsApi } from "../shared/customer-api-contract.js";

export interface RecentWorkspace {
  path: string;
  name: string;
  icon?: string;
  lastOpened: string;
}

export interface LotionApi {
  workspace: {
    create(input: CreateWorkspaceInput): Promise<SpaceManifest>;
    open(path?: string): Promise<SpaceManifest>;
    getManifest(): Promise<SpaceManifest>;
    getPagesTree(): Promise<PagesTree>;
    /** Recently opened workspaces, MRU first. */
    listRecent(): Promise<RecentWorkspace[]>;
    /** Remove a workspace from the recents list. */
    forget(path: string): Promise<void>;
    /** Show a folder picker and open the chosen workspace. Returns
     *  the new manifest, or null if the user cancelled. */
    openPicker(): Promise<SpaceManifest | null>;
    /** Replace the sidebar's pages / databases order with the given
     *  list (caller must include every id). */
    reorderPages(ids: string[]): Promise<SpaceManifest>;
    reorderDatabases(ids: string[]): Promise<SpaceManifest>;
    listRecents(): Promise<RecentItem[]>;
    /** Push a navigation into the recents list (last-N, deduped). */
    pushRecent(item: RecentItemInput): Promise<SpaceManifest>;
  };
  pages: {
    list(): Promise<PageMeta[]>;
    create(input: CreatePageInput): Promise<PageDocument>;
    duplicate(id: string): Promise<PageDocument>;
    get(id: string): Promise<PageDocument>;
    update(id: string, input: UpdatePageInput): Promise<PageDocument>;
    rename(id: string, title: string): Promise<PageDocument>;
    delete(id: string): Promise<void>;
  };
  databases: {
    list(): Promise<DatabaseSummary[]>;
    listStats(): Promise<DatabaseStats[]>;
    refreshStats(): Promise<DatabaseStats[]>;
    create(input: CreateDatabaseInput): Promise<DatabaseBundle>;
    get(id: string): Promise<DatabaseBundle>;
    delete(id: string): Promise<void>;
    updateMeta(input: UpdateDatabaseMetaInput): Promise<DatabaseBundle>;
    addField(id: string, input: AddFieldInput): Promise<DatabaseBundle>;
    updateField(input: UpdateFieldInput): Promise<DatabaseBundle>;
    copyFieldToSystemTime(input: CopyFieldToSystemTimeInput): Promise<CopyFieldToSystemTimeResult>;
    deleteField(databaseId: string, fieldId: string): Promise<DatabaseBundle>;
    updateCell(input: UpdateCellInput): Promise<DatabaseBundle>;
    addRow(databaseId: string, templateId?: string): Promise<DatabaseBundle>;
    deleteRow(input: DeleteRowInput): Promise<DatabaseBundle>;
    saveTemplate(input: SaveDatabaseTemplateInput): Promise<DatabaseBundle>;
    deleteTemplate(input: DeleteDatabaseTemplateInput): Promise<DatabaseBundle>;
  };
  views: {
    create(input: CreateViewInput): Promise<DatabaseBundle>;
    duplicate(input: DuplicateViewInput): Promise<DatabaseBundle>;
    update(input: UpdateViewInput): Promise<DatabaseBundle>;
    delete(input: DeleteViewInput): Promise<DatabaseBundle>;
    setDefault(input: SetDefaultViewInput): Promise<DatabaseBundle>;
  };
  rowPages: {
    open(databaseId: string, rowId: string): Promise<RowPageDocument>;
    openByFilename(databaseId: string, fileName: string): Promise<RowPageDocument>;
    update(input: UpdateRowPageInput): Promise<RowPageDocument>;
    setFullWidth(input: SetRowPageFullWidthInput): Promise<RowPageDocument>;
    setSmallText(input: SetRowPageSmallTextInput): Promise<RowPageDocument>;
  };
  git: {
    status(): Promise<GitStatus>;
    backupNow(message?: string): Promise<GitBackupResult>;
    initRepository(): Promise<GitBackupResult>;
    settings(): Promise<GitSyncSettings>;
    updateSettings(input: GitSyncSettingsInput): Promise<GitSyncSettings>;
    configureRemote(): Promise<GitBackupResult>;
    testRemoteAccess(): Promise<GitBackupResult>;
    push(): Promise<GitBackupResult>;
    fetchStatus(): Promise<GitBackupResult>;
    pull(): Promise<GitBackupResult>;
    pickSshKey(): Promise<string | null>;
    listPageHistory(pageId: string): Promise<GitPageHistoryResult>;
    previewPageVersion(pageId: string, sha: string): Promise<GitPageHistoryPreview>;
    restorePageVersion(pageId: string, sha: string): Promise<PageDocument>;
    squashPreflight(): Promise<GitSquashPreflightResult>;
  };
  shell: {
    /** Opens `url` in the system: protocol URLs (https://, mailto:, …)
     *  via the OS browser; relative paths resolved against the open
     *  workspace via `shell.openPath`. Returns an error message on
     *  failure or empty string on success. */
    openLink(url: string): Promise<string>;
  };
  attachments: {
    list(): Promise<AttachmentRef[]>;
    get(sha: string): Promise<Uint8Array>;
    add(data: Uint8Array, ext: string): Promise<AttachmentRef>;
    importDroppedFiles(files: File[] | FileList): Promise<ImportedAttachment[]>;
  };
  search: {
    /** Workspace-wide fixed-string search. Empty pattern returns
     *  no hits. Limits applied server-side (per-file cap + total cap). */
    query(pattern: string, options?: SearchQueryOptions): Promise<SearchResult>;
  };
  entities: {
    resolve(id: string): Promise<EntityLookupResult | null>;
    backlinks(id: string): Promise<EntityBacklink[]>;
  };
  icons: {
    /** Pops a file picker, copies the chosen image into the workspace,
     *  and writes the workspace-relative path to the target's
     *  metadata. Empty `iconPath` means the user cancelled. */
    setForPage(pageId: string): Promise<{ iconPath: string }>;
    clearForPage(pageId: string): Promise<void>;
    setForDatabase(databaseId: string): Promise<{ iconPath: string }>;
    clearForDatabase(databaseId: string): Promise<void>;
    setForWorkspace(): Promise<{ iconPath: string }>;
    clearForWorkspace(): Promise<void>;
  };
  covers: {
    /** Same shape as icons, but writes to the `cover` metadata field.
     *  Empty `coverPath` means the user cancelled. */
    setForPage(pageId: string): Promise<{ coverPath: string }>;
    clearForPage(pageId: string): Promise<void>;
    setForDatabase(databaseId: string): Promise<{ coverPath: string }>;
    clearForDatabase(databaseId: string): Promise<void>;
    /** 0..100 — vertical focal point of the cover image for a DB.
     *  Pages set this via `pages.update({ coverOffset })`. */
    setOffsetForDatabase(databaseId: string, offset: number): Promise<void>;
    setForRow(databaseId: string, rowId: string): Promise<{ coverPath: string }>;
    clearForRow(databaseId: string, rowId: string): Promise<void>;
    setOffsetForRow(databaseId: string, rowId: string, offset: number): Promise<void>;
  };
  windows: {
    /** Open a new BrowserWindow with the same renderer. Each window
     *  carries its own renderer state (tabs, scroll, etc.) but shares
     *  the workspace on disk. */
    openNew(): Promise<void>;
  };
  environment: {
    /** Local development defaults loaded from process env / `.env`.
     *  Used only as optional plugin defaults; never persisted by Lotion. */
    llmDefaults(): Promise<LLMEnvironmentDefaults>;
    openaiDefaults(): Promise<OpenAIProviderEnvironmentDefaults>;
  };
  plugins: {
    appendJsonl(pluginId: string, fileName: string, value: unknown): Promise<void>;
    readJsonl<T = unknown>(pluginId: string, fileName: string, options?: { limit?: number }): Promise<T[]>;
    readJson<T = unknown>(pluginId: string, fileName: string): Promise<T | null>;
    writeJson(pluginId: string, fileName: string, value: unknown): Promise<void>;
    deleteFile(pluginId: string, fileName: string): Promise<void>;
  };
  favorites: {
    list(): Promise<FavoriteItem[]>;
    /** Toggles membership of `item`. Pages key on id, row-pages key on
     *  (databaseId, rowId). Returns the updated manifest. */
    toggle(item: FavoriteItem): Promise<SpaceManifest>;
  };
  debug: {
    openLog(label: string, detail: Record<string, unknown>): void;
    setShellOpenDryRun(enabled: boolean): Promise<{ enabled: boolean; requests: string[] }>;
    getShellOpenRequests(): Promise<string[]>;
    clearShellOpenRequests(): Promise<string[]>;
  };
  notion: {
    pickFolder(kind?: "markdown_csv" | "html"): Promise<string | null>;
    pickTarget(): Promise<string | null>;
    scan(sourcePaths: string | string[]): Promise<NotionScanSummary>;
    runImport(payload: {
      sourcePath?: string;
      sourcePaths?: string[];
      targetPath: string;
      force?: boolean;
      options?: NotionImportOptions;
    }): Promise<NotionImportSummary>;
    audit(input: NotionAuditInput): Promise<NotionAuditResult>;
    onProgress(handler: (progress: NotionImportProgress) => void): () => void;
  };
  metrics: LotionApiMetricsApi;
}

export interface NotionImportOptions {
  skipEmptyRowsAndPages?: boolean;
  dedupeMarkdownFiles?: boolean;
  /** Copy the original Notion export tree into attachments/original for audit links. */
  includeOriginalHtml?: boolean;
}

export interface OpenAIProviderEnvironmentDefaults {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface LLMEnvironmentDefaults {
  openai?: OpenAIProviderEnvironmentDefaults;
  deepseek?: OpenAIProviderEnvironmentDefaults;
  custom?: OpenAIProviderEnvironmentDefaults;
}

export interface NotionImportProgress {
  phase: "scanning" | "indexing" | "parsing" | "writing" | "done";
  /** Items processed so far. Absent for phases that can't measure ahead. */
  current?: number;
  /** Total items in this phase. Absent → render as indeterminate spinner. */
  total?: number;
  /** Free-form one-liner for the phase. */
  message?: string;
  /** Total elapsed import time, in milliseconds. */
  elapsedMs?: number;
  /** Elapsed time since this phase first emitted, in milliseconds. */
  phaseElapsedMs?: number;
  /** Present after indexing finishes; useful for diagnosing large imports. */
  stats?: NotionImportStats;
}

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

export interface NotionScanSummary {
  sources: string[];
  databasesRaw: number;
  databasesKept: number;
  databases: Array<{ title: string; rows: number; userFields: number }>;
  /** Page files that are not direct database rows. Includes nested pages; deduped by Notion hash. */
  topLevelPages: number;
  attachments: number;
}

export interface NotionImportSummary {
  workspaceRoot: string;
  reportPageId: string;
  report: NotionImportReportSummary;
  scan: NotionScanSummary;
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

export interface HitRange {
  start: number;
  end: number;
}

export type SearchMatchType = "title" | "content" | "reference" | "database";

export type SearchSortMode =
  | "relevance"
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc";

export interface SearchQueryOptions {
  sort?: SearchSortMode;
}

interface BaseSearchHit {
  /** Workspace-relative path (kept for debugging / OS-open fallback). */
  path: string;
  /** 1-based line number of the match in the source file. */
  line: number;
  /** Preview text — typically trimmed around the first match. */
  text: string;
  /** Byte offsets within `text` for each match. */
  ranges: HitRange[];
  /** Workspace-relative image path, `emoji:<glyph>`, or undefined for the default icon. */
  icon?: string;
  /** ISO-ish created timestamp when available from page/entity/row metadata. */
  createdTime?: string;
  /** ISO-ish updated timestamp when available from page/entity/row metadata. */
  updatedTime?: string;
  /** User-visible Notion-style breadcrumb path. */
  entityPath?: string;
  /** Best single match route used for sorting and display. */
  matchType?: SearchMatchType;
  /** All routes that matched this logical result before final dedupe. */
  matchTypes?: SearchMatchType[];
}

/**
 * Hits are classified into Lotion's logical model so the renderer
 * can show meaningful labels (page title, DB · row title) rather
 * than raw on-disk paths.
 */
export type SearchHit =
  | (BaseSearchHit & {
      kind: "page";
      pageId: string;
      title: string;
      databaseId?: string;
      databaseName?: string;
      rowId?: string;
      pageFile?: string | null;
    })
  | (BaseSearchHit & {
      kind: "database";
      databaseId: string;
      databaseName: string;
    })
  | (BaseSearchHit & {
      kind: "row";
      databaseId: string;
      databaseName: string;
      rowId: string;
      rowTitle: string;
      pageFile: string | null;
    })
  | (BaseSearchHit & {
      kind: "rowPage";
      databaseId: string;
      databaseName: string;
      rowTitle: string | null;
      pageFile: string;
    });

export interface SearchResult {
  hits: SearchHit[];
  truncated: boolean;
}

declare global {
  interface Window {
    lotion: LotionApi;
  }
}
