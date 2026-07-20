import { join } from "node:path";
import type { AppConfigService } from "./services/app-config-service.js";
import { AttachmentService } from "./services/attachment-service.js";
import { DatabaseService } from "./services/database-service.js";
import { EntitiesDatabaseService } from "./services/entities-database-service.js";
import { NotionImportService } from "./services/notion-import-service.js";
import type { NotionImportOptions, NotionImportProgressCallback } from "./services/notion-import-service.js";
import { runNotionAudit } from "./services/notion-audit-service.js";
import { PageService } from "./services/page-service.js";
import { RowPagesService } from "./services/row-pages-service.js";
import { SearchService } from "./services/search-service.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { fileService } from "./services/file-service.js";
import type {
  AddFieldInput,
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
  NotionAuditInput,
  NotionAuditResult,
  PageDocument,
  PageMeta,
  PagesTree,
  PagesTreeDatabaseFolder,
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
import {
  instrumentApiSurface,
  LOTION_PACKAGE_API_CONTRACT,
  LotionApiMetricsRecorder
} from "../shared/customer-api-contract.js";
import type { LotionApiMetricsApi } from "../shared/customer-api-contract.js";
import type { SearchQueryOptions, SearchResult } from "./services/search-service.js";
import type { NotionImportResult, NotionScanResult } from "./services/notion-import-service.js";

export const LOTION_CUSTOMER_API_VERSION = "1.0";

export type LotionCustomerApiConfig = Pick<AppConfigService, "load" | "save" | "touch" | "forget">;

export interface LotionCustomerApiOptions {
  workspace?: WorkspaceService;
  appConfig?: LotionCustomerApiConfig;
}

export interface LotionCustomerApi {
  readonly version: typeof LOTION_CUSTOMER_API_VERSION;
  workspace: {
    createAt(root: string, input?: CreateWorkspaceInput): Promise<SpaceManifest>;
    open(path: string): Promise<SpaceManifest>;
    getManifest(): Promise<SpaceManifest>;
    getPagesTree(): Promise<PagesTree>;
    reorderPages(ids: string[]): Promise<SpaceManifest>;
    reorderDatabases(ids: string[]): Promise<SpaceManifest>;
    listFavorites(): Promise<FavoriteItem[]>;
    toggleFavorite(item: FavoriteItem): Promise<SpaceManifest>;
    listRecents(): Promise<RecentItem[]>;
    pushRecent(item: RecentItemInput): Promise<SpaceManifest>;
  };
  pages: {
    list(): Promise<PageMeta[]>;
    create(input: CreatePageInput): Promise<PageDocument>;
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
  attachments: {
    list(): Promise<AttachmentRef[]>;
    get(sha: string): Promise<Uint8Array>;
    add(data: Uint8Array, ext: string): Promise<AttachmentRef>;
    importFiles(paths: string[]): Promise<ImportedAttachment[]>;
  };
  search: {
    query(pattern: string, options?: SearchQueryOptions): Promise<SearchResult>;
  };
  entities: {
    resolve(id: string): Promise<EntityLookupResult | null>;
    backlinks(id: string): Promise<EntityBacklink[]>;
  };
  notion: {
    scan(sourcePaths: string | string[]): Promise<NotionScanResult>;
    runImport(payload: {
      sourcePath?: string;
      sourcePaths?: string[];
      targetPath: string;
      force?: boolean;
      options?: NotionImportOptions;
      onProgress?: NotionImportProgressCallback;
    }): Promise<NotionImportResult>;
    audit(input: NotionAuditInput): Promise<NotionAuditResult>;
  };
  metrics: LotionApiMetricsApi;
}

export function createLotionCustomerApi(options: LotionCustomerApiOptions = {}): LotionCustomerApi {
  const appConfig = (options.appConfig ?? noopAppConfig()) as AppConfigService;
  const workspace = options.workspace ?? new WorkspaceService(appConfig);
  const pages = new PageService(workspace);
  const databases = new DatabaseService(workspace);
  const rowPages = new RowPagesService(workspace, databases);
  databases.setRowPagesService(rowPages);
  const attachments = new AttachmentService(workspace);
  const search = new SearchService(workspace);
  const entities = new EntitiesDatabaseService(workspace);
  const notion = new NotionImportService(appConfig);
  const metrics = new LotionApiMetricsRecorder();

  const api: LotionCustomerApi = {
    version: LOTION_CUSTOMER_API_VERSION,
    workspace: {
      createAt: (root, input) => workspace.createAt(root, input),
      open: (path) => workspace.open(path),
      getManifest: () => workspace.getManifest(),
      getPagesTree: () => getPagesTree(workspace, pages, databases),
      reorderPages: (ids) => workspace.reorderPages(ids),
      reorderDatabases: (ids) => workspace.reorderDatabases(ids),
      listFavorites: () => workspace.listFavorites(),
      toggleFavorite: (item) => workspace.toggleFavorite(item),
      listRecents: () => workspace.listRecents(),
      pushRecent: (item) => workspace.pushRecent(item)
    },
    pages: {
      list: () => pages.list(),
      create: (input) => pages.create(input),
      get: (id) => pages.get(id),
      update: (id, input) => pages.update(id, input),
      rename: (id, title) => pages.rename(id, title),
      delete: (id) => pages.delete(id)
    },
    databases: {
      list: () => databases.list(),
      listStats: () => databases.listStats(),
      refreshStats: () => databases.refreshStats(),
      create: (input) => databases.create(input),
      get: (id) => databases.get(id),
      delete: (id) => databases.delete(id),
      updateMeta: (input) => databases.updateMeta(input),
      addField: (id, input) => databases.addField(id, input),
      updateField: (input) => databases.updateField(input),
      deleteField: (databaseId, fieldId) => databases.deleteField(databaseId, fieldId),
      updateCell: (input) => databases.updateCell(input),
      addRow: (databaseId, templateId) => databases.addRow(databaseId, templateId),
      deleteRow: (input) => databases.deleteRow(input),
      saveTemplate: (input) => databases.saveTemplate(input),
      deleteTemplate: (input) => databases.deleteTemplate(input)
    },
    views: {
      create: (input) => databases.createView(input),
      duplicate: (input) => databases.duplicateView(input),
      update: (input) => databases.updateView(input.databaseId, input.view),
      delete: (input) => databases.deleteView(input),
      setDefault: (input) => databases.setDefaultView(input)
    },
    rowPages: {
      open: (databaseId, rowId) => rowPages.open(databaseId, rowId),
      openByFilename: (databaseId, fileName) => rowPages.openByFilename(databaseId, fileName),
      update: (input) => rowPages.update(input.databaseId, input.rowId, input.markdown),
      setFullWidth: (input) => rowPages.setFullWidth(input.databaseId, input.rowId, input.fullWidth),
      setSmallText: (input) => rowPages.setSmallText(input.databaseId, input.rowId, input.smallText)
    },
    attachments: {
      list: () => attachments.list(),
      get: (sha) => attachments.get(sha),
      add: (data, ext) => attachments.add(data, ext),
      importFiles: (paths) => attachments.importFiles(paths)
    },
    search: {
      query: (pattern: string, options?: SearchQueryOptions) => search.query(pattern, options)
    },
    entities: {
      resolve: (id) => entities.resolve(id),
      backlinks: (id) => entities.backlinks(id)
    },
    notion: {
      scan: (sourcePaths) => notion.scan(sourcePaths),
      runImport: (payload) => notion.runImport(
        payload.sourcePaths?.length ? payload.sourcePaths : payload.sourcePath ?? "",
        payload.targetPath,
        payload.force ?? false,
        payload.options,
        payload.onProgress
      ),
      audit: (input) => runNotionAudit({
        ...input,
        workspacePath: input.workspacePath || workspace.requirePaths().root
      })
    },
    metrics: {
      list: (options) => metrics.list(options),
      summary: () => metrics.summary(),
      clear: () => metrics.clear()
    }
  };
  return instrumentApiSurface(api as unknown as Record<string, unknown>, {
    contract: LOTION_PACKAGE_API_CONTRACT,
    recorder: metrics,
    surface: "package"
  }) as unknown as LotionCustomerApi;
}

async function getPagesTree(
  workspace: WorkspaceService,
  pages: PageService,
  databases: DatabaseService
): Promise<PagesTree> {
  const [topLevelPages, summaries] = await Promise.all([pages.list(), databases.list()]);
  const folders: PagesTreeDatabaseFolder[] = [];
  for (const summary of summaries) {
    let fileNames: string[] = [];
    try {
      const dir = workspace.requirePaths().rowPagesDir(summary.id);
      const entries = await fileService.readDir(dir);
      fileNames = entries.filter((entry) => entry.endsWith(".md")).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    folders.push({ databaseId: summary.id, name: summary.name, fileNames });
  }
  return { topLevelPages, databases: folders };
}

function noopAppConfig(): AppConfigService {
  return {
    load: async () => ({ active: null, recents: [], gitSyncByWorkspace: {} }),
    save: async () => undefined,
    touch: async () => undefined,
    forget: async () => undefined
  } as unknown as AppConfigService;
}
