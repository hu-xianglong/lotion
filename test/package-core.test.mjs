import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { IconsService } from "../dist-electron/main/services/icons-service.js";
import { GitService } from "../dist-electron/main/services/git-service.js";
import { GitSyncScheduler, gitAutoBackupDelayMs, gitAutoPushDelayMs } from "../dist-electron/main/services/git-sync-scheduler.js";
import { SearchService } from "../dist-electron/main/services/search-service.js";
import { DatabaseService } from "../dist-electron/main/services/database-service.js";
import { RowPagesService } from "../dist-electron/main/services/row-pages-service.js";
import { WorkspaceService } from "../dist-electron/main/services/workspace-service.js";
import { PageService } from "../dist-electron/main/services/page-service.js";
import { PluginStorageService } from "../dist-electron/main/services/plugin-storage-service.js";
import {
  PagesDatabaseService,
  createPagesSchema,
  createPagesDefaultView,
  pageBodyPath,
  defaultPageRecordInput
} from "../dist-electron/main/services/pages-database-service.js";
import {
  EntitiesDatabaseService,
  createEntitiesSchema,
  createEntitiesDefaultView,
  normalizeEntitiesSchema,
  entityToRecord
} from "../dist-electron/main/services/entities-database-service.js";
import { FileService, fileService } from "../dist-electron/main/services/file-service.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import {
  parsePage,
  readPageFile,
  serializeMarkdownBody,
  writeMarkdownBody,
  writePageFile
} from "../dist-electron/main/storage/markdown-file.js";
import { readJsonFile, writeJsonFile } from "../dist-electron/main/storage/json-file.js";
import { appendCsvRecord, readCsvFile, writeCsvFile } from "../dist-electron/main/storage/csv-file.js";
import { WorkspacePaths } from "../dist-electron/main/storage/paths.js";
import {
  parseDateTimeValue,
  parseDateValue,
  isValidDateValue,
  isDateLikeFieldType,
  defaultDateFormatForField,
  defaultTimeFormatForField,
  formatDateForField
} from "../dist-electron/shared/date-values.js";
import { evaluateFormula } from "../dist-electron/shared/formula.js";
import { orderFieldIdsByInformationAmount } from "../dist-electron/shared/field-order.js";
import { workspaceAttachmentPath } from "../dist-electron/shared/attachments.js";
import {
  databaseFolderName,
  databaseStableFolderId,
  databaseWorkspacePath,
  databaseWorkspacePathWithName,
  idFromDatabaseFolderName,
  idFromMarkdownFileName,
  pageMarkdownFileName,
  rowPagesWorkspacePath,
  templatePagesWorkspacePath
} from "../dist-electron/shared/workspace-paths.js";
import { serializePathValue, displayPathValue, parsePathValue } from "../dist-electron/shared/path-values.js";
import { emojiIconText, formatEmojiIcon, isEmojiIcon } from "../dist-electron/shared/entity-icons.js";
import {
  displayShortcutChord,
  normalizeShortcutChord,
  readShortcutOverrides,
  resolveShortcuts,
  shortcutActionForEvent,
  validateShortcutOverride
} from "../dist-electron/shared/shortcuts.js";
import { DEFAULT_VIEW_ID, ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { databaseCapabilities } from "../dist-electron/shared/database-capabilities.js";
import { databaseViewLink, parseDatabaseViewLink } from "../dist-electron/shared/database-view-link.js";
import { databaseRowLink, parseDatabaseRowLink } from "../dist-electron/shared/database-row-link.js";
import {
  evaluateFilterExpression,
  filterConditionError,
  legacyFiltersToExpression,
  normalizeFilterExpression
} from "../dist-electron/shared/filter-expression.js";
import { compareFieldValues, sortDatabaseRecords } from "../dist-electron/shared/database-sort.js";
import { EMPTY_GROUP_KEY, groupDatabaseRecords, normalizeViewGroups } from "../dist-electron/shared/database-grouping.js";
import { defaultPageOpenMode, normalizePageOpenMode } from "../dist-electron/shared/database-page-open.js";
import { Registry } from "../dist-electron/shared/plugin-host/registry.js";
import { InProcessEventBus } from "../dist-electron/shared/plugin-host/event-bus.js";
import { PluginHost } from "../dist-electron/shared/plugin-host/host.js";
import { PluginContextImpl } from "../dist-electron/shared/plugin-host/context.js";
import { InMemoryPluginSettings } from "../dist-electron/shared/plugin-host/settings.js";
import { Plugin } from "../dist-electron/shared/plugin-api.js";
import { installOpenAILLM, manifest as openAILLMManifest } from "../dist-electron/builtin-plugins/llm-openai/index.js";
import { renderOpenAILLMChat } from "../dist-electron/builtin-plugins/llm-openai/chat-ui.js";
import { createLotionToolExecutor, createLotionTools } from "../dist-electron/builtin-plugins/llm-openai/lotion-tools.js";
import {
  buildWorkspaceQAContext,
  citationToEntityRef,
  normalizeAdvancedSearchCitation
} from "../dist-electron/builtin-plugins/llm-openai/qa-agent.js";
import { ALL_LOTION_TOOL_NAMES } from "../dist-electron/builtin-plugins/llm-openai/tool-catalog.js";
import { completeWithOpenAICompatibleChat } from "../dist-electron/builtin-plugins/llm-openai/openai-chat-completions.js";
import { completeWithOpenAIResponses } from "../dist-electron/builtin-plugins/llm-openai/openai-responses.js";
import { renderOpenAILLMSettings } from "../dist-electron/builtin-plugins/llm-openai/settings-ui.js";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  enabledToolsForMode,
  LLM_TOOL_MODE_LABELS,
  readOpenAILLMSettings,
  readSavedOpenAIAPIKey,
  writeOpenAILLMSettings
} from "../dist-electron/builtin-plugins/llm-openai/settings.js";
import {
  DEFAULT_OLLAMA_EMBEDDING_MODEL,
  AdvancedSearchPluginService,
  JsonVectorIndexAdapter,
  LanceDbVectorIndexAdapter,
  OllamaEmbeddingProvider,
  AdvancedSearchProviderError,
  chunkAdvancedSearchText
} from "../dist-electron/builtin-plugins/advanced-search/service.js";
import {
  GitHubBackupConflictError,
  GitHubBackupRateLimitError,
  GitHubBackupService,
  GitHubRestBackupAdapter,
  StorageGitHubBackupAdapter,
  diffLines,
  joinGitHubPath,
  normalizeGitHubBackupSettings,
  pageBackupPath
} from "../dist-electron/builtin-plugins/github-backup/service.js";

const execFileAsync = promisify(execFile);

test("plugin host scopes providers, events, commands, settings, and inspection", async () => {
  const platform = {
    workspace: { name: "workspace-api" },
    ui: { notify: () => undefined }
  };
  const host = new PluginHost(platform);
  const storage = host.storageFor("plugin-test");
  await storage.appendJsonl("history.jsonl", { role: "user", content: "hello" });
  assert.deepEqual(await storage.readJsonl("history.jsonl"), [{ role: "user", content: "hello" }]);
  assert.equal(await storage.readJson("index.json"), null);
  await storage.writeJson("index.json", { ready: true });
  assert.deepEqual(await storage.readJson("index.json"), { ready: true });
  await storage.delete("index.json");
  assert.equal(await storage.readJson("index.json"), null);
  const settings = new InMemoryPluginSettings();
  await settings.set("theme", "green");
  assert.equal(settings.get("theme"), "green");
  assert.equal(settings.get("missing", "fallback"), "fallback");
  assert.deepEqual(settings.all(), { theme: "green" });
  await settings.delete("theme");
  assert.equal(settings.get("theme"), undefined);

  const manifest = {
    id: "plugin-test",
    name: "Plugin Test",
    version: "1.0.0",
    author: "Lotion",
    description: "Test plugin",
    permissions: ["workspace.read"]
  };
  const ctx = new PluginContextImpl(host, manifest, settings);
  assert.equal(ctx.workspace, platform.workspace);
  assert.equal(ctx.ui, platform.ui);

  const fieldProvider = {
    type: "plugin-test.text",
    label: "Plugin Text",
    render: (value) => String(value)
  };
  const fieldDisposable = ctx.fields.register(fieldProvider);
  assert.equal(ctx.fields.get(fieldProvider.type), fieldProvider);
  assert.deepEqual(ctx.fields.list(), [fieldProvider]);

  ctx.views.register({ type: "plugin-test.table", label: "Table", render: () => undefined });
  ctx.blocks.register({ type: "plugin-test.block", render: () => undefined });
  ctx.sync.register({ type: "plugin-test.sync", label: "Sync", commit: async () => undefined });
  ctx.search.register({ type: "plugin-test.search", label: "Search", search: async () => [] });
  ctx.importers.register({ type: "plugin-test.import", label: "Import", import: async () => undefined });
  ctx.previews.register({ type: "plugin-test.preview", label: "Preview", render: () => undefined });
  ctx.ai_providers.register({ type: "plugin-test.ai", label: "AI", complete: async (req) => `done:${req.prompt}` });

  let commandRuns = 0;
  ctx.commands.register({ id: "cmd.test", title: "Command", run: async () => { commandRuns += 1; } });
  await ctx.commands.run("cmd.test");
  assert.equal(commandRuns, 1);
  assert.rejects(() => host.commands.run("missing.command"), /Command not found/);

  ctx.sidebar.register({ id: "sidebar.test", title: "Sidebar" });
  ctx.pageActions.register({ id: "page-action.test", title: "Action", run: async () => undefined });
  ctx.settingsTabs.register({ id: "settings.test", title: "Settings", render: () => undefined });

  const emitted = [];
  const eventDisposable = ctx.events.on("page.*", (data) => emitted.push(data));
  ctx.events.emit("page.saved", { id: "pg_1" });
  assert.deepEqual(emitted, [{ id: "pg_1" }]);
  eventDisposable.dispose();
  ctx.events.emit("page.saved", { id: "pg_2" });
  assert.deepEqual(emitted, [{ id: "pg_1" }]);

  assert.equal(await ctx.ai.complete({ prompt: "hello" }), "done:hello");
  assert.equal(ctx.ai.available(), true);

  const inspection = host.inspect();
  assert.equal(inspection.plugins[0].id, manifest.id);
  assert.equal(inspection.providers.some((provider) => provider.sourcePluginId === manifest.id), true);
  assert.equal(inspection.commands[0].sourcePluginId, manifest.id);
  assert.equal(inspection.sidebarItems[0].sourcePluginId, manifest.id);
  assert.equal(inspection.pageActions[0].sourcePluginId, manifest.id);
  assert.equal(inspection.settingsTabs[0].sourcePluginId, manifest.id);
  assert.equal(inspection.plugins[0].status, "active");

  fieldDisposable.dispose();
  assert.equal(ctx.fields.get(fieldProvider.type), undefined);
  host.noteProviderSource("field-type", "orphan", "a");
  host.clearProviderSource("field-type", "orphan", "b");
  host.clearProviderSource("field-type", "orphan", "a");
  host.noteKeyedSource("command", "orphan", "a");
  host.clearKeyedSource("command", "orphan", "b");
  host.clearKeyedSource("command", "orphan", "a");

  ctx.disposeAll();
  assert.equal(host.inspect().plugins.length, 0);

  host.registerDisabledPlugin(manifest);
  const disabledInspection = host.inspect();
  assert.equal(disabledInspection.plugins[0].id, manifest.id);
  assert.equal(disabledInspection.plugins[0].status, "disabled");
  assert.equal(disabledInspection.commands.length, 0);
  host.setPluginStatus(manifest.id, "active");
  assert.equal(host.inspect().plugins[0].status, "active");
});

