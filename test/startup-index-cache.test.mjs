import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { createLotionCustomerApi } from "../dist-electron/main/customer-api.js";
import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import { fileService } from "../dist-electron/main/services/file-service.js";
import { PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { databaseFolderName } from "../dist-electron/shared/workspace-paths.js";
import { createStartupWorkspaceFixture } from "../scripts/startup-workspace-fixture.mjs";

test("persistent startup cache hits without parsing source files", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    const rebuilt = await first.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "cache-missing");
    assert.equal(
      fileService.exists(join(fixture.root, ".lotion-cache", "startup.sqlite")),
      false,
      "derived startup data must stay out of the synced workspace"
    );
    assert.equal(fileService.exists(startupCachePath(appConfigPath, fixture.root)), true);

    const second = await openApi(appConfigPath, fixture.root);
    const sourceReads = [];
    const originalReadText = fileService.readText.bind(fileService);
    fileService.readText = async (path) => {
      sourceReads.push(String(path));
      return originalReadText(path);
    };
    try {
      const hit = await second.workspace.getStartupIndex();
      assert.equal(hit.cache.status, "hit");
      assert.equal(hit.pages.length, fixture.pageCount);
      assert.equal(hit.databases.length, fixture.databaseCount);
      assert.equal(hit.pagesTree.databases.length, fixture.databaseCount);
      assert.equal(
        hit.pagesTree.databases.every((database) => database.fileNames.length === 0),
        true,
        "startup should not materialize collapsed row-page file trees"
      );
      assert.equal(sourceReads.length, 0, "cache hit should not read CSV or JSON source contents");

      assert.ok(fixture.targetRowPageId, "fixture should include a database row page");
      assert.ok(fixture.targetRowPageBodyPath);
      const rowPageFiles = await second.workspace.listRowPageFiles(fixture.databaseIds[0]);
      assert.equal(rowPageFiles.includes(basename(fixture.targetRowPageBodyPath)), true);
      assert.equal(
        sourceReads.some((path) => path.startsWith(fixture.root)),
        false,
        "lazy row-page file lookup should read only the machine-local sidecar"
      );
      const rowPage = await second.rowPages.open(fixture.databaseIds[0], fixture.targetRowPageId);
      assert.equal(rowPage.title, fixture.targetRowPageTitle);
      assert.match(rowPage.markdown, /Cached row-page startup body/);
      assert.equal(
        sourceReads.includes(pagesCsvPath(fixture.root)),
        false,
        "restoring a cached row page must not parse the system pages CSV"
      );
    } finally {
      fileService.readText = originalReadText;
    }
  });
});

test("external row-page body-path edits invalidate cached startup snapshots", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    assert.ok(fixture.targetRowPageId);
    assert.ok(fixture.targetRowPageBodyPath);
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();

    const pagesCsv = pagesCsvPath(fixture.root);
    const externalBodyPath = fixture.targetRowPageBodyPath.replace(/\.md$/, "-external.md");
    const csvBefore = await readFile(pagesCsv, "utf8");
    assert.match(csvBefore, new RegExp(escapeRegExp(fixture.targetRowPageBodyPath)));
    await writeFile(
      pagesCsv,
      csvBefore.replace(fixture.targetRowPageBodyPath, externalBodyPath),
      "utf8"
    );
    await writeFile(join(fixture.root, externalBodyPath), "# External row page\n\nFresh external body.\n", "utf8");

    const second = await openApi(appConfigPath, fixture.root);
    const rebuilt = await second.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "source-files-changed");
    const rowPage = await second.rowPages.open(fixture.databaseIds[0], fixture.targetRowPageId);
    assert.match(rowPage.markdown, /Fresh external body/);

    const third = await openApi(appConfigPath, fixture.root);
    assert.equal((await third.workspace.getStartupIndex()).cache.status, "hit");
    assert.match(
      (await third.rowPages.open(fixture.databaseIds[0], fixture.targetRowPageId)).markdown,
      /Fresh external body/
    );
  });
});

