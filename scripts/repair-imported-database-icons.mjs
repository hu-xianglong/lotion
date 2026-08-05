#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { parse } from "node-html-parser";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const workspaceArg = args.find((arg) => !arg.startsWith("--"));
if (!workspaceArg) {
  console.error("Usage: node scripts/repair-imported-database-icons.mjs <workspace> [--apply]");
  process.exit(2);
}

const workspace = resolve(workspaceArg);
const databaseRoot = join(workspace, "databases", "user");
const originalRoot = join(workspace, "attachments", "original");
await stat(databaseRoot);
await stat(originalRoot);

const schemasByNotionHash = new Map();
for (const entry of await readdir(databaseRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const schemaPath = join(databaseRoot, entry.name, "schema.json");
  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8"));
  } catch {
    continue;
  }
  const hash = String(schema.notion_source_hash ?? "").toLowerCase();
  if (schema.icon || !/^[0-9a-f]{32}$/.test(hash)) continue;
  schemasByNotionHash.set(hash, { schema, schemaPath, folder: entry.name });
}

const wrapperPaths = await recursivelyListHtml(originalRoot);
const candidates = new Map();
const candidatePriorities = new Map();
const ambiguousHashes = new Set();
let exactIdentityHtmlFiles = 0;
let exactLinkHints = 0;
for (const htmlPath of wrapperPaths) {
  const hash = notionHashFromDocumentPath(htmlPath);
  if (!hash || !schemasByNotionHash.has(hash)) continue;
  exactIdentityHtmlFiles += 1;
  const raw = await readFile(htmlPath, "utf8");
  const root = parse(raw, { lowerCaseTagName: true });
  const header = root.querySelector("header");
  const iconSrc = header?.querySelector(".page-header-icon img.icon")?.getAttribute("src")?.trim() ?? "";
  const iconEmoji = header?.querySelector(".page-header-icon span.icon")?.text.trim() ?? "";
  if (!iconSrc && !iconEmoji) continue;
  const icon = iconEmoji
    ? { value: `emoji:${iconEmoji}`, source: htmlPath, sourceKind: "database-wrapper" }
    : await resolveImageIcon(iconSrc, htmlPath, workspace);
  if (!icon) continue;
  addCandidate(hash, icon, 2);
}

for (const htmlPath of wrapperPaths) {
  let raw;
  try {
    raw = await readFile(htmlPath, "utf8");
  } catch {
    continue;
  }
  if (!raw.includes("link-to-page")) continue;
  const root = parse(raw, { lowerCaseTagName: true });
  for (const figure of root.querySelectorAll("figure.link-to-page")) {
    const anchor = figure.querySelector("a");
    const hash = notionHashFromTarget(anchor?.getAttribute("href") ?? "");
    if (!anchor || !hash || !schemasByNotionHash.has(hash)) continue;
    const iconSrc = anchor.querySelector("img.icon")?.getAttribute("src")?.trim() ?? "";
    const iconEmoji = anchor.querySelector("span.icon")?.text.trim() ?? "";
    if (!iconSrc && !iconEmoji) continue;
    const icon = iconEmoji
      ? { value: `emoji:${iconEmoji}`, source: htmlPath, sourceKind: "exact-link-target" }
      : await resolveImageIcon(iconSrc, htmlPath, workspace, "exact-link-target");
    if (!icon) continue;
    exactLinkHints += 1;
    addCandidate(hash, icon, 1);
  }
}

const changes = Array.from(candidates, ([notionHash, icon]) => {
  const target = schemasByNotionHash.get(notionHash);
  return {
    notionHash,
    databaseId: target.schema.id,
    databaseName: target.schema.name,
    schemaPath: target.schemaPath,
    folder: target.folder,
    icon: icon.value,
    iconSource: icon.source,
    attachmentSource: icon.attachmentSource,
    attachmentTarget: icon.attachmentTarget,
    schemaDigestBefore: schemaDigestExcludingIcon(target.schema)
  };
}).sort((a, b) => a.databaseName.localeCompare(b.databaseName));

