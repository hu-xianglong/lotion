import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLotionCustomerApi, LOTION_CUSTOMER_API_VERSION } from "lotion/customer-api";
import {
  flattenApiContract,
  LOTION_IPC_CHANNEL_METHOD_IDS,
  LOTION_PACKAGE_API_CONTRACT,
  LOTION_RENDERER_API_CONTRACT,
  LotionApiMetricsRecorder,
  publicFunctionShape
} from "lotion/customer-api-contract";
import { Plugin } from "lotion/plugin-api";
import { isReactProvider } from "lotion/plugin-react";

function createMemoryConfig() {
  let state = { active: null, recents: [] };
  return {
    load: async () => state,
    save: async (next) => {
      state = next;
    },
    touch: async (path, name, icon) => {
      state = {
        active: path,
        recents: [{ path, name, icon, lastOpened: new Date().toISOString() }]
      };
    },
    forget: async (path) => {
      state = {
        active: state.active === path ? null : state.active,
        recents: state.recents.filter((item) => item.path !== path)
      };
    }
  };
}

test("package exports expose public customer and plugin APIs", () => {
  class ExportedPlugin extends Plugin {
    onLoad() {
      this.loaded = true;
    }
  }
  const plugin = new ExportedPlugin({ manifest: { id: "test" } });
  plugin.onLoad();
  assert.equal(plugin.loaded, true);
  assert.equal(typeof createLotionCustomerApi, "function");
  assert.equal(typeof LotionApiMetricsRecorder, "function");
  assert.equal(isReactProvider({ type: "text", label: "Text", render: () => "" }), false);
  assert.equal(
    isReactProvider({ type: "react-text", label: "React Text", render: () => "", renderReact: () => "value" }),
    true
  );
});

test("shared customer API contract matches package and renderer public surfaces", () => {
  const api = createLotionCustomerApi({ appConfig: createMemoryConfig() });
  assert.deepEqual(publicFunctionShape(api), flattenApiContract(LOTION_PACKAGE_API_CONTRACT));

  const rendererMethods = flattenApiContract(LOTION_RENDERER_API_CONTRACT);
  assert.equal(rendererMethods.includes("metrics.list"), true);
  assert.equal(rendererMethods.includes("metrics.summary"), true);
  assert.equal(rendererMethods.includes("metrics.clear"), true);
  assert.equal(rendererMethods.includes("debug.openLog"), true);

  const ipcMethods = new Set(Object.values(LOTION_IPC_CHANNEL_METHOD_IDS));
  const eventOnlyMethods = new Set(["debug.openLog", "notion.onProgress"]);
  const missingIpcMappings = rendererMethods.filter((methodId) => !eventOnlyMethods.has(methodId) && !ipcMethods.has(methodId));
  assert.deepEqual(missingIpcMappings, []);
});

