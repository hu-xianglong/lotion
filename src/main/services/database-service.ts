import { DATABASE_STATS_DATABASE_ID, DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../../shared/constants.js";
import { orderFieldIdsByContentRichness } from "../../shared/field-order.js";
import { applyFormulasToRecords } from "../../shared/formula.js";
import { createId, slugifyId } from "../../shared/ids.js";
import { applyRollupsToRecords } from "../../shared/rollup.js";
import { parseDateTimeValue } from "../../shared/date-values.js";
import { pageMarkdownFileName } from "../../shared/workspace-paths.js";
import type { RowPagesService } from "./row-pages-service.js";
import type {
  AddFieldInput,
  ColumnSummaryType,
  CopyFieldToSystemTimeInput,
  CopyFieldToSystemTimeResult,
  CreateDatabaseInput,
  CreateViewInput,
  DatabaseBundle,
  DatabaseRecord,
  DatabaseRowTemplate,
  DatabaseSchema,
  DatabaseStats,
  DatabaseSummary,
  DuplicateViewInput,
  DeleteViewInput,
  DeleteDatabaseTemplateInput,
  DeleteRowInput,
  FieldSchema,
  RecordValue,
  RelationFieldConfig,
  RollupAggregation,
  RollupFieldConfig,
  SaveDatabaseTemplateInput,
  SelectOption,
  SetDefaultViewInput,
  TableView,
  UpdateCellInput,
  UpdateDatabaseMetaInput,
  UpdateFieldInput
} from "../../shared/types.js";
import { readCsvFile, writeCsvFile } from "../storage/csv-file.js";
import { readJsonFile, writeJsonFile, writeTextFile } from "../storage/json-file.js";
import { createPagesDefaultView, createPagesFields, createPagesSchema, PagesDatabaseService } from "./pages-database-service.js";
import { createEntitiesDefaultView, createEntitiesSchema, normalizeEntitiesSchema } from "./entities-database-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";

const TEMPLATE_VALUES_FIELD = "template_values";
const TEMPLATE_FULL_WIDTH_FIELD = "full_width";
const ORIGINAL_NOTION_HTML_FIELD_ID = "notion_original_html";
const ORIGINAL_NOTION_CSV_FIELD_ID = "notion_original_csv";
const CREATED_TIME_ASC_VIEW_ID = "view_created_time_asc";
const CREATED_TIME_DESC_VIEW_ID = "view_created_time_desc";
const STATS_DATABASE_ID_FIELD = "database_id";
const STATS_ICON_FIELD = "database_icon";
const STATS_PAGE_COUNT_FIELD = "page_count";
const STATS_NON_EMPTY_PAGE_COUNT_FIELD = "non_empty_page_count";
const STATS_FIELD_COUNT_FIELD = "field_count";
const COLUMN_SUMMARY_TYPES: ReadonlySet<ColumnSummaryType> = new Set([
  "none",
  "count",
  "not_empty",
  "empty",
  "unique",
  "sum",
  "average",
  "median",
  "min",
  "max",
  "range"
]);
const ROLLUP_AGGREGATIONS: ReadonlySet<RollupAggregation> = new Set([
  "count",
  "count_values",
  "sum",
  "average",
  "min",
  "max",
  "range",
  "show_original"
]);

export class DatabaseService {
  private rowPages?: RowPagesService;
  private readonly pageRecords: PagesDatabaseService;

  constructor(private readonly workspace: WorkspaceService) {
    this.pageRecords = new PagesDatabaseService(workspace);
  }

  /** Late-bound to break the DatabaseService ↔ RowPagesService cycle. */
  setRowPagesService(rowPages: RowPagesService): void {
    this.rowPages = rowPages;
  }

  async list(): Promise<DatabaseSummary[]> {
    const manifest = await this.workspace.getManifest();
    const paths = this.workspace.requirePaths();
    return Promise.all(manifest.databases.map(async (id) => {
      const schema = normalizeDatabasePath(await readJsonFile<DatabaseSchema>(paths.schema(id)));
      return { id: schema.id, name: schema.name, path: schema.path, icon: schema.icon, tags: schema.tags };
    }));
  }

  async listStats(): Promise<DatabaseStats[]> {
    const bundle = await this.readDatabaseStatsBundle();
    return bundle.records.map(recordToDatabaseStats);
  }

  async refreshStats(): Promise<DatabaseStats[]> {
    await this.ensureDatabaseStatsDatabase();
    const manifest = await this.workspace.getManifest();
    const paths = this.workspace.requirePaths();
    const now = new Date().toISOString();
    const stats = await Promise.all(manifest.databases.map((id) => this.computeStats(id)));
    const records = await Promise.all(stats.map(async (stat) => {
      let schema: DatabaseSchema | undefined;
      try {
        schema = await readJsonFile<DatabaseSchema>(paths.schema(stat.id));
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      return databaseStatsToRecord(stat, schema, now);
    }));
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(DATABASE_STATS_DATABASE_ID));
    await writeCsvFile(paths.data(DATABASE_STATS_DATABASE_ID), schema.fields.map((field) => field.id), records);
    return records.map(recordToDatabaseStats);
  }

  async create(input: CreateDatabaseInput): Promise<DatabaseBundle> {
    const name = input.name.trim() || "Untitled Database";
    const id = createId("db");
    const now = new Date().toISOString();
    const systemFields: FieldSchema[] = [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Title", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ];
    // Template-supplied fields sit after the system stack. We trust the
    // renderer to send well-formed FieldSchema records (id, name, type,
    // and any options).
    const userFields = (input.template?.fields ?? []).map((field) => ({
      ...field,
      relation: normalizeRelationConfig(field.type, field.relation),
      rollup: normalizeRollupConfig(field.type, field.rollup)
    }));
    const fields: FieldSchema[] = [...systemFields, ...userFields];
    const schema: DatabaseSchema = {
      id,
      name,
      path: normalizePathSegments(input.path, name),
      created_time: now,
      updated_time: now,
      fields,
      defaultViewId: DEFAULT_VIEW_ID
    };
    // Seed rows: take each template row, stamp it with id + timestamps,
    // and only let it overwrite fields that exist on the schema (so a
    // typo'd template field doesn't end up as a stray CSV column).
    const allowedFieldIds = new Set(fields.map((f) => f.id));
    const templateRows = input.template?.rows ?? [];
    const records: DatabaseRecord[] = templateRows.length > 0
      ? templateRows.map((row) => {
          const cells: DatabaseRecord = {
            id: createId("pg"),
            created_time: now,
            updated_time: now,
            title: ""
          };
          for (const [key, value] of Object.entries(row)) {
            if (allowedFieldIds.has(key)) cells[key] = value as DatabaseRecord[string];
          }
          return cells;
        })
      : [{
          id: createId("pg"),
          created_time: now,
          updated_time: now,
          title: "First row"
        }];
    const views = ensureCreatedTimeSortViews(schema, records, [createDefaultTableView(schema, records, "Default")]).views;

    const paths = this.workspace.requirePaths();
    await fileService.ensureDir(paths.viewsDir(id, name));
    await fileService.ensureDir(paths.rowPagesDir(id, name));
    await fileService.ensureDir(paths.templatePagesDir(id, name));
    await writeJsonFile(paths.schema(id, name), schema);
    await Promise.all(views.map((view) => writeJsonFile(paths.view(id, view.id, name), view)));
    await writeCsvFile(paths.data(id, name), fields.map((field) => field.id), records);
    await this.syncPageRecordsForRows(id, records);

    const manifest = await this.workspace.getManifest();
    await this.workspace.saveManifest({
      ...manifest,
      databases: [...manifest.databases, id]
    });

    return { schema, records, views };
  }

  async delete(id: string): Promise<void> {
    const manifest = await this.workspace.getManifest();
    if (!manifest.databases.includes(id)) return;

    const paths = this.workspace.requirePaths();
    let schema: DatabaseSchema | undefined;
    try {
      schema = await readJsonFile<DatabaseSchema>(paths.schema(id));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    await this.pageRecords.ensure();
    for (const meta of await this.pageRecords.listMetas()) {
      if (meta.parentId === id) {
        await this.pageRecords.delete(meta.id);
      }
    }

    await fileService.remove(paths.databaseDir(id, schema?.name), { recursive: true, force: true });
    await this.workspace.saveManifest({
      ...manifest,
      databases: manifest.databases.filter((databaseId) => databaseId !== id)
    });
  }

  async get(id: string): Promise<DatabaseBundle> {
    if (id === DATABASE_STATS_DATABASE_ID) {
      await this.ensureDatabaseStatsDatabase();
    }
    if (id === PAGES_DATABASE_ID) {
      await this.ensurePagesDatabase();
    }
    if (id === ENTITIES_DATABASE_ID) {
      await this.ensureEntitiesDatabase();
    }
    const tStart = performance.now();
    const paths = this.workspace.requirePaths();
    let schema = normalizeDatabasePath(await readJsonFile<DatabaseSchema>(paths.schema(id)));
    const tSchema = performance.now();
    const records = await readCsvFile(paths.data(id));
    const tCsv = performance.now();
    const migration = migrateLegacyUrlFields(schema, records);
    if (migration.changed) {
      schema = migration.schema;
      await writeJsonFile(paths.schema(id), schema);
    }
    const storedViews = await this.readViews(id, schema.defaultViewId);
    const legacyTemplates = schema.templates ?? [];
    if (legacyTemplates.length) {
      schema = await this.migrateLegacyTemplatesToDatabase(schema);
    }
    const templates = await this.loadTemplatesForDatabase(id, schema);
    schema = templates.length > 0
      ? { ...withoutSchemaTemplates(schema), templates }
      : withoutSchemaTemplates(schema);
    const computedRecords = await this.computeRollupsForWrite(schema, applyFormulasToRecords(records, schema.fields));
    const baseViews = storedViews.length > 0
      ? storedViews.map((view) => sanitizeViewForSchema(view, schema, computedRecords))
      : [createDefaultTableView(schema, computedRecords)];
    const generated = ensureCreatedTimeSortViews(schema, computedRecords, baseViews);
    if (generated.changed) {
      await this.writeViews(schema, generated.views);
    }
    const views = generated.views;
    const tEnd = performance.now();
    console.log(
      `[lotion main] db get id=${id} rows=${records.length} ` +
      `schema=${(tSchema - tStart).toFixed(1)}ms ` +
      `csv=${(tCsv - tSchema).toFixed(1)}ms ` +
      `views=${(tEnd - tCsv).toFixed(1)}ms ` +
      `total=${(tEnd - tStart).toFixed(1)}ms`
    );
    return { schema, records: computedRecords, views };
  }

  async addField(id: string, input: AddFieldInput): Promise<DatabaseBundle> {
    const bundle = await this.get(id);
    const fieldIdBase = slugifyId(input.name) || "field";
    let fieldId = fieldIdBase;
    let suffix = 2;
    while (bundle.schema.fields.some((field) => field.id === fieldId)) {
      fieldId = `${fieldIdBase}_${suffix}`;
      suffix += 1;
    }

    const field: FieldSchema = {
      id: fieldId,
      name: input.name.trim() || "Untitled field",
      type: input.type,
      options: needsOptions(input.type) ? normalizeOptions(input.options) : undefined,
      formula: input.type === "formula" ? input.formula || "" : undefined,
      relation: normalizeRelationConfig(input.type, input.relation),
      rollup: normalizeRollupConfig(input.type, input.rollup),
      dateFormat: hasDateDisplay(input.type) ? input.dateFormat : undefined,
      timeFormat: hasDateDisplay(input.type) ? input.timeFormat : undefined
    };
    const now = new Date().toISOString();
    const schema = {
      ...bundle.schema,
      updated_time: now,
      fields: [...bundle.schema.fields, field]
    };
    const views = bundle.views.map((view) => ({
      ...view,
      visibleFieldIds: [...view.visibleFieldIds, field.id],
      fieldOrder: [...view.fieldOrder, field.id],
      wrapFieldIds: view.wrapFieldIds ? [...view.wrapFieldIds, field.id] : undefined
    }));
    const records = bundle.records.map((record) => ({ ...record, [field.id]: "" }));
    const final = await this.writeBundle(schema, records, views);
    return { schema, records: final, views };
  }

  async updateField(input: UpdateFieldInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const field = bundle.schema.fields.find((item) => item.id === input.fieldId);
    if (!field) {
      return bundle;
    }

    const nextType = field.system ? field.type : input.type || field.type;
    const nextField: FieldSchema = {
      ...field,
      name: field.system ? field.name : input.name?.trim() || field.name,
      type: nextType,
      options: !field.system && needsOptions(nextType) ? normalizeOptions(input.options ?? field.options) : undefined,
      formula: !field.system && nextType === "formula" ? input.formula ?? field.formula ?? "" : undefined,
      relation: field.system ? field.relation : normalizeRelationConfig(nextType, input.relation, field.relation),
      rollup: field.system ? field.rollup : normalizeRollupConfig(nextType, input.rollup, field.rollup),
      dateFormat: hasDateDisplay(nextType) ? input.dateFormat ?? field.dateFormat : undefined,
      timeFormat: hasDateDisplay(nextType) ? input.timeFormat ?? field.timeFormat : undefined
    };
    const schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields: bundle.schema.fields.map((item) => (item.id === input.fieldId ? nextField : item))
    };
    const records = sanitizeRecordsForField(bundle.records, nextField);

    const final = await this.writeBundle(schema, records, bundle.views);
    return { ...bundle, schema, records: final };
  }

  async copyFieldToSystemTime(input: CopyFieldToSystemTimeInput): Promise<CopyFieldToSystemTimeResult> {
    const bundle = await this.get(input.databaseId);
    const sourceField = bundle.schema.fields.find((field) => field.id === input.sourceFieldId);
    if (!sourceField) throw new Error(`Source field not found: ${input.sourceFieldId}`);
    if (!hasDateDisplay(sourceField.type)) {
      throw new Error(`Source field is not date-like: ${input.sourceFieldId}`);
    }
    if (input.sourceFieldId === input.targetFieldId) {
      throw new Error("Source and target time fields must be different");
    }
    const targetField = bundle.schema.fields.find((field) => field.id === input.targetFieldId);
    if (!targetField || targetField.type !== input.targetFieldId || !targetField.system) {
      throw new Error(`System time field not found: ${input.targetFieldId}`);
    }

    let copiedRows = 0;
    let unchangedRows = 0;
    let skippedEmptyRows = 0;
    let skippedInvalidRows = 0;
    const changedRecords: DatabaseRecord[] = [];
    const records = bundle.records.map((record) => {
      const rawValue = String(record[input.sourceFieldId] ?? "").trim();
      if (!rawValue) {
        skippedEmptyRows += 1;
        return record;
      }
      const parsed = parseDateTimeValue(rawValue);
      if (!parsed) {
        skippedInvalidRows += 1;
        return record;
      }
      const timestamp = parsed.toISOString();
      if (String(record[input.targetFieldId] ?? "") === timestamp) {
        unchangedRows += 1;
        return record;
      }
      copiedRows += 1;
      const next = { ...record, [input.targetFieldId]: timestamp };
      changedRecords.push(next);
      return next;
    });

    const final = copiedRows > 0
      ? await this.writeBundle(bundle.schema, records, bundle.views)
      : bundle.records;
    if (changedRecords.length > 0) {
      const finalById = new Map(final.map((record) => [String(record.id ?? ""), record]));
      await this.syncPageRecordsForRows(
        input.databaseId,
        changedRecords.map((record) => finalById.get(String(record.id ?? "")) ?? record)
      );
    }
    return {
      bundle: { ...bundle, records: final },
      copiedRows,
      unchangedRows,
      skippedEmptyRows,
      skippedInvalidRows
    };
  }

  async deleteField(databaseId: string, fieldId: string): Promise<DatabaseBundle> {
    const bundle = await this.get(databaseId);
    const field = bundle.schema.fields.find((item) => item.id === fieldId);
    if (!field || field.id === "title" || field.system) {
      return bundle;
    }

    const schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields: bundle.schema.fields.filter((item) => item.id !== fieldId)
    };
    const records = bundle.records.map((record) => {
      const { [fieldId]: _removed, ...next } = record;
      return next;
    });
    const views = bundle.views.map((view) => sanitizeViewForSchema(view, schema, records));
    const final = await this.writeBundle(schema, records, views);
    return { ...bundle, schema, records: final, views };
  }

  async updateMeta(input: UpdateDatabaseMetaInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString()
    };
    if (input.tags !== undefined) {
      const tags = normalizeTags(input.tags);
      if (tags.length === 0) delete schema.tags;
      else schema.tags = tags;
    }
    await writeJsonFile(this.workspace.requirePaths().schema(input.databaseId), withoutSchemaTemplates(schema));
    return { ...bundle, schema };
  }

  async addRow(databaseId: string, templateId?: string): Promise<DatabaseBundle> {
    const bundle = await this.get(databaseId);
    const now = new Date().toISOString();
    const template = templateId
      ? bundle.schema.templates?.find((item) => item.id === templateId)
      : undefined;
    if (templateId && !template) {
      throw new Error(`Template ${templateId} not found in database ${databaseId}`);
    }

    const record: DatabaseRecord = {};
    for (const field of bundle.schema.fields) {
      record[field.id] = "";
    }
    record.id = createId("pg");
    record.created_time = now;
    record.updated_time = now;
    record.title = "New row";

    if (template?.values) {
      const editableFieldIds = new Set(
        bundle.schema.fields
          .filter((field) => !isReadOnlyComputedField(field))
          .map((field) => field.id)
      );
      editableFieldIds.add("title");
      for (const [fieldId, value] of Object.entries(template.values)) {
        if (editableFieldIds.has(fieldId)) record[fieldId] = value as RecordValue;
      }
    }
    if (template && (!record.title || String(record.title).trim() === "New row")) {
      record.title = template.name || "New row";
    }

    const records = [...bundle.records, record];
    const final = await this.writeBundle(bundle.schema, records, bundle.views);
    await this.syncPageRecordForRow(databaseId, record);
    if (template && this.rowPages && (template.markdown?.trim() || template.fullWidth)) {
      if (template.markdown?.trim()) {
        await this.rowPages.update(databaseId, String(record.id), template.markdown);
      }
      if (template.fullWidth) {
        await this.rowPages.setFullWidth(databaseId, String(record.id), true);
      }
      return this.get(databaseId);
    }
    return { ...bundle, records: final };
  }

  async saveTemplate(input: SaveDatabaseTemplateInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const template = normalizeDatabaseTemplate(bundle.schema, input.template);
    await this.upsertStoredTemplate(input.databaseId, template);
    return this.get(input.databaseId);
  }

  async deleteTemplate(input: DeleteDatabaseTemplateInput): Promise<DatabaseBundle> {
    await this.deleteStoredTemplate(input.databaseId, input.templateId);
    return this.get(input.databaseId);
  }

  async updateCell(input: UpdateCellInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const field = bundle.schema.fields.find((item) => item.id === input.fieldId);
    if (!field || field.system || field.type === "formula" || field.type === "rollup") {
      return bundle;
    }

    const now = new Date().toISOString();
    const records = bundle.records.map((record) => {
      if (record.id !== input.rowId) return record;
      return { ...record, [input.fieldId]: input.value, updated_time: now };
    });
    const final = await this.writeBundle(bundle.schema, records, bundle.views);

    if (input.fieldId === "title" && this.rowPages) {
      await this.rowPages.handleTitleChanged(input.databaseId, input.rowId, String(input.value ?? ""));
    }

    return { ...bundle, records: final };
  }

  async deleteRow(input: DeleteRowInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const doomed = bundle.records.find((record) => record.id === input.rowId);
    const records = bundle.records.filter((record) => record.id !== input.rowId);
    const final = await this.writeBundle(bundle.schema, records, bundle.views);
    if (doomed && this.rowPages) {
      await this.rowPages.handleRowDeleted(input.databaseId, doomed);
    }
    return { ...bundle, records: final };
  }

  /**
   * System helper used by RowPagesService to record a row's filename in
   * the hidden `page_file` cell. Bypasses the system-field guard in
   * updateCell because the caller is itself a service.
   */
  async setSystemCell(databaseId: string, rowId: string, fieldId: string, value: string): Promise<DatabaseBundle> {
    const bundle = await this.get(databaseId);
    const records = bundle.records.map((record) => {
      if (record.id !== rowId) return record;
      return { ...record, [fieldId]: value };
    });
    const final = await this.writeBundle(bundle.schema, records, bundle.views);
    return { ...bundle, records: final };
  }

  /**
   * Ensure a hidden, system-managed field exists in the schema. No-op
   * when the field is already present. Used to migrate older databases
   * the first time the row-page feature touches them.
   */
  async ensureHiddenField(databaseId: string, field: FieldSchema): Promise<DatabaseBundle> {
    const bundle = await this.get(databaseId);
    if (bundle.schema.fields.some((existing) => existing.id === field.id)) return bundle;
    const schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields: [...bundle.schema.fields, field]
    };
    const records = bundle.records.map((record) => ({ ...record, [field.id]: "" }));
    const final = await this.writeBundle(schema, records, bundle.views);
    return { ...bundle, schema, records: final };
  }

  async syncPageRecordForRow(databaseId: string, record: DatabaseRecord): Promise<void> {
    await this.syncPageRecordsForRows(databaseId, [record]);
  }

  async syncPageRecordsForRows(databaseId: string, records: DatabaseRecord[]): Promise<void> {
    if (records.length === 0) return;
    const ids = records.map((record) => String(record.id ?? "")).filter(Boolean);
    const existingById = new Map((await this.pageRecords.listMetas(ids)).map((meta) => [meta.id, meta]));
    const now = new Date().toISOString();
    await this.pageRecords.upsertMany(records.flatMap((record) => {
      const id = String(record.id ?? "");
      if (!id) return [];
      const existing = existingById.get(id);
      return [{
        meta: {
          ...existing,
          id,
          title: String(record.title ?? "").trim() || existing?.title || "Untitled",
          created_time: String(record.created_time ?? "") || existing?.created_time || now,
          updated_time: String(record.updated_time ?? "") || existing?.updated_time || now,
          icon: String(record.row_icon ?? "").trim() || existing?.icon
        },
        kind: "page" as const,
        databaseId,
        rowId: id
      }];
    }));
  }

  async createView(input: CreateViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const source = bundle.views.find((view) => view.id === input.sourceViewId) || bundle.views[0];
    const view: TableView = {
      ...source,
      id: createId("view"),
      databaseId: input.databaseId,
      name: input.name.trim() || "New view"
    };
    const views = [...bundle.views, view];
    const final = await this.writeBundle(bundle.schema, bundle.records, views);
    return { ...bundle, records: final, views };
  }

  async duplicateView(input: DuplicateViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const source = bundle.views.find((view) => view.id === input.viewId);
    if (!source) {
      throw new Error(`Database view not found: ${input.viewId}`);
    }
    const view: TableView = {
      ...source,
      id: createId("view"),
      databaseId: input.databaseId,
      name: uniqueViewName(
        input.name?.trim() || `${source.name} copy`,
        bundle.views.map((item) => item.name)
      )
    };
    const views = [...bundle.views, view];
    const final = await this.writeBundle(bundle.schema, bundle.records, views);
    return { ...bundle, records: final, views };
  }

  async updateView(databaseId: string, view: TableView): Promise<DatabaseBundle> {
    const bundle = await this.get(databaseId);
    const next = sanitizeViewForSchema(view, bundle.schema, bundle.records);
    const views = bundle.views.map((item) => (item.id === next.id ? next : item));
    const final = await this.writeBundle(bundle.schema, bundle.records, views);
    return { ...bundle, records: final, views };
  }

  async deleteView(input: DeleteViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    if (bundle.views.length <= 1) {
      throw new Error("Cannot delete the last database view.");
    }
    if (!bundle.views.some((view) => view.id === input.viewId)) {
      throw new Error(`Database view not found: ${input.viewId}`);
    }
    const views = bundle.views.filter((view) => view.id !== input.viewId);
    const fallbackViewId = views[0]?.id ?? DEFAULT_VIEW_ID;
    const schema: DatabaseSchema = bundle.schema.defaultViewId === input.viewId
      ? { ...bundle.schema, defaultViewId: fallbackViewId, updated_time: new Date().toISOString() }
      : bundle.schema;
    const final = await this.writeBundle(schema, bundle.records, views);
    const paths = this.workspace.requirePaths();
    await fileService.remove(paths.view(schema.id, input.viewId, schema.name), { force: true });
    return { ...bundle, schema, records: final, views };
  }

  async setDefaultView(input: SetDefaultViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    if (!bundle.views.some((view) => view.id === input.viewId)) {
      throw new Error(`Database view not found: ${input.viewId}`);
    }
    const schema: DatabaseSchema = {
      ...bundle.schema,
      defaultViewId: input.viewId,
      updated_time: new Date().toISOString()
    };
    const final = await this.writeBundle(schema, bundle.records, bundle.views);
    return { ...bundle, schema, records: final, views: sortViews(bundle.views, input.viewId) };
  }

  private async writeBundle(schema: DatabaseSchema, records: DatabaseRecord[], views: TableView[]): Promise<DatabaseRecord[]> {
    const paths = this.workspace.requirePaths();
    const headers = schema.fields.map((field) => field.id);
    const computedRecords = await this.computeRollupsForWrite(schema, applyFormulasToRecords(records, schema.fields));
    await writeJsonFile(paths.schema(schema.id, schema.name), withoutSchemaTemplates(schema));
    await writeCsvFile(paths.data(schema.id, schema.name), headers, computedRecords);
    await Promise.all(views.map((view) => writeJsonFile(paths.view(schema.id, view.id, schema.name), view)));
    return computedRecords;
  }

  private async writeViews(schema: DatabaseSchema, views: TableView[]): Promise<void> {
    const paths = this.workspace.requirePaths();
    await fileService.ensureDir(paths.viewsDir(schema.id, schema.name));
    await Promise.all(views.map((view) => writeJsonFile(paths.view(schema.id, view.id, schema.name), view)));
  }

  private async computeRollupsForWrite(schema: DatabaseSchema, records: DatabaseRecord[]): Promise<DatabaseRecord[]> {
    const targetCache = new Map<string, Promise<{ schema: DatabaseSchema; records: DatabaseRecord[] } | null>>();
    const loadTarget = (databaseId: string) => {
      const cached = targetCache.get(databaseId);
      if (cached) return cached;
      const promise = this.readRollupTargetDatabase(databaseId);
      targetCache.set(databaseId, promise);
      return promise;
    };

    return applyRollupsToRecords(schema, records, loadTarget);
  }

  private async readRollupTargetDatabase(databaseId: string): Promise<{ schema: DatabaseSchema; records: DatabaseRecord[] } | null> {
    try {
      const paths = this.workspace.requirePaths();
      const schema = normalizeDatabasePath(await readJsonFile<DatabaseSchema>(paths.schema(databaseId)));
      const records = applyFormulasToRecords(await readCsvFile(paths.data(databaseId)), schema.fields);
      return { schema, records };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  private async readViews(databaseId: string, defaultViewId: string): Promise<TableView[]> {
    const paths = this.workspace.requirePaths();
    let files: string[];
    try {
      files = await fileService.readDir(paths.viewsDir(databaseId));
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
    const views = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map((file) => readJsonFile<TableView>(`${paths.viewsDir(databaseId)}/${file}`))
    );
    return sortViews(views, defaultViewId);
  }

  private async ensureDatabaseStatsDatabase(): Promise<void> {
    const paths = this.workspace.requirePaths();
    const now = new Date().toISOString();
    let schema: DatabaseSchema;
    let schemaChanged = false;
    try {
      const existing = await readJsonFile<DatabaseSchema>(paths.schema(DATABASE_STATS_DATABASE_ID));
      const normalized = normalizeDatabaseStatsSchema(existing, now);
      schema = normalized.schema;
      schemaChanged = normalized.changed;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      schema = createDatabaseStatsSchema(now);
      schemaChanged = true;
    }

    const view = createDatabaseStatsDefaultView();
    await fileService.ensureDir(paths.viewsDir(DATABASE_STATS_DATABASE_ID));
    let existingRecords: DatabaseRecord[] | undefined;
    if (await pathExists(paths.data(DATABASE_STATS_DATABASE_ID))) {
      existingRecords = await readCsvFile(paths.data(DATABASE_STATS_DATABASE_ID));
    }
    if (schemaChanged) {
      await writeJsonFile(paths.schema(DATABASE_STATS_DATABASE_ID), schema);
      if (existingRecords) {
        await writeCsvFile(paths.data(DATABASE_STATS_DATABASE_ID), schema.fields.map((field) => field.id), existingRecords);
      }
    }
    if (!existingRecords) {
      await writeCsvFile(paths.data(DATABASE_STATS_DATABASE_ID), schema.fields.map((field) => field.id), []);
    }
    if (!(await pathExists(paths.view(DATABASE_STATS_DATABASE_ID, DEFAULT_VIEW_ID)))) {
      await writeJsonFile(paths.view(DATABASE_STATS_DATABASE_ID, DEFAULT_VIEW_ID), view);
    }

    const manifest = await this.workspace.getManifest();
    if (!manifest.systemDatabases.includes(DATABASE_STATS_DATABASE_ID)) {
      await this.workspace.saveManifest({
        ...manifest,
        systemDatabases: [...manifest.systemDatabases, DATABASE_STATS_DATABASE_ID]
      });
    }
  }

  private async readDatabaseStatsBundle(): Promise<DatabaseBundle> {
    await this.ensureDatabaseStatsDatabase();
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(DATABASE_STATS_DATABASE_ID));
    const records = await readCsvFile(paths.data(DATABASE_STATS_DATABASE_ID));
    const views = await this.readViews(DATABASE_STATS_DATABASE_ID, schema.defaultViewId);
    return { schema, records, views };
  }

  private async ensurePagesDatabase(): Promise<void> {
    const paths = this.workspace.requirePaths();
    const now = new Date().toISOString();
    let schema: DatabaseSchema;
    let schemaChanged = false;
    try {
      schema = await readJsonFile<DatabaseSchema>(paths.schema(PAGES_DATABASE_ID));
      const fields = [...schema.fields];
      for (const required of createPagesFields()) {
        if (!fields.some((field) => field.id === required.id)) {
          fields.push(required);
          schemaChanged = true;
        }
      }
      schema = {
        ...schema,
        id: PAGES_DATABASE_ID,
        name: "pages",
        defaultViewId: DEFAULT_VIEW_ID,
        updated_time: schemaChanged ? now : schema.updated_time,
        fields
      };
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      schema = createPagesSchema(now);
      schemaChanged = true;
    }

    await fileService.ensureDir(paths.viewsDir(PAGES_DATABASE_ID));
    const hasData = await pathExists(paths.data(PAGES_DATABASE_ID));
    const existingRecords = hasData ? await readCsvFile(paths.data(PAGES_DATABASE_ID)) : undefined;
    if (schemaChanged) {
      await writeJsonFile(paths.schema(PAGES_DATABASE_ID), schema);
      if (existingRecords) {
        await writeCsvFile(paths.data(PAGES_DATABASE_ID), schema.fields.map((field) => field.id), existingRecords);
      }
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
  }

  private async ensureEntitiesDatabase(): Promise<void> {
    const paths = this.workspace.requirePaths();
    const now = new Date().toISOString();
    let schema: DatabaseSchema;
    let schemaChanged = false;
    try {
      const existing = await readJsonFile<DatabaseSchema>(paths.schema(ENTITIES_DATABASE_ID));
      const normalized = normalizeEntitiesSchema(existing, now);
      schema = normalized.schema;
      schemaChanged = normalized.changed;
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      schema = createEntitiesSchema(now);
      schemaChanged = true;
    }

    await fileService.ensureDir(paths.viewsDir(ENTITIES_DATABASE_ID));
    const hasData = await pathExists(paths.data(ENTITIES_DATABASE_ID));
    const existingRecords = hasData ? await readCsvFile(paths.data(ENTITIES_DATABASE_ID)) : undefined;
    if (schemaChanged) {
      await writeJsonFile(paths.schema(ENTITIES_DATABASE_ID), schema);
      if (existingRecords) {
        await writeCsvFile(paths.data(ENTITIES_DATABASE_ID), schema.fields.map((field) => field.id), existingRecords);
      }
    }
    if (!existingRecords) {
      await writeCsvFile(paths.data(ENTITIES_DATABASE_ID), schema.fields.map((field) => field.id), []);
    }
    if (!(await pathExists(paths.view(ENTITIES_DATABASE_ID, DEFAULT_VIEW_ID)))) {
      await writeJsonFile(paths.view(ENTITIES_DATABASE_ID, DEFAULT_VIEW_ID), createEntitiesDefaultView());
    }

    const manifest = await this.workspace.getManifest();
    if (!manifest.systemDatabases.includes(ENTITIES_DATABASE_ID)) {
      await this.workspace.saveManifest({
        ...manifest,
        systemDatabases: [...manifest.systemDatabases, ENTITIES_DATABASE_ID]
      });
    }
  }

  private async loadTemplatesForDatabase(databaseId: string, schema: DatabaseSchema): Promise<DatabaseRowTemplate[]> {
    const paths = this.workspace.requirePaths();
    if (!(await pathExists(paths.templateData(databaseId, schema.name)))) return [];
    const records = await readCsvFile(paths.templateData(databaseId, schema.name));
    const templates = await Promise.all(
      records.map(async (record) => {
        const values = parseTemplateValues(record[TEMPLATE_VALUES_FIELD]);
        const name = String(record.title ?? "").trim() || "Untitled template";
        if (!values.title) values.title = name;
        let markdown: string | undefined;
        const fullWidth = parseBooleanCell(record[TEMPLATE_FULL_WIDTH_FIELD]);
        const pageFile = String(record.page_file ?? "");
        if (pageFile) {
          try {
            const body = await fileService.readText(paths.templatePage(databaseId, pageFile, schema.name));
            markdown = body.trimEnd() || undefined;
          } catch (error) {
            if (!isNotFoundError(error)) throw error;
          }
        }
        return {
          id: String(record.id),
          name,
          values,
          markdown,
          fullWidth: fullWidth || undefined
        };
      })
    );
    return templates.filter((template) => template.id.trim().length > 0);
  }

  private async migrateLegacyTemplatesToDatabase(schema: DatabaseSchema): Promise<DatabaseSchema> {
    for (const template of schema.templates ?? []) {
      await this.upsertStoredTemplate(schema.id, template);
    }
    const stripped = withoutSchemaTemplates(schema);
    const paths = this.workspace.requirePaths();
    await writeJsonFile(paths.schema(schema.id, schema.name), stripped);
    return stripped;
  }

  private async upsertStoredTemplate(databaseId: string, template: DatabaseRowTemplate): Promise<void> {
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    const now = new Date().toISOString();
    await fileService.ensureDir(paths.templatePagesDir(databaseId, schema.name));
    const templateDataPath = paths.templateData(databaseId, schema.name);
    const existingRecords = (await pathExists(templateDataPath)) ? await readCsvFile(templateDataPath) : [];
    const existing = existingRecords.find((record) => String(record.id) === template.id);
    const pageFile = pageMarkdownFileName(template.id, template.name);
    const previousPageFile = String(existing?.page_file ?? "");
    const nextRecord = withTemplateDefaults({
      ...(existing ?? {}),
      id: template.id,
      created_time: existing?.created_time || now,
      updated_time: now,
      title: template.name,
      page_file: pageFile,
      [TEMPLATE_VALUES_FIELD]: JSON.stringify(template.values ?? {}),
      [TEMPLATE_FULL_WIDTH_FIELD]: !!template.fullWidth
    });
    const nextRecords = existing
      ? existingRecords.map((record) => (String(record.id) === template.id ? nextRecord : record))
      : [...existingRecords, nextRecord];

    await writeCsvFile(templateDataPath, templateHeaders(), nextRecords);
    if (previousPageFile && previousPageFile !== pageFile) {
      try {
        await fileService.rename(paths.templatePage(databaseId, previousPageFile, schema.name), paths.templatePage(databaseId, pageFile, schema.name));
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    }
    if (template.markdown !== undefined) {
      await writeTextFile(paths.templatePage(databaseId, pageFile, schema.name), `${template.markdown.trimEnd()}\n`);
    }
  }

  private async deleteStoredTemplate(databaseId: string, templateId: string): Promise<void> {
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    const templateDataPath = paths.templateData(databaseId, schema.name);
    if (!(await pathExists(templateDataPath))) return;
    const records = await readCsvFile(templateDataPath);
    const doomed = records.find((record) => String(record.id) === templateId);
    if (!doomed) return;
    const nextRecords = records.filter((record) => record !== doomed);
    await writeCsvFile(templateDataPath, templateHeaders(), nextRecords);
    const pageFile = String(doomed.page_file ?? "");
    if (pageFile) await fileService.remove(paths.templatePage(databaseId, pageFile, schema.name), { force: true });
    await this.clearDefaultTemplateReferences(databaseId, templateId);
  }

  private async clearDefaultTemplateReferences(databaseId: string, templateId: string): Promise<void> {
    const paths = this.workspace.requirePaths();
    let schema: DatabaseSchema;
    try {
      schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    } catch (error) {
      if (isNotFoundError(error)) return;
      throw error;
    }
    const views = await this.readViews(databaseId, schema.defaultViewId);
    const nextViews = views.map((view) => (
      view.defaultTemplateId === templateId
        ? { ...view, defaultTemplateId: undefined }
        : view
    ));
    const changed = nextViews.some((view, index) => view !== views[index]);
    if (!changed) return;
    await Promise.all(nextViews.map((view) => writeJsonFile(paths.view(databaseId, view.id), view)));
  }

  private async computeStats(id: string): Promise<DatabaseStats> {
    const paths = this.workspace.requirePaths();
    const [schema, csvStats] = await Promise.all([
      readJsonFile<DatabaseSchema>(paths.schema(id)),
      readCsvStats(paths.data(id))
    ]);
    const rowPageFiles = new Set<string>();
    for (const fileName of csvStats.pageFiles) rowPageFiles.add(fileName);
    try {
      const entries = await fileService.readDir(paths.rowPagesDir(id));
      for (const entry of entries) {
        if (entry.endsWith(".md")) rowPageFiles.add(entry);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const nonEmptyPageCount = (await Promise.all(
      Array.from(rowPageFiles).map(async (fileName) => {
        try {
          const body = await fileService.readText(paths.rowPage(id, fileName));
          return body.trim().length > 0 ? 1 : 0;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
          throw error;
        }
      })
    )).reduce<number>((sum, count) => sum + count, 0);

    return {
      id: schema.id,
      pageCount: csvStats.rowCount,
      nonEmptyPageCount,
      fieldCount: schema.fields.filter((field) => !field.hidden).length
    };
  }
}

function migrateLegacyUrlFields(
  schema: DatabaseSchema,
  records: DatabaseRecord[]
): { schema: DatabaseSchema; changed: boolean } {
  let changed = false;
  const fields = schema.fields.map((field) => {
    if (field.type !== "text" || field.system || field.hidden) return field;
    if (!looksLikeUrlField(field)) return field;
    const values = records
      .map((record) => record[field.id])
      .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
      .map((value) => String(value).trim());
    if (values.length > 0 && !values.every(looksLikeUrlValue)) return field;
    changed = true;
    return { ...field, type: "url" as const };
  });
  return changed ? { schema: { ...schema, fields }, changed } : { schema, changed };
}

function looksLikeUrlField(field: FieldSchema): boolean {
  const label = `${field.id} ${field.name}`.toLowerCase();
  return /\burl\b/.test(label) || label.includes("网址") || label.includes("链接");
}

function looksLikeUrlValue(value: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true;
  return /^[^\s/@]+\.[^\s]+/.test(value);
}

async function readCsvStats(path: string): Promise<{ rowCount: number; pageFiles: string[] }> {
  let content = "";
  try {
    content = await fileService.readText(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rowCount: 0, pageFiles: [] };
    throw error;
  }
  content = content.trimEnd();
  if (!content) return { rowCount: 0, pageFiles: [] };

  let headers: string[] | null = null;
  let pageFileIndex = -1;
  let rowCount = 0;
  const pageFiles: string[] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const finishCell = () => {
    row.push(cell);
    cell = "";
  };
  const finishRow = () => {
    if (!headers) {
      headers = row;
      pageFileIndex = headers.indexOf("page_file");
    } else {
      rowCount += 1;
      if (pageFileIndex >= 0) {
        const fileName = (row[pageFileIndex] ?? "").trim();
        if (fileName) pageFiles.push(fileName);
      }
    }
    row = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      finishCell();
    } else if (char === "\n" && !inQuotes) {
      finishCell();
      finishRow();
    } else if (char !== "\r") {
      cell += char;
    }
  }
  finishCell();
  finishRow();

  return { rowCount, pageFiles };
}

function createDatabaseStatsSchema(now: string): DatabaseSchema {
  return {
    id: DATABASE_STATS_DATABASE_ID,
    name: "database_stats",
    created_time: now,
    updated_time: now,
    fields: createDatabaseStatsFields(),
    defaultViewId: DEFAULT_VIEW_ID
  };
}

function normalizeDatabaseStatsSchema(schema: DatabaseSchema, now: string): { schema: DatabaseSchema; changed: boolean } {
  const fields = [...schema.fields];
  let changed =
    schema.id !== DATABASE_STATS_DATABASE_ID ||
    schema.name !== "database_stats" ||
    schema.defaultViewId !== DEFAULT_VIEW_ID;
  for (const field of createDatabaseStatsFields()) {
    if (!fields.some((existing) => existing.id === field.id)) {
      fields.push(field);
      changed = true;
    }
  }
  return {
    schema: {
      ...schema,
      id: DATABASE_STATS_DATABASE_ID,
      name: "database_stats",
      defaultViewId: DEFAULT_VIEW_ID,
      updated_time: changed ? now : schema.updated_time,
      fields
    },
    changed
  };
}

function createDatabaseStatsFields(): FieldSchema[] {
  return [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Refreshed time", type: "updated_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: STATS_DATABASE_ID_FIELD, name: "Database ID", type: "text" },
    { id: STATS_ICON_FIELD, name: "Icon", type: "text", hidden: true },
    { id: STATS_PAGE_COUNT_FIELD, name: "Pages", type: "number" },
    { id: STATS_NON_EMPTY_PAGE_COUNT_FIELD, name: "Non-empty pages", type: "number" },
    { id: STATS_FIELD_COUNT_FIELD, name: "Fields", type: "number" }
  ];
}

function createDatabaseStatsDefaultView(): TableView {
  const visibleFieldIds = [
    "title",
    STATS_PAGE_COUNT_FIELD,
    STATS_NON_EMPTY_PAGE_COUNT_FIELD,
    STATS_FIELD_COUNT_FIELD,
    "updated_time",
    STATS_DATABASE_ID_FIELD
  ];
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: DATABASE_STATS_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: ["title", STATS_DATABASE_ID_FIELD],
    sorts: [{ fieldId: STATS_PAGE_COUNT_FIELD, direction: "desc" }],
    filters: []
  };
}

function databaseStatsToRecord(
  stats: DatabaseStats,
  schema: DatabaseSchema | undefined,
  refreshedAt: string
): DatabaseRecord {
  return {
    id: stats.id,
    created_time: refreshedAt,
    updated_time: refreshedAt,
    title: schema?.name ?? stats.id,
    [STATS_DATABASE_ID_FIELD]: stats.id,
    [STATS_ICON_FIELD]: schema?.icon ?? "",
    [STATS_PAGE_COUNT_FIELD]: stats.pageCount,
    [STATS_NON_EMPTY_PAGE_COUNT_FIELD]: stats.nonEmptyPageCount,
    [STATS_FIELD_COUNT_FIELD]: stats.fieldCount
  };
}

function recordToDatabaseStats(record: DatabaseRecord): DatabaseStats {
  const id = String(record[STATS_DATABASE_ID_FIELD] || record.id || "");
  return {
    id,
    pageCount: numberCell(record[STATS_PAGE_COUNT_FIELD]),
    nonEmptyPageCount: numberCell(record[STATS_NON_EMPTY_PAGE_COUNT_FIELD]),
    fieldCount: numberCell(record[STATS_FIELD_COUNT_FIELD]),
    refreshedAt: String(record.updated_time || "")
  };
}

function numberCell(value: RecordValue | undefined): number {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function templateHeaders(): string[] {
  return ["id", "created_time", "updated_time", "title", "page_file", TEMPLATE_VALUES_FIELD, TEMPLATE_FULL_WIDTH_FIELD];
}

function withTemplateDefaults(record: DatabaseRecord): DatabaseRecord {
  const next = { ...record };
  for (const header of templateHeaders()) {
    if (next[header] !== undefined && next[header] !== null) continue;
    next[header] = header === TEMPLATE_FULL_WIDTH_FIELD ? false : "";
  }
  return next;
}

function parseTemplateValues(value: RecordValue | undefined): Record<string, RecordValue> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const values: Record<string, RecordValue> = {};
    for (const [key, cell] of Object.entries(parsed)) {
      if (cell === null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean") {
        values[key] = cell;
      }
    }
    return values;
  } catch {
    return {};
  }
}

