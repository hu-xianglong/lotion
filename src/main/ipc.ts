import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { createMainWindow } from "./window.js";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type { AddFieldInput, CreateDatabaseInput, CreatePageInput, CreateViewInput, CreateWorkspaceInput, DeleteDatabaseTemplateInput, DeleteRowInput, DeleteViewInput, DuplicateViewInput, GitSyncSettingsInput, NotionAuditInput, PagesTree, PagesTreeDatabaseFolder, SaveDatabaseTemplateInput, SetDefaultViewInput, SetRowPageFullWidthInput, SetRowPageSmallTextInput, UpdateCellInput, UpdateDatabaseMetaInput, UpdateFieldInput, UpdatePageInput, UpdateRowPageInput, UpdateViewInput } from "../shared/types.js";
import { AppConfigService } from "./services/app-config-service.js";
import { AttachmentService } from "./services/attachment-service.js";
import { DatabaseService } from "./services/database-service.js";
import { EntitiesDatabaseService } from "./services/entities-database-service.js";
import { GitService } from "./services/git-service.js";
import { GitSyncScheduler } from "./services/git-sync-scheduler.js";
import { IconsService } from "./services/icons-service.js";
import { NotionImportService } from "./services/notion-import-service.js";
import type { NotionImportOptions } from "./services/notion-import-service.js";
import { runNotionAudit } from "./services/notion-audit-service.js";
import { PageService } from "./services/page-service.js";
import { PluginStorageService } from "./services/plugin-storage-service.js";
import { RowPagesService } from "./services/row-pages-service.js";
import { SearchService } from "./services/search-service.js";
import type { SearchQueryOptions } from "./services/search-service.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { fileService } from "./services/file-service.js";
import { ipcMethodIdFromChannel, LotionApiMetricsRecorder } from "../shared/customer-api-contract.js";

