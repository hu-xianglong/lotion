export type ID = string;

export type FieldType =
  | "id"
  | "created_time"
  | "updated_time"
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "url"
  | "person"
  | "entity_ref"
  | "checkbox"
  | "formula"
  | "rollup";

export type DateDisplayFormat =
  | "full"
  | "month_day_year"
  | "day_month_year"
  | "year_month_day"
  | "iso";

export type TimeDisplayFormat = "none" | "h12" | "h24";

export interface SpaceManifest {
  version: 1;
  spaceId: ID;
  name: string;
  pages: ID[];
  /** User-created databases shown in the sidebar. System databases live
   *  under `databases/system` and are listed separately. */
  databases: ID[];
  systemDatabases: ID[];
  /** Runtime-only convenience value loaded from the Workspaces system DB.
   *  `saveManifest` strips it so icon data stays in that database. */
  icon?: string;
  activePageId?: ID;
  favorites?: FavoriteItem[];
  /** Last-N visited items, most-recent first. Capped server-side. */
  recents?: RecentItem[];
}

export interface WorkspaceMeta {
  id: ID;
  title: string;
  icon?: string;
  created_time: string;
  updated_time: string;
}

/** A bookmark to a page or row-page. Order in the list is preserved. */
export type FavoriteItem =
  | { type: "page"; id: ID }
  | { type: "row_page"; databaseId: ID; rowId: ID };

/** Most-recently-visited entry. Mirrors FavoriteItem + databases. */
export type RecentItem =
  | { type: "page"; id: ID; at: string; count?: number }
  | { type: "database"; id: ID; at: string; count?: number }
  | { type: "row_page"; databaseId: ID; rowId: ID; title?: string; icon?: string; at: string; count?: number };

/** A recent item before the server stamps `at`. Distributive over the
 *  RecentItem union so each variant retains its own discriminant. */
export type RecentItemInput =
  | { type: "page"; id: ID }
  | { type: "database"; id: ID }
  | { type: "row_page"; databaseId: ID; rowId: ID; title?: string; icon?: string };

export type EntityKind = "page" | "database" | "row";

export interface PageMeta {
  id: ID;
  title: string;
  created_time: string;
  updated_time: string;
  /** Workspace-relative path to a user-chosen icon image, `emoji:<glyph>`,
   *  or undefined for the built-in default. */
  icon?: string;
  /** Workspace-relative path to a banner cover image, or undefined. */
  cover?: string;
  /** Vertical focal point of the cover image as a percentage (0..100).
   *  Maps to CSS `object-position: 50% <coverOffset>%`. Default 50. */
  coverOffset?: number;
  /** User-editable list of free-form tag strings. */
  tags?: string[];
  /** User-editable date (free-form text — caller chooses format). */
  date?: string;
  /** User-editable URL string. */
  url?: string;
  /** Import-only source reference copied into the workspace. */
  originalNotionHtml?: string;
  /** Page layout preference, persisted with the page like Notion's
   *  "Full width" setting. */
  fullWidth?: boolean;
  /** Page typography preference, persisted with the page like Notion's
   *  "Small text" setting. */
  smallText?: boolean;
  /** Notion-style breadcrumb path. The last segment is the page title. */
  path?: string[];
  /** Parent entity when known. */
  parentId?: ID;
  parentKind?: EntityKind;
}

export interface PageDocument {
  meta: PageMeta;
  markdown: string;
}

export interface DatabaseSummary {
  id: ID;
  name: string;
  /** Notion-style breadcrumb path. The last segment is the database itself. */
  path?: string[];
  /** Same shape as PageMeta.icon. */
  icon?: string;
  tags?: string[];
  /** Ordered saved views used for full-page sidebar shortcuts. */
  views?: Array<Pick<TableView, "id" | "name" | "type">>;
}

