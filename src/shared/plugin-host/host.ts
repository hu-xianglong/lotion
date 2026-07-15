import type {
  AICompleteRequest,
  AICompletionProvider,
  AttachmentPreviewProvider,
  BlockWidgetProvider,
  Command,
  DatabaseViewProvider,
  Disposable,
  FieldTypeProvider,
  ImporterProvider,
  PageAction,
  PluginStorageAPI,
  PluginManifest,
  SearchProvider,
  SettingsTab,
  SidebarItem,
  SyncProvider,
  UIAPI,
  WorkspaceAPI
} from "../plugin-api.js";
import { Registry } from "./registry.js";
import { InProcessEventBus } from "./event-bus.js";

/**
 * Process-specific bits the host can't construct itself — workspace
 * data access is wired differently in main (direct service calls) vs
 * renderer (IPC to main); same for UI primitives (notifications go
 * through Electron's renderer-side toast UI).
 *
 * Loader for main / renderer constructs the platform appropriate to
 * its process, then passes it to `new PluginHost(platform)`.
 */
export interface PluginHostPlatform {
  workspace: WorkspaceAPI;
  ui: UIAPI;
  storage?: PluginStorageHostAPI;
}

export interface PluginStorageHostAPI {
  appendJsonl(pluginId: string, fileName: string, value: unknown): Promise<void>;
  readJsonl<T = unknown>(pluginId: string, fileName: string, options?: { limit?: number }): Promise<T[]>;
  readJson<T = unknown>(pluginId: string, fileName: string): Promise<T | null>;
  writeJson(pluginId: string, fileName: string, value: unknown): Promise<void>;
  delete(pluginId: string, fileName: string): Promise<void>;
}

/**
 * Process-local plugin host. Owns the per-category provider
 * registries, the event bus, and the keyed-by-id catalogs (commands /
 * sidebar items / page actions / settings tabs).
 *
 * Two instances in any running Lotion: one in main, one in renderer.
 * The loader (TBD) bridges events + cross-process provider calls.
 */
export class PluginHost {
  // ── Provider registries (keyed by `type`) ─────────────────────────
  readonly fields = new Registry<FieldTypeProvider>("field-type");
  readonly views = new Registry<DatabaseViewProvider>("database-view");
  readonly blocks = new Registry<BlockWidgetProvider>("block-widget");
  readonly sync = new Registry<SyncProvider>("sync");
  readonly search = new Registry<SearchProvider>("search");
  readonly importers = new Registry<ImporterProvider>("importer");
  readonly previews = new Registry<AttachmentPreviewProvider>("attachment-preview");
  readonly aiProviders = new Registry<AICompletionProvider>("ai-completion");

  // ── Pub/sub ───────────────────────────────────────────────────────
  readonly events = new InProcessEventBus();

  // ── Keyed-by-id catalogs ──────────────────────────────────────────
  // Commands / sidebar / pageActions / settingsTabs all share the
  // shape `{ id: string, ... }` (not `{ type: string, ... }`), so
  // they don't go through Registry<T>. We keep them as plain Maps
  // here and expose `register`/`list` wrappers below.
  private readonly _commands = new Map<string, Command>();
  private readonly _sidebarItems = new Map<string, SidebarItem>();
  private readonly _pageActions = new Map<string, PageAction>();
  private readonly _settingsTabs = new Map<string, SettingsTab>();
  private readonly _plugins = new Map<string, PluginManifest>();
  private readonly _pluginStatuses = new Map<string, PluginLifecycleStatus>();
  private readonly _providerSources = new Map<string, string>();
  private readonly _commandSources = new Map<string, string>();
  private readonly _sidebarSources = new Map<string, string>();
  private readonly _pageActionSources = new Map<string, string>();
  private readonly _settingsTabSources = new Map<string, string>();
  private readonly fallbackStorage = new InMemoryPluginStorageHost();

  constructor(readonly platform: PluginHostPlatform) {}

  registerLoadedPlugin(manifest: PluginManifest): void {
    this._plugins.set(manifest.id, manifest);
    this._pluginStatuses.set(manifest.id, "active");
  }

  registerDisabledPlugin(manifest: PluginManifest): void {
    this._plugins.set(manifest.id, manifest);
    this._pluginStatuses.set(manifest.id, "disabled");
  }

  unregisterLoadedPlugin(pluginId: string): void {
    this._plugins.delete(pluginId);
    this._pluginStatuses.delete(pluginId);
  }

