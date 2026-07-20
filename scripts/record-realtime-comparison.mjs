#!/usr/bin/env node

import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const args = parseArgs(process.argv.slice(2));
const appRoot = resolve(args.appRoot ?? repoRoot);
const outputDir = join(repoRoot, "marketing", "video");
const buildDir = join(outputDir, ".build");
const liveDir = join(buildDir, "live");
const rawVideoPath = join(liveDir, "lotion-realtime-raw.webm");
const liveVideoPath = join(liveDir, "lotion-realtime-live.mp4");
const pictureVideoPath = join(liveDir, "lotion-realtime-picture.mp4");
const scoreWavPath = join(liveDir, "lotion-realtime-score.wav");
const musicPath = join(liveDir, "lotion-realtime-score.m4a");
const narrationPath = join(liveDir, "lotion-realtime-narration.m4a");
const voiceDir = join(liveDir, "voice");
const outputPath = join(outputDir, "lotion-vs-notion-realtime.mp4");
const posterPath = join(outputDir, "lotion-vs-notion-realtime-poster.png");
const INTRO_DURATION_SECONDS = 1.8;
const CHAPTER_MIN_VISIBLE_MS = 1_800;
const INTRO_CROSSFADE_SECONDS = 0.3;
const TRADEOFF_DURATION_SECONDS = 8;
const END_DURATION_SECONDS = 6;
const LIVE_TRIM_LEAD_SECONDS = 0;
const TTS_COMMAND = process.env.LOTION_TTS_COMMAND ?? "edge-tts";
const NARRATION_VOICE = "en-US-AvaMultilingualNeural";
const liveNarrationCues = [];
let liveTimelineOriginMs;

await requireCommand("ffmpeg");
await requireCommand("ffprobe");
await requireCommand(TTS_COMMAND);
await mkdir(liveDir, { recursive: true });
await removeGeneratedPlaywrightVideos(liveDir);
await ensureStaticScenes();
if (!args.skipBuild) await run("npm", ["run", "build"], { cwd: appRoot });

const requireFromApp = createRequire(join(appRoot, "package.json"));
const { _electron: electron } = requireFromApp("playwright-core");
const executablePath = requireFromApp("electron");
const { databaseFolderName, pageMarkdownFileName } = await import(
  pathToFileURL(join(appRoot, "dist-electron", "shared", "workspace-paths.js")).href
);
const { PAGES_DATABASE_ID } = await import(
  pathToFileURL(join(appRoot, "dist-electron", "shared", "constants.js")).href
);

const tempRoot = await mkdtemp(join(tmpdir(), "lotion-realtime-video-"));
const workspaceRoot = join(tempRoot, "demo-workspace");
const notionSourceRoot = join(tempRoot, "notion-export");
const notionTargetRoot = join(tempRoot, "imported-workspace");
const userDataRoot = join(tempRoot, "electron-user-data");

let electronApp;
try {
  await cp(join(appRoot, "samples", "demo-space"), workspaceRoot, { recursive: true });
  await createNotionExport(notionSourceRoot);
  await mkdir(notionTargetRoot, { recursive: true });
  await initializeGitWorkspace(workspaceRoot);

  electronApp = await electron.launch({
    executablePath,
    args: [appRoot],
    cwd: appRoot,
    colorScheme: "light",
    env: { ...process.env, LOTION_USER_DATA_DIR: userDataRoot },
    recordVideo: { dir: liveDir, size: { width: 1920, height: 1080 } }
  });

  const page = await electronApp.firstWindow();
  const video = page.video();
  const videoOpenedAt = Date.now();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1.1);
  });
  await page.waitForSelector(".main-content", { timeout: 30_000 });
  await page.waitForTimeout(1_200);
  await page.evaluate(() => window.localStorage.setItem("lotion.locale", "en"));
  await page.evaluate((root) => window.lotion.workspace.open(root), workspaceRoot);
  await reloadRenderer(page);
  await page.waitForFunction(() => document.body.innerText.includes("Markdown Lab"), null, { timeout: 30_000 });

  const fixture = await seedDemoPages(page, { databaseFolderName, pageMarkdownFileName, PAGES_DATABASE_ID });
  // Refresh the renderer's page list and file tree after the API-created demo pages.
  await reloadRenderer(page);
  await page.waitForFunction((title) => document.body.innerText.includes(title), fixture.targetTitle, { timeout: 30_000 });
  await openEntity(page, { kind: "page", entityId: fixture.targetPageId });
  await waitForTitle(page, fixture.targetTitle);
  await page.waitForSelector(".cm-md-toggle-widget-outer", { timeout: 15_000 });
  await installOverlay(page);

  const liveStartedAt = Date.now();
  liveTimelineOriginMs = liveStartedAt;
  await recordPageChapter(page, fixture);
  await recordFilesChapter(page);
  await recordDatabaseChapter(page);
  await recordSearchAndBacklinksChapter(page, fixture);
  await recordGitDiffChapter(page, workspaceRoot);
  await recordImportChapter(page, electronApp, {
    sourceRoot: notionSourceRoot,
    targetRoot: notionTargetRoot
  });
  const liveEndedAt = Date.now();

  await electronApp.close();
  electronApp = undefined;
  await video.saveAs(rawVideoPath);

  const trimStart = Math.max(0, (liveStartedAt - videoOpenedAt) / 1000 - LIVE_TRIM_LEAD_SECONDS);
  const liveDuration = (liveEndedAt - liveStartedAt) / 1000 + 0.35;
  await transcodeLiveVideo({ trimStart, liveDuration });
  await composeFinalVideo();
  await validateVideo(outputPath);
  await extractPoster(outputPath, posterPath);

  const info = await probeVideo(outputPath);
  const videoStream = info.streams.find((stream) => stream.codec_type === "video");
  if (!args.keepIntermediates) {
    await rm(rawVideoPath, { force: true });
    await rm(liveVideoPath, { force: true });
    await rm(pictureVideoPath, { force: true });
    await rm(scoreWavPath, { force: true });
    await rm(musicPath, { force: true });
    await rm(narrationPath, { force: true });
    await rm(voiceDir, { recursive: true, force: true });
    await removeGeneratedPlaywrightVideos(liveDir);
  }
  console.log(JSON.stringify({
    outputPath,
    posterPath,
    durationSeconds: Number(info.format.duration),
    width: Number(videoStream?.width),
    height: Number(videoStream?.height),
    sizeBytes: (await stat(outputPath)).size,
    soundtrack: "original generated instrumental score",
    narrationVoice: NARRATION_VOICE,
    syntheticWorkspace: true
  }, null, 2));
} finally {
  await electronApp?.close().catch(() => undefined);
  if (!args.keepTemp) await rm(tempRoot, { recursive: true, force: true });
}

