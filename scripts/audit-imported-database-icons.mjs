#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parse } from "node-html-parser";

const workspaceArg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!workspaceArg) {
  console.error("Usage: node scripts/audit-imported-database-icons.mjs <workspace>");
  process.exit(2);
}

const workspace = resolve(workspaceArg);
const databaseRoot = join(workspace, "databases", "user");
const originalRoot = join(workspace, "attachments", "original");
await stat(databaseRoot);
await stat(originalRoot);

const schemas = [];
for (const entry of await readdir(databaseRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const schema = JSON.parse(await readFile(join(databaseRoot, entry.name, "schema.json"), "utf8"));
    schemas.push(schema);
  } catch {
    // Ignore incomplete/non-database folders; the audit is read-only.
  }
}

const notionSchemas = schemas.filter((schema) => /^[0-9a-f]{32}$/i.test(String(schema.notion_source_hash ?? "")));
const schemaByHash = new Map(notionSchemas.map((schema) => [schema.notion_source_hash.toLowerCase(), schema]));
const schemaByShortHash = uniqueIndex(notionSchemas, (schema) => notionShortId(schema.notion_source_hash));
const schemaByTitle = uniqueIndex(notionSchemas, (schema) => materialTitle(schema.name));
const evidenceByHash = new Map();
const evidencePriorityByHash = new Map();
const ambiguousHashes = new Set();
const inlineOccurrencesByHash = new Map();
let inlineViews = 0;
let resolvedInlineViews = 0;
let inlineViewsWithOwnIcon = 0;

for (const schema of notionSchemas) {
  if (!schema.icon) continue;
  addEvidence(schema.notion_source_hash.toLowerCase(), {
    icon: schema.icon,
    sourceKind: "stored-schema",
    source: ""
  }, 4);
}

const htmlFiles = await recursivelyListHtml(originalRoot);
for (const htmlPath of htmlFiles) {
  const raw = await readFile(htmlPath, "utf8");
  const hasHeaderIcon = raw.includes('<div class="page-header-icon');
  const hasCollections = raw.includes('class="collection-content');
  const hasLinkToPage = raw.includes("link-to-page");
  if (!hasHeaderIcon && !hasCollections && !hasLinkToPage) continue;

  const root = parse(raw, { lowerCaseTagName: true });
  if (hasHeaderIcon) {
    const icon = pageHeaderIcon(root, htmlPath);
    if (icon) {
      const ownHash = notionHashFromDocumentPath(htmlPath);
      if (ownHash && schemaByHash.has(ownHash)) {
        addEvidence(ownHash, { ...icon, sourceKind: "exact-database-page", source: htmlPath }, 3);
      }
    }
  }

  if (hasLinkToPage) {
    for (const figure of root.querySelectorAll("figure.link-to-page")) {
      const anchor = figure.querySelector("a");
      const schema = schemaFromHref(anchor?.getAttribute("href") ?? "");
      const icon = elementIcon(anchor, htmlPath);
      if (!schema || !icon) continue;
      addEvidence(schema.notion_source_hash.toLowerCase(), {
        ...icon,
        sourceKind: "exact-link-target",
        source: htmlPath
      }, 1);
    }
  }

  if (hasCollections) {
    for (const collection of root.querySelectorAll(
      "div.collection-content, table.collection-content, div.collection-content-wrapper"
    )) {
      if (hasCollectionAncestor(collection)) continue;
      inlineViews += 1;
      const schema = collectionSchema(collection);
      if (!schema) continue;
      resolvedInlineViews += 1;
      const hash = schema.notion_source_hash.toLowerCase();
      inlineOccurrencesByHash.set(hash, (inlineOccurrencesByHash.get(hash) ?? 0) + 1);
      const titleIcon = elementIcon(collection.querySelector(".collection-title"), htmlPath);
      if (titleIcon) {
        inlineViewsWithOwnIcon += 1;
        addEvidence(hash, {
          ...titleIcon,
          sourceKind: "inline-collection-title",
          source: htmlPath
        }, 2);
      }
    }
  }
}

const databases = Array.from(evidenceByHash, ([hash, evidence]) => {
  const schema = schemaByHash.get(hash);
  return {
    databaseId: schema?.id ?? "",
    databaseName: schema?.name ?? "Untitled",
    notionHash: hash,
    icon: evidence.icon,
    iconType: evidence.icon.startsWith("emoji:")
      ? "emoji"
      : /^https?:\/\//i.test(evidence.icon) ? "remote" : "image",
    sourceKind: evidence.sourceKind,
    source: evidence.source,
    inlineOccurrences: inlineOccurrencesByHash.get(hash) ?? 0
  };
}).sort((a, b) => b.inlineOccurrences - a.inlineOccurrences || a.databaseName.localeCompare(b.databaseName));

