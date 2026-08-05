import { DATABASE_STATS_DATABASE_ID, DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID, isSystemDatabaseId } from "../../shared/constants.js";
import { orderFieldIdsByContentRichness, orderFieldIdsByInformationAmount } from "../../shared/field-order.js";
import { applyFormulasToRecords } from "../../shared/formula.js";
import { createId, slugifyId } from "../../shared/ids.js";
import { applyRollupsToRecords } from "../../shared/rollup.js";
import { pageMarkdownFileName } from "../../shared/workspace-paths.js";
import { DatabaseViewError } from "../../shared/database-view-errors.js";
import type { RowPagesService } from "./row-pages-service.js";
import type {
  AddFieldInput,
  ColumnSummaryType,
  CreateDatabaseInput,
  CreateViewInput,
  DatabaseBundle,
  DatabaseRecord,
  DatabaseRowTemplate,
  DatabaseSchema,
  DatabaseStats,
  DatabaseSummary,
  DuplicateViewInput,
  PatchViewInput,
  ReorderViewsInput,
  ReorderFieldsInput,
  RestoreFieldInput,
  PermanentlyDeleteFieldInput,
  PatchViewResult,
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
import { filterExpressionUsesField, flattenSimpleAndFilters, legacyFiltersToExpression, normalizeFilterExpression } from "../../shared/filter-expression.js";
import { normalizeViewGroups } from "../../shared/database-grouping.js";
import { normalizePageOpenMode } from "../../shared/database-page-open.js";
import { parseDateValue } from "../../shared/date-values.js";
import { assertDatabaseUnlocked, DatabaseLockedError } from "../../shared/database-lock.js";
import { DatabaseMutationError, databasePersistenceError } from "../../shared/database-mutation-errors.js";
import { readCsvFile, writeCsvFile } from "../storage/csv-file.js";
import { readJsonFile, writeJsonFile, writeTextFile } from "../storage/json-file.js";
import { createPagesDefaultView, createPagesFields, createPagesSchema, PagesDatabaseService } from "./pages-database-service.js";
import { createEntitiesDefaultView, createEntitiesSchema, normalizeEntitiesSchema } from "./entities-database-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";
import { mapWithConcurrency } from "./concurrency.js";

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
  private listPromiseRoot?: string;
  private listPromise?: Promise<DatabaseSummary[]>;
  private readonly viewMutationQueues = new Map<string, Promise<void>>();
  private nextViewWriteFailure?: string;
  private nextBundleWriteFailure?: string;
  private nextMetaWriteFailure?: string;

  constructor(
    private readonly workspace: WorkspaceService,
    pageRecords?: PagesDatabaseService
  ) {
    this.pageRecords = pageRecords ?? new PagesDatabaseService(workspace);
  }

  /** Late-bound to break the DatabaseService ↔ RowPagesService cycle. */
  setRowPagesService(rowPages: RowPagesService): void {
    this.rowPages = rowPages;
  }

  failNextViewWriteForDebug(message = "Injected view persistence failure"): void {
    this.nextViewWriteFailure = message;
  }

  failNextBundleWriteForDebug(message = "Injected database persistence failure"): void {
    this.nextBundleWriteFailure = message;
  }

  failNextMetaWriteForDebug(message = "Injected database metadata persistence failure"): void {
    this.nextMetaWriteFailure = message;
  }

  async list(): Promise<DatabaseSummary[]> {
    const root = this.workspace.requirePaths().root;
    if (this.listPromise && this.listPromiseRoot === root) return this.listPromise;
    this.listPromiseRoot = root;
    const promise = this.listFresh();
    this.listPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.listPromise === promise) {
        this.listPromise = undefined;
        this.listPromiseRoot = undefined;
      }
    }
  }

  private async listFresh(): Promise<DatabaseSummary[]> {
    const manifest = await this.workspace.getManifest();
    const paths = this.workspace.requirePaths();
    return mapWithConcurrency(manifest.databases, 24, async (id) => {
      const schema = normalizeDatabasePath(await readJsonFile<DatabaseSchema>(paths.schema(id)));
      return {
        id: schema.id,
        name: schema.name,
        path: schema.path,
        icon: schema.icon,
        tags: schema.tags
      };
    });
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
    if (schema?.locked) throw new DatabaseLockedError(id);

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
    let schema: DatabaseSchema;
    try {
      schema = normalizeDatabasePath(await readJsonFile<DatabaseSchema>(paths.schema(id)));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Database not found: ${id}`, { cause: error });
    }
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
    schema = await this.refreshDeletedFieldDependencies(id, schema, views);
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
    assertDatabaseUnlocked(bundle.schema);
    const sourceField = input.sourceFieldId ? bundle.schema.fields.find((field) => field.id === input.sourceFieldId) : undefined;
    if (input.sourceFieldId && !sourceField) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Source property not found: ${input.sourceFieldId}`);
    if (sourceField?.system) throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", "System properties cannot be duplicated.");
    if (input.insertAfterFieldId && input.insertBeforeFieldId) throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", "Choose either an insert-before or insert-after property, not both.");
    const anchorId = input.insertBeforeFieldId ?? input.insertAfterFieldId;
    if (anchorId && !bundle.schema.fields.some((field) => field.id === anchorId)) {
      throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Insert anchor property not found: ${anchorId}`);
    }
    const fieldName = uniqueFieldName(bundle.schema.fields, input.name.trim() || "Untitled field");
    const fieldIdBase = slugifyId(fieldName) || "field";
    let fieldId = fieldIdBase;
    let suffix = 2;
    while (bundle.schema.fields.some((field) => field.id === fieldId)) {
      fieldId = `${fieldIdBase}_${suffix}`;
      suffix += 1;
    }

    const field: FieldSchema = {
      ...(sourceField ? structuredClone(sourceField) : {}),
      id: fieldId,
      name: fieldName,
      type: sourceField?.type ?? input.type,
      system: undefined,
      hidden: undefined,
      options: needsOptions(sourceField?.type ?? input.type) ? normalizeOptions(input.options ?? sourceField?.options) : undefined,
      formula: (sourceField?.type ?? input.type) === "formula" ? input.formula ?? sourceField?.formula ?? "" : undefined,
      relation: normalizeRelationConfig(sourceField?.type ?? input.type, input.relation ?? sourceField?.relation),
      rollup: normalizeRollupConfig(sourceField?.type ?? input.type, input.rollup ?? sourceField?.rollup),
      dateFormat: hasDateDisplay(sourceField?.type ?? input.type) ? input.dateFormat ?? sourceField?.dateFormat : undefined,
      timeFormat: hasDateDisplay(sourceField?.type ?? input.type) ? input.timeFormat ?? sourceField?.timeFormat : undefined
    };
    const now = new Date().toISOString();
    const schema = {
      ...bundle.schema,
      updated_time: now,
      fields: insertFieldAt(bundle.schema.fields, field, input.insertAfterFieldId, input.insertBeforeFieldId)
    };
    const visibility = input.visibility ?? "all";
    if (visibility === "current" && !bundle.views.some((view) => view.id === input.viewId)) {
      throw new DatabaseViewError("VIEW_NOT_FOUND", `Database view not found: ${input.viewId || "missing"}`);
    }
    const views = bundle.views.map((view) => {
      const visible = visibility === "all" || (visibility === "current" && view.id === input.viewId);
      return visible ? {
        ...view,
        visibleFieldIds: insertStringAt(view.visibleFieldIds, field.id, input.insertAfterFieldId, input.insertBeforeFieldId),
        fieldOrder: insertStringAt(view.fieldOrder, field.id, input.insertAfterFieldId, input.insertBeforeFieldId),
        wrapFieldIds: view.wrapFieldIds ? [...view.wrapFieldIds, field.id] : undefined
      } : view;
    });
    const records = bundle.records.map((record) => ({ ...record, [field.id]: "" }));
    const final = await this.writeBundle(schema, records, views);
    return { schema, records: final, views };
  }

  async updateField(input: UpdateFieldInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const field = bundle.schema.fields.find((item) => item.id === input.fieldId);
    if (!field) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Property not found: ${input.fieldId}`);

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
    let schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields: bundle.schema.fields.map((item) => (item.id === input.fieldId ? nextField : item))
    };
    const records = sanitizeRecordsForField(bundle.records, nextField);
    const views = bundle.views.map((view) => sanitizeViewForSchema(view, schema, records));
    schema = await this.refreshDeletedFieldDependencies(input.databaseId, schema, views);
    const final = await this.writeBundle(schema, records, views);
    return { ...bundle, schema, records: final, views };
  }

  async reorderFields(input: ReorderFieldsInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const existingIds = bundle.schema.fields.map((field) => field.id);
    if (input.fieldIds.length !== existingIds.length || new Set(input.fieldIds).size !== existingIds.length || input.fieldIds.some((id) => !existingIds.includes(id))) {
      throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", "Field order must contain every schema field exactly once.");
    }
    const byId = new Map(bundle.schema.fields.map((field) => [field.id, field]));
    const schema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields: input.fieldIds.map((id) => byId.get(id)!)
    };
    const final = await this.writeBundle(schema, bundle.records, bundle.views);
    return { ...bundle, schema, records: final };
  }

  async deleteField(databaseId: string, fieldId: string): Promise<DatabaseBundle> {
    const bundle = await this.get(databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const field = bundle.schema.fields.find((item) => item.id === fieldId);
    if (!field) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Property not found: ${fieldId}`);
    if (field.id === "title" || field.system) throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", "System and title properties cannot be deleted.");

    const tombstone = {
      field,
      values: Object.fromEntries(bundle.records.map((record) => [String(record.id), record[fieldId] ?? ""])),
      position: bundle.schema.fields.findIndex((candidate) => candidate.id === fieldId),
      views: bundle.views.map((view) => ({
        viewId: view.id,
        visibleIndex: view.visibleFieldIds.indexOf(fieldId),
        orderIndex: view.fieldOrder.indexOf(fieldId),
        wrapped: Boolean(view.wrapFieldIds?.includes(fieldId))
      })),
      dependencies: [],
      deletedAt: new Date().toISOString()
    };

    let schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields: bundle.schema.fields.filter((item) => item.id !== fieldId),
      deletedFields: [...(bundle.schema.deletedFields ?? []).filter((item) => item.field.id !== fieldId), tombstone]
    };
    const records = bundle.records.map((record) => {
      const { [fieldId]: _removed, ...next } = record;
      return next;
    });
    const views = bundle.views.map((view) => sanitizeViewForSchema(view, schema, records));
    schema = await this.refreshDeletedFieldDependencies(databaseId, schema, views);
    const final = await this.writeBundle(schema, records, views);
    return { ...bundle, schema, records: final, views };
  }

  async restoreField(input: RestoreFieldInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const tombstone = bundle.schema.deletedFields?.find((item) => item.field.id === input.fieldId);
    if (!tombstone) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Deleted property not found: ${input.fieldId}`);
    if (bundle.schema.fields.some((field) => field.id === tombstone.field.id || field.name.toLocaleLowerCase() === tombstone.field.name.toLocaleLowerCase())) {
      throw new Error("Cannot restore property because its id or name is already in use.");
    }
    const fields = [...bundle.schema.fields];
    fields.splice(Math.min(Math.max(tombstone.position, 0), fields.length), 0, tombstone.field);
    let schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      fields,
      deletedFields: bundle.schema.deletedFields?.filter((item) => item.field.id !== input.fieldId)
    };
    const records = bundle.records.map((record) => ({ ...record, [input.fieldId]: tombstone.values[String(record.id)] ?? "" }));
    const byView = new Map(tombstone.views.map((state) => [state.viewId, state]));
    const views = bundle.views.map((view) => {
      const state = byView.get(view.id);
      if (!state) return view;
      return {
        ...view,
        visibleFieldIds: insertAtIfPresent(view.visibleFieldIds, input.fieldId, state.visibleIndex),
        fieldOrder: insertAtIfPresent(view.fieldOrder, input.fieldId, state.orderIndex),
        wrapFieldIds: state.wrapped ? [...(view.wrapFieldIds ?? []), input.fieldId] : view.wrapFieldIds
      };
    });
    schema = await this.refreshDeletedFieldDependencies(input.databaseId, schema, views);
    const final = await this.writeBundle(schema, records, views);
    return { ...bundle, schema, records: final, views };
  }

  async permanentlyDeleteField(input: PermanentlyDeleteFieldInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const tombstone = bundle.schema.deletedFields?.find((item) => item.field.id === input.fieldId);
    if (!tombstone) throw new Error(`Deleted property not found: ${input.fieldId}`);
    const dependencies = await this.findFieldDependencies(input.databaseId, bundle.schema.fields, bundle.views, tombstone.field);
    if (dependencies.length > 0) throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", `Property still has dependencies: ${dependencies.join(", ")}`);
    const schema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      deletedFields: bundle.schema.deletedFields?.filter((item) => item.field.id !== input.fieldId)
    };
    await writeJsonFile(this.workspace.requirePaths().schema(input.databaseId), withoutSchemaTemplates(schema));
    return { ...bundle, schema };
  }

  private async refreshDeletedFieldDependencies(databaseId: string, schema: DatabaseSchema, views: TableView[]): Promise<DatabaseSchema> {
    if (!schema.deletedFields?.length) return schema;
    const deletedFields = await Promise.all(schema.deletedFields.map(async (tombstone) => {
      const dependencies = await this.findFieldDependencies(databaseId, schema.fields, views, tombstone.field);
      return sameStringList(dependencies, tombstone.dependencies)
        ? tombstone
        : { ...tombstone, dependencies };
    }));
    return deletedFields.every((tombstone, index) => tombstone === schema.deletedFields?.[index])
      ? schema
      : { ...schema, deletedFields };
  }

  private async findFieldDependencies(databaseId: string, fields: readonly FieldSchema[], views: readonly TableView[], field: FieldSchema): Promise<string[]> {
    const dependencies = fieldDependencies(databaseId, fields, views, field);
    const manifest = await this.workspace.getManifest();
    const paths = this.workspace.requirePaths();
    await Promise.all(manifest.databases.filter((id) => id !== databaseId).map(async (id) => {
      let schema: DatabaseSchema;
      try {
        schema = await readJsonFile<DatabaseSchema>(paths.schema(id));
      } catch (error) {
        if (isNotFoundError(error)) return;
        throw error;
      }
      const fieldsById = new Map(schema.fields.map((candidate) => [candidate.id, candidate]));
      for (const candidate of schema.fields) {
        if (candidate.type !== "rollup" || candidate.rollup?.targetFieldId !== field.id) continue;
        const relationField = candidate.rollup.relationFieldId
          ? fieldsById.get(candidate.rollup.relationFieldId)
          : undefined;
        if (relationField?.relation?.targetDatabaseId === databaseId) {
          dependencies.push(`rollup:${schema.id}:${candidate.id}`);
        }
      }
    }));
    return [...new Set(dependencies)].sort();
  }

  async updateMeta(input: UpdateDatabaseMetaInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    if (input.locked === true && isSystemDatabaseId(bundle.schema.id)) {
      throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", "System databases cannot be locked through database metadata.");
    }
    if (bundle.schema.locked && input.locked !== false && input.tags !== undefined) assertDatabaseUnlocked(bundle.schema);
    const schema: DatabaseSchema = {
      ...bundle.schema,
      updated_time: new Date().toISOString()
    };
    if (input.tags !== undefined) {
      const tags = normalizeTags(input.tags);
      if (tags.length === 0) delete schema.tags;
      else schema.tags = tags;
    }
    if (input.locked !== undefined) schema.locked = input.locked || undefined;
    try {
      if (this.nextMetaWriteFailure) {
        const message = this.nextMetaWriteFailure;
        this.nextMetaWriteFailure = undefined;
        throw new Error(message);
      }
      await writeJsonFile(this.workspace.requirePaths().schema(input.databaseId), withoutSchemaTemplates(schema));
    } catch (error) {
      throw databasePersistenceError(input.databaseId, error);
    }
    return { ...bundle, schema };
  }

  async addRow(databaseId: string, templateId?: string, initialValues?: Record<string, RecordValue>): Promise<DatabaseBundle> {
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
    for (const [fieldId, value] of Object.entries(initialValues ?? {})) {
      const field = bundle.schema.fields.find((candidate) => candidate.id === fieldId);
      if (!field) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Property not found: ${fieldId}`);
      if (field.system || isReadOnlyComputedField(field)) {
        throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", `Property cannot be initialized: ${fieldId}`);
      }
      const invalid = validateBatchValue(field, value);
      if (invalid) throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", `${field.name}: ${invalid}`);
      record[fieldId] = value;
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
    assertDatabaseUnlocked(bundle.schema);
    const template = normalizeDatabaseTemplate(bundle.schema, input.template);
    try {
      this.consumeNextBundleWriteFailure();
      await this.upsertStoredTemplate(input.databaseId, template);
    } catch (error) {
      throw databasePersistenceError(input.databaseId, error);
    }
    return this.get(input.databaseId);
  }

  async deleteTemplate(input: DeleteDatabaseTemplateInput): Promise<DatabaseBundle> {
    assertDatabaseUnlocked((await this.get(input.databaseId)).schema);
    try {
      this.consumeNextBundleWriteFailure();
      await this.deleteStoredTemplate(input.databaseId, input.templateId);
    } catch (error) {
      throw databasePersistenceError(input.databaseId, error);
    }
    return this.get(input.databaseId);
  }

  async updateCell(input: UpdateCellInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const field = bundle.schema.fields.find((item) => item.id === input.fieldId);
    if (!field) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Property not found: ${input.fieldId}`);
    if (field.system || field.type === "formula" || field.type === "rollup") throw new DatabaseMutationError("DATABASE_INVALID_DEPENDENCY", `Property cannot be edited: ${input.fieldId}`);
    if (!bundle.records.some((record) => String(record.id) === input.rowId)) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Row not found: ${input.rowId}`);

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
    if (!doomed) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Row not found: ${input.rowId}`);
    const records = bundle.records.filter((record) => record.id !== input.rowId);
    const pageMeta = await this.pageRecords.getMeta(input.rowId);
    const bodyPath = pageMeta ? await this.pageRecords.getBodyPath(input.rowId) : undefined;
    const schema = {
      ...bundle.schema,
      updated_time: new Date().toISOString(),
      deletedRows: [...(bundle.schema.deletedRows ?? []).filter((item) => String(item.record.id) !== input.rowId), { record: doomed, position: bundle.records.findIndex((record) => record.id === input.rowId), deletedAt: new Date().toISOString(), page: pageMeta ? { meta: pageMeta, bodyPath } : undefined }]
    };
    const final = await this.writeBundle(schema, records, bundle.views);
    if (pageMeta) await this.pageRecords.delete(input.rowId);
    return { ...bundle, schema, records: final };
  }

  async duplicateRow(input: { databaseId: string; rowId: string }): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const source = bundle.records.find((record) => String(record.id) === input.rowId);
    if (!source) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Row not found: ${input.rowId}`);
    const now = new Date().toISOString();
    const record = { ...source, id: createId("pg"), title: `${String(source.title ?? "Untitled")} copy`, created_time: now, updated_time: now, page_file: "", body_path: "" };
    const sourceIndex = bundle.records.indexOf(source);
    const records = [...bundle.records];
    records.splice(sourceIndex + 1, 0, record);
    const final = await this.writeBundle(bundle.schema, records, bundle.views);
    await this.copyRowPageForDuplicate(input.databaseId, bundle.schema, source, record, now);
    if (this.rowPages) return this.get(input.databaseId);
    return { ...bundle, records: final };
  }

  async restoreRow(input: { databaseId: string; rowId: string }): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const tombstone = bundle.schema.deletedRows?.find((item) => String(item.record.id) === input.rowId);
    if (!tombstone) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Deleted row not found: ${input.rowId}`);
    if (bundle.records.some((record) => String(record.id) === input.rowId)) throw new DatabaseMutationError("DATABASE_CONFLICT", `Row id is already in use: ${input.rowId}`);
    const records = [...bundle.records];
    records.splice(Math.min(Math.max(tombstone.position, 0), records.length), 0, tombstone.record);
    const schema = { ...bundle.schema, updated_time: new Date().toISOString(), deletedRows: bundle.schema.deletedRows?.filter((item) => String(item.record.id) !== input.rowId) };
    const final = await this.writeBundle(schema, records, bundle.views);
    if (tombstone.page) {
      await this.pageRecords.upsert({
        meta: tombstone.page.meta,
        kind: "page",
        bodyPath: tombstone.page.bodyPath,
        databaseId: input.databaseId,
        rowId: input.rowId
      });
    } else {
      await this.syncPageRecordForRow(input.databaseId, tombstone.record);
    }
    return { ...bundle, schema, records: final };
  }

  async permanentlyDeleteRow(input: { databaseId: string; rowId: string }): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    const tombstone = bundle.schema.deletedRows?.find((item) => String(item.record.id) === input.rowId);
    if (!tombstone) throw new DatabaseMutationError("DATABASE_NOT_FOUND", `Deleted row not found: ${input.rowId}`);
    if (this.rowPages) await this.rowPages.handleRowDeleted(input.databaseId, tombstone.record, tombstone.page?.bodyPath);
    const schema = { ...bundle.schema, updated_time: new Date().toISOString(), deletedRows: bundle.schema.deletedRows?.filter((item) => String(item.record.id) !== input.rowId) };
    await writeJsonFile(this.workspace.requirePaths().schema(input.databaseId), withoutSchemaTemplates(schema));
    return { ...bundle, schema };
  }

  async batchRows(input: { databaseId: string; updates?: Array<{ rowId: string; fieldId: string; value: RecordValue }>; duplicateRowIds?: string[]; deleteRowIds?: string[] }): Promise<{ bundle: DatabaseBundle; errors: Array<{ rowId: string; message: string }>; createdRowIds: string[] }> {
    const operationCount = (input.updates?.length ?? 0) + (input.duplicateRowIds?.length ?? 0) + (input.deleteRowIds?.length ?? 0);
    if (operationCount > 500) throw new Error("Batch row operations are limited to 500 items.");
    const bundle = await this.get(input.databaseId);
    const errors: Array<{ rowId: string; message: string }> = [];
    const byId = new Map(bundle.records.map((record) => [String(record.id), record]));
    const deletedIds = new Set(input.deleteRowIds ?? []);
    const validDeletedIds = [...deletedIds].filter((rowId) => byId.has(rowId));
    const deletedPageSnapshots = await this.pageRecords.getSnapshots(validDeletedIds);
    const updatesByRow = new Map<string, Array<{ fieldId: string; value: RecordValue }>>();
    for (const update of input.updates ?? []) {
      const field = bundle.schema.fields.find((candidate) => candidate.id === update.fieldId);
      if (!byId.has(update.rowId)) { errors.push({ rowId: update.rowId, message: "Row not found." }); continue; }
      if (!field || field.system || field.type === "formula" || field.type === "rollup") { errors.push({ rowId: update.rowId, message: "Property is not editable." }); continue; }
      const invalid = validateBatchValue(field, update.value);
      if (invalid) { errors.push({ rowId: update.rowId, message: invalid }); continue; }
      updatesByRow.set(update.rowId, [...(updatesByRow.get(update.rowId) ?? []), { fieldId: update.fieldId, value: update.value }]);
    }
    const now = new Date().toISOString();
    let records = bundle.records.map((record) => {
      const rowId = String(record.id);
      const updates = updatesByRow.get(rowId);
      return updates ? { ...record, ...Object.fromEntries(updates.map((update) => [update.fieldId, update.value])), updated_time: now } : record;
    });
    const created: Array<{ sourceId: string; record: DatabaseRecord }> = [];
    for (const rowId of [...new Set(input.duplicateRowIds ?? [])]) {
      const source = byId.get(rowId);
      if (!source) { errors.push({ rowId, message: "Row not found." }); continue; }
      const record = { ...source, id: createId("pg"), title: `${String(source.title ?? "Untitled")} copy`, created_time: now, updated_time: now, page_file: "", body_path: "" };
      const index = records.findIndex((candidate) => String(candidate.id) === rowId);
      records.splice(index + 1, 0, record);
      created.push({ sourceId: rowId, record });
    }
    const updatedById = new Map(records.map((record) => [String(record.id), record]));
    const tombstones = [...(bundle.schema.deletedRows ?? [])].filter((item) => !deletedIds.has(String(item.record.id)));
    for (const rowId of deletedIds) {
      const record = updatedById.get(rowId);
      if (!record) { errors.push({ rowId, message: "Row not found." }); continue; }
      const page = deletedPageSnapshots.get(rowId);
      tombstones.push({ record, position: bundle.records.findIndex((candidate) => String(candidate.id) === rowId), deletedAt: now, page });
    }
    records = records.filter((record) => !deletedIds.has(String(record.id)));
    const schema = { ...bundle.schema, updated_time: now, deletedRows: tombstones };
    const final = await this.writeBundle(schema, records, bundle.views);
    for (const item of created) {
      await this.copyRowPageForDuplicate(
        input.databaseId,
        schema,
        byId.get(item.sourceId)!,
        item.record,
        now
      );
    }
    await this.pageRecords.deleteMany(validDeletedIds);
    return { bundle: created.length ? await this.get(input.databaseId) : { ...bundle, schema, records: final }, errors, createdRowIds: created.map((item) => String(item.record.id)) };
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
    const pageId = String(record.id ?? "");
    if (!pageId) return;
    const now = new Date().toISOString();
    await this.pageRecords.upsert({
      meta: {
        id: pageId,
        title: String(record.title ?? "").trim() || "Untitled",
        created_time: String(record.created_time ?? "") || now,
        updated_time: String(record.updated_time ?? "") || now,
        icon: String(record.row_icon ?? "").trim() || undefined
      },
      kind: "page",
      bodyPath: await this.pageRecords.getBodyPath(pageId),
      databaseId,
      rowId: pageId
    });
  }

  private async copyRowPageForDuplicate(
    databaseId: string,
    schema: DatabaseSchema,
    sourceRecord: DatabaseRecord,
    targetRecord: DatabaseRecord,
    now: string
  ): Promise<void> {
    if (this.rowPages) {
      await this.rowPages.duplicate(databaseId, schema, sourceRecord, targetRecord, now);
      return;
    }
    await this.syncPageRecordForRow(databaseId, targetRecord);
  }

  async syncPageRecordsForRows(databaseId: string, records: DatabaseRecord[]): Promise<void> {
    await Promise.all(records.map((record) => this.syncPageRecordForRow(databaseId, record)));
  }

  async createView(input: CreateViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const requestedName = input.name.trim() || "New view";
    const name = uniqueViewName(requestedName, bundle.views.map((item) => item.name));
    const source = input.sourceMode === "duplicate"
      ? bundle.views.find((view) => view.id === input.sourceViewId)
      : undefined;
    if (input.sourceMode === "duplicate" && !source) {
      throw new DatabaseViewError("VIEW_NOT_FOUND", `Source database view not found: ${input.sourceViewId || "missing"}`);
    }
    const empty = createBlankTableView(bundle.schema, name);
    const view: TableView = {
      ...(source ?? empty),
      id: createId("view"),
      databaseId: input.databaseId,
      name,
      type: input.type ?? source?.type ?? "table",
      position: bundle.views.length,
      revision: 0,
      updatedAt: new Date().toISOString()
    };
    const views = [...bundle.views, view];
    const final = await this.writeBundle(bundle.schema, bundle.records, views);
    return { ...bundle, records: final, views };
  }

  async duplicateView(input: DuplicateViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const source = bundle.views.find((view) => view.id === input.viewId);
    if (!source) {
      throw new DatabaseViewError("VIEW_NOT_FOUND", `Database view not found: ${input.viewId}`);
    }
    const view: TableView = {
      ...source,
      id: createId("view"),
      databaseId: input.databaseId,
      name: uniqueViewName(
        input.name?.trim() || `${source.name} copy`,
        bundle.views.map((item) => item.name)
      ),
      revision: 0,
      updatedAt: new Date().toISOString(),
      position: bundle.views.length
    };
    const views = [...bundle.views, view];
    const final = await this.writeBundle(bundle.schema, bundle.records, views);
    return { ...bundle, records: final, views };
  }

  async reorderViews(input: ReorderViewsInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    const existingIds = bundle.views.map((view) => view.id);
    if (input.viewIds.length !== existingIds.length || new Set(input.viewIds).size !== existingIds.length) {
      throw new DatabaseViewError("INVALID_VIEW_ORDER", "View order must contain every view exactly once.");
    }
    if (input.viewIds.some((id) => !existingIds.includes(id))) {
      throw new DatabaseViewError("INVALID_VIEW_ORDER", "View order contains an unknown view.");
    }
    const byId = new Map(bundle.views.map((view) => [view.id, view]));
    const now = new Date().toISOString();
    const views = input.viewIds.map((id, position) => ({
      ...byId.get(id)!,
      position,
      revision: viewRevision(byId.get(id)!) + 1,
      updatedAt: now
    }));
    await this.writeViews(bundle.schema, views);
    return { ...bundle, views };
  }

  async updateView(databaseId: string, view: TableView): Promise<DatabaseBundle> {
    return this.withViewMutationLock(databaseId, view.id, async () => {
      const bundle = await this.get(databaseId);
      assertDatabaseUnlocked(bundle.schema);
      const current = bundle.views.find((item) => item.id === view.id);
      if (!current) throw new DatabaseViewError("VIEW_NOT_FOUND", `Database view not found: ${view.id}`);
      assertUniqueViewName(bundle.views, view.id, view.name);
      const normalizedInputExpression = normalizeFilterExpression(view.filterExpression, view.filters ?? [], bundle.schema.fields);
      const filterExpression = JSON.stringify(view.filters ?? []) === JSON.stringify(flattenSimpleAndFilters(normalizedInputExpression))
        ? normalizedInputExpression
        : legacyFiltersToExpression(view.filters ?? []);
      const next = sanitizeViewForSchema({
        ...view,
        filterExpression,
        name: view.name.trim(),
        revision: viewRevision(current) + 1,
        updatedAt: new Date().toISOString()
      }, bundle.schema, bundle.records);
      await this.writeView(bundle.schema, next);
      return { ...bundle, views: bundle.views.map((item) => (item.id === next.id ? next : item)) };
    });
  }

  async patchView(input: PatchViewInput): Promise<PatchViewResult> {
    return this.withViewMutationLock(input.databaseId, input.viewId, async () => {
      const bundle = await this.get(input.databaseId);
      assertDatabaseUnlocked(bundle.schema);
      const current = bundle.views.find((item) => item.id === input.viewId);
      if (!current) throw new DatabaseViewError("VIEW_NOT_FOUND", `Database view not found: ${input.viewId}`);
      if (typeof input.patch.name === "string") assertUniqueViewName(bundle.views, current.id, input.patch.name);
      const actualRevision = viewRevision(current);
      if (input.expectedRevision !== actualRevision) {
        return {
          ok: false,
          error: {
            code: "VIEW_CONFLICT",
            message: `Database view changed from revision ${input.expectedRevision} to ${actualRevision}.`,
            expectedRevision: input.expectedRevision,
            actualRevision
          },
          bundle,
          currentView: current
        };
      }
      const next = sanitizeViewForSchema({
        ...current,
        ...input.patch,
        filterExpression: input.patch.filters && input.patch.filterExpression === undefined
          ? legacyFiltersToExpression(input.patch.filters)
          : input.patch.filterExpression ?? current.filterExpression,
        name: typeof input.patch.name === "string" ? input.patch.name.trim() : current.name,
        id: current.id,
        databaseId: current.databaseId,
        revision: actualRevision + 1,
        updatedAt: new Date().toISOString()
      }, bundle.schema, bundle.records);
      await this.writeView(bundle.schema, next);
      const nextBundle = {
        ...bundle,
        views: bundle.views.map((item) => (item.id === next.id ? next : item))
      };
      return { ok: true, bundle: nextBundle, view: next };
    });
  }

  async deleteView(input: DeleteViewInput): Promise<DatabaseBundle> {
    const bundle = await this.get(input.databaseId);
    assertDatabaseUnlocked(bundle.schema);
    if (bundle.views.length <= 1) {
      throw new DatabaseViewError("LAST_VIEW", "Cannot delete the last database view.");
    }
    if (!bundle.views.some((view) => view.id === input.viewId)) {
      throw new DatabaseViewError("VIEW_NOT_FOUND", `Database view not found: ${input.viewId}`);
    }
    const views = bundle.views
      .filter((view) => view.id !== input.viewId)
      .map((view, position) => ({ ...view, position }));
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
    assertDatabaseUnlocked(bundle.schema);
    if (!bundle.views.some((view) => view.id === input.viewId)) {
      throw new DatabaseViewError("VIEW_NOT_FOUND", `Database view not found: ${input.viewId}`);
    }
    const schema: DatabaseSchema = {
      ...bundle.schema,
      defaultViewId: input.viewId,
      updated_time: new Date().toISOString()
    };
    const views = [
      bundle.views.find((view) => view.id === input.viewId)!,
      ...bundle.views.filter((view) => view.id !== input.viewId)
    ].map((view, position) => ({ ...view, position }));
    const final = await this.writeBundle(schema, bundle.records, views);
    return { ...bundle, schema, records: final, views };
  }

  private async writeBundle(schema: DatabaseSchema, records: DatabaseRecord[], views: TableView[]): Promise<DatabaseRecord[]> {
    try {
      this.consumeNextBundleWriteFailure();
      const paths = this.workspace.requirePaths();
      const headers = schema.fields.map((field) => field.id);
      const computedRecords = await this.computeRollupsForWrite(schema, applyFormulasToRecords(records, schema.fields));
      await writeJsonFile(paths.schema(schema.id, schema.name), withoutSchemaTemplates(schema));
      await writeCsvFile(paths.data(schema.id, schema.name), headers, computedRecords);
      await Promise.all(views.map((view) => writeJsonFile(paths.view(schema.id, view.id, schema.name), view)));
      return computedRecords;
    } catch (error) {
      throw databasePersistenceError(schema.id, error);
    }
  }

  private consumeNextBundleWriteFailure(): void {
    if (!this.nextBundleWriteFailure) return;
    const message = this.nextBundleWriteFailure;
    this.nextBundleWriteFailure = undefined;
    throw new Error(message);
  }

  private async writeViews(schema: DatabaseSchema, views: TableView[]): Promise<void> {
    try {
      this.consumeNextViewWriteFailure();
      const paths = this.workspace.requirePaths();
      await fileService.ensureDir(paths.viewsDir(schema.id, schema.name));
      await Promise.all(views.map((view) => writeJsonFile(paths.view(schema.id, view.id, schema.name), view)));
    } catch (error) {
      throw databasePersistenceError(schema.id, error);
    }
  }

  private async writeView(schema: DatabaseSchema, view: TableView): Promise<void> {
    try {
      const failureMatch = process.env.LOTION_TEST_FAIL_VIEW_WRITES_MATCH;
      this.consumeNextViewWriteFailure();
      if (process.env.LOTION_TEST_FAIL_VIEW_WRITES === "1" || (failureMatch && JSON.stringify(view).includes(failureMatch))) {
        throw new Error("Injected view persistence failure");
      }
      const paths = this.workspace.requirePaths();
      await writeJsonFile(paths.view(schema.id, view.id, schema.name), view);
    } catch (error) {
      throw databasePersistenceError(schema.id, error);
    }
  }

  private consumeNextViewWriteFailure(): void {
    if (!this.nextViewWriteFailure) return;
    const message = this.nextViewWriteFailure;
    this.nextViewWriteFailure = undefined;
    throw new Error(message);
  }

  private async withViewMutationLock<T>(databaseId: string, viewId: string, mutation: () => Promise<T>): Promise<T> {
    const key = `${databaseId}:${viewId}`;
    const previous = this.viewMutationQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    this.viewMutationQueues.set(key, queued);
    await previous.catch(() => undefined);
    try {
      return await mutation();
    } finally {
      release();
      if (this.viewMutationQueues.get(key) === queued) this.viewMutationQueues.delete(key);
    }
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
        .map(async (file) => normalizeViewRevision(await readJsonFile<TableView>(`${paths.viewsDir(databaseId)}/${file}`)))
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
  const visibleFieldIds = orderDefaultViewFieldIds(records, defaultVisibleFieldIds(schema.fields));
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: schema.id,
    name,
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: [],
    sorts: [],
    filters: []
  };
}

