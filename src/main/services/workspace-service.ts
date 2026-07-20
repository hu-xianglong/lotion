import electron from "electron";
import { basename, join } from "node:path";
import { DEFAULT_VIEW_ID, isSystemDatabaseId, PAGES_DATABASE_ID, WORKSPACES_DATABASE_ID, WORKSPACE_VERSION } from "../../shared/constants.js";
import { createId } from "../../shared/ids.js";
import type { CreateWorkspaceInput, DatabaseRecord, DatabaseSchema, FieldSchema, RecentItemInput, SpaceManifest, TableView, WorkspaceMeta } from "../../shared/types.js";
import { readCsvFile, writeCsvFile } from "../storage/csv-file.js";
import { readJsonFile, writeJsonFile } from "../storage/json-file.js";
import { WorkspacePaths } from "../storage/paths.js";
import { AppConfigService } from "./app-config-service.js";
import { fileService } from "./file-service.js";

const { app, dialog } = electron;

export class WorkspaceService {
  private paths?: WorkspacePaths;
  private manifestCache?: SpaceManifest;
  private readonly config: AppConfigService;

  constructor(config?: AppConfigService) {
    this.config = config ?? new AppConfigService();
  }

  async create(input: CreateWorkspaceInput = {}): Promise<SpaceManifest> {
    const selected = await dialog.showOpenDialog({
      title: "Choose where to create your Lotion space",
      properties: ["openDirectory", "createDirectory"]
    });

    if (selected.canceled || !selected.filePaths[0]) {
      return this.openDefault();
    }

    const root = join(selected.filePaths[0], input.name || "Lotion Space");
    const manifest = await this.initialize(root, input.name || "Lotion Space");
    await this.config.touch(root, manifest.name, manifest.icon);
    return manifest;
  }

  async createAt(root: string, input: CreateWorkspaceInput = {}): Promise<SpaceManifest> {
    const name = input.name?.trim() || basename(root) || "Lotion Space";
    const manifest = await this.initialize(root, name);
    await this.config.touch(root, manifest.name, manifest.icon);
    return manifest;
  }

  /**
   * Opens an explicit workspace path, or — when no path is given —
   * the path remembered by app-config, or the legacy default-space
   * directory if config is empty. Successful opens record into the
   * recents list as a side effect.
   */
  async open(path?: string): Promise<SpaceManifest> {
    if (path) {
      const previousPaths = this.paths;
      const previousManifest = this.manifestCache;
      const nextPaths = new WorkspacePaths(path);
      if (!fileService.exists(nextPaths.manifest())) {
        throw new Error(await describeWorkspaceOpenFailure(path));
      }
      this.paths = new WorkspacePaths(path);
      this.manifestCache = undefined;
      try {
        const manifest = await this.getManifest();
        await this.config.touch(this.paths.root, manifest.name, manifest.icon);
        return manifest;
      } catch (error) {
        this.paths = previousPaths;
        this.manifestCache = previousManifest;
        throw error;
      }
    }
    return this.openDefault();
  }

  async openDefault(): Promise<SpaceManifest> {
    const config = await this.config.load();
    const fallback = join(app.getPath("userData"), "default-space");
    const target = config.active ?? fallback;
    try {
      this.paths = new WorkspacePaths(target);
      this.manifestCache = undefined;
      const manifest = await this.getManifest();
      await this.config.touch(this.paths.root, manifest.name, manifest.icon);
      return manifest;
    } catch {
      // Initialise a fresh workspace at the fallback location so the
      // app always has something to render.
      const manifest = await this.initialize(fallback, "My Lotion Space");
      await this.config.touch(fallback, manifest.name, manifest.icon);
      return manifest;
    }
  }

  /** List of workspaces the user has touched, MRU first. */
  async listRecent() {
    const config = await this.config.load();
    return config.recents;
  }

  /** Drop a workspace from the recents list (does NOT delete files). */
  async forget(path: string): Promise<void> {
    await this.config.forget(path);
  }

  async getManifest(): Promise<SpaceManifest> {
    if (this.manifestCache) return this.manifestCache;
    const manifest = await this.loadNormalizedManifest();
    const meta = await this.ensureWorkspaceDatabase(manifest);
    this.manifestCache = { ...manifest, icon: meta.icon };
    return this.manifestCache;
  }

  async saveManifest(manifest: SpaceManifest): Promise<void> {
    const paths = this.requirePaths();
    const normalized = this.normalizeManifest(manifest).manifest;
    const { icon: _icon, ...persisted } = normalized;
    await writeJsonFile(paths.manifest(), persisted);
    this.manifestCache = await this.withWorkspaceMeta(persisted);
  }

