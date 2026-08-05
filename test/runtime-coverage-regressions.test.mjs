import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";

import {
  appendCsvRecord,
  readCsvFile,
  readCsvFileByFieldValues,
  writeCsvFile
} from "../dist-electron/main/storage/csv-file.js";
import {
  defaultFilterOperator,
  evaluateFilterExpression,
  filterConditionError,
  filterExpressionUsesField,
  filterOperatorsForField,
  flattenSimpleAndFilters,
  legacyFiltersToExpression,
  matchesFilterCondition,
  normalizeFilterExpression
} from "../dist-electron/shared/filter-expression.js";
import {
  compareFieldValues,
  defaultSortDirection,
  sortDatabaseRecords,
  sortDirectionLabels
} from "../dist-electron/shared/database-sort.js";
import { applyRollupsToRecords } from "../dist-electron/shared/rollup.js";
import {
  EMPTY_GROUP_KEY,
  groupDatabaseRecords,
  groupKeyAndLabel,
  isGroupableField,
  normalizeViewGroups
} from "../dist-electron/shared/database-grouping.js";
import {
  orderFieldIdsByContentRichness,
  orderFieldIdsByInformationAmount
} from "../dist-electron/shared/field-order.js";
import {
  formatDateForField,
  isValidDateValue,
  normalizeDateValue,
  parseDateTimeValue,
  parseDateValue,
  resolveDateFormatForField,
  resolveTimeFormatForField
} from "../dist-electron/shared/date-values.js";
import {
  attachmentCategoryForExtension,
  attachmentCategoryForFilename,
  isImageAttachmentName,
  lotionFileUrl,
  safeAttachmentStem,
  workspaceAttachmentPath
} from "../dist-electron/shared/attachments.js";
import { resolveRowIcon } from "../dist-electron/shared/row-icons.js";
import { DatabaseMutationError, databasePersistenceError } from "../dist-electron/shared/database-mutation-errors.js";
import {
  chordFromKeyboardEvent,
  displayShortcutChord,
  normalizeShortcutChord,
  readShortcutOverrides,
  resolveShortcuts,
  shortcutActionForEvent,
  shortcutMap,
  validateShortcutOverride
} from "../dist-electron/shared/shortcuts.js";
import {
  BASE_SLASH_COMMANDS,
  applySlashCommandTemplate,
  createChildPageInput,
  createDatabaseSlashCommands,
  createPageSlashCommands,
  filterSlashCommands
} from "../dist-electron/shared/slash-commands.js";
import { databaseRowLink, parseDatabaseRowLink } from "../dist-electron/shared/database-row-link.js";
import { databaseViewLink, parseDatabaseViewLink } from "../dist-electron/shared/database-view-link.js";
import { createLotionToolExecutor, createLotionTools } from "../dist-electron/builtin-plugins/llm-openai/lotion-tools.js";
import {
  buildWorkspaceQAContext,
  citationToEntityRef,
  normalizeAdvancedSearchCitation
} from "../dist-electron/builtin-plugins/llm-openai/qa-agent.js";
import { completeWithOpenAICompatibleChat } from "../dist-electron/builtin-plugins/llm-openai/openai-chat-completions.js";
import { completeWithOpenAIResponses } from "../dist-electron/builtin-plugins/llm-openai/openai-responses.js";
import { endpointFor } from "../dist-electron/builtin-plugins/llm-openai/llm-transport.js";
import {
  maskSecret,
  providerDefinition,
  providerKey,
  readLLMToolMode,
  readOpenAILLMSettingsForProvider,
  writeOpenAILLMSettings
} from "../dist-electron/builtin-plugins/llm-openai/settings.js";
import { InMemoryPluginSettings } from "../dist-electron/shared/plugin-host/settings.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import { DatabaseService, databaseServiceTestInternals } from "../dist-electron/main/services/database-service.js";
import { WorkspaceService, workspaceServiceTestInternals } from "../dist-electron/main/services/workspace-service.js";
import { AttachmentService } from "../dist-electron/main/services/attachment-service.js";
import { FileService } from "../dist-electron/main/services/file-service.js";
import { PluginStorageService } from "../dist-electron/main/services/plugin-storage-service.js";
import { PageService } from "../dist-electron/main/services/page-service.js";
import { GitService, gitServiceTestInternals } from "../dist-electron/main/services/git-service.js";
import { SearchService, searchServiceTestInternals } from "../dist-electron/main/services/search-service.js";
import { mapWithConcurrency } from "../dist-electron/main/services/concurrency.js";
import { notionImportTestInternals } from "../dist-electron/main/services/notion-import-service.js";
import { notionAuditTestInternals } from "../dist-electron/main/services/notion-audit-service.js";
import {
  EntitiesDatabaseService,
  createEntitiesDefaultView,
  createEntitiesFields,
  createEntitiesSchema,
  entitiesDatabaseTestInternals,
  entityToRecord,
  normalizeEntitiesSchema
} from "../dist-electron/main/services/entities-database-service.js";
import {
  createPagesFields,
  pageBodyPath,
  pageInputToRecord,
  pagesDatabaseTestInternals,
  recordToPageMeta
} from "../dist-electron/main/services/pages-database-service.js";
import { resolveNotionCollectionRewrite } from "../dist-electron/main/services/notion-collection-resolver.js";
import { openAILLMChatTestInternals } from "../dist-electron/builtin-plugins/llm-openai/chat-ui.js";
import {
  AdvancedSearchPluginService,
  AdvancedSearchProviderError,
  JsonVectorIndexAdapter,
  LocalHashEmbeddingProvider,
  OllamaEmbeddingProvider,
  advancedSearchTestInternals,
  chunkAdvancedSearchText
} from "../dist-electron/builtin-plugins/advanced-search/service.js";
import {
  GitHubBackupError,
  GitHubBackupConflictError,
  GitHubBackupRateLimitError,
  GitHubBackupService,
  GitHubRestBackupAdapter,
  StorageGitHubBackupAdapter,
  gitHubBackupTestInternals
} from "../dist-electron/builtin-plugins/github-backup/service.js";

test("CSV storage preserves quoted values and supports ordered selective reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-csv-boundary-"));
  const path = join(root, "data.csv");
  try {
    assert.deepEqual(await readCsvFile(join(root, "missing.csv")), []);
    assert.deepEqual(await readCsvFileByFieldValues(path, "id", []), []);

    await writeCsvFile(path, ["id", "title", "score", "done", "note"], [
      { id: "row-1", title: "One, quoted", score: 1.5, done: true, note: "line 1\nline 2" },
      { id: "row-2", title: "Two \"quoted\"", score: -2, done: false, note: null }
    ]);
    await appendCsvRecord(path, ["id", "title", "score", "done", "note"], {
      id: "row-3",
      title: "Three",
      score: 0,
      done: true,
      note: "tail"
    });

    const records = await readCsvFile(path);
    assert.equal(records.length, 3);
    assert.deepEqual(records[0], {
      id: "row-1",
      title: "One, quoted",
      score: 1.5,
      done: true,
      note: "line 1\nline 2"
    });
    assert.equal(records[1].title, "Two \"quoted\"");
    assert.equal(records[1].done, false);
    assert.equal(records[1].note, "");

    const selected = await readCsvFileByFieldValues(path, "id", ["row-3", "row-1", "missing"]);
    assert.deepEqual(selected.map((record) => record.id), ["row-3", "row-1"]);
    await assert.rejects(readCsvFileByFieldValues(path, "absent", ["row-1"]), /CSV field not found/);

    const simplePath = join(root, "simple.csv");
    await writeFile(simplePath, "id,value\r\na,1\r\nb,false\r\n", "utf8");
    assert.deepEqual(await readCsvFile(simplePath), [
      { id: "a", value: 1 },
      { id: "b", value: false }
    ]);
    await appendFile(simplePath, "c,true\n", "utf8");
    assert.equal((await readCsvFile(simplePath))[2].value, true);
    assert.match(await readFile(path, "utf8"), /"One, quoted"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("file, attachment, and plugin storage services survive cache and persistence boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-storage-boundaries-"));
  const files = new FileService();
  const events = [];
  const unsubscribe = files.subscribeMutations((event) => events.push(event));
  try {
    const nested = join(root, "nested");
    const binary = join(nested, "data.bin");
    await files.writeBufferAtomic(binary, Buffer.from([1, 2, 3]));
    assert.deepEqual([...await files.readBuffer(binary)], [1, 2, 3]);
    assert.deepEqual([...await files.readBuffer(binary)], [1, 2, 3]);
    assert.equal(files.statSync(binary).size, 3);
    assert.equal((await files.stat(binary)).isFile(), true);
    assert.equal(files.readDirSync(nested, { withFileTypes: true })[0].isFile(), true);

    const textPath = join(nested, "history.txt");
    await files.appendTextAtomic(textPath, "one\n");
    await files.appendTextAtomic(textPath, "two\n");
    assert.equal(await files.readText(textPath), "one\ntwo\n");
    await writeFile(textPath, "external and longer", "utf8");
    assert.equal(await files.readText(textPath), "external and longer");
    await files.noteExternalMutation(textPath);
    assert.equal(events.at(-1).external, true);

    const renamed = join(nested, "renamed.txt");
    await files.rename(textPath, renamed);
    const handle = await files.open(renamed, "r");
    await handle.close();
    const chunks = [];
    for await (const chunk of files.createReadStream(renamed)) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString("utf8"), "external and longer");
    assert.ok(files.cacheStats().entries > 0);
    files.clearCache();
    assert.equal(files.cacheStats().entries, 0);

    const cachedThenDeleted = join(root, "cached.txt");
    await files.writeText(cachedThenDeleted, "cached");
    await files.readText(cachedThenDeleted);
    await rm(cachedThenDeleted);
    await assert.rejects(files.readText(cachedThenDeleted), /ENOENT/);

    const workspace = { requirePaths: () => ({ root }) };
    const attachments = new AttachmentService(workspace);
    assert.deepEqual(await attachments.list(), []);
    const added = await attachments.add(new Uint8Array([4, 5, 6]), "bad extension!");
    assert.equal(added.ext, "bin");
    assert.deepEqual([...await attachments.get(added.sha.slice(0, 8))], [4, 5, 6]);
    await assert.rejects(attachments.get("bad"), /Invalid attachment sha/);
    await assert.rejects(attachments.get("deadbeef"), /not found/);
    const source = join(root, "source photo.png");
    await writeFile(source, "image", "utf8");
    const imported = await attachments.importFiles([root, source]);
    assert.equal(imported.length, 1);
    assert.equal(imported[0].category, "images");
    assert.ok((await attachments.list()).length >= 2);

    const storage = new PluginStorageService(workspace);
    assert.deepEqual(await storage.readJsonl("../plugin", "history"), []);
    await storage.appendJsonl("../plugin", "history", { id: 1 });
    await storage.appendJsonl("../plugin", "history", { id: 2 });
    const historyPath = join(root, ".lotion", "plugins", "_plugin", "history.jsonl");
    await appendFile(historyPath, "corrupt\n", "utf8");
    assert.deepEqual(await storage.readJsonl("../plugin", "history", { limit: 2 }), [{ id: 2 }]);
    await storage.writeJson("../plugin", "settings", { enabled: true });
    assert.deepEqual(await storage.readJson("../plugin", "settings"), { enabled: true });
    assert.match(await storage.resolvePluginFile("...", "explicit.jsonl"), /plugin\/explicit\.jsonl$/);
    assert.match(await storage.resolvePluginFile("", "explicit.json", ".json"), /plugin\/explicit\.json$/);
    await storage.delete("../plugin", "settings");
    assert.equal(await storage.readJson("../plugin", "settings"), null);

    const malformedConfigPath = join(root, "malformed-config.json");
    await writeFile(malformedConfigPath, "{", "utf8");
    assert.deepEqual(await new AppConfigService(malformedConfigPath).load(), {
      active: null,
      recents: [],
      gitSyncByWorkspace: {}
    });
    assert.deepEqual(await mapWithConcurrency([], 0, async (value) => value), []);
  } finally {
    unsubscribe();
    await rm(root, { recursive: true, force: true });
  }
});

test("Notion body worker classifies skipped, empty, rendered, and failed jobs", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-body-worker-"));
  const worker = new Worker(new URL("../dist-electron/main/services/notion-body-worker.js", import.meta.url), {
    type: "module",
    workerData: { rewrites: [] }
  });
  const runJob = (job) => new Promise((resolveResult, rejectResult) => {
    const onMessage = (message) => {
      worker.off("error", onError);
      resolveResult(message);
    };
    const onError = (error) => {
      worker.off("message", onMessage);
      rejectResult(error);
    };
    worker.once("message", onMessage);
    worker.once("error", onError);
    worker.postMessage(job);
  });
  try {
    const empty = join(root, "empty.html");
    const body = join(root, "body.html");
    await writeFile(empty, "<html><body><article><div class=\"page-body\"><br></div></article></body></html>", "utf8");
    await writeFile(body, "<html><body><article><div class=\"page-body\"><p>Rendered body</p></div></article></body></html>", "utf8");
    assert.equal((await runJob({ id: 1, sourcePath: empty, hasBodyHint: false, sourceSize: 10 })).stage, "body-skip");
    assert.equal((await runJob({ id: 2, sourcePath: empty })).stage, "body-empty");
    const rendered = await runJob({ id: 3, sourcePath: body });
    assert.equal(rendered.stage, "body");
    assert.match(rendered.bodyMarkdown, /Rendered body/);
    assert.match((await runJob({ id: 4, sourcePath: join(root, "missing.html") })).error, /ENOENT/);
  } finally {
    await worker.terminate();
    await rm(root, { recursive: true, force: true });
  }
});

test("filter expressions validate, normalize, and evaluate every field family", () => {
  const fields = [
    { id: "title", name: "Title", type: "text" },
    { id: "url", name: "URL", type: "url" },
    { id: "count", name: "Count", type: "number" },
    { id: "done", name: "Done", type: "checkbox" },
    { id: "status", name: "Status", type: "select" },
    { id: "tags", name: "Tags", type: "multi_select" },
    { id: "relation", name: "Relation", type: "entity_ref" },
    { id: "due", name: "Due", type: "date" },
    { id: "created", name: "Created", type: "created_time" },
    { id: "formula", name: "Formula", type: "formula" }
  ];
  const now = new Date("2026-08-04T12:00:00.000Z");
  const record = {
    title: "Launch Plan",
    url: "https://example.com/Launch",
    count: 12,
    done: true,
    status: "Ready",
    tags: '["Alpha","Beta"]',
    relation: "row-1; row-2",
    due: "2026-08-03",
    created: "2026-08-05",
    formula: "12"
  };

  assert.deepEqual(filterOperatorsForField(fields[3]), ["checked", "unchecked"]);
  assert.ok(filterOperatorsForField(fields[2]).includes("gt"));
  assert.ok(filterOperatorsForField(fields[7]).includes("within_next"));
  assert.ok(filterOperatorsForField(fields[5]).includes("contains"));
  assert.equal(defaultFilterOperator(fields[0]), "contains");

  const cases = [
    ["title", "contains", "launch", true],
    ["title", "not_contains", "missing", true],
    ["title", "is", "Launch Plan", true],
    ["title", "is_not", "Other", true],
    ["count", "gt", 10, true],
    ["count", "lt", 20, true],
    ["done", "checked", "", true],
    ["done", "unchecked", "", false],
    ["tags", "contains", "beta", true],
    ["relation", "not_contains", "row-3", true],
    ["due", "within_past", "7_days", true],
    ["created", "within_next", 2, true],
    ["due", "lt", "2026-08-04", true],
    ["created", "gt", "2026-08-04", true],
    ["formula", "gt", 5, true],
    ["status", "is_not_empty", "", true],
    ["missing", "is_empty", "", true]
  ];
  for (const [fieldId, operator, value, expected] of cases) {
    const field = fields.find((candidate) => candidate.id === fieldId) ?? { id: fieldId, name: fieldId, type: "text" };
    assert.equal(matchesFilterCondition(record[fieldId], { operator, value }, field, now), expected);
  }
  assert.equal(matchesFilterCondition("bad", { operator: "gt", value: 2 }, fields[2], now), false);
  assert.equal(matchesFilterCondition("bad", { operator: "within_past", value: "week" }, fields[7], now), false);
  assert.equal(matchesFilterCondition("bad", { operator: "is", value: "2026-08-04" }, fields[7], now), false);
  assert.equal(matchesFilterCondition("2026-08-04", { operator: "is", value: "bad" }, fields[7], now), false);
  assert.equal(matchesFilterCondition("2026-08-04", { operator: "is", value: "2026-08-04" }, fields[7], now), true);
  assert.equal(matchesFilterCondition("2026-08-04", { operator: "is_not", value: "2026-08-05" }, fields[7], now), true);
  assert.equal(matchesFilterCondition("x", { operator: "contains", value: null }, fields[0], now), false);
  assert.equal(matchesFilterCondition("", { operator: "is_empty", value: "" }, fields[0], now), true);
  assert.equal(matchesFilterCondition("x", { operator: "checked", value: "" }, fields[0], now), false);
  assert.equal(evaluateFilterExpression({ version: 1, kind: "group", id: "empty", conjunction: "and", children: [] }, record, fields, now), true);
  assert.equal(evaluateFilterExpression({ version: 1, kind: "group", id: "missing", conjunction: "and", children: [{ version: 1, kind: "condition", id: "missing-field", fieldId: "absent", operator: "is", value: "x" }] }, record, fields, now), false);

  assert.equal(filterConditionError({ operator: "checked", value: "" }, fields[0]), "Choose a valid operator.");
  assert.equal(filterConditionError({ operator: "contains", value: "" }, fields[0]), "Choose or enter a value.");
  assert.equal(filterConditionError({ operator: "gt", value: "many" }, fields[2]), "Enter a valid number.");
  assert.equal(filterConditionError({ operator: "is", value: "not-a-date" }, fields[7]), "Enter a valid date.");
  assert.equal(filterConditionError({ operator: "within_next", value: "week" }, fields[7]), "Choose a relative date range.");
  assert.equal(filterConditionError({ operator: "is_not_empty", value: "" }, fields[0]), undefined);

  const legacy = legacyFiltersToExpression([
    { fieldId: "title", operator: "contains", value: "Launch" },
    { fieldId: "count", operator: "is", value: "" },
    { fieldId: "done", operator: "checked", value: "" }
  ]);
  assert.equal(legacy.children.length, 2);
  const normalized = normalizeFilterExpression({
    version: 1,
    kind: "group",
    id: "",
    conjunction: "or",
    children: [
      { version: 1, kind: "condition", id: "", fieldId: "title", operator: "invalid", value: "x" },
      { version: 1, kind: "condition", id: "removed", fieldId: "gone", operator: "is", value: "x" },
      {
        version: 1,
        kind: "group",
        id: "nested",
        conjunction: "and",
        children: [{ version: 1, kind: "condition", id: "nested-condition", fieldId: "done", operator: "checked", value: "" }]
      }
    ]
  }, [], fields);
  assert.equal(normalized.id, "filter-root");
  assert.equal(normalized.children.length, 2);
  assert.equal(normalized.children[0].operator, "is");
  assert.equal(filterExpressionUsesField(normalized, "done"), true);
  assert.equal(filterExpressionUsesField(undefined, "done"), false);
  assert.equal(evaluateFilterExpression(normalized, record, fields, now), true);
  assert.deepEqual(flattenSimpleAndFilters(legacy).map((filter) => filter.fieldId), ["title", "done"]);
  assert.deepEqual(flattenSimpleAndFilters(normalized), []);
});

