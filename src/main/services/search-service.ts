import { spawn } from "node:child_process";
import { join } from "node:path";
import { rgPath } from "@vscode/ripgrep";
import { ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../../shared/constants.js";
import { displayPathValue } from "../../shared/path-values.js";
import { databaseFolderName, idFromDatabaseFolderName, idFromMarkdownFileName } from "../../shared/workspace-paths.js";
import { readCsvFile } from "../storage/csv-file.js";
import { fileService } from "./file-service.js";
import type { WorkspaceService } from "./workspace-service.js";

/** Byte offsets within a hit's `text` for highlighting. */
export interface HitRange {
  start: number;
  end: number;
}

export type SearchMatchType = "title" | "content" | "reference" | "database";

interface RawHit {
  /** Workspace-relative path, kept for debugging and `Open in OS` fallback. */
  path: string;
  /** 1-based line number of the match in the source file. */
  line: number;
  /** Match preview text (possibly trimmed around the first match). */
  text: string;
  /** Byte offsets within `text` for each match. */
  ranges: HitRange[];
  /** Workspace-relative image path, `emoji:<glyph>`, or undefined for the default icon. */
  icon?: string;
}

interface BaseHit extends RawHit {
  /** Best single match route used for sorting and display. */
  matchType: SearchMatchType;
  /** All routes that matched this logical entity before final dedupe. */
  matchTypes?: SearchMatchType[];
  /** ISO-ish created timestamp when available from the page/entity/row metadata. */
  createdTime?: string;
  /** ISO-ish updated timestamp when available from the page/entity/row metadata. */
  updatedTime?: string;
  /** User-visible Notion-style breadcrumb path. */
  entityPath?: string;
}

/**
 * Enriched hits map raw ripgrep matches to Lotion's logical model
 * (pages / databases / rows / row-pages) so the renderer can show
 * meaningful labels instead of disk paths.
 */
export type EnrichedHit =
  | (BaseHit & {
      kind: "page";
      pageId: string;
      title: string;
      databaseId?: string;
      databaseName?: string;
      rowId?: string;
      pageFile?: string | null;
    })
  | (BaseHit & {
      kind: "database";
      databaseId: string;
      databaseName: string;
    })
  | (BaseHit & {
      kind: "row";
      databaseId: string;
      databaseName: string;
      rowId: string;
      rowTitle: string;
      pageFile: string | null;
    })
  | (BaseHit & {
      kind: "rowPage";
      databaseId: string;
      databaseName: string;
      rowTitle: string | null;
      pageFile: string;
    });

type SearchableHit = EnrichedHit & {
  __search?: {
    text: string;
    fieldScore: number;
    entityKey?: string;
    matchType: SearchMatchType;
    matchTypes: SearchMatchType[];
  };
};

export interface SearchResult {
  hits: EnrichedHit[];
  truncated: boolean;
}

export type SearchSortMode =
  | "relevance"
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc";

export interface SearchQueryOptions {
  sort?: SearchSortMode;
}

const MAX_HITS = 500;
const LOOSE_RESULT_TARGET = 180;
const MAX_LOOSE_SEEDS = 8;
const QUERY_TIMEOUT_MS = 10_000;
const RIPGREP_STARTUP_TIMEOUT_MS = 2_000;
const RIPGREP_STALL_TIMEOUT_MS = 2_000;
const RIPGREP_STARTUP_ATTEMPTS = 2;
const PREVIEW_PAD_LEFT = 20;
const PREVIEW_PAD_RIGHT = 80;
// Link/relation expansion is useful for discovery, but it should never outrank
// a direct title/name/path hit for the user's typed query.
const RELATED_ENTITY_FIELD_SCORE = 2_400;
const LINKED_ENTITY_FIELD_SCORE = 2_600;
const SEARCH_IGNORED_FIELD_IDS = new Set([
  "id",
  "body_path",
  "page_file",
  "notion_original_html",
  "notion_original_csv"
]);

interface DbIndex {
  id: string;
  name: string;
  icon?: string;
  fieldIds: string[];
  fieldNames: string[];
  titleCol: number;
  pageFileCol: number;
}

interface CacheBundle {
  root: string;
  /** Keyed by folder name (e.g. `db_2cc7741b`). */
  databases: Map<string, DbIndex>;
  /** Keyed by stable database id. */
  databasesById: Map<string, DbIndex>;
  /** pageId → title from the system pages DB. */
  pages: Map<string, string>;
  /** folder name → (page_file name → row title), so row-page hits can be labelled. */
  rowTitlesByDb: Map<string, Map<string, string>>;
  /** System entities DB projected into lookup maps for logical search identity. */
  entities: EntityIndex;
  /** Source entity id -> referenced entity ids parsed from entity_ref/relation cells. */
  relationIdsByEntityId: Map<string, string[]>;
}

interface EntityIndexEntry {
  id: string;
  kind: "page" | "database" | "row";
  title: string;
  icon: string;
  createdTime: string;
  updatedTime: string;
  databaseId: string;
  rowId: string;
  bodyPath: string;
  path: string;
}

interface EntityIndex {
  byId: Map<string, EntityIndexEntry>;
  byBodyPath: Map<string, EntityIndexEntry>;
  byRowKey: Map<string, EntityIndexEntry>;
  byDatabaseId: Map<string, EntityIndexEntry>;
}

/**
 * Wraps the bundled ripgrep binary and re-projects raw line matches
 * into Lotion's logical model. Schemas and page titles are cached
 * lazily per workspace root.
 */
export class SearchService {
  private cache?: CacheBundle;

  constructor(private readonly workspace: WorkspaceService) {}

  async query(pattern: string, options: SearchQueryOptions = {}): Promise<SearchResult> {
    const trimmed = pattern.trim();
    if (!trimmed) return { hits: [], truncated: false };
    const sort = normalizeSearchSort(options.sort);

    const root = this.workspace.requirePaths().root;
    const cache = await this.getCache(root);

    const rawHits = await this.runRipgrep(trimmed, root);
    let rawHitList = rawHits.hits;
    let truncated = rawHits.truncated;
    let enriched = this.enrichHits(rawHitList, cache, trimmed);
    enriched = mergeSearchHits(enriched, this.metadataHits(trimmed, cache));

    if (enriched.length < LOOSE_RESULT_TARGET) {
      const loose = await this.queryLooseSeeds(
        trimmed,
        root,
        cache,
        rawHitList,
        truncated,
        LOOSE_RESULT_TARGET
      );
      rawHitList = loose.rawHitList;
      truncated = loose.truncated;
      enriched = mergeSearchHits(enriched, loose.enriched);
    }

    enriched = mergeSearchHits(enriched, await this.linkedPageHits(trimmed, root, cache, rawHitList, enriched));

    return {
      hits: rankAndDedupeHits(enriched, trimmed, sort).map(stripSearchMeta),
      truncated
    };
  }

  private async queryLooseSeeds(
    pattern: string,
    root: string,
    cache: CacheBundle,
    rawHitList: RawHit[],
    truncated: boolean,
    targetCount = LOOSE_RESULT_TARGET
  ): Promise<{ rawHitList: RawHit[]; truncated: boolean; enriched: EnrichedHit[] }> {
    let enriched = this.enrichHits(rawHitList, cache, pattern);
    const seeds = looseSearchSeeds(pattern)
      .filter((seed) => !sameSearchNeedle(seed, pattern))
      .slice(0, MAX_LOOSE_SEEDS);
    for (const seed of seeds) {
      const looseHits = await this.runRipgrep(seed, root);
      rawHitList = mergeRawHits(rawHitList, looseHits.hits);
      truncated = truncated || looseHits.truncated;
      enriched = this.enrichHits(rawHitList, cache, pattern);
      if (enriched.length >= targetCount) break;
    }
    return { rawHitList, truncated, enriched };
  }

  private async runRipgrep(
    pattern: string,
    root: string
  ): Promise<{ hits: RawHit[]; truncated: boolean }> {
    let last: Awaited<ReturnType<SearchService["runRipgrepOnce"]>> | undefined;
    for (let attempt = 0; attempt < RIPGREP_STARTUP_ATTEMPTS; attempt += 1) {
      last = await this.runRipgrepOnce(pattern, root, RIPGREP_STARTUP_TIMEOUT_MS);
      if (!last.nativeFailed) return last;
    }
    return this.runNodeSearch(pattern, root);
  }

  private async runRipgrepOnce(
    pattern: string,
    root: string,
    startupTimeoutMs?: number
  ): Promise<{ hits: RawHit[]; truncated: boolean; nativeFailed: boolean }> {
    // We use explicit `-g` globs instead of `--type-add`+`--type`
    // because rg's comma-separated extension list in `--type-add`
    // didn't fan out reliably here — only the first extension was
    // honoured, so CSVs were excluded.
    const args = [
      "--json",
      "--smart-case",
      "--fixed-strings",
      "--no-config",
      "--max-count=20",
      "--max-columns=300",
      "-g",
      "databases/**/pages/*.md",
      "-g",
      "databases/**/data.csv",
      "-g",
      "databases/**/schema.json",
      "-g",
      `!databases/system/${databaseFolderName(ENTITIES_DATABASE_ID, "entities")}/**`,
      "-g",
      `!databases/user/${databaseFolderName("db_import_review", "Import review")}/**`,
      "-g",
      "!.git/**",
      "--regexp",
      pattern,
      "."
    ];

    return new Promise((resolve) => {
      const child = spawn(rgPath, args, { cwd: root });
      const hits: RawHit[] = [];
      let buffer = "";
      let truncated = false;
      let settled = false;
      let nativeFailed = false;
      let killFallback: ReturnType<typeof setTimeout> | undefined;
      let stallTimer: ReturnType<typeof setTimeout> | undefined;

      const settle = (result: { hits: RawHit[]; truncated: boolean; nativeFailed: boolean }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (startupTimer) clearTimeout(startupTimer);
        if (killFallback) clearTimeout(killFallback);
        if (stallTimer) clearTimeout(stallTimer);
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        resolve(result);
      };

      const abortNative = () => {
        if (settled || nativeFailed) return;
        nativeFailed = true;
        clearTimeout(timer);
        if (startupTimer) clearTimeout(startupTimer);
        if (stallTimer) clearTimeout(stallTimer);
        try {
          child.kill();
        } catch {
          settle({ hits, truncated: false, nativeFailed: true });
          return;
        }
        killFallback = setTimeout(
          () => settle({ hits, truncated: false, nativeFailed: true }),
          500
        );
      };

      const armStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(abortNative, RIPGREP_STALL_TIMEOUT_MS);
      };

      const processLine = (line: string) => {
        if (!line) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          return;
        }
        const event = parsed as { type?: string; data?: RgMatchData };
        if (event.type !== "match" || !event.data) return;
        const hit = matchToHit(event.data, root);
        if (!hit) return;
        hits.push(hit);
        if (hits.length >= MAX_HITS) {
          truncated = true;
          clearTimeout(timer);
          settle({ hits, truncated, nativeFailed: false });
        }
      };

      const finish = () => {
        if (buffer.trim()) {
          processLine(buffer.trim());
          buffer = "";
        }
        clearTimeout(timer);
        settle({ hits, truncated, nativeFailed });
      };

      const timer = setTimeout(abortNative, QUERY_TIMEOUT_MS);
      const startupTimer = startupTimeoutMs
        ? setTimeout(abortNative, startupTimeoutMs)
        : undefined;

      child.stdout.on("data", (chunk: Buffer) => {
        if (startupTimer) clearTimeout(startupTimer);
        armStallTimer();
        buffer += chunk.toString("utf8");
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          processLine(line);
          if (settled) return;
        }
      });

      child.on("error", () => {
        nativeFailed = true;
        settle({ hits, truncated, nativeFailed });
      });
      child.on("close", finish);
    });
  }

  private async runNodeSearch(
    pattern: string,
    root: string
  ): Promise<{ hits: RawHit[]; truncated: boolean }> {
    const databasesRoot = join(root, "databases");
    if (!fileService.exists(databasesRoot)) return { hits: [], truncated: false };

    const ignoredPrefixes = [
      `databases/system/${databaseFolderName(ENTITIES_DATABASE_ID, "entities")}`,
      `databases/user/${databaseFolderName("db_import_review", "Import review")}`
    ];
    const queue = [databasesRoot];
    const hits: RawHit[] = [];
    const caseSensitive = pattern.toLowerCase() !== pattern;
    const needle = caseSensitive ? pattern : pattern.toLowerCase();

    while (queue.length > 0) {
      const directory = queue.shift()!;
      let entries;
      try {
        entries = await fileService.readDir(directory, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const absolutePath = join(directory, entry.name);
        const relativePath = absolutePath
          .slice(root.length)
          .replace(/^[\\/]/, "")
          .split("\\")
          .join("/");
        if (ignoredPrefixes.some((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`))) {
          continue;
        }
        if (entry.isDirectory()) {
          queue.push(absolutePath);
          continue;
        }
        if (!isSearchSourcePath(relativePath)) continue;

        let content: string;
        try {
          content = await fileService.readText(absolutePath);
        } catch {
          continue;
        }
        let matchingLines = 0;
        const lines = content.split("\n");
        for (let index = 0; index < lines.length && matchingLines < 20; index += 1) {
          const text = lines[index].replace(/\r$/, "");
          const haystack = caseSensitive ? text : text.toLowerCase();
          const ranges: HitRange[] = [];
          let offset = 0;
          while (offset <= haystack.length - needle.length) {
            const found = haystack.indexOf(needle, offset);
            if (found < 0) break;
            ranges.push({
              start: byteLength(text.slice(0, found)),
              end: byteLength(text.slice(0, found + pattern.length))
            });
            offset = found + Math.max(pattern.length, 1);
          }
          if (ranges.length === 0) continue;
          matchingLines += 1;
          hits.push({ path: relativePath, line: index + 1, text, ranges });
          if (hits.length >= MAX_HITS) return { hits, truncated: true };
        }
      }
    }

    return { hits, truncated: false };
  }

  private enrichHits(rawHits: RawHit[], cache: CacheBundle, pattern: string): SearchableHit[] {
    const enriched: SearchableHit[] = [];
    for (const raw of rawHits) {
      const hit = this.enrich(raw, cache, pattern);
      if (!hit) continue;
      if (!matchesQuery(hit, pattern)) continue;
      enriched.push(hit);
    }
    return enriched;
  }

  private metadataHits(pattern: string, cache: CacheBundle): SearchableHit[] {
    const hits: SearchableHit[] = [];
    for (const entity of cache.entities.byId.values()) {
      const searchText = entitySearchText(entity);
      if (!cellMatchesSearch(searchText, pattern)) continue;
      const preview = metadataPreview(entity, pattern);
      if (entity.kind === "database") {
        const databaseId = entity.databaseId || entity.id;
        const db = cache.databasesById.get(databaseId);
        hits.push(withSearchMeta({
          kind: "database",
          databaseId,
          databaseName: entity.title || db?.name || databaseId,
          icon: entity.icon || db?.icon,
          createdTime: entity.createdTime || undefined,
          updatedTime: entity.updatedTime || undefined,
          entityPath: entity.path || undefined,
          path: entity.bodyPath || entity.path || `databases/${databaseId}`,
          line: 1,
          text: preview.text,
          ranges: preview.ranges
        }, searchText, metadataFieldScore(entity, pattern), entity.id, "database"));
        continue;
      }
      if (entity.kind === "row") {
        const db = cache.databasesById.get(entity.databaseId);
        const bodyPath = entity.bodyPath || "";
        hits.push(withSearchMeta({
          kind: "row",
          databaseId: entity.databaseId,
          databaseName: db?.name ?? entity.databaseId,
          rowId: entity.rowId || entity.id,
          rowTitle: entity.title || "Untitled",
          icon: entity.icon,
          createdTime: entity.createdTime || undefined,
          updatedTime: entity.updatedTime || undefined,
          entityPath: entity.path || undefined,
          pageFile: fileNameFromWorkspacePath(bodyPath),
          path: bodyPath || entity.path || `databases/${entity.databaseId}/data.csv`,
          line: 1,
          text: preview.text,
          ranges: preview.ranges
        }, searchText, metadataFieldScore(entity, pattern), entity.id, "title"));
        continue;
      }
      hits.push(withSearchMeta({
        kind: "page",
        pageId: entity.id,
        title: entity.title || cache.pages.get(entity.id) || "Untitled",
        icon: entity.icon,
        createdTime: entity.createdTime || undefined,
        updatedTime: entity.updatedTime || undefined,
        entityPath: entity.path || undefined,
        path: entity.bodyPath || entity.path,
        line: 1,
        text: preview.text,
        ranges: preview.ranges
      }, searchText, metadataFieldScore(entity, pattern), entity.id, "title"));
    }
    return hits;
  }

  private async linkedPageHits(
    pattern: string,
    root: string,
    cache: CacheBundle,
    rawHits: RawHit[],
    seedHits: SearchableHit[]
  ): Promise<SearchableHit[]> {
    const sourceCandidates = new Map<string, { path: string; title: string }>();
    for (const hit of rawHits) {
      const path = normalizeWorkspacePath(hit.path);
      if (!path.endsWith(".md")) continue;
      const entity = cache.entities.byBodyPath.get(path);
      sourceCandidates.set(path, { path, title: entity?.title || path });
    }
    for (const hit of seedHits) {
      const path = normalizeWorkspacePath(hit.path);
      if (!path.endsWith(".md")) continue;
      sourceCandidates.set(path, { path, title: primaryHitTitle(hit) });
    }
    const sourcePaths = [...sourceCandidates.values()]
      .sort((a, b) => linkSourceScore(b, pattern) - linkSourceScore(a, pattern))
      .map((source) => source.path);

    const hits: SearchableHit[] = [];
    const seenTargets = new Set<string>();
    let relationHitCount = 0;
    relationScan:
    for (const seed of [...seedHits].sort((a, b) => linkSourceScore({ path: b.path, title: primaryHitTitle(b) }, pattern) - linkSourceScore({ path: a.path, title: primaryHitTitle(a) }, pattern))) {
      const sourceEntityId = seed.__search?.entityKey;
      if (!sourceEntityId) continue;
      const sourceTitle = primaryHitTitle(seed);
      const relationIds = cache.relationIdsByEntityId.get(sourceEntityId) ?? [];
      for (const relationId of relationIds) {
        if (relationId === sourceEntityId || seenTargets.has(relationId)) continue;
        seenTargets.add(relationId);
        const entity = cache.entities.byId.get(relationId);
        if (!entity) continue;
        const previewText = `Related to: ${snippetAround(sourceTitle, pattern)}`;
        hits.push(entityToSearchHit(
          entity,
          cache,
          { text: previewText, ranges: byteRangesForPattern(previewText, pattern) },
          `${entitySearchText(entity)} related to ${sourceTitle} ${seed.path}`,
          RELATED_ENTITY_FIELD_SCORE,
          "reference"
        ));
        relationHitCount += 1;
        if (relationHitCount >= 120) break relationScan;
      }
    }

    for (const sourcePath of sourcePaths.slice(0, 300)) {
      const sourceEntity = cache.entities.byBodyPath.get(sourcePath);
      const sourceTitle = sourceEntity?.title || sourcePath.replace(/\.md$/i, "");
      let markdown = "";
      try {
        markdown = await fileService.readText(join(root, sourcePath));
      } catch {
        continue;
      }

      for (const targetPath of internalMarkdownLinks(markdown)) {
        if (targetPath === sourcePath || seenTargets.has(targetPath)) continue;
        seenTargets.add(targetPath);
        const entity = cache.entities.byBodyPath.get(targetPath);
        if (!entity) continue;
        const previewText = `Linked from: ${snippetAround(sourceTitle, pattern)}`;
        hits.push(entityToSearchHit(
          entity,
          cache,
          { text: previewText, ranges: byteRangesForPattern(previewText, pattern) },
          `${entitySearchText(entity)} linked from ${sourceTitle} ${sourcePath}`,
          LINKED_ENTITY_FIELD_SCORE,
          "reference"
        ));
        if (hits.length >= 200) return hits;
      }
    }
    return hits;
  }

  private async getCache(root: string): Promise<CacheBundle> {
    if (this.cache && this.cache.root === root) return this.cache;

    const databases = new Map<string, DbIndex>();
    const databasesById = new Map<string, DbIndex>();
    const rowTitlesByDb = new Map<string, Map<string, string>>();
    const relationIdsByEntityId = new Map<string, string[]>();

    const dbsDir = join(root, "databases");
    try {
      const groups = await fileService.readDir(dbsDir, { withFileTypes: true });
      for (const group of groups) {
        if (!group.isDirectory() || (group.name !== "user" && group.name !== "system")) continue;
        const groupDir = join(dbsDir, group.name);
        const entries = await fileService.readDir(groupDir, { withFileTypes: true });
        for (const ent of entries) {
          if (!ent.isDirectory()) continue;
          const dirName = ent.name;
          try {
            const schemaRaw = await fileService.readText(join(groupDir, dirName, "schema.json"));
            const schema = JSON.parse(schemaRaw) as {
              id: string;
              name?: string;
              fields: Array<{ id: string; name?: string }>;
            };
            const titleCol = schema.fields.findIndex((f) => f.id === "title");
            if (titleCol < 0) continue;
            const pageFileCol = schema.fields.findIndex((f) => f.id === "page_file");
            const fieldNameById = new Map(schema.fields.map((field) => [field.id, field.name ?? field.id]));
            const db: DbIndex = {
              id: schema.id,
              name: schema.name ?? schema.id,
              icon: String((schema as { icon?: unknown }).icon ?? "").trim() || undefined,
              fieldIds: schema.fields.map((field) => field.id),
              fieldNames: schema.fields.map((field) => field.name ?? field.id),
              titleCol,
              pageFileCol
            };
            databases.set(dirName, db);
            databasesById.set(db.id, db);
            // Build a fileName → row title lookup for row-page hits.
            try {
              const csvRaw = await fileService.readText(join(groupDir, dirName, "data.csv"));
              const rows = new Map<string, string>();
              const lines = csvRaw.split("\n");
              const headers = parseCsvRow(lines[0] ?? "").filter(Boolean);
              if (headers.length > 0) {
                db.fieldIds = headers;
                db.fieldNames = headers.map((id) => fieldNameById.get(id) ?? id);
              }
              for (let i = 1; i < lines.length; i += 1) {
                if (!lines[i]) continue;
                const cells = parseCsvRow(lines[i]);
                const fileName = pageFileCol >= 0 ? cells[pageFileCol] ?? "" : "";
                const title = cells[titleCol] ?? "";
                if (fileName) rows.set(fileName, title);
                const entityId = cells[0] ?? "";
                const relationIds = extractEntityRefIds(cells);
                if (entityId && relationIds.length > 0) relationIdsByEntityId.set(entityId, relationIds);
              }
              rowTitlesByDb.set(dirName, rows);
            } catch {
              /* missing data.csv — fine, no row labels */
            }
          } catch {
            /* skip malformed schema */
          }
        }
      }
    } catch {
      /* no databases dir */
    }

    const pages = await readPageTitleIndex(root);
    const entities = await readEntityIndex(root);
    this.cache = { root, databases, databasesById, pages, rowTitlesByDb, entities, relationIdsByEntityId };
    return this.cache;
  }

  private enrich(hit: RawHit, cache: CacheBundle, pattern: string): SearchableHit | null {
    const path = hit.path;

    const top = new RegExp(`^databases/system/${escapeRegExp(databaseFolderName(PAGES_DATABASE_ID, "pages"))}/pages/([^/]+)\\.md$`).exec(path);
    if (top) {
      const pageId = idFromMarkdownFileName(`${top[1]}.md`);
      const entity = cache.entities.byBodyPath.get(normalizeWorkspacePath(path)) ?? cache.entities.byId.get(pageId);
      const preview = trimContext(hit.text, hit.ranges);
      return withSearchMeta({
        kind: "page",
        pageId: entity?.id ?? pageId,
        title: entity?.title || cache.pages.get(pageId) || pageId,
        icon: entity?.icon,
        createdTime: entity?.createdTime || undefined,
        updatedTime: entity?.updatedTime || undefined,
        entityPath: entity?.path || undefined,
        path,
        line: hit.line,
        text: preview.text,
        ranges: preview.ranges
      }, `${entitySearchText(entity)} ${cache.pages.get(pageId) ?? pageId} ${preview.text} ${path}`, 0, entity?.id);
    }

    const rowPage = /^databases\/(user|system)\/([^/]+)\/pages\/(.+\.md)$/.exec(path);
    if (rowPage) {
      const dirName = rowPage[2];
      const fileName = rowPage[3];
      const db = cache.databases.get(dirName);
      const fallbackDatabaseId = db?.id ?? idFromDatabaseFolderName(dirName, rowPage[1] === "system");
      const entity = cache.entities.byBodyPath.get(normalizeWorkspacePath(path));
      const entityDatabaseId = entity?.databaseId || fallbackDatabaseId;
      const entityDb = cache.databasesById.get(entityDatabaseId) ?? db;
      const rowTitle = cache.rowTitlesByDb.get(dirName)?.get(fileName) ?? null;
      const preview = trimContext(hit.text, hit.ranges);
      if (entity?.kind === "row") {
        return withSearchMeta({
          kind: "row",
          databaseId: entityDatabaseId,
          databaseName: entityDb?.name ?? db?.name ?? dirName,
          rowId: entity.rowId || entity.id,
          rowTitle: entity.title || rowTitle || fileName.replace(/\.md$/i, "") || "Untitled",
          icon: entity.icon,
          createdTime: entity.createdTime || undefined,
          updatedTime: entity.updatedTime || undefined,
          entityPath: entity.path || undefined,
          pageFile: fileName,
          path,
          line: hit.line,
          text: preview.text,
          ranges: preview.ranges
        }, `${entitySearchText(entity)} ${entityDb?.name ?? db?.name ?? dirName} ${rowTitle ?? ""} ${preview.text} ${path}`, 0, entity.id);
      }
      return withSearchMeta({
        kind: "rowPage",
        databaseId: fallbackDatabaseId,
        databaseName: db?.name ?? dirName,
        rowTitle,
        icon: entity?.icon,
        createdTime: entity?.createdTime || undefined,
        updatedTime: entity?.updatedTime || undefined,
        entityPath: entity?.path || undefined,
        pageFile: fileName,
        path,
        line: hit.line,
        text: preview.text,
        ranges: preview.ranges
      }, `${db?.name ?? dirName} ${rowTitle ?? ""} ${preview.text} ${path}`);
    }

    const rowCsv = /^databases\/(user|system)\/([^/]+)\/data\.csv$/.exec(path);
    if (rowCsv) {
      // Header line — field names, not user content.
      if (hit.line === 1) return null;
      const dirName = rowCsv[2];
      const db = cache.databases.get(dirName);
      if (!db) return null;
      const cells = parseCsvRow(hit.text);
      if (!rowHasSearchableMatch(cells, db, pattern)) return null;
      const rowTitle = cells[db.titleCol] ?? "";
      const preview = previewCsvCells(cells, db, pattern);
      const searchMeta = csvSearchMeta(cells, db, pattern);

      if (db.id === PAGES_DATABASE_ID) {
        const pageId = cells[0] ?? "";
        const entity = cache.entities.byId.get(pageId);
        return withSearchMeta({
          kind: "page",
          pageId: entity?.id ?? pageId,
          title: entity?.title || rowTitle || cache.pages.get(pageId) || "Untitled",
          icon: entity?.icon || rowIconFromCells(cells, db),
          createdTime: entity?.createdTime || csvFieldValue(cells, db, "created_time") || undefined,
          updatedTime: entity?.updatedTime || csvFieldValue(cells, db, "updated_time") || undefined,
          entityPath: entity?.path || undefined,
          path,
          line: hit.line,
          text: preview.text,
          ranges: preview.ranges
        }, `${entitySearchText(entity)} ${db.name} ${rowTitle} ${searchMeta.text} ${path}`, searchMeta.fieldScore, entity?.id, searchMeta.matchType, searchMeta.matchTypes);
      }

      // The `page_file` cell is empty iff the row has never had its
      // body opened — RowPagesService allocates the filename and writes
      // the file in the same step, so non-empty means the file is
      // on disk.
      const csvPageFile = db.pageFileCol >= 0 ? cells[db.pageFileCol] ?? "" : "";
      const pageFile = csvPageFile || null;
      const rowId = cells[0] ?? "";
      const entity = cache.entities.byRowKey.get(entityRowKey(db.id, rowId))
        ?? (pageFile ? cache.entities.byBodyPath.get(normalizeWorkspacePath(`databases/${rowCsv[1]}/${dirName}/pages/${pageFile}`)) : undefined);
      return withSearchMeta({
        kind: "row",
        databaseId: entity?.databaseId || db.id,
        databaseName: db.name,
        rowId: entity?.rowId || entity?.id || rowId,
        rowTitle: entity?.title || rowTitle,
        icon: entity?.icon || rowIconFromCells(cells, db),
        createdTime: entity?.createdTime || csvFieldValue(cells, db, "created_time") || undefined,
        updatedTime: entity?.updatedTime || csvFieldValue(cells, db, "updated_time") || undefined,
        entityPath: entity?.path || undefined,
        pageFile,
        path,
        line: hit.line,
        text: preview.text,
        ranges: preview.ranges
      }, `${entitySearchText(entity)} ${db.name} ${rowTitle} ${searchMeta.text} ${path}`, searchMeta.fieldScore, entity?.id, searchMeta.matchType, searchMeta.matchTypes);
    }

    const schema = /^databases\/(user|system)\/([^/]+)\/schema\.json$/.exec(path);
    if (schema) {
      const dirName = schema[2];
      const db = cache.databases.get(dirName);
      const databaseId = db?.id ?? idFromDatabaseFolderName(dirName, schema[1] === "system");
      const entity = cache.entities.byDatabaseId.get(databaseId) ?? cache.entities.byId.get(databaseId);
      const preview = trimContext(hit.text, hit.ranges);
      return withSearchMeta({
        kind: "database",
        databaseId,
        databaseName: entity?.title || db?.name || dirName,
        icon: entity?.icon || db?.icon,
        createdTime: entity?.createdTime || undefined,
        updatedTime: entity?.updatedTime || undefined,
        entityPath: entity?.path || undefined,
        path,
        line: hit.line,
        text: preview.text,
        ranges: preview.ranges
      }, `${entitySearchText(entity)} ${db?.name ?? dirName} ${preview.text} ${path}`, 0, entity?.id, "database");
    }

    return null;
  }
}

function withSearchMeta<T extends Omit<EnrichedHit, "matchType" | "matchTypes">>(
  hit: T,
  text: string,
  fieldScore = 0,
  entityKey?: string,
  matchType: SearchMatchType = "content",
  matchTypes: SearchMatchType[] = [matchType]
): SearchableHit {
  const uniqueMatchTypes = orderMatchTypes([...matchTypes, matchType]);
  return {
    ...hit,
    matchType,
    matchTypes: uniqueMatchTypes,
    __search: { text, fieldScore, entityKey, matchType, matchTypes: uniqueMatchTypes }
  } as SearchableHit;
}

function stripSearchMeta(hit: SearchableHit): EnrichedHit {
  const { __search: _search, ...publicHit } = hit;
  if (publicHit.kind === "row") {
    return {
      kind: "page",
      pageId: publicHit.rowId,
      title: publicHit.rowTitle || "Untitled",
      icon: publicHit.icon,
      createdTime: publicHit.createdTime,
      updatedTime: publicHit.updatedTime,
      databaseId: publicHit.databaseId,
      databaseName: publicHit.databaseName,
      rowId: publicHit.rowId,
      pageFile: publicHit.pageFile,
      entityPath: publicHit.entityPath,
      path: publicHit.path,
      line: publicHit.line,
      text: publicHit.text,
      ranges: publicHit.ranges,
      matchType: publicHit.matchType,
      matchTypes: publicHit.matchTypes
    };
  }
  if (publicHit.kind === "rowPage") {
    return {
      kind: "page",
      pageId: idFromMarkdownFileName(publicHit.pageFile),
      title: publicHit.rowTitle || publicHit.pageFile.replace(/\.md$/i, "") || "Untitled",
      icon: publicHit.icon,
      createdTime: publicHit.createdTime,
      updatedTime: publicHit.updatedTime,
      databaseId: publicHit.databaseId,
      databaseName: publicHit.databaseName,
      pageFile: publicHit.pageFile,
      entityPath: publicHit.entityPath,
      path: publicHit.path,
      line: publicHit.line,
      text: publicHit.text,
      ranges: publicHit.ranges,
      matchType: publicHit.matchType,
      matchTypes: publicHit.matchTypes
    };
  }
  return publicHit as EnrichedHit;
}

function previewCsvCells(cells: string[], db: DbIndex, pattern: string): { text: string; ranges: HitRange[] } {
  const matches: string[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const raw = (cells[i] ?? "").trim();
    const fieldId = db.fieldIds[i] ?? "";
    if (!raw || !isSearchableCsvField(fieldId)) continue;
    if (!cellMatchesSearch(raw, pattern)) continue;
    const label = (db.fieldNames[i] ?? fieldId) || `Column ${i + 1}`;
    matches.push(`${label}: ${snippetAround(raw, pattern)}`);
    if (matches.length >= 3) break;
  }

  const text = matches.length > 0
    ? matches.join(" · ")
    : db.titleCol >= 0 && cells[db.titleCol]
      ? `Name: ${snippetAround(cells[db.titleCol], pattern)}`
      : "CSV row";
  return { text, ranges: byteRangesForPattern(text, pattern) };
}

function csvSearchMeta(
  cells: string[],
  db: DbIndex,
  pattern: string
): { text: string; fieldScore: number; matchType: SearchMatchType; matchTypes: SearchMatchType[] } {
  const searchable: string[] = [];
  let fieldScore = 0;
  const matchTypes: SearchMatchType[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const fieldId = db.fieldIds[i] ?? "";
    if (!isSearchableCsvField(fieldId)) continue;
    const raw = (cells[i] ?? "").trim();
    if (!raw) continue;
    const label = db.fieldNames[i] ?? fieldId;
    searchable.push(`${label}: ${raw}`);
    if (!cellMatchesSearch(raw, pattern)) continue;
    if (fieldId === "title") {
      fieldScore += 8_000;
      matchTypes.push("title");
    } else {
      if (fieldId === "row_icon") fieldScore += 1_000;
      else fieldScore += 2_500;
      matchTypes.push("content");
    }
  }
  const orderedMatchTypes = orderMatchTypes(matchTypes.length > 0 ? matchTypes : ["content"]);
  return { text: searchable.join(" "), fieldScore, matchType: orderedMatchTypes[0] ?? "content", matchTypes: orderedMatchTypes };
}

function rowHasSearchableMatch(cells: string[], db: DbIndex, pattern: string): boolean {
  for (let i = 0; i < cells.length; i += 1) {
    const fieldId = db.fieldIds[i] ?? "";
    if (!isSearchableCsvField(fieldId)) continue;
    const raw = (cells[i] ?? "").trim();
    if (!raw) continue;
    if (cellMatchesSearch(raw, pattern)) return true;
  }
  return false;
}

function cellMatchesSearch(value: string, pattern: string): boolean {
  const exactNeedle = pattern.toLowerCase();
  if (value.toLowerCase().includes(exactNeedle)) return true;
  const tokens = looseTokens(pattern);
  if (tokens.length <= 1) return false;
  const loose = normalizeLoose(value);
  return tokens.every((token) => loose.includes(token));
}

function isSearchableCsvField(fieldId: string): boolean {
  return !SEARCH_IGNORED_FIELD_IDS.has(fieldId);
}

function snippetAround(text: string, pattern: string): string {
  const idx = text.toLowerCase().indexOf(pattern.toLowerCase());
  if (idx < 0) return snippetAroundLoose(text, pattern);
  const start = Math.max(0, idx - 36);
  const end = Math.min(text.length, idx + pattern.length + 60);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function snippetAroundLoose(text: string, pattern: string): string {
  const lower = text.toLowerCase();
  const dateMatch = /\d{4}[\/_-]\d{1,2}[\/_-]\d{1,2}/.exec(pattern);
  const dateIndex = dateMatch?.[0] ? lower.indexOf(dateMatch[0].toLowerCase()) : -1;
  const tokens = looseTokens(pattern)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token))
    .sort((a, b) => b.length - a.length);
  const tokenIndex = tokens
    .map((token) => ({ token, index: lower.indexOf(token) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)[0];
  const idx = dateIndex >= 0 ? dateIndex : tokenIndex?.index ?? -1;
  const len = dateIndex >= 0 ? dateMatch![0].length : tokenIndex?.token.length ?? 0;
  if (idx < 0) return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  const start = Math.max(0, idx - 36);
  const end = Math.min(text.length, idx + len + 80);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function byteRangesForPattern(text: string, pattern: string): HitRange[] {
  if (!pattern) return [];
  const ranges: HitRange[] = [];
  const haystack = text.toLowerCase();
  const needle = pattern.toLowerCase();
  let index = 0;
  while (index < haystack.length) {
    const found = haystack.indexOf(needle, index);
    if (found < 0) break;
    ranges.push({
      start: byteLength(text.slice(0, found)),
      end: byteLength(text.slice(0, found + pattern.length))
    });
    index = found + Math.max(pattern.length, 1);
  }
  return ranges;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

interface RgMatchData {
  path: { text?: string; bytes?: string };
  lines: { text?: string };
  line_number: number;
  submatches: Array<{ start: number; end: number; match: { text?: string } }>;
}

function matchToHit(data: RgMatchData, workspaceRoot: string): RawHit | null {
  const absPath = data.path?.text;
  if (!absPath) return null;
  let rel = absPath;
  if (absPath.startsWith(workspaceRoot)) {
    rel = absPath.slice(workspaceRoot.length).replace(/^[\\/]/, "");
  }
  rel = rel.replace(/^\.\//, "");
  rel = rel.split("\\").join("/");
  const text = (data.lines?.text ?? "").replace(/\r?\n$/, "");
  const ranges = (data.submatches ?? []).map((s) => ({ start: s.start, end: s.end }));
  return { path: rel, line: data.line_number, text, ranges };
}

function isSearchSourcePath(path: string): boolean {
  return /\/pages\/[^/]+\.md$/i.test(path) || /\/(?:data\.csv|schema\.json)$/i.test(path);
}

function mergeRawHits(primary: RawHit[], secondary: RawHit[]): RawHit[] {
  if (secondary.length === 0) return primary;
  const seen = new Set(primary.map(rawHitKey));
  const merged = [...primary];
  for (const hit of secondary) {
    const key = rawHitKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= MAX_HITS * 2) break;
  }
  return merged;
}

function mergeSearchHits(primary: SearchableHit[], secondary: SearchableHit[]): SearchableHit[] {
  if (secondary.length === 0) return primary;
  const seen = new Set(primary.map(searchVariantKey));
  const merged = [...primary];
  for (const hit of secondary) {
    const key = searchVariantKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }
  return merged;
}

function rawHitKey(hit: RawHit): string {
  return `${hit.path}:${hit.line}:${hit.text}`;
}

function rankAndDedupeHits(hits: SearchableHit[], pattern: string, sortMode: SearchSortMode = "relevance"): SearchableHit[] {
  const matchTypesByKey = new Map<string, SearchMatchType[]>();
  for (const hit of hits) {
    const key = logicalHitKey(hit);
    matchTypesByKey.set(key, orderMatchTypes([...(matchTypesByKey.get(key) ?? []), ...hitSearchMatchTypes(hit)]));
  }

  const ranked = hits
    .map((hit, index) => ({ hit, index, score: searchScore(hit, pattern) }))
    .sort(compareSearchRelevanceItems);

  const seen = new Set<string>();
  const out: Array<{ hit: SearchableHit; index: number; score: number }> = [];
  for (const item of ranked) {
    const key = logicalHitKey(item.hit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...item,
      hit: withMergedMatchTypes(item.hit, matchTypesByKey.get(key) ?? hitSearchMatchTypes(item.hit))
    });
  }
  if (sortMode !== "relevance") {
    out.sort((a, b) => compareSearchDateItems(a, b, sortMode));
  }
  return out.map((item) => item.hit);
}

function compareSearchRelevanceItems(
  a: { hit: SearchableHit; index: number; score: number },
  b: { hit: SearchableHit; index: number; score: number }
): number {
  return b.score - a.score ||
    primaryHitTitle(a.hit).localeCompare(primaryHitTitle(b.hit)) ||
    searchKindRank(a.hit) - searchKindRank(b.hit) ||
    logicalHitKey(a.hit).localeCompare(logicalHitKey(b.hit)) ||
    a.index - b.index;
}

function compareSearchDateItems(
  a: { hit: SearchableHit; index: number; score: number },
  b: { hit: SearchableHit; index: number; score: number },
  sortMode: SearchSortMode
): number {
  const field = sortMode.startsWith("created") ? "createdTime" : "updatedTime";
  const direction = sortMode.endsWith("_asc") ? "asc" : "desc";
  const aTime = timestampValue(a.hit[field]);
  const bTime = timestampValue(b.hit[field]);
  const aHasDate = Number.isFinite(aTime);
  const bHasDate = Number.isFinite(bTime);
  if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
  if (aHasDate && bHasDate && aTime !== bTime) {
    return direction === "asc" ? aTime - bTime : bTime - aTime;
  }
  return compareSearchRelevanceItems(a, b);
}

function timestampValue(value: string | undefined): number {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function searchKindRank(hit: SearchableHit): number {
  switch (hit.kind) {
    case "page":
      return 0;
    case "row":
      return 1;
    case "rowPage":
      return 2;
    case "database":
      return 3;
  }
}

function normalizeSearchSort(sort: SearchSortMode | undefined): SearchSortMode {
  switch (sort) {
    case "updated_desc":
    case "updated_asc":
    case "created_desc":
    case "created_asc":
      return sort;
    case "relevance":
    default:
      return "relevance";
  }
}

function searchVariantKey(hit: SearchableHit): string {
  return `${logicalHitKey(hit)}:${hit.__search?.matchType ?? hit.matchType}:${hit.path}:${hit.line}:${hit.text}`;
}

const SEARCH_MATCH_TYPE_ORDER: SearchMatchType[] = ["title", "content", "reference", "database"];

function orderMatchTypes(types: SearchMatchType[]): SearchMatchType[] {
  const seen = new Set<SearchMatchType>();
  for (const type of types) seen.add(type);
  return SEARCH_MATCH_TYPE_ORDER.filter((type) => seen.has(type));
}

function hitSearchMatchTypes(hit: SearchableHit): SearchMatchType[] {
  return orderMatchTypes([
    ...(hit.__search?.matchTypes ?? []),
    ...(hit.matchTypes ?? []),
    hit.__search?.matchType ?? hit.matchType
  ]);
}

function withMergedMatchTypes(hit: SearchableHit, matchTypes: SearchMatchType[]): SearchableHit {
  const ordered = orderMatchTypes(matchTypes);
  return {
    ...hit,
    matchTypes: ordered,
    __search: hit.__search
      ? { ...hit.__search, matchTypes: ordered }
      : hit.__search
  };
}

function matchTypeScore(type: SearchMatchType): number {
  switch (type) {
    case "title":
      return 80_000;
    case "content":
      return 60_000;
    case "reference":
      return 40_000;
    case "database":
      return 20_000;
  }
}

function logicalHitKey(hit: SearchableHit): string {
  const entityKey = hit.__search?.entityKey;
  if (entityKey) return `entity:${entityKey}`;
  switch (hit.kind) {
    case "page":
      return `page:${hit.pageId}`;
    case "database":
      return `database:${hit.databaseId}`;
    case "row":
      return `row:${hit.databaseId}:${hit.rowId}`;
    case "rowPage":
      return `rowPage:${hit.databaseId}:${hit.pageFile}`;
  }
}

function searchScore(hit: SearchableHit, pattern: string): number {
  const needle = normalizeLoose(pattern);
  const tokens = looseTokens(pattern);
  const title = normalizeLoose(primaryHitTitle(hit));
  const databaseName = "databaseName" in hit ? normalizeLoose(hit.databaseName ?? "") : "";
  const preview = normalizeLoose(hit.text);
  const searchText = normalizeLoose(hit.__search?.text ?? `${primaryHitTitle(hit)} ${hit.text} ${hit.path} ${hit.entityPath ?? ""}`);
  const path = normalizeLoose(hit.path);
  const entityPath = normalizeLoose(hit.entityPath ?? "");
  let score = matchTypeScore(hit.__search?.matchType ?? hit.matchType);
  let titleMatched = false;

  if (title === needle) {
    score += 20_000;
    titleMatched = true;
  } else if (title.startsWith(needle)) {
    score += 14_000;
    titleMatched = true;
  } else if (title.includes(needle)) {
    score += 11_000;
    titleMatched = true;
  } else if (tokens.length > 1 && tokens.every((token) => title.includes(token))) {
    score += 9_000;
    titleMatched = true;
  }
  if (titleMatched) {
    score += Math.max(0, 1_200 - Math.min(title.length * 8, 1_200));
  }

  if (databaseName === needle) score += 7_000;
  else if (databaseName.startsWith(needle)) score += 5_000;
  else if (databaseName.includes(needle)) score += 3_000;

  if (hit.kind === "row" && hit.pageFile) score += 900;
  if (hit.kind === "rowPage") score += 800;
  if (hit.kind === "page") score += 700;
  if (hit.kind === "database") score += 600;

  if (preview.includes(needle)) score += 1_000;
  if (searchText.includes(needle)) score += 700;
  else if (tokens.length > 1 && tokens.every((token) => searchText.includes(token))) score += 500;
  score += hit.__search?.fieldScore ?? 0;
  if (entityPath.includes(needle)) score += 450;
  else if (tokens.length > 1 && tokens.every((token) => entityPath.includes(token))) score += 350;
  if (path.includes(needle)) score += 200;
  if (isMetadataOnlyPreview(hit.text)) score -= 1_500;
  return score;
}

function primaryHitTitle(hit: SearchableHit): string {
  switch (hit.kind) {
    case "page":
      return hit.title;
    case "database":
      return hit.databaseName;
    case "row":
      return hit.rowTitle;
    case "rowPage":
      return hit.rowTitle ?? hit.pageFile.replace(/\.md$/i, "");
  }
}

function matchesQuery(hit: SearchableHit, pattern: string): boolean {
  const tokens = looseTokens(pattern);
  if (tokens.length <= 1) return true;
  const haystack = normalizeLoose(hit.__search?.text ?? `${primaryHitTitle(hit)} ${hit.text} ${hit.path} ${hit.entityPath ?? ""}`);
  return tokens.every((token) => haystack.includes(token));
}

function looseSearchSeeds(pattern: string): string[] {
  const seeds: string[] = [];
  const dateMatch = /\d{4}[\/_-]\d{1,2}[\/_-]\d{1,2}/.exec(pattern);

  const tokens = looseTokens(pattern).filter((token) => token.length >= 2);
  if (dateMatch?.[0] && tokens.filter((token) => !/^\d+$/.test(token)).length < 2) {
    seeds.push(dateMatch[0]);
  }
  if (tokens.length <= 1) return seeds;

  const semanticTokens = tokens.filter((token) => !/^\d+$/.test(token));
  for (let i = semanticTokens.length - 2; i >= 0; i -= 1) {
    seeds.push(semanticTokens.slice(i, i + 2).join(" "));
  }
  if (dateMatch?.[0]) seeds.push(dateMatch[0]);
  for (let length = 3; length <= Math.min(semanticTokens.length, 4); length += 1) {
    for (let i = semanticTokens.length - length; i >= 0; i -= 1) {
      seeds.push(semanticTokens.slice(i, i + length).join(" "));
    }
  }

  const singleTokens = semanticTokens.length > 0 ? semanticTokens : tokens;
  for (const token of [...singleTokens].sort((a, b) => b.length - a.length)) {
    seeds.push(token);
  }

  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = seed.toLowerCase();
    if (!seed || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameSearchNeedle(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function looseTokens(pattern: string): string[] {
  return normalizeLoose(pattern).split(/\s+/).filter(Boolean);
}

function normalizeLoose(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function isMetadataOnlyPreview(text: string): boolean {
  return /\b(Original Notion HTML|Original Notion CSV|notion_original_html|notion_original_csv|attachments\/original)\b/i.test(text);
}

/**
 * Trim a long match line down to a window around its first match so the
 * preview is readable. Ranges are remapped to the new (truncated) text.
 * All offsets are UTF-8 byte indices; we align to lead bytes to avoid
 * splitting multi-byte characters.
 */
function trimContext(text: string, ranges: HitRange[]): { text: string; ranges: HitRange[] } {
  if (!ranges.length) return { text, ranges };
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const firstStart = ranges[0].start;
  const lastEnd = ranges[ranges.length - 1].end;
  let start = Math.max(0, firstStart - PREVIEW_PAD_LEFT);
  let end = Math.min(bytes.length, lastEnd + PREVIEW_PAD_RIGHT);
  // Move off UTF-8 continuation bytes so we don't split a character.
  while (start > 0 && (bytes[start] & 0xc0) === 0x80) start -= 1;
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end += 1;
  if (start === 0 && end === bytes.length) return { text, ranges };
  const ellipsisLeft = start > 0;
  const ellipsisRight = end < bytes.length;
  const sliced = bytes.slice(start, end);
  const decoder = new TextDecoder();
  const inner = decoder.decode(sliced);
  const newText = (ellipsisLeft ? "…" : "") + inner + (ellipsisRight ? "…" : "");
  // "…" is 3 bytes in UTF-8.
  const adj = -start + (ellipsisLeft ? 3 : 0);
  const newRanges = ranges.map((r) => ({ start: r.start + adj, end: r.end + adj }));
  return { text: newText, ranges: newRanges };
}

/**
 * Parse a single CSV row supporting quoted cells and escaped quotes
 * ("" → "). Inputs are individual lines, so embedded newlines inside
 * quoted cells aren't handled — Lotion's CSV writer doesn't emit
 * those.
 */
function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cell += ch;
      }
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else if (ch === '"' && cell === "") {
      inQuote = true;
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

async function readPageTitleIndex(root: string): Promise<Map<string, string>> {
  const pages = new Map<string, string>();
  try {
    const records = await readCsvFile(join(root, "databases", "system", databaseFolderName(PAGES_DATABASE_ID, "pages"), "data.csv"));
    for (const record of records) {
      const id = String(record.id ?? "");
      if (!id) continue;
      const title = String(record.title ?? "").trim() || "Untitled";
      pages.set(id, title);
    }
  } catch {
    /* no pages database yet */
  }
  return pages;
}

async function readEntityIndex(root: string): Promise<EntityIndex> {
  const index: EntityIndex = {
    byId: new Map(),
    byBodyPath: new Map(),
    byRowKey: new Map(),
    byDatabaseId: new Map()
  };

  try {
    const records = await readCsvFile(join(root, "databases", "system", databaseFolderName(ENTITIES_DATABASE_ID, "entities"), "data.csv"));
    for (const record of records) {
      const id = String(record.id ?? "").trim();
      const kind = String(record.kind ?? "").trim();
      if (!id || !isEntityKind(kind)) continue;

      const entity: EntityIndexEntry = {
        id,
        kind,
        title: String(record.title ?? "").trim() || "Untitled",
        icon: String(record.icon ?? "").trim(),
        createdTime: String(record.created_time ?? "").trim(),
        updatedTime: String(record.updated_time ?? "").trim(),
        databaseId: String(record.database_id ?? "").trim(),
        rowId: String(record.row_id ?? "").trim(),
        bodyPath: normalizeWorkspacePath(String(record.body_path ?? "").trim()),
        path: displayPathValue(record.path)
      };

      index.byId.set(entity.id, entity);
      if (entity.bodyPath) index.byBodyPath.set(entity.bodyPath, entity);
      if (entity.kind === "row" && entity.databaseId) {
        if (entity.rowId) index.byRowKey.set(entityRowKey(entity.databaseId, entity.rowId), entity);
        if (entity.id !== entity.rowId) index.byRowKey.set(entityRowKey(entity.databaseId, entity.id), entity);
      }
      if (entity.kind === "database") {
        const databaseId = entity.databaseId || entity.id;
        if (databaseId) index.byDatabaseId.set(databaseId, entity);
      }
    }
  } catch {
    /* no entities database yet */
  }

  return index;
}

function isEntityKind(kind: string): kind is EntityIndexEntry["kind"] {
  return kind === "page" || kind === "database" || kind === "row";
}

function entityRowKey(databaseId: string, rowId: string): string {
  return `${databaseId}:${rowId}`;
}

function normalizeWorkspacePath(path: string): string {
  return path.replace(/^\.\//, "").split("\\").join("/");
}

function entitySearchText(entity: EntityIndexEntry | undefined): string {
  if (!entity) return "";
  return `${entity.title} ${entity.path} ${entity.databaseId} ${entity.rowId} ${entity.bodyPath}`;
}

function metadataPreview(entity: EntityIndexEntry, pattern: string): { text: string; ranges: HitRange[] } {
  const title = entity.title || "Untitled";
  const path = entity.path || entity.bodyPath;
  const looseTitle = normalizeLoose(title);
  const looseNeedle = normalizeLoose(pattern);
  const text = looseTitle.includes(looseNeedle)
    ? `Name: ${snippetAround(title, pattern)}`
    : path
      ? `Path: ${snippetAround(path, pattern)}`
      : `Name: ${title}`;
  return { text, ranges: byteRangesForPattern(text, pattern) };
}

function metadataFieldScore(entity: EntityIndexEntry, pattern: string): number {
  const needle = normalizeLoose(pattern);
  const tokens = looseTokens(pattern);
  const title = normalizeLoose(entity.title);
  const path = normalizeLoose(entity.path);
  let score = 6_000;
  if (title === needle) score += 20_000;
  else if (title.startsWith(needle)) score += 14_000;
  else if (title.includes(needle)) score += 11_000;
  else if (tokens.length > 1 && tokens.every((token) => title.includes(token))) score += 9_000;
  if (path.includes(needle)) score += 3_000;
  else if (tokens.length > 1 && tokens.every((token) => path.includes(token))) score += 2_000;
  return score;
}

function rowIconFromCells(cells: string[], db: DbIndex): string | undefined {
  const index = db.fieldIds.indexOf("row_icon");
  const rowIcon = index < 0 ? "" : String(cells[index] ?? "").trim();
  return rowIcon || db.icon;
}

function csvFieldValue(cells: string[], db: DbIndex, fieldId: string): string {
  const index = db.fieldIds.indexOf(fieldId);
  if (index < 0) return "";
  return String(cells[index] ?? "").trim();
}

function fileNameFromWorkspacePath(path: string): string | null {
  const match = /\/pages\/([^/]+\.md)$/i.exec(path);
  return match ? match[1] : null;
}

function internalMarkdownLinks(markdown: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const regex = /\[[^\]]*\]\(([^)\r\n]+\.md)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markdown))) {
    const target = normalizeWorkspacePath(match[1] ?? "");
    if (!target.startsWith("databases/") || seen.has(target)) continue;
    seen.add(target);
    links.push(target);
  }
  return links;
}

function extractEntityRefIds(cells: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!cell.includes('"entityId"')) continue;
    const regex = /"entityId"\s*:\s*"([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cell))) {
      const id = match[1]?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function linkSourceScore(source: { path: string; title: string }, pattern: string): number {
  const needle = normalizeLoose(pattern);
  const tokens = looseTokens(pattern);
  const title = normalizeLoose(source.title);
  const path = normalizeLoose(source.path);
  let score = 0;
  if (title === needle) score += 30_000;
  else if (title.includes(needle)) score += 20_000;
  else if (tokens.length > 1 && tokens.every((token) => title.includes(token))) score += 15_000;
  if (path.includes(needle)) score += 4_000;
  else if (tokens.length > 1 && tokens.every((token) => path.includes(token))) score += 2_000;
  score -= Math.min(source.title.length, 500);
  return score;
}

function entityToSearchHit(
  entity: EntityIndexEntry,
  cache: CacheBundle,
  preview: { text: string; ranges: HitRange[] },
  searchText: string,
  fieldScore: number,
  matchType: SearchMatchType
): SearchableHit {
  if (entity.kind === "database") {
    const databaseId = entity.databaseId || entity.id;
    const db = cache.databasesById.get(databaseId);
    return withSearchMeta({
      kind: "database",
      databaseId,
      databaseName: entity.title || db?.name || databaseId,
      icon: entity.icon || db?.icon,
      createdTime: entity.createdTime || undefined,
      updatedTime: entity.updatedTime || undefined,
      entityPath: entity.path || undefined,
      path: entity.bodyPath || entity.path || `databases/${databaseId}`,
      line: 1,
      text: preview.text,
      ranges: preview.ranges
    }, searchText, fieldScore, entity.id, matchType);
  }
  if (entity.kind === "row") {
    const db = cache.databasesById.get(entity.databaseId);
    const bodyPath = entity.bodyPath || "";
    return withSearchMeta({
      kind: "row",
      databaseId: entity.databaseId,
      databaseName: db?.name ?? entity.databaseId,
      rowId: entity.rowId || entity.id,
      rowTitle: entity.title || "Untitled",
      icon: entity.icon,
      createdTime: entity.createdTime || undefined,
      updatedTime: entity.updatedTime || undefined,
      entityPath: entity.path || undefined,
      pageFile: fileNameFromWorkspacePath(bodyPath),
      path: bodyPath || entity.path || `databases/${entity.databaseId}/data.csv`,
      line: 1,
      text: preview.text,
      ranges: preview.ranges
    }, searchText, fieldScore, entity.id, matchType);
  }
  return withSearchMeta({
    kind: "page",
    pageId: entity.id,
    title: entity.title || cache.pages.get(entity.id) || "Untitled",
    icon: entity.icon,
    createdTime: entity.createdTime || undefined,
    updatedTime: entity.updatedTime || undefined,
    entityPath: entity.path || undefined,
    path: entity.bodyPath || entity.path,
    line: 1,
    text: preview.text,
    ranges: preview.ranges
  }, searchText, fieldScore, entity.id, matchType);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
