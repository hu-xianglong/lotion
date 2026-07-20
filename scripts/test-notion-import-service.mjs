#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const { NotionImportService } = await import(
  new URL("../dist-electron/main/services/notion-import-service.js", import.meta.url)
);
const { runNotionAudit, formatNotionAuditMarkdown, formatNotionAuditText } = await import(
  new URL("../dist-electron/main/services/notion-audit-service.js", import.meta.url)
);
const execFileAsync = promisify(execFile);

const DB_HASH = "11111111222233334444555555555555";
const ROW_HASH = "aaaaaaaa111111112222222233333333";
const EXTRA_SYSTEM_ONLY_ROW_HASH = "bbbbbbbb222222223333333344444444";
const SLASH_TITLE_ROW_HASH = "abababab111111112222222233333333";
const PAGE_HASH = "bbbbbbbb111111112222222233333333";
const INLINE_DB_HASH = "12345678123412341234123456789012";
const INLINE_ROW_HASH = "abcdefabcdefabcdefabcdefabcdef12";
const ROW_INLINE_DB_HASH = "22222222333344445555666666666666";
const ROW_INLINE_ROW_HASH = "33333333444455556666777777777777";
const UNTITLED_DB_HASH = "99999999111122223333444444444444";
const UNTITLED_DB_HASH_2 = "88888888111122223333444444444444";
const UNTITLED_ROW_HASH = "eeeeeeee111111112222222233333333";
const DUP_TITLE_DB_HASH = "77777777111122223333444455556666";
const DUP_TITLE_ALPHA_ROW_HASH = "aaaaaaaa222233334444555566667777";
const DUP_TITLE_BETA_ROW_HASH = "bbbbbbbb222233334444555566667777";
const DUP_TITLE_ALPHA_TARGET_HASH = "cccccccc222233334444555566667777";
const DUP_TITLE_BETA_TARGET_HASH = "dddddddd222233334444555566667777";
const EMPTY_NESTED_PAGE_HASH = "12121212111122223333444455556666";
const MD_ICON_PAGE_HASH = "34343434111122223333444455556666";
const MD_DB_WRAPPER_PAGE_HASH = "56565656111122223333444455556666";
const MD_FIELDS_DB_HASH = "67676767111122223333444455556666";
const BOM_MATCH_DB_HASH = "71550a25341f451885c8fec1bbe367fe";
const BOM_MATCH_ALEX_ROW_HASH = "7d1c6100c5e54182aa5e5dadcfba8e2c";
const BOM_MATCH_EMPTY_ROW_HASH = "03ddb12f9bf54717a10ce65bf60f2d8a";
const BOM_MATCH_EMPTY_ROW_HASH_2 = "bff6437d96344def848f2351a37ed71b";
const MERGED_EXPORT_UUID = "12345678-1234-1234-1234-123456789abc";
const SEPARATE_MARKDOWN_EXPORT_UUID = "87654321-4321-4321-4321-cba987654321";
const MERGED_PAGE_HASH = "99999999aaaabbbbccccdddddddddddd";
const SPLIT_ROW_DB_HASH = "44444444111122223333444455556666";
const SPLIT_ROW_HASH = "55555555111122223333444455556666";
const LINKED_COLLECTION_VIEW_HASH = "90909090111122223333444455556666";
const VISION_PARENT_PAGE_HASH = "23232323111122223333444455556666";
const VISION_TOGGLE_PAGE_HASH = "aaaaaaaa111122223333444455556666";
const SAME_NAME_PAGE_HASH_1 = "10101010111122223333444455556666";
const SAME_NAME_PAGE_HASH_2 = "20202020111122223333444455556666";
const MODERN_EXTERNAL_ICON_DB_HASH = "30303030111122223333444455556666";
const MODERN_EMOJI_ICON_DB_HASH = "40404040111122223333444455556666";
const MODERN_LOCAL_ICON_DB_HASH = "50505050111122223333444455556666";
const MODERN_NO_ICON_DB_HASH = "60606060111122223333444455556666";
const MD_FIELDS_ALPHA_ROW_HASH = "70707070111122223333444455556666";
const MD_FIELDS_BETA_ROW_HASH = "80808080111122223333444455556666";

function notionPage(title, body, properties = "", headerPrefix = "") {
  return `<!doctype html><html><body><article class="page sans"><header>${headerPrefix}<h1 class="page-title">${title}</h1>${properties}</header><div class="page-body">${body}</div></article></body></html>`;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (ch === "\"") {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.length > 0));
}