async function seedDemoPages(page, helpers) {
  const seeded = await page.evaluate(async () => {
    const targetTitle = "Lotion Core Demo";
    const sourceTitle = "Release Notes";
    const target = await window.lotion.pages.create({ title: targetTitle });
    await window.lotion.pages.update(target.meta.id, {
      markdown: [
        `# ${targetTitle}`,
        "",
        "A familiar workspace experience, built on files you own.",
        "",
        "```lotion-toggle",
        "summary: What is stored underneath?",
        "open: true",
        "---",
        "Plain Markdown that remains readable without Lotion.",
        "```",
        ""
      ].join("\n")
    });
    const source = await window.lotion.pages.create({ title: sourceTitle });
    return {
      targetPageId: target.meta.id,
      targetTitle,
      sourcePageId: source.meta.id,
      sourceTitle
    };
  });

  const pagesFolder = helpers.databaseFolderName(helpers.PAGES_DATABASE_ID, "pages");
  const targetPath = [
    "databases", "system", pagesFolder, "pages",
    helpers.pageMarkdownFileName(seeded.targetPageId, seeded.targetTitle)
  ].join("/");
  await page.evaluate(async ({ sourcePageId, sourceTitle, targetPath, targetTitle }) => {
    await window.lotion.pages.update(sourcePageId, {
      markdown: [
        `# ${sourceTitle}`,
        "",
        `The public release is tracked in [${targetTitle}](${targetPath}).`,
        "",
        "This link is indexed as a real backlink."
      ].join("\n")
    });
  }, { ...seeded, targetPath });
  return { ...seeded, targetPath };
}

async function recordPageChapter(page, fixture) {
  await showChapter(page, {
    number: "01",
    kicker: "NOTION CORE",
    title: "Pages & blocks",
    body: "Slash commands, rendered blocks and toggles on Markdown.",
    immediate: true,
    narration: "Create pages with slash commands, formatted blocks, and toggles. The experience stays familiar while Markdown remains readable underneath."
  });
  await showOverlay(page, {
    kicker: "NOTION CORE / PAGES & BLOCKS",
    title: "Slash blocks, formatting and toggles",
    body: "Lotion keeps the interaction. Markdown stays underneath.",
    key: "/"
  });
  await page.waitForTimeout(1_900);

  const toggle = page.locator(".cm-md-toggle-widget-outer").first();
  await toggle.scrollIntoViewIfNeeded();
  const disclosure = toggle.locator(".cm-md-toggle-disclosure").first();
  await disclosure.click();
  await page.waitForFunction(() => document.querySelector(".cm-md-toggle-disclosure")?.getAttribute("aria-expanded") === "false");
  await page.waitForTimeout(1_300);
  await disclosure.click();
  await page.waitForFunction(() => document.querySelector(".cm-md-toggle-disclosure")?.getAttribute("aria-expanded") === "true");
  await page.waitForTimeout(1_400);

  await showOverlay(page, {
    kicker: "SLASH MENU",
    title: "Insert a callout without leaving the keyboard",
    body: "The source is hidden during normal editing.",
    key: "/callout"
  });
  await focusEditorAtEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout", { delay: 105 });
  const slashMenu = page.locator(".slash-menu").first();
  await slashMenu.waitFor({ timeout: 8_000 });
  await page.waitForTimeout(1_400);
  await page.keyboard.press("Enter");
  const calloutText = "The workspace feels familiar. The files stay yours.";
  await page.keyboard.type(calloutText, { delay: 52 });
  await waitForPageMarkdown(page, fixture.targetPageId, calloutText);
  await focusEditorAtEnd(page);

  const callout = page.locator(".cm-md-callout-widget-outer").last();
  await callout.waitFor({ timeout: 12_000 });
  await callout.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_700);
  await callout.hover();
  const editSource = callout.locator(".cm-md-edit-source").first();
  if (await editSource.count()) {
    await editSource.click();
    await showOverlay(page, {
      kicker: "EDIT SOURCE",
      title: "Readable Markdown is one click away",
      body: "Rendered by default. Editable as source when needed.",
      key: "MD"
    });
    await page.waitForTimeout(2_500);
    await page.locator(".title-input").click();
  }
}

