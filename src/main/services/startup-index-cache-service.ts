import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { basename, join, relative } from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import { PAGES_DATABASE_ID } from "../../shared/constants.js";
import type {
  DatabaseSummary,
  PageMeta,
  SpaceManifest,
  StartupCacheDiagnostics,
  StartupWorkspaceIndex
} from "../../shared/types.js";
import { databaseStableFolderId } from "../../shared/workspace-paths.js";
import type { WorkspacePaths } from "../storage/paths.js";
import { mapWithConcurrency } from "./concurrency.js";
import { fileService } from "./file-service.js";
import type { PageService, StartupPageSnapshot } from "./page-service.js";
import type {
  PagesDatabaseService,
  StartupPageRecordSnapshot,
  StartupPageRecordsMutation
} from "./pages-database-service.js";
import type { WorkspaceService } from "./workspace-service.js";

const CACHE_SCHEMA_VERSION = 5;
const CACHE_FILE_NAME = "startup.sqlite";
const OVERRIDES_SCHEMA_VERSION = 1;
const OVERRIDES_FILE_NAME = "startup-page-overrides.json";
const ROW_STORE_SCHEMA_VERSION = 2;
const ROW_STORE_DATA_PREFIX = "startup-page-records-";
const LEGACY_WORKSPACE_CACHE_FILES = [
  ".lotion-cache/startup.sqlite",
  ".lotion-cache/startup-page-overrides.json"
] as const;
const SOURCE_STAT_CONCURRENCY = 96;
const require = createRequire(import.meta.url);

let sqlPromise: Promise<SqlJsStatic> | undefined;

interface SourceFingerprint {
  id: string;
  path: string;
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}

interface CacheReadResult {
  index?: CachedSourceIndex;
  sources?: SourceFingerprint[];
  overrides?: StartupPageOverrides;
  rowStore?: RowStoreDescriptor;
  reason: string;
  bytes: number;
  validationMs: number;
  readMs: number;
}

interface CacheWriteResult {
  bytes: number;
  rowStore: RowStoreDescriptor;
}

interface StartupCachePaths {
  directory: string;
  index: string;
  overrides: string;
  diagnosticPath: string;
}

interface RowStoreDescriptor {
  version: typeof ROW_STORE_SCHEMA_VERSION;
  dataFile: string;
  indexFile: string;
  dataBytes: number;
  indexBytes: number;
  recordCount: number;
}

interface RowStoreIndex {
  version: typeof ROW_STORE_SCHEMA_VERSION;
  dataFile: string;
  dataBytes: number;
  records: Record<string, [offset: number, length: number, digest: string]>;
  filesByDatabase: Record<string, string[]>;
}

interface ActiveRowStore {
  cacheDirectory: string;
  descriptor: RowStoreDescriptor;
}

interface StartupPageOverrides {
  version: typeof OVERRIDES_SCHEMA_VERSION;
  basePagesSource: SourceFingerprint;
  currentPagesSource: SourceFingerprint;
  upserts: StartupPageRecordSnapshot[];
  deletedIds: string[];
}

interface CachedSourceIndex {
  pages: PageMeta[];
  pageSnapshots: StartupPageSnapshot[];
  databases: DatabaseSummary[];
  pagesTree: StartupWorkspaceIndex["pagesTree"];
}

interface SourceIndex {
  pages: PageMeta[];
  pageSnapshots: StartupPageSnapshot[];
  pageRecordSnapshots: StartupPageRecordSnapshot[];
  databases: DatabaseSummary[];
  pagesTree: StartupWorkspaceIndex["pagesTree"];
}