function parseBooleanCell(value: RecordValue | undefined): boolean {
  return value === true || value === "true";
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

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function withoutSchemaTemplates(schema: DatabaseSchema): DatabaseSchema {
  if (!schema.templates) return schema;
  const { templates: _templates, ...rest } = schema;
  return rest;
}

function normalizeDatabasePath(schema: DatabaseSchema): DatabaseSchema {
  const path = normalizePathSegments(schema.path, schema.name);
  if (schema.path && schema.path.length === path.length && schema.path.every((segment, index) => segment === path[index])) {
    return schema;
  }
  return { ...schema, path };
}

function normalizePathSegments(path: string[] | undefined, fallbackName: string): string[] {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 ? segments : [fallbackName.trim() || "Untitled Database"];
}

function createDefaultTableView(schema: DatabaseSchema, records: readonly DatabaseRecord[], name = "All"): TableView {
  const visibleFieldIds = orderViewFieldIdsByContentRichness(records, defaultVisibleFieldIds(schema.fields));
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: schema.id,
    name,
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: visibleFieldIds,
    sorts: [],
    filters: []
  };
}

function ensureCreatedTimeSortViews(
  schema: DatabaseSchema,
  records: readonly DatabaseRecord[],
  views: readonly TableView[]
): { changed: boolean; views: TableView[] } {
  if (!schema.fields.some((field) => field.id === "created_time")) {
    return { changed: false, views: sortViews([...views], schema.defaultViewId) };
  }
  const generatedById = new Map([
    [CREATED_TIME_ASC_VIEW_ID, createCreatedTimeSortView(schema, records, "asc")],
    [CREATED_TIME_DESC_VIEW_ID, createCreatedTimeSortView(schema, records, "desc")]
  ]);
  let changed = false;
  const normalized = views.map((view) => {
    const generated = generatedById.get(view.id);
    if (!generated) return view;
    generatedById.delete(view.id);
    if (!sameGeneratedCreatedTimeView(view, generated)) changed = true;
    return generated;
  });
  if (generatedById.size > 0) {
    changed = true;
    normalized.push(...generatedById.values());
  }
  return { changed, views: sortViews(normalized, schema.defaultViewId) };
}