async function recordFilesChapter(page) {
  const files = page.locator(".files-tree").first();
  await showChapter(page, {
    number: "02",
    kicker: "LOTION FOUNDATION",
    title: "Files you own",
    body: "Markdown pages, CSV databases and local attachments.",
    narration: "Your workspace is Markdown, CSV, and local attachments you control."
  }, async () => {
    await files.locator(".section-heading-toggle").click();
    await files.locator(".file-tree-row").filter({ hasText: "databases/" }).first().locator(".file-tree-chevron-btn").click();
    await files.locator(".file-tree-row").filter({ hasText: "system/" }).first().locator(".file-tree-chevron-btn").click();
    await files.locator(".file-tree-row").filter({ hasText: "pages--db_pages/" }).first().locator(".file-tree-chevron-btn").click();
    await files.locator(".file-tree-row").filter({ hasText: "pages/" }).last().locator(".file-tree-chevron-btn").click();
    await files.getByText("Lotion_Core_Demo", { exact: false }).last().scrollIntoViewIfNeeded();
  });
  await showOverlay(page, {
    kicker: "LOTION / SOURCE OF TRUTH",
    title: "Pages are Markdown. Databases are CSV.",
    body: "The workspace remains inspectable with ordinary file tools.",
    key: "MD + CSV"
  });
  await page.waitForTimeout(3_000);
}

async function recordDatabaseChapter(page) {
  await showChapter(page, {
    number: "03",
    kicker: "NOTION CORE",
    title: "Databases & views",
    body: "Properties, formulas, tables and boards backed by CSV.",
    narration: "Databases support properties, formulas, tables, and boards. Edit a row or drag a card, and CSV remains the source of truth."
  }, async () => {
    await page.locator("button.nav-item").filter({ hasText: /^Tasks$/ }).first().click();
    await page.waitForSelector(".database-table", { timeout: 15_000 });
  });
  await showOverlay(page, {
    kicker: "NOTION CORE / DATABASES",
    title: "Properties, formulas and multiple views",
    body: "Edit the table. The rows stay in CSV.",
    key: "+ NEW"
  });
  await page.waitForTimeout(1_900);

  const rows = page.locator(".database-table tbody tr:not(.add-row)");
  const beforeCount = await rows.count();
  await cursorClick(page, page.locator(".new-row-menu-wrap .primary").first());
  await page.waitForFunction((count) => document.querySelectorAll(".database-table tbody tr:not(.add-row)").length === count + 1, beforeCount);
  const newRow = page.locator(".database-table tbody tr").filter({ hasText: "New row" }).first();
  const title = "Ship the first public release";
  const titleInput = newRow.locator("textarea.cell-textarea").first();
  await cursorClick(page, titleInput, { settleMs: 420 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(title, { delay: 92 });
  await page.waitForTimeout(900);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1_300);

  const editedRow = page.locator(".database-table tbody tr").filter({ hasText: title }).first();
  const dropdowns = editedRow.locator(".option-dropdown-trigger");
  await cursorClick(page, dropdowns.nth(0));
  await cursorClick(page, page.locator(".option-menu-item").filter({ hasText: "In Progress" }).first());
  await page.waitForTimeout(1_150);
  await cursorClick(page, dropdowns.nth(1));
  await cursorClick(page, page.locator(".option-menu-item").filter({ hasText: "Product" }).first());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1_150);
  await cursorClick(page, dropdowns.nth(2));
  await cursorClick(page, page.locator(".option-menu-item").filter({ hasText: "High" }).first());
  await page.waitForTimeout(2_100);

  await showOverlay(page, {
    kicker: "MULTIPLE VIEWS",
    title: "The same rows become a board",
    body: "Dragging a card updates the Status property.",
    key: "DRAG"
  });
  await cursorClick(page, page.locator(".view-tab").filter({ hasText: /^Board$/ }));
  await page.waitForSelector(".kanban-board", { timeout: 15_000 });
  await page.waitForTimeout(1_000);
  const card = page.locator(".kanban-card").filter({ hasText: title }).first();
  const doneColumn = page.locator(".kanban-col").filter({
    has: page.locator(".kanban-col-header", { hasText: /^Done/ })
  }).first();
  const doneBody = doneColumn.locator(".kanban-col-body").first();
  await card.scrollIntoViewIfNeeded();
  await doneBody.scrollIntoViewIfNeeded();
  await animatedDrag(page, card, doneBody);
  await doneColumn.locator(".kanban-card").filter({ hasText: title }).waitFor({ timeout: 12_000 });
  await page.waitForTimeout(3_000);
  await hideDemoCursor(page);
}