export function registerIpc(workspace: WorkspaceService, appConfig: AppConfigService): void {
  const pages = new PageService(workspace);
  const attachments = new AttachmentService(workspace);
  const databases = new DatabaseService(workspace);
  const entities = new EntitiesDatabaseService(workspace);
  const rowPages = new RowPagesService(workspace, databases);
  databases.setRowPagesService(rowPages);
  const git = new GitService(workspace, appConfig);
  const icons = new IconsService(workspace, pages);
  icons.setDatabaseService(databases);
  const notion = new NotionImportService(appConfig);
  const search = new SearchService(workspace);
  const pluginStorage = new PluginStorageService(workspace);
  const gitScheduler = new GitSyncScheduler(git);
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
  handle("metrics:list", (_event, options?: { limit?: number }) => apiMetrics.list(options));
  handle("metrics:summary", () => apiMetrics.summary());
  handle("metrics:clear", () => apiMetrics.clear());

  handle("workspace:create", async (_event, input: CreateWorkspaceInput) => {
    const manifest = await workspace.create(input);
    await gitScheduler.refresh();
    return manifest;
  });
  handle("workspace:open", async (_event, path?: string) => {
    const manifest = await workspace.open(path);
    await gitScheduler.refresh();
    return manifest;
  });
  handle("workspace:getManifest", () => workspace.getManifest());

  handle("pages:list", () => pages.list());
  handle("pages:create", (_event, input: CreatePageInput) => pages.create(input));
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
  handle("databases:deleteField", (_event, payload: { databaseId: string; fieldId: string }) =>
    databases.deleteField(payload.databaseId, payload.fieldId)
  );
  handle("databases:updateCell", (_event, input: UpdateCellInput) => databases.updateCell(input));
  handle("databases:addRow", (_event, payload: { databaseId: string; templateId?: string } | string) => {
    if (typeof payload === "string") return databases.addRow(payload);
    return databases.addRow(payload.databaseId, payload.templateId);
  });
  handle("databases:deleteRow", (_event, input: DeleteRowInput) => databases.deleteRow(input));
  handle("databases:saveTemplate", (_event, input: SaveDatabaseTemplateInput) => databases.saveTemplate(input));
  handle("databases:deleteTemplate", (_event, input: DeleteDatabaseTemplateInput) => databases.deleteTemplate(input));

  handle("views:create", (_event, input: CreateViewInput) => databases.createView(input));
  handle("views:duplicate", (_event, input: DuplicateViewInput) => databases.duplicateView(input));
  handle("views:update", (_event, input: UpdateViewInput) => databases.updateView(input.databaseId, input.view));
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
  });

  handle("git:status", () => git.status());
  handle("git:backupNow", (_event, message?: string) => git.backupNow(message));
  handle("git:initRepository", () => git.initRepository());
  handle("git:settings", () => git.settings());
  handle("git:updateSettings", async (_event, input: GitSyncSettingsInput) => {
    const settings = await git.updateSettings(input);
    await gitScheduler.refresh();
    return settings;
  });
  handle("git:configureRemote", () => git.configureRemote());
  handle("git:testRemoteAccess", () => git.testRemoteAccess());
  handle("git:push", () => git.push());
  handle("git:fetchStatus", () => git.fetchStatus());
  handle("git:pull", () => git.pull());
  handle("git:listPageHistory", async (_event, pageId: string) => {
    const page = await pages.get(pageId);
    const bodyPath = await pages.bodyPath(pageId);
    return git.listFileHistory(bodyPath, { pageId, title: page.meta.title });
  });
  handle("git:previewPageVersion", async (_event, payload: { pageId: string; sha: string }) => {
    const page = await pages.get(payload.pageId);
    const bodyPath = await pages.bodyPath(payload.pageId);
    return git.previewFileVersion(bodyPath, payload.sha, { pageId: payload.pageId, title: page.meta.title });
  });
  handle("git:restorePageVersion", async (_event, payload: { pageId: string; sha: string }) => {
    const page = await pages.get(payload.pageId);
    const bodyPath = await pages.bodyPath(payload.pageId);
    const preview = await git.previewFileVersion(bodyPath, payload.sha, { pageId: payload.pageId, title: page.meta.title });
    return pages.update(payload.pageId, { markdown: preview.selectedMarkdown });
  });
  handle("git:squashPreflight", () => git.squashPreflight());
  handle("git:pickSshKey", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select SSH private key",
      properties: ["openFile", "showHiddenFiles"]
    });
    if (result.canceled) return null;
    return result.filePaths[0] ?? null;
  });

  handle("icons:setForPage", (_event, pageId: string) => icons.setForPage(pageId));
  handle("icons:clearForPage", (_event, pageId: string) => icons.clearForPage(pageId));
  handle("icons:setForDatabase", (_event, dbId: string) => icons.setForDatabase(dbId));
  handle("icons:clearForDatabase", (_event, dbId: string) => icons.clearForDatabase(dbId));
  handle("icons:setForWorkspace", () => icons.setForWorkspace());
  handle("icons:clearForWorkspace", () => icons.clearForWorkspace());
  handle("covers:setForPage", (_event, pageId: string) => icons.setCoverForPage(pageId));
  handle("covers:clearForPage", (_event, pageId: string) => icons.clearCoverForPage(pageId));
  handle("covers:setForDatabase", (_event, dbId: string) => icons.setCoverForDatabase(dbId));
  handle("covers:clearForDatabase", (_event, dbId: string) => icons.clearCoverForDatabase(dbId));
  handle("covers:setOffsetForDatabase", (_event, payload: { databaseId: string; offset: number }) =>
    icons.setCoverOffsetForDatabase(payload.databaseId, payload.offset)
  );
  handle("covers:setForRow", (_event, payload: { databaseId: string; rowId: string }) =>
    icons.setCoverForRow(payload.databaseId, payload.rowId)
  );
  handle("covers:clearForRow", (_event, payload: { databaseId: string; rowId: string }) =>
    icons.clearCoverForRow(payload.databaseId, payload.rowId)
  );
  handle("covers:setOffsetForRow", (_event, payload: { databaseId: string; rowId: string; offset: number }) =>
    icons.setCoverOffsetForRow(payload.databaseId, payload.rowId, payload.offset)
  );

  handle("search:query", (_event, payload: string | { pattern?: string; options?: unknown }) => {
    if (typeof payload === "string") return search.query(payload);
    return search.query(String(payload?.pattern ?? ""), normalizeSearchQueryOptions(payload?.options));
  });
  handle("entities:resolve", (_event, id: string) => entities.resolve(id));
  handle("entities:backlinks", (_event, id: string) => entities.backlinks(id));
  handle("attachments:list", () => attachments.list());
  handle("attachments:get", (_event, sha: string) => attachments.get(sha));
  handle("attachments:add", (_event, payload: { data: Uint8Array; ext: string }) =>
    attachments.add(new Uint8Array(payload.data), payload.ext)
  );
  handle("attachments:importFiles", (_event, payload: { paths: string[] }) =>
    attachments.importFiles(payload.paths)
  );

  handle("notion:pickFolder", () => notion.pickFolder());
  handle("notion:pickTarget", () => notion.pickTargetFolder());
  handle("notion:scan", (_event, folderPath: string) => notion.scan(folderPath));
  handle(
    "notion:import",
    (event, payload: { sourcePath: string; targetPath: string; force?: boolean; options?: NotionImportOptions }) =>
      // Pipe per-phase progress events back to the originating webContents
      // so the dialog can paint a live progress bar. Throttling lives in
      // the service; here we just forward every event.
      notion.runImport(
        payload.sourcePath,
        payload.targetPath,
        payload.force ?? false,
        payload.options,
        (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send("notion:progress", progress);
        }
      )
  );
  handle("notion:audit", (_event, input: NotionAuditInput) =>
    runNotionAudit({
      ...input,
      workspacePath: input.workspacePath || workspace.requirePaths().root
    })
  );

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
    await gitScheduler.refresh();
    return manifest;
  });

  handle("favorites:list", () => workspace.listFavorites());
  handle("favorites:toggle", (_event, item) => workspace.toggleFavorite(item));
  handle("workspace:reorderPages", (_event, ids: string[]) => workspace.reorderPages(ids));
  handle("workspace:reorderDatabases", (_event, ids: string[]) => workspace.reorderDatabases(ids));
  handle("workspace:listRecents", () => workspace.listRecents());
  handle("workspace:pushRecent", (_event, item) => workspace.pushRecent(item));
  handle("plugins:appendJsonl", (_event, payload: { pluginId: string; fileName: string; value: unknown }) =>
    pluginStorage.appendJsonl(payload.pluginId, payload.fileName, payload.value)
  );
  handle("plugins:readJsonl", (_event, payload: { pluginId: string; fileName: string; options?: { limit?: number } }) =>
    pluginStorage.readJsonl(payload.pluginId, payload.fileName, payload.options)
  );
  handle("plugins:readJson", (_event, payload: { pluginId: string; fileName: string }) =>
    pluginStorage.readJson(payload.pluginId, payload.fileName)
  );
  handle("plugins:writeJson", (_event, payload: { pluginId: string; fileName: string; value: unknown }) =>
    pluginStorage.writeJson(payload.pluginId, payload.fileName, payload.value)
  );
  handle("plugins:deleteFile", (_event, payload: { pluginId: string; fileName: string }) =>
    pluginStorage.delete(payload.pluginId, payload.fileName)
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
