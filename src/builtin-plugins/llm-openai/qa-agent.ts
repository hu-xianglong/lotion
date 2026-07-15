import type { AdvancedSearchHit } from "../../shared/advanced-search.js";
import type { EntityRef } from "../../shared/types.js";
import type { PluginContext } from "../../shared/plugin-api.js";
import {
  AdvancedSearchPluginService,
  LocalHashEmbeddingProvider
} from "../advanced-search/service.js";

export interface QASourceCitation {
  id: string;
  kind: AdvancedSearchHit["kind"];
  title: string;
  subtitle: string;
  snippet: string;
  score: number;
  source: AdvancedSearchHit["source"];
  entityPath?: string;
  pageId?: string;
  databaseId?: string;
  rowId?: string;
  pageFile?: string | null;
  chunkId: string;
}

export interface WorkspaceQAContext {
  citations: QASourceCitation[];
  system: string;
  status: "ready" | "low_evidence" | "unavailable";
  note: string;
}

export interface WorkspaceQABuildOptions {
  limit?: number;
  service?: Pick<AdvancedSearchPluginService, "queryTransient">;
}

type WorkspaceQAPluginContext = Pick<PluginContext, "workspace" | "storage">;

export async function buildWorkspaceQAContext(
  ctx: WorkspaceQAPluginContext,
  question: string,
  options: WorkspaceQABuildOptions = {}
): Promise<WorkspaceQAContext> {
  const limit = Math.max(1, Math.min(8, Math.round(options.limit ?? 5)));
  const service = options.service ?? new AdvancedSearchPluginService(ctx, {
    embeddingProvider: new LocalHashEmbeddingProvider()
  });
  try {
    const result = await service.queryTransient(question, {
      limit,
      config: {
        provider: "local",
        model: "local-hash-v1",
        vectorStore: "json"
      }
    });
    const citations = result.hits.slice(0, limit).map(normalizeAdvancedSearchCitation);
    if (citations.length === 0) {
      return {
        citations,
        status: "low_evidence",
        note: "No local sources matched this question strongly.",
        system: sourceGroundingSystem(citations, "No local sources matched this question strongly.")
      };
    }
    const topScore = citations[0]?.score ?? 0;
    const status = topScore >= 0.22 ? "ready" : "low_evidence";
    const note = status === "ready"
      ? `${citations.length} local sources selected.`
      : "Only weak local source matches were found.";
    return {
      citations,
      status,
      note,
      system: sourceGroundingSystem(citations, note)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      citations: [],
      status: "unavailable",
      note: message,
      system: sourceGroundingSystem([], `Local Q&A retrieval failed: ${message}`)
    };
  }
}

export function normalizeAdvancedSearchCitation(hit: AdvancedSearchHit, index: number): QASourceCitation {
  return {
    id: `S${index + 1}`,
    kind: hit.kind,
    title: hit.title || "Untitled",
    subtitle: hit.subtitle || sourceKindLabel(hit.kind),
    snippet: hit.snippet || "",
    score: hit.score,
    source: hit.source,
    entityPath: hit.entityPath,
    pageId: hit.pageId,
    databaseId: hit.databaseId,
    rowId: hit.rowId,
    pageFile: hit.pageFile,
    chunkId: hit.chunkId
  };
}

export function citationToEntityRef(citation: QASourceCitation): EntityRef | null {
  if (citation.kind === "database" && citation.databaseId) {
    return {
      kind: "database",
      entityId: citation.databaseId,
      titleSnapshot: citation.title,
      pathSnapshot: splitPath(citation.entityPath)
    };
  }
  if (citation.kind === "rowPage" && citation.databaseId && citation.rowId) {
    return {
      kind: "row",
      entityId: citation.rowId,
      databaseId: citation.databaseId,
      rowId: citation.rowId,
      titleSnapshot: citation.title,
      pathSnapshot: splitPath(citation.entityPath)
    };
  }
  if (citation.pageId) {
    return {
      kind: "page",
      entityId: citation.pageId,
      titleSnapshot: citation.title,
      pathSnapshot: splitPath(citation.entityPath)
    };
  }
  return null;
}

function sourceGroundingSystem(citations: QASourceCitation[], note: string): string {
  const sourceLines = citations.map((citation) => [
    `[${citation.id}] ${sourceKindLabel(citation.kind)}: ${citation.title}`,
    citation.entityPath ? `Path: ${citation.entityPath}` : "",
    citation.subtitle ? `Context: ${citation.subtitle}` : "",
    `Score: ${citation.score.toFixed(3)} (${citation.source})`,
    citation.snippet ? `Snippet: ${citation.snippet}` : ""
  ].filter(Boolean).join("\n"));
  return [
    "Local workspace Q&A mode:",
    "Answer only from the local source excerpts below unless the user explicitly asks for general knowledge.",
    "Cite supporting sources inline using [S1], [S2], etc. Do not invent citations.",
    "If the evidence is weak, missing, or ambiguous, say that clearly before offering the closest sources.",
    "Page history citations are not available until the GitHub/page-history task ships.",
    `Retrieval note: ${note}`,
    sourceLines.length ? ["Sources:", ...sourceLines].join("\n\n") : "Sources: none"
  ].join("\n");
}

function sourceKindLabel(kind: AdvancedSearchHit["kind"]): string {
  if (kind === "database") return "Database";
  if (kind === "rowPage") return "Row page";
  return "Page";
}

function splitPath(value?: string): string[] | undefined {
  const parts = value?.split(" / ").map((part) => part.trim()).filter(Boolean) ?? [];
  return parts.length ? parts : undefined;
}
