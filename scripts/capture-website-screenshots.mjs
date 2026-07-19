#!/usr/bin/env node

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const appRoot = resolve(args.appRoot ?? repoRoot);
const outputDir = join(repoRoot, "website", "assets");
const tempRoot = await mkdtemp(join(tmpdir(), "lotion-marketing-screenshots-"));
const workspaceRoot = join(tempRoot, "Lotion Studio");
const userDataRoot = join(tempRoot, "electron-user-data");

if (!args.skipBuild) await run("npm", ["run", "build"], { cwd: appRoot });
await createMarketingWorkspace(workspaceRoot, appRoot);
await mkdir(outputDir, { recursive: true });

const requireFromApp = createRequire(join(appRoot, "package.json"));
const { _electron: electron } = requireFromApp("playwright-core");
const executablePath = requireFromApp("electron");
let electronApp;

try {
  electronApp = await electron.launch({
    executablePath,
    args: [appRoot],
    cwd: appRoot,
    colorScheme: "light",
    env: { ...process.env, LOTION_USER_DATA_DIR: userDataRoot }
  });
  const page = await electronApp.firstWindow();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await electronApp.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.setContentSize(1600, 1000);
    window?.webContents.setZoomFactor(1.08);
  });
  await page.waitForSelector(".main-content", { timeout: 30_000 });
  await page.evaluate(() => window.localStorage.setItem("lotion.locale", "en"));
  await page.evaluate((root) => window.lotion.workspace.open(root), workspaceRoot);
  await reloadRenderer(page);
  await page.waitForFunction(() => document.body.innerText.includes("Launch plan"), null, { timeout: 30_000 });
  await page.addStyleTag({ content: "* { caret-color: transparent !important; } ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }" });

  await openNavigationItem(page, "Launch plan", ".title-input");
  await parkEditorCursorAtEnd(page);
  await page.locator(".title-input").click();
  await settleForScreenshot(page);
  await page.screenshot({ path: join(outputDir, "lotion-home.png") });
  await page.screenshot({
    path: join(outputDir, "lotion-hero.png"),
    clip: { x: 0, y: 0, width: 1600, height: 460 }
  });

  await openNavigationItem(page, "Product brief", ".title-input");
  await parkEditorCursorAtEnd(page);
  await page.locator(".title-input").click();
  await settleForScreenshot(page);
  await page.screenshot({ path: join(outputDir, "lotion-editor.png") });

  await openNavigationItem(page, "Launch tracker", ".database-table");
  const boardTab = page.locator(".view-tab").filter({ hasText: /^Board$/ });
  if (await boardTab.count() !== 1) throw new Error("Expected one Board view tab");
  await boardTab.click();
  await page.waitForSelector(".kanban-board", { timeout: 15_000 });
  await settleForScreenshot(page);
  await page.screenshot({ path: join(outputDir, "lotion-database.png") });

  await openNavigationItem(page, "Weight Tracker", ".database-table");
  await page.waitForFunction(() => document.querySelectorAll(".formula-column-reference").length === 5, null, { timeout: 15_000 });
  const formulaRows = await page.locator("tbody tr[data-row-id] td.row-num").evaluateAll((cells) =>
    cells.map((cell) => Number(cell.getAttribute("data-formula-row")))
  );
  const expectedFormulaRows = [14, 13, 12, 11, 10, 9, 8];
  if (JSON.stringify(formulaRows.slice(0, expectedFormulaRows.length)) !== JSON.stringify(expectedFormulaRows)) {
    throw new Error(`Formula row coordinates changed after sorting: ${JSON.stringify(formulaRows)}`);
  }
  const latestWeightRow = page.locator('tr[data-row-id="weight_14"]');
  const latestWeight = await latestWeightRow.locator("td").nth(3).locator("input").inputValue();
  const latestAverage = await latestWeightRow.locator("td").nth(4).innerText();
  if (latestWeight !== "78.6" || !latestAverage.includes("78.97")) {
    throw new Error(`Latest weight did not retain its previous-seven average: ${latestWeight} -> ${latestAverage}`);
  }
  await settleForScreenshot(page);
  await page.screenshot({ path: join(outputDir, "lotion-formulas.png") });

  const formulaHeader = page.locator(".column-header").filter({ hasText: "Previous 7 avg" });
  if (await formulaHeader.count() !== 1) throw new Error("Expected one previous-week moving-average column");
  await formulaHeader.locator(".field-header-button").click();
  await page.waitForSelector(".field-dialog .formula-reference-list", { timeout: 15_000 });
  const formulaDialogText = await page.locator(".field-dialog").innerText();
  if (!formulaDialogText.includes("MOVING_AVERAGE") || !formulaDialogText.includes("CSV storage order")) {
    throw new Error("Formula settings did not expose stable cross-row references");
  }
  await settleForScreenshot(page);
  await page.screenshot({ path: join(outputDir, "lotion-formula-editor.png") });

  console.log(JSON.stringify({
    outputDir,
    screenshots: [
      "lotion-hero.png",
      "lotion-home.png",
      "lotion-editor.png",
      "lotion-database.png",
      "lotion-formulas.png",
      "lotion-formula-editor.png"
    ]
  }, null, 2));
} finally {
  await electronApp?.close().catch(() => undefined);
  await rm(tempRoot, { recursive: true, force: true });
}