function createCreatedTimeSortView(
  schema: DatabaseSchema,
  records: readonly DatabaseRecord[],
  direction: "asc" | "desc"
): TableView {
  const visibleFieldIds = createdTimeVisibleFieldIds(schema, records);
  return {
    id: direction === "asc" ? CREATED_TIME_ASC_VIEW_ID : CREATED_TIME_DESC_VIEW_ID,
    databaseId: schema.id,
    name: direction === "asc" ? "Created date asc" : "Created date desc",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: visibleFieldIds,
    sorts: [{ fieldId: "created_time", direction }],
    filters: []
  };
}

function createdTimeVisibleFieldIds(schema: DatabaseSchema, records: readonly DatabaseRecord[]): string[] {
  const base = orderViewFieldIdsByContentRichness(records, defaultVisibleFieldIds(schema.fields))
    .filter((id) => id !== "created_time");
  if (!base.includes("title")) return ["created_time", ...base];
  return base.flatMap((id) => id === "title" ? ["title", "created_time"] : [id]);
}

function sameGeneratedCreatedTimeView(a: TableView, b: TableView): boolean {
  return a.databaseId === b.databaseId &&
    a.name === b.name &&
    a.type === b.type &&
    sameStringList(a.visibleFieldIds, b.visibleFieldIds) &&
    sameStringList(a.fieldOrder, b.fieldOrder) &&
    sameStringList(a.wrapFieldIds ?? [], b.wrapFieldIds ?? []) &&
    a.sorts.length === b.sorts.length &&
    a.sorts.every((sort, index) => sort.fieldId === b.sorts[index]?.fieldId && sort.direction === b.sorts[index]?.direction) &&
    a.filters.length === 0;
}