  setPluginStatus(pluginId: string, status: PluginLifecycleStatus): void {
    if (!this._plugins.has(pluginId)) return;
    this._pluginStatuses.set(pluginId, status);
  }

  noteProviderSource(kind: string, type: string, pluginId: string): void {
    this._providerSources.set(`${kind}:${type}`, pluginId);
  }

  clearProviderSource(kind: string, type: string, pluginId: string): void {
    const key = `${kind}:${type}`;
    if (this._providerSources.get(key) === pluginId) {
      this._providerSources.delete(key);
    }
  }

  // ── Commands surface ──────────────────────────────────────────────
  readonly commands = {
    register: (cmd: Command): Disposable => {
      if (this._commands.has(cmd.id)) {
        throw new Error(`Command already registered: ${cmd.id}`);
      }
      this._commands.set(cmd.id, cmd);
      return {
        dispose: () => {
          this._commands.delete(cmd.id);
        }
      };
    },
    run: async (id: string): Promise<void> => {
      const cmd = this._commands.get(id);
      if (!cmd) throw new Error(`Command not found: ${id}`);
      await cmd.run();
    },
    list: (): Command[] => Array.from(this._commands.values())
  };

  // ── Sidebar / page actions / settings tabs ────────────────────────
  readonly sidebar = {
    register: (item: SidebarItem): Disposable =>
      this.registerKeyed(this._sidebarItems, item.id, item, "sidebar item"),
    list: (): SidebarItem[] => Array.from(this._sidebarItems.values())
  };

  readonly pageActions = {
    register: (action: PageAction): Disposable =>
      this.registerKeyed(this._pageActions, action.id, action, "page action"),
    list: (): PageAction[] => Array.from(this._pageActions.values())
  };

  readonly settingsTabs = {
    register: (tab: SettingsTab): Disposable =>
      this.registerKeyed(this._settingsTabs, tab.id, tab, "settings tab"),
    list: (): SettingsTab[] => Array.from(this._settingsTabs.values())
  };

  // ── AI façade ─────────────────────────────────────────────────────
  /** Plugins call `host.ai.complete(req)` without knowing which AI
   *  provider is wired up. Today we pick the first registered
   *  provider; future work: per-call provider selection / fallback
   *  chains / per-user-preference routing. */
  readonly ai = {
    complete: async (req: AICompleteRequest): Promise<string> => {
      const providers = this.aiProviders.list();
      if (providers.length === 0) {
        throw new Error(
          "No AI provider registered. Install an AI plugin (e.g. lotion-ai-anthropic) " +
          "to enable AI features."
        );
      }
      return providers[0].complete(req);
    },
    available: (): boolean => this.aiProviders.list().length > 0
  };

  // ── Convenience accessors for platform ────────────────────────────
  get workspace(): WorkspaceAPI {
    return this.platform.workspace;
  }
  get ui(): UIAPI {
    return this.platform.ui;
  }

  storageFor(pluginId: string): PluginStorageAPI {
    const storage = this.platform.storage ?? this.fallbackStorage;
    return {
      appendJsonl: (fileName, value) => storage.appendJsonl(pluginId, fileName, value),
      readJsonl: (fileName, options) => storage.readJsonl(pluginId, fileName, options),
      readJson: (fileName) => storage.readJson(pluginId, fileName),
      writeJson: (fileName, value) => storage.writeJson(pluginId, fileName, value),
      delete: (fileName) => storage.delete(pluginId, fileName)
    };
  }