async function createMarketingWorkspace(root, sourceRoot) {
  const systemRoot = join(root, "databases", "system");
  const pagesRoot = join(systemRoot, "pages--db_pages");
  const workspacesRoot = join(systemRoot, "workspaces--db_workspaces");
  const databaseRoot = join(root, "databases", "user", "Launch_Tracker--db_launch");
  const formulaDatabaseRoot = join(root, "databases", "user", "Weight_Tracker--db_weight_tracker");
  await mkdir(join(pagesRoot, "pages"), { recursive: true });
  await mkdir(join(pagesRoot, "views"), { recursive: true });
  await mkdir(join(workspacesRoot, "views"), { recursive: true });
  await mkdir(join(databaseRoot, "pages"), { recursive: true });
  await mkdir(join(databaseRoot, "views"), { recursive: true });
  await mkdir(join(formulaDatabaseRoot, "views"), { recursive: true });

  const sampleRoot = join(sourceRoot, "samples", "demo-space", "databases", "system");
  await cp(join(sampleRoot, "pages--db_pages", "schema.json"), join(pagesRoot, "schema.json"));
  await cp(join(sampleRoot, "pages--db_pages", "views", "view_default.json"), join(pagesRoot, "views", "view_default.json"));
  await cp(join(sampleRoot, "workspaces--db_workspaces", "schema.json"), join(workspacesRoot, "schema.json"));
  await cp(join(sampleRoot, "workspaces--db_workspaces", "views", "view_default.json"), join(workspacesRoot, "views", "view_default.json"));

  const pages = [
    {
      id: "pg_launch",
      title: "Launch plan",
      icon: "",
      file: "Launch_plan--pg_launch.md",
      markdown: [
        "**<span data-lotion-bg=\"yellow\">Public beta opens July 28.</span>**",
        "",
        "> **A workspace that belongs to you**",
        "> Familiar editing on top of Markdown, CSV, local files, and Git history.",
        "",
        "## This week",
        "",
        "- [x] Finalize the desktop experience",
        "- [x] Record the product walkthrough",
        "- [ ] Publish the release notes",
        "- [ ] Invite the first 100 users",
        "",
        "## What stays yours",
        "",
        "- **Pages** remain readable Markdown",
        "- **Databases** remain portable CSV",
        "- **History** remains inspectable with Git",
        ""
      ].join("\n")
    },
    {
      id: "pg_brief",
      title: "Product brief",
      icon: "",
      file: "Product_brief--pg_brief.md",
      markdown: [
        "> **The promise**",
        "> Keep the calm, connected workflow. Keep the files too.",
        "",
        "## Why Lotion",
        "",
        "Lotion is a local-first workspace for people who want a polished editor without locking their knowledge inside an account.",
        "",
        "## Core experience",
        "",
        "- **Write naturally.** Slash commands, rich formatting, callouts, toggles, and embeds.",
        "- **Structure anything.** Tables and boards operate over readable CSV records.",
        "- **Own the history.** Every durable change can be inspected and backed up with Git.",
        "",
        "```lotion-toggle",
        "summary: What stays portable?",
        "open: true",
        "---",
        "Pages are Markdown. Databases are CSV. Attachments remain ordinary files.",
        "```",
        ""
      ].join("\n")
    },
    {
      id: "pg_research",
      title: "Research notes",
      icon: "",
      file: "Research_notes--pg_research.md",
      markdown: "## Interview themes\n\n- Fast capture\n- Predictable organization\n- Durable ownership\n"
    },
    {
      id: "pg_weekly",
      title: "Weekly review",
      icon: "",
      file: "Weekly_review--pg_weekly.md",
      markdown: "## Friday review\n\n- [x] Review active work\n- [ ] Choose next week's focus\n- [ ] Back up the workspace\n"
    }
  ];
  const pageColumns = [
    "id", "created_time", "updated_time", "title", "kind", "body_path", "icon", "cover", "cover_offset", "tags", "date", "url", "full_width", "database_id", "row_id", "page_file", "path", "parent_id", "small_text"
  ];
  const pageRows = pages.map((page, index) => ({
    id: page.id,
    created_time: `2026-07-${String(10 + index).padStart(2, "0")}T09:00:00.000Z`,
    updated_time: `2026-07-${String(18 - index).padStart(2, "0")}T16:30:00.000Z`,
    title: page.title,
    kind: "page",
    body_path: `databases/system/pages--db_pages/pages/${page.file}`,
    icon: page.icon,
    cover: "",
    cover_offset: 0,
    tags: "",
    date: "",
    url: "",
    full_width: false,
    database_id: "pages",
    row_id: page.id,
    page_file: page.file,
    path: "",
    parent_id: "",
    small_text: false
  }));
  await writeFile(join(pagesRoot, "data.csv"), toCsv(pageColumns, pageRows), "utf8");
  for (const page of pages) await writeFile(join(pagesRoot, "pages", page.file), page.markdown, "utf8");

  await writeFile(join(workspacesRoot, "data.csv"), toCsv(
    ["id", "created_time", "updated_time", "title", "icon"],
    [{ id: "sp_marketing", created_time: "2026-07-10T09:00:00.000Z", updated_time: "2026-07-19T09:00:00.000Z", title: "Lotion Studio", icon: "" }]
  ), "utf8");

  const databaseRows = [
    ["row_1", "Polish onboarding flow", "In Progress", "High", "Product;UI", "2026-07-21", 3, false],
    ["row_2", "Package the macOS release", "In Progress", "High", "Release", "2026-07-22", 2, false],
    ["row_3", "Publish launch announcement", "Todo", "High", "Product", "2026-07-24", 2, false],
    ["row_4", "Record product walkthrough", "Done", "Medium", "Product", "2026-07-18", 3, true],
    ["row_5", "Run import regression suite", "Done", "High", "Release", "2026-07-18", 2, true],
    ["row_6", "Draft release notes", "Todo", "Medium", "Git", "2026-07-23", 1, false],
    ["row_7", "Review first-run copy", "Todo", "Low", "UI", "2026-07-25", 1, false]
  ].map(([id, title, status, priority, tags, dueDate, effort, done], index) => ({
    id,
    created_time: `2026-07-${String(11 + index).padStart(2, "0")}T09:00:00.000Z`,
    updated_time: `2026-07-${String(18 + (index % 2)).padStart(2, "0")}T15:00:00.000Z`,
    title,
    status,
    priority,
    tags,
    due_date: dueDate,
    effort,
    done,
    page_file: `${title.replaceAll(" ", "_")}--${id}.md`
  }));
  await writeFile(join(databaseRoot, "data.csv"), toCsv(
    ["id", "created_time", "updated_time", "title", "status", "priority", "tags", "due_date", "effort", "done", "page_file"],
    databaseRows
  ), "utf8");
  for (const row of databaseRows) {
    await writeFile(join(databaseRoot, "pages", row.page_file), `## ${row.title}\n\nLaunch work tracked in Lotion.\n`, "utf8");
  }

  const fields = [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Title", type: "text" },
    { id: "status", name: "Status", type: "select", options: [
      { id: "opt_todo", name: "Todo", color: "gray" },
      { id: "opt_progress", name: "In Progress", color: "blue" },
      { id: "opt_done", name: "Done", color: "green" }
    ] },
    { id: "priority", name: "Priority", type: "select", options: [
      { id: "opt_high", name: "High", color: "red" },
      { id: "opt_medium", name: "Medium", color: "yellow" },
      { id: "opt_low", name: "Low", color: "gray" }
    ] },
    { id: "tags", name: "Tags", type: "multi_select", options: [
      { id: "opt_product", name: "Product", color: "purple" },
      { id: "opt_ui", name: "UI", color: "blue" },
      { id: "opt_release", name: "Release", color: "green" },
      { id: "opt_git", name: "Git", color: "orange" }
    ] },
    { id: "due_date", name: "Due date", type: "date" },
    { id: "effort", name: "Effort", type: "number" },
    { id: "done", name: "Done", type: "checkbox" },
    { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
  ];
  await writeJson(join(databaseRoot, "schema.json"), {
    id: "db_launch",
    name: "Launch tracker",
    created_time: "2026-07-10T09:00:00.000Z",
    updated_time: "2026-07-19T09:00:00.000Z",
    fields,
    defaultViewId: "view_default"
  });
  const visibleFieldIds = ["title", "status", "priority", "tags", "due_date", "effort", "done"];
  await writeJson(join(databaseRoot, "views", "view_default.json"), {
    id: "view_default",
    databaseId: "db_launch",
    name: "Table",
    type: "table",
    visibleFieldIds,
    fieldOrder: visibleFieldIds,
    sorts: [{ fieldId: "due_date", direction: "asc" }],
    filters: []
  });
  await writeJson(join(databaseRoot, "views", "view_board.json"), {
    id: "view_board",
    databaseId: "db_launch",
    name: "Board",
    type: "kanban",
    visibleFieldIds: ["title", "priority", "tags", "due_date"],
    fieldOrder: ["title", "priority", "tags", "due_date"],
    sorts: [],
    filters: [],
    config: { groupBy: "status" }
  });

  const weights = [80, 79.8, 79.7, 79.9, 79.5, 79.4, 79.2, 79.1, 79, 78.9, 79.1, 78.8, 78.7, 78.6];
  const weightRows = weights.map((weight, index) => {
    const day = index + 6;
    const previousWeekAverage = index < 7
      ? ""
      : Number((weights.slice(index - 7, index).reduce((sum, value) => sum + value, 0) / 7).toFixed(2));
    return {
      id: `weight_${String(index + 1).padStart(2, "0")}`,
      created_time: `2026-07-${String(day).padStart(2, "0")}T07:15:00.000Z`,
      updated_time: `2026-07-${String(day).padStart(2, "0")}T07:15:00.000Z`,
      title: index === weights.length - 1 ? "Today" : `Jul ${day}`,
      recorded_date: `2026-07-${String(day).padStart(2, "0")}`,
      weight_kg: weight,
      previous_week_avg: previousWeekAverage,
      note: index === weights.length - 1 ? "Before breakfast" : index === 10 ? "Sore after workout" : "",
      page_file: ""
    };
  });
  await writeFile(join(formulaDatabaseRoot, "data.csv"), toCsv(
    ["id", "created_time", "updated_time", "title", "recorded_date", "weight_kg", "previous_week_avg", "note", "page_file"],
    weightRows
  ), "utf8");
  const weightFields = [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created time", type: "created_time", system: true },
    { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
    { id: "title", name: "Entry", type: "text" },
    { id: "recorded_date", name: "Date", type: "date" },
    { id: "weight_kg", name: "Weight (kg)", type: "number" },
    {
      id: "previous_week_avg",
      name: "Previous 7 avg (kg)",
      type: "formula",
      formula: '=MOVING_AVERAGE("weight_kg",7,2)'
    },
    { id: "note", name: "Note", type: "text" },
    { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
  ];
  await writeJson(join(formulaDatabaseRoot, "schema.json"), {
    id: "db_weight_tracker",
    name: "Weight Tracker",
    created_time: "2026-07-06T07:00:00.000Z",
    updated_time: "2026-07-19T07:15:00.000Z",
    fields: weightFields,
    defaultViewId: "view_recent"
  });
  const weightVisibleFields = ["title", "recorded_date", "weight_kg", "previous_week_avg", "note"];
  await writeJson(join(formulaDatabaseRoot, "views", "view_recent.json"), {
    id: "view_recent",
    databaseId: "db_weight_tracker",
    name: "Recent",
    type: "table",
    visibleFieldIds: weightVisibleFields,
    fieldOrder: weightVisibleFields,
    columnWidths: { title: 150, recorded_date: 150, weight_kg: 140, previous_week_avg: 190, note: 230 },
    sorts: [{ fieldId: "recorded_date", direction: "desc" }],
    filters: [],
    columnSummaries: { weight_kg: "average", previous_week_avg: "average" }
  });

  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: "sp_marketing",
    name: "Lotion Studio",
    pages: pages.map((page) => page.id),
    databases: ["db_launch", "db_weight_tracker"],
    systemDatabases: ["workspaces", "pages"],
    activePageId: "pg_launch",
    recents: [
      { type: "page", id: "pg_launch", at: "2026-07-19T17:00:00.000Z", count: 8 },
      { type: "database", id: "db_weight_tracker", at: "2026-07-19T16:45:00.000Z", count: 14 },
      { type: "database", id: "db_launch", at: "2026-07-19T16:30:00.000Z", count: 5 },
      { type: "page", id: "pg_brief", at: "2026-07-19T16:00:00.000Z", count: 3 }
    ]
  });
}

async function openNavigationItem(page, label, expectedSelector) {
  const item = page.locator("button.nav-item").filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) });
  const count = await item.count();
  if (count < 1) throw new Error(`Could not find a navigation item for ${label}`);
  await item.first().click();
  await page.waitForSelector(expectedSelector, { timeout: 15_000 });
  if (expectedSelector === ".title-input") {
    await page.waitForFunction((title) => document.querySelector(".title-input")?.value === title, label, { timeout: 15_000 });
  }
}

async function settleForScreenshot(page) {
  await page.evaluate(() => {
    document.querySelector(".main-content")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.activeElement?.blur();
  });
  await page.waitForTimeout(900);
}

async function parkEditorCursorAtEnd(page) {
  const content = page.locator('[data-testid="markdown-editor"] .cm-content');
  if (await content.count() !== 1) return;
  await content.evaluate((element) => {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End").catch(() => undefined);
  await page.keyboard.press("End").catch(() => undefined);
}

async function reloadRenderer(page) {
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes("ERR_NETWORK_CHANGED") && error?.name !== "TimeoutError") throw error;
  }
  await page.waitForSelector(".main-content", { timeout: 30_000 });
}

function toCsv(columns, rows) {
  const encode = (value) => {
    const text = value === undefined || value === null ? "" : String(value);
    return /[\",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => encode(row[column])).join(",")).join("\n")}\n`;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(values) {
  const parsed = { skipBuild: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--skip-build") parsed.skipBuild = true;
    else if (value === "--app-root") parsed.appRoot = values[++index];
  }
  return parsed;
}

async function run(command, commandArgs, options = {}) {
  await runFile(command, commandArgs, { maxBuffer: 32 * 1024 * 1024, ...options });
}
