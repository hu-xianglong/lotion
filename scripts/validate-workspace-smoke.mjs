#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const args = parseArgs(process.argv.slice(2));
const workspaceRoot = resolve(args.workspace ?? join(repoRoot, "samples", "demo-space"));
const OPTIONAL_GENERATED_DATA_IDS = new Set(["db_rows_500k"]);
const errors = [];
const stats = {
  databases: 0,
  rows: 0,
  pageFiles: 0,
  missingRowPageFiles: 0,
  missingBodyFiles: 0,
  markdownFiles: 0,
  urlFields: 0,
  searchFiles: 0
};

assert(existsSync(join(workspaceRoot, "lotion.json")), `workspace has lotion.json: ${workspaceRoot}`);

const manifest = await readJson(join(workspaceRoot, "lotion.json"));
const systemIds = new Set(manifest.systemDatabases ?? []);
const userIds = new Set(manifest.databases ?? []);
const dbDirs = await listDatabaseDirs();
const dbDirById = new Map();
const allRows = [];
const pageBodyPaths = new Set();

for (const db of dbDirs) {
  stats.databases += 1;
  const schemaPath = join(db.abs, "schema.json");
  const dataPath = join(db.abs, "data.csv");
  assert(existsSync(schemaPath), `${db.rel}/schema.json exists`);
  if (!existsSync(schemaPath)) continue;

  const schema = await readJson(schemaPath);
  dbDirById.set(schema.id, db);
  const hasData = existsSync(dataPath);
  assert(hasData || OPTIONAL_GENERATED_DATA_IDS.has(schema.id), `${db.rel}/data.csv exists`);
  if (!hasData) continue;
  const fieldIds = new Set();
  for (const field of schema.fields ?? []) {
    if (!field.id) report(`${db.rel}/schema.json: field without id`);
    if (fieldIds.has(field.id)) report(`${db.rel}/schema.json: duplicate field id ${field.id}`);
    fieldIds.add(field.id);
  }

  const grid = parseCsv(await readFile(dataPath, "utf8"));
  const headers = grid[0] ?? [];
  for (const header of headers) {
    if (!fieldIds.has(header)) report(`${db.rel}/data.csv: header ${header} has no matching schema field`);
  }

  const idIndex = headers.indexOf("id");
  const pageFileIndex = headers.indexOf("page_file");
  const bodyPathIndex = headers.indexOf("body_path");
  const databaseIdIndex = headers.indexOf("database_id");
  const originalHtmlIndex = headers.indexOf("notion_original_html");
  const originalCsvIndex = headers.indexOf("notion_original_csv");
  const urlIndexes = headers
    .map((header, index) => ({ header, index, field: (schema.fields ?? []).find((field) => field.id === header) }))
    .filter((entry) => entry.field?.type === "url" || entry.header === "url");
  const seenRowIds = new Set();

  for (let rowIndex = 1; rowIndex < grid.length; rowIndex += 1) {
    const row = grid[rowIndex];
    stats.rows += 1;
    const rowId = idIndex >= 0 ? row[idIndex] ?? "" : "";
    if (!rowId) report(`${db.rel}/data.csv:${rowIndex + 1}: row id is empty`);
    if (rowId && seenRowIds.has(rowId)) report(`${db.rel}/data.csv:${rowIndex + 1}: duplicate row id ${rowId}`);
    if (rowId) seenRowIds.add(rowId);

    const pageFile = pageFileIndex >= 0 ? row[pageFileIndex] ?? "" : "";
    if (pageFile) {
      const path = join(db.abs, "pages", pageFile);
      stats.pageFiles += 1;
      if (existsSync(path)) await assertNonEmptyMarkdown(path);
      else stats.missingRowPageFiles += 1;
    }

    const bodyPath = bodyPathIndex >= 0 ? row[bodyPathIndex] ?? "" : "";
    if (bodyPath) {
      pageBodyPaths.add(normalizeWorkspacePath(bodyPath));
      const path = workspacePath(bodyPath);
      if (existsSync(path)) await assertNonEmptyMarkdown(path);
      else stats.missingBodyFiles += 1;
    }

    for (const entry of urlIndexes) {
      const value = row[entry.index] ?? "";
      if (!value) continue;
      stats.urlFields += 1;
      validateUrlOrWorkspacePath(value, `${db.rel}/data.csv:${rowIndex + 1}:${entry.header}`);
    }

    if (originalHtmlIndex >= 0) {
      const value = row[originalHtmlIndex] ?? "";
      if (value) validateWorkspaceFile(value, `${db.rel}/data.csv:${rowIndex + 1}:notion_original_html`);
    }
    if (originalCsvIndex >= 0) {
      const value = row[originalCsvIndex] ?? "";
      if (value) validateWorkspaceFile(value, `${db.rel}/data.csv:${rowIndex + 1}:notion_original_csv`);
    }

    allRows.push({
      db,
      schema,
      rowIndex: rowIndex + 1,
      row,
      headers,
      databaseId: databaseIdIndex >= 0 ? row[databaseIdIndex] ?? "" : "",
      originalHtml: originalHtmlIndex >= 0 ? row[originalHtmlIndex] ?? "" : ""
    });
  }
}

for (const id of userIds) {
  if (!dbDirById.has(id)) report(`lotion.json: user database ${id} has no database folder`);
}
for (const id of systemIds) {
  if (!dbDirById.has(id)) report(`lotion.json: system database ${id} has no database folder`);
}

const markdownFiles = await listFiles(join(workspaceRoot, "databases"), (path) => path.endsWith(".md"));
for (const filePath of markdownFiles) {
  stats.markdownFiles += 1;
  await assertNonEmptyMarkdown(filePath);
}