export interface DatabaseStats {
  id: ID;
  /** Each database row has a Notion-style page, so this is the page count. */
  pageCount: number;
  /** Row-page markdown files with non-whitespace body content. */
  nonEmptyPageCount: number;
  /** User-visible fields, excluding hidden system bookkeeping fields. */
  fieldCount: number;
  /** When the cached stats row was last refreshed. */
  refreshedAt?: string;
}

export interface EntityRecord {
  id: ID;
  kind: EntityKind;
  title: string;
  created_time?: string;
  updated_time?: string;
  icon?: string;
  /** Notion-style breadcrumb path. The last segment is the entity title. */
  path?: string[];
  /** Parent entity id when known. */
  parentId?: ID;
  parentKind?: EntityKind;
  /** Owning database for row entities. */
  databaseId?: ID;
  /** Row id for row entities; currently equal to `id` for imported rows. */
  rowId?: ID;
  /** Workspace-relative Markdown body path for page/row entities. */
  bodyPath?: string;
  /** Original Notion source hash when imported. */
  sourceNotionHash?: string;
}

export interface EntityRef {
  entityId: ID;
  kind: EntityKind;
  databaseId?: ID;
  rowId?: ID;
  titleSnapshot?: string;
  pathSnapshot?: string[];
}

export interface EntityLookupResult extends EntityRef {
  title: string;
  icon?: string;
  path?: string[];
}

export type EntityBacklinkType = "markdown" | "property";

export interface EntityBacklink {
  type: EntityBacklinkType;
  source: EntityLookupResult;
  /** Workspace-relative body path for markdown references. */
  sourceBodyPath?: string;
  /** 1-based line number for markdown references. */
  line?: number;
  /** Trimmed source line or cell preview. */
  excerpt?: string;
  /** Database/field context for structured property references. */
  databaseId?: ID;
  databaseName?: string;
  fieldId?: ID;
  fieldName?: string;
}

export interface NotionAuditInput {
  /** Notion export root folders. A shared parent containing multiple
   *  `Export-...` folders is valid. */
  sourcePaths: string[];
  /** Defaults to the currently open workspace when called from the app. */
  workspacePath?: string;
  /** Optional focused CSV filters. Empty means audit every source CSV. */
  csvFilters?: string[];
  /** Optional focused HTML filters. Empty means skip HTML body audit unless
   *  `auditAllHtml` is true. */
  htmlFilters?: string[];
  auditAllHtml?: boolean;
  keepEmptyRows?: boolean;
  maxRowExplosion?: number;
  maxIssues?: number;
}

export interface NotionAuditSummary {
  sourceRoots: string[];
  workspaceRoot: string;
  sourceCsvs: number;
  sourceHtmls: number;
  auditedCsvs: number;
  auditedHtmls: number;
  workspaceDatabases: number;
  workspaceRows: number;
  workspaceImportedDatabases: number;
  workspaceImportedRows: number;
  issues: number;
  warnings: number;
}

export interface NotionAuditItem {
  kind: string;
  source: string;
  message: string;
}

export interface NotionAuditResult {
  summary: NotionAuditSummary;
  issueKinds: Record<string, number>;
  warningKinds: Record<string, number>;
  issues: NotionAuditItem[];
  warnings: NotionAuditItem[];
}

export interface DatabaseSchema {
  id: ID;
  name: string;
  /** Notion-style breadcrumb path. The last segment is the database itself. */
  path?: string[];
  created_time: string;
  updated_time: string;
  fields: FieldSchema[];
  defaultViewId: ID;
  /** Row/page templates used when creating new records in this DB. */
  templates?: DatabaseRowTemplate[];
  /** Same shape as PageMeta.icon for the database's own icon. */
  icon?: string;
  /** Workspace-relative path to a banner cover image, or undefined. */
  cover?: string;
  /** Vertical focal point of the cover (0..100), maps to CSS
   *  `object-position: 50% <coverOffset>%`. Default 50. */
  coverOffset?: number;
  /** Workspace-relative attachment path for the source Notion CSV, when imported. */
  notion_original_csv?: string;
  /** Original Notion source hash for imported databases or synthesized placeholders. */
  notion_source_hash?: string;
  tags?: string[];
  deletedFields?: DeletedFieldTombstone[];
  deletedRows?: DeletedRowTombstone[];
  /** Prevents schema, view, and template mutations while leaving row content editable. */
  locked?: boolean;
}