test("database sorting, links, rollups, and shortcut boundaries remain deterministic", async () => {
  const optionField = { id: "status", name: "Status", type: "select", options: [{ id: "a", name: "Ready" }, { id: "b", name: "Done" }] };
  const multiField = { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }] };
  assert.ok(compareFieldValues("Ready", "Done", optionField, "asc") < 0);
  assert.ok(compareFieldValues('["Alpha"]', "Beta;Unknown", multiField, "asc") < 0);
  assert.ok(compareFieldValues("yes", false, { id: "done", name: "Done", type: "checkbox" }, "desc") < 0);
  assert.ok(compareFieldValues("not-a-number", "2", { id: "score", name: "Score", type: "number" }, "asc") > 0);
  assert.ok(compareFieldValues("10", "2", { id: "score", name: "Score", type: "number" }, "asc") > 0);
  assert.ok(compareFieldValues("2026-08-05", "2026-08-04", { id: "date", name: "Date", type: "date" }, "desc") < 0);
  assert.ok(compareFieldValues("invalid-a", "invalid-b", { id: "date", name: "Date", type: "date" }, "asc") < 0);
  assert.equal(defaultSortDirection({ type: "updated_time" }), "desc");
  assert.deepEqual(sortDirectionLabels({ type: "number" }), { asc: "Smallest first", desc: "Largest first" });
  assert.deepEqual(sortDirectionLabels({ type: "date" }), { asc: "Earliest first", desc: "Latest first" });
  assert.deepEqual(sortDirectionLabels({ type: "checkbox" }), { asc: "Unchecked first", desc: "Checked first" });
  assert.deepEqual(sortDirectionLabels({ type: "select" }), { asc: "First option first", desc: "Last option first" });
  assert.deepEqual(sortDirectionLabels({ type: "text" }), { asc: "A → Z", desc: "Z → A" });
  const records = [{ id: "2", status: "Missing" }, { id: "1", status: "Ready" }, { id: "3", status: "" }];
  assert.deepEqual(sortDatabaseRecords(records, [{ fieldId: "absent", direction: "asc" }, { fieldId: "status", direction: "asc" }], [optionField]).map((record) => record.id), ["1", "2", "3"]);
  assert.equal(sortDatabaseRecords(records, [], [optionField]), records);

  const rowUrl = databaseRowLink("db one", "row/two");
  assert.deepEqual(parseDatabaseRowLink(rowUrl), { databaseId: "db one", rowId: "row/two" });
  assert.equal(parseDatabaseRowLink("https://example.com"), null);
  assert.equal(parseDatabaseRowLink("lotion://database/%E0%A4%A/row/ok"), null);
  const viewUrl = databaseViewLink("db one", "view/two");
  assert.deepEqual(parseDatabaseViewLink(viewUrl), { databaseId: "db one", viewId: "view/two" });
  assert.equal(parseDatabaseViewLink("lotion://page/x?view=y"), null);
  assert.equal(parseDatabaseViewLink("not a url"), null);
  assert.equal(parseDatabaseViewLink("lotion://database/%E0%A4%A?view=x"), null);

  const relation = { id: "related", name: "Related", type: "entity_ref", relation: { targetDatabaseId: "target" } };
  const baseSchema = { id: "source", name: "Source", fields: [relation] };
  const target = {
    schema: { id: "target", name: "Target", fields: [{ id: "amount", name: "Amount", type: "number" }] },
    records: [{ id: "r1", amount: 10 }, { id: "r2", amount: "20" }, { id: "r3", amount: "" }]
  };
  const refs = JSON.stringify([
    { kind: "row", entityId: "r1", databaseId: "target", rowId: "r1" },
    { kind: "row", entityId: "r2", rowId: "r2" },
    { kind: "row", entityId: "missing", databaseId: "target" },
    { kind: "page", entityId: "page" }
  ]);
  for (const [aggregation, expected] of [["count", 2], ["count_values", 2], ["show_original", "10, 20"], ["sum", 30], ["average", 15], ["min", 10], ["max", 20], ["range", 10]]) {
    const schema = { ...baseSchema, fields: [relation, { id: "rollup", name: "Rollup", type: "rollup", rollup: { relationFieldId: "related", targetFieldId: "amount", aggregation } }] };
    const result = await applyRollupsToRecords(schema, [{ id: "source-row", related: refs }], async (id) => id === "target" ? target : null);
    assert.equal(result[0].rollup, expected);
  }
  const unchanged = [{ id: "same", related: "", rollup: 0 }];
  assert.equal((await applyRollupsToRecords({ ...baseSchema, fields: [relation, { id: "rollup", name: "Rollup", type: "rollup", rollup: { relationFieldId: "related", aggregation: "count" } }] }, unchanged, async () => target))[0], unchanged[0]);
  assert.equal(await applyRollupsToRecords(baseSchema, unchanged, async () => target), unchanged);
  const missingRelationConfig = { ...baseSchema, fields: [{ id: "rollup", name: "Rollup", type: "rollup", rollup: { aggregation: "count" } }] };
  assert.equal((await applyRollupsToRecords(missingRelationConfig, [{ id: "a" }], async () => target))[0].rollup, 0);
  const wrongRelationSchema = { fields: [{ id: "related", name: "Related", type: "text" }, { id: "rollup", name: "Rollup", type: "rollup", rollup: { relationFieldId: "related", aggregation: "count" } }] };
  assert.equal((await applyRollupsToRecords(wrongRelationSchema, [{ id: "a", related: refs }], async () => target))[0].rollup, 0);
  const sumSchema = { ...baseSchema, fields: [relation, { id: "rollup", name: "Rollup", type: "rollup", rollup: { relationFieldId: "related", targetFieldId: "amount", aggregation: "sum" } }] };
  assert.equal((await applyRollupsToRecords(sumSchema, [{ id: "bad-json", related: "{" }], async () => target))[0].rollup, undefined);
  assert.equal((await applyRollupsToRecords(sumSchema, [{ id: "no-target", related: JSON.stringify({ kind: "row", entityId: "r1", databaseId: "absent" }) }], async () => null))[0].rollup, undefined);
  const textTarget = { schema: target.schema, records: [{ id: "r1", amount: "not numeric" }] };
  assert.equal((await applyRollupsToRecords(sumSchema, [{ id: "text", related: JSON.stringify({ kind: "row", entityId: "r1", databaseId: "target" }) }], async () => textTarget))[0].rollup, undefined);
  const unknownSchema = { ...baseSchema, fields: [relation, { id: "rollup", name: "Rollup", type: "rollup", rollup: { relationFieldId: "related", targetFieldId: "amount", aggregation: "unknown" } }] };
  assert.equal((await applyRollupsToRecords(unknownSchema, [{ id: "unknown", related: JSON.stringify({ kind: "row", entityId: "r1", databaseId: "target" }) }], async () => target))[0].rollup, undefined);

  assert.equal(displayShortcutChord("Mod+Alt+ArrowUp", "other"), "Ctrl+Alt+↑");
  assert.equal(chordFromKeyboardEvent({ key: "Shift", metaKey: false, ctrlKey: false, altKey: false, shiftKey: true }), null);
  assert.equal(shortcutActionForEvent({ key: "f", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }, {}, "mac"), "lotion.open-search");
  assert.equal(shortcutMap({ "lotion.new-tab": null }).get("lotion.new-tab").disabled, true);
  assert.equal(validateShortcutOverride("missing", "Mod+P").message, "Unknown shortcut action.");
  assert.match(validateShortcutOverride("lotion.new-tab", "Mod+Q").message, /reserved/);
  assert.match(validateShortcutOverride("lotion.new-tab", "A").message, /normal typing/);
  assert.equal(validateShortcutOverride("lotion.new-tab", null), null);
  assert.equal(validateShortcutOverride("lotion.new-tab", "Mod+Shift+F").conflictingActionId, "lotion.open-search");
  assert.deepEqual(readShortcutOverrides('{"lotion.new-tab":"cmd+k","missing":"Mod+P"}'), { "lotion.new-tab": "Mod+K" });
  assert.deepEqual(readShortcutOverrides("{"), {});
  assert.deepEqual(readShortcutOverrides([]), {});
});

test("shared database presentation helpers cover malformed and legacy values", async () => {
  const select = { id: "status", name: "Status", type: "select", options: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }] };
  const multi = { ...select, id: "tags", type: "multi_select" };
  assert.ok(compareFieldValues("Alpha", "Unknown", select, "asc") < 0);
  assert.ok(compareFieldValues("Unknown", "Beta", select, "asc") > 0);
  assert.ok(compareFieldValues("Alpha", "Beta", { id: "formula", type: "formula" }, "asc") < 0);
  assert.ok(compareFieldValues("[bad", "Beta", multi, "asc") > 0);
  assert.ok(compareFieldValues('["Alpha","Beta"]', '["Alpha"]', multi, "asc") > 0);
  assert.equal(compareFieldValues("", "Beta", select, "desc"), 1);
  assert.deepEqual(sortDatabaseRecords([{ id: "b", x: 1 }, { id: "a", x: 1 }], [{ fieldId: "missing", direction: "asc" }], []), [{ id: "b", x: 1 }, { id: "a", x: 1 }]);
  assert.deepEqual(sortDirectionLabels({ type: "checkbox" }), { asc: "Unchecked first", desc: "Checked first" });
  assert.deepEqual(sortDirectionLabels({ type: "select" }), { asc: "First option first", desc: "Last option first" });

  assert.equal(parseDatabaseViewLink("https://example.com"), null);
  assert.equal(parseDatabaseViewLink("lotion://database/db1"), null);
  assert.equal(parseDatabaseViewLink("not a URL"), null);
  assert.deepEqual(parseDatabaseViewLink(databaseViewLink("db / 1", "view / 1")), { databaseId: "db / 1", viewId: "view / 1" });

  assert.equal(normalizeDateValue("2026-02-30"), "");
  assert.equal(normalizeDateValue("August 4, 2026"), "2026-08-04");
  assert.equal(isValidDateValue("2026-08-04 to 2026-08-05"), true);
  assert.equal(isValidDateValue("2026-08-04 to bad"), false);
  assert.equal(parseDateValue("2024-02-29").getDate(), 29);
  assert.equal(parseDateValue("2023-02-29"), null);
  assert.equal(parseDateValue(""), null);
  assert.equal(parseDateTimeValue(""), null);
  assert.equal(resolveDateFormatForField({ type: "date" }, { dateFormat: "full" }), "full");
  assert.equal(resolveTimeFormatForField({ type: "date" }, { timeFormat: "h24" }), "none");
  assert.match(formatDateForField("2026-08-04 18:30", { type: "created_time", dateFormat: "iso", timeFormat: "h24" }), /2026-08-04 18:30/);
  assert.equal(formatDateForField("", { type: "date" }), "");
  assert.equal(formatDateForField("invalid", { type: "date" }), "invalid");

  const records = [{ id: "1", status: "Alpha", tags: "Alpha; Beta", rich: "unique long value", empty: "" }, { id: "2", status: "", tags: "[bad", rich: "another value", empty: null }];
  const groups = normalizeViewGroups(undefined, [select, multi], "status", records);
  assert.equal(groups[0].fieldId, "status");
  assert.deepEqual(normalizeViewGroups([{ version: 1, id: "", fieldId: "tags", order: "bad", groupOrder: ["value:%5Bbad", "missing", "value:%5Bbad"] }], [multi], undefined, records)[0].groupOrder, ["value:%5Bbad"]);
  assert.equal(isGroupableField({ id: "id", type: "text" }), false);
  assert.equal(isGroupableField({ id: "title", type: "text" }), true);
  assert.deepEqual(groupKeyAndLabel(null, select), { key: EMPTY_GROUP_KEY, label: "No value" });
  assert.deepEqual(groupKeyAndLabel(true, { id: "done", type: "checkbox" }), { key: "boolean:true", label: "Checked" });
  const buckets = groupDatabaseRecords(records, multi, { version: 1, id: "g", fieldId: "tags", order: "desc", hiddenGroupKeys: ["option:b"], hideEmpty: true });
  assert.ok(buckets.some((bucket) => bucket.label === "[bad"));
  assert.ok(buckets.every((bucket) => bucket.records.length > 0));

  assert.deepEqual(orderFieldIdsByContentRichness(records, ["empty", "rich", "status"], { pinnedFirst: ["status"], pinnedLast: ["empty"] }), ["status", "rich", "empty"]);
  assert.deepEqual(orderFieldIdsByInformationAmount([], ["a", "b"], { pinnedFirst: ["b"] }), ["b", "a"]);
  const sampled = Array.from({ length: 8 }, (_, index) => ({ id: String(index), unique: `value-${index}`, same: "same", empty: index ? "" : null }));
  assert.deepEqual(orderFieldIdsByInformationAmount(sampled, ["same", "unique", "empty"], { maxSampleSize: 1 })[0], "unique");
  assert.deepEqual(orderFieldIdsByInformationAmount(sampled, ["same", "unique", "empty"], { maxSampleSize: 3 })[0], "unique");

  assert.equal(attachmentCategoryForExtension("PDF"), "documents");
  assert.equal(attachmentCategoryForFilename("archive.tar.gz"), "archives");
  assert.equal(attachmentCategoryForFilename("README"), "misc");
  assert.equal(workspaceAttachmentPath("photo one.png"), "attachments/images/photo one.png");
  assert.equal(lotionFileUrl("attachments/photo one.png"), "lotion-file:///attachments/photo%20one.png");
  assert.equal(isImageAttachmentName("PHOTO.HEIC"), true);
  assert.equal(safeAttachmentStem("folder/.hidden"), ".hidden");
  assert.equal(safeAttachmentStem("..."), "attachment");
  assert.equal(resolveRowIcon({ row_icon: " " }, "emoji:database", "emoji:stored"), "emoji:stored");
  assert.equal(resolveRowIcon(undefined, undefined, undefined), undefined);
  const mutation = new DatabaseMutationError("DATABASE_CONFLICT", "conflict");
  assert.equal(mutation.name, "DatabaseMutationError");
  assert.equal(databasePersistenceError("db1", mutation), mutation);
  assert.match(databasePersistenceError("db1", "disk full").message, /disk full/);

  const relation = { id: "rel", name: "Relation", type: "entity_ref", relation: { targetDatabaseId: "target" } };
  const refs = JSON.stringify([{ entityId: "r1", kind: "row" }, { entityId: "skip", kind: "page" }, { entityId: "missing-db", kind: "row", databaseId: "" }]);
  const rollupFields = ["count", "count_values", "show_original", "sum", "average", "min", "max", "range"].map((aggregation) => ({ id: aggregation, name: aggregation, type: "rollup", rollup: { relationFieldId: "rel", targetFieldId: "value", aggregation } }));
  const rolled = await applyRollupsToRecords({ id: "source", name: "Source", fields: [relation, ...rollupFields] }, [{ id: "s1", rel: refs }], async (id) => id === "target" ? { schema: { id: "target", name: "Target", fields: [] }, records: [{ id: "r1", value: "1,200" }] } : null);
  assert.equal(rolled[0].count, 1);
  assert.equal(rolled[0].sum, 1200);
  assert.equal(rolled[0].show_original, "1,200");
  const invalidRollup = await applyRollupsToRecords({ id: "s", name: "S", fields: [{ id: "bad", type: "rollup", rollup: { relationFieldId: "missing", aggregation: "count" } }] }, [{ id: "1", bad: 0 }], async () => null);
  assert.equal(invalidRollup[0].bad, 0);
});

test("shortcut and slash command boundaries remain keyboard-safe", () => {
  assert.equal(normalizeShortcutChord("++"), null);
  assert.equal(normalizeShortcutChord("command + shift + left"), "Mod+Shift+ArrowLeft");
  assert.equal(normalizeShortcutChord("ctrl + option + space"), "Ctrl+Alt+Space");
  assert.equal(normalizeShortcutChord("esc"), "Escape");
  assert.equal(normalizeShortcutChord("up"), "ArrowUp");
  assert.equal(normalizeShortcutChord("down"), "ArrowDown");
  assert.equal(normalizeShortcutChord("right"), "ArrowRight");
  assert.equal(normalizeShortcutChord("shift"), null);
  assert.equal(displayShortcutChord(null, "other"), "Disabled");
  assert.equal(displayShortcutChord("ArrowLeft", "other"), "←");
  assert.equal(displayShortcutChord("ArrowRight", "other"), "→");
  assert.equal(displayShortcutChord("Mod+Ctrl+Alt+Shift+ArrowDown", "other"), "Ctrl+Ctrl+Alt+Shift+↓");
  assert.equal(resolveShortcuts({ "lotion.new-tab": null }, "other").find((item) => item.id === "lotion.new-tab").disabled, true);
  assert.match(validateShortcutOverride("missing", "Mod+X").message, /Unknown/);
  assert.match(validateShortcutOverride("lotion.new-tab", "Mod+Q").message, /reserved/);
  assert.match(validateShortcutOverride("lotion.new-tab", "T").message, /normal typing/);
  assert.equal(validateShortcutOverride("lotion.new-tab", null), null);
  assert.equal(validateShortcutOverride("lotion.new-tab", "Mod+Shift+X"), null);
  assert.equal(chordFromKeyboardEvent({ key: "Meta", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), null);
  assert.equal(chordFromKeyboardEvent({ key: "x", metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }), "Mod+Ctrl+Alt+Shift+X");
  assert.deepEqual(readShortcutOverrides('{"unknown":"Mod+X","lotion.new-tab":null,"lotion.close-tab":"shift"}'), { "lotion.new-tab": null });
  assert.deepEqual(readShortcutOverrides(""), {});
  assert.deepEqual(readShortcutOverrides("bad json"), {});

  assert.equal(filterSlashCommands(BASE_SLASH_COMMANDS, "yellow", 1)[0].id, "highlight");
  const scoredCommand = {
    id: "prefix-middle-suffix",
    label: "Display Name",
    hint: "",
    group: "Custom Zone",
    iconId: "text",
    aliases: ["alternate phrase"],
    template: "plain",
    placement: "line"
  };
  for (const query of ["", "display name", "display", "alternate phrase", "alternate", "middle", "name", "phrase", "zone"]) {
    assert.equal(filterSlashCommands([scoredCommand], query).length, 1);
  }
  assert.deepEqual(filterSlashCommands([scoredCommand], "missing"), []);
  const inline = createPageSlashCommands([{ id: "p 1", title: "A [page]", path: ["Root"] }])[0];
  assert.ok(inline.template.includes("A \\[page\\]"));
  assert.equal(createPageSlashCommands([{ id: "p2", title: " ", path: [] }])[0].label, "Untitled");
  assert.equal(createDatabaseSlashCommands([{ id: "db1", name: "Tasks" }])[0].hint, "数据库视图");
  assert.deepEqual(createChildPageInput({ id: "p1", title: " Parent ", kind: "page" }, " "), { title: "Untitled", parentId: "p1", parentKind: "page", path: ["Parent", "Untitled"] });
  const divider = BASE_SLASH_COMMANDS.find((command) => command.id === "divider");
  const edit = applySlashCommandTemplate({ doc: "Text\n/divider", lineFrom: 5, slashFrom: 5, slashTo: 13, command: divider });
  assert.ok(edit.insert.startsWith("\n"));
  assert.equal(applySlashCommandTemplate({ doc: "/divider", lineFrom: 0, slashFrom: 0, slashTo: 8, command: divider }).insert.startsWith("\n\n"), false);
  assert.equal(applySlashCommandTemplate({ doc: "/plain", lineFrom: 0, slashFrom: 0, slashTo: 6, command: scoredCommand }).cursor, 5);
  const link = BASE_SLASH_COMMANDS.find((command) => command.id === "link");
  assert.equal(applySlashCommandTemplate({ doc: "/link", lineFrom: 0, slashFrom: 0, slashTo: 5, command: link }).from, 0);
});

test("Lotion LLM tools cover reads, writes, validation, and executor failures", async () => {
  const calls = [];
  let activePage = null;
  const page = {
    id: "page-1",
    title: "Page One",
    path: ["Root", "Page One"],
    parentId: "root",
    parentKind: "page",
    created_time: "2026-08-01T00:00:00.000Z",
    updated_time: "2026-08-02T00:00:00.000Z"
  };
  const databaseBundle = {
    schema: {
      id: "db-1",
      name: "Tasks",
      fields: [
        { id: "title", name: "Title", type: "text", hidden: false, system: false },
        { id: "status", name: "Status", type: "select", options: [{ id: "ready", name: "Ready" }] }
      ]
    },
    views: [{ id: "view-1", name: "All", type: "table" }],
    records: [{ id: "row-1", title: "First", created_time: "created", updated_time: "updated", body_path: "private", custom: "value" }]
  };
  const workspace = {
    searchWorkspace: async (query) => ({ truncated: true, hits: Array.from({ length: 4 }, (_, index) => ({ title: `${query}-${index}` })) }),
    listPages: async () => [page, { ...page, id: "page-2", title: "Page Two" }],
    getPage: async (id) => ({ meta: { ...page, id }, markdown: `Body ${id}` }),
    activePage: async () => activePage,
    listDatabases: async () => [{ id: "db-1", name: "Tasks", rows: 1 }, { id: "db-2", name: "Notes", rows: 0 }],
    getDatabase: async () => databaseBundle,
    createPage: async ({ title }) => { calls.push(["createPage", title]); return { ...page, id: `created-${title}`, title }; },
    updatePage: async (id, input) => { calls.push(["updatePage", id, input.markdown]); return { ...page, id, title: "Updated" }; },
    createDatabase: async ({ name }) => ({ schema: { id: "db-created", name, fields: [] }, views: [], records: [] }),
    addRow: async (databaseId) => ({ ...databaseBundle, records: databaseId === "empty" ? [] : databaseBundle.records }),
    updateCell: async (input) => { calls.push(["updateCell", input.value]); return databaseBundle; }
  };
  const tools = createLotionTools(workspace, {});
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  assert.equal(tools.length, 11);
  assert.deepEqual(createLotionTools(workspace, { enabledToolNames: ["lotion_search", "missing"] }).map((tool) => tool.name), ["lotion_search"]);
  assert.equal((await byName.get("lotion_search").execute({ query: "  term  ", limit: 2.4 })).hits.length, 2);
  assert.equal((await byName.get("lotion_search").execute({ query: "term", limit: "bad" })).hits.length, 4);
  assert.equal((await byName.get("lotion_list_pages").execute({ limit: 1 })).length, 1);
  assert.equal((await byName.get("lotion_get_page").execute({ pageId: " page-2 " })).markdown, "Body page-2");
  assert.deepEqual(await byName.get("lotion_get_active_page").execute({}), { page: null });
  activePage = { meta: page, markdown: "Active body" };
  assert.equal((await byName.get("lotion_get_active_page").execute({})).meta.parentId, "root");
  assert.equal((await byName.get("lotion_list_databases").execute({ limit: 1000 })).length, 2);
  const database = await byName.get("lotion_get_database").execute({ databaseId: "db-1", limit: 1 });
  assert.equal(database.schema.fields[1].options[0].name, "Ready");
  assert.equal(database.records[0].values.custom, "value");
  assert.equal("body_path" in database.records[0].values, false);
  assert.equal((await byName.get("lotion_create_page").execute({ title: " Blank ", markdown: " " })).page.title, "Blank");
  assert.equal((await byName.get("lotion_create_page").execute({ title: "Draft", markdown: "# Draft" })).page.title, "Updated");
  assert.equal((await byName.get("lotion_update_page").execute({ pageId: "page-1", markdown: "New body" })).ok, true);
  assert.equal((await byName.get("lotion_create_database").execute({ name: " Plans " })).database.name, "Plans");
  assert.equal((await byName.get("lotion_add_row").execute({ databaseId: "db-1" })).row.id, "row-1");
  assert.equal((await byName.get("lotion_add_row").execute({ databaseId: "empty" })).row, null);
  assert.equal((await byName.get("lotion_update_cell").execute({ databaseId: "db-1", rowId: "row-1", fieldId: "status", value: { state: "Ready" } })).row.id, "row-1");
  assert.equal(calls.at(-1)[1], JSON.stringify({ state: "Ready" }));

  const executor = createLotionToolExecutor(tools);
  assert.deepEqual(await executor.execute({ name: "missing", arguments: {} }), { ok: false, error: "Unknown Lotion tool: missing" });
  assert.deepEqual(await executor.execute({ name: "lotion_get_page", arguments: {} }), { ok: false, error: "Missing required string argument: pageId" });
  const throwingExecutor = createLotionToolExecutor([{ ...tools[0], name: "throws", execute: async () => { throw "plain failure"; } }]);
  assert.deepEqual(await throwingExecutor.execute({ name: "throws", arguments: {} }), { ok: false, error: "plain failure" });
});

test("workspace Q&A handles strong, weak, absent, and failed retrieval", async () => {
  const baseHit = {
    chunkId: "chunk-1",
    kind: "page",
    title: "",
    subtitle: "",
    snippet: "Evidence",
    score: 0.9,
    source: "title",
    entityPath: "Root / Evidence",
    pageId: "page-1",
    pageFile: null
  };
  const context = { workspace: {}, storage: {} };
  const ready = await buildWorkspaceQAContext(context, "question", { limit: 99, service: { queryTransient: async (_query, options) => {
    assert.equal(options.limit, 8);
    return { hits: [baseHit] };
  } } });
  assert.equal(ready.status, "ready");
  assert.match(ready.system, /\[S1\] Page: Untitled/);

  const weak = await buildWorkspaceQAContext(context, "question", { limit: 1, service: { queryTransient: async () => ({ hits: [{ ...baseHit, score: 0.1 }] }) } });
  assert.equal(weak.status, "low_evidence");
  assert.match(weak.note, /weak/);
  const absent = await buildWorkspaceQAContext(context, "question", { service: { queryTransient: async () => ({ hits: [] }) } });
  assert.equal(absent.status, "low_evidence");
  assert.match(absent.system, /Sources: none/);
  const failed = await buildWorkspaceQAContext(context, "question", { service: { queryTransient: async () => { throw "offline"; } } });
  assert.equal(failed.status, "unavailable");
  assert.equal(failed.note, "offline");

  const databaseCitation = normalizeAdvancedSearchCitation({ ...baseHit, kind: "database", databaseId: "db-1", pageId: undefined }, 1);
  assert.deepEqual(citationToEntityRef(databaseCitation), {
    kind: "database",
    entityId: "db-1",
    titleSnapshot: "Untitled",
    pathSnapshot: ["Root", "Evidence"]
  });
  const rowCitation = normalizeAdvancedSearchCitation({ ...baseHit, kind: "rowPage", databaseId: "db-1", rowId: "row-1", pageId: undefined, entityPath: "" }, 2);
  assert.equal(citationToEntityRef(rowCitation).kind, "row");
  assert.equal(citationToEntityRef({ ...rowCitation, databaseId: undefined }), null);
});

test("OpenAI transports report configuration, payload, parse, and iteration failures", async () => {
  const baseSettings = {
    provider: "openai",
    providerLabel: "OpenAI",
    protocol: "responses",
    apiKey: "key",
    model: "model",
    baseUrl: "https://example.test/v1/",
    enabledTools: [],
    maxToolIterations: 1
  };
  const executor = { execute: async () => ({ ok: true }) };
  assert.equal(endpointFor("  ", "/responses"), "/responses");
  assert.equal(endpointFor("https://example.test/v1///", "/responses"), "https://example.test/v1/responses");
  await assert.rejects(completeWithOpenAIResponses({ ...baseSettings, apiKey: " " }, { prompt: "x" }, [], executor), /not configured/);
  await assert.rejects(completeWithOpenAICompatibleChat({ ...baseSettings, apiKey: " " }, { prompt: "x" }, [], executor), /not configured/);

  const failedFetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "rate limited" } }) });
  await assert.rejects(completeWithOpenAIResponses(baseSettings, { prompt: "x" }, [], executor, { fetch: failedFetch }), /rate limited/);
  await assert.rejects(completeWithOpenAICompatibleChat(baseSettings, { prompt: "x" }, [], executor, { fetch: failedFetch }), /rate limited/);
  const invalidJsonFetch = async () => ({ ok: false, status: 500, json: async () => { throw new Error("invalid json"); } });
  await assert.rejects(completeWithOpenAIResponses(baseSettings, { prompt: "x" }, [], executor, { fetch: invalidJsonFetch }), /HTTP 500/);
  await assert.rejects(completeWithOpenAICompatibleChat(baseSettings, { prompt: "x" }, [], executor, { fetch: invalidJsonFetch }), /HTTP 500/);

  const responsesBodies = [];
  const nestedText = await completeWithOpenAIResponses(baseSettings, { prompt: "x", system: "system", maxTokens: 20, temperature: 0 }, [], executor, { fetch: async (_url, init) => {
    responsesBodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ output: [{ type: "message", content: [{ type: "output_text", text: "nested" }, { type: "ignored", text: "x" }] }] }) };
  } });
  assert.equal(nestedText, "nested");
  assert.equal(responsesBodies[0].max_output_tokens, 20);
  assert.equal(responsesBodies[0].temperature, 0);

  const malformedResponsesCall = async () => ({ ok: true, status: 200, json: async () => ({ output: [{ type: "function_call", name: "tool", arguments: "[]", call_id: "call" }] }) });
  await assert.rejects(completeWithOpenAIResponses(baseSettings, { prompt: "x" }, [], executor, { fetch: malformedResponsesCall }), /JSON object/);
  const loopingResponsesCall = async () => ({ ok: true, status: 200, json: async () => ({ output: [{ type: "function_call", name: "tool", arguments: "", call_id: "call" }] }) });
  await assert.rejects(completeWithOpenAIResponses(baseSettings, { prompt: "x" }, [], executor, { fetch: loopingResponsesCall }), /exceeded 1 tool iterations/);

  assert.equal(await completeWithOpenAICompatibleChat(baseSettings, { prompt: "x" }, [], executor, { fetch: async () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }) }), "");
  const malformedChatCall = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "tool", arguments: "1" } }] } }] }) });
  await assert.rejects(completeWithOpenAICompatibleChat(baseSettings, { prompt: "x" }, [], executor, { fetch: malformedChatCall }), /JSON object/);
  const chatBodies = [];
  const loopingChatCall = async (_url, init) => {
    chatBodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { tool_calls: [{ id: "call", type: "function", function: { name: "tool", arguments: "" } }] } }] }) };
  };
  await assert.rejects(completeWithOpenAICompatibleChat(baseSettings, { prompt: "x", maxTokens: 10, temperature: 0 }, [{ type: "function", name: "tool", description: "Tool", parameters: {} }], executor, { fetch: loopingChatCall }), /exceeded 1 tool iterations/);
  assert.equal(chatBodies[0].max_tokens, 10);
  assert.equal(chatBodies[0].temperature, 0);
});

