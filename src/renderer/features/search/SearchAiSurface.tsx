import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit, SearchResult } from "../../../preload/lotion-api";
import { EntityIcon, type EntityKind } from "../../components/EntityIcon";
import { useLotionActions } from "../../context/lotion-actions";
import { pluginHost } from "../../plugin-host";

type PrimaryTab = "search" | "chat";
type SearchTab = "all" | "page" | "database" | "row" | "advanced";

interface SearchAiSurfaceProps {
  onClose: () => void;
}

const SEARCH_TABS: Array<{ id: SearchTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "page", label: "Pages" },
  { id: "database", label: "Databases" },
  { id: "row", label: "Rows" },
  { id: "advanced", label: "Advanced" }
];

export function SearchAiSurface({ onClose }: SearchAiSurfaceProps) {
  const actions = useLotionActions();
  const [activeTab, setActiveTab] = useState<PrimaryTab>("search");
  const [searchTab, setSearchTab] = useState<SearchTab>("all");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult>({ hits: [], truncated: false });
  const [loading, setLoading] = useState(false);
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);
  const [message, setMessage] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim();
  const filteredHits = useMemo(() => {
    if (searchTab === "advanced") return [];
    if (searchTab === "all") return result.hits;
    if (searchTab === "row") return result.hits.filter((hit) => hit.kind === "row" || hit.kind === "rowPage");
    return result.hits.filter((hit) => hit.kind === searchTab);
  }, [result.hits, searchTab]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (activeTab === "search") searchInputRef.current?.focus();
  }, [activeTab]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResult({ hits: [], truncated: false });
      setLoading(false);
      setMessage("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      window.lotion.search.query(trimmedQuery, { sort: "relevance" })
        .then((next) => {
          if (cancelled) return;
          setResult(next);
          setMessage("");
        })
        .catch((error) => {
          if (cancelled) return;
          setResult({ hits: [], truncated: false });
          setMessage(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [trimmedQuery]);

  function closeOnBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function openAdvancedSearch() {
    onClose();
    window.setTimeout(() => void pluginHost.commands.run("advanced-search.open"), 0);
  }

  function openAdvancedSettings() {
    onClose();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("lotion:open-settings-center", {
        detail: { section: "search-ai" }
      }));
    }, 0);
  }

  function openLlmChat() {
    onClose();
    window.setTimeout(() => void pluginHost.commands.run("llm-openai.chat"), 0);
  }

  function openLlmSettings() {
    onClose();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("lotion:open-settings-center", {
        detail: { section: "search-ai" }
      }));
    }, 0);
  }

  function openCommandPalette() {
    onClose();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("lotion:open-search", { detail: { pattern: query } }));
    }, 0);
  }

  function openHit(hit: SearchHit) {
    const options = searchHitNavigationOptions(hit);
    if (hit.kind === "page") {
      if (hit.databaseId && hit.rowId) actions.openRowPage(hit.databaseId, hit.rowId, options);
      else if (hit.databaseId && hit.pageFile) actions.openRowPageByFile(hit.databaseId, hit.pageFile, options);
      else actions.selectPage(hit.pageId, options);
    } else if (hit.kind === "database") {
      actions.selectDatabase(hit.databaseId);
    } else if (hit.kind === "row") {
      actions.openRowPage(hit.databaseId, hit.rowId, options);
    } else {
      actions.openRowPageByFile(hit.databaseId, hit.pageFile, options);
    }
    onClose();
  }

  return (
    <div className="dialog-backdrop search-ai-backdrop" onClick={closeOnBackdrop} onKeyDown={onKeyDown}>
      <section
        className="search-ai-surface"
        data-testid="search-ai-surface"
        role="dialog"
        aria-modal="true"
        aria-label="Search and AI"
      >
        <header className="search-ai-header">
          <div>
            <p>Search &amp; AI</p>
            <h2>Find, understand, and act on workspace knowledge.</h2>
          </div>
          <button type="button" className="search-ai-close" onClick={onClose} aria-label="Close Search and AI">×</button>
        </header>
        <div className="search-ai-primary-tabs" role="tablist" aria-label="Search and AI tabs">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "search"}
            className={activeTab === "search" ? "active" : ""}
            onClick={() => setActiveTab("search")}
          >
            Search
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={activeTab === "chat" ? "active" : ""}
            onClick={() => setActiveTab("chat")}
          >
            LLM Chat
          </button>
        </div>
        {activeTab === "search" ? (
          <section className="search-ai-tab-panel" data-testid="search-ai-search-tab">
            <div className="search-ai-search-row">
              <input
                ref={searchInputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search pages, databases, rows, or use Advanced semantic search..."
                aria-label="Search and AI query"
              />
              <button type="button" onClick={openCommandPalette}>
                Command palette
              </button>
            </div>
            <div className="search-ai-result-tabs" role="tablist" aria-label="Search result modes">
              {SEARCH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={searchTab === tab.id}
                  className={searchTab === tab.id ? "active" : ""}
                  onClick={() => setSearchTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {searchTab === "advanced" ? (
              <AdvancedSearchSummary
                query={trimmedQuery}
                onOpenAdvancedSearch={openAdvancedSearch}
                onOpenSettings={openAdvancedSettings}
              />
            ) : (
              <div className="search-ai-results" data-testid="search-ai-results">
                <div className="search-ai-results-meta" role="status" aria-live="polite">
                  {loading
                    ? "Searching..."
                    : message
                      ? message
                      : trimmedQuery
                        ? `Showing ${filteredHits.length}${result.truncated ? "+" : ""} results`
                        : "Start typing, or switch to Advanced for semantic search."}
                </div>
                {filteredHits.slice(0, 16).map((hit, index) => (
                  <button
                    key={`${hit.kind}-${hit.path}-${hit.line}-${index}`}
                    type="button"
                    className={selectedHit === hit ? "search-ai-hit active" : "search-ai-hit"}
                    onClick={() => openHit(hit)}
                    onMouseEnter={() => setSelectedHit(hit)}
                    onFocus={() => setSelectedHit(hit)}
                  >
                    <span className="search-ai-hit-icon">
                      <EntityIcon kind={iconKind(hit)} icon={hit.icon} size={16} />
                    </span>
                    <span className="search-ai-hit-main">
                      <strong>{hitTitle(hit)}</strong>
                      <small>{hitSubtitle(hit)}</small>
                      <span>{hit.text}</span>
                    </span>
                  </button>
                ))}
                {!loading && trimmedQuery && filteredHits.length === 0 && !message && (
                  <div className="search-ai-empty">No lexical results. Try Advanced semantic search.</div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="search-ai-tab-panel search-ai-chat-tab" data-testid="search-ai-chat-tab">
            <div className="search-ai-chat-card">
              <div>
                <strong>Workspace assistant</strong>
                <p>Use the same workspace context as Search. Select a result, then open chat to ask about it or continue with current page context.</p>
              </div>
              {selectedHit && (
                <div className="search-ai-selected-source" data-testid="search-ai-selected-source">
                  <span>Selected source</span>
                  <strong>{hitTitle(selectedHit)}</strong>
                  <small>{hitSubtitle(selectedHit)}</small>
                </div>
              )}
              <div className="search-ai-chat-actions">
                <button type="button" className="primary" onClick={openLlmChat}>Open LLM Chat</button>
                <button type="button" onClick={openLlmSettings}>LLM settings</button>
              </div>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}

function AdvancedSearchSummary({
  onOpenAdvancedSearch,
  onOpenSettings,
  query
}: {
  onOpenAdvancedSearch: () => void;
  onOpenSettings: () => void;
  query: string;
}) {
  return (
    <div className="search-ai-advanced-card" data-testid="search-ai-advanced-tab">
      <div>
        <span className="search-ai-state-pill">Local semantic index</span>
        <h3>Advanced results live inside Search.</h3>
        <p>
          Use vector search for meaning-based lookup, then return to normal results without leaving this workflow.
          {query ? ` Current query: "${query}".` : ""}
        </p>
      </div>
      <div className="search-ai-advanced-actions">
        <button type="button" className="primary" onClick={onOpenAdvancedSearch}>Open Advanced results</button>
        <button type="button" onClick={onOpenSettings}>Search &amp; AI Settings</button>
      </div>
    </div>
  );
}

function searchHitNavigationOptions(hit: SearchHit): { markdownLine?: number } | undefined {
  if (!/\.md$/i.test(hit.path)) return undefined;
  if (hit.line < 1) return undefined;
  return { markdownLine: hit.line };
}

function iconKind(hit: SearchHit): EntityKind {
  if (hit.kind === "database") return "database";
  if (hit.kind === "row" || hit.kind === "rowPage") return "row_page";
  return hit.databaseId || hit.rowId || hit.pageFile ? "row_page" : "page";
}

function hitTitle(hit: SearchHit): string {
  if (hit.kind === "database") return hit.databaseName;
  if (hit.kind === "row") return hit.rowTitle || "Untitled";
  if (hit.kind === "rowPage") return hit.rowTitle || hit.pageFile.replace(/\.md$/i, "");
  return hit.title || "Untitled";
}

function hitSubtitle(hit: SearchHit): string {
  const path = hit.entityPath || hit.path;
  if (hit.kind === "database") return `Database · ${path}`;
  if (hit.kind === "row" || hit.kind === "rowPage") return `Row page · ${hit.databaseName} · ${path}`;
  if (hit.databaseName) return `Page · ${hit.databaseName} · ${path}`;
  return `Page · ${path}`;
}