test("csv reader preserves simple fast path and quoted fallback behavior", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-csv-reader-"));
  try {
    const simplePath = join(root, "simple.csv");
    await writeFile(simplePath, "id,title,count,done\r\nrow1,Plain,42,true\r\nrow2,,0,false\r\n", "utf8");
    assert.deepEqual(await readCsvFile(simplePath), [
      { id: "row1", title: "Plain", count: 42, done: true },
      { id: "row2", title: "", count: 0, done: false }
    ]);

    const quotedPath = join(root, "quoted.csv");
    await writeFile(
      quotedPath,
      [
        "id,title,notes",
        "row1,\"Comma, inside\",\"Line one\nLine two\"",
        "row2,\"Quote \"\"inside\"\"\",plain",
        ""
      ].join("\n"),
      "utf8"
    );
    assert.deepEqual(await readCsvFile(quotedPath), [
      { id: "row1", title: "Comma, inside", notes: "Line one\nLine two" },
      { id: "row2", title: "Quote \"inside\"", notes: "plain" }
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("registry and event bus handle duplicates, disposals, wildcards, and bad handlers", () => {
  const registry = new Registry("field-type");
  const changes = [];
  const changeDisposable = registry.onChange((change) => changes.push(change.kind));
  const provider = { type: "text", label: "Text" };
  const disposable = registry.register(provider);
  assert.equal(registry.get("text"), provider);
  assert.throws(() => registry.register(provider), /already registered/);
  disposable.dispose();
  changeDisposable.dispose();
  assert.deepEqual(changes, ["added", "removed"]);

  const bus = new InProcessEventBus();
  const seen = [];
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const exact = bus.on("page.saved", (data) => seen.push(["exact", data.id]));
    const prefix = bus.on("page.*", (data) => seen.push(["prefix", data.id]));
    const global = bus.on("*", (data) => seen.push(["global", data.id]));
    bus.on("page.saved", () => { throw new Error("bad handler"); });
    bus.emit("page.saved", { id: "pg_1" });
    assert.equal(bus.size(), 4);
    exact.dispose();
    prefix.dispose();
    global.dispose();
    bus.emit("page.saved", { id: "pg_2" });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(seen, [
    ["exact", "pg_1"],
    ["prefix", "pg_1"],
    ["global", "pg_1"]
  ]);
  assert.equal(errors.some((line) => line.includes("bad handler")), true);
});

test("shortcut registry normalizes, detects conflicts, and maps keyboard events", () => {
  assert.equal(normalizeShortcutChord("cmd + shift + f"), "Mod+Shift+F");
  assert.equal(normalizeShortcutChord("Option+Shift+f"), "Alt+Shift+F");
  assert.equal(displayShortcutChord("Mod+Shift+F", "mac"), "⌘⇧F");
  assert.equal(displayShortcutChord("Mod+Shift+F", "other"), "Ctrl+Shift+F");

  const sameChord = validateShortcutOverride("lotion.open-sidebar-settings", "Mod+Shift+F", {});
  assert.equal(sameChord?.conflictingActionId, "lotion.open-search");
  assert.match(sameChord?.message ?? "", /already used/);

  const textConflict = validateShortcutOverride("lotion.open-search", "F", {});
  assert.match(textConflict?.message ?? "", /normal typing/);

  const reserved = validateShortcutOverride("lotion.open-search", "Mod+R", {});
  assert.match(reserved?.message ?? "", /reserved/);

  const overrides = readShortcutOverrides(JSON.stringify({
    "lotion.open-search": "Alt+Shift+F",
    "lotion.new-tab": null,
    unknown: "Mod+U"
  }));
  assert.deepEqual(overrides, {
    "lotion.open-search": "Alt+Shift+F",
    "lotion.new-tab": null
  });

  const resolved = resolveShortcuts(overrides, "mac");
  const openSearch = resolved.find((shortcut) => shortcut.id === "lotion.open-search");
  const newTab = resolved.find((shortcut) => shortcut.id === "lotion.new-tab");
  assert.equal(openSearch?.display, "⌥⇧F");
  assert.equal(openSearch?.customized, true);
  assert.equal(newTab?.disabled, true);

  assert.equal(shortcutActionForEvent({
    key: "F",
    metaKey: false,
    ctrlKey: false,
    altKey: true,
    shiftKey: true
  }, overrides), "lotion.open-search");
  assert.equal(shortcutActionForEvent({
    key: "f",
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: true
  }, overrides), null);
  assert.equal(shortcutActionForEvent({
    key: "f",
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: true
  }, {}), "lotion.open-search");
});

test("icons service copies icons and covers into workspace metadata stores", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-icons-"));
  const sourceImage = join(root, "source.png");
  const sourceCover = join(root, "cover.jpg");
  const sourceText = join(root, "source.txt");
  const schemaPath = join(root, "schemas", "db_test.json");
  await writeFile(sourceImage, "fake png", "utf8");
  await writeFile(sourceCover, "fake jpg", "utf8");
  await writeFile(sourceText, "not image", "utf8");
  await writeJsonFile(schemaPath, {
    id: "db_test",
    name: "Database",
    fields: [{ id: "title", name: "Name", type: "title" }],
    views: [],
    created_time: "",
    updated_time: ""
  });

  const workspaceCalls = [];
  const pageCalls = [];
  const databaseCalls = [];
  const workspace = {
    requirePaths: () => ({
      root,
      schema: () => schemaPath
    }),
    setWorkspaceIcon: async (path) => workspaceCalls.push(["setIcon", path]),
    clearWorkspaceIcon: async () => workspaceCalls.push(["clearIcon"])
  };
  const pages = {
    setIcon: async (pageId, path) => pageCalls.push(["icon", pageId, path]),
    setCover: async (pageId, path) => pageCalls.push(["cover", pageId, path])
  };
  const databases = {
    ensureHiddenField: async (_databaseId, field) => databaseCalls.push(["field", field.id]),
    setSystemCell: async (databaseId, rowId, fieldId, value) =>
      databaseCalls.push(["cell", databaseId, rowId, fieldId, value])
  };

  const service = new IconsService(workspace, pages);
  service.setDatabaseService(databases);
  service.promptForImage = async () => sourceImage;

  try {
    const pageIcon = await service.setForPage("pg_1");
    assert.match(pageIcon.iconPath, /^attachments\/icons\/[a-f0-9]{16}\.png$/);
    assert.deepEqual(pageCalls[0], ["icon", "pg_1", pageIcon.iconPath]);
    await service.clearForPage("pg_1");
    assert.deepEqual(pageCalls[1], ["icon", "pg_1", undefined]);

    const databaseIcon = await service.setForDatabase("db_test");
    let schema = await readJsonFile(schemaPath);
    assert.equal(schema.icon, databaseIcon.iconPath);
    await service.clearForDatabase("db_test");
    schema = await readJsonFile(schemaPath);
    assert.equal(schema.icon, undefined);
    await service.clearForDatabase("db_test");

    await service.setForWorkspace();
    assert.equal(workspaceCalls[0][0], "setIcon");
    await service.clearForWorkspace();
    assert.deepEqual(workspaceCalls[1], ["clearIcon"]);

    service.promptForImage = async () => sourceCover;
    const pageCover = await service.setCoverForPage("pg_1");
    assert.match(pageCover.coverPath, /^attachments\/covers\/[a-f0-9]{16}\.jpg$/);
    await service.clearCoverForPage("pg_1");
    const databaseCover = await service.setCoverForDatabase("db_test");
    schema = await readJsonFile(schemaPath);
    assert.equal(schema.cover, databaseCover.coverPath);
    await service.setCoverOffsetForDatabase("db_test", 250);
    schema = await readJsonFile(schemaPath);
    assert.equal(schema.coverOffset, 100);
    await service.clearCoverForDatabase("db_test");
    schema = await readJsonFile(schemaPath);
    assert.equal(schema.cover, undefined);
    await service.clearCoverForDatabase("db_test");

    await service.setCoverForRow("db_test", "row_1");
    await service.clearCoverForRow("db_test", "row_1");
    await service.setCoverOffsetForRow("db_test", "row_1", -30);
    assert.equal(databaseCalls.some((call) => call[1] === "cover"), true);
    assert.equal(databaseCalls.some((call) => call[3] === "cover_offset" && call[4] === "0"), true);

    service.promptForImage = async () => null;
    assert.deepEqual(await service.setForPage("pg_cancel"), { iconPath: "" });
    assert.deepEqual(await service.setForDatabase("db_test"), { iconPath: "" });
    assert.deepEqual(await service.setForWorkspace(), { iconPath: "" });
    assert.deepEqual(await service.setCoverForPage("pg_cancel"), { coverPath: "" });
    assert.deepEqual(await service.setCoverForDatabase("db_test"), { coverPath: "" });
    assert.deepEqual(await service.setCoverForRow("db_test", "row_cancel"), { coverPath: "" });

    service.promptForImage = async () => sourceText;
    await assert.rejects(() => service.setForPage("pg_bad"), /Unsupported image format/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("storage, file cache, dates, formula helpers, app config, and git service cover core package behavior", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-core-"));
  const remoteRoot = await mkdtemp(join(tmpdir(), "lotion-git-remote-"));
  try {
    const jsonPath = join(root, "nested", "value.json");
    await writeJsonFile(jsonPath, { ok: true });
    assert.deepEqual(await readJsonFile(jsonPath), { ok: true });

    const paths = new WorkspacePaths(root);
    await mkdir(join(root, "databases", "user", "Existing--db_existing"), { recursive: true });
    assert.equal(paths.manifest(), join(root, "lotion.json"));
    assert.equal(paths.pagesDir(), join(root, "pages"));
    assert.equal(paths.databasesDir(), join(root, "databases"));
    assert.equal(paths.databaseDir("db_existing"), join(root, "databases", "user", "Existing--db_existing"));
    assert.equal(paths.schema("db_existing"), join(root, "databases", "user", "Existing--db_existing", "schema.json"));
    assert.equal(paths.data("db_existing"), join(root, "databases", "user", "Existing--db_existing", "data.csv"));
    assert.equal(paths.view("db_existing", "view_one"), join(root, "databases", "user", "Existing--db_existing", "views", "view_one.json"));
    assert.equal(paths.rowPage("db_existing", "row.md"), join(root, "databases", "user", "Existing--db_existing", "pages", "row.md"));
    assert.equal(paths.templateData("db_existing"), join(root, "databases", "user", "Existing--db_existing", "templates", "data.csv"));
    assert.equal(paths.templatePage("db_existing", "template.md"), join(root, "databases", "user", "Existing--db_existing", "templates", "pages", "template.md"));

    const legacyDatabaseDir = join(root, "databases", "db_db_legacy");
    await mkdir(legacyDatabaseDir, { recursive: true });
    await writeFile(join(legacyDatabaseDir, "schema.json"), "{}", "utf8");
    assert.equal(paths.databaseDir("db_legacy"), legacyDatabaseDir);
    assert.equal(paths.schema("db_legacy"), join(legacyDatabaseDir, "schema.json"));

    const markdownPath = join(root, "page.md");
    await writePageFile(markdownPath, { meta: { id: "pg", title: "Title", created_time: "", updated_time: "" }, markdown: "# Heading\n\nBody" });
    assert.equal((await readPageFile(markdownPath)).meta.title, "Heading");
    await writeMarkdownBody(markdownPath, "Body only");
    assert.equal(await fileService.readText(markdownPath), "Body only\n");
    assert.equal(parsePage("No heading").meta.title, "Untitled");
    assert.equal(serializeMarkdownBody("Trimmed\n\n"), "Trimmed\n");

    await fileService.writeBuffer(join(root, "buffer.bin"), Buffer.from("abc"));
    assert.equal((await fileService.readBuffer(join(root, "buffer.bin"))).toString("utf8"), "abc");
    await fileService.rename(join(root, "buffer.bin"), join(root, "renamed.bin"));
    assert.equal(fileService.exists(join(root, "renamed.bin")), true);
    assert.equal(fileService.cacheStats().entries > 0, true);
    fileService.clearCache();

    const isolatedFiles = new FileService();
    const racePath = join(root, "read-write-race.txt");
    const raceValues = ["A".repeat(4 * 1024 * 1024), "B".repeat(4 * 1024 * 1024)];
    await isolatedFiles.writeTextAtomic(racePath, raceValues[0]);
    for (let index = 0; index < 4; index += 1) {
      isolatedFiles.clearCache();
      const overlappingRead = isolatedFiles.readText(racePath);
      const expected = raceValues[(index + 1) % 2];
      await isolatedFiles.writeTextAtomic(racePath, expected);
      await overlappingRead;
      assert.equal(await isolatedFiles.readText(racePath), expected, "a pre-write inflight read must not repopulate the cache after the write");
    }
    const appendPath = join(root, "atomic-append.txt");
    await isolatedFiles.writeTextAtomic(appendPath, "header\n");
    assert.equal(await isolatedFiles.readText(appendPath), "header\n");
    await isolatedFiles.appendTextAtomic(appendPath, "row\n");
    assert.equal(await isolatedFiles.readText(appendPath), "header\nrow\n", "atomic append must invalidate cached pre-append content");
    const newAppendPath = join(root, "atomic-append-new.txt");
    await isolatedFiles.appendTextAtomic(newAppendPath, "first\n");
    assert.equal(await isolatedFiles.readText(newAppendPath), "first\n");
    const concurrentAppendPath = join(root, "atomic-append-concurrent.txt");
    await isolatedFiles.writeTextAtomic(concurrentAppendPath, `${"x".repeat(2 * 1024 * 1024)}\n`);
    const concurrentRows = Array.from({ length: 12 }, (_unused, index) => `row-${index}\n`);
    await Promise.all(concurrentRows.map((row) => isolatedFiles.appendTextAtomic(concurrentAppendPath, row)));
    const concurrentAppendText = await isolatedFiles.readText(concurrentAppendPath);
    for (const row of concurrentRows) {
      assert.equal(
        concurrentAppendText.includes(row),
        true,
        `concurrent atomic append must preserve ${row.trim()}`
      );
    }
    const serializedWritePath = join(root, "atomic-write-append-serialized.txt");
    await isolatedFiles.writeTextAtomic(serializedWritePath, "old\n");
    await Promise.all([
      isolatedFiles.writeTextAtomic(serializedWritePath, "reset\n"),
      isolatedFiles.appendTextAtomic(serializedWritePath, "after-reset\n")
    ]);
    assert.equal(
      await isolatedFiles.readText(serializedWritePath),
      "reset\nafter-reset\n",
      "atomic replacement and append must share the same-path serialization boundary"
    );

    const appendCsvPath = join(root, "atomic-append.csv");
    const appendCsvHeaders = ["id", "title"];
    await writeCsvFile(appendCsvPath, appendCsvHeaders, [{ id: "first", title: "Plain" }]);
    await appendCsvRecord(appendCsvPath, appendCsvHeaders, {
      id: "second",
      title: "Comma, quote \" and\nnewline"
    });
    assert.deepEqual(await readCsvFile(appendCsvPath), [
      { id: "first", title: "Plain" },
      { id: "second", title: "Comma, quote \" and\nnewline" }
    ]);

    const mutationEvents = [];
    const unsubscribeMutations = isolatedFiles.subscribeMutations((event) => mutationEvents.push(event));
    const watchedPath = join(root, "watched-mutation.txt");
    await isolatedFiles.writeTextAtomic(watchedPath, "internal");
    assert.deepEqual(mutationEvents.at(-1), { path: watchedPath, external: false });
    assert.equal(await isolatedFiles.readText(watchedPath), "internal");
    await writeFile(watchedPath, "external", "utf8");
    isolatedFiles.noteExternalMutation(watchedPath);
    assert.deepEqual(mutationEvents.at(-1), { path: watchedPath, external: true });
    assert.equal(await isolatedFiles.readText(watchedPath), "external", "external mutation notification must invalidate cached content");
    const eventCountBeforeUnsubscribe = mutationEvents.length;
    unsubscribeMutations();
    await isolatedFiles.writeTextAtomic(watchedPath, "after unsubscribe");
    assert.equal(mutationEvents.length, eventCountBeforeUnsubscribe);

    const pluginStorage = new PluginStorageService({ requirePaths: () => ({ root }) });
    await pluginStorage.appendJsonl("llm/openai", "history", { role: "user", content: "one" });
    await pluginStorage.appendJsonl("llm/openai", "history", { role: "assistant", content: "two" });
    assert.deepEqual(await pluginStorage.readJsonl("llm/openai", "history"), [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" }
    ]);
    assert.deepEqual(await pluginStorage.readJsonl("llm/openai", "history", { limit: 1 }), [
      { role: "assistant", content: "two" }
    ]);
    const pluginHistoryPath = join(root, ".lotion", "plugins", "llm_openai", "history.jsonl");
    await fileService.writeText(pluginHistoryPath, `${await fileService.readText(pluginHistoryPath)}{bad json\n`);
    assert.deepEqual(await pluginStorage.readJsonl("llm/openai", "history"), [
      { role: "user", content: "one" },
      { role: "assistant", content: "two" }
    ]);
    await pluginStorage.appendJsonl("llm/openai", "../unsafe", { ok: true });
    assert.deepEqual(await pluginStorage.readJsonl("llm/openai", "../unsafe"), [{ ok: true }]);
    assert.equal(fileService.exists(join(root, ".lotion", "plugins", "llm_openai", "_unsafe.jsonl")), true);
    assert.deepEqual(await pluginStorage.readJsonl("missing", "history"), []);
    await pluginStorage.writeJson("../advanced search", "./index", { version: 1, built: true });
    assert.deepEqual(await pluginStorage.readJson("../advanced search", "./index"), { version: 1, built: true });
    assert.equal(
      fileService.exists(join(root, ".lotion", "plugins", "_advanced_search", "_index.json")),
      true
    );
    await pluginStorage.appendJsonl("../advanced search", "./index", { event: "built" });
    assert.deepEqual(await pluginStorage.readJsonl("../advanced search", "./index"), [{ event: "built" }]);
    await pluginStorage.delete("../advanced search", "./index");
    assert.equal(await pluginStorage.readJson("../advanced search", "./index"), null);
    assert.deepEqual(await pluginStorage.readJsonl("../advanced search", "./index"), []);
    assert.equal(fileService.exists(join(root, ".lotion", "plugins", "_advanced_search", "_index.json")), false);
    assert.equal(fileService.exists(join(root, ".lotion", "plugins", "_advanced_search", "_index.jsonl")), false);

    assert.equal(parseDateValue("2026-05-27 -> 2026-05-28").getFullYear(), 2026);
    assert.equal(parseDateValue("2024-02-29")?.getDate(), 29);
    assert.equal(parseDateValue("2025-02-29"), null);
    assert.equal(parseDateValue("2025-13-40"), null);
    assert.equal(parseDateValue("2025-00-10"), null);
    assert.equal(parseDateTimeValue("2024-02-29 03:13")?.getHours(), 3);
    assert.equal(parseDateTimeValue("2025-02-29 03:13"), null);
    assert.equal(parseDateTimeValue("2024-02-29 25:99"), null);
    assert.equal(isValidDateValue("2024-02-29 -> 2024-03-01"), true);
    assert.equal(isValidDateValue("2024-02-29 -> 2025-02-29"), false);
    assert.equal(parseDateValue("bad date"), null);
    assert.equal(parseDateTimeValue("2026-05-27 03:13").getHours(), 3);
    assert.equal(parseDateTimeValue(""), null);
    assert.equal(isDateLikeFieldType("updated_time"), true);
    assert.equal(isDateLikeFieldType("text"), false);
    assert.equal(defaultDateFormatForField("date"), "month_day_year");
    assert.equal(defaultDateFormatForField("text"), "iso");
    assert.equal(defaultTimeFormatForField("updated_time"), "h12");
    assert.equal(defaultTimeFormatForField("date"), "none");
    assert.equal(gitAutoBackupDelayMs("off"), null);
    assert.equal(gitAutoBackupDelayMs("minutes_15"), 15 * 60 * 1000);
    assert.equal(gitAutoBackupDelayMs("minutes_30"), 30 * 60 * 1000);
    assert.equal(gitAutoBackupDelayMs("hourly"), 60 * 60 * 1000);
    assert.equal(gitAutoBackupDelayMs("daily"), 24 * 60 * 60 * 1000);
    assert.equal(gitAutoPushDelayMs("off"), null);
    assert.equal(gitAutoPushDelayMs("after_backup"), null);
    assert.equal(gitAutoPushDelayMs("hourly"), 60 * 60 * 1000);
    assert.equal(gitAutoPushDelayMs("daily"), 24 * 60 * 60 * 1000);
    assert.equal(
      formatDateForField("2026-05-27 03:13", { type: "date", dateFormat: "full", timeFormat: "h24" }),
      "Wednesday, May 27, 2026 03:13"
    );
    assert.equal(
      formatDateForField("2026-05-27", { type: "text", dateFormat: "year_month_day", timeFormat: "none" }),
      "2026 May 27"
    );
    assert.equal(
      formatDateForField(
        "2026-05-27 03:13",
        { type: "created_time" },
        { dateFormat: "iso", timeFormat: "h24" }
      ),
      "2026-05-27 03:13"
    );
    assert.equal(
      formatDateForField(
        "2026-05-27 03:13",
        { type: "created_time", dateFormat: "month_day_year", timeFormat: "h12" },
        { dateFormat: "iso", timeFormat: "h24" }
      ),
      "May 27, 2026 3:13 AM"
    );
    assert.equal(
      formatDateForField(
        "2026-05-27 03:13",
        { type: "date" },
        { dateFormat: "iso", timeFormat: "h24" }
      ),
      "2026-05-27"
    );
    assert.equal(formatDateForField("not a date", { type: "date" }), "not a date");

    const formulaFields = [
      { id: "score", name: "Score", type: "number" },
      { id: "calc", name: "Calc", type: "formula", formula: "=IF(score > 5, \"high\", \"low\")" }
    ];
    assert.equal(evaluateFormula(formulaFields[1], { id: "row_1", score: 9 }, formulaFields), "high");
    assert.equal(evaluateFormula({ id: "blank", name: "Blank", type: "formula" }, { id: "row_1", blank: "cached" }), "cached");
    assert.equal(String(evaluateFormula({ id: "bad", name: "Bad", type: "formula", formula: "bad(" }, { id: "row_1" })).startsWith("#"), true);

    assert.equal(workspaceAttachmentPath("photo.JPG").startsWith("attachments/images/"), true);
    assert.equal(workspaceAttachmentPath("archive.unknown").startsWith("attachments/misc/"), true);
    assert.equal(databaseStableFolderId("plain"), "db_plain");
    assert.equal(databaseStableFolderId("db_ready"), "db_ready");
    assert.equal(databaseFolderName("db_plain"), "db_plain");
    assert.equal(databaseFolderName("abc123", "Team / CRM"), "Team_CRM--db_abc123");
    assert.equal(idFromDatabaseFolderName("Team_CRM--db_abc123"), "db_abc123");
    assert.equal(idFromDatabaseFolderName("Team_CRM--db_abc123", true), "abc123");
    assert.equal(idFromDatabaseFolderName("db_plain"), "db_plain");
    assert.equal(databaseWorkspacePath("db_plain"), "databases/user/db_plain");
    assert.equal(databaseWorkspacePath("db_plain", true), "databases/system/db_plain");
    assert.equal(databaseWorkspacePathWithName("abc123", false, "Team CRM"), "databases/user/Team_CRM--db_abc123");
    assert.equal(pageMarkdownFileName("pg_1", "Hello / World"), "Hello_World--pg_1.md");
    assert.equal(pageMarkdownFileName("pg_1"), "pg_1.md");
    assert.equal(idFromMarkdownFileName("Hello_World--pg_1.md"), "pg_1");
    assert.equal(idFromMarkdownFileName("pg_1.md"), "pg_1");
    assert.equal(rowPagesWorkspacePath("db_1", false, "Tasks"), "databases/user/Tasks--db_1/pages");
    assert.equal(templatePagesWorkspacePath("db_1", true, "Templates"), "databases/system/Templates--db_1/templates/pages");
    assert.equal(displayPathValue(serializePathValue(["Root", "Child"])), "Root / Child");
    assert.deepEqual(parsePathValue("Root / Child"), ["Root", "Child"]);
    assert.deepEqual(parsePathValue("[bad json"), ["[bad json"]);
    assert.equal(formatEmojiIcon("🎯"), "emoji:🎯");
    assert.equal(formatEmojiIcon(""), undefined);
    assert.equal(isEmojiIcon("emoji:🎯"), true);
    assert.equal(isEmojiIcon("attachments/icons/icon.png"), false);
    assert.equal(emojiIconText("emoji:🎯"), "🎯");
    assert.equal(emojiIconText("attachments/icons/icon.png"), "");

    const configPath = join(root, "app-config.json");
    const config = new AppConfigService(configPath);
    assert.deepEqual(await config.load(), { active: null, recents: [], gitSyncByWorkspace: {} });
    for (let index = 0; index < 14; index += 1) {
      await config.touch(join(root, `space-${index}`), `Space ${index}`, index % 2 === 0 ? "icon.png" : undefined);
    }
    let loaded = await config.load();
    assert.equal(loaded.recents.length, 12);
    assert.equal(loaded.recents[0].name, "Space 13");
    const gitSettingsPath = join(root, "space-12");
    const gitSettings = await config.updateGitSyncSettingsForWorkspace(gitSettingsPath, {
      remoteUrl: " git@github.com:user/repo.git ",
      sshKeyPath: " /Users/test/.ssh/lotion ",
      autoBackupCadence: "hourly",
      autoPushCadence: "after_backup"
    });
    assert.deepEqual(gitSettings, {
      remoteUrl: "git@github.com:user/repo.git",
      branch: "main",
      sshKeyPath: "/Users/test/.ssh/lotion",
      autoBackupCadence: "hourly",
      autoPushCadence: "after_backup",
      automationPaused: false,
      commitMessagePrefix: "Lotion backup"
    });
    assert.equal((await config.gitSyncSettingsForWorkspace(gitSettingsPath)).remoteUrl, "git@github.com:user/repo.git");
    assert.equal((await config.updateGitSyncSettingsForWorkspace(gitSettingsPath, {
      autoBackupCadence: "minutes_30",
      automationPaused: true
    })).autoBackupCadence, "minutes_30");
    assert.equal((await config.gitSyncSettingsForWorkspace(gitSettingsPath)).automationPaused, true);
    await config.forget(join(root, "space-13"));
    loaded = await config.load();
    assert.equal(loaded.active, null);
    await config.forget(gitSettingsPath);
    assert.deepEqual(await config.gitSyncSettingsForWorkspace(gitSettingsPath), {
      remoteUrl: "",
      branch: "main",
      sshKeyPath: "",
      autoBackupCadence: "off",
      autoPushCadence: "off",
      automationPaused: false,
      commitMessagePrefix: "Lotion backup"
    });
    await writeFile(configPath, "{bad json", "utf8");
    const corruptConfig = new AppConfigService(configPath);
    assert.deepEqual(await corruptConfig.load(), { active: null, recents: [], gitSyncByWorkspace: {} });

    const gitConfig = new AppConfigService(join(remoteRoot, "git-app-config.json"));
    const gitWorkspace = { requirePaths: () => ({ root }) };
    const git = new GitService(gitWorkspace, gitConfig);
    assert.equal((await git.settings()).branch, "main");
    assert.equal((await git.updateSettings({
      branch: "backup",
      autoPushCadence: "daily",
      commitMessagePrefix: "Lotion custom backup"
    })).branch, "backup");
    assert.equal((await git.settings()).autoPushCadence, "daily");
    const statusBeforeInit = await git.status();
    assert.equal(statusBeforeInit.installed, true);
    assert.equal(statusBeforeInit.repoInitialized, false);
    assert.equal(statusBeforeInit.enabled, false);
    const initRepositoryResult = await git.initRepository();
    assert.equal(initRepositoryResult.success, true);
    assert.equal(initRepositoryResult.message, "Git repository initialized.");
    const statusAfterInit = await git.status();
    assert.equal(statusAfterInit.repoInitialized, true);
    assert.equal(statusAfterInit.branch, "backup");
    const bareRemote = join(remoteRoot, "remote.git");
    await execFileAsync("git", ["init", "--bare", bareRemote]);
    await git.updateSettings({ remoteUrl: bareRemote });
    const remoteResult = await git.configureRemote();
    assert.equal(remoteResult.success, true);
    const { stdout: remoteUrl } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: root });
    assert.equal(remoteUrl.trim(), bareRemote);
    const remoteAccess = await git.testRemoteAccess();
    assert.equal(remoteAccess.success, true);
    assert.equal(remoteAccess.message, "Git remote is reachable.");
    await execFileAsync("git", ["init"], { cwd: root });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: root });
    await writeFile(join(root, "tracked.txt"), "tracked", "utf8");
    assert.equal((await git.backupNow("Initial backup")).success, true);
    const { stdout: explicitCommitMessage } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: root });
    assert.equal(explicitCommitMessage.trim(), "Initial backup");
    const initialFileHistory = await git.listFileHistory("tracked.txt", {
      pageId: "pg_git_history",
      title: "Git History Page"
    });
    assert.equal(initialFileHistory.state, "ready");
    assert.equal(initialFileHistory.versions.length, 1);
    assert.equal(initialFileHistory.versions[0].message, "Initial backup");
    assert.equal(initialFileHistory.versions[0].path, "tracked.txt");
    await writeFile(join(root, "tracked.txt"), "tracked local edit", "utf8");
    const previewInitialFile = await git.previewFileVersion("tracked.txt", initialFileHistory.versions[0].sha, {
      pageId: "pg_git_history",
      title: "Git History Page"
    });
    assert.equal(previewInitialFile.version.message, "Initial backup");
    assert.equal(previewInitialFile.currentMarkdown, "tracked local edit");
    assert.equal(previewInitialFile.selectedMarkdown, "tracked");
    assert.equal(previewInitialFile.diff.some((line) => line.type === "removed" && line.text === "tracked local edit"), true);
    assert.equal(previewInitialFile.diff.some((line) => line.type === "added" && line.text === "tracked"), true);
    assert.equal(
      await git.restoreFileVersion("tracked.txt", initialFileHistory.versions[0].shortSha, {
        pageId: "pg_git_history",
        title: "Git History Page"
      }),
      "tracked"
    );
    assert.equal(await readFile(join(root, "tracked.txt"), "utf8"), "tracked");
    await assert.rejects(
      () => git.listFileHistory("../outside.md", { pageId: "pg_bad", title: "Bad" }),
      /workspace|inside/
    );
    assert.equal((await git.backupNow()).message, "Nothing to backup.");
    assert.equal(typeof (await git.settings()).lastBackupAt, "string");
    await writeFile(join(root, "tracked-2.txt"), "tracked 2", "utf8");
    assert.equal((await git.backupNow()).success, true);
    const { stdout: defaultCommitMessage } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: root });
    assert.equal(defaultCommitMessage.trim(), "Lotion custom backup");
    const pushResult = await git.push();
    assert.equal(pushResult.success, true);
    assert.equal(pushResult.message, "Git push completed.");
    assert.equal(typeof (await git.settings()).lastPushAt, "string");
    await execFileAsync("git", ["--git-dir", bareRemote, "show-ref", "--verify", "refs/heads/backup"]);
    const fetchResult = await git.fetchStatus();
    assert.equal(fetchResult.success, true);
    assert.equal(fetchResult.message, "Git remote status fetched.");
    const pullResult = await git.pull();
    assert.equal(pullResult.success, true);
    assert.equal(pullResult.message, "Git pull completed.");
    const squashReady = await git.squashPreflight();
    assert.equal(squashReady.ok, true);
    assert.equal(squashReady.state, "ready");
    const upstreamClone = join(remoteRoot, "upstream-clone");
    await execFileAsync("git", ["clone", "--branch", "backup", bareRemote, upstreamClone]);
    await execFileAsync("git", ["config", "user.email", "remote@example.com"], { cwd: upstreamClone });
    await execFileAsync("git", ["config", "user.name", "Remote User"], { cwd: upstreamClone });
    await writeFile(join(upstreamClone, "remote-only.txt"), "remote", "utf8");
    await execFileAsync("git", ["add", "remote-only.txt"], { cwd: upstreamClone });
    await execFileAsync("git", ["commit", "-m", "Remote change"], { cwd: upstreamClone });
    await execFileAsync("git", ["push", "origin", "backup"], { cwd: upstreamClone });
    const squashBehind = await git.squashPreflight();
    assert.equal(squashBehind.ok, false);
    assert.equal(squashBehind.state, "behind");
    const autoPushRemoteAhead = await git.autoPush();
    assert.equal(autoPushRemoteAhead.success, false);
    assert.equal(autoPushRemoteAhead.message, "Auto push paused: remote has changes. Pull before pushing.");
    assert.equal((await git.settings()).lastError?.startsWith("Auto push paused: remote has changes."), true);
    const statusAfterBackup = await git.status();
    assert.equal(statusAfterBackup.enabled, true);
    assert.equal(statusAfterBackup.repoInitialized, true);
    assert.equal(statusAfterBackup.clean, true);
    assert.equal(statusAfterBackup.dirtyCount, 0);
    assert.equal(typeof statusAfterBackup.branch, "string");
    assert.equal(typeof statusAfterBackup.lastCommit, "string");
    await writeFile(join(root, "dirty.txt"), "dirty", "utf8");
    const squashDirty = await git.squashPreflight();
    assert.equal(squashDirty.ok, false);
    assert.equal(squashDirty.state, "dirty");
    const dirtyPull = await git.pull();
    assert.equal(dirtyPull.success, false);
    assert.equal(dirtyPull.message, "Commit or discard local changes before pulling.");
    assert.equal((await git.settings()).lastError?.startsWith("Commit or discard local changes before pulling."), true);
    await git.updateSettings({ remoteUrl: join(remoteRoot, "missing.git") });
    const missingRemoteAccess = await git.testRemoteAccess();
    assert.equal(missingRemoteAccess.success, false);
    assert.equal(missingRemoteAccess.message, "Git remote test failed.");
    const missingFetch = await git.fetchStatus();
    assert.equal(missingFetch.success, false);
    assert.equal(missingFetch.message, "Git fetch failed.");
    const missingPush = await git.push();
    assert.equal(missingPush.success, false);
    assert.equal(missingPush.message, "Git push failed.");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(remoteRoot, { recursive: true, force: true });
  }
});

test("Git Sync scheduler registers automation and prevents overlapping backup or push runs", async () => {
  assert.equal(gitAutoBackupDelayMs("off"), null);
  assert.equal(gitAutoBackupDelayMs("minutes_15"), 15 * 60 * 1000);
  assert.equal(gitAutoBackupDelayMs("minutes_30"), 30 * 60 * 1000);
  assert.equal(gitAutoBackupDelayMs("hourly"), 60 * 60 * 1000);
  assert.equal(gitAutoBackupDelayMs("daily"), 24 * 60 * 60 * 1000);
  assert.equal(gitAutoPushDelayMs("off"), null);
  assert.equal(gitAutoPushDelayMs("after_backup"), null);
  assert.equal(gitAutoPushDelayMs("hourly"), 60 * 60 * 1000);
  assert.equal(gitAutoPushDelayMs("daily"), 24 * 60 * 60 * 1000);

  const timerFixture = createGitSyncTimerFixture();
  const calls = [];
  let settings = gitSyncSettings({
    autoBackupCadence: "minutes_15",
    autoPushCadence: "after_backup"
  });
  const git = {
    settings: async () => settings,
    backupNow: async () => {
      calls.push("backup");
      return { success: true, message: "Backup created." };
    },
    autoPush: async () => {
      calls.push("push");
      return { success: true, message: "Git push completed." };
    }
  };
  const scheduler = new GitSyncScheduler(git, timerFixture.timers);

  await scheduler.refresh();
  assert.equal(timerFixture.handles.length, 1);
  assert.equal(timerFixture.handles[0].delayMs, 15 * 60 * 1000);
  assert.equal(timerFixture.handles[0].unrefCalled, true);
  await timerFixture.handles[0].fire();
  assert.deepEqual(calls, ["backup", "push"]);
  scheduler.stop();
  assert.equal(timerFixture.handles[0].cleared, true);

  settings = gitSyncSettings({
    autoBackupCadence: "off",
    autoPushCadence: "hourly"
  });
  calls.length = 0;
  let pushAttempts = 0;
  git.autoPush = async () => {
    pushAttempts += 1;
    calls.push("push-paused");
    return { success: false, message: "Auto push paused: remote has changes. Pull before pushing." };
  };
  await scheduler.refresh();
  const remoteAheadPushTimer = timerFixture.handles.at(-1);
  assert.equal(remoteAheadPushTimer.delayMs, 60 * 60 * 1000);
  await remoteAheadPushTimer.fire();
  await remoteAheadPushTimer.fire();
  assert.equal(pushAttempts, 1);
  assert.deepEqual(calls, ["push-paused"]);
  scheduler.stop();

  const pausedTimers = createGitSyncTimerFixture();
  const pausedScheduler = new GitSyncScheduler({
    settings: async () => gitSyncSettings({
      automationPaused: true,
      autoBackupCadence: "hourly",
      autoPushCadence: "hourly"
    }),
    backupNow: async () => ({ success: true, message: "not called" }),
    autoPush: async () => ({ success: true, message: "not called" })
  }, pausedTimers.timers);
  await pausedScheduler.refresh();
  assert.equal(pausedTimers.handles.length, 0);

  const backupGate = deferred();
  let backupRuns = 0;
  const backupTimers = createGitSyncTimerFixture();
  const backupScheduler = new GitSyncScheduler({
    settings: async () => gitSyncSettings({ autoBackupCadence: "minutes_30" }),
    backupNow: async () => {
      backupRuns += 1;
      await backupGate.promise;
      return { success: true, message: "Backup created." };
    },
    autoPush: async () => {
      throw new Error("autoPush should not run for off cadence");
    }
  }, backupTimers.timers);
  await backupScheduler.refresh();
  const backupA = backupTimers.handles[0].fire();
  const backupB = backupTimers.handles[0].fire();
  await Promise.resolve();
  assert.equal(backupRuns, 1);
  backupGate.resolve();
  await Promise.all([backupA, backupB]);

  const pushGate = deferred();
  let pushRuns = 0;
  const pushTimers = createGitSyncTimerFixture();
  const pushScheduler = new GitSyncScheduler({
    settings: async () => gitSyncSettings({ autoPushCadence: "daily" }),
    backupNow: async () => {
      throw new Error("backup should not run for off cadence");
    },
    autoPush: async () => {
      pushRuns += 1;
      await pushGate.promise;
      return { success: true, message: "Git push completed." };
    }
  }, pushTimers.timers);
  await pushScheduler.refresh();
  assert.equal(pushTimers.handles[0].delayMs, 24 * 60 * 60 * 1000);
  const pushA = pushTimers.handles[0].fire();
  const pushB = pushTimers.handles[0].fire();
  await Promise.resolve();
  assert.equal(pushRuns, 1);
  pushGate.resolve();
  await Promise.all([pushA, pushB]);
});

