import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { createMainWindow } from "./window.js";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { AddFieldInput, BatchRowsInput, CopyFieldToSystemTimeInput, CreateDatabaseInput, CreatePageInput, CreateViewInput, CreateWorkspaceInput, DeleteDatabaseTemplateInput, DeleteRowInput, DeleteViewInput, DuplicateRowInput, DuplicateViewInput, GitSyncSettingsInput, NotionAuditInput, PagesTree, PatchViewInput, PermanentlyDeleteFieldInput, PermanentlyDeleteRowInput, RecordValue, ReorderFieldsInput, ReorderViewsInput, RestoreFieldInput, RestoreRowInput, SaveDatabaseTemplateInput, SetDefaultViewInput, SetRowPageFullWidthInput, SetRowPageSmallTextInput, UpdateCellInput, UpdateDatabaseMetaInput, UpdateFieldInput, UpdatePageInput, UpdateRowPageInput, UpdateViewInput } from "../shared/types.js";
import { AppConfigService } from "./services/app-config-service.js";
import type { DatabaseService } from "./services/database-service.js";
import type { NotionImportOptions } from "./services/notion-import-service.js";
import { PageService } from "./services/page-service.js";
import { PagesDatabaseService } from "./services/pages-database-service.js";
import type { RowPagesService } from "./services/row-pages-service.js";
import type { SearchQueryOptions } from "./services/search-service.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { fileService } from "./services/file-service.js";
import { ipcMethodIdFromChannel, LotionApiMetricsRecorder } from "../shared/customer-api-contract.js";
import { StartupIndexCacheService } from "./services/startup-index-cache-service.js";