test("LLM provider settings normalize custom and invalid values", async () => {
  const settings = new InMemoryPluginSettings();
  await settings.set("protocol.custom", "invalid");
  await settings.set("enabledTools", ["lotion_search", "missing", "lotion_search"]);
  await settings.set("maxToolIterations", 100);
  await settings.set("toolMode", "invalid");
  await settings.set("apiKey.openai", "short");
  const custom = readOpenAILLMSettingsForProvider(settings, { custom: { apiKey: " custom-key ", model: "custom-model", baseUrl: "https://custom.test" } }, "custom");
  assert.equal(custom.protocol, "chat_completions");
  assert.deepEqual(custom.enabledTools, ["lotion_search"]);
  assert.equal(custom.maxToolIterations, 10);
  assert.equal(readLLMToolMode(settings), "ask_before_editing");
  assert.equal(maskSecret(""), "Not set");
  assert.equal(maskSecret("short"), "Set");
  assert.equal(maskSecret("1234567890"), "1234...7890");
  assert.equal(providerDefinition("not-real").id, "openai");
  assert.equal(providerKey("deepseek", "model"), "model.deepseek");
  await writeOpenAILLMSettings(settings, { ...custom, model: " ", baseUrl: " ", maxToolIterations: -5, enabledTools: ["lotion_search", "missing"] });
  assert.equal(readOpenAILLMSettingsForProvider(settings, {}, "custom").maxToolIterations, 1);
});

