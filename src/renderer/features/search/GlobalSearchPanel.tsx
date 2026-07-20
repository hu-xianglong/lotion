import { type Ref, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SearchHit, SearchMatchType, SearchResult, SearchSortMode } from "../../../preload/lotion-api";
import type { Command } from "../../../shared/plugin-api";
import type { DatabaseSummary, PageMeta, RecentItem } from "../../../shared/types";
import { EntityIcon, type EntityKind } from "../../components/EntityIcon";
import { useLotionActions, type LotionActions } from "../../context/lotion-actions";
import { useI18n, type Locale } from "../../lib/i18n";
import { useSettings } from "../../lib/settings";
import { pluginHost } from "../../plugin-host";
import { shortcutMap } from "../../../shared/shortcuts";
import { tagManageKind } from "../../state/app-store";

interface GlobalSearchPanelProps {
  pages: PageMeta[];
  databases: DatabaseSummary[];
  recents: RecentItem[];
  initialPattern?: string;
  onClose: () => void;
}

type Kind = SearchHit["kind"];
type MatchFilter = "all" | SearchMatchType | "command";
interface CommandSearchHit {
  command: Command;
  sourceName?: string;
  shortcutLabel?: string;
  score: number;
}
interface CommandSearchEntry {
  command: Command;
  sourceName?: string;
}
interface RecentSearchHit {
  recent: RecentItem;
  title: string;
  subtitle: string;
  kind: EntityKind;
  icon?: string;
}
interface TagSearchHit {
  tag: string;
  title: string;
  pageCount: number;
  databaseCount: number;
  count: number;
  score: number;
}
type SearchPanelItem =
  | { type: "command"; commandHit: CommandSearchHit }
  | { type: "recent"; recentHit: RecentSearchHit }
  | { type: "tag"; tagHit: TagSearchHit }
  | { type: "hit"; hit: SearchHit };

declare global {
  interface Window {
    __lotionSearchUiHarness?: {
      query?: (pattern: string, options?: { sort?: SearchSortMode }) => Promise<SearchResult>;
    };
  }
}

