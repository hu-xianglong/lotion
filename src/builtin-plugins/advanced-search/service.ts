import type {
  AdvancedSearchConfig,
  AdvancedSearchHit,
  AdvancedSearchIndexStatusValue,
  AdvancedSearchProviderStatus,
  AdvancedSearchRebuildProgress,
  AdvancedSearchRebuildResult,
  AdvancedSearchResult,
  AdvancedSearchStatus
} from "../../shared/advanced-search.js";
import type { DatabaseRecord, DatabaseSchema } from "../../shared/types.js";
import type { PluginContext } from "../../shared/plugin-api.js";
import { PAGES_DATABASE_ID } from "../../shared/constants.js";

const INDEX_VERSION = 1;
const INDEX_FILE = "advanced-search-index.json";
const DEFAULT_DIMENSIONS = 96;
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_EMBEDDING_MODEL = "qwen3-embedding:0.6b";
const DEFAULT_CONFIG: AdvancedSearchConfig = {
  provider: "ollama",
  baseUrl: DEFAULT_OLLAMA_BASE_URL,
  model: DEFAULT_OLLAMA_EMBEDDING_MODEL,
  dimensions: DEFAULT_DIMENSIONS,
  vectorStore: "json"
};
const MAX_CHARS_PER_CHUNK = 900;
const CHUNK_OVERLAP_CHARS = 120;
const MAX_RESULTS = 40;
const COLLECT_YIELD_EVERY = 100;
const EMBEDDING_BATCH_SIZE = 64;
const IGNORED_ROW_FIELDS = new Set([
  "id",
  "created_time",
  "updated_time",
  "page_file",
  "body_path",
  "row_icon",
  "cover",
  "cover_offset"
]);

export interface AdvancedSearchEmbeddingProvider {
  embed(texts: string[], config: AdvancedSearchConfig): Promise<number[][]>;
}

export interface AdvancedSearchVectorIndexAdapter {
  writeChunks(chunks: IndexedChunk[]): Promise<void>;
  searchByVector(vector: number[], limit: number): Promise<IndexedChunk[]>;
  stats(): Promise<{ chunkCount: number; indexSizeBytes?: number }>;
}

interface LanceDbConnection {
  createTable(name: string, rows: Array<Record<string, unknown>>, options: { mode: "overwrite" }): Promise<LanceDbTable>;
  openTable(name: string): Promise<LanceDbTable>;
}

interface LanceDbTable {
  search(vector: number[]): { limit(limit: number): { toArray(): Promise<Array<Record<string, unknown>>> } };
  countRows(): Promise<number>;
}

export interface AdvancedSearchPluginServiceOptions {
  embeddingProvider?: AdvancedSearchEmbeddingProvider;
  ollamaProvider?: AdvancedSearchEmbeddingProvider;
  vectorIndexAdapter?: AdvancedSearchVectorIndexAdapter;
  now?: () => Date;
}

export interface AdvancedSearchDocument {
  id: string;
  kind: "page" | "database" | "rowPage";
  title: string;
  subtitle: string;
  text: string;
  icon?: string;
  entityPath?: string;
  pageId?: string;
  databaseId?: string;
  rowId?: string;
  pageFile?: string | null;
}

export interface IndexedChunk extends Omit<AdvancedSearchDocument, "text"> {
  chunkId: string;
  text: string;
  textHash: string;
  vector: number[];
}

interface ChunkDraft extends Omit<IndexedChunk, "vector"> {}

interface CollectionProgress {
  current: number;
  total: number;
  message: string;
}

interface AdvancedSearchIndexFile {
  version: number;
  config: AdvancedSearchConfig;
  status: AdvancedSearchIndexStatusValue;
  updatedAt?: string;
  staleReason?: string;
  error?: string;
  sourceHash?: string;
  chunks: IndexedChunk[];
  documents: Array<Pick<AdvancedSearchDocument, "id" | "kind" | "title" | "subtitle" | "entityPath">>;
}

export class AdvancedSearchProviderError extends Error {
  constructor(message: string, readonly code: "rate_limited" | "provider_error" | "not_configured" = "provider_error") {
    super(message);
    this.name = "AdvancedSearchProviderError";
  }
}

export class LocalHashEmbeddingProvider implements AdvancedSearchEmbeddingProvider {
  async embed(texts: string[], config: AdvancedSearchConfig): Promise<number[][]> {
    const dimensions = config.dimensions ?? DEFAULT_DIMENSIONS;
    return texts.map((text) => normalizeVector(hashTextVector(text, dimensions)));
  }
}