function sanitizeViewForSchema(view: TableView, schema: DatabaseSchema, records: readonly DatabaseRecord[] = []): TableView {
  const fieldIds = new Set(schema.fields.map((field) => field.id));
  const templateIds = new Set((schema.templates ?? []).map((template) => template.id));
  const visibleFieldIds = view.visibleFieldIds.filter((id) => fieldIds.has(id));
  const safeVisibleFieldIds = visibleFieldIds.length > 0
    ? visibleFieldIds
    : fallbackVisibleFieldIds(schema.fields);
  const orderedVisibleFields = view.fieldOrder
    .filter((id) => fieldIds.has(id))
    .filter((id) => safeVisibleFieldIds.includes(id));
  const missingVisibleFields = orderViewFieldIdsByContentRichness(
    records,
    safeVisibleFieldIds.filter((id) => !orderedVisibleFields.includes(id))
  );
  const viewType = view.type || "table";
  const fieldOrder = shouldReorderDefaultViewByContentRichness(view, schema, viewType, safeVisibleFieldIds, orderedVisibleFields)
    ? orderViewFieldIdsByContentRichness(records, safeVisibleFieldIds)
    : [...orderedVisibleFields, ...missingVisibleFields];

  return {
    ...view,
    databaseId: schema.id,
    visibleFieldIds: safeVisibleFieldIds,
    fieldOrder,
    wrapFieldIds: view.wrapFieldIds?.filter((id) => fieldIds.has(id)),
    sorts: (view.sorts ?? []).filter((sort) => fieldIds.has(sort.fieldId)),
    filters: (view.filters ?? []).filter((filter) => fieldIds.has(filter.fieldId)),
    columnWidths: view.columnWidths
      ? Object.fromEntries(Object.entries(view.columnWidths).filter(([id, width]) => {
        return fieldIds.has(id) && Number.isFinite(width) && width > 0;
      }))
      : undefined,
    columnSummaries: view.columnSummaries
      ? Object.fromEntries(Object.entries(view.columnSummaries).filter(([id, summary]) => {
        return fieldIds.has(id) && COLUMN_SUMMARY_TYPES.has(summary);
      }))
      : undefined,
    defaultTemplateId: view.defaultTemplateId && templateIds.has(view.defaultTemplateId)
      ? view.defaultTemplateId
      : undefined,
    dateFieldId: viewType === "calendar" && view.dateFieldId && fieldIds.has(view.dateFieldId)
      ? view.dateFieldId
      : undefined,
    coverFieldId: viewType === "gallery" && view.coverFieldId && fieldIds.has(view.coverFieldId)
      ? view.coverFieldId
      : undefined
  };
}

