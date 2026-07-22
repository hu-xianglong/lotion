import { join } from "node:path";
import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../../shared/constants.js";
import { parsePathValue, serializePathValue } from "../../shared/path-values.js";
import type { DatabaseRecord, DatabaseSchema, FieldSchema, PageMeta, RecordValue, TableView } from "../../shared/types.js";
import { readCsvFile, readCsvFileByFieldValues, writeCsvFile } from "../storage/csv-file.js";
import { readJsonFile, writeJsonFile } from "../storage/json-file.js";
import type { WorkspacePaths } from "../storage/paths.js";
import type { WorkspaceService } from "./workspace-service.js";
import { idFromMarkdownFileName, pageMarkdownFileName, rowPagesWorkspacePath } from "../../shared/workspace-paths.js";
import { fileService } from "./file-service.js";

const KIND_FIELD = "kind";
const BODY_PATH_FIELD = "body_path";
const ICON_FIELD = "icon";
const COVER_FIELD = "cover";
const COVER_OFFSET_FIELD = "cover_offset";
const PATH_FIELD = "path";
const PARENT_ID_FIELD = "parent_id";
const TAGS_FIELD = "tags";
const DATE_FIELD = "date";
const URL_FIELD = "url";
const ORIGINAL_NOTION_HTML_FIELD = "notion_original_html";
const FULL_WIDTH_FIELD = "full_width";
const SMALL_TEXT_FIELD = "small_text";
const DATABASE_ID_FIELD = "database_id";
const ROW_ID_FIELD = "row_id";
const PAGE_FILE_FIELD = "page_file";

export interface PageMetaPatch {
  title?: string;
  created_time?: string;
  updated_time?: string;
  icon?: string;
  cover?: string;
  coverOffset?: number;
  tags?: string[];
  date?: string;
  url?: string;
  fullWidth?: boolean;
  smallText?: boolean;
  path?: string[];
  parentId?: string;
  parentKind?: "page" | "database" | "row";
}

export interface PageRecordInput {
  meta: PageMeta;
  kind?: "page";
  bodyPath?: string;
  databaseId?: string;
  rowId?: string;
  pageFile?: string;
}

/**
 * System database that owns page metadata. Markdown files are body-only;
 * every mutable page setting lives in `databases/system/pages--db_pages/data.csv`.
 */
export class PagesDatabaseService {
  private cacheRoot?: string;
  private ensurePromiseRoot?: string;
  private ensurePromise?: Promise<void>;
  private schemaCache?: DatabaseSchema;
  private recordsCache?: DatabaseRecord[];
  private cacheSignature?: string;

  constructor(private readonly workspace: WorkspaceService) {}

  async ensure(): Promise<void> {
    const paths = this.workspace.requirePaths();
    if (this.cacheRoot === paths.root && this.schemaCache && this.recordsCache) {
      const signature = await pagesDatabaseSignature(paths);
      if (signature === this.cacheSignature) return;
    }
    if (this.ensurePromise && this.ensurePromiseRoot === paths.root) return this.ensurePromise;
    this.ensurePromiseRoot = paths.root;
    this.ensurePromise = this.ensureFresh(paths).finally(() => {
      this.ensurePromise = undefined;
      this.ensurePromiseRoot = undefined;
    });
    return this.ensurePromise;
  }