export class OllamaEmbeddingProvider implements AdvancedSearchEmbeddingProvider {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async embed(texts: string[], config: AdvancedSearchConfig): Promise<number[][]> {
    const baseUrl = (config.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
    const model = config.model?.trim() || DEFAULT_OLLAMA_EMBEDDING_MODEL;
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, input: texts })
      });
    } catch (error) {
      throw new AdvancedSearchProviderError(
        `Ollama is not reachable at ${baseUrl}. Start Ollama, then run: ollama pull ${model}`,
        "not_configured"
      );
    }
    if (response.status === 429) {
      throw new AdvancedSearchProviderError("Ollama embedding request was rate limited.", "rate_limited");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const lower = detail.toLowerCase();
      if (response.status === 404 || (lower.includes("model") && lower.includes("not found"))) {
        throw new AdvancedSearchProviderError(
          `Ollama model "${model}" is missing. Run: ollama pull ${model}`,
          "not_configured"
        );
      }
      throw new AdvancedSearchProviderError(
        `Ollama embedding failed (${response.status}).${detail ? ` ${detail.slice(0, 240)}` : ""}`,
        "provider_error"
      );
    }
    const payload = await response.json() as { embeddings?: number[][]; embedding?: number[] };
    const vectors = Array.isArray(payload.embeddings)
      ? payload.embeddings
      : Array.isArray(payload.embedding)
        ? [payload.embedding]
        : [];
    if (vectors.length !== texts.length || !vectors.every((vector) => Array.isArray(vector))) {
      throw new AdvancedSearchProviderError("Ollama returned an unexpected embedding response.", "provider_error");
    }
    return vectors.map(normalizeVector);
  }
}

class OpenAICompatibleEmbeddingProvider implements AdvancedSearchEmbeddingProvider {
  async embed(texts: string[], config: AdvancedSearchConfig): Promise<number[][]> {
    const baseUrl = config.baseUrl?.replace(/\/$/, "");
    const model = config.model?.trim();
    const apiKey = config.apiKey?.trim();
    if (!baseUrl || !model || !apiKey) {
      throw new AdvancedSearchProviderError("External embeddings require base URL, model, and API key.", "not_configured");
    }
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ model, input: texts })
    });
    if (response.status === 429) {
      throw new AdvancedSearchProviderError("Embedding provider rate limit hit.", "rate_limited");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AdvancedSearchProviderError(
        `Embedding provider failed (${response.status}).${detail ? ` ${detail.slice(0, 240)}` : ""}`,
        "provider_error"
      );
    }
    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const vectors = payload.data?.map((item) => item.embedding).filter((item): item is number[] => Array.isArray(item)) ?? [];
    if (vectors.length !== texts.length) {
      throw new AdvancedSearchProviderError("Embedding provider returned an unexpected vector count.", "provider_error");
    }
    return vectors.map(normalizeVector);
  }
}

export class JsonVectorIndexAdapter implements AdvancedSearchVectorIndexAdapter {
  private chunks: IndexedChunk[] = [];

  async writeChunks(chunks: IndexedChunk[]): Promise<void> {
    this.chunks = chunks;
  }

  async searchByVector(vector: number[], limit: number): Promise<IndexedChunk[]> {
    return this.chunks
      .map((chunk) => ({ chunk, distance: 1 - Math.max(0, cosineSimilarity(vector, chunk.vector)) }))
      .sort((a, b) => a.distance - b.distance || a.chunk.title.localeCompare(b.chunk.title))
      .slice(0, limit)
      .map((entry) => entry.chunk);
  }

  async stats(): Promise<{ chunkCount: number; indexSizeBytes?: number }> {
    return { chunkCount: this.chunks.length, indexSizeBytes: new TextEncoder().encode(JSON.stringify(this.chunks)).length };
  }
}

export class LanceDbVectorIndexAdapter implements AdvancedSearchVectorIndexAdapter {
  private readonly tableName: string;

  constructor(private readonly options: { directory: string; tableName?: string }) {
    this.tableName = options.tableName ?? "advanced_search_chunks";
  }

  async writeChunks(chunks: IndexedChunk[]): Promise<void> {
    if (!chunks.length) return;
    const db = await this.connect();
    await db.createTable(this.tableName, chunks.map(chunkToLanceRow), { mode: "overwrite" });
  }

