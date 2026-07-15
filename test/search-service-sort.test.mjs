import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SearchService } from "../dist-electron/main/services/search-service.js";
import { ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";

test("search service sorts hits by relevance, updated date, and created date with stable tie breaks", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-sort-"));
  try {
    const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
    const entitiesFolder = databaseFolderName(ENTITIES_DATABASE_ID, "entities");
    const pagesDir = join(root, "databases", "system", pagesFolder);
    const entitiesDir = join(root, "databases", "system", entitiesFolder);
    await mkdir(join(pagesDir, "pages"), { recursive: true });
    await mkdir(entitiesDir, { recursive: true });

    const datedPages = [
      {
        id: "pg_alpha",
        title: "Alpha Older",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-02-01T00:00:00.000Z"
      },
      {
        id: "pg_beta",
        title: "Beta Newer",
        created: "2026-01-03T00:00:00.000Z",
        updated: "2026-02-03T00:00:00.000Z"
      },
      {
        id: "pg_gamma",
        title: "Gamma Middle",
        created: "2026-01-02T00:00:00.000Z",
        updated: "2026-02-02T00:00:00.000Z"
      }
    ];
    const noDatePage = {
      id: "pg_delta",
      title: "Delta No Date",
      created: "",
      updated: ""
    };
    const pages = [...datedPages, noDatePage];

    for (const page of pages) {
      const bodyPath = pageBodyPath(pagesFolder, page);
      await writeFile(join(root, bodyPath), `# ${page.title}\n\nsorttoken body for ${page.title}.\n`, "utf8");
    }

    await writeFile(join(pagesDir, "data.csv"), [
      "id,created_time,updated_time,title,body_path,icon,path",
      ...pages.map((page) => csvRow([
        page.id,
        page.created,
        page.updated,
        page.title,
        pageBodyPath(pagesFolder, page),
        "emoji:🔎",
        `["Search","${page.title}"]`
      ])),
      ""
    ].join("\n"), "utf8");

    await writeFile(join(entitiesDir, "data.csv"), [
      "id,created_time,updated_time,kind,title,icon,path,parent_id,database_id,row_id,body_path,source_notion_hash",
      ...datedPages.map((page) => csvRow([
        page.id,
        page.created,
        page.updated,
        "page",
        page.title,
        "emoji:🔎",
        `["Search","${page.title}"]`,
        "",
        "",
        "",
        pageBodyPath(pagesFolder, page),
        ""
      ])),
      ""
    ].join("\n"), "utf8");

    const search = new SearchService({ requirePaths: () => ({ root }) });

    assert.deepEqual(searchTitles(await search.query("sorttoken")), [
      "Alpha Older",
      "Beta Newer",
      "Delta No Date",
      "Gamma Middle"
    ]);
    assert.deepEqual(searchTitles(await search.query("sorttoken", { sort: "updated_desc" })), [
      "Beta Newer",
      "Gamma Middle",
      "Alpha Older",
      "Delta No Date"
    ]);
    assert.deepEqual(searchTitles(await search.query("sorttoken", { sort: "updated_asc" })), [
      "Alpha Older",
      "Gamma Middle",
      "Beta Newer",
      "Delta No Date"
    ]);
    assert.deepEqual(searchTitles(await search.query("sorttoken", { sort: "created_desc" })), [
      "Beta Newer",
      "Gamma Middle",
      "Alpha Older",
      "Delta No Date"
    ]);
    assert.deepEqual(searchTitles(await search.query("sorttoken", { sort: "created_asc" })), [
      "Alpha Older",
      "Gamma Middle",
      "Beta Newer",
      "Delta No Date"
    ]);
    assert.deepEqual(searchTitles(await search.query("sorttoken", { sort: "not-a-sort" })), [
      "Alpha Older",
      "Beta Newer",
      "Delta No Date",
      "Gamma Middle"
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function searchTitles(result) {
  return result.hits.map((hit) => hit.title);
}

function pageBodyPath(pagesFolder, page) {
  return ["databases", "system", pagesFolder, "pages", pageMarkdownFileName(page.id, page.title)].join("/");
}

function csvRow(cells) {
  return cells.map(csvCell).join(",");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