function shouldReorderDefaultViewByContentRichness(
  view: TableView,
  schema: DatabaseSchema,
  viewType: TableView["type"],
  safeVisibleFieldIds: string[],
  orderedVisibleFields: string[]
): boolean {
  if (view.id !== DEFAULT_VIEW_ID || viewType !== "table") return false;
  if (orderedVisibleFields.length === 0) return true;
  if (sameStringList(orderedVisibleFields, safeVisibleFieldIds)) return true;

  const schemaDefaultVisible = defaultVisibleFieldIds(schema.fields).filter((id) => safeVisibleFieldIds.includes(id));
  return sameStringList(orderedVisibleFields, schemaDefaultVisible);
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sortViews(views: TableView[], defaultViewId: string): TableView[] {
  return [...views].sort((a, b) => {
    if (a.id === defaultViewId) return -1;
    if (b.id === defaultViewId) return 1;
    return a.name.localeCompare(b.name);
  });
}

function uniqueViewName(baseName: string, existingNames: string[]): string {
  const existing = new Set(existingNames);
  if (!existing.has(baseName)) return baseName;
  let suffix = 2;
  let candidate = `${baseName} ${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} ${suffix}`;
  }
  return candidate;
}

function fallbackVisibleFieldIds(fields: FieldSchema[]): string[] {
  const title = fields.find((field) => field.id === "title" && !field.hidden);
  if (title) return [title.id];
  const firstUserField = fields.find((field) => !field.hidden && !field.system);
  if (firstUserField) return [firstUserField.id];
  const firstVisibleField = fields.find((field) => !field.hidden);
  return firstVisibleField ? [firstVisibleField.id] : [];
}

