#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const strictSlashTitle = args.includes("--strict-slash-title");
const defaultWorkspace = resolve("samples/demo-space");
const workspaceArg = args.find((arg) => !arg.startsWith("-"));
const workspaceRoot = resolve(workspaceArg ?? defaultWorkspace);
const errors = [];
const warnings = [];
const stats = {
  pageRows: 0,
  entityRows: 0,
  parentRefs: 0,
  bodyPaths: 0,
  slashTitlePaths: 0,
  slashTitlePathMismatches: 0
};

const pagesDir = await findSystemDatabaseDir("pages");
assert(pagesDir, "system pages database exists");
const pageRows = pagesDir ? await readDatabaseRows(pagesDir) : [];
validatePageRows(pageRows);

const entitiesDir = await findSystemDatabaseDir("entities");
const entityRows = entitiesDir ? await readDatabaseRows(entitiesDir) : [];
if (entityRows.length > 0) validateEntityRows(entityRows, pageRows);

if (errors.length > 0) {
  console.error(`Workspace hierarchy validation failed for ${workspaceRoot}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  [
    `Workspace hierarchy validation passed for ${workspaceRoot}:`,
    `${stats.pageRows} page records`,
    `${stats.entityRows} entity records`,
    `${stats.parentRefs} parent refs`,
    `${stats.bodyPaths} body paths`,
    `${stats.slashTitlePaths} slash-title paths`,
    `${stats.slashTitlePathMismatches} slash-title path warnings`
  ].join(" ")
);
if (warnings.length > 0) {
  const shown = warnings.slice(0, 20);
  console.warn(`Workspace hierarchy warnings (${warnings.length}, showing ${shown.length}):`);
  for (const warning of shown) console.warn(`- ${warning}`);
}

async function findSystemDatabaseDir(id) {
  const root = join(workspaceRoot, "databases", "system");
  if (!existsSync(root)) return null;
  const stable = `db_${id}`;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === id || entry.name === stable || entry.name.endsWith(`--${stable}`)) {
      return join(root, entry.name);
    }
  }
  return null;
}

async function readDatabaseRows(databaseDir) {
  const csvPath = join(databaseDir, "data.csv");
  assert(existsSync(csvPath), `${workspaceRelative(csvPath)} exists`);
  if (!existsSync(csvPath)) return [];
  const rows = parseCsv(await readFile(csvPath, "utf8"));
  const headers = rows[0] ?? [];
  return rows.slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function validatePageRows(rows) {
  stats.pageRows = rows.length;
  const ids = new Set();
  for (const row of rows) {
    const id = stringValue(row.id);
    const title = stringValue(row.title) || "Untitled";
    if (!id) {
      errors.push("pages database contains a row without id");
      continue;
    }
    if (ids.has(id)) errors.push(`pages database has duplicate id ${id}`);
    ids.add(id);

    const pathSegments = parsePathSegments(row.path);
    validateSlashTitlePath("page", id, title, pathSegments);
    validateBodyPath("page", id, row.body_path);
    const parent = firstParentRef(row.parent_id);
    if (parent) stats.parentRefs += 1;
  }
}

function validateEntityRows(entityRows, pageRows) {
  stats.entityRows = entityRows.length;
  const entitiesById = new Map();
  const pagesById = new Map(pageRows.map((row) => [stringValue(row.id), row]));
  for (const row of entityRows) {
    const id = stringValue(row.id);
    if (!id) {
      errors.push("entities database contains a row without id");
      continue;
    }
    if (entitiesById.has(id)) errors.push(`entities database has duplicate id ${id}`);
    entitiesById.set(id, row);
  }

  for (const row of entityRows) {
    const id = stringValue(row.id);
    const kind = stringValue(row.kind);
    const title = stringValue(row.title) || "Untitled";
    if (!["page", "database", "row"].includes(kind)) {
      errors.push(`entity ${id}: invalid kind ${JSON.stringify(kind)}`);
    }
    const pathSegments = parsePathSegments(row.path);
    validateSlashTitlePath("entity", id, title, pathSegments);

    const parent = firstParentRef(row.parent_id);
    if (parent) {
      stats.parentRefs += 1;
      if (parent.entityId === id) errors.push(`entity ${id}: parent points to itself`);
      if (!entitiesById.has(parent.entityId)) {
        errors.push(`entity ${id}: parent ${parent.entityId} is missing from entities database`);
      }
    }

    validateBodyPath("entity", id, row.body_path);
    if ((kind === "page" || kind === "row") && stringValue(row.body_path)) {
      const pageRow = pagesById.get(id);
      if (!pageRow) {
        errors.push(`entity ${id}: ${kind} has a body_path but no matching pages row`);
      } else if (normalizePath(pageRow.body_path) !== normalizePath(row.body_path)) {
        errors.push(`entity ${id}: body_path differs between entities and pages databases`);
      }
    }
  }
}

function validateSlashTitlePath(kind, id, title, pathSegments) {
  if (!title.includes("/")) return;
  if (pathSegments.length === 0) return;
  stats.slashTitlePaths += 1;
  if (pathSegments.at(-1) !== title) {
    stats.slashTitlePathMismatches += 1;
    const message = `${kind} ${id}: title contains "/" but path last segment is ${JSON.stringify(pathSegments.at(-1))}`;
    if (strictSlashTitle) errors.push(message);
    else warnings.push(message);
  }
}

function validateBodyPath(kind, id, value) {
  const bodyPath = normalizePath(value);
  if (!bodyPath) return;
  stats.bodyPaths += 1;
  if (!bodyPath.startsWith("databases/")) {
    errors.push(`${kind} ${id}: body_path must be workspace-relative under databases/`);
    return;
  }
  const absolute = join(workspaceRoot, bodyPath);
  if (!existsSync(absolute)) {
    errors.push(`${kind} ${id}: body_path does not exist: ${bodyPath}`);
  }
}

function firstParentRef(value) {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const first = Array.isArray(parsed) ? parsed[0] : null;
    const entityId = stringValue(first?.entityId);
    const kind = stringValue(first?.kind);
    if (!entityId) return null;
    if (!["page", "database", "row"].includes(kind)) {
      errors.push(`invalid parent ref kind for ${entityId}: ${JSON.stringify(kind)}`);
      return null;
    }
    return { entityId, kind };
  } catch {
    errors.push(`parent ref is not JSON: ${raw.slice(0, 120)}`);
    return null;
  }
}

function parsePathSegments(value) {
  const raw = stringValue(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((segment) => stringValue(segment)).filter(Boolean);
    }
  } catch {
    // Legacy display strings are accepted, but splitting only on spaced
    // separators keeps titles like 2023/11/05 intact.
  }
  return raw.split(/\s+\/\s+/).map((segment) => segment.trim()).filter(Boolean);
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
  row.push(cell);
  rows.push(row);
  return rows;
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function stringValue(value) {
  return String(value ?? "").trim();
}

function normalizePath(value) {
  return stringValue(value).replace(/^\.\//, "").split("\\").join("/");
}

function workspaceRelative(path) {
  return normalizePath(path.replace(workspaceRoot, "").replace(/^[/\\]/, ""));
}