export interface DeletedRowTombstone {
  record: DatabaseRecord;
  position: number;
  deletedAt: string;
  /** Page-index state is detached while the row is deleted but retained here
   * so restore can recover navigation metadata without keeping a ghost page. */
  page?: { meta: PageMeta; bodyPath?: string };
}

export interface DeletedFieldTombstone {
  field: FieldSchema;
  values: Record<ID, RecordValue>;
  position: number;
  views: Array<{ viewId: ID; visibleIndex: number; orderIndex: number; wrapped: boolean }>;
  dependencies: string[];
  deletedAt: string;
}

export interface FieldSchema {
  id: ID;
  name: string;
  type: FieldType;
  system?: boolean;
  /** Hidden from view-settings and view rendering. Used for service-managed
   *  bookkeeping cells (e.g. `page_file`) that the user should never see. */
  hidden?: boolean;
  options?: SelectOption[];
  formula?: string;
  relation?: RelationFieldConfig;
  rollup?: RollupFieldConfig;
  /** Date/time display settings, Notion-style. Applies to `date`,
   *  `created_time`, and `updated_time` fields. */
  dateFormat?: DateDisplayFormat;
  timeFormat?: TimeDisplayFormat;
}

export interface RelationFieldConfig {
  /** Target database for Notion-style relation fields. Omitted means the
   *  field can reference any page/entity until the user narrows it. */
  targetDatabaseId?: ID;
  /** Relation cells store an array of entity refs by default. Set false for
   *  future single-relation editing surfaces. */
  multiple?: boolean;
}

export type RollupAggregation =
  | "count"
  | "count_values"
  | "sum"
  | "average"
  | "min"
  | "max"
  | "range"
  | "show_original";

export interface RollupFieldConfig {
  /** Relation field on the same source database. */
  relationFieldId?: ID;
  /** Field on the relation target database. Not required for `count`. */
  targetFieldId?: ID;
  aggregation?: RollupAggregation;
}

export interface SelectOption {
  id: ID;
  name: string;
  color?: string;
}

export type RecordValue = string | number | boolean | null;
export type DatabaseRecord = Record<string, RecordValue>;

export type BuiltInViewType = "table" | "list" | "calendar" | "gallery";
export type DatabaseViewType = BuiltInViewType | "kanban" | (string & {});
export type PageOpenMode = "side_peek" | "center_peek" | "full_page";
export type ColumnSummaryType =
  | "none"
  | "count"
  | "not_empty"
  | "empty"
  | "unique"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "range";