async function recordSearchAndBacklinksChapter(page, fixture) {
  await showChapter(page, {
    number: "04",
    kicker: "NOTION CORE",
    title: "Search & backlinks",
    body: "Find content quickly and follow real references between files.",
    narration: "Search across pages and fields, then follow backlinks calculated from real references between files."
  });
  await showOverlay(page, {
    kicker: "NOTION CORE / SEARCH & LINKS",
    title: "Search, links and backlinks",
    body: "Lotion indexes the local workspace and computes real references.",
    key: "SEARCH"
  });
  await openGlobalSearch(page);
  const input = page.locator(".global-search-input");
  await input.fill("");
  await input.pressSequentially(fixture.targetTitle, { delay: 78 });
  const result = page.locator(".global-search-hit.search-result-hit")
    .filter({ has: page.locator(".global-search-label", { hasText: fixture.targetTitle }) })
    .first();
  await result.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(2_200);
  await result.click();
  await waitForTitle(page, fixture.targetTitle);

  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.waitFor({ timeout: 12_000 });
  if (await panel.getAttribute("aria-expanded") !== "true") {
    await panel.locator(".page-secondary-toggle").click();
  }
  const backlinks = page.locator(".page-backlinks").first();
  await backlinks.waitFor({ timeout: 15_000 });
  await backlinks.locator(".page-backlink-title").filter({ hasText: fixture.sourceTitle }).waitFor({ timeout: 15_000 });
  await showOverlay(page, {
    kicker: "BACKLINKS",
    title: "The connection is calculated from the file",
    body: "No static mock: the source page points to this Markdown path.",
    key: "1 LINK"
  });
  await backlinks.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3_200);
}

async function recordGitDiffChapter(page, workspaceRoot) {
  await showChapter(page, {
    number: "05",
    kicker: "LOTION FOUNDATION",
    title: "Readable history",
    body: "Ordinary files make every change visible to Git.",
    narration: "Every file change is visible to Git, creating readable local history and backups."
  });
  const { stdout } = await runFile("git", ["diff", "--stat"], { cwd: workspaceRoot });
  await page.evaluate(({ commandOutput }) => {
    document.querySelector("#lotion-demo-overlay")?.classList.add("is-hidden");
    const terminal = document.createElement("div");
    terminal.id = "lotion-demo-terminal";
    terminal.innerHTML = `
      <div class="demo-terminal-bar"><span></span><span></span><span></span><b>synthetic demo workspace</b></div>
      <div class="demo-terminal-body">
        <div class="demo-terminal-prompt"><span>demo-workspace</span> % git diff --stat</div>
        <pre></pre>
        <div class="demo-terminal-note">Readable files by default / Markdown + CSV + Git</div>
      </div>`;
    document.body.append(terminal);
    terminal.querySelector("pre").textContent = commandOutput.trim() || "Working tree clean";
    requestAnimationFrame(() => terminal.classList.add("is-visible"));
  }, { commandOutput: stdout });
  await page.waitForTimeout(4_200);
  await page.evaluate(() => document.querySelector("#lotion-demo-terminal")?.classList.remove("is-visible"));
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    document.querySelector("#lotion-demo-terminal")?.remove();
    document.querySelector("#lotion-demo-overlay")?.classList.remove("is-hidden");
  });
}

async function recordImportChapter(page, electronApp, { sourceRoot, targetRoot }) {
  await electronApp.evaluate(({ ipcMain }, paths) => {
    ipcMain.removeHandler("notion:pickFolder");
    ipcMain.removeHandler("notion:pickTarget");
    ipcMain.handle("notion:pickFolder", async () => paths.sourceRoot);
    ipcMain.handle("notion:pickTarget", async () => paths.targetRoot);
  }, { sourceRoot, targetRoot });

  await showChapter(page, {
    number: "06",
    kicker: "FROM NOTION",
    title: "Migration with an audit trail",
    body: "Import HTML, CSV, row pages and attachments without hiding uncertainty.",
    narration: "Import Notion pages, CSV databases, and attachments. An audit report keeps uncertain conversions visible."
  });
  await showOverlay(page, {
    kicker: "FROM NOTION",
    title: "Import HTML + CSV exports",
    body: "Pages, database rows, attachments and an audit report.",
    key: "IMPORT"
  });
  await openGlobalSearch(page);
  const importSearchInput = page.locator(".global-search-input");
  await importSearchInput.fill("");
  await importSearchInput.pressSequentially("Open Notion Import", { delay: 78 });
  const command = page.locator(".global-search-hit.command-hit").filter({ hasText: "Open Notion Import" }).first();
  await command.waitFor({ timeout: 12_000 });
  await page.waitForTimeout(1_500);
  await command.click();

  const modal = page.locator(".plugin-modal").filter({ hasText: "Import from Notion" }).first();
  await modal.waitFor({ timeout: 12_000 });
  await page.waitForTimeout(1_800);
  const sourcePickers = modal.getByRole("button", { name: "Choose folder…" });
  await sourcePickers.nth(0).click();
  await sourcePickers.nth(1).click();
  await modal.getByRole("button", { name: "Review 2 exports" }).click();
  await modal.locator(".notion-summary").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(3_300);
  await modal.getByRole("button", { name: "Choose target & import…" }).first().click();

  await page.waitForFunction(
    () => document.querySelector(".title-input")?.value?.startsWith("Import report"),
    null,
    { timeout: 90_000 }
  );
  await installOverlay(page);
  await showOverlay(page, {
    kicker: "IMPORT COMPLETE",
    title: "The audit report opens automatically",
    body: "Ambiguous conversions remain visible instead of being hidden.",
    key: "AUDIT"
  });
  await page.waitForTimeout(3_200);

  await page.locator("button.nav-item").filter({ hasText: /^Tasks$/ }).first().click();
  await page.waitForSelector(".database-table", { timeout: 20_000 });
  const importedRow = page.locator(".database-table tbody tr").filter({ hasText: "Ship the first public release" }).first();
  await importedRow.waitFor({ timeout: 15_000 });
  await showOverlay(page, {
    kicker: "IMPORTED DATABASE",
    title: "CSV rows become editable database pages",
    body: "The original export is preserved alongside the converted workspace.",
    key: "CSV"
  });
  await page.waitForTimeout(3_000);
}

