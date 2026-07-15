/**
 * Lotion plugin API — public surface for both built-in plugins
 * (everything we ship in `src/builtin-plugins/`) and third-party
 * plugins (loaded from `~/.lotion/plugins/`).
 *
 * This file is KERNEL: once shipped, breaking changes here mean every
 * plugin has to update. Keep it small. Push implementation detail
 * into providers themselves.
 *
 * Design notes:
 *
 *  - Same types used by built-in dogfood plugins and 3rd-party plugins.
 *    If a built-in feature can't be written against this API, the API
 *    is wrong, not the feature.
 *  - DOM types appear in renderer-bound providers (Field / View /
 *    Block / Preview). Main-process plugins shouldn't register those
 *    — the host will throw at registration if a main-process plugin
 *    tries to.
 *  - Workspace data goes through `WorkspaceAPI` (not direct fs) so
 *    the host can enforce permissions and serialize writes.
 *
 * See docs/plugin-architecture.md (TBD) for the why behind each
 * choice.
 */

import type {
  ID,
  PageMeta,
  PageDocument,
  DatabaseBundle,
  DatabaseRecord,
  DatabaseSummary,
  FieldSchema,
  EntityBacklink,
  EntityRef,
  RecordValue,
  TableView,
  UpdateCellInput,
  AddFieldInput,
  UpdateFieldInput,
  UpdatePageInput,
  CreatePageInput,
  CreateDatabaseInput,
  CreateViewInput,
  UpdateViewInput
} from "./types.js";
export type { AttachmentRef } from "./attachments.js";
import type { AttachmentRef } from "./attachments.js";

// ── Lifecycle primitives ──────────────────────────────────────────────

/** Returned by every `register*` method. Calling `.dispose()` removes
 *  the registration. Plugin unload disposes everything the plugin
 *  registered, atomically. */
export interface Disposable {
  dispose(): void;
}

// ── Plugin manifest (on-disk) ─────────────────────────────────────────

/** `manifest.json` schema. Validated by the loader before any plugin
 *  code runs. */
export interface PluginManifest {
  /** Globally unique. Used as the directory name and as the prefix
   *  for any IDs the plugin emits (`plugin-<id>_<...>`). */
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** Minimum Lotion version this plugin works with (semver range). */
  minLotionVersion?: string;
  /** Entry point in the main process. Has Node + fs + network. */
  main?: string;
  /** Entry point in the renderer. Has DOM + CodeMirror + React. */
  renderer?: string;
  /** Stylesheet auto-injected when the plugin loads. */
  styles?: string;
  /** Capabilities the plugin needs. User confirms on install. */
  permissions: PluginPermission[];
  /** Dev-mode override: when set, the loader reads from this absolute
   *  path instead of the installed plugin folder, and watches the
   *  directory for reload-on-change. */
  devPath?: string;
}

export type PluginPermission =
  | "workspace.read"
  | "workspace.write"
  | "network"
  | "shell"
  | "vault.fs"   // arbitrary fs access outside workspace
  | "internal";  // unstable host internals (escape hatch)

// ── Plugin base class ─────────────────────────────────────────────────

/** Every plugin's default export should extend this. Lifecycle:
 *
 *    new Plugin(host)  ← constructor receives the scoped context
 *    onLoad()          ← register commands / providers / etc here
 *    …                 ← plugin runs
 *    onUnload()        ← optional cleanup; everything registered via
 *                        host.* is auto-disposed by the host anyway,
 *                        so this is for non-host side effects (timers,
 *                        websocket connections, etc.)
 */
export abstract class Plugin {
  constructor(public readonly host: PluginContext) {}
  abstract onLoad(): void | Promise<void>;
  onUnload?(): void | Promise<void>;
}

// ── Provider registry (shape shared by all categories) ────────────────

/** Each Provider category has its own registry. They all conform to
 *  this shape: `register` returns a Disposable, `list` snapshots
 *  everything currently registered, `get` looks up by the provider's
 *  `type` discriminator. */
export interface ProviderRegistry<T extends { type: string }> {
  register(provider: T): Disposable;
  list(): T[];
  get(type: string): T | undefined;
}

// ── Field type provider ───────────────────────────────────────────────