  async searchByVector(vector: number[], limit: number): Promise<IndexedChunk[]> {
    const table = await this.openTable().catch(() => null);
    if (!table) return [];
    const rows = await table.search(vector).limit(limit).toArray();
    return rows.map(lanceRowToChunk);
  }

  async stats(): Promise<{ chunkCount: number; indexSizeBytes?: number }> {
    const table = await this.openTable().catch(() => null);
    return { chunkCount: table ? await table.countRows() : 0 };
  }

  private async connect(): Promise<LanceDbConnection> {
    const lancedb = await importLanceDb();
    return lancedb.connect(this.options.directory);
  }

  private async openTable(): Promise<LanceDbTable> {
    const db = await this.connect();
    return db.openTable(this.tableName);
  }
}

export class AdvancedSearchPluginService {
  private readonly embeddingProvider: AdvancedSearchEmbeddingProvider;
  private readonly ollamaProvider: AdvancedSearchEmbeddingProvider;
  private readonly vectorIndexAdapter?: AdvancedSearchVectorIndexAdapter;
  private readonly now: () => Date;

  constructor(private readonly ctx: Pick<PluginContext, "workspace" | "storage">, options: AdvancedSearchPluginServiceOptions = {}) {
    this.embeddingProvider = options.embeddingProvider ?? new LocalHashEmbeddingProvider();
    this.ollamaProvider = options.ollamaProvider ?? new OllamaEmbeddingProvider();
    this.vectorIndexAdapter = options.vectorIndexAdapter;
    this.now = options.now ?? (() => new Date());
  }

  async status(): Promise<AdvancedSearchStatus> {
    return this.statusFromIndex(await this.readIndex());
  }

  async configure(input: Partial<AdvancedSearchConfig>): Promise<AdvancedSearchStatus> {
    const current = await this.readIndex();
    const config = normalizeConfig({ ...(current?.config ?? DEFAULT_CONFIG), ...input });
    const next: AdvancedSearchIndexFile = {
      version: INDEX_VERSION,
      config,
      status: current?.chunks.length ? "stale" : "not_built",
      staleReason: "Embedding settings changed.",
      chunks: current?.chunks ?? [],
      documents: current?.documents ?? [],
      updatedAt: current?.updatedAt,
      sourceHash: current?.sourceHash
    };
    await this.writeIndex(next);
    return this.statusFromIndex(next);
  }

  async markStale(reason = "Workspace content changed."): Promise<AdvancedSearchStatus> {
    const current = await this.readIndex();
    if (!current) return this.statusFromIndex(undefined);
    const next = {
      ...current,
      status: current.status === "not_built" ? "not_built" : "stale",
      staleReason: reason
    } satisfies AdvancedSearchIndexFile;
    await this.writeIndex(next);
    return this.statusFromIndex(next);
  }

