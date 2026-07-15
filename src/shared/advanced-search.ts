import type { ID } from "./types.js";

export type AdvancedSearchProviderKind = "local" | "ollama" | "openai-compatible";
export type AdvancedSearchVectorStoreKind = "json" | "lancedb";

export interface AdvancedSearchConfig {
  provider: AdvancedSearchProviderKind;
  baseUrl?: string;
  model?: string;
  /** Stored in the plugin's workspace-scoped settings. External providers
   *  are never used unless the user explicitly rebuilds the index. */
  apiKey?: string;
  dimensions?: number;
  vectorStore?: AdvancedSearchVectorStoreKind;
}

export type AdvancedSearchIndexStatusValue = "not_built" | "ready" | "indexing" | "stale" | "error";

export interface AdvancedSearchProviderStatus {
  provider: AdvancedSearchProviderKind;
  baseUrl?: string;
  model?: string;
  available: boolean;
  message?: string;
  setupCommand?: string;
  vectorStore?: AdvancedSearchVectorStoreKind;
}

export interface AdvancedSearchStatus {
  status: AdvancedSearchIndexStatusValue;
  updatedAt?: string;
  staleReason?: string;
  error?: string;
  chunkCount: number;
  documentCount: number;
  provider: AdvancedSearchProviderStatus;
}

export interface AdvancedSearchRebuildProgress {
  phase: "collecting" | "embedding" | "writing" | "done" | "error";
  current: number;
  total: number;
  message?: string;
}

export type AdvancedSearchHitKind = "page" | "database" | "rowPage";

export interface AdvancedSearchHit {
  kind: AdvancedSearchHitKind;
  title: string;
  subtitle: string;
  snippet: string;
  explanation: string;
  score: number;
  semanticScore: number;
  lexicalScore: number;
  source: "semantic" | "lexical" | "hybrid";
  icon?: string;
  entityPath?: string;
  pageId?: ID;
  databaseId?: ID;
  rowId?: ID;
  pageFile?: string | null;
  chunkId: string;
}

export interface AdvancedSearchResult {
  hits: AdvancedSearchHit[];
  status: AdvancedSearchStatus;
  query: string;
}

export interface AdvancedSearchRebuildResult {
  status: AdvancedSearchStatus;
  indexedAt: string;
}