/** Registers a database field type. Built-in `text` / `multi_select` /
 *  `date` / `number` / `formula` / `checkbox` etc. are all providers
 *  using this same shape (loaded as built-in plugins).
 *
 *  Renderer-bound: `render` / `edit` must run in the renderer process. */
export interface FieldTypeProvider {
  /** Unique discriminator. Plugin-defined types must be prefixed:
   *  `plugin-<plugin-id>.<type-name>`. Built-ins use bare names
   *  (`text`, `multi_select`, …). */
  type: string;
  /** Shown in the "add field" dropdown. */
  label: string;
  /** Optional config that shows up in the field-edit panel. */
  configSchema?: ConfigSchema;
  /** Validate a stored cell value. Throws on invalid. */
  validate?(value: RecordValue, config?: unknown): void;
  /** Render the cell as static content (table cell, list cell,
   *  read-only contexts). */
  render(value: RecordValue, ctx: FieldRenderContext): string | HTMLElement;
  /** Interactive editor. Called when the user activates a cell.
   *  The editor commits via `ctx.commit(newValue)` or aborts via
   *  `ctx.cancel()`. */
  edit?(value: RecordValue, ctx: FieldEditContext): HTMLElement;
  /** Compute the displayed value (formula / rollup / AI). When
   *  provided the field is read-only — stored cell values are
   *  ignored in favor of this function's output. */
  compute?(record: DatabaseRecord, config: unknown, ctx: FieldComputeContext): Promise<RecordValue>;
}

export interface FieldRenderContext {
  field: FieldSchema;
  record: DatabaseRecord;
  databaseId: ID;
}

export interface FieldEditContext extends FieldRenderContext {
  commit(value: RecordValue): void;
  cancel(): void;
}

export interface FieldComputeContext extends FieldRenderContext {
  /** All records in the database — for rollup-style computations. */
  bundle: DatabaseBundle;
}

// ── Database view provider ────────────────────────────────────────────

/** New database view type. `table` is the built-in provider.
 *  Renderer-bound. */
export interface DatabaseViewProvider {
  type: string;
  label: string;
  icon?: string;
  /** Config that shows up when the user adds this view to a database.
   *  E.g. Kanban: `{ columnField: { type: "field-ref", ... } }`. */
  configSchema?: ConfigSchema;
  render(ctx: ViewRenderContext): void | Disposable;
}

export interface ViewRenderContext {
  bundle: DatabaseBundle;
  view: TableView;
  container: HTMLElement;
  /** Scoped workspace API the view should use for edits. Routing
   *  through this lets the host re-render dependent views when one
   *  view mutates a cell. */
  workspace: WorkspaceAPI;
}

// ── Block widget provider ─────────────────────────────────────────────

/** Custom fenced-code-block widget. The host parses ```<lang> blocks
 *  and dispatches to the provider whose `type` matches. Renderer-
 *  bound. */
export interface BlockWidgetProvider {
  /** Fence language (`mermaid`, `chart`, `lotion-view`, …). */
  type: string;
  /** When the cursor is inside the fence:
   *  - `hide`     show raw source while editing (default; matches
   *               current `lotion-view` behavior)
   *  - `replace`  keep the widget visible during edit
   *  - `overlay`  show widget AND raw source overlaid */
  cursorPolicy?: "hide" | "replace" | "overlay";
  /** Parse the raw fence body. Defaults to passing the raw string. */
  parseConfig?(rawBody: string): unknown;
  render(el: HTMLElement, config: unknown, ctx: BlockWidgetContext): void | Disposable;
}

export interface BlockWidgetContext {
  pageId: ID;
  fenceStart: number;
  fenceEnd: number;
}

// ── Sync provider ─────────────────────────────────────────────────────

/** Workspace sync backend. Git is the built-in provider. Main-
 *  process only — needs fs / network access. */
export interface SyncProvider {
  type: string;
  label: string;
  commit(message?: string): Promise<void>;
  pull?(): Promise<void>;
  push?(): Promise<void>;
  status?(): Promise<SyncStatus>;
}

export interface SyncStatus {
  clean: boolean;
  ahead?: number;
  behind?: number;
  message?: string;
}