test("normal page edits keep the next launch on the warm cache", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const changedTitle = "Incrementally cached page title";
    await first.pages.rename(fixture.targetPageId, changedTitle);

    const second = await openApi(appConfigPath, fixture.root);
    const sourceReads = [];
    const originalReadText = fileService.readText.bind(fileService);
    fileService.readText = async (path) => {
      sourceReads.push(String(path));
      return originalReadText(path);
    };
    try {
      const hit = await second.workspace.getStartupIndex();
      assert.equal(hit.cache.status, "hit");
      assert.equal(hit.cache.reason, "source-signatures-match-with-page-overrides");
      assert.equal(hit.pages.find((page) => page.id === fixture.targetPageId)?.title, changedTitle);
      assert.equal(
        sourceReads.includes(pagesCsvPath(fixture.root)),
        false,
        "an app-routed page edit should not force the next launch to parse pages CSV"
      );
    } finally {
      fileService.readText = originalReadText;
    }
  });
});

test("created and deleted pages remain consistent through the local mutation overlay", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const created = await first.pages.create({ title: "Locally cached new page" });

    const second = await openApi(appConfigPath, fixture.root);
    const afterCreate = await second.workspace.getStartupIndex();
    assert.equal(afterCreate.cache.status, "hit", JSON.stringify(afterCreate.cache));
    assert.equal(afterCreate.cache.reason, "source-signatures-match-with-page-overrides");
    assert.equal(afterCreate.pages.some((page) => page.id === created.meta.id), true);

    await second.pages.delete(created.meta.id);
    const third = await openApi(appConfigPath, fixture.root);
    const afterDelete = await third.workspace.getStartupIndex();
    assert.equal(afterDelete.cache.status, "hit");
    assert.equal(afterDelete.pages.some((page) => page.id === created.meta.id), false);
  });
});

test("corrupt page overrides rebuild safely from source", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const changedTitle = "Source survives corrupt page override";
    await first.pages.rename(fixture.targetPageId, changedTitle);
    await writeFile(
      startupOverridesPath(appConfigPath, fixture.root),
      "{not-json",
      "utf8"
    );

    const second = await openApi(appConfigPath, fixture.root);
    const rebuilt = await second.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "page-overrides-corrupt");
    assert.equal(rebuilt.pages.find((page) => page.id === fixture.targetPageId)?.title, changedTitle);

    const third = await openApi(appConfigPath, fixture.root);
    assert.equal((await third.workspace.getStartupIndex()).cache.status, "hit");
  });
});

test("external pages CSV, database schema, and manifest edits invalidate the cache", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();

    const pagesCsv = join(
      fixture.root,
      "databases",
      "system",
      databaseFolderName(PAGES_DATABASE_ID, "pages"),
      "data.csv"
    );
    const csvBefore = await readFile(pagesCsv, "utf8");
    const changedTitle = "Externally edited startup title";
    await writeFile(pagesCsv, csvBefore.replace(fixture.targetTitle, changedTitle), "utf8");
    let api = await openApi(appConfigPath, fixture.root);
    let rebuilt = await api.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "source-files-changed");
    assert.equal(rebuilt.pages.find((page) => page.id === fixture.targetPageId)?.title, changedTitle);

    const databaseId = fixture.databaseIds[0];
    const schemaPath = join(
      fixture.root,
      "databases",
      "user",
      databaseFolderName(databaseId, "Startup Records 1"),
      "schema.json"
    );
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    schema.name = "Externally renamed database";
    await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
    api = await openApi(appConfigPath, fixture.root);
    rebuilt = await api.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "source-files-changed");
    assert.equal(rebuilt.databases.find((database) => database.id === databaseId)?.name, schema.name);

    const manifestPath = join(fixture.root, "lotion.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.pages.reverse();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    api = await openApi(appConfigPath, fixture.root);
    rebuilt = await api.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "manifest-index-changed");
    assert.deepEqual(rebuilt.pages.map((page) => page.id), manifest.pages);
  });
});