  async setWorkspaceIcon(icon: string): Promise<SpaceManifest> {
    const manifest = await this.loadNormalizedManifest();
    const next = await this.upsertWorkspaceMeta(manifest, { icon });
    this.manifestCache = { ...manifest, icon: next.icon };
    await this.config.touch(this.requirePaths().root, manifest.name, next.icon);
    return this.manifestCache;
  }

  async clearWorkspaceIcon(): Promise<SpaceManifest> {
    const manifest = await this.loadNormalizedManifest();
    const next = await this.upsertWorkspaceMeta(manifest, { icon: "" });
    this.manifestCache = { ...manifest, icon: next.icon };
    await this.config.touch(this.requirePaths().root, manifest.name, next.icon);
    return this.manifestCache;
  }

  async listFavorites(): Promise<NonNullable<SpaceManifest["favorites"]>> {
    const manifest = await this.getManifest();
    return manifest.favorites ?? [];
  }

  /** Reorder the sidebar's pages list. Caller must supply the COMPLETE
   *  list — we replace the manifest's order verbatim. Anything missing
   *  from the new list is dropped, so callers must include every id. */
  async reorderPages(ids: string[]): Promise<SpaceManifest> {
    const manifest = await this.getManifest();
    const updated: SpaceManifest = { ...manifest, pages: ids };
    await this.saveManifest(updated);
    return updated;
  }

  async reorderDatabases(ids: string[]): Promise<SpaceManifest> {
    const manifest = await this.getManifest();
    const updated: SpaceManifest = { ...manifest, databases: ids };
    await this.saveManifest(updated);
    return updated;
  }

  async listRecents(): Promise<NonNullable<SpaceManifest["recents"]>> {
    const manifest = await this.getManifest();
    return manifest.recents ?? [];
  }

  /** Push an item to the head of the recents list. Dedupes by item
   *  identity; caps at 24 (the sidebar shows a handful, the manage
   *  page can show all of them). */
  async pushRecent(item: RecentItemInput): Promise<SpaceManifest> {
    const manifest = await this.getManifest();
    const list = manifest.recents ?? [];
    const existing = list.find((recent) => sameRecent(recent, item));
    const stamped = {
      ...item,
      at: new Date().toISOString(),
      count: (existing?.count ?? 0) + 1
    } as NonNullable<SpaceManifest["recents"]>[number];
    const next = [stamped, ...list.filter((r) => !sameRecent(r, stamped))].slice(0, 24);
    const updated: SpaceManifest = { ...manifest, recents: next };
    await this.saveManifest(updated);
    return updated;
  }

  /**
   * Add or remove a favorite. Pages and databases key on `id`;
   * row-pages key on `databaseId+rowId`. Newly favorited items append.
   */
  async toggleFavorite(item: NonNullable<SpaceManifest["favorites"]>[number]): Promise<SpaceManifest> {
    const manifest = await this.getManifest();
    const list = manifest.favorites ?? [];
    const next = list.filter((f) => !sameFavorite(f, item));
    if (next.length === list.length) next.push(item);
    const updated: SpaceManifest = { ...manifest, favorites: next };
    await this.saveManifest(updated);
    return updated;
  }

  requirePaths(): WorkspacePaths {
    if (!this.paths) {
      throw new Error("No workspace is open");
    }
    return this.paths;
  }

  private async initialize(root: string, name: string): Promise<SpaceManifest> {
    this.paths = new WorkspacePaths(root);
    await fileService.ensureDir(this.paths.userDatabasesDir());
    await fileService.ensureDir(this.paths.systemDatabasesDir());

    const manifest: SpaceManifest = {
      version: WORKSPACE_VERSION,
      spaceId: createId("sp"),
      name,
      pages: [],
      databases: [],
      systemDatabases: [WORKSPACES_DATABASE_ID, PAGES_DATABASE_ID]
    };

    await writeJsonFile(this.paths.manifest(), manifest);
    const meta = await this.ensureWorkspaceDatabase(manifest);
    this.manifestCache = { ...manifest, icon: meta.icon };
    return this.manifestCache;
  }

  private async loadNormalizedManifest(): Promise<SpaceManifest> {
    const paths = this.requirePaths();
    const raw = await readJsonFile<SpaceManifest>(paths.manifest());
    const normalized = this.normalizeManifest(raw);
    if (normalized.changed) {
      const { icon: _icon, ...persisted } = normalized.manifest;
      await writeJsonFile(paths.manifest(), persisted);
    }
    return normalized.manifest;
  }