  async rebuild(options: {
    config?: Partial<AdvancedSearchConfig>;
    onProgress?: (progress: AdvancedSearchRebuildProgress) => void;
  } = {}): Promise<AdvancedSearchRebuildResult> {
    const current = await this.readIndex();
    const config = normalizeConfig({ ...(current?.config ?? DEFAULT_CONFIG), ...(options.config ?? {}) });
    const timestamp = this.now().toISOString();
    await this.writeIndex({
      version: INDEX_VERSION,
      config,
      status: "indexing",
      updatedAt: current?.updatedAt,
      chunks: current?.chunks ?? [],
      documents: current?.documents ?? []
    });

    try {
      options.onProgress?.({ phase: "collecting", current: 0, total: 1, message: "Collecting workspace content" });
      const documents = await this.collectDocuments((progress) => {
        options.onProgress?.({ phase: "collecting", ...progress });
      });
      const drafts = materializeChunks(documents);
      const oldVectors = new Map((current?.chunks ?? []).map((chunk) => [`${chunk.chunkId}:${chunk.textHash}`, chunk.vector]));
      const freshDrafts = drafts.filter((chunk) => !oldVectors.has(`${chunk.chunkId}:${chunk.textHash}`));
      options.onProgress?.({
        phase: "embedding",
        current: drafts.length - freshDrafts.length,
        total: drafts.length,
        message: freshDrafts.length
          ? `Embedding ${freshDrafts.length} changed chunks`
          : "Reusing unchanged vectors"
      });
      const provider = this.providerForConfig(config);
      const freshVectors = await embedTextsInBatches(provider, freshDrafts.map((chunk) => chunk.text), config, (embedded) => {
        options.onProgress?.({
          phase: "embedding",
          current: drafts.length - freshDrafts.length + embedded,
          total: drafts.length,
          message: freshDrafts.length
            ? `Embedding ${Math.min(embedded, freshDrafts.length)}/${freshDrafts.length} changed chunks`
            : "Reusing unchanged vectors"
        });
      });
      const freshByChunkId = new Map(freshDrafts.map((chunk, index) => [chunk.chunkId, freshVectors[index] ?? []]));
      const chunks = drafts.map((chunk) => ({
        ...chunk,
        vector: oldVectors.get(`${chunk.chunkId}:${chunk.textHash}`) ?? freshByChunkId.get(chunk.chunkId) ?? []
      }));
      if (config.vectorStore === "lancedb") {
        if (!this.vectorIndexAdapter) {
          throw new AdvancedSearchProviderError(
            "LanceDB vector storage requires the backend LanceDB adapter. Use the local JSON fallback in this renderer session.",
            "not_configured"
          );
        }
        await this.vectorIndexAdapter.writeChunks(chunks);
      }
      options.onProgress?.({ phase: "writing", current: chunks.length, total: chunks.length, message: "Writing local plugin index" });
      const next: AdvancedSearchIndexFile = {
        version: INDEX_VERSION,
        config,
        status: "ready",
        updatedAt: timestamp,
        sourceHash: hashStableJson(documents.map((document) => ({
          id: document.id,
          title: document.title,
          textHash: hashText(document.text)
        }))),
        chunks,
        documents: documents.map((document) => ({
          id: document.id,
          kind: document.kind,
          title: document.title,
          subtitle: document.subtitle,
          entityPath: document.entityPath
        }))
      };
      await this.writeIndex(next);
      options.onProgress?.({ phase: "done", current: chunks.length, total: chunks.length, message: "Advanced index ready" });
      return { status: this.statusFromIndex(next), indexedAt: timestamp };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed: AdvancedSearchIndexFile = {
        version: INDEX_VERSION,
        config,
        status: "error",
        updatedAt: current?.updatedAt,
        error: message,
        chunks: current?.chunks ?? [],
        documents: current?.documents ?? [],
        sourceHash: current?.sourceHash
      };
      await this.writeIndex(failed);
      options.onProgress?.({ phase: "error", current: 0, total: 0, message });
      throw error;
    }
  }

  async query(pattern: string): Promise<AdvancedSearchResult> {
    const query = pattern.trim();
    const index = await this.readIndex();
    const status = this.statusFromIndex(index);
    if (!query || !index || index.status === "indexing" || index.status === "error" || index.chunks.length === 0) {
      return { hits: [], status, query };
    }
    const provider = this.providerForConfig(index.config);
    const [queryVector] = await provider.embed([query], index.config);
    const candidateChunks = index.config.vectorStore === "lancedb" && this.vectorIndexAdapter
      ? await this.vectorIndexAdapter.searchByVector(queryVector, MAX_RESULTS * 4)
      : index.chunks;
    const hits = rankChunks(candidateChunks, query, queryVector, MAX_RESULTS);
    return { hits, status, query };
  }

  async queryTransient(pattern: string, options: {
    limit?: number;
    config?: Partial<AdvancedSearchConfig>;
  } = {}): Promise<AdvancedSearchResult> {
    const query = pattern.trim();
    const current = await this.readIndex();
    const config = normalizeConfig({
      provider: "local",
      model: "local-hash-v1",
      vectorStore: "json",
      ...(options.config ?? {})
    });
    if (!query) {
      return { hits: [], status: this.statusFromTransient([], [], config, current), query };
    }
    const documents = await this.collectDocuments();
    const drafts = materializeChunks(documents);
    if (drafts.length === 0) {
      return { hits: [], status: this.statusFromTransient(documents, [], config, current), query };
    }
    const provider = this.providerForConfig(config);
    const vectors = await embedTextsInBatches(provider, [...drafts.map((chunk) => chunk.text), query], config);
    const queryVector = vectors[vectors.length - 1] ?? [];
    const chunks: IndexedChunk[] = drafts.map((chunk, index) => ({
      ...chunk,
      vector: vectors[index] ?? []
    }));
    return {
      hits: rankChunks(chunks, query, queryVector, options.limit ?? MAX_RESULTS),
      status: this.statusFromTransient(documents, chunks, config, current),
      query
    };
  }

