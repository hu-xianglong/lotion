import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLotionCustomerApi } from "lotion/customer-api";

const DATABASE_HASH = "11111111222233334444555555555555";
const ROW_HASH = "aaaaaaaa111111112222222233333333";
const PAGE_HASH = "bbbbbbbb111111112222222233333333";

test("integration: imports a Notion export and opens the resulting workspace through the public API", async () => {
  const root = await mkdtemp(join(tmpdir(), "lotion-integration-"));
  const source = join(root, "notion-export");
  const target = join(root, "imported-workspace");
  const api = createLotionCustomerApi({ appConfig: createMemoryConfig() });
  const progress = [];

  try {
    await createMiniNotionExport(source);

    const scan = await api.notion.scan(source);
    assert.equal(scan.databasesRaw, 1);
    assert.equal(scan.databasesKept, 1);
    assert.equal(scan.databases[0].title, "Projects");
    assert.equal(scan.topLevelPages, 1);
    assert.equal(scan.attachments >= 1, true);

    const imported = await api.notion.runImport({
      sourcePath: source,
      targetPath: target,
      force: true,
      options: {
        skipEmptyRowsAndPages: true,
        dedupeMarkdownFiles: true,
        includeOriginalHtml: true
      },
      onProgress: (event) => progress.push(event)
    });
    assert.equal(imported.workspaceRoot, target);
    assert.ok(imported.reportPageId);
    assert.equal(progress.some((event) => event.phase === "done"), true);

    await api.workspace.open(target);
    const manifest = await api.workspace.getManifest();
    assert.equal(manifest.name, "imported-workspace");

    const databases = await api.databases.list();
    const projectsSummary = databases.find((database) => database.name === "Projects");
    assert.ok(projectsSummary);

    const projects = await api.databases.get(projectsSummary.id);
    assert.equal(projects.records.length, 1);
    const row = projects.records[0];
    assert.equal(row.title, "Integration Row");
    assert.equal(cellByFieldName(projects, row, "Status"), "Todo");
    assert.equal(cellByFieldName(projects, row, "URL"), "https://example.com/integration");
    assert.ok(cellByFieldName(projects, row, "Original Notion HTML"));
    assert.ok(cellByFieldName(projects, row, "Original Notion CSV"));

    const rowPage = await api.rowPages.open(projects.schema.id, String(row.id));
    assert.equal(rowPage.title, "Integration Row");
    assert.match(rowPage.markdown, /Imported integration body/);
    assert.match(rowPage.markdown, /!\[chart\.png\]/);

    const tree = await api.workspace.getPagesTree();
    assert.equal(tree.databases.some((folder) => folder.databaseId === projects.schema.id), true);
    assert.equal(tree.topLevelPages.some((page) => page.title === "Standalone Page"), true);

    const search = await api.search.query("Imported integration body");
    assert.equal(search.hits.some((hit) => hit.title === "Integration Row"), true);

    const standaloneSearch = await api.search.query("Standalone import body");
    assert.equal(standaloneSearch.hits.some((hit) => hit.title === "Standalone Page"), true);

    const audit = await api.notion.audit({
      sourcePaths: [source],
      workspacePath: target,
      auditAllHtml: true,
      maxIssues: 20
    });
    assert.equal(audit.summary.sourceCsvs, 1);
    assert.equal(audit.summary.workspaceRows >= 1, true);
    assert.equal(audit.summary.issues, 0);

    const report = await api.pages.get(imported.reportPageId);
    assert.match(report.markdown, /# Notion import report/);
    assert.match(report.markdown, /## Summary/);
    assert.match(report.markdown, /Projects/);

    const originalHtmlRel = cellByFieldName(projects, row, "Original Notion HTML");
    const originalHtml = await readFile(join(target, originalHtmlRel), "utf8");
    assert.match(originalHtml, /Imported integration body/);

    let working = await api.databases.addField(projects.schema.id, { name: "Score", type: "number" });
    const scoreField = working.schema.fields.find((field) => field.name === "Score");
    assert.ok(scoreField);
    working = await api.databases.updateField({
      databaseId: projects.schema.id,
      fieldId: scoreField.id,
      name: "Score Total",
      type: "number"
    });
    assert.equal(working.schema.fields.find((field) => field.id === scoreField.id)?.name, "Score Total");
    working = await api.databases.updateCell({
      databaseId: projects.schema.id,
      rowId: String(row.id),
      fieldId: scoreField.id,
      value: 42
    });
    assert.equal(working.records.find((record) => record.id === row.id)?.[scoreField.id], 42);

    working = await api.views.create({ databaseId: projects.schema.id, name: "Imported View" });
    const importedView = working.views.find((view) => view.name === "Imported View");
    assert.ok(importedView);
    working = await api.views.update({
      databaseId: projects.schema.id,
      view: {
        ...importedView,
        visibleFieldIds: ["title", scoreField.id, "missing-field"],
        fieldOrder: ["title", scoreField.id, "missing-field"],
        wrapFieldIds: ["title", "missing-field"],
        columnWidths: { title: 240, [scoreField.id]: 120, "missing-field": 80 }
      }
    });
    const savedView = working.views.find((view) => view.id === importedView.id);
    assert.deepEqual(savedView?.fieldOrder, ["title", scoreField.id]);
    assert.deepEqual(savedView?.wrapFieldIds, ["title"]);

    working = await api.databases.saveTemplate({
      databaseId: projects.schema.id,
      template: {
        name: "Imported Template",
        values: { title: "Generated Row", [scoreField.id]: 7, "missing-field": "ignored" },
        markdown: "Generated row body",
        fullWidth: true
      }
    });
    const templateId = working.schema.templates?.find((template) => template.name === "Imported Template")?.id;
    assert.ok(templateId);
    working = await api.databases.addRow(projects.schema.id, templateId);
    const generated = working.records.find((record) => record.title === "Generated Row");
    assert.ok(generated);
    let generatedPage = await api.rowPages.open(projects.schema.id, String(generated.id));
    assert.equal(generatedPage.markdown.includes("Generated row body"), true);
    assert.equal(generatedPage.fullWidth, true);
    generatedPage = await api.rowPages.update({
      databaseId: projects.schema.id,
      rowId: String(generated.id),
      markdown: "Generated row edited body"
    });
    assert.equal(generatedPage.markdown, "Generated row edited body");
    generatedPage = await api.rowPages.setFullWidth({
      databaseId: projects.schema.id,
      rowId: String(generated.id),
      fullWidth: false
    });
    assert.equal(!!generatedPage.fullWidth, false);

    const stats = await api.databases.refreshStats();
    assert.equal(stats.some((stat) => stat.id === projects.schema.id), true);
    assert.equal((await api.databases.listStats()).some((stat) => stat.id === projects.schema.id), true);

    working = await api.databases.deleteTemplate({ databaseId: projects.schema.id, templateId });
    assert.equal((working.schema.templates ?? []).some((template) => template.id === templateId), false);
    working = await api.databases.deleteRow({ databaseId: projects.schema.id, rowId: String(generated.id) });
    assert.equal(working.records.some((record) => record.id === generated.id), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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

async function createMiniNotionExport(source) {
  await mkdir(join(source, "Projects", `Integration Row ${ROW_HASH}`), { recursive: true });
  await writeFile(
    join(source, `Projects ${DATABASE_HASH}.csv`),
    "Name,Status,URL\nIntegration Row,Todo,https://example.com/integration\n",
    "utf8"
  );
  await writeFile(
    join(source, "Projects", `Integration Row ${ROW_HASH}.html`),
    notionPage(
      "Integration Row",
      [
        "<p>Imported integration body.</p>",
        `<p><a href="../Standalone%20Page%20${PAGE_HASH}.html">Standalone Page</a></p>`,
        `<img src="Integration%20Row%20${ROW_HASH}/chart.png">`
      ].join(""),
      `<table class="properties"><tbody>
        <tr class="property-row property-row-select"><th>Status</th><td>Todo</td></tr>
        <tr class="property-row property-row-url"><th>URL</th><td><a href="https://example.com/integration">https://example.com/integration</a></td></tr>
      </tbody></table>`
    ),
    "utf8"
  );
  await writeFile(
    join(source, "Projects", `Integration Row ${ROW_HASH}`, "chart.png"),
    "fake png bytes",
    "utf8"
  );
  await writeFile(
    join(source, `Standalone Page ${PAGE_HASH}.html`),
    notionPage("Standalone Page", "<p>Standalone import body.</p>"),
    "utf8"
  );
}

function notionPage(title, body, properties = "") {
  return `<!doctype html><html><body><article class="page sans"><header><h1 class="page-title">${title}</h1>${properties}</header><div class="page-body">${body}</div></article></body></html>`;
}

function cellByFieldName(bundle, row, fieldName) {
  const field = bundle.schema.fields.find((item) => item.name === fieldName);
  assert.ok(field, `Expected field ${fieldName}`);
  return row[field.id];
}