// ── AI completion provider ────────────────────────────────────────────

/** Pluggable AI completion. No default — `host.ai.complete` only
 *  works if a plugin registered one. Main- or renderer-process. */
export interface AICompletionProvider {
  type: string;
  label: string;
  complete(req: AICompleteRequest): Promise<string>;
  stream?(req: AICompleteRequest): AsyncIterable<string>;
}

export interface AICompleteRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

// ── Importer provider ─────────────────────────────────────────────────

/** Workspace importer. Notion HTML / Markdown will become built-in
 *  providers. Main-process. */
export interface ImporterProvider {
  type: string;
  label: string;
  /** UI hint: globs of file extensions / folder shapes this handles. */
  acceptedFormats: string[];
  /** Preview what would be imported. */
  scan(folderPath: string): Promise<ImporterScanResult>;
  /** Execute the import. */
  run(
    folderPath: string,
    options: { force?: boolean; onProgress?: (p: ImportProgress) => void }
  ): Promise<ImporterResult>;
}

export interface ImporterScanResult {
  topLevelPages: number;
  databases: number;
  attachments: number;
  preview: string[];
}

export interface ImporterResult {
  pagesImported: number;
  databasesImported: number;
  attachmentsImported: number;
  warnings: string[];
}

export interface ImportProgress {
  phase: string;
  current?: number;
  total?: number;
  message?: string;
}

// ── Attachment preview provider ───────────────────────────────────────

/** Inline preview widget for attachment file types. Renderer-bound. */
export interface AttachmentPreviewProvider {
  type: string;
  /** File extensions this provider handles (no leading dot). */
  extensions: string[];
  render(el: HTMLElement, attachmentUrl: string, ctx: AttachmentPreviewContext): void | Disposable;
}

export interface AttachmentPreviewContext {
  /** Workspace-relative path to the attachment. */
  path: string;
  /** Filename of the attachment as shown in the link label. */
  label: string;
}

// ── Search provider ───────────────────────────────────────────────────

/** Replaces the default ripgrep + workspace metadata searcher. */
export interface SearchProvider {
  type: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchOptions {
  scope?: "all" | "pages" | "databases";
  limit?: number;
}

export interface SearchResult {
  type: "page" | "row" | "database";
  id: ID;
  title: string;
  preview: string;
  /** Higher = more relevant. */
  score: number;
}

// ── Commands ──────────────────────────────────────────────────────────

export interface Command {
  id: string;
  title: string;
  /** Keybinding string ("cmd+k", "ctrl+shift+p"). */
  keybinding?: string;
  /** Optional grouping for command palette. */
  category?: string;
  run(): void | Promise<void>;
}

// ── UI extension points ───────────────────────────────────────────────

export interface SidebarItem {
  id: string;
  title: string;
  icon?: string;
  /** Order hint; lower = higher in sidebar. Built-in "Pages" = 0,
   *  built-in "Databases" = 100, plugins should start at 1000+. */
  order?: number;
  onClick(): void;
}

export interface PageAction {
  id: string;
  title: string;
  icon?: string;
  /** Hide the action when it doesn't apply to the current page. */
  enabledFor?: (pageId: ID) => boolean;
  run(pageId: ID): void | Promise<void>;
}

export interface SettingsTab {
  id: string;
  title: string;
  render(el: HTMLElement): void | Disposable;
}

// ── Events ────────────────────────────────────────────────────────────

/** Host-emitted events. Plugins subscribe via `host.events.on`.
 *  Wildcard subscriptions allowed: `host.events.on("*", …)` or
 *  prefix matches like `host.events.on("page.*", …)`. */
export type LotionEventName =
  | "workspace.opened"
  | "workspace.closed"
  | "page.created"
  | "page.opened"
  | "page.saved"
  | "page.deleted"
  | "page.renamed"
  | "database.created"
  | "database.deleted"
  | "row.created"
  | "row.updated"
  | "row.deleted"
  | "field.created"
  | "field.updated"
  | "view.created"
  | "view.updated"
  | "sync.started"
  | "sync.completed"
  | "sync.failed";

export interface EventBus {
  on<T = unknown>(event: LotionEventName | "*" | string, handler: (data: T) => void): Disposable;
  emit<T = unknown>(event: LotionEventName, data?: T): void;
}

// ── Workspace data API ────────────────────────────────────────────────

/** Everything a plugin can do with the open workspace's data. Goes
 *  through this API (not direct fs) so the host can enforce
 *  permissions, track plugin attribution, and serialize writes. */
export interface WorkspaceAPI {
  // Pages
  listPages(): Promise<PageMeta[]>;
  getPage(id: ID): Promise<PageDocument>;
  createPage(input: CreatePageInput): Promise<PageMeta>;
  updatePage(id: ID, input: UpdatePageInput): Promise<PageMeta>;
  deletePage(id: ID): Promise<void>;
  /** Move under a new parent. `newParent = null` means top level.
   *  Implementations currently persist parent/path metadata; sibling
   *  `order` is reserved until the page data model has an order field. */
  movePage(id: ID, newParent: ID | null, order?: number): Promise<void>;
  /** Currently-open page (the one in the active tab). Null when the
   *  active tab is a database view or no tab is open. */
  activePage(): Promise<PageDocument | null>;

