#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { parse } from "node-html-parser";

const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const workspaceArg = args.find((arg) => !arg.startsWith("--"));
if (!workspaceArg) {
  console.error("Usage: node scripts/repair-imported-row-icons.mjs <workspace> [--apply]");
  process.exit(2);
}

const workspace = resolve(workspaceArg);
const databaseRoot = join(workspace, "databases", "user");
const originalRoot = join(workspace, "attachments", "original");
const reportsRoot = join(workspace, "reports");
const manifestPath = await latestManifest(reportsRoot);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

const rowsByNotionHash = new Map();
for (const row of manifest.rows ?? []) {
  const hash = String(row.notionId ?? "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hash) || !row.databaseId || !row.rowId) continue;
  rowsByNotionHash.set(hash, row);
}

const databaseFoldersById = new Map();
for (const entry of await readdir(databaseRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const schema = JSON.parse(await readFile(join(databaseRoot, entry.name, "schema.json"), "utf8"));
    if (schema.id) databaseFoldersById.set(schema.id, entry.name);
  } catch {
    // Ignore incomplete non-database folders.
  }
}

const iconHtmlPaths = await htmlFilesWithPageIcons(originalRoot);
const iconByRowId = new Map();
const localIconCache = new Map();
for (const htmlPath of iconHtmlPaths) {
  const hash = notionHashFromPagePath(htmlPath);
  const row = hash ? rowsByNotionHash.get(hash) : undefined;
  if (!row || iconByRowId.has(row.rowId)) continue;
  const raw = await readFile(htmlPath, "utf8");
  const root = parse(raw, { lowerCaseTagName: true });
  const header = root.querySelector("header");
  const iconSrc = header?.querySelector(".page-header-icon img.icon")?.getAttribute("src")?.trim() ?? "";
  const iconEmoji = header?.querySelector(".page-header-icon span.icon")?.text.trim() ?? "";
  const icon = iconEmoji
    ? { value: `emoji:${iconEmoji}`, source: htmlPath }
    : await resolveImageIcon(iconSrc, htmlPath, localIconCache);
  if (!icon) continue;
  iconByRowId.set(row.rowId, { ...icon, row });
}

const databaseChanges = [];
const pendingByDatabase = new Map();
for (const icon of iconByRowId.values()) {
  const list = pendingByDatabase.get(icon.row.databaseId) ?? [];
  list.push(icon);
  pendingByDatabase.set(icon.row.databaseId, list);
}

for (const [databaseId, pending] of pendingByDatabase) {
  const folder = databaseFoldersById.get(databaseId);
  if (!folder) continue;
  const dataPath = join(databaseRoot, folder, "data.csv");
  const raw = await readFile(dataPath, "utf8");
  const grid = parseCsv(raw);
  const headers = grid[0] ?? [];
  const idIndex = headers.indexOf("id");
  const iconIndex = headers.indexOf("row_icon");
  if (idIndex < 0 || iconIndex < 0) continue;
  const rowById = new Map(grid.slice(1).map((cells) => [cells[idIndex] ?? "", cells]));
  const changes = [];
  for (const candidate of pending) {
    const cells = rowById.get(candidate.row.rowId);
    if (!cells || (cells[iconIndex] ?? "").trim()) continue;
    changes.push({ ...candidate, cells });
  }
  if (changes.length === 0) continue;
  databaseChanges.push({ databaseId, folder, dataPath, raw, grid, iconIndex, changes });
}

const rowChanges = databaseChanges.flatMap((database) => database.changes.map((change) => ({
  databaseId: database.databaseId,
  database: change.row.database,
  rowId: change.row.rowId,
  notionId: change.row.notionId,
  title: change.row.title,
  icon: change.value,
  iconSource: change.source,
  attachmentSource: change.attachmentSource,
  attachmentTarget: change.attachmentTarget
})));
const summary = {
  mode: apply ? "apply" : "dry-run",
  workspace,
  manifestPath,
  generatedAt: new Date().toISOString(),
  manifestRows: rowsByNotionHash.size,
  iconHtmlFiles: iconHtmlPaths.length,
  recoverableRowIcons: rowChanges.length,
  affectedDatabases: databaseChanges.length,
  remoteIcons: rowChanges.filter((change) => /^https?:\/\//i.test(change.icon)).length,
  emojiIcons: rowChanges.filter((change) => change.icon.startsWith("emoji:")).length,
  localIcons: rowChanges.filter((change) => change.attachmentSource).length
};
summary.databases = databaseChanges
  .map((database) => ({
    id: database.databaseId,
    name: database.changes[0]?.row.database ?? database.folder,
    recoverableRowIcons: database.changes.length
  }))
  .sort((a, b) => b.recoverableRowIcons - a.recoverableRowIcons);

if (!apply) {
  console.log(JSON.stringify({ summary, sample: rowChanges.slice(0, 20) }, null, 2));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const repairRoot = join(reportsRoot, `row-icon-repair-${stamp}`);
const backupRoot = join(repairRoot, "backups");
await mkdir(backupRoot, { recursive: true });

const uniqueAttachments = new Map();
for (const change of rowChanges) {
  if (change.attachmentSource && change.attachmentTarget) {
    uniqueAttachments.set(change.attachmentTarget, change.attachmentSource);
  }
}
for (const [attachmentTarget, attachmentSource] of uniqueAttachments) {
  const absoluteTarget = join(workspace, attachmentTarget);
  await mkdir(dirname(absoluteTarget), { recursive: true });
  try {
    await stat(absoluteTarget);
  } catch {
    const temporaryTarget = `${absoluteTarget}.repair-${process.pid}.tmp`;
    await writeFile(temporaryTarget, await readFile(attachmentSource));
    await rename(temporaryTarget, absoluteTarget);
  }
}

const appliedIcons = new Map();
for (const database of databaseChanges) {
  const backupPath = join(backupRoot, "databases", database.folder, "data.csv.gz");
  await writeCompressedBackup(backupPath, database.raw);
  const beforeDigest = csvDigestExcludingColumn(database.grid, database.iconIndex);
  const beforeRows = database.grid.length;
  for (const change of database.changes) {
    change.cells[database.iconIndex] = change.value;
    appliedIcons.set(change.row.rowId, change.value);
  }
  const nextRaw = serializeCsv(database.grid);
  const verifyGrid = parseCsv(nextRaw);
  if (verifyGrid.length !== beforeRows || csvDigestExcludingColumn(verifyGrid, database.iconIndex) !== beforeDigest) {
    throw new Error(`Row icon repair changed non-icon data: ${database.dataPath}`);
  }
  await atomicWrite(database.dataPath, nextRaw);
}

const systemUpdates = {};
for (const [label, dataPath] of [
  ["pages", join(workspace, "databases", "system", "pages--db_pages", "data.csv")],
  ["entities", join(workspace, "databases", "system", "entities--db_entities", "data.csv")]
]) {
  const raw = await readFile(dataPath, "utf8");
  const grid = parseCsv(raw);
  const headers = grid[0] ?? [];
  const idIndex = headers.indexOf("id");
  const iconIndex = headers.indexOf("icon");
  if (idIndex < 0 || iconIndex < 0) throw new Error(`Missing id/icon columns: ${dataPath}`);
  const beforeDigest = csvDigestExcludingColumn(grid, iconIndex);
  const beforeRows = grid.length;
  let updated = 0;
  for (const cells of grid.slice(1)) {
    const icon = appliedIcons.get(cells[idIndex] ?? "");
    if (!icon || (cells[iconIndex] ?? "").trim()) continue;
    cells[iconIndex] = icon;
    updated += 1;
  }
  const backupPath = join(backupRoot, "system", `${label}.csv.gz`);
  await writeCompressedBackup(backupPath, raw);
  const nextRaw = serializeCsv(grid);
  const verifyGrid = parseCsv(nextRaw);
  if (verifyGrid.length !== beforeRows || csvDigestExcludingColumn(verifyGrid, iconIndex) !== beforeDigest) {
    throw new Error(`Row icon repair changed non-icon system data: ${dataPath}`);
  }
  await atomicWrite(dataPath, nextRaw);
  systemUpdates[label] = updated;
}

const missingAttachments = rowChanges.filter((change) =>
  change.attachmentTarget && !existsSync(join(workspace, change.attachmentTarget))
);
if (missingAttachments.length > 0) {
  throw new Error(`Missing ${missingAttachments.length} repaired row icon attachments`);
}

const reportPath = join(repairRoot, "report.json");
await writeFile(reportPath, `${JSON.stringify({ summary, systemUpdates, rowChanges }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ summary, systemUpdates, repairRoot, reportPath }, null, 2));

async function latestManifest(root) {
  const candidates = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "manifest.json");
    try {
      candidates.push({ path, mtimeMs: (await stat(path)).mtimeMs });
    } catch {
      // Not every report folder is an import report.
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates[0]) throw new Error(`No import manifest found under ${root}`);
  return candidates[0].path;
}

async function htmlFilesWithPageIcons(root) {
  const { stdout } = await execFileAsync(
    "rg",
    ["--files-with-matches", "--null", String.raw`data-notion-page-icon=|<div class=["']page-header-icon`, "--glob", "*.html", root],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return stdout.split("\0").filter(Boolean).sort();
}

function notionHashFromPagePath(path) {
  return /([0-9a-f]{32})$/i.exec(basename(path, extname(path)))?.[1].toLowerCase();
}

async function resolveImageIcon(iconSrc, htmlPath, cache) {
  if (!iconSrc) return null;
  if (/^https?:\/\//i.test(iconSrc)) return { value: iconSrc, source: htmlPath };
  if (/^[a-z][a-z0-9+.-]*:/i.test(iconSrc)) return null;
  const decoded = decodeHref(iconSrc);
  if (!decoded) return null;
  const sourcePath = resolve(dirname(htmlPath), decoded);
  if (cache.has(sourcePath)) return { ...cache.get(sourcePath), source: htmlPath };
  let content;
  try {
    content = await readFile(sourcePath);
  } catch {
    return null;
  }
  const extension = extname(sourcePath).toLowerCase();
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 24);
  const fileName = `${hash}-${safeAttachmentStem(sourcePath)}${extension}`;
  const attachmentTarget = join("attachments", "images", fileName).split("\\").join("/");
  const resolved = { value: attachmentTarget, attachmentSource: sourcePath, attachmentTarget };
  cache.set(sourcePath, resolved);
  return { ...resolved, source: htmlPath };
}

function decodeHref(href) {
  try {
    return decodeURIComponent(href);
  } catch {
    return "";
  }
}

function safeAttachmentStem(path) {
  const base = basename(path);
  const extension = extname(base);
  return (extension ? base.slice(0, -extension.length) : base)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "attachment";
}

function parseCsv(content) {
  if (!content) return [];
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
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvDigestExcludingColumn(grid, excludedIndex) {
  const hash = createHash("sha256");
  for (const row of grid) {
    hash.update(JSON.stringify(row.filter((_, index) => index !== excludedIndex)));
    hash.update("\n");
  }
  return hash.digest("hex");
}

async function writeCompressedBackup(path, raw) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, await gzipAsync(Buffer.from(raw), { level: 9 }));
}

async function atomicWrite(path, raw) {
  const temporary = `${path}.repair-${process.pid}.tmp`;
  await writeFile(temporary, raw, "utf8");
  await rename(temporary, path);
}