  async debugCollectChunks(): Promise<{ documents: AdvancedSearchDocument[]; chunks: ChunkDraft[] }> {
    const documents = await this.collectDocuments();
    return { documents, chunks: materializeChunks(documents) };
  }

  private async collectDocuments(onProgress?: (progress: CollectionProgress) => void): Promise<AdvancedSearchDocument[]> {
    const documents: AdvancedSearchDocument[] = [];
    const pages = await this.ctx.workspace.listPages();
    let total = Math.max(pages.length, 1);
    let current = 0;
    onProgress?.({ current, total, message: `Collecting ${pages.length} pages` });
    for (const meta of pages) {
      const page = await this.ctx.workspace.getPage(meta.id);
      documents.push({
        id: `page:${page.meta.id}`,
        kind: "page",
        title: page.meta.title || "Untitled",
        subtitle: ["Page", displayPath(page.meta.path)].filter(Boolean).join(" · "),
        text: [page.meta.title, displayPath(page.meta.path), page.markdown].filter(Boolean).join("\n\n"),
        icon: page.meta.icon,
        entityPath: displayPath(page.meta.path),
        pageId: page.meta.id
      });
      current += 1;
      if (shouldReportProgress(current, total)) {
        onProgress?.({ current, total, message: `Collected ${current}/${total} pages` });
      }
      if (current % COLLECT_YIELD_EVERY === 0) {
        await yieldToEventLoop();
      }
    }

    const databases = await this.ctx.workspace.listDatabases();
    const bundles: Array<{ schema: DatabaseSchema; records: DatabaseRecord[] }> = [];
    for (const database of databases) {
      if (database.id === PAGES_DATABASE_ID) continue;
      const bundle = await this.ctx.workspace.getDatabase(database.id);
      if (bundle.schema.id === PAGES_DATABASE_ID) continue;
      bundles.push(bundle);
    }
    total = pages.length + bundles.reduce((sum, bundle) => sum + 1 + bundle.records.length, 0);
    if (bundles.length > 0) {
      onProgress?.({ current, total, message: `Collecting ${bundles.length} databases` });
    }

    for (const bundle of bundles) {
      const schema = bundle.schema;
      documents.push({
        id: `database:${schema.id}`,
        kind: "database",
        title: schema.name || "Untitled database",
        subtitle: ["Database", displayPath(schema.path)].filter(Boolean).join(" · "),
        text: databaseText(schema),
        icon: schema.icon,
        entityPath: displayPath(schema.path),
        databaseId: schema.id
      });
      current += 1;
      if (shouldReportProgress(current, total)) {
        onProgress?.({ current, total, message: `Collected database ${schema.name || schema.id}` });
      }
      for (const record of bundle.records) {
        const rowId = String(record.id ?? "");
        if (!rowId) continue;
        const title = rowTitle(record, schema);
        const rowPage = hasExistingRowPagePointer(record)
          ? await this.ctx.workspace.getRowPage(schema.id, rowId).catch(() => null)
          : null;
        documents.push({
          id: `rowPage:${schema.id}:${rowId}`,
          kind: "rowPage",
          title,
          subtitle: ["Page", schema.name].filter(Boolean).join(" · "),
          text: rowText(schema, record, rowPage?.markdown ?? ""),
          icon: stringValue(record.row_icon) || schema.icon,
          entityPath: displayPath([...(schema.path ?? [schema.name]), title]),
          databaseId: schema.id,
          rowId,
          pageFile: stringValue(record.page_file) || null
        });
        current += 1;
        if (shouldReportProgress(current, total)) {
          onProgress?.({ current, total, message: `Collected ${current}/${total} index documents` });
        }
        if (current % COLLECT_YIELD_EVERY === 0) {
          await yieldToEventLoop();
        }
      }
    }
    return documents;
  }

  private providerForConfig(config: AdvancedSearchConfig): AdvancedSearchEmbeddingProvider {
    if (config.provider === "local") return this.embeddingProvider;
    if (config.provider === "ollama") return this.ollamaProvider;
    return new OpenAICompatibleEmbeddingProvider();
  }

  private async readIndex(): Promise<AdvancedSearchIndexFile | undefined> {
    const value = await this.ctx.storage.readJson<AdvancedSearchIndexFile>(INDEX_FILE);
    return value ? normalizeIndex(value) : undefined;
  }

  private async writeIndex(value: AdvancedSearchIndexFile): Promise<void> {
    await this.ctx.storage.writeJson(INDEX_FILE, value);
  }