async function createNotionExport(root) {
  const pageHash = "aaaaaaaa111111112222222233333333";
  const csvHash = "11111111222233334444555555555555";
  const rowHash = "bbbbbbbb111111112222222233333333";
  await mkdir(join(root, "Welcome"), { recursive: true });
  await mkdir(join(root, "Tasks"), { recursive: true });
  await writeFile(
    join(root, `Welcome ${pageHash}.html`),
    notionPage("Welcome", '<p>A synthetic Notion page for the Lotion demo.</p><img src="Welcome/lotion-mark.png">'),
    "utf8"
  );
  await writeFile(join(root, "Welcome", "lotion-mark.png"), tinyPng());
  await writeFile(
    join(root, `Tasks ${csvHash}.csv`),
    "Name,Status,Priority,Notes\nShip the first public release,In Progress,High,Imported from a synthetic export\n",
    "utf8"
  );
  await writeFile(
    join(root, "Tasks", `Ship the first public release ${rowHash}.html`),
    notionPage("Ship the first public release", "<p>Verify the release, documentation, and migration report.</p>"),
    "utf8"
  );
}

function notionPage(title, body) {
  return `<!doctype html><html><body><article class="page sans"><header><h1 class="page-title">${title}</h1></header><div class="page-body">${body}</div></article></body></html>`;
}

function tinyPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
}

async function initializeGitWorkspace(root) {
  await run("git", ["init", "-q"], { cwd: root });
  await run("git", ["config", "user.name", "Lotion Demo"], { cwd: root });
  await run("git", ["config", "user.email", "demo@lotion.local"], { cwd: root });
  await run("git", ["add", "."], { cwd: root });
  await run("git", ["commit", "-q", "-m", "Synthetic demo baseline"], { cwd: root });
}