function rowsAsObjects(csv) {
  const [headers, ...rows] = parseCsv(csv);
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

function serializeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function serializeCsv(rows) {
  return `${rows.map((row) => row.map(serializeCsvCell).join(",")).join("\n")}\n`;
}

function updateCsvCell(csv, matchHeader, matchValue, targetHeader, targetValue) {
  const rows = parseCsv(csv);
  const headers = rows[0] ?? [];
  const matchIndex = headers.indexOf(matchHeader);
  const targetIndex = headers.indexOf(targetHeader);
  assert.notEqual(matchIndex, -1, `Expected CSV header ${matchHeader}`);
  assert.notEqual(targetIndex, -1, `Expected CSV header ${targetHeader}`);
  const row = rows.slice(1).find((candidate) => candidate[matchIndex] === matchValue);
  assert.ok(row, `Expected CSV row with ${matchHeader}=${matchValue}`);
  while (row.length < headers.length) row.push("");
  row[targetIndex] = targetValue;
  return serializeCsv(rows);
}

function firstEntityRef(cell) {
  const refs = cell ? JSON.parse(cell) : [];
  return Array.isArray(refs) ? refs[0] : undefined;
}

function storedPathSegments(cell) {
  const parsed = cell ? JSON.parse(cell) : [];
  assert.ok(Array.isArray(parsed), `Expected stored path to be a JSON array, got ${cell}`);
  return parsed;
}

const root = await mkdtemp(join(tmpdir(), "lotion-notion-import-test-"));
const source = join(root, "source");
const target = join(root, "workspace");

try {
  await mkdir(join(source, "Tasks"), { recursive: true });
  await writeFile(
    join(source, `Tasks ${DB_HASH}.csv`),
    "Name,URL,Balance,Done,Owner,Notes\nTask One,https://example.com,\"$1,234.50\",Yes,Alex,This imported task has a long explanatory note for ordering\n2023/11/05 Daily,https://slash.example,\"($8,300.00)\",No,Sam,Another substantial note should make this column rich\n,,,,,\n",
    "utf8"
  );
  await writeFile(
    join(source, "Tasks", `Task One ${ROW_HASH}.html`),
    notionPage(
      "Task One",
      `<p>Imported row body.</p><img src="Task%20One%20${ROW_HASH}/chart.png"><div class="collection-content" id="${ROW_INLINE_DB_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><h4 class="collection-title"></h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th>Name</th><th>Text</th></tr></thead><tbody><tr id="${ROW_INLINE_ROW_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><td class="cell-title"><a href="Task%20One/Untitled/Nested%20Alpha%20${ROW_INLINE_ROW_HASH}.html">Nested Alpha</a></td><td>row-inline-value</td></tr></tbody></table></div></div>`,
      `<table class="properties"><tbody><tr class="property-row property-row-url"><th>URL</th><td><a href="https://example.com">https://example.com</a></td></tr><tr class="property-row property-row-number"><th>Balance</th><td>$1,234.50</td></tr><tr class="property-row property-row-checkbox"><th>Done</th><td>Yes</td></tr><tr class="property-row property-row-person"><th>Owner</th><td><span class="user">Alex</span></td></tr></tbody></table>`,
      `<img class="page-cover-image" src="Task%20One%20${ROW_HASH}/row-cover.jpg" style="object-position:center 65%"/>`
    ),
    "utf8"
  );
  await mkdir(join(source, "Tasks", `Task One ${ROW_HASH}`), { recursive: true });
  await writeFile(join(source, "Tasks", `Task One ${ROW_HASH}`, "chart.png"), "fake png", "utf8");
  await writeFile(join(source, "Tasks", `Task One ${ROW_HASH}`, "row-cover.jpg"), "fake row cover", "utf8");
  await writeFile(
    join(source, `Tasks ${DB_HASH}.html`),
    notionPage(
      "Tasks",
      `<div class="collection-content" id="${DB_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><h4 class="collection-title">Tasks</h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th>Name</th></tr></thead><tbody><tr id="${ROW_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><td class="cell-title"><a href="Tasks/Task%20One%20${ROW_HASH}.html">Task One</a></td></tr></tbody></table></div></div>`,
      "",
      `<img class="page-cover-image" src="https://www.notion.so/images/page-cover/met_klimt_1912.jpg" style="object-position:center 15%"/>`
    ),
    "utf8"
  );
  const modernDatabaseFixtures = [
    {
      title: "Modern External Icon",
      hash: MODERN_EXTERNAL_ICON_DB_HASH,
      header: '<div class="page-header-icon"><img class="icon notion-static-icon" src="https://app.notion.com/icons/database_gray.svg"/></div>'
    },
    {
      title: "Modern Emoji Icon",
      hash: MODERN_EMOJI_ICON_DB_HASH,
      header: '<div class="page-header-icon"><span class="icon">📊</span></div>'
    },
    {
      title: "Modern Local Icon",
      hash: MODERN_LOCAL_ICON_DB_HASH,
      header: `<div class="page-header-icon"><img class="icon" src="Modern%20Local%20Icon%20${MODERN_LOCAL_ICON_DB_HASH}/icon.png"/></div>`
    },
    {
      title: "Modern No Icon",
      hash: MODERN_NO_ICON_DB_HASH,
      header: ""
    }
  ];
  for (const fixture of modernDatabaseFixtures) {
    const csvName = `${fixture.title} ${fixture.hash}.csv`;
    await writeFile(join(source, csvName), "Name,Value\nExample,1\n", "utf8");
    await writeFile(
      join(source, `${fixture.title} ${fixture.hash}.html`),
      notionPage(
        fixture.title,
        `<a href="${encodeURIComponent(csvName)}"><code>${csvName}</code></a><br/><div style="font-size:0.7em"><b>Metadata: Filters &amp; Sorts</b><br/>The following filters and sorts are applied to the database<table><tbody><tr><th>Property name</th><th>Type</th><th>Condition</th></tr></tbody></table><br/></div>`,
        "",
        fixture.header
      ),
      "utf8"
    );
  }
  await mkdir(join(source, `Modern Local Icon ${MODERN_LOCAL_ICON_DB_HASH}`), { recursive: true });
  await writeFile(
    join(source, `Modern Local Icon ${MODERN_LOCAL_ICON_DB_HASH}`, "icon.png"),
    "fake local database icon",
    "utf8"
  );
  await writeFile(
    join(source, "Tasks", `2023 11 05 Daily ${SLASH_TITLE_ROW_HASH}.html`),
    notionPage("2023/11/05 Daily", "<p>Slash title row body.</p>"),
    "utf8"
  );
  await writeFile(
    join(source, "Tasks", `Untitled ${EXTRA_SYSTEM_ONLY_ROW_HASH}.html`),
    notionPage(
      "",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-created_time"><th>Created time</th><td><time>August 15, 2024 9:00 AM</time></td></tr></tbody></table>`
    ),
    "utf8"
  );
  await mkdir(join(source, "Tasks", "Task One", "Untitled"), { recursive: true });
  await writeFile(
    join(source, "Tasks", "Task One", `Untitled ${ROW_INLINE_DB_HASH}.csv`),
    "Name,Text\nNested Alpha,row-inline-value\n",
    "utf8"
  );
  await writeFile(
    join(source, "Tasks", "Task One", "Untitled", `Nested Alpha ${ROW_INLINE_ROW_HASH}.html`),
    notionPage(
      "Nested Alpha",
      "<p>Nested row body.</p>",
      `<table class="properties"><tbody><tr class="property-row property-row-text"><th>Text</th><td>row-inline-value</td></tr></tbody></table>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, `Tasks Dashboard eeeeeeee111111112222222233333333.html`),
    notionPage(
      "Tasks Dashboard",
      `<div class="collection-content" id="${DB_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><h4 class="collection-title">Tasks</h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th>Name</th><th>URL</th></tr></thead><tbody><tr id="${ROW_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><td class="cell-title"><a href="Tasks/Task%20One%20${ROW_HASH}.html">Task One</a></td><td>https://example.com</td></tr></tbody></table></div></div>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, `Linked Tasks Dashboard 90909090111122223333444455556666.html`),
    notionPage(
      "Linked Tasks Dashboard",
      `<h3>Linked DB</h3><div class="collection-content" id="${LINKED_COLLECTION_VIEW_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><h4 class="collection-title">Renamed linked view</h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th>Name</th><th>URL</th></tr></thead><tbody><tr id="${ROW_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><td class="cell-title"><a href="Tasks/Task%20One%20${ROW_HASH}.html">Task One</a></td><td>https://example.com</td></tr></tbody></table></div></div>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, `Loose Page ${PAGE_HASH}.html`),
    notionPage(
      "Loose Page",
      `<p>Standalone body.</p><p><a href="Loose%20Page/Empty%20Nested%20${EMPTY_NESTED_PAGE_HASH}.html">Empty Nested</a></p>`,
      "",
      `<img class="page-cover-image" src="Loose%20Page/loose-cover.jpg" style="object-position:center 80%"/>`
    ),
    "utf8"
  );
  await mkdir(join(source, "Loose Page"), { recursive: true });
  await writeFile(join(source, "Loose Page", "loose-cover.jpg"), "fake loose cover", "utf8");
  await mkdir(join(source, "2022 Sample Journal", "Family Vision Check"), { recursive: true });
  await writeFile(
    join(source, `2022 Sample Journal ${VISION_PARENT_PAGE_HASH}.html`),
    notionPage(
      "2022 Sample Journal",
      `<p><a href="2022%20Sample%20Journal/Family%20Vision%20Check%20${VISION_TOGGLE_PAGE_HASH}.html">Family Vision Check</a></p>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, "2022 Sample Journal", `Family Vision Check ${VISION_TOGGLE_PAGE_HASH}.html`),
    notionPage(
      "Family Vision Check",
      `<details open=""><summary>收据</summary><div class="indented"><figure class="image"><a href="Family%20Vision%20Check/receipt.jpg"><img src="Family%20Vision%20Check/receipt.jpg"/></a></figure><p>Example vision appointment</p></div></details><h2>日志</h2><table class="simple-table"><tbody><tr><td>日期</td><td>内容</td></tr><tr><td>2022/01/01</td><td>Example vision appointment</td></tr></tbody></table>`
    ),
    "utf8"
  );
  await writeFile(join(source, "2022 Sample Journal", "Family Vision Check", "receipt.jpg"), "fake receipt", "utf8");
  await writeFile(
    join(source, "Loose Page", `Empty Nested ${EMPTY_NESTED_PAGE_HASH}.html`),
    notionPage("Empty Nested", `<div style="display:contents"><p id="empty" class="">
</p></div>`),
    "utf8"
  );
  await mkdir(join(source, "Markdown Icon"), { recursive: true });
  await writeFile(join(source, "Markdown Icon", "icon.png"), "fake icon", "utf8");
  await writeFile(
    join(source, `Markdown Icon ${MD_ICON_PAGE_HASH}.md`),
    [
      "# Markdown Icon",
      "",
      "<aside>",
      `<img src="Markdown%20Icon/icon.png">`,
      "</aside>",
      "",
      "Markdown icon body.",
      "",
      `[Tasks DB](Tasks%20${DB_HASH}.csv)`,
      "",
      `[Tasks Wrapper](Tasks%20Wrapper%20${MD_DB_WRAPPER_PAGE_HASH}.md)`
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(source, `Tasks Wrapper ${MD_DB_WRAPPER_PAGE_HASH}.md`),
    [
      "# Tasks Wrapper",
      "",
      `[Tasks](Tasks%20${DB_HASH}.csv)`
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(source, `Markdown Fields ${MD_FIELDS_DB_HASH}.csv`),
    [
      "Name,Link,Done,Amount,Today",
      "Alpha,https://example.com/a,Yes,\"$1,234.50\",\"May 27, 2026\"",
      "Beta,https://example.com/b,No,42,2026/05/28"
    ].join("\n"),
    "utf8"
  );
  await mkdir(join(source, "Markdown Fields"), { recursive: true });
  await writeFile(
    join(source, "Markdown Fields", `Alpha ${MD_FIELDS_ALPHA_ROW_HASH}.md`),
    [
      "# Alpha",
      "",
      "Archived property: former value",
      "Link: https://example.com/a",
      "Done: Yes",
      "Amount: $1,234.50",
      "Today: May 27, 2026",
      "",
      "This is the real Markdown row body."
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(source, "Markdown Fields", `Beta ${MD_FIELDS_BETA_ROW_HASH}.md`),
    [
      "# Beta",
      "",
      "Context: this is ordinary page content",
      "",
      "This line must also remain."
    ].join("\n"),
    "utf8"
  );
  await mkdir(join(source, "Duplicate Title"), { recursive: true });
  await mkdir(join(source, "Relations"), { recursive: true });
  await writeFile(
    join(source, "Relations", `Alpha ${DUP_TITLE_ALPHA_TARGET_HASH}.html`),
    notionPage("Alpha", "<p>Alpha body.</p>"),
    "utf8"
  );
  await writeFile(
    join(source, "Relations", `Beta ${DUP_TITLE_BETA_TARGET_HASH}.html`),
    notionPage("Beta", "<p>Beta body.</p>"),
    "utf8"
  );
  await writeFile(
    join(source, `Duplicate Title ${DUP_TITLE_DB_HASH}.csv`),
    [
      "Name,Relation,Created",
      `Repeated,Alpha (Relations/Alpha ${DUP_TITLE_ALPHA_TARGET_HASH}.html),2024/01/01`,
      `Repeated,Beta (Relations/Beta ${DUP_TITLE_BETA_TARGET_HASH}.html),2024/01/02`,
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(source, "Duplicate Title", `A Repeated ${DUP_TITLE_BETA_ROW_HASH}.html`),
    notionPage(
      "Repeated",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-relation"><th>Relation</th><td><a href="../Relations/Beta%20${DUP_TITLE_BETA_TARGET_HASH}.html">Beta</a></td></tr><tr class="property-row property-row-date"><th>Created</th><td><time>2024/01/02</time></td></tr></tbody></table>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, "Duplicate Title", `Z Repeated ${DUP_TITLE_ALPHA_ROW_HASH}.html`),
    notionPage(
      "Repeated",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-relation"><th>Relation</th><td><a href="../Relations/Alpha%20${DUP_TITLE_ALPHA_TARGET_HASH}.html">Alpha</a></td></tr><tr class="property-row property-row-date"><th>Created</th><td><time>2024/01/01</time></td></tr></tbody></table>`
    ),
    "utf8"
  );
  await mkdir(join(source, "[LLM] Customer Feedbacks", "Untitled"), { recursive: true });
  await writeFile(
    join(source, "[LLM] Customer Feedbacks", `Untitled ${BOM_MATCH_DB_HASH}.csv`),
    [
      "\uFEFFName,Date,Select,Status,Tags",
      ",\"October 13, 2023 6:51 PM\",,Not started,",
      "Alex,\"October 13, 2023 6:51 PM\",Grafana,Not started,\"AI;Ops\"",
      ",\"October 13, 2023 6:51 PM\",,Not started,",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(source, "[LLM] Customer Feedbacks", "Untitled", `Untitled ${BOM_MATCH_EMPTY_ROW_HASH}.html`),
    notionPage(
      "",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-date"><th>Date</th><td><time>October 13, 2023 6:51 PM</time></td></tr><tr class="property-row property-row-status"><th>Status</th><td>Not started</td></tr></tbody></table>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, "[LLM] Customer Feedbacks", "Untitled", `Alex ${BOM_MATCH_ALEX_ROW_HASH}.html`),
    notionPage(
      "Alex",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-date"><th>Date</th><td><time>October 13, 2023 6:51 PM</time></td></tr><tr class="property-row property-row-select"><th>Select</th><td><span class="selected-value select-value-color-blue">Grafana</span></td></tr><tr class="property-row property-row-status"><th>Status</th><td><span class="status-value select-value-color-red">Not started</span></td></tr><tr class="property-row property-row-multi_select"><th>Tags</th><td><span class="selected-value select-value-color-purple">AI</span><span class="selected-value select-value-color-green">Ops</span></td></tr></tbody></table>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, "[LLM] Customer Feedbacks", "Untitled", `Untitled ${BOM_MATCH_EMPTY_ROW_HASH_2}.html`),
    notionPage(
      "",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-date"><th>Date</th><td><time>October 13, 2023 6:51 PM</time></td></tr><tr class="property-row property-row-status"><th>Status</th><td>Not started</td></tr></tbody></table>`
    ),
    "utf8"
  );
  await mkdir(join(source, "Loose Page", "Untitled"), { recursive: true });
  await writeFile(
    join(source, "Loose Page", `Untitled ${UNTITLED_DB_HASH}_all.csv`),
    "Name,Text,Text 1\n,bravo@example.com,token-2\n",
    "utf8"
  );
  await writeFile(
    join(source, "Loose Page", `Untitled ${UNTITLED_DB_HASH_2}_all.csv`),
    "Name,Text,Text 1\nSecond Row,charlie@example.com,token-3\n",
    "utf8"
  );
  await mkdir(join(source, "Loose Page", "Untitled"), { recursive: true });
  await writeFile(
    join(source, "Loose Page", "Untitled", `Untitled ${UNTITLED_ROW_HASH}.html`),
    notionPage(
      "",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-text"><th>Text</th><td>bravo@example.com</td></tr><tr class="property-row property-row-text"><th>Text 1</th><td>token-2</td></tr></tbody></table>`
    ),
    "utf8"
  );
  await mkdir(join(source, "Inline Host", "Untitled"), { recursive: true });
  await writeFile(
    join(source, "Inline Host", "Untitled", `Untitled ${INLINE_ROW_HASH}.html`),
    notionPage(
      "",
      "",
      `<table class="properties"><tbody><tr class="property-row property-row-text"><th>Text</th><td>alpha@example.com</td></tr><tr class="property-row property-row-text"><th>Text 1</th><td>token-1</td></tr></tbody></table>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, `Inline Host dddddddd111111112222222233333333.html`),
    notionPage(
      "Inline Host",
      `<div class="collection-content" id="${INLINE_DB_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><h4 class="collection-title"></h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th>Name</th><th>Text</th><th>Text 1</th></tr></thead><tbody><tr id="${INLINE_ROW_HASH.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}"><td class="cell-title"><a href="Inline%20Host/Untitled/Untitled%20${INLINE_ROW_HASH}.html">Untitled</a></td><td>alpha@example.com</td><td>token-1</td></tr></tbody></table></div></div>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, "Blank Standalone cccccccc111111112222222233333333.html"),
    notionPage("Blank Standalone", ""),
    "utf8"
  );
  await writeFile(
    join(source, `Same Name One ${SAME_NAME_PAGE_HASH_1}.html`),
    notionPage("Untitled", "<p>First same-name page body.</p>"),
    "utf8"
  );
  await writeFile(
    join(source, `Same Name Two ${SAME_NAME_PAGE_HASH_2}.html`),
    notionPage("Untitled", "<p>Second same-name page body.</p>"),
    "utf8"
  );

  const config = { touch: async () => undefined };
  const service = new NotionImportService(config);
  const invalidSourceTarget = join(root, "invalid-source-target");
  await mkdir(invalidSourceTarget, { recursive: true });
  await writeFile(join(invalidSourceTarget, "keep.txt"), "must survive", "utf8");
  await assert.rejects(
    service.runImport([], invalidSourceTarget, true),
    /At least one Notion export folder is required/,
    "An empty multi-source request should fail before touching its target"
  );
  assert.equal(
    await readFile(join(invalidSourceTarget, "keep.txt"), "utf8"),
    "must survive",
    "Invalid source input must not remove existing target data"
  );
  const result = await service.runImport(source, target, true, {
    skipEmptyRowsAndPages: true,
    dedupeMarkdownFiles: true,
    includeOriginalHtml: true
  });
  assert.ok(result.reportPageId, "Import should return the generated report page id");
  assert.ok(result.report, "Import should return a structured detailed report");
  assert.equal(result.report.nameConflicts.pageGroups >= 1, true, "Report should group same-name pages");
  assert.equal(result.report.nameConflicts.databaseGroups >= 1, true, "Report should group same-name databases");
  assert.equal(result.report.nameConflicts.crossTypeGroups >= 1, true, "Report should group page/database name collisions");
  const untitledConflict = result.report.nameConflicts.groups.find((group) => group.name === "Untitled");
  assert.ok(untitledConflict, "Report should include the Untitled name-conflict group");
  assert.equal(
    untitledConflict.entries.filter((entry) => entry.kind === "page").length,
    2,
    "Both same-name pages should be retained and reported"
  );
  assert.equal(
    untitledConflict.entries.filter((entry) => entry.kind === "database").length >= 2,
    true,
    "Both same-name databases should be retained and reported"
  );
  assert.equal(
    untitledConflict.entries.every((entry) => entry.id && entry.source && entry.target),
    true,
    "Every conflict entry should carry its stable id and source-to-target mapping"
  );
  for (const artifactPath of Object.values(result.report.artifacts)) {
    assert.equal(existsSync(artifactPath), true, `Detailed report artifact should exist: ${artifactPath}`);
  }

  const userDbs = await readdir(join(target, "databases", "user"), { withFileTypes: true });
  const tasksFolder = userDbs.find((entry) => entry.isDirectory() && entry.name.startsWith("Tasks--db_"));
  assert.ok(tasksFolder, "Expected imported Tasks database folder");
  const duplicateTitleFolder = userDbs.find((entry) => entry.isDirectory() && entry.name.startsWith("Duplicate_Title--db_"));
  assert.ok(duplicateTitleFolder, "Expected imported duplicate-title regression database");
  const markdownFieldsFolder = userDbs.find((entry) => entry.isDirectory() && entry.name.startsWith("Markdown_Fields--db_"));
  assert.ok(markdownFieldsFolder, "Expected imported CSV-only Markdown Fields database");

  const tasksDbPath = join(target, "databases", "user", tasksFolder.name);
  const tasksSchemaPath = join(tasksDbPath, "schema.json");
  const tasksSchema = JSON.parse(await readFile(tasksSchemaPath, "utf8"));
  const tasksView = JSON.parse(await readFile(join(tasksDbPath, "views", "view_default.json"), "utf8"));
  assert.deepEqual(
    tasksSchema.fields.find((field) => field.id === "notion_original_html"),
    { id: "notion_original_html", name: "Original Notion HTML", type: "url" },
    "Imported databases should expose a URL field for the source Notion HTML"
  );
  assert.deepEqual(
    tasksSchema.fields.find((field) => field.id === "notion_original_csv"),
    { id: "notion_original_csv", name: "Original Notion CSV", type: "url" },
    "Imported databases should expose a URL field for the source Notion CSV"
  );
  assert.equal(
    tasksSchema.notion_original_csv,
    `attachments/original/source/Tasks ${DB_HASH}.csv`,
    "Imported database schema should link to the copied source CSV even when the DB has no rows"
  );
  assert.equal(
    tasksSchema.notion_source_hash,
    DB_HASH,
    "Imported database schema should retain the source Notion hash for auditing"
  );
  assert.equal(
    tasksSchema.cover,
    "https://www.notion.so/images/page-cover/met_klimt_1912.jpg",
    "Skipped standalone database wrapper covers should carry onto the imported database schema"
  );
  assert.equal(
    tasksSchema.coverOffset,
    15,
    "Imported database cover offsets should preserve Notion's object-position percentage"
  );
  const schemaForNotionHash = async (hash) => {
    for (const entry of userDbs) {
      if (!entry.isDirectory()) continue;
      const schema = JSON.parse(await readFile(join(target, "databases", "user", entry.name, "schema.json"), "utf8"));
      if (schema.notion_source_hash === hash) return schema;
    }
    assert.fail(`Expected imported database schema for Notion hash ${hash}`);
  };
  assert.equal(
    (await schemaForNotionHash(MODERN_EXTERNAL_ICON_DB_HASH)).icon,
    "https://app.notion.com/icons/database_gray.svg",
    "Current Notion HTML database wrappers should transfer remote icons into database schemas"
  );
  assert.equal(
    (await schemaForNotionHash(MODERN_EMOJI_ICON_DB_HASH)).icon,
    "emoji:📊",
    "Current Notion HTML database wrappers should transfer emoji icons into database schemas"
  );
  const localDatabaseIcon = (await schemaForNotionHash(MODERN_LOCAL_ICON_DB_HASH)).icon;
  assert.match(
    localDatabaseIcon,
    /^attachments\/images\/[0-9a-f]+-icon\.png$/,
    "Current Notion HTML database wrappers should import local database icon attachments"
  );
  assert.equal(
    existsSync(join(target, localDatabaseIcon)),
    true,
    "Imported local database icon attachments should exist"
  );
  assert.equal(
    (await schemaForNotionHash(MODERN_NO_ICON_DB_HASH)).icon,
    undefined,
    "Databases without a Notion icon should remain iconless"
  );
  assert.deepEqual(
    tasksView.fieldOrder,
    ["title", "notes", "url", "balance", "done", "owner", "notion_original_html", "notion_original_csv"],
    "Imported database default columns should sort user fields by average content length while keeping source audit fields last"
  );
  assert.deepEqual(
    tasksSchema.path,
    ["Tasks"],
    "Top-level imported databases should retain their Notion breadcrumb path"
  );
  assert.equal(
    tasksSchema.fields.find((field) => field.id === "done")?.type,
    "checkbox",
    "Notion checkbox properties should import as checkbox fields"
  );
  assert.equal(
    tasksSchema.fields.find((field) => field.id === "owner")?.type,
    "person",
    "Notion person properties should preserve a static person field type"
  );

  const markdownFieldsDbPath = join(target, "databases", "user", markdownFieldsFolder.name);
  const markdownFieldsSchema = JSON.parse(await readFile(join(markdownFieldsDbPath, "schema.json"), "utf8"));
  const markdownFieldType = (id) => markdownFieldsSchema.fields.find((field) => field.id === id)?.type;
  assert.equal(markdownFieldType("link"), "url", "CSV-only Notion URL-like columns should import as URL fields");
  assert.equal(markdownFieldType("done"), "checkbox", "CSV-only Notion checkbox-like columns should import as checkbox fields");
  assert.equal(markdownFieldType("amount"), "number", "CSV-only Notion number-like columns should import as number fields");
  assert.equal(markdownFieldType("today"), "date", "CSV-only Notion date-like columns should import as date fields");
  const markdownFieldsRows = rowsAsObjects(await readFile(join(markdownFieldsDbPath, "data.csv"), "utf8"));
  const markdownAlphaRow = markdownFieldsRows.find((row) => row.title === "Alpha");
  assert.equal(markdownAlphaRow?.link, "https://example.com/a", "CSV-only URL values should stay clickable URLs");
  assert.equal(markdownAlphaRow?.done, "true", "CSV-only checkbox values should normalize to canonical booleans");
  assert.equal(markdownAlphaRow?.amount, "1234.50", "CSV-only number values should normalize to canonical numbers");
  assert.equal(markdownAlphaRow?.today, "2026-05-27", "CSV-only date values should normalize to canonical dates");
  const markdownAlphaBody = await readFile(join(markdownFieldsDbPath, "pages", markdownAlphaRow.page_file), "utf8");
  assert.equal(
    markdownAlphaBody,
    "This is the real Markdown row body.",
    "Markdown row property blocks, including historical fields, should not be duplicated into the page body"
  );
  const markdownBetaRow = markdownFieldsRows.find((row) => row.title === "Beta");
  const markdownBetaBody = await readFile(join(markdownFieldsDbPath, "pages", markdownBetaRow.page_file), "utf8");
  assert.equal(
    markdownBetaBody,
    "Context: this is ordinary page content\n\nThis line must also remain.",
    "Unknown colon-prefixed prose should remain when it does not contain a recognized database property"
  );

  const tasksRows = rowsAsObjects(await readFile(join(tasksDbPath, "data.csv"), "utf8"));
  assert.equal(tasksRows.length, 2, "Blank CSV rows should be omitted when skipEmptyRowsAndPages is enabled");
  assert.equal(
    tasksRows.some((row) => row.notion_original_html?.includes(EXTRA_SYSTEM_ONLY_ROW_HASH)),
    false,
    "Unclaimed row HTML with only system properties should not be imported as a database row"
  );
  const taskOneRow = tasksRows.find((row) => row.title === "Task One");
  assert.ok(taskOneRow, "Expected the Task One row to import");
  const slashTitleRow = tasksRows.find((row) => row.title === "2023/11/05 Daily");
  assert.equal(taskOneRow.balance, "1234.50", "Currency-formatted number cells should import as canonical numbers");
  assert.equal(taskOneRow.done, "true", "Notion Yes checkbox values should import as canonical true");
  assert.equal(taskOneRow.owner, "Alex", "Notion person cell display names should be preserved");
  assert.equal(
    slashTitleRow?.balance,
    "-8300.00",
    "Accounting negative number cells should import as canonical numbers"
  );
  assert.equal(slashTitleRow?.done, "false", "Notion No checkbox values should import as canonical false");
  assert.ok(slashTitleRow, "Expected row titles containing slashes to import");
  assert.equal(
    taskOneRow.notion_original_html,
    `attachments/original/source/Tasks/Task One ${ROW_HASH}.html`,
    "Database rows should link to the copied original row HTML"
  );
  assert.ok(
    existsSync(join(target, taskOneRow.notion_original_html)),
    "Row original HTML attachment should exist in the workspace"
  );
  assert.equal(
    taskOneRow.notion_original_csv,
    `attachments/original/source/Tasks ${DB_HASH}.csv`,
    "Database rows should link to the copied source CSV"
  );
  assert.ok(
    existsSync(join(target, taskOneRow.notion_original_csv)),
    "Original CSV attachment should exist in the workspace"
  );
  assert.match(
    taskOneRow.cover,
    /^attachments\/images\/[0-9a-f]+-row-cover\.jpg$/,
    "Database row cover images should import as hidden row cover metadata"
  );
  assert.equal(
    taskOneRow.cover_offset,
    "65",
    "Database row cover offsets should preserve Notion's object-position percentage"
  );
  assert.ok(
    existsSync(join(target, taskOneRow.cover)),
    "Imported row cover image attachment should exist in the workspace"
  );
  assert.ok(
    existsSync(join(target, "attachments", "original", "source", "Tasks", `Task One ${ROW_HASH}`, "chart.png")),
    "Original source export copy should preserve row HTML sibling asset folders"
  );
  let rowInlineDbFolder;
  let rowInlineSchema;
  for (const entry of userDbs) {
    if (!entry.isDirectory()) continue;
    const schema = JSON.parse(await readFile(join(target, "databases", "user", entry.name, "schema.json"), "utf8"));
    if (schema.notion_source_hash === ROW_INLINE_DB_HASH) {
      rowInlineDbFolder = entry;
      rowInlineSchema = schema;
    }
  }
  assert.ok(rowInlineDbFolder, "A Notion collection embedded inside a database row page should import as a database");
  assert.equal(
    rowInlineSchema.name,
    "Untitled",
    "Nested unnamed databases should keep a short database name instead of baking the parent path into schema.name"
  );
  assert.deepEqual(
    rowInlineSchema.path,
    ["Tasks", "Task One", "Untitled"],
    "Nested databases should keep the full Notion path through the parent row page"
  );
  const rowInlineRows = rowsAsObjects(
    await readFile(join(target, "databases", "user", rowInlineDbFolder.name, "data.csv"), "utf8")
  );
  assert.equal(rowInlineRows.length, 1, "Row-page inline database rows should be preserved");
  assert.equal(rowInlineRows[0].title, "Nested Alpha", "Row-page inline database row title should be preserved");
  const taskOneBody = await readFile(join(tasksDbPath, "pages", taskOneRow.page_file), "utf8");
  assert.doesNotMatch(
    taskOneBody,
    /database not found/,
    "Row-page inline database should not render as a missing embedded database"
  );
  assert.match(
    taskOneBody,
    /```lotion-view\s+database: db_[0-9a-f]+\s+view: view_default\s+```/,
    "Row-page inline database should render as a Lotion database view block"
  );
  const duplicateTitleDataPath = join(target, "databases", "user", duplicateTitleFolder.name, "data.csv");
  const originalDuplicateTitleData = await readFile(duplicateTitleDataPath, "utf8");
  const duplicateTitleRows = rowsAsObjects(originalDuplicateTitleData);
  const duplicateTitleSchemaPath = join(target, "databases", "user", duplicateTitleFolder.name, "schema.json");
  const originalDuplicateTitleSchemaRaw = await readFile(duplicateTitleSchemaPath, "utf8");
  const duplicateTitleSchema = JSON.parse(originalDuplicateTitleSchemaRaw);
  assert.equal(
    duplicateTitleSchema.fields.find((field) => field.id === "relation")?.type,
    "entity_ref",
    "Notion relation fields should import as structured entity_ref fields"
  );
  assert.equal(duplicateTitleRows.length, 2, "Duplicate title rows should both be imported");
  assert.match(
    duplicateTitleRows[0].relation,
    /Alpha/,
    "Duplicate-title matching should preserve the first CSV row's relation target"
  );
  assert.doesNotMatch(
    duplicateTitleRows[0].relation,
    /Beta/,
    "Duplicate-title matching should not steal the next row's relation target"
  );
  assert.match(
    duplicateTitleRows[1].relation,
    /Beta/,
    "Duplicate-title matching should preserve the second CSV row's relation target"
  );
  const firstRelationRefs = JSON.parse(duplicateTitleRows[0].relation);
  assert.equal(firstRelationRefs[0].kind, "page", "Relation refs should retain the target entity kind");
  assert.equal(firstRelationRefs[0].titleSnapshot, "Alpha", "Relation refs should retain the target title");
  assert.deepEqual(
    firstRelationRefs[0].pathSnapshot,
    ["Relations", "Alpha"],
    "Relation refs should retain the target page's full Notion breadcrumb path"
  );
  let bomMatchDbFolder;
  let bomMatchSchema;
  for (const entry of userDbs) {
    if (!entry.isDirectory()) continue;
    const schema = JSON.parse(await readFile(join(target, "databases", "user", entry.name, "schema.json"), "utf8"));
    if (schema.notion_source_hash === BOM_MATCH_DB_HASH) {
      bomMatchDbFolder = entry;
      bomMatchSchema = schema;
    }
  }
  assert.ok(bomMatchDbFolder, "Expected the BOM-header nested database to import");
  assert.equal(
    bomMatchSchema.fields.find((field) => field.id === "title")?.name,
    "Name",
    "Notion CSV title headers should strip UTF-8 BOM before schema generation"
  );
  assert.ok(
    bomMatchSchema.fields.find((field) => field.id === "select")?.options?.some((option) => option.name === "Grafana"),
    "Select field schema should retain imported Notion select options"
  );
  assert.equal(
    bomMatchSchema.fields.find((field) => field.id === "select")?.options?.find((option) => option.name === "Grafana")?.color,
    "blue",
    "Select field schema should retain imported Notion select option colors"
  );
  assert.ok(
    bomMatchSchema.fields.find((field) => field.id === "status")?.options?.some((option) => option.name === "Not started"),
    "Status field schema should retain imported Notion status options"
  );
  assert.equal(
    bomMatchSchema.fields.find((field) => field.id === "status")?.options?.find((option) => option.name === "Not started")?.color,
    "red",
    "Status field schema should retain imported Notion status option colors"
  );
  assert.equal(
    bomMatchSchema.fields.find((field) => field.id === "tags")?.options?.find((option) => option.name === "AI")?.color,
    "purple",
    "Multi-select field schema should retain imported Notion option colors"
  );
  assert.equal(
    bomMatchSchema.fields.find((field) => field.id === "tags")?.options?.find((option) => option.name === "Ops")?.color,
    "green",
    "Multi-select field schema should retain each imported Notion option color"
  );
  const bomMatchDataPath = join(target, "databases", "user", bomMatchDbFolder.name, "data.csv");
  const bomMatchRows = rowsAsObjects(
    await readFile(bomMatchDataPath, "utf8")
  );
  const originalBomMatchData = await readFile(bomMatchDataPath, "utf8");
  assert.equal(
    bomMatchRows.length,
    3,
    `CSV rows should match their HTML row pages instead of appending duplicates: ${JSON.stringify(
      bomMatchRows.map((row) => ({ title: row.title, html: row.notion_original_html, date: row.date, select: row.select, status: row.status }))
    )}`
  );
  assert.deepEqual(
    bomMatchRows.map((row) => row.title),
    ["Untitled", "Alex", "Untitled"],
    "Blank Notion title cells should stay Untitled instead of being synthesized from Date/Status properties"
  );
  assert.equal(
    bomMatchRows.filter((row) => row.title === "Alex").length,
    1,
    "The Alex CSV row should claim the Alex HTML row page exactly once"
  );

  const pagesSchemaPath = join(target, "databases", "system", "pages--db_pages", "schema.json");
  const pagesDataPath = join(target, "databases", "system", "pages--db_pages", "data.csv");
  const entitiesDataPath = join(target, "databases", "system", "entities--db_entities", "data.csv");
  const pagesSchema = JSON.parse(await readFile(pagesSchemaPath, "utf8"));
  assert.ok(
    pagesSchema.fields.some((field) => field.id === "notion_original_html" && field.type === "url"),
    "System pages database should expose the original HTML field"
  );
  const pageRows = rowsAsObjects(await readFile(pagesDataPath, "utf8"));
  const entityRows = rowsAsObjects(await readFile(entitiesDataPath, "utf8"));
  for (const fixture of modernDatabaseFixtures) {
    assert.equal(
      pageRows.some((row) => row.title === fixture.title),
      false,
      `Current Notion HTML database wrapper should not create a duplicate page: ${fixture.title}`
    );
  }
  assert.ok(entityRows.some((row) => row.kind === "database" && row.title === "Tasks"), "Entities database should index databases");
  assert.ok(entityRows.some((row) => row.kind === "row" && row.title === "Task One"), "Entities database should index row pages");
  assert.ok(entityRows.some((row) => row.kind === "page" && row.title === "Alpha"), "Entities database should index standalone pages");
  const tasksEntity = entityRows.find((row) => row.kind === "database" && row.title === "Tasks");
  const taskOneEntity = entityRows.find((row) => row.kind === "row" && row.title === "Task One");
  const rowInlineDbEntity = entityRows.find((row) => row.kind === "database" && row.source_notion_hash === ROW_INLINE_DB_HASH);
  assert.equal(tasksEntity?.id, tasksSchema.id, "The Tasks database entity should use the database id");
  assert.deepEqual(
    firstEntityRef(taskOneEntity?.parent_id),
    { entityId: tasksSchema.id, kind: "database" },
    "Imported row entities should point at their owning database as parent"
  );
  assert.deepEqual(
    firstEntityRef(rowInlineDbEntity?.parent_id),
    { entityId: taskOneEntity?.id, kind: "row" },
    "Nested databases should point at the nearest row/page parent entity"
  );
  assert.equal(
    JSON.stringify(storedPathSegments(entityRows.find((row) => row.kind === "page" && row.title === "Alpha")?.path)),
    JSON.stringify(["Relations", "Alpha"]),
    "Standalone/nested page entities should retain their Notion breadcrumb path instead of only the title"
  );
  const slashTitlePage = pageRows.find((row) => row.title === "2023/11/05 Daily");
  assert.ok(slashTitlePage, "System pages database should include row pages whose titles contain slashes");
  assert.deepEqual(
    storedPathSegments(slashTitlePage.path),
    ["Tasks", "2023/11/05 Daily"],
    "System page paths should store slash-containing titles as a single JSON path segment"
  );
  assert.deepEqual(
    firstEntityRef(slashTitlePage.parent_id),
    { entityId: tasksSchema.id, kind: "database" },
    "Slash-title row pages should still point at their owning database"
  );
  const slashTitleEntity = entityRows.find((row) => row.kind === "row" && row.title === "2023/11/05 Daily");
  assert.ok(slashTitleEntity, "Entities database should include row pages whose titles contain slashes");
  assert.deepEqual(
    storedPathSegments(slashTitleEntity.path),
    ["Tasks", "2023/11/05 Daily"],
    "Entity paths should store slash-containing titles as a single JSON path segment"
  );
  const loosePage = pageRows.find((row) => row.title === "Loose Page");
  assert.ok(loosePage, "Standalone imported page should be present in the system pages database");
  const linkedTasksDashboard = pageRows.find((row) => row.title === "Linked Tasks Dashboard");
  assert.ok(linkedTasksDashboard, "Standalone page with a linked database snapshot should import");
  const linkedTasksDashboardBody = await readFile(join(target, linkedTasksDashboard.body_path), "utf8");
  assert.doesNotMatch(
    linkedTasksDashboardBody,
    /database not found/,
    "Linked database snapshots should resolve through row hashes when their view hash is not the database hash"
  );
  assert.match(
    linkedTasksDashboardBody,
    /```lotion-view\s+database: db_[0-9a-f]+\s+view: view_default\s+```/,
    "Linked database snapshots should render as a Lotion database view block"
  );
  assert.match(
    loosePage.cover,
    /^attachments\/images\/[0-9a-f]+-loose-cover\.jpg$/,
    "Standalone page cover images should import into page metadata"
  );
  assert.equal(
    loosePage.cover_offset,
    "80",
    "Standalone page cover offsets should preserve Notion's object-position percentage"
  );
  assert.ok(
    existsSync(join(target, loosePage.cover)),
    "Imported standalone page cover image attachment should exist in the workspace"
  );
  const taskOnePageRecord = pageRows.find((row) => row.title === "Task One");
  assert.match(
    taskOnePageRecord?.cover ?? "",
    /^attachments\/images\/[0-9a-f]+-row-cover\.jpg$/,
    "Row-page cover images should also be reflected in the system pages database"
  );
  const markdownIconPage = pageRows.find((row) => row.title === "Markdown Icon");
  assert.ok(markdownIconPage, "Markdown-exported standalone pages should import");
  assert.match(
    markdownIconPage.icon,
    /^attachments\/images\/[0-9a-f]+-icon\.png$/,
    "Markdown-exported page icon as an aside image should import into page metadata"
  );
  const markdownIconBody = await readFile(join(target, markdownIconPage.body_path), "utf8");
  assert.doesNotMatch(
    markdownIconBody,
    /<aside>/,
    "Markdown-exported icon-only aside should not remain in the page body"
  );
  assert.match(
    markdownIconBody,
    /Markdown icon body\./,
    "Markdown-exported page body should keep content after the icon aside"
  );
  assert.match(
    markdownIconBody,
    /\[Tasks DB]\(databases\/user\/Tasks--db_[^)]+\)/,
    "Markdown-exported database CSV links should rewrite to the Lotion database view path"
  );
  assert.doesNotMatch(
    markdownIconBody,
    /Tasks--db_[^)]+\/data\.csv/,
    "Markdown-exported database links should not open the raw imported CSV file"
  );
  assert.match(
    markdownIconBody,
    /\[Tasks Wrapper]\(databases\/user\/Tasks--db_[^)]+\)/,
    "Markdown links to skipped database-wrapper pages should open the canonical database view"
  );
  assert.equal(
    pageRows.some((row) => row.title === "Tasks Wrapper"),
    false,
    "Markdown-exported database wrapper pages should not import as standalone pages"
  );
  assert.equal(
    pageRows.some((row) => row.title === "Blank Standalone"),
    false,
    "Blank standalone pages should be omitted when skipEmptyRowsAndPages is enabled"
  );
  assert.equal(
    pageRows.some((row) => row.title === "Empty Nested"),
    false,
    "Nested pages with only empty paragraphs should be omitted when skipEmptyRowsAndPages is enabled"
  );
  const visionParentPage = pageRows.find((row) => row.title === "2022 Sample Journal");
  assert.ok(visionParentPage, "The Notion parent page that links to the 2022 vision check page should import");
  const visionTogglePage = pageRows.find((row) => row.title === "Family Vision Check");
  assert.ok(visionTogglePage, "Nested Notion pages with bare <details> toggles should import instead of being skipped");
  assert.deepEqual(
    storedPathSegments(visionTogglePage.path),
    ["2022 Sample Journal", "Family Vision Check"],
    "Nested toggle pages should retain their full Notion breadcrumb path"
  );
  const visionParentBody = await readFile(join(target, visionParentPage.body_path), "utf8");
  assert.match(
    visionParentBody,
    /\[Family Vision Check\]\(databases\/system\/pages--db_pages\/pages\/Family_Vision_Check--pg_[^)]+\.md\)/,
    "Links to imported nested toggle pages should rewrite to the Lotion page body path"
  );
  assert.doesNotMatch(
    visionParentBody,
    /aaaaaaaa111122223333444455556666\.html/,
    "Links to imported nested toggle pages should not keep the original URL-encoded Notion export path"
  );
  const visionToggleBody = await readFile(join(target, visionTogglePage.body_path), "utf8");
  assert.match(
    visionToggleBody,
    /```lotion-toggle\nsummary: 收据\nopen: true\n---\n!\[receipt\.jpg\]\(attachments\/images\/[0-9a-f]+-receipt\.jpg\)\n\nExample vision appointment\n```/,
    "Bare Notion <details> blocks should import as editable Lotion toggle fences while preserving nested image and text"
  );
  assert.match(
    visionToggleBody,
    /\| 日期 \| 内容 \|[\s\S]*\| 2022\/01\/01 \| Example vision appointment \|/,
    "Content after an imported toggle should remain visible instead of being swallowed by the toggle"
  );
  assert.equal(
    loosePage.notion_original_html,
    `attachments/original/source/Loose Page ${PAGE_HASH}.html`,
    "Standalone pages should link to their copied original HTML"
  );
  assert.ok(
    existsSync(join(target, loosePage.notion_original_html)),
    "Standalone original HTML attachment should exist in the workspace"
  );
  const loosePageBody = await readFile(join(target, loosePage.body_path), "utf8");
  assert.doesNotMatch(
    loosePageBody,
    /Empty_Nested--pg_[0-9a-f]+\.md/,
    "Links to skipped blank nested pages should not point at non-existent Lotion markdown files"
  );
  assert.match(
    loosePageBody,
    new RegExp(`https://www\\.notion\\.so/${EMPTY_NESTED_PAGE_HASH}`),
    "Links to skipped blank nested pages should fall back to the original Notion page URL"
  );
  const inlineDbFolder = userDbs.find((entry) => entry.isDirectory() && entry.name.includes("Inline_Host_Untitled--db_"));
  assert.equal(
    inlineDbFolder,
    undefined,
    "HTML-only collection snapshots without a CSV source should not be materialized as databases"
  );
  const inlineHostPage = pageRows.find((row) => row.title === "Inline Host");
  assert.ok(inlineHostPage, "The page that contains an HTML-only collection snapshot should still import");
  const inlineHostBody = await readFile(join(target, inlineHostPage.body_path), "utf8");
  assert.match(
    inlineHostBody,
    /database not found/,
    "HTML-only collection snapshots should remain an audit placeholder instead of creating synthetic row pages"
  );
  const inlinePageRecord = pageRows.find(
    (row) => row.notion_original_html === `attachments/original/source/Inline Host/Untitled/Untitled ${INLINE_ROW_HASH}.html`
  );
  assert.equal(
    inlinePageRecord,
    undefined,
    "Blank HTML-only collection row pages should be omitted when skipEmptyRowsAndPages is enabled"
  );
  assert.ok(
    existsSync(join(target, "attachments", "original", "source", "Inline Host", "Untitled", `Untitled ${INLINE_ROW_HASH}.html`)),
    "Omitted HTML-only collection row pages should still exist in the preserved original export"
  );
  const looseUntitledDbFolders = [];
  for (const entry of userDbs) {
    if (!entry.isDirectory()) continue;
    const schemaPath = join(target, "databases", "user", entry.name, "schema.json");
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    if (schema.path?.join(" / ").startsWith("Loose Page / Untitled")) {
      looseUntitledDbFolders.push({ entry, schema, schemaPath });
    }
  }
  assert.equal(
    looseUntitledDbFolders.length,
    2,
    "Distinct Untitled CSV databases with the same display path should both be preserved"
  );
  assert.ok(
    looseUntitledDbFolders.every(({ schema }) => /^Untitled · [0-9a-f]{8}$/.test(schema.name)),
    "Colliding Untitled database short names should be disambiguated with the Notion hash"
  );
  assert.ok(
    looseUntitledDbFolders.every(({ schema }) => /^Loose Page \/ Untitled · [0-9a-f]{8}$/.test(schema.path.join(" / "))),
    "Colliding Untitled database paths should be disambiguated at the final path segment"
  );
  const duplicatePathOriginalRaw = await readFile(looseUntitledDbFolders[1].schemaPath, "utf8");
  await writeFile(
    looseUntitledDbFolders[1].schemaPath,
    `${JSON.stringify({ ...looseUntitledDbFolders[1].schema, path: looseUntitledDbFolders[0].schema.path }, null, 2)}\n`,
    "utf8"
  );
  const duplicateDatabasePathAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [UNTITLED_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    duplicateDatabasePathAudit.issues.some((item) => item.kind === "duplicate_database_path"),
    "Audit should flag imported databases that collapse to the same hierarchy path"
  );
  await writeFile(looseUntitledDbFolders[1].schemaPath, duplicatePathOriginalRaw, "utf8");
  const untitledDbFolder = looseUntitledDbFolders.find(({ schema }) => schema.name.endsWith(UNTITLED_DB_HASH.slice(0, 8)));
  assert.ok(untitledDbFolder, "The first Untitled database should still be findable by its Notion hash suffix");
  const untitledRows = rowsAsObjects(await readFile(join(target, "databases", "user", untitledDbFolder.entry.name, "data.csv"), "utf8"));
  assert.equal(untitledRows.length, 1, "Untitled CSV database rows should be imported");
  assert.equal(untitledRows[0].title, "Untitled", "Blank Notion title cells should stay Untitled");

  const reportPage = pageRows.find((row) => row.title.startsWith("Import report "));
  assert.ok(reportPage, "The system pages database should include the latest import report page");
  assert.equal(reportPage.id, result.reportPageId, "Returned report page id should match the system pages record");
  assert.ok(reportPage.body_path, "The import report page should have a body_path");
  assert.ok(
    existsSync(join(target, reportPage.body_path)),
    "The import report body_path should point to an existing Markdown file"
  );
  const reportBody = await readFile(join(target, reportPage.body_path), "utf8");
  assert.match(reportBody, /# Notion import report/, "The import report body should be readable");
  assert.match(reportBody, /## Same-name Pages And Databases/, "Report should explain same-name object handling");
  assert.match(reportBody, /## Icon Coverage/, "Report should include page, database, and row icon coverage");
  assert.match(reportBody, /## Data Integrity/, "Report should include data reconciliation checks");
  assert.match(reportBody, /## Performance/, "Report should include stage timings");
  assert.match(reportBody, /stable Notion IDs/, "Report should state the non-destructive identity rule");
  const structuredReport = JSON.parse(await readFile(result.report.artifacts.json, "utf8"));
  assert.equal(structuredReport.report.nameConflicts.pageGroups >= 1, true);
  const importManifest = JSON.parse(await readFile(result.report.artifacts.manifest, "utf8"));
  assert.equal(importManifest.identityRule, "stable_notion_id");
  assert.equal(importManifest.nameCollisionRule, "retain_all");
  assert.equal(importManifest.rows.length > 0, true, "Source-to-target manifest should include database rows");
  assert.equal(
    importManifest.rows.every((row) => row.databaseId && row.rowId && row.title && row.target),
    true,
    "Every emitted database row should have a target mapping"
  );
  assert.equal(
    importManifest.pages.filter((page) => page.title === "Untitled").length,
    2,
    "Source-to-target manifest should retain both same-name pages"
  );
  const importReviewRows = rowsAsObjects(
    await readFile(join(target, "databases", "user", "Import_review--db_import_review", "data.csv"), "utf8")
  );
  assert.ok(
    importReviewRows.some(
      (row) =>
        row.issue_type === "Empty row page body" &&
        row.notion_hash === EXTRA_SYSTEM_ONLY_ROW_HASH &&
        row.source_file.includes(EXTRA_SYSTEM_ONLY_ROW_HASH)
    ),
    "The import review database should list skipped unclaimed row HTML with only system properties"
  );

  const directAuditJson = join(root, "direct-audit-report.json");
  const directAuditMarkdown = join(root, "direct-audit-report.md");
  await execFileAsync(process.execPath, [
    fileURLToPath(new URL("./audit-notion-import.mjs", import.meta.url)),
    "--source",
    source,
    "--workspace",
    target,
    "--csv",
    `Tasks ${DB_HASH}.csv`,
    "--html",
    `Task One ${ROW_HASH}.html`,
    "--json",
    directAuditJson,
    "--markdown",
    directAuditMarkdown
  ]);
  const directAuditReportJson = JSON.parse(await readFile(directAuditJson, "utf8"));
  assert.equal(directAuditReportJson.summary.issues, 0, "Direct audit CLI should write JSON output");
  const directAuditReportMarkdown = await readFile(directAuditMarkdown, "utf8");
  assert.match(
    directAuditReportMarkdown,
    /# Notion Import Audit Report/,
    "Direct audit CLI should write a readable Markdown report"
  );
  assert.match(
    directAuditReportMarkdown,
    /\| Source CSVs \| 1 \/ \d+ \|/,
    "Direct audit Markdown report should include audited CSV counts"
  );
  assert.match(
    directAuditReportMarkdown,
    /## Issue Kinds\n\nNone/,
    "Direct audit Markdown report should make empty issue kinds explicit"
  );
  const auditResult = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    htmlFilters: [`Task One ${ROW_HASH}.html`],
    auditAllHtml: true,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.equal(auditResult.summary.sourceCsvs > 0, true, "Audit should inspect source CSVs");
  assert.equal(auditResult.summary.workspaceRows > 0, true, "Audit should inspect imported workspace rows");
  assert.equal(
    auditResult.summary.workspaceImportedDatabases > 0,
    true,
    "Audit should count source-mapped imported databases"
  );
  assert.equal(
    auditResult.summary.workspaceImportedRows > 0,
    true,
    "Audit should count source-mapped imported rows/pages"
  );
  assert.match(
    formatNotionAuditText(auditResult, { verbose: true, maxIssues: 1 }),
    /Notion import audit/,
    "Direct audit formatter should produce readable text"
  );
  assert.match(
    formatNotionAuditMarkdown(auditResult, { maxItems: 1 }),
    /## Summary/,
    "Direct audit Markdown formatter should expose a summary section"
  );
  assert.equal(
    auditResult.issues.some((item) => item.kind === "noncanonical_number_cell"),
    false,
    "Audit should accept canonical imported number cells that came from display-formatted source CSV values"
  );
  assert.equal(
    auditResult.issues.some((item) => item.kind === "invalid_url_cell"),
    false,
    "Audit should accept imported URL cells that remain openable URLs"
  );
  assert.equal(
    auditResult.issues.some((item) => item.kind === "invalid_checkbox_cell"),
    false,
    "Audit should accept imported checkbox cells that store canonical booleans"
  );
  await writeFile(
    duplicateTitleSchemaPath,
    `${JSON.stringify({ ...duplicateTitleSchema, path: ["Wrong hierarchy"] }, null, 2)}\n`,
    "utf8"
  );
  const databasePathAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [DUP_TITLE_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    databasePathAudit.issues.some((item) => item.kind === "database_path_mismatch"),
    "Audit should flag imported database schemas whose path no longer matches the source hierarchy"
  );
  await writeFile(duplicateTitleSchemaPath, originalDuplicateTitleSchemaRaw, "utf8");
  assert.ok(taskOneRow.body_path || taskOneRow.page_file, "Task One should have an imported body file for audit mismatch testing");
  const taskOneBodyPath = taskOneRow.body_path
    ? join(target, taskOneRow.body_path)
    : join(tasksDbPath, "pages", taskOneRow.page_file);
  const originalTaskOneBody = await readFile(taskOneBodyPath, "utf8");
  const corruptedTaskOneBody = originalTaskOneBody.replace("Imported row body.", "Imported row body was corrupted.");
  assert.notEqual(corruptedTaskOneBody, originalTaskOneBody, "Expected fixture body text to contain the source snippet");
  await writeFile(taskOneBodyPath, corruptedTaskOneBody, "utf8");
  const bodyMismatchAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    htmlFilters: [`Task One ${ROW_HASH}.html`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    bodyMismatchAudit.warnings.some((item) => item.kind === "html_body_text_not_found"),
    "Audit should warn when an imported markdown body no longer contains source HTML text"
  );
  await writeFile(taskOneBodyPath, originalTaskOneBody, "utf8");
  await rm(taskOneBodyPath);
  const missingBodyFileAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    htmlFilters: [`Task One ${ROW_HASH}.html`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingBodyFileAudit.issues.some((item) => item.kind === "missing_body_file"),
    "Audit should flag imported rows whose source HTML has body content but markdown body file is missing"
  );
  await writeFile(taskOneBodyPath, originalTaskOneBody, "utf8");
  await writeFile(taskOneBodyPath, "", "utf8");
  const emptyBodyFileAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    htmlFilters: [`Task One ${ROW_HASH}.html`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    emptyBodyFileAudit.issues.some((item) => item.kind === "empty_body_file"),
    "Audit should flag imported rows whose source HTML has body content but markdown body file is empty"
  );
  await writeFile(taskOneBodyPath, originalTaskOneBody, "utf8");
  const regressionTarget = join(root, "regression-workspace");
  const regressionReport = join(root, "regression-report.json");
  const regressionMarkdownReport = join(root, "regression-report.md");
  await execFileAsync(process.execPath, [
    fileURLToPath(new URL("./regress-notion-import.mjs", import.meta.url)),
    "--source",
    source,
    "--target",
    regressionTarget,
    "--report",
    regressionReport,
    "--markdown-report",
    regressionMarkdownReport,
    "--csv",
    `Tasks ${DB_HASH}.csv`,
    "--html",
    `Task One ${ROW_HASH}.html`
  ]);
  const regressionReportJson = JSON.parse(await readFile(regressionReport, "utf8"));
  assert.equal(regressionReportJson.audit.summary.issues, 0, "Regression runner should write a passing audit report");
  assert.match(
    await readFile(regressionMarkdownReport, "utf8"),
    /# Notion Import Regression Report/,
    "Regression runner should write a readable Markdown report"
  );
  const tasksDataPath = join(tasksDbPath, "data.csv");
  const originalTasksData = await readFile(tasksDataPath, "utf8");
  const bodyPathColumn = taskOneRow.body_path ? "body_path" : "page_file";
  await writeFile(tasksDataPath, updateCsvCell(originalTasksData, "title", "Task One", bodyPathColumn, ""), "utf8");
  const missingBodyPathAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    htmlFilters: [`Task One ${ROW_HASH}.html`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingBodyPathAudit.issues.some((item) => item.kind === "missing_body_path"),
    "Audit should flag imported rows whose source HTML has body content but body path metadata is missing"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  await writeFile(tasksDataPath, updateCsvCell(originalTasksData, "title", "Task One", "balance", "$1,234.50"), "utf8");
  const noncanonicalNumberAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    noncanonicalNumberAudit.issues.some((item) => item.kind === "noncanonical_number_cell"),
    "Audit should flag imported number fields that store display-formatted numbers"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  await writeFile(tasksDataPath, updateCsvCell(originalTasksData, "title", "Task One", "url", "not a url"), "utf8");
  const invalidUrlAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    invalidUrlAudit.issues.some((item) => item.kind === "invalid_url_cell"),
    "Audit should flag imported URL fields that are no longer openable URLs"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  await writeFile(tasksDataPath, updateCsvCell(originalTasksData, "title", "Task One", "done", "sometimes"), "utf8");
  const invalidCheckboxAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    invalidCheckboxAudit.issues.some((item) => item.kind === "invalid_checkbox_cell"),
    "Audit should flag imported checkbox fields that are no longer canonical booleans"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  const validSelectAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [BOM_MATCH_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.equal(
    validSelectAudit.issues.some((item) => item.kind === "invalid_select_option_cell" || item.kind === "missing_select_options"),
    false,
    "Audit should accept imported select cells whose values exist in schema options"
  );
  assert.equal(
    validSelectAudit.issues.some((item) => item.kind === "invalid_date_cell"),
    false,
    "Audit should accept imported date cells that remain parseable"
  );
  await writeFile(bomMatchDataPath, updateCsvCell(originalBomMatchData, "title", "Alex", "select", "Missing Option"), "utf8");
  const invalidSelectAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [BOM_MATCH_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    invalidSelectAudit.issues.some((item) => item.kind === "invalid_select_option_cell"),
    "Audit should flag imported select cells whose values are not present in schema options"
  );
  await writeFile(bomMatchDataPath, originalBomMatchData, "utf8");
  await writeFile(bomMatchDataPath, updateCsvCell(originalBomMatchData, "title", "Alex", "date", "not a date"), "utf8");
  const invalidDateAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [BOM_MATCH_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    invalidDateAudit.issues.some((item) => item.kind === "invalid_date_cell"),
    "Audit should flag imported date cells that are no longer parseable"
  );
  await writeFile(bomMatchDataPath, originalBomMatchData, "utf8");
  const validEntityRefAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [DUP_TITLE_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.equal(
    validEntityRefAudit.issues.some((item) => item.kind === "missing_entity_ref_target"),
    false,
    "Audit should accept imported entity_ref cells whose target entities exist"
  );
  assert.equal(
    validEntityRefAudit.warnings.some((item) => item.kind === "unstructured_entity_ref"),
    false,
    "Audit should accept imported entity_ref cells that remain structured JSON"
  );
  await writeFile(
    duplicateTitleDataPath,
    updateCsvCell(
      originalDuplicateTitleData,
      "title",
      "Repeated",
      "relation",
      JSON.stringify([{ entityId: "pg_missing_entity_ref_target", kind: "page", titleSnapshot: "Alpha" }])
    ),
    "utf8"
  );
  const missingEntityRefAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [DUP_TITLE_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingEntityRefAudit.issues.some((item) => item.kind === "missing_entity_ref_target"),
    "Audit should flag imported entity_ref cells whose target entity is missing"
  );
  await writeFile(duplicateTitleDataPath, originalDuplicateTitleData, "utf8");
  await writeFile(
    duplicateTitleDataPath,
    updateCsvCell(originalDuplicateTitleData, "title", "Repeated", "relation", "Alpha"),
    "utf8"
  );
  const unstructuredEntityRefAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [DUP_TITLE_DB_HASH],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    unstructuredEntityRefAudit.warnings.some((item) => item.kind === "unstructured_entity_ref"),
    "Audit should warn when imported entity_ref cells are no longer structured JSON"
  );
  await writeFile(duplicateTitleDataPath, originalDuplicateTitleData, "utf8");
  await writeFile(
    tasksDataPath,
    originalTasksData.replace(`attachments/original/source/Tasks/Task One ${ROW_HASH}.html`, ""),
    "utf8"
  );
  const missingOriginalHtmlAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingOriginalHtmlAudit.issues.some((item) => item.kind === "missing_original_html_link"),
    "Audit should flag imported row bodies that lost their original Notion HTML link"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  await writeFile(
    tasksDataPath,
    originalTasksData.replace(
      `attachments/original/source/Tasks/Task One ${ROW_HASH}.html`,
      "attachments/original/source/Tasks/missing-row-source.html"
    ),
    "utf8"
  );
  const brokenOriginalHtmlAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    brokenOriginalHtmlAudit.issues.some((item) =>
      item.kind === "missing_workspace_file" && item.message.includes("notion_original_html")
    ),
    "Audit should flag imported row bodies whose original Notion HTML link points to a missing file"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  const taskOneCopiedOriginalHtmlPath = join(target, taskOneRow.notion_original_html);
  const originalTaskOneCopiedHtml = await readFile(taskOneCopiedOriginalHtmlPath, "utf8");
  await writeFile(
    taskOneCopiedOriginalHtmlPath,
    originalTaskOneCopiedHtml.replace("chart.png", "missing-chart.png"),
    "utf8"
  );
  const missingOriginalHtmlResourceAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    htmlFilters: [`Task One ${ROW_HASH}.html`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingOriginalHtmlResourceAudit.issues.some((item) =>
      item.kind === "missing_original_html_resource" && item.message.includes("missing-chart.png")
    ),
    "Audit should flag copied original Notion HTML that references missing relative resources"
  );
  await writeFile(taskOneCopiedOriginalHtmlPath, originalTaskOneCopiedHtml, "utf8");
  await writeFile(
    tasksDataPath,
    originalTasksData.replace(`attachments/original/source/Tasks ${DB_HASH}.csv`, ""),
    "utf8"
  );
  const missingOriginalCsvAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingOriginalCsvAudit.issues.some((item) => item.kind === "missing_original_csv_link"),
    "Audit should flag imported rows that lost their original Notion CSV link"
  );
  await writeFile(tasksDataPath, originalTasksData, "utf8");
  const originalTasksSchema = await readFile(tasksSchemaPath, "utf8");
  const tasksSchemaWithoutOriginalCsv = JSON.parse(originalTasksSchema);
  delete tasksSchemaWithoutOriginalCsv.notion_original_csv;
  await writeFile(tasksSchemaPath, `${JSON.stringify(tasksSchemaWithoutOriginalCsv, null, 2)}\n`, "utf8");
  const missingDatabaseOriginalCsvAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    missingDatabaseOriginalCsvAudit.issues.some((item) =>
      item.kind === "missing_original_csv_link" && item.message.includes("Database")
    ),
    "Audit should flag imported databases that lost their original Notion CSV link"
  );
  await writeFile(tasksSchemaPath, originalTasksSchema, "utf8");
  const tasksSchemaWithBrokenOriginalCsv = JSON.parse(originalTasksSchema);
  tasksSchemaWithBrokenOriginalCsv.notion_original_csv = "attachments/original/source/missing-database-source.csv";
  await writeFile(tasksSchemaPath, `${JSON.stringify(tasksSchemaWithBrokenOriginalCsv, null, 2)}\n`, "utf8");
  const brokenDatabaseOriginalCsvAudit = await runNotionAudit({
    sourcePaths: [source],
    workspacePath: target,
    csvFilters: [`Tasks ${DB_HASH}.csv`],
    auditAllHtml: false,
    keepEmptyRows: false,
    maxIssues: 10
  });
  assert.ok(
    brokenDatabaseOriginalCsvAudit.issues.some((item) =>
      item.kind === "missing_workspace_file" && item.message.includes("notion_original_csv")
    ),
    "Audit should flag imported databases whose original Notion CSV link points to a missing file"
  );
  await writeFile(tasksSchemaPath, originalTasksSchema, "utf8");
  const missingAudit = await runNotionAudit({
    sourcePaths: [join(root, "missing-source")],
    workspacePath: join(root, "missing-workspace"),
    maxIssues: 2
  });
  assert.equal(missingAudit.summary.issues > 0, true, "Audit should flag missing source and workspace roots");

  const mergeSource = join(root, "merge-source");
  const mergeTarget = join(root, "merge-workspace");
  const mergeExportRoot = join(mergeSource, `Export-${MERGED_EXPORT_UUID}`);
  const mergeExportRootPart2 = join(mergeSource, `Export-${MERGED_EXPORT_UUID} 2`);
  await mkdir(join(mergeExportRoot, "Weekly"), { recursive: true });
  await mkdir(join(mergeExportRootPart2, "Weekly", "Untitled"), { recursive: true });
  await writeFile(
    join(mergeExportRoot, "Weekly", `Week Page ${MERGED_PAGE_HASH}.html`),
    notionPage("Week Page", `<img class="icon" src="Untitled/week.png"><p>Merged body.</p>`),
    "utf8"
  );
  await writeFile(join(mergeExportRootPart2, "Weekly", "Untitled", "week.png"), "fake week icon", "utf8");
  await service.runImport(mergeSource, mergeTarget, true, {
    skipEmptyRowsAndPages: true,
    dedupeMarkdownFiles: true,
    includeOriginalHtml: true
  });
  assert.ok(
    existsSync(join(mergeTarget, "attachments", "original", `Export-${MERGED_EXPORT_UUID}`, "Weekly", `Week Page ${MERGED_PAGE_HASH}.html`)),
    "Original HTML from the first Notion export part should be copied into the merged logical export root"
  );
  assert.ok(
    existsSync(join(mergeTarget, "attachments", "original", `Export-${MERGED_EXPORT_UUID}`, "Weekly", "Untitled", "week.png")),
    "Original resources from later Notion export parts should be merged so relative HTML links resolve"
  );
  assert.equal(
    existsSync(join(mergeTarget, "attachments", "original", `Export-${MERGED_EXPORT_UUID} 2`)),
    false,
    "Notion export parts should not be exposed as separate original roots"
  );
  const mergedPageRows = rowsAsObjects(
    await readFile(join(mergeTarget, "databases", "system", "pages--db_pages", "data.csv"), "utf8")
  );
  const mergedPage = mergedPageRows.find((row) => row.title === "Week Page");
  assert.ok(mergedPage, "Standalone pages from merged Notion export parts should import");
  assert.equal(
    mergedPage.notion_original_html,
    `attachments/original/Export-${MERGED_EXPORT_UUID}/Weekly/Week Page ${MERGED_PAGE_HASH}.html`,
    "Page original HTML fields should point at the merged original export root"
  );

  const splitSource = join(root, "split-source");
  const splitTarget = join(root, "split-workspace");
  const splitExportRoot = join(splitSource, `Export-${MERGED_EXPORT_UUID}`);
  const splitExportRootPart2 = join(splitSource, `Export-${SEPARATE_MARKDOWN_EXPORT_UUID}`);
  await mkdir(join(splitExportRoot, "Writing", "Letters"), { recursive: true });
  await mkdir(join(splitExportRootPart2, "Writing", "Letters"), { recursive: true });
  await writeFile(
    join(splitExportRootPart2, "Writing", `Letters ${SPLIT_ROW_DB_HASH}.csv`),
    "Name,Created time\n2025/09/24 给恺媛的回信,\"September 24, 2025 8:49 PM\"\n",
    "utf8"
  );
  await writeFile(
    join(splitExportRootPart2, "Writing", "Letters", `2025 09 24 给恺媛的回信 ${SPLIT_ROW_HASH}.md`),
    "# 2025/09/24 给恺媛的回信\n\nMarkdown fallback body.\n",
    "utf8"
  );
  await writeFile(
    join(splitExportRoot, "Writing", "Letters", `2025 09 24 给恺媛的回信 ${SPLIT_ROW_HASH}.html`),
    notionPage(
      "2025/09/24 给恺媛的回信",
      "<p>Split export row body.</p>",
      `<table class="properties"><tbody><tr class="property-row property-row-created_time"><th>Created time</th><td><time>September 24, 2025 8:49 PM</time></td></tr></tbody></table>`,
      '<div class="page-header-icon"><img class="icon notion-static-icon" src="https://app.notion.com/icons/mail_gray.svg"/></div>'
    ),
    "utf8"
  );
  const splitScan = await service.scan([splitExportRootPart2, splitExportRoot]);
  assert.equal(splitScan.databasesKept, 1, "Separate Markdown/CSV and HTML folders should scan as one import");
  await service.runImport([splitExportRootPart2, splitExportRoot], splitTarget, true, {
    skipEmptyRowsAndPages: true,
    dedupeMarkdownFiles: true,
    includeOriginalHtml: true
  });
  const splitUserDbs = await readdir(join(splitTarget, "databases", "user"), { withFileTypes: true });
  const lettersFolder = splitUserDbs.find((entry) => entry.isDirectory() && entry.name.startsWith("Letters--db_"));
  assert.ok(lettersFolder, "Expected split export database to import");
  const splitRows = rowsAsObjects(
    await readFile(join(splitTarget, "databases", "user", lettersFolder.name, "data.csv"), "utf8")
  );
  assert.equal(splitRows.length, 1, "Split export CSV row should import once");
  assert.equal(
    splitRows[0].notion_original_html,
    `attachments/original/Export-${MERGED_EXPORT_UUID}/Writing/Letters/2025 09 24 给恺媛的回信 ${SPLIT_ROW_HASH}.html`,
    "CSV rows from a separate Markdown export should match HTML row pages by stable Notion ids"
  );
  assert.equal(
    splitRows[0].row_icon,
    "https://app.notion.com/icons/mail_gray.svg",
    "HTML row icons should survive when CSV/Markdown and HTML come from separate export folders"
  );
  const splitBodyFiles = await readdir(join(splitTarget, "databases", "user", lettersFolder.name, "pages"));
  const splitBody = await readFile(join(splitTarget, "databases", "user", lettersFolder.name, "pages", splitBodyFiles[0]), "utf8");
  assert.match(splitBody, /Split export row body\./, "HTML should supply the richer body when both exports contain the same row");
  assert.doesNotMatch(splitBody, /Markdown fallback body/, "HTML should replace the matching Markdown body instead of duplicating it");
  const splitPageRows = rowsAsObjects(
    await readFile(join(splitTarget, "databases", "system", "pages--db_pages", "data.csv"), "utf8")
  );
  assert.equal(
    splitPageRows.filter((row) => row.title === "2025/09/24 给恺媛的回信").length,
    1,
    "A split export row page should not also be imported as a standalone page"
  );
  const splitEntityRows = rowsAsObjects(
    await readFile(join(splitTarget, "databases", "system", "entities--db_entities", "data.csv"), "utf8")
  );
  const splitEntities = splitEntityRows.filter((row) => row.title === "2025/09/24 给恺媛的回信");
  assert.equal(splitEntities.length, 1, "Search entity index should contain only the database row");
  assert.equal(splitEntities[0].kind, "row", "The split export page should be indexed as a row entity");
  assert.equal(splitEntities[0].source_notion_hash, SPLIT_ROW_HASH, "The row entity should keep the source Notion hash");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("Notion import service regression tests passed.");