  private async ensureFresh(paths: WorkspacePaths): Promise<void> {
    await fileService.ensureDir(paths.viewsDir(PAGES_DATABASE_ID));
    const now = new Date().toISOString();
    let schema: DatabaseSchema;
    let schemaChanged = false;
    try {
      const existing = await readJsonFile<DatabaseSchema>(paths.schema(PAGES_DATABASE_ID));
      const normalized = normalizePagesSchema(existing, now);
      schema = normalized.schema;
      schemaChanged = normalized.changed;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      schema = createPagesSchema(now);
      schemaChanged = true;
    }

    const hasData = await pathExists(paths.data(PAGES_DATABASE_ID));
    const existingRecords = hasData ? await readCsvFile(paths.data(PAGES_DATABASE_ID)) : undefined;
    const normalized = existingRecords
      ? await normalizePagesRecords(paths, schema, existingRecords)
      : undefined;
    if (schemaChanged) {
      await writeJsonFile(paths.schema(PAGES_DATABASE_ID), schema);
    }
    if (normalized && (schemaChanged || normalized.changed)) {
      await writeCsvFile(paths.data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), normalized.records);
    }
    if (!existingRecords) {
      await writeCsvFile(paths.data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), []);
    }
    if (!(await pathExists(paths.view(PAGES_DATABASE_ID, DEFAULT_VIEW_ID)))) {
      await writeJsonFile(paths.view(PAGES_DATABASE_ID, DEFAULT_VIEW_ID), createPagesDefaultView());
    }

    const manifest = await this.workspace.getManifest();
    if (!manifest.systemDatabases.includes(PAGES_DATABASE_ID)) {
      await this.workspace.saveManifest({
        ...manifest,
        systemDatabases: [...manifest.systemDatabases, PAGES_DATABASE_ID]
      });
    }
    this.cacheRoot = paths.root;
    this.schemaCache = schema;
    this.recordsCache = normalized?.records ?? existingRecords ?? [];
    this.cacheSignature = await pagesDatabaseSignature(paths);
  }

  async listMetas(ids?: string[]): Promise<PageMeta[]> {
    if (ids) {
      const paths = this.workspace.requirePaths();
      const records = await readCsvFileByFieldValues(
        paths.data(PAGES_DATABASE_ID),
        "id",
        ids
      );
      let pageFilesById: Map<string, string> | undefined;
      const recoveredRecords: DatabaseRecord[] = [];
      for (const record of records) {
        const id = stringValue(record.id);
        const needsRecovery = !optionalStringValue(record[BODY_PATH_FIELD]) || stringValue(record.title) === "Untitled";
        if (!id || !needsRecovery) {
          recoveredRecords.push(record);
          continue;
        }
        pageFilesById ??= await readDefaultPageFileIndex(paths);
        recoveredRecords.push(await recoverDefaultPageRecord(paths, id, record, pageFilesById));
      }
      const byId = new Map(recoveredRecords.map((record) => [String(record.id ?? ""), record]));
      return ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((record) => recordToPageMeta(record as DatabaseRecord));
    }
    const records = await this.readRecords();
    return records.filter(isDefaultPageRecord).map((record) => recordToPageMeta(record));
  }

  async getMeta(id: string): Promise<PageMeta | null> {
    const paths = this.workspace.requirePaths();
    const record = await this.findRecordById(id);
    if (!record) return null;
    const needsRecovery = !optionalStringValue(record[BODY_PATH_FIELD]) || stringValue(record.title) === "Untitled";
    const recovered = needsRecovery
      ? await recoverDefaultPageRecord(paths, id, record, await readDefaultPageFileIndex(paths))
      : record;
    return recordToPageMeta(recovered);
  }

  async getBodyPath(id: string): Promise<string | undefined> {
    const record = await this.findRecordById(id);
    const bodyPath = record ? optionalStringValue(record[BODY_PATH_FIELD]) : undefined;
    if (bodyPath) return bodyPath;
    const fileName = await findDefaultPageFileById(this.workspace.requirePaths(), id);
    return fileName ? defaultPageBodyPath(fileName) : undefined;
  }

  async setBodyPath(id: string, bodyPath: string): Promise<void> {
    await this.ensure();
    const schema = await this.readSchema();
    const records = await this.readRecords();
    const existing = records.find((record) => String(record.id ?? "") === id);
    if (!existing) return;
    if (optionalStringValue(existing[BODY_PATH_FIELD]) === bodyPath) return;
    const next = withSchemaDefaults(schema, {
      ...existing,
      [BODY_PATH_FIELD]: bodyPath,
      updated_time: new Date().toISOString()
    });
    const nextRecords = records.map((record) => (String(record.id ?? "") === id ? next : record));
    await writeCsvFile(this.workspace.requirePaths().data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), nextRecords);
    this.recordsCache = nextRecords;
    this.cacheSignature = await pagesDatabaseSignature(this.workspace.requirePaths());
  }

  async delete(id: string): Promise<void> {
    await this.ensure();
    const schema = await this.readSchema();
    const records = await this.readRecords();
    const nextRecords = records.filter((record) => String(record.id ?? "") !== id);
    if (nextRecords.length === records.length) return;
    await writeCsvFile(this.workspace.requirePaths().data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), nextRecords);
    this.recordsCache = nextRecords;
    this.cacheSignature = await pagesDatabaseSignature(this.workspace.requirePaths());
  }

  async upsert(input: PageRecordInput): Promise<PageMeta> {
    await this.ensure();
    const schema = await this.readSchema();
    const records = await this.readRecords();
    const existing = records.find((record) => String(record.id ?? "") === input.meta.id);
    const next = withSchemaDefaults(schema, pageInputToRecord(input, existing));
    if (existing && recordsEquivalentForSchema(schema, existing, next)) {
      return recordToPageMeta(existing);
    }
    const nextRecords = existing
      ? records.map((record) => (String(record.id ?? "") === input.meta.id ? next : record))
      : [...records, next];
    await writeCsvFile(this.workspace.requirePaths().data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), nextRecords);
    this.recordsCache = nextRecords;
    this.cacheSignature = await pagesDatabaseSignature(this.workspace.requirePaths());
    return recordToPageMeta(next);
  }

  async upsertMany(inputs: PageRecordInput[]): Promise<PageMeta[]> {
    if (inputs.length === 0) return [];
    await this.ensure();
    const schema = await this.readSchema();
    const records = await this.readRecords();
    const nextRecords = [...records];
    const indexById = new Map(nextRecords.map((record, index) => [String(record.id ?? ""), index]));
    const metas: PageMeta[] = [];
    let changed = false;

    for (const input of inputs) {
      const existingIndex = indexById.get(input.meta.id);
      const existing = existingIndex === undefined ? undefined : nextRecords[existingIndex];
      const next = withSchemaDefaults(schema, pageInputToRecord(input, existing));
      metas.push(recordToPageMeta(next));
      if (existing && recordsEquivalentForSchema(schema, existing, next)) continue;
      changed = true;
      if (existingIndex === undefined) {
        indexById.set(input.meta.id, nextRecords.length);
        nextRecords.push(next);
      } else {
        nextRecords[existingIndex] = next;
      }
    }

    if (changed) {
      await writeCsvFile(this.workspace.requirePaths().data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), nextRecords);
      this.recordsCache = nextRecords;
      this.cacheSignature = await pagesDatabaseSignature(this.workspace.requirePaths());
    }
    return metas;
  }

  async patch(id: string, patch: PageMetaPatch): Promise<PageMeta> {
    await this.ensure();
    const schema = await this.readSchema();
    const records = await this.readRecords();
    const existing = records.find((record) => String(record.id ?? "") === id);
    const now = new Date().toISOString();
    const base: PageMeta = existing
      ? recordToPageMeta(existing)
      : { id, title: "Untitled", created_time: now, updated_time: now };
    const meta: PageMeta = {
      ...base,
      ...patch,
      updated_time: patch.updated_time ?? now
    };
    const merged = withSchemaDefaults(schema, pageInputToRecord({
      meta,
      kind: "page",
      bodyPath: optionalStringValue(existing?.[BODY_PATH_FIELD]),
      databaseId: optionalStringValue(existing?.[DATABASE_ID_FIELD]),
      rowId: optionalStringValue(existing?.[ROW_ID_FIELD]),
      pageFile: optionalStringValue(existing?.[PAGE_FILE_FIELD])
    }, existing));
    const nextRecords = existing
      ? records.map((record) => (String(record.id ?? "") === id ? merged : record))
      : [...records, merged];
    await writeCsvFile(this.workspace.requirePaths().data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), nextRecords);
    this.recordsCache = nextRecords;
    this.cacheSignature = await pagesDatabaseSignature(this.workspace.requirePaths());
    return recordToPageMeta(merged);
  }

  async readRecords(): Promise<DatabaseRecord[]> {
    const paths = this.workspace.requirePaths();
    await this.ensure();
    if (this.cacheRoot === paths.root && this.recordsCache) return this.recordsCache;
    try {
      const records = await readCsvFile(paths.data(PAGES_DATABASE_ID));
      this.cacheRoot = paths.root;
      this.recordsCache = records;
      this.cacheSignature = await pagesDatabaseSignature(paths);
      return records;
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
  }

  private async readSchema(): Promise<DatabaseSchema> {
    const paths = this.workspace.requirePaths();
    await this.ensure();
    if (this.cacheRoot === paths.root && this.schemaCache) return this.schemaCache;
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(PAGES_DATABASE_ID));
    this.cacheRoot = paths.root;
    this.schemaCache = schema;
    return schema;
  }

  private async findRecordById(id: string): Promise<DatabaseRecord | undefined> {
    const paths = this.workspace.requirePaths();
    if (this.cacheRoot === paths.root && this.recordsCache) {
      return this.recordsCache.find((record) => String(record.id ?? "") === id);
    }
    const records = await readCsvFileByFieldValues(paths.data(PAGES_DATABASE_ID), "id", [id]);
    return records[0];
  }
}