export function registerIpc(workspace: WorkspaceService, appConfig: AppConfigService): void {
  const pageRecords = new PagesDatabaseService(workspace);
  const pages = new PageService(workspace, pageRecords);
  const databaseContext = lazyService(async () => {
    const [{ DatabaseService }, { RowPagesService }] = await Promise.all([
      import("./services/database-service.js"),
      import("./services/row-pages-service.js")
    ]);
    const databases = new DatabaseService(workspace, pageRecords);
    const rowPages = new RowPagesService(workspace, databases, pageRecords);
    databases.setRowPagesService(rowPages);
    return { databases, rowPages };
  });
  const databases = lazyObject<DatabaseService>(() => databaseContext().then((context) => context.databases));
  const rowPages = lazyObject<RowPagesService>(() => databaseContext().then((context) => context.rowPages));
  const startupIndex = new StartupIndexCacheService(
    workspace,
    pages,
    databases,
    pageRecords,
    appConfig.localCacheRoot()
  );
  const attachments = lazyService(async () => {
    const { AttachmentService } = await import("./services/attachment-service.js");
    return new AttachmentService(workspace);
  });
  const entities = lazyService(async () => {
    const { EntitiesDatabaseService } = await import("./services/entities-database-service.js");
    const service = new EntitiesDatabaseService(workspace);
    service.subscribeBacklinkUpdates(() => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send("entities:backlinksUpdated");
      }
    });
    return service;
  });
  const gitContext = lazyService(async () => {
    const [{ GitService }, { GitSyncScheduler }] = await Promise.all([
      import("./services/git-service.js"),
      import("./services/git-sync-scheduler.js")
    ]);
    const git = new GitService(workspace, appConfig);
    return { git, scheduler: new GitSyncScheduler(git) };
  });
  const icons = lazyService(async () => {
    const { IconsService } = await import("./services/icons-service.js");
    const service = new IconsService(workspace, pages);
    service.setDatabaseService((await databaseContext()).databases);
    return service;
  });
  const notion = lazyService(async () => {
    const { NotionImportService } = await import("./services/notion-import-service.js");
    return new NotionImportService(appConfig);
  });
  const search = lazyService(async () => {
    const { SearchService } = await import("./services/search-service.js");
    return new SearchService(workspace);
  });
  const pluginStorage = lazyService(async () => {
    const { PluginStorageService } = await import("./services/plugin-storage-service.js");
    return new PluginStorageService(workspace);
  });
  let gitRefreshTimer: NodeJS.Timeout | undefined;
  const scheduleGitRefresh = () => {
    if (gitRefreshTimer) clearTimeout(gitRefreshTimer);
    gitRefreshTimer = setTimeout(() => {
      gitRefreshTimer = undefined;
      void gitContext().then(({ scheduler }) => scheduler.refresh())
        .catch((error) => console.warn("[lotion git] deferred scheduler refresh failed", error));
    }, 5_000);
    gitRefreshTimer.unref();
  };
  const shellOpenDryRun = {
    enabled: false,
    requests: [] as string[]
  };
  const apiMetrics = new LotionApiMetricsRecorder({ maxEntries: 1000 });
  const handle = (
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>
  ): void => {
    ipcMain.handle(channel, async (event, ...args) =>
      apiMetrics.measure({
        surface: "electron-ipc",
        methodId: ipcMethodIdFromChannel(channel),
        channel
      }, () => listener(event, ...args))
    );
  };

  ipcMain.on("debug:openLog", (_event, payload: { label?: string; detail?: Record<string, unknown> }) => {
    if (!payload?.label) return;
    apiMetrics.record({
      surface: "electron-ipc",
      methodId: "debug.openLog",
      channel: "debug:openLog",
      durationMs: 0,
      ok: true
    });
    console.log(`[lotion open] renderer.${payload.label}`, payload.detail ?? {});
  });
  handle("debug:setShellOpenDryRun", (_event, enabled: boolean) => {
    shellOpenDryRun.enabled = Boolean(enabled);
    if (!shellOpenDryRun.enabled) shellOpenDryRun.requests = [];
    return { enabled: shellOpenDryRun.enabled, requests: [...shellOpenDryRun.requests] };
  });
  handle("debug:getShellOpenRequests", () => [...shellOpenDryRun.requests]);
  handle("debug:clearShellOpenRequests", () => {
    shellOpenDryRun.requests = [];
    return [];
  });
  handle("debug:failNextDatabaseViewWrite", (_event, message?: string) => {
    databases.failNextViewWriteForDebug(message);
    return { armed: true };
  });
  handle("debug:failNextDatabaseBundleWrite", (_event, message?: string) => {
    databases.failNextBundleWriteForDebug(message);
    return { armed: true };
  });
  handle("debug:failNextDatabaseMetaWrite", (_event, message?: string) => {
    databases.failNextMetaWriteForDebug(message);
    return { armed: true };
  });
  handle("debug:failNextPageMetadataWrite", (_event, message?: string) => {
    pages.failNextMetadataWriteForDebug(message);
    return { armed: true };
  });
  handle("metrics:list", (_event, options?: { limit?: number }) => apiMetrics.list(options));
  handle("metrics:summary", () => apiMetrics.summary());
  handle("metrics:clear", () => apiMetrics.clear());

  handle("workspace:create", async (_event, input: CreateWorkspaceInput) => {
    const manifest = await workspace.create(input);
    scheduleGitRefresh();
    return manifest;
  });
  handle("workspace:open", async (_event, path?: string) => {
    const manifest = await workspace.open(path);
    scheduleGitRefresh();
    return manifest;
  });
  handle("workspace:getManifest", () => workspace.getManifest());
  handle("workspace:getStartupIndex", () => startupIndex.load());
  handle("workspace:listRowPageFiles", (_event, databaseId: string) => startupIndex.listRowPageFiles(databaseId));

  handle("pages:list", () => pages.list());
  handle("pages:create", (_event, input: CreatePageInput) => pages.create(input));
  handle("pages:duplicate", (_event, id: string) => pages.duplicate(id));
  handle("pages:get", (_event, id: string) => pages.get(id));
  handle("pages:update", (_event, payload: { id: string; input: UpdatePageInput }) => pages.update(payload.id, payload.input));
  handle("pages:rename", (_event, payload: { id: string; title: string }) => pages.rename(payload.id, payload.title));
  handle("pages:delete", (_event, id: string) => pages.delete(id));

  handle("databases:list", () => databases.list());
  handle("databases:listStats", () => databases.listStats());
  handle("databases:refreshStats", () => databases.refreshStats());
  handle("databases:create", (_event, input: CreateDatabaseInput) => databases.create(input));
  handle("databases:get", (_event, id: string) => databases.get(id));
  handle("databases:delete", (_event, id: string) => databases.delete(id));
  handle("databases:addField", (_event, payload: { id: string; input: AddFieldInput }) => databases.addField(payload.id, payload.input));
  handle("databases:updateMeta", (_event, input: UpdateDatabaseMetaInput) => databases.updateMeta(input));
  handle("databases:updateField", (_event, input: UpdateFieldInput) => databases.updateField(input));
  handle("databases:copyFieldToSystemTime", (_event, input: CopyFieldToSystemTimeInput) =>
    databases.copyFieldToSystemTime(input)
  );
  handle("databases:reorderFields", (_event, input: ReorderFieldsInput) => databases.reorderFields(input));
  handle("databases:deleteField", (_event, payload: { databaseId: string; fieldId: string }) =>
    databases.deleteField(payload.databaseId, payload.fieldId)
  );
  handle("databases:restoreField", (_event, input: RestoreFieldInput) => databases.restoreField(input));
  handle("databases:permanentlyDeleteField", (_event, input: PermanentlyDeleteFieldInput) => databases.permanentlyDeleteField(input));
  handle("databases:updateCell", (_event, input: UpdateCellInput) => databases.updateCell(input));
  handle("databases:addRow", (_event, payload: { databaseId: string; templateId?: string; initialValues?: Record<string, RecordValue> } | string) => {
    if (typeof payload === "string") return databases.addRow(payload);
    return databases.addRow(payload.databaseId, payload.templateId, payload.initialValues);
  });
  handle("databases:deleteRow", (_event, input: DeleteRowInput) => databases.deleteRow(input));
  handle("databases:duplicateRow", (_event, input: DuplicateRowInput) => databases.duplicateRow(input));
  handle("databases:restoreRow", (_event, input: RestoreRowInput) => databases.restoreRow(input));
  handle("databases:permanentlyDeleteRow", (_event, input: PermanentlyDeleteRowInput) => databases.permanentlyDeleteRow(input));
  handle("databases:batchRows", (_event, input: BatchRowsInput) => databases.batchRows(input));
  handle("databases:saveTemplate", (_event, input: SaveDatabaseTemplateInput) => databases.saveTemplate(input));
  handle("databases:deleteTemplate", (_event, input: DeleteDatabaseTemplateInput) => databases.deleteTemplate(input));

  handle("views:create", (_event, input: CreateViewInput) => databases.createView(input));
  handle("views:duplicate", (_event, input: DuplicateViewInput) => databases.duplicateView(input));
  handle("views:update", (_event, input: UpdateViewInput) => databases.updateView(input.databaseId, input.view));
  handle("views:patch", (_event, input: PatchViewInput) => databases.patchView(input));
  handle("views:reorder", (_event, input: ReorderViewsInput) => databases.reorderViews(input));
  handle("views:delete", (_event, input: DeleteViewInput) => databases.deleteView(input));
  handle("views:setDefault", (_event, input: SetDefaultViewInput) => databases.setDefaultView(input));

  handle("rowPages:open", (_event, payload: { databaseId: string; rowId: string }) =>
    rowPages.open(payload.databaseId, payload.rowId)
  );
  handle("rowPages:openByFilename", (_event, payload: { databaseId: string; fileName: string }) =>
    rowPages.openByFilename(payload.databaseId, payload.fileName)
  );
  handle("rowPages:update", (_event, input: UpdateRowPageInput) =>
    rowPages.update(input.databaseId, input.rowId, input.markdown)
  );
  handle("rowPages:setFullWidth", (_event, input: SetRowPageFullWidthInput) =>
    rowPages.setFullWidth(input.databaseId, input.rowId, input.fullWidth)
  );
  handle("rowPages:setSmallText", (_event, input: SetRowPageSmallTextInput) =>
    rowPages.setSmallText(input.databaseId, input.rowId, input.smallText)
  );

  handle("workspace:getPagesTree", async (): Promise<PagesTree> => {
    const [topLevelPages, summaries] = await Promise.all([pages.list(), databases.list()]);
    const filesByDatabase = await pageRecords.listRowPageFilesByDatabase(summaries.map((summary) => summary.id));
    const folders = summaries.map((summary) => ({
      databaseId: summary.id,
      name: summary.name,
      fileNames: filesByDatabase.get(summary.id) ?? []
    }));
    return { topLevelPages, databases: folders };
  });

  handle("git:status", async () => (await gitContext()).git.status());
  handle("git:backupNow", async (_event, message?: string) => (await gitContext()).git.backupNow(message));
  handle("git:initRepository", async () => (await gitContext()).git.initRepository());
  handle("git:settings", async () => (await gitContext()).git.settings());
  handle("git:updateSettings", async (_event, input: GitSyncSettingsInput) => {
    const { git, scheduler } = await gitContext();
    const settings = await git.updateSettings(input);
    await scheduler.refresh();
    return settings;
  });
  handle("git:configureRemote", async () => (await gitContext()).git.configureRemote());
  handle("git:testRemoteAccess", async () => (await gitContext()).git.testRemoteAccess());
  handle("git:push", async () => (await gitContext()).git.push());
  handle("git:fetchStatus", async () => (await gitContext()).git.fetchStatus());
  handle("git:pull", async () => (await gitContext()).git.pull());
  handle("git:listPageHistory", async (_event, pageId: string) => {
    const { git } = await gitContext();
    const page = await pages.get(pageId);
    const bodyPath = await pages.bodyPath(pageId);
    return git.listFileHistory(bodyPath, { pageId, title: page.meta.title });
  });
  handle("git:previewPageVersion", async (_event, payload: { pageId: string; sha: string }) => {
    const { git } = await gitContext();
    const page = await pages.get(payload.pageId);
    const bodyPath = await pages.bodyPath(payload.pageId);
    return git.previewFileVersion(bodyPath, payload.sha, { pageId: payload.pageId, title: page.meta.title });
  });
  handle("git:restorePageVersion", async (_event, payload: { pageId: string; sha: string }) => {
    const { git } = await gitContext();
    const page = await pages.get(payload.pageId);
    const bodyPath = await pages.bodyPath(payload.pageId);
    const preview = await git.previewFileVersion(bodyPath, payload.sha, { pageId: payload.pageId, title: page.meta.title });
    return pages.update(payload.pageId, { markdown: preview.selectedMarkdown });
  });
  handle("git:squashPreflight", async () => (await gitContext()).git.squashPreflight());
  handle("git:pickSshKey", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select SSH private key",
      properties: ["openFile", "showHiddenFiles"]
    });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  handle("icons:setForPage", async (_event, pageId: string) => (await icons()).setForPage(pageId));
  handle("icons:clearForPage", async (_event, pageId: string) => (await icons()).clearForPage(pageId));
  handle("icons:setForDatabase", async (_event, dbId: string) => (await icons()).setForDatabase(dbId));
  handle("icons:clearForDatabase", async (_event, dbId: string) => (await icons()).clearForDatabase(dbId));
  handle("icons:setForWorkspace", async () => (await icons()).setForWorkspace());
  handle("icons:clearForWorkspace", async () => (await icons()).clearForWorkspace());
  handle("covers:setForPage", async (_event, pageId: string) => (await icons()).setCoverForPage(pageId));
  handle("covers:clearForPage", async (_event, pageId: string) => (await icons()).clearCoverForPage(pageId));
  handle("covers:setForDatabase", async (_event, dbId: string) => (await icons()).setCoverForDatabase(dbId));
  handle("covers:clearForDatabase", async (_event, dbId: string) => (await icons()).clearCoverForDatabase(dbId));
  handle("covers:setOffsetForDatabase", async (_event, payload: { databaseId: string; offset: number }) =>
    (await icons()).setCoverOffsetForDatabase(payload.databaseId, payload.offset)
  );
  handle("covers:setForRow", async (_event, payload: { databaseId: string; rowId: string }) =>
    (await icons()).setCoverForRow(payload.databaseId, payload.rowId)
  );
  handle("covers:clearForRow", async (_event, payload: { databaseId: string; rowId: string }) =>
    (await icons()).clearCoverForRow(payload.databaseId, payload.rowId)
  );
  handle("covers:setOffsetForRow", async (_event, payload: { databaseId: string; rowId: string; offset: number }) =>
    (await icons()).setCoverOffsetForRow(payload.databaseId, payload.rowId, payload.offset)
  );

  handle("search:query", async (_event, payload: string | { pattern?: string; options?: unknown }) => {
    const service = await search();
    if (typeof payload === "string") return service.query(payload);
    return service.query(String(payload?.pattern ?? ""), normalizeSearchQueryOptions(payload?.options));
  });
  handle("entities:resolve", async (_event, id: string) => (await entities()).resolve(id));
  handle("entities:backlinks", async (_event, id: string) => (await entities()).backlinks(id));
  handle("attachments:list", async () => (await attachments()).list());
  handle("attachments:get", async (_event, sha: string) => (await attachments()).get(sha));
  handle("attachments:add", async (_event, payload: { data: Uint8Array; ext: string }) =>
    (await attachments()).add(new Uint8Array(payload.data), payload.ext)
  );
  handle("attachments:importFiles", async (_event, payload: { paths: string[] }) =>
    (await attachments()).importFiles(payload.paths)
  );

  handle("notion:pickFolder", async () => (await notion()).pickFolder());
  handle("notion:pickTarget", async () => (await notion()).pickTargetFolder());
  handle("notion:scan", async (_event, folderPaths: string | string[]) => (await notion()).scan(folderPaths));
  handle(
    "notion:import",
    async (event, payload: { sourcePath?: string; sourcePaths?: string[]; targetPath: string; force?: boolean; options?: NotionImportOptions }) =>
      // Pipe per-phase progress events back to the originating webContents
      // so the dialog can paint a live progress bar. Throttling lives in
      // the service; here we just forward every event.
      (await notion()).runImport(
        payload.sourcePaths?.length ? payload.sourcePaths : payload.sourcePath ?? "",
        payload.targetPath,
        payload.force ?? false,
        payload.options,
        (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send("notion:progress", progress);
        }
      )
  );
  handle("notion:audit", async (_event, input: NotionAuditInput) => {
    const { runNotionAudit } = await import("./services/notion-audit-service.js");
    return runNotionAudit({
      ...input,
      workspacePath: input.workspacePath || workspace.requirePaths().root
    });
  });

  handle("workspace:listRecent", () => workspace.listRecent());
  handle("workspace:forget", (_event, path: string) => workspace.forget(path));
  handle("workspace:openPicker", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open workspace",
      properties: ["openDirectory"],
      message: "Choose a folder that contains a `lotion.json` file."
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const manifest = await workspace.open(result.filePaths[0]);
    scheduleGitRefresh();
    return manifest;
  });

  handle("favorites:list", () => workspace.listFavorites());
  handle("favorites:toggle", (_event, item) => workspace.toggleFavorite(item));
  handle("workspace:reorderPages", (_event, ids: string[]) => workspace.reorderPages(ids));
  handle("workspace:reorderDatabases", (_event, ids: string[]) => workspace.reorderDatabases(ids));
  handle("workspace:listRecents", () => workspace.listRecents());
  handle("workspace:pushRecent", (_event, item) => workspace.pushRecent(item));
  handle("plugins:appendJsonl", async (_event, payload: { pluginId: string; fileName: string; value: unknown }) =>
    (await pluginStorage()).appendJsonl(payload.pluginId, payload.fileName, payload.value)
  );
  handle("plugins:readJsonl", async (_event, payload: { pluginId: string; fileName: string; options?: { limit?: number } }) =>
    (await pluginStorage()).readJsonl(payload.pluginId, payload.fileName, payload.options)
  );
  handle("plugins:readJson", async (_event, payload: { pluginId: string; fileName: string }) =>
    (await pluginStorage()).readJson(payload.pluginId, payload.fileName)
  );
  handle("plugins:writeJson", async (_event, payload: { pluginId: string; fileName: string; value: unknown }) =>
    (await pluginStorage()).writeJson(payload.pluginId, payload.fileName, payload.value)
  );
  handle("plugins:deleteFile", async (_event, payload: { pluginId: string; fileName: string }) =>
    (await pluginStorage()).delete(payload.pluginId, payload.fileName)
  );
  handle("windows:openNew", () => {
    createMainWindow({ openDevTools: false });
  });
  handle("environment:llmDefaults", () => readLLMEnvironmentDefaults());
  handle("environment:openaiDefaults", () => readOpenAIEnvironmentDefaults());

  // Open a link in the system's default handler. Protocol URLs go to
  // the browser (or mail client, etc.); plain relative paths are
  // resolved against the open workspace and handed to shell.openPath.
  handle("shell:openLink", async (_event, url: string): Promise<string> => {
    if (!url) return "empty url";
    if (shellOpenDryRun.enabled) {
      shellOpenDryRun.requests.push(url);
      return "";
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      await shell.openExternal(url);
      return "";
    }
    if (isAbsolute(url)) {
      return await shell.openPath(url);
    }
    try {
      const root = workspace.requirePaths().root;
      const target = resolvePath(root, url);
      // Refuse paths that escape the workspace boundary.
      if (target !== root && !target.startsWith(root + "/")) {
        return "outside workspace";
      }
      return await shell.openPath(target);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}

function lazyService<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    promise ??= factory();
    return promise;
  };
}

