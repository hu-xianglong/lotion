#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { parse } from "node-html-parser";

const gzipAsync = promisify(gzip);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const workspaceArg = args.find((arg) => !arg.startsWith("--"));
if (!workspaceArg) {
  console.error("Usage: node scripts/repair-imported-row-bodies.mjs <workspace> [--apply]");
  process.exit(2);
}

const workspace = resolve(workspaceArg);
const originalRoot = join(workspace, "attachments", "original");
const reportsRoot = join(workspace, "reports");
const manifestPath = await latestManifest(reportsRoot);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const propertyNamesByDatabaseId = await loadDatabasePropertyNames(workspace);

const changes = [];
const skipped = { edited: 0, missingSource: 0, missingTarget: 0, nonMarkdownSource: 0 };
const skippedSamples = { edited: [], missingSource: [], missingTarget: [], nonMarkdownSource: [] };
const rows = manifest.rows ?? [];
const concurrency = 32;
for (let offset = 0; offset < rows.length; offset += concurrency) {
  const batch = rows.slice(offset, offset + concurrency);
  const results = await Promise.all(batch.map(async (row) => inspectRow(row)));
  for (const result of results) {
    if (result?.change) changes.push(result.change);
    else if (result?.skip) {
      skipped[result.skip] += 1;
      if (result.detail && skippedSamples[result.skip].length < 20) {
        skippedSamples[result.skip].push(result.detail);
      }
    }
  }
}

const changesByDatabase = new Map();
for (const change of changes) {
  const list = changesByDatabase.get(change.databaseId) ?? [];
  list.push(change);
  changesByDatabase.set(change.databaseId, list);
}
const databases = Array.from(changesByDatabase, ([databaseId, items]) => ({
  databaseId,
  name: items[0]?.database ?? "Untitled",
  cleanedRowBodies: items.length
})).sort((a, b) => b.cleanedRowBodies - a.cleanedRowBodies);
const summary = {
  mode: apply ? "apply" : "dry-run",
  workspace,
  manifestPath,
  generatedAt: new Date().toISOString(),
  manifestRows: rows.length,
  cleanedRowBodies: changes.length,
  affectedDatabases: changesByDatabase.size,
  skipped,
  skippedSamples,
  databases
};

if (!apply) {
  console.log(JSON.stringify({ summary, sample: changes.slice(0, 20).map(reportChange) }, null, 2));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const repairRoot = join(reportsRoot, `row-body-repair-${stamp}`);
const backupRoot = join(repairRoot, "backups");
await mkdir(backupRoot, { recursive: true });

for (const [databaseId, databaseChanges] of changesByDatabase) {
  const backup = databaseChanges.map((change) => ({
    target: change.target,
    body: change.currentBody
  }));
  const backupPath = join(backupRoot, `${databaseId}.json.gz`);
  await writeFile(backupPath, await gzipAsync(Buffer.from(JSON.stringify(backup)), { level: 9 }));
  for (const change of databaseChanges) {
    await atomicWrite(change.targetPath, change.cleanedBody);
    const persisted = normalizeBody(await readFile(change.targetPath, "utf8"));
    if (persisted !== change.cleanedBody) {
      throw new Error(`Row body verification failed: ${change.targetPath}`);
    }
  }
}

const reportPath = join(repairRoot, "report.json");
await writeFile(
  reportPath,
  `${JSON.stringify({ summary, changes: changes.map(reportChange) }, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify({ summary, repairRoot, reportPath }, null, 2));

async function inspectRow(row) {
  const source = String(row.source ?? "");
  if (!/\.md$/i.test(source)) return { skip: "nonMarkdownSource", detail: reportRow(row) };
  const sourcePath = archivedSourcePath(source);
  if (!sourcePath || !existsSync(sourcePath)) return { skip: "missingSource", detail: reportRow(row) };
  const target = String(row.target ?? "");
  const targetPath = join(workspace, target);
  if (!target || !existsSync(targetPath)) return { skip: "missingTarget", detail: reportRow(row) };

  const [rawSource, rawCurrent] = await Promise.all([
    readFile(sourcePath, "utf8"),
    readFile(targetPath, "utf8")
  ]);
  const propertyNames = propertyNamesByDatabaseId.get(row.databaseId) ?? [];
  const oldBody = cleanPreviouslyImportedMarkdown(rawSource, row.title);
  const cleanedBody = cleanExportedMarkdown(rawSource, row.title, propertyNames);
  const currentBody = normalizeBody(rawCurrent);
  if (currentBody === cleanedBody || oldBody === cleanedBody) return null;
  if (currentBody !== oldBody) return { skip: "edited", detail: reportRow(row) };
  return {
    change: {
      databaseId: row.databaseId,
      database: row.database,
      rowId: row.rowId,
      notionId: row.notionId,
      title: row.title,
      source: sourcePath,
      target,
      targetPath,
      currentBody,
      cleanedBody,
      removedLines: Math.max(0, currentBody.split("\n").length - cleanedBody.split("\n").length)
    }
  };
}

function cleanExportedMarkdown(raw, title, databasePropertyNames) {
  let body = removeExportedTitle(raw, title);
  body = stripLeadingExportIcon(body);
  const lines = body.split("\n");
  const properties = new Set(databasePropertyNames.map((name) => String(name).trim()).filter(Boolean));
  const generic = /^(Owner|Last edited time|Last edited by|Created by|Created time|Tags|Status|Type|Category|Priority|Date(?: \d+)?)\s*:\s/;
  let index = 0;
  if (properties.size > 0) {
    let metadataEnd = 0;
    let hasRecognizedProperty = false;
    while (metadataEnd < lines.length && lines[metadataEnd].trim() !== "") {
      const line = lines[metadataEnd];
      const propertyName = /^([^:\n]+?)\s*:\s*/.exec(line)?.[1]?.trim() ?? "";
      if (!propertyName) break;
      hasRecognizedProperty ||= generic.test(line) || properties.has(propertyName);
      metadataEnd += 1;
    }
    if (hasRecognizedProperty && (metadataEnd === lines.length || lines[metadataEnd].trim() === "")) {
      index = metadataEnd;
    }
  } else {
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }
      if (!generic.test(line)) break;
      index += 1;
    }
  }
  return normalizeBody(expandImportSentinels(lines.slice(index).join("\n").replace(/^\n+/, "")));
}

function cleanPreviouslyImportedMarkdown(raw, title) {
  const lines = removeExportedTitle(raw, title).split("\n");
  const generic = /^(Owner|Last edited time|Last edited by|Created by|Created time|Tags|Status|Type|Category|Priority|Date(?: \d+)?)\s*:\s/;
  let index = 0;
  while (index < lines.length) {
    if (!lines[index].trim() || generic.test(lines[index])) {
      index += 1;
      continue;
    }
    break;
  }
  const body = stripLeadingExportIcon(lines.slice(index).join("\n").replace(/^\n+/, ""));
  return normalizeBody(expandImportSentinels(body));
}

function expandImportSentinels(body) {
  return body
    .replace(/\{\{LOTIONVIEW:([^}]+)\}\}/g, (_match, escaped) => {
      const databaseId = escaped.replace(/\\(.)/g, "$1");
      return `\`\`\`lotion-view\ndatabase: ${databaseId}\nview: view_default\n\`\`\``;
    })
    .replace(/\{\{LOTIONTOC\}\}/g, "```lotion-toc\n```");
}