test("customer API metrics records success and errors without payload bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-customer-api-metrics-"));
  const api = createLotionCustomerApi({ appConfig: createMemoryConfig() });
  const sensitiveTitle = "Secret Customer API Payload 5b2a0c";
  const missingId = "missing-secret-database-id";

  try {
    await api.workspace.createAt(root, { name: "Metrics Space" });
    await api.pages.create({ title: sensitiveTitle });
    await assert.rejects(() => api.databases.get(missingId), /ENOENT|no such file/i);

    const entries = await api.metrics.list();
    assert.equal(entries.some((entry) => entry.methodId === "workspace.createAt" && entry.ok), true);
    assert.equal(entries.some((entry) => entry.methodId === "pages.create" && entry.ok), true);
    assert.equal(entries.some((entry) => entry.methodId === "databases.get" && !entry.ok && entry.errorKind), true);

    const serialized = JSON.stringify(entries);
    assert.equal(serialized.includes(sensitiveTitle), false);
    assert.equal(serialized.includes(missingId), false);

    const summary = await api.metrics.summary();
    const databaseGet = summary.find((entry) => entry.methodId === "databases.get");
    assert.ok(databaseGet);
    assert.equal(databaseGet.errorCount, 1);
    assert.equal(databaseGet.successCount, 0);
    assert.equal(databaseGet.maxDurationMs >= databaseGet.lastDurationMs, true);

    assert.equal((await api.metrics.list({ limit: 1 })).length, 1);
    await api.metrics.clear();
    assert.deepEqual(await api.metrics.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("customer API serializes concurrent page metadata and markdown updates", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-customer-api-page-race-"));
  const api = createLotionCustomerApi({ appConfig: createMemoryConfig() });

  try {
    await api.workspace.createAt(root, { name: "Customer API Race Space" });
    const page = await api.pages.create({ title: "Race Page" });

    await Promise.all([
      api.pages.update(page.meta.id, { markdown: "# Race Page\n\nAutosaved body." }),
      api.pages.update(page.meta.id, { smallText: true })
    ]);

    const persisted = await api.pages.get(page.meta.id);
    assert.equal(persisted.markdown.includes("Autosaved body."), true);
    assert.equal(persisted.meta.smallText, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("customer API keeps pages database caches scoped to the active workspace", async () => {
  const rootA = await mkdtemp(join(tmpdir(), "lotion-customer-api-workspace-a-"));
  const rootB = await mkdtemp(join(tmpdir(), "lotion-customer-api-workspace-b-"));
  const api = createLotionCustomerApi({ appConfig: createMemoryConfig() });

  try {
    await api.workspace.createAt(rootA, { name: "Workspace A" });
    const aPage = await api.pages.create({ title: "Only in A" });
    assert.deepEqual((await api.pages.list()).map((page) => page.id), [aPage.meta.id]);

    await api.workspace.createAt(rootB, { name: "Workspace B" });
    const bPage = await api.pages.create({ title: "Only in B" });
    await api.pages.update(bPage.meta.id, { smallText: true });

    const bPages = await api.pages.list();
    assert.deepEqual(bPages.map((page) => page.id), [bPage.meta.id]);
    assert.equal((await api.pages.get(bPage.meta.id)).meta.smallText, true);
  } finally {
    await rm(rootA, { recursive: true, force: true });
    await rm(rootB, { recursive: true, force: true });
  }
});

test("customer API supports workspace, pages, databases, row pages, attachments, and search", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-customer-api-"));
  const config = createMemoryConfig();
  const api = createLotionCustomerApi({ appConfig: config });

  try {
    assert.equal(api.version, LOTION_CUSTOMER_API_VERSION);

    const manifest = await api.workspace.createAt(root, { name: "Customer API Space" });
    assert.equal(manifest.name, "Customer API Space");
    assert.equal((await api.workspace.getManifest()).spaceId, manifest.spaceId);
    assert.equal((await config.load()).active, root);

    let page = await api.pages.create({ title: "API Page" });
    assert.equal(page.meta.title, "API Page");
    page = await api.pages.update(page.meta.id, {
      markdown: "# API Page\n\nCustomer API body.",
      tags: ["api", "contract"],
      date: "2026-06-08",
      url: "https://example.com/api",
      fullWidth: true,
      smallText: true
    });
    assert.equal(page.markdown.includes("Customer API body"), true);
    assert.deepEqual(page.meta.tags, ["api", "contract"]);
    assert.equal(page.meta.smallText, true);
    assert.equal((await api.pages.get(page.meta.id)).meta.smallText, true);
    page = await api.pages.rename(page.meta.id, "API Page Renamed");
    assert.equal(page.meta.title, "API Page Renamed");
    assert.equal((await api.pages.get(page.meta.id)).meta.title, "API Page Renamed");
    const parentPage = await api.pages.create({ title: "Parent API Page" });
    page = await api.pages.update(page.meta.id, {
      parentId: parentPage.meta.id,
      parentKind: "page",
      path: [parentPage.meta.title, page.meta.title]
    });
    assert.equal(page.meta.parentId, parentPage.meta.id);
    assert.equal(page.meta.parentKind, "page");
    assert.deepEqual(page.meta.path, [parentPage.meta.title, page.meta.title]);
    const persistedMovedPage = await api.pages.get(page.meta.id);
    assert.equal(persistedMovedPage.meta.parentId, parentPage.meta.id);
    assert.deepEqual(persistedMovedPage.meta.path, [parentPage.meta.title, page.meta.title]);
    page = await api.pages.update(page.meta.id, {
      parentId: null,
      parentKind: null,
      path: [page.meta.title]
    });
    assert.equal(page.meta.parentId, undefined);
    assert.equal(page.meta.parentKind, undefined);
    assert.deepEqual(page.meta.path, [page.meta.title]);
    await api.pages.delete(parentPage.meta.id);
    assert.deepEqual((await api.pages.list()).map((item) => item.id), [page.meta.id]);
    await api.workspace.reorderPages([page.meta.id]);
    await api.workspace.pushRecent({ type: "page", id: page.meta.id });
    assert.equal((await api.workspace.listRecents())[0]?.id, page.meta.id);
    await api.workspace.toggleFavorite({ type: "page", id: page.meta.id });
    assert.deepEqual(await api.workspace.listFavorites(), [{ type: "page", id: page.meta.id }]);

    let bundle = await api.databases.create({
      name: "Deals",
      path: ["Sales", "Deals"],
      template: {
        fields: [
          { id: "status", name: "Status", type: "select", options: [{ id: "todo", name: "Todo", color: "gray" }] },
          { id: "url", name: "URL", type: "url" }
        ],
        rows: [{ title: "Acme", status: "Todo", url: "https://example.com/acme" }]
      }
    });
    await api.workspace.toggleFavorite({ type: "database", id: bundle.schema.id });
    assert.deepEqual(await api.workspace.listFavorites(), [
      { type: "page", id: page.meta.id },
      { type: "database", id: bundle.schema.id }
    ]);
    const databaseId = bundle.schema.id;
    assert.equal(bundle.schema.path?.join(" / "), "Sales / Deals");
    assert.equal(bundle.records[0]?.title, "Acme");
    assert.equal((await api.databases.list()).some((item) => item.id === databaseId), true);

    bundle = await api.databases.addField(databaseId, { name: "Priority", type: "number" });
    const priorityField = bundle.schema.fields.find((field) => field.name === "Priority");
    assert.ok(priorityField);
    bundle = await api.databases.updateField({
      databaseId,
      fieldId: priorityField.id,
      name: "Score",
      type: "number"
    });
    assert.equal(bundle.schema.fields.find((field) => field.id === priorityField.id)?.name, "Score");
    const acmeRowId = String(bundle.records[0]?.id);
    bundle = await api.databases.updateCell({ databaseId, rowId: acmeRowId, fieldId: priorityField.id, value: 9 });
    assert.equal(bundle.records.find((record) => record.id === acmeRowId)?.[priorityField.id], 9);
    bundle = await api.databases.deleteField(databaseId, priorityField.id);
    assert.equal(bundle.schema.fields.some((field) => field.id === priorityField.id), false);
    assert.equal(Object.hasOwn(bundle.records.find((record) => record.id === acmeRowId) ?? {}, priorityField.id), false);
    assert.equal(bundle.views.some((view) => view.visibleFieldIds.includes(priorityField.id)), false);
    assert.equal(bundle.views.some((view) => view.fieldOrder.includes(priorityField.id)), false);
    bundle = await api.databases.deleteField(databaseId, "title");
    assert.equal(bundle.schema.fields.some((field) => field.id === "title"), true);
    bundle = await api.databases.updateMeta({ databaseId, tags: ["customer-api"] });
    assert.deepEqual(bundle.schema.tags, ["customer-api"]);

    bundle = await api.databases.addField(databaseId, { name: "Related Page", type: "entity_ref" });
    const relatedPageField = bundle.schema.fields.find((field) => field.name === "Related Page");
    assert.ok(relatedPageField);
    bundle = await api.databases.updateCell({
      databaseId,
      rowId: acmeRowId,
      fieldId: relatedPageField.id,
      value: JSON.stringify([{ entityId: page.meta.id, kind: "page", titleSnapshot: page.meta.title }])
    });

    bundle = await api.views.create({ databaseId, name: "API View" });
    const apiView = bundle.views.find((view) => view.name === "API View");
    assert.ok(apiView);
    bundle = await api.views.update({
      databaseId,
      view: { ...apiView, visibleFieldIds: ["title", "status"], fieldOrder: ["title", "status"] }
    });
    assert.deepEqual(bundle.views.find((view) => view.id === apiView.id)?.visibleFieldIds, ["title", "status"]);
    bundle = await api.views.setDefault({ databaseId, viewId: apiView.id });
    assert.equal(bundle.schema.defaultViewId, apiView.id);
    assert.equal(bundle.views[0]?.id, apiView.id);
    bundle = await api.views.duplicate({ databaseId, viewId: apiView.id, name: "API View Copy" });
    const copiedView = bundle.views.find((view) => view.name === "API View Copy");
    assert.ok(copiedView);
    assert.notEqual(copiedView.id, apiView.id);
    assert.deepEqual(copiedView.visibleFieldIds, ["title", "status"]);
    assert.deepEqual(copiedView.fieldOrder, ["title", "status"]);
    bundle = await api.databases.get(databaseId);
    assert.equal(bundle.views.some((view) => view.id === copiedView.id), true);

    bundle = await api.databases.saveTemplate({
      databaseId,
      template: {
        name: "Lead template",
        values: { title: "Template lead", status: "Todo" },
        markdown: "Template body",
        fullWidth: true
      }
    });
    const templateId = bundle.schema.templates?.find((template) => template.name === "Lead template")?.id;
    assert.ok(templateId);
    const apiViewWithTemplate = bundle.views.find((view) => view.id === apiView.id);
    assert.ok(apiViewWithTemplate);
    bundle = await api.views.update({
      databaseId,
      view: { ...apiViewWithTemplate, defaultTemplateId: templateId }
    });
    assert.equal(bundle.views.find((view) => view.id === apiView.id)?.defaultTemplateId, templateId);
    bundle = await api.databases.addRow(databaseId, templateId);
    const templateRow = bundle.records.find((record) => record.title === "Template lead");
    assert.ok(templateRow);
    const templateRowId = String(templateRow.id);
    let rowPage = await api.rowPages.open(databaseId, templateRowId);
    assert.equal(rowPage.markdown.includes("Template body"), true);
    assert.equal(rowPage.fullWidth, true);
    rowPage = await api.rowPages.update({ databaseId, rowId: templateRowId, markdown: "Updated row page body" });
    assert.equal(rowPage.markdown, "Updated row page body");
    rowPage = await api.rowPages.setFullWidth({ databaseId, rowId: templateRowId, fullWidth: false });
    assert.equal(!!rowPage.fullWidth, false);
    rowPage = await api.rowPages.setSmallText({ databaseId, rowId: templateRowId, smallText: true });
    assert.equal(rowPage.meta.smallText, true);
    rowPage = await api.rowPages.setSmallText({ databaseId, rowId: templateRowId, smallText: false });
    assert.equal(!!rowPage.meta.smallText, false);
    const stats = await api.databases.refreshStats();
    assert.equal(stats.some((stat) => stat.id === databaseId), true);
    assert.equal((await api.databases.listStats()).some((stat) => stat.id === databaseId), true);

    const tree = await api.workspace.getPagesTree();
    assert.equal(tree.topLevelPages.length, 1);
    assert.equal(tree.databases.some((folder) => folder.databaseId === databaseId), true);

    const addedAttachment = await api.attachments.add(Buffer.from("plugin attachment body"), "txt");
    assert.match(addedAttachment.sha, /^[a-f0-9]{24}$/);
    assert.equal(addedAttachment.ext, "txt");
    assert.match(addedAttachment.path, /^attachments\/documents\/[a-f0-9]{24}\.txt$/);
    assert.equal(addedAttachment.url, `lotion-file:///${addedAttachment.path}`);
    assert.equal(Buffer.from(await api.attachments.get(addedAttachment.sha)).toString("utf8"), "plugin attachment body");
    assert.equal((await api.attachments.list()).some((attachment) => attachment.sha === addedAttachment.sha), true);

    const sourceAttachment = join(root, "source-note.txt");
    await writeFile(sourceAttachment, "attachment body", "utf8");
    const imported = await api.attachments.importFiles([sourceAttachment]);
    assert.equal(imported.length, 1);
    assert.match(imported[0].path, /^attachments\//);
    assert.equal((await api.attachments.list()).some((attachment) => attachment.path === imported[0].path), true);

    const search = await api.search.query("Template lead");
    assert.equal(search.hits.some((hit) => JSON.stringify(hit).includes("Template lead")), true);
    assert.equal(await api.entities.resolve("missing_entity"), null);

    const backlinkSource = await api.pages.create({ title: "Backlink Source" });
    const targetBodyPath = `databases/system/pages--db_pages/pages/API_Page_Renamed--${page.meta.id}.md`;
    await api.pages.update(backlinkSource.meta.id, {
      markdown: `# Backlink Source\n\nSee [API page](${targetBodyPath}).\n\nRepeated [API page](${targetBodyPath}).`
    });
    const backlinks = await api.entities.backlinks(page.meta.id);
    assert.equal(backlinks.filter((backlink) =>
      backlink.type === "markdown" &&
      backlink.source.entityId === backlinkSource.meta.id
    ).length, 1);
    assert.equal(backlinks.some((backlink) =>
      backlink.type === "markdown" &&
      backlink.source.entityId === backlinkSource.meta.id &&
      backlink.sourceBodyPath?.endsWith(`${backlinkSource.meta.id}.md`) &&
      backlink.line === 3
    ), true);
    assert.equal(backlinks.some((backlink) =>
      backlink.type === "property" &&
      backlink.source.entityId === acmeRowId &&
      backlink.databaseId === databaseId &&
      backlink.fieldName === "Related Page" &&
      backlink.excerpt === page.meta.title
    ), true);

    bundle = await api.databases.deleteTemplate({ databaseId, templateId });
    assert.equal((bundle.schema.templates ?? []).some((template) => template.id === templateId), false);
    assert.equal(bundle.views.find((view) => view.id === apiView.id)?.defaultTemplateId, undefined);
    bundle = await api.views.delete({ databaseId, viewId: apiView.id });
    assert.equal(bundle.views.some((view) => view.id === apiView.id), false);
    assert.equal(bundle.views.some((view) => view.id === copiedView.id), true);
    assert.notEqual(bundle.schema.defaultViewId, apiView.id);
    bundle = await api.databases.get(databaseId);
    assert.equal(bundle.views.some((view) => view.id === apiView.id), false);
    assert.equal(bundle.views.some((view) => view.id === copiedView.id), true);
    assert.notEqual(bundle.schema.defaultViewId, apiView.id);
    bundle = await api.views.delete({ databaseId, viewId: copiedView.id });
    assert.equal(bundle.views.some((view) => view.id === copiedView.id), false);
    assert.deepEqual(
      bundle.views
        .filter((view) => view.id === "view_created_time_asc" || view.id === "view_created_time_desc")
        .map((view) => view.id)
        .sort(),
      ["view_created_time_asc", "view_created_time_desc"]
    );
    assert.equal(bundle.views.some((view) => view.id === bundle.schema.defaultViewId), true);
    bundle = await api.databases.deleteRow({ databaseId, rowId: templateRowId });
    assert.equal(bundle.records.some((record) => record.id === templateRowId), false);

    const disposableDatabase = await api.databases.create({
      name: "Disposable Database",
      template: {
        fields: [{ id: "note", name: "Note", type: "text" }],
        rows: [{ title: "Disposable row", note: "remove me" }]
      }
    });
    const disposableDatabaseId = disposableDatabase.schema.id;
    assert.equal((await api.databases.list()).some((item) => item.id === disposableDatabaseId), true);
    await api.databases.delete(disposableDatabaseId);
    assert.equal((await api.databases.list()).some((item) => item.id === disposableDatabaseId), false);
    assert.equal((await api.workspace.getManifest()).databases.includes(disposableDatabaseId), false);
    await assert.rejects(() => api.databases.get(disposableDatabaseId), /ENOENT|no such file/i);

    const disposablePage = await api.pages.create({ title: "Disposable API Page" });
    assert.equal((await api.workspace.getManifest()).activePageId, disposablePage.meta.id);
    await api.pages.delete(disposablePage.meta.id);
    assert.equal((await api.pages.list()).some((item) => item.id === disposablePage.meta.id), false);
    const manifestAfterPageDelete = await api.workspace.getManifest();
    assert.equal(manifestAfterPageDelete.pages.includes(disposablePage.meta.id), false);
    assert.notEqual(manifestAfterPageDelete.activePageId, disposablePage.meta.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
