#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const { repairMissingNotionViews } = await import(
  new URL("../dist-electron/main/services/notion-view-repair-service.js", import.meta.url)
);
const { resolveNotionCollectionRewrite } = await import(
  new URL("../dist-electron/main/services/notion-collection-resolver.js", import.meta.url)
);

const root = await mkdtemp(join(tmpdir(), "lotion-notion-view-repair-"));
const hashA = "13eb1111222233334444555566662087";
const hashB = "299e1111222233334444555566669835";
const collisionA = "abcd111122223333444455556666ef01";
const collisionB = "abcd777788889999aaaabbbbccccef01";
const bodyPath = "pages/repair-target.md";
const originalHtmlPath = "attachments/original/repair-target.html";

try {
  testSharedCollectionResolver();
  await mkdir(join(root, "databases", "system", "pages--db_pages"), { recursive: true });
  await mkdir(join(root, "databases", "user"), { recursive: true });
  await mkdir(join(root, "pages"), { recursive: true });
  await mkdir(join(root, "attachments", "original"), { recursive: true });

  const schemas = [
    { id: "db_first", name: "Repeated", notion_source_hash: hashA },
    { id: "db_second", name: "Repeated", notion_source_hash: hashB },
    { id: "db_collision_a", name: "Collision", notion_source_hash: collisionA },
    { id: "db_collision_b", name: "Collision", notion_source_hash: collisionB }
  ];
  for (const schema of schemas) {
    const folder = `${schema.id}--${schema.id}`;
    await mkdir(join(root, "databases", "user", folder), { recursive: true });
    await writeFile(
      join(root, "databases", "user", folder, "schema.json"),
      `${JSON.stringify({
        ...schema,
        created_time: "2026-01-01T00:00:00.000Z",
        updated_time: "2026-01-01T00:00:00.000Z",
        fields: [],
        defaultViewId: "view_default"
      }, null, 2)}\n`,
      "utf8"
    );
  }

  await writeFile(
    join(root, "databases", "system", "pages--db_pages", "data.csv"),
    [
      "id,body_path,notion_original_html",
      `page_one,${bodyPath},${originalHtmlPath}`,
      ""
    ].join("\n"),
    "utf8"
  );
  const originalMarkdown = [
    "# User-edited title",
    "",
    "Keep this paragraph byte-for-byte.",
    "",
    "_📂 Repeated (database not found)_",
    "",
    "User content between views.",
    "",
    "_📂 Repeated (database not found)_",
    "",
    "_📂 Collision (database not found)_",
    ""
  ].join("\n");
  await writeFile(join(root, bodyPath), originalMarkdown, "utf8");
  await writeFile(
    join(root, originalHtmlPath),
    [
      "<article class=\"page\"><header><h1 class=\"page-title\">Repair target</h1></header><div class=\"page-body\">",
      collection("Repeated", "11111111-1111-1111-1111-111111111111", `Repeated%20${hashA}.csv`),
      collection("Repeated", "22222222-2222-2222-2222-222222222222", "Repeated%20299e-9835.csv"),
      collection("Collision", "33333333-3333-3333-3333-333333333333", "Collision%20abcd-ef01.csv"),
      "</div></article>"
    ].join(""),
    "utf8"
  );

  const dryRun = await repairMissingNotionViews({ workspacePath: root });
  assert.equal(dryRun.mode, "dry-run");
  assert.equal(dryRun.sourcePlaceholders, 3);
  assert.equal(dryRun.repairablePlaceholders, 2);
  assert.equal(dryRun.unresolvedPlaceholders, 1);
  assert.deepEqual(dryRun.ambiguousShortIds, ["abcdef01"]);
  assert.equal(await readFile(join(root, bodyPath), "utf8"), originalMarkdown);

  const applied = await repairMissingNotionViews({
    workspacePath: root,
    apply: true,
    runId: "regression"
  });
  assert.equal(applied.changedFiles, 1);
  const repaired = await readFile(join(root, bodyPath), "utf8");
  assert.match(repaired, /database: db_first[\s\S]*database: db_second/);
  assert.match(repaired, /_📂 Collision \(database not found\)_/);
  assert.match(repaired, /^# User-edited title$/m);
  assert.match(repaired, /^Keep this paragraph byte-for-byte\.$/m);
  assert.match(repaired, /^User content between views\.$/m);
  assert.equal(
    await readFile(
      join(root, ".lotion", "repairs", "notion-view-regression", "backup", bodyPath),
      "utf8"
    ),
    originalMarkdown,
    "The complete original Markdown must be backed up before repair"
  );
  const result = JSON.parse(
    await readFile(
      join(root, ".lotion", "repairs", "notion-view-regression", "result.json"),
      "utf8"
    )
  );
  assert.equal(result.state, "complete");
  assert.equal(result.repairablePlaceholders, 2);
  await writeFile(join(root, bodyPath), originalMarkdown, "utf8");
  await assert.rejects(
    repairMissingNotionViews({
      workspacePath: root,
      apply: true,
      runId: "regression"
    }),
    /Repair run already exists/,
    "An existing repair run must never have its backups overwritten"
  );
  console.log("Notion embedded view repair regression tests passed.");
} finally {
  await rm(root, { recursive: true, force: true });
}

function collection(title, id, href) {
  return `<div class="collection-content" id="${id}"><h4 class="collection-title">${title}</h4><a href="${href}">${title}</a></div>`;
}

function testSharedCollectionResolver() {
  const title = "Unique title";
  const titleKey = Buffer.from(title).toString("base64").replace(/=+$/, "");
  const rewrites = new Map([
    ["notion-db-id:direct", "db_direct"],
    ["notion-db:path", "databases/user/path--db_path"],
    ["notion-row-db-id:rowhash", "db_row"],
    [`notion-db-id:${hashA}`, "db_first"],
    ["notion-db-short-id:299e9835", "db_second"],
    [`notion-db-title-id:${titleKey}`, "db_title"]
  ]);
  assert.equal(resolveNotionCollectionRewrite(rewrites, "direct", ""), "lotion-db:db_direct");
  assert.equal(resolveNotionCollectionRewrite(rewrites, "path", ""), "databases/user/path--db_path");
  assert.equal(
    resolveNotionCollectionRewrite(rewrites, "", "", { rowHashes: ["ROWHASH"], rowHrefs: [] }),
    "lotion-db:db_row"
  );
  assert.equal(
    resolveNotionCollectionRewrite(rewrites, "", "", {
      rowHashes: [],
      rowHrefs: [`Repeated%20${hashA}.csv`]
    }),
    "lotion-db:db_first"
  );
  assert.equal(
    resolveNotionCollectionRewrite(rewrites, "", "", {
      rowHashes: [],
      rowHrefs: ["Repeated%20299e-9835.csv"]
    }),
    "lotion-db:db_second"
  );
  assert.equal(resolveNotionCollectionRewrite(rewrites, "", title), "lotion-db:db_title");
  assert.equal(resolveNotionCollectionRewrite(rewrites, "", ""), null);
  assert.equal(
    resolveNotionCollectionRewrite(rewrites, "", "", {
      rowHashes: [],
      rowHrefs: [`Repeated%20${hashA}.csv`, "Repeated%20299e-9835.csv"]
    }),
    null,
    "Conflicting href evidence must not choose either database"
  );
  assert.equal(
    resolveNotionCollectionRewrite(rewrites, "", title, {
      rowHashes: [],
      rowHrefs: [`Repeated%20${hashA}.csv`, "Repeated%20299e-9835.csv"]
    }),
    null,
    "Conflicting href evidence must not be overridden by a unique-title fallback"
  );
  rewrites.set("notion-row-db-id:otherrow", "db_other_row");
  assert.equal(
    resolveNotionCollectionRewrite(rewrites, "", title, {
      rowHashes: ["rowhash", "otherrow"],
      rowHrefs: []
    }),
    null,
    "Conflicting row ownership must not be overridden by a unique-title fallback"
  );
}