function removeExportedTitle(raw, title) {
  const lines = raw.replace(/^\uFEFF/, "").split("\n");
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  const heading = /^#+\s+(.+?)\s*$/.exec(lines[index] ?? "")?.[1];
  if (heading && relaxedEquals(heading, String(title ?? ""))) {
    index += 1;
    while (index < lines.length && !lines[index].trim()) index += 1;
  }
  return lines.slice(index).join("\n");
}

function stripLeadingExportIcon(body) {
  const match = /^<aside\b[\s\S]*?<\/aside>\s*/i.exec(body);
  if (!match) return body;
  const aside = parse(match[0], { lowerCaseTagName: true });
  const iconSrc = aside.querySelector("img")?.getAttribute("src")?.trim() ?? "";
  const iconEmoji = aside.querySelector("span.icon")?.text.trim() ?? "";
  const otherText = aside.text.replace(iconEmoji, "").replace(/\s+/g, "").trim();
  return (iconSrc || iconEmoji) && !otherText ? body.slice(match[0].length) : body;
}

function normalizeBody(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").replace(/^\n+/, "").trimEnd();
}

function relaxedEquals(left, right) {
  return String(left).replace(/[\s:]+/g, " ").trim() === String(right).replace(/[\s:]+/g, " ").trim();
}

function archivedSourcePath(source) {
  const segments = resolve(source).split(sep);
  const exportIndex = segments.findIndex((segment) => segment.startsWith("Export-"));
  return exportIndex < 0 ? null : join(originalRoot, ...segments.slice(exportIndex));
}

async function loadDatabasePropertyNames(root) {
  const result = new Map();
  const databaseRoot = join(root, "databases", "user");
  for (const entry of await readdir(databaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const schema = JSON.parse(await readFile(join(databaseRoot, entry.name, "schema.json"), "utf8"));
      result.set(schema.id, (schema.fields ?? []).map((field) => field.name));
    } catch {
      // Ignore incomplete non-database folders.
    }
  }
  return result;
}

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

function reportChange(change) {
  return {
    databaseId: change.databaseId,
    database: change.database,
    rowId: change.rowId,
    notionId: change.notionId,
    title: change.title,
    source: change.source,
    target: change.target,
    removedLines: change.removedLines
  };
}

function reportRow(row) {
  return {
    databaseId: row.databaseId,
    database: row.database,
    rowId: row.rowId,
    notionId: row.notionId,
    title: row.title,
    source: row.source,
    target: row.target
  };
}

async function atomicWrite(path, body) {
  const temporary = `${path}.repair-${process.pid}.tmp`;
  await writeFile(temporary, body, "utf8");
  await rename(temporary, path);
}