export function createPagesSchema(now: string): DatabaseSchema {
  return {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    fields: createPagesFields(),
    defaultViewId: DEFAULT_VIEW_ID
  };
}

export function createPagesFields(): FieldSchema[] {
  return [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: KIND_FIELD, name: "Kind", type: "text", system: true },
    { id: BODY_PATH_FIELD, name: "Body path", type: "text", system: true, hidden: true },
    { id: ICON_FIELD, name: "Icon", type: "text" },
    { id: COVER_FIELD, name: "Cover", type: "text" },
    { id: COVER_OFFSET_FIELD, name: "Cover offset", type: "number" },
    { id: PATH_FIELD, name: "Path", type: "text" },
    { id: PARENT_ID_FIELD, name: "Parent entity", type: "entity_ref" },
    { id: TAGS_FIELD, name: "Tags", type: "multi_select" },
    { id: DATE_FIELD, name: "Date", type: "text" },
    { id: URL_FIELD, name: "URL", type: "url" },
    { id: FULL_WIDTH_FIELD, name: "Full width", type: "checkbox" },
    { id: SMALL_TEXT_FIELD, name: "Small text", type: "checkbox" },
    { id: DATABASE_ID_FIELD, name: "Database ID", type: "text", system: true, hidden: true },
    { id: ROW_ID_FIELD, name: "Row ID", type: "text", system: true, hidden: true },
    { id: PAGE_FILE_FIELD, name: "Page file", type: "text", system: true, hidden: true }
  ];
}

