#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const workspaceArg = args.find((arg) => !arg.startsWith("--"));
if (!workspaceArg) {
  console.error("Usage: node scripts/repair-imported-parent-links.mjs <workspace> [--apply]");
  process.exit(2);
}

const workspace = resolve(workspaceArg);
const pagesPath = join(workspace, "databases", "system", "pages--db_pages", "data.csv");
const entitiesPath = join(workspace, "databases", "system", "entities--db_entities", "data.csv");
const pagesRaw = await readFile(pagesPath, "utf8");
const entitiesRaw = await readFile(entitiesPath, "utf8");
const pagesGrid = parseCsv(pagesRaw);
const entitiesGrid = parseCsv(entitiesRaw);
const pages = recordsFromGrid(pagesGrid, pagesPath);
const entities = recordsFromGrid(entitiesGrid, entitiesPath);
const entityById = new Map(entities.map((entity) => [entity.id, entity]));

const sourceAliasToIds = new Map();
for (const page of pages) {
  const alias = childFolderAlias(page.notion_original_html);
  if (!alias) continue;
  const ids = sourceAliasToIds.get(alias) ?? [];
  ids.push(page.id);
  sourceAliasToIds.set(alias, ids);
}

const directParentByPageId = new Map();
const ambiguous = [];
for (const page of pages) {
  if (page.database_id !== "pages" || !page.notion_original_html) continue;
  const parentSourceFolder = normalizeStoredPath(posix.dirname(page.notion_original_html));
  const candidateIds = (sourceAliasToIds.get(parentSourceFolder) ?? []).filter((id) => id !== page.id);
  const candidates = candidateIds
    .map((id) => entityById.get(id))
    .filter((entity) => entity?.kind === "page" || entity?.kind === "row");
  if (candidates.length === 1) directParentByPageId.set(page.id, candidates[0]);
  else if (candidates.length > 1) {
    ambiguous.push({ pageId: page.id, title: page.title, source: page.notion_original_html, candidateIds });
  }
}

const desiredPathCache = new Map();
function desiredPathForPage(pageId, seen = new Set()) {
  const cached = desiredPathCache.get(pageId);
  if (cached) return cached;
  const entity = entityById.get(pageId);
  if (!entity || seen.has(pageId)) return parseJsonArray(entity?.path);
  const parent = directParentByPageId.get(pageId);
  if (!parent) return parseJsonArray(entity.path);
  const nextSeen = new Set(seen).add(pageId);
  const parentPath = parent.kind === "page"
    ? desiredPathForPage(parent.id, nextSeen)
    : parseJsonArray(parent.path);
  const desired = parentPath.length > 0 ? [...parentPath, entity.title || "Untitled"] : parseJsonArray(entity.path);
  desiredPathCache.set(pageId, desired);
  return desired;
}

const changes = [];
for (const page of pages) {
  const parent = directParentByPageId.get(page.id);
  if (!parent) continue;
  const currentParent = parseEntityRef(page.parent_id);
  const desiredPath = desiredPathForPage(page.id);
  const currentPath = parseJsonArray(page.path);
  const parentChanged = currentParent?.entityId !== parent.id || currentParent?.kind !== parent.kind;
  const pathChanged = JSON.stringify(currentPath) !== JSON.stringify(desiredPath);
  if (!parentChanged && !pathChanged) continue;
  changes.push({
    pageId: page.id,
    title: page.title,
    source: page.notion_original_html,
    fromParent: currentParent,
    toParent: { entityId: parent.id, kind: parent.kind },
    fromPath: currentPath,
    toPath: desiredPath,
    parentChanged,
    pathChanged
  });
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  workspace,
  generatedAt: new Date().toISOString(),
  importedPageRecords: pages.length,
  entityRecords: entities.length,
  directParentCandidates: directParentByPageId.size,
  changes: changes.length,
  parentChanges: changes.filter((change) => change.parentChanged).length,
  pathChanges: changes.filter((change) => change.pathChanged).length,
  ambiguous: ambiguous.length
};

if (!apply) {
  console.log(JSON.stringify({ summary, sample: changes.slice(0, 30), ambiguous: ambiguous.slice(0, 20) }, null, 2));
  process.exit(0);
}

const pageChangeById = new Map(changes.map((change) => [change.pageId, change]));
const pagesUpdated = applyChanges(pagesGrid, pagesPath, pageChangeById);
const entitiesUpdated = applyChanges(entitiesGrid, entitiesPath, pageChangeById);
if (pagesUpdated !== changes.length || entitiesUpdated !== changes.length) {
  throw new Error(
    `Parent repair index mismatch: expected ${changes.length}, pages=${pagesUpdated}, entities=${entitiesUpdated}`
  );
}