async function installOverlay(page) {
  await page.evaluate(() => {
    if (document.querySelector("#lotion-demo-style")) return;
    const style = document.createElement("style");
    style.id = "lotion-demo-style";
    style.textContent = `
      html { scroll-behavior: auto !important; }
      #root { backface-visibility: hidden; transform: translateZ(0); }
      #lotion-demo-overlay { position: fixed; z-index: 2147483646; top: 66px; right: 34px; width: 430px; box-sizing: border-box; padding: 20px 22px; color: #f8f9f6; background: rgba(24, 26, 23, .97); border: 1px solid rgba(255,255,255,.14); border-radius: 6px; box-shadow: 0 18px 44px rgba(0,0,0,.22); pointer-events: none; opacity: 0; transform: translateY(-10px); transition: opacity 220ms ease, transform 220ms ease; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      #lotion-demo-overlay.is-visible { opacity: 1; transform: translateY(0); }
      #lotion-demo-overlay.is-hidden { opacity: 0; }
      #lotion-demo-overlay .demo-kicker { color: #7ed1a0; font-size: 12px; font-weight: 760; line-height: 1.2; text-transform: uppercase; }
      #lotion-demo-overlay .demo-title { margin-top: 8px; font-size: 25px; font-weight: 730; line-height: 1.2; letter-spacing: 0; }
      #lotion-demo-overlay .demo-body { margin-top: 8px; color: #c9cdc6; font-size: 14px; line-height: 1.5; }
      #lotion-demo-overlay .demo-key { display: inline-flex; margin-top: 13px; min-width: 40px; height: 27px; box-sizing: border-box; padding: 0 9px; align-items: center; justify-content: center; color: #171916; background: #f7f8f5; border: 1px solid #d9dcd6; border-bottom-width: 3px; border-radius: 4px; font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
      #lotion-demo-cursor { position: fixed; z-index: 2147483645; left: 0; top: 0; width: 25px; height: 31px; pointer-events: none; opacity: 0; transform: translate(-2px, -2px); transition: opacity 120ms ease; filter: drop-shadow(0 0 1px rgba(255,255,255,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.5)); }
      #lotion-demo-cursor.is-visible { opacity: 1; }
      #lotion-demo-cursor::before { content: ""; position: absolute; inset: 0; background: #171916; clip-path: polygon(0 0, 0 84%, 24% 64%, 39% 100%, 55% 92%, 40% 59%, 72% 59%); }
      #lotion-demo-cursor::after { content: ""; position: absolute; left: -10px; top: -10px; width: 28px; height: 28px; border: 3px solid rgba(53, 153, 95, .72); border-radius: 50%; opacity: 0; transform: scale(.45); }
      #lotion-demo-cursor.is-clicking::after { animation: lotion-demo-click 420ms ease-out; }
      @keyframes lotion-demo-click { 0% { opacity: .95; transform: scale(.35); } 100% { opacity: 0; transform: scale(1.45); } }
      #lotion-demo-chapter { position: fixed; z-index: 2147483647; inset: 0; box-sizing: border-box; display: flex; align-items: center; padding: 0 170px; overflow: hidden; color: #f7f8f5; background: #171916; pointer-events: none; opacity: 0; visibility: hidden; transition: opacity 300ms ease, visibility 0s linear 300ms; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      #lotion-demo-chapter.is-visible { opacity: 1; visibility: visible; transition: opacity 300ms ease, visibility 0s; }
      #lotion-demo-chapter.is-instant { transition: none; }
      #lotion-demo-chapter .demo-chapter-content { position: relative; z-index: 1; width: min(980px, 68vw); }
      #lotion-demo-chapter .demo-chapter-rule { width: 74px; height: 8px; margin-bottom: 34px; background: #7ed1a0; }
      #lotion-demo-chapter .demo-chapter-kicker { color: #7ed1a0; font-size: 17px; font-weight: 760; line-height: 1.2; text-transform: uppercase; }
      #lotion-demo-chapter .demo-chapter-title { margin-top: 18px; font-size: 74px; font-weight: 760; line-height: 1.02; letter-spacing: 0; }
      #lotion-demo-chapter .demo-chapter-body { max-width: 760px; margin-top: 24px; color: #c9cdc6; font-size: 23px; line-height: 1.45; }
      #lotion-demo-chapter .demo-chapter-number { position: absolute; top: 50%; right: 112px; color: rgba(126, 209, 160, .12); transform: translateY(-55%); font-size: 250px; font-weight: 800; line-height: 1; }
      #lotion-demo-terminal { position: fixed; z-index: 2147483647; inset: 0; display: grid; place-items: center; color: #f3f5f0; background: rgba(13,15,13,.88); opacity: 0; transition: opacity 260ms ease; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
      #lotion-demo-terminal.is-visible { opacity: 1; }
      #lotion-demo-terminal { --terminal-width: min(980px, calc(100vw - 100px)); }
      #lotion-demo-terminal .demo-terminal-bar { position: absolute; top: calc(50% - 250px); width: var(--terminal-width); height: 42px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 16px; color: #9ea49b; background: #242723; border: 1px solid #3a3e39; border-bottom: 0; border-radius: 7px 7px 0 0; }
      #lotion-demo-terminal .demo-terminal-bar span { width: 11px; height: 11px; border-radius: 50%; background: #747a72; }
      #lotion-demo-terminal .demo-terminal-bar b { margin-left: 8px; font: 600 12px/1.2 ui-sans-serif, system-ui, sans-serif; }
      #lotion-demo-terminal .demo-terminal-body { width: var(--terminal-width); min-height: 390px; box-sizing: border-box; padding: 34px 38px; background: #151715; border: 1px solid #3a3e39; border-radius: 0 0 7px 7px; box-shadow: 0 32px 80px rgba(0,0,0,.45); }
      #lotion-demo-terminal .demo-terminal-prompt { color: #f5f6f3; font-size: 17px; }
      #lotion-demo-terminal .demo-terminal-prompt span { color: #7ed1a0; }
      #lotion-demo-terminal pre { margin: 24px 0 0; color: #cfd3cc; white-space: pre-wrap; font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
      #lotion-demo-terminal .demo-terminal-note { margin-top: 38px; color: #7ed1a0; font: 700 13px/1.4 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; }
    `;
    document.head.append(style);
    const overlay = document.createElement("div");
    overlay.id = "lotion-demo-overlay";
    overlay.innerHTML = '<div class="demo-kicker"></div><div class="demo-title"></div><div class="demo-body"></div><div class="demo-key"></div>';
    document.body.append(overlay);
    const chapter = document.createElement("div");
    chapter.id = "lotion-demo-chapter";
    chapter.innerHTML = '<div class="demo-chapter-content"><div class="demo-chapter-rule"></div><div class="demo-chapter-kicker"></div><div class="demo-chapter-title"></div><div class="demo-chapter-body"></div></div><div class="demo-chapter-number"></div>';
    document.body.append(chapter);
    const cursor = document.createElement("div");
    cursor.id = "lotion-demo-cursor";
    document.body.append(cursor);
    window.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
      cursor.classList.add("is-visible");
    }, true);
    window.addEventListener("mousedown", () => {
      cursor.classList.remove("is-clicking");
      void cursor.offsetWidth;
      cursor.classList.add("is-clicking");
    }, true);
    window.addEventListener("mouseup", () => {
      window.setTimeout(() => cursor.classList.remove("is-clicking"), 430);
    }, true);
  });
}

async function showChapter(page, content, prepare) {
  await installOverlay(page);
  const shownAt = Date.now();
  if (content.narration && liveTimelineOriginMs !== undefined) {
    liveNarrationCues.push({
      offsetSeconds: (shownAt - liveTimelineOriginMs) / 1000 + 0.55,
      text: content.narration
    });
  }
  await page.evaluate((next) => {
    const overlay = document.querySelector("#lotion-demo-overlay");
    const chapter = document.querySelector("#lotion-demo-chapter");
    if (!chapter) return;
    document.querySelector("#lotion-demo-cursor")?.classList.remove("is-visible");
    overlay?.classList.add("is-hidden");
    chapter.querySelector(".demo-chapter-number").textContent = next.number;
    chapter.querySelector(".demo-chapter-kicker").textContent = next.kicker;
    chapter.querySelector(".demo-chapter-title").textContent = next.title;
    chapter.querySelector(".demo-chapter-body").textContent = next.body;
    if (next.immediate) {
      chapter.classList.add("is-instant", "is-visible");
      requestAnimationFrame(() => requestAnimationFrame(() => chapter.classList.remove("is-instant")));
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => chapter.classList.add("is-visible")));
    }
  }, content);
  await page.waitForTimeout(420);
  if (prepare) await prepare();
  const remainingVisibleMs = Math.max(450, CHAPTER_MIN_VISIBLE_MS - (Date.now() - shownAt));
  await page.waitForTimeout(remainingVisibleMs);
  await page.evaluate(() => document.querySelector("#lotion-demo-chapter")?.classList.remove("is-visible"));
  await page.waitForTimeout(420);
  await page.evaluate(() => document.querySelector("#lotion-demo-overlay")?.classList.remove("is-hidden"));
}

