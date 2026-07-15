import { open, readFile, readdir, stat } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const spaceRoot = join(repoRoot, "samples", "demo-space");
const errors = [];
const deep = process.argv.includes("--deep");
const SAMPLE_LARGE_CSV_AFTER_BYTES = 2 * 1024 * 1024;
const LARGE_CSV_SAMPLE_BYTES = 512 * 1024;
const OPTIONAL_GENERATED_DATA_IDS = new Set(["db_rows_500k"]);
let sampledLargeCsvs = 0;

const manifest = await readJson(join(spaceRoot, "lotion.json"));
const pageRecordsById = await readSystemPageRecords();

assert(manifest.version === 1, "manifest version must be 1");
assert(Boolean(manifest.spaceId), "manifest must include spaceId");
assert(Boolean(manifest.name), "manifest must include name");
assert(Array.isArray(manifest.pages), "manifest pages must be an array");
assert(Array.isArray(manifest.databases), "manifest databases must be an array");
assert(Array.isArray(manifest.systemDatabases), "manifest systemDatabases must be an array");

const databaseIds = new Set([...(manifest.databases || []), ...(manifest.systemDatabases || [])]);
const schemasByDatabaseId = await readSchemasByDatabaseId();
const viewIdsByDatabase = new Map();
const fieldTypes = new Set([
  "id",
  "created_time",
  "updated_time",
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "url",
  "person",
  "entity_ref",
  "checkbox",
  "formula",
  "rollup"
]);
const optionColors = new Set(["gray", "red", "orange", "yellow", "green", "blue", "purple", "pink"]);
const viewTypes = new Set(["table", "list", "calendar", "gallery", "kanban"]);
const columnSummaryTypes = new Set(["none", "count", "not_empty", "empty", "unique", "sum", "average", "median", "min", "max", "range"]);
const rollupAggregations = new Set(["count", "count_values", "sum", "average", "min", "max", "range", "show_original"]);

for (const pageId of manifest.pages) {
  const meta = pageRecordsById.get(pageId);
  const pagePath = pageBodyPathFor(pageId, meta);
  assert(existsSync(pagePath), `page file exists for ${pageId}`);
  if (!existsSync(pagePath)) continue;

  const page = await readFile(pagePath, "utf8");
  assert(!page.startsWith("---\n"), `page ${pageId} markdown body has no frontmatter`);
  assert(Boolean(meta), `page ${pageId} has a system pages record`);
  assert(Boolean(meta?.title), `page ${pageId} has title`);
  assert(Boolean(meta?.created_time), `page ${pageId} has created_time`);
  assert(Boolean(meta?.updated_time), `page ${pageId} has updated_time`);
  assert(meta?.kind === "row_page", `page ${pageId} is stored as a default database row page`);
  assert(meta?.database_id === "pages", `page ${pageId} belongs to default pages database`);
  assert(meta?.row_id === pageId, `page ${pageId} default row id matches page id`);
  const expectedPageFile = pageMarkdownFileName(pageId, meta?.title);
  assert(meta?.body_path === `databases/system/pages--db_pages/pages/${expectedPageFile}`, `page ${pageId} has a title-based body path`);
  assert(meta?.page_file === expectedPageFile, `page ${pageId} has a title-based page file`);
}