function defaultVisibleFieldIds(fields: FieldSchema[]): string[] {
  const ids = [
    ...fields.filter((field) => field.id === "title" && !field.hidden).map((field) => field.id),
    ...fields.filter((field) => field.id !== "title" && !field.hidden && !field.system).map((field) => field.id)
  ];
  return ids.length > 0 ? ids : fallbackVisibleFieldIds(fields);
}

function orderViewFieldIdsByContentRichness(records: readonly DatabaseRecord[], fieldIds: readonly string[]): string[] {
  return orderFieldIdsByContentRichness(records, fieldIds, {
    pinnedFirst: ["title"],
    pinnedLast: [ORIGINAL_NOTION_HTML_FIELD_ID, ORIGINAL_NOTION_CSV_FIELD_ID]
  });
}

function needsOptions(type: FieldSchema["type"]): boolean {
  return type === "select" || type === "multi_select";
}

function normalizeRelationConfig(
  type: FieldSchema["type"],
  relation?: RelationFieldConfig,
  fallback?: RelationFieldConfig
): RelationFieldConfig | undefined {
  if (type !== "entity_ref") return undefined;
  const source = relation ?? fallback;
  const targetDatabaseId = typeof source?.targetDatabaseId === "string"
    ? source.targetDatabaseId.trim()
    : "";
  return {
    ...(targetDatabaseId ? { targetDatabaseId } : {}),
    multiple: source?.multiple === false ? false : true
  };
}

