import { createHash } from "node:crypto";
import { join } from "node:path";
import { DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, isSystemDatabaseId, PAGES_DATABASE_ID } from "../../shared/constants.js";
import { parsePathValue, serializePathValue } from "../../shared/path-values.js";
import { databaseFolderName } from "../../shared/workspace-paths.js";
import type {
  DatabaseRecord,
  DatabaseSchema,
  EntityBacklink,
  EntityKind,
  EntityLookupResult,
  EntityRecord,
  EntityRef,
  FieldSchema,
  TableView
} from "../../shared/types.js";
import { readCsvFile } from "../storage/csv-file.js";
import { readJsonFile } from "../storage/json-file.js";
import type { WorkspacePaths } from "../storage/paths.js";
import { fileService } from "./file-service.js";
import type { WorkspaceService } from "./workspace-service.js";

const KIND_FIELD = "kind";
const TITLE_FIELD = "title";
const ICON_FIELD = "icon";
const PATH_FIELD = "path";
const PARENT_ID_FIELD = "parent_id";
const DATABASE_ID_FIELD = "database_id";
const ROW_ID_FIELD = "row_id";
const BODY_PATH_FIELD = "body_path";
const SOURCE_NOTION_HASH_FIELD = "source_notion_hash";

interface EntityIndexEntry extends EntityLookupResult {
  bodyPath?: string;
}

interface EntityIndex {
  byId: Map<string, EntityIndexEntry>;
}

interface DatabaseTableFile {
  schemaPath: string;
  dataPath: string;
}

interface BacklinkGraphCache {
  root: string;
  fingerprint: string;
  fileRevision: number;
  knownIds: Set<string>;
  byTargetId: Map<string, EntityBacklink[]>;
  sourceCount: number;
  markdownLinkCount: number;
  propertyCellCount: number;
  buildMs: number;
}

interface SerializedBacklinkGraphCache {
  version: 1;
  fingerprint: string;
  builtAt: string;
  sourceCount: number;
  markdownLinkCount: number;
  propertyCellCount: number;
  buildMs: number;
  byTargetId: Record<string, EntityBacklink[]>;
}

interface BacklinkCacheStats {
  fingerprint: string;
  targetCount: number;
  sourceCount: number;
  markdownLinkCount: number;
  propertyCellCount: number;
  buildMs: number;
}

const BACKLINK_CACHE_VERSION = 1;
const BACKLINK_CACHE_PATH = ".lotion-cache/backlinks.json";

export function createEntitiesSchema(now: string): DatabaseSchema {
  return {
    id: ENTITIES_DATABASE_ID,
    name: "entities",
    created_time: now,
    updated_time: now,
    fields: createEntitiesFields(),
    defaultViewId: DEFAULT_VIEW_ID
  };
}

export function createEntitiesFields(): FieldSchema[] {
  return [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: KIND_FIELD, name: "Kind", type: "select", options: [
      { id: "page", name: "page", color: "gray" },
      { id: "database", name: "database", color: "green" },
      { id: "row", name: "row", color: "blue" }
    ] },
    { id: TITLE_FIELD, name: "Name", type: "text" },
    { id: ICON_FIELD, name: "Icon", type: "text" },
    { id: PATH_FIELD, name: "Path", type: "text" },
    { id: PARENT_ID_FIELD, name: "Parent entity", type: "entity_ref" },
    { id: DATABASE_ID_FIELD, name: "Database ID", type: "text", system: true, hidden: true },
    { id: ROW_ID_FIELD, name: "Row ID", type: "text", system: true, hidden: true },
    { id: BODY_PATH_FIELD, name: "Body path", type: "text", system: true, hidden: true },
    { id: SOURCE_NOTION_HASH_FIELD, name: "Source Notion hash", type: "text", system: true, hidden: true }
  ];
}

export function createEntitiesDefaultView(): TableView {
  const visibleFieldIds = [KIND_FIELD, TITLE_FIELD, PATH_FIELD, ICON_FIELD, "updated_time"];
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: ENTITIES_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: [TITLE_FIELD, PATH_FIELD],
    sorts: [{ fieldId: "updated_time", direction: "desc" }],
    filters: []
  };
}