export interface TableView {
  id: ID;
  databaseId: ID;
  name: string;
  /** Display kind. `table` is the original spreadsheet grid; `list`
   *  renders rows as page-like items; `calendar` lays out rows on a
   *  month grid keyed on `dateFieldId`; `gallery` renders rows as
   *  cover-first cards. Plugin-registered view types (e.g. `kanban`) are
   *  persisted here too and rendered by the renderer-side
   *  DatabaseViewProvider registry. */
  type: DatabaseViewType;
  visibleFieldIds: ID[];
  fieldOrder: ID[];
  sorts: ViewSort[];
  filters: ViewFilter[];
  /** Versioned nested filter tree. Legacy `filters` remain an implicit AND
   * group and are migrated into this shape on the next persisted view write. */
  filterExpression?: FilterGroup;
  /** Shared grouping contract used by table, list, and provider views. */
  groups?: ViewGroup[];
  /** Saved presentation preference; an open peek itself is transient. */
  pageOpenMode?: PageOpenMode;
  /** Provider-specific view configuration. For example, Kanban stores
   *  `{ groupBy: "status" }` here. */
  config?: Record<string, unknown>;
  /** Fields rendered with multiline wrapping. Omitted means every visible
   *  field wraps by default. */
  wrapFieldIds?: ID[];
  columnWidths?: Record<ID, number>;
  /** Per-column footer calculation. Omitted keeps legacy defaults
   *  (average for numeric/formula fields, none for other fields). */
  columnSummaries?: Record<ID, ColumnSummaryType>;
  /** Template row id from the workspace Templates database to apply
   *  when creating from this view's primary New button. */
  defaultTemplateId?: ID;
  pageSize?: number;
  /** Calendar view: which field provides the date for each row. */
  dateFieldId?: ID;
  /** Gallery view: which field provides the cover image path. Falls
   *  back to the row's hidden system `cover` cell when omitted. */
  coverFieldId?: ID;
  /** Monotonic persisted revision used by patch-based view mutations. Legacy
   * view files are read as revision 0 and gain a revision on their next write. */
  revision?: number;
  /** ISO timestamp for the most recent persisted view mutation. */
  updatedAt?: string;
  /** Stable zero-based tab position. Legacy files without a position are
   * normalized from their current deterministic order. */
  position?: number;
  /** Last field pinned to the left in table layouts. */
  frozenThroughFieldId?: ID;
}

export interface ViewSort {
  fieldId: ID;
  direction: "asc" | "desc";
}

export interface ViewGroup {
  version: 1;
  id: ID;
  fieldId: ID;
  order: "asc" | "desc" | "manual";
  groupOrder?: string[];
  hiddenGroupKeys?: string[];
  collapsedGroupKeys?: string[];
  hideEmpty?: boolean;
}

export interface ViewFilter {
  fieldId: ID;
  operator: FilterOperator;
  value: RecordValue;
}

export type FilterOperator =
  | "is" | "is_not" | "contains" | "not_contains" | "gt" | "lt"
  | "checked" | "unchecked" | "is_empty" | "is_not_empty"
  | "within_past" | "within_next";

export interface FilterCondition {
  version: 1;
  kind: "condition";
  id: ID;
  fieldId: ID;
  operator: FilterOperator;
  value: RecordValue;
}

export interface FilterGroup {
  version: 1;
  kind: "group";
  id: ID;
  conjunction: "and" | "or";
  children: Array<FilterGroup | FilterCondition>;
}

export interface DatabaseBundle {
  schema: DatabaseSchema;
  records: DatabaseRecord[];
  views: TableView[];
}

export interface DatabaseRowTemplate {
  id: ID;
  name: string;
  /** Cell defaults keyed by field id. System fields are ignored. */
  values?: Record<string, RecordValue>;
  /** Optional Markdown body to seed the row page with. */
  markdown?: string;
  /** Optional row-page layout preference. */
  fullWidth?: boolean;
}

export interface CreateWorkspaceInput {
  name?: string;
}

export interface CreatePageInput {
  title: string;
  /** Optional Notion-style breadcrumb path. Defaults to `[title]`, or to the
   *  parent page path plus title when `parentId` points at a page. */
  path?: string[];
  parentId?: ID;
  parentKind?: EntityKind;
}

export interface UpdatePageInput {
  markdown?: string;
  tags?: string[];
  date?: string;
  url?: string;
  path?: string[];
  parentId?: ID | null;
  parentKind?: EntityKind | null;
  /** 0..100 vertical focal point for the cover image. */
  coverOffset?: number;
  fullWidth?: boolean;
  smallText?: boolean;
}

export interface CreateDatabaseInput {
  name: string;
  /** Optional Notion-style breadcrumb path. Defaults to `[name]`. */
  path?: string[];
  /** Optional template seed. `fields` are user-visible columns added
   *  after the built-in system fields; `rows` get inserted with their
   *  cell values as the initial data. */
  template?: {
    fields?: FieldSchema[];
    rows?: Array<Record<string, unknown>>;
  };
}

