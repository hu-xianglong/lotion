#!/usr/bin/env node
import MarkdownIt from "markdown-it";
import { existsSync, readdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Workspace link legality rules:
 *
 * 1. External URLs are syntax-checked only. We do not fetch the network.
 *    Allowed persisted schemes are http:, https:, mailto:, and tel:.
 * 2. Workspace-relative file links must stay inside the workspace and
 *    must point at an existing file or database directory.
 * 3. Attachment links must point at an existing file under one of the
 *    managed category directories:
 *      attachments/<category>/...
 *      attachments/icons/... and attachments/covers/... for UI-chosen images
 *    Known file extensions must live in the category chosen by
 *    src/shared/attachments.ts; unknown extensions belong to misc.
 * 4. Page links must point at an existing Markdown page under a database:
 *    `databases/<user|system>/<database-folder>/pages/<title>--<id>.md`.
 *    Default page-database links must resolve to a page id known by
 *    lotion.json or the system pages database.
 *    Row-page links must resolve to a known database id.
 * 5. Database links must point at an existing database directory and a
 *    known database id from lotion.json.
 * 6. In-page anchors (#heading) are accepted when non-empty. They are
 *    intentionally not resolved because imported Notion anchors are not
 *    always represented as Markdown headings.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const defaultWorkspace = join(repoRoot, "samples", "demo-space");
const workspaceRoot = resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith("-")) ?? defaultWorkspace);
const ATTACHMENT_CATEGORIES = new Set(["images", "documents", "audio", "video", "archives", "web", "data", "misc"]);
const FALLBACK_EXTENSIONS_BY_CATEGORY = {
  images: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".heic", ".heif", ".tif", ".tiff"],
  documents: [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".md", ".rtf", ".pages", ".key", ".numbers"],
  audio: [".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus", ".aiff"],
  video: [".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"],
  archives: [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz"],
  web: [".html", ".htm", ".css", ".js", ".mjs"],
  data: [".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml"]
};
const errors = [];
const stats = {
  pages: 0,
  markdownLinks: 0,
  bareUrls: 0,
  iframeUrls: 0,
  urlFields: 0,
  attachmentLinks: 0,
  pageLinks: 0,
  databaseLinks: 0,
  fileLinks: 0
};

let attachmentCategoryForFilename = fallbackAttachmentCategoryForFilename;
try {
  const shared = await import("../dist-electron/shared/attachments.js");
  if (typeof shared.attachmentCategoryForFilename === "function") {
    attachmentCategoryForFilename = shared.attachmentCategoryForFilename;
  }
} catch {
  // Standalone runs before `tsc` can still validate with the fallback
  // table below. The test script compiles first, so normal CI uses the
  // production helper.
}

const md = new MarkdownIt({ html: false, linkify: false });
const manifestPath = join(workspaceRoot, "lotion.json");
assert(existsSync(manifestPath), `workspace has lotion.json: ${manifestPath}`);

let manifest = null;
if (existsSync(manifestPath)) {
  manifest = await readJson(manifestPath);
}

const systemDatabaseIds = new Set(manifest?.systemDatabases ?? []);
const userDatabaseIds = new Set(manifest?.databases ?? []);
const databaseIds = new Set([...userDatabaseIds, ...systemDatabaseIds]);
const viewsByDatabase = await readViewsByDatabase(databaseIds, systemDatabaseIds);
const pageRecords = await readPageRecords();
const knownPagePaths = new Set([...pageRecords.values()].map((record) => record.body_path).filter(Boolean));
const registeredPagePaths = await readRegisteredPagePaths(databaseIds, systemDatabaseIds);
const markdownFiles = await listFiles(join(workspaceRoot, "databases"), (path) => path.endsWith(".md"));

