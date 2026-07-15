#!/usr/bin/env node
import { mkdtemp, rm, stat, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  AdvancedSearchPluginService,
  LanceDbVectorIndexAdapter,
  LocalHashEmbeddingProvider
} from "../dist-electron/builtin-plugins/advanced-search/service.js";

const CHECK_MODE = process.argv.includes("--check");
const TARGET_CHUNKS = Number(process.env.LOTION_ADVANCED_SEARCH_BENCH_CHUNKS || 10_000);

class MemoryPluginStorage {
  constructor() {
    this.json = new Map();
  }

  async readJson(fileName) {
    return this.json.get(fileName) ?? null;
  }

  async writeJson(fileName, value) {
    this.json.set(fileName, JSON.parse(JSON.stringify(value)));
  }
}

const root = await mkdtemp(join(tmpdir(), "lotion-advanced-search-bench-"));
try {
  const workspace = createBenchmarkWorkspace(TARGET_CHUNKS);
  const storage = new MemoryPluginStorage();
  const jsonService = new AdvancedSearchPluginService(
    { workspace, storage },
    {
      embeddingProvider: new LocalHashEmbeddingProvider(),
      now: () => new Date("2026-06-15T00:00:00.000Z")
    }
  );

  const memoryBefore = process.memoryUsage().rss;
  const jsonRebuildStart = performance.now();
  const jsonRebuild = await jsonService.rebuild({ config: { provider: "local", model: "local-hash-v1", vectorStore: "json" } });
  const jsonRebuildMs = performance.now() - jsonRebuildStart;
  const jsonQueryStart = performance.now();
  const jsonQuery = await jsonService.query("semantic benchmark retention");
  const jsonQueryMs = performance.now() - jsonQueryStart;
  const jsonIndex = await storage.readJson("advanced-search-index.json");
  const jsonIndexSizeBytes = Buffer.byteLength(JSON.stringify(jsonIndex), "utf8");

  const lanceDir = join(root, "lancedb");
  const lanceStorage = new MemoryPluginStorage();
  const lanceAdapter = new LanceDbVectorIndexAdapter({ directory: lanceDir });
  const lanceService = new AdvancedSearchPluginService(
    { workspace, storage: lanceStorage },
    {
      embeddingProvider: new LocalHashEmbeddingProvider(),
      vectorIndexAdapter: lanceAdapter,
      now: () => new Date("2026-06-15T00:00:00.000Z")
    }
  );
  const lanceRebuildStart = performance.now();
  const lanceRebuild = await lanceService.rebuild({ config: { provider: "local", model: "local-hash-v1", vectorStore: "lancedb" } });
  const lanceRebuildMs = performance.now() - lanceRebuildStart;
  const lanceQueryStart = performance.now();
  const lanceQuery = await lanceService.query("semantic benchmark retention");
  const lanceQueryMs = performance.now() - lanceQueryStart;
  const lanceStats = await lanceAdapter.stats();
  const memoryAfter = process.memoryUsage().rss;
  const lanceIndexSizeBytes = await directorySize(lanceDir);

  const result = {
    chunkTarget: TARGET_CHUNKS,
    json: {
      chunkCount: jsonRebuild.status.chunkCount,
      documentCount: jsonRebuild.status.documentCount,
      rebuildMs: Math.round(jsonRebuildMs),
      queryMs: Math.round(jsonQueryMs),
      resultCount: jsonQuery.hits.length,
      indexSizeBytes: jsonIndexSizeBytes
    },
    lancedb: {
      chunkCount: lanceRebuild.status.chunkCount,
      adapterChunkCount: lanceStats.chunkCount,
      documentCount: lanceRebuild.status.documentCount,
      rebuildMs: Math.round(lanceRebuildMs),
      queryMs: Math.round(lanceQueryMs),
      resultCount: lanceQuery.hits.length,
      indexSizeBytes: lanceIndexSizeBytes
    },
    memory: {
      rssBeforeBytes: memoryBefore,
      rssAfterBytes: memoryAfter,
      rssDeltaBytes: memoryAfter - memoryBefore
    }
  };
  console.log(JSON.stringify(result, null, 2));

  if (CHECK_MODE) {
    assertBench(result.json.chunkCount >= TARGET_CHUNKS, `expected at least ${TARGET_CHUNKS} JSON chunks`);
    assertBench(result.lancedb.chunkCount >= TARGET_CHUNKS, `expected at least ${TARGET_CHUNKS} LanceDB chunks`);
    assertBench(result.lancedb.adapterChunkCount === result.lancedb.chunkCount, "LanceDB adapter chunk count must match service status");
    assertBench(result.json.resultCount > 0, "JSON benchmark query should return results");
    assertBench(result.lancedb.resultCount > 0, "LanceDB benchmark query should return results");
    assertBench(result.json.rebuildMs < 120_000, `JSON rebuild too slow: ${result.json.rebuildMs}ms`);
    assertBench(result.lancedb.rebuildMs < 120_000, `LanceDB rebuild too slow: ${result.lancedb.rebuildMs}ms`);
    assertBench(result.json.queryMs < 2_000, `JSON query too slow: ${result.json.queryMs}ms`);
    assertBench(result.lancedb.queryMs < 2_000, `LanceDB query too slow: ${result.lancedb.queryMs}ms`);
    assertBench(result.memory.rssDeltaBytes < 768 * 1024 * 1024, `advanced search benchmark used too much memory: ${result.memory.rssDeltaBytes}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function createBenchmarkWorkspace(targetChunks) {
  const pages = new Map();
  const pageCount = Math.ceil(targetChunks / 12);
  const paragraph = [
    "semantic benchmark retention complaints customer feedback vector query search",
    "中文 语义 搜索 工作区 页面 数据库 行页面 混合 排序 结果",
    "code snippet const result = advancedSearch.query(input) with metadata citations"
  ].join(" ");
  for (let index = 0; index < pageCount; index += 1) {
    const id = `pg_bench_${index}`;
    const title = `Benchmark Page ${index}`;
    pages.set(id, {
      meta: {
        id,
        title,
        path: ["Bench", title],
        created_time: "2026-06-15T00:00:00.000Z",
        updated_time: "2026-06-15T00:00:00.000Z"
      },
      markdown: Array.from({ length: 90 }, (_, paragraphIndex) => `${paragraph} ${index}:${paragraphIndex}`).join("\n\n")
    });
  }
  return {
    async listPages() {
      return Array.from(pages.values()).map((page) => page.meta);
    },
    async getPage(id) {
      const page = pages.get(id);
      if (!page) throw new Error(`Missing page ${id}`);
      return page;
    },
    async listDatabases() {
      return [];
    },
    async getDatabase(id) {
      throw new Error(`Missing database ${id}`);
    },
    async getRowPage(databaseId, rowId) {
      throw new Error(`Missing row page ${databaseId}:${rowId}`);
    }
  };
}

async function directorySize(path) {
  const info = await stat(path).catch(() => null);
  if (!info) return 0;
  if (info.isFile()) return info.size;
  if (!info.isDirectory()) return 0;
  const entries = await readdir(path);
  let size = 0;
  for (const entry of entries) size += await directorySize(join(path, entry));
  return size;
}

function assertBench(condition, message) {
  if (!condition) throw new Error(message);
}