for (const bodyPath of pageBodyPaths) {
  if (!bodyPath.startsWith("databases/user/") && !bodyPath.startsWith("databases/system/")) {
    report(`system pages body_path should stay under databases/: ${bodyPath}`);
  }
}

for (const fragment of args.forbidSystemPageSourceFragments) {
  const offenders = allRows.filter((entry) =>
    entry.schema.id === "pages" &&
    (!entry.databaseId || entry.databaseId === "pages") &&
    entry.originalHtml.includes(fragment)
  );
  if (offenders.length > 0) {
    report(
      `source fragment "${fragment}" appears as ${offenders.length} standalone system page row(s); expected it to belong to a real database`
    );
  }
}

for (const title of args.expectDatabaseTitleContains) {
  const found = [...dbDirById.values()].some((db) => db.rel.includes(title));
  if (!found) report(`expected a database folder/title containing "${title}"`);
}

const searchableFiles = await listFiles(workspaceRoot, (path) =>
  (path.endsWith(".md") || path.endsWith(".csv") || path.endsWith(".json")) &&
  !workspaceRelative(path).startsWith("attachments/") &&
  !workspaceRelative(path).startsWith(".git/")
);
stats.searchFiles = searchableFiles.length;
for (const query of args.expectQueries) {
  const hits = [];
  for (const filePath of searchableFiles) {
    const text = await readFile(filePath, "utf8");
    if (text.includes(query)) hits.push(workspaceRelative(filePath));
  }
  if (hits.length === 0) {
    report(`search query "${query}" has no fixed-string hit in workspace files`);
  }
}

if (errors.length > 0) {
  console.error(`Workspace smoke validation failed for ${workspaceRoot}:`);
  for (const error of errors.slice(0, 80)) console.error(`- ${error}`);
  if (errors.length > 80) console.error(`- ... ${errors.length - 80} more`);
  process.exit(1);
}

console.log(
  [
    `Workspace smoke validation passed for ${workspaceRoot}:`,
    `${stats.databases} databases`,
    `${stats.rows} rows`,
    `${stats.markdownFiles} markdown files`,
    `${stats.pageFiles} row page files`,
    `${stats.missingRowPageFiles} lazy row page bodies`,
    `${stats.missingBodyFiles} lazy page bodies`,
    `${stats.urlFields} URL fields`,
    `${stats.searchFiles} searchable files`
  ].join(" ")
);

function parseArgs(argv) {
  const parsed = {
    workspace: null,
    expectQueries: [],
    expectDatabaseTitleContains: [],
    forbidSystemPageSourceFragments: []
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--workspace") {
      parsed.workspace = value;
      index += 1;
    } else if (arg === "--query") {
      parsed.expectQueries.push(value);
      index += 1;
    } else if (arg === "--expect-db-title") {
      parsed.expectDatabaseTitleContains.push(value);
      index += 1;
    } else if (arg === "--forbid-system-page-source-fragment") {
      parsed.forbidSystemPageSourceFragments.push(value);
      index += 1;
    } else if (!arg.startsWith("-") && !parsed.workspace) {
      parsed.workspace = arg;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return parsed;
}

async function listDatabaseDirs() {
  const result = [];
  for (const group of ["user", "system"]) {
    const root = join(workspaceRoot, "databases", group);
    if (!existsSync(root)) continue;
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const abs = join(root, entry.name);
      result.push({ group, abs, rel: workspaceRelative(abs) });
    }
  }
  return result;
}

async function listFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path, predicate)));
    else if (predicate(path)) files.push(path);
  }
  return files;
}

async function assertNonEmptyMarkdown(path) {
  const rel = workspaceRelative(path);
  const info = await stat(path);
  if (info.size === 0) report(`${rel}: markdown file is 0 bytes`);
}

function validateUrlOrWorkspacePath(value, source) {
  if (/^(https?:|mailto:|tel:)/i.test(value)) {
    try {
      new URL(value);
    } catch {
      report(`${source}: invalid URL ${value}`);
    }
    return;
  }
  const embeddedUrls = Array.from(String(value).matchAll(/\b(?:https?:\/\/|mailto:|tel:)[^\s<>"'`，。]+/gi))
    .map((match) => trimTrailingPunctuation(match[0]));
  if (embeddedUrls.length > 0) {
    for (const url of embeddedUrls) {
      try {
        new URL(url);
      } catch {
        report(`${source}: invalid embedded URL ${url}`);
      }
    }
    return;
  }
  validateWorkspaceFile(value, source);
}

function trimTrailingPunctuation(value) {
  return value.replace(/[)\],.;:!?]+$/g, "");
}

function validateWorkspaceFile(value, source) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return;
  const abs = workspacePath(value);
  if (!abs.startsWith(workspaceRoot)) {
    report(`${source}: path escapes workspace (${value})`);
    return;
  }
  if (!existsSync(abs)) report(`${source}: linked file does not exist (${value})`);
}

function workspacePath(path) {
  return resolve(workspaceRoot, normalizeWorkspacePath(path));
}

function normalizeWorkspacePath(path) {
  return String(path ?? "").replace(/^\/+/, "").split("\\").join("/");
}

function workspaceRelative(path) {
  return relative(workspaceRoot, path).split("\\").join("/");
}

function assert(condition, message) {
  if (!condition) report(message);
}

function report(message) {
  errors.push(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
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
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  if (rows[0]?.[0]?.charCodeAt(0) === 0xfeff) rows[0][0] = rows[0][0].slice(1);
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}