export interface UpdateDatabaseMetaInput {
  databaseId: ID;
  tags?: string[];
  locked?: boolean;
}

export interface SaveDatabaseTemplateInput {
  databaseId: ID;
  template: {
    id?: ID;
    name: string;
    values?: Record<string, RecordValue>;
    markdown?: string;
    fullWidth?: boolean;
  };
}

export interface DeleteDatabaseTemplateInput {
  databaseId: ID;
  templateId: ID;
}

export interface CreateViewInput {
  databaseId: ID;
  name: string;
  type?: DatabaseViewType;
  sourceMode?: "empty" | "duplicate";
  sourceViewId?: ID;
}

export interface ReorderViewsInput {
  databaseId: ID;
  viewIds: ID[];
}

export interface DuplicateViewInput {
  databaseId: ID;
  viewId: ID;
  name?: string;
}

export interface DeleteViewInput {
  databaseId: ID;
  viewId: ID;
}

export interface SetDefaultViewInput {
  databaseId: ID;
  viewId: ID;
}

export interface AddFieldInput {
  name: string;
  type: FieldType;
  options?: SelectOption[];
  formula?: string;
  relation?: RelationFieldConfig;
  rollup?: RollupFieldConfig;
  dateFormat?: DateDisplayFormat;
  timeFormat?: TimeDisplayFormat;
  visibility?: "all" | "current" | "hidden";
  viewId?: ID;
  sourceFieldId?: ID;
  insertAfterFieldId?: ID;
  insertBeforeFieldId?: ID;
}

export interface ReorderFieldsInput {
  databaseId: ID;
  fieldIds: ID[];
}

export interface RestoreFieldInput { databaseId: ID; fieldId: ID; }
export interface PermanentlyDeleteFieldInput { databaseId: ID; fieldId: ID; }

export interface UpdateFieldInput {
  databaseId: ID;
  fieldId: ID;
  name?: string;
  type?: FieldType;
  options?: SelectOption[];
  formula?: string;
  relation?: RelationFieldConfig;
  rollup?: RollupFieldConfig;
  dateFormat?: DateDisplayFormat;
  timeFormat?: TimeDisplayFormat;
}

export interface UpdateCellInput {
  databaseId: ID;
  rowId: ID;
  fieldId: ID;
  value: RecordValue;
}

export interface DeleteRowInput {
  databaseId: ID;
  rowId: ID;
}
export interface DuplicateRowInput { databaseId: ID; rowId: ID; }
export interface RestoreRowInput { databaseId: ID; rowId: ID; }
export interface PermanentlyDeleteRowInput { databaseId: ID; rowId: ID; }
export interface BatchRowsInput {
  databaseId: ID;
  updates?: Array<{ rowId: ID; fieldId: ID; value: RecordValue }>;
  duplicateRowIds?: ID[];
  deleteRowIds?: ID[];
}
export interface BatchRowsResult {
  bundle: DatabaseBundle;
  errors: Array<{ rowId: ID; message: string }>;
  createdRowIds: ID[];
}

export interface UpdateViewInput {
  databaseId: ID;
  view: TableView;
}

export type TableViewPatch = Partial<Omit<TableView, "id" | "databaseId" | "revision" | "updatedAt">>;

export interface PatchViewInput {
  databaseId: ID;
  viewId: ID;
  patch: TableViewPatch;
  expectedRevision: number;
}

export type PatchViewResult =
  | {
      ok: true;
      bundle: DatabaseBundle;
      view: TableView;
    }
  | {
      ok: false;
      error: {
        code: "VIEW_CONFLICT";
        message: string;
        expectedRevision: number;
        actualRevision: number;
      };
      bundle: DatabaseBundle;
      currentView: TableView;
    };

