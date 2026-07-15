#!/usr/bin/env node
// Import a Notion Markdown export into a Lotion workspace.
//
// Notion export shape (one or more export-zip-unpacked directories):
//
//   <Title> <hash32>.md            page
//   <Title> <hash32>/              same page's subpages / databases
//   <Title> <hash32>.csv           database rows (canonical)
//   <Title> <hash32>_all.csv       same database, "all" view (skipped)
//   <Title> <hash32>/<row> <h>.md  per-row page bodies
//   *.png / *.jpg / *.pdf / …      attachments referenced by .md
//
// Notion splits big exports into Part-1 / Part-2 / Part-3 zips; this
// script accepts multiple `--source` flags and merges them.
//
// Output is a fresh Lotion workspace at `--target` (wiped first):
//
//   lotion.json
//   databases/system/pages--db_pages/pages/<title>--<id>.md
//   databases/user/<database-title>--db_<dbId>/pages/<title>--<row>.md
//   databases/user/<database-title>--db_<dbId>/schema.json
//   databases/user/<database-title>--db_<dbId>/data.csv
//   databases/user/<database-title>--db_<dbId>/views/view_default.json
//   attachments/<type>/<sha24>-<safe-original-name>.<ext>
//
// Run:
//
//   node scripts/import-notion.mjs \
//     --source "<Notion Export>/Export-… 1" \
//     --source "<Notion Export>/Export-… 2" \
//     --source "<Notion Export>/Export-… 3" \
//     --target "$HOME/Library/Application Support/lotion/notion-space"
//
// Scope today:
//   * Pages, databases, row pages, basic attachments.
//   * All non-title fields land as `text` for now (no select / date /
//     number inference yet).
//   * Cross-page links are rewritten when their Notion hash maps to
//     a known Lotion id; unknown links stay as-is.
//   * Subpages flatten — every page becomes top-level in Lotion since
//     we don't have hierarchy yet.

import { createHash, randomBytes } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, sep } from "node:path";

// ── CLI parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { source: [], target: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--source") {
      out.source.push(value);
      i += 1;
    } else if (flag === "--target") {
      out.target = value;
      i += 1;
    }
  }
  if (out.source.length === 0 || !out.target) {
    console.error("Usage: import-notion.mjs --source <dir> [--source <dir>…] --target <dir>");
    process.exit(1);
  }
  return out;
}

// ── helpers ───────────────────────────────────────────────────────────

const NOTION_HASH = /\s+([0-9a-f]{32})$/i;
const DEFAULT_VIEW_ID = "view_default";
const PAGES_DATABASE_ID = "pages";

function shortId(prefix) {
  let suffix = "";
  do {
    suffix = randomBytes(4).toString("hex");
  } while (suffix.startsWith(prefix));
  return `${prefix}_${suffix}`;
}

function stripHash(name) {
  // "Page Title 8a91b2…" → { title: "Page Title", hash: "8a91b2…" }
  // For files the extension has already been stripped.
  const match = NOTION_HASH.exec(name);
  if (!match) return { title: name, hash: null };
  return { title: name.slice(0, match.index), hash: match[1].toLowerCase() };
}

function safeAttachmentStem(sourcePath) {
  const rawBase = basename(sourcePath);
  let stem = rawBase.slice(0, rawBase.length - extname(rawBase).length);
  try {
    stem = decodeURIComponent(stem);
  } catch {
    // Keep the filesystem stem when it is not percent-encoded.
  }
  return slugifyFileName(stem, 48);
}

