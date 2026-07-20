#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { parse } from "node-html-parser";

const execFileAsync = promisify(execFile);
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

const wrapperPaths = await htmlFilesContainingCsvLinks(originalRoot);
const candidates = new Map();
for (const htmlPath of wrapperPaths) {
  const raw = await readFile(htmlPath, "utf8");
  const root = parse(raw, { lowerCaseTagName: true });
  const body = root.querySelector("div.page-body");
  const csvLink = body?.querySelectorAll("a").find((link) => {
    const href = link.getAttribute("href") ?? "";
    return /\.csv$/i.test(decodeHref(href));
  });
  const hash = notionHashFromCsvHref(csvLink?.getAttribute("href") ?? "");
  if (!hash || !schemasByNotionHash.has(hash)) continue;

  const header = root.querySelector("header");
  const iconSrc = header?.querySelector(".page-header-icon img.icon")?.getAttribute("src")?.trim() ?? "";
  const iconEmoji = header?.querySelector(".page-header-icon span.icon")?.text.trim() ?? "";
  if (!iconSrc && !iconEmoji) continue;
  const icon = iconEmoji
    ? { value: `emoji:${iconEmoji}`, source: htmlPath }
    : await resolveImageIcon(iconSrc, htmlPath, workspace);
  if (!icon) continue;
  if (!candidates.has(hash)) candidates.set(hash, icon);
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
    attachmentTarget: icon.attachmentTarget
  };
}).sort((a, b) => a.databaseName.localeCompare(b.databaseName));

const summary = {
  mode: apply ? "apply" : "dry-run",
  workspace,
  generatedAt: new Date().toISOString(),
  missingDatabaseIcons: schemasByNotionHash.size,
  htmlWrappersScanned: wrapperPaths.length,
  recoverableIcons: changes.length,
  remoteIcons: changes.filter((change) => /^https?:\/\//i.test(change.icon)).length,
  emojiIcons: changes.filter((change) => change.icon.startsWith("emoji:")).length,
  localIcons: changes.filter((change) => change.attachmentSource).length
};

if (!apply) {
  console.log(JSON.stringify({ summary, sample: changes.slice(0, 20) }, null, 2));
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
  current.icon = change.icon;
  const temporarySchema = `${change.schemaPath}.repair-${process.pid}.tmp`;
  await writeFile(temporarySchema, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  await rename(temporarySchema, change.schemaPath);
}

const reportPath = join(backupRoot, "report.json");
await writeFile(reportPath, `${JSON.stringify({ summary, changes }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ summary, backupRoot, reportPath }, null, 2));

async function htmlFilesContainingCsvLinks(root) {
  try {
    const { stdout } = await execFileAsync(
      "rg",
      ["--files-with-matches", "--null", String.raw`href=["'][^"']+\.csv["']`, "--glob", "*.html", root],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
    );
    return stdout.split("\0").filter(Boolean).sort();
  } catch (error) {
    if (error?.code === 1) return [];
    if (error?.code !== "ENOENT") throw error;
    return recursivelyListHtml(root);
  }
}

async function recursivelyListHtml(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await recursivelyListHtml(path));
    else if (/\.html?$/i.test(entry.name)) files.push(path);
  }
  return files.sort();
}

function notionHashFromCsvHref(href) {
  const decoded = decodeHref(href);
  const stem = basename(decoded).replace(/\.csv$/i, "").replace(/_all$/i, "");
  return /([0-9a-f]{32})$/i.exec(stem)?.[1].toLowerCase();
}

function decodeHref(href) {
  try {
    return decodeURIComponent(href);
  } catch {
    return "";
  }
}

async function resolveImageIcon(iconSrc, htmlPath, workspaceRoot) {
  if (/^https?:\/\//i.test(iconSrc)) return { value: iconSrc, source: htmlPath };
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
    attachmentSource: sourcePath,
    attachmentTarget: relative(workspaceRoot, join(workspaceRoot, attachmentTarget)).split("\\").join("/")
  };
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