test("workspace, page, pages database, and entity services persist core workspace data", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-workspace-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    assert.throws(() => workspace.requirePaths(), /No workspace is open/);

    const workspaceRoot = join(root, "Team Space");
    const manifest = await workspace.createAt(workspaceRoot, { name: "Team Space", icon: "emoji:🏠" });
    assert.equal(manifest.name, "Team Space");
    assert.equal(manifest.pages.length, 0);
    assert.equal((await workspace.listRecent())[0].path, workspaceRoot);

    const opened = await workspace.open(workspaceRoot);
    assert.equal(opened.spaceId, manifest.spaceId);
    assert.equal((await workspace.getManifest()).icon, undefined);
    await workspace.setWorkspaceIcon("emoji:🏠");
    assert.equal((await workspace.getManifest()).icon, "emoji:🏠");
    await workspace.clearWorkspaceIcon();
    assert.equal((await workspace.getManifest()).icon, undefined);

    await workspace.reorderDatabases(["db_b", "db_a"]);
    assert.deepEqual((await workspace.getManifest()).databases, ["db_b", "db_a"]);
    await workspace.reorderPages(["pg_missing"]);
    assert.deepEqual((await workspace.getManifest()).pages, ["pg_missing"]);

    await workspace.toggleFavorite({ type: "page", id: "pg_missing" });
    assert.deepEqual(await workspace.listFavorites(), [{ type: "page", id: "pg_missing" }]);
    await workspace.toggleFavorite({ type: "page", id: "pg_missing" });
    assert.deepEqual(await workspace.listFavorites(), []);
    await workspace.toggleFavorite({ type: "row_page", databaseId: "db_b", rowId: "row_1" });
    assert.equal((await workspace.listFavorites())[0].rowId, "row_1");

    await workspace.pushRecent({ type: "database", id: "db_b" });
    await workspace.pushRecent({ type: "database", id: "db_b" });
    await workspace.pushRecent({ type: "row_page", databaseId: "db_b", rowId: "row_1", title: "Row One", icon: "emoji:📄" });
    for (let index = 0; index < 26; index += 1) {
      await workspace.pushRecent({ type: "page", id: `pg_recent_${index}` });
    }
    const recents = await workspace.listRecents();
    assert.equal(recents.length, 24);
    assert.equal(recents.some((item) => item.type === "database" && item.count === 2), false);
    await workspace.pushRecent({ type: "database", id: "db_b" });
    assert.equal((await workspace.listRecents())[0].count, 1);

    const pageService = new PageService(workspace);
    const page = await pageService.create({ title: "First Page" });
    assert.match(page.meta.id, /^pg_/);
    assert.equal((await pageService.list()).some((item) => item.title === "First Page"), true);
    const loadedPage = await pageService.get(page.meta.id);
    assert.equal(loadedPage.markdown, "");

    const updatedPage = await pageService.update(page.meta.id, {
      markdown: "# First Page\n\nUpdated body",
      tags: ["alpha", "beta"],
      date: "2026-06-08",
      url: "https://example.com",
      fullWidth: true,
      coverOffset: 125
    });
    assert.equal(updatedPage.meta.fullWidth, true);
    assert.equal(updatedPage.meta.coverOffset, 100);
    assert.deepEqual(updatedPage.meta.tags, ["alpha", "beta"]);
    assert.equal((await pageService.get(page.meta.id)).markdown.includes("Updated body"), true);

    const renamedPage = await pageService.rename(page.meta.id, "Renamed Page");
    assert.equal(renamedPage.meta.title, "Renamed Page");
    assert.equal(renamedPage.markdown.startsWith("# Renamed Page"), true);
    assert.equal((await pageService.setIcon(page.meta.id, "emoji:⭐")).icon, "emoji:⭐");
    assert.equal((await pageService.setCover(page.meta.id, "attachments/covers/cover.jpg")).cover, "attachments/covers/cover.jpg");
    assert.equal((await pageService.setCoverOffset(page.meta.id, -20)).coverOffset, 0);
    assert.equal((await pageService.setIcon(page.meta.id)).icon, undefined);
    assert.equal((await pageService.setCover(page.meta.id)).cover, undefined);

    const pageRecords = new PagesDatabaseService(workspace);
    await pageRecords.patch("pg_patch", {
      title: "Patched",
      icon: "emoji:🧩",
      cover: "attachments/covers/patched.png",
      coverOffset: 64,
      tags: ["one;two"],
      date: "June 8, 2026",
      url: "https://lotion.test",
      fullWidth: true,
      path: ["Root", "Patched"],
      parentId: "pg_parent",
      parentKind: "page"
    });
    const patched = await pageRecords.getMeta("pg_patch");
    assert.equal(patched.title, "Patched");
    assert.equal(patched.parentId, "pg_parent");
    assert.deepEqual(patched.path, ["Root", "Patched"]);
    await pageRecords.setBodyPath("missing", "unused.md");
    await pageRecords.upsert(defaultPageRecordInput(patched));
    await pageRecords.delete("pg_patch");
    assert.equal(await pageRecords.getMeta("pg_patch"), null);
    assert.equal(createPagesSchema("now").id, PAGES_DATABASE_ID);
    assert.equal(createPagesDefaultView().id, DEFAULT_VIEW_ID);

    await mkdir(join(workspaceRoot, "pages"), { recursive: true });
    await writeFile(
      join(workspaceRoot, "pages", "page_pg_legacy.md"),
      "---\nid: pg_legacy\ntitle: Legacy Title\ncreated_time: 2024-01-02T03:04:05.000Z\nupdated_time: 2024-02-03T04:05:06.000Z\ncover: attachments/legacy.png\ncover_offset: 17\n---\n\n# Legacy Title\n\nLegacy body",
      "utf8"
    );
    const currentManifest = await workspace.getManifest();
    await workspace.saveManifest({ ...currentManifest, pages: [...currentManifest.pages, "pg_legacy"] });
    assert.equal((await pageService.list()).some((item) => item.id === "pg_legacy" && item.title === "Legacy Title"), true);
    const legacyPage = await pageService.get("pg_legacy");
    assert.equal(legacyPage.markdown.includes("Legacy body"), true);
    assert.equal(legacyPage.markdown.includes("created_time:"), false);
    assert.equal(legacyPage.meta.created_time, "2024-01-02T03:04:05.000Z");
    assert.equal(legacyPage.meta.cover, "attachments/legacy.png");
    assert.equal(legacyPage.meta.coverOffset, 17);
    assert.equal(fileService.exists(join(workspaceRoot, pageBodyPath("pg_legacy", "Legacy Title"))), true);

    const recoveredId = "pg_recovered_filename";
    const recoveredFileName = pageMarkdownFileName(recoveredId, "Recovered Page Title");
    const recoveredPaths = new WorkspacePaths(workspaceRoot);
    await mkdir(recoveredPaths.rowPagesDir(PAGES_DATABASE_ID, "pages"), { recursive: true });
    await writeMarkdownBody(
      recoveredPaths.rowPage(PAGES_DATABASE_ID, recoveredFileName, "pages"),
      "Body without a heading, but the filename still carries the imported title."
    );
    const pagesSchema = await readJsonFile(recoveredPaths.schema(PAGES_DATABASE_ID));
    const pageCsvRecords = await readCsvFile(recoveredPaths.data(PAGES_DATABASE_ID));
    await writeCsvFile(
      recoveredPaths.data(PAGES_DATABASE_ID),
      pagesSchema.fields.map((field) => field.id),
      [
        ...pageCsvRecords,
        {
          id: recoveredId,
          created_time: "2026-06-09T14:17:09.848Z",
          updated_time: "2026-06-09T14:17:09.848Z",
          title: "Untitled",
          kind: "page",
          body_path: "",
          cover_offset: 0,
          full_width: false,
          database_id: PAGES_DATABASE_ID,
          row_id: recoveredId
        }
      ]
    );
    await workspace.saveManifest({
      ...(await workspace.getManifest()),
      pages: [...(await workspace.getManifest()).pages, recoveredId]
    });
    assert.equal((await pageService.list()).some((item) => item.id === recoveredId && item.title === "Recovered Page Title"), true);
    assert.equal((await pageService.get(recoveredId)).markdown.includes("filename still carries"), true);
    assert.equal((await pageRecords.getBodyPath(recoveredId))?.endsWith(`/${recoveredFileName}`), true);

    const entitySchema = createEntitiesSchema("now");
    assert.equal(entitySchema.id, ENTITIES_DATABASE_ID);
    const normalizedEntitySchema = normalizeEntitiesSchema({ ...entitySchema, id: "old", fields: [] }, "later");
    assert.equal(normalizedEntitySchema.changed, true);
    assert.equal(createEntitiesDefaultView().fieldOrder.includes("title"), true);

    const entitiesDir = join(workspaceRoot, "databases", "system", databaseFolderName(ENTITIES_DATABASE_ID, "entities"));
    await mkdir(entitiesDir, { recursive: true });
    const entityRecord = entityToRecord({
      id: "row_entity",
      kind: "row",
      title: "Row Entity",
      icon: "emoji:🔎",
      path: ["DB", "Row Entity"],
      parentId: "db_parent",
      parentKind: "database",
      databaseId: "db_parent",
      rowId: "row_entity",
      bodyPath: "databases/user/DB--db_parent/pages/Row--row_entity.md",
      sourceNotionHash: "hash"
    }, "now");
    await writeCsvFile(join(entitiesDir, "data.csv"), entitySchema.fields.map((field) => field.id), [
      entityRecord,
      { id: "bad", kind: "unknown", title: "Bad" }
    ]);
    const entities = new EntitiesDatabaseService(workspace);
    const resolved = await entities.resolve("row_entity");
    assert.equal(resolved.kind, "row");
    assert.equal(resolved.databaseId, "db_parent");
    assert.deepEqual(resolved.path, ["DB", "Row Entity"]);
    assert.equal(await entities.resolve("bad"), null);
    assert.equal(await entities.resolve("missing"), null);

    await config.forget(workspaceRoot);
    assert.deepEqual(await workspace.listRecent(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace open explains wrong folder selections and keeps the previous workspace active", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-workspace-open-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const activeRoot = join(root, "Active Space");
    await workspace.createAt(activeRoot, { name: "Active Space" });
    await workspace.open(activeRoot);

    const parentRoot = join(root, "Lotion Manual Test");
    const childRoot = join(parentRoot, "workspace");
    await workspace.createAt(childRoot, { name: "Manual Test" });
    await workspace.open(activeRoot);

    await assert.rejects(
      () => workspace.open(parentRoot),
      (error) => {
        assert.match(error.message, /selected folder does not contain lotion\.json/i);
        assert.equal(error.message.includes(`Selected folder: ${parentRoot}`), true);
        assert.equal(error.message.includes(`Suggested workspace folder: ${childRoot}`), true);
        return true;
      }
    );
    assert.equal((await workspace.getManifest()).name, "Active Space");
    assert.equal(workspace.requirePaths().root, activeRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database view updates sanitize stale field references", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-view-sanitize-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "View Space");
    await workspace.createAt(workspaceRoot, { name: "View Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const bundle = await databases.create({
      name: "View Hygiene",
      template: {
        fields: [
          { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo", color: "gray" }] },
          { id: "amount", name: "Amount", type: "number" },
          { id: "date", name: "Date", type: "date" },
          { id: "cover", name: "Cover", type: "text" }
        ]
      }
    });

    const baseView = bundle.views[0];
    const updated = await databases.updateView(bundle.schema.id, {
      ...baseView,
      type: "calendar",
      visibleFieldIds: ["missing"],
      fieldOrder: ["missing", "status", "title"],
      wrapFieldIds: ["title", "missing"],
      sorts: [
        { fieldId: "missing", direction: "asc" },
        { fieldId: "status", direction: "desc" }
      ],
      filters: [
        { fieldId: "missing", operator: "is", value: "bad" },
        { fieldId: "amount", operator: "gt", value: 10 }
      ],
      columnWidths: { title: 180, amount: -1, missing: 99 },
      columnSummaries: { amount: "sum", status: "bogus", missing: "average" },
      dateFieldId: "missing",
      coverFieldId: "cover",
      defaultTemplateId: "missing_template"
    });

    const view = updated.views.find((item) => item.id === baseView.id);
    assert.deepEqual(view.visibleFieldIds, ["title"]);
    assert.deepEqual(view.fieldOrder, ["title"]);
    assert.deepEqual(view.wrapFieldIds, ["title"]);
    assert.deepEqual(view.sorts, [{ fieldId: "status", direction: "desc" }]);
    assert.deepEqual(view.filters, [{ fieldId: "amount", operator: "gt", value: 10 }]);
    assert.deepEqual(view.columnWidths, { title: 180 });
    assert.deepEqual(view.columnSummaries, { amount: "sum" });
    assert.equal(view.dateFieldId, undefined);
    assert.equal(view.coverFieldId, undefined);
    assert.equal(view.defaultTemplateId, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database view patches persist monotonic revisions and reject stale concurrent writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-view-patch-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "View Patch Space");
    await workspace.createAt(workspaceRoot, { name: "View Patch Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const bundle = await databases.create({ name: "Concurrent Views" });
    const baseView = bundle.views[0];

    const first = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: baseView.id,
      patch: { name: "First persisted name" },
      expectedRevision: 0
    });
    assert.equal(first.ok, true);
    assert.equal(first.view.revision, 1);
    assert.equal(first.view.name, "First persisted name");
    assert.match(first.view.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const stale = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: baseView.id,
      patch: { name: "Stale overwrite" },
      expectedRevision: 0
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, "VIEW_CONFLICT");
    assert.equal(stale.error.actualRevision, 1);
    assert.equal(stale.currentView.name, "First persisted name");

    const [winner, loser] = await Promise.all([
      databases.patchView({
        databaseId: bundle.schema.id,
        viewId: baseView.id,
        patch: { columnWidths: { title: 240 } },
        expectedRevision: 1
      }),
      databases.patchView({
        databaseId: bundle.schema.id,
        viewId: baseView.id,
        patch: { pageSize: 77 },
        expectedRevision: 1
      })
    ]);
    assert.equal(winner.ok, true);
    assert.equal(winner.view.revision, 2);
    assert.equal(loser.ok, false);
    assert.equal(loser.error.actualRevision, 2);

    const reloaded = await databases.get(bundle.schema.id);
    const persisted = reloaded.views.find((view) => view.id === baseView.id);
    assert.equal(persisted.revision, 2);
    assert.deepEqual(persisted.columnWidths, { title: 240 });
    assert.equal(persisted.pageSize, baseView.pageSize);
    assert.equal(persisted.name, "First persisted name");

    const generatedView = reloaded.views.find((view) => view.id === "view_created_time_desc");
    assert.ok(generatedView, "created-time view should be generated for new databases");
    const generatedPatch = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: generatedView.id,
      patch: { filters: [{ fieldId: "title", operator: "contains", value: "Concurrent" }] },
      expectedRevision: generatedView.revision ?? 0
    });
    assert.equal(generatedPatch.ok, true);
    const generatedReload = await databases.get(bundle.schema.id);
    const persistedGenerated = generatedReload.views.find((view) => view.id === generatedView.id);
    assert.equal(persistedGenerated.revision, 1);
    assert.deepEqual(persistedGenerated.filters, [{ fieldId: "title", operator: "contains", value: "Concurrent" }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database settings capabilities explain system database restrictions", () => {
  const userDatabase = databaseCapabilities({ id: "db_projects" });
  assert.equal(userDatabase.canManageSchema, true);
  assert.equal(userDatabase.canManageTemplates, true);
  assert.equal(userDatabase.structuralDisabledReason, undefined);

  const systemDatabase = databaseCapabilities({ id: PAGES_DATABASE_ID });
  assert.equal(systemDatabase.canManageSchema, false);
  assert.equal(systemDatabase.canManageTemplates, false);
  assert.equal(systemDatabase.canManageDeletedItems, false);
  assert.equal(systemDatabase.canLock, false);
  assert.match(systemDatabase.structuralDisabledReason, /system database/i);

  const lockedDatabase = databaseCapabilities({ id: "db_projects", locked: true });
  assert.equal(lockedDatabase.locked, true);
  assert.equal(lockedDatabase.canManageSchema, false);
  assert.match(lockedDatabase.structuralDisabledReason, /locked/i);
});

test("database lock blocks structural APIs while preserving row edits and explicit unlock", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-lock-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Locked Space");
    await workspace.createAt(workspaceRoot, { name: "Locked Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({ name: "Locked rows" });
    const databaseId = bundle.schema.id;
    const rowId = String(bundle.records[0].id);
    bundle = await databases.addField(databaseId, { name: "Before lock", type: "text" });
    const fieldId = bundle.schema.fields.find((field) => field.name === "Before lock").id;
    bundle = await databases.addField(databaseId, { name: "Deleted before lock", type: "text" });
    const deletedFieldId = bundle.schema.fields.find((field) => field.name === "Deleted before lock").id;
    bundle = await databases.deleteField(databaseId, deletedFieldId);
    databases.failNextBundleWriteForDebug("Injected field settings write failure");
    await assert.rejects(
      databases.updateField({ databaseId, fieldId, name: "Failed field rename" }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected field settings write failure/.test(error.message)
    );
    bundle = await databases.get(databaseId);
    assert.equal(bundle.schema.fields.find((field) => field.id === fieldId)?.name, "Before lock");
    databases.failNextBundleWriteForDebug("Injected template write failure");
    await assert.rejects(
      databases.saveTemplate({ databaseId, template: { name: "Failed template" } }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected template write failure/.test(error.message)
    );
    bundle = await databases.get(databaseId);
    assert.equal(bundle.schema.templates?.some((template) => template.name === "Failed template") ?? false, false);
    bundle = await databases.saveTemplate({ databaseId, template: { name: "Before lock template" } });
    const templateId = bundle.schema.templates.find((template) => template.name === "Before lock template").id;
    bundle = await databases.createView({ databaseId, name: "Before lock view", type: "list" });
    const view = bundle.views.find((candidate) => candidate.name === "Before lock view");
    assert.ok(view);
    databases.failNextMetaWriteForDebug("Injected metadata write failure");
    await assert.rejects(
      databases.updateMeta({ databaseId, locked: true }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected metadata write failure/.test(error.message)
    );
    bundle = await databases.get(databaseId);
    assert.equal(Boolean(bundle.schema.locked), false, "failed metadata persistence must not lock the database");
    bundle = await databases.updateMeta({ databaseId, locked: true });
    assert.equal(bundle.schema.locked, true);
    const locked = (error) => error?.code === "DATABASE_LOCKED" && /locked/i.test(error.message);
    await assert.rejects(databases.delete(databaseId), locked);
    await assert.rejects(databases.updateMeta({ databaseId, tags: ["blocked"] }), locked);
    await assert.rejects(databases.addField(databaseId, { name: "Blocked", type: "text" }), locked);
    await assert.rejects(databases.updateField({ databaseId, fieldId, name: "Blocked rename" }), locked);
    await assert.rejects(databases.reorderFields({ databaseId, fieldIds: [...bundle.schema.fields.map((field) => field.id)].reverse() }), locked);
    await assert.rejects(databases.deleteField(databaseId, fieldId), locked);
    await assert.rejects(databases.restoreField({ databaseId, fieldId: deletedFieldId }), locked);
    await assert.rejects(databases.permanentlyDeleteField({ databaseId, fieldId: deletedFieldId }), locked);
    await assert.rejects(databases.createView({ databaseId, name: "Blocked view", type: "list" }), locked);
    await assert.rejects(databases.duplicateView({ databaseId, viewId: view.id }), locked);
    await assert.rejects(databases.reorderViews({ databaseId, viewIds: [...bundle.views.map((candidate) => candidate.id)].reverse() }), locked);
    await assert.rejects(databases.updateView(databaseId, { ...view, name: "Blocked full update" }), locked);
    await assert.rejects(databases.saveTemplate({ databaseId, template: { name: "Blocked template" } }), locked);
    await assert.rejects(databases.deleteTemplate({ databaseId, templateId }), locked);
    await assert.rejects(databases.patchView({ databaseId, viewId: bundle.views[0].id, patch: { name: "Blocked rename" }, expectedRevision: bundle.views[0].revision ?? 0 }), locked);
    await assert.rejects(databases.deleteView({ databaseId, viewId: view.id }), locked);
    await assert.rejects(databases.setDefaultView({ databaseId, viewId: view.id }), locked);
    const stillLocked = await databases.get(databaseId);
    assert.equal(stillLocked.schema.locked, true);
    assert.equal(stillLocked.schema.tags, undefined);
    assert.equal(stillLocked.schema.fields.find((field) => field.id === fieldId)?.name, "Before lock");
    assert.equal(stillLocked.views.find((candidate) => candidate.id === view.id)?.name, "Before lock view");
    assert.equal(stillLocked.schema.templates.some((template) => template.id === templateId), true);
    bundle = await databases.updateCell({ databaseId, rowId, fieldId: "title", value: "Editable while locked" });
    assert.equal(bundle.records[0].title, "Editable while locked");
    bundle = await databases.addRow(databaseId);
    assert.equal(bundle.records.length, 2);
    bundle = await databases.updateMeta({ databaseId, locked: false });
    assert.equal(bundle.schema.locked, undefined);
    bundle = await databases.addField(databaseId, { name: "Allowed after unlock", type: "text" });
    assert.ok(bundle.schema.fields.some((field) => field.name === "Allowed after unlock"));
    const notFound = (error) => error?.code === "DATABASE_NOT_FOUND" && /not found/i.test(error.message);
    const invalidDependency = (error) => error?.code === "DATABASE_INVALID_DEPENDENCY";
    await assert.rejects(databases.get("missing_database"), notFound);
    await assert.rejects(databases.updateCell({ databaseId, rowId: "missing_row", fieldId: "title", value: "No silent write" }), notFound);
    await assert.rejects(databases.updateCell({ databaseId, rowId, fieldId: "missing_field", value: "No silent write" }), notFound);
    await assert.rejects(databases.updateField({ databaseId, fieldId: "missing_field", name: "No silent write" }), notFound);
    await assert.rejects(databases.duplicateRow({ databaseId, rowId: "missing_row" }), notFound);
    await assert.rejects(databases.reorderFields({ databaseId, fieldIds: ["title"] }), invalidDependency);
    await assert.rejects(
      databases.updateMeta({ databaseId: PAGES_DATABASE_ID, locked: true }),
      (error) => error?.code === "DATABASE_INVALID_DEPENDENCY" && /system databases cannot be locked/i.test(error.message)
    );
    const pagesAfterRejectedLock = await databases.updateMeta({ databaseId: PAGES_DATABASE_ID, locked: false });
    assert.equal(pagesAfterRejectedLock.schema.locked, undefined, "explicit false remains available to recover legacy system metadata");
    process.env.LOTION_TEST_FAIL_VIEW_WRITES = "1";
    await assert.rejects(databases.patchView({ databaseId, viewId: bundle.views[0].id, patch: { name: "Persistence failure" }, expectedRevision: bundle.views[0].revision ?? 0 }), (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /persist/i.test(error.message));
    delete process.env.LOTION_TEST_FAIL_VIEW_WRITES;
  } finally {
    delete process.env.LOTION_TEST_FAIL_VIEW_WRITES;
    await rm(root, { recursive: true, force: true });
  }
});

test("database view links use a canonical round-trip contract", () => {
  const link = databaseViewLink("db projects/2026", "view ? launch");
  assert.equal(link, "lotion://database/db%20projects%2F2026?view=view%20%3F%20launch");
  assert.deepEqual(parseDatabaseViewLink(link), { databaseId: "db projects/2026", viewId: "view ? launch" });
  assert.equal(parseDatabaseViewLink("https://example.com/database/db?view=v"), null);
  assert.equal(parseDatabaseViewLink("lotion://database/db"), null);
});

test("database rows duplicate page content and restore from tombstones", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-lifecycle-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Row Lifecycle Space");
    await workspace.createAt(workspaceRoot, { name: "Row Lifecycle Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    const rowPages = new RowPagesService(workspace, databases);
    databases.setRowPagesService(rowPages);
    const pageRecords = new PagesDatabaseService(workspace);
    let bundle = await databases.create({ name: "Rows" });
    const sourceId = String(bundle.records[0].id);
    bundle = await databases.updateCell({ databaseId: bundle.schema.id, rowId: sourceId, fieldId: "title", value: "Source row" });
    await rowPages.update(bundle.schema.id, sourceId, "# Preserved body\n\nOriginal content.");
    await rowPages.setFullWidth(bundle.schema.id, sourceId, true);
    await rowPages.setSmallText(bundle.schema.id, sourceId, true);
    await pageRecords.patch(sourceId, { tags: ["Lifecycle"], url: "https://example.test/source", coverOffset: 72, path: ["Rows", "Source row"] });
    bundle = await databases.get(bundle.schema.id);
    bundle = await databases.duplicateRow({ databaseId: bundle.schema.id, rowId: sourceId });
    const duplicate = bundle.records.find((record) => String(record.id) !== sourceId);
    assert.ok(duplicate);
    assert.notEqual(duplicate.id, sourceId);
    assert.equal(duplicate.title, "Source row copy");
    const duplicatePage = await rowPages.open(bundle.schema.id, String(duplicate.id));
    assert.equal(duplicatePage.markdown.trimEnd(), "# Preserved body\n\nOriginal content.");
    assert.equal(duplicatePage.fullWidth, true);
    assert.equal(duplicatePage.meta.smallText, true);
    assert.deepEqual(duplicatePage.meta.tags, ["Lifecycle"]);
    assert.equal(duplicatePage.meta.url, "https://example.test/source");
    assert.equal(duplicatePage.meta.coverOffset, 72);
    assert.deepEqual(duplicatePage.meta.path, ["Rows", "Source row copy"]);
    await rowPages.update(bundle.schema.id, String(duplicate.id), "Independent copy");
    assert.equal((await rowPages.open(bundle.schema.id, sourceId)).markdown.trimEnd(), "# Preserved body\n\nOriginal content.");

    const link = databaseRowLink(bundle.schema.id, sourceId);
    assert.deepEqual(parseDatabaseRowLink(link), { databaseId: bundle.schema.id, rowId: sourceId });
    bundle = await databases.deleteRow({ databaseId: bundle.schema.id, rowId: sourceId });
    assert.equal(bundle.records.some((record) => String(record.id) === sourceId), false);
    const tombstone = bundle.schema.deletedRows.find((item) => String(item.record.id) === sourceId);
    assert.ok(tombstone?.page?.bodyPath);
    assert.equal(tombstone.page.meta.fullWidth, true);
    assert.equal(tombstone.page.meta.smallText, true);
    assert.deepEqual(tombstone.page.meta.tags, ["Lifecycle"]);
    assert.equal(await pageRecords.getMeta(sourceId), null, "soft-deleted rows must not remain as ghost pages in the active page index");
    assert.equal(await new EntitiesDatabaseService(workspace).resolve(sourceId), null, "soft-deleted rows must not resolve as active entities");
    bundle = await databases.get(bundle.schema.id);
    assert.ok(bundle.schema.deletedRows.some((item) => String(item.record.id) === sourceId));
    bundle = await databases.restoreRow({ databaseId: bundle.schema.id, rowId: sourceId });
    assert.equal(bundle.records[0].id, sourceId);
    const restoredPage = await rowPages.open(bundle.schema.id, sourceId);
    assert.equal(restoredPage.markdown.trimEnd(), "# Preserved body\n\nOriginal content.");
    assert.equal(restoredPage.fullWidth, true);
    assert.equal(restoredPage.meta.smallText, true);
    assert.deepEqual(restoredPage.meta.tags, ["Lifecycle"]);
    assert.equal(restoredPage.meta.url, "https://example.test/source");
    assert.deepEqual(restoredPage.meta.path, ["Rows", "Source row"]);

    bundle = await databases.deleteRow({ databaseId: bundle.schema.id, rowId: sourceId });
    const permanentTombstone = bundle.schema.deletedRows.find((item) => String(item.record.id) === sourceId);
    assert.ok(permanentTombstone?.page?.bodyPath);
    await databases.permanentlyDeleteRow({ databaseId: bundle.schema.id, rowId: sourceId });
    await assert.rejects(readFile(join(workspaceRoot, permanentTombstone.page.bodyPath)), /ENOENT/);
    assert.equal(await pageRecords.getMeta(sourceId), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("row pages read legacy top-level database bodies without overriding current bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-legacy-body-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Legacy Row Body Space");
    await workspace.createAt(workspaceRoot, { name: "Legacy Row Body Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    const rowPages = new RowPagesService(workspace, databases);
    const bundle = await databases.create({ name: "待办事项" });
    const databaseId = bundle.schema.id;
    const rowId = String(bundle.records[0].id);
    const fileName = "Legacy Imported Row.md";
    await databases.updateCell({ databaseId, rowId, fieldId: "title", value: "Legacy Imported Row" });
    await databases.setSystemCell(databaseId, rowId, "page_file", fileName);

    const paths = workspace.requirePaths();
    const legacyPath = join(paths.pagesDir(), `db_${databaseId}`, fileName);
    await mkdir(join(paths.pagesDir(), `db_${databaseId}`), { recursive: true });
    await writeFile(legacyPath, "# Legacy Imported Row\n\nStatus: Complete\n", "utf8");
    assert.match((await rowPages.open(databaseId, rowId)).markdown, /Status: Complete/);

    const currentPath = paths.rowPage(databaseId, fileName);
    await mkdir(paths.rowPagesDir(databaseId), { recursive: true });
    await writeFile(currentPath, "# Current body\n\nCurrent layout wins.\n", "utf8");
    const current = await rowPages.open(databaseId, rowId);
    assert.match(current.markdown, /Current layout wins/);
    assert.doesNotMatch(current.markdown, /Status: Complete/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database row creation persists initial group values atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-create-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Row Creation Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Row Creation Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({
      name: "Grouped rows",
      template: {
        fields: [
          { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo", color: "blue" }, { id: "done", name: "Done", color: "green" }] },
          { id: "priority", name: "Priority", type: "select", options: [{ id: "medium", name: "Medium", color: "yellow" }] }
        ],
        rows: [{ title: "Existing", status: "Done", priority: "Medium" }]
      }
    });
    const beforeCount = bundle.records.length;
    databases.failNextBundleWriteForDebug("Injected grouped row creation failure");
    await assert.rejects(
      databases.addRow(bundle.schema.id, undefined, { status: "Todo", priority: "Medium" }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected grouped row creation failure/.test(error.message)
    );
    bundle = await databases.get(bundle.schema.id);
    assert.equal(bundle.records.length, beforeCount, "failed grouped creation must not leave an unassigned row");
    assert.equal(bundle.records.some((record) => record.status === "Todo"), false);

    bundle = await databases.addRow(bundle.schema.id, undefined, { status: "Todo", priority: "Medium" });
    assert.equal(bundle.records.length, beforeCount + 1);
    const created = bundle.records.at(-1);
    assert.equal(created.status, "Todo");
    assert.equal(created.priority, "Medium");
    const persisted = await databases.get(bundle.schema.id);
    assert.equal(persisted.records.filter((record) => record.status === "Todo" && record.priority === "Medium").length, 1, "retry should persist exactly one fully assigned row");

    await assert.rejects(
      databases.addRow(bundle.schema.id, undefined, { status: "Unknown" }),
      (error) => error?.code === "DATABASE_INVALID_DEPENDENCY" && /valid option/i.test(error.message)
    );
    assert.equal((await databases.get(bundle.schema.id)).records.length, beforeCount + 1, "invalid initial values must be rejected before persistence");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database inline cell writes fail atomically before retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-cell-edit-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Cell Edit Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Cell Edit Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({ name: "Cell edits", template: { rows: [{ title: "Before edit" }] } });
    const databaseId = bundle.schema.id;
    const rowId = String(bundle.records[0].id);
    databases.failNextBundleWriteForDebug("Injected inline cell persistence failure");
    await assert.rejects(
      databases.updateCell({ databaseId, rowId, fieldId: "title", value: "Failed edit" }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected inline cell persistence failure/.test(error.message)
    );
    bundle = await databases.get(databaseId);
    assert.equal(bundle.records[0].title, "Before edit", "failed cell persistence must preserve the stored value");
    bundle = await databases.updateCell({ databaseId, rowId, fieldId: "title", value: "Recovered edit" });
    assert.equal(bundle.records[0].title, "Recovered edit");
    assert.equal((await databases.get(databaseId)).records[0].title, "Recovered edit", "retry should persist exactly the requested value");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page property metadata writes fail atomically before retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-properties-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Page Properties Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Page Properties Space" });
    await workspace.open(workspaceRoot);
    const pages = new PageService(workspace);
    const page = await pages.create({ title: "Property recovery" });

    pages.failNextMetadataWriteForDebug("Injected page property persistence failure");
    await assert.rejects(
      pages.update(page.meta.id, { tags: ["Failed"], date: "2026-08-01" }),
      /Injected page property persistence failure/
    );
    let stored = await pages.get(page.meta.id);
    assert.equal(stored.meta.tags, undefined, "failed page property write must preserve stored tags");
    assert.equal(stored.meta.date, undefined, "failed page property write must preserve stored date");

    stored = await pages.update(page.meta.id, { tags: ["Recovered"], date: "2026-08-02" });
    assert.deepEqual(stored.meta.tags, ["Recovered"]);
    assert.equal(stored.meta.date, "2026-08-02");
    const reloaded = await pages.get(page.meta.id);
    assert.deepEqual(reloaded.meta.tags, ["Recovered"]);
    assert.equal(reloaded.meta.date, "2026-08-02");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page layout metadata writes fail atomically before exact retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-layout-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Page Layout Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Page Layout Space" });
    await workspace.open(workspaceRoot);
    const pages = new PageService(workspace);
    const page = await pages.create({ title: "Layout recovery" });
    const pagesCsvPath = workspace.requirePaths().data(PAGES_DATABASE_ID);
    const previousCsvBytes = await readFile(pagesCsvPath);

    pages.failNextMetadataWriteForDebug("Injected page layout persistence failure");
    await assert.rejects(
      pages.update(page.meta.id, { fullWidth: true }),
      /Injected page layout persistence failure/
    );
    const failed = await pages.get(page.meta.id);
    assert.equal(failed.meta.fullWidth, undefined, "failed layout write must preserve stored full-width state");
    assert.equal(failed.meta.smallText, undefined, "failed layout write must not change competing settings");
    assert.deepEqual(await readFile(pagesCsvPath), previousCsvBytes, "failed layout write must preserve page metadata bytes");

    const recovered = await pages.update(page.meta.id, { fullWidth: true });
    assert.equal(recovered.meta.fullWidth, true);
    assert.equal(recovered.meta.smallText, undefined);
    assert.equal((await pages.get(page.meta.id)).meta.fullWidth, true, "retry must persist the exact layout value");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("row-page full-width writes preserve stored state before exact retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-page-layout-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Row Page Layout Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Row Page Layout Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    const rowPages = new RowPagesService(workspace, databases);
    databases.setRowPagesService(rowPages);
    const bundle = await databases.create({ name: "Layout rows" });
    const databaseId = bundle.schema.id;
    const rowId = String(bundle.records[0].id);
    await rowPages.setFullWidth(databaseId, rowId, false);
    const databaseCsvPath = workspace.requirePaths().data(databaseId);
    const previousCsvBytes = await readFile(databaseCsvPath);

    databases.failNextBundleWriteForDebug("Injected row-page layout persistence failure");
    await assert.rejects(
      rowPages.setFullWidth(databaseId, rowId, true),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE"
        && /Injected row-page layout persistence failure/.test(error.message)
    );
    const failed = await rowPages.open(databaseId, rowId);
    assert.equal(failed.meta.fullWidth, undefined, "failed row-page layout write must preserve stored state");
    assert.equal(failed.meta.smallText, undefined, "failed row-page layout write must not change competing settings");
    assert.deepEqual(await readFile(databaseCsvPath), previousCsvBytes, "failed row-page layout write must preserve row bytes");

    const recovered = await rowPages.setFullWidth(databaseId, rowId, true);
    assert.equal(recovered.meta.fullWidth, true);
    assert.equal(recovered.meta.smallText, undefined);
    assert.equal((await rowPages.open(databaseId, rowId)).meta.fullWidth, true, "retry must persist the exact row-page value");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page cover offsets fail atomically before exact retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-cover-offset-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Page Cover Offset Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Page Cover Offset Space" });
    await workspace.open(workspaceRoot);
    const pages = new PageService(workspace);
    const page = await pages.create({ title: "Cover recovery" });
    await pages.setCover(page.meta.id, "attachments/covers/recovery.png");
    await pages.setCoverOffset(page.meta.id, 50);
    const pagesCsvPath = workspace.requirePaths().data(PAGES_DATABASE_ID);
    const previousCsvBytes = await readFile(pagesCsvPath);

    pages.failNextMetadataWriteForDebug("Injected cover position persistence failure");
    await assert.rejects(
      pages.setCoverOffset(page.meta.id, 72.5),
      /Injected cover position persistence failure/
    );
    assert.equal(
      (await pages.get(page.meta.id)).meta.coverOffset,
      50,
      "failed cover-offset persistence must preserve the stored focal point"
    );
    assert.deepEqual(
      await readFile(pagesCsvPath),
      previousCsvBytes,
      "failed cover-offset persistence must preserve page metadata bytes"
    );

    const recovered = await pages.setCoverOffset(page.meta.id, 72.5);
    assert.equal(recovered.coverOffset, 72.5);
    assert.equal(
      (await pages.get(page.meta.id)).meta.coverOffset,
      72.5,
      "retry must persist the exact requested focal point"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("page title rename failures preserve metadata and Markdown before exact retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-page-title-atomic-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Atomic Page Title Space");
    await workspace.createAt(workspaceRoot, { name: "Atomic Page Title Space" });
    await workspace.open(workspaceRoot);
    const pages = new PageService(workspace);
    const page = await pages.create({ title: "Before rename" });
    const previousPath = join(workspaceRoot, pageBodyPath(page.meta.id, "Before rename"));
    const failedPath = join(workspaceRoot, pageBodyPath(page.meta.id, "Failed rename"));
    const previousBytes = await readFile(previousPath);
    const pagesCsvPath = workspace.requirePaths().data(PAGES_DATABASE_ID);
    const previousCsvBytes = await readFile(pagesCsvPath);

    pages.failNextMetadataWriteForDebug("Injected page title persistence failure");
    await assert.rejects(
      pages.rename(page.meta.id, "Failed rename"),
      /Injected page title persistence failure/
    );
    const failed = await pages.get(page.meta.id);
    assert.equal(failed.meta.title, "Before rename", "failed rename must preserve stored metadata");
    assert.equal(failed.markdown.trimEnd(), page.markdown, "failed rename must preserve stored Markdown");
    assert.deepEqual(await readFile(previousPath), previousBytes, "failed rename must preserve original Markdown bytes");
    assert.deepEqual(await readFile(pagesCsvPath), previousCsvBytes, "failed rename must preserve pages database bytes");
    assert.equal(fileService.exists(failedPath), false, "failed rename must not create a new body path");

    const recovered = await pages.rename(page.meta.id, "Recovered rename");
    const recoveredPath = join(workspaceRoot, pageBodyPath(page.meta.id, "Recovered rename"));
    assert.equal(recovered.meta.title, "Recovered rename");
    assert.equal(recovered.markdown.trimEnd(), "# Recovered rename");
    assert.equal(fileService.exists(previousPath), false, "successful rename should remove the stale body path");
    assert.equal(fileService.exists(recoveredPath), true, "successful retry should create the exact requested body path");
    assert.equal((await pages.get(page.meta.id)).meta.title, "Recovered rename");
    const recoveredBytes = await readFile(recoveredPath);
    const recoveredCsvBytes = await readFile(pagesCsvPath);
    const unchanged = await pages.rename(page.meta.id, "Recovered rename");
    assert.equal(unchanged.meta.updated_time, recovered.meta.updated_time, "authoritative same-title rename should be a no-op");
    assert.deepEqual(await readFile(recoveredPath), recoveredBytes, "same-title rename must not rewrite Markdown");
    assert.deepEqual(await readFile(pagesCsvPath), recoveredCsvBytes, "same-title rename must not rewrite page metadata");

    const intermediatePath = join(workspaceRoot, pageBodyPath(page.meta.id, "Queued intermediate"));
    await Promise.all([
      pages.rename(page.meta.id, "Queued intermediate"),
      pages.update(page.meta.id, { tags: ["serialized"] }),
      pages.rename(page.meta.id, "Recovered rename")
    ]);
    const serialized = await pages.get(page.meta.id);
    assert.equal(serialized.meta.title, "Recovered rename", "queued rename order must preserve the final authoritative title");
    assert.deepEqual(serialized.meta.tags, ["serialized"], "metadata updates must serialize with title changes");
    assert.equal(serialized.markdown.trimStart().startsWith("# Recovered rename"), true);
    assert.equal(fileService.exists(intermediatePath), false, "serialized rename must remove only its own stale path");
    assert.equal(fileService.exists(recoveredPath), true, "serialized rename must preserve the final body path");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database batch row actions write bounded edits, duplicates, and tombstones together", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-row-batch-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Row Batch Space");
    await workspace.createAt(workspaceRoot, { name: "Row Batch Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    const rowPages = new RowPagesService(workspace, databases);
    databases.setRowPagesService(rowPages);
    const pageRecords = new PagesDatabaseService(workspace);
    const rows = Array.from({ length: 200 }, (_, index) => ({ title: `Row ${index}`, score: index }));
    let bundle = await databases.create({
      name: "Batch",
      template: {
        fields: [
          { id: "score", name: "Score", type: "number" },
          { id: "due", name: "Due", type: "date" }
        ],
        rows
      }
    });
    const ids = bundle.records.map((record) => String(record.id));
    databases.failNextBundleWriteForDebug("Injected bulk row write failure");
    await assert.rejects(
      databases.batchRows({ databaseId: bundle.schema.id, duplicateRowIds: [ids[0], ids[1]] }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected bulk row write failure/.test(error.message)
    );
    bundle = await databases.get(bundle.schema.id);
    assert.equal(bundle.records.length, 200);
    assert.equal(bundle.records.some((record) => /Row [01] copy/.test(String(record.title))), false);
    const started = performance.now();
    let result = await databases.batchRows({ databaseId: bundle.schema.id, updates: ids.map((rowId) => ({ rowId, fieldId: "score", value: 7 })) });
    assert.ok(performance.now() - started < 1_000, "200 updates should share one bounded transaction");
    assert.equal(result.errors.length, 0);
    assert.equal(result.bundle.records.every((record) => record.score === 7), true);
    await rowPages.update(bundle.schema.id, ids[0], "# Batch duplicate source\n\nIndependent body.");
    await rowPages.setFullWidth(bundle.schema.id, ids[0], true);
    await pageRecords.patch(ids[0], { tags: ["Batch duplicate"] });
    await rowPages.update(bundle.schema.id, ids[1], "# Batch deleted source\n\nRestore this body.");
    await rowPages.setSmallText(bundle.schema.id, ids[1], true);
    await pageRecords.patch(ids[1], { tags: ["Batch restore"] });
    result = await databases.batchRows({ databaseId: bundle.schema.id, duplicateRowIds: [ids[0], "missing"], deleteRowIds: [ids[1]], updates: [{ rowId: ids[1], fieldId: "score", value: 11 }, { rowId: ids[2], fieldId: "score", value: 9 }] });
    assert.equal(result.createdRowIds.length, 1);
    assert.deepEqual(result.errors, [{ rowId: "missing", message: "Row not found." }]);
    assert.equal(result.bundle.records.find((record) => String(record.id) === ids[2]).score, 9);
    assert.equal(result.bundle.records.some((record) => String(record.id) === ids[1]), false);
    const tombstone = result.bundle.schema.deletedRows.find((item) => String(item.record.id) === ids[1]);
    assert.equal(tombstone.record.score, 11, "updates and delete in one batch must preserve the updated record in the tombstone");
    assert.equal(tombstone.page.meta.smallText, true);
    assert.deepEqual(tombstone.page.meta.tags, ["Batch restore"]);
    assert.ok(tombstone.page.bodyPath);
    assert.equal(await pageRecords.getMeta(ids[1]), null, "batch delete must detach row pages from the active page index");
    assert.equal(await new EntitiesDatabaseService(workspace).resolve(ids[1]), null, "batch-deleted rows must not resolve as active entities");
    const duplicatePage = await rowPages.open(bundle.schema.id, result.createdRowIds[0]);
    assert.equal(duplicatePage.markdown.trimEnd(), "# Batch duplicate source\n\nIndependent body.");
    assert.equal(duplicatePage.fullWidth, true);
    assert.deepEqual(duplicatePage.meta.tags, ["Batch duplicate"]);
    result.bundle = await databases.restoreRow({ databaseId: bundle.schema.id, rowId: ids[1] });
    const restored = await rowPages.open(bundle.schema.id, ids[1]);
    assert.equal(restored.record.score, 11);
    assert.equal(restored.markdown.trimEnd(), "# Batch deleted source\n\nRestore this body.");
    assert.equal(restored.meta.smallText, true);
    assert.deepEqual(restored.meta.tags, ["Batch restore"]);
    const invalid = await databases.batchRows({ databaseId: bundle.schema.id, updates: [{ rowId: ids[3], fieldId: "score", value: "not-a-number" }] });
    assert.deepEqual(invalid.errors, [{ rowId: ids[3], message: "Enter a valid number." }]);
    assert.equal(invalid.bundle.records.find((record) => String(record.id) === ids[3]).score, 7, "invalid typed updates must not mutate the row");
    const validLeapDate = await databases.batchRows({
      databaseId: bundle.schema.id,
      updates: [{ rowId: ids[3], fieldId: "due", value: "2024-02-29" }]
    });
    assert.deepEqual(validLeapDate.errors, []);
    const invalidCalendarDate = await databases.batchRows({
      databaseId: bundle.schema.id,
      updates: [{ rowId: ids[3], fieldId: "due", value: "2025-02-29" }]
    });
    assert.deepEqual(invalidCalendarDate.errors, [{ rowId: ids[3], message: "Enter a valid date." }]);
    assert.equal(
      invalidCalendarDate.bundle.records.find((record) => String(record.id) === ids[3]).due,
      "2024-02-29",
      "invalid calendar dates must not replace a valid stored leap day"
    );
    await assert.rejects(databases.batchRows({ databaseId: bundle.schema.id, deleteRowIds: Array.from({ length: 501 }, (_, index) => `row-${index}`) }), /limited to 500/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("filter expression normalizes, evaluates nested logic, and migrates legacy filters", () => {
  const fields = [
    { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] },
    { id: "score", name: "Score", type: "number" },
    { id: "due", name: "Due", type: "date" },
    { id: "tags", name: "Tags", type: "multi_select" },
    { id: "relation", name: "Related", type: "entity_ref" }
  ];
  const expression = normalizeFilterExpression({
    version: 1,
    kind: "group",
    id: "root",
    conjunction: "or",
    children: [
      {
        version: 1,
        kind: "group",
        id: "group-and",
        conjunction: "and",
        children: [
          { version: 1, kind: "condition", id: "status-done", fieldId: "status", operator: "is", value: "Done" },
          { version: 1, kind: "condition", id: "score-high", fieldId: "score", operator: "gt", value: 10 }
        ]
      },
      { version: 1, kind: "condition", id: "urgent", fieldId: "tags", operator: "contains", value: "Urgent" },
      { version: 1, kind: "condition", id: "missing", fieldId: "missing", operator: "is", value: "ignored" }
    ]
  }, [], fields);
  assert.deepEqual(expression.children.map((child) => child.id), ["group-and", "urgent"], "unknown fields should be sanitized");
  assert.equal(evaluateFilterExpression(expression, { status: "Done", score: 11, due: "2026-07-20", tags: "Backlog" }, fields), true);
  assert.equal(evaluateFilterExpression(expression, { status: "Todo", score: 99, due: "2026-07-20", tags: "Urgent, Product" }, fields), true);
  assert.equal(evaluateFilterExpression(expression, { status: "Done", score: 3, due: "2026-07-20", tags: "Backlog" }, fields), false);
  assert.equal(evaluateFilterExpression(normalizeFilterExpression({
    version: 1, kind: "group", id: "relation-root", conjunction: "and", children: [
      { version: 1, kind: "condition", id: "relation-member", fieldId: "relation", operator: "contains", value: "row_2" }
    ]
  }, [], fields), { relation: '["row_1","row_2"]' }, fields), true, "entity-reference membership should match one selected entity exactly");

  const legacy = [{ fieldId: "status", operator: "is", value: "Done" }, { fieldId: "score", operator: "gt", value: 10 }];
  const migrated = legacyFiltersToExpression(legacy);
  assert.equal(migrated.conjunction, "and");
  assert.deepEqual(migrated.children.map((condition) => condition.id), ["legacy-filter-1", "legacy-filter-2"]);
  assert.equal(evaluateFilterExpression(migrated, { status: "Done", score: 11 }, fields), true);
  assert.equal(evaluateFilterExpression(migrated, { status: "Done", score: 9 }, fields), false);
  assert.equal(legacyFiltersToExpression([{ fieldId: "status", operator: "is", value: "" }]).children.length, 0, "legacy blank filters remain no-ops");

  const invalidBlank = normalizeFilterExpression({
    version: 1, kind: "group", id: "invalid-root", conjunction: "and", children: [
      { version: 1, kind: "condition", id: "blank-score", fieldId: "score", operator: "gt", value: "" }
    ]
  }, [], fields);
  assert.equal(evaluateFilterExpression(invalidBlank, { score: 99 }, fields), false, "blank typed values must fail closed instead of becoming a match-all filter");
  const incompatible = normalizeFilterExpression({
    version: 1, kind: "group", id: "incompatible-root", conjunction: "and", children: [
      { version: 1, kind: "condition", id: "checked-score", fieldId: "score", operator: "checked", value: true }
    ]
  }, [], fields);
  assert.equal(evaluateFilterExpression(incompatible, { score: true }, fields), false, "operators that are invalid for a field type must fail closed");
  const unknownOperator = normalizeFilterExpression({
    version: 1, kind: "group", id: "unknown-root", conjunction: "and", children: [
      { version: 1, kind: "condition", id: "unknown-op", fieldId: "status", operator: "surprise", value: "Done" }
    ]
  }, [], fields);
  assert.equal(unknownOperator.children[0].operator, "is");
  assert.equal(unknownOperator.children[0].value, "", "unknown operators must not reuse their value under a different operator");
  assert.equal(evaluateFilterExpression(unknownOperator, { status: "Done" }, fields), false);
  assert.equal(
    filterConditionError({ operator: "is", value: "2025-02-29" }, fields[2]),
    "Enter a valid date.",
    "date filters must reject impossible calendar dates"
  );
});

test("database sort comparators are type-aware, stable, and respect option order", () => {
  const fields = [
    { id: "id", name: "ID", type: "id" },
    { id: "score", name: "Score", type: "number" },
    { id: "due", name: "Due", type: "date" },
    { id: "done", name: "Done", type: "checkbox" },
    { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }] },
    { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "p", name: "Product" }, { id: "u", name: "UI" }, { id: "g", name: "Git" }] },
    { id: "formula", name: "Formula", type: "formula" },
    { id: "rollup", name: "Rollup", type: "rollup" },
    { id: "title", name: "Title", type: "text" }
  ];
  assert.ok(compareFieldValues(2, 10, fields[1], "asc") < 0, "numbers must not sort lexically");
  assert.ok(compareFieldValues("2026-02-01", "2025-12-31", fields[2], "asc") > 0);
  assert.ok(compareFieldValues(false, true, fields[3], "asc") < 0);
  assert.ok(compareFieldValues("false", "true", fields[3], "asc") < 0, "serialized checkbox values must retain boolean ordering");
  assert.ok(compareFieldValues("Todo", "Done", fields[4], "asc") < 0, "selects use option order");
  assert.ok(compareFieldValues("", 1, fields[1], "desc") > 0, "empty values remain last in either direction");
  assert.ok(compareFieldValues(null, 1, fields[1], "asc") > 0 && compareFieldValues(undefined, 1, fields[1], "desc") > 0, "null and undefined remain last in either direction");
  assert.ok(compareFieldValues("2", "10", fields[6], "asc") < 0, "numeric formulas compare numerically");
  assert.ok(compareFieldValues("Alpha", "Beta", fields[6], "asc") < 0, "text formulas fall back to text comparison");
  assert.ok(compareFieldValues(10, 2, fields[7], "desc") < 0, "numeric rollups respect descending direction");
  assert.ok(compareFieldValues("Item 2", "Item 10", fields[8], "asc") < 0, "text sorting uses natural numeric collation");

  const records = [
    { id: "a", status: "Todo", score: 2, tags: "UI" },
    { id: "b", status: "Todo", score: 2, tags: "Product;UI" },
    { id: "c", status: "Doing", score: 10, tags: "Git" },
    { id: "d", status: "Todo", score: 9, tags: "Product" }
  ];
  const sorted = sortDatabaseRecords(records, [{ fieldId: "status", direction: "asc" }, { fieldId: "score", direction: "desc" }], fields);
  assert.deepEqual(sorted.map((record) => record.id), ["d", "a", "b", "c"], "equal values keep source order as the tie-breaker");
  fields[4] = { ...fields[4], options: [...fields[4].options].reverse() };
  assert.deepEqual(sortDatabaseRecords(records, [{ fieldId: "status", direction: "asc" }], fields).map((record) => record.id), ["c", "a", "b", "d"], "reordering options changes select sort without cell edits");
  assert.deepEqual(sortDatabaseRecords(records, [{ fieldId: "tags", direction: "asc" }], fields).map((record) => record.id), ["d", "b", "a", "c"]);
  const equivalentMultiSelects = [
    { id: "first", tags: "UI;Product" },
    { id: "second", tags: '["Product","UI"]' },
    { id: "third", tags: "Product;UI;Product" }
  ];
  assert.deepEqual(
    sortDatabaseRecords(equivalentMultiSelects, [{ fieldId: "tags", direction: "asc" }], fields).map((record) => record.id),
    ["first", "second", "third"],
    "equivalent multi-select sets must preserve stable source order regardless of serialization or duplicate tokens"
  );
  assert.deepEqual(
    sortDatabaseRecords([{ id: "z", score: 2 }, { id: "a", score: 2 }, { id: "m", score: 2 }], [{ fieldId: "score", direction: "asc" }], fields).map((record) => record.id),
    ["z", "a", "m"],
    "equal values must preserve deterministic source order"
  );
});

test("database grouping normalizes legacy config and deterministic option, multi-select, and empty buckets", () => {
  const fields = [{ id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] }, { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "ui", name: "UI" }, { id: "git", name: "Git" }] }];
  const migrated = normalizeViewGroups(undefined, fields, "status");
  assert.equal(migrated[0].fieldId, "status");
  assert.equal(migrated[0].version, 1);
  const records = [{ id: "a", status: "Done", tags: "UI;Git" }, { id: "b", status: "", tags: "" }, { id: "c", status: "Todo", tags: "UI" }];
  const statusGroups = groupDatabaseRecords(records, fields[0], migrated[0]);
  assert.deepEqual(statusGroups.map((group) => group.key), ["option:todo", "option:done", EMPTY_GROUP_KEY]);
  assert.deepEqual(statusGroups.map((group) => group.records.length), [1, 1, 1]);
  const tagGroups = groupDatabaseRecords(records, fields[1], { version: 1, id: "tags", fieldId: "tags", order: "manual" });
  assert.deepEqual(tagGroups.map((group) => [group.key, group.records.length]), [["option:ui", 2], ["option:git", 1], [EMPTY_GROUP_KEY, 1]]);
  const jsonTagGroups = groupDatabaseRecords([{ id: "json", tags: '["Git","UI","Git"]' }], fields[1], { version: 1, id: "tags", fieldId: "tags", order: "manual" });
  assert.deepEqual(jsonTagGroups.map((group) => [group.key, group.records.length]), [["option:ui", 1], ["option:git", 1], [EMPTY_GROUP_KEY, 0]], "JSON multi-select values should expand without duplicate membership");
  assert.equal(normalizeViewGroups([{ ...migrated[0], fieldId: "missing" }], fields).length, 0);
  assert.deepEqual(normalizeViewGroups([], fields, "status"), [], "explicitly removing grouping must not remigrate legacy Kanban config");
  assert.deepEqual(normalizeViewGroups([{ ...migrated[0], groupOrder: ["option:todo", "option:removed"], hiddenGroupKeys: ["option:removed"], collapsedGroupKeys: ["option:done", "option:removed"] }], fields, undefined, records), [{
    ...migrated[0],
    groupOrder: ["option:todo"],
    hiddenGroupKeys: [],
    collapsedGroupKeys: ["option:done"],
    hideEmpty: false
  }], "bucket state should be sanitized against current options and record values");
});

test("database field option changes persist sanitized grouping state", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-group-sanitize-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Grouping sanitize space");
    await workspace.createAt(workspaceRoot, { name: "Grouping sanitize space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({ name: "Grouping sanitation" });
    bundle = await databases.addField(bundle.schema.id, { name: "Status", type: "select", options: [{ id: "todo", name: "Todo" }, { id: "done", name: "Done" }] });
    const status = bundle.schema.fields.find((field) => field.name === "Status");
    assert.ok(status);
    bundle = await databases.updateCell({ databaseId: bundle.schema.id, rowId: String(bundle.records[0].id), fieldId: status.id, value: "Done" });
    const sourceView = bundle.views[0];
    bundle = await databases.updateView(bundle.schema.id, { ...sourceView, groups: [{ version: 1, id: "primary", fieldId: status.id, order: "manual", groupOrder: ["option:todo", "option:done"], hiddenGroupKeys: ["option:todo"], collapsedGroupKeys: ["option:done"] }] });
    bundle = await databases.updateField({ databaseId: bundle.schema.id, fieldId: status.id, name: status.name, type: "select", options: [{ id: "todo", name: "Todo" }] });
    const sanitized = bundle.views.find((view) => view.id === sourceView.id)?.groups?.[0];
    assert.deepEqual(sanitized?.groupOrder, ["option:todo"]);
    assert.deepEqual(sanitized?.hiddenGroupKeys, ["option:todo"]);
    assert.deepEqual(sanitized?.collapsedGroupKeys, []);
    const reloaded = await databases.get(bundle.schema.id);
    assert.deepEqual(reloaded.views.find((view) => view.id === sourceView.id)?.groups?.[0], sanitized, "sanitized state should be written in the same field mutation");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database page open preferences normalize with type-appropriate defaults", () => {
  assert.equal(defaultPageOpenMode("table"), "side_peek");
  assert.equal(defaultPageOpenMode("kanban"), "side_peek");
  assert.equal(defaultPageOpenMode("list"), "center_peek");
  assert.equal(defaultPageOpenMode("calendar"), "center_peek");
  assert.equal(defaultPageOpenMode("gallery"), "center_peek");
  assert.equal(defaultPageOpenMode("plugin_timeline"), "center_peek");
  assert.equal(normalizePageOpenMode(undefined, "table"), "side_peek");
  assert.equal(normalizePageOpenMode("center_peek", "table"), "center_peek");
  assert.equal(normalizePageOpenMode("side_peek", "list"), "side_peek");
  assert.equal(normalizePageOpenMode("full_page", "gallery"), "full_page");
  assert.equal(normalizePageOpenMode("legacy-modal", "calendar"), "center_peek");
});

test("database view creation distinguishes empty and duplicate sources and persists order", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-view-order-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "View Order Space");
    await workspace.createAt(workspaceRoot, { name: "View Order Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({ name: "Ordered Views" });
    const source = bundle.views[0];
    const patched = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: source.id,
      patch: { filters: [{ fieldId: "title", operator: "contains", value: "secret" }], sorts: [{ fieldId: "title", direction: "desc" }] },
      expectedRevision: source.revision ?? 0
    });
    assert.equal(patched.ok, true);
    assert.equal(patched.view.filterExpression.version, 1);
    assert.deepEqual(patched.view.filterExpression.children.map((condition) => condition.fieldId), ["title"]);

    bundle = await databases.createView({ databaseId: bundle.schema.id, name: "Blank", type: "list", sourceMode: "empty" });
    const blank = bundle.views.find((view) => view.name === "Blank");
    assert.ok(blank);
    assert.equal(blank.type, "list");
    assert.deepEqual(blank.filters, []);
    assert.deepEqual(blank.sorts, []);

    bundle = await databases.createView({ databaseId: bundle.schema.id, name: "Copy", type: "table", sourceMode: "duplicate", sourceViewId: source.id });
    const copy = bundle.views.find((view) => view.name === "Copy");
    assert.ok(copy);
    assert.deepEqual(copy.filters, [{ fieldId: "title", operator: "contains", value: "secret" }]);
    assert.deepEqual(copy.sorts, [{ fieldId: "title", direction: "desc" }]);

    const viewOrdersBeforeField = new Map(bundle.views.map((view) => [view.id, [...view.fieldOrder]]));
    bundle = await databases.addField(bundle.schema.id, { name: "Scoped score", type: "number", visibility: "current", viewId: blank.id });
    const scopedField = bundle.schema.fields.find((field) => field.name === "Scoped score");
    assert.ok(scopedField);
    assert.equal(bundle.views.find((view) => view.id === blank.id).visibleFieldIds.includes(scopedField.id), true);
    assert.equal(bundle.views.filter((view) => view.id !== blank.id).some((view) => view.visibleFieldIds.includes(scopedField.id)), false);
    const schemaOrder = bundle.schema.fields.map((field) => field.id).reverse();
    bundle = await databases.reorderFields({ databaseId: bundle.schema.id, fieldIds: schemaOrder });
    assert.deepEqual(bundle.schema.fields.map((field) => field.id), schemaOrder);
    for (const view of bundle.views) {
      const before = viewOrdersBeforeField.get(view.id) ?? [];
      assert.deepEqual(view.fieldOrder.filter((id) => id !== scopedField.id), before, "schema reorder must preserve custom per-view column order");
    }
    const rowId = String(bundle.records[0].id);
    bundle = await databases.updateCell({ databaseId: bundle.schema.id, rowId, fieldId: scopedField.id, value: 42 });
    const positionBeforeDelete = bundle.schema.fields.findIndex((field) => field.id === scopedField.id);
    bundle = await databases.deleteField(bundle.schema.id, scopedField.id);
    const tombstone = bundle.schema.deletedFields.find((item) => item.field.id === scopedField.id);
    assert.ok(tombstone);
    assert.equal(tombstone.values[rowId], 42);
    assert.equal(bundle.schema.fields.some((field) => field.id === scopedField.id), false);
    assert.equal(Object.hasOwn(bundle.records[0], scopedField.id), false);
    bundle = await databases.restoreField({ databaseId: bundle.schema.id, fieldId: scopedField.id });
    assert.equal(bundle.schema.fields[positionBeforeDelete].id, scopedField.id);
    assert.equal(bundle.records[0][scopedField.id], 42);
    assert.equal(bundle.views.find((view) => view.id === blank.id).visibleFieldIds.includes(scopedField.id), true);
    assert.equal(bundle.views.filter((view) => view.id !== blank.id).some((view) => view.visibleFieldIds.includes(scopedField.id)), false);

    bundle = await databases.addField(bundle.schema.id, {
      name: "Scoped score copy",
      type: "text",
      sourceFieldId: scopedField.id,
      visibility: "current",
      viewId: blank.id,
      insertAfterFieldId: scopedField.id
    });
    const duplicatedField = bundle.schema.fields.find((field) => field.name === "Scoped score copy");
    assert.ok(duplicatedField);
    assert.equal(duplicatedField.type, "number", "duplicate should copy the source schema type");
    assert.equal(bundle.schema.fields[bundle.schema.fields.findIndex((field) => field.id === scopedField.id) + 1].id, duplicatedField.id);
    const blankAfterDuplicate = bundle.views.find((view) => view.id === blank.id);
    assert.equal(blankAfterDuplicate.fieldOrder[blankAfterDuplicate.fieldOrder.indexOf(scopedField.id) + 1], duplicatedField.id);
    assert.equal(bundle.records[0][duplicatedField.id], "", "duplicate should initialize values instead of copying row data");

    bundle = await databases.addField(bundle.schema.id, {
      name: "Inserted before",
      type: "text",
      visibility: "current",
      viewId: blank.id,
      insertBeforeFieldId: duplicatedField.id
    });
    const insertedField = bundle.schema.fields.find((field) => field.name === "Inserted before");
    assert.ok(insertedField);
    assert.equal(bundle.schema.fields[bundle.schema.fields.findIndex((field) => field.id === duplicatedField.id) - 1].id, insertedField.id);

    const freezeView = bundle.views.find((view) => view.id === blank.id);
    const frozen = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: blank.id,
      patch: { frozenThroughFieldId: duplicatedField.id },
      expectedRevision: freezeView.revision ?? 0
    });
    assert.equal(frozen.ok, true);
    bundle = frozen.bundle;
    assert.equal((await databases.get(bundle.schema.id)).views.find((view) => view.id === blank.id).frozenThroughFieldId, duplicatedField.id);
    bundle = await databases.deleteField(bundle.schema.id, duplicatedField.id);
    assert.equal(bundle.views.find((view) => view.id === blank.id).frozenThroughFieldId, undefined, "deleting the frozen boundary should sanitize the view");

    bundle = await databases.createView({ databaseId: bundle.schema.id, name: "Blank", type: "table", sourceMode: "empty" });
    assert.ok(bundle.views.some((view) => view.name === "Blank 2"), "duplicate view names should be made unique");
    assert.equal(new Set(bundle.views.map((view) => view.id)).size, bundle.views.length, "created view ids should remain unique");

    const reversedIds = bundle.views.map((view) => view.id).reverse();
    const orderBeforeInjectedFailure = bundle.views.map((view) => view.id);
    const revisionsBeforeInjectedFailure = bundle.views.map((view) => view.revision ?? 0);
    databases.failNextViewWriteForDebug("Injected view reorder write failure");
    await assert.rejects(
      databases.reorderViews({ databaseId: bundle.schema.id, viewIds: reversedIds }),
      (error) => error?.code === "DATABASE_PERSISTENCE_FAILURE" && /Injected view reorder write failure/.test(error.message)
    );
    const afterInjectedReorderFailure = await databases.get(bundle.schema.id);
    assert.deepEqual(afterInjectedReorderFailure.views.map((view) => view.id), orderBeforeInjectedFailure);
    assert.deepEqual(
      afterInjectedReorderFailure.views.map((view) => view.revision ?? 0),
      revisionsBeforeInjectedFailure,
      "failed multi-view write should preserve every persisted revision"
    );
    bundle = await databases.reorderViews({ databaseId: bundle.schema.id, viewIds: reversedIds });
    assert.deepEqual(bundle.views.map((view) => view.id), reversedIds);
    assert.deepEqual(bundle.views.map((view) => view.position), reversedIds.map((_, index) => index));
    const reloaded = await databases.get(bundle.schema.id);
    assert.deepEqual(reloaded.views.map((view) => view.id), reversedIds);
    await assert.rejects(
      databases.reorderViews({ databaseId: bundle.schema.id, viewIds: reversedIds.slice(1) }),
      /every view exactly once/i
    );
    await assert.rejects(
      databases.reorderViews({ databaseId: bundle.schema.id, viewIds: [...reversedIds.slice(0, -1), reversedIds[0]] }),
      /every view exactly once/i
    );
    await assert.rejects(
      databases.reorderViews({ databaseId: bundle.schema.id, viewIds: [...reversedIds.slice(0, -1), "view_unknown"] }),
      /unknown view/i
    );

    bundle = await databases.setDefaultView({ databaseId: bundle.schema.id, viewId: blank.id });
    bundle = await databases.deleteView({ databaseId: bundle.schema.id, viewId: blank.id });
    assert.ok(bundle.views.some((view) => view.id === bundle.schema.defaultViewId), "deleting the default should choose a valid surviving default");
    assert.deepEqual(bundle.views.map((view) => view.position), bundle.views.map((_, index) => index));
    const afterDeleteReload = await databases.get(bundle.schema.id);
    assert.equal(afterDeleteReload.schema.defaultViewId, bundle.schema.defaultViewId);
    assert.ok(afterDeleteReload.views.some((view) => view.id === afterDeleteReload.schema.defaultViewId));
    await assert.rejects(
      databases.patchView({ databaseId: bundle.schema.id, viewId: copy.id, patch: { name: "Blank 2" }, expectedRevision: copy.revision ?? 0 }),
      (error) => error?.code === "VIEW_NAME_CONFLICT"
    );
    await assert.rejects(
      databases.deleteView({ databaseId: bundle.schema.id, viewId: "view_missing" }),
      (error) => error?.code === "VIEW_NOT_FOUND"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database property manager preserves visibility policy, schema order, and select option order", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-property-manager-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Property Manager Space");
    await workspace.createAt(workspaceRoot, { name: "Property Manager Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({ name: "Managed Properties" });
    bundle = await databases.createView({ databaseId: bundle.schema.id, name: "Second", type: "table", sourceMode: "empty" });
    const [firstView, secondView] = bundle.views;

    bundle = await databases.addField(bundle.schema.id, { name: "Everywhere", type: "text", visibility: "all" });
    const everywhere = bundle.schema.fields.find((field) => field.name === "Everywhere");
    assert.ok(everywhere);
    assert.equal(bundle.views.every((view) => view.visibleFieldIds.includes(everywhere.id) && view.fieldOrder.includes(everywhere.id)), true);

    bundle = await databases.addField(bundle.schema.id, { name: "Only here", type: "number", visibility: "current", viewId: secondView.id });
    const currentOnly = bundle.schema.fields.find((field) => field.name === "Only here");
    assert.ok(currentOnly);
    assert.equal(bundle.views.find((view) => view.id === secondView.id).visibleFieldIds.includes(currentOnly.id), true);
    assert.equal(bundle.views.find((view) => view.id === firstView.id).visibleFieldIds.includes(currentOnly.id), false);

    bundle = await databases.addField(bundle.schema.id, { name: "Hidden", type: "text", visibility: "hidden" });
    const hidden = bundle.schema.fields.find((field) => field.name === "Hidden");
    assert.ok(hidden);
    assert.equal(bundle.views.some((view) => view.visibleFieldIds.includes(hidden.id) || view.fieldOrder.includes(hidden.id)), false);
    await assert.rejects(
      databases.addField(bundle.schema.id, { name: "Invalid", type: "text", visibility: "current", viewId: "view_missing" }),
      (error) => error?.code === "VIEW_NOT_FOUND"
    );

    bundle = await databases.addField(bundle.schema.id, {
      name: "Ordered choices",
      type: "select",
      visibility: "hidden",
      options: [
        { id: "third", name: "Third", color: "green" },
        { id: "first", name: "First", color: "red" },
        { id: "second", name: "Second", color: "blue" }
      ]
    });
    const choices = bundle.schema.fields.find((field) => field.name === "Ordered choices");
    assert.ok(choices);
    assert.deepEqual(choices.options?.map((option) => option.id), ["third", "first", "second"]);

    const viewOrders = new Map(bundle.views.map((view) => [view.id, [...view.fieldOrder]]));
    const schemaOrder = bundle.schema.fields.map((field) => field.id).reverse();
    bundle = await databases.reorderFields({ databaseId: bundle.schema.id, fieldIds: schemaOrder });
    assert.deepEqual(bundle.schema.fields.map((field) => field.id), schemaOrder);
    for (const view of bundle.views) assert.deepEqual(view.fieldOrder, viewOrders.get(view.id));
    const reloaded = await databases.get(bundle.schema.id);
    assert.deepEqual(reloaded.schema.fields.map((field) => field.id), schemaOrder);
    assert.deepEqual(reloaded.schema.fields.find((field) => field.id === choices.id)?.options?.map((option) => option.id), ["third", "first", "second"]);

    await assert.rejects(
      databases.reorderFields({ databaseId: bundle.schema.id, fieldIds: schemaOrder.slice(1) }),
      /every schema field exactly once/i
    );
    await assert.rejects(
      databases.reorderFields({ databaseId: bundle.schema.id, fieldIds: [...schemaOrder.slice(0, -1), schemaOrder[0]] }),
      /every schema field exactly once/i
    );
    await assert.rejects(
      databases.reorderFields({ databaseId: bundle.schema.id, fieldIds: [...schemaOrder.slice(0, -1), "field_unknown"] }),
      /every schema field exactly once/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database property tombstones restore state and track only current local and cross-database dependencies", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-property-tombstone-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Property Tombstone Space");
    await workspace.createAt(workspaceRoot, { name: "Property Tombstone Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);

    let target = await databases.create({
      name: "Projects",
      template: {
        fields: [
          { id: "amount", name: "Amount", type: "number" },
          { id: "double", name: "Double", type: "formula", formula: '=FIELD("amount") * 2' }
        ],
        rows: [{ id: "project_1", title: "Project", amount: 7 }]
      }
    });
    const targetView = target.views[0];
    const patched = await databases.patchView({
      databaseId: target.schema.id,
      viewId: targetView.id,
      patch: {
        filters: [{ fieldId: "amount", operator: "greater_than", value: "1" }],
        sorts: [{ fieldId: "amount", direction: "desc" }],
        wrapFieldIds: [...(targetView.wrapFieldIds ?? []), "amount"]
      },
      expectedRevision: targetView.revision ?? 0
    });
    assert.equal(patched.ok, true);
    target = patched.bundle;

    let source = await databases.create({
      name: "Tasks",
      template: {
        fields: [
          { id: "project", name: "Project", type: "entity_ref", relation: { targetDatabaseId: target.schema.id } },
          { id: "total", name: "Total", type: "rollup", rollup: { relationFieldId: "project", targetFieldId: "amount", aggregation: "sum" } }
        ],
        rows: [{ id: "task_1", title: "Task" }]
      }
    });

    const amountPosition = target.schema.fields.findIndex((field) => field.id === "amount");
    const amountVisibleIndex = target.views[0].visibleFieldIds.indexOf("amount");
    const amountOrderIndex = target.views[0].fieldOrder.indexOf("amount");
    target = await databases.deleteField(target.schema.id, "amount");
    const tombstone = target.schema.deletedFields?.find((item) => item.field.id === "amount");
    assert.ok(tombstone);
    assert.equal(tombstone.values.project_1, 7);
    assert.deepEqual(tombstone.dependencies, [`formula:double`, `rollup:${source.schema.id}:total`]);
    assert.equal(tombstone.dependencies.some((dependency) => dependency.startsWith("filter:") || dependency.startsWith("sort:")), false, "removed view clauses must not remain as permanent-delete blockers");
    assert.deepEqual(target.views[0].filters, []);
    assert.deepEqual(target.views[0].sorts, []);
    await assert.rejects(
      databases.permanentlyDeleteField({ databaseId: target.schema.id, fieldId: "amount" }),
      /formula:double.*rollup:/i
    );

    target = await databases.updateField({ databaseId: target.schema.id, fieldId: "double", type: "text" });
    source = await databases.updateField({ databaseId: source.schema.id, fieldId: "total", type: "text" });
    assert.equal(source.schema.fields.find((field) => field.id === "total")?.rollup, undefined);
    target = await databases.get(target.schema.id);
    assert.deepEqual(target.schema.deletedFields?.find((item) => item.field.id === "amount")?.dependencies, []);

    target = await databases.restoreField({ databaseId: target.schema.id, fieldId: "amount" });
    assert.equal(target.schema.fields[amountPosition].id, "amount");
    assert.equal(target.records.find((record) => record.id === "project_1")?.amount, 7);
    assert.equal(target.views[0].visibleFieldIds[amountVisibleIndex], "amount");
    assert.equal(target.views[0].fieldOrder[amountOrderIndex], "amount");
    assert.equal(target.views[0].wrapFieldIds?.includes("amount"), true);

    target = await databases.deleteField(target.schema.id, "amount");
    target = await databases.permanentlyDeleteField({ databaseId: target.schema.id, fieldId: "amount" });
    assert.equal(target.schema.deletedFields?.some((item) => item.field.id === "amount"), false);
    await assert.rejects(databases.deleteField(target.schema.id, "title"), /cannot be deleted/i);
    await assert.rejects(databases.deleteField(target.schema.id, "id"), /cannot be deleted/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database column insertion validates sources and anchors while preserving copied schema and view position", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-column-insert-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Column Insert Space");
    await workspace.createAt(workspaceRoot, { name: "Column Insert Space" });
    await workspace.open(workspaceRoot);
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({
      name: "Columns",
      template: {
        fields: [{ id: "priority", name: "Priority", type: "select", options: [
          { id: "high", name: "High", color: "red" },
          { id: "low", name: "Low", color: "gray" }
        ] }],
        rows: [{ id: "row_1", title: "Task", priority: "High" }]
      }
    });
    bundle = await databases.createView({ databaseId: bundle.schema.id, name: "Other", type: "table", sourceMode: "empty" });
    const activeView = bundle.views[0];
    const otherView = bundle.views.find((view) => view.name === "Other");

    bundle = await databases.addField(bundle.schema.id, {
      name: "Priority copy",
      type: "text",
      sourceFieldId: "priority",
      visibility: "current",
      viewId: activeView.id,
      insertAfterFieldId: "priority"
    });
    const copy = bundle.schema.fields.find((field) => field.name === "Priority copy");
    assert.ok(copy);
    assert.equal(copy.type, "select");
    assert.deepEqual(copy.options, [
      { id: "high", name: "High", color: "red" },
      { id: "low", name: "Low", color: "gray" }
    ]);
    assert.notEqual(copy.options, bundle.schema.fields.find((field) => field.id === "priority")?.options);
    assert.equal(bundle.records.find((record) => record.id === "row_1")?.[copy.id], "");
    assert.equal(bundle.schema.fields[bundle.schema.fields.findIndex((field) => field.id === "priority") + 1].id, copy.id);
    const activeAfterCopy = bundle.views.find((view) => view.id === activeView.id);
    assert.equal(activeAfterCopy.fieldOrder[activeAfterCopy.fieldOrder.indexOf("priority") + 1], copy.id);
    assert.equal(bundle.views.find((view) => view.id === otherView.id).visibleFieldIds.includes(copy.id), false);

    bundle = await databases.addField(bundle.schema.id, {
      name: "Priority copy",
      type: "text",
      sourceFieldId: "priority",
      visibility: "current",
      viewId: activeView.id,
      insertBeforeFieldId: "priority"
    });
    const secondCopy = bundle.schema.fields.find((field) => field.name === "Priority copy 2");
    assert.ok(secondCopy);
    assert.equal(bundle.schema.fields[bundle.schema.fields.findIndex((field) => field.id === "priority") - 1].id, secondCopy.id);

    await assert.rejects(databases.addField(bundle.schema.id, {
      name: "Missing source",
      type: "text",
      sourceFieldId: "missing",
      visibility: "hidden"
    }), /source property not found/i);
    await assert.rejects(databases.addField(bundle.schema.id, {
      name: "System copy",
      type: "text",
      sourceFieldId: "id",
      visibility: "hidden"
    }), /system properties cannot be duplicated/i);
    await assert.rejects(databases.addField(bundle.schema.id, {
      name: "Missing anchor",
      type: "text",
      visibility: "hidden",
      insertAfterFieldId: "missing"
    }), /anchor property not found/i);
    await assert.rejects(databases.addField(bundle.schema.id, {
      name: "Two anchors",
      type: "text",
      visibility: "hidden",
      insertBeforeFieldId: "priority",
      insertAfterFieldId: copy.id
    }), /either an insert-before or insert-after/i);

    let frozen = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      patch: { frozenThroughFieldId: "priority" },
      expectedRevision: bundle.views.find((view) => view.id === activeView.id).revision ?? 0
    });
    assert.equal(frozen.ok, true);
    assert.equal((await databases.get(bundle.schema.id)).views.find((view) => view.id === activeView.id).frozenThroughFieldId, "priority");
    frozen = await databases.patchView({
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      patch: { visibleFieldIds: ["title"] },
      expectedRevision: frozen.view.revision ?? 0
    });
    assert.equal(frozen.ok, true);
    assert.equal(frozen.view.frozenThroughFieldId, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("information-amount ordering favors rich, varied content", () => {
  const fields = [
    { id: "title", name: "Title", type: "text" },
    { id: "status", name: "Status", type: "select" },
    { id: "status_copy", name: "Status copy", type: "select" },
    { id: "priority", name: "Priority", type: "select" },
    { id: "notes", name: "Notes", type: "text" },
    { id: "empty", name: "Empty", type: "text" },
    { id: "notion_original_html", name: "Original Notion HTML", type: "url" }
  ];
  const records = Array.from({ length: 8 }, (_, index) => ({
    title: `Task ${index + 1}`,
    status: index < 4 ? "Todo" : "Done",
    status_copy: index < 4 ? "Todo" : "Done",
    priority: index % 2 === 0 ? "High" : "Low",
    notes: `Unique detailed note ${index + 1} with enough text to carry a high visual reading cost.`,
    empty: "",
    notion_original_html: `attachments/original/task-${index + 1}.html`
  }));

  const ordered = orderFieldIdsByInformationAmount(
    records,
    fields.map((field) => field.id),
    { pinnedFirst: ["title"], pinnedLast: ["notion_original_html"] }
  );

  assert.equal(ordered[0], "title");
  assert.equal(ordered[1], "notes");
  assert.equal(ordered.indexOf("status_copy") > ordered.indexOf("status"), true);
  assert.equal(ordered.indexOf("empty") > ordered.indexOf("priority"), true);
  assert.equal(ordered.at(-1), "notion_original_html");
});

test("database default view orders fields by information amount without changing new or copied views", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-view-richness-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Richness Space");
    await workspace.createAt(workspaceRoot, { name: "Richness Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const bundle = await databases.create({
      name: "Richness",
      template: {
        fields: [
          { id: "long_notes", name: "Long notes", type: "text" },
          { id: "short_code", name: "Short code", type: "text" },
          { id: "empty_note", name: "Empty note", type: "text" },
          { id: "notion_original_html", name: "Original Notion HTML", type: "url" }
        ],
        rows: [
          {
            title: "A",
            short_code: "ok",
            long_notes: "This row contains a much longer note than the short code column.",
            empty_note: "",
            notion_original_html: "attachments/original/export/page.html"
          },
          {
            title: "B",
            short_code: "x",
            long_notes: "Another detailed note that should make this column sort near the front.",
            empty_note: "",
            notion_original_html: "attachments/original/export/another-page.html"
          }
        ]
      }
    });

    const expectedDefaultOrder = ["title", "long_notes", "short_code", "empty_note", "notion_original_html"];
    const schemaOrder = ["title", "long_notes", "short_code", "empty_note", "notion_original_html"];
    assert.deepEqual(bundle.views[0].fieldOrder, expectedDefaultOrder);
    assert.deepEqual(bundle.views[0].wrapFieldIds, [], "generated default views should keep compact single-line rows");
    assertCreatedTimeDefaultViews(bundle, schemaOrder);

    const paths = new WorkspacePaths(workspaceRoot);
    let withNewViews = await databases.createView({
      databaseId: bundle.schema.id,
      name: "Blank",
      sourceMode: "empty"
    });
    assert.deepEqual(withNewViews.views.find((view) => view.name === "Blank")?.fieldOrder, schemaOrder);
    assert.deepEqual(withNewViews.views.find((view) => view.name === "Blank")?.wrapFieldIds, []);
    withNewViews = await databases.createView({
      databaseId: bundle.schema.id,
      name: "Default copy",
      sourceMode: "duplicate",
      sourceViewId: DEFAULT_VIEW_ID
    });
    assert.deepEqual(withNewViews.views.find((view) => view.name === "Default copy")?.fieldOrder, expectedDefaultOrder);
    assert.deepEqual(
      withNewViews.views.find((view) => view.name === "Default copy")?.wrapFieldIds,
      [],
      "copied views should preserve the source wrap configuration"
    );

    await writeJsonFile(paths.view(bundle.schema.id, DEFAULT_VIEW_ID, bundle.schema.name), {
      ...bundle.views[0],
      visibleFieldIds: schemaOrder,
      fieldOrder: schemaOrder
    });
    const normalizedExistingBundle = await databases.get(bundle.schema.id);
    assert.deepEqual(normalizedExistingBundle.views.find((view) => view.id === DEFAULT_VIEW_ID)?.fieldOrder, schemaOrder);
    assertCreatedTimeDefaultViews(normalizedExistingBundle, schemaOrder);

    const customOrder = ["title", "empty_note", "short_code", "long_notes", "notion_original_html"];
    await writeJsonFile(paths.view(bundle.schema.id, DEFAULT_VIEW_ID, bundle.schema.name), {
      ...bundle.views[0],
      visibleFieldIds: schemaOrder,
      fieldOrder: customOrder
    });
    const customExistingBundle = await databases.get(bundle.schema.id);
    assert.deepEqual(customExistingBundle.views.find((view) => view.id === DEFAULT_VIEW_ID)?.fieldOrder, customOrder);
    assertCreatedTimeDefaultViews(customExistingBundle, schemaOrder);

    await fileService.remove(paths.viewsDir(bundle.schema.id, bundle.schema.name), { recursive: true, force: true });
    const fallbackBundle = await databases.get(bundle.schema.id);
    assert.deepEqual(fallbackBundle.views.find((view) => view.id === DEFAULT_VIEW_ID)?.fieldOrder, expectedDefaultOrder);
    assertCreatedTimeDefaultViews(fallbackBundle, schemaOrder);

    await writeJsonFile(paths.schema(bundle.schema.id, bundle.schema.name), {
      ...fallbackBundle.schema,
      fields: fallbackBundle.schema.fields.map((field) => (
        field.id === "created_time" ? { ...field, hidden: true } : field
      ))
    });
    const hiddenCreatedTimeBundle = await databases.get(bundle.schema.id);
    assertCreatedTimeDefaultViews(hiddenCreatedTimeBundle, schemaOrder);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database created-date default views preserve a custom default view", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-created-date-views-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Created Views Space");
    await workspace.createAt(workspaceRoot, { name: "Created Views Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const bundle = await databases.create({
      name: "Created Views",
      template: {
        fields: [{ id: "notes", name: "Notes", type: "text" }],
        rows: [
          { title: "Old", notes: "old row" },
          { title: "New", notes: "new row" }
        ]
      }
    });
    const expectedOrder = ["title", "notes"];
    assertCreatedTimeDefaultViews(bundle, expectedOrder);

    let updated = await databases.createView({ databaseId: bundle.schema.id, name: "Custom default" });
    const custom = updated.views.find((view) => view.name === "Custom default");
    assert.ok(custom);
    updated = await databases.setDefaultView({ databaseId: bundle.schema.id, viewId: custom.id });

    assert.equal(updated.schema.defaultViewId, custom.id);
    assert.equal(updated.views[0].id, custom.id);
    assertCreatedTimeDefaultViews(updated, expectedOrder);

    const reloaded = await databases.get(bundle.schema.id);
    assert.equal(reloaded.schema.defaultViewId, custom.id);
    assert.equal(reloaded.views[0].id, custom.id);
    assertCreatedTimeDefaultViews(reloaded, expectedOrder);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function assertCreatedTimeDefaultViews(bundle, expectedContentOrder) {
  const asc = bundle.views.filter((view) => view.id === "view_created_time_asc");
  const desc = bundle.views.filter((view) => view.id === "view_created_time_desc");
  assert.equal(asc.length, 1);
  assert.equal(desc.length, 1);
  assert.deepEqual(asc[0].sorts, [{ fieldId: "created_time", direction: "asc" }]);
  assert.deepEqual(desc[0].sorts, [{ fieldId: "created_time", direction: "desc" }]);
  assert.deepEqual(asc[0].fieldOrder, withCreatedTimeAfterTitle(expectedContentOrder));
  assert.deepEqual(desc[0].fieldOrder, withCreatedTimeAfterTitle(expectedContentOrder));
  assert.deepEqual(asc[0].wrapFieldIds, []);
  assert.deepEqual(desc[0].wrapFieldIds, []);
}

function withCreatedTimeAfterTitle(fieldOrder) {
  return fieldOrder.flatMap((fieldId) => fieldId === "title" ? ["title", "created_time"] : [fieldId]);
}

test("database relation field metadata is normalized and cleared on type change", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-relation-field-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Relation Space");
    await workspace.createAt(workspaceRoot, { name: "Relation Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const target = await databases.create({ name: "Projects" });
    const source = await databases.create({ name: "Tasks" });

    let bundle = await databases.addField(source.schema.id, {
      name: "Project",
      type: "entity_ref",
      relation: { targetDatabaseId: ` ${target.schema.id} ` }
    });
    let field = bundle.schema.fields.find((item) => item.name === "Project");
    assert.deepEqual(field?.relation, { targetDatabaseId: target.schema.id, multiple: true });

    bundle = await databases.updateField({
      databaseId: source.schema.id,
      fieldId: field.id,
      name: "Primary project",
      relation: { targetDatabaseId: target.schema.id, multiple: false }
    });
    field = bundle.schema.fields.find((item) => item.id === field.id);
    assert.deepEqual(field?.relation, { targetDatabaseId: target.schema.id, multiple: false });

    bundle = await databases.updateField({
      databaseId: source.schema.id,
      fieldId: field.id,
      type: "text"
    });
    field = bundle.schema.fields.find((item) => item.name === "Primary project");
    assert.equal(field?.type, "text");
    assert.equal(field?.relation, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database rollup field metadata is normalized and cleared on type change", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-rollup-field-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Rollup Space");
    await workspace.createAt(workspaceRoot, { name: "Rollup Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const target = await databases.create({ name: "Projects" });
    const source = await databases.create({ name: "Tasks" });
    let bundle = await databases.addField(source.schema.id, {
      name: "Project",
      type: "entity_ref",
      relation: { targetDatabaseId: target.schema.id }
    });
    const relationField = bundle.schema.fields.find((item) => item.name === "Project");

    bundle = await databases.addField(source.schema.id, {
      name: "Project count",
      type: "rollup",
      rollup: { relationFieldId: ` ${relationField.id} ` }
    });
    let rollupField = bundle.schema.fields.find((item) => item.name === "Project count");
    assert.deepEqual(rollupField?.rollup, { relationFieldId: relationField.id, aggregation: "count" });

    bundle = await databases.updateField({
      databaseId: source.schema.id,
      fieldId: rollupField.id,
      rollup: { relationFieldId: relationField.id, targetFieldId: "amount", aggregation: "sum" }
    });
    rollupField = bundle.schema.fields.find((item) => item.id === rollupField.id);
    assert.deepEqual(rollupField?.rollup, { relationFieldId: relationField.id, targetFieldId: "amount", aggregation: "sum" });

    bundle = await databases.updateField({
      databaseId: source.schema.id,
      fieldId: rollupField.id,
      type: "text"
    });
    rollupField = bundle.schema.fields.find((item) => item.name === "Project count");
    assert.equal(rollupField?.type, "text");
    assert.equal(rollupField?.rollup, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database rollup fields compute from structured relation refs", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-rollup-compute-"));
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Rollup Compute Space");
    await workspace.createAt(workspaceRoot, { name: "Rollup Compute Space" });
    await workspace.open(workspaceRoot);

    const databases = new DatabaseService(workspace);
    const target = await databases.create({
      name: "Projects",
      template: {
        fields: [{ id: "amount", name: "Amount", type: "number" }],
        rows: [
          { id: "row_a", title: "Alpha", amount: 10 },
          { id: "row_b", title: "Beta", amount: 20 }
        ]
      }
    });
    const refs = JSON.stringify([
      { entityId: "row_a", kind: "row", databaseId: target.schema.id, rowId: "row_a", titleSnapshot: "Alpha" },
      { entityId: "row_b", kind: "row", databaseId: target.schema.id, rowId: "row_b", titleSnapshot: "Beta" }
    ]);
    const source = await databases.create({
      name: "Tasks",
      template: {
        fields: [
          { id: "project", name: "Project", type: "entity_ref", relation: { targetDatabaseId: target.schema.id } },
          { id: "total", name: "Total", type: "rollup", rollup: { relationFieldId: "project", targetFieldId: "amount", aggregation: "sum" } },
          { id: "project_count", name: "Project count", type: "rollup", rollup: { relationFieldId: "project", aggregation: "count" } }
        ],
        rows: [{ id: "task_1", title: "Task", project: refs }]
      }
    });

    const loaded = await databases.get(source.schema.id);
    const row = loaded.records.find((record) => record.id === "task_1");
    assert.equal(row?.total, 30);
    assert.equal(row?.project_count, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entity backlinks use a persisted workspace graph cache and invalidate on edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-backlink-cache-"));
  let entities;
  let reloadedEntities;
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Backlink Cache Space");
    await workspace.createAt(workspaceRoot, { name: "Backlink Cache Space" });
    await workspace.open(workspaceRoot);

    const pages = new PageService(workspace);
    const databases = new DatabaseService(workspace);
    await databases.get(PAGES_DATABASE_ID);
    await databases.get(ENTITIES_DATABASE_ID);

    const target = await pages.create({ title: "Cached Target" });
    const source = await pages.create({ title: "Cached Source" });
    const targetBodyPath = pageBodyPath(target.meta.id, target.meta.title);
    await pages.update(source.meta.id, {
      markdown: `# Cached Source\n\nSee [Cached Target](${targetBodyPath}).\n`
    });

    entities = new EntitiesDatabaseService(workspace);
    const first = await entities.backlinks(target.meta.id);
    assert.equal(first.filter((backlink) =>
      backlink.type === "markdown" &&
      backlink.source.entityId === source.meta.id
    ).length, 1);
    const firstStats = entities.backlinkCacheStats();
    assert.ok(firstStats);
    assert.equal(firstStats.markdownLinkCount, 1);

    const cacheRaw = await readFile(join(workspaceRoot, ".lotion-cache", "backlinks.json"), "utf8");
    const cacheJson = JSON.parse(cacheRaw);
    assert.equal(cacheJson.version, 3);
    assert.equal(cacheJson.fingerprint, firstStats.fingerprint);
    assert.ok(Object.keys(cacheJson.sourceContributions).some((key) => key.startsWith("markdown:")));
    assert.ok(Object.values(cacheJson.sourceContributions).every((contribution) => contribution.signature));

    const second = await entities.backlinks(target.meta.id);
    assert.equal(second.length, first.length);
    assert.equal(second[0].source.entityId, first[0].source.entityId);
    assert.equal(second[0].sourceBodyPath, first[0].sourceBodyPath);
    assert.equal(entities.backlinkCacheStats()?.fingerprint, firstStats.fingerprint);

    reloadedEntities = new EntitiesDatabaseService(workspace);
    const diskBacklinks = await reloadedEntities.backlinks(target.meta.id);
    assert.equal(diskBacklinks.length, first.length);
    assert.equal(diskBacklinks[0].source.entityId, first[0].source.entityId);
    assert.equal(diskBacklinks[0].sourceBodyPath, first[0].sourceBodyPath);
    assert.equal(reloadedEntities.backlinkCacheStats()?.fingerprint, firstStats.fingerprint);

    await pages.rename(target.meta.id, "Temporary Target Name");
    const backlinksDuringRename = reloadedEntities.backlinks(target.meta.id);
    await pages.rename(target.meta.id, target.meta.title);
    await backlinksDuringRename;
    const afterRapidRenameRoundTrip = await reloadedEntities.backlinks(target.meta.id);
    assert.equal(afterRapidRenameRoundTrip.some((backlink) =>
      backlink.type === "markdown" &&
      backlink.source.entityId === source.meta.id
    ), true, "rapid target path rename round-trip must re-resolve unchanged backlink sources");

    await pages.update(source.meta.id, {
      markdown: "# Cached Source\n\nThe target link was removed.\n"
    });
    const afterMarkdownEdit = await reloadedEntities.backlinks(target.meta.id);
    assert.equal(afterMarkdownEdit.some((backlink) =>
      backlink.type === "markdown" &&
      backlink.source.entityId === source.meta.id
    ), false);
    assert.notEqual(reloadedEntities.backlinkCacheStats()?.fingerprint, firstStats.fingerprint);

    const relationValue = JSON.stringify([{
      entityId: target.meta.id,
      kind: "page",
      titleSnapshot: target.meta.title,
      pathSnapshot: ["Backlink Cache", target.meta.title]
    }]);
    const related = await databases.create({
      name: "Relation Sources",
      template: {
        fields: [{ id: "related", name: "Related", type: "entity_ref" }],
        rows: [{ title: "Relation Row", related: "" }]
      }
    });
    const rowId = String(related.records[0].id);
    await databases.updateCell({
      databaseId: related.schema.id,
      rowId,
      fieldId: "related",
      value: relationValue
    });
    const afterRelationEdit = await reloadedEntities.backlinks(target.meta.id);
    assert.equal(afterRelationEdit.some((backlink) =>
      backlink.type === "property" &&
      backlink.source.entityId === rowId &&
      backlink.databaseName === "Relation Sources" &&
      backlink.fieldName === "Related" &&
      backlink.excerpt === target.meta.title
    ), true);
  } finally {
    entities?.dispose();
    reloadedEntities?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("entity backlinks incrementally refresh external Markdown edits and rebuild a corrupt derived cache safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-backlink-external-"));
  let entities;
  let restartedEntities;
  let originalReadText;
  try {
    const config = new AppConfigService(join(root, "config.json"));
    const workspace = new WorkspaceService(config);
    const workspaceRoot = join(root, "Backlink External Space");
    await workspace.createAt(workspaceRoot, { name: "Backlink External Space" });
    await workspace.open(workspaceRoot);
    const pages = new PageService(workspace);
    const databases = new DatabaseService(workspace);
    await databases.get(PAGES_DATABASE_ID);
    await databases.get(ENTITIES_DATABASE_ID);

    const target = await pages.create({ title: "External Target" });
    const source = await pages.create({ title: "External Source" });
    const targetBodyPath = pageBodyPath(target.meta.id, target.meta.title);
    const sourceBodyPath = pageBodyPath(source.meta.id, source.meta.title);
    const sourceAbsolutePath = join(workspaceRoot, sourceBodyPath);
    const pagesCsvAbsolutePath = workspace.requirePaths().data(PAGES_DATABASE_ID);
    const linkedMarkdown = `# External Source\n\nSee [External Target](${targetBodyPath}).\n`;
    await pages.update(source.meta.id, { markdown: linkedMarkdown });

    entities = new EntitiesDatabaseService(workspace);
    assert.equal((await entities.backlinks(target.meta.id)).some((backlink) => backlink.source.entityId === source.meta.id), true);
    const markdownRefreshReads = [];
    originalReadText = fileService.readText.bind(fileService);
    fileService.readText = async (path) => {
      if (String(path).endsWith(".md")) markdownRefreshReads.push(String(path));
      return originalReadText(path);
    };

    const awaitBacklinkUpdate = () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for external backlink refresh"));
      }, 3_000);
      const unsubscribe = entities.subscribeBacklinkUpdates(() => {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      });
    });

    let updated = awaitBacklinkUpdate();
    const unlinkedMarkdown = "# External Source\n\nThe external link was removed.\n";
    await writeFile(sourceAbsolutePath, unlinkedMarkdown, "utf8");
    await updated;
    assert.equal((await entities.backlinks(target.meta.id)).some((backlink) => backlink.source.entityId === source.meta.id), false);
    assert.deepEqual([...new Set(markdownRefreshReads)], [sourceAbsolutePath], "external refresh should parse only the changed Markdown source");

    updated = awaitBacklinkUpdate();
    await writeFile(sourceAbsolutePath, linkedMarkdown, "utf8");
    await updated;
    assert.equal((await entities.backlinks(target.meta.id)).some((backlink) => backlink.source.entityId === source.meta.id), true);

    const userBytesBeforeRecovery = await readFile(sourceAbsolutePath);
    const pagesCsvBytesBeforeRecovery = await readFile(pagesCsvAbsolutePath);
    entities.dispose();
    entities = undefined;
    await writeFile(join(workspaceRoot, ".lotion-cache", "backlinks.json"), "{corrupt derived cache", "utf8");
    restartedEntities = new EntitiesDatabaseService(workspace);
    assert.equal((await restartedEntities.backlinks(target.meta.id)).some((backlink) => backlink.source.entityId === source.meta.id), true);
    assert.deepEqual(await readFile(sourceAbsolutePath), userBytesBeforeRecovery, "derived-cache recovery must not modify Markdown source bytes");
    assert.deepEqual(await readFile(pagesCsvAbsolutePath), pagesCsvBytesBeforeRecovery, "derived-cache recovery must not modify CSV source bytes");
  } finally {
    if (originalReadText) fileService.readText = originalReadText;
    entities?.dispose();
    restartedEntities?.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("search service ranks title, content, database, and reference hits from a workspace index", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-"));
  try {
    const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
    const entitiesFolder = databaseFolderName(ENTITIES_DATABASE_ID, "entities");
    const dealsFolder = databaseFolderName("db_deals", "Deals");
    const pagesDir = join(root, "databases", "system", pagesFolder);
    const entitiesDir = join(root, "databases", "system", entitiesFolder);
    const dealsDir = join(root, "databases", "user", dealsFolder);
    await mkdir(join(pagesDir, "pages"), { recursive: true });
    await mkdir(entitiesDir, { recursive: true });
    await mkdir(join(dealsDir, "pages"), { recursive: true });

    const relatedBodyPath = `databases/system/${pagesFolder}/pages/Related_Page--pg_related.md`;
    const rowBodyPath = `databases/user/${dealsFolder}/pages/Alpha_Target--row_alpha.md`;
    await writeFile(join(root, relatedBodyPath), "# Related Page\n\nReference destination content.", "utf8");
    await writeFile(
      join(root, rowBodyPath),
      `# Alpha Target\n\nNeedle body content with anchor link to [Related Page](${relatedBodyPath}).`,
      "utf8"
    );
    await writeFile(
      join(pagesDir, "data.csv"),
      [
        "id,title,body_path,icon,path",
        `pg_related,Related Page,${relatedBodyPath},emoji:🔗,"[""Knowledge"",""Related Page""]"`,
        ""
      ].join("\n"),
      "utf8"
    );
    await writeJsonFile(join(dealsDir, "schema.json"), {
      id: "db_deals",
      name: "Deals",
      icon: "emoji:💼",
      fields: [
        { id: "id", name: "ID", type: "id" },
        { id: "title", name: "Name", type: "title" },
        { id: "page_file", name: "Page file", type: "text" },
        { id: "row_icon", name: "Icon", type: "text" },
        { id: "notes", name: "Notes", type: "text" },
        { id: "relation", name: "Relation", type: "entity_ref" }
      ]
    });
    const relationCell = JSON.stringify([{ entityId: "pg_related", kind: "page" }]).replace(/"/g, '""');
    await writeFile(
      join(dealsDir, "data.csv"),
      [
        "id,title,page_file,row_icon,notes,relation",
        `row_alpha,Alpha Target,Alpha_Target--row_alpha.md,emoji:🎯,Needle field token,"${relationCell}"`,
        "row_beta,Beta Field,,emoji:🧪,loose searchable text,",
        ""
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(entitiesDir, "data.csv"),
      [
        "id,kind,title,icon,path,parent_id,database_id,row_id,body_path,source_notion_hash",
        `pg_related,page,Related Page,emoji:🔗,"[""Knowledge"",""Related Page""]",,,,${relatedBodyPath},`,
        `db_deals,database,Deals,emoji:💼,"[""Sales"",""Deals""]",,db_deals,,,`,
        `row_alpha,row,Alpha Target,emoji:🎯,"[""Sales"",""Deals"",""Alpha Target""]",db_deals,db_deals,row_alpha,${rowBodyPath},`,
        ""
      ].join("\n"),
      "utf8"
    );

    const search = new SearchService({ requirePaths: () => ({ root }) });
    assert.deepEqual(await search.query("   "), { hits: [], truncated: false });

    const titleResults = await search.query("Alpha Target");
    assert.equal(titleResults.truncated, false);
    assert.equal(titleResults.hits[0].title, "Alpha Target");
    assert.equal(titleResults.hits[0].matchTypes.includes("title"), true);
    assert.equal(titleResults.hits.some((hit) => hit.title === "Related Page" && hit.matchTypes.includes("reference")), true);

    const fieldResults = await search.query("Needle field token");
    assert.equal(fieldResults.hits.some((hit) => hit.title === "Alpha Target" && hit.matchTypes.includes("content")), true);

    const databaseResults = await search.query("Deals");
    assert.equal(databaseResults.hits.some((hit) => hit.kind === "database" && hit.databaseName === "Deals"), true);

    const pageResults = await search.query("Reference destination");
    assert.equal(pageResults.hits.some((hit) => hit.title === "Related Page"), true);

    const looseResults = await search.query("loose searchable");
    assert.equal(looseResults.hits.some((hit) => hit.title === "Beta Field"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advanced search plugin builds a small local index with incremental vectors and errors", async () => {
  assert.deepEqual(chunkAdvancedSearchText("alpha beta gamma", 100, 10), ["alpha beta gamma"]);
  const longChunks = chunkAdvancedSearchText("alpha ".repeat(260), 180, 30);
  assert.equal(longChunks.length > 1, true);
  assert.equal(longChunks.every((chunk) => chunk.length <= 190), true);

  const storage = new MemoryPluginStorage();
  const workspace = createAdvancedSearchWorkspaceFixture();
  const provider = new CountingEmbeddingProvider();
  const service = new AdvancedSearchPluginService(
    { workspace, storage },
    { embeddingProvider: provider, now: () => new Date("2026-06-01T00:00:00.000Z") }
  );

  assert.equal((await service.status()).status, "not_built");
  const collected = await service.debugCollectChunks();
  assert.equal(collected.documents.some((document) => document.kind === "database" && document.title === "Research DB"), true);
  assert.equal(collected.documents.some((document) => document.kind === "rowPage" && document.title === "Customer Feedback"), true);
  assert.equal(collected.chunks.length >= 5, true);

  const first = await service.rebuild({ config: { provider: "local", model: "local-hash-v1", vectorStore: "json" } });
  assert.equal(first.status.status, "ready");
  assert.equal(first.status.provider.provider, "local");
  assert.equal(first.status.provider.vectorStore, "json");
  assert.equal(first.status.documentCount, 5);
  assert.equal(provider.batchSizes.length, 1);
  assert.equal(provider.batchSizes[0], first.status.chunkCount);
  assert.equal((await storage.readJson("advanced-search-index.json")).chunks.length, first.status.chunkCount);

  const result = await service.query("retention complaints");
  assert.equal(result.hits[0].title, "Customer Feedback");
  assert.equal(result.hits[0].kind, "rowPage");
  assert.match(result.hits[0].snippet, /retention|complaints/i);
  assert.equal(result.hits[0].lexicalScore > 0, true);
  assert.equal(result.hits[0].semanticScore >= 0, true);

  await service.rebuild({ config: { provider: "local", model: "local-hash-v1", vectorStore: "json" } });
  assert.equal(provider.batchSizes.length, 2, "unchanged rebuild should reuse vectors; query embedding is the second call");
  workspace.pages.pg_notes.markdown += "\n\nNew semantic note about vector fixtures.";
  const callsBeforeChangedRebuild = provider.batchSizes.length;
  await service.rebuild({ config: { provider: "local", model: "local-hash-v1", vectorStore: "json" } });
  assert.equal(provider.batchSizes.length, callsBeforeChangedRebuild + 1);
  assert.equal(provider.batchSizes.at(-1) > 0, true);
  assert.equal(provider.batchSizes.at(-1) < first.status.chunkCount, true);

  await service.markStale("Manual fixture change.");
  const stale = await service.status();
  assert.equal(stale.status, "stale");
  assert.equal(stale.staleReason, "Manual fixture change.");

  const failing = new AdvancedSearchPluginService(
    { workspace, storage: new MemoryPluginStorage() },
    {
      embeddingProvider: {
        embed: async () => {
          throw new AdvancedSearchProviderError("mock rate limit", "rate_limited");
        }
      }
    }
  );
  await assert.rejects(
    () => failing.rebuild({ config: { provider: "local", model: "local-hash-v1", vectorStore: "json" } }),
    /mock rate limit/
  );
  const failedStatus = await failing.status();
  assert.equal(failedStatus.status, "error");
  assert.equal(failedStatus.error, "mock rate limit");

  const externalStatus = await service.configure({
    provider: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-embedding"
  });
  assert.equal(externalStatus.provider.provider, "openai-compatible");
  assert.equal(externalStatus.provider.available, false);
  assert.match(externalStatus.provider.message, /compatible \/embeddings provider/);
});

test("advanced search rebuild reports progress and avoids unnecessary row-page opens", async () => {
  const now = "2026-06-16T00:00:00.000Z";
  const storage = new MemoryPluginStorage();
  const provider = new CountingEmbeddingProvider();
  const rowPageCalls = [];
  const progress = [];
  const page = {
    meta: {
      id: "pg_vision",
      title: "Vision Check",
      created_time: now,
      updated_time: now,
      path: ["Health", "Vision Check"]
    },
    markdown: "# Vision Check\n\nSmall eye exam note."
  };
  const schema = {
    id: "db_large",
    name: "Large DB",
    path: ["Lab", "Large DB"],
    created_time: now,
    updated_time: now,
    defaultViewId: "default",
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  };
  const records = [
    { id: "row_props", title: "Property Only", notes: "vision check property only" },
    { id: "row_body", title: "Existing Body", page_file: "Existing_Body--row_body.md", notes: "has body" }
  ];
  const workspace = {
    async listPages() {
      return [page.meta];
    },
    async getPage(id) {
      assert.equal(id, "pg_vision");
      return page;
    },
    async listDatabases() {
      return [
        { id: PAGES_DATABASE_ID, name: "pages", path: ["System", "pages"] },
        { id: "db_large", name: "Large DB", path: ["Lab", "Large DB"] }
      ];
    },
    async getDatabase(id) {
      assert.notEqual(id, PAGES_DATABASE_ID, "system pages registry must not be indexed as a normal database");
      assert.equal(id, "db_large");
      return { schema, records, views: [] };
    },
    async getRowPage(databaseId, rowId) {
      rowPageCalls.push(`${databaseId}:${rowId}`);
      assert.equal(databaseId, "db_large");
      assert.equal(rowId, "row_body");
      return {
        meta: {
          id: "row_body",
          title: "Existing Body",
          created_time: now,
          updated_time: now,
          path: ["Lab", "Large DB", "Existing Body"]
        },
        markdown: "# Existing Body\n\nStored row-page body text."
      };
    }
  };
  const service = new AdvancedSearchPluginService(
    { workspace, storage },
    { embeddingProvider: provider, now: () => new Date(now) }
  );

  const result = await service.rebuild({
    config: { provider: "local", model: "local-hash-v1", vectorStore: "json" },
    onProgress: (event) => progress.push(event)
  });
  const index = await storage.readJson("advanced-search-index.json");

  assert.equal(result.status.status, "ready");
  assert.equal(result.status.documentCount, 4);
  assert.deepEqual(rowPageCalls, ["db_large:row_body"]);
  assert.equal(index.documents.some((document) => document.id === "database:pages"), false);
  assert.equal(index.documents.some((document) => document.id === "rowPage:pages:pg_vision"), false);
  assert.equal(index.documents.some((document) => document.id === "rowPage:db_large:row_props"), true);
  assert.equal(progress.some((event) => event.phase === "collecting" && event.current > 0 && event.total >= 4), true);
  assert.equal(progress.some((event) => event.phase === "embedding" && event.current === result.status.chunkCount), true);
});

test("advanced search Ollama provider uses /api/embed and reports setup errors", async () => {
  const requests = [];
  const provider = new OllamaEmbeddingProvider(async (url, init) => {
    requests.push({ url, body: init.body });
    return new Response(JSON.stringify({ embeddings: [[3, 4], [0, 5]] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });

  const vectors = await provider.embed(["alpha", "beta"], {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434/",
    model: DEFAULT_OLLAMA_EMBEDDING_MODEL
  });
  assert.equal(requests[0].url, "http://127.0.0.1:11434/api/embed");
  assert.deepEqual(JSON.parse(requests[0].body), { model: DEFAULT_OLLAMA_EMBEDDING_MODEL, input: ["alpha", "beta"] });
  assert.deepEqual(vectors[0].map((value) => Math.round(value * 10) / 10), [0.6, 0.8]);
  assert.deepEqual(vectors[1], [0, 1]);

  const unreachable = new OllamaEmbeddingProvider(async () => {
    throw new Error("ECONNREFUSED");
  });
  await assert.rejects(
    () => unreachable.embed(["alpha"], { provider: "ollama", baseUrl: "http://127.0.0.1:9", model: DEFAULT_OLLAMA_EMBEDDING_MODEL }),
    /Ollama is not reachable.*ollama pull qwen3-embedding:0\.6b/
  );

  const missingModel = new OllamaEmbeddingProvider(async () => new Response("model not found", { status: 404 }));
  await assert.rejects(
    () => missingModel.embed(["alpha"], { provider: "ollama", model: DEFAULT_OLLAMA_EMBEDDING_MODEL }),
    /model "qwen3-embedding:0\.6b" is missing.*ollama pull/
  );

  const malformed = new OllamaEmbeddingProvider(async () => new Response(JSON.stringify({ embeddings: [[1, 0]] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  }));
  await assert.rejects(
    () => malformed.embed(["alpha", "beta"], { provider: "ollama", model: DEFAULT_OLLAMA_EMBEDDING_MODEL }),
    /unexpected embedding response/
  );
});

test("advanced search vector adapters support JSON fallback and LanceDB search", async () => {
  const chunks = [
    makeAdvancedSearchChunk("chunk_customer", "Customer Feedback", "retention complaints", [1, 0, 0]),
    makeAdvancedSearchChunk("chunk_ops", "Ops Logs", "deployment checklist", [0, 1, 0])
  ];

  const jsonAdapter = new JsonVectorIndexAdapter();
  await jsonAdapter.writeChunks(chunks);
  assert.equal((await jsonAdapter.stats()).chunkCount, 2);
  assert.equal((await jsonAdapter.searchByVector([1, 0, 0], 1))[0].chunkId, "chunk_customer");

  const root = await mkdtemp(join(tmpdir(), "lotion-lancedb-adapter-"));
  try {
    const lanceAdapter = new LanceDbVectorIndexAdapter({ directory: root });
    await lanceAdapter.writeChunks(chunks);
    assert.equal((await lanceAdapter.stats()).chunkCount, 2);
    const hits = await lanceAdapter.searchByVector([1, 0, 0], 2);
    assert.equal(hits[0].chunkId, "chunk_customer");
    assert.equal(hits[0].title, "Customer Feedback");
    assert.equal(hits[0].rowId, "row_customer");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advanced search stays plugin-owned and does not attach embedding cost to Notion import", async () => {
  const storage = new MemoryPluginStorage();
  const workspace = createAdvancedSearchWorkspaceFixture();
  const provider = new CountingEmbeddingProvider();
  const service = new AdvancedSearchPluginService(
    { workspace, storage },
    { embeddingProvider: provider, now: () => new Date("2026-06-01T00:00:00.000Z") }
  );

  assert.equal((await service.status()).status, "not_built");
  assert.deepEqual(provider.batchSizes, [], "status must not call embeddings");

  const collected = await service.debugCollectChunks();
  assert.equal(collected.documents.length, 5, "advanced search tests should use a small deterministic fixture");
  assert.equal(collected.documents.some((document) => document.kind === "page"), true);
  assert.equal(collected.documents.some((document) => document.kind === "database"), true);
  assert.equal(collected.documents.some((document) => document.kind === "rowPage"), true);
  assert.deepEqual(provider.batchSizes, [], "chunk collection must not call embeddings");

  const beforeBuild = await service.query("retention complaints");
  assert.deepEqual(beforeBuild.hits, []);
  assert.equal(beforeBuild.status.status, "not_built");
  assert.deepEqual(provider.batchSizes, [], "querying before an explicit rebuild must not spend embeddings");

  const importSources = [
    "src/main/services/notion-import-service.ts",
    "src/main/services/notion-html-converter.ts",
    "src/builtin-plugins/notion-import/index.tsx",
    "src/builtin-plugins/notion-import/NotionImportDialog.tsx",
    "src/builtin-plugins/notion-import/NotionAuditPanel.tsx",
    "scripts/import-notion.mjs",
    "scripts/regress-notion-import.mjs",
    "scripts/audit-notion-import.mjs"
  ];
  for (const source of importSources) {
    const text = await readFile(join(process.cwd(), source), "utf8");
    assert.doesNotMatch(text, /advanced-search|AdvancedSearch/i, `${source} must not depend on Advanced Search`);
  }

  const smoke = await readFile(join(process.cwd(), "scripts/smoke-advanced-search-ui.mjs"), "utf8");
  assert.match(smoke, /createAdvancedSearchFixture/, "advanced search smoke should own its small fixture");
  assert.match(smoke, /db_advanced_search/, "advanced search smoke should use the small deterministic database fixture");
  assert.doesNotMatch(smoke, /notion-import|Import Notion|regress:notion/i, "advanced search smoke must not use the Notion import dataset");
});

test("AI Q&A agent builds source-grounded citations from local advanced search retrieval", async () => {
  const storage = new MemoryPluginStorage();
  const workspace = createAdvancedSearchWorkspaceFixture();
  const provider = new CountingEmbeddingProvider();
  const service = new AdvancedSearchPluginService(
    { workspace, storage },
    { embeddingProvider: provider, now: () => new Date("2026-06-01T00:00:00.000Z") }
  );

  const beforeBuild = await service.queryTransient("retention complaints", {
    limit: 3,
    config: { provider: "local", model: "local-hash-v1", vectorStore: "json" }
  });
  assert.equal(beforeBuild.status.status, "ready");
  assert.equal(beforeBuild.status.provider.provider, "local");
  assert.match(beforeBuild.status.provider.message, /Transient local Q&A retrieval/);
  assert.equal(beforeBuild.hits[0].title, "Customer Feedback");
  assert.equal(beforeBuild.hits[0].kind, "rowPage");
  assert.equal(await storage.readJson("advanced-search-index.json"), null, "transient Q&A retrieval must not write a persistent index");
  assert.equal(provider.batchSizes.length, 1);

  const pageResult = await service.queryTransient("Perplexity migration", {
    limit: 3,
    config: { provider: "local", model: "local-hash-v1", vectorStore: "json" }
  });
  assert.equal(pageResult.hits.some((hit) => hit.kind === "page" && hit.title === "Research Notes"), true);

  const databaseResult = await service.queryTransient("Research DB Name Notes schema", {
    limit: 3,
    config: { provider: "local", model: "local-hash-v1", vectorStore: "json" }
  });
  assert.equal(databaseResult.hits.some((hit) => hit.kind === "database" && hit.title === "Research DB"), true);

  const citation = normalizeAdvancedSearchCitation(beforeBuild.hits[0], 0);
  assert.equal(citation.id, "S1");
  assert.equal(citation.title, "Customer Feedback");
  assert.equal(citation.entityPath, "Lab / Research DB / Customer Feedback");
  assert.deepEqual(citationToEntityRef(citation), {
    kind: "row",
    entityId: "row_customer",
    databaseId: "db_research",
    rowId: "row_customer",
    titleSnapshot: "Customer Feedback",
    pathSnapshot: ["Lab", "Research DB", "Customer Feedback"]
  });

  const qa = await buildWorkspaceQAContext(
    { workspace, storage: new MemoryPluginStorage() },
    "What are the retention complaints?",
    { limit: 3 }
  );
  assert.equal(qa.status, "ready");
  assert.equal(qa.citations[0].title, "Customer Feedback");
  assert.match(qa.system, /Local workspace Q&A mode/);
  assert.match(qa.system, /\[S1\] Row page: Customer Feedback/);
  assert.match(qa.system, /Page history citations are not available/);
});

test("GitHub backup service maps paths, stores history, previews restore, and records failures", async () => {
  const storage = new MemoryPluginStorage();
  const workspace = createGitHubBackupWorkspaceFixture();
  const settings = normalizeGitHubBackupSettings({
    provider: "local_mock",
    basePath: "lotion integration tests/../unsafe:path",
    branch: "main"
  });
  const adapter = new StorageGitHubBackupAdapter(storage);
  const service = new GitHubBackupService(workspace, storage, adapter);

  assert.equal(joinGitHubPath("lotion integration tests", "../unsafe:path", "page?.md"), "lotion_integration_tests/unsafe_path/page_.md");
  assert.match(pageBackupPath(settings, workspace.pages.pg_history.meta), /^lotion_integration_tests\/unsafe_path\/pages\/Project_History--pg_history\.md$/);

  const first = await service.backupWorkspace(settings, "Initial backup");
  assert.equal(first.status.state, "backed_up");
  assert.equal(first.commitCreated, true);
  assert.equal(first.changedPaths.some((path) => path.endsWith("Project_History--pg_history.md")), true);
  assert.equal(first.changedPaths.some((path) => path.includes("databases/Roadmap--db_plan/database.json")), true);
  assert.equal(first.changedPaths.some((path) => path.includes("row-pages/Launch_Task--row_launch.md")), true);

  const idempotent = await service.backupWorkspace(settings, "No-op backup");
  assert.equal(idempotent.commitCreated, false);
  assert.deepEqual(idempotent.changedPaths, []);
  assert.equal(idempotent.status.message, "No changes to backup.");

  workspace.pages.pg_history.markdown = "# Project History\n\nSecond draft with a safer restore point.";
  const second = await service.backupWorkspace(settings, "Second backup");
  assert.equal(second.commitCreated, true);
  assert.equal(second.changedPaths.length > 0, true);

  const history = await service.listPageHistory(settings, "pg_history");
  assert.equal(history.length, 2);
  assert.equal(history[0].message, "Second backup");
  assert.equal(history[1].message, "Initial backup");

  const preview = await service.previewPageVersion(settings, "pg_history", history[1].sha);
  assert.match(preview.selectedMarkdown, /Original body/);
  assert.equal(preview.diff.some((line) => line.type === "removed" && line.text.includes("Second draft")), true);
  assert.equal(diffLines("a\nb", "a\nc").map((line) => line.type).join(","), "same,removed,added");

  await service.restorePageVersion(settings, "pg_history", history[1].sha);
  assert.match(workspace.pages.pg_history.markdown, /Original body/);

  const conflictService = new GitHubBackupService(workspace, new MemoryPluginStorage(), {
    name: "conflict",
    isConfigured: () => true,
    commitFiles: async () => {
      throw new GitHubBackupConflictError("conflict from mock GitHub");
    },
    listCommits: async () => [],
    readFileAtCommit: async () => null
  });
  const conflict = await conflictService.backupWorkspace(settings);
  assert.equal(conflict.status.state, "failed");
  assert.match(conflict.status.message, /conflict/);

  const rateLimitedService = new GitHubBackupService(workspace, new MemoryPluginStorage(), {
    name: "rate-limit",
    isConfigured: () => true,
    commitFiles: async () => {
      throw new GitHubBackupRateLimitError("rate limited by mock GitHub");
    },
    listCommits: async () => [],
    readFileAtCommit: async () => null
  });
  const rateLimited = await rateLimitedService.backupWorkspace(settings);
  assert.equal(rateLimited.status.state, "failed");
  assert.match(rateLimited.status.message, /rate limited/);
});

test("GitHub REST backup adapter uses GitHub content APIs and reports typed failures", async () => {
  const adapter = new GitHubRestBackupAdapter();
  const settings = normalizeGitHubBackupSettings({
    provider: "github_api",
    repository: "owner/repo",
    branch: "main",
    basePath: "lotion-tests",
    token: "test-token"
  });
  assert.equal(adapter.isConfigured(settings), true);
  assert.equal(adapter.isConfigured({ ...settings, token: "" }), false);

  const calls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init = {}) => {
      const urlText = String(url);
      const method = init.method ?? "GET";
      calls.push({
        url: urlText,
        method,
        body: init.body ? JSON.parse(String(init.body)) : null
      });
      if (urlText.includes("/commits")) {
        return githubJsonResponse([
          {
            sha: "history-sha",
            commit: {
              message: "History backup",
              author: { date: "2026-06-01T00:00:00.000Z" }
            }
          }
        ]);
      }
      if (method === "PUT") {
        return githubJsonResponse({ commit: { sha: "new-sha" } });
      }
      if (urlText.includes("changed.md")) {
        return githubJsonResponse({ sha: "old-sha", content: Buffer.from("old body").toString("base64") });
      }
      if (urlText.includes("same.md")) {
        return githubJsonResponse({ sha: "same-sha", content: Buffer.from("same body").toString("base64") });
      }
      if (urlText.includes("version.md") && urlText.includes("ref=version-sha")) {
        return githubJsonResponse({ content: Buffer.from("version body").toString("base64") });
      }
      if (urlText.includes("missing.md")) {
        return new Response("", { status: 404 });
      }
      return githubJsonResponse({ content: Buffer.from("current body").toString("base64") });
    };

    const commit = await adapter.commitFiles(
      settings,
      [
        { path: "changed.md", content: "new body", kind: "page", title: "Changed" },
        { path: "same.md", content: "same body", kind: "page", title: "Same" }
      ],
      "Backup message"
    );
    assert.equal(commit.sha, "new-sha");
    assert.equal(commit.message, "Backup message");
    assert.deepEqual(commit.changedPaths, ["changed.md"]);
    assert.equal(commit.fileCount, 2);
    const putCall = calls.find((call) => call.method === "PUT");
    assert.equal(putCall.body.message, "Backup message");
    assert.equal(putCall.body.sha, "old-sha");
    assert.equal(Buffer.from(putCall.body.content, "base64").toString("utf8"), "new body");
    assert.equal(calls.filter((call) => call.method === "PUT").length, 1, "unchanged files should not be PUT");

    const history = await adapter.listCommits(settings, "changed.md");
    assert.deepEqual(history, [
      {
        sha: "history-sha",
        message: "History backup",
        createdAt: "2026-06-01T00:00:00.000Z",
        changedPaths: ["changed.md"],
        fileCount: 1
      }
    ]);
    assert.equal(await adapter.readFileAtCommit(settings, "version.md", "version-sha"), "version body");
    assert.equal(await adapter.readFileAtCommit(settings, "missing.md", "version-sha"), null);

    globalThis.fetch = async () => new Response("conflict", { status: 409 });
    await assert.rejects(
      () => adapter.commitFiles(settings, [{ path: "changed.md", content: "x", kind: "page", title: "Changed" }], "Conflict"),
      GitHubBackupConflictError
    );

    globalThis.fetch = async () => new Response("rate limit", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" }
    });
    await assert.rejects(
      () => adapter.listCommits(settings, "changed.md"),
      GitHubBackupRateLimitError
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function githubJsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
}

class MemoryPluginStorage {
  constructor() {
    this.jsonl = new Map();
    this.json = new Map();
  }

  async appendJsonl(fileName, value) {
    const rows = this.jsonl.get(fileName) ?? [];
    rows.push(value);
    this.jsonl.set(fileName, rows);
  }

  async readJsonl(fileName, options) {
    const rows = [...(this.jsonl.get(fileName) ?? [])];
    const limit = Number(options?.limit);
    return Number.isFinite(limit) && limit > 0 ? rows.slice(-Math.floor(limit)) : rows;
  }

  async readJson(fileName) {
    return this.json.get(fileName) ?? null;
  }

  async writeJson(fileName, value) {
    this.json.set(fileName, JSON.parse(JSON.stringify(value)));
  }

  async delete(fileName) {
    this.json.delete(fileName);
    this.jsonl.delete(fileName);
  }
}

class CountingEmbeddingProvider {
  constructor() {
    this.batchSizes = [];
  }

  async embed(texts) {
    this.batchSizes.push(texts.length);
    return texts.map(mockAdvancedSearchVector);
  }
}

function mockAdvancedSearchVector(text) {
  const lower = text.toLowerCase();
  const vector = [
    lower.includes("customer") || lower.includes("retention") || lower.includes("complaints") ? 1 : 0,
    lower.includes("perplexity") || lower.includes("migration") ? 1 : 0,
    lower.includes("vector") || lower.includes("semantic") ? 1 : 0
  ];
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

function makeAdvancedSearchChunk(chunkId, title, text, vector) {
  return {
    chunkId,
    text,
    textHash: chunkId,
    vector,
    id: `rowPage:db_research:${chunkId}`,
    kind: "rowPage",
    title,
    subtitle: "Page · Research DB",
    icon: "emoji:💬",
    entityPath: `Lab / Research DB / ${title}`,
    databaseId: "db_research",
    rowId: "row_customer",
    pageFile: `${title.replace(/\s+/g, "_")}--row_customer.md`
  };
}

function createAdvancedSearchWorkspaceFixture() {
  const now = "2026-01-01T00:00:00.000Z";
  const pages = {
    pg_notes: {
      meta: {
        id: "pg_notes",
        title: "Research Notes",
        created_time: now,
        updated_time: now,
        path: ["Lab", "Research Notes"]
      },
      markdown: "# Research Notes\n\nPerplexity migration notes and vector search planning."
    },
    pg_home: {
      meta: {
        id: "pg_home",
        title: "Home",
        created_time: now,
        updated_time: now,
        path: ["Home"]
      },
      markdown: "# Home\n\nWorkspace landing page."
    }
  };
  const schema = {
    id: "db_research",
    name: "Research DB",
    path: ["Lab", "Research DB"],
    created_time: now,
    updated_time: now,
    defaultViewId: "default",
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true },
      { id: "row_icon", name: "Icon", type: "text", system: true },
      { id: "notes", name: "Notes", type: "text" }
    ]
  };
  const records = [
    {
      id: "row_customer",
      title: "Customer Feedback",
      page_file: "Customer_Feedback--row_customer.md",
      row_icon: "emoji:💬",
      notes: "retention complaints customer interviews"
    },
    {
      id: "row_ops",
      title: "Ops Logs",
      page_file: "Ops_Logs--row_ops.md",
      row_icon: "emoji:🚦",
      notes: "deployment checklist"
    }
  ];
  const rowPages = new Map([
    ["db_research:row_customer", {
      meta: {
        id: "row_customer",
        title: "Customer Feedback",
        created_time: now,
        updated_time: now
      },
      markdown: "# Customer Feedback\n\nRetention complaints from customers and support notes."
    }],
    ["db_research:row_ops", {
      meta: {
        id: "row_ops",
        title: "Ops Logs",
        created_time: now,
        updated_time: now
      },
      markdown: "# Ops Logs\n\nRelease checklist and deployment risks."
    }]
  ]);
  return {
    pages,
    async listPages() {
      return Object.values(pages).map((page) => page.meta);
    },
    async getPage(id) {
      return pages[id];
    },
    async listDatabases() {
      return [{ id: "db_research", name: "Research DB", path: ["Lab", "Research DB"], icon: "emoji:🔎" }];
    },
    async getDatabase(id) {
      assert.equal(id, "db_research");
      return { schema, records, views: [] };
    },
    async getRowPage(databaseId, rowId) {
      return rowPages.get(`${databaseId}:${rowId}`);
    }
  };
}

function createGitHubBackupWorkspaceFixture() {
  const now = "2026-06-01T00:00:00.000Z";
  const pages = {
    pg_history: {
      meta: {
        id: "pg_history",
        title: "Project History",
        created_time: now,
        updated_time: now,
        path: ["Backups", "Project History"]
      },
      markdown: "# Project History\n\nOriginal body for GitHub restore."
    },
    pg_notes: {
      meta: {
        id: "pg_notes",
        title: "Release Notes",
        created_time: now,
        updated_time: now,
        path: ["Backups", "Release Notes"]
      },
      markdown: "# Release Notes\n\nBackup metadata smoke."
    }
  };
  const databaseSummary = {
    id: "db_plan",
    name: "Roadmap",
    path: ["Backups", "Roadmap"],
    icon: "emoji:🗺️"
  };
  const schema = {
    id: "db_plan",
    name: "Roadmap",
    created_time: now,
    updated_time: now,
    defaultViewId: "default",
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Name", type: "title" },
      { id: "notes", name: "Notes", type: "text" }
    ]
  };
  const records = [
    { id: "row_launch", title: "Launch Task", notes: "Ship backup history." },
    { id: "row_empty", title: "Empty Task", notes: "" }
  ];
  const rowPages = new Map([
    ["db_plan:row_launch", {
      meta: { id: "row_launch", title: "Launch Task", created_time: now, updated_time: now },
      markdown: "# Launch Task\n\nRow page backup payload."
    }],
    ["db_plan:row_empty", {
      meta: { id: "row_empty", title: "Empty Task", created_time: now, updated_time: now },
      markdown: ""
    }]
  ]);
  return {
    pages,
    async listPages() {
      return Object.values(pages).map((page) => page.meta);
    },
    async getPage(id) {
      const page = pages[id];
      if (!page) throw new Error(`Missing test page ${id}`);
      return page;
    },
    async updatePage(id, input) {
      const page = pages[id];
      if (!page) throw new Error(`Missing test page ${id}`);
      if (input.markdown !== undefined) page.markdown = input.markdown;
      page.meta.updated_time = "2026-06-01T00:01:00.000Z";
      return page.meta;
    },
    async listDatabases() {
      return [databaseSummary];
    },
    async getDatabase(id) {
      assert.equal(id, "db_plan");
      return { schema, records, views: [] };
    },
    async getRowPage(databaseId, rowId) {
      const rowPage = rowPages.get(`${databaseId}:${rowId}`);
      if (!rowPage) throw new Error(`Missing test row page ${databaseId}:${rowId}`);
      return rowPage;
    }
  };
}

test("OpenAI LLM plugin keeps settings independent and executes Lotion workspace tools", async () => {
  const settingsStore = new InMemoryPluginSettings();
  assert.deepEqual(readOpenAILLMSettings(settingsStore), {
    provider: "openai",
    providerLabel: "OpenAI",
    protocol: "responses",
    apiKey: "",
    model: DEFAULT_OPENAI_MODEL,
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    enabledTools: ALL_LOTION_TOOL_NAMES,
    maxToolIterations: 4
  });
  assert.equal(readSavedOpenAIAPIKey(settingsStore), "");
  assert.deepEqual(readOpenAILLMSettings(settingsStore, { openai: { apiKey: "sk-env", model: "gpt-env" } }), {
    provider: "openai",
    providerLabel: "OpenAI",
    protocol: "responses",
    apiKey: "sk-env",
    model: "gpt-env",
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    enabledTools: ALL_LOTION_TOOL_NAMES,
    maxToolIterations: 4
  });

  const deepseekDefaults = new InMemoryPluginSettings();
  assert.deepEqual(readOpenAILLMSettings(deepseekDefaults, { deepseek: { apiKey: "ds-env" } }), {
    provider: "deepseek",
    providerLabel: "DeepSeek",
    protocol: "chat_completions",
    apiKey: "ds-env",
    model: DEFAULT_DEEPSEEK_MODEL,
    baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    enabledTools: ALL_LOTION_TOOL_NAMES,
    maxToolIterations: 4
  });

  await writeOpenAILLMSettings(settingsStore, {
    provider: "openai",
    providerLabel: "OpenAI",
    protocol: "responses",
    apiKey: "sk-test",
    model: "gpt-test",
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    enabledTools: ["lotion_search", "lotion_create_page"],
    maxToolIterations: 2
  });
  assert.equal(readSavedOpenAIAPIKey(settingsStore), "sk-test");
  assert.deepEqual(readOpenAILLMSettings(settingsStore), {
    provider: "openai",
    providerLabel: "OpenAI",
    protocol: "responses",
    apiKey: "sk-test",
    model: "gpt-test",
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    enabledTools: ["lotion_search", "lotion_create_page"],
    maxToolIterations: 2
  });

  const createdPages = [];
  const workspace = {
    searchWorkspace: async (pattern) => ({
      truncated: false,
      hits: [{ kind: "page", pageId: "pg_existing", title: "Existing", preview: pattern }]
    }),
    listPages: async () => [{ id: "pg_existing", title: "Existing", created_time: "", updated_time: "" }],
    getPage: async (id) => ({
      meta: { id, title: "Existing", created_time: "", updated_time: "" },
      markdown: "Existing body"
    }),
    createPage: async (input) => {
      const page = { id: "pg_created", title: input.title, created_time: "", updated_time: "" };
      createdPages.push({ meta: page, markdown: "" });
      return page;
    },
    updatePage: async (id, input) => {
      const page = createdPages.find((item) => item.meta.id === id);
      if (!page) throw new Error(`missing page ${id}`);
      page.markdown = input.markdown ?? page.markdown;
      return page.meta;
    },
    deletePage: async () => undefined,
    movePage: async () => undefined,
    activePage: async () => ({
      meta: {
        id: "pg_active",
        title: "Active Page",
        created_time: "2026-06-01T00:00:00.000Z",
        updated_time: "2026-06-02T00:00:00.000Z",
        path: ["Workspace", "Active Page"]
      },
      markdown: "Current active page body"
    }),
    listDatabases: async () => [{ id: "db_tasks", name: "Tasks" }],
    getDatabase: async () => ({
      schema: {
        id: "db_tasks",
        name: "Tasks",
        fields: [
          { id: "id", name: "ID", type: "id" },
          { id: "title", name: "Name", type: "text" }
        ]
      },
      views: [{ id: "view_all", databaseId: "db_tasks", name: "All", type: "table", fieldOrder: ["title"], visibleFieldIds: ["title"] }],
      records: [{ id: "row_1", title: "Task 1" }]
    }),
    createDatabase: async (input) => ({
      schema: { id: "db_created", name: input.name, fields: [] },
      views: [],
      records: []
    }),
    deleteDatabase: async () => undefined,
    addField: async () => { throw new Error("unused"); },
    updateField: async () => { throw new Error("unused"); },
    deleteField: async () => { throw new Error("unused"); },
    addRow: async () => ({
      schema: { id: "db_tasks", name: "Tasks", fields: [] },
      views: [],
      records: [{ id: "row_new", title: "New row" }]
    }),
    updateCell: async (input) => ({
      schema: { id: input.databaseId, name: "Tasks", fields: [] },
      views: [],
      records: [{ id: input.rowId, title: input.value }]
    }),
    createView: async () => { throw new Error("unused"); },
    duplicateView: async () => { throw new Error("unused"); },
    updateView: async () => { throw new Error("unused"); },
    deleteView: async () => { throw new Error("unused"); },
    setDefaultView: async () => { throw new Error("unused"); },
    listAttachments: async () => [],
    getAttachment: async () => new Uint8Array(),
    addAttachment: async () => ({ sha: "sha", ext: "txt", url: "lotion-file://sha.txt" })
  };

  const readTools = createLotionTools(workspace, {
    enabledToolNames: ALL_LOTION_TOOL_NAMES.filter((name) => !["lotion_create_page", "lotion_update_page", "lotion_create_database", "lotion_add_row", "lotion_update_cell"].includes(name))
  });
  assert.equal(readTools.every((tool) => tool.readOnly), true);
  const activePageResult = await readTools
    .find((tool) => tool.name === "lotion_get_active_page")
    .execute({});
  assert.equal(activePageResult.meta.title, "Active Page");
  assert.equal(activePageResult.markdown, "Current active page body");
  assert.equal(LLM_TOOL_MODE_LABELS.ask_before_editing, "Ask before editing");
  assert.equal(enabledToolsForMode(ALL_LOTION_TOOL_NAMES, "read_only").includes("lotion_update_page"), false);
  assert.equal(enabledToolsForMode(ALL_LOTION_TOOL_NAMES, "ask_before_editing").includes("lotion_update_cell"), false);
  assert.equal(enabledToolsForMode(ALL_LOTION_TOOL_NAMES, "direct_create").includes("lotion_create_page"), true);
  assert.equal(enabledToolsForMode(ALL_LOTION_TOOL_NAMES, "direct_create").includes("lotion_create_database"), true);
  assert.equal(enabledToolsForMode(ALL_LOTION_TOOL_NAMES, "direct_create").includes("lotion_update_page"), false);

  const tools = createLotionTools(workspace, { enabledToolNames: ALL_LOTION_TOOL_NAMES });
  const executor = createLotionToolExecutor(tools);
  const requests = [];
  const fetchMock = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    if (requests.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          output: [
            {
              type: "function_call",
              call_id: "call_create",
              name: "lotion_create_page",
              arguments: JSON.stringify({ title: "AI Page", markdown: "Created by AI" })
            }
          ]
        })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: "Created AI Page." })
    };
  };

  const result = await completeWithOpenAIResponses(
    readOpenAILLMSettings(settingsStore),
    { prompt: "Create a page named AI Page." },
    tools.map(({ execute: _execute, readOnly: _readOnly, ...definition }) => definition),
    executor,
    { fetch: fetchMock }
  );

  assert.equal(result, "Created AI Page.");
  assert.equal(createdPages[0].meta.title, "AI Page");
  assert.equal(createdPages[0].markdown, "Created by AI");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].model, "gpt-test");
  assert.equal(requests[1].input.some((item) => item.type === "function_call_output" && item.call_id === "call_create"), true);

  const deepseekSettingsStore = new InMemoryPluginSettings();
  await writeOpenAILLMSettings(deepseekSettingsStore, {
    provider: "deepseek",
    providerLabel: "DeepSeek",
    protocol: "chat_completions",
    apiKey: "ds-test",
    model: "deepseek-v4",
    baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
    enabledTools: ALL_LOTION_TOOL_NAMES,
    maxToolIterations: 2
  });
  const chatRequests = [];
  const chatFetchMock = async (_url, init) => {
    const body = JSON.parse(init.body);
    chatRequests.push(body);
    if (chatRequests.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                id: "call_search",
                type: "function",
                function: {
                  name: "lotion_search",
                  arguments: JSON.stringify({ query: "Existing", limit: 5 })
                }
              }]
            }
          }]
        })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "Found Existing." } }]
      })
    };
  };

  const chatResult = await completeWithOpenAICompatibleChat(
    readOpenAILLMSettings(deepseekSettingsStore),
    { prompt: "Find Existing." },
    tools.map(({ execute: _execute, readOnly: _readOnly, ...definition }) => definition),
    executor,
    { fetch: chatFetchMock }
  );

  assert.equal(chatResult, "Found Existing.");
  assert.equal(chatRequests[0].model, "deepseek-v4");
  assert.equal(chatRequests[0].tools[0].function.name, "lotion_search");
  assert.equal(chatRequests[1].messages.some((message) => message.role === "tool" && message.tool_call_id === "call_search"), true);
});

test("LLM plugin registers through the plugin host and renders provider model settings", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const originalEvent = globalThis.Event;
  const originalHTMLInputElement = globalThis.HTMLInputElement;
  const originalHTMLTextAreaElement = globalThis.HTMLTextAreaElement;
  const originalWindow = globalThis.window;
  const document = new FakeDocument();
  globalThis.document = document;
  globalThis.Event = FakeEvent;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTextAreaElement = FakeTextAreaElement;
  globalThis.window = { getSelection: () => null };
  const fetchCalls = [];
  const notifications = [];
  const openedEntities = [];
  const createdDraftPages = [];
  const chatModals = [];
  const promptResponses = ["Summarize", "Generated Draft", "Write a launch note"];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    fetchCalls.push(body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ output_text: "Plugin response" })
    };
  };

  try {
    const host = new PluginHost({
      workspace: {
        name: "llm-workspace",
        searchWorkspace: async () => ({ truncated: false, hits: [] }),
        listPages: async () => [],
        getPage: async () => ({ meta: { id: "pg", title: "Page" }, markdown: "" }),
        activePage: async () => ({
          meta: {
            id: "pg_active",
            title: "Active Test",
            created_time: "2026-06-01T00:00:00.000Z",
            updated_time: "2026-06-02T00:00:00.000Z",
            path: ["Root", "Active Test"]
          },
          markdown: "Active page markdown"
        }),
        listDatabases: async () => [],
        getDatabase: async () => ({ schema: { id: "db", name: "DB", fields: [] }, views: [], records: [] }),
        createPage: async (input) => {
          const page = {
            id: `pg_draft_${createdDraftPages.length + 1}`,
            title: input.title,
            created_time: "2026-06-03T00:00:00.000Z",
            updated_time: "2026-06-03T00:00:00.000Z"
          };
          createdDraftPages.push({ meta: page, markdown: "" });
          return page;
        },
        updatePage: async (id, input) => {
          const page = createdDraftPages.find((item) => item.meta.id === id);
          if (!page) throw new Error(`missing draft page ${id}`);
          page.markdown = input.markdown ?? page.markdown;
          return page.meta;
        },
        listAttachments: async () => []
      },
      ui: {
        modal: async (options) => {
          const el = document.createElement("div");
          options.render(el, () => undefined);
          chatModals.push(el);
          return null;
        },
        prompt: async () => promptResponses.shift() ?? null,
        notify: (text, level) => notifications.push({ text, level }),
        openEntity: (ref) => openedEntities.push(ref)
      }
    });
    const settings = new InMemoryPluginSettings();
    const ctx = new PluginContextImpl(host, openAILLMManifest, settings);
    installOpenAILLM(ctx, {
      getEnvironmentDefaults: async () => ({ openai: { apiKey: "sk-env" }, deepseek: { apiKey: "ds-env" } })
    });

    assert.equal(host.inspect().plugins[0].id, "llm-openai");
    assert.equal(host.inspect().providers.some((provider) => provider.type === "openai.responses"), true);
    assert.equal(host.inspect().sidebarItems.some((item) => item.id === "llm-openai.chat"), true);
    assert.equal(host.inspect().commands.some((command) => command.id === "llm-openai.chat"), true);
    assert.equal(host.inspect().commands.some((command) => command.id === "llm-openai.ask"), true);
    assert.equal(host.inspect().commands.some((command) => command.id === "llm-openai.draft-page"), true);
    assert.equal(host.inspect().settingsTabs.some((tab) => tab.id === "llm-openai.settings"), true);
    assert.equal(await host.ai.complete({ prompt: "Hello" }), "Plugin response");
    assert.equal(fetchCalls[0].model, DEFAULT_OPENAI_MODEL);
    assert.equal(fetchCalls[0].instructions.includes("Current page id: pg_active"), false);

    await host.commands.run("llm-openai.ask");
    assert.equal(notifications[0].text, "Plugin response");
    assert.equal(notifications[0].level, "info");
    assert.equal(fetchCalls[1].input[0].content, "Summarize");
    assert.equal(fetchCalls[1].instructions.includes("Current page id: pg_active"), true);
    assert.equal(fetchCalls[1].instructions.includes("Current page title: Active Test"), true);
    assert.equal(fetchCalls[1].instructions.includes("lotion_get_active_page"), true);

    await host.commands.run("llm-openai.draft-page");
    assert.equal(createdDraftPages[0].meta.title, "Generated Draft");
    assert.equal(createdDraftPages[0].markdown, "Plugin response");
    assert.equal(openedEntities[0].kind, "page");
    assert.equal(openedEntities[0].entityId, "pg_draft_1");
    assert.equal(notifications[1].text, "Created page: Generated Draft");
    assert.equal(fetchCalls[2].input[0].content.includes("Draft a Markdown page titled \"Generated Draft\"."), true);
    assert.equal(fetchCalls[2].input[0].content.includes("Write a launch note"), true);
    assert.equal(fetchCalls[2].instructions.includes("Current page id: pg_active"), true);

    await host.commands.run("llm-openai.chat");
    const chatModal = chatModals[0];
    assert.ok(chatModal);
    const chatInput = chatModal.querySelector(".openai-llm-chat-input");
    const chatSend = chatModal.querySelector(".openai-llm-chat-send");
    const chatMode = chatModal.querySelector(".openai-llm-chat-mode");
    const chatContext = chatModal.querySelector(".openai-llm-chat-context-select");
    const chatPermission = chatModal.querySelector(".openai-llm-chat-permissions-state");
    await waitFor(() => chatMode.value === "ask_before_editing" && chatContext.value === "current_page");
    assert.equal(chatMode.value, "ask_before_editing");
    assert.equal(chatContext.value, "current_page");
    assert.equal(chatPermission.textContent, "Ask before editing");
    chatInput.value = "What is open?";
    await chatSend.click();
    await waitFor(() => chatModal.querySelectorAll(".openai-llm-chat-message-content").length === 2);
    const chatMessages = chatModal.querySelectorAll(".openai-llm-chat-message-content");
    assert.equal(chatMessages[0].textContent, "What is open?");
    assert.equal(chatMessages[1].textContent, "Plugin response");
    assert.equal(fetchCalls[3].input[0].content, "What is open?");
    assert.equal(fetchCalls[3].instructions.includes("Current page title: Active Test"), true);
    assert.equal(JSON.stringify(fetchCalls[3]).includes("lotion_update_page"), false);
    assert.equal(JSON.stringify(fetchCalls[3]).includes("lotion_create_page"), false);

    const originalGetSelection = window.getSelection;
    Object.defineProperty(window, "getSelection", {
      configurable: true,
      value: () => ({ toString: () => " \n " })
    });
    window.__lotionEditorSelectionText = "Cached selected passage";
    window.__lotionEditorSelectionUpdatedAt = Date.now();
    try {
      await host.commands.run("llm-openai.ask-selection");
      const selectionChatModal = chatModals[1];
      await waitFor(() => selectionChatModal.querySelector(".openai-llm-chat-input").value.length > 0);
      assert.equal(
        selectionChatModal.querySelector(".openai-llm-chat-input").value,
        "Help me work with this selected text:\n\nCached selected passage"
      );
      assert.equal(
        selectionChatModal.querySelector(".openai-llm-chat-status").textContent,
        "Selected text loaded. Edit the prompt or send it."
      );
    } finally {
      Object.defineProperty(window, "getSelection", {
        configurable: true,
        value: originalGetSelection
      });
    }

    const debugRequests = [];
    const originalDebugComplete = globalThis.__lotionLLMChatDebugComplete;
    globalThis.__lotionLLMChatDebugComplete = async (request) => {
      debugRequests.push(request);
      return `Debug answer for ${request.prompt}`;
    };
    try {
      const debugChatContainer = document.createElement("div");
      const debugChat = renderOpenAILLMChat(debugChatContainer, {
        settings: new InMemoryPluginSettings(),
        storage: host.storageFor("llm-openai-debug"),
        workspace: {
          activePage: async () => ({
            meta: {
              id: "pg_active",
              title: "Active Test",
              created_time: "2026-06-03T00:00:00.000Z",
              updated_time: "2026-06-03T00:00:00.000Z",
              path: ["Active Test"]
            },
            markdown: "Active body"
          })
        }
      });
      const debugInput = debugChatContainer.querySelector(".openai-llm-chat-input");
      const debugSend = debugChatContainer.querySelector(".openai-llm-chat-send");
      debugInput.value = "Use the debug hook";
      await debugSend.click();
      await waitFor(() => debugChatContainer.querySelectorAll(".openai-llm-chat-message-content").length === 2);
      const debugMessages = debugChatContainer.querySelectorAll(".openai-llm-chat-message-content");
      const debugLabels = debugChatContainer.querySelectorAll(".openai-llm-chat-message-label");
      assert.equal(debugLabels[0].textContent, "You");
      assert.equal(debugLabels[1].textContent, "LLM");
      assert.equal(debugMessages[0].textContent, "Use the debug hook");
      assert.equal(debugMessages[1].textContent, "Debug answer for Use the debug hook");
      assert.equal(debugRequests[0].prompt, "Use the debug hook");
      assert.equal(debugRequests[0].system.includes("Current page title: Active Test"), true);
      assert.equal(debugRequests[0].system.includes("Tool mode: Ask before editing."), true);
      debugChat.dispose();
    } finally {
      globalThis.__lotionLLMChatDebugComplete = originalDebugComplete;
    }

    const container = document.createElement("div");
    const disposable = renderOpenAILLMSettings(
      container,
      {
        settings,
        ai: { complete: async ({ prompt }) => `answer:${prompt}` }
      },
      {
        getEnvironmentDefaults: async () => ({ openai: { apiKey: "sk-env" }, deepseek: { apiKey: "ds-env" } })
      }
    );
    await waitFor(() => container.querySelector(".openai-llm-provider"));

    const provider = container.querySelector(".openai-llm-provider");
    const token = container.querySelector(".openai-llm-token");
    const status = container.querySelector(".openai-llm-status");
    const protocol = container.querySelector(".openai-llm-protocol");
    const model = container.querySelector(".openai-llm-model");
    const options = container.querySelector(".openai-llm-model-options");
    const save = container.querySelector(".openai-llm-save");
    const prompt = container.querySelector(".openai-llm-prompt");
    const run = container.querySelector(".openai-llm-run");
    const output = container.querySelector(".openai-llm-output");
    const clear = container.querySelector(".openai-llm-clear");

    provider.value = "deepseek";
    await provider.dispatchEvent(new Event("change"));
    assert.equal(status.textContent, "Set via DEEPSEEK_API_KEY");
    assert.equal(token.placeholder, "Using DEEPSEEK_API_KEY from .env");
    assert.equal(protocol.value, "chat_completions");
    assert.equal(protocol.disabled, true);
    assert.equal(model.value, DEFAULT_DEEPSEEK_MODEL);
    assert.match(options.innerHTML, /deepseek-reasoner/);
    const permissionInputs = Array.from(container.querySelectorAll(".openai-llm-tool-permission"));
    assert.equal(permissionInputs.length, ALL_LOTION_TOOL_NAMES.length);
    assert.equal(permissionInputs.every((input) => input.checked), true);

    model.value = "deepseek-v4";
    permissionInputs.find((input) => input.value === "lotion_update_page").checked = false;
    await save.click();
    assert.equal(settings.get("provider"), "deepseek");
    assert.equal(settings.get("model.deepseek"), "deepseek-v4");
    assert.equal(settings.get("enabledTools").includes("lotion_update_page"), false);

    prompt.value = "status";
    await run.click();
    assert.equal(output.textContent, "answer:status");

    await settings.set("apiKey.deepseek", "saved-secret");
    await clear.click();
    assert.equal(settings.get("apiKey.deepseek"), undefined);
    disposable.dispose();
    assert.equal(container.innerHTML, "");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
    globalThis.Event = originalEvent;
    globalThis.HTMLInputElement = originalHTMLInputElement;
    globalThis.HTMLTextAreaElement = originalHTMLTextAreaElement;
    globalThis.window = originalWindow;
  }
});

test("plugin base class can be extended by third-party plugins", async () => {
  class ExamplePlugin extends Plugin {
    loaded = false;
    unloaded = false;
    onLoad() {
      this.loaded = true;
    }
    onUnload() {
      this.unloaded = true;
    }
  }

  const plugin = new ExamplePlugin({ commands: { list: () => [] } });
  await plugin.onLoad();
  await plugin.onUnload();
  assert.equal(plugin.loaded, true);
  assert.equal(plugin.unloaded, true);
});

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.defaultPrevented = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.placeholder = "";
    this.type = "";
    this.checked = false;
    this.disabled = false;
    this.rows = 0;
    this.attributes = new Map();
    this._innerHTML = "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === "class") this.className = stringValue;
    if (name === "id") this.id = stringValue;
    if (name === "value") this.value = stringValue;
    if (name === "placeholder") this.placeholder = stringValue;
    if (name === "type") this.type = stringValue;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
    if (!this._innerHTML) return;
    const tagPattern = /<([a-zA-Z0-9-]+)([^>]*)>/g;
    let match;
    while ((match = tagPattern.exec(this._innerHTML)) !== null) {
      const [, tag, attrs] = match;
      if (tag.toLowerCase() === "option") continue;
      const classMatch = /\bclass="([^"]*)"/.exec(attrs);
      if (!classMatch) continue;
      const child = this.ownerDocument?.createElement(tag) ?? new FakeElement(tag);
      child.className = classMatch[1];
      child.value = attributeValue(attrs, "value");
      child.placeholder = attributeValue(attrs, "placeholder");
      child.type = attributeValue(attrs, "type");
      child.checked = /\bchecked\b/.test(attrs);
      child.disabled = /\bdisabled\b/.test(attrs);
      this.appendChild(child);
    }
  }

  get innerHTML() {
    return this._innerHTML;
  }

  querySelector(selector) {
    if (!selector.startsWith(".")) return null;
    const className = selector.slice(1);
    return findByClass(this, className);
  }

  querySelectorAll(selector) {
    if (!selector.startsWith(".")) return [];
    const out = [];
    collectByClass(this, selector.slice(1), out);
    return out;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  async dispatchEvent(event) {
    const list = this.listeners.get(event.type) ?? [];
    for (const handler of list) await handler(event);
    return !event.defaultPrevented;
  }

  async click() {
    return this.dispatchEvent(new FakeEvent("click", { bubbles: true }));
  }
}