  // Databases
  listDatabases(): Promise<DatabaseSummary[]>;
  getDatabase(id: ID): Promise<DatabaseBundle>;
  createDatabase(input: CreateDatabaseInput): Promise<DatabaseBundle>;
  deleteDatabase(id: ID): Promise<void>;

  // Search
  searchWorkspace(pattern: string): Promise<WorkspaceSearchResult>;
  getBacklinks(entityId: ID): Promise<EntityBacklink[]>;

  // Schema
  addField(databaseId: ID, input: AddFieldInput): Promise<DatabaseBundle>;
  updateField(input: UpdateFieldInput): Promise<DatabaseBundle>;
  deleteField(databaseId: ID, fieldId: ID): Promise<DatabaseBundle>;

  // Rows / cells
  getRowPage(databaseId: ID, rowId: ID): Promise<PageDocument>;
  addRow(databaseId: ID): Promise<DatabaseBundle>;
  updateCell(input: UpdateCellInput): Promise<DatabaseBundle>;
  deleteRow(databaseId: ID, rowId: ID): Promise<DatabaseBundle>;

  // Views
  createView(input: CreateViewInput): Promise<DatabaseBundle>;
  duplicateView(databaseId: ID, viewId: ID, name?: string): Promise<DatabaseBundle>;
  updateView(input: UpdateViewInput): Promise<DatabaseBundle>;
  deleteView(databaseId: ID, viewId: ID): Promise<DatabaseBundle>;
  setDefaultView(databaseId: ID, viewId: ID): Promise<DatabaseBundle>;

