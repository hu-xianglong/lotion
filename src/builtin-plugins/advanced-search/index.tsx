import { useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Disposable, PluginContext, PluginManifest } from "../../shared/plugin-api.js";
import type {
  AdvancedSearchConfig,
  AdvancedSearchHit,
  AdvancedSearchRebuildProgress,
  AdvancedSearchStatus
} from "../../shared/advanced-search.js";
import { AdvancedSearchPluginService } from "./service.js";

export const manifest: PluginManifest = {
  id: "advanced-search",
  name: "Advanced Search",
  version: "0.0.1",
  description: "Workspace-local semantic index and advanced search.",
  permissions: ["workspace.read", "network"]
};

export function installAdvancedSearch(ctx: PluginContext): Disposable {
  const service = new AdvancedSearchPluginService(ctx);
  const disposables: Disposable[] = [
    ctx.search.register({
      type: "advanced-search.local",
      search: async (query, options) => {
        const result = await service.query(query);
        return result.hits.slice(0, options?.limit ?? 20).map((hit) => ({
          type: hit.kind === "database" ? "database" : hit.kind === "page" ? "page" : "row",
          id: hit.pageId ?? hit.databaseId ?? hit.rowId ?? hit.chunkId,
          title: hit.title,
          preview: hit.snippet,
          score: hit.score
        }));
      }
    }),
    ctx.sidebar.register({
      id: "advanced-search.open",
      title: "Advanced Search",
      icon: "⌕",
      order: 880,
      onClick: () => {
        void openAdvancedSearch(ctx);
      }
    }),
    ctx.commands.register({
      id: "advanced-search.open",
      title: "Open Advanced Search",
      category: "Search",
      run: () => {
        void openAdvancedSearch(ctx);
      }
    }),
    ctx.settingsTabs.register({
      id: "advanced-search.settings",
      title: "Advanced Search",
      render: (el) => renderAdvancedSearchSettings(el, ctx)
    })
  ];
  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    }
  };
}

function openAdvancedSearch(ctx: PluginContext): Promise<unknown | null> {
  return ctx.ui.modal({
    title: "Advanced Search",
    width: 860,
    render: (el, resolve) => {
      const root = createRoot(el);
      root.render(<AdvancedSearchPanel ctx={ctx} onClose={() => {
        root.unmount();
        resolve(null);
      }} />);
    }
  });
}

type AdvancedSearchRootEntry = {
  disposeTimer: number | undefined;
  root: Root;
  version: number;
};

const advancedSearchRoots = new WeakMap<HTMLElement, AdvancedSearchRootEntry>();

function renderAdvancedSearchSettings(el: HTMLElement, ctx: PluginContext): Disposable {
  const entry = advancedSearchRootEntryFor(el);
  entry.version += 1;
  if (entry.disposeTimer !== undefined) {
    window.clearTimeout(entry.disposeTimer);
    entry.disposeTimer = undefined;
  }
  const renderVersion = entry.version;
  entry.root.render(<AdvancedSearchPanel ctx={ctx} embedded />);
  return {
    dispose: () => {
      const current = advancedSearchRoots.get(el);
      if (!current || current.version !== renderVersion || current.disposeTimer !== undefined) return;
      current.disposeTimer = window.setTimeout(() => {
        const latest = advancedSearchRoots.get(el);
        if (!latest || latest.version !== renderVersion) return;
        latest.root.unmount();
        advancedSearchRoots.delete(el);
      }, 0);
    }
  };
}

function advancedSearchRootEntryFor(el: HTMLElement): AdvancedSearchRootEntry {
  const existing = advancedSearchRoots.get(el);
  if (existing) return existing;
  const entry: AdvancedSearchRootEntry = {
    disposeTimer: undefined,
    root: createRoot(el),
    version: 0
  };
  advancedSearchRoots.set(el, entry);
  return entry;
}