class FakeInputElement extends FakeElement {
  constructor(tagName = "input") {
    super(tagName);
  }
}

class FakeTextAreaElement extends FakeInputElement {
  constructor() {
    super("textarea");
  }
}

class FakeDocument {
  createElement(tagName) {
    const lower = tagName.toLowerCase();
    const element =
      lower === "input" || lower === "select"
        ? new FakeInputElement(tagName)
        : lower === "textarea"
          ? new FakeTextAreaElement()
          : new FakeElement(tagName);
    element.ownerDocument = this;
    return element;
  }
}

function findByClass(element, className) {
  for (const child of element.children) {
    if (hasClass(child, className)) return child;
    const nested = findByClass(child, className);
    if (nested) return nested;
  }
  return null;
}

function collectByClass(element, className, out) {
  for (const child of element.children) {
    if (hasClass(child, className)) out.push(child);
    collectByClass(child, className, out);
  }
}

function hasClass(element, className) {
  return String(element.className).split(/\s+/).includes(className);
}

function attributeValue(attrs, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return match ? match[1].replaceAll("&quot;", "\"").replaceAll("&amp;", "&") : "";
}

function createGitSyncTimerFixture() {
  const handles = [];
  return {
    handles,
    timers: {
      setInterval(callback, delayMs) {
        const handle = {
          delayMs,
          cleared: false,
          unrefCalled: false,
          unref() {
            this.unrefCalled = true;
          },
          async fire() {
            if (this.cleared) return;
            await callback();
          }
        };
        handles.push(handle);
        return handle;
      },
      clearInterval(handle) {
        handle.cleared = true;
      }
    }
  };
}

function gitSyncSettings(overrides = {}) {
  return {
    remoteUrl: "",
    branch: "main",
    sshKeyPath: "",
    autoBackupCadence: "off",
    autoPushCadence: "off",
    automationPaused: false,
    commitMessagePrefix: "Lotion backup",
    ...overrides
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitFor(fn, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    const value = fn();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for condition");
}
