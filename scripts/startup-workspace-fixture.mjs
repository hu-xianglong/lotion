import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";

export async function createStartupWorkspaceFixture(options = {}) {
  const safeName = String(options.name ?? "startup").replace(/[^a-z0-9_-]+/gi, "_");
  const pageCount = Math.max(1, Math.floor(options.pageCount ?? 80));
  const databaseCount = Math.max(0, Math.floor(options.databaseCount ?? 3));
  const rowsPerDatabase = Math.max(0, Math.floor(options.rowsPerDatabase ?? 160));
  const root = await mkdtemp(join(tmpdir(), `lotion-first-launch-${safeName}-`));
  const now = "2026-06-12T12:00:00.000Z";
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const targetPageId = `pg_startup_target_${safeName}`;
  const targetTitle = `Startup Visible Target ${safeName}`;
  const otherPageIds = Array.from({ length: pageCount - 1 }, (_unused, index) => `pg_startup_${safeName}_${index + 1}`);
  const pageIds = [targetPageId, ...otherPageIds];
  const targetBodyPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(targetPageId, targetTitle));
  const databaseIds = Array.from({ length: databaseCount }, (_unused, index) => `db_startup_${safeName}_${index + 1}`);

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_first_launch_${safeName}`,
    name: `First Launch ${safeName}`,
    pages: pageIds,
    databases: databaseIds,
    systemDatabases: [PAGES_DATABASE_ID],
    recents: [{ type: "page", id: targetPageId }]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "tags"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: targetPageId,
      title: targetTitle,
      now,
      icon: "emoji:🚦",
      path: ["Startup Smoke", targetTitle],
      bodyPath: targetBodyPath,
      tags: "startup, benchmark"
    }),
    ...otherPageIds.map((id, index) => {
      const title = `Startup Fixture Page ${index + 1}`;
      return pageRecord({
        id,
        title,
        now,
        icon: "emoji:📄",
        path: ["Startup Smoke", "Pages", title],
        bodyPath: workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(id, title)),
        tags: index % 2 === 0 ? "startup" : "background"
      });
    })
  ]);
  await writeFile(join(root, targetBodyPath), startupTargetMarkdown(targetTitle, databaseIds), "utf8");
  for (let index = 0; index < otherPageIds.length; index += 1) {
    const id = otherPageIds[index];
    const title = `Startup Fixture Page ${index + 1}`;
    const bodyPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(id, title));
    await writeFile(
      join(root, bodyPath),
      `# ${title}\n\nBackground page ${index + 1} links to [${targetTitle}](${targetBodyPath}) for startup backlink work.\n`,
      "utf8"
    );
  }

  for (let index = 0; index < databaseIds.length; index += 1) {
    await writeStartupDatabase(root, {
      databaseId: databaseIds[index],
      name: `Startup Records ${index + 1}`,
      now,
      rows: rowsPerDatabase
    });
  }

  return {
    root,
    targetPageId,
    targetTitle,
    pageCount,
    databaseCount,
    rowsPerDatabase,
    databaseIds
  };
}

function startupTargetMarkdown(title, databaseIds) {
  const lines = [
    `# ${title}`,
    "",
    "Startup ready body for first-launch smoke.",
    "",
    "## First visible section",
    "",
    "The editor must become usable after the loading progress finishes.",
    "",
    "## Embedded references",
    ""
  ];
  for (const databaseId of databaseIds) {
    lines.push("```lotion-view", `database: ${databaseId}`, `view: ${DEFAULT_VIEW_ID}`, "```", "");
  }
  for (let index = 0; index < 500; index += 1) {
    if (index % 100 === 0) lines.push(`## Startup Section ${index / 100 + 1}`);
    lines.push(`Startup paragraph ${index + 1} keeps the fixture large enough to expose blank-screen regressions.`);
  }
  return `${lines.join("\n")}\n`;
}

async function writeStartupDatabase(root, { databaseId, name, now, rows }) {
  const folder = databaseFolderName(databaseId, name);
  const dir = join(root, "databases", "user", folder);
  await mkdir(join(dir, "pages"), { recursive: true });
  await mkdir(join(dir, "views"), { recursive: true });
  await writeJson(join(dir, "schema.json"), {
    id: databaseId,
    name,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo", color: "gray" }, { id: "done", name: "Done", color: "green" }] },
      { id: "score", name: "Score", type: "number" },
      { id: "notes", name: "Notes", type: "text" }
    ]
  });
  await writeJson(join(dir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title", "notes", "status", "score"]));
  await writeCsv(
    join(dir, "data.csv"),
    ["id", "created_time", "updated_time", "title", "status", "score", "notes"],
    Array.from({ length: rows }, (_unused, index) => ({
      id: `row_startup_${index + 1}`,
      created_time: now,
      updated_time: now,
      title: `${name} row ${index + 1}`,
      status: index % 3 === 0 ? "Done" : "Todo",
      score: String(index + 1),
      notes: `Startup database note ${index + 1} with enough text to make column loading non-trivial.`
    }))
  );
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

function pageRecord({ id, title, now, icon, path, bodyPath, tags = "" }) {
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
    tags,
    date: "",
    url: "",
    full_width: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
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

function defaultView(databaseId, fieldIds) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fieldIds,
    fieldOrder: fieldIds,
    wrapFieldIds: fieldIds,
    sorts: [],
    filters: []
  };
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