test("database service completes transactional field, row, and view lifecycles", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-database-lifecycle-"));
  try {
    const workspaceRoot = join(root, "Workspace");
    const workspace = new WorkspaceService(new AppConfigService(join(root, "config.json")));
    await workspace.createAt(workspaceRoot, { name: "Lifecycle" });
    const databases = new DatabaseService(workspace);
    let bundle = await databases.create({
      name: "Operations",
      path: ["Tests", "Operations"],
      template: {
        fields: [
          { id: "when", name: "When", type: "date" },
          { id: "amount", name: "Amount", type: "number" },
          { id: "status", name: "Status", type: "select", options: [{ id: "open", name: "Open" }] },
          { id: "computed", name: "Computed", type: "formula", formula: "=amount * 2" }
        ],
        rows: [
          { title: "Valid", when: "2026-08-01 10:30", amount: 4, status: "Open", ignored: "drop" },
          { title: "Empty", when: "", amount: 0 },
          { title: "Invalid", when: "not a date", amount: "bad" }
        ]
      }
    });
    const databaseId = bundle.schema.id;
    assert.equal(bundle.records.length, 3);
    assert.equal("ignored" in bundle.records[0], false);
    assert.equal((await Promise.all([databases.list(), databases.list()]))[0][0].name, "Operations");

    const stats = await databases.refreshStats();
    assert.equal(stats.some((item) => item.id === databaseId && item.pageCount === 3), true);
    assert.equal((await databases.listStats()).some((item) => item.id === databaseId), true);

    await assert.rejects(databases.addField(databaseId, { name: "Bad anchor", type: "text", insertAfterFieldId: "missing" }), /anchor property not found/i);
    await assert.rejects(databases.addField(databaseId, { name: "Bad placement", type: "text", insertAfterFieldId: "title", insertBeforeFieldId: "amount" }), /either an insert-before or insert-after/i);
    await assert.rejects(databases.addField(databaseId, { name: "Current only", type: "text", visibility: "current", viewId: "missing" }), /view not found/i);
    bundle = await databases.addField(databaseId, {
      name: "Notes",
      type: "text",
      insertAfterFieldId: "title",
      visibility: "current",
      viewId: bundle.views[0].id
    });
    const notes = bundle.schema.fields.find((field) => field.name === "Notes");
    bundle = await databases.addField(databaseId, {
      name: "Notes",
      type: "text",
      sourceFieldId: notes.id,
      insertBeforeFieldId: "when"
    });
    const notesCopy = bundle.schema.fields.find((field) => field.name === "Notes 2");
    assert.ok(notesCopy);
    await assert.rejects(databases.addField(databaseId, { name: "System copy", type: "text", sourceFieldId: "id" }), /System properties cannot be duplicated/);

    bundle = await databases.updateField({ databaseId, fieldId: notes.id, name: "Details", type: "select", options: [{ id: "a", name: "Alpha" }] });
    assert.equal(bundle.schema.fields.find((field) => field.id === notes.id).type, "select");
    await assert.rejects(databases.updateField({ databaseId, fieldId: "missing", name: "Missing" }), /Property not found/);
    await assert.rejects(databases.reorderFields({ databaseId, fieldIds: ["title"] }), /every schema field exactly once/);
    const reversedFieldIds = [...bundle.schema.fields.map((field) => field.id)].reverse();
    bundle = await databases.reorderFields({ databaseId, fieldIds: reversedFieldIds });
    assert.deepEqual(bundle.schema.fields.map((field) => field.id), reversedFieldIds);

    await assert.rejects(databases.copyFieldToSystemTime({ databaseId, sourceFieldId: "amount", targetFieldId: "created_time" }), /not date-like/);
    await assert.rejects(databases.copyFieldToSystemTime({ databaseId, sourceFieldId: "when", targetFieldId: "when" }), /must be different/);
    const copied = await databases.copyFieldToSystemTime({ databaseId, sourceFieldId: "when", targetFieldId: "created_time" });
    assert.equal(copied.copiedRows, 1);
    assert.equal(copied.skippedEmptyRows, 1);
    assert.equal(copied.skippedInvalidRows, 1);

    bundle = await databases.deleteField(databaseId, notesCopy.id);
    assert.equal(bundle.schema.deletedFields.some((entry) => entry.field.id === notesCopy.id), true);
    await assert.rejects(databases.deleteField(databaseId, "title"), /cannot be deleted/);
    bundle = await databases.restoreField({ databaseId, fieldId: notesCopy.id });
    assert.equal(bundle.schema.fields.some((field) => field.id === notesCopy.id), true);
    bundle = await databases.deleteField(databaseId, notesCopy.id);
    bundle = await databases.permanentlyDeleteField({ databaseId, fieldId: notesCopy.id });
    assert.equal(bundle.schema.deletedFields?.some((entry) => entry.field.id === notesCopy.id) ?? false, false);
    await assert.rejects(databases.restoreField({ databaseId, fieldId: notesCopy.id }), /Deleted property not found/);

    bundle = await databases.updateMeta({ databaseId, tags: ["test", "test", " lifecycle "] });
    assert.equal(bundle.schema.name, "Operations");
    assert.deepEqual(bundle.schema.tags, ["test", "lifecycle"]);
    databases.failNextMetaWriteForDebug("meta write failed");
    await assert.rejects(databases.updateMeta({ databaseId, tags: ["should-roll-back"] }), /meta write failed/);
    assert.deepEqual((await databases.get(databaseId)).schema.tags, ["test", "lifecycle"]);

    bundle = await databases.addRow(databaseId, undefined, { title: "Added", amount: 7 });
    const added = bundle.records.find((record) => record.title === "Added");
    await assert.rejects(databases.updateCell({ databaseId, rowId: added.id, fieldId: "id", value: "blocked" }), /cannot be edited/i);
    await assert.rejects(databases.updateCell({ databaseId, rowId: "missing", fieldId: "title", value: "x" }), /Row not found/);
    bundle = await databases.updateCell({ databaseId, rowId: added.id, fieldId: "title", value: "Added Updated" });
    assert.equal(bundle.records.find((record) => record.id === added.id).title, "Added Updated");

    bundle = await databases.duplicateRow({ databaseId, rowId: added.id });
    const duplicate = bundle.records.find((record) => record.title === "Added Updated copy");
    assert.ok(duplicate);
    bundle = await databases.deleteRow({ databaseId, rowId: duplicate.id });
    assert.equal(bundle.schema.deletedRows.some((entry) => entry.record.id === duplicate.id), true);
    bundle = await databases.restoreRow({ databaseId, rowId: duplicate.id });
    assert.equal(bundle.records.some((record) => record.id === duplicate.id), true);
    bundle = await databases.deleteRow({ databaseId, rowId: duplicate.id });
    bundle = await databases.permanentlyDeleteRow({ databaseId, rowId: duplicate.id });
    assert.equal(bundle.schema.deletedRows?.some((entry) => entry.record.id === duplicate.id) ?? false, false);
    await assert.rejects(databases.restoreRow({ databaseId, rowId: duplicate.id }), /Deleted row not found/);

    await assert.rejects(databases.batchRows({ databaseId, deleteRowIds: Array.from({ length: 501 }, (_, index) => `row-${index}`) }), /limited to 500/);
    const batch = await databases.batchRows({
      databaseId,
      updates: [
        { rowId: added.id, fieldId: "amount", value: 9 },
        { rowId: added.id, fieldId: "computed", value: 9 },
        { rowId: "missing", fieldId: "amount", value: 1 },
        { rowId: added.id, fieldId: "amount", value: "invalid" }
      ],
      duplicateRowIds: [added.id, "missing"],
      deleteRowIds: [bundle.records[0].id, "missing"]
    });
    assert.equal(batch.createdRowIds.length, 1);
    assert.equal(batch.errors.length >= 4, true);

    bundle = await databases.ensureHiddenField(databaseId, { id: "internal", name: "Internal", type: "text", hidden: true, system: true });
    assert.equal(bundle.schema.fields.some((field) => field.id === "internal"), true);
    assert.equal((await databases.ensureHiddenField(databaseId, { id: "internal", name: "Internal", type: "text" })).schema.fields.filter((field) => field.id === "internal").length, 1);
    bundle = await databases.setSystemCell(databaseId, added.id, "internal", "value");
    assert.equal(bundle.records.find((record) => record.id === added.id).internal, "value");

    const originalView = bundle.views[0];
    const existingViewIds = new Set(bundle.views.map((view) => view.id));
    await assert.rejects(databases.createView({ databaseId, name: "Missing source", sourceMode: "duplicate", sourceViewId: "missing" }), /Source database view not found/);
    bundle = await databases.createView({ databaseId, name: originalView.name, type: "list", sourceMode: "blank" });
    const blankView = bundle.views.find((view) => !existingViewIds.has(view.id));
    assert.notEqual(blankView.name, originalView.name);
    bundle = await databases.duplicateView({ databaseId, viewId: blankView.id });
    const duplicateView = bundle.views.at(-1);
    await assert.rejects(databases.reorderViews({ databaseId, viewIds: [originalView.id] }), /every view exactly once/);
    const reorderedViewIds = [duplicateView.id, ...bundle.views.map((view) => view.id).filter((id) => id !== duplicateView.id)];
    bundle = await databases.reorderViews({ databaseId, viewIds: reorderedViewIds });
    assert.equal(bundle.views[0].id, duplicateView.id);
    bundle = await databases.setDefaultView({ databaseId, viewId: blankView.id });
    assert.equal(bundle.schema.defaultViewId, blankView.id);

    databases.failNextViewWriteForDebug("view write failed");
    await assert.rejects(databases.updateView(databaseId, { ...bundle.views[0], name: "Failed update" }), /view write failed/);
    const currentView = (await databases.get(databaseId)).views.find((view) => view.id === bundle.views[0].id);
    const conflict = await databases.patchView({ databaseId, viewId: currentView.id, expectedRevision: 999, patch: { name: "Conflict" } });
    assert.equal(conflict.ok, false);
    bundle = await databases.get(databaseId);
    for (const view of bundle.views.filter((view) => view.id !== blankView.id)) {
      bundle = await databases.deleteView({ databaseId, viewId: view.id });
    }
    assert.equal((await databases.get(databaseId)).views.some((view) => view.id === blankView.id), true);

    databases.failNextBundleWriteForDebug("bundle write failed");
    await assert.rejects(databases.addRow(databaseId), /bundle write failed/);
    assert.equal((await databases.get(databaseId)).records.some((record) => record.title === "Untitled"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("advanced search providers preserve local fallback and classify provider failures", async () => {
  const config = { provider: "ollama", baseUrl: "http://localhost:11434/", model: "embed", dimensions: 3, vectorStore: "json" };
  await assert.rejects(
    new OllamaEmbeddingProvider(async () => { throw new Error("offline"); }).embed(["one"], config),
    (error) => error instanceof AdvancedSearchProviderError && error.code === "not_configured"
  );
  await assert.rejects(
    new OllamaEmbeddingProvider(async () => ({ status: 429, ok: false, text: async () => "" })).embed(["one"], config),
    (error) => error.code === "rate_limited"
  );
  await assert.rejects(
    new OllamaEmbeddingProvider(async () => ({ status: 404, ok: false, text: async () => "model not found" })).embed(["one"], config),
    (error) => error.code === "not_configured" && error.message.includes("ollama pull embed")
  );
  await assert.rejects(
    new OllamaEmbeddingProvider(async () => ({ status: 500, ok: false, text: async () => "server failure" })).embed(["one"], config),
    (error) => error.code === "provider_error" && error.message.includes("server failure")
  );
  await assert.rejects(
    new OllamaEmbeddingProvider(async () => ({ status: 200, ok: true, json: async () => ({ embeddings: [] }) })).embed(["one"], config),
    /unexpected embedding response/
  );
  const vectors = await new OllamaEmbeddingProvider(async () => ({
    status: 200,
    ok: true,
    json: async () => ({ embedding: [3, 4, 0] })
  })).embed(["one"], config);
  assert.deepEqual(vectors[0], [0.6, 0.8, 0]);
  assert.equal((await new LocalHashEmbeddingProvider().embed(["same", "same"], { ...config, provider: "local" }))[0].length, 3);

  const adapter = new JsonVectorIndexAdapter();
  await adapter.writeChunks([
    { id: "one", kind: "page", title: "B", subtitle: "", chunkId: "one#1", text: "one", textHash: "1", vector: [1, 0] },
    { id: "two", kind: "page", title: "A", subtitle: "", chunkId: "two#1", text: "two", textHash: "2", vector: [0, 1] }
  ]);
  assert.equal((await adapter.searchByVector([1, 0], 1))[0].id, "one");
  assert.equal((await adapter.stats()).chunkCount, 2);
  assert.deepEqual(chunkAdvancedSearchText("  "), []);
  assert.equal(chunkAdvancedSearchText("short")[0], "short");
  assert.equal(chunkAdvancedSearchText("first sentence. second sentence. third sentence", 20, 5).length > 1, true);

  const stored = new Map();
  const storage = {
    readJson: async (key) => stored.get(key) ?? null,
    writeJson: async (key, value) => { stored.set(key, structuredClone(value)); }
  };
  const emptyWorkspace = {
    listPages: async () => [],
    listDatabases: async () => [],
    getPage: async () => { throw new Error("unused"); },
    getDatabase: async () => { throw new Error("unused"); }
  };
  const service = new AdvancedSearchPluginService({ workspace: emptyWorkspace, storage });
  assert.equal((await service.status()).status, "not_built");
  assert.equal((await service.markStale()).status, "not_built");
  assert.equal((await service.configure({ provider: "local", dimensions: -1, vectorStore: "lancedb" })).status, "not_built");
  assert.equal((await service.markStale("changed")).staleReason, "changed");
  assert.deepEqual((await service.query(" ")).hits, []);
  assert.deepEqual((await service.queryTransient(" ")).hits, []);

  const failingService = new AdvancedSearchPluginService({
    workspace: {
      ...emptyWorkspace,
      listPages: async () => [{ id: "page-1" }],
      getPage: async () => ({ meta: { id: "page-1", title: "Page", path: ["Root", "Page"] }, markdown: "Body" })
    },
    storage
  }, {
    embeddingProvider: { embed: async () => { throw new Error("embedding failed"); } },
    now: () => new Date("2026-08-04T00:00:00.000Z")
  });
  const progress = [];
  await assert.rejects(failingService.rebuild({ config: { provider: "local" }, onProgress: (event) => progress.push(event) }), /embedding failed/);
  assert.equal(progress.at(-1).phase, "error");
  assert.equal((await failingService.status()).status, "error");
});

test("search parsing and ranking internals handle imported data boundaries", () => {
  const s = searchServiceTestInternals;
  const db = {
    id: "db_tasks",
    name: "Tasks",
    icon: "emoji:📋",
    fieldIds: ["id", "title", "notes", "row_icon", "page_file", "notion_original_html"],
    fieldNames: ["ID", "Name", "Notes", "Icon", "Page", "Original"],
    titleCol: 1,
    pageFileCol: 4
  };
  const cells = ["row-1", "Launch Plan", "Discuss launch plan tomorrow", "emoji:🚀", "Launch--row-1.md", "private"];
  assert.equal(s.rowHasSearchableMatch(cells, db, "launch plan"), true);
  assert.equal(s.rowHasSearchableMatch(cells, db, "private"), false);
  assert.equal(s.cellMatchesSearch("Plan for Launch", "launch plan"), true);
  assert.equal(s.cellMatchesSearch("Plan only", "launch plan"), false);
  assert.equal(s.isSearchableCsvField("body_path"), false);
  assert.equal(s.isSearchableCsvField("notes"), true);
  assert.match(s.previewCsvCells(cells, db, "launch").text, /Name: Launch Plan/);
  assert.equal(s.previewCsvCells(["row", "Fallback"], { ...db, titleCol: 1 }, "missing").text, "Name: Fallback");
  assert.equal(s.previewCsvCells([], { ...db, titleCol: -1 }, "missing").text, "CSV row");
  const csvMeta = s.csvSearchMeta(cells, db, "launch");
  assert.equal(csvMeta.matchType, "title");
  assert.equal(csvMeta.fieldScore > 8_000, true);

  assert.equal(s.snippetAround("x".repeat(50) + "needle" + "y".repeat(80), "needle").startsWith("..."), true);
  assert.equal(s.snippetAround("nothing relevant", "two words"), "nothing relevant");
  assert.match(s.snippetAroundLoose("prefix 2026/08/04 suffix", "2026/08/04 notes"), /2026\/08\/04/);
  assert.equal(s.snippetAroundLoose("x".repeat(130), "missing").endsWith("..."), true);
  assert.deepEqual(s.byteRangesForPattern("测A测a", "a"), [{ start: 3, end: 4 }, { start: 7, end: 8 }]);
  assert.deepEqual(s.byteRangesForPattern("text", ""), []);
  assert.equal(s.byteLength("测"), 3);
  assert.equal(s.matchToHit({ path: {}, lines: {}, line_number: 1, submatches: [] }, "/root"), null);
  assert.deepEqual(s.matchToHit({ path: { text: "/root/databases/x/data.csv" }, lines: { text: "value\r\n" }, line_number: 2, submatches: [{ start: 0, end: 5, match: {} }] }, "/root"), {
    path: "databases/x/data.csv", line: 2, text: "value", ranges: [{ start: 0, end: 5 }]
  });
  assert.equal(s.isSearchSourcePath("databases/x/pages/a.md"), true);
  assert.equal(s.isSearchSourcePath("databases/x/schema.json"), true);
  assert.equal(s.isSearchSourcePath("README.md"), false);

  const rawA = { path: "a.md", line: 1, text: "A", ranges: [] };
  const rawB = { path: "b.md", line: 2, text: "B", ranges: [] };
  assert.equal(s.mergeRawHits([rawA], []).length, 1);
  assert.deepEqual(s.mergeRawHits([rawA], [rawA, rawB]), [rawA, rawB]);
  assert.equal(s.rawHitKey(rawA), "a.md:1:A");

  const page = s.withSearchMeta({
    kind: "page", pageId: "p1", title: "Launch Plan", path: "pages/p1.md", line: 1,
    text: "Name: Launch Plan", ranges: [], createdTime: "2026-08-01", updatedTime: "bad"
  }, "Launch Plan root", 50, "p1", "title", ["content"]);
  const duplicate = s.withSearchMeta({ ...page, text: "other", path: "other.md" }, "Launch Plan", 0, "p1", "content");
  const database = s.withSearchMeta({
    kind: "database", databaseId: "db1", databaseName: "Launch Database", path: "databases/db1", line: 1,
    text: "Database", ranges: [], createdTime: "2026-08-03"
  }, "Launch Database", 0, "db1", "database");
  const row = s.withSearchMeta({
    kind: "row", databaseId: "db1", databaseName: "Tasks", rowId: "r1", rowTitle: "Launch Row",
    pageFile: "Launch--r1.md", path: "databases/db1/data.csv", line: 2, text: "launch", ranges: []
  }, "Launch Row Tasks", 0, "r1", "content");
  const rowPage = s.withSearchMeta({
    kind: "rowPage", databaseId: "db1", databaseName: "Tasks", rowTitle: null,
    pageFile: "Fallback--r2.md", path: "databases/db1/pages/Fallback--r2.md", line: 1, text: "launch", ranges: []
  }, "Fallback launch", 0, "r2", "reference");
  assert.equal(s.stripSearchMeta(row).kind, "page");
  assert.equal(s.stripSearchMeta(rowPage).title, "Fallback--r2");
  assert.equal(s.stripSearchMeta(page).title, "Launch Plan");
  assert.equal(s.mergeSearchHits([page], []).length, 1);
  assert.equal(s.mergeSearchHits([page], [page, database]).length, 2);
  assert.equal(s.rankAndDedupeHits([database, duplicate, page, row, rowPage], "launch").length, 4);
  assert.equal(s.rankAndDedupeHits([database, page], "launch", "created_asc")[0].pageId, "p1");
  assert.equal(s.rankAndDedupeHits([database, page], "launch", "created_desc")[0].databaseId, "db1");
  assert.equal(Number.isNaN(s.timestampValue()), true);
  assert.equal(Number.isNaN(s.timestampValue("bad")), true);
  assert.equal(s.timestampValue("2026-08-01"), Date.parse("2026-08-01"));
  assert.deepEqual([page, row, rowPage, database].map(s.searchKindRank), [0, 1, 2, 3]);
  assert.deepEqual([undefined, "bad", "relevance", "updated_desc", "updated_asc", "created_desc", "created_asc"].map(s.normalizeSearchSort), ["relevance", "relevance", "relevance", "updated_desc", "updated_asc", "created_desc", "created_asc"]);
  assert.deepEqual(s.orderMatchTypes(["database", "title", "title", "reference"]), ["title", "reference", "database"]);
  assert.deepEqual(s.hitSearchMatchTypes(page), ["title", "content"]);
  assert.deepEqual(s.withMergedMatchTypes({ ...page, __search: undefined }, ["reference"]).matchTypes, ["reference"]);
  assert.deepEqual(["title", "content", "reference", "database"].map(s.matchTypeScore), [80_000, 60_000, 40_000, 20_000]);
  assert.equal(s.logicalHitKey({ ...page, __search: undefined }), "page:p1");
  assert.equal(s.logicalHitKey({ ...database, __search: undefined }), "database:db1");
  assert.equal(s.logicalHitKey({ ...row, __search: undefined }), "row:db1:r1");
  assert.equal(s.logicalHitKey({ ...rowPage, __search: undefined }), "rowPage:db1:Fallback--r2.md");
  assert.equal(s.primaryHitTitle(rowPage), "Fallback--r2");
  assert.equal(s.matchesQuery(page, "launch root"), true);
  assert.equal(s.matchesQuery(page, "launch missing"), false);
  assert.equal(s.searchScore(page, "Launch Plan") > s.searchScore(database, "Launch Plan"), true);
  assert.ok(s.searchScore({ ...page, title: "My Launch Plan Notes" }, "Launch Plan") > 0);
  assert.ok(s.searchScore({ ...database, databaseName: "My Launch Database Archive" }, "Launch Database") > 0);

  const seeds = s.looseSearchSeeds("notes 2026/08/04 launch project");
  assert.ok(seeds.includes("2026/08/04"));
  assert.ok(seeds.includes("launch project"));
  assert.equal(s.looseSearchSeeds("2026/08/04")[0], "2026/08/04");
  assert.equal(s.sameSearchNeedle(" Launch ", "launch"), true);
  assert.deepEqual(s.looseTokens("Ａ—B  测试"), ["a", "b", "测试"]);
  assert.equal(s.normalizeLoose(" A/B：测 "), "a b 测");
  assert.equal(s.isMetadataOnlyPreview("Original Notion HTML"), true);
  assert.deepEqual(s.trimContext("short", []), { text: "short", ranges: [] });
  const trimmed = s.trimContext("前".repeat(40) + "MATCH" + "后".repeat(80), [{ start: 120, end: 125 }]);
  assert.ok(trimmed.text.startsWith("…") && trimmed.text.endsWith("…"));
  assert.deepEqual(s.parseCsvRow('one,"two,too","quote""d"'), ["one", "two,too", 'quote"d']);
  assert.equal(s.isEntityKind("row"), true);
  assert.equal(s.isEntityKind("other"), false);
  assert.equal(s.entityRowKey("db", "row"), "db:row");
  assert.equal(s.normalizeWorkspacePath("./a\\b"), "a/b");

  const entity = { id: "e1", kind: "page", title: "Launch", icon: "", createdTime: "", updatedTime: "", databaseId: "", rowId: "", bodyPath: "pages/e1.md", path: "Root / Launch" };
  assert.match(s.entitySearchText(entity), /Launch/);
  assert.equal(s.entitySearchText(), "");
  assert.match(s.metadataPreview(entity, "launch").text, /^Name:/);
  assert.match(s.metadataPreview({ ...entity, title: "Other" }, "root").text, /^Path:/);
  assert.equal(s.metadataFieldScore(entity, "Launch") > s.metadataFieldScore(entity, "Root"), true);
  assert.equal(s.rowIconFromCells(cells, db), "emoji:🚀");
  assert.equal(s.rowIconFromCells([], { ...db, fieldIds: [], icon: "emoji:📋" }), "emoji:📋");
  assert.equal(s.csvFieldValue(cells, db, "title"), "Launch Plan");
  assert.equal(s.csvFieldValue(cells, db, "missing"), "");
  assert.equal(s.fileNameFromWorkspacePath("databases/x/pages/a.md"), "a.md");
  assert.equal(s.fileNameFromWorkspacePath("databases/x/data.csv"), null);
  assert.deepEqual(s.internalMarkdownLinks("[A](databases/x/pages/a.md) [A2](databases/x/pages/a.md) [B](../b.md)"), ["databases/x/pages/a.md"]);
  assert.deepEqual(s.extractEntityRefIds(['[{"entityId":"a"},{"entityId":"a"}]', 'x {"entityId": "b"}', "none"]), ["a", "b"]);
  assert.equal(s.linkSourceScore({ title: "Launch", path: "Root/Launch" }, "Launch") > s.linkSourceScore({ title: "Other", path: "Root" }, "Launch"), true);
  const cache = { databasesById: new Map([["db1", { id: "db1", name: "Tasks", icon: "emoji:📋" }]]), pages: new Map([["e1", "Cached"]]) };
  assert.equal(s.entityToSearchHit(entity, cache, { text: "preview", ranges: [] }, "search", 1, "title").kind, "page");
  assert.equal(s.entityToSearchHit({ ...entity, kind: "database", databaseId: "db1" }, cache, { text: "preview", ranges: [] }, "search", 1, "database").kind, "database");
  assert.equal(s.entityToSearchHit({ ...entity, kind: "row", databaseId: "db1", rowId: "r1", bodyPath: "databases/db1/pages/r1.md" }, cache, { text: "preview", ranges: [] }, "search", 1, "content").kind, "row");
  assert.equal(s.escapeRegExp("a+b?"), "a\\+b\\?");
});

test("Notion import normalization preserves paths, types, values, and report syntax", () => {
  const n = notionImportTestInternals;
  assert.equal(n.normalizeImportOptions().skipEmptyRowsAndPages, true);
  assert.equal(n.normalizeImportOptions({ includeOriginalHtml: false }).includeOriginalHtml, false);
  assert.deepEqual([n.formatDuration(999), n.formatDuration(1500)], ["999ms", "1.5s"]);
  assert.deepEqual([n.formatBytes(12), n.formatBytes(2048), n.formatBytes(2 * 1024 * 1024)], ["12B", "2.0KB", "2.0MB"]);
  assert.equal(n.bodyContentHint("<div>none</div>"), undefined);
  assert.equal(n.bodyContentHint('<div class="page-body"><br>&nbsp;</div></article>'), false);
  assert.equal(n.bodyContentHint('<div class="page-body"><p>Body</p>'), true);
  assert.equal(n.htmlMentionsNotionCollection('<div class="collection-content">'), true);
  assert.equal(n.isHtmlSource("PAGE.HTML"), true);
  assert.equal(n.isMarkdownSource("page.MD"), true);

  const iconOnly = "# Title\n\n<aside><span class=\"icon\">💡</span></aside>\n\nBody";
  assert.deepEqual(n.extractMarkdownExportIcon(iconOnly), { iconSrc: "", iconEmoji: "💡" });
  assert.match(n.stripLeadingMarkdownExportIcon(iconOnly), /Body/);
  assert.equal(n.extractMarkdownExportIcon("<aside>Text</aside>"), null);
  assert.equal(n.leadingMarkdownContentAfterTitle("# Title\n\nBody"), "Body");
  assert.equal(n.leadingMarkdownPrefixBeforeContent("\uFEFF\n# Title\n\nBody").includes("Title"), true);
  const hash = "12345678123412341234123456789012";
  assert.equal(n.markdownCsvWrapperTarget(`# Tasks\n\n[Tasks](Tasks%20${hash}.csv)`), `Tasks ${hash}.csv`);
  assert.equal(n.markdownCsvWrapperTarget("[Tasks](https://example.com/tasks.csv)"), null);
  assert.equal(n.logicalOriginalSourceRootName("Export-abcd-Part-2"), "Export-abcd");
  assert.equal(n.logicalOriginalSourceRootName("Export-abcd 2"), "Export-abcd");

  const cleaned = n.cleanNotionBody(`# Project: Plan\n\nOwner: Person\nCreated time: Today\n\nBody\n{{LOTIONVIEW:db\\_one}}\n{{LOTIONTOC}}`, "Project  Plan");
  assert.equal(cleaned.includes("Owner:"), false);
  assert.match(cleaned, /```lotion-view\ndatabase: db_one/);
  assert.match(cleaned, /```lotion-toc/);
  assert.equal(n.relaxedEquals("A:  B", "A B"), true);
  assert.equal(n.collapseTitle(" A::  B "), "A B");
  assert.equal(n.normalizeAbs(".").startsWith("/"), true);
  const rewrites = new Map();
  n.setSourceRewrite(rewrites, `/tmp/Export-abcd/Folder/Page ${hash}.html`, "pages/target.md");
  assert.equal(rewrites.get(`notion-path:Folder/Page ${hash}.html`), "pages/target.md");
  assert.equal(n.notionFileHash(`Page ${hash}_all.csv`), hash);
  assert.equal(n.notionFileHash("Page.csv"), null);
  assert.equal(n.logicalPath(`/tmp/Export-abcd/Folder/Page ${hash}.html`), `Folder/Page ${hash}.html`);
  assert.equal(n.notionRelativePath("/tmp/root/Folder/Page.md", ["/tmp/root"]), "Folder/Page.md");
  assert.deepEqual(n.notionDatabasePath(`/tmp/root/Folder/Tasks ${hash}_all.csv`, ["/tmp/root"]), ["Folder", "Tasks"]);
  assert.deepEqual(n.notionPagePath(`/tmp/root/Folder/Page%20Name ${hash}.md`, ["/tmp/root"]), ["Folder", "Page Name"]);
  assert.deepEqual(n.pagePathFromSource(`/tmp/root/Old ${hash}.md`, ["/tmp/root"], "New"), ["New"]);
  assert.equal(n.notionPathSegment(`Name%20Here ${hash}`), "Name Here");
  assert.deepEqual(n.normalizePathSegments([" ", " A "], "Fallback"), ["A"]);
  assert.deepEqual(n.normalizePathSegments([], ""), ["Untitled database"]);

  const parentIndex = new Map([[n.importEntityPathKey(["Root"]), [{ id: "root", kind: "page" }]]]);
  assert.deepEqual(n.importEntityParent(parentIndex, ["Root", "Child"], "child"), { id: "root", kind: "page" });
  assert.equal(n.importEntityParent(new Map([[n.importEntityPathKey(["Root"]), [{ id: "a", kind: "page" }, { id: "b", kind: "page" }]]]), ["Root", "Child"], "child"), undefined);
  assert.deepEqual(n.stripHash(`Title ${hash}`), { title: "Title", hash });
  assert.deepEqual(n.stripHash("Title"), { title: "Title", hash: null });
  assert.equal(n.displayDatabaseName(" Embedded database "), "Untitled");
  const unique = new Map();
  const ambiguous = new Set();
  n.rememberUnique(unique, ambiguous, " key ", "one");
  n.rememberUnique(unique, ambiguous, "key", "two");
  assert.equal(unique.has("key"), false);
  assert.equal(ambiguous.has("key"), true);
  assert.equal(n.materialTitle("Untitled"), "");
  assert.equal(n.materialTitle(" Name "), "Name");

  const typeCases = new Map([
    ["multi_select", "multi_select"], ["date", "date"], ["relation", "entity_ref"],
    ["last_edited_time", "updated_time"], ["status", "select"], ["files", "text"], [undefined, "text"]
  ]);
  for (const [input, expected] of typeCases) assert.equal(n.notionTypeToLotion(input), expected);
  assert.equal(n.notionSystemTimeField("anything", "created_time"), "created_time");
  assert.equal(n.notionSystemTimeField("anything", "last_edited_time"), "updated_time");
  assert.equal(n.notionSystemTimeField("创建时间", undefined), "created_time");
  assert.equal(n.notionSystemTimeField("更新時間", undefined), "updated_time");
  assert.equal(n.notionSystemTimeField("Date", "date"), null);
  const timeHeaders = n.chooseSystemTimeHeaders(["创建时间", "Created time", "更新时间"], new Map());
  assert.equal(timeHeaders.get("created_time"), "Created time");
  assert.equal(timeHeaders.get("updated_time"), "更新时间");
  assert.equal(n.preferredSystemTimeHeader(["Updated time", "Last edited time"], "updated_time"), "Last edited time");

  assert.equal(n.inferNotionTypeFromCsv("URL", []), "url");
  assert.equal(n.inferNotionTypeFromCsv("Link", [{ Link: "https://example.com" }]), "url");
  assert.equal(n.inferNotionTypeFromCsv("Done", [{ Done: "yes" }, { Done: "false" }]), "checkbox");
  assert.equal(n.inferNotionTypeFromCsv("Date", [{ Date: "2026-08-04" }]), "date");
  assert.equal(n.inferNotionTypeFromCsv("Amount", [{ Amount: "1,234" }, { Amount: "2" }]), "number");
  assert.equal(n.inferNotionTypeFromCsv("Text", [{ Text: "hello" }]), undefined);
  assert.equal(n.isImportUrlValue("[site](https://example.com)"), true);
  assert.equal(n.hasExplicitCheckboxSignal("✓"), true);
  assert.equal(n.isImportNumberValue("$1,234.50"), true);
  assert.equal(n.looksImportDateValue("Aug 4, 2026"), true);
  assert.equal(n.notionTypeNeedsOptions("status"), true);
  assert.equal(n.notionTypeNeedsOptions("text"), false);
  assert.equal(n.optionIdForName("In Progress"), "opt_in_progress");
  assert.match(n.optionIdForName("中文"), /^opt_[0-9a-f]{10}$/);
  const parsedByPath = new Map([["page", { propertyOptions: { Status: [{ name: "Open", color: "green" }] }, properties: { Status: "Done" } }]]);
  assert.deepEqual(n.inferNotionOptions("Status", "status", [{ Status: "Open" }, { Status: "Closed" }], parsedByPath).map((option) => option.name), ["Open", "Closed", "Done"]);
  assert.equal(n.inferNotionOptions("Text", "text", [], new Map()), undefined);

  const placeholder = `[Page](notion-hash:${hash})`;
  assert.equal(n.chooseImportedPropertyValue("CSV", placeholder, "text"), placeholder);
  assert.equal(n.chooseImportedPropertyValue("CSV", "HTML", "select"), "HTML");
  assert.equal(n.chooseImportedPropertyValue("CSV", "HTML", "text"), "CSV");
  assert.equal(n.chooseImportedPropertyValue("", "HTML", "text"), "HTML");
  assert.equal(n.notionImportValuesCompatible("A, B", "B;A"), true);
  assert.equal(n.notionImportValuesCompatible(`Page (${hash}.html)`, `Page (${hash}.md)`), true);
  assert.equal(n.notionImportValuesCompatible("A", "B"), false);
  assert.equal(n.normalizeImportMatchValue(" A\u00a0 B "), "A B");
  assert.equal(n.stripImportLinkTargets("[Page](target.md), Other (notion-hash:abc)"), "Page,Other");
  assert.equal(n.firstNotionHash(`x ${hash} y`), hash);
  assert.deepEqual(n.importOptionSet(" B; A; "), ["A", "B"]);
  assert.deepEqual(n.importOptionSet("One"), []);
  assert.equal(n.containsNotionLinkPlaceholder(placeholder), true);
  assert.equal(n.cleanEntityRefLabel(" A\\(B\\) "), "A(B)");
  assert.equal(n.cleanEntityRefLabel(" "), "Untitled");
  assert.equal(n.normalizeEntityTargetKey("<./Folder%20Name/Page.md?x=1>"), "Folder Name/Page.md");
  assert.equal(n.normalizeEntityTargetKey("lotion-db:db1"), "lotion-db:db1");
  assert.equal(n.containsRewritableNotionLink("[Page](Page.html)"), true);
  assert.equal(n.containsRewritableNotionLink("plain"), false);
  assert.equal(n.rewriteNotionTargets(placeholder, new Map([[`notion-hash:${hash}`, "pages/p.md"]]), undefined), "[Page](pages/p.md)");
  assert.equal(n.rewriteNotionTargets(`[Page](notion-hash:${hash})`, new Map(), undefined), `[Page](https://www.notion.so/${hash})`);

  assert.equal(n.normalizeImportedCellValue("multi_select", "A, B"), "A;B");
  assert.equal(n.normalizeImportedCellValue("url", "Visit https://example.com/path)."), "https://example.com/path");
  assert.equal(n.normalizeImportedCellValue("number", "($1,234.50)"), "-1234.50");
  assert.equal(n.normalizeImportedCellValue("checkbox", "checked"), "true");
  assert.equal(n.normalizeImportedCellValue("date", "August 4, 2026"), "2026-08-04");
  assert.equal(n.normalizeCheckboxCellValue("maybe"), "maybe");
  for (const value of ["true", "yes", "1", "✓", "☑"]) assert.equal(n.canonicalCheckboxCellValue(value), "true");
  for (const value of ["false", "no", "0", "✗", "☐"]) assert.equal(n.canonicalCheckboxCellValue(value), "false");
  assert.equal(n.canonicalCheckboxCellValue("maybe"), "");
  assert.equal(n.normalizeNumberCellValue("+12"), "12");
  assert.equal(n.normalizeNumberCellValue("50%"), "50%");
  assert.equal(n.normalizeNumberCellValue("abc"), "abc");
  assert.equal(n.normalizeNumberCellValue(".5"), ".5");
  assert.equal(n.normalizeUrlCellValue("[Site](https://example.com)"), "https://example.com");
  assert.deepEqual(n.splitNotionOptionValue("A; B", "multi_select"), ["A", "B"]);
  assert.deepEqual(n.splitNotionOptionValue("A, B", "select"), ["A, B"]);
  assert.equal(n.safeAttachmentStem("/tmp/My%20File.pdf"), "My_File");
  assert.equal(n.safeOriginalSourceSegment("../"), "untitled");
  assert.equal(n.safeOriginalSourceSegment("A:B* C"), "A_B_ C");
  assert.equal(n.slugifyFileName(" A / B ", 20), "A_B");
  assert.equal(n.slugifyFileName("***"), "untitled");
  assert.equal(n.uniqueFieldId("My Field", [{ id: "my_field" }, { id: "my_field_2" }]), "my_field_3");
  assert.equal(n.reportNumber(12345), "12,345");
  assert.equal(n.markdownInlineCode("a`b"), "`a\\`b`");
  assert.equal(n.markdownTableCell("a|b\n[c]"), "a\\|b<br>\\[c\\]");
  assert.match(n.formatMarkdownTable(["A", "B"], [["1", "2"]]), /\| A \| B \|/);
  assert.equal(n.csvEscape('a,"b"'), '"a,""b"""');
  assert.equal(n.rowsToCsv(["a", "b"], [{ a: "1", b: "x,y" }]), 'a,b\n1,"x,y"\n');
  assert.deepEqual(n.parseCsv('\uFEFFa,b\n"x,y","q""z"\n'), [["a", "b"], ["x,y", 'q"z']]);
  assert.deepEqual(n.parseCsvLine('"x,y",z'), ["x,y", "z"]);
  assert.equal(n.formatPage("Body\n\n"), "Body\n");
});

test("advanced search pure ranking and normalization cover every provider shape", () => {
  const a = advancedSearchTestInternals;
  const documents = [{ id: "p1", kind: "page", title: "Launch", subtitle: "Root", text: "Launch plan body", pageId: "p1" }];
  const drafts = a.materializeChunks(documents);
  assert.equal(drafts[0].chunkId, "p1#1");
  assert.equal(a.shouldReportProgress(100, 200), true);
  assert.equal(a.shouldReportProgress(199, 200), false);
  assert.equal(a.shouldReportProgress(200, 200), true);
  assert.equal(a.hasExistingRowPagePointer({ body_path: "body.md" }), true);
  assert.equal(a.hasExistingRowPagePointer({ page_file: "page.md" }), true);
  assert.equal(a.hasExistingRowPagePointer({}), false);
  assert.equal(a.normalizeIndex({ config: { provider: "bad" }, status: "bad", chunks: null, documents: null }).status, "not_built");
  const local = a.normalizeConfig({ provider: "local", dimensions: -1, vectorStore: "bad" });
  const ollama = a.normalizeConfig({ provider: "ollama", dimensions: 3.9, vectorStore: "lancedb" });
  const external = a.normalizeConfig({ provider: "openai-compatible", baseUrl: " https://api.test ", model: " embed ", apiKey: " key " });
  assert.equal(local.model, "local-hash-v1");
  assert.equal(ollama.dimensions, 3);
  assert.equal(external.apiKey, "key");
  assert.deepEqual(["ready", "indexing", "stale", "error", "bad"].map(a.normalizeStatus), ["ready", "indexing", "stale", "error", "not_built"]);
  assert.equal(a.providerStatus(local).available, true);
  assert.match(a.providerStatus(ollama).setupCommand, /ollama pull/);
  assert.equal(a.providerStatus(external).available, true);
  assert.equal(a.providerStatus({ ...external, apiKey: "" }).available, false);

  const schema = { name: "Tasks", path: ["Root", "Tasks"], fields: [{ id: "title", name: "Name", type: "text" }, { id: "hidden", name: "Hidden", type: "text", hidden: true }, { id: "score", name: "Score", type: "number" }] };
  assert.match(a.databaseText(schema), /Root \/ Tasks/);
  assert.match(a.rowText(schema, { title: "Launch", score: 2, hidden: "secret" }, "Markdown"), /Score: 2/);
  assert.equal(a.rowTitle({ name: "Fallback" }, { ...schema, fields: [] }), "Fallback");
  assert.equal(a.rowTitle({}, { ...schema, fields: [] }), "Untitled");
  assert.deepEqual([null, "x", 2, false, { a: 1 }].map(a.valueForSearch), ["", "x", "2", "false", '{"a":1}']);
  assert.deepEqual([null, " x ", 2].map(a.stringValue), ["", "x", "2"]);
  assert.equal(a.displayPath(["Root", "", "Page"]), "Root / Page");

  const chunk = { ...drafts[0], vector: [1, 0], icon: undefined, entityPath: "Root", databaseId: undefined, rowId: undefined, pageFile: null };
  const lance = a.chunkToLanceRow(chunk);
  assert.equal(lance.icon, "");
  assert.deepEqual(a.lanceRowToChunk({ ...lance, vector: new Float32Array([1, 2]), kind: "rowPage", title: "" }).vector, [1, 2]);
  assert.equal(a.lanceRowToChunk({ ...lance, vector: "bad", kind: "bad", title: "" }).kind, "page");
  assert.equal(a.lexicalMatchScore(chunk, []), 0);
  assert.equal(a.lexicalMatchScore(chunk, ["launch"]) > 0, true);
  assert.deepEqual(a.scoreChunk(chunk, [1, 0], ["launch"]), { semanticScore: 1, lexicalScore: 1, score: 1 });
  const ranked = a.rankChunks([chunk, { ...chunk, chunkId: "p1#2", text: "second" }, { ...chunk, id: "p2", pageId: "p2", chunkId: "p2#1", title: "Other", text: "unrelated", vector: [1, 0] }], "launch", [1, 0], 10);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].source, "hybrid");
  assert.equal(a.chunkToHit(chunk, "launch", ["launch"], { semanticScore: 0.1, lexicalScore: 0.8, score: 0.4 }).source, "lexical");
  assert.equal(a.chunkToHit(chunk, "launch", ["missing"], { semanticScore: 0.8, lexicalScore: 0, score: 0.5 }).source, "semantic");
  assert.equal(a.makeSnippet("", ["x"]), "");
  assert.equal(a.makeSnippet("x".repeat(80) + " needle " + "y".repeat(200), ["needle"]).startsWith("..."), true);
  assert.deepEqual(a.tokenize("Launch launch 中文"), ["launch", "中文", "中", "文"]);
  assert.equal(a.hashTextVector("launch", 4).length, 4);
  assert.deepEqual(a.normalizeVector([0, 0]), [0, 0]);
  assert.deepEqual(a.normalizeVector([3, 4]), [0.6, 0.8]);
  assert.equal(a.cosineSimilarity([1, 2], [3]), 3);
  assert.equal(a.roundScore(0.12349), 0.123);
  assert.notEqual(a.hashStableJson({ a: 1 }), a.hashStableJson({ a: 2 }));
  assert.equal(a.hashText(""), "00000000");
  assert.equal(a.hashText("x".repeat(201)).length, 16);
  assert.equal(typeof a.fnv1a("value"), "number");
});

test("LLM chat helpers preserve transcript, context, policy, and history behavior", async () => {
  const c = openAILLMChatTestInternals;
  assert.equal(c.promptWithTranscript([], "Hello"), "Hello");
  assert.match(c.promptWithTranscript([{ role: "user", content: "One" }, { role: "assistant", content: "Two" }], "Three"), /Assistant: Two[\s\S]*User:\nThree/);
  assert.deepEqual(["read_only", "direct_create", "bad"].map((value) => c.toolModeFromSelect({ value })), ["read_only", "direct_create", "ask_before_editing"]);
  assert.deepEqual(["workspace", "none", "bad"].map((value) => c.contextModeFromSelect({ value })), ["workspace", "none", "current_page"]);
  assert.notEqual(c.toolLabel("lotion_search"), "lotion_search");
  assert.equal(c.toolLabel("missing"), "missing");
  assert.deepEqual(["workspace", "none", "current_page"].map(c.contextLabel), ["Workspace search", "No context", "Current page"]);
  const pageContext = { workspace: { activePage: async () => ({ meta: { id: "p1", title: " Page ", path: ["Root", "Page"] } }) } };
  assert.equal(await c.systemContextForMode(pageContext, "none"), "");
  assert.match(await c.systemContextForMode(pageContext, "workspace"), /read-only/);
  assert.match(await c.systemContextForMode(pageContext, "current_page"), /Current page id: p1/);
  assert.match(c.writePolicyForMode("read_only"), /Read-only/);
  assert.match(c.writePolicyForMode("direct_create"), /Direct create/);
  assert.match(c.writePolicyForMode("ask_before_editing"), /Ask before editing/);
  assert.deepEqual(c.extractWritePreview("Plain"), { content: "Plain", preview: null });
  assert.deepEqual(c.extractWritePreview("```lotion-page-update-preview\n# New Title\nBody\n```"), { content: "I prepared a page update preview for review.", preview: { title: "New Title", markdown: "# New Title\nBody" } });
  assert.equal(c.extractWritePreview("Before\n```lotion-page-update-preview\nBody\n```\nAfter").preview.title, "Untitled preview");
  const history = c.groupHistory([
    { sessionId: "old", role: "assistant", content: "answer", model: "m1", createdAt: "2026-01-01" },
    { sessionId: "new", role: "user", content: "A very long question ".repeat(5), model: "m2", createdAt: "2026-02-01" },
    { sessionId: "new", role: "assistant", content: "answer", model: "m2", createdAt: "2026-02-02" },
    { sessionId: "", role: "user", content: "ignored", createdAt: "2026-03-01" },
    { sessionId: "bad", role: "system", content: "ignored", createdAt: "2026-03-01" }
  ]);
  assert.deepEqual(history.map((item) => item.sessionId), ["new", "old"]);
  assert.equal(history[0].title.endsWith("…"), true);
  assert.equal(history[1].title, "Untitled chat");
  assert.deepEqual(["deepseek", "custom", "bad"].map((value) => c.providerFromSelect({ value })), ["deepseek", "custom", "openai"]);
  assert.ok(c.modelChoices("openai", " custom-model ").includes("custom-model"));
  assert.equal(await c.currentContextText(pageContext), "Current page: Root / Page");
  assert.equal(await c.currentContextText({ workspace: { activePage: async () => null } }), "Workspace context");
  assert.equal(await c.currentContextText({ workspace: { activePage: async () => { throw new Error("closed"); } } }), "Workspace context");
  assert.equal(c.truncate(" a   b ", 10), "a b");
  assert.equal(c.escapeHtml('&<>"'), "&amp;&lt;&gt;&quot;");
  assert.equal(c.escapeAttr("a'b"), "a&#39;b");
  const withDataset = { dataset: {} };
  c.setDataAttribute(withDataset, "sourceId", "p1");
  assert.equal(withDataset.dataset.sourceId, "p1");
  const attrs = {};
  c.setDataAttribute({ dataset: null, setAttribute: (name, value) => { attrs[name] = value; } }, "sourceId", "p2");
  assert.equal(attrs["data-source-id"], "p2");
});

test("Git service covers repository history, remote sync, and preflight decisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-git-service-"));
  const remote = await mkdtemp(join(tmpdir(), "lotion-git-remote-"));
  const workspace = { requirePaths: () => ({ root }) };
  let settings = {
    remoteUrl: "",
    branch: "main",
    sshKeyPath: "",
    autoBackupCadence: "off",
    autoPushCadence: "off",
    automationPaused: false,
    commitMessagePrefix: "Test backup"
  };
  const appConfig = {
    gitSyncSettingsForWorkspace: async () => settings,
    updateGitSyncSettingsForWorkspace: async (_root, input) => {
      settings = { ...settings, ...input };
      return settings;
    }
  };
  const service = new GitService(workspace, appConfig);
  try {
    const missing = await service.status();
    assert.equal(missing.installed, true);
    assert.equal(missing.repoInitialized, false);
    assert.equal((await service.listFileHistory("page.md", { pageId: "p1", title: "Page" })).state, "repo_missing");

    assert.equal((await service.updateSettings({ branch: "main" })).branch, "main");
    assert.equal((await service.settings()).commitMessagePrefix, "Test backup");
    assert.equal((await service.initRepository()).success, true);
    execFileSync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Lotion Tests"], { cwd: root });
    await writeFile(join(root, "page.md"), "# First\n\nBody\n", "utf8");
    assert.equal((await service.backupNow()).success, true);
    assert.equal((await service.backupNow()).message, "Nothing to backup.");

    const history = await service.listFileHistory("page.md", { pageId: "p1", title: "Page" });
    assert.equal(history.state, "ready");
    assert.equal(history.versions.length, 1);
    await writeFile(join(root, "page.md"), "# Current\n\nChanged\n", "utf8");
    const preview = await service.previewFileVersion("page.md", history.versions[0].shortSha, { pageId: "p1", title: "Page" });
    assert.match(preview.selectedMarkdown, /First/);
    assert.ok(preview.diff.some((line) => line.type === "removed"));
    assert.match(await service.restoreFileVersion("page.md", history.versions[0].sha, { pageId: "p1", title: "Page" }), /First/);
    await assert.rejects(service.previewFileVersion("page.md", "bad!", { pageId: "p1", title: "Page" }), /Invalid Git revision/);
    await assert.rejects(service.listFileHistory("../outside.md", { pageId: "p1", title: "Page" }), /stay inside/);

    execFileSync("git", ["init", "--bare", remote]);
    settings = { ...settings, remoteUrl: remote };
    assert.equal((await service.configureRemote()).success, true);
    assert.equal((await service.testRemoteAccess()).success, true);
    assert.equal((await service.push()).success, true);
    assert.equal((await service.fetchStatus()).success, true);
    assert.equal((await service.pull()).success, true);
    assert.equal((await service.autoPush()).success, true);
    assert.equal((await service.squashPreflight()).state, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(remote, { recursive: true, force: true });
  }

  const baseStatus = {
    installed: true,
    repoInitialized: true,
    enabled: true,
    clean: true,
    dirtyCount: 0,
    branch: "main",
    remote: "origin",
    output: ""
  };
  const fake = new GitService({ requirePaths: () => ({ root: tmpdir() }) });
  fake.fetchStatus = async () => ({ success: false, message: "fetch failed" });
  assert.equal((await fake.autoPush()).message, "fetch failed");
  fake.fetchStatus = async () => ({ success: true, message: "ok" });
  fake.status = async () => ({ ...baseStatus, repoInitialized: false });
  assert.match((await fake.autoPush()).message, /not initialized/);
  fake.status = async () => ({ ...baseStatus, clean: false, output: "dirty" });
  assert.match((await fake.autoPush()).message, /commit local changes/);
  fake.status = async () => ({ ...baseStatus, behind: 1 });
  assert.match((await fake.autoPush()).message, /remote has changes/);
  fake.status = async () => baseStatus;
  fake.push = async () => ({ success: true, message: "pushed" });
  assert.equal((await fake.autoPush()).message, "pushed");

  for (const [status, expected] of [
    [{ ...baseStatus, installed: false, repoInitialized: false }, "repo_missing"],
    [{ ...baseStatus, clean: false }, "dirty"],
    [{ ...baseStatus, remote: undefined }, "remote_missing"]
  ]) {
    fake.status = async () => status;
    assert.equal((await fake.squashPreflight()).state, expected);
  }
  fake.status = async () => baseStatus;
  fake.fetchStatus = async () => ({ success: false, message: "fetch failed", output: "offline" });
  assert.equal((await fake.squashPreflight()).state, "failed");
  fake.fetchStatus = async () => ({ success: true, message: "ok" });
  let calls = 0;
  fake.status = async () => calls++ === 0 ? baseStatus : { ...baseStatus, ahead: 1, behind: 1 };
  assert.equal((await fake.squashPreflight()).state, "diverged");
  calls = 0;
  fake.status = async () => calls++ === 0 ? baseStatus : { ...baseStatus, behind: 1 };
  assert.equal((await fake.squashPreflight()).state, "behind");
});