  private normalizeManifest(raw: SpaceManifest): { manifest: SpaceManifest; changed: boolean } {
    const system = new Set(raw.systemDatabases ?? []);
    system.delete("templates");
    const userDatabases: string[] = [];
    for (const id of raw.databases ?? []) {
      if (isSystemDatabaseId(id)) system.add(id);
      else userDatabases.push(id);
    }
    system.add(WORKSPACES_DATABASE_ID);
    system.add(PAGES_DATABASE_ID);
    const manifest: SpaceManifest = {
      ...raw,
      version: WORKSPACE_VERSION,
      pages: raw.pages ?? [],
      databases: userDatabases,
      systemDatabases: Array.from(system)
    };
    const rawDatabases = raw.databases ?? [];
    const rawSystemDatabases = raw.systemDatabases ?? [];
    const changed =
      raw.version !== manifest.version ||
      raw.pages !== manifest.pages ||
      rawDatabases.length !== manifest.databases.length ||
      rawDatabases.some((id, index) => id !== manifest.databases[index]) ||
      !raw.systemDatabases ||
      rawSystemDatabases.length !== manifest.systemDatabases.length ||
      rawSystemDatabases.some((id, index) => id !== manifest.systemDatabases[index]) ||
      !!raw.icon;
    return { manifest, changed };
  }

  private async withWorkspaceMeta(manifest: SpaceManifest): Promise<SpaceManifest> {
    const meta = await this.ensureWorkspaceDatabase(manifest);
    return { ...manifest, icon: meta.icon };
  }

  private async ensureWorkspaceDatabase(manifest: SpaceManifest): Promise<WorkspaceMeta> {
    const paths = this.requirePaths();
    await fileService.ensureDir(paths.systemDatabasesDir());
    await fileService.ensureDir(paths.viewsDir(WORKSPACES_DATABASE_ID, "workspaces"));

    const now = new Date().toISOString();
    let schemaChanged = false;
    let schema: DatabaseSchema;
    try {
      schema = await readJsonFile<DatabaseSchema>(paths.schema(WORKSPACES_DATABASE_ID, "workspaces"));
      const normalized = normalizeWorkspaceSchema(schema, now);
      schema = normalized.schema;
      schemaChanged = normalized.changed;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      schema = createWorkspaceDatabaseSchema(now);
      schemaChanged = true;
    }

    if (schemaChanged) {
      await writeJsonFile(paths.schema(WORKSPACES_DATABASE_ID, "workspaces"), schema);
    }
    if (!(await pathExists(paths.data(WORKSPACES_DATABASE_ID, "workspaces")))) {
      await writeCsvFile(paths.data(WORKSPACES_DATABASE_ID, "workspaces"), schema.fields.map((field) => field.id), []);
    }
    if (!(await pathExists(paths.view(WORKSPACES_DATABASE_ID, DEFAULT_VIEW_ID, "workspaces")))) {
      await writeJsonFile(paths.view(WORKSPACES_DATABASE_ID, DEFAULT_VIEW_ID, "workspaces"), createWorkspaceDefaultView());
    }

    return this.upsertWorkspaceMeta(manifest, {});
  }

  private async upsertWorkspaceMeta(
    manifest: SpaceManifest,
    patch: { icon?: string }
  ): Promise<WorkspaceMeta> {
    const paths = this.requirePaths();
    let schema: DatabaseSchema;
    try {
      schema = await readJsonFile<DatabaseSchema>(paths.schema(WORKSPACES_DATABASE_ID, "workspaces"));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      schema = createWorkspaceDatabaseSchema(new Date().toISOString());
      await fileService.ensureDir(paths.viewsDir(WORKSPACES_DATABASE_ID, "workspaces"));
      await writeJsonFile(paths.schema(WORKSPACES_DATABASE_ID, "workspaces"), schema);
      await writeJsonFile(paths.view(WORKSPACES_DATABASE_ID, DEFAULT_VIEW_ID, "workspaces"), createWorkspaceDefaultView());
    }

    let records: DatabaseRecord[] = [];
    if (await pathExists(paths.data(WORKSPACES_DATABASE_ID, "workspaces"))) {
      records = await readCsvFile(paths.data(WORKSPACES_DATABASE_ID, "workspaces"));
    }

    const now = new Date().toISOString();
    const existing = records.find((item) => String(item.id) === manifest.spaceId);
    const icon = patch.icon !== undefined
      ? patch.icon
      : String(existing?.icon ?? "");
    if (
      existing &&
      String(existing.title ?? "") === manifest.name &&
      String(existing.icon ?? "") === icon
    ) {
      return recordToWorkspaceMeta(existing, manifest);
    }
    const next: DatabaseRecord = {
      id: manifest.spaceId,
      created_time: String(existing?.created_time || now),
      updated_time: now,
      title: manifest.name,
      icon
    };
    const nextRecords = existing
      ? records.map((item) => (String(item.id) === manifest.spaceId ? next : item))
      : [...records, next];
    await writeCsvFile(paths.data(WORKSPACES_DATABASE_ID, "workspaces"), schema.fields.map((field) => field.id), nextRecords);
    return recordToWorkspaceMeta(next, manifest);
  }
}

