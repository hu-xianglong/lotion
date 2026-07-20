import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { LotionApi } from "./lotion-api.js";

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api: LotionApi = {
  workspace: {
    create: (input) => invoke("workspace:create", input),
    open: (path) => invoke("workspace:open", path),
    getManifest: () => invoke("workspace:getManifest"),
    getPagesTree: () => invoke("workspace:getPagesTree"),
    listRecent: () => invoke("workspace:listRecent"),
    forget: (path) => invoke("workspace:forget", path),
    openPicker: () => invoke("workspace:openPicker"),
    reorderPages: (ids) => invoke("workspace:reorderPages", ids),
    reorderDatabases: (ids) => invoke("workspace:reorderDatabases", ids),
    listRecents: () => invoke("workspace:listRecents"),
    pushRecent: (item) => invoke("workspace:pushRecent", item)
  },
  pages: {
    list: () => invoke("pages:list"),
    create: (input) => invoke("pages:create", input),
    get: (id) => invoke("pages:get", id),
    update: (id, input) => invoke("pages:update", { id, input }),
    rename: (id, title) => invoke("pages:rename", { id, title }),
    delete: (id) => invoke("pages:delete", id)
  },
  databases: {
    list: () => invoke("databases:list"),
    listStats: () => invoke("databases:listStats"),
    refreshStats: () => invoke("databases:refreshStats"),
    create: (input) => invoke("databases:create", input),
    get: (id) => invoke("databases:get", id),
    delete: (id) => invoke("databases:delete", id),
    updateMeta: (input) => invoke("databases:updateMeta", input),
    addField: (id, input) => invoke("databases:addField", { id, input }),
    updateField: (input) => invoke("databases:updateField", input),
    deleteField: (databaseId, fieldId) => invoke("databases:deleteField", { databaseId, fieldId }),
    updateCell: (input) => invoke("databases:updateCell", input),
    addRow: (databaseId, templateId) => invoke("databases:addRow", { databaseId, templateId }),
    deleteRow: (input) => invoke("databases:deleteRow", input),
    saveTemplate: (input) => invoke("databases:saveTemplate", input),
    deleteTemplate: (input) => invoke("databases:deleteTemplate", input)
  },
  views: {
    create: (input) => invoke("views:create", input),
    duplicate: (input) => invoke("views:duplicate", input),
    update: (input) => invoke("views:update", input),
    delete: (input) => invoke("views:delete", input),
    setDefault: (input) => invoke("views:setDefault", input)
  },
  rowPages: {
    open: (databaseId, rowId) => invoke("rowPages:open", { databaseId, rowId }),
    openByFilename: (databaseId, fileName) => invoke("rowPages:openByFilename", { databaseId, fileName }),
    update: (input) => invoke("rowPages:update", input),
    setFullWidth: (input) => invoke("rowPages:setFullWidth", input),
    setSmallText: (input) => invoke("rowPages:setSmallText", input)
  },
  git: {
    status: () => invoke("git:status"),
    backupNow: (message) => invoke("git:backupNow", message),
    initRepository: () => invoke("git:initRepository"),
    settings: () => invoke("git:settings"),
    updateSettings: (input) => invoke("git:updateSettings", input),
    configureRemote: () => invoke("git:configureRemote"),
    testRemoteAccess: () => invoke("git:testRemoteAccess"),
    push: () => invoke("git:push"),
    fetchStatus: () => invoke("git:fetchStatus"),
    pull: () => invoke("git:pull"),
    pickSshKey: () => invoke("git:pickSshKey"),
    listPageHistory: (pageId) => invoke("git:listPageHistory", pageId),
    previewPageVersion: (pageId, sha) => invoke("git:previewPageVersion", { pageId, sha }),
    restorePageVersion: (pageId, sha) => invoke("git:restorePageVersion", { pageId, sha }),
    squashPreflight: () => invoke("git:squashPreflight")
  },
  shell: {
    openLink: (url) => invoke("shell:openLink", url)
  },
  attachments: {
    list: () => invoke("attachments:list"),
    get: (sha) => invoke("attachments:get", sha),
    add: (data, ext) => invoke("attachments:add", { data, ext }),
    importDroppedFiles: (files) => {
      const paths = Array.from(files).map((file) => webUtils.getPathForFile(file)).filter(Boolean);
      return invoke("attachments:importFiles", { paths });
    }
  },
  search: {
    query: (pattern, options) => invoke("search:query", { pattern, options })
  },
  entities: {
    resolve: (id) => invoke("entities:resolve", id),
    backlinks: (id) => invoke("entities:backlinks", id)
  },
  icons: {
    setForPage: (pageId) => invoke("icons:setForPage", pageId),
    clearForPage: (pageId) => invoke("icons:clearForPage", pageId),
    setForDatabase: (databaseId) => invoke("icons:setForDatabase", databaseId),
    clearForDatabase: (databaseId) => invoke("icons:clearForDatabase", databaseId),
    setForWorkspace: () => invoke("icons:setForWorkspace"),
    clearForWorkspace: () => invoke("icons:clearForWorkspace")
  },
  covers: {
    setForPage: (pageId) => invoke("covers:setForPage", pageId),
    clearForPage: (pageId) => invoke("covers:clearForPage", pageId),
    setForDatabase: (databaseId) => invoke("covers:setForDatabase", databaseId),
    clearForDatabase: (databaseId) => invoke("covers:clearForDatabase", databaseId),
    setOffsetForDatabase: (databaseId, offset) =>
      invoke("covers:setOffsetForDatabase", { databaseId, offset }),
    setForRow: (databaseId, rowId) => invoke("covers:setForRow", { databaseId, rowId }),
    clearForRow: (databaseId, rowId) => invoke("covers:clearForRow", { databaseId, rowId }),
    setOffsetForRow: (databaseId, rowId, offset) =>
      invoke("covers:setOffsetForRow", { databaseId, rowId, offset })
  },
  windows: {
    openNew: () => invoke("windows:openNew")
  },
  environment: {
    llmDefaults: () => invoke("environment:llmDefaults"),
    openaiDefaults: () => invoke("environment:openaiDefaults")
  },
  plugins: {
    appendJsonl: (pluginId, fileName, value) =>
      invoke("plugins:appendJsonl", { pluginId, fileName, value }),
    readJsonl: (pluginId, fileName, options) =>
      invoke("plugins:readJsonl", { pluginId, fileName, options }),
    readJson: (pluginId, fileName) =>
      invoke("plugins:readJson", { pluginId, fileName }),
    writeJson: (pluginId, fileName, value) =>
      invoke("plugins:writeJson", { pluginId, fileName, value }),
    deleteFile: (pluginId, fileName) =>
      invoke("plugins:deleteFile", { pluginId, fileName })
  },
  favorites: {
    list: () => invoke("favorites:list"),
    toggle: (item) => invoke("favorites:toggle", item)
  },
  debug: {
    openLog: (label, detail) => ipcRenderer.send("debug:openLog", { label, detail }),
    setShellOpenDryRun: (enabled) => invoke("debug:setShellOpenDryRun", enabled),
    getShellOpenRequests: () => invoke("debug:getShellOpenRequests"),
    clearShellOpenRequests: () => invoke("debug:clearShellOpenRequests")
  },
  notion: {
    pickFolder: (kind) => invoke("notion:pickFolder", kind),
    pickTarget: () => invoke("notion:pickTarget"),
    scan: (sourcePaths) => invoke("notion:scan", sourcePaths),
    runImport: (payload) => invoke("notion:import", payload),
    audit: (input) => invoke("notion:audit", input),
    // Subscribe to per-phase progress events emitted by the importer.
    // Returns an unsubscribe function so the dialog can clean up.
    onProgress: (handler) => {
      const listener = (_event: unknown, progress: unknown) => handler(progress as never);
      ipcRenderer.on("notion:progress", listener);
      return () => ipcRenderer.removeListener("notion:progress", listener);
    }
  },
  metrics: {
    list: (options) => invoke("metrics:list", options),
    summary: () => invoke("metrics:summary"),
    clear: () => invoke("metrics:clear")
  }
};

contextBridge.exposeInMainWorld("lotion", api);