test("corrupt caches rebuild from source without changing source data", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const pagesCsv = pagesCsvPath(fixture.root);
    const sourceBefore = await readFile(pagesCsv);
    const cachePath = startupCachePath(appConfigPath, fixture.root);
    await writeFile(cachePath, "not a sqlite database", "utf8");

    const second = await openApi(appConfigPath, fixture.root);
    const rebuilt = await second.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "cache-corrupt");
    assert.equal(rebuilt.pages.length, fixture.pageCount);
    assert.deepEqual(await readFile(pagesCsv), sourceBefore);

    const third = await openApi(appConfigPath, fixture.root);
    assert.equal((await third.workspace.getStartupIndex()).cache.status, "hit");
  });
});

test("missing row-page sidecars rebuild without changing source data", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const pagesCsv = pagesCsvPath(fixture.root);
    const sourceBefore = await readFile(pagesCsv);
    const cacheDirectory = startupCacheDirectory(appConfigPath, fixture.root);
    const rowDataFile = (await readdir(cacheDirectory)).find((name) => name.endsWith(".ndjson"));
    assert.ok(rowDataFile);
    await rm(join(cacheDirectory, rowDataFile));

    const second = await openApi(appConfigPath, fixture.root);
    const rebuilt = await second.workspace.getStartupIndex();
    assert.equal(rebuilt.cache.status, "rebuilt");
    assert.equal(rebuilt.cache.reason, "row-page-cache-missing");
    assert.deepEqual(await readFile(pagesCsv), sourceBefore);

    const third = await openApi(appConfigPath, fixture.root);
    assert.equal((await third.workspace.getStartupIndex()).cache.status, "hit");
  });
});

test("same-size corrupt lazy row-page index falls back to source without data loss", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    assert.ok(fixture.targetRowPageId);
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const pagesCsv = pagesCsvPath(fixture.root);
    const sourceBefore = await readFile(pagesCsv);
    const cacheDirectory = startupCacheDirectory(appConfigPath, fixture.root);
    const rowIndexFile = (await readdir(cacheDirectory)).find((name) => name.endsWith(".index.json"));
    assert.ok(rowIndexFile);
    const rowIndexPath = join(cacheDirectory, rowIndexFile);
    const indexBefore = await readFile(rowIndexPath);
    const corrupt = Buffer.from(indexBefore);
    corrupt[0] = "[".charCodeAt(0);
    await writeFile(rowIndexPath, corrupt);

    const second = await openApi(appConfigPath, fixture.root);
    const hit = await second.workspace.getStartupIndex();
    assert.equal(hit.cache.status, "hit");
    const rowPage = await second.rowPages.open(
      fixture.databaseIds[0],
      fixture.targetRowPageId
    );
    assert.match(rowPage.markdown, /Cached row-page startup body/);
    assert.deepEqual(await readFile(pagesCsv), sourceBefore);
  });
});

test("same-size valid JSON corruption in lazy row-page data falls back to source", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    assert.ok(fixture.targetRowPageId);
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const pagesCsv = pagesCsvPath(fixture.root);
    const sourceBefore = await readFile(pagesCsv);
    const cacheDirectory = startupCacheDirectory(appConfigPath, fixture.root);
    const entries = await readdir(cacheDirectory);
    const rowIndexFile = entries.find((name) => name.endsWith(".index.json"));
    const rowDataFile = entries.find((name) => name.endsWith(".ndjson"));
    assert.ok(rowIndexFile);
    assert.ok(rowDataFile);

    const rowIndex = JSON.parse(await readFile(join(cacheDirectory, rowIndexFile), "utf8"));
    const [offset, length] = rowIndex.records[fixture.targetRowPageId];
    const rowDataPath = join(cacheDirectory, rowDataFile);
    const rowData = await readFile(rowDataPath);
    const snapshot = JSON.parse(rowData.subarray(offset, offset + length).toString("utf8"));
    snapshot.meta.title = "X".repeat(snapshot.meta.title.length);
    const corruptRecord = Buffer.from(`${JSON.stringify(snapshot)}\n`, "utf8");
    assert.equal(corruptRecord.byteLength, length, "corruption fixture must preserve the data-file size");
    corruptRecord.copy(rowData, offset);
    await writeFile(rowDataPath, rowData);

    const second = await openApi(appConfigPath, fixture.root);
    const hit = await second.workspace.getStartupIndex();
    assert.equal(hit.cache.status, "hit");
    const rowPage = await second.rowPages.open(
      fixture.databaseIds[0],
      fixture.targetRowPageId
    );
    assert.equal(rowPage.title, fixture.targetRowPageTitle);
    assert.match(rowPage.markdown, /Cached row-page startup body/);
    assert.deepEqual(await readFile(pagesCsv), sourceBefore);
  });
});