async function showOverlay(page, content) {
  await installOverlay(page);
  await page.evaluate((next) => {
    const overlay = document.querySelector("#lotion-demo-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-visible");
    overlay.querySelector(".demo-kicker").textContent = next.kicker;
    overlay.querySelector(".demo-title").textContent = next.title;
    overlay.querySelector(".demo-body").textContent = next.body;
    const key = overlay.querySelector(".demo-key");
    key.textContent = next.key ?? "";
    key.style.display = next.key ? "inline-flex" : "none";
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add("is-visible")));
  }, content);
  await page.waitForTimeout(450);
}

async function animatedDrag(page, source, target) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Could not measure board drag endpoints");
  await page.mouse.move(from.x + from.width / 2, from.y + Math.min(28, from.height / 2), { steps: 36 });
  await page.waitForTimeout(420);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.move(from.x + from.width / 2 + 16, from.y + 22, { steps: 12 });
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(82, to.height / 2), { steps: 72 });
  await page.waitForTimeout(900);
  await page.mouse.up();
}

async function moveCursorTo(page, locator, { steps = 36, settleMs = 260, xRatio = 0.5, yRatio = 0.5 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Could not measure cursor target");
  await page.mouse.move(box.x + box.width * xRatio, box.y + box.height * yRatio, { steps });
  await page.waitForTimeout(settleMs);
}

async function cursorClick(page, locator, options = {}) {
  await moveCursorTo(page, locator, options);
  await page.mouse.down();
  await page.waitForTimeout(130);
  await page.mouse.up();
  await page.waitForTimeout(options.afterMs ?? 480);
}

async function hideDemoCursor(page) {
  await page.evaluate(() => document.querySelector("#lotion-demo-cursor")?.classList.remove("is-visible"));
}

async function focusEditorAtEnd(page) {
  const content = page.locator('[data-testid="markdown-editor"] .cm-content').first();
  await content.waitFor({ state: "visible", timeout: 12_000 });
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

async function waitForPageMarkdown(page, pageId, text) {
  await page.waitForFunction(async ({ pageId, text }) => {
    const document = await window.lotion.pages.get(pageId);
    return document.markdown.includes(text);
  }, { pageId, text }, { timeout: 15_000 });
}

async function openGlobalSearch(page) {
  if (await page.locator(".global-search").count()) await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: "F", code: "KeyF", ctrlKey: true, shiftKey: true, bubbles: true
    }));
  });
  await page.locator(".global-search-input").waitFor({ timeout: 10_000 });
}

async function openEntity(page, detail) {
  await page.evaluate((next) => {
    window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: next }));
  }, detail);
}