for (const databaseId of manifest.databases) {
  const databaseDir = databasePath(databaseId, false);
  const schemaPath = join(databaseDir, "schema.json");
  const dataPath = join(databaseDir, "data.csv");

  assert(existsSync(schemaPath), `schema exists for ${databaseId}`);
  const hasData = existsSync(dataPath);
  assert(hasData || OPTIONAL_GENERATED_DATA_IDS.has(databaseId), `data.csv exists for ${databaseId}`);
  if (!existsSync(schemaPath)) continue;

  const schema = await readJson(schemaPath);
  assert(schema.id === databaseId, `schema id matches ${databaseId}`);
  assert(Boolean(schema.name), `database ${databaseId} has name`);
  assert(Array.isArray(schema.fields), `database ${databaseId} has fields`);
  assert(Boolean(schema.defaultViewId), `database ${databaseId} has defaultViewId`);

  const fieldIds = schema.fields.map((field) => field.id);
  const fieldById = new Map(schema.fields.map((field) => [field.id, field]));
  for (const required of ["id", "created_time", "updated_time"]) {
    assert(fieldIds.includes(required), `database ${databaseId} includes system field ${required}`);
  }
  for (const field of schema.fields) {
    assert(fieldTypes.has(field.type), `database ${databaseId} field ${field.id} has known type ${field.type}`);
    validateRelationFieldConfig(databaseId, field, "database");
    validateRollupFieldConfig(databaseId, field, fieldById, "database");
    if (field.type === "select" || field.type === "multi_select") {
      assert(Array.isArray(field.options) && field.options.length > 0, `database ${databaseId} field ${field.id} has options`);
      for (const option of field.options || []) {
        assert(Boolean(option.id), `database ${databaseId} field ${field.id} option has id`);
        assert(Boolean(option.name), `database ${databaseId} field ${field.id} option has name`);
        assert(optionColors.has(option.color || "gray"), `database ${databaseId} field ${field.id} option ${option.name} has known color`);
      }
    }
  }

  if (hasData) {
    const csv = await readCsvRows(dataPath);
    assert(csv.length >= 2, `database ${databaseId} has at least one data row`);
    const headers = csv[0] || [];
    for (const fieldId of fieldIds) {
      assert(headers.includes(fieldId), `database ${databaseId} CSV includes field ${fieldId}`);
    }
    const records = csv.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
    for (const field of schema.fields) {
      if (field.type !== "select" && field.type !== "multi_select") continue;
      const optionNames = new Set((field.options || []).map((option) => option.name));
      for (const record of records) {
        const raw = record[field.id];
        if (!raw) continue;
        const values = field.type === "multi_select" ? raw.split(";").map((value) => value.trim()).filter(Boolean) : [raw];
        for (const value of values) {
          assert(optionNames.has(value), `database ${databaseId} field ${field.id} value "${value}" exists in options`);
        }
      }
    }
  }

  const viewsDir = join(databaseDir, "views");
  const viewFiles = existsSync(viewsDir) ? (await readdir(viewsDir)).filter((file) => file.endsWith(".json")) : [];
  assert(viewFiles.length > 0, `database ${databaseId} has at least one view`);

  const viewIds = new Set();
  for (const viewFile of viewFiles) {
    const view = await readJson(join(viewsDir, viewFile));
    viewIds.add(view.id);
    assert(view.databaseId === databaseId, `view ${view.id} points to ${databaseId}`);
    assert(viewTypes.has(view.type), `view ${view.id} has known view type ${view.type}`);
    assert(view.visibleFieldIds.length > 0, `view ${view.id} has visible fields`);

    for (const fieldId of [...view.visibleFieldIds, ...view.fieldOrder]) {
      assert(fieldIds.includes(fieldId), `view ${view.id} references known field ${fieldId}`);
    }
    for (const fieldId of view.wrapFieldIds || []) {
      assert(fieldIds.includes(fieldId), `view ${view.id} wrap references known field ${fieldId}`);
    }
    for (const fieldId of Object.keys(view.columnWidths || {})) {
      assert(fieldIds.includes(fieldId), `view ${view.id} column width references known field ${fieldId}`);
      assert(Number.isFinite(view.columnWidths[fieldId]) && view.columnWidths[fieldId] > 0, `view ${view.id} column width ${fieldId} is positive`);
    }
    for (const [fieldId, summary] of Object.entries(view.columnSummaries || {})) {
      assert(fieldIds.includes(fieldId), `view ${view.id} summary references known field ${fieldId}`);
      assert(columnSummaryTypes.has(summary), `view ${view.id} summary ${fieldId} has known type ${summary}`);
    }
    if (view.dateFieldId) {
      assert(fieldIds.includes(view.dateFieldId), `view ${view.id} dateFieldId references known field ${view.dateFieldId}`);
    }
    if (view.coverFieldId) {
      assert(fieldIds.includes(view.coverFieldId), `view ${view.id} coverFieldId references known field ${view.coverFieldId}`);
    }
    for (const sort of view.sorts || []) {
      assert(fieldIds.includes(sort.fieldId), `view ${view.id} sort references known field ${sort.fieldId}`);
    }
    for (const filter of view.filters || []) {
      assert(fieldIds.includes(filter.fieldId), `view ${view.id} filter references known field ${filter.fieldId}`);
    }
    if (view.type === "kanban") {
      assert(Boolean(view.config?.groupBy), `kanban view ${view.id} declares config.groupBy`);
      const groupBy = schema.fields.find((field) => field.id === view.config?.groupBy);
      assert(Boolean(groupBy), `kanban view ${view.id} groupBy references known field`);
      assert(groupBy?.type === "select", `kanban view ${view.id} groupBy field is select`);
    }
  }

  assert(viewIds.has(schema.defaultViewId), `database ${databaseId} default view exists`);
  viewIdsByDatabase.set(databaseId, viewIds);
}