test("Git parsing helpers reject unsafe paths and preserve status metadata", () => {
  const g = gitServiceTestInternals;
  const history = g.parseGitHistory(
    "abcdef123456\u001fabcdef1\u001f2026-08-04T00:00:00Z\u001fBackup\ninvalid",
    "pages/page.md",
    { pageId: "p1", title: "Page" }
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].message, "Backup");
  assert.deepEqual(g.diffGitPageHistoryLines("same\nold", "same\nnew\nextra"), [
    { type: "same", text: "same" },
    { type: "removed", text: "old" },
    { type: "added", text: "new" },
    { type: "added", text: "extra" }
  ]);
  assert.equal(g.normalizeWorkspaceRelativeGitPath("pages/../page.md"), "page.md");
  assert.throws(() => g.normalizeWorkspaceRelativeGitPath(""), /workspace-relative/);
  assert.throws(() => g.normalizeWorkspaceRelativeGitPath("/tmp/page.md"), /workspace-relative/);
  assert.throws(() => g.normalizeWorkspaceRelativeGitPath("../page.md"), /stay inside/);
  assert.equal(g.normalizeGitObjectName("aBcD1234"), "aBcD1234");
  assert.throws(() => g.normalizeGitObjectName("xyz"), /Invalid Git revision/);
  assert.deepEqual(g.parsePorcelainStatus("## main...origin/main [ahead 2, behind 3]\n M page.md\n?? new.md\n"), {
    dirtyCount: 2,
    branch: "main",
    ahead: 2,
    behind: 3
  });
  assert.deepEqual(g.parseBranchLine("## No commits yet on feature"), { branch: "feature" });
  assert.deepEqual(g.parseBranchLine(undefined), {});
  assert.equal(g.gitEnvironment({ sshKeyPath: "", branch: "", remoteUrl: "", autoBackupCadence: "off", autoPushCadence: "off", automationPaused: false, commitMessagePrefix: "" }), undefined);
  assert.match(g.gitEnvironment({ sshKeyPath: "/tmp/a'b", branch: "", remoteUrl: "", autoBackupCadence: "off", autoPushCadence: "off", automationPaused: false, commitMessagePrefix: "" }).GIT_SSH_COMMAND, /IdentitiesOnly/);
  assert.equal(g.quoteSshCommandArg("a'b"), "'a'\\''b'");
});

test("Notion import entity maps preserve parents, links, relations, and blank-row rules", () => {
  const n = notionImportTestInternals;
  const pathIndex = n.buildImportEntityPathIndex(
    [{ id: "p-root", title: "Root", path: ["Root"] }, { id: "p-child", title: "Child", path: ["Root", "Child"] }],
    [{ id: "db1", name: "Tasks", path: ["Root", "Tasks"], rowPlans: [{ rowId: "r1", title: "Ship" }] }]
  );
  assert.equal(n.importEntityParent(pathIndex, ["Root", "Child"], "p-child").id, "p-root");
  n.registerImportEntityPath(pathIndex, ["Root"], { id: "p-other", kind: "page" });
  assert.equal(n.importEntityParent(pathIndex, ["Root", "Child"], "p-child"), undefined);

  const duplicateDatabases = new Map([
    ["aaaaaaaa11111111", { title: "Tasks", rawTitle: "Tasks", path: ["Root", "Tasks"], hash: "aaaaaaaa11111111", csvPath: "/a.csv" }],
    ["bbbbbbbb22222222", { title: "Tasks", rawTitle: "Tasks", path: ["Root", "Tasks"], hash: "bbbbbbbb22222222", csvPath: "/b.csv" }],
    ["cccccccc33333333", { title: "Notes", rawTitle: "Notes", path: ["Root", "Notes"], hash: "cccccccc33333333", csvPath: "/c.csv" }]
  ]);
  n.disambiguateDatabaseDisplayTitles(duplicateDatabases);
  assert.match(duplicateDatabases.get("aaaaaaaa11111111").title, /aaaaaaaa/);
  assert.equal(duplicateDatabases.get("cccccccc33333333").title, "Notes");
  assert.deepEqual(n.orderVisibleFieldsByContentRichness([
    { title: "A", body: "Long detailed body", tag: "x" },
    { title: "B", body: "Another detailed body", tag: "x" }
  ], ["tag", "body", "title", "original_notion_html", "original_notion_csv"]), ["title", "body", "tag", "original_notion_html", "original_notion_csv"]);

  const targets = n.buildImportEntityTargetMap(
    [{ id: "p1", title: "Page", path: ["Root", "Page"] }],
    [{ id: "db1", name: "Tasks", path: ["Root", "Tasks"], rowPlans: [{ rowId: "r1", fileName: "row.md", title: "Ship" }] }],
    (id) => `databases/${id}`
  );
  const pageTarget = [...targets].find(([, ref]) => ref.entityId === "p1")[0];
  const rowTarget = [...targets].find(([, ref]) => ref.entityId === "r1")[0];
  const refs = n.parseImportedEntityRefs(`[Page](${pageTarget}); Ship (${rowTarget}); [Duplicate](${pageTarget})`, targets);
  assert.deepEqual(refs.map((ref) => ref.entityId), ["p1", "r1"]);
  const relationPlan = { fields: [{ id: "relation", type: "entity_ref" }, { id: "text", type: "text" }], records: [{ relation: `[Page](${pageTarget})`, text: "keep" }, { relation: "missing" }] };
  n.upgradeEntityRefFields(relationPlan, targets);
  assert.match(relationPlan.records[0].relation, /"entityId":"p1"/);
  assert.equal(relationPlan.records[1].relation, "missing");

  const hash = "0123456789abcdef0123456789abcdef";
  const linkedRecords = [{ csvPath: "/tmp/export/Tasks.csv", records: [{ body: `[Page](notion-hash:${hash})`, plain: "text" }] }];
  n.rewriteRecordNotionLinks(linkedRecords, new Map([[`notion-hash:${hash}`, "lotion://page/p1"]]));
  assert.equal(linkedRecords[0].records[0].body, "[Page](lotion://page/p1)");
  assert.equal(n.resolveLocalNotionTarget("#anchor", new Map(), "/tmp"), null);
  assert.equal(n.resolveLocalNotionTarget("https://example.com/a.html", new Map(), "/tmp"), null);
  assert.equal(n.resolveLocalNotionTarget(`Page ${hash}.html`, new Map(), undefined), `https://www.notion.so/${hash}`);

  const blankFields = [
    { id: "title", name: "Name" },
    { id: "created", name: "Created time" },
    { id: "hidden", name: "Hidden", hidden: true },
    { id: "system", name: "System", system: true }
  ];
  assert.equal(n.isBlankImportedRowRecord({ title: "Untitled", created: "2026-01-01", hidden: "x", system: "x" }, blankFields), true);
  assert.equal(n.isBlankImportedRowRecord({ title: "Material" }, blankFields), false);
});