export function AdvancedSearchPanel({ ctx, embedded = false, onClose }: {
  ctx: PluginContext;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const service = useMemo(() => new AdvancedSearchPluginService(ctx), [ctx]);
  const [status, setStatus] = useState<AdvancedSearchStatus | undefined>();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<AdvancedSearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rebuildProgress, setRebuildProgress] = useState<AdvancedSearchRebuildProgress | null>(null);
  const [rebuildElapsedMs, setRebuildElapsedMs] = useState(0);
  const [config, setConfig] = useState<AdvancedSearchConfig>({
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3-embedding:0.6b",
    dimensions: 96,
    vectorStore: "json"
  });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    service.status().then((next) => {
      if (cancelled) return;
      setStatus(next);
      setConfig({
        provider: next.provider.provider,
        baseUrl: next.provider.baseUrl,
        model: next.provider.model || (next.provider.provider === "local" ? "local-hash-v1" : "qwen3-embedding:0.6b"),
        dimensions: 96,
        vectorStore: next.provider.vectorStore ?? "json"
      });
    }).catch((error) => {
      if (!cancelled) setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [service]);

  async function saveConfig() {
    setBusy(true);
    setRebuildProgress(null);
    try {
      setStatus(await service.configure(config));
      setMessage("Settings saved. Rebuild the index when ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function rebuild() {
    if (config.provider === "openai-compatible" && (!config.baseUrl?.trim() || !config.model?.trim() || !config.apiKey?.trim())) {
      const error = "External embeddings require base URL, model, and API key.";
      setRebuildElapsedMs(0);
      setRebuildProgress({
        phase: "error",
        current: 0,
        total: 1,
        message: error
      });
      setStatus((current) => ({
        status: "error",
        error,
        chunkCount: current?.chunkCount ?? 0,
        documentCount: current?.documentCount ?? 0,
        provider: {
          provider: "openai-compatible",
          baseUrl: config.baseUrl,
          model: config.model,
          available: false,
          vectorStore: config.vectorStore ?? "json",
          message: "Configure a compatible /embeddings provider before rebuilding. Cloud embeddings never run automatically."
        }
      }));
      setMessage(error);
      return;
    }
    setBusy(true);
    setHits([]);
    setMessage("Preparing local index...");
    const startedAt = performance.now();
    setRebuildElapsedMs(0);
    setRebuildProgress({
      phase: "collecting",
      current: 0,
      total: 1,
      message: "Collecting workspace content"
    });
    setStatus((current) => ({
      status: "indexing",
      chunkCount: current?.chunkCount ?? 0,
      documentCount: current?.documentCount ?? 0,
      provider: {
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        available: current?.provider.available ?? true,
        message: current?.provider.message,
        setupCommand: current?.provider.setupCommand,
        vectorStore: config.vectorStore ?? "json"
      }
    }));
    try {
      const result = await service.rebuild({
        config,
        onProgress: (progress) => {
          setRebuildProgress(progress);
          setRebuildElapsedMs(Math.max(0, Math.round(performance.now() - startedAt)));
          setMessage(progress.message || `${progress.phase} ${progress.current}/${progress.total}`);
        }
      });
      setStatus(result.status);
      setRebuildProgress({
        phase: "done",
        current: result.status.chunkCount,
        total: Math.max(result.status.chunkCount, 1),
        message: `Indexed ${result.status.chunkCount} chunks from ${result.status.documentCount} items.`
      });
      setRebuildElapsedMs(Math.max(0, Math.round(performance.now() - startedAt)));
      setMessage(`Indexed ${result.status.chunkCount} chunks from ${result.status.documentCount} items.`);
      if (query.trim()) await runSearch(query);
    } catch (error) {
      const next = await service.status().catch(() => undefined);
      if (next) setStatus(next);
      const errorMessage = error instanceof Error ? error.message : String(error);
      setRebuildProgress({
        phase: "error",
        current: rebuildProgress?.current ?? 0,
        total: rebuildProgress?.total ?? 1,
        message: errorMessage
      });
      setRebuildElapsedMs(Math.max(0, Math.round(performance.now() - startedAt)));
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  async function runSearch(nextQuery = query) {
    const trimmed = nextQuery.trim();
    setQuery(nextQuery);
    setActiveIndex(0);
    if (!trimmed) {
      setHits([]);
      return;
    }
    setBusy(true);
    try {
      const result = await service.query(trimmed);
      setStatus(result.status);
      setHits(result.hits);
      setMessage(result.hits.length ? `${result.hits.length} results` : "No semantic results yet.");
    } catch (error) {
      const next = await service.status().catch(() => undefined);
      if (next) setStatus(next);
      setHits([]);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function openHit(hit: AdvancedSearchHit) {
    if (hit.kind === "database" && hit.databaseId) {
      ctx.ui.openEntity({ kind: "database", entityId: hit.databaseId, titleSnapshot: hit.title });
    } else if (hit.kind === "rowPage" && hit.databaseId && hit.rowId) {
      ctx.ui.openEntity({ kind: "row", entityId: hit.rowId, databaseId: hit.databaseId, rowId: hit.rowId, titleSnapshot: hit.title });
    } else if (hit.pageId) {
      ctx.ui.openEntity({ kind: "page", entityId: hit.pageId, titleSnapshot: hit.title });
    }
    onClose?.();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (hits[activeIndex]) openHit(hits[activeIndex]);
      else void runSearch();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    }
  }

  return (
    <div className={embedded ? "advanced-search-panel embedded" : "advanced-search-panel"} data-testid="advanced-search-panel">
      <div className="advanced-search-hero">
        <div>
          <h3>Advanced Search</h3>
          <p>Manual, workspace-local semantic indexing. Qwen3 via Ollama keeps content on this device.</p>
        </div>
        <span className={`advanced-search-status ${status?.status ?? "not_built"}`}>{statusLabel(status)}</span>
      </div>

      <div className="advanced-search-controls">
        <label>
          <span>Provider</span>
          <select
            value={config.provider}
            onChange={(event) => setConfig({
              ...config,
              provider: event.currentTarget.value === "openai-compatible"
                ? "openai-compatible"
                : event.currentTarget.value === "local"
                  ? "local"
                  : "ollama",
              baseUrl: event.currentTarget.value === "ollama" ? (config.baseUrl || "http://127.0.0.1:11434") : config.baseUrl,
              model: event.currentTarget.value === "ollama"
                ? (config.model === "local-hash-v1" ? "qwen3-embedding:0.6b" : config.model || "qwen3-embedding:0.6b")
                : event.currentTarget.value === "local"
                  ? "local-hash-v1"
                  : config.model
            })}
          >
            <option value="ollama">Qwen3 local semantic index</option>
            <option value="local">Deterministic fallback</option>
            <option value="openai-compatible">OpenAI-compatible embeddings</option>
          </select>
        </label>
        <label>
          <span>Base URL</span>
          <input
            value={config.baseUrl ?? ""}
            placeholder={config.provider === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"}
            disabled={config.provider === "local"}
            onChange={(event) => setConfig({ ...config, baseUrl: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>Model</span>
          <input
            value={config.model ?? ""}
            placeholder={config.provider === "ollama" ? "qwen3-embedding:0.6b" : config.provider === "local" ? "local-hash-v1" : "embedding-model"}
            onChange={(event) => setConfig({ ...config, model: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>API key</span>
          <input
            value={config.apiKey ?? ""}
            type="password"
            disabled={config.provider !== "openai-compatible"}
            onChange={(event) => setConfig({ ...config, apiKey: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>Vector store</span>
          <select
            value={config.vectorStore ?? "json"}
            onChange={(event) => setConfig({
              ...config,
              vectorStore: event.currentTarget.value === "lancedb" ? "lancedb" : "json"
            })}
          >
            <option value="json">Local JSON fallback</option>
            <option value="lancedb">LanceDB adapter</option>
          </select>
        </label>
      </div>

      <div className="advanced-search-note">
        {status?.provider.message || "Qwen3 local semantic index uses Ollama on this device. Cloud embeddings require explicit configuration."}
      </div>

      {rebuildProgress && (
        <AdvancedSearchProgressCard
          config={config}
          elapsedMs={rebuildElapsedMs}
          progress={rebuildProgress}
        />
      )}

      <div className="advanced-search-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => void saveConfig()}>Save settings</button>
        <button type="button" disabled={busy} onClick={() => void rebuild()}>
          {busy ? "Working..." : status?.status === "stale" ? "Update index" : "Rebuild index"}
        </button>
      </div>

      <div className="advanced-search-query-row">
        <input
          autoFocus={!embedded}
          aria-label="Advanced search query"
          value={query}
          placeholder="Ask semantically across pages, databases, and row pages..."
          onChange={(event) => void runSearch(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>

      <div className="advanced-search-meta" role="status">
        {busy ? "Indexing/searching..." : message || statusSummary(status)}
      </div>

      <div className="advanced-search-results" role="listbox" aria-label="Advanced search results">
        {hits.map((hit, index) => (
          <button
            key={hit.chunkId}
            type="button"
            className={index === activeIndex ? "advanced-search-hit active" : "advanced-search-hit"}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => openHit(hit)}
          >
            <div className="advanced-search-hit-main">
              <span className="advanced-search-source">{sourceLabel(hit)}</span>
              <span className="advanced-search-hit-title">{hit.title}</span>
              <span className="advanced-search-score">{hit.score.toFixed(3)}</span>
            </div>
            <div className="advanced-search-hit-subtitle">{hit.subtitle}</div>
            <div className="advanced-search-hit-snippet">{hit.snippet}</div>
            <div className="advanced-search-hit-explanation">{hit.explanation}</div>
          </button>
        ))}
        {!busy && query.trim() && hits.length === 0 && (
          <div className="advanced-search-empty">No results. Rebuild the index or try a different query.</div>
        )}
      </div>
    </div>
  );
}

export function AdvancedSearchProgressCard({
  config,
  elapsedMs,
  progress
}: {
  config: AdvancedSearchConfig;
  elapsedMs: number;
  progress: AdvancedSearchRebuildProgress;
}) {
  const total = Math.max(progress.total, 0);
  const current = Math.max(progress.current, 0);
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : null;
  return (
    <div
      className={`advanced-search-progress ${progress.phase}`}
      data-testid="advanced-search-progress"
      data-phase={progress.phase}
      data-current={current}
      data-total={total}
      data-percent={percent ?? ""}
    >
      <div className="advanced-search-progress-head">
        <span>{progressPhaseLabel(progress.phase)}</span>
        <strong>{percent === null ? "Working" : `${percent}%`}</strong>
      </div>
      <div className="advanced-search-progress-bar" aria-hidden="true">
        <span style={{ width: `${percent ?? 24}%` }} />
      </div>
      <div className="advanced-search-progress-copy">
        <span>{progress.message || `${progress.phase} ${current}/${total}`}</span>
        <span>{formatElapsed(elapsedMs)}</span>
      </div>
      <div className="advanced-search-progress-meta">
        <span>{providerSummary(config)}</span>
        <span>{config.vectorStore === "lancedb" ? "LanceDB" : "JSON index"}</span>
      </div>
    </div>
  );
}

function progressPhaseLabel(phase: AdvancedSearchRebuildProgress["phase"]): string {
  if (phase === "collecting") return "Collecting content";
  if (phase === "embedding") return "Embedding chunks";
  if (phase === "writing") return "Writing index";
  if (phase === "done") return "Index ready";
  return "Index failed";
}

function providerSummary(config: AdvancedSearchConfig): string {
  if (config.provider === "local") return "Deterministic fallback";
  if (config.provider === "openai-compatible") return `External embeddings · ${config.model || "model required"}`;
  return `Ollama · ${config.model || "qwen3-embedding:0.6b"}`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusLabel(status?: AdvancedSearchStatus): string {
  if (!status) return "Loading";
  if (status.status === "ready") return "Ready";
  if (status.status === "stale") return "Stale";
  if (status.status === "indexing") return "Indexing";
  if (status.status === "error") return "Error";
  return "Not built";
}

function statusSummary(status?: AdvancedSearchStatus): string {
  if (!status) return "Loading index state...";
  if (status.status === "not_built") return "No index yet. Rebuild to create a local plugin index.";
  if (status.status === "stale") return `${status.staleReason || "Index may be stale."} ${status.chunkCount} chunks are still searchable.`;
  if (status.status === "error") return status.error || "Index failed.";
  return `${status.chunkCount} chunks from ${status.documentCount} items.`;
}

function sourceLabel(hit: AdvancedSearchHit): string {
  const type = hit.kind === "database" ? "Database" : hit.kind === "page" ? "Page" : "Row page";
  return `${type} · ${hit.source}`;
}