export function normalizeEntitiesSchema(schema: DatabaseSchema, now: string): { schema: DatabaseSchema; changed: boolean } {
  const fields = [...schema.fields];
  let changed = schema.id !== ENTITIES_DATABASE_ID || schema.name !== "entities" || schema.defaultViewId !== DEFAULT_VIEW_ID;
  for (const required of createEntitiesFields()) {
    const existingIndex = fields.findIndex((field) => field.id === required.id);
    if (existingIndex < 0) {
      fields.push(required);
      changed = true;
    } else if (fields[existingIndex].type !== required.type) {
      fields[existingIndex] = { ...fields[existingIndex], type: required.type };
      changed = true;
    }
  }
  return {
    schema: {
      ...schema,
      id: ENTITIES_DATABASE_ID,
      name: "entities",
      defaultViewId: DEFAULT_VIEW_ID,
      updated_time: changed ? now : schema.updated_time,
      fields
    },
    changed
  };
}

export function entityToRecord(entity: EntityRecord, now: string): DatabaseRecord {
  return {
    id: entity.id,
    created_time: entity.created_time ?? now,
    updated_time: entity.updated_time ?? entity.created_time ?? now,
    [KIND_FIELD]: entity.kind,
    [TITLE_FIELD]: entity.title || "Untitled",
    [ICON_FIELD]: entity.icon ?? "",
    [PATH_FIELD]: serializePathValue(entity.path),
    [PARENT_ID_FIELD]: entity.parentId
      ? JSON.stringify([{ entityId: entity.parentId, kind: entity.parentKind ?? "page" }])
      : "",
    [DATABASE_ID_FIELD]: entity.databaseId ?? "",
    [ROW_ID_FIELD]: entity.rowId ?? "",
    [BODY_PATH_FIELD]: entity.bodyPath ?? "",
    [SOURCE_NOTION_HASH_FIELD]: entity.sourceNotionHash ?? ""
  };
}

export class EntitiesDatabaseService {
  private cacheRoot?: string;
  private recordsCache?: DatabaseRecord[];
  private backlinkCache?: BacklinkGraphCache;

  constructor(private readonly workspace: WorkspaceService) {}

  async resolve(id: string): Promise<EntityLookupResult | null> {
    const index = await this.readEntityIndex();
    return index.byId.get(id) ?? null;
  }

  async backlinks(id: string): Promise<EntityBacklink[]> {
    const startedAt = performance.now();
    const { graph, source } = await this.readBacklinkGraph();
    const results = graph.knownIds.has(id)
      ? [...(graph.byTargetId.get(id) ?? [])]
      : [];
    openLog("entities.backlinks", {
      id,
      count: results.length,
      cache: source,
      buildMs: source === "rebuilt" ? graph.buildMs : undefined,
      totalMs: elapsedMs(startedAt)
    });
    return results;
  }

  backlinkCacheStats(): BacklinkCacheStats | null {
    const cache = this.backlinkCache;
    if (!cache) return null;
    return {
      fingerprint: cache.fingerprint,
      targetCount: cache.byTargetId.size,
      sourceCount: cache.sourceCount,
      markdownLinkCount: cache.markdownLinkCount,
      propertyCellCount: cache.propertyCellCount,
      buildMs: cache.buildMs
    };
  }

