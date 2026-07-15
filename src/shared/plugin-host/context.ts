import type {
  AICompleteRequest,
  AICompletionProvider,
  AttachmentPreviewProvider,
  BlockWidgetProvider,
  Command,
  DatabaseViewProvider,
  Disposable,
  EventBus,
  FieldTypeProvider,
  ImporterProvider,
  LotionEventName,
  PageAction,
  PluginContext,
  PluginManifest,
  PluginStorageAPI,
  PluginSettings,
  ProviderRegistry,
  SearchProvider,
  SettingsTab,
  SidebarItem,
  SyncProvider,
  UIAPI,
  WorkspaceAPI
} from "../plugin-api.js";
import type { PluginHost } from "./host.js";
import type { PluginHostKeyedKind, PluginProviderKind } from "./host.js";
import type { Registry } from "./registry.js";

/**
 * The PluginContext one plugin sees. Constructed per-plugin by the
 * host on load, so every registration the plugin makes is tracked
 * against this context and gets disposed atomically on unload.
 *
 * Plugin authors don't see this class — they get the `PluginContext`
 * interface from plugin-api.ts. This is the host-side implementation.
 */
export class PluginContextImpl implements PluginContext {
  /** Every Disposable the plugin acquired via `host.*.register` ends
   *  up here so `disposeAll()` can clean up on plugin unload. */
  private readonly disposables = new Set<Disposable>();

  // Provider registries — initialized in constructor since they
  // capture `this.host`. Declaring with `!` so TS allows the
  // forward reference (the constructor sets them before anything
  // else can touch them).
  readonly fields!: ProviderRegistry<FieldTypeProvider>;
  readonly views!: ProviderRegistry<DatabaseViewProvider>;
  readonly blocks!: ProviderRegistry<BlockWidgetProvider>;
  readonly sync!: ProviderRegistry<SyncProvider>;
  readonly search!: ProviderRegistry<SearchProvider>;
  readonly importers!: ProviderRegistry<ImporterProvider>;
  readonly previews!: ProviderRegistry<AttachmentPreviewProvider>;
  readonly ai_providers!: ProviderRegistry<AICompletionProvider>;
  readonly storage: PluginStorageAPI;

  constructor(
    private readonly host: PluginHost,
    readonly manifest: PluginManifest,
    readonly settings: PluginSettings
  ) {
    this.host.registerLoadedPlugin(manifest);
    this.storage = this.host.storageFor(manifest.id);
    this.fields = this.scopedRegistry("field-type", this.host.fields);
    this.views = this.scopedRegistry("database-view", this.host.views);
    this.blocks = this.scopedRegistry("block-widget", this.host.blocks);
    this.sync = this.scopedRegistry("sync", this.host.sync);
    this.search = this.scopedRegistry("search", this.host.search);
    this.importers = this.scopedRegistry("importer", this.host.importers);
    this.previews = this.scopedRegistry("attachment-preview", this.host.previews);
    this.ai_providers = this.scopedRegistry("ai-completion", this.host.aiProviders);
  }

  // ── Passthrough surfaces ──────────────────────────────────────────
  get workspace(): WorkspaceAPI {
    return this.host.workspace;
  }
  get ui(): UIAPI {
    return this.host.ui;
  }

  // ── Event bus (scoped: subscriptions disposed on plugin unload) ───
  readonly events: EventBus = {
    on: <T = unknown>(
      event: LotionEventName | "*" | string,
      handler: (data: T) => void
    ): Disposable => {
      return this.track(this.host.events.on<T>(event, handler));
    },
    emit: <T = unknown>(event: LotionEventName, data?: T): void => {
      // Emits are not "registrations" — no tracking. Plugins can
      // freely emit; the host fans out to all subscribers across
      // every plugin.
      this.host.events.emit(event, data);
    }
  };

  // ── Commands (scoped) ─────────────────────────────────────────────
  readonly commands = {
    register: (cmd: Command): Disposable =>
      this.trackKeyed("command", cmd.id, this.host.commands.register(cmd)),
    run: (id: string): Promise<void> => this.host.commands.run(id),
    list: (): Command[] => this.host.commands.list()
  };

  // ── AI façade (passthrough; no plugin-scoped state) ───────────────
  readonly ai = {
    complete: (req: AICompleteRequest): Promise<string> =>
      this.host.ai.complete(req),
    available: (): boolean => this.host.ai.available()
  };

  // ── UI extension points (scoped) ──────────────────────────────────
  readonly sidebar = {
    register: (item: SidebarItem): Disposable =>
      this.trackKeyed("sidebar", item.id, this.host.sidebar.register(item))
  };
  readonly pageActions = {
    register: (action: PageAction): Disposable =>
      this.trackKeyed("page-action", action.id, this.host.pageActions.register(action))
  };
  readonly settingsTabs = {
    register: (tab: SettingsTab): Disposable =>
      this.trackKeyed("settings-tab", tab.id, this.host.settingsTabs.register(tab))
  };

  // ── Internal escape hatch ─────────────────────────────────────────
  /** Filled in by the loader when the plugin manifest declares the
   *  `internal` permission. We don't promise any stability here. */
  internal?: unknown;

  /** Called by the host when the plugin unloads. Disposes every
   *  registration the plugin made, in arbitrary order. Errors in
   *  individual dispose calls are caught + logged. */
  disposeAll(): void {
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch (error) {
        console.error(`[plugin:${this.manifest.id}] dispose failed`, error);
      }
    }
    this.disposables.clear();
    this.host.unregisterLoadedPlugin(this.manifest.id);
  }

  /** Wrap a Disposable so plugin-level cleanup catches it. Returned
   *  Disposable removes the tracking entry when the caller disposes
   *  it explicitly — so plugins that dispose-as-they-go don't leak
   *  cumulative tracking state. */
  private track(d: Disposable): Disposable {
    this.disposables.add(d);
    return {
      dispose: () => {
        this.disposables.delete(d);
        d.dispose();
      }
    };
  }

  /** Wrap a host registry so plugin-side `register` calls track the
   *  Disposable. `get` and `list` pass through unchanged — plugins
   *  can look up other plugins' providers. */
  private scopedRegistry<T extends { type: string }>(
    kind: PluginProviderKind,
    registry: Registry<T>
  ): ProviderRegistry<T> {
    return {
      register: (provider: T): Disposable => {
        const disposable = registry.register(provider);
        this.host.noteProviderSource(kind, provider.type, this.manifest.id);
        return this.track({
          dispose: () => {
            this.host.clearProviderSource(kind, provider.type, this.manifest.id);
            disposable.dispose();
          }
        });
      },
      get: (type: string): T | undefined => registry.get(type),
      list: (): T[] => registry.list()
    };
  }

  private trackKeyed(kind: PluginHostKeyedKind, id: string, disposable: Disposable): Disposable {
    this.host.noteKeyedSource(kind, id, this.manifest.id);
    return this.track({
      dispose: () => {
        this.host.clearKeyedSource(kind, id, this.manifest.id);
        disposable.dispose();
      }
    });
  }
}
