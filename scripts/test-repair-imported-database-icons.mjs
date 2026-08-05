#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const script = fileURLToPath(new URL("./repair-imported-database-icons.mjs", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "lotion-database-icon-repair-test-"));
const workspace = join(root, "workspace");
const databaseRoot = join(workspace, "databases", "user");
const originalRoot = join(workspace, "attachments", "original");

const LOCAL_HASH = "11111111222233334444555555555555";
const EMOJI_HASH = "22222222333344445555666666666666";
const REMOTE_HASH = "33333333444455556666777777777777";
const CONFLICT_HASH = "44444444555566667777888888888888";
const DECOY_HASH = "55555555666677778888999999999999";
const LINK_HASH = "66666666777788889999000000000000";
const LINK_SOURCE_HASH = "77777777888899990000111111111111";

try {
  const originalSchemas = new Map();
  await writeSchema("Local Icon", "db_local", LOCAL_HASH, originalSchemas);
  await writeSchema("Emoji Icon", "db_emoji", EMOJI_HASH, originalSchemas);
  await writeSchema("Remote Icon", "db_remote", REMOTE_HASH, originalSchemas);
  await writeSchema("Conflicting Icon", "db_conflict", CONFLICT_HASH, originalSchemas);
  await writeSchema("Linked Icon", "db_linked", LINK_HASH, originalSchemas);

  const localWrapper = join(originalRoot, "Export-A", "Local Icon", `Local Icon ${LOCAL_HASH}.html`);
  await writeHtml(
    localWrapper,
    notionPage("Local Icon", `<div class="page-header-icon"><img class="icon" src="database-icon.png"/></div>`)
  );
  await writeFile(join(dirname(localWrapper), "database-icon.png"), "local icon bytes", "utf8");

  await writeHtml(
    join(originalRoot, "Export-A", `Emoji Icon ${EMOJI_HASH}.html`),
    notionPage("Emoji Icon", `<div class="page-header-icon"><span class="icon" data-emoji="📚"></span></div>`)
  );
  await writeHtml(
    join(originalRoot, "Export-A", `Remote Icon ${REMOTE_HASH}.html`),
    notionPage(
      "Remote Icon",
      `<div class="page-header-icon"><img class="icon" src="missing-database-icon.svg"/></div>`,
      "",
      ` data-notion-page-icon="https://app.notion.com/icons/database_blue.svg"`
    )
  );
  await writeHtml(
    join(originalRoot, "Export-A", `Conflicting Icon ${CONFLICT_HASH}.html`),
    notionPage("Conflicting Icon", `<div class="page-header-icon"><span class="icon">A</span></div>`)
  );
  await writeHtml(
    join(originalRoot, "Export-B", `Conflicting Icon ${CONFLICT_HASH}.html`),
    notionPage("Conflicting Icon", `<div class="page-header-icon"><span class="icon">B</span></div>`)
  );
  await writeHtml(
    join(originalRoot, "Export-A", `Local Icon ${DECOY_HASH}.html`),
    notionPage(
      "Local Icon",
      `<div class="page-header-icon"><span class="icon">WRONG</span></div>`,
      `<a href="Local%20Icon%20${LOCAL_HASH}.csv">Local Icon</a>`
    )
  );
  await writeHtml(
    join(originalRoot, "Export-A", `Database Index ${LINK_SOURCE_HASH}.html`),
    notionPage(
      "Database Index",
      "",
      `<figure class="link-to-page"><a href="Linked%20Icon%20${LINK_HASH}.html"><span class="icon" data-emoji="🗂️"></span>Linked Icon</a></figure>`
    )
  );
  const dryRun = await runRepair();
  assert.equal(dryRun.summary.missingDatabaseIcons, 5);
  assert.equal(dryRun.summary.exactIdentityHtmlFiles, 5);
  assert.equal(dryRun.summary.exactLinkHints, 1);
  assert.equal(dryRun.summary.recoverableIcons, 4);
  assert.equal(dryRun.summary.localIcons, 1);
  assert.equal(dryRun.summary.emojiIcons, 2);
  assert.equal(dryRun.summary.remoteIcons, 1);
  assert.equal(dryRun.summary.ambiguousIcons, 1);
  assert.deepEqual(dryRun.ambiguousNotionHashes, [CONFLICT_HASH]);
  assert.equal(
    dryRun.sample.some((change) => change.icon === "emoji:WRONG"),
    false,
    "A page that merely links to a database CSV must not donate its icon"
  );

  const applied = await runRepair("--apply");
  assert.equal(applied.summary.recoverableIcons, 4);
  assert.ok(existsSync(applied.reportPath), "Applied repair should write an audit report");

  const localSchema = await readSchema("Local Icon", "db_local");
  const emojiSchema = await readSchema("Emoji Icon", "db_emoji");
  const remoteSchema = await readSchema("Remote Icon", "db_remote");
  const conflictSchema = await readSchema("Conflicting Icon", "db_conflict");
  const linkedSchema = await readSchema("Linked Icon", "db_linked");
  assert.match(localSchema.icon, /^attachments\/images\/[0-9a-f]+-database-icon\.png$/);
  assert.ok(existsSync(join(workspace, localSchema.icon)), "Local icon attachment should be copied");
  assert.equal(emojiSchema.icon, "emoji:📚");
  assert.equal(remoteSchema.icon, "https://app.notion.com/icons/database_blue.svg");
  assert.equal(conflictSchema.icon, undefined, "Conflicting exact sources should remain unchanged");
  assert.equal(linkedSchema.icon, "emoji:🗂️", "Exact link targets should recover a missing database icon");

  for (const [key, original] of originalSchemas) {
    const [name, id] = key.split("::");
    const current = await readSchema(name, id);
    delete current.icon;
    assert.deepEqual(current, original, `Repair should preserve non-icon schema data for ${name}`);
  }

  const backupSchemas = await recursivelyListFiles(join(applied.backupRoot, "schemas"));
  assert.equal(backupSchemas.filter((path) => path.endsWith("schema.json")).length, 4);

  const postApply = await runRepair();
  assert.equal(postApply.summary.missingDatabaseIcons, 1);
  assert.equal(postApply.summary.recoverableIcons, 0);
  assert.equal(postApply.summary.ambiguousIcons, 1);

  console.log("Imported database icon repair regression tests passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}

async function writeSchema(name, id, notionHash, originals) {
  const folder = `${name.replaceAll(" ", "_")}--${id}`;
  const schema = {
    id,
    name,
    notion_source_hash: notionHash,
    created_time: "2026-08-05T00:00:00.000Z",
    updated_time: "2026-08-05T00:00:00.000Z",
    fields: [{ id: "title", name: "Name", type: "text" }],
    defaultViewId: "view_default",
    custom_test_value: `keep-${id}`
  };
  await mkdir(join(databaseRoot, folder), { recursive: true });
  await writeFile(join(databaseRoot, folder, "schema.json"), `${JSON.stringify(schema, null, 2)}\n`, "utf8");
  originals.set(`${name}::${id}`, structuredClone(schema));
}

async function readSchema(name, id) {
  const folder = `${name.replaceAll(" ", "_")}--${id}`;
  return JSON.parse(await readFile(join(databaseRoot, folder, "schema.json"), "utf8"));
}

async function writeHtml(path, html) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, "utf8");
}

function notionPage(title, headerContent, body = "", articleAttributes = "") {
  return `<!doctype html><html><body><article class="page"${articleAttributes}><header>${headerContent}<h1 class="page-title">${title}</h1></header><div class="page-body">${body}</div></article></body></html>`;
}

async function runRepair(...extraArgs) {
  const { stdout } = await execFileAsync(process.execPath, [script, workspace, ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

async function recursivelyListFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await recursivelyListFiles(path));
    else files.push(path);
  }
  return files;
}