async function waitForTitle(page, title) {
  await page.waitForFunction(
    (expected) => document.querySelector(".title-input")?.value === expected,
    title,
    { timeout: 15_000 }
  );
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

async function transcodeLiveVideo({ trimStart, liveDuration }) {
  await run("ffmpeg", [
    "-y", "-ss", trimStart.toFixed(3), "-t", liveDuration.toFixed(3), "-i", rawVideoPath,
    "-vf", "fps=25,format=yuv420p",
    "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-fps_mode", "cfr", "-movflags", "+faststart",
    liveVideoPath
  ]);
}

async function composeFinalVideo() {
  const liveInfo = await probeVideo(liveVideoPath);
  const liveDuration = Number(liveInfo.format.duration);
  const crossfadeOffset = INTRO_DURATION_SECONDS - INTRO_CROSSFADE_SECONDS;
  await run("ffmpeg", [
    "-y",
    "-loop", "1", "-framerate", "25", "-t", String(INTRO_DURATION_SECONDS), "-i", join(buildDir, "01-title.png"),
    "-i", liveVideoPath,
    "-loop", "1", "-framerate", "25", "-t", String(TRADEOFF_DURATION_SECONDS), "-i", join(buildDir, "06-tradeoffs.png"),
    "-loop", "1", "-framerate", "25", "-t", String(END_DURATION_SECONDS), "-i", join(buildDir, "07-end.png"),
    "-filter_complex",
    `[0:v]fps=25,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v0];[1:v]fps=25,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v1];[2:v]fps=25,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v2];[3:v]fps=25,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v3];[v0][v1]xfade=transition=fadeblack:duration=${INTRO_CROSSFADE_SECONDS}:offset=${crossfadeOffset}[opening];[opening][v2][v3]concat=n=3:v=1:a=0[v]`,
    "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", pictureVideoPath
  ]);

  const pictureInfo = await probeVideo(pictureVideoPath);
  const pictureDuration = Number(pictureInfo.format.duration);
  await generateSoundtrack(pictureDuration);
  await generateNarration({ pictureDuration, liveDuration });
  await run("ffmpeg", [
    "-y", "-i", pictureVideoPath, "-i", musicPath, "-i", narrationPath,
    "-filter_complex",
    `[1:a]volume=0.78[music];[2:a]apad=whole_dur=${pictureDuration},asplit=2[sidechain][voice];[music][sidechain]sidechaincompress=threshold=0.025:ratio=10:attack=20:release=450[ducked];[ducked][voice]amix=inputs=2:duration=first:dropout_transition=0:weights=1 1:normalize=0,alimiter=limit=0.9:level=false[a]`,
    "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
    "-t", pictureDuration.toFixed(3), "-movflags", "+faststart", outputPath
  ]);
}

async function generateNarration({ pictureDuration, liveDuration }) {
  await rm(voiceDir, { recursive: true, force: true });
  await mkdir(voiceDir, { recursive: true });
  const liveStartsAt = INTRO_DURATION_SECONDS - INTRO_CROSSFADE_SECONDS;
  const tradeoffStartsAt = liveStartsAt + liveDuration;
  const endStartsAt = tradeoffStartsAt + TRADEOFF_DURATION_SECONDS;
  const cues = [
    { at: 0.12, text: "This is Lotion." },
    ...liveNarrationCues.map((cue) => ({
      at: liveStartsAt + LIVE_TRIM_LEAD_SECONDS + cue.offsetSeconds,
      text: cue.text
    })),
    {
      at: tradeoffStartsAt + 0.4,
      text: "Notion leads in collaboration and mobile. Lotion chooses open files, Git history, and open source."
    },
    {
      at: endStartsAt + 0.45,
      text: "The core workspace experience, on files you own."
    }
  ];
  const inputs = [];
  const filters = [];
  const labels = [];
  for (const [index, cue] of cues.entries()) {
    const clipPath = join(voiceDir, `voice-${String(index + 1).padStart(2, "0")}.mp3`);
    await run(TTS_COMMAND, [
      "--voice", NARRATION_VOICE,
      "--rate=-4%",
      "--text", cue.text,
      "--write-media", clipPath
    ]);
    inputs.push("-i", clipPath);
    const delayMs = Math.max(0, Math.round(cue.at * 1_000));
    const label = `voice${index}`;
    filters.push(`[${index}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,highpass=f=90,lowpass=f=9500,volume=0.95,adelay=${delayMs}|${delayMs}[${label}]`);
    labels.push(`[${label}]`);
  }
  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.9:level=false[voice]`);
  await run("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[voice]", "-t", pictureDuration.toFixed(3),
    "-c:a", "aac", "-b:a", "192k", narrationPath
  ]);
}

async function generateSoundtrack(duration) {
  const fadeOutStart = Math.max(0, duration - 3).toFixed(3);
  await run(process.execPath, [
    join(repoRoot, "scripts", "generate-video-score.mjs"),
    "--duration", duration.toFixed(3),
    "--output", scoreWavPath
  ], { cwd: repoRoot });
  await run("ffmpeg", [
    "-y", "-i", scoreWavPath,
    "-af", `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=3`,
    "-c:a", "aac", "-b:a", "192k", musicPath
  ]);
}

async function validateVideo(path) {
  const info = await probeVideo(path);
  const videoStream = info.streams.find((stream) => stream.codec_type === "video");
  const audioStream = info.streams.find((stream) => stream.codec_type === "audio");
  if (Number(videoStream?.width) !== 1920 || Number(videoStream?.height) !== 1080) {
    throw new Error(`Unexpected output dimensions: ${videoStream?.width}x${videoStream?.height}`);
  }
  if (!audioStream) throw new Error("The final video has no audio stream");
  if (Number(info.format.duration) < 45) throw new Error(`Video is unexpectedly short: ${info.format.duration}s`);
  await run("ffmpeg", ["-v", "error", "-i", path, "-f", "null", "-"]);
}

async function probeVideo(path) {
  const { stdout } = await runFile("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration,size",
    "-of", "json", path
  ], { maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function extractPoster(videoPath, targetPath) {
  await run("ffmpeg", ["-y", "-ss", "1.2", "-i", videoPath, "-frames:v", "1", targetPath]);
}

async function ensureStaticScenes() {
  const required = ["01-title.png", "06-tradeoffs.png", "07-end.png"];
  const missing = [];
  for (const name of required) {
    try {
      await stat(join(buildDir, name));
    } catch {
      missing.push(name);
    }
  }
  if (missing.length) {
    await run(process.execPath, [join(repoRoot, "scripts", "build-product-video.mjs")], { cwd: repoRoot });
  }
}

async function removeGeneratedPlaywrightVideos(dir) {
  for (const entry of await readdir(dir).catch(() => [])) {
    if (/^page@.*\.webm$/.test(entry)) await rm(join(dir, entry), { force: true });
  }
}

async function requireCommand(command) {
  await run("sh", ["-lc", 'command -v "$1" >/dev/null', "sh", command]);
}

async function run(command, commandArgs, options = {}) {
  const { stdout, stderr } = await runFile(command, commandArgs, {
    maxBuffer: 32 * 1024 * 1024,
    ...options
  });
  if (args.verbose) {
    if (stdout.trim()) process.stdout.write(stdout);
    if (stderr.trim()) process.stderr.write(stderr);
  }
  return { stdout, stderr };
}

function parseArgs(argv) {
  const parsed = {
    appRoot: undefined,
    keepIntermediates: false,
    keepTemp: false,
    skipBuild: false,
    verbose: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app-root") parsed.appRoot = argv[++index];
    else if (arg === "--keep-intermediates") parsed.keepIntermediates = true;
    else if (arg === "--keep-temp") parsed.keepTemp = true;
    else if (arg === "--skip-build") parsed.skipBuild = true;
    else if (arg === "--verbose") parsed.verbose = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}