export function createPagesDefaultView(): TableView {
  const visibleFieldIds = ["title", PATH_FIELD, KIND_FIELD, ICON_FIELD, FULL_WIDTH_FIELD, SMALL_TEXT_FIELD, "updated_time"];
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: PAGES_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: ["title", PATH_FIELD, ICON_FIELD],
    sorts: [{ fieldId: "updated_time", direction: "desc" }],
    filters: []
  };
}

export function pageInputToRecord(input: PageRecordInput, existing?: DatabaseRecord): DatabaseRecord {
  const meta = input.meta;
  const databaseId = input.databaseId ?? optionalStringValue(existing?.[DATABASE_ID_FIELD]) ?? PAGES_DATABASE_ID;
  const rowId = input.rowId ?? optionalStringValue(existing?.[ROW_ID_FIELD]) ?? meta.id;
  const pageFile = input.pageFile ?? optionalStringValue(existing?.[PAGE_FILE_FIELD]) ?? "";
  return {
    ...(existing ?? {}),
    id: meta.id,
    created_time: meta.created_time,
    updated_time: meta.updated_time,
    title: meta.title,
    [KIND_FIELD]: "page",
    [BODY_PATH_FIELD]: input.bodyPath ?? optionalStringValue(existing?.[BODY_PATH_FIELD]) ?? "",
    [ICON_FIELD]: meta.icon ?? "",
    [COVER_FIELD]: meta.cover ?? "",
    [COVER_OFFSET_FIELD]: typeof meta.coverOffset === "number" ? meta.coverOffset : "",
    [PATH_FIELD]: serializePathValue(meta.path),
    [PARENT_ID_FIELD]: meta.parentId
      ? JSON.stringify([{ entityId: meta.parentId, kind: meta.parentKind ?? "page" }])
      : "",
    [TAGS_FIELD]: meta.tags && meta.tags.length > 0 ? meta.tags.join(";") : "",
    [DATE_FIELD]: meta.date ?? "",
    [URL_FIELD]: meta.url ?? "",
    [FULL_WIDTH_FIELD]: !!meta.fullWidth,
    [SMALL_TEXT_FIELD]: !!meta.smallText,
    [DATABASE_ID_FIELD]: databaseId,
    [ROW_ID_FIELD]: rowId,
    [PAGE_FILE_FIELD]: pageFile
  };
}