test("Notion import report reconciles counts and emits actionable review detail", () => {
  const n = notionImportTestInternals;
  const inventory = {
    pagesByHash: new Map([["p", { title: "Same", hash: "p", sourcePath: "/source/page.md" }]]),
    databasesByHash: new Map([["d", { title: "Same", rawTitle: "Same", path: ["Same"], hash: "d", csvPath: "/source/db.csv" }]]),
    rowsByKey: new Map([["r", { dbHash: "d", title: "Row", hash: "r", sourcePath: "/source/row.md" }]]),
    attachments: new Map([["a", { sourcePaths: ["/source/a.png", "/source/a-copy.png"], fileName: "a.png" }]]),
    formats: { markdown: 1, html: 1, csv: 1 }
  };
  const choice = {
    kept: ["d"],
    preview: [{ title: "Same", rows: 4, userFields: 2 }],
    rowCounts: new Map([["d", 4]]),
    fieldCounts: new Map([["d", 2]])
  };
  const importedPages = [
    { id: "p1", title: "Same", hash: "p1", path: ["Same"], source: "/source/one.md", target: "pages/one.md", icon: "📝" },
    { id: "p2", title: " Same ", hash: "p2", path: ["Same"], source: "/source/two.md", target: "pages/two.md" }
  ];
  const databases = [
    { id: "db1", name: "Same", originalName: "Same", path: ["Same"], source: "/source/db.csv", notionId: "d1", sourceRows: 3, rows: 2, rowsWithIcon: 1, rowPages: 1, fields: 5, userFields: 2, visibleFields: 2, skippedEmptyRowPages: 1, includeInManifest: true, icon: "📋" },
    { id: "db2", name: "Same copy", originalName: "Same", path: ["Same copy"], source: "/source/db2.csv", notionId: "d2", sourceRows: 1, rows: 1, rowsWithIcon: 0, rowPages: 0, fields: 4, userFields: 1, visibleFields: 1, skippedEmptyRowPages: 0, includeInManifest: true }
  ];
  const review = { databaseId: "review", databaseName: "Import review", databasePath: "lotion://database/review", totalIssues: 3, dedupedPages: 1, emptyStandalonePages: 1, emptyRowPages: 1 };
  const timings = { prepareTargetMs: 1, resolveSourcesMs: 2, indexSourcesMs: 3, selectDatabasesMs: 4, planAndParseMs: 5, writeWorkspaceMs: 6, totalMs: 21 };
  const stats = n.makeImportStats(["/source"], inventory, choice);
  const report = n.buildImportReportSummary({
    now: "2026-08-04T00:00:00.000Z",
    target: "/tmp/Lotion",
    sources: ["/source"],
    inventory,
    stats,
    importedPages,
    databases,
    parsedRowsDone: 1,
    parsedRowsTotal: 2,
    review,
    timings
  });
  assert.equal(report.status, "complete_with_warnings");
  assert.equal(report.counts.rows, 3);
  assert.equal(report.nameConflicts.pageGroups, 1);
  assert.equal(report.nameConflicts.databaseGroups, 1);
  assert.equal(report.nameConflicts.crossTypeGroups, 1);
  assert.equal(report.icons.rowsWithoutIcon, 2);
  assert.equal(report.warnings.length, 2);

  const dedupedPages = [
    { title: "Same", id: "p2", hash: "p2", source: "/source/two.md", target: "pages/one.md", reason: "same Notion page hash" },
    { title: "Same", source: "/source/three.md", target: "pages/one.md", reason: "same cleaned title and body" },
    { title: "Wrapper", source: "/source/wrapper.md", target: "lotion-db:db1", reason: "standalone Notion database wrapper" }
  ];
  const emptyStandalonePages = [{ title: "", source: "/source/empty.md", target: "pages/empty.md", reason: "empty body" }];
  const emptyRowPages = [
    { database: "Same", databaseId: "db1", rowId: "r1", title: "Blank", hash: "r1", source: "/source/r1.md", target: "rows/r1.md", reason: "empty body and fields" },
    { database: "Same", databaseId: "db1", rowId: "r2", title: "", source: "", target: "rows/r2.md", reason: "empty body and fields" }
  ];
  const duplicateRows = n.buildDuplicateRowSummaries([{ id: "db1", name: "Same", fields: [{ id: "title", name: "Name" }, { id: "value", name: "Value" }, { id: "created_time", name: "Created", system: true }], records: [
    { id: "r1", title: "Duplicate", value: " A ", created_time: "1" },
    { id: "r2", title: "duplicate", value: "a", created_time: "2" },
    { id: "r3", title: "Untitled", value: "" }
  ] }]);
  assert.equal(duplicateRows[0].count, 2);
  const issues = n.buildImportReviewIssues({ now: "2026-08-04T00:00:00.000Z", dedupedPages, emptyStandalonePages, emptyRowPages });
  assert.deepEqual(issues.map((issue) => issue.id), ["issue_000001", "issue_000002", "issue_000003", "issue_000004", "issue_000005", "issue_000006"]);

  const markdown = n.buildImportReportMarkdown({
    now: "2026-08-04T00:00:00.000Z",
    target: "/tmp/Lotion",
    sources: ["/source"],
    options: { skipEmptyRowsAndPages: true, dedupeMarkdownFiles: true, includeOriginalHtml: true },
    inventory,
    choice,
    pagePlans: 2,
    pageRecords: 5,
    importedPages,
    importedRows: [],
    databases,
    manifestDatabases: 2,
    parsedRowsDone: 1,
    parsedRowsTotal: 2,
    skippedDuplicateStandalonePages: 3,
    skippedEmptyStandalonePages: 1,
    syntheticEmptyDatabases: 1,
    inlineEmptyDatabases: 1,
    rewrites: 5,
    duplicatePageRedirects: 2,
    phantomPageRedirects: 1,
    originalSourceFiles: 3,
    reportPageId: "report",
    reportBodyPath: "pages/report.md",
    review,
    dedupedPages,
    emptyStandalonePages,
    emptyRowPages,
    duplicateRows,
    report
  });
  assert.match(markdown, /## Same-name Pages And Databases/);
  assert.match(markdown, /Possible Duplicate Rows/);
  assert.match(markdown, /same Notion page hash/);
  assert.match(markdown, /Fast scan row estimate/);
  assert.deepEqual(n.formatSummaryOverflowNote(25), []);
  assert.equal(n.formatSummaryOverflowNote(1_000).length, 2);
  assert.equal(n.formatGroupedSummaryTable(["A"], [], () => [], "empty"), "empty");
  const examples = [];
  for (const value of ["a", "a", "b", "c", "d", "e", "f"]) n.pushExample(examples, value);
  assert.deepEqual(examples, ["a", "b", "c", "d", "e"]);
});

test("collection resolver selects only unambiguous imported databases", () => {
  const title = "Tasks";
  const titleKey = Buffer.from(title).toString("base64").replace(/=+$/, "");
  assert.equal(resolveNotionCollectionRewrite(new Map([["notion-db-id:full", "db1"]]), "full", title), "lotion-db:db1");
  assert.equal(resolveNotionCollectionRewrite(new Map([["notion-db:full", "lotion://database/db1"]]), "full", title), "lotion://database/db1");
  assert.equal(resolveNotionCollectionRewrite(new Map([["notion-row-db-id:r1", "db1"]]), "missing", title, { rowHashes: ["R1"] }), "lotion-db:db1");
  assert.equal(resolveNotionCollectionRewrite(new Map([["notion-row-db-id:r1", "db1"], ["notion-row-db-id:r2", "db2"]]), "missing", title, { rowHashes: ["r1", "r2"] }), null);
  const shortHref = "../Workspace abcd-7890.csv";
  assert.equal(resolveNotionCollectionRewrite(new Map([["notion-db-short-id:abcd7890", "db3"]]), "missing", title, { rowHrefs: [shortHref] }), "lotion-db:db3");
  assert.equal(resolveNotionCollectionRewrite(new Map([[`notion-db-title-id:${titleKey}`, "db4"]]), "missing", title), "lotion-db:db4");
  assert.equal(resolveNotionCollectionRewrite(new Map([[`notion-db-title:${titleKey}`, "lotion://database/db5"]]), "missing", title), "lotion://database/db5");
  assert.equal(resolveNotionCollectionRewrite(new Map(), "missing", ""), null);
});

test("external embedding provider validates configuration and response shapes", async () => {
  const Provider = advancedSearchTestInternals.OpenAICompatibleEmbeddingProvider;
  const provider = new Provider();
  const config = { provider: "openai-compatible", baseUrl: "https://embed.example/", model: "embed", apiKey: "secret", dimensions: 2, vectorStore: "json" };
  await assert.rejects(provider.embed(["text"], { ...config, apiKey: "" }), (error) => error.code === "not_configured");
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 429 });
    await assert.rejects(provider.embed(["text"], config), (error) => error.code === "rate_limited");
    globalThis.fetch = async () => new Response("provider down", { status: 500 });
    await assert.rejects(provider.embed(["text"], config), (error) => error.code === "provider_error" && /provider down/.test(error.message));
    globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    await assert.rejects(provider.embed(["text"], config), /unexpected vector count/);
    let request;
    globalThis.fetch = async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ data: [{ embedding: [3, 4] }, { embedding: [0, 0] }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    assert.deepEqual(await provider.embed(["one", "two"], config), [[0.6, 0.8], [0, 0]]);
    assert.equal(request.url, "https://embed.example/embeddings");
    assert.equal(request.init.headers.authorization, "Bearer secret");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub backup helpers serialize deterministically and report API failures", async () => {
  const g = gitHubBackupTestInternals;
  assert.deepEqual(g.parseRepository(" owner/repo "), { owner: "owner", name: "repo" });
  assert.equal(g.parseRepository("https://github.com/owner/repo"), null);
  assert.match(g.contentsUrl({ repository: "owner/repo" }, "pages/a b.md", "main"), /owner\/repo\/contents\/pages\/a%20b.md\?ref=main/);
  assert.throws(() => g.contentsUrl({ repository: "bad" }, "a"), GitHubBackupError);
  assert.match(g.githubApiUrl("/repos/o/r", { empty: "", ref: "main" }), /ref=main/);
  assert.equal(g.rowTitle({ Name: "Named" }, { title: "Meta" }), "Named");
  assert.equal(g.rowTitle({ id: "r1" }, { title: "" }), "r1");
  assert.equal(g.stableJson({ z: 1, a: { d: 2, c: 1 }, rows: [{ b: 2, a: 1 }] }), '{\n  "a": {\n    "c": 1,\n    "d": 2\n  },\n  "rows": [\n    {\n      "a": 1,\n      "b": 2\n    }\n  ],\n  "z": 1\n}\n');
  assert.equal(g.sortJson(null), null);
  const unicode = "Lotion 中文";
  assert.equal(g.decodeBase64(` \n${g.encodeBase64(unicode)}\n`), unicode);
  assert.equal(g.makeCommitSha("same"), g.makeCommitSha("same"));
  assert.notEqual(g.makeCommitSha("same"), g.makeCommitSha("different"));
  assert.deepEqual(await g.parseGitHubResponse(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } })), { ok: true });
  await assert.rejects(g.parseGitHubResponse(new Response("denied", { status: 500, statusText: "Server error" })), /GitHub API failed \(500\): denied/);
});

test("Node search fallback scans supported workspace files and enforces its hit cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-node-search-"));
  const service = new SearchService({ requirePaths: () => ({ root }) });
  try {
    assert.deepEqual(await service.runNodeSearch("needle", root), { hits: [], truncated: false });
    const pages = join(root, "databases", "user", "Tasks--db1", "pages");
    await mkdir(pages, { recursive: true });
    await writeFile(join(pages, "one.md"), "Needle uppercase\nneedle twice needle\n", "utf8");
    await writeFile(join(root, "databases", "user", "Tasks--db1", "data.csv"), "id,title\n1,needle row\n", "utf8");
    await writeFile(join(root, "databases", "user", "Tasks--db1", "schema.json"), '{"name":"needle schema"}\n', "utf8");
    await writeFile(join(pages, "ignored.txt"), "needle", "utf8");

    const insensitive = await service.runNodeSearch("needle", root);
    assert.equal(insensitive.truncated, false);
    assert.equal(insensitive.hits.length, 4);
    assert.deepEqual(insensitive.hits.find((hit) => hit.text.startsWith("needle twice")).ranges, [{ start: 0, end: 6 }, { start: 13, end: 19 }]);
    const sensitive = await service.runNodeSearch("Needle", root);
    assert.equal(sensitive.hits.length, 1);

    for (let index = 0; index < 25; index += 1) {
      await writeFile(join(pages, `bulk-${index}.md`), `${"needle\n".repeat(20)}`, "utf8");
    }
    const capped = await service.runNodeSearch("needle", root);
    assert.equal(capped.truncated, true);
    assert.equal(capped.hits.length, 500);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search service projects pages, rows, metadata, links, and sort modes", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-query-"));
  try {
    const workspaceRoot = join(root, "Workspace");
    const workspace = new WorkspaceService(new AppConfigService(join(root, "config.json")));
    await workspace.createAt(workspaceRoot, { name: "Search Space" });
    const pages = new PageService(workspace);
    const target = await pages.create({ title: "Reference Destination", path: ["Search", "Reference Destination"] });
    const source = await pages.create({ title: "Needle Source", path: ["Search", "Needle Source"] });
    await pages.update(source.meta.id, {
      markdown: `# Needle Source\n\nA searchable phrase in the page body.\n\n[Destination](${pageBodyPath(target.meta.id, target.meta.title)})`
    });
    const databases = new DatabaseService(workspace);
    await databases.create({
      name: "Search Projects",
      path: ["Search", "Search Projects"],
      template: {
        fields: [
          { id: "notes", name: "Notes", type: "text" },
          { id: "related", name: "Related", type: "entity_ref" }
        ],
        rows: [{ title: "Needle Row", notes: "Distinct searchable database content", related: JSON.stringify([{ entityId: target.meta.id, kind: "page" }]) }]
      }
    });

    const search = new SearchService(workspace);
    assert.deepEqual(await search.query("   "), { hits: [], truncated: false });
    const direct = await search.query("Needle");
    assert.ok(direct.hits.some((hit) => hit.kind === "page" && hit.title === "Needle Source"));
    assert.ok(direct.hits.length > 0);
    const content = await search.query("searchable database", { sort: "created_asc" });
    assert.ok(content.hits.length > 0);
    const metadata = await search.query("Reference Destination", { sort: "updated_desc" });
    assert.ok(metadata.hits.some((hit) => hit.kind === "page" && hit.pageId === target.meta.id));
    const loose = await search.query("need sou", { sort: "created_desc" });
    assert.ok(loose.hits.some((hit) => hit.kind === "page"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search service deterministically projects every indexed entity and reference route", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-search-projection-"));
  try {
    const systemPagesFolder = "pages--db_pages";
    const tasksFolder = "Tasks--db_tasks";
    const sourcePath = `databases/system/${systemPagesFolder}/pages/Needle_Source--source.md`;
    const targetPath = `databases/system/${systemPagesFolder}/pages/Linked_Target--target.md`;
    const linkedOnlyPath = `databases/system/${systemPagesFolder}/pages/Markdown_Target--linked.md`;
    const rowPath = `databases/user/${tasksFolder}/pages/Needle_Row--row-1.md`;
    await mkdir(join(root, "databases", "system", systemPagesFolder, "pages"), { recursive: true });
    await writeFile(join(root, sourcePath), `[linked](${linkedOnlyPath})`, "utf8");

    const pagesDb = {
      id: "pages",
      name: "Pages",
      icon: "emoji:page",
      fieldIds: ["id", "title", "page_file", "created_time", "updated_time", "row_icon"],
      fieldNames: ["ID", "Name", "Page", "Created", "Updated", "Icon"],
      titleCol: 1,
      pageFileCol: 2
    };
    const tasksDb = {
      id: "db_tasks",
      name: "Needle Database",
      icon: "emoji:db",
      fieldIds: ["id", "title", "page_file", "notes", "created_time", "updated_time", "row_icon"],
      fieldNames: ["ID", "Name", "Page", "Notes", "Created", "Updated", "Icon"],
      titleCol: 1,
      pageFileCol: 2
    };
    const entity = (overrides) => ({
      id: "",
      kind: "page",
      title: "",
      icon: "",
      createdTime: "2026-08-01T00:00:00.000Z",
      updatedTime: "2026-08-02T00:00:00.000Z",
      databaseId: "",
      rowId: "",
      bodyPath: "",
      path: "",
      ...overrides
    });
    const entities = [
      entity({ id: "db_tasks", kind: "database", title: "Needle Database", icon: "emoji:db", databaseId: "db_tasks", path: "Root / Needle Database" }),
      entity({ id: "row-1", kind: "row", title: "Needle Row", icon: "emoji:row", databaseId: "db_tasks", rowId: "row-1", bodyPath: rowPath, path: "Root / Needle Database / Needle Row" }),
      entity({ id: "source", title: "Needle Source", bodyPath: sourcePath, path: "Root / Needle Source" }),
      entity({ id: "target", title: "Linked Target", bodyPath: targetPath, path: "Root / Linked Target" }),
      entity({ id: "linked", title: "Markdown Target", bodyPath: linkedOnlyPath, path: "Root / Markdown Target" })
    ];
    const byId = new Map(entities.map((item) => [item.id, item]));
    const byBodyPath = new Map(entities.filter((item) => item.bodyPath).map((item) => [item.bodyPath, item]));
    const cache = {
      root,
      databases: new Map([[systemPagesFolder, pagesDb], [tasksFolder, tasksDb]]),
      databasesById: new Map([[pagesDb.id, pagesDb], [tasksDb.id, tasksDb]]),
      pages: new Map([["source", "Needle Source"], ["target", "Linked Target"], ["linked", "Markdown Target"]]),
      rowTitlesByDb: new Map([[tasksFolder, new Map([["Needle_Row--row-1.md", "Needle Row"]])]]),
      entities: {
        byId,
        byBodyPath,
        byRowKey: new Map([["db_tasks:row-1", byId.get("row-1")]]),
        byDatabaseId: new Map([["db_tasks", byId.get("db_tasks")]])
      },
      relationIdsByEntityId: new Map([["source", ["db_tasks", "row-1", "target", "source", "missing"]]])
    };
    const search = new SearchService({ requirePaths: () => ({ root }) });

    const metadata = search.metadataHits("Needle", cache);
    assert.deepEqual(new Set(metadata.map((hit) => hit.kind)), new Set(["database", "row", "page"]));
    const linked = await search.linkedPageHits("Needle", root, cache, [
      { path: sourcePath, line: 1, text: "Needle", ranges: [{ start: 0, end: 6 }] },
      { path: "databases/user/not-markdown.csv", line: 2, text: "Needle", ranges: [] }
    ], metadata);
    assert.ok(linked.some((hit) => hit.kind === "database" && hit.databaseId === "db_tasks"));
    assert.ok(linked.some((hit) => hit.kind === "row" && hit.rowId === "row-1"));
    assert.ok(linked.some((hit) => hit.kind === "page" && hit.pageId === "target"));
    assert.ok(linked.some((hit) => hit.kind === "page" && hit.pageId === "linked"));

    const raw = (path, line, text, start = 0, end = text.length) => ({
      path,
      line,
      text,
      ranges: [{ start, end }]
    });
    const projections = [
      search.enrich(raw(sourcePath, 1, "Needle page body"), cache, "Needle"),
      search.enrich(raw(rowPath, 1, "Needle row body"), cache, "Needle"),
      search.enrich(raw(`databases/user/${tasksFolder}/pages/Unknown--unknown.md`, 1, "Needle orphan body"), cache, "Needle"),
      search.enrich(raw(`databases/system/${systemPagesFolder}/data.csv`, 2, "source,Needle Source,Needle_Source--source.md,2026-08-01,2026-08-02,emoji:page"), cache, "Needle"),
      search.enrich(raw(`databases/user/${tasksFolder}/data.csv`, 2, "row-1,Needle Row,Needle_Row--row-1.md,Needle notes,2026-08-01,2026-08-02,emoji:row"), cache, "Needle"),
      search.enrich(raw(`databases/user/${tasksFolder}/schema.json`, 1, "Needle schema"), cache, "Needle")
    ];
    assert.deepEqual(projections.map((hit) => hit?.kind), ["page", "row", "rowPage", "page", "row", "database"]);
    assert.equal(search.enrich(raw(`databases/user/${tasksFolder}/data.csv`, 1, "id,title"), cache, "Needle"), null);
    assert.equal(search.enrich(raw("README.md", 1, "Needle"), cache, "Needle"), null);
    assert.equal(search.enrichHits([
      raw(sourcePath, 1, "Needle Source"),
      raw(`databases/user/${tasksFolder}/pages/Unknown--unknown.md`, 2, "Unrelated words")
    ], cache, "Needle Source").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Notion audit helpers normalize exported values, paths, refs, and resources", async () => {
  const a = notionAuditTestInternals;
  assert.equal(a.formatKindSummary({ missing: 2, invalid: 1 }), "missing=2, invalid=1");
  assert.equal(a.formatKindMarkdown({}), "None");
  assert.match(a.formatKindMarkdown({ missing: 2 }), /missing: 2/);
  assert.equal(a.formatItemsMarkdown([], 3), "None");
  assert.equal(a.formatItemsMarkdown([{ kind: "bad\nkind", source: " a ", message: "broken\nvalue" }], 1), "- [bad kind] a: broken value");
  assert.equal(a.sanitizeMarkdownCell(" a\n b "), "a b");
  const options = a.normalizeAuditInput({ sourcePaths: [".", ""], workspacePath: ".", csvFilters: ["*", ""], htmlFilters: ["x", ""], auditAllHtml: 1, keepEmptyRows: 1, maxRowExplosion: 9, maxIssues: 0 });
  assert.equal(options.sourceRoots.length, 1);
  assert.deepEqual(options.csvFilters, ["*"]);
  assert.equal(options.maxStoredItems, 1);

  const root = await mkdtemp(join(tmpdir(), "lotion-audit-files-"));
  try {
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "a.csv"), "a,b\n1,2\n", "utf8");
    await writeFile(join(root, "nested", "b.html"), "<html></html>", "utf8");
    await writeFile(join(root, ".DS_Store"), "ignored", "utf8");
    assert.deepEqual((await a.listFiles(root, a.isSourceFileCandidate)).map((path) => path.slice(root.length + 1)).sort(), ["a.csv", "nested/b.html"]);
    assert.deepEqual(await a.listFiles(join(root, "missing"), () => true), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }

  const candidate = { hash: "abcdef", path: "/Export/Tasks.csv", rel: "Tasks.csv", displayName: "Tasks" };
  assert.equal(a.matchesSourceFilter(candidate, "*"), true);
  assert.equal(a.matchesSourceFilter(candidate, "tasks"), true);
  assert.equal(a.matchesSourceFilter(candidate, "missing"), false);
  assert.equal(a.uniqueCount([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => String(item.id)), 2);
  assert.equal(a.htmlBodyText("<header>Title</header><div class=\"page-body\"><style>x</style><p>Hello &amp; world</p></article>"), "Hello & world");
  const hash = "0123456789abcdef0123456789abcdef";
  assert.equal(a.htmlNotionHash(`<article id="${hash}">`), hash);
  assert.equal(a.htmlNotionHash(`<h1 class="page-title" id="01234567-89ab-cdef-0123-456789abcdef">`), hash);
  assert.equal(a.firstUsefulSnippet("Short. This sentence is definitely long enough to keep."), "This sentence is definitely long enough to keep.");
  assert.equal(a.firstUsefulSnippet("short"), "");

  for (const [source, imported] of [
    ["$1,234.00", "1234.00"],
    ["A; B", "B,A"],
    ["2026-08-04", "August 4, 2026"],
    ["yes", "true"],
    ["[Task](https://example.com/task)", "Task"]
  ]) assert.equal(a.compatibleValue(source, imported), true);
  assert.equal(a.compatibleValue("alpha", "beta"), false);
  assert.deepEqual(["(1,234.5)", "+2", "10%", "bad", ".5"].map(a.canonicalNumber), ["-1234.5", "2", "", "", ".5"]);
  assert.deepEqual(["", "https://example.com", "mailto:a@example.com", "javascript:bad", "not a url"].map(a.isValidUrlCell), [true, true, true, false, false]);
  assert.deepEqual(["yes", "☑", "no", "☐", "maybe"].map(a.canonicalCheckbox), ["true", "true", "false", "false", ""]);
  assert.equal(a.isCanonicalCheckboxCell(" true "), true);
  assert.equal(a.isCanonicalCheckboxCell("yes"), false);
  assert.equal(a.canonicalDisplayValue("[Task](https://x) ; Other (https://y)"), "Task;Other");
  assert.equal(a.sameOptionSet("B;A", "A,B"), true);
  assert.equal(a.sameOptionSet("A", "A"), false);
  assert.deepEqual(a.optionSet(" B; A "), ["A", "B"]);
  assert.deepEqual(a.optionCellValues("B;A", "multi_select"), ["B", "A"]);
  assert.deepEqual(a.optionCellValues("A", "select"), ["A"]);
  assert.equal(a.decodeHtml("&lt;a&gt;&amp;&quot;&#39;&nbsp;"), "<a>&\"' ");
  assert.deepEqual(a.parseCsv('\uFEFFa,b\n"x,y","q""z"\n\n'), [["a", "b"], ["x,y", 'q"z']]);
  assert.ok(a.scoreCsvCandidate({ isAll: true, size: 1 }) > a.scoreCsvCandidate({ isAll: false, size: 999 }));
  assert.equal(a.notionFileHash(`/Tasks ${hash}_all.csv`), hash);
  assert.equal(a.extractNotionHash(undefined), "");
  assert.equal(a.logicalPath(`/tmp/Export-abc/Folder/Page ${hash}.html`), `Folder/Page ${hash}.html`);
  assert.equal(a.notionPathSegment(`Page%20Name ${hash}`), "Page Name");
  assert.deepEqual(a.normalizePathSegments([], ""), ["Untitled database"]);
  assert.deepEqual(a.schemaPathSegments({ name: "Tasks" }), ["Tasks"]);
  assert.equal(a.sameStringArray(["a"], ["a"]), true);
  assert.equal(a.sameStringArray(["a"], ["b"]), false);
  assert.equal(a.contentDigest("x"), a.contentDigest("x"));

  const fieldMap = new Map([["Name", "title"], ["Tags", "tags"]]);
  const sourceRow = { byHeader: new Map([["Name", " Task "], ["Tags", "B;A"]]) };
  const importedRow = { record: { title: "Task", tags: "A; B" } };
  assert.equal(a.sourceRowFingerprint(["Name", "Tags"], sourceRow, fieldMap), a.importedRowFingerprint(["Name", "Tags"], importedRow, fieldMap));
  assert.equal(a.titleMatchKey(" [Task](https://x) "), "task");
  const rows = [{ id: 1 }, { id: 2 }];
  assert.equal(a.nextUnusedIndex(rows, 0, new Set([rows[0]])), 1);
  assert.equal(a.normalizeNotionHash("01234567-89ab-cdef-0123-456789abcdef"), hash);
  assert.equal(a.normalizeNotionHash("bad"), "");
  assert.equal(a.isAccountedImportReviewRecord({ issue_type: "Empty row page body" }), true);
  assert.equal(a.isAccountedImportReviewRecord({ issue_type: "Other" }), false);
  assert.deepEqual(a.parseEntityRefAuditValue(JSON.stringify({ entityId: "p1", kind: "page" })), { ok: true, refs: [{ entityId: "p1", kind: "page" }] });
  assert.deepEqual(a.parseEntityRefAuditValue('{"entityId":"","kind":"page"}'), { ok: false });
  assert.deepEqual(a.parseEntityRefAuditValue("bad"), { ok: false });
  assert.deepEqual(a.extractHtmlResourceRefs('<img src="images/a%20b.png?x=1"><a href="images/a%20b.png"><a href="#x"><a href="https://x">'), ["images/a b.png"]);
  assert.equal(a.safeDecodeUri("%zz"), "%zz");
  assert.deepEqual(a.uniqueStrings(["a", "a", "b"]), ["a", "b"]);
  const map = new Map();
  a.pushMap(map, "k", 1);
  a.pushMap(map, "k", 2);
  assert.deepEqual(map.get("k"), [1, 2]);
  assert.deepEqual(a.uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], (item) => String(item.id)), [{ id: 1 }, { id: 2 }]);
  assert.equal(a.isBlank(" \n "), true);
  assert.match(a.quote("x".repeat(130)), /\.\.\."$/);
});