function attachmentCategory(fileName) {
  const ext = extname(fileName).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".heic", ".heif", ".tif", ".tiff"].includes(ext)) return "images";
  if ([".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".md", ".rtf"].includes(ext)) return "documents";
  if ([".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus", ".aiff"].includes(ext)) return "audio";
  if ([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"].includes(ext)) return "video";
  if ([".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz"].includes(ext)) return "archives";
  if ([".html", ".htm", ".css", ".js", ".mjs"].includes(ext)) return "web";
  if ([".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml"].includes(ext)) return "data";
  return "misc";
}

function notionAttachmentPath(fileName) {
  return `attachments/${attachmentCategory(fileName)}/${fileName}`;
}

function pageFileName(id, title = "") {
  const slug = title ? slugifyFileName(title, 72) : "";
  return slug && slug !== id ? `${slug}--${id}.md` : `${id}.md`;
}

function defaultPageBodyPath(id, title = "") {
  return `${databaseWorkspacePath(PAGES_DATABASE_ID, true, "pages")}/pages/${pageFileName(id, title)}`;
}

function databaseStableFolderId(id) {
  return id.startsWith("db_") ? id : `db_${id}`;
}

function databaseFolderName(id, title = "") {
  const stableId = databaseStableFolderId(id);
  const slug = title ? slugifyFileName(title, 72) : "";
  return slug && slug !== stableId ? `${slug}--${stableId}` : stableId;
}

function databaseWorkspacePath(id, system = false, title = "") {
  return `databases/${system ? "system" : "user"}/${databaseFolderName(id, title)}`;
}

function createPagesFields() {
  return [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "kind", name: "Kind", type: "text", system: true },
    { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
    { id: "icon", name: "Icon", type: "text" },
    { id: "cover", name: "Cover", type: "text" },
    { id: "cover_offset", name: "Cover offset", type: "number" },
    { id: "tags", name: "Tags", type: "text" },
    { id: "date", name: "Date", type: "text" },
    { id: "url", name: "URL", type: "url" },
    { id: "full_width", name: "Full width", type: "checkbox" },
    { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
    { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
    { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
  ];
}

function slugifyFileName(value, maxLength = 24) {
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

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === "\"" && inQuotes && next === "\"") { cell += "\""; i += 1; }
    else if (ch === "\"") inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { row.push(cell); cell = ""; }
    else if (ch === "\n" && !inQuotes) { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  // Strip BOM if present on first cell of first row.
  if (rows[0] && rows[0][0] && rows[0][0].charCodeAt(0) === 0xFEFF) {
    rows[0][0] = rows[0][0].slice(1);
  }
  return rows;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function writeText(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

// ── inventory: walk all sources, classify ─────────────────────────────

/**
 * @typedef {Object} PageEntry
 * @property {string} title
 * @property {string} hash
 * @property {string} sourcePath   absolute path to the .md
 * @property {string} bodyDir      directory siblings of the .md
 *
 * @typedef {Object} DatabaseEntry
 * @property {string} title
 * @property {string} hash
 * @property {string} csvPath
 * @property {string|null} rowDir   absolute path of the row-pages folder
 *
 * @typedef {Object} RowEntry
 * @property {string} dbHash
 * @property {string} title
 * @property {string} hash
 * @property {string} sourcePath
 */

async function buildInventory(sources) {
  const pagesByHash = new Map();
  const databasesByHash = new Map();
  const rowsByKey = new Map(); // dbHash::hash → RowEntry
  const attachments = new Map(); // sha256:ext → { fileName, data }

  // Pass 1: every CSV file. We need all database hashes registered
  // before we can classify .md files as row-pages-inside-a-database
  // or stand-alone pages. The pages and the .csv often live in
  // different export parts.
  for (const source of sources) {
    await walk(source, "csv");
  }

  // Build title → hash lookup as a fallback: Notion sometimes drops
  // the hash from the row-pages folder name (when the CSV is in one
  // export part and the folder is in another), leaving only the
  // human-readable title. First db with a given title wins; collisions
  // on common titles like "Untitled" are unresolvable from disk shape
  // alone.
  const dbByTitle = new Map();
  for (const [hash, db] of databasesByHash) {
    if (!db.title || db.title === "Untitled") continue;
    if (!dbByTitle.has(db.title)) dbByTitle.set(db.title, hash);
  }

  // Pass 2: .md files + attachments, now that we know every db hash.
  for (const source of sources) {
    await walk(source, "rest");
  }

  return { pagesByHash, databasesByHash, rowsByKey, attachments };

  async function walk(dir, phase) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      console.warn(`Skipping unreadable dir: ${dir} (${error.message})`);
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, phase);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = extname(entry.name).toLowerCase();
      const stem = entry.name.slice(0, entry.name.length - ext.length);

      if (phase === "csv") {
        if (ext !== ".csv") continue;
        if (entry.name.endsWith("_all.csv")) continue;
        const { title, hash } = stripHash(stem);
        if (!hash) continue;
        // First seen wins (parts duplicate).
        if (!databasesByHash.has(hash)) {
          databasesByHash.set(hash, { title, hash, csvPath: fullPath });
        }
        continue;
      }

      // phase === "rest"
      if (ext === ".md") {
        const { title, hash } = stripHash(stem);
        if (!hash) continue;
        const dbHash = enclosingDbHash(dir);
        if (dbHash) {
          const key = `${dbHash}::${hash}`;
          if (!rowsByKey.has(key)) {
            rowsByKey.set(key, { dbHash, title, hash, sourcePath: fullPath });
          }
        } else if (!pagesByHash.has(hash)) {
          pagesByHash.set(hash, { title, hash, sourcePath: fullPath });
        }
      } else if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
        await indexAttachment(fullPath, ext);
      }
      // Other types (.pdf, .docx, .drawio, .html) silently skipped.
    }
  }

  function enclosingDbHash(dir) {
    // Walk up `dir` and check each ancestor's folder name. Prefer hash
    // matches when present; fall back to title matches via dbByTitle
    // for the case where Notion stripped the hash from the row-pages
    // folder name.
    let cursor = dir;
    while (cursor && cursor.length > 1) {
      const base = cursor.split(sep).pop();
      if (!base) break;
      const { title, hash } = stripHash(base);
      if (hash && databasesByHash.has(hash)) return hash;
      if (!hash && dbByTitle.has(title)) return dbByTitle.get(title);
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
    return null;
  }

  async function indexAttachment(sourcePath, ext) {
    const data = await readFile(sourcePath);
    const hash = createHash("sha256").update(data).digest("hex");
    const key = `${hash}:${ext}`;
    if (attachments.has(key)) return;
    const fileName = `${hash.slice(0, 24)}-${safeAttachmentStem(sourcePath)}${ext}`;
    attachments.set(key, { fileName, data });
  }
}

// ── output: write a fresh Lotion workspace ────────────────────────────

async function emitWorkspace(target, inventory) {
  // Wipe and recreate target.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await mkdir(join(target, "pages"), { recursive: true });
  await mkdir(join(target, "databases"), { recursive: true });
  await mkdir(join(target, "attachments", "notion"), { recursive: true });

  const now = new Date().toISOString();

  // Assign Lotion IDs and build a Notion-hash → Lotion-id map.
  const pageIdByHash = new Map();
  const databaseIdByHash = new Map();

  for (const [hash] of inventory.pagesByHash) pageIdByHash.set(hash, shortId("pg"));
  for (const [hash] of inventory.databasesByHash) databaseIdByHash.set(hash, shortId("db"));

  // Copy attachments.
  for (const item of inventory.attachments.values()) {
    const rel = notionAttachmentPath(item.fileName);
    const targetPath = join(target, rel);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, item.data);
  }
  console.log(`Copied ${inventory.attachments.size} attachment(s).`);

  // Emit pages.
  const pageIds = [];
  const pageRecords = [];
  for (const [hash, entry] of inventory.pagesByHash) {
    const id = pageIdByHash.get(hash);
    pageIds.push(id);
    const body = await readFile(entry.sourcePath, "utf8");
    const md = formatPage(id, entry.title, now, body);
    pageRecords.push({
      id,
      created_time: now,
      updated_time: now,
      title: entry.title || "Untitled",
      kind: "row_page",
      body_path: defaultPageBodyPath(id, entry.title || "Untitled"),
      icon: "",
      full_width: "",
      database_id: PAGES_DATABASE_ID,
      row_id: id,
      page_file: pageFileName(id, entry.title || "Untitled")
    });
    await writeText(join(target, defaultPageBodyPath(id, entry.title || "Untitled")), md);
  }
  console.log(`Wrote ${pageIds.length} page(s).`);

  // Emit databases. Two filters cut Notion's automatic exports:
  //   1. Drop empty / "Untitled" titles (linked-db re-exports show
  //      up here with no name).
  //   2. Within each remaining title, keep only the variant with the
  //      most rows (Notion exports the same logical database many
  //      times under different hashes).
  // Without these, a typical workspace expands to tens of thousands
  // of phantom databases.
  const dbsByTitle = new Map(); // title → [hash, ...] for diagnostics
  const chosenByTitle = new Map(); // title → chosen { hash, rowCount }
  for (const [hash, db] of inventory.databasesByHash) {
    if (!db.title || db.title === "Untitled") continue;
    const csvRaw = await readFile(db.csvPath, "utf8");
    const rowCount = csvRaw.split(/\r?\n/).filter((line) => line.length > 0).length - 1;
    const existing = chosenByTitle.get(db.title);
    if (!existing || rowCount > existing.rowCount) {
      chosenByTitle.set(db.title, { hash, rowCount });
    }
    if (!dbsByTitle.has(db.title)) dbsByTitle.set(db.title, []);
    dbsByTitle.get(db.title).push(hash);
  }
  const chosenHashes = new Set(Array.from(chosenByTitle.values()).map((c) => c.hash));

  const databaseIds = [];
  const usedRowFileNames = new Map(); // dbId → Set<fileName>
  let skippedDbs = 0;
  for (const [hash, db] of inventory.databasesByHash) {
    if (!db.title || db.title === "Untitled") {
      skippedDbs += 1;
      continue;
    }
    if (!chosenHashes.has(hash)) {
      skippedDbs += 1;
      continue;
    }
    const dbId = databaseIdByHash.get(hash);
    databaseIds.push(dbId);
    const csvRaw = (await readFile(db.csvPath, "utf8")).trim();
    const grid = parseCsv(csvRaw);
    if (grid.length === 0) {
      console.warn(`Skipping empty database: ${db.title}`);
      continue;
    }
    const notionHeaders = grid[0];
    const notionRecords = grid.slice(1).map((cells) =>
      Object.fromEntries(notionHeaders.map((h, i) => [h, cells[i] ?? ""]))
    );

    // The first column in Notion CSV is always the page title.
    const [notionTitleHeader, ...notionOtherHeaders] = notionHeaders;

    // Build Lotion schema.
    const fields = [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: notionTitleHeader || "Title", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ];
    const userFields = [];
    for (const header of notionOtherHeaders) {
      const fieldId = uniqueFieldId(header, fields);
      const field = { id: fieldId, name: header, type: "text" };
      fields.push(field);
      userFields.push(fieldId);
    }

    // Build records and row pages.
    const seenFiles = new Set();
    usedRowFileNames.set(dbId, seenFiles);
    const records = [];
    const rowMatchByTitle = new Map();
    // Index row pages by title so we can attach bodies and `page_file`.
    for (const row of inventory.rowsByKey.values()) {
      if (row.dbHash !== hash) continue;
      if (!rowMatchByTitle.has(row.title)) rowMatchByTitle.set(row.title, []);
      rowMatchByTitle.get(row.title).push(row);
    }

    const dbWorkspacePath = databaseWorkspacePath(dbId, false, db.title);
    await mkdir(join(target, dbWorkspacePath, "pages"), { recursive: true });
    await mkdir(join(target, dbWorkspacePath, "templates", "pages"), { recursive: true });

    for (const notionRow of notionRecords) {
      const rowId = shortId("row");
      const title = notionRow[notionTitleHeader] || "Untitled";

      // Match a row page by title (pop one entry to avoid double-use).
      const candidates = rowMatchByTitle.get(title);
      let rowPagePath = "";
      let rowBody = "";
      if (candidates && candidates.length > 0) {
        const match = candidates.shift();
        rowBody = await readFile(match.sourcePath, "utf8");
      }

      // Allocate a unique, Notion-style filename based on the title + row id.
      let fileName = pageFileName(rowId, title);
      let suffix = 2;
      while (seenFiles.has(fileName)) {
        fileName = `${fileName.replace(/\.md$/i, "")}_${suffix}.md`;
        suffix += 1;
      }
      seenFiles.add(fileName);
      rowPagePath = fileName;

      const record = {
        id: rowId,
        created_time: now,
        updated_time: now,
        title,
        page_file: rowPagePath
      };
      for (const header of notionOtherHeaders) {
        const field = fields.find((f) => f.name === header);
        if (!field) continue;
        record[field.id] = notionRow[header] ?? "";
      }
      records.push(record);

      // Write the row page body. If the matched .md starts with `#
      // Title` duplicating the title, keep it — it's the user's text.
      const md = rowBody.trim().length > 0 ? rowBody : `# ${title}\n`;
      await writeText(join(target, dbWorkspacePath, "pages", fileName), md);
    }

    // Schema + CSV + default view.
    const schema = {
      id: dbId,
      name: db.title,
      created_time: now,
      updated_time: now,
      fields,
      defaultViewId: "view_default"
    };
    await writeJson(join(target, dbWorkspacePath, "schema.json"), schema);

    const headers = fields.map((f) => f.id);
    const csv = rowsToCsv(headers, records);
    await writeText(join(target, dbWorkspacePath, "data.csv"), csv);

    const visibleFieldIds = ["title", ...userFields, "created_time", "updated_time"];
    const view = {
      id: "view_default",
      databaseId: dbId,
      name: "All",
      type: "table",
      visibleFieldIds,
      fieldOrder: visibleFieldIds,
      wrapFieldIds: visibleFieldIds,
      sorts: [],
      filters: []
    };
    await writeJson(join(target, dbWorkspacePath, "views", "view_default.json"), view);
    console.log(`  db ${db.title}: ${records.length} row(s), ${userFields.length} user field(s)`);
  }

  // Manifest.
  const manifest = {
    version: 1,
    spaceId: shortId("sp"),
    name: "Notion Import",
    pages: pageIds,
    databases: databaseIds,
    systemDatabases: [PAGES_DATABASE_ID],
    activePageId: pageIds[0]
  };
  const pageFields = createPagesFields();
  const pagesDatabasePath = databaseWorkspacePath(PAGES_DATABASE_ID, true, "pages");
  await writeJson(join(target, pagesDatabasePath, "schema.json"), {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    fields: pageFields,
    defaultViewId: DEFAULT_VIEW_ID
  });
  await writeText(
    join(target, pagesDatabasePath, "data.csv"),
    rowsToCsv(pageFields.map((field) => field.id), pageRecords)
  );
  await writeJson(join(target, pagesDatabasePath, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId: PAGES_DATABASE_ID,
    name: "All",
    type: "table",
    visibleFieldIds: ["title", "kind", "icon", "full_width", "updated_time"],
    fieldOrder: ["title", "kind", "icon", "full_width", "updated_time"],
    wrapFieldIds: ["title", "icon"],
    sorts: [{ fieldId: "updated_time", direction: "desc" }],
    filters: []
  });
  await writeJson(join(target, "lotion.json"), manifest);
  console.log(`Wrote workspace to ${target}`);
  console.log(`  ${pageIds.length} top-level page(s)`);
  console.log(`  ${databaseIds.length} database(s)`);
}

function uniqueFieldId(name, existing) {
  const base = slugifyFileName(name).toLowerCase() || "field";
  let id = base;
  let suffix = 2;
  while (existing.some((f) => f.id === id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  return id;
}

function formatPage(id, title, now, body) {
  void id;
  void title;
  void now;
  return `${body.trimEnd()}\n`;
}

// ── main ──────────────────────────────────────────────────────────────

const { source: sources, target } = parseArgs(process.argv.slice(2));

console.log(`Scanning ${sources.length} source dir(s)…`);
for (const s of sources) {
  try {
    await stat(s);
  } catch {
    console.error(`Source not found: ${s}`);
    process.exit(1);
  }
}

const inventory = await buildInventory(sources);
console.log(`Inventory:`);
console.log(`  ${inventory.pagesByHash.size} top-level page(s)`);
console.log(`  ${inventory.databasesByHash.size} database(s)`);
console.log(`  ${inventory.rowsByKey.size} row page(s)`);
console.log(`  ${inventory.attachments.size} attachment(s)`);

await emitWorkspace(target, inventory);