  // Attachments
  listAttachments(): Promise<AttachmentRef[]>;
  getAttachment(sha: string): Promise<Uint8Array>;
  addAttachment(data: Uint8Array, ext: string): Promise<AttachmentRef>;
}

export interface WorkspaceSearchResult {
  hits: WorkspaceSearchHit[];
  truncated: boolean;
}

export type WorkspaceSearchHit =
  | {
      kind: "page";
      pageId: ID;
      title: string;
      preview: string;
      path?: string;
    }
  | {
      kind: "database";
      databaseId: ID;
      title: string;
      preview: string;
      path?: string;
    }
  | {
      kind: "row" | "rowPage";
      databaseId: ID;
      rowId?: ID;
      title: string;
      preview: string;
      path?: string;
    };

// ── UI primitives ────────────────────────────────────────────────────

/** Trivial UI primitives any plugin can use. Heavy UI lives in the
 *  plugin's own DOM tree. Renderer-only. */
export interface UIAPI {
  notify(text: string, level?: "info" | "warn" | "error"): void;
  modal<T = unknown>(options: ModalOptions<T>): Promise<T | null>;
  contextMenu(items: ContextMenuItem[], anchor: { x: number; y: number }): void;
  prompt(label: string, defaultValue?: string): Promise<string | null>;
  confirm(message: string): Promise<boolean>;
  openUrl(url: string): Promise<void>;
  openEntity(ref: EntityRef): void;
}

export interface ModalOptions<T> {
  title: string;
  render(el: HTMLElement, resolve: (value: T | null) => void): Disposable | void;
  width?: number;
}

export interface ContextMenuItem {
  label: string;
  icon?: string;
  separator?: boolean;
  run?(): void;
}

// ── Config schema (used by FieldType / View provider configs) ─────────

/** Declarative settings → host renders the UI. */
export type ConfigSchema = Record<string, ConfigField>;

export type ConfigField =
  | { type: "string"; label: string; default?: string; multiline?: boolean }
  | { type: "number"; label: string; default?: number; min?: number; max?: number }
  | { type: "boolean"; label: string; default?: boolean }
  | { type: "select"; label: string; default?: string; options: Array<{ value: string; label: string }> }
  | { type: "field-ref"; label: string; fieldKind?: string };

// ── Per-plugin persistent settings ────────────────────────────────────

/** Per-plugin key-value store, persisted to
 *  `~/.lotion/plugins/<plugin-id>/settings.json`. */
export interface PluginSettings {
  get<T = unknown>(key: string, defaultValue?: T): T | undefined;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  all(): Record<string, unknown>;
}

// ── Per-plugin workspace storage ─────────────────────────────────────

/** Narrow persistent storage for plugin-owned workspace artifacts.
 *  The host scopes paths by plugin id, so plugins never receive a raw
 *  workspace filesystem capability through this API. */
export interface PluginStorageAPI {
  appendJsonl(fileName: string, value: unknown): Promise<void>;
  readJsonl<T = unknown>(fileName: string, options?: { limit?: number }): Promise<T[]>;
  readJson<T = unknown>(fileName: string): Promise<T | null>;
  writeJson(fileName: string, value: unknown): Promise<void>;
  delete(fileName: string): Promise<void>;
}

// ── PluginContext: the `host` plugin receives ─────────────────────────

/** The object every plugin operates on. Constructed by the host on
 *  plugin load, scoped to that plugin so registrations are attributed
 *  and disposed atomically on unload.
 *
 *  Notes on cross-process behavior:
 *  - `workspace` works in both main and renderer (renderer-side goes
 *    over IPC). Main-process plugins skip the IPC hop.
 *  - `ui`, `fields`, `views`, `blocks`, `previews` are renderer-only.
 *    Main-process plugins that try to register these throw at
 *    registration time.
 *  - `sync`, `importers`, `search`, `commands`, `events` work in both
 *    processes.
 *  - `ai` lives wherever the AI provider was registered; the façade
 *    routes calls accordingly. */
export interface PluginContext {
  manifest: PluginManifest;
  settings: PluginSettings;
  storage: PluginStorageAPI;

  workspace: WorkspaceAPI;
  ui: UIAPI;
  events: EventBus;

  /** AI completion façade. Throws if no `ai.completion` provider is
   *  registered yet. Call `ai.available()` to check first. */
  ai: {
    complete(req: AICompleteRequest): Promise<string>;
    available(): boolean;
  };

  /** Commands surface — keyboard / palette / programmatic invoke. */
  commands: {
    register(cmd: Command): Disposable;
    run(id: string): Promise<void>;
    list(): Command[];
  };

  /** Provider registries. Each has the same shape from
   *  `ProviderRegistry<T>`. */
  fields: ProviderRegistry<FieldTypeProvider>;
  views: ProviderRegistry<DatabaseViewProvider>;
  blocks: ProviderRegistry<BlockWidgetProvider>;
  sync: ProviderRegistry<SyncProvider>;
  search: ProviderRegistry<SearchProvider>;
  importers: ProviderRegistry<ImporterProvider>;
  previews: ProviderRegistry<AttachmentPreviewProvider>;
  ai_providers: ProviderRegistry<AICompletionProvider>;

  /** Sidebar / page actions / settings tabs. */
  sidebar: {
    register(item: SidebarItem): Disposable;
  };
  pageActions: {
    register(action: PageAction): Disposable;
  };
  settingsTabs: {
    register(tab: SettingsTab): Disposable;
  };

  /** Escape hatch — direct host internals. Plugins that touch this
   *  must declare the `internal` permission. We do NOT promise
   *  stability across Lotion versions. */
  internal?: unknown;
}