function createBlankTableView(schema: DatabaseSchema, name: string): TableView {
  const visibleFieldIds = defaultVisibleFieldIds(schema.fields);
  return {
    id: DEFAULT_VIEW_ID,
    databaseId: schema.id,
    name,
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    wrapFieldIds: [],
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
    // Generated views are defaults, not immutable templates. Once persisted,
    // preserve user filters, widths, ordering, and revision on every reload.
    return view;
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
    wrapFieldIds: [],
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
  const fieldOrder = [...orderedVisibleFields, ...missingVisibleFields];

  const filterExpression = normalizeFilterExpression(view.filterExpression, view.filters ?? [], schema.fields);
  return {
    ...view,
    databaseId: schema.id,
    visibleFieldIds: safeVisibleFieldIds,
    fieldOrder,
    wrapFieldIds: view.wrapFieldIds?.filter((id) => fieldIds.has(id)),
    sorts: sanitizeViewSorts(view.sorts ?? [], fieldIds),
    filters: flattenSimpleAndFilters(filterExpression),
    filterExpression,
    groups: normalizeViewGroups(view.groups, schema.fields, view.type === "kanban" ? view.config?.groupBy : undefined, records),
    pageOpenMode: normalizePageOpenMode(view.pageOpenMode, viewType),
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
      : undefined,
    frozenThroughFieldId: view.frozenThroughFieldId && fieldIds.has(view.frozenThroughFieldId) && safeVisibleFieldIds.includes(view.frozenThroughFieldId)
      ? view.frozenThroughFieldId
      : undefined
  };
}

function sanitizeViewSorts(sorts: readonly TableView["sorts"][number][], fieldIds: ReadonlySet<string>): TableView["sorts"] {
  const seen = new Set<string>();
  return sorts.filter((sort) => {
    if (!fieldIds.has(sort.fieldId) || seen.has(sort.fieldId) || (sort.direction !== "asc" && sort.direction !== "desc")) return false;
    seen.add(sort.fieldId);
    return true;
  });
}

function sameStringList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sortViews(views: TableView[], defaultViewId: string): TableView[] {
  const ordered = [...views].sort((a, b) => {
    if (Number.isFinite(a.position) || Number.isFinite(b.position)) {
      return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
        || a.name.localeCompare(b.name);
    }
    if (a.id === defaultViewId) return -1;
    if (b.id === defaultViewId) return 1;
    return a.name.localeCompare(b.name);
  });
  return ordered.map((view, position) => view.position === position ? view : { ...view, position });
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

function assertUniqueViewName(views: readonly TableView[], viewId: string, name: string): void {
  const normalized = name.trim().toLocaleLowerCase();
  if (!normalized || views.some((view) => view.id !== viewId && view.name.trim().toLocaleLowerCase() === normalized)) {
    throw new DatabaseViewError("VIEW_NAME_CONFLICT", "View names must be non-empty and unique within the database.");
  }
}

function insertAtIfPresent(values: readonly string[], fieldId: string, index: number): string[] {
  if (index < 0 || values.includes(fieldId)) return [...values];
  const next = [...values];
  next.splice(Math.min(index, next.length), 0, fieldId);
  return next;
}

function insertStringAt(values: readonly string[], value: string, afterId?: string, beforeId?: string): string[] {
  const next = [...values];
  const before = beforeId ? next.indexOf(beforeId) : -1;
  const after = afterId ? next.indexOf(afterId) : -1;
  next.splice(before >= 0 ? before : after >= 0 ? after + 1 : next.length, 0, value);
  return next;
}

function insertFieldAt(fields: readonly FieldSchema[], field: FieldSchema, afterId?: string, beforeId?: string): FieldSchema[] {
  const next = [...fields];
  const before = beforeId ? next.findIndex((candidate) => candidate.id === beforeId) : -1;
  const after = afterId ? next.findIndex((candidate) => candidate.id === afterId) : -1;
  next.splice(before >= 0 ? before : after >= 0 ? after + 1 : next.length, 0, field);
  return next;
}

function uniqueFieldName(fields: readonly FieldSchema[], requestedName: string): string {
  const baseName = requestedName.trim() || "Untitled field";
  const existing = new Set(fields.map((field) => field.name.trim().toLocaleLowerCase()));
  if (!existing.has(baseName.toLocaleLowerCase())) return baseName;
  let suffix = 2;
  let candidate = `${baseName} ${suffix}`;
  while (existing.has(candidate.toLocaleLowerCase())) {
    suffix += 1;
    candidate = `${baseName} ${suffix}`;
  }
  return candidate;
}

function fieldDependencies(databaseId: string, fields: readonly FieldSchema[], views: readonly TableView[], field: FieldSchema): string[] {
  const dependencies: string[] = [];
  const fieldsById = new Map(fields.map((candidate) => [candidate.id, candidate]));
  for (const candidate of fields) {
    if (candidate.id === field.id) continue;
    if (candidate.type === "formula" && candidate.formula && (candidate.formula.includes(field.id) || candidate.formula.includes(field.name))) {
      dependencies.push(`formula:${candidate.id}`);
    }
    const relationField = candidate.rollup?.relationFieldId
      ? fieldsById.get(candidate.rollup.relationFieldId)
      : undefined;
    if (candidate.rollup?.relationFieldId === field.id || (
      candidate.rollup?.targetFieldId === field.id && relationField?.relation?.targetDatabaseId === databaseId
    )) {
      dependencies.push(`rollup:${candidate.id}`);
    }
  }
  for (const view of views) {
    if (view.filters.some((filter) => filter.fieldId === field.id) || filterExpressionUsesField(view.filterExpression, field.id)) dependencies.push(`filter:${view.id}`);
    if (view.sorts.some((sort) => sort.fieldId === field.id)) dependencies.push(`sort:${view.id}`);
  }
  return [...new Set(dependencies)];
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

function orderDefaultViewFieldIds(
  records: readonly DatabaseRecord[],
  fieldIds: readonly string[]
): string[] {
  return orderFieldIdsByInformationAmount(records, fieldIds, {
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

function validateBatchValue(field: FieldSchema, value: RecordValue): string | undefined {
  if (value === "") return undefined;
  if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return "Enter a valid number.";
  if (field.type === "checkbox" && typeof value !== "boolean") return "Choose a valid checkbox value.";
  if (
    field.type === "date"
    && (
      typeof value !== "string"
      || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)
      || !parseDateValue(value)
    )
  ) return "Enter a valid date.";
  if (field.type === "select" && (typeof value !== "string" || !(field.options ?? []).some((option) => option.name === value))) return "Choose a valid option.";
  if (field.type === "multi_select") {
    if (typeof value !== "string") return "Choose valid options.";
    const options = new Set((field.options ?? []).map((option) => option.name));
    if (value.split(";").map((item) => item.trim()).filter(Boolean).some((item) => !options.has(item))) return "Choose valid options.";
  }
  return undefined;
}

function viewRevision(view: TableView): number {
  return Number.isSafeInteger(view.revision) && (view.revision ?? 0) >= 0 ? view.revision! : 0;
}

function normalizeViewRevision(view: TableView): TableView {
  return { ...view, revision: viewRevision(view) };
}
