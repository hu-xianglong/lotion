#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { SearchService } from "../dist-electron/main/services/search-service.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import { fileService } from "../dist-electron/main/services/file-service.js";
import { WorkspaceService } from "../dist-electron/main/services/workspace-service.js";

const args = parseArgs(process.argv.slice(2));
const coldThresholdMs = Number(process.env.LOTION_SEARCH_COLD_THRESHOLD_MS ?? 500);
const warmThresholdMs = Number(process.env.LOTION_SEARCH_WARM_THRESHOLD_MS ?? 300);

const root = await mkdtemp(join(tmpdir(), "lotion-search-bench-"));
try {
  const fixture = await createSearchFixture(root, args);
  const cases = [
    {
      name: "title",
      query: fixture.titleQuery,
      assertResult(result) {
        assert.equal(result.hits[0]?.title, fixture.titleQuery);
        assert.equal(result.hits[0]?.matchTypes?.includes("title"), true);
      }
    },
    {
      name: "body",
      query: fixture.bodyQuery,
      assertResult(result) {
        assert.equal(result.hits.some((hit) => hit.title === fixture.bodyPageTitle), true);
      }
    },
    {
      name: "field",
      query: fixture.fieldQuery,
      assertResult(result) {
        assert.equal(result.hits.some((hit) => hit.title === fixture.fieldRowTitle), true);
      }
    },
    {
      name: "database",
      query: fixture.databaseQuery,
      assertResult(result) {
        assert.equal(result.hits.some((hit) => hit.kind === "database" && hit.databaseName === fixture.databaseQuery), true);
      }
    },
    {
      name: "broad",
      query: fixture.broadQuery,
      assertResult(result) {
        assert.equal(result.hits.length > 50, true);
      }
    },
    {
      name: "relation",
      query: fixture.titleQuery,
      assertResult(result) {
        assert.equal(result.hits.some((hit) => hit.title === fixture.relatedTitle && hit.matchTypes?.includes("reference")), true);
      }
    },
    {
      name: "markdown-link",
      query: fixture.linkSourceQuery,
      assertResult(result) {
        assert.equal(result.hits.some((hit) => hit.title === fixture.linkTargetTitle && hit.matchTypes?.includes("reference")), true);
      }
    }
  ];

  const coldCases = [];
  let coldMaxMs = 0;
  for (const testCase of cases) {
    fileService.clearCache();
    const coldSearch = new SearchService(await openSearchWorkspace(root, `cold-${testCase.name}`));
    const timed = await timeQuery(coldSearch, testCase.query);
    testCase.assertResult(timed.result);
    coldMaxMs = Math.max(coldMaxMs, timed.ms);
    coldCases.push({
      name: testCase.name,
      query: testCase.query,
      ms: timed.ms,
      hits: timed.result.hits.length,
      truncated: timed.result.truncated
    });
  }

  const search = new SearchService(await openSearchWorkspace(root, "warm"));
  const warmCases = [];
  let warmMaxMedianMs = 0;
  for (const testCase of cases) {
    const runs = [];
    let result;
    for (let index = 0; index < args.iterations; index += 1) {
      const timed = await timeQuery(search, testCase.query);
      runs.push(timed.ms);
      result = timed.result;
    }
    assert.ok(result);
    testCase.assertResult(result);
    const medianMs = median(runs);
    warmMaxMedianMs = Math.max(warmMaxMedianMs, medianMs);
    warmCases.push({
      name: testCase.name,
      query: testCase.query,
      medianMs,
      maxMs: Number(Math.max(...runs).toFixed(3)),
      hits: result.hits.length,
      truncated: result.truncated
    });
  }

  const summary = {
    pages: args.pages,
    rows: args.rows,
    rowPages: Math.floor((args.rows - 1) / args.rowPageEvery) + 1,
    iterations: args.iterations,
    coldThresholdMs: args.check ? coldThresholdMs : undefined,
    warmThresholdMs: args.check ? warmThresholdMs : undefined,
    coldMaxMs: Number(coldMaxMs.toFixed(3)),
    warmMaxMedianMs: Number(warmMaxMedianMs.toFixed(3)),
    coldCases,
    warmCases
  };
  console.log(JSON.stringify(summary, null, 2));

  if (args.check) {
    if (summary.coldMaxMs > coldThresholdMs) {
      throw new Error(`Search cold max ${summary.coldMaxMs}ms exceeds ${coldThresholdMs}ms`);
    }
    if (summary.warmMaxMedianMs > warmThresholdMs) {
      throw new Error(`Search warm max median ${summary.warmMaxMedianMs}ms exceeds ${warmThresholdMs}ms`);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

async function createSearchFixture(root, options) {
  const now = "2026-01-01T00:00:00.000Z";
  const systemPagesDir = join(root, "databases", "system", databaseFolderName(PAGES_DATABASE_ID, "pages"));
  const systemEntitiesDir = join(root, "databases", "system", databaseFolderName(ENTITIES_DATABASE_ID, "entities"));
  const userDbId = "db_search_bench";
  const userDbName = "Bench Deals";
  const userDbDir = join(root, "databases", "user", databaseFolderName(userDbId, userDbName));
  await mkdir(join(systemPagesDir, "pages"), { recursive: true });
  await mkdir(join(systemPagesDir, "views"), { recursive: true });
  await mkdir(join(systemEntitiesDir, "views"), { recursive: true });
  await mkdir(join(userDbDir, "pages"), { recursive: true });
  await mkdir(join(userDbDir, "views"), { recursive: true });

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_search_bench",
    name: "Search Bench",
    pages: [],
    databases: [userDbId],
    systemDatabases: [PAGES_DATABASE_ID, ENTITIES_DATABASE_ID]
  });
  await writeJson(join(systemPagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(systemPagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "kind", "icon"]));
  await writeJson(join(systemEntitiesDir, "schema.json"), entitiesSchema(now));
  await writeJson(join(systemEntitiesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(ENTITIES_DATABASE_ID, ["kind", "title", "path", "icon"]));
  await writeJson(join(userDbDir, "schema.json"), userDatabaseSchema(userDbId, userDbName, now));
  await writeJson(join(userDbDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(userDbId, ["title", "notes", "relation"]));

  const pages = [];
  const entities = [{
    id: userDbId,
    kind: "database",
    title: userDbName,
    icon: "emoji:💼",
    path: ["Bench", userDbName],
    parent_id: "",
    database_id: userDbId,
    row_id: "",
    body_path: "",
    source_notion_hash: ""
  }];

  const linkTargetId = "pg_link_target";
  const linkTargetTitle = "Linked Reference Destination";
  const linkTargetFile = pageMarkdownFileName(linkTargetId, linkTargetTitle);
  const linkTargetPath = workspacePath("system", databaseFolderName(PAGES_DATABASE_ID, "pages"), "pages", linkTargetFile);
  pages.push(pageRecord({
    id: linkTargetId,
    title: linkTargetTitle,
    now,
    icon: "emoji:🔗",
    path: ["Bench", linkTargetTitle],
    bodyPath: linkTargetPath
  }));
  entities.push(entityRecord({
    id: linkTargetId,
    kind: "page",
    title: linkTargetTitle,
    icon: "emoji:🔗",
    path: ["Bench", linkTargetTitle],
    bodyPath: linkTargetPath
  }));
  await writeFile(join(root, linkTargetPath), "# Linked Reference Destination\n\nTarget page reached through markdown-link expansion.\n", "utf8");

  const bodyPageId = "pg_body_focus";
  const bodyPageTitle = "Needle Body Page";
  const bodyQuery = "needle body token 417";
  const bodyPageFile = pageMarkdownFileName(bodyPageId, bodyPageTitle);
  const bodyPagePath = workspacePath("system", databaseFolderName(PAGES_DATABASE_ID, "pages"), "pages", bodyPageFile);
  pages.push(pageRecord({
    id: bodyPageId,
    title: bodyPageTitle,
    now,
    icon: "emoji:📄",
    path: ["Bench", bodyPageTitle],
    bodyPath: bodyPagePath
  }));
  entities.push(entityRecord({
    id: bodyPageId,
    kind: "page",
    title: bodyPageTitle,
    icon: "emoji:📄",
    path: ["Bench", bodyPageTitle],
    bodyPath: bodyPagePath
  }));
  await writeFile(join(root, bodyPagePath), `# ${bodyPageTitle}\n\nThis page contains ${bodyQuery} for body search.\n`, "utf8");

  const linkSourceId = "pg_link_source";
  const linkSourceTitle = "Markdown Link Source";
  const linkSourceFile = pageMarkdownFileName(linkSourceId, linkSourceTitle);
  const linkSourcePath = workspacePath("system", databaseFolderName(PAGES_DATABASE_ID, "pages"), "pages", linkSourceFile);
  pages.push(pageRecord({
    id: linkSourceId,
    title: linkSourceTitle,
    now,
    icon: "emoji:🧭",
    path: ["Bench", linkSourceTitle],
    bodyPath: linkSourcePath
  }));
  entities.push(entityRecord({
    id: linkSourceId,
    kind: "page",
    title: linkSourceTitle,
    icon: "emoji:🧭",
    path: ["Bench", linkSourceTitle],
    bodyPath: linkSourcePath
  }));
  await writeFile(
    join(root, linkSourcePath),
    `# ${linkSourceTitle}\n\nThis source links to [${linkTargetTitle}](${linkTargetPath}).\n`,
    "utf8"
  );

  for (let index = 0; index < options.pages; index += 1) {
    const id = `pg_bulk_${index}`;
    const title = `Bulk Page ${index}`;
    const file = pageMarkdownFileName(id, title);
    const bodyPath = workspacePath("system", databaseFolderName(PAGES_DATABASE_ID, "pages"), "pages", file);
    pages.push(pageRecord({
      id,
      title,
      now,
      icon: "emoji:📄",
      path: ["Bench", "Bulk", title],
      bodyPath
    }));
    entities.push(entityRecord({
      id,
      kind: "page",
      title,
      icon: "emoji:📄",
      path: ["Bench", "Bulk", title],
      bodyPath
    }));
    const body = index % 3 === 0
      ? `# ${title}\n\nCommon searchable benchmark text ${index}. Broad common searchable token.\n`
      : `# ${title}\n\nRegular synthetic body ${index}.\n`;
    await writeFile(join(root, bodyPath), body, "utf8");
  }

  const rows = [];
  const titleQuery = "Alpha Target";
  const fieldQuery = "Needle field token";
  const relatedTitle = "Related Destination";
  const relatedId = "row_related";
  for (let index = 0; index < options.rows; index += 1) {
    const id = index === 1 ? relatedId : `row_${index}`;
    const title = index === 0 ? titleQuery : index === 1 ? relatedTitle : `Deal Row ${index}`;
    const pageFile = index % options.rowPageEvery === 0 ? pageMarkdownFileName(id, title) : "";
    const relation = index === 0
      ? JSON.stringify([{ entityId: relatedId, kind: "row", databaseId: userDbId, rowId: relatedId, titleSnapshot: relatedTitle }])
      : "";
    const notes = index === 2
      ? `${fieldQuery} from a CSV field`
      : index % 5 === 0
        ? "Common searchable benchmark text from field"
        : `Synthetic field ${index}`;
    rows.push({
      id,
      created_time: now,
      updated_time: now,
      title,
      page_file: pageFile,
      row_icon: index === 0 ? "emoji:🎯" : "emoji:📌",
      notes,
      relation
    });
    const bodyPath = pageFile
      ? workspacePath("user", databaseFolderName(userDbId, userDbName), "pages", pageFile)
      : "";
    if (bodyPath) {
      await writeFile(
        join(root, bodyPath),
        `# ${title}\n\nRow page body ${index}. ${index === 0 ? "Alpha Target row page source." : ""}\n`,
        "utf8"
      );
    }
    entities.push(entityRecord({
      id,
      kind: "row",
      title,
      icon: index === 0 ? "emoji:🎯" : "emoji:📌",
      path: ["Bench", userDbName, title],
      parentId: userDbId,
      parentKind: "database",
      databaseId: userDbId,
      rowId: id,
      bodyPath
    }));
  }

  await writeCsv(join(systemPagesDir, "data.csv"), pagesFieldIds(), pages);
  await writeCsv(join(systemEntitiesDir, "data.csv"), entitiesFieldIds(), entities);
  await writeCsv(join(userDbDir, "data.csv"), userFieldIds(), rows);

  return {
    titleQuery,
    bodyQuery,
    bodyPageTitle,
    fieldQuery,
    fieldRowTitle: "Deal Row 2",
    databaseQuery: userDbName,
    broadQuery: "common searchable",
    relatedTitle,
    linkSourceQuery: linkSourceTitle,
    linkTargetTitle
  };
}

async function timeQuery(search, query) {
  const started = performance.now();
  const result = await search.query(query);
  return {
    ms: Number((performance.now() - started).toFixed(3)),
    result
  };
}

async function openSearchWorkspace(root, label) {
  const safeLabel = String(label).replace(/[^a-z0-9_-]+/gi, "_");
  const workspace = new WorkspaceService(new AppConfigService(join(root, `.app-config-${safeLabel}.json`)));
  await workspace.open(root);
  return workspace;
}

function parseArgs(argv) {
  const parsed = {
    check: false,
    pages: 360,
    rows: 1200,
    rowPageEvery: 8,
    iterations: 4
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--check") {
      parsed.check = true;
    } else if (arg === "--pages") {
      parsed.pages = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--pages=")) {
      parsed.pages = numberArg("--pages", arg.slice("--pages=".length));
    } else if (arg === "--rows") {
      parsed.rows = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--rows=")) {
      parsed.rows = numberArg("--rows", arg.slice("--rows=".length));
    } else if (arg === "--row-page-every") {
      parsed.rowPageEvery = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--row-page-every=")) {
      parsed.rowPageEvery = numberArg("--row-page-every", arg.slice("--row-page-every=".length));
    } else if (arg === "--iterations") {
      parsed.iterations = numberArg(arg, value);
      index += 1;
    } else if (arg.startsWith("--iterations=")) {
      parsed.iterations = numberArg("--iterations", arg.slice("--iterations=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (parsed.pages < 1 || parsed.rows < 3 || parsed.rowPageEvery < 1 || parsed.iterations < 1) {
    throw new Error(`Invalid benchmark options: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function numberArg(name, value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Invalid ${name} value: ${value}`);
  return Math.floor(num);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeCsv(path, fields, records) {
  const lines = [
    fields.map(csvCell).join(","),
    ...records.map((record) => fields.map((field) => csvCell(record[field] ?? "")).join(","))
  ];
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function workspacePath(group, dbFolder, ...parts) {
  return ["databases", group, dbFolder, ...parts].join("/");
}

function pagesFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
    "title",
    "kind",
    "body_path",
    "icon",
    "cover",
    "cover_offset",
    "path",
    "parent_id",
    "tags",
    "date",
    "url",
    "full_width",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function entitiesFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
    "kind",
    "title",
    "icon",
    "path",
    "parent_id",
    "database_id",
    "row_id",
    "body_path",
    "source_notion_hash"
  ];
}

function userFieldIds() {
  return ["id", "created_time", "updated_time", "title", "page_file", "row_icon", "notes", "relation"];
}

function pageRecord({ id, title, now, icon, path, bodyPath }) {
  return {
    id,
    created_time: now,
    updated_time: now,
    title,
    kind: "page",
    body_path: bodyPath,
    icon,
    cover: "",
    cover_offset: "",
    path: serializePathValue(path),
    parent_id: "",
    tags: "",
    date: "",
    url: "",
    full_width: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
  };
}

function entityRecord({
  id,
  kind,
  title,
  icon,
  path,
  parentId = "",
  parentKind = "page",
  databaseId = "",
  rowId = "",
  bodyPath = ""
}) {
  return {
    id,
    created_time: "2026-01-01T00:00:00.000Z",
    updated_time: "2026-01-01T00:00:00.000Z",
    kind,
    title,
    icon,
    path: serializePathValue(path),
    parent_id: parentId ? JSON.stringify([{ entityId: parentId, kind: parentKind }]) : "",
    database_id: databaseId,
    row_id: rowId,
    body_path: bodyPath,
    source_notion_hash: ""
  };
}

function pagesSchema(now) {
  return {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "cover", name: "Cover", type: "text" },
      { id: "cover_offset", name: "Cover offset", type: "number" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "text" },
      { id: "url", name: "URL", type: "url" },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  };
}

function entitiesSchema(now) {
  return {
    id: ENTITIES_DATABASE_ID,
    name: "entities",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "kind", name: "Kind", type: "select" },
      { id: "title", name: "Name", type: "text" },
      { id: "icon", name: "Icon", type: "text" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "source_notion_hash", name: "Source Notion hash", type: "text", system: true, hidden: true }
    ]
  };
}

function userDatabaseSchema(id, name, now) {
  return {
    id,
    name,
    path: ["Bench", name],
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "row_icon", name: "Icon", type: "text" },
      { id: "notes", name: "Notes", type: "text" },
      { id: "relation", name: "Relation", type: "entity_ref" }
    ]
  };
}

function defaultView(databaseId, fields) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fields,
    fieldOrder: fields,
    wrapFieldIds: fields,
    sorts: [],
    filters: []
  };
}