interface GlobalSearchPanelContentProps {
  pattern: string;
  trimmedPattern: string;
  loading: boolean;
  flatItems: SearchPanelItem[];
  filteredItemsLength: number;
  totalSearchHitCount: number;
  resultTruncated: boolean;
  hasMore: boolean;
  activeIndex: number;
  activeMatchFilter: MatchFilter;
  activeSortMode: SearchSortMode;
  commandHitsLength: number;
  tagHitsLength: number;
  typeCounts: Record<SearchMatchType, number>;
  inputRef?: Ref<HTMLInputElement>;
  resultsRef?: Ref<HTMLDivElement>;
  onPatternChange: (next: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectMatchFilter: (filter: MatchFilter) => void;
  onSelectSortMode: (sortMode: SearchSortMode) => void;
  onActivateItem: (item: SearchPanelItem) => void;
  onHoverItem: (index: number) => void;
  onLoadMore: () => void;
  onBackdropClick: () => void;
}

const DEFAULT_VISIBLE_HITS = 100;
const LARGE_RESULT_THRESHOLD = 250;
const SEARCH_MATCH_TYPE_ORDER: SearchMatchType[] = ["title", "content", "reference", "database"];
const SEARCH_COPY = {
  en: {
    groupLabel: { page: "Page", database: "Database", row: "Page", rowPage: "Page" },
    matchFilters: [
      { id: "all", label: "All" },
      { id: "title", label: "Title" },
      { id: "content", label: "Content / field" },
      { id: "reference", label: "Reference" },
      { id: "database", label: "Database" },
      { id: "command", label: "Command" }
    ],
    searchSorts: [
      { id: "relevance", label: "Relevance" },
      { id: "updated_desc", label: "Updated: newest" },
      { id: "updated_asc", label: "Updated: oldest" },
      { id: "created_desc", label: "Created: newest" },
      { id: "created_asc", label: "Created: oldest" }
    ],
    matchLabel: { title: "Title", content: "Content / field", reference: "Reference", database: "Database" },
    inputAria: "Command palette: search pages, databases, row content, or run a command",
    inputPlaceholder: "Search pages, databases, row content, commands…",
    resultTypesAria: "Search result types",
    sortLabel: "Sort",
    sortAria: "Search sort",
    loadMore: "Load more",
    noMatches: "No matches.",
    commandBadge: "Command",
    recentBadge: "Recent",
    tagBadge: "Tag",
    page: "Page",
    database: "Database",
    tagPage: "Tag page",
    builtIn: "Built-in",
    untitled: "Untitled",
    untitledDatabase: "Untitled database",
    builtInCommandTitle: {
      "lotion.new-page": "New page",
      "lotion.new-database": "New database",
      "lotion.open-pages": "Open all pages",
      "lotion.open-databases": "Open all databases",
      "lotion.open-recent": "Open recent",
      "lotion.open-favorites": "Open favorites",
      "lotion.open-plugins": "Open plugins",
      "lotion.open-settings": "Open settings",
      "lotion.open-sidebar-settings": "Open sidebar settings",
      "lotion.toggle-vim-mode": "Toggle Vim mode",
      "lotion.toggle-raw-markdown": "Toggle raw Markdown",
      "lotion.toggle-embed-source": "Toggle embed source",
      "lotion.toggle-favorite": "Toggle favorite for current item",
      "lotion.toggle-full-width": "Toggle full width for current page",
      "lotion.toggle-small-text": "Toggle small text for current page",
      "lotion.open-current-in-new-window": "Open current item in new window"
    }
  },
  zh: {
    groupLabel: { page: "页面", database: "数据库", row: "页面", rowPage: "页面" },
    matchFilters: [
      { id: "all", label: "全部" },
      { id: "title", label: "标题" },
      { id: "content", label: "正文/字段" },
      { id: "reference", label: "引用" },
      { id: "database", label: "数据库" },
      { id: "command", label: "命令" }
    ],
    searchSorts: [
      { id: "relevance", label: "相关性" },
      { id: "updated_desc", label: "更新：新到旧" },
      { id: "updated_asc", label: "更新：旧到新" },
      { id: "created_desc", label: "创建：新到旧" },
      { id: "created_asc", label: "创建：旧到新" }
    ],
    matchLabel: { title: "标题", content: "正文/字段", reference: "引用", database: "数据库" },
    inputAria: "命令面板：搜索页面、数据库、行内容或执行命令",
    inputPlaceholder: "搜索页面、数据库、行内容、命令…",
    resultTypesAria: "搜索结果类型",
    sortLabel: "排序",
    sortAria: "搜索排序",
    loadMore: "加载更多",
    noMatches: "没有匹配。",
    commandBadge: "命令",
    recentBadge: "最近",
    tagBadge: "标签",
    page: "页面",
    database: "数据库",
    tagPage: "标签页",
    builtIn: "内置",
    untitled: "（无标题）",
    untitledDatabase: "未命名数据库",
    builtInCommandTitle: {
      "lotion.new-page": "新建页面",
      "lotion.new-database": "新建数据库",
      "lotion.open-pages": "打开所有页面",
      "lotion.open-databases": "打开所有数据库",
      "lotion.open-recent": "打开最近访问",
      "lotion.open-favorites": "打开收藏",
      "lotion.open-plugins": "打开插件",
      "lotion.open-settings": "打开设置中心",
      "lotion.open-sidebar-settings": "打开侧栏设置",
      "lotion.toggle-vim-mode": "切换 Vim 模式",
      "lotion.toggle-raw-markdown": "切换原文模式",
      "lotion.toggle-embed-source": "切换嵌入源码显示",
      "lotion.toggle-favorite": "收藏/取消收藏当前内容",
      "lotion.toggle-full-width": "切换当前页面全宽",
      "lotion.toggle-small-text": "切换当前页面小字号",
      "lotion.open-current-in-new-window": "在新窗口打开当前项目"
    }
  }
} as const;

function searchCopy(locale: Locale) {
  return SEARCH_COPY[locale];
}

/**
 * Cmd+Shift+F global search. Debounced query → main process ripgrep
 * → enriched hits ordered by the search service. Clicking a hit routes
 * through the matching action.
 */
export function GlobalSearchPanel({ pages, databases, recents, initialPattern = "", onClose }: GlobalSearchPanelProps) {
  const actions = useLotionActions();
  const { locale } = useI18n();
  const { shortcutOverrides } = useSettings();
  const commandIndex = useMemo(() => buildCommandIndex(actions, locale), [actions, locale]);
  const shortcutsById = useMemo(() => shortcutMap(shortcutOverrides), [shortcutOverrides]);
  const [pattern, setPattern] = useState(initialPattern);
  const [settledPattern, setSettledPattern] = useState("");
  const [settledPatternEpoch, setSettledPatternEpoch] = useState(0);
  const [result, setResult] = useState<SearchResult>({ hits: [], truncated: false });
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE_HITS);
  const [activeMatchFilter, setActiveMatchFilter] = useState<MatchFilter>("all");
  const [activeSortMode, setActiveSortMode] = useState<SearchSortMode>("relevance");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const activeReqRef = useRef(0);
  const trimmedPattern = pattern.trim();
  const activePattern = trimmedPattern ? settledPattern : "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setPattern(initialPattern);
  }, [initialPattern]);

  useEffect(() => {
    const trimmed = pattern.trim();
    if (!trimmed) {
      activeReqRef.current += 1;
      setSettledPattern("");
      setResult({ hits: [], truncated: false });
      setLoading(false);
      setActiveIndex(0);
      setVisibleCount(DEFAULT_VISIBLE_HITS);
      resultsRef.current?.scrollTo({ top: 0 });
      return;
    }
    setLoading(true);
    setResult({ hits: [], truncated: false });
    setActiveIndex(0);
    setVisibleCount(DEFAULT_VISIBLE_HITS);
    resultsRef.current?.scrollTo({ top: 0 });
    const reqId = ++activeReqRef.current;
    const handle = setTimeout(() => {
      if (reqId === activeReqRef.current) {
        setSettledPattern(trimmed);
        setSettledPatternEpoch((epoch) => epoch + 1);
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [pattern]);

  useEffect(() => {
    if (!settledPattern) return;
    setLoading(true);
    setActiveIndex(0);
    setVisibleCount(DEFAULT_VISIBLE_HITS);
    resultsRef.current?.scrollTo({ top: 0 });
    const reqId = ++activeReqRef.current;
    const querySearch = window.__lotionSearchUiHarness?.query ?? window.lotion.search.query;
    void querySearch(settledPattern, { sort: activeSortMode }).then((next) => {
      if (reqId !== activeReqRef.current) return;
      setResult(next);
      setActiveIndex(0);
      setVisibleCount(DEFAULT_VISIBLE_HITS);
      resultsRef.current?.scrollTo({ top: 0 });
      setLoading(false);
    }).catch((error) => {
      if (reqId !== activeReqRef.current) return;
      setResult({ hits: [], truncated: false });
      setLoading(false);
      const text = error instanceof Error ? error.message : String(error);
      window.dispatchEvent(new CustomEvent("lotion:notify", {
        detail: { text, level: "error" }
      }));
    });
  }, [activeSortMode, settledPattern, settledPatternEpoch]);

  const typeCounts = useMemo(() => countMatchTypes(result.hits), [result.hits]);
  const recentHits = useMemo(
    () => trimmedPattern ? [] : buildRecentSearchHits(recents, pages, databases, locale),
    [databases, locale, pages, recents, trimmedPattern]
  );
  const commandHits = useMemo(
    () => searchCommands(commandIndex, activePattern, shortcutsById),
    [activePattern, commandIndex, shortcutsById]
  );
  const tagHits = useMemo(
    () => buildTagSearchHits(pages, databases, trimmedPattern),
    [databases, pages, trimmedPattern]
  );
  const filteredHits = useMemo(() => {
    if (activeMatchFilter === "all") return result.hits;
    if (activeMatchFilter === "command") return [];
    return result.hits.filter((hit) => hitMatchTypes(hit).includes(activeMatchFilter));
  }, [activeMatchFilter, result.hits]);
  const showCommands = activeMatchFilter === "all" || activeMatchFilter === "command";
  const showTags = activeMatchFilter === "all";
  const filteredItemsLength = trimmedPattern
    ? (showTags ? tagHits.length : 0) + (showCommands ? commandHits.length : 0) + filteredHits.length
    : recentHits.length + (showTags ? tagHits.length : 0) + (showCommands ? commandHits.length : 0);
  const flatItems: SearchPanelItem[] = useMemo(() => {
    const items: SearchPanelItem[] = [];
    if (!trimmedPattern) {
      for (const recentHit of recentHits) items.push({ type: "recent", recentHit });
      if (showTags) {
        for (const tagHit of tagHits) items.push({ type: "tag", tagHit });
      }
      if (showCommands) {
        for (const commandHit of commandHits) items.push({ type: "command", commandHit });
      }
      return items.slice(0, visibleCount);
    }
    if (showTags) {
      for (const tagHit of tagHits) items.push({ type: "tag", tagHit });
    }
    if (showCommands) {
      for (const commandHit of commandHits) items.push({ type: "command", commandHit });
    }
    for (const hit of filteredHits) items.push({ type: "hit", hit });
    return items.slice(0, visibleCount);
  }, [commandHits, filteredHits, recentHits, showCommands, showTags, tagHits, trimmedPattern, visibleCount]);
  const hasMore = flatItems.length < filteredItemsLength;

  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const active = container.querySelectorAll<HTMLElement>(".global-search-hit")[activeIndex];
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, flatItems.length]);

  function navigateTo(hit: SearchHit) {
    const navigationOptions = searchHitNavigationOptions(hit);
    switch (hit.kind) {
      case "page":
        if (hit.databaseId && hit.rowId) {
          actions.openRowPage(hit.databaseId, hit.rowId, navigationOptions);
          break;
        }
        if (hit.databaseId && hit.pageFile) {
          actions.openRowPageByFile(hit.databaseId, hit.pageFile, navigationOptions);
          break;
        }
        actions.selectPage(hit.pageId, navigationOptions);
        break;
      case "database":
        actions.selectDatabase(hit.databaseId);
        break;
      case "row":
        // Always open the row's detail page — Notion-style. The file
        // itself is lazy: RowPagesService.update materializes the .md
        // only when the user actually types.
        actions.openRowPage(hit.databaseId, hit.rowId);
        break;
      case "rowPage":
        actions.openRowPageByFile(hit.databaseId, hit.pageFile, navigationOptions);
        break;
    }
    onClose();
  }

  function navigateRecent(recent: RecentItem) {
    if (recent.type === "page") {
      actions.selectPage(recent.id);
    } else if (recent.type === "database") {
      actions.selectDatabase(recent.id);
    } else {
      actions.openRowPage(recent.databaseId, recent.rowId);
    }
    onClose();
  }

  function runCommand(command: Command) {
    onClose();
    void Promise.resolve(command.run()).catch((error) => {
      const text = error instanceof Error ? error.message : String(error);
      window.dispatchEvent(new CustomEvent("lotion:notify", {
        detail: { text, level: "error" }
      }));
    });
  }

  function activateItem(item: SearchPanelItem | undefined) {
    if (!item) return;
    if (item.type === "command") {
      runCommand(item.commandHit.command);
      return;
    }
    if (item.type === "recent") {
      navigateRecent(item.recentHit.recent);
      return;
    }
    if (item.type === "tag") {
      actions.openManage(tagManageKind(item.tagHit.tag));
      onClose();
      return;
    }
    navigateTo(item.hit);
  }

  function closeAndRestoreFocus() {
    const previousFocus = previousFocusRef.current;
    onClose();
    if (!previousFocus?.isConnected) return;
    requestAnimationFrame(() => {
      if (previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateItem(flatItems[activeIndex]);
    }
  }

  return createPortal(
    <GlobalSearchPanelContent
      pattern={pattern}
      trimmedPattern={trimmedPattern}
      loading={loading}
      flatItems={flatItems}
      filteredItemsLength={filteredItemsLength}
      totalSearchHitCount={result.hits.length}
      resultTruncated={result.truncated}
      hasMore={hasMore}
      activeIndex={activeIndex}
      activeMatchFilter={activeMatchFilter}
      activeSortMode={activeSortMode}
      commandHitsLength={commandHits.length}
      tagHitsLength={tagHits.length}
      typeCounts={typeCounts}
      inputRef={inputRef}
      resultsRef={resultsRef}
      onPatternChange={setPattern}
      onKeyDown={onKeyDown}
      onSelectMatchFilter={(filter) => {
        setActiveMatchFilter(filter);
        setActiveIndex(0);
        setVisibleCount(DEFAULT_VISIBLE_HITS);
        resultsRef.current?.scrollTo({ top: 0 });
      }}
      onSelectSortMode={(sortMode) => {
        setActiveSortMode(sortMode);
        setActiveIndex(0);
        setVisibleCount(DEFAULT_VISIBLE_HITS);
        resultsRef.current?.scrollTo({ top: 0 });
      }}
      onActivateItem={activateItem}
      onHoverItem={setActiveIndex}
      onLoadMore={() => setVisibleCount((count) => count + 50)}
      onBackdropClick={closeAndRestoreFocus}
    />,
    document.body
  );
}

export function GlobalSearchPanelContent({
  pattern,
  trimmedPattern,
  loading,
  flatItems,
  filteredItemsLength,
  totalSearchHitCount,
  resultTruncated,
  hasMore,
  activeIndex,
  activeMatchFilter,
  activeSortMode,
  commandHitsLength,
  tagHitsLength,
  typeCounts,
  inputRef,
  resultsRef,
  onPatternChange,
  onKeyDown,
  onSelectMatchFilter,
  onSelectSortMode,
  onActivateItem,
  onHoverItem,
  onLoadMore,
  onBackdropClick
}: GlobalSearchPanelContentProps) {
  const { locale } = useI18n();
  const copy = searchCopy(locale);
  const progress = searchProgressState({
    commandHitsLength,
    filteredItemsLength,
    flatItemsLength: flatItems.length,
    hasMore,
    loading,
    resultTruncated,
    tagHitsLength,
    totalSearchHitCount,
    trimmedPattern
  }, locale);
  return (
    <div className="dialog-backdrop" onClick={onBackdropClick}>
      <div className="dialog global-search" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="global-search-input"
          aria-label={copy.inputAria}
          value={pattern}
          placeholder={copy.inputPlaceholder}
          onChange={(e) => onPatternChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {trimmedPattern && (
          <div className="global-search-filters" role="group" aria-label={copy.resultTypesAria}>
            {copy.matchFilters.map((filter) => {
              const count = filter.id === "all"
                ? totalSearchHitCount + commandHitsLength + tagHitsLength
                : filter.id === "command"
                  ? commandHitsLength
                  : typeCounts[filter.id] ?? 0;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={activeMatchFilter === filter.id ? "active" : ""}
                  onClick={() => onSelectMatchFilter(filter.id)}
                >
                  <span>{filter.label}</span>
                  <span className="global-search-filter-count">{count}</span>
                </button>
              );
            })}
            <label className="global-search-sort-control">
              <span>{copy.sortLabel}</span>
              <select
                aria-label={copy.sortAria}
                value={activeSortMode}
                onChange={(event) => onSelectSortMode(event.currentTarget.value as SearchSortMode)}
              >
                {copy.searchSorts.map((sort) => (
                  <option key={sort.id} value={sort.id}>{sort.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <div
          className={`global-search-meta ${progress.state}`}
          role="status"
          aria-live="polite"
          data-testid="global-search-progress"
          data-state={progress.state}
          data-visible-count={flatItems.length}
          data-total-count={filteredItemsLength}
          data-truncated={resultTruncated ? "true" : "false"}
          data-has-more={hasMore ? "true" : "false"}
        >
          <div className="global-search-progress-copy">
            <span className="global-search-progress-label">{progress.label}</span>
            {progress.detail && <span className="global-search-progress-detail">{progress.detail}</span>}
          </div>
          {trimmedPattern && (
            <div className="global-search-progress-track" aria-hidden="true">
              <span style={{ width: progress.percent }} />
            </div>
          )}
        </div>
        <div ref={resultsRef} className="global-search-results">
          {flatItems.map((item, flatIdx) => {
            const active = flatIdx === activeIndex;
            return (
              <button
                key={searchItemKey(item, flatIdx)}
                type="button"
                className={[
                  "global-search-hit",
                  active ? "active" : "",
                  item.type === "command"
                    ? "command-hit"
                    : item.type === "recent"
                      ? "recent-hit"
                      : item.type === "tag"
                        ? "tag-hit"
                        : "search-result-hit"
                ].filter(Boolean).join(" ")}
                data-search-item-type={item.type}
                onClick={() => onActivateItem(item)}
                onMouseEnter={() => onHoverItem(flatIdx)}
              >
                {item.type === "command" ? (
                  <>
                    <div className="global-search-label">{renderCommandLabel(item.commandHit, locale)}</div>
                    <div className="global-search-preview">{renderCommandText(item.commandHit)}</div>
                  </>
                ) : item.type === "recent" ? (
                  <>
                    <div className="global-search-label">{renderRecentLabel(item.recentHit, locale)}</div>
                    <div className="global-search-preview">{item.recentHit.subtitle}</div>
                  </>
                ) : item.type === "tag" ? (
                  <>
                    <div className="global-search-label">{renderTagLabel(item.tagHit, locale)}</div>
                    <div className="global-search-preview">{renderTagText(item.tagHit, locale)}</div>
                  </>
                ) : (
                  <>
                    <div className="global-search-label">{renderLabel(item.hit, locale)}</div>
                    {item.hit.entityPath && <div className="global-search-path">{item.hit.entityPath}</div>}
                    {item.hit.kind !== "database" && (
                      <div className="global-search-preview">{renderText(item.hit)}</div>
                    )}
                  </>
                )}
              </button>
            );
          })}
          {hasMore && (
            <button
              type="button"
              className="global-search-more"
              onClick={onLoadMore}
            >
              {copy.loadMore}
            </button>
          )}
          {!loading && trimmedPattern && flatItems.length === 0 && (
            <div className="global-search-empty">{copy.noMatches}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function searchHitNavigationOptions(hit: SearchHit): { markdownLine?: number } | undefined {
  if (!/\.md$/i.test(hit.path)) return undefined;
  if (hit.line < 1) return undefined;
  return { markdownLine: hit.line };
}

function searchProgressState({
  commandHitsLength,
  filteredItemsLength,
  flatItemsLength,
  hasMore,
  loading,
  resultTruncated,
  tagHitsLength,
  totalSearchHitCount,
  trimmedPattern
}: {
  commandHitsLength: number;
  filteredItemsLength: number;
  flatItemsLength: number;
  hasMore: boolean;
  loading: boolean;
  resultTruncated: boolean;
  tagHitsLength: number;
  totalSearchHitCount: number;
  trimmedPattern: string;
}, locale: Locale): { detail: string; label: string; percent: string; state: "empty" | "loading" | "partial" | "complete" | "recent" } {
  const isZh = locale === "zh";
  if (!trimmedPattern) {
    return flatItemsLength > 0
      ? {
        state: "recent",
        label: isZh ? "最近访问、标签和命令" : "Recent, tags, and commands",
        detail: isZh
          ? `Enter 打开页面、标签或执行命令 · 标签 ${tagHitsLength} 个 · 命令 ${commandHitsLength} 条`
          : `Press Enter to open a page or tag, or run a command · ${tagHitsLength} tags · ${commandHitsLength} commands`,
        percent: "0%"
      }
      : {
        state: "empty",
        label: isZh ? "输入关键词搜索页面、数据库、行内容和命令。" : "Search pages, databases, row content, and commands.",
        detail: "",
        percent: "0%"
      };
  }
  if (loading) {
    return {
      state: "loading",
      label: isZh ? `搜索“${trimmedPattern}”…` : `Searching for “${trimmedPattern}”…`,
      detail: isZh
        ? "正在匹配页面、数据库、正文和引用；输入框保持可编辑。"
        : "Matching pages, databases, content, and references. You can keep editing the query.",
      percent: "38%"
    };
  }
  if (filteredItemsLength === 0) {
    return {
      state: "empty",
      label: isZh ? "没有匹配。" : "No matches.",
      detail: isZh ? "尝试更短的关键词，或切换结果类型。" : "Try a shorter query or switch the result type.",
      percent: "100%"
    };
  }
  const visible = Math.min(flatItemsLength, filteredItemsLength);
  const denominator = Math.max(filteredItemsLength, 1);
  const percent = `${Math.max(8, Math.min(100, Math.round((visible / denominator) * 100)))}%`;
  if (resultTruncated || hasMore || filteredItemsLength >= LARGE_RESULT_THRESHOLD) {
    const total = resultTruncated ? `${filteredItemsLength}+` : `${filteredItemsLength}`;
    const hidden = Math.max(filteredItemsLength - flatItemsLength, 0);
    return {
      state: "partial",
      label: isZh ? `显示 ${visible}/${total} 个结果` : `Showing ${visible} of ${total} results`,
      detail: resultTruncated
        ? (isZh
          ? `结果已截断；当前只挂载 ${visible} 条，缩小关键词可继续定位。`
          : `Results were truncated. ${visible} are mounted; narrow the query to keep searching.`)
        : hidden > 0
          ? (isZh
            ? `还有 ${hidden} 条未挂载，加载更多前输入和方向键仍保持响应。`
            : `${hidden} more results are not mounted. Typing and arrow keys remain responsive.`)
          : (isZh
            ? `结果较多，已完成整理；标签 ${tagHitsLength} 个，命令 ${commandHitsLength} 条，搜索命中 ${totalSearchHitCount} 条。`
            : `Results organized: ${tagHitsLength} tags, ${commandHitsLength} commands, ${totalSearchHitCount} search hits.`),
      percent
    };
  }
  return {
    state: "complete",
    label: isZh ? `显示 ${visible}/${filteredItemsLength} 个结果` : `Showing ${visible} of ${filteredItemsLength} results`,
    detail: isZh
      ? `搜索完成；标签 ${tagHitsLength} 个，命令 ${commandHitsLength} 条，搜索命中 ${totalSearchHitCount} 条。`
      : `Search complete: ${tagHitsLength} tags, ${commandHitsLength} commands, ${totalSearchHitCount} search hits.`,
    percent: "100%"
  };
}

function buildCommandIndex(actions: LotionActions, locale: Locale): CommandSearchEntry[] {
  const inspection = pluginHost.inspect();
  const sourceByCommandId = new Map(
    inspection.commands.map((command) => [command.id, command.sourcePluginId])
  );
  const pluginNameById = new Map(inspection.plugins.map((plugin) => [plugin.id, plugin.name]));
  const pluginCommands = pluginHost.commands.list().map((command) => {
    const sourcePluginId = sourceByCommandId.get(command.id);
    return {
      command,
      sourceName: sourcePluginId ? pluginNameById.get(sourcePluginId) ?? sourcePluginId : undefined
    };
  });
  return [
    ...buildBuiltinCommandIndex(actions, locale),
    ...pluginCommands
  ];
}

function buildBuiltinCommandIndex(actions: LotionActions, locale: Locale): CommandSearchEntry[] {
  const copy = searchCopy(locale);
  const titles = copy.builtInCommandTitle;
  const commands: Command[] = [
    {
      id: "lotion.new-page",
      title: titles["lotion.new-page"],
      category: "Lotion",
      run: () => actions.createPage()
    },
    {
      id: "lotion.new-database",
      title: titles["lotion.new-database"],
      category: "Lotion",
      run: () => actions.createDatabase()
    },
    {
      id: "lotion.open-pages",
      title: titles["lotion.open-pages"],
      category: "Lotion",
      run: () => actions.openManage("pages")
    },
    {
      id: "lotion.open-databases",
      title: titles["lotion.open-databases"],
      category: "Lotion",
      run: () => actions.openManage("databases")
    },
    {
      id: "lotion.open-recent",
      title: titles["lotion.open-recent"],
      category: "Lotion",
      run: () => actions.openManage("recent")
    },
    {
      id: "lotion.open-favorites",
      title: titles["lotion.open-favorites"],
      category: "Lotion",
      run: () => actions.openManage("favorites")
    },
    {
      id: "lotion.open-plugins",
      title: titles["lotion.open-plugins"],
      category: "Lotion",
      run: () => actions.openManage("plugins")
    },
    {
      id: "lotion.open-settings",
      title: titles["lotion.open-settings"],
      category: "Lotion",
      run: () => actions.openManage("settings")
    },
    {
      id: "lotion.open-sidebar-settings",
      title: titles["lotion.open-sidebar-settings"],
      category: "Lotion",
      run: () => actions.openSidebarSettings()
    },
    {
      id: "lotion.toggle-vim-mode",
      title: titles["lotion.toggle-vim-mode"],
      category: "Lotion",
      run: () => actions.toggleVimMode()
    },
    {
      id: "lotion.toggle-raw-markdown",
      title: titles["lotion.toggle-raw-markdown"],
      category: "Lotion",
      run: () => actions.toggleRawMarkdownMode()
    },
    {
      id: "lotion.toggle-embed-source",
      title: titles["lotion.toggle-embed-source"],
      category: "Lotion",
      run: () => actions.toggleEmbedSourceVisibility()
    },
    {
      id: "lotion.toggle-favorite",
      title: titles["lotion.toggle-favorite"],
      category: "Lotion",
      run: () => actions.toggleFavoriteCurrent()
    },
    {
      id: "lotion.toggle-full-width",
      title: titles["lotion.toggle-full-width"],
      category: "Lotion",
      run: () => actions.toggleFullWidthCurrent()
    },
    {
      id: "lotion.toggle-small-text",
      title: titles["lotion.toggle-small-text"],
      category: "Lotion",
      run: () => actions.toggleSmallTextCurrent()
    },
    {
      id: "lotion.open-current-in-new-window",
      title: titles["lotion.open-current-in-new-window"],
      category: "Lotion",
      run: () => actions.openActiveInNewWindow()
    }
  ];

  return commands.map((command) => ({
    command,
    sourceName: copy.builtIn
  }));
}

function buildRecentSearchHits(
  recents: RecentItem[],
  pages: PageMeta[],
  databases: DatabaseSummary[],
  locale: Locale
): RecentSearchHit[] {
  const copy = searchCopy(locale);
  const pagesById = new Map(pages.map((page) => [page.id, page]));
  const databasesById = new Map(databases.map((database) => [database.id, database]));
  return recents.map((recent) => {
    if (recent.type === "page") {
      const page = pagesById.get(recent.id);
      return {
        recent,
        title: page?.title || copy.untitled,
        subtitle: recentSubtitle(copy.page, page?.path),
        kind: "page",
        icon: page?.icon
      };
    }
    if (recent.type === "database") {
      const database = databasesById.get(recent.id);
      return {
        recent,
        title: database?.name || copy.untitledDatabase,
        subtitle: recentSubtitle(copy.database, database?.path),
        kind: "database",
        icon: database?.icon
      };
    }
    const database = databasesById.get(recent.databaseId);
    return {
      recent,
      title: recent.title || copy.untitled,
      subtitle: recentSubtitle(database ? `${copy.page} · ${database.name}` : copy.page, database?.path),
      kind: "row_page",
      icon: recent.icon
    };
  });
}

function recentSubtitle(kind: string, path?: string[]): string {
  const parentPath = (path ?? []).slice(0, -1).filter(Boolean).join(" / ");
  return parentPath ? `${kind} · ${parentPath}` : kind;
}

function buildTagSearchHits(
  pages: PageMeta[],
  databases: DatabaseSummary[],
  query: string
): TagSearchHit[] {
  const normalizedQuery = normalizeTagSearchText(query);
  const canonicalQuery = normalizedQuery.startsWith("#") ? normalizedQuery.slice(1) : normalizedQuery;
  const tagCounts = new Map<string, { tag: string; pageCount: number; databaseCount: number }>();
  for (const page of pages) {
    for (const tag of uniqueTags(page.tags)) {
      if (isReservedSidebarTag(tag)) continue;
      ensureTagBucket(tagCounts, tag).pageCount += 1;
    }
  }
  for (const database of databases) {
    for (const tag of uniqueTags(database.tags)) {
      if (isReservedSidebarTag(tag)) continue;
      ensureTagBucket(tagCounts, tag).databaseCount += 1;
    }
  }
  return Array.from(tagCounts.values())
    .map((entry) => {
      const count = entry.pageCount + entry.databaseCount;
      return {
        tag: entry.tag,
        title: `#${entry.tag}`,
        pageCount: entry.pageCount,
        databaseCount: entry.databaseCount,
        count,
        score: scoreTag(entry.tag, normalizedQuery, canonicalQuery)
      };
    })
    .filter((entry) => !normalizedQuery || entry.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      b.count - a.count ||
      a.tag.localeCompare(b.tag)
    );
}

function uniqueTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const rawTag of tags ?? []) {
    const tag = rawTag.trim();
    if (!tag) continue;
    const key = normalizeTagSearchText(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(tag);
  }
  return values;
}

function ensureTagBucket(
  tagCounts: Map<string, { tag: string; pageCount: number; databaseCount: number }>,
  tag: string
): { tag: string; pageCount: number; databaseCount: number } {
  const key = normalizeTagSearchText(tag);
  let bucket = tagCounts.get(key);
  if (!bucket) {
    bucket = { tag, pageCount: 0, databaseCount: 0 };
    tagCounts.set(key, bucket);
  }
  return bucket;
}

function scoreTag(tag: string, normalizedQuery: string, canonicalQuery: string): number {
  if (!normalizedQuery) return 0;
  const normalizedTag = normalizeTagSearchText(tag);
  const withHash = `#${normalizedTag}`;
  if (normalizedTag === canonicalQuery || withHash === normalizedQuery) return 120;
  if (normalizedTag.startsWith(canonicalQuery) || withHash.startsWith(normalizedQuery)) return 105;
  if (normalizedTag.includes(canonicalQuery) || withHash.includes(normalizedQuery)) return 80;
  const tokens = canonicalQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => normalizedTag.includes(token))) return 55;
  return 0;
}

function normalizeTagSearchText(text: string): string {
  return text.trim().toLocaleLowerCase();
}

function isReservedSidebarTag(tag: string): boolean {
  const normalized = normalizeTagSearchText(tag);
  return normalized === "page" || normalized === "pages" || normalized === "database" || normalized === "databases";
}

function searchCommands(
  commands: CommandSearchEntry[],
  query: string,
  shortcutsById: Map<string, { display: string; disabled: boolean }>
): CommandSearchHit[] {
  const normalized = query.toLowerCase();
  if (!normalized) {
    return commands.map((entry) => ({
      ...entry,
      shortcutLabel: commandShortcutLabel(entry.command.id, shortcutsById),
      score: 0
    }));
  }
  return commands
    .map((entry, index) => ({
      ...entry,
      index,
      score: scoreCommand(entry.command, normalized)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      (a.command.category ?? "").localeCompare(b.command.category ?? "") ||
      a.command.title.localeCompare(b.command.title) ||
      a.index - b.index
    )
    .map(({ index: _index, ...entry }) => ({
      ...entry,
      shortcutLabel: commandShortcutLabel(entry.command.id, shortcutsById)
    }));
}

function scoreCommand(command: Command, query: string): number {
  const title = command.title.toLowerCase();
  const category = (command.category ?? "").toLowerCase();
  const id = command.id.toLowerCase();
  const combined = [title, category, id].join(" ");
  if (title === query) return 100;
  if (title.startsWith(query)) return 90;
  if (title.includes(query)) return 75;
  if (category.startsWith(query)) return 55;
  if (category.includes(query)) return 45;
  if (id.includes(query)) return 35;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => combined.includes(token))) return 30;
  return 0;
}

function renderCommandLabel(hit: CommandSearchHit, locale: Locale): React.ReactNode {
  const copy = searchCopy(locale);
  return (
    <>
      <span className="gs-kind-badge command">{copy.commandBadge}</span>
      <span className="gs-command-icon">⌘</span>
      <span className="gs-title">{hit.command.title}</span>
      {hit.shortcutLabel && <span className="gs-shortcut-label">{hit.shortcutLabel}</span>}
    </>
  );
}

function commandShortcutLabel(
  id: string,
  shortcutsById: Map<string, { display: string; disabled: boolean }>
): string | undefined {
  const shortcut = shortcutsById.get(id);
  if (!shortcut || shortcut.disabled) return undefined;
  return shortcut.display;
}

function renderCommandText(hit: CommandSearchHit): string {
  return [hit.command.category, hit.sourceName, hit.command.id]
    .filter(Boolean)
    .join(" · ");
}

function renderRecentLabel(hit: RecentSearchHit, locale: Locale): React.ReactNode {
  const copy = searchCopy(locale);
  return (
    <>
      <span className="gs-kind-badge recent">{copy.recentBadge}</span>
      <EntityIcon kind={hit.kind} icon={hit.icon} size={16} className="gs-entity-icon" />
      <span className="gs-title">{hit.title}</span>
    </>
  );
}

function renderTagLabel(hit: TagSearchHit, locale: Locale): React.ReactNode {
  const copy = searchCopy(locale);
  return (
    <>
      <span className="gs-kind-badge tag">{copy.tagBadge}</span>
      <span className="gs-tag-icon">#</span>
      <span className="gs-title">{hit.title}</span>
      <span className="gs-context">{locale === "zh" ? `${hit.count} 个项目` : `${hit.count} items`}</span>
    </>
  );
}

function renderTagText(hit: TagSearchHit, locale: Locale): string {
  const copy = searchCopy(locale);
  return locale === "zh"
    ? `${copy.tagPage} · ${hit.count} 个项目 · ${copy.page} ${hit.pageCount} · ${copy.database} ${hit.databaseCount}`
    : `${copy.tagPage} · ${hit.count} items · ${hit.pageCount} pages · ${hit.databaseCount} databases`;
}

function searchItemKey(item: SearchPanelItem, index: number): string {
  if (item.type === "command") return `command-${item.commandHit.command.id}-${index}`;
  if (item.type === "recent") {
    const recent = item.recentHit.recent;
    if (recent.type === "page") return `recent-page-${recent.id}-${index}`;
    if (recent.type === "database") return `recent-database-${recent.id}-${index}`;
    return `recent-row-page-${recent.databaseId}-${recent.rowId}-${index}`;
  }
  if (item.type === "tag") return `tag-${item.tagHit.tag}-${index}`;
  return `${item.hit.kind}-${item.hit.path}-${item.hit.line}-${index}`;
}

function renderLabel(hit: SearchHit, locale: Locale): React.ReactNode {
  const copy = searchCopy(locale);
  switch (hit.kind) {
    case "page":
      return (
        <>
          <KindBadge kind={hit.kind} locale={locale} />
          <MatchTypeBadge hit={hit} locale={locale} />
          <EntityIcon kind={iconKind(hit)} icon={hit.icon} size={16} className="gs-entity-icon" />
          {hit.databaseName && (
            <>
              <span className="gs-context">{hit.databaseName}</span>
              <span className="gs-sep">·</span>
            </>
          )}
          <span className="gs-title">{hit.title || hit.pageId}</span>
        </>
      );
    case "database":
      return (
        <>
          <KindBadge kind={hit.kind} locale={locale} />
          <MatchTypeBadge hit={hit} locale={locale} />
          <EntityIcon kind="database" icon={hit.icon} size={16} className="gs-entity-icon" />
          <span className="gs-title">{hit.databaseName}</span>
        </>
      );
    case "row":
      return (
        <>
          <KindBadge kind={hit.kind} locale={locale} />
          <MatchTypeBadge hit={hit} locale={locale} />
          <EntityIcon kind="row_page" icon={hit.icon} size={16} className="gs-entity-icon" />
          <span className="gs-context">{hit.databaseName}</span>
          <span className="gs-sep">·</span>
          <span className="gs-title">{hit.rowTitle || copy.untitled}</span>
        </>
      );
    case "rowPage":
      return (
        <>
          <KindBadge kind={hit.kind} locale={locale} />
          <MatchTypeBadge hit={hit} locale={locale} />
          <EntityIcon kind="row_page" icon={hit.icon} size={16} className="gs-entity-icon" />
          <span className="gs-context">{hit.databaseName}</span>
          <span className="gs-sep">·</span>
          <span className="gs-title">{hit.rowTitle || hit.pageFile.replace(/\.md$/, "")}</span>
        </>
      );
  }
}

function KindBadge({ kind, locale }: { kind: Kind; locale: Locale }) {
  return <span className="gs-kind-badge">{searchCopy(locale).groupLabel[kind]}</span>;
}

function MatchTypeBadge({ hit, locale }: { hit: SearchHit; locale: Locale }) {
  const matchType = hitPrimaryMatchType(hit);
  return <span className={`gs-match-badge ${matchType}`}>{searchCopy(locale).matchLabel[matchType]}</span>;
}

function iconKind(hit: SearchHit): EntityKind {
  if (hit.kind === "database") return "database";
  if (hit.kind === "row" || hit.kind === "rowPage") return "row_page";
  return hit.databaseId || hit.rowId || hit.pageFile ? "row_page" : "page";
}

function renderText(hit: SearchHit): React.ReactNode {
  if (!hit.ranges.length) return hit.text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(hit.text);
  for (let i = 0; i < hit.ranges.length; i += 1) {
    const range = hit.ranges[i];
    if (range.start > cursor) {
      parts.push(decoder.decode(bytes.slice(cursor, range.start)));
    }
    parts.push(<mark key={i}>{decoder.decode(bytes.slice(range.start, range.end))}</mark>);
    cursor = range.end;
  }
  if (cursor < bytes.length) parts.push(decoder.decode(bytes.slice(cursor)));
  return parts;
}

function hitMatchTypes(hit: SearchHit): SearchMatchType[] {
  const explicit = (hit.matchTypes ?? []).filter(isSearchMatchType);
  const primary = hitPrimaryMatchType(hit);
  return orderHitMatchTypes(explicit.length > 0 ? [...explicit, primary] : [primary]);
}

function countMatchTypes(hits: SearchHit[]): Record<SearchMatchType, number> {
  const counts: Record<SearchMatchType, number> = {
    title: 0,
    content: 0,
    reference: 0,
    database: 0
  };
  for (const hit of hits) {
    for (const type of hitMatchTypes(hit)) counts[type] += 1;
  }
  return counts;
}

function hitPrimaryMatchType(hit: SearchHit): SearchMatchType {
  return isSearchMatchType(hit.matchType) ? hit.matchType : inferMatchType(hit);
}

function inferMatchType(hit: SearchHit): SearchMatchType {
  if (hit.kind === "database") return "database";
  if (/schema\.json$/i.test(hit.path)) return "database";
  if (/^(Linked from|Related to):/i.test(hit.text)) return "reference";
  if (/^(Name|Path):/i.test(hit.text)) return "title";
  return "content";
}

function isSearchMatchType(value: unknown): value is SearchMatchType {
  return value === "title" || value === "content" || value === "reference" || value === "database";
}

function orderHitMatchTypes(types: SearchMatchType[]): SearchMatchType[] {
  const seen = new Set(types);
  return SEARCH_MATCH_TYPE_ORDER.filter((type) => seen.has(type));
}