  private async readBacklinkGraph(): Promise<{ graph: BacklinkGraphCache; source: "memory" | "disk" | "rebuilt" }> {
    const paths = this.workspace.requirePaths();
    const sourceRevision = backlinkSourceRevision(paths);
    if (this.backlinkCache?.root === paths.root && this.backlinkCache.fileRevision === sourceRevision) {
      return { graph: this.backlinkCache, source: "memory" };
    }

    const index = await this.readEntityIndex();
    const tableFiles = await this.readDatabaseTableFiles();
    const fingerprint = await this.buildBacklinkFingerprint(index, tableFiles);

    if (this.backlinkCache?.root === paths.root && this.backlinkCache.fingerprint === fingerprint) {
      this.backlinkCache.fileRevision = backlinkSourceRevision(paths);
      return { graph: this.backlinkCache, source: "memory" };
    }

    const diskCache = await this.readBacklinkCacheFile(paths.root, fingerprint, index);
    if (diskCache) {
      diskCache.fileRevision = backlinkSourceRevision(paths);
      this.backlinkCache = diskCache;
      return { graph: diskCache, source: "disk" };
    }

    const graph = await this.buildBacklinkGraph(index, tableFiles, fingerprint);
    this.backlinkCache = graph;
    await this.writeBacklinkCacheFile(paths.root, graph);
    return { graph, source: "rebuilt" };
  }