function createWorkspaceDatabaseSchema(now: string): DatabaseSchema {
  return {
    id: WORKSPACES_DATABASE_ID,
    name: "workspaces",
    created_time: now,
    updated_time: now,
    fields: createWorkspaceFields(),
    defaultViewId: DEFAULT_VIEW_ID
  };
}

function normalizeWorkspaceSchema(schema: DatabaseSchema, now: string): { schema: DatabaseSchema; changed: boolean } {
  const fields = [...schema.fields];
  let changed = schema.id !== WORKSPACES_DATABASE_ID || schema.name !== "workspaces" || schema.defaultViewId !== DEFAULT_VIEW_ID;
  for (const field of createWorkspaceFields()) {
    if (!fields.some((existing) => existing.id === field.id)) {
      fields.push(field);
      changed = true;
    }
  }
  return {
    schema: {
      ...schema,
      id: WORKSPACES_DATABASE_ID,
      name: "workspaces",
      defaultViewId: DEFAULT_VIEW_ID,
      fields,
      updated_time: changed ? now : schema.updated_time
    },
    changed
  };
}

function createWorkspaceFields(): FieldSchema[] {
  return [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "icon", name: "Icon", type: "text" }
  ];
}

function createWorkspaceDefaultView(): TableView {
  const visibleFieldIds = ["title", "icon", "updated_time"];
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: WORKSPACES_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: visibleFieldIds,
    sorts: [],
    filters: []
  };
}

function recordToWorkspaceMeta(record: DatabaseRecord | undefined, manifest: SpaceManifest): WorkspaceMeta {
  const now = new Date().toISOString();
  const icon = String(record?.icon ?? "").trim() || undefined;
  return {
    id: manifest.spaceId,
    title: String(record?.title ?? manifest.name),
    icon,
    created_time: String(record?.created_time ?? now),
    updated_time: String(record?.updated_time ?? now)
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fileService.readText(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

async function describeWorkspaceOpenFailure(root: string): Promise<string> {
  const selectedPath = root;
  const manifestPath = join(root, "lotion.json");
  const childWorkspaces = await findLikelyWorkspaceChildren(root);
  const parts = [
    "Cannot open workspace: the selected folder does not contain lotion.json.",
    `Selected folder: ${selectedPath}`,
    `Expected file: ${manifestPath}`
  ];
  if (childWorkspaces.length > 0) {
    parts.push(`Suggested workspace folder: ${childWorkspaces[0]}`);
    if (childWorkspaces.length > 1) {
      parts.push(`Other workspace folders: ${childWorkspaces.slice(1, 3).join(", ")}`);
    }
  } else {
    parts.push("Choose the folder that directly contains lotion.json.");
  }
  return parts.join("\n");
}

async function findLikelyWorkspaceChildren(root: string): Promise<string[]> {
  try {
    const entries = await fileService.readDir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
      .filter((candidate) => fileService.exists(join(candidate, "lotion.json")))
      .sort((a, b) => scoreWorkspaceChild(a) - scoreWorkspaceChild(b) || a.localeCompare(b))
      .slice(0, 3);
  } catch (error) {
    if (isNotFoundError(error) || (error as NodeJS.ErrnoException).code === "ENOTDIR") return [];
    throw error;
  }
}

function scoreWorkspaceChild(path: string): number {
  const name = basename(path).toLowerCase();
  if (name === "workspace") return 0;
  if (name.includes("workspace")) return 1;
  return 2;
}

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function sameFavorite(
  a: NonNullable<SpaceManifest["favorites"]>[number],
  b: NonNullable<SpaceManifest["favorites"]>[number]
): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "page" && b.type === "page") return a.id === b.id;
  if (a.type === "database" && b.type === "database") return a.id === b.id;
  if (a.type === "row_page" && b.type === "row_page") {
    return a.databaseId === b.databaseId && a.rowId === b.rowId;
  }
  return false;
}

function sameRecent(
  a: NonNullable<SpaceManifest["recents"]>[number] | RecentItemInput,
  b: NonNullable<SpaceManifest["recents"]>[number] | RecentItemInput
): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "page" && b.type === "page") return a.id === b.id;
  if (a.type === "database" && b.type === "database") return a.id === b.id;
  if (a.type === "row_page" && b.type === "row_page") {
    return a.databaseId === b.databaseId && a.rowId === b.rowId;
  }
  return false;
}