export interface GitStatus {
  installed: boolean;
  repoInitialized: boolean;
  enabled: boolean;
  clean: boolean;
  dirtyCount: number;
  branch?: string;
  ahead?: number;
  behind?: number;
  remote?: string;
  lastCommit?: string;
  output: string;
}

export interface GitBackupResult {
  success: boolean;
  message: string;
  output?: string;
}

export type GitPageHistoryState =
  | "repo_missing"
  | "history_empty"
  | "ready"
  | "failed";

export interface GitPageHistoryVersion {
  id: string;
  sha: string;
  shortSha: string;
  message: string;
  createdAt: string;
  path: string;
  pageId: ID;
  title: string;
}

export interface GitPageHistoryDiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

export interface GitPageHistoryResult {
  state: GitPageHistoryState;
  message: string;
  path?: string;
  pageId: ID;
  title: string;
  versions: GitPageHistoryVersion[];
}

export interface GitPageHistoryPreview {
  version: GitPageHistoryVersion;
  selectedMarkdown: string;
  currentMarkdown: string;
  diff: GitPageHistoryDiffLine[];
}

export type GitSquashPreflightState =
  | "ready"
  | "repo_missing"
  | "dirty"
  | "remote_missing"
  | "behind"
  | "diverged"
  | "failed";

export interface GitSquashPreflightResult {
  ok: boolean;
  state: GitSquashPreflightState;
  message: string;
  branch?: string;
  remote?: string;
  ahead?: number;
  behind?: number;
  output?: string;
}

export type GitSyncCadence = "off" | "minutes_15" | "minutes_30" | "hourly" | "daily";
export type GitSyncPushCadence = "off" | "after_backup" | "hourly" | "daily";

export interface GitSyncSettings {
  remoteUrl: string;
  branch: string;
  sshKeyPath: string;
  autoBackupCadence: GitSyncCadence;
  autoPushCadence: GitSyncPushCadence;
  automationPaused: boolean;
  commitMessagePrefix: string;
  lastBackupAt?: string;
  lastPushAt?: string;
  lastError?: string;
}

export type GitSyncSettingsInput = Partial<GitSyncSettings>;

export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

export interface RowPageDocument {
  databaseId: ID;
  rowId: ID;
  /** Unified page metadata for this row page. This is the same metadata
   *  shape regular pages use, including imported path/parent links. */
  meta: PageMeta;
  title: string;
  created_time: string;
  updated_time: string;
  markdown: string;
  /** Page-local layout setting stored as row metadata, not in the
   *  Markdown body. */
  fullWidth?: boolean;
  /** Snapshot of the database schema at open time, so the row-page UI can
   *  render an editable properties panel without a second IPC. */
  schema: DatabaseSchema;
  /** The row this page belongs to, formula values included. */
  record: DatabaseRecord;
}

export interface UpdateRowPageInput {
  databaseId: ID;
  rowId: ID;
  markdown: string;
}

export interface SetRowPageFullWidthInput {
  databaseId: ID;
  rowId: ID;
  fullWidth: boolean;
}

export interface SetRowPageSmallTextInput {
  databaseId: ID;
  rowId: ID;
  smallText: boolean;
}

export interface PagesTreeDatabaseFolder {
  databaseId: ID;
  name: string;
  fileNames: string[];
}

export interface PagesTree {
  topLevelPages: PageMeta[];
  databases: PagesTreeDatabaseFolder[];
}

export type StartupCacheStatus = "hit" | "rebuilt";

export interface StartupCacheDiagnostics {
  status: StartupCacheStatus;
  reason: string;
  path: string;
  bytes: number;
  validationMs: number;
  readMs: number;
  buildMs: number;
  writeMs: number;
}

export interface StartupWorkspaceIndex {
  pages: PageMeta[];
  databases: DatabaseSummary[];
  pagesTree: PagesTree;
  cache: StartupCacheDiagnostics;
}