console.log(JSON.stringify({
  summary: {
    workspace,
    totalDatabases: schemas.length,
    notionDatabases: notionSchemas.length,
    databasesWithSourceBackedIcons: databases.length,
    imageIcons: databases.filter((database) => database.iconType === "image").length,
    emojiIcons: databases.filter((database) => database.iconType === "emoji").length,
    remoteIcons: databases.filter((database) => database.iconType === "remote").length,
    ambiguousIcons: ambiguousHashes.size,
    htmlFilesScanned: htmlFiles.length,
    inlineViews,
    resolvedInlineViews,
    inlineViewsWithOwnIcon,
    inlineViewsUsingIconDatabases: databases.reduce((sum, database) => sum + database.inlineOccurrences, 0)
  },
  databases,
  ambiguousNotionHashes: Array.from(ambiguousHashes).sort()
}, null, 2));

function collectionSchema(collection) {
  const idHash = normalizeHash(collection.getAttribute("id") ?? "");
  if (idHash && schemaByHash.has(idHash)) return schemaByHash.get(idHash);
  for (const anchor of collection.querySelectorAll("a")) {
    const schema = schemaFromHref(anchor.getAttribute("href") ?? "");
    if (schema) return schema;
  }
  const title = materialTitle(collection.querySelector(".collection-title")?.text.trim() ?? "");
  return title ? schemaByTitle.get(title) : undefined;
}

function pageHeaderIcon(root, source) {
  const header = root.querySelector("header");
  const fallback = root.querySelector("article")?.getAttribute("data-notion-page-icon")?.trim() ?? "";
  const icon = elementIcon(header?.querySelector(".page-header-icon"), source, fallback);
  if (icon) return icon;
  return undefined;
}

function elementIcon(element, source, remoteFallback = "") {
  if (!element) return undefined;
  const emojiElement = element.querySelector?.("span.icon") ?? (element.matches?.("span.icon") ? element : null);
  const emoji = emojiElement?.text.trim() || emojiElement?.getAttribute("data-emoji")?.trim() || "";
  if (emoji) return { icon: `emoji:${emoji}` };
  const imageElement = element.querySelector?.("img.icon") ?? (element.matches?.("img.icon") ? element : null);
  const image = imageElement?.getAttribute("src")?.trim() ?? "";
  if (/^https?:\/\//i.test(image)) return { icon: image };
  if (image) {
    const decoded = decodeHref(image);
    const imagePath = resolve(dirname(source), decoded);
    if (existsSync(imagePath)) return { icon: decoded, imagePath };
  }
  return /^https?:\/\//i.test(remoteFallback) ? { icon: remoteFallback } : undefined;
}

function hasCollectionAncestor(node) {
  let parent = node.parentNode;
  while (parent) {
    const classes = (parent.getAttribute?.("class") ?? "").split(/\s+/);
    if (classes.includes("collection-content") || classes.includes("collection-content-wrapper")) {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

function schemaFromHref(href) {
  const decoded = decodeHref(href).replace(/-/g, "");
  const full = /([0-9a-f]{32})(?:_all)?\.(?:csv|html?|md)(?:$|[?#])/i.exec(decoded)?.[1]?.toLowerCase();
  if (full && schemaByHash.has(full)) return schemaByHash.get(full);
  const shortMatch = /([0-9a-f]{4})([0-9a-f]{4})(?:_all)?\.(?:csv|html?|md)(?:$|[?#])/i.exec(decoded);
  return shortMatch ? schemaByShortHash.get((shortMatch[1] + shortMatch[2]).toLowerCase()) : undefined;
}

function addEvidence(hash, evidence, priority) {
  const currentPriority = evidencePriorityByHash.get(hash) ?? 0;
  if (priority < currentPriority) return;
  if (priority > currentPriority) {
    evidenceByHash.set(hash, evidence);
    evidencePriorityByHash.set(hash, priority);
    ambiguousHashes.delete(hash);
    return;
  }
  if (ambiguousHashes.has(hash)) return;
  const existing = evidenceByHash.get(hash);
  if (!existing || existing.icon === evidence.icon) {
    evidenceByHash.set(hash, existing ?? evidence);
    evidencePriorityByHash.set(hash, priority);
    return;
  }
  evidenceByHash.delete(hash);
  ambiguousHashes.add(hash);
}

function uniqueIndex(values, keyFor) {
  const index = new Map();
  const ambiguous = new Set();
  for (const value of values) {
    const key = keyFor(value);
    if (!key || ambiguous.has(key)) continue;
    if (index.has(key)) {
      index.delete(key);
      ambiguous.add(key);
    } else {
      index.set(key, value);
    }
  }
  return index;
}

async function recursivelyListHtml(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await recursivelyListHtml(path));
    else if (/\.html?$/i.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function notionHashFromDocumentPath(path) {
  return /(?:^|\s)([0-9a-f]{32})\.html?$/i.exec(basename(path))?.[1]?.toLowerCase() ?? "";
}

function notionShortId(hash) {
  const normalized = normalizeHash(hash);
  return normalized ? `${normalized.slice(0, 4)}${normalized.slice(-4)}` : "";
}

function normalizeHash(value) {
  const normalized = String(value).replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(normalized) ? normalized : "";
}

function decodeHref(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function materialTitle(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