export function recordToPageMeta(record: DatabaseRecord): PageMeta {
  const now = new Date().toISOString();
  const meta: PageMeta = {
    id: String(record.id ?? ""),
    title: String(record.title ?? "").trim() || "Untitled",
    created_time: String(record.created_time ?? "") || now,
    updated_time: String(record.updated_time ?? "") || now
  };
  const icon = stringValue(record[ICON_FIELD]);
  if (icon) meta.icon = icon;
  const cover = stringValue(record[COVER_FIELD]);
  if (cover) meta.cover = cover;
  const coverOffset = Number(record[COVER_OFFSET_FIELD]);
  if (Number.isFinite(coverOffset)) meta.coverOffset = Math.max(0, Math.min(100, coverOffset));
  const path = parsePath(record[PATH_FIELD]);
  if (path.length > 0) meta.path = path;
  const parent = parseParentRef(record[PARENT_ID_FIELD]);
  if (parent) {
    meta.parentId = parent.entityId;
    meta.parentKind = parent.kind;
  }
  const tags = parseTags(record[TAGS_FIELD]);
  if (tags.length > 0) meta.tags = tags;
  const date = stringValue(record[DATE_FIELD]);
  if (date) meta.date = date;
  const url = stringValue(record[URL_FIELD]);
  if (url) meta.url = url;
  const originalNotionHtml = stringValue(record[ORIGINAL_NOTION_HTML_FIELD]);
  if (originalNotionHtml) meta.originalNotionHtml = originalNotionHtml;
  if (parseBoolean(record[FULL_WIDTH_FIELD])) meta.fullWidth = true;
  if (parseBoolean(record[SMALL_TEXT_FIELD])) meta.smallText = true;
  return meta;
}

export function pageBodyPath(id: string, title?: string): string {
  return join(rowPagesWorkspacePath(PAGES_DATABASE_ID, true, "pages"), pageFileName(id, title)).replace(/\\/g, "/");
}

export function pageFileName(id: string, title?: string): string {
  return pageMarkdownFileName(id, title);
}

export function defaultPageRecordInput(meta: PageMeta): PageRecordInput {
  return {
    meta,
    kind: "page",
    databaseId: PAGES_DATABASE_ID,
    rowId: meta.id,
    pageFile: ""
  };
}

function normalizePagesSchema(schema: DatabaseSchema, now: string): { schema: DatabaseSchema; changed: boolean } {
  const fields = [...schema.fields];
  let changed = schema.id !== PAGES_DATABASE_ID || schema.name !== "pages" || schema.defaultViewId !== DEFAULT_VIEW_ID;
  for (const required of createPagesFields()) {
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
      id: PAGES_DATABASE_ID,
      name: "pages",
      defaultViewId: DEFAULT_VIEW_ID,
      fields,
      updated_time: changed ? now : schema.updated_time
    },
    changed
  };
}

function withSchemaDefaults(schema: DatabaseSchema, record: DatabaseRecord): DatabaseRecord {
  const out: DatabaseRecord = {};
  for (const field of schema.fields) {
    out[field.id] = record[field.id] ?? "";
  }
  return out;
}