test("failed atomic cache replacement preserves the previous cache and all source data", async () => {
  await withFixture(async ({ fixture, appConfigPath }) => {
    const first = await openApi(appConfigPath, fixture.root);
    await first.workspace.getStartupIndex();
    const cachePath = startupCachePath(appConfigPath, fixture.root);
    const cacheBefore = await readFile(cachePath);
    const pagesCsv = pagesCsvPath(fixture.root);
    const changedTitle = "Crash-safe external title";
    const changedSource = (await readFile(pagesCsv, "utf8")).replace(fixture.targetTitle, changedTitle);
    await writeFile(pagesCsv, changedSource, "utf8");

    const originalWriteBufferAtomic = fileService.writeBufferAtomic.bind(fileService);
    fileService.writeBufferAtomic = async (path, value) => {
      if (String(path) === cachePath) throw new Error("simulated cache write interruption");
      return originalWriteBufferAtomic(path, value);
    };
    try {
      const interrupted = await openApi(appConfigPath, fixture.root);
      const rebuilt = await interrupted.workspace.getStartupIndex();
      assert.equal(rebuilt.cache.status, "rebuilt");
      assert.equal(rebuilt.pages.find((page) => page.id === fixture.targetPageId)?.title, changedTitle);
    } finally {
      fileService.writeBufferAtomic = originalWriteBufferAtomic;
    }

    assert.deepEqual(await readFile(cachePath), cacheBefore, "failed replacement must leave old cache intact");
    assert.equal(await readFile(pagesCsv, "utf8"), changedSource, "cache failure must not rewrite source data");

    const recovered = await openApi(appConfigPath, fixture.root);
    assert.equal((await recovered.workspace.getStartupIndex()).cache.status, "rebuilt");
    const warm = await openApi(appConfigPath, fixture.root);
    assert.equal((await warm.workspace.getStartupIndex()).cache.status, "hit");
  });
});

async function withFixture(run) {
  const fixture = await createStartupWorkspaceFixture({
    name: `cache_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    pageCount: 8,
    pageIndexRecordCount: 40,
    databaseCount: 3,
    rowsPerDatabase: 2,
    sparsePageBodies: true
  });
  const configRoot = await mkdtemp(join(tmpdir(), "lotion-startup-cache-config-"));
  const appConfigPath = join(configRoot, "app-config.json");
  try {
    await run({ fixture, appConfigPath });
  } finally {
    fileService.clearCache();
    await rm(fixture.root, { recursive: true, force: true });
    await rm(configRoot, { recursive: true, force: true });
  }
}

async function openApi(appConfigPath, root) {
  fileService.clearCache();
  const api = createLotionCustomerApi({
    appConfig: new AppConfigService(appConfigPath)
  });
  await api.workspace.open(root);
  return api;
}

function pagesCsvPath(root) {
  return join(
    root,
    "databases",
    "system",
    databaseFolderName(PAGES_DATABASE_ID, "pages"),
    "data.csv"
  );
}

function startupCacheDirectory(appConfigPath, root) {
  const key = createHash("sha256").update(root).digest("hex").slice(0, 24);
  return join(dirname(appConfigPath), "workspace-cache", key);
}

function startupCachePath(appConfigPath, root) {
  return join(startupCacheDirectory(appConfigPath, root), "startup.sqlite");
}

function startupOverridesPath(appConfigPath, root) {
  return join(startupCacheDirectory(appConfigPath, root), "startup-page-overrides.json");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