test("database helper contract sanitizes views, fields, templates, and batch values", () => {
  const d = databaseServiceTestInternals;
  const now = "2026-08-04T00:00:00.000Z";
  const fields = [
    { id: "id", name: "ID", type: "id", system: true },
    { id: "created_time", name: "Created", type: "created_time", system: true },
    { id: "title", name: "Name", type: "text" },
    { id: "url", name: "Website URL", type: "text" },
    { id: "status", name: "Status", type: "select", options: [{ id: "ready", name: "Ready", color: "green" }] },
    { id: "tags", name: "Tags", type: "multi_select", options: [{ id: "a", name: "A", color: "blue" }] },
    { id: "formula", name: "Formula", type: "formula", formula: "title + url" },
    { id: "hidden", name: "Hidden", type: "text", hidden: true }
  ];
  const schema = { id: "db1", name: "Tasks", created_time: now, updated_time: now, fields, defaultViewId: "view_all", templates: [{ id: "tpl1", name: "Default", values: {}, fullWidth: false }] };
  const records = [{ id: "r1", title: "One", url: "https://example.com", status: "Bad", tags: "A;Bad" }, { id: "r2", title: "Two", url: "example.org", status: "Ready", tags: "A" }];
  const migrated = d.migrateLegacyUrlFields(schema, records);
  assert.equal(migrated.changed, true);
  assert.equal(migrated.schema.fields.find((field) => field.id === "url").type, "url");
  assert.equal(d.migrateLegacyUrlFields(schema, [{ url: "not a url" }]).changed, false);
  assert.equal(d.looksLikeUrlField({ id: "link", name: "链接", type: "text" }), true);
  assert.deepEqual(["https://x", "example.com", "bad value"].map(d.looksLikeUrlValue), [true, true, false]);

  const statsSchema = d.createDatabaseStatsSchema(now);
  assert.equal(statsSchema.fields.length, 9);
  assert.equal(d.normalizeDatabaseStatsSchema({ ...statsSchema, id: "bad", fields: [] }, "later").changed, true);
  assert.equal(d.createDatabaseStatsDefaultView().sorts[0].direction, "desc");
  const statsRecord = d.databaseStatsToRecord({ id: "db1", pageCount: 3, nonEmptyPageCount: 2, fieldCount: 4 }, schema, now);
  assert.deepEqual(d.recordToDatabaseStats(statsRecord), { id: "db1", pageCount: 3, nonEmptyPageCount: 2, fieldCount: 4, refreshedAt: now });
  assert.deepEqual([2, "3", "bad"].map(d.numberCell), [2, 3, 0]);
  assert.equal(d.templateHeaders().length, 7);
  assert.equal(d.withTemplateDefaults({ id: "tpl" }).full_width, false);
  assert.deepEqual(d.parseTemplateValues('{"a":1,"b":true,"c":null,"bad":[]}'), { a: 1, b: true, c: null });
  assert.deepEqual(d.parseTemplateValues("bad"), {});
  assert.equal(d.parseBooleanCell("true"), true);
  assert.equal(d.parseBooleanCell("false"), false);
  assert.equal(d.withoutSchemaTemplates(schema).templates, undefined);
  assert.equal(d.withoutSchemaTemplates({ ...schema, templates: undefined }).id, "db1");
  assert.deepEqual(d.normalizeDatabasePath({ ...schema, path: [" "] }).path, ["Tasks"]);
  assert.deepEqual(d.normalizePathSegments(undefined, ""), ["Untitled Database"]);

  const defaultView = d.createDefaultTableView(schema, records);
  const blankView = d.createBlankTableView(schema, "Blank");
  assert.equal(defaultView.visibleFieldIds[0], "title");
  assert.equal(blankView.name, "Blank");
  const createdViews = d.ensureCreatedTimeSortViews(schema, records, [defaultView]);
  assert.equal(createdViews.changed, true);
  assert.equal(createdViews.views.length, 3);
  assert.equal(d.ensureCreatedTimeSortViews({ ...schema, fields: fields.filter((field) => field.id !== "created_time") }, records, [defaultView]).changed, false);
  assert.deepEqual(d.createCreatedTimeSortView(schema, records, "asc").sorts, [{ fieldId: "created_time", direction: "asc" }]);
  assert.deepEqual(d.createdTimeVisibleFieldIds(schema, records).slice(0, 2), ["title", "created_time"]);

  const dirtyView = {
    ...defaultView,
    databaseId: "wrong",
    visibleFieldIds: ["missing"],
    fieldOrder: ["missing", "title"],
    wrapFieldIds: ["title", "missing"],
    sorts: [{ fieldId: "title", direction: "asc" }, { fieldId: "title", direction: "desc" }, { fieldId: "missing", direction: "up" }],
    filters: [{ fieldId: "missing", operator: "equals", value: "x" }],
    type: "calendar",
    dateFieldId: "missing",
    coverFieldId: "title",
    columnWidths: { title: 200, missing: 100, status: -1 },
    columnSummaries: { title: "count", missing: "count", status: "bad" },
    defaultTemplateId: "missing",
    frozenThroughFieldId: "missing"
  };
  const cleanView = d.sanitizeViewForSchema(dirtyView, schema, records);
  assert.equal(cleanView.databaseId, "db1");
  assert.deepEqual(cleanView.visibleFieldIds, ["title"]);
  assert.deepEqual(cleanView.sorts, [{ fieldId: "title", direction: "asc" }]);
  assert.deepEqual(cleanView.columnWidths, { title: 200 });
  assert.equal(cleanView.dateFieldId, undefined);
  assert.deepEqual(d.sanitizeViewSorts([{ fieldId: "title", direction: "bad" }, { fieldId: "title", direction: "desc" }], new Set(["title"])), [{ fieldId: "title", direction: "desc" }]);
  assert.equal(d.sameStringList(["a"], ["a"]), true);
  assert.deepEqual(d.sortViews([{ ...defaultView, id: "b", name: "B" }, { ...defaultView, id: "a", name: "A" }], "b").map((view) => view.id), ["b", "a"]);
  assert.equal(d.uniqueViewName("All", ["All", "All 2"]), "All 3");
  assert.throws(() => d.assertUniqueViewName([defaultView], "other", "all"), /unique/);
  assert.deepEqual(d.insertAtIfPresent(["a"], "b", 0), ["b", "a"]);
  assert.deepEqual(d.insertStringAt(["a", "c"], "b", "a"), ["a", "b", "c"]);
  assert.deepEqual(d.insertFieldAt([{ id: "a" }, { id: "c" }], { id: "b" }, undefined, "c").map((field) => field.id), ["a", "b", "c"]);
  assert.equal(d.uniqueFieldName([{ name: "Field" }, { name: "Field 2" }], "field"), "field 3");
  assert.ok(d.fieldDependencies("db1", fields, [{ ...defaultView, filters: [{ fieldId: "url", operator: "equals", value: "x" }], sorts: [{ fieldId: "url", direction: "asc" }] }], fields.find((field) => field.id === "url")).length >= 3);
  assert.deepEqual(d.fallbackVisibleFieldIds([{ id: "x", hidden: true }, { id: "y" }]), ["y"]);
  assert.ok(d.defaultVisibleFieldIds(fields).includes("status"));
  assert.equal(d.needsOptions("select"), true);
  assert.equal(d.needsOptions("text"), false);
  assert.deepEqual(d.normalizeRelationConfig("entity_ref", { targetDatabaseId: " db2 ", multiple: false }), { targetDatabaseId: "db2", multiple: false });
  assert.equal(d.normalizeRelationConfig("text"), undefined);
  assert.deepEqual(d.normalizeRollupConfig("rollup", { relationFieldId: " rel ", targetFieldId: " value ", aggregation: "bad" }), { relationFieldId: "rel", targetFieldId: "value", aggregation: "count" });
  assert.equal(d.normalizeRollupConfig("text"), undefined);
  assert.deepEqual(["date", "created_time", "updated_time", "text"].map(d.hasDateDisplay), [true, true, true, false]);
  assert.equal(d.isReadOnlyComputedField({ type: "formula" }), true);
  const template = d.normalizeDatabaseTemplate(schema, { id: "", name: " ", values: { title: "x", hidden: "no", formula: "no" }, markdown: "Body\n\n", fullWidth: 1 });
  assert.match(template.id, /^tpl_/);
  assert.deepEqual(template.values, { title: "x" });
  assert.equal(template.markdown, "Body");
  assert.equal(d.normalizeOptions([{ id: "", name: " Ready ", color: "" }, { id: "x", name: "ready" }, { id: "", name: "" }]).length, 1);
  assert.equal(d.normalizeOptions([]).length, 3);
  assert.deepEqual(d.normalizeTags([" A ", "A", "", "B"]), ["A", "B"]);
  assert.deepEqual(d.sanitizeRecordsForField(records, fields.find((field) => field.id === "status")).map((record) => record.status), ["", "Ready"]);
  assert.deepEqual(d.sanitizeRecordsForField(records, fields.find((field) => field.id === "tags")).map((record) => record.tags), ["A", "A"]);
  assert.equal(d.validateBatchValue({ type: "number" }, "bad"), "Enter a valid number.");
  assert.equal(d.validateBatchValue({ type: "checkbox" }, "true"), "Choose a valid checkbox value.");
  assert.equal(d.validateBatchValue({ type: "date" }, "bad"), "Enter a valid date.");
  assert.equal(d.validateBatchValue(fields.find((field) => field.id === "status"), "Bad"), "Choose a valid option.");
  assert.equal(d.validateBatchValue(fields.find((field) => field.id === "tags"), "B"), "Choose valid options.");
  assert.equal(d.validateBatchValue({ type: "text" }, "ok"), undefined);
  assert.equal(d.viewRevision({ revision: -1 }), 0);
  assert.equal(d.normalizeViewRevision({ id: "v", revision: 3 }).revision, 3);
});