const summary = {
  mode: apply ? "apply" : "dry-run",
  workspace,
  generatedAt: new Date().toISOString(),
  missingDatabaseIcons: schemasByNotionHash.size,
  htmlFilesScanned: wrapperPaths.length,
  exactIdentityHtmlFiles,
  exactLinkHints,
  ambiguousIcons: ambiguousHashes.size,
  recoverableIcons: changes.length,
  remoteIcons: changes.filter((change) => /^https?:\/\//i.test(change.icon)).length,
  emojiIcons: changes.filter((change) => change.icon.startsWith("emoji:")).length,
  localIcons: changes.filter((change) => change.attachmentSource).length
};

if (!apply) {
  console.log(JSON.stringify({
    summary,
    sample: changes.slice(0, 20).map(publicChange),
    ambiguousNotionHashes: Array.from(ambiguousHashes).sort().slice(0, 20)
  }, null, 2));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = join(workspace, "reports", `database-icon-repair-${stamp}`);
await mkdir(join(backupRoot, "schemas"), { recursive: true });

for (const change of changes) {
  const backupPath = join(backupRoot, "schemas", change.folder, "schema.json");
  await mkdir(dirname(backupPath), { recursive: true });
  await copyFile(change.schemaPath, backupPath);

  if (change.attachmentSource && change.attachmentTarget) {
    const absoluteTarget = join(workspace, change.attachmentTarget);
    await mkdir(dirname(absoluteTarget), { recursive: true });
    try {
      await stat(absoluteTarget);
    } catch {
      const temporaryTarget = `${absoluteTarget}.repair-${process.pid}.tmp`;
      await copyFile(change.attachmentSource, temporaryTarget);
      await rename(temporaryTarget, absoluteTarget);
    }
  }

  const current = JSON.parse(await readFile(change.schemaPath, "utf8"));
  if (current.icon) continue;
  if (schemaDigestExcludingIcon(current) !== change.schemaDigestBefore) {
    throw new Error(`Database schema changed during icon repair: ${change.schemaPath}`);
  }
  current.icon = change.icon;
  const temporarySchema = `${change.schemaPath}.repair-${process.pid}.tmp`;
  await writeFile(temporarySchema, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  await rename(temporarySchema, change.schemaPath);
  const verified = JSON.parse(await readFile(change.schemaPath, "utf8"));
  if (verified.icon !== change.icon || schemaDigestExcludingIcon(verified) !== change.schemaDigestBefore) {
    throw new Error(`Database icon repair verification failed: ${change.schemaPath}`);
  }
}

const reportPath = join(backupRoot, "report.json");
await writeFile(reportPath, `${JSON.stringify({ summary, changes: changes.map(publicChange) }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ summary, backupRoot, reportPath }, null, 2));

async function recursivelyListHtml(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await recursivelyListHtml(path));
    else if (/\.html?$/i.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function notionHashFromDocumentPath(path) {
  const stem = basename(path).replace(/\.html?$/i, "");
  return /(?:^|\s)([0-9a-f]{32})$/i.exec(stem)?.[1].toLowerCase();
}

function notionHashFromTarget(target) {
  const decoded = decodeHref(target).split(/[?#]/, 1)[0] ?? "";
  return /([0-9a-f]{32})(?:_all)?(?:\.(?:html?|md|csv))?$/i.exec(decoded.replace(/-/g, ""))?.[1].toLowerCase();
}

function decodeHref(href) {
  try {
    return decodeURIComponent(href);
  } catch {
    return "";
  }
}

async function resolveImageIcon(iconSrc, htmlPath, workspaceRoot, sourceKind = "database-wrapper") {
  if (/^https?:\/\//i.test(iconSrc)) return { value: iconSrc, source: htmlPath, sourceKind };
  if (/^[a-z][a-z0-9+.-]*:/i.test(iconSrc)) return null;
  const decoded = decodeHref(iconSrc);
  if (!decoded) return null;
  const sourcePath = resolve(dirname(htmlPath), decoded);
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
  return {
    value: attachmentTarget,
    source: htmlPath,
    sourceKind,
    attachmentSource: sourcePath,
    attachmentTarget: relative(workspaceRoot, join(workspaceRoot, attachmentTarget)).split("\\").join("/")
  };
}

function addCandidate(hash, icon, priority) {
  const currentPriority = candidatePriorities.get(hash) ?? 0;
  if (priority < currentPriority) return;
  if (priority > currentPriority) {
    candidates.set(hash, icon);
    candidatePriorities.set(hash, priority);
    ambiguousHashes.delete(hash);
    return;
  }
  if (ambiguousHashes.has(hash)) return;
  const existing = candidates.get(hash);
  if (!existing) {
    candidates.set(hash, icon);
    candidatePriorities.set(hash, priority);
  } else if (existing.value !== icon.value) {
    candidates.delete(hash);
    ambiguousHashes.add(hash);
  }
}

function schemaDigestExcludingIcon(schema) {
  const clone = { ...schema };
  delete clone.icon;
  return createHash("sha256").update(JSON.stringify(clone)).digest("hex");
}

function publicChange(change) {
  const { schemaDigestBefore: _schemaDigestBefore, ...visible } = change;
  return visible;
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