function lazyObject<T extends object>(factory: () => Promise<T>): T {
  return new Proxy({} as T, {
    get(_target, property) {
      return (...args: unknown[]) => factory().then((service) => {
        const method = Reflect.get(service, property);
        if (typeof method !== "function") {
          throw new TypeError(`Lazy service property ${String(property)} is not callable`);
        }
        return Reflect.apply(method, service, args);
      });
    }
  });
}

interface OpenAIEnvironmentDefaults {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

async function readOpenAIEnvironmentDefaults(): Promise<OpenAIEnvironmentDefaults> {
  return (await readLLMEnvironmentDefaults()).openai ?? {};
}

interface LLMEnvironmentDefaults {
  openai?: OpenAIEnvironmentDefaults;
  deepseek?: OpenAIEnvironmentDefaults;
  custom?: OpenAIEnvironmentDefaults;
}

async function readLLMEnvironmentDefaults(): Promise<LLMEnvironmentDefaults> {
  const dotEnv = await readDotEnv(resolvePath(process.cwd(), ".env"));
  const openai = providerEnvironmentDefaults(dotEnv, "OPENAI");
  const deepseek = providerEnvironmentDefaults(dotEnv, "DEEPSEEK");
  const custom = providerEnvironmentDefaults(dotEnv, "LLM");
  return {
    ...(hasEnvironmentDefaults(openai) ? { openai } : {}),
    ...(hasEnvironmentDefaults(deepseek) ? { deepseek } : {}),
    ...(hasEnvironmentDefaults(custom) ? { custom } : {})
  };
}

function providerEnvironmentDefaults(fileEnv: Record<string, string>, prefix: string): OpenAIEnvironmentDefaults {
  const apiKey = envValue(`${prefix}_API_KEY`, fileEnv);
  const model = envValue(`${prefix}_MODEL`, fileEnv);
  const baseUrl = envValue(`${prefix}_BASE_URL`, fileEnv);
  return {
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    ...(baseUrl ? { baseUrl } : {})
  };
}

function hasEnvironmentDefaults(defaults: OpenAIEnvironmentDefaults): boolean {
  return !!(defaults.apiKey || defaults.model || defaults.baseUrl);
}

function normalizeSearchQueryOptions(value: unknown): SearchQueryOptions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const sort = (value as { sort?: unknown }).sort;
  if (
    sort === "relevance" ||
    sort === "updated_desc" ||
    sort === "updated_asc" ||
    sort === "created_desc" ||
    sort === "created_asc"
  ) {
    return { sort };
  }
  return undefined;
}

async function readDotEnv(path: string): Promise<Record<string, string>> {
  if (!fileService.exists(path)) return {};
  try {
    return parseDotEnv(await fileService.readText(path));
  } catch {
    return {};
  }
}

function envValue(key: string, fileEnv: Record<string, string>): string {
  return (process.env[key] || fileEnv[key] || "").trim();
}

function parseDotEnv(raw: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const equals = normalized.indexOf("=");
    if (equals <= 0) continue;
    const key = normalized.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    values[key] = unquoteDotEnvValue(normalized.slice(equals + 1).trim());
  }
  return values;
}

function unquoteDotEnvValue(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  const comment = value.search(/\s#/);
  return comment >= 0 ? value.slice(0, comment).trim() : value;
}