async function normalizePagesRecords(
  paths: WorkspacePaths,
  schema: DatabaseSchema,
  records: DatabaseRecord[]
): Promise<{ records: DatabaseRecord[]; changed: boolean }> {
  let changed = false;
  const pageFilesById = await readDefaultPageFileIndex(paths);
  const next: DatabaseRecord[] = [];
  for (const record of records) {
    const id = stringValue(record.id);
    if (!id) {
      next.push(record);
      continue;
    }

    const recovered = await recoverDefaultPageRecord(paths, id, record, pageFilesById);
    if (recovered !== record) changed = true;
    const meta = recordToPageMeta(recovered);
    const normalized = withSchemaDefaults(schema, pageInputToRecord({
      meta,
      kind: "page",
      bodyPath: optionalStringValue(recovered[BODY_PATH_FIELD]),
      databaseId: optionalStringValue(recovered[DATABASE_ID_FIELD]) ?? PAGES_DATABASE_ID,
      rowId: optionalStringValue(recovered[ROW_ID_FIELD]) ?? id,
      pageFile: optionalStringValue(recovered[PAGE_FILE_FIELD])
    }, recovered));
    if (recordsDifferForSchema(schema, record, normalized)) changed = true;
    const bodyPath = optionalStringValue(normalized[BODY_PATH_FIELD]);
    if (
      isDefaultPageRecord(record) &&
      bodyPath &&
      await migrateDefaultPageBody(paths, id, bodyPath, optionalStringValue(recovered[BODY_PATH_FIELD]))
    ) {
      changed = true;
    }
    next.push(normalized);
  }
  return { records: next, changed };
}

async function recoverDefaultPageRecord(
  paths: WorkspacePaths,
  id: string,
  record: DatabaseRecord,
  pageFilesById: Map<string, string>
): Promise<DatabaseRecord> {
  const currentBodyPath = optionalStringValue(record[BODY_PATH_FIELD]);
  const currentTitle = stringValue(record.title);
  const shouldRecoverTitle = !currentTitle || currentTitle === "Untitled";
  const shouldRecoverBodyPath = !currentBodyPath;
  if (!shouldRecoverTitle && !shouldRecoverBodyPath) return record;

  const fileName = pageFilesById.get(id);
  if (!fileName) return record;

  const next = { ...record };
  if (shouldRecoverBodyPath) {
    next[BODY_PATH_FIELD] = defaultPageBodyPath(fileName);
  }
  if (shouldRecoverTitle) {
    next.title = await titleFromDefaultPageFile(paths, fileName, id);
  }
  return next;
}

async function readDefaultPageFileIndex(paths: WorkspacePaths): Promise<Map<string, string>> {
  try {
    const entries = await fileService.readDir(paths.rowPagesDir(PAGES_DATABASE_ID, "pages"));
    const out = new Map<string, string>();
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      out.set(idFromMarkdownFileName(entry), entry);
    }
    return out;
  } catch (error) {
    if (isNotFoundError(error)) return new Map();
    throw error;
  }
}

async function findDefaultPageFileById(paths: WorkspacePaths, id: string): Promise<string | undefined> {
  return (await readDefaultPageFileIndex(paths)).get(id);
}

function defaultPageBodyPath(fileName: string): string {
  return `${rowPagesWorkspacePath(PAGES_DATABASE_ID, true, "pages")}/${fileName}`;
}

async function titleFromDefaultPageFile(paths: WorkspacePaths, fileName: string, id: string): Promise<string> {
  try {
    const markdown = await fileService.readText(paths.rowPage(PAGES_DATABASE_ID, fileName, "pages"));
    return firstMarkdownHeading(markdown) || titleFromPageFileName(fileName, id) || "Untitled";
  } catch (error) {
    if (isNotFoundError(error)) return titleFromPageFileName(fileName, id) || "Untitled";
    throw error;
  }
}

function firstMarkdownHeading(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() || undefined;
}