export class StartupIndexCacheService {
  private loadRoot?: string;
  private loadPromise?: Promise<StartupWorkspaceIndex>;
  private activeRoot?: string;
  private activeBasePagesSource?: SourceFingerprint;
  private activeOverrideUpserts = new Map<string, StartupPageRecordSnapshot>();
  private activeOverrideDeletedIds = new Set<string>();
  private activeRowStore?: ActiveRowStore;
  private activeRowStoreIndexPromise?: Promise<RowStoreIndex>;
  private warnedRowStoreFailure = false;
  private overrideWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly workspace: WorkspaceService,
    private readonly pages: PageService,
    private readonly databases: { list(): Promise<DatabaseSummary[]> },
    private readonly pageRecords: PagesDatabaseService,
    private readonly localCacheRoot: string
  ) {
    this.pageRecords.subscribeStartupMutations((mutation) => this.queuePageMutation(mutation));
  }

  async load(): Promise<StartupWorkspaceIndex> {
    const root = this.workspace.requirePaths().root;
    if (this.loadPromise && this.loadRoot === root) return this.loadPromise;
    this.loadRoot = root;
    const promise = this.loadFresh();
    this.loadPromise = promise;
    try {
      return await promise;
    } finally {
      if (this.loadPromise === promise) {
        this.loadPromise = undefined;
        this.loadRoot = undefined;
      }
    }
  }

  private async loadFresh(): Promise<StartupWorkspaceIndex> {
    const paths = this.workspace.requirePaths();
    const manifest = await this.workspace.getManifest();
    const cache = startupCachePaths(this.localCacheRoot, paths.root);
    const cached = await this.readCache(cache, paths, manifest);
    if (cached.index && cached.sources && cached.rowStore) {
      this.activateCache(paths.root, cached.sources, cached.overrides, {
        cacheDirectory: cache.directory,
        descriptor: cached.rowStore
      });
      this.pages.primeStartupSnapshots(cached.index.pageSnapshots);
      this.pageRecords.primeStartupSnapshotLookup((id) =>
        this.readActivePageRecordSnapshot(paths.root, id)
      );
      return {
        pages: cached.index.pages,
        databases: cached.index.databases,
        pagesTree: cached.index.pagesTree,
        cache: diagnostics(cache.diagnosticPath, "hit", cached.reason, cached)
      };
    }

    this.deactivateCache();
    const buildStartedAt = performance.now();
    const { index, sources } = await this.buildConsistentSourceIndex(paths, manifest);
    this.pages.primeStartupSnapshots(index.pageSnapshots);
    this.pageRecords.primeStartupSnapshots(index.pageRecordSnapshots);
    const buildMs = elapsedMs(buildStartedAt);
    const writeStartedAt = performance.now();
    let bytes = cached.bytes;
    let writeMs = 0;
    let persisted = false;
    let rowStore: RowStoreDescriptor | undefined;
    try {
      const written = await this.writeCache(cache, paths.root, manifest, sources, index);
      bytes = written.bytes;
      rowStore = written.rowStore;
      writeMs = elapsedMs(writeStartedAt);
      persisted = true;
    } catch (error) {
      writeMs = elapsedMs(writeStartedAt);
      console.warn("[lotion startup cache] failed to persist rebuild", error);
    }
    if (persisted && rowStore) {
      this.activateCache(paths.root, sources, undefined, {
        cacheDirectory: cache.directory,
        descriptor: rowStore
      });
      await fileService.remove(cache.overrides, { force: true }).catch(() => undefined);
      await removeLegacyWorkspaceStartupCache(paths.root);
    } else {
      this.deactivateCache();
    }
    return {
      pages: index.pages,
      databases: index.databases,
      pagesTree: index.pagesTree,
      cache: {
        status: "rebuilt",
        reason: cached.reason,
        path: cache.diagnosticPath,
        bytes,
        validationMs: cached.validationMs,
        readMs: cached.readMs,
        buildMs,
        writeMs
      }
    };
  }

  private async buildSourceIndex(): Promise<SourceIndex> {
    const [pages, databases, pageRecordSnapshots] = await Promise.all([
      this.pages.list(),
      this.databases.list(),
      this.pageRecords.getStartupSnapshots()
    ]);
    const snapshotMap = new Map(pageRecordSnapshots.map((snapshot) => [snapshot.meta.id, snapshot]));
    const pageSnapshots = pages.map((page) => snapshotMap.get(page.id) ?? { meta: page });
    return {
      pages,
      pageSnapshots,
      pageRecordSnapshots,
      databases,
      pagesTree: {
        topLevelPages: pages,
        databases: databases.map((database) => ({
          databaseId: database.id,
          name: database.name,
          fileNames: []
        }))
      }
    };
  }

  async listRowPageFiles(databaseId: string): Promise<string[]> {
    const paths = this.workspace.requirePaths();
    const root = paths.root;
    let indexedFiles: string[];
    if (this.activeRoot === root && this.activeRowStore) {
      indexedFiles = await this.readActiveRowPageFiles(root, databaseId);
    } else {
      indexedFiles = (await this.pageRecords.listRowPageFilesByDatabase([databaseId])).get(databaseId) ?? [];
    }
    const files = new Set(indexedFiles);
    try {
      for (const fileName of await fileService.readDir(paths.rowPagesDir(databaseId))) {
        if (fileName.endsWith(".md")) files.add(fileName);
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
    return [...files].sort();
  }

  private activateCache(
    root: string,
    sources: SourceFingerprint[],
    overrides: StartupPageOverrides | undefined,
    rowStore: ActiveRowStore
  ): void {
    this.activeRoot = root;
    this.activeBasePagesSource = sources.find((source) => source.id === "pages-data");
    this.activeOverrideUpserts = new Map(
      (overrides?.upserts ?? []).map((snapshot) => [snapshot.meta.id, snapshot])
    );
    this.activeOverrideDeletedIds = new Set(overrides?.deletedIds ?? []);
    this.activeRowStore = rowStore;
    this.activeRowStoreIndexPromise = undefined;
    this.warnedRowStoreFailure = false;
  }

  private deactivateCache(): void {
    this.activeRoot = undefined;
    this.activeBasePagesSource = undefined;
    this.activeOverrideUpserts.clear();
    this.activeOverrideDeletedIds.clear();
    this.activeRowStore = undefined;
    this.activeRowStoreIndexPromise = undefined;
    this.warnedRowStoreFailure = false;
  }

  private async readActivePageRecordSnapshot(
    root: string,
    id: string
  ): Promise<StartupPageRecordSnapshot | undefined> {
    if (this.activeRoot !== root || this.activeOverrideDeletedIds.has(id)) return undefined;
    return this.activeOverrideUpserts.get(id)
      ?? await this.readBasePageRecordSnapshot(root, id);
  }

  private async readBasePageRecordSnapshot(
    root: string,
    id: string
  ): Promise<StartupPageRecordSnapshot | undefined> {
    if (this.activeRoot !== root || !this.activeRowStore) return undefined;
    try {
      const index = await this.loadActiveRowStoreIndex(root);
      const location = Object.prototype.hasOwnProperty.call(index.records, id)
        ? index.records[id]
        : undefined;
      if (!location) return undefined;
      const [offset, length, expectedDigest] = location;
      const handle = await fileService.open(
        join(this.activeRowStore.cacheDirectory, this.activeRowStore.descriptor.dataFile),
        "r"
      );
      try {
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (bytesRead !== length) throw new Error(`Expected ${length} bytes, read ${bytesRead}.`);
        if (sha256(buffer) !== expectedDigest) {
          throw new Error("Row-page startup cache record checksum mismatch.");
        }
        return JSON.parse(buffer.toString("utf8")) as StartupPageRecordSnapshot;
      } finally {
        await handle.close();
      }
    } catch (error) {
      this.handleRowStoreFailure(error);
      return undefined;
    }
  }

  private async readActiveRowPageFiles(root: string, databaseId: string): Promise<string[]> {
    try {
      const index = await this.loadActiveRowStoreIndex(root);
      const indexedFiles = Object.prototype.hasOwnProperty.call(index.filesByDatabase, databaseId)
        ? index.filesByDatabase[databaseId]
        : [];
      const files = new Set(indexedFiles);
      const deleted = await Promise.all(
        [...this.activeOverrideDeletedIds].map((id) => this.readBasePageRecordSnapshot(root, id))
      );
      for (const previous of deleted) {
        if (previous?.databaseId !== databaseId) continue;
        const fileName = rowPageFileName(previous);
        if (fileName) files.delete(fileName);
      }
      for (const snapshot of this.activeOverrideUpserts.values()) {
        const previous = await this.readBasePageRecordSnapshot(root, snapshot.meta.id);
        if (previous?.databaseId === databaseId) {
          const fileName = rowPageFileName(previous);
          if (fileName) files.delete(fileName);
        }
        if (snapshot.databaseId === databaseId) {
          const fileName = rowPageFileName(snapshot);
          if (fileName) files.add(fileName);
        }
      }
      return [...files].sort();
    } catch (error) {
      this.handleRowStoreFailure(error);
      return (await this.pageRecords.listRowPageFilesByDatabase([databaseId])).get(databaseId) ?? [];
    }
  }

  private async loadActiveRowStoreIndex(root: string): Promise<RowStoreIndex> {
    if (this.activeRoot !== root || !this.activeRowStore) {
      throw new Error("Row-page startup cache is not active for this workspace.");
    }
    this.activeRowStoreIndexPromise ??= readRowStoreIndex(this.activeRowStore);
    return this.activeRowStoreIndexPromise;
  }

  private handleRowStoreFailure(error: unknown): void {
    if (!this.warnedRowStoreFailure) {
      this.warnedRowStoreFailure = true;
      console.warn("[lotion startup cache] lazy row-page cache unavailable; falling back to source", error);
    }
    this.activeRowStore = undefined;
    this.activeRowStoreIndexPromise = undefined;
  }

  private queuePageMutation(mutation: StartupPageRecordsMutation): Promise<void> {
    const root = this.workspace.requirePaths().root;
    this.overrideWriteQueue = this.overrideWriteQueue
      .catch(() => undefined)
      .then(() => this.persistPageMutation(root, mutation));
    return this.overrideWriteQueue;
  }

  private async persistPageMutation(root: string, mutation: StartupPageRecordsMutation): Promise<void> {
    if (this.activeRoot !== root || !this.activeBasePagesSource) return;
    for (const id of mutation.deletedIds) {
      this.activeOverrideUpserts.delete(id);
      this.activeOverrideDeletedIds.add(id);
    }
    for (const snapshot of mutation.upserts) {
      this.activeOverrideDeletedIds.delete(snapshot.meta.id);
      this.activeOverrideUpserts.set(snapshot.meta.id, snapshot);
    }
    const paths = this.workspace.requirePaths();
    if (paths.root !== root) return;
    const currentPagesSource = await fingerprintSource(
      paths,
      "pages-data",
      paths.data(PAGES_DATABASE_ID, "pages")
    );
    const overrides: StartupPageOverrides = {
      version: OVERRIDES_SCHEMA_VERSION,
      basePagesSource: this.activeBasePagesSource,
      currentPagesSource,
      upserts: [...this.activeOverrideUpserts.values()],
      deletedIds: [...this.activeOverrideDeletedIds]
    };
    const cache = startupCachePaths(this.localCacheRoot, root);
    await fileService.writeTextAtomic(
      cache.overrides,
      `${JSON.stringify(overrides)}\n`
    );
  }

  private async buildConsistentSourceIndex(
    paths: WorkspacePaths,
    manifest: SpaceManifest
  ): Promise<{ index: SourceIndex; sources: SourceFingerprint[] }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = await collectSourceFingerprints(paths, manifest);
      const index = await this.buildSourceIndex();
      const after = await collectSourceFingerprints(paths, manifest);
      if (sourceFingerprintsEqual(before, after)) return { index, sources: after };
    }
    throw new Error("Workspace index sources changed repeatedly during cache rebuild.");
  }

  private async readCache(
    cache: StartupCachePaths,
    paths: WorkspacePaths,
    manifest: SpaceManifest
  ): Promise<CacheReadResult> {
    const readStartedAt = performance.now();
    let bytes: Buffer;
    try {
      bytes = await fileService.readBuffer(cache.index);
    } catch (error) {
      if (isNotFoundError(error)) {
        return { reason: "cache-missing", bytes: 0, validationMs: 0, readMs: elapsedMs(readStartedAt) };
      }
      return { reason: "cache-read-failed", bytes: 0, validationMs: 0, readMs: elapsedMs(readStartedAt) };
    }

    let db: Database | undefined;
    try {
      const SQL = await loadSql();
      db = new SQL.Database(bytes);
      const version = readMetadata(db, "schema_version");
      if (version !== String(CACHE_SCHEMA_VERSION)) {
        return {
          reason: "cache-version-changed",
          bytes: bytes.byteLength,
          validationMs: 0,
          readMs: elapsedMs(readStartedAt)
        };
      }
      const cachedManifestProjection = readMetadata(db, "manifest_projection");
      if (!cachedManifestProjection) {
        return {
          reason: "manifest-index-changed",
          bytes: bytes.byteLength,
          validationMs: 0,
          readMs: elapsedMs(readStartedAt)
        };
      }
      const currentManifestProjection = manifestProjection(manifest);
      const manifestMatches = cachedManifestProjection === currentManifestProjection;
      if (readMetadata(db, "workspace_root") !== paths.root) {
        return {
          reason: "workspace-cache-key-mismatch",
          bytes: bytes.byteLength,
          validationMs: 0,
          readMs: elapsedMs(readStartedAt)
        };
      }

      const sources = readSourceFingerprints(db);
      const validationStartedAt = performance.now();
      const validation = await inspectSourceFingerprints(paths, manifest, sources);
      const validationMs = elapsedMs(validationStartedAt);
      if (!validation.structurallyValid) {
        return {
          reason: "source-files-changed",
          bytes: bytes.byteLength,
          validationMs,
          readMs: elapsedMs(readStartedAt)
        };
      }

      let overrides: StartupPageOverrides | undefined;
      if (!manifestMatches || validation.mismatchedIds.length > 0) {
        if (
          validation.mismatchedIds.length > 1
          || (validation.mismatchedIds.length === 1 && validation.mismatchedIds[0] !== "pages-data")
        ) {
          return {
            reason: "source-files-changed",
            bytes: bytes.byteLength,
            validationMs,
            readMs: elapsedMs(readStartedAt)
          };
        }
        const basePagesSource = sources.find((source) => source.id === "pages-data");
        const currentPagesSource = validation.current.find((source) => source.id === "pages-data");
        if (!basePagesSource || !currentPagesSource) {
          return {
            reason: "source-files-changed",
            bytes: bytes.byteLength,
            validationMs,
            readMs: elapsedMs(readStartedAt)
          };
        }
        const overrideRead = await readPageOverrides(
          cache.overrides,
          basePagesSource,
          currentPagesSource
        );
        if (!overrideRead.overrides) {
          return {
            reason: !manifestMatches && overrideRead.reason === "source-files-changed"
              ? "manifest-index-changed"
              : overrideRead.reason,
            bytes: bytes.byteLength,
            validationMs,
            readMs: elapsedMs(readStartedAt)
          };
        }
        overrides = overrideRead.overrides;
        if (
          !manifestMatches
          && !manifestProjectionMatchesOverrides(
            cachedManifestProjection,
            currentManifestProjection,
            overrides
          )
        ) {
          return {
            reason: "manifest-index-changed",
            bytes: bytes.byteLength,
            validationMs,
            readMs: elapsedMs(readStartedAt)
          };
        }
      }

      const rowStore = await readRowStoreDescriptor(cache.directory, readMetadata(db, "row_store"));
      if (!rowStore) {
        return {
          reason: "row-page-cache-missing",
          bytes: bytes.byteLength,
          validationMs,
          readMs: elapsedMs(readStartedAt)
        };
      }

      const pageSnapshots = applyPageOverrides(
        readJsonPayloads<StartupPageSnapshot>(db, "pages"),
        overrides
      );
      const pages = pageSnapshots.map((snapshot) => snapshot.meta);
      const databases = readJsonPayloads<DatabaseSummary>(db, "databases");
      const index: Omit<StartupWorkspaceIndex, "cache"> = {
        pages,
        databases,
        pagesTree: {
          topLevelPages: pages,
          databases: databases.map((database) => ({
            databaseId: database.id,
            name: database.name,
            fileNames: []
          }))
        }
      };
      return {
        index: { ...index, pageSnapshots },
        sources,
        overrides,
        rowStore,
        reason: overrides ? "source-signatures-match-with-page-overrides" : "source-signatures-match",
        bytes: bytes.byteLength,
        validationMs,
        readMs: elapsedMs(readStartedAt)
      };
    } catch (error) {
      console.warn("[lotion startup cache] ignoring unreadable cache", error);
      return {
        reason: "cache-corrupt",
        bytes: bytes.byteLength,
        validationMs: 0,
        readMs: elapsedMs(readStartedAt)
      };
    } finally {
      db?.close();
    }
  }

  private async writeCache(
    cache: StartupCachePaths,
    workspaceRoot: string,
    manifest: SpaceManifest,
    sources: SourceFingerprint[],
    index: SourceIndex
  ): Promise<CacheWriteResult> {
    await fileService.ensureDir(cache.directory);
    const rowStore = await writeRowStore(cache.directory, index.pageRecordSnapshots);
    const SQL = await loadSql();
    const db = new SQL.Database();
    try {
      db.run(`
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL,
          dev INTEGER NOT NULL,
          ino INTEGER NOT NULL,
          size INTEGER NOT NULL,
          mtime_ms REAL NOT NULL,
          ctime_ms REAL NOT NULL
        );
        CREATE TABLE pages (position INTEGER PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE databases (position INTEGER PRIMARY KEY, payload TEXT NOT NULL);
      `);
      db.run("BEGIN IMMEDIATE");
      const metadataStatement = db.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
      metadataStatement.run(["schema_version", String(CACHE_SCHEMA_VERSION)]);
      metadataStatement.run(["manifest_projection", manifestProjection(manifest)]);
      metadataStatement.run(["workspace_root", workspaceRoot]);
      metadataStatement.run(["row_store", JSON.stringify(rowStore)]);
      metadataStatement.run(["created_at", new Date().toISOString()]);
      metadataStatement.free();

      const sourceStatement = db.prepare(`
        INSERT INTO sources (id, path, dev, ino, size, mtime_ms, ctime_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const source of sources) {
        sourceStatement.run([
          source.id,
          source.path,
          source.dev,
          source.ino,
          source.size,
          source.mtimeMs,
          source.ctimeMs
        ]);
      }
      sourceStatement.free();
      insertPayloads(db, "pages", index.pageSnapshots);
      insertPayloads(db, "databases", index.databases);
      db.run("COMMIT");
      const exported = db.export();
      await fileService.writeBufferAtomic(cache.index, exported);
      await cleanupUnusedRowStores(cache.directory, rowStore);
      return { bytes: exported.byteLength, rowStore };
    } catch (error) {
      try {
        db.run("ROLLBACK");
      } catch {
        // The transaction may not have started yet.
      }
      throw error;
    } finally {
      db.close();
    }
  }
}

async function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
  });
  return sqlPromise;
}

async function collectSourceFingerprints(
  paths: WorkspacePaths,
  manifest: SpaceManifest
): Promise<SourceFingerprint[]> {
  const schemaPaths = await userDatabaseSchemaPaths(paths, manifest.databases);
  const sources = [
    { id: "pages-schema", path: paths.schema(PAGES_DATABASE_ID, "pages") },
    { id: "pages-data", path: paths.data(PAGES_DATABASE_ID, "pages") },
    ...manifest.databases.map((id) => ({
      id: `database-schema:${id}`,
      path: schemaPaths.get(id) ?? paths.schema(id)
    }))
  ];
  return mapWithConcurrency(
    sources,
    SOURCE_STAT_CONCURRENCY,
    (source) => fingerprintSource(paths, source.id, source.path)
  );
}

interface SourceFingerprintInspection {
  structurallyValid: boolean;
  current: SourceFingerprint[];
  mismatchedIds: string[];
}

async function inspectSourceFingerprints(
  paths: WorkspacePaths,
  manifest: SpaceManifest,
  sources: SourceFingerprint[]
): Promise<SourceFingerprintInspection> {
  if (sources.length !== manifest.databases.length + 2) {
    return { structurallyValid: false, current: [], mismatchedIds: [] };
  }
  const ids = new Set(sources.map((source) => source.id));
  if (!ids.has("pages-schema") || !ids.has("pages-data")) {
    return { structurallyValid: false, current: [], mismatchedIds: [] };
  }
  if (manifest.databases.some((id) => !ids.has(`database-schema:${id}`))) {
    return { structurallyValid: false, current: [], mismatchedIds: [] };
  }
  const current = await mapWithConcurrency(sources, SOURCE_STAT_CONCURRENCY, async (source) => {
    try {
      return await fingerprintSource(paths, source.id, join(paths.root, source.path));
    } catch {
      return undefined;
    }
  });
  const mismatchedIds = sources.flatMap((source, index) => {
    const next = current[index];
    return next && sourceFingerprintEqual(source, next) ? [] : [source.id];
  });
  return {
    structurallyValid: true,
    current: current.filter((source): source is SourceFingerprint => Boolean(source)),
    mismatchedIds
  };
}

async function fingerprintSource(
  paths: WorkspacePaths,
  id: string,
  path: string
): Promise<SourceFingerprint> {
  const info = await fileService.stat(path);
  return {
    id,
    path: relative(paths.root, path),
    dev: info.dev,
    ino: info.ino,
    size: info.size,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs
  };
}

async function readPageOverrides(
  overridesPath: string,
  basePagesSource: SourceFingerprint,
  currentPagesSource: SourceFingerprint
): Promise<{ overrides?: StartupPageOverrides; reason: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fileService.readText(overridesPath));
  } catch (error) {
    return {
      reason: isNotFoundError(error) ? "source-files-changed" : "page-overrides-corrupt"
    };
  }
  if (!isStartupPageOverrides(parsed)) return { reason: "page-overrides-corrupt" };
  if (
    !sourceFingerprintEqual(parsed.basePagesSource, basePagesSource)
    || !sourceFingerprintEqual(parsed.currentPagesSource, currentPagesSource)
  ) {
    return { reason: "source-files-changed" };
  }
  return { overrides: parsed, reason: "source-signatures-match-with-page-overrides" };
}

function isStartupPageOverrides(value: unknown): value is StartupPageOverrides {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StartupPageOverrides>;
  return (
    candidate.version === OVERRIDES_SCHEMA_VERSION
    && isSourceFingerprint(candidate.basePagesSource)
    && isSourceFingerprint(candidate.currentPagesSource)
    && Array.isArray(candidate.upserts)
    && candidate.upserts.every(isStartupPageRecordSnapshot)
    && Array.isArray(candidate.deletedIds)
    && candidate.deletedIds.every((id) => typeof id === "string")
  );
}

function isSourceFingerprint(value: unknown): value is SourceFingerprint {
  if (!value || typeof value !== "object") return false;
  const source = value as Partial<SourceFingerprint>;
  return (
    typeof source.id === "string"
    && typeof source.path === "string"
    && typeof source.dev === "number"
    && typeof source.ino === "number"
    && typeof source.size === "number"
    && typeof source.mtimeMs === "number"
    && typeof source.ctimeMs === "number"
  );
}

function isStartupPageRecordSnapshot(value: unknown): value is StartupPageRecordSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<StartupPageRecordSnapshot>;
  return (
    Boolean(snapshot.meta)
    && typeof snapshot.meta?.id === "string"
    && typeof snapshot.meta?.title === "string"
  );
}

function applyPageOverrides(
  snapshots: StartupPageSnapshot[],
  overrides?: StartupPageOverrides
): StartupPageSnapshot[] {
  if (!overrides) return snapshots;
  const deletedIds = new Set(overrides.deletedIds);
  const upserts = new Map(overrides.upserts.map((snapshot) => [snapshot.meta.id, snapshot]));
  const merged = snapshots.flatMap((snapshot) => {
    if (deletedIds.has(snapshot.meta.id)) return [];
    const replacement = upserts.get(snapshot.meta.id);
    upserts.delete(snapshot.meta.id);
    return [replacement ?? snapshot];
  });
  for (const snapshot of upserts.values()) {
    if (isTopLevelPageSnapshot(snapshot) && !deletedIds.has(snapshot.meta.id)) merged.push(snapshot);
  }
  return merged;
}

async function userDatabaseSchemaPaths(
  paths: WorkspacePaths,
  databaseIds: string[]
): Promise<Map<string, string>> {
  let entries: Awaited<ReturnType<typeof fileService.readDir>>;
  try {
    entries = await fileService.readDir(paths.userDatabasesDir(), { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) return new Map();
    throw error;
  }
  const folderByStableId = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const stableId = entry.name.includes("--") ? entry.name.slice(entry.name.lastIndexOf("--") + 2) : entry.name;
    folderByStableId.set(stableId, entry.name);
  }
  return new Map(databaseIds.flatMap((id) => {
    const folder = folderByStableId.get(databaseStableFolderId(id));
    return folder ? [[id, join(paths.userDatabasesDir(), folder, "schema.json")]] : [];
  }));
}

function insertPayloads(db: Database, table: "pages" | "databases", values: unknown[]): void {
  const statement = db.prepare(`INSERT INTO ${table} (position, payload) VALUES (?, ?)`);
  values.forEach((value, position) => statement.run([position, JSON.stringify(value)]));
  statement.free();
}

function readJsonPayloads<T>(db: Database, table: "pages" | "databases"): T[] {
  const results = db.exec(`SELECT payload FROM ${table} ORDER BY position`);
  return (results[0]?.values ?? []).map((row) => JSON.parse(String(row[0])) as T);
}

async function writeRowStore(
  cacheDirectory: string,
  snapshots: StartupPageRecordSnapshot[]
): Promise<RowStoreDescriptor> {
  const generation = randomUUID();
  const dataFile = `${ROW_STORE_DATA_PREFIX}${generation}.ndjson`;
  const indexFile = `${ROW_STORE_DATA_PREFIX}${generation}.index.json`;
  const chunks: Buffer[] = [];
  const records = Object.create(null) as Record<string, [number, number, string]>;
  const files = new Map<string, Set<string>>();
  let offset = 0;
  for (const snapshot of snapshots) {
    const chunk = Buffer.from(`${JSON.stringify(snapshot)}\n`, "utf8");
    records[snapshot.meta.id] = [offset, chunk.byteLength, sha256(chunk)];
    chunks.push(chunk);
    offset += chunk.byteLength;
    if (snapshot.databaseId) {
      const fileName = rowPageFileName(snapshot);
      if (fileName) {
        const names = files.get(snapshot.databaseId) ?? new Set<string>();
        names.add(fileName);
        files.set(snapshot.databaseId, names);
      }
    }
  }
  const data = Buffer.concat(chunks, offset);
  const filesByDatabase = Object.create(null) as Record<string, string[]>;
  for (const [databaseId, names] of files) filesByDatabase[databaseId] = [...names].sort();
  const rowIndex: RowStoreIndex = {
    version: ROW_STORE_SCHEMA_VERSION,
    dataFile,
    dataBytes: data.byteLength,
    records,
    filesByDatabase
  };
  const indexBuffer = Buffer.from(`${JSON.stringify(rowIndex)}\n`, "utf8");
  const dataPath = join(cacheDirectory, dataFile);
  const indexPath = join(cacheDirectory, indexFile);
  await fileService.writeBufferAtomic(dataPath, data);
  try {
    await fileService.writeBufferAtomic(indexPath, indexBuffer);
  } catch (error) {
    await fileService.remove(dataPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return {
    version: ROW_STORE_SCHEMA_VERSION,
    dataFile,
    indexFile,
    dataBytes: data.byteLength,
    indexBytes: indexBuffer.byteLength,
    recordCount: snapshots.length
  };
}

async function readRowStoreDescriptor(
  cacheDirectory: string,
  raw: string | undefined
): Promise<RowStoreDescriptor | undefined> {
  if (!raw) return undefined;
  let descriptor: unknown;
  try {
    descriptor = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRowStoreDescriptor(descriptor)) return undefined;
  try {
    const [dataInfo, indexInfo] = await Promise.all([
      fileService.stat(join(cacheDirectory, descriptor.dataFile)),
      fileService.stat(join(cacheDirectory, descriptor.indexFile))
    ]);
    if (dataInfo.size !== descriptor.dataBytes || indexInfo.size !== descriptor.indexBytes) {
      return undefined;
    }
    return descriptor;
  } catch {
    return undefined;
  }
}

async function readRowStoreIndex(active: ActiveRowStore): Promise<RowStoreIndex> {
  const parsed = JSON.parse(
    await fileService.readText(join(active.cacheDirectory, active.descriptor.indexFile))
  ) as unknown;
  if (!isRowStoreIndex(parsed, active.descriptor)) {
    throw new Error("Row-page startup cache index is corrupt.");
  }
  return parsed;
}

function isRowStoreDescriptor(value: unknown): value is RowStoreDescriptor {
  if (!value || typeof value !== "object") return false;
  const descriptor = value as Partial<RowStoreDescriptor>;
  return (
    descriptor.version === ROW_STORE_SCHEMA_VERSION
    && isSafeRowStoreFile(descriptor.dataFile, ".ndjson")
    && isSafeRowStoreFile(descriptor.indexFile, ".index.json")
    && isNonNegativeInteger(descriptor.dataBytes)
    && isNonNegativeInteger(descriptor.indexBytes)
    && isNonNegativeInteger(descriptor.recordCount)
  );
}

function isRowStoreIndex(value: unknown, descriptor: RowStoreDescriptor): value is RowStoreIndex {
  if (!value || typeof value !== "object") return false;
  const index = value as Partial<RowStoreIndex>;
  if (
    index.version !== ROW_STORE_SCHEMA_VERSION
    || index.dataFile !== descriptor.dataFile
    || index.dataBytes !== descriptor.dataBytes
    || !index.records
    || typeof index.records !== "object"
    || Array.isArray(index.records)
    || !index.filesByDatabase
    || typeof index.filesByDatabase !== "object"
    || Array.isArray(index.filesByDatabase)
  ) {
    return false;
  }
  const recordEntries = Object.entries(index.records);
  if (recordEntries.length !== descriptor.recordCount) return false;
  if (recordEntries.some(([, location]) => (
    !Array.isArray(location)
    || location.length !== 3
    || !isNonNegativeInteger(location[0])
    || !isNonNegativeInteger(location[1])
    || typeof location[2] !== "string"
    || !/^[a-f0-9]{64}$/.test(location[2])
    || location[0] + location[1] > descriptor.dataBytes
  ))) {
    return false;
  }
  return Object.values(index.filesByDatabase).every((names) => (
    Array.isArray(names) && names.every((name) => typeof name === "string")
  ));
}

function isSafeRowStoreFile(value: unknown, suffix: string): value is string {
  return (
    typeof value === "string"
    && basename(value) === value
    && value.startsWith(ROW_STORE_DATA_PREFIX)
    && value.endsWith(suffix)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function cleanupUnusedRowStores(
  cacheDirectory: string,
  current: RowStoreDescriptor
): Promise<void> {
  const keep = new Set([current.dataFile, current.indexFile]);
  let entries: string[];
  try {
    entries = await fileService.readDir(cacheDirectory);
  } catch {
    return;
  }
  await Promise.all(entries.flatMap((entry) => (
    entry.startsWith(ROW_STORE_DATA_PREFIX) && !keep.has(entry)
      ? [fileService.remove(join(cacheDirectory, entry), { force: true }).catch(() => undefined)]
      : []
  )));
}

async function removeLegacyWorkspaceStartupCache(workspaceRoot: string): Promise<void> {
  await Promise.all(LEGACY_WORKSPACE_CACHE_FILES.map((relativePath) =>
    fileService.remove(join(workspaceRoot, relativePath), { force: true }).catch(() => undefined)
  ));
}

function rowPageFileName(snapshot: StartupPageRecordSnapshot): string | undefined {
  const fileName = snapshot.pageFile ?? (snapshot.bodyPath ? basename(snapshot.bodyPath) : undefined);
  return fileName?.endsWith(".md") ? fileName : undefined;
}

function readMetadata(db: Database, key: string): string | undefined {
  const statement = db.prepare("SELECT value FROM metadata WHERE key = ?");
  try {
    statement.bind([key]);
    return statement.step() ? String(statement.get()[0]) : undefined;
  } finally {
    statement.free();
  }
}

function readSourceFingerprints(db: Database): SourceFingerprint[] {
  const results = db.exec(`
    SELECT id, path, dev, ino, size, mtime_ms, ctime_ms FROM sources ORDER BY id
  `);
  return (results[0]?.values ?? []).map((row) => ({
    id: String(row[0]),
    path: String(row[1]),
    dev: Number(row[2]),
    ino: Number(row[3]),
    size: Number(row[4]),
    mtimeMs: Number(row[5]),
    ctimeMs: Number(row[6])
  }));
}

function manifestProjection(manifest: SpaceManifest): string {
  return JSON.stringify({
    spaceId: manifest.spaceId,
    pages: manifest.pages,
    databases: manifest.databases
  });
}

function manifestProjectionMatchesOverrides(
  cachedProjection: string,
  currentProjection: string,
  overrides: StartupPageOverrides
): boolean {
  let cached: { spaceId: string; pages: string[]; databases: string[] };
  let current: { spaceId: string; pages: string[]; databases: string[] };
  try {
    cached = JSON.parse(cachedProjection);
    current = JSON.parse(currentProjection);
  } catch {
    return false;
  }
  if (
    cached.spaceId !== current.spaceId
    || !Array.isArray(cached.pages)
    || !Array.isArray(cached.databases)
    || !Array.isArray(current.pages)
    || !Array.isArray(current.databases)
    || cached.databases.length !== current.databases.length
    || cached.databases.some((id, index) => id !== current.databases[index])
  ) {
    return false;
  }
  const deletedIds = new Set(overrides.deletedIds);
  const expectedPages = cached.pages.filter((id) => !deletedIds.has(id));
  const expectedIds = new Set(expectedPages);
  for (const snapshot of overrides.upserts) {
    if (
      !isTopLevelPageSnapshot(snapshot)
      || deletedIds.has(snapshot.meta.id)
      || expectedIds.has(snapshot.meta.id)
    ) {
      continue;
    }
    expectedIds.add(snapshot.meta.id);
    expectedPages.push(snapshot.meta.id);
  }
  return (
    expectedPages.length === current.pages.length
    && expectedPages.every((id, index) => id === current.pages[index])
  );
}

function isTopLevelPageSnapshot(snapshot: StartupPageRecordSnapshot): boolean {
  return !snapshot.databaseId || snapshot.databaseId === PAGES_DATABASE_ID;
}

function sourceFingerprintsEqual(left: SourceFingerprint[], right: SourceFingerprint[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((source, index) => sourceFingerprintEqual(source, right[index]));
}

function sourceFingerprintEqual(
  source: SourceFingerprint,
  next: SourceFingerprint | undefined
): boolean {
  return Boolean(
    next
    && source.id === next.id
    && source.path === next.path
    && source.dev === next.dev
    && source.ino === next.ino
    && source.size === next.size
    && source.mtimeMs === next.mtimeMs
    && source.ctimeMs === next.ctimeMs
  );
}

function diagnostics(
  cachePath: string,
  status: StartupCacheDiagnostics["status"],
  reason: string,
  timing: Pick<CacheReadResult, "bytes" | "validationMs" | "readMs">
): StartupCacheDiagnostics {
  return {
    status,
    reason,
    path: cachePath,
    bytes: timing.bytes,
    validationMs: timing.validationMs,
    readMs: timing.readMs,
    buildMs: 0,
    writeMs: 0
  };
}

function startupCachePaths(localCacheRoot: string, workspaceRoot: string): StartupCachePaths {
  const key = createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 24);
  const directory = join(localCacheRoot, key);
  return {
    directory,
    index: join(directory, CACHE_FILE_NAME),
    overrides: join(directory, OVERRIDES_FILE_NAME),
    diagnosticPath: `workspace-cache/${key}/${CACHE_FILE_NAME}`
  };
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function elapsedMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

function isNotFoundError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