const nextPagesRaw = serializeCsv(pagesGrid);
const nextEntitiesRaw = serializeCsv(entitiesGrid);
verifyOnlyTargetColumnsChanged(pagesRaw, nextPagesRaw, pagesPath);
verifyOnlyTargetColumnsChanged(entitiesRaw, nextEntitiesRaw, entitiesPath);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const repairRoot = join(workspace, "reports", `parent-link-repair-${stamp}`);
const backupRoot = join(repairRoot, "backups");
await mkdir(backupRoot, { recursive: true });
await writeCompressedBackup(join(backupRoot, "pages.csv.gz"), pagesRaw);
await writeCompressedBackup(join(backupRoot, "entities.csv.gz"), entitiesRaw);

const pendingReportPath = join(repairRoot, "report.pending.json");
await writeFile(
  pendingReportPath,
  `${JSON.stringify({ summary, changes, ambiguous, status: "pending" }, null, 2)}\n`,
  "utf8"
);
await atomicWrite(pagesPath, nextPagesRaw);
await atomicWrite(entitiesPath, nextEntitiesRaw);

const reportPath = join(repairRoot, "report.json");
await writeFile(
  reportPath,
  `${JSON.stringify({ summary, changes, ambiguous, status: "complete" }, null, 2)}\n`,
  "utf8"
);
await rename(pendingReportPath, join(repairRoot, "report.applied.json"));
console.log(JSON.stringify({ summary, pagesUpdated, entitiesUpdated, repairRoot, reportPath }, null, 2));

function applyChanges(grid, filePath, changesById) {
  const headers = grid[0] ?? [];
  const idIndex = headers.indexOf("id");
  const parentIndex = headers.indexOf("parent_id");
  const pathIndex = headers.indexOf("path");
  if (idIndex < 0 || parentIndex < 0 || pathIndex < 0) {
    throw new Error(`Missing id/parent_id/path columns: ${filePath}`);
  }
  let updated = 0;
  for (const cells of grid.slice(1)) {
    const change = changesById.get(cells[idIndex] ?? "");
    if (!change) continue;
    cells[parentIndex] = JSON.stringify([change.toParent]);
    cells[pathIndex] = JSON.stringify(change.toPath);
    updated += 1;
  }
  return updated;
}

function childFolderAlias(sourcePath) {
  const normalized = normalizeStoredPath(sourcePath);
  if (!normalized) return "";
  const extension = posix.extname(normalized);
  const stem = posix.basename(normalized, extension).replace(/\s[0-9a-f]{32}$/i, "");
  return normalizeStoredPath(posix.join(posix.dirname(normalized), stem));
}

function normalizeStoredPath(value) {
  return String(value ?? "").replaceAll("\\", "/");
}

function parseEntityRef(value) {
  const refs = parseJsonArray(value);
  const ref = refs[0];
  return ref && typeof ref === "object"
    ? { entityId: String(ref.entityId ?? ""), kind: String(ref.kind ?? "") }
    : undefined;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value ?? ""));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordsFromGrid(grid, filePath) {
  const headers = grid[0] ?? [];
  if (headers.length === 0) throw new Error(`Empty CSV: ${filePath}`);
  return grid.slice(1).filter((cells) => cells.some(Boolean)).map((cells) => {
    const record = {};
    for (let index = 0; index < headers.length; index += 1) record[headers[index]] = cells[index] ?? "";
    return record;
  });
}

function verifyOnlyTargetColumnsChanged(beforeRaw, afterRaw, filePath) {
  const before = parseCsv(beforeRaw);
  const after = parseCsv(afterRaw);
  if (before.length !== after.length) throw new Error(`Parent repair changed row count: ${filePath}`);
  const headers = before[0] ?? [];
  const ignored = new Set([headers.indexOf("parent_id"), headers.indexOf("path")]);
  const digest = (grid) => createHash("sha256").update(
    grid.map((cells) => cells.filter((_, index) => !ignored.has(index)).join("\u001f")).join("\u001e")
  ).digest("hex");
  if (digest(before) !== digest(after)) throw new Error(`Parent repair changed non-parent data: ${filePath}`);
}

async function writeCompressedBackup(path, raw) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await gzipAsync(Buffer.from(raw, "utf8")));
}

async function atomicWrite(path, content) {
  const temporary = `${path}.parent-repair-${process.pid}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, path);
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
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

function serializeCsv(grid) {
  return `${grid.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