export function titleFromPageFileName(fileName: string, id: string): string | undefined {
  const stem = fileName.replace(/\.md$/i, "");
  const suffix = `--${id}`;
  const titleSlug = stem.endsWith(suffix) ? stem.slice(0, -suffix.length) : stem === id ? "" : stem;
  return titleSlug.replace(/_/g, " ").trim() || undefined;
}

function isDefaultPageRecord(record: DatabaseRecord): boolean {
  const databaseId = optionalStringValue(record[DATABASE_ID_FIELD]);
  const bodyPath = optionalStringValue(record[BODY_PATH_FIELD]);
  return !databaseId ||
    databaseId === PAGES_DATABASE_ID ||
    /^pages\/page_[^/]+\.md$/i.test(bodyPath ?? "") ||
    /^system\/pages\/db_pages\/page_[^/]+\.md$/i.test(bodyPath ?? "");
}

function recordsDifferForSchema(schema: DatabaseSchema, a: DatabaseRecord, b: DatabaseRecord): boolean {
  return schema.fields.some((field) => String(a[field.id] ?? "") !== String(b[field.id] ?? ""));
}

function recordsEquivalentForSchema(schema: DatabaseSchema, a: DatabaseRecord, b: DatabaseRecord): boolean {
  return schema.fields.every((field) => {
    if (field.type === "checkbox") {
      return parseBoolean(a[field.id]) === parseBoolean(b[field.id]);
    }
    return String(a[field.id] ?? "") === String(b[field.id] ?? "");
  });
}

async function migrateDefaultPageBody(
  paths: WorkspacePaths,
  id: string,
  nextRel: string,
  previousBodyPath: string | undefined
): Promise<boolean> {
  const nextAbs = join(paths.root, nextRel);
  if (await pathExists(nextAbs)) return false;

  const candidates = [
    previousBodyPath,
    join("pages", pageFileName(id)).replace(/\\/g, "/"),
    join("pages", `page_${id}.md`).replace(/\\/g, "/"),
    join("system", "pages", `db_${PAGES_DATABASE_ID}`, `page_${id}.md`).replace(/\\/g, "/")
  ].filter((candidate): candidate is string => Boolean(candidate && candidate !== nextRel));

  for (const rel of candidates) {
    const previousAbs = join(paths.root, rel);
    if (!(await pathExists(previousAbs))) continue;
    await fileService.rename(previousAbs, nextAbs);
    return true;
  }
  return false;
}

function parseTags(value: RecordValue | undefined): string[] {
  const raw = stringValue(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return raw.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }
}

function parsePath(value: RecordValue | undefined): string[] {
  return parsePathValue(value);
}

function parseParentRef(value: RecordValue | undefined): { entityId: string; kind: "page" | "database" | "row" } | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Array<{ entityId?: unknown; kind?: unknown }>;
    const first = Array.isArray(parsed) ? parsed[0] : undefined;
    const entityId = typeof first?.entityId === "string" ? first.entityId.trim() : "";
    const kind = typeof first?.kind === "string" ? first.kind : "";
    if (!entityId || (kind !== "page" && kind !== "database" && kind !== "row")) return undefined;
    return { entityId, kind };
  } catch {
    return undefined;
  }
}

function parseBoolean(value: RecordValue | undefined): boolean {
  if (value === true) return true;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function stringValue(value: RecordValue | undefined): string {
  return String(value ?? "").trim();
}

function optionalStringValue(value: RecordValue | undefined): string | undefined {
  const raw = stringValue(value);
  return raw || undefined;
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

async function pagesDatabaseSignature(paths: WorkspacePaths): Promise<string> {
  const [schema, data] = await Promise.all([
    fileSignature(paths.schema(PAGES_DATABASE_ID)),
    fileSignature(paths.data(PAGES_DATABASE_ID))
  ]);
  return `${schema}|${data}`;
}

async function fileSignature(path: string): Promise<string> {
  try {
    const info = await fileService.stat(path);
    return `${info.size}:${info.mtimeMs}`;
  } catch (error) {
    if (isNotFoundError(error)) return "missing";
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