  private statusFromIndex(index?: AdvancedSearchIndexFile): AdvancedSearchStatus {
    if (!index) {
      return {
        status: "not_built",
        chunkCount: 0,
        documentCount: 0,
        provider: providerStatus(DEFAULT_CONFIG)
      };
    }
    return {
      status: index.status,
      updatedAt: index.updatedAt,
      staleReason: index.staleReason,
      error: index.error,
      chunkCount: index.chunks.length,
      documentCount: index.documents.length,
      provider: providerStatus(index.config)
    };
  }

  private statusFromTransient(
    documents: AdvancedSearchDocument[],
    chunks: IndexedChunk[],
    config: AdvancedSearchConfig,
    current?: AdvancedSearchIndexFile
  ): AdvancedSearchStatus {
    const provider = providerStatus(config);
    return {
      status: current?.status === "ready" || current?.status === "stale" ? current.status : "ready",
      updatedAt: current?.updatedAt,
      staleReason: current?.staleReason,
      error: current?.error,
      chunkCount: chunks.length,
      documentCount: documents.length,
      provider: {
        ...provider,
        message: "Transient local Q&A retrieval used deterministic embeddings and did not write a workspace index."
      }
    };
  }
}

export function chunkAdvancedSearchText(text: string, maxChars = MAX_CHARS_PER_CHUNK, overlapChars = CHUNK_OVERLAP_CHARS): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + maxChars, normalized.length);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf("\n\n", end),
        normalized.lastIndexOf("\n", end),
        normalized.lastIndexOf("。", end),
        normalized.lastIndexOf(".", end),
        normalized.lastIndexOf(" ", end)
      );
      if (boundary > start + maxChars * 0.55) end = boundary + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}

function materializeChunks(documents: AdvancedSearchDocument[]): ChunkDraft[] {
  const chunks: ChunkDraft[] = [];
  for (const document of documents) {
    const pieces = chunkAdvancedSearchText(document.text);
    pieces.forEach((text, index) => {
      const { text: _text, ...metadata } = document;
      chunks.push({
        ...metadata,
        chunkId: `${document.id}#${index + 1}`,
        text,
        textHash: hashText(text)
      });
    });
  }
  return chunks;
}

async function embedTextsInBatches(
  provider: AdvancedSearchEmbeddingProvider,
  texts: string[],
  config: AdvancedSearchConfig,
  onProgress?: (embedded: number) => void
): Promise<number[][]> {
  if (!texts.length) return [];
  const vectors: number[][] = [];
  for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
    vectors.push(...await provider.embed(batch, config));
    onProgress?.(Math.min(index + batch.length, texts.length));
    await yieldToEventLoop();
  }
  return vectors;
}

