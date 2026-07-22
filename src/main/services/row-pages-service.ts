import { relative } from "node:path";
import type {
  DatabaseBundle,
  DatabaseRecord,
  FieldSchema,
  PageMeta,
  RowPageDocument
} from "../../shared/types.js";
import { resolveRowIcon } from "../../shared/row-icons.js";
import { writeTextFile } from "../storage/json-file.js";
import type { DatabaseService } from "./database-service.js";
import { pageBodyPath, PagesDatabaseService } from "./pages-database-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";

const FULL_WIDTH_FIELD: FieldSchema = {
  id: "page_full_width",
  name: "Full width",
  type: "checkbox",
  system: true,
  hidden: true
};

/**
 * Compatibility service for opening a database record as a page. The row's
 * id is the page id; page metadata and body path live in the system pages DB.
 * Database CSVs only own field values/properties.
 */
export class RowPagesService {
  private readonly pageRecords: PagesDatabaseService;

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly databases: DatabaseService
  ) {
    this.pageRecords = new PagesDatabaseService(workspace);
  }

  async openByFilename(databaseId: string, fileName: string): Promise<RowPageDocument> {
    const startedAt = performance.now();
    const dbStartedAt = performance.now();
    const bundle = await this.databases.get(databaseId);
    const dbMs = elapsedMs(dbStartedAt);
    const findStartedAt = performance.now();
    const record = bundle.records.find((row) => String(row.page_file ?? "") === fileName);
    if (!record) {
      throw new Error(`No row in ${databaseId} owns page file ${fileName}`);
    }
    const findMs = elapsedMs(findStartedAt);
    const docStartedAt = performance.now();
    const doc = await this.openRecord(databaseId, bundle, record);
    openLog("rowPage.openByFilename", {
      databaseId,
      fileName,
      rowId: doc.rowId,
      title: doc.title,
      dbMs,
      findMs,
      buildDocMs: elapsedMs(docStartedAt),
      markdownBytes: Buffer.byteLength(doc.markdown, "utf8"),
      totalMs: elapsedMs(startedAt)
    });
    return doc;
  }

  async open(databaseId: string, rowId: string): Promise<RowPageDocument> {
    const startedAt = performance.now();
    const dbStartedAt = performance.now();
    const bundle = await this.databases.get(databaseId);
    const dbMs = elapsedMs(dbStartedAt);
    const findStartedAt = performance.now();
    const record = this.findRecord(bundle, rowId);
    const findMs = elapsedMs(findStartedAt);
    const docStartedAt = performance.now();
    const doc = await this.openRecord(databaseId, bundle, record);
    openLog("rowPage.open", {
      databaseId,
      rowId,
      title: doc.title,
      dbMs,
      findMs,
      buildDocMs: elapsedMs(docStartedAt),
      markdownBytes: Buffer.byteLength(doc.markdown, "utf8"),
      totalMs: elapsedMs(startedAt)
    });
    return doc;
  }

  private async openRecord(databaseId: string, bundle: DatabaseBundle, record: DatabaseRecord): Promise<RowPageDocument> {
    const rowId = String(record.id ?? "");
    const title = String(record.title ?? "");
    const meta = await this.rowPageMeta(bundle.schema, record);

    // Notion-style lazy file: we never allocate a filename or create
    // the .md on first open. The body only materializes when the user
    // types — `update()` handles that. Avoids littering the workspace
    // with empty files when a user briefly clicks through rows.
    const markdown = await this.readMarkdown(databaseId, record);

    return {
      databaseId,
      rowId,
      meta,
      title,
      created_time: String(record.created_time ?? ""),
      updated_time: String(record.updated_time ?? ""),
      markdown,
      fullWidth: meta.fullWidth,
      schema: bundle.schema,
      record
    };
  }

  async update(databaseId: string, rowId: string, markdown: string): Promise<RowPageDocument> {
    const bundle = await this.databases.get(databaseId);
    const record = this.findRecord(bundle, rowId);
    const title = String(record.title ?? "");
    let bodyPath = this.bodyPathFromRecord(databaseId, record) ?? await this.pageRecords.getBodyPath(rowId);
    if (!bodyPath) {
      bodyPath = pageBodyPath(rowId, title);
    }
    await this.ensurePageRecord(databaseId, record, bodyPath, bundle.schema);
    const path = `${this.workspace.requirePaths().root}/${bodyPath}`;
    await writeTextFile(path, serializeRowPageMarkdown(markdown));
    const latestRecord = this.findRecord(bundle, rowId);
    const meta = await this.rowPageMeta(bundle.schema, latestRecord);
    return {
      databaseId,
      rowId,
      meta,
      title,
      created_time: String(latestRecord.created_time ?? ""),
      updated_time: String(latestRecord.updated_time ?? ""),
      markdown,
      fullWidth: meta.fullWidth,
      schema: bundle.schema,
      record: latestRecord
    };
  }

  async setFullWidth(databaseId: string, rowId: string, fullWidth: boolean): Promise<RowPageDocument> {
    let bundle = await this.databases.get(databaseId);
    if (!bundle.schema.fields.some((field) => field.id === FULL_WIDTH_FIELD.id)) {
      bundle = await this.databases.ensureHiddenField(databaseId, FULL_WIDTH_FIELD);
    }
    this.findRecord(bundle, rowId);
    await this.databases.setSystemCell(databaseId, rowId, FULL_WIDTH_FIELD.id, fullWidth ? "true" : "");
    await this.pageRecords.patch(rowId, { fullWidth });
    return this.open(databaseId, rowId);
  }

  async setSmallText(databaseId: string, rowId: string, smallText: boolean): Promise<RowPageDocument> {
    const bundle = await this.databases.get(databaseId);
    this.findRecord(bundle, rowId);
    await this.pageRecords.patch(rowId, { smallText });
    return this.open(databaseId, rowId);
  }

  /** Hook: invoked by DatabaseService when a row's title cell changes. */
  async handleTitleChanged(databaseId: string, rowId: string, newTitle: string): Promise<void> {
    const bundle = await this.databases.get(databaseId);
    const record = bundle.records.find((row) => row.id === rowId);
    if (!record) return;
    await this.ensurePageRecord(databaseId, { ...record, title: newTitle }, undefined, bundle.schema);
    await this.pageRecords.patch(rowId, { title: newTitle.trim() || "Untitled" });
  }

  /** Hook: invoked by DatabaseService when a row is about to be deleted. */
  async handleRowDeleted(databaseId: string, record: DatabaseRecord): Promise<void> {
    const rowId = String(record.id ?? "");
    if (!rowId) return;
    const bodyPath = await this.pageRecords.getBodyPath(rowId);
    if (bodyPath) await fileService.remove(`${this.workspace.requirePaths().root}/${bodyPath}`, { force: true });
    const legacyFileName = String(record.page_file ?? "");
    if (legacyFileName) await fileService.remove(this.workspace.requirePaths().rowPage(databaseId, legacyFileName), { force: true });
    await this.pageRecords.delete(rowId);
  }

  // ── private ────────────────────────────────────────────────────────────

  private findRecord(bundle: DatabaseBundle, rowId: string): DatabaseRecord {
    const record = bundle.records.find((row) => row.id === rowId);
    if (!record) throw new Error(`Row ${rowId} not found in database ${bundle.schema.id}`);
    return record;
  }

  private async ensurePageRecord(
    databaseId: string,
    record: DatabaseRecord,
    bodyPath?: string,
    schema?: DatabaseBundle["schema"]
  ): Promise<void> {
    const rowId = String(record.id ?? "");
    if (!rowId) return;
    const now = new Date().toISOString();
    const existing = await this.pageRecords.getMeta(rowId);
    const title = String(record.title ?? "").trim() || existing?.title || "Untitled";
    await this.pageRecords.upsert({
      meta: {
        ...(existing ?? {}),
        id: rowId,
        title,
        created_time: String(record.created_time ?? "") || existing?.created_time || now,
        updated_time: String(record.updated_time ?? "") || existing?.updated_time || now,
        // Persist only row-owned metadata. Database icon inheritance is a
        // display fallback in rowPageMeta so changing a database icon updates
        // iconless rows instead of leaving a stale copied value here.
        icon: String(record.row_icon ?? "").trim() || existing?.icon || undefined,
        path: existing?.path ?? (schema ? [...schemaPath(schema), title] : undefined),
        parentId: existing?.parentId ?? schema?.id ?? databaseId,
        parentKind: existing?.parentKind ?? "database"
      },
      kind: "page",
      bodyPath,
      databaseId,
      rowId
    });
  }

  private async readMarkdown(databaseId: string, record: DatabaseRecord): Promise<string> {
    const candidates = [
      this.bodyPathFromRecord(databaseId, record)
    ].filter((candidate): candidate is string => Boolean(candidate));

    const paths = this.workspace.requirePaths();
    if (candidates.length === 0) {
      const lookupStartedAt = performance.now();
      const bodyPath = await this.pageRecords.getBodyPath(String(record.id ?? ""));
      openLog("rowPage.lookupBodyPathFallback", {
        databaseId,
        rowId: String(record.id ?? ""),
        found: !!bodyPath,
        ms: elapsedMs(lookupStartedAt)
      });
      if (bodyPath) candidates.push(bodyPath);
    }

    for (const candidate of candidates) {
      const absPath = candidate.startsWith(paths.root) ? candidate : `${paths.root}/${candidate}`;
      const readStartedAt = performance.now();
      try {
        const markdown = await fileService.readText(absPath);
        openLog("rowPage.readMarkdown", {
          databaseId,
          rowId: String(record.id ?? ""),
          title: String(record.title ?? ""),
          path: absPath.startsWith(paths.root) ? absPath.slice(paths.root.length + 1).split("\\").join("/") : absPath,
          bytes: Buffer.byteLength(markdown, "utf8"),
          ms: elapsedMs(readStartedAt)
        });
        return markdown;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return "";
  }

  private bodyPathFromRecord(databaseId: string, record: DatabaseRecord): string | undefined {
    const bodyPath = String(record.body_path ?? "").trim();
    if (bodyPath) return bodyPath;
    const legacyFileName = String(record.page_file ?? "").trim();
    if (!legacyFileName) return undefined;
    const paths = this.workspace.requirePaths();
    return relative(paths.root, paths.rowPage(databaseId, legacyFileName)).split("\\").join("/");
  }

  private async rowPageMeta(schema: DatabaseBundle["schema"], record: DatabaseRecord): Promise<PageMeta> {
    const rowId = String(record.id ?? "");
    const title = String(record.title ?? "").trim() || "Untitled";
    const stored = rowId ? await this.pageRecords.getMeta(rowId) : null;
    const created = String(record.created_time ?? "").trim() || stored?.created_time || new Date().toISOString();
    const updated = String(record.updated_time ?? "").trim() || stored?.updated_time || created;
    const icon = resolveRowIcon(record, schema.icon, stored?.icon);
    const cover = String(record.cover ?? "").trim() || stored?.cover;
    const coverOffset = Number(record.cover_offset ?? stored?.coverOffset ?? 50);
    const fullWidth = parseBooleanCell(record.page_full_width) ?? stored?.fullWidth;
    const smallText = stored?.smallText;
    const meta: PageMeta = {
      ...(stored ?? {}),
      id: rowId,
      title,
      created_time: created,
      updated_time: updated,
      path: stored?.path ?? [...schemaPath(schema), title],
      parentId: stored?.parentId ?? schema.id,
      parentKind: stored?.parentKind ?? "database"
    };
    if (icon) meta.icon = icon;
    if (cover) meta.cover = cover;
    if (Number.isFinite(coverOffset)) meta.coverOffset = coverOffset;
    if (fullWidth) meta.fullWidth = true;
    if (smallText) meta.smallText = true;
    return meta;
  }
}

function schemaPath(schema: DatabaseBundle["schema"]): string[] {
  const path = (schema.path ?? []).map((segment) => String(segment).trim()).filter(Boolean);
  return path.length > 0 ? path : [schema.name || schema.id];
}

function serializeRowPageMarkdown(markdown: string): string {
  return `${markdown.trimEnd()}\n`;
}

function parseBooleanCell(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true) return true;
  const raw = String(value).trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function openLog(label: string, detail: Record<string, unknown>) {
  console.log(`[lotion open] ${label}`, detail);
}

function elapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(1));
}