  inspect(): PluginHostInspection {
    return {
      plugins: Array.from(this._plugins.values()).map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        author: plugin.author,
        description: plugin.description,
        permissions: plugin.permissions,
        status: this._pluginStatuses.get(plugin.id) ?? "active"
      })),
      providers: [
        ...this.inspectRegistry("field-type", this.fields),
        ...this.inspectRegistry("database-view", this.views),
        ...this.inspectRegistry("block-widget", this.blocks),
        ...this.inspectRegistry("sync", this.sync),
        ...this.inspectRegistry("search", this.search),
        ...this.inspectRegistry("importer", this.importers),
        ...this.inspectRegistry("attachment-preview", this.previews),
        ...this.inspectRegistry("ai-completion", this.aiProviders)
      ],
      commands: this.inspectKeyed(this._commands, this._commandSources),
      sidebarItems: this.inspectKeyed(this._sidebarItems, this._sidebarSources),
      pageActions: this.inspectKeyed(this._pageActions, this._pageActionSources),
      settingsTabs: this.inspectKeyed(this._settingsTabs, this._settingsTabSources)
    };
  }

  private registerKeyed<T>(
    map: Map<string, T>,
    id: string,
    item: T,
    kind: string
  ): Disposable {
    if (map.has(id)) {
      throw new Error(`${kind} already registered: ${id}`);
    }
    map.set(id, item);
    return { dispose: () => void map.delete(id) };
  }

  noteKeyedSource(kind: PluginHostKeyedKind, id: string, pluginId: string): void {
    this.sourceMapFor(kind).set(id, pluginId);
  }

  clearKeyedSource(kind: PluginHostKeyedKind, id: string, pluginId: string): void {
    const map = this.sourceMapFor(kind);
    if (map.get(id) === pluginId) map.delete(id);
  }

  private inspectRegistry<T extends { type: string; label?: string; icon?: string }>(
    kind: PluginProviderKind,
    registry: Registry<T>
  ): PluginProviderInspection[] {
    return registry.list().map((provider) => ({
      kind,
      type: provider.type,
      label: provider.label ?? provider.type,
      icon: provider.icon,
      sourcePluginId: this._providerSources.get(`${kind}:${provider.type}`),
      status: "active"
    }));
  }

  private inspectKeyed<T extends { id: string; title?: string }>(
    map: Map<string, T>,
    sources: Map<string, string>
  ): PluginKeyedInspection[] {
    return Array.from(map.values()).map((item) => ({
      id: item.id,
      title: item.title ?? item.id,
      sourcePluginId: sources.get(item.id),
      status: "active"
    }));
  }

  private sourceMapFor(kind: PluginHostKeyedKind): Map<string, string> {
    if (kind === "command") return this._commandSources;
    if (kind === "sidebar") return this._sidebarSources;
    if (kind === "page-action") return this._pageActionSources;
    return this._settingsTabSources;
  }
}

export type PluginProviderKind =
  | "field-type"
  | "database-view"
  | "block-widget"
  | "sync"
  | "search"
  | "importer"
  | "attachment-preview"
  | "ai-completion";

export type PluginHostKeyedKind =
  | "command"
  | "sidebar"
  | "page-action"
  | "settings-tab";

export type PluginLifecycleStatus = "active" | "disabled";

export interface PluginManifestInspection {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  permissions: string[];
  status: PluginLifecycleStatus;
}

export interface PluginProviderInspection {
  kind: PluginProviderKind;
  type: string;
  label: string;
  icon?: string;
  sourcePluginId?: string;
  status: "active";
}

export interface PluginKeyedInspection {
  id: string;
  title: string;
  sourcePluginId?: string;
  status: "active";
}

export interface PluginHostInspection {
  plugins: PluginManifestInspection[];
  providers: PluginProviderInspection[];
  commands: PluginKeyedInspection[];
  sidebarItems: PluginKeyedInspection[];
  pageActions: PluginKeyedInspection[];
  settingsTabs: PluginKeyedInspection[];
}

class InMemoryPluginStorageHost implements PluginStorageHostAPI {
  private readonly store = new Map<string, unknown[]>();

  async appendJsonl(pluginId: string, fileName: string, value: unknown): Promise<void> {
    const key = `${pluginId}:${fileName}`;
    const rows = this.store.get(key) ?? [];
    rows.push(value);
    this.store.set(key, rows);
  }

  async readJsonl<T = unknown>(pluginId: string, fileName: string, options?: { limit?: number }): Promise<T[]> {
    const rows = [...(this.store.get(`${pluginId}:${fileName}`) ?? [])] as T[];
    const limit = Number(options?.limit);
    if (!Number.isFinite(limit) || limit <= 0) return rows;
    return rows.slice(-Math.floor(limit));
  }

  async readJson<T = unknown>(pluginId: string, fileName: string): Promise<T | null> {
    const rows = this.store.get(`${pluginId}:${fileName}:json`);
    return (rows?.[0] as T | undefined) ?? null;
  }

  async writeJson(pluginId: string, fileName: string, value: unknown): Promise<void> {
    this.store.set(`${pluginId}:${fileName}:json`, [value]);
  }

  async delete(pluginId: string, fileName: string): Promise<void> {
    this.store.delete(`${pluginId}:${fileName}`);
    this.store.delete(`${pluginId}:${fileName}:json`);
  }
}