test("workspace helpers normalize metadata and explain incorrect folder selection", async () => {
  const w = workspaceServiceTestInternals;
  const now = "2026-08-04T00:00:00.000Z";
  const schema = w.createWorkspaceDatabaseSchema(now);
  assert.equal(schema.fields.length, 5);
  const normalized = w.normalizeWorkspaceSchema({ ...schema, id: "bad", fields: [] }, "later");
  assert.equal(normalized.changed, true);
  assert.equal(normalized.schema.updated_time, "later");
  assert.equal(w.createWorkspaceDefaultView().visibleFieldIds[0], "title");
  const manifest = { spaceId: "space", name: "Workspace" };
  assert.equal(w.recordToWorkspaceMeta({ icon: "  ", title: "Named", created_time: now, updated_time: now }, manifest).icon, undefined);
  assert.equal(w.scoreWorkspaceChild("/tmp/workspace"), 0);
  assert.equal(w.scoreWorkspaceChild("/tmp/my-workspace"), 1);
  assert.equal(w.scoreWorkspaceChild("/tmp/other"), 2);
  assert.equal(w.isNotFoundError({ code: "ENOENT" }), true);
  assert.equal(w.sameFavorite({ type: "page", id: "p1" }, { type: "page", id: "p1" }), true);
  assert.equal(w.sameFavorite({ type: "page", id: "p1" }, { type: "database", id: "p1" }), false);
  assert.equal(w.sameFavorite({ type: "row_page", databaseId: "d", rowId: "r" }, { type: "row_page", databaseId: "d", rowId: "r" }), true);
  assert.equal(w.sameRecent({ type: "database", id: "d" }, { type: "database", id: "d" }), true);

  const root = await mkdtemp(join(tmpdir(), "lotion-workspace-help-"));
  try {
    for (const name of ["other", "my-workspace", "workspace", "z-workspace"]) {
      await mkdir(join(root, name));
      await writeFile(join(root, name, "lotion.json"), "{}", "utf8");
    }
    const children = await w.findLikelyWorkspaceChildren(root);
    assert.equal(children.length, 3);
    assert.equal(children[0], join(root, "workspace"));
    assert.match(await w.describeWorkspaceOpenFailure(root), /Suggested workspace folder/);
    assert.equal(await w.pathExists(join(root, "workspace", "lotion.json")), true);
    assert.equal(await w.pathExists(join(root, "missing")), false);
    assert.deepEqual(await w.findLikelyWorkspaceChildren(join(root, "missing")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GitHub REST adapter classifies missing files, conflicts, and rate limits", async () => {
  const adapter = new GitHubRestBackupAdapter();
  const settings = { provider: "github_api", repository: "owner/repo", branch: "main", basePath: "Lotion", token: "token" };
  assert.equal(adapter.isConfigured(settings), true);
  assert.equal(adapter.isConfigured({ ...settings, token: "" }), false);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("", { status: 404 });
    assert.equal(await adapter.readFileAtCommit(settings, "page.md", "sha"), null);
    globalThis.fetch = async () => new Response(JSON.stringify({ content: gitHubBackupTestInternals.encodeBase64("Body") }), { status: 200, headers: { "content-type": "application/json" } });
    assert.equal(await adapter.readFileAtCommit(settings, "page.md", "sha"), "Body");
    globalThis.fetch = async () => new Response("conflict", { status: 409 });
    await assert.rejects(adapter.readFileAtCommit(settings, "page.md", "sha"), GitHubBackupConflictError);
    globalThis.fetch = async () => new Response("limited", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    await assert.rejects(adapter.readFileAtCommit(settings, "page.md", "sha"), GitHubBackupRateLimitError);
    globalThis.fetch = async () => new Response(JSON.stringify([{ sha: "abc", commit: { message: "Backup", author: { date: "2026-08-04" } } }]), { status: 200, headers: { "content-type": "application/json" } });
    assert.deepEqual((await adapter.listCommits(settings, "page.md"))[0], { sha: "abc", message: "Backup", createdAt: "2026-08-04", changedPaths: ["page.md"], fileCount: 1 });
    await assert.rejects(adapter.listCommits({ ...settings, repository: "bad" }, "page.md"), /requires repository/);

    let requests = [];
    globalThis.fetch = async (url, init = {}) => {
      requests.push({ url: String(url), init });
      if ((init.method ?? "GET") === "GET") return new Response("", { status: 404 });
      return new Response(JSON.stringify({ commit: { sha: "created-sha" } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const created = await adapter.commitFiles(settings, [{ path: "page.md", content: "Body", kind: "page", title: "Page" }], "Create");
    assert.deepEqual(created.changedPaths, ["page.md"]);
    assert.equal(created.sha, "created-sha");
    assert.equal(JSON.parse(requests[1].init.body).content, gitHubBackupTestInternals.encodeBase64("Body"));

    requests = [];
    globalThis.fetch = async (_url, init = {}) => {
      requests.push(init);
      return new Response(JSON.stringify({ sha: "old-sha", content: gitHubBackupTestInternals.encodeBase64("Body") }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const unchanged = await adapter.commitFiles(settings, [{ path: "page.md", content: "Body", kind: "page", title: "Page" }], "No change");
    assert.equal(unchanged.sha, "unchanged");
    assert.equal(requests.length, 1);

    requests = [];
    globalThis.fetch = async (_url, init = {}) => {
      requests.push(init);
      if ((init.method ?? "GET") === "GET") {
        return new Response(JSON.stringify({ sha: "old-sha", content: gitHubBackupTestInternals.encodeBase64("Old") }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ commit: { sha: "updated-sha" } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const updated = await adapter.commitFiles(settings, [{ path: "page.md", content: "New", kind: "page", title: "Page" }], "Update");
    assert.equal(updated.sha, "updated-sha");
    assert.equal(JSON.parse(requests[1].body).sha, "old-sha");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("local GitHub backup adapter persists immutable commit snapshots", async () => {
  const values = new Map();
  const storage = {
    readJson: async (key) => values.get(key) ?? null,
    writeJson: async (key, value) => { values.set(key, value); }
  };
  const adapter = new StorageGitHubBackupAdapter(storage);
  const settings = { provider: "local_mock", repository: "", branch: "main", basePath: "Lotion" };
  const first = await adapter.commitFiles(settings, [{ path: "a.md", content: "A", kind: "page", title: "A" }], "First");
  assert.match(first.sha, /^mock-/);
  assert.equal((await adapter.listCommits(settings, "a.md")).length, 1);
  assert.equal(await adapter.readFileAtCommit(settings, "a.md", first.sha), "A");
  const unchanged = await adapter.commitFiles(settings, [{ path: "a.md", content: "A", kind: "page", title: "A" }], "Second");
  assert.deepEqual(unchanged.changedPaths, []);
  const second = await adapter.commitFiles(settings, [{ path: "a.md", content: "B", kind: "page", title: "A" }, { path: "b.md", content: "B", kind: "page", title: "B" }], "Second");
  assert.equal(second.changedPaths.length, 2);
  assert.equal(await adapter.readFileAtCommit(settings, "a.md", first.sha), "A");
  assert.equal(await adapter.readFileAtCommit(settings, "missing.md", second.sha), null);
});

test("page index helpers preserve metadata while repairing legacy records", () => {
  const p = pagesDatabaseTestInternals;
  const now = "2026-08-04T00:00:00.000Z";
  const fields = createPagesFields();
  const schema = {
    id: "legacy",
    name: "Legacy pages",
    fields: fields.filter((field) => field.id !== "url").map((field) => field.id === "full_width" ? { ...field, type: "text" } : field),
    defaultViewId: "legacy-view",
    created_time: now,
    updated_time: now
  };
  const normalized = p.normalizePagesSchema(schema, "2026-08-05T00:00:00.000Z");
  assert.equal(normalized.changed, true);
  assert.equal(normalized.schema.id, "pages");
  assert.equal(normalized.schema.fields.find((field) => field.id === "full_width").type, "checkbox");
  assert.ok(normalized.schema.fields.some((field) => field.id === "url"));
  assert.equal(p.normalizePagesSchema(normalized.schema, "later").changed, false);

  const meta = {
    id: "p1",
    title: "Page",
    created_time: now,
    updated_time: now,
    icon: "emoji:note",
    cover: "cover.png",
    coverOffset: 150,
    path: ["Root", "Page"],
    parentId: "root",
    parentKind: "database",
    tags: ["A", "B"],
    date: "2026-08-04",
    url: "https://example.com",
    fullWidth: true,
    smallText: true
  };
  const record = pageInputToRecord({ meta, bodyPath: "pages/p1.md", databaseId: "db1", rowId: "r1", pageFile: "p1.md" });
  const restored = recordToPageMeta({ ...record, tags: '["A","B"]', notion_original_html: "source.html" });
  assert.equal(restored.coverOffset, 100);
  assert.equal(restored.parentKind, "database");
  assert.deepEqual(restored.tags, ["A", "B"]);
  assert.equal(restored.originalNotionHtml, "source.html");
  assert.equal(restored.fullWidth, true);
  const snapshot = p.recordToStartupSnapshot(record);
  assert.equal(snapshot.databaseId, "db1");
  assert.equal(snapshot.pageFile, "p1.md");
  assert.equal(p.defaultPageBodyPath("Page--p1.md"), "databases/system/pages--db_pages/pages/Page--p1.md");
  assert.equal(p.firstMarkdownHeading("Text\n# Heading\n"), "Heading");
  assert.equal(p.firstMarkdownHeading("Text"), undefined);
  assert.equal(p.recordNeedsDefaultPageFileRecovery({ id: "p1", title: "Untitled", body_path: "" }), true);
  assert.equal(p.recordNeedsDefaultPageFileRecovery({ id: "", title: "Untitled" }), false);
  assert.equal(p.isDefaultPageRecord({ database_id: "db1", kind: "row", body_path: "rows/r1.md" }), false);
  assert.equal(p.isDefaultPageRecord({ database_id: "db1", kind: "row", body_path: "pages/page_p1.md" }), true);
  assert.equal(p.isDefaultPageRecord({ database_id: "pages" }), true);
  assert.deepEqual(p.parseTags("A; B,,;C"), ["A", "B", "C"]);
  assert.deepEqual(p.parseTags("{}"), []);
  assert.deepEqual(p.parsePath("Root / Page"), ["Root", "Page"]);
  assert.deepEqual(p.parseParentRef('[{"entityId":" p1 ","kind":"page"}]'), { entityId: "p1", kind: "page" });
  assert.equal(p.parseParentRef('[{"entityId":"p1","kind":"bad"}]'), undefined);
  assert.equal(p.parseParentRef("bad"), undefined);
  assert.deepEqual([true, "yes", "1", "false"].map(p.parseBoolean), [true, true, true, false]);
  assert.equal(p.optionalStringValue("  "), undefined);
  assert.equal(p.stringValue(null), "");
  assert.deepEqual(p.withSchemaDefaults({ fields: [{ id: "a" }, { id: "b" }] }, { a: 1 }), { a: 1, b: "" });
  assert.equal(p.recordsDifferForSchema({ fields: [{ id: "a" }] }, { a: 1 }, { a: 2 }), true);
  assert.equal(p.recordsEquivalentForSchema({ fields: [{ id: "done", type: "checkbox" }, { id: "title", type: "text" }] }, { done: "yes", title: "A" }, { done: true, title: "A" }), true);
});

test("Notion source archive deduplicates identical files and preserves conflicts", async () => {
  const n = notionImportTestInternals;
  const root = await mkdtemp(join(tmpdir(), "lotion-notion-archive-"));
  const wrapper1 = join(root, "Export-abc-Part-1");
  const wrapper2 = join(root, "Export-abc-Part-2");
  const source1 = join(wrapper1, "Export-abc");
  const source2 = join(wrapper2, "Export-abc 1");
  try {
    await mkdir(join(source1, "Folder"), { recursive: true });
    await mkdir(join(source2, "Folder"), { recursive: true });
    await writeFile(join(source1, "same.txt"), "same", "utf8");
    await writeFile(join(source2, "same.txt"), "same", "utf8");
    await writeFile(join(source1, "conflict.txt"), "first", "utf8");
    await writeFile(join(source2, "conflict.txt"), "second", "utf8");
    await writeFile(join(source1, "Folder", "one.md"), "one", "utf8");
    await writeFile(join(source2, "Folder", "two.md"), "two", "utf8");
    await writeFile(join(source1, ".DS_Store"), "ignored", "utf8");

    assert.equal(await n.findOriginalExportContentRoot(wrapper1), source1);
    assert.equal((await n.resolveOriginalSourceRoot(wrapper2)).rootName, "Export-abc");
    const archive = await n.buildOriginalSourceArchive([wrapper1, wrapper2]);
    assert.equal(archive.dedupedFiles, 1);
    assert.equal(archive.conflictFiles, 1);
    assert.equal(archive.files.length, 5);
    assert.ok(archive.files.some((file) => /conflict--[0-9a-f]{8}\.txt$/.test(file.rel)));
    assert.equal(archive.relByAbs.get(join(source2, "same.txt")), archive.relByAbs.get(join(source1, "same.txt")));

    const multiple = join(root, "Export-def-Part-1");
    await mkdir(join(multiple, "Export-def"), { recursive: true });
    await mkdir(join(multiple, "Export-def 1"), { recursive: true });
    assert.equal(await n.findOriginalExportContentRoot(multiple), multiple);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Notion synthetic and inline collections retain only material unique rows", async () => {
  const n = notionImportTestInternals;
  const hash = "0123456789abcdef0123456789abcdef";
  const source = `/tmp/Export-abc/Index ${hash}.html`;
  const inventory = {
    pagesByHash: new Map([["known-page", { sourcePath: "/tmp/page.html" }]]),
    databasesByHash: new Map([["known-db", {}]]),
    rowsByKey: new Map([["row", { hash: "known-row", sourcePath: "/tmp/row.html" }]])
  };
  const hints = new Map([[source, [
    { title: "DB 1", hash: "d1" },
    { title: "DB 2", hash: "d2" },
    { title: "DB 3", hash: "d3" },
    { title: "New DB", hash: "new-db", icon: "emoji:📋" },
    { title: "Known", hash: "known-page" },
    { title: "", hash: "empty" }
  ]] ]);
  const synthetic = n.collectSyntheticEmptyDatabases(hints, inventory, new Set(["DB 1", "DB 2", "DB 3"]), ["/tmp/Export-abc"]);
  assert.equal(synthetic.size, 1);
  assert.equal(synthetic.get("new-db").title, "New DB");

  const parsed = {
    collectionViews: [
      { hash: "", title: "No hash", rowCount: 1, rows: [] },
      { hash: "skip", title: "Skip", rowCount: 1, rows: [] },
      { hash: "empty", title: "Empty", rowCount: 0, fieldNames: [], rows: [] },
      { hash: "inline", title: "Inline", rowCount: 2, fieldNames: ["Name", "Value"], rows: [
        { hash: "known-page", title: "Known", href: "known.html", values: { Name: "Known" } },
        { hash: "new-row", title: "New", href: "missing.html", values: { Name: "New" } }
      ] }
    ]
  };
  n.collectInlineCollectionViews(parsed, synthetic, inventory, "Parent", source, ["/tmp/Export-abc"], (view) => view.hash === "skip", false);
  assert.equal(synthetic.has("inline"), false);
  n.collectInlineCollectionViews(parsed, synthetic, inventory, "Parent", source, ["/tmp/Export-abc"], (view) => view.hash === "skip", true);
  assert.equal(synthetic.get("inline").rows.length, 2);
  assert.equal(synthetic.get("inline").rows[0].sourcePath, "/tmp/page.html");
  n.collectInlineCollectionViews({ collectionViews: [{ hash: "inline", title: "Inline", rowCount: 2, fieldNames: ["Name", "Value", "More"], rows: [{ hash: "new-row", title: "Duplicate" }, { hash: "third", title: "Third" }] }] }, synthetic, inventory, "Parent", source, ["/tmp/Export-abc"], undefined, true);
  assert.equal(synthetic.get("inline").rows.length, 3);
  assert.equal(synthetic.get("inline").fieldNames.length, 3);
  assert.equal(n.inventorySourcePathByHash(inventory, "known-row"), "/tmp/row.html");
  assert.equal(n.inventorySourcePathByHash(inventory, "missing"), undefined);

  const root = await mkdtemp(join(tmpdir(), "lotion-inline-row-"));
  try {
    const parent = join(root, "parent.html");
    const child = join(root, "child.html");
    await writeFile(child, "child", "utf8");
    assert.equal(n.resolveInlineRowSource(parent, "child.html"), child);
    assert.equal(n.resolveInlineRowSource(parent, ""), undefined);
    assert.equal(n.resolveInlineRowSource(parent, "%zz"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entity and backlink helpers normalize imported identity and contributions", async () => {
  const e = entitiesDatabaseTestInternals;
  assert.deepEqual(["page", "database", "row", "bad"].map(e.parseEntityKind), ["page", "database", "row", undefined]);
  assert.deepEqual(e.parsePath('["Root","Page"]'), ["Root", "Page"]);
  assert.equal(e.stringValue(" x "), "x");
  const page = e.entityFromRecord({ id: "p1", kind: "page", title: "", path: '["Root"]', icon: "emoji:📝", body_path: "./databases/pages/p1.md" });
  assert.equal(page.title, "Untitled");
  assert.equal(page.bodyPath, "databases/pages/p1.md");
  assert.equal(e.entityFromRecord({ id: "", kind: "page" }), null);
  const row = e.entityFromPageRecord({ id: "r1", title: "Row", database_id: "db1", path: "Root / Rows", body_path: "rows/r1.md" });
  assert.equal(row.kind, "row");
  assert.equal(row.rowId, "r1");
  assert.equal(e.entityFromPageRecord({ id: "" }), null);
  assert.equal(e.fallbackRowEntity({ id: "db1", path: ["Root"] }, { id: "r2", title: "" }).title, "Untitled");

  const database = { entityId: "db1", kind: "database", title: "Tasks", path: ["Tasks"] };
  const candidates = e.targetWorkspaceLinkCandidates(database);
  assert.ok([...candidates].some((value) => value.startsWith("databases/user/")));
  assert.deepEqual(e.markdownLinkTargets("[Task](<databases/user/Tasks/Page%20One.md#anchor> \"title\")\n[Web](https://x)"), [{ target: "databases/user/Tasks/Page One.md", line: 1, excerpt: "[Task](<databases/user/Tasks/Page%20One.md#anchor> \"title\")" }]);
  assert.equal(e.normalizeMarkdownTarget("'./databases\\user\\Page.md?x=1'"), "databases/user/Page.md");
  assert.equal(e.safeDecode("%zz"), "%zz");
  assert.deepEqual(e.cellReferencedEntityIds('[{"entityId":"p1"},{"entityId":"p1"},{"entityId":"p2"}]'), ["p1", "p2"]);
  assert.deepEqual(e.cellReferencedEntityIds("plain"), []);
  assert.match(e.previewCell("x".repeat(200)), /\.\.\.$/);
  const refValue = JSON.stringify([{ entityId: "p1", kind: "page", titleSnapshot: "Snapshot" }]);
  assert.equal(e.previewEntityRefCell(refValue, page), "Snapshot");
  assert.equal(e.previewPropertyCell(refValue, page), "Snapshot");
  assert.equal(e.previewEntityRefCell("bad", page), "");
  assert.equal(e.entityRefPreviewLabel({ pathSnapshot: ["Root", "Path title"] }, page), "Path title");

  const index = { byId: new Map([["p1", page], ["db1", database]]) };
  assert.ok(e.backlinkTargetsByPath(index).size >= 2);
  const backlinkA = { source: { path: ["B"], title: "B" }, type: "markdown", line: 2 };
  const backlinkB = { source: { path: ["A"], title: "A" }, type: "property", line: 1 };
  assert.ok(e.compareBacklinks(backlinkA, backlinkB) > 0);
  const graph = {
    sourceContributions: new Map([
      ["m", { kind: "markdown", markdownLinkCount: 1, propertyCellCount: 0, backlinks: [{ targetId: "p1", backlink: backlinkA }] }],
      ["t", { kind: "table", markdownLinkCount: 0, propertyCellCount: 2, backlinks: [{ targetId: "p1", backlink: backlinkB }] }]
    ])
  };
  e.materializeBacklinkContributions(graph);
  assert.equal(graph.sourceCount, 1);
  assert.equal(graph.markdownLinkCount, 1);
  assert.equal(graph.propertyCellCount, 2);
  assert.deepEqual(graph.byTargetId.get("p1"), [backlinkB, backlinkA]);
  assert.equal(e.markdownContributionKey("./a.md"), "markdown:a.md");
  assert.equal(e.tableContributionKey("a.csv"), "table:a.csv");
  assert.equal(e.workspaceRelativePath("/tmp/root", "/tmp/root/databases/a.md"), "databases/a.md");
  assert.equal(e.isBacklinkSourcePath("/tmp/root", "/tmp/root/databases/a.md"), true);
  assert.equal(e.isBacklinkSourcePath("/tmp/root", "/tmp/outside.md"), false);
  const targetMap = new Map();
  e.appendBacklink(targetMap, "p1", backlinkA);
  assert.deepEqual(targetMap.get("p1"), [backlinkA]);
  assert.equal(e.stableHash("same"), e.stableHash("same"));

  const root = await mkdtemp(join(tmpdir(), "lotion-entity-signature-"));
  try {
    const file = join(root, "page.md");
    await writeFile(file, "Body", "utf8");
    assert.match(await e.fileSignature(file), /:4:/);
    assert.match(await e.fileSignature(join(root, "missing.md")), /:missing$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("entity index schema upgrades retain identity and service lifecycle state", () => {
  const now = "2026-08-04T00:00:00.000Z";
  const schema = createEntitiesSchema(now);
  assert.equal(schema.fields.length, createEntitiesFields().length);
  assert.equal(createEntitiesDefaultView().databaseId, "entities");
  const legacy = { ...schema, id: "old", name: "old", defaultViewId: "old", fields: schema.fields.filter((field) => field.id !== "icon").map((field) => field.id === "title" ? { ...field, type: "number" } : field) };
  const upgraded = normalizeEntitiesSchema(legacy, "later");
  assert.equal(upgraded.changed, true);
  assert.equal(upgraded.schema.fields.find((field) => field.id === "title").type, "text");
  assert.ok(upgraded.schema.fields.some((field) => field.id === "icon"));
  assert.equal(normalizeEntitiesSchema(upgraded.schema, "latest").changed, false);
  const record = entityToRecord({
    id: "p1",
    kind: "page",
    title: "",
    path: ["Root", "Page"],
    parentId: "root",
    parentKind: "database",
    databaseId: "db1",
    rowId: "r1",
    icon: "emoji:note",
    bodyPath: "pages/p1.md",
    sourceNotionHash: "hash"
  }, now);
  assert.equal(record.title, "Untitled");
  assert.match(record.parent_id, /"kind":"database"/);
  assert.equal(record.created_time, now);

  const service = new EntitiesDatabaseService({ requirePaths: () => { throw new Error("closed"); } });
  let updates = 0;
  const unsubscribe = service.subscribeBacklinkUpdates(() => { updates += 1; });
  assert.equal(service.backlinkCacheStats(), null);
  assert.equal(updates, 0);
  unsubscribe();
  service.dispose();
});

test("GitHub backup service persists configuration, success, failure, and page history states", async () => {
  const settings = {
    provider: "local_mock",
    repository: "owner/repository",
    branch: "main",
    basePath: "Lotion"
  };
  const values = new Map();
  const storage = {
    readJson: async (key) => values.get(key) ?? null,
    writeJson: async (key, value) => { values.set(key, value); }
  };
  let markdown = "Current";
  const page = { meta: { id: "p1", title: "Page", path: ["Page"] }, markdown };
  const database = { id: "db1", name: "Tasks", path: ["Tasks"] };
  const databaseBundle = {
    schema: { id: "db1", name: "Tasks", fields: [{ id: "title", name: "Title", type: "text" }] },
    records: [{ id: "r1", title: "Row" }, { id: "r2", title: "Empty" }, { id: "r3", title: "Missing" }, { title: "No id" }],
    views: []
  };
  const workspace = {
    listPages: async () => [page.meta],
    listDatabases: async () => [database],
    getPage: async () => ({ ...page, markdown }),
    getDatabase: async () => databaseBundle,
    getRowPage: async (_databaseId, rowId) => {
      if (rowId === "r3") throw new Error("not materialized");
      return { meta: { id: rowId, title: rowId === "r1" ? "Row" : "Empty" }, markdown: rowId === "r1" ? "Row body" : "" };
    },
    updatePage: async (_id, patch) => { markdown = patch.markdown; }
  };
  const notConfiguredAdapter = { isConfigured: () => false };
  const service = new GitHubBackupService(workspace, storage, notConfiguredAdapter);
  assert.equal((await service.status(settings)).state, "not_configured");
  assert.equal((await service.backupWorkspace(settings, "Backup")).commitCreated, false);

  const commit = { sha: "sha1", message: "Backup", createdAt: "2026-08-04", changedPaths: ["Lotion/pages/Page--p1.md"], fileCount: 2 };
  const adapter = {
    isConfigured: () => true,
    commitFiles: async () => commit,
    listCommits: async () => [commit],
    readFileAtCommit: async () => "Old"
  };
  const configured = new GitHubBackupService(workspace, storage, adapter);
  values.clear();
  const collected = await configured.collectWorkspaceFiles(settings);
  assert.equal(collected.filter((file) => file.kind === "database").length, 1);
  assert.equal(collected.filter((file) => file.kind === "row_page").length, 1);
  assert.equal((await configured.status(settings)).state, "history_empty");
  assert.equal((await configured.backupWorkspace(settings, " Backup ")).commitCreated, true);
  assert.equal((await configured.status(settings)).state, "backed_up");
  assert.equal((await configured.listPageHistory(settings, "p1"))[0].sha, "sha1");
  const preview = await configured.previewPageVersion(settings, "p1", "sha1");
  assert.equal(preview.selectedMarkdown, "Old");
  assert.ok(preview.diff.length > 0);
  assert.equal((await configured.restorePageVersion(settings, "p1", "sha1")).markdown, "Old");

  adapter.readFileAtCommit = async () => null;
  await assert.rejects(configured.previewPageVersion(settings, "p1", "sha1"), /no longer contains/);
  adapter.readFileAtCommit = async () => "Old";
  adapter.listCommits = async () => [];
  await assert.rejects(configured.previewPageVersion(settings, "p1", "sha1"), /not found/);
  adapter.commitFiles = async () => { throw new Error("offline"); };
  assert.equal((await configured.backupWorkspace(settings, "Backup")).status.state, "failed");
});