function normalizeRollupConfig(
  type: FieldSchema["type"],
  rollup?: RollupFieldConfig,
  fallback?: RollupFieldConfig
): RollupFieldConfig | undefined {
  if (type !== "rollup") return undefined;
  const source = rollup ?? fallback;
  const relationFieldId = typeof source?.relationFieldId === "string"
    ? source.relationFieldId.trim()
    : "";
  const targetFieldId = typeof source?.targetFieldId === "string"
    ? source.targetFieldId.trim()
    : "";
  const aggregation = source?.aggregation && ROLLUP_AGGREGATIONS.has(source.aggregation)
    ? source.aggregation
    : "count";
  return {
    ...(relationFieldId ? { relationFieldId } : {}),
    ...(targetFieldId ? { targetFieldId } : {}),
    aggregation
  };
}

function hasDateDisplay(type: FieldSchema["type"]): boolean {
  return type === "date" || type === "created_time" || type === "updated_time";
}

function isReadOnlyComputedField(field: FieldSchema): boolean {
  return field.system || field.hidden || field.type === "formula" || field.type === "rollup";
}

function normalizeDatabaseTemplate(
  schema: DatabaseSchema,
  input: SaveDatabaseTemplateInput["template"]
): DatabaseRowTemplate {
  const editableFieldIds = new Set(
    schema.fields
      .filter((field) => !isReadOnlyComputedField(field))
      .map((field) => field.id)
  );
  editableFieldIds.add("title");

  const values: Record<string, RecordValue> = {};
  for (const [fieldId, value] of Object.entries(input.values ?? {})) {
    if (editableFieldIds.has(fieldId)) values[fieldId] = value;
  }

  return {
    id: input.id || createId("tpl"),
    name: input.name.trim() || "Untitled template",
    values,
    markdown: input.markdown === undefined ? undefined : input.markdown.trimEnd(),
    fullWidth: !!input.fullWidth
  };
}

function normalizeOptions(options?: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  const normalized: SelectOption[] = [];

  for (const option of options || []) {
    const name = option.name.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    normalized.push({
      id: option.id || slugifyId(name) || createId("opt"),
      name,
      color: option.color || "gray"
    });
  }

  if (normalized.length > 0) return normalized;
  return [
    { id: "opt_todo", name: "Todo", color: "gray" },
    { id: "opt_in_progress", name: "In Progress", color: "blue" },
    { id: "opt_done", name: "Done", color: "green" }
  ];
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const name = tag.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function sanitizeRecordsForField(records: DatabaseRecord[], field: FieldSchema): DatabaseRecord[] {
  if (!needsOptions(field.type)) return records;

  const optionNames = new Set((field.options || []).map((option) => option.name));
  return records.map((record) => {
    const value = record[field.id];
    if (typeof value !== "string" || value.length === 0) return record;

    if (field.type === "select") {
      return optionNames.has(value) ? record : { ...record, [field.id]: "" };
    }

    const nextValue = value
      .split(";")
      .map((item) => item.trim())
      .filter((item) => item && optionNames.has(item))
      .join(";");
    return nextValue === value ? record : { ...record, [field.id]: nextValue };
  });
}