for (const databaseId of manifest.systemDatabases || []) {
  const databaseDir = databasePath(databaseId, true);
  const schemaPath = join(databaseDir, "schema.json");
  const dataPath = join(databaseDir, "data.csv");

  assert(existsSync(schemaPath), `system schema exists for ${databaseId}`);
  assert(existsSync(dataPath), `system data.csv exists for ${databaseId}`);
  if (!existsSync(schemaPath) || !existsSync(dataPath)) continue;

  const schema = await readJson(schemaPath);
  assert(schema.id === databaseId, `system schema id matches ${databaseId}`);
  assert(Boolean(schema.name), `system database ${databaseId} has name`);
  assert(Array.isArray(schema.fields), `system database ${databaseId} has fields`);
  assert(Boolean(schema.defaultViewId), `system database ${databaseId} has defaultViewId`);

  const fieldIds = schema.fields.map((field) => field.id);
  const fieldById = new Map(schema.fields.map((field) => [field.id, field]));
  for (const required of ["id", "created_time", "updated_time"]) {
    assert(fieldIds.includes(required), `system database ${databaseId} includes system field ${required}`);
  }
  for (const field of schema.fields) {
    assert(fieldTypes.has(field.type), `system database ${databaseId} field ${field.id} has known type ${field.type}`);
    validateRelationFieldConfig(databaseId, field, "system database");
    validateRollupFieldConfig(databaseId, field, fieldById, "system database");
  }
  const headers = (await readCsvRows(dataPath))[0] || [];
  for (const fieldId of fieldIds) {
    assert(headers.includes(fieldId), `system database ${databaseId} CSV includes field ${fieldId}`);
  }

  const viewsDir = join(databaseDir, "views");
  const viewFiles = existsSync(viewsDir) ? (await readdir(viewsDir)).filter((file) => file.endsWith(".json")) : [];
  assert(viewFiles.length > 0, `system database ${databaseId} has at least one view`);
  const viewIds = new Set();
  for (const viewFile of viewFiles) {
    const view = await readJson(join(viewsDir, viewFile));
    viewIds.add(view.id);
    assert(view.databaseId === databaseId, `system view ${view.id} points to ${databaseId}`);
    assert(viewTypes.has(view.type), `system view ${view.id} has known view type ${view.type}`);
    assert(view.visibleFieldIds.length > 0, `system view ${view.id} has visible fields`);
    for (const fieldId of [...view.visibleFieldIds, ...view.fieldOrder]) {
      assert(fieldIds.includes(fieldId), `system view ${view.id} references known field ${fieldId}`);
    }
    for (const fieldId of view.wrapFieldIds || []) {
      assert(fieldIds.includes(fieldId), `system view ${view.id} wrap references known field ${fieldId}`);
    }
    for (const fieldId of Object.keys(view.columnWidths || {})) {
      assert(fieldIds.includes(fieldId), `system view ${view.id} column width references known field ${fieldId}`);
      assert(Number.isFinite(view.columnWidths[fieldId]) && view.columnWidths[fieldId] > 0, `system view ${view.id} column width ${fieldId} is positive`);
    }
    for (const [fieldId, summary] of Object.entries(view.columnSummaries || {})) {
      assert(fieldIds.includes(fieldId), `system view ${view.id} summary references known field ${fieldId}`);
      assert(columnSummaryTypes.has(summary), `system view ${view.id} summary ${fieldId} has known type ${summary}`);
    }
    if (view.dateFieldId) {
      assert(fieldIds.includes(view.dateFieldId), `system view ${view.id} dateFieldId references known field ${view.dateFieldId}`);
    }
    if (view.coverFieldId) {
      assert(fieldIds.includes(view.coverFieldId), `system view ${view.id} coverFieldId references known field ${view.coverFieldId}`);
    }
    for (const sort of view.sorts || []) {
      assert(fieldIds.includes(sort.fieldId), `system view ${view.id} sort references known field ${sort.fieldId}`);
    }
    for (const filter of view.filters || []) {
      assert(fieldIds.includes(filter.fieldId), `system view ${view.id} filter references known field ${filter.fieldId}`);
    }
    if (view.type === "kanban") {
      assert(Boolean(view.config?.groupBy), `system kanban view ${view.id} declares config.groupBy`);
      const groupBy = schema.fields.find((field) => field.id === view.config?.groupBy);
      assert(Boolean(groupBy), `system kanban view ${view.id} groupBy references known field`);
      assert(groupBy?.type === "select", `system kanban view ${view.id} groupBy field is select`);
    }
  }
  assert(viewIds.has(schema.defaultViewId), `system database ${databaseId} default view exists`);
  viewIdsByDatabase.set(databaseId, viewIds);
}