for (const filePath of markdownFiles) {
  stats.pages += 1;
  const relPath = workspaceRelative(filePath);
  const markdown = await readFile(filePath, "utf8");
  for (const ref of findMarkdownTargets(markdown, relPath)) {
    stats.markdownLinks += 1;
    validateTarget(ref);
  }
  for (const ref of findBareUrls(markdown, relPath)) {
    stats.bareUrls += 1;
    validateExternalUrl(ref);
  }
  for (const ref of findFencedConfigs(markdown, "lotion-iframe", relPath)) {
    const url = ref.config.url;
    if (!url) {
      report(ref, "lotion-iframe block is missing url");
    } else {
      stats.iframeUrls += 1;
      validateExternalUrl({ ...ref, target: url, kind: "iframe-url" });
    }
  }
  for (const ref of findFencedConfigs(markdown, "lotion-view", relPath)) {
    validateEmbeddedView(ref);
  }
}

await validateDatabaseUrlFields(databaseIds, systemDatabaseIds);
validatePageRecordAssets(pageRecords);

if (errors.length > 0) {
  console.error(`Workspace link validation failed for ${workspaceRoot}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  [
    `Workspace link validation passed for ${workspaceRoot}:`,
    `${stats.pages} pages`,
    `${stats.markdownLinks} markdown link/image targets`,
    `${stats.bareUrls} bare URLs`,
    `${stats.iframeUrls} iframe URLs`,
    `${stats.urlFields} URL fields`,
    `${stats.attachmentLinks} attachments`,
    `${stats.pageLinks} page links`,
    `${stats.databaseLinks} database links`,
    `${stats.fileLinks} other file links`
  ].join(" ")
);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
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

async function readPageRecords() {
  const dataPath = join(databaseDir("pages", systemDatabaseIds), "data.csv");
  if (!existsSync(dataPath)) return new Map();
  const rows = parseCsv(await readFile(dataPath, "utf8"));
  const headers = rows[0] ?? [];
  const records = new Map();
  for (const row of rows.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
    if (!record.id) continue;
    record.body_path = normalizeStoredWorkspacePath(record.body_path || record.path || "");
    records.set(record.id, record);
  }
  return records;
}

async function readViewsByDatabase(ids, systemIds) {
  const result = new Map();
  for (const id of ids) {
    const dir = databaseDir(id, systemIds);
    const viewsDir = join(dir, "views");
    const views = new Set();
    if (existsSync(viewsDir)) {
      for (const file of await readdir(viewsDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const view = await readJson(join(viewsDir, file));
          if (view.id) views.add(view.id);
        } catch {
          errors.push(`${workspaceRelative(join(viewsDir, file))}: view JSON is not readable`);
        }
      }
    }
    result.set(id, views);
  }
  return result;
}

async function readRegisteredPagePaths(ids, systemIds) {
  const result = new Set();
  for (const id of ids) {
    const dir = databaseDir(id, systemIds);
    const dataPath = join(dir, "data.csv");
    if (!existsSync(dataPath)) continue;
    const rows = parseCsv(await readFile(dataPath, "utf8"));
    const headers = rows[0] ?? [];
    const pageFileIndex = headers.indexOf("page_file");
    if (pageFileIndex === -1) continue;
    for (const row of rows.slice(1)) {
      const fileName = row[pageFileIndex] ?? "";
      if (fileName) result.add(workspaceRelative(join(dir, "pages", fileName)));
    }
  }
  return result;
}

function findMarkdownTargets(markdown, source) {
  const refs = [];
  const tokens = md.parse(markdown, {});
  walkTokens(tokens, 1);
  return refs;

  function walkTokens(items, inheritedLine) {
    for (const token of items) {
      const line = token.map ? token.map[0] + 1 : inheritedLine;
      if (token.type === "link_open") {
        const href = token.attrGet("href");
        if (href) refs.push({ source, line, target: href, kind: "markdown-link" });
      } else if (token.type === "image") {
        const src = token.attrGet("src");
        if (src) refs.push({ source, line, target: src, kind: "markdown-image" });
      }
      if (token.children) walkTokens(token.children, line);
    }
  }
}

function findBareUrls(markdown, source) {
  const refs = [];
  const stripped = stripFencedBlocks(markdown)
    .replace(/!?\[[^\]\n]*]\([^)\n]*\)/g, "")
    .replace(/`[^`\n]+`/g, "");
  const regex = /\b(?:https?:\/\/|mailto:|tel:)[^\s<>"'`]+/g;
  const lines = stripped.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    let match;
    while ((match = regex.exec(lines[index]))) {
      const target = trimBareUrl(match[0]);
      if (target) refs.push({ source, line: index + 1, target, kind: "bare-url" });
    }
  }
  return refs;
}

function stripFencedBlocks(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, (block) =>
    block.split("\n").map(() => "").join("\n")
  );
}