function shouldReportProgress(current: number, total: number): boolean {
  return current === total || current % COLLECT_YIELD_EVERY === 0;
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function hasExistingRowPagePointer(record: DatabaseRecord): boolean {
  return Boolean(stringValue(record.body_path) || stringValue(record.page_file));
}

function normalizeIndex(index: AdvancedSearchIndexFile): AdvancedSearchIndexFile {
  return {
    version: INDEX_VERSION,
    config: normalizeConfig(index.config),
    status: normalizeStatus(index.status),
    updatedAt: index.updatedAt,
    staleReason: index.staleReason,
    error: index.error,
    sourceHash: index.sourceHash,
    chunks: Array.isArray(index.chunks) ? index.chunks : [],
    documents: Array.isArray(index.documents) ? index.documents : []
  };
}

function normalizeConfig(input: Partial<AdvancedSearchConfig> | undefined): AdvancedSearchConfig {
  const provider = input?.provider === "openai-compatible"
    ? "openai-compatible"
    : input?.provider === "local"
      ? "local"
      : "ollama";
  const vectorStore = input?.vectorStore === "lancedb" ? "lancedb" : "json";
  const dimensions = Number.isFinite(input?.dimensions) && Number(input?.dimensions) > 0
    ? Math.floor(Number(input?.dimensions))
    : DEFAULT_DIMENSIONS;
  return {
    provider,
    baseUrl: input?.baseUrl?.trim() || (provider === "ollama" ? DEFAULT_OLLAMA_BASE_URL : undefined),
    model: input?.model?.trim() || (provider === "local" ? "local-hash-v1" : provider === "ollama" ? DEFAULT_OLLAMA_EMBEDDING_MODEL : undefined),
    apiKey: input?.apiKey?.trim(),
    dimensions,
    vectorStore
  };
}

function normalizeStatus(value: unknown): AdvancedSearchIndexStatusValue {
  return value === "ready" || value === "indexing" || value === "stale" || value === "error" ? value : "not_built";
}

function providerStatus(config: AdvancedSearchConfig): AdvancedSearchProviderStatus {
  if (config.provider === "local") {
    return {
      provider: "local",
      model: config.model,
      available: true,
      vectorStore: config.vectorStore ?? "json",
      message: "Deterministic local fallback embeddings are stored only in this workspace."
    };
  }
  if (config.provider === "ollama") {
    const model = config.model || DEFAULT_OLLAMA_EMBEDDING_MODEL;
    return {
      provider: "ollama",
      baseUrl: config.baseUrl || DEFAULT_OLLAMA_BASE_URL,
      model,
      available: true,
      setupCommand: `ollama pull ${model}`,
      vectorStore: config.vectorStore ?? "json",
      message: `Qwen3 local semantic index uses Ollama on this device. If it is not ready, run: ollama pull ${model}`
    };
  }
  const configured = Boolean(config.baseUrl && config.model && config.apiKey);
  return {
    provider: "openai-compatible",
    baseUrl: config.baseUrl,
    model: config.model,
    available: configured,
    vectorStore: config.vectorStore ?? "json",
    message: configured
      ? "External embeddings are configured and only run when you rebuild the index."
      : "Configure a compatible /embeddings provider before rebuilding. Cloud embeddings never run automatically."
  };
}

function databaseText(schema: DatabaseSchema): string {
  const fields = schema.fields
    .filter((field) => !field.hidden)
    .map((field) => `${field.name} ${field.type}`)
    .join("\n");
  return [schema.name, displayPath(schema.path), fields].filter(Boolean).join("\n\n");
}

function rowText(schema: DatabaseSchema, record: DatabaseRecord, markdown: string): string {
  const fields = schema.fields
    .filter((field) => !field.hidden && !IGNORED_ROW_FIELDS.has(field.id))
    .map((field) => `${field.name}: ${valueForSearch(record[field.id])}`)
    .filter((line) => !line.endsWith(": "));
  return [rowTitle(record, schema), schema.name, displayPath(schema.path), fields.join("\n"), markdown]
    .filter(Boolean)
    .join("\n\n");
}

function rowTitle(record: DatabaseRecord, schema: DatabaseSchema): string {
  const titleField = schema.fields.find((field) => field.id === "title")
    ?? schema.fields.find((field) => field.name.toLowerCase() === "name");
  return stringValue(titleField ? record[titleField.id] : undefined) || stringValue(record.name) || "Untitled";
}

function valueForSearch(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function displayPath(path?: string[]): string {
  return (path ?? []).filter(Boolean).join(" / ");
}

async function importLanceDb(): Promise<{ connect: (directory: string) => Promise<LanceDbConnection> }> {
  const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{
    connect: (directory: string) => Promise<LanceDbConnection>;
  }>;
  return importer("@lancedb/lancedb");
}

function chunkToLanceRow(chunk: IndexedChunk): Record<string, unknown> {
  return {
    chunkId: chunk.chunkId,
    text: chunk.text,
    textHash: chunk.textHash,
    vector: chunk.vector,
    id: chunk.id,
    kind: chunk.kind,
    title: chunk.title,
    subtitle: chunk.subtitle,
    icon: chunk.icon ?? "",
    entityPath: chunk.entityPath ?? "",
    pageId: chunk.pageId ?? "",
    databaseId: chunk.databaseId ?? "",
    rowId: chunk.rowId ?? "",
    pageFile: chunk.pageFile ?? ""
  };
}

function lanceRowToChunk(row: Record<string, unknown>): IndexedChunk {
  const kind = row.kind === "database" || row.kind === "rowPage" ? row.kind : "page";
  const vectorValue = row.vector;
  const vector = Array.isArray(vectorValue)
    ? vectorValue.map(Number)
    : vectorValue && typeof vectorValue === "object" && Symbol.iterator in vectorValue
      ? Array.from(vectorValue as Iterable<unknown>).map(Number)
      : [];
  return {
    chunkId: stringValue(row.chunkId),
    text: stringValue(row.text),
    textHash: stringValue(row.textHash),
    vector,
    id: stringValue(row.id),
    kind,
    title: stringValue(row.title) || "Untitled",
    subtitle: stringValue(row.subtitle),
    icon: stringValue(row.icon) || undefined,
    entityPath: stringValue(row.entityPath) || undefined,
    pageId: stringValue(row.pageId) || undefined,
    databaseId: stringValue(row.databaseId) || undefined,
    rowId: stringValue(row.rowId) || undefined,
    pageFile: stringValue(row.pageFile) || null
  };
}

function rankChunks(chunks: IndexedChunk[], query: string, queryVector: number[], limit: number): AdvancedSearchHit[] {
  const tokens = tokenize(query);
  const ranked = chunks
    .map((chunk) => {
      const scores = scoreChunk(chunk, queryVector, tokens);
      return { chunk, ...scores };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.lexicalScore - a.lexicalScore || a.chunk.title.localeCompare(b.chunk.title));
  return dedupeRankedChunks(ranked, query, tokens, limit);
}

function dedupeRankedChunks(
  ranked: Array<{ chunk: IndexedChunk } & ReturnType<typeof scoreChunk>>,
  query: string,
  tokens: string[],
  limit: number
): AdvancedSearchHit[] {
  const seen = new Set<string>();
  const hits: AdvancedSearchHit[] = [];
  for (const entry of ranked) {
    const key = `${entry.chunk.kind}:${entry.chunk.pageId ?? entry.chunk.databaseId ?? ""}:${entry.chunk.rowId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(chunkToHit(entry.chunk, query, tokens, entry));
    if (hits.length >= limit) break;
  }
  return hits;
}

function scoreChunk(chunk: IndexedChunk, queryVector: number[], queryTokens: string[]) {
  const semanticScore = Math.max(0, cosineSimilarity(queryVector, chunk.vector));
  const lexicalScore = lexicalMatchScore(chunk, queryTokens);
  const score = semanticScore * 0.7 + lexicalScore * 0.3;
  return { semanticScore, lexicalScore, score };
}

function lexicalMatchScore(chunk: IndexedChunk, queryTokens: string[]): number {
  if (!queryTokens.length) return 0;
  const title = chunk.title.toLowerCase();
  const text = chunk.text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (title.includes(token)) score += 1.7;
    if (text.includes(token)) score += 1;
  }
  return Math.min(1, score / Math.max(queryTokens.length * 1.6, 1));
}

function chunkToHit(chunk: IndexedChunk, query: string, queryTokens: string[], scores: ReturnType<typeof scoreChunk>): AdvancedSearchHit {
  const source = scores.semanticScore > 0.72 && scores.lexicalScore > 0.08
    ? "hybrid"
    : scores.lexicalScore >= scores.semanticScore
      ? "lexical"
      : "semantic";
  return {
    kind: chunk.kind,
    title: chunk.title,
    subtitle: chunk.subtitle,
    snippet: makeSnippet(chunk.text, queryTokens),
    explanation: source === "hybrid"
      ? `Semantic + lexical match for "${query}"`
      : source === "lexical"
        ? `Text match for "${query}"`
        : `Semantic match for "${query}"`,
    score: roundScore(scores.score),
    semanticScore: roundScore(scores.semanticScore),
    lexicalScore: roundScore(scores.lexicalScore),
    source,
    icon: chunk.icon,
    entityPath: chunk.entityPath,
    pageId: chunk.pageId,
    databaseId: chunk.databaseId,
    rowId: chunk.rowId,
    pageFile: chunk.pageFile,
    chunkId: chunk.chunkId
  };
}

function makeSnippet(text: string, queryTokens: string[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  const hitIndex = queryTokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, hitIndex - 70);
  const end = Math.min(normalized.length, hitIndex + 180);
  return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${end < normalized.length ? "..." : ""}`;
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.match(/[\p{L}\p{N}_-]+/gu) ?? [];
  const cjk = lower.match(/[\p{Script=Han}]/gu) ?? [];
  return Array.from(new Set([...words, ...cjk].filter(Boolean)));
}

function hashTextVector(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(text)) {
    const hash = fnv1a(`${token}:${token.length}`);
    const index = hash % dimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    const weight = Math.min(2.5, 1 + Math.log2(token.length + 1) / 4);
    vector[index] += sign * weight;
  }
  return vector;
}

function normalizeVector(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm ? vector.map((value) => value / norm) : vector.map(() => 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += a[i] * b[i];
  return sum;
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hashStableJson(value: unknown): string {
  return hashText(JSON.stringify(value));
}

function hashText(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 200) {
    result += fnv1a(value.slice(index, index + 200)).toString(16).padStart(8, "0");
  }
  return result || "00000000";
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