for (const pageId of manifest.pages) {
  const pagePath = pageBodyPathFor(pageId, pageRecordsById.get(pageId));
  if (!existsSync(pagePath)) continue;
  const page = await readFile(pagePath, "utf8");
  for (const ref of findEmbeddedViews(page)) {
    assert(databaseIds.has(ref.database), `page ${pageId} embeds known database ${ref.database}`);
    const views = viewIdsByDatabase.get(ref.database);
    assert(Boolean(views?.has(ref.view)), `page ${pageId} embeds known view ${ref.database}/${ref.view}`);
  }
}

if (errors.length > 0) {
  console.error("Demo space validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const sampleNote = sampledLargeCsvs > 0
  ? ` (${sampledLargeCsvs} large CSVs sampled; use --deep for full scan)`
  : "";
console.log(`Demo space validation passed: ${manifest.pages.length} pages, ${manifest.databases.length} user databases, ${(manifest.systemDatabases || []).length} system databases.${sampleNote}`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readCsvRows(path) {
  const info = await stat(path);
  if (deep || info.size <= SAMPLE_LARGE_CSV_AFTER_BYTES) {
    return parseCsv(await readFile(path, "utf8"));
  }

  sampledLargeCsvs += 1;
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(info.size, LARGE_CSV_SAMPLE_BYTES));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    let content = buffer.toString("utf8", 0, bytesRead);
    const lastNewline = content.lastIndexOf("\n");
    if (lastNewline > 0) content = content.slice(0, lastNewline);
    return parseCsv(content);
  } finally {
    await handle.close();
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function validateRelationFieldConfig(databaseId, field, label) {
  if (field.relation === undefined) return;
  assert(field.type === "entity_ref", `${label} ${databaseId} field ${field.id} only stores relation config on entity_ref fields`);
  if (field.relation.targetDatabaseId) {
    assert(
      databaseIds.has(field.relation.targetDatabaseId),
      `${label} ${databaseId} field ${field.id} relation target ${field.relation.targetDatabaseId} exists`
    );
  }
  if (field.relation.multiple !== undefined) {
    assert(
      typeof field.relation.multiple === "boolean",
      `${label} ${databaseId} field ${field.id} relation.multiple is boolean`
    );
  }
}

function validateRollupFieldConfig(databaseId, field, fieldById, label) {
  if (field.rollup === undefined) return;
  assert(field.type === "rollup", `${label} ${databaseId} field ${field.id} only stores rollup config on rollup fields`);
  let relationField;
  if (field.rollup.relationFieldId) {
    relationField = fieldById.get(field.rollup.relationFieldId);
    assert(Boolean(relationField), `${label} ${databaseId} field ${field.id} rollup relation field exists`);
    assert(relationField?.type === "entity_ref", `${label} ${databaseId} field ${field.id} rollup relation field is entity_ref`);
  }
  if (field.rollup.targetFieldId !== undefined) {
    assert(
      typeof field.rollup.targetFieldId === "string",
      `${label} ${databaseId} field ${field.id} rollup targetFieldId is string`
    );
    const targetFieldId = typeof field.rollup.targetFieldId === "string" ? field.rollup.targetFieldId.trim() : "";
    const targetDatabaseId = relationField?.relation?.targetDatabaseId;
    if (targetFieldId && targetDatabaseId) {
      const targetSchema = schemasByDatabaseId.get(targetDatabaseId);
      assert(Boolean(targetSchema), `${label} ${databaseId} field ${field.id} rollup target database ${targetDatabaseId} is readable`);
      assert(
        Boolean(targetSchema?.fields?.some((targetField) => targetField.id === targetFieldId)),
        `${label} ${databaseId} field ${field.id} rollup target field ${targetFieldId} exists on ${targetDatabaseId}`
      );
    }
  }
  if (field.rollup.aggregation !== undefined) {
    assert(
      rollupAggregations.has(field.rollup.aggregation),
      `${label} ${databaseId} field ${field.id} rollup aggregation ${field.rollup.aggregation} is known`
    );
  }
}

async function readSchemasByDatabaseId() {
  const schemas = new Map();
  for (const databaseId of manifest.databases || []) {
    const schemaPath = join(databasePath(databaseId, false), "schema.json");
    if (existsSync(schemaPath)) schemas.set(databaseId, await readJson(schemaPath));
  }
  for (const databaseId of manifest.systemDatabases || []) {
    const schemaPath = join(databasePath(databaseId, true), "schema.json");
    if (existsSync(schemaPath)) schemas.set(databaseId, await readJson(schemaPath));
  }
  return schemas;
}

async function readSystemPageRecords() {
  const pagesCsvPath = join(databasePath("pages", true), "data.csv");
  assert(existsSync(pagesCsvPath), "system pages database exists");
  if (!existsSync(pagesCsvPath)) return new Map();
  const rows = await readCsvRows(pagesCsvPath);
  const headers = rows[0] || [];
  const records = new Map();
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
    if (record.id) records.set(record.id, record);
  }
  return records;
}

function findEmbeddedViews(markdown) {
  const refs = [];
  const regex = /```lotion-view\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdown))) {
    const config = {};
    for (const line of match[1].split("\n")) {
      const index = line.indexOf(":");
      if (index === -1) continue;
      config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
    }
    refs.push({ database: config.database, view: config.view || "view_default" });
  }
  return refs;
}

function pageBodyPathFor(pageId, record) {
  const rel = record?.body_path || `databases/system/pages--db_pages/pages/${pageMarkdownFileName(pageId, record?.title)}`;
  return join(spaceRoot, rel);
}

function databasePath(id, system) {
  const base = join(spaceRoot, "databases", system ? "system" : "user");
  const stableId = databaseStableFolderId(id);
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === stableId || entry.name.endsWith(`--${stableId}`)) return join(base, entry.name);
    }
  }
  return join(base, databaseFolderName(id, defaultDatabaseName(id)));
}

function databaseStableFolderId(id) {
  return id.startsWith("db_") ? id : `db_${id}`;
}

function databaseFolderName(id, title = "") {
  const stableId = databaseStableFolderId(id);
  const slug = title ? slugifyTitle(title, 72) : "";
  return slug && slug !== stableId ? `${slug}--${stableId}` : stableId;
}

function defaultDatabaseName(id) {
  if (id === "pages") return "pages";
  if (id === "workspaces") return "workspaces";
  if (id === "database_stats") return "database_stats";
  return "";
}

function pageMarkdownFileName(id, title = "") {
  const slug = title ? slugifyTitle(title, 72) : "";
  return slug && slug !== id ? `${slug}--${id}.md` : `${id}.md`;
}

function slugifyTitle(value, maxLength = 64) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\x00]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return cleaned || "untitled";
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.trim().length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