function trimBareUrl(value) {
  return value.replace(/[)\],.;:!?]+$/g, "");
}

function findFencedConfigs(markdown, fenceName, source) {
  const refs = [];
  const regex = new RegExp("```" + escapeRegExp(fenceName) + "\\n([\\s\\S]*?)```", "g");
  let match;
  while ((match = regex.exec(markdown))) {
    const line = markdown.slice(0, match.index).split("\n").length;
    refs.push({ source, line, target: fenceName, kind: fenceName, config: parseConfig(match[1]) });
  }
  return refs;
}

function parseConfig(body) {
  const config = {};
  for (const line of body.split("\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    config[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return config;
}

function validateEmbeddedView(ref) {
  const databaseId = ref.config.database;
  if (!databaseId) {
    report(ref, "lotion-view block is missing database");
    return;
  }
  if (!databaseIds.has(databaseId)) {
    report(ref, `lotion-view references unknown database ${databaseId}`);
    return;
  }
  const viewId = ref.config.view || "view_default";
  if (!viewsByDatabase.get(databaseId)?.has(viewId)) {
    report(ref, `lotion-view references unknown view ${databaseId}/${viewId}`);
  }
}

function validateTarget(ref) {
  const target = cleanTarget(ref.target);
  if (!target) {
    report(ref, "empty link target");
    return;
  }
  if (target.startsWith("#")) {
    if (target.length === 1) report(ref, "empty in-page anchor");
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    if (target.startsWith("lotion-file:")) {
      validateLotionFileUrl({ ...ref, target });
    } else {
      validateExternalUrl({ ...ref, target });
    }
    return;
  }
  const resolved = workspacePathForTarget(target, ref);
  if (!resolved) return;
  validateWorkspaceTarget(ref, resolved);
}

function validateExternalUrl(ref) {
  const target = cleanTarget(ref.target);
  try {
    const url = new URL(target);
    if (!["http:", "https:", "mailto:", "tel:", "notion:"].includes(url.protocol)) {
      report(ref, `unsupported URL scheme ${url.protocol}`);
      return;
    }
    if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname) {
      report(ref, "URL is missing a host");
    }
    if ((url.protocol === "mailto:" || url.protocol === "tel:") && !url.pathname) {
      report(ref, `${url.protocol} URL is missing a target`);
    }
  } catch {
    report(ref, `invalid URL: ${target}`);
  }
}

function validateLotionFileUrl(ref) {
  try {
    const url = new URL(ref.target);
    const hostPart = url.host ? decodeURIComponent(url.host) : "";
    const pathPart = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const rel = hostPart ? `${hostPart}/${pathPart}` : pathPart;
    const resolved = workspacePathForTarget(rel, ref);
    if (resolved) validateWorkspaceTarget(ref, resolved);
  } catch {
    report(ref, `invalid lotion-file URL: ${ref.target}`);
  }
}

function validateWorkspaceTarget(ref, resolved) {
  const { relPath, absPath } = resolved;
  if (relPath.startsWith("attachments/")) {
    stats.attachmentLinks += 1;
    validateAttachmentPath(ref, relPath, absPath);
    return;
  }
  if (/^databases\/(?:user|system)\/[^/]+\/(?:pages|templates\/pages)\/[^/]+\.md$/i.test(relPath)) {
    stats.pageLinks += 1;
    validatePagePath(ref, relPath, absPath);
    return;
  }
  if (/^databases\/(?:user|system)\/[^/]+\/?$/i.test(relPath)) {
    stats.databaseLinks += 1;
    validateDatabaseLink(ref, relPath, absPath);
    return;
  }
  if (!existsSync(absPath)) {
    report(ref, `workspace file does not exist: ${relPath}`);
    return;
  }
  stats.fileLinks += 1;
}

function validateAttachmentPath(ref, relPath, absPath) {
  if (!existsSync(absPath)) {
    report(ref, `attachment does not exist: ${relPath}`);
    return;
  }
  const parts = relPath.split("/");
  const category = parts[1];
  if (!category) {
    report(ref, `attachment is missing a category directory: ${relPath}`);
    return;
  }
  if (category === "icons" || category === "covers") return;
  if (!ATTACHMENT_CATEGORIES.has(category)) {
    report(ref, `attachment category is not recognized: ${relPath}`);
    return;
  }
  const expected = attachmentCategoryForFilename(parts.at(-1) ?? "");
  if (expected !== "misc" && category !== expected) {
    report(ref, `attachment extension belongs in ${expected}, not ${category}: ${relPath}`);
  }
}

function validatePagePath(ref, relPath, absPath) {
  if (!existsSync(absPath)) {
    if (registeredPagePaths.has(relPath)) return;
    report(ref, `page link target does not exist: ${relPath}`);
    return;
  }
  const pageMatch = relPath.match(/^databases\/(user|system)\/([^/]+)\/(?:pages|templates\/pages)\/([^/]+\.md)$/);
  if (!pageMatch) {
    report(ref, `page link target is malformed: ${relPath}`);
    return;
  }
  const [, scope, databaseFolder, fileName] = pageMatch;
  const databaseId = idFromDatabaseFolderName(databaseFolder, scope === "system");
  if (!databaseIdCandidates(databaseId).some((id) => databaseIds.has(id))) {
    report(ref, `page link target uses unknown database id: ${relPath}`);
    return;
  }
  const isDefaultPagesDatabase = scope === "system" && databaseId === "pages";
  if (isDefaultPagesDatabase && !knownPagePaths.has(relPath) && !(manifest?.pages ?? []).includes(idFromMarkdownFileName(fileName))) {
    report(ref, `top-level page link target is not registered: ${relPath}`);
  }
}

function validateDatabaseLink(ref, relPath, absPath) {
  if (!existsSync(absPath)) {
    report(ref, `database link target does not exist: ${relPath}`);
    return;
  }
  const id = databaseIdFromRelPath(relPath);
  if (!id) {
    report(ref, `database link target is malformed: ${relPath}`);
    return;
  }
  if (!databaseIdCandidates(id).some((candidate) => databaseIds.has(candidate))) {
    report(ref, `database link target is not in lotion.json: ${relPath}`);
  }
}

function databaseIdCandidates(id) {
  return id.startsWith("db_") ? [id] : [id, `db_${id}`];
}

async function validateDatabaseUrlFields(ids, systemIds) {
  for (const id of ids) {
    const dir = databaseDir(id, systemIds);
    const schemaPath = join(dir, "schema.json");
    const dataPath = join(dir, "data.csv");
    if (!existsSync(schemaPath) || !existsSync(dataPath)) continue;
    const schema = await readJson(schemaPath);
    const urlFields = (schema.fields ?? []).filter((field) => field.type === "url");
    if (urlFields.length === 0) continue;
    const rows = parseCsv(await readFile(dataPath, "utf8"));
    const headers = rows[0] ?? [];
    for (const row of rows.slice(1)) {
      const rowId = row[headers.indexOf("id")] || "?";
      for (const field of urlFields) {
        const value = (row[headers.indexOf(field.id)] ?? "").trim();
        if (!value) continue;
        stats.urlFields += 1;
        validateExternalUrl({
          source: workspaceRelative(dataPath),
          line: `row ${rowId}`,
          target: value,
          kind: `url-field ${field.id}`
        });
      }
    }
  }
}

function validatePageRecordAssets(records) {
  for (const record of records.values()) {
    for (const field of ["icon", "cover"]) {
      const value = (record[field] ?? "").trim();
      if (!looksLikePersistedAsset(value)) continue;
      validateTarget({
        source: workspaceRelative(join(databaseDir("pages", systemDatabaseIds), "data.csv")),
        line: `row ${record.id}`,
        target: value,
        kind: `page-${field}`
      });
    }
  }
}

function looksLikePersistedAsset(value) {
  return /^(?:https?:|lotion-file:|attachments\/|\.?\/|databases\/)/i.test(value);
}

function workspacePathForTarget(target, ref) {
  const { pathPart } = splitRelativeTarget(target);
  const decoded = decodeTargetPath(pathPart, ref);
  if (decoded === null) return null;
  if (decoded.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(decoded)) {
    report(ref, `absolute workspace path is not allowed: ${target}`);
    return null;
  }
  if (decoded.includes("\\")) {
    report(ref, `workspace paths must use forward slashes: ${target}`);
    return null;
  }
  const withoutDot = decoded.replace(/^\.\//, "");
  const normalized = posixNormalize(withoutDot);
  if (!normalized || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    report(ref, `workspace path escapes the workspace: ${target}`);
    return null;
  }
  const absPath = resolve(workspaceRoot, normalized);
  if (absPath !== workspaceRoot && !absPath.startsWith(workspaceRoot + sep)) {
    report(ref, `workspace path escapes the workspace: ${target}`);
    return null;
  }
  return { relPath: normalized, absPath };
}

function splitRelativeTarget(target) {
  const hashIndex = target.indexOf("#");
  const queryIndex = target.indexOf("?");
  const indexes = [hashIndex, queryIndex].filter((index) => index >= 0);
  const end = indexes.length > 0 ? Math.min(...indexes) : target.length;
  return { pathPart: target.slice(0, end) };
}

function decodeTargetPath(path, ref) {
  try {
    return decodeURIComponent(path);
  } catch {
    report(ref, `workspace path has malformed percent encoding: ${path}`);
    return null;
  }
}

function cleanTarget(target) {
  return String(target ?? "").trim().replace(/^<|>$/g, "");
}

function normalizeStoredWorkspacePath(path) {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function workspaceRelative(path) {
  return relative(workspaceRoot, path).split(sep).join("/");
}

function databaseDir(id, systemIds) {
  const base = systemIds.has(id)
    ? join(workspaceRoot, "databases", "system")
    : join(workspaceRoot, "databases", "user");
  const stableId = databaseStableFolderId(id);
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === stableId || entry.name.endsWith(`--${stableId}`)) {
        return join(base, entry.name);
      }
    }
  }
  return join(base, databaseFolderName(id, defaultDatabaseName(id)));
}