  private async buildBacklinkGraph(index: EntityIndex, tableFiles: DatabaseTableFile[], fingerprint: string): Promise<BacklinkGraphCache> {
    const startedAt = performance.now();
    const paths = this.workspace.requirePaths();
    const byTargetId = new Map<string, EntityBacklink[]>();
    const knownIds = new Set(index.byId.keys());
    const seen = new Set<string>();
    const targetsByPath = new Map<string, EntityIndexEntry[]>();
    let markdownLinkCount = 0;
    let propertyCellCount = 0;

    for (const target of index.byId.values()) {
      for (const candidate of targetWorkspaceLinkCandidates(target)) {
        const targets = targetsByPath.get(candidate) ?? [];
        targets.push(target);
        targetsByPath.set(candidate, targets);
      }
    }

    for (const source of index.byId.values()) {
      if (!source.bodyPath) continue;
      let markdown = "";
      try {
        markdown = await fileService.readText(join(paths.root, source.bodyPath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        continue;
      }

      for (const link of markdownLinkTargets(markdown)) {
        const targets = targetsByPath.get(link.target);
        if (!targets) continue;
        markdownLinkCount += 1;
        for (const target of targets) {
          if (source.entityId === target.entityId) continue;
          const key = `markdown:${source.entityId}:${target.entityId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          appendBacklink(byTargetId, target.entityId, {
            type: "markdown",
            source,
            sourceBodyPath: source.bodyPath,
            line: link.line,
            excerpt: link.excerpt
          });
        }
      }
    }

    for (const table of await this.readDatabaseTables(tableFiles)) {
      for (const record of table.records) {
        const sourceId = stringValue(record.id);
        if (!sourceId) continue;
        const source = index.byId.get(sourceId) ?? fallbackRowEntity(table.schema, record);
        for (const field of table.schema.fields) {
          const value = record[field.id];
          for (const targetId of cellReferencedEntityIds(value)) {
            const target = index.byId.get(targetId);
            if (!target || sourceId === target.entityId) continue;
            propertyCellCount += 1;
            const key = `property:${source.entityId}:${table.schema.id}:${field.id}:${target.entityId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            appendBacklink(byTargetId, target.entityId, {
              type: "property",
              source,
              databaseId: table.schema.id,
              databaseName: table.schema.name,
              fieldId: field.id,
              fieldName: field.name,
              excerpt: previewPropertyCell(value, target)
            });
          }
        }
      }
    }

    for (const [targetId, backlinks] of byTargetId) {
      byTargetId.set(targetId, backlinks.sort(compareBacklinks));
    }

    return {
      root: paths.root,
      fingerprint,
      fileRevision: backlinkSourceRevision(paths),
      knownIds,
      byTargetId,
      sourceCount: [...index.byId.values()].filter((source) => source.bodyPath).length,
      markdownLinkCount,
      propertyCellCount,
      buildMs: elapsedMs(startedAt)
    };
  }

  private async buildBacklinkFingerprint(index: EntityIndex, tableFiles: DatabaseTableFile[]): Promise<string> {
    const paths = this.workspace.requirePaths();
    const parts = [`v${BACKLINK_CACHE_VERSION}`, paths.root];
    for (const source of [...index.byId.values()].filter((item) => item.bodyPath).sort((a, b) => (a.bodyPath ?? "").localeCompare(b.bodyPath ?? ""))) {
      parts.push(await fileSignature(join(paths.root, source.bodyPath ?? "")));
    }
    for (const tableFile of [...tableFiles].sort((a, b) => a.dataPath.localeCompare(b.dataPath))) {
      parts.push(await fileSignature(tableFile.schemaPath));
      parts.push(await fileSignature(tableFile.dataPath));
    }
    return stableHash(parts.join("\n"));
  }

  private async readBacklinkCacheFile(root: string, fingerprint: string, index: EntityIndex): Promise<BacklinkGraphCache | null> {
    let raw = "";
    try {
      raw = await fileService.readText(join(root, BACKLINK_CACHE_PATH));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return null;
    }
    let parsed: SerializedBacklinkGraphCache;
    try {
      parsed = JSON.parse(raw) as SerializedBacklinkGraphCache;
    } catch {
      return null;
    }
    if (parsed.version !== BACKLINK_CACHE_VERSION || parsed.fingerprint !== fingerprint) return null;
    return {
      root,
      fingerprint,
      fileRevision: backlinkSourceRevision(this.workspace.requirePaths()),
      knownIds: new Set(index.byId.keys()),
      byTargetId: new Map(Object.entries(parsed.byTargetId ?? {}).map(([targetId, backlinks]) => [targetId, backlinks])),
      sourceCount: parsed.sourceCount,
      markdownLinkCount: parsed.markdownLinkCount,
      propertyCellCount: parsed.propertyCellCount,
      buildMs: parsed.buildMs
    };
  }

  private async writeBacklinkCacheFile(root: string, graph: BacklinkGraphCache): Promise<void> {
    const payload: SerializedBacklinkGraphCache = {
      version: BACKLINK_CACHE_VERSION,
      fingerprint: graph.fingerprint,
      builtAt: new Date().toISOString(),
      sourceCount: graph.sourceCount,
      markdownLinkCount: graph.markdownLinkCount,
      propertyCellCount: graph.propertyCellCount,
      buildMs: graph.buildMs,
      byTargetId: Object.fromEntries(graph.byTargetId)
    };
    await fileService.writeTextAtomic(join(root, BACKLINK_CACHE_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  }

  private async readEntityIndex(): Promise<EntityIndex> {
    const byId = new Map<string, EntityIndexEntry>();

    for (const record of await this.readRecords()) {
      const entity = entityFromRecord(record);
      if (entity) byId.set(entity.entityId, entity);
    }

    const paths = this.workspace.requirePaths();
    const pageRecords = await readCsvFile(paths.data(PAGES_DATABASE_ID, "pages"));
    for (const record of pageRecords) {
      const entity = entityFromPageRecord(record);
      if (!entity) continue;
      const existing = byId.get(entity.entityId);
      byId.set(entity.entityId, {
        ...existing,
        ...entity,
        icon: entity.icon || existing?.icon,
        path: entity.path && entity.path.length > 0 ? entity.path : existing?.path,
        pathSnapshot: entity.pathSnapshot && entity.pathSnapshot.length > 0 ? entity.pathSnapshot : existing?.pathSnapshot,
        titleSnapshot: entity.titleSnapshot || existing?.titleSnapshot
      });
    }

    return { byId };
  }

  private async readRecords(): Promise<DatabaseRecord[]> {
    const paths = this.workspace.requirePaths();
    if (this.cacheRoot === paths.root && this.recordsCache) return this.recordsCache;
    const records = await readCsvFile(paths.data(ENTITIES_DATABASE_ID, "entities"));
    this.cacheRoot = paths.root;
    this.recordsCache = records;
    return records;
  }

  private async readDatabaseTableFiles(): Promise<DatabaseTableFile[]> {
    const paths = this.workspace.requirePaths();
    const files: DatabaseTableFile[] = [];
    for (const groupDir of [paths.userDatabasesDir(), paths.systemDatabasesDir()]) {
      let entries;
      try {
        entries = await fileService.readDir(groupDir, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = join(groupDir, entry.name);
        files.push({
          schemaPath: join(dir, "schema.json"),
          dataPath: join(dir, "data.csv")
        });
      }
    }
    return files;
  }

  private async readDatabaseTables(files?: DatabaseTableFile[]): Promise<Array<{ schema: DatabaseSchema; records: DatabaseRecord[] }>> {
    const tables: Array<{ schema: DatabaseSchema; records: DatabaseRecord[] }> = [];
    for (const file of files ?? await this.readDatabaseTableFiles()) {
      let schema: DatabaseSchema;
      try {
        schema = await readJsonFile<DatabaseSchema>(file.schemaPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        continue;
      }
      if (schema.id === ENTITIES_DATABASE_ID) continue;
      const records = await readCsvFile(file.dataPath);
      tables.push({ schema, records });
    }
    return tables;
  }
}

function parseEntityKind(value: unknown): EntityKind | undefined {
  if (value === "page" || value === "database" || value === "row") return value;
  return undefined;
}

function parsePath(value: unknown): string[] {
  return parsePathValue(value);
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function entityFromRecord(record: DatabaseRecord): EntityIndexEntry | null {
  const id = stringValue(record.id);
  const kind = parseEntityKind(record[KIND_FIELD]);
  if (!id || !kind) return null;
  const title = stringValue(record[TITLE_FIELD]) || "Untitled";
  const databaseId = stringValue(record[DATABASE_ID_FIELD]);
  const rowId = stringValue(record[ROW_ID_FIELD]);
  const path = parsePath(record[PATH_FIELD]);
  const icon = stringValue(record[ICON_FIELD]);
  const bodyPath = normalizeWorkspacePath(stringValue(record[BODY_PATH_FIELD]));
  return {
    entityId: id,
    kind,
    databaseId: databaseId || undefined,
    rowId: rowId || (kind === "row" ? id : undefined),
    title,
    titleSnapshot: title,
    path,
    pathSnapshot: path,
    icon: icon || undefined,
    bodyPath: bodyPath || undefined
  };
}

function entityFromPageRecord(record: DatabaseRecord): EntityIndexEntry | null {
  const id = stringValue(record.id);
  if (!id) return null;
  const title = stringValue(record.title) || "Untitled";
  const databaseId = stringValue(record.database_id);
  const rowId = stringValue(record.row_id);
  const kind: EntityKind = databaseId && databaseId !== PAGES_DATABASE_ID ? "row" : "page";
  const path = parsePath(record.path);
  const icon = stringValue(record.icon);
  const bodyPath = normalizeWorkspacePath(stringValue(record.body_path));
  return {
    entityId: id,
    kind,
    databaseId: databaseId || undefined,
    rowId: rowId || (kind === "row" ? id : undefined),
    title,
    titleSnapshot: title,
    path,
    pathSnapshot: path,
    icon: icon || undefined,
    bodyPath: bodyPath || undefined
  };
}

function fallbackRowEntity(schema: DatabaseSchema, record: DatabaseRecord): EntityIndexEntry {
  const id = stringValue(record.id) || "unknown";
  const title = stringValue(record.title) || "Untitled";
  const path = [...(schema.path ?? []), title];
  return {
    entityId: id,
    kind: schema.id === PAGES_DATABASE_ID ? "page" : "row",
    databaseId: schema.id,
    rowId: id,
    title,
    titleSnapshot: title,
    path,
    pathSnapshot: path
  };
}

function targetWorkspaceLinkCandidates(target: EntityIndexEntry): Set<string> {
  const paths = new Set<string>();
  const bodyPath = normalizeWorkspacePath(target.bodyPath ?? "");
  if (bodyPath) paths.add(bodyPath);
  if (target.kind === "database") {
    const databaseId = target.databaseId || target.entityId;
    const group = isSystemDatabaseId(databaseId) ? "system" : "user";
    paths.add(`databases/${group}/${databaseFolderName(databaseId, target.title)}`);
    paths.add(`databases/${group}/${databaseFolderName(databaseId)}`);
  }
  return paths;
}

function markdownLinkTargets(markdown: string): Array<{ target: string; line: number; excerpt: string }> {
  const links: Array<{ target: string; line: number; excerpt: string }> = [];
  const regex = /\[[^\]]*\]\(([^)\r\n]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown))) {
    const target = normalizeMarkdownTarget(match[1] ?? "");
    if (!target.startsWith("databases/")) continue;
    const line = markdown.slice(0, match.index).split("\n").length;
    const excerpt = markdown.split("\n")[line - 1]?.trim() ?? "";
    links.push({ target, line, excerpt });
  }
  return links;
}

function normalizeMarkdownTarget(raw: string): string {
  let target = raw.trim();
  const titleMatch = /^<([^>]+)>/.exec(target);
  if (titleMatch) target = titleMatch[1] ?? "";
  else target = target.split(/\s+(?=["'])/)[0] ?? target;
  target = target.replace(/^['"]|['"]$/g, "");
  target = target.split("#")[0] ?? "";
  target = target.split("?")[0] ?? "";
  target = safeDecode(target);
  return normalizeWorkspacePath(target);
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/^\.\//, "").split("\\").join("/");
}

function safeDecode(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function cellReferencedEntityIds(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  const text = String(value);
  if (!text.includes("entityId")) return [];
  const ids: string[] = [];
  const regex = /"entityId"\s*:\s*"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match[1]) ids.push(match[1]);
  }
  return [...new Set(ids)];
}

function previewCell(value: unknown): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function previewPropertyCell(value: unknown, target: EntityIndexEntry): string {
  const refLabel = previewEntityRefCell(value, target);
  return refLabel || previewCell(value);
}

function previewEntityRefCell(value: unknown, target: EntityIndexEntry): string {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text.includes("entityId")) return "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "";
  }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  const labels = values.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<EntityRef>;
    if (candidate.entityId !== target.entityId) return [];
    return [entityRefPreviewLabel(candidate, target)];
  }).filter(Boolean);
  return labels.join(", ");
}

function entityRefPreviewLabel(ref: Partial<EntityRef>, target: EntityIndexEntry): string {
  const title = typeof ref.titleSnapshot === "string" ? ref.titleSnapshot.trim() : "";
  if (title) return title;
  const path = Array.isArray(ref.pathSnapshot) ? ref.pathSnapshot : [];
  const lastPath = path.map((part) => String(part ?? "").trim()).filter(Boolean).at(-1);
  return lastPath || target.title;
}

function compareBacklinks(a: EntityBacklink, b: EntityBacklink): number {
  const pathA = (a.source.path ?? []).join("/");
  const pathB = (b.source.path ?? []).join("/");
  return pathA.localeCompare(pathB) ||
    a.source.title.localeCompare(b.source.title) ||
    a.type.localeCompare(b.type) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.fieldName ?? "").localeCompare(b.fieldName ?? "");
}

function appendBacklink(byTargetId: Map<string, EntityBacklink[]>, targetId: string, backlink: EntityBacklink): void {
  const backlinks = byTargetId.get(targetId) ?? [];
  backlinks.push(backlink);
  byTargetId.set(targetId, backlinks);
}

function backlinkSourceRevision(paths: WorkspacePaths): number {
  return Math.max(
    fileService.revision(paths.userDatabasesDir()),
    fileService.revision(paths.databaseDir(PAGES_DATABASE_ID, "pages")),
    fileService.revision(paths.databaseDir(ENTITIES_DATABASE_ID, "entities"))
  );
}

async function fileSignature(path: string): Promise<string> {
  try {
    const info = await fileService.stat(path);
    return `${normalizeWorkspacePath(path)}:${info.size}:${info.mtimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return `${normalizeWorkspacePath(path)}:missing`;
  }
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function openLog(label: string, detail: Record<string, unknown>) {
  console.log(`[lotion open] ${label}`, detail);
}

function elapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(1));
}
