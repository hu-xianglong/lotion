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
import { fileService } from "../dist-electron/main/services/file-service.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import {
  parsePage,
  readPageFile,
  serializeMarkdownBody,
  writeMarkdownBody,
  writePageFile
} from "../dist-electron/main/storage/markdown-file.js";
import { readJsonFile, writeJsonFile } from "../dist-electron/main/storage/json-file.js";
import { readCsvFile, writeCsvFile } from "../dist-electron/main/storage/csv-file.js";
import { WorkspacePaths } from "../dist-electron/main/storage/paths.js";
import {
  parseDateTimeValue,
  parseDateValue,
  isDateLikeFieldType,
  defaultDateFormatForField,
  defaultTimeFormatForField,
  formatDateForField
} from "../dist-electron/shared/date-values.js";
import { evaluateFormula } from "../dist-electron/shared/formula.js";
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

    const markdownPath = join(root, "page.md");
    await writePageFile(markdownPath, { meta: { id: "pg", title: "Title", created_time: "", updated_time: "" }, markdown: "# Heading\n\nBody" });
    assert.equal((await readPageFile(markdownPath)).meta.title, "Heading");
    await writeMarkdownBody(markdownPath, "Body only");
    assert.equal(await fileService.readText(markdownPath), "Body only\n");
    assert.equal(parsePage("No heading").meta.title, "Untitled");
    assert.equal(serializeMarkdownBody("Trimmed\n\n"), "Trimmed\n");
    assert.equal(serializeMarkdownBody("\n\n"), "");

    await fileService.writeBuffer(join(root, "buffer.bin"), Buffer.from("abc"));
    assert.equal((await fileService.readBuffer(join(root, "buffer.bin"))).toString("utf8"), "abc");
    await fileService.rename(join(root, "buffer.bin"), join(root, "renamed.bin"));
    assert.equal(fileService.exists(join(root, "renamed.bin")), true);
    assert.equal(fileService.cacheStats().entries > 0, true);
    fileService.clearCache();

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
    await workspace.toggleFavorite({ type: "database", id: "db_b" });
    await workspace.toggleFavorite({ type: "row_page", databaseId: "db_b", rowId: "row_1" });
    assert.deepEqual(await workspace.listFavorites(), [
      { type: "database", id: "db_b" },
      { type: "row_page", databaseId: "db_b", rowId: "row_1" }
    ]);
    const reopenedWorkspace = new WorkspaceService(config);
    await reopenedWorkspace.open(workspaceRoot);
    assert.deepEqual(await reopenedWorkspace.listFavorites(), [
      { type: "database", id: "db_b" },
      { type: "row_page", databaseId: "db_b", rowId: "row_1" }
    ]);
    await workspace.toggleFavorite({ type: "database", id: "db_b" });
    assert.deepEqual(await workspace.listFavorites(), [
      { type: "row_page", databaseId: "db_b", rowId: "row_1" }
    ]);

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
    assert.equal(await readFile(join(workspaceRoot, pageBodyPath(page.meta.id, page.meta.title)), "utf8"), "");

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
    await writeFile(join(workspaceRoot, "pages", "page_pg_legacy.md"), "# Legacy Title\n\nLegacy body", "utf8");
    const currentManifest = await workspace.getManifest();
    await workspace.saveManifest({ ...currentManifest, pages: [...currentManifest.pages, "pg_legacy"] });
    assert.equal((await pageService.list()).some((item) => item.id === "pg_legacy" && item.title === "Legacy Title"), true);
    assert.equal((await pageService.get("pg_legacy")).markdown.includes("Legacy body"), true);
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

test("database default views order fields by content richness", async () => {
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
          { id: "short_code", name: "Short code", type: "text" },
          { id: "long_notes", name: "Long notes", type: "text" },
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

    const expectedOrder = ["title", "long_notes", "short_code", "empty_note", "notion_original_html"];
    assert.deepEqual(bundle.views[0].fieldOrder, expectedOrder);
    assertCreatedTimeDefaultViews(bundle, expectedOrder);

    const paths = new WorkspacePaths(workspaceRoot);
    const schemaOrder = ["title", "short_code", "long_notes", "empty_note", "notion_original_html"];
    await writeJsonFile(paths.view(bundle.schema.id, DEFAULT_VIEW_ID, bundle.schema.name), {
      ...bundle.views[0],
      visibleFieldIds: schemaOrder,
      fieldOrder: schemaOrder
    });
    const normalizedExistingBundle = await databases.get(bundle.schema.id);
    assert.deepEqual(normalizedExistingBundle.views.find((view) => view.id === DEFAULT_VIEW_ID)?.fieldOrder, expectedOrder);
    assertCreatedTimeDefaultViews(normalizedExistingBundle, expectedOrder);

    const customOrder = ["title", "empty_note", "short_code", "long_notes", "notion_original_html"];
    await writeJsonFile(paths.view(bundle.schema.id, DEFAULT_VIEW_ID, bundle.schema.name), {
      ...bundle.views[0],
      visibleFieldIds: schemaOrder,
      fieldOrder: customOrder
    });
    const customExistingBundle = await databases.get(bundle.schema.id);
    assert.deepEqual(customExistingBundle.views.find((view) => view.id === DEFAULT_VIEW_ID)?.fieldOrder, customOrder);
    assertCreatedTimeDefaultViews(customExistingBundle, expectedOrder);

    await fileService.remove(paths.viewsDir(bundle.schema.id, bundle.schema.name), { recursive: true, force: true });
    const fallbackBundle = await databases.get(bundle.schema.id);
    assert.deepEqual(fallbackBundle.views.find((view) => view.id === DEFAULT_VIEW_ID)?.fieldOrder, expectedOrder);
    assertCreatedTimeDefaultViews(fallbackBundle, expectedOrder);

    await writeJsonFile(paths.schema(bundle.schema.id, bundle.schema.name), {
      ...fallbackBundle.schema,
      fields: fallbackBundle.schema.fields.map((field) => (
        field.id === "created_time" ? { ...field, hidden: true } : field
      ))
    });
    const hiddenCreatedTimeBundle = await databases.get(bundle.schema.id);
    assertCreatedTimeDefaultViews(hiddenCreatedTimeBundle, expectedOrder);
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

    const entities = new EntitiesDatabaseService(workspace);
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
    assert.equal(cacheJson.version, 1);
    assert.equal(cacheJson.fingerprint, firstStats.fingerprint);

    const second = await entities.backlinks(target.meta.id);
    assert.equal(second.length, first.length);
    assert.equal(second[0].source.entityId, first[0].source.entityId);
    assert.equal(second[0].sourceBodyPath, first[0].sourceBodyPath);
    assert.equal(entities.backlinkCacheStats()?.fingerprint, firstStats.fingerprint);

    const reloadedEntities = new EntitiesDatabaseService(workspace);
    const diskBacklinks = await reloadedEntities.backlinks(target.meta.id);
    assert.equal(diskBacklinks.length, first.length);
    assert.equal(diskBacklinks[0].source.entityId, first[0].source.entityId);
    assert.equal(diskBacklinks[0].sourceBodyPath, first[0].sourceBodyPath);
    assert.equal(reloadedEntities.backlinkCacheStats()?.fingerprint, firstStats.fingerprint);

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
  const document = new FakeDocument();
  globalThis.document = document;
  globalThis.Event = FakeEvent;
  globalThis.HTMLInputElement = FakeInputElement;
  globalThis.HTMLTextAreaElement = FakeTextAreaElement;
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