function databaseIdFromRelPath(relPath) {
  const match = relPath.match(/^databases\/(user|system)\/([^/]+)\/?$/);
  if (!match) return null;
  return idFromDatabaseFolderName(match[2], match[1] === "system");
}

function databaseStableFolderId(id) {
  return id.startsWith("db_") ? id : `db_${id}`;
}

function databaseFolderName(id, title = "") {
  const stableId = databaseStableFolderId(id);
  const slug = title ? slugifyTitle(title, 72) : "";
  return slug && slug !== stableId ? `${slug}--${stableId}` : stableId;
}

function idFromDatabaseFolderName(folderName, system = false) {
  const separatorIndex = folderName.lastIndexOf("--");
  const stableId = separatorIndex >= 0 ? folderName.slice(separatorIndex + 2) : folderName;
  return system && stableId.startsWith("db_") ? stableId.slice("db_".length) : stableId;
}

function defaultDatabaseName(id) {
  if (id === "pages") return "pages";
  if (id === "workspaces") return "workspaces";
  if (id === "database_stats") return "database_stats";
  return "";
}

function idFromMarkdownFileName(fileName) {
  const stem = fileName.replace(/\.md$/i, "");
  const separatorIndex = stem.lastIndexOf("--");
  return separatorIndex >= 0 ? stem.slice(separatorIndex + 2) : stem;
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

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function report(ref, message) {
  errors.push(`${ref.source}:${ref.line}: ${message} (${ref.kind}: ${ref.target})`);
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

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function posixNormalize(path) {
  const segments = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return "../";
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fallbackAttachmentCategoryForFilename(name) {
  const ext = extname(name).toLowerCase();
  for (const [category, extensions] of Object.entries(FALLBACK_EXTENSIONS_BY_CATEGORY)) {
    if (extensions.includes(ext)) return category;
  }
  return "misc";
}
