import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  DatabaseBundle,
  DatabaseRecord,
  DatabaseSummary,
  CreatePageInput,
  EntityRef,
  FavoriteItem,
  FieldSchema,
  PageDocument,
  PageMeta,
  RecentItemInput,
  RecordValue,
  RowPageDocument,
  SelectOption,
  StartupCacheDiagnostics
} from "../shared/types";
import { AppShell } from "./components/AppShell";
import { EntityIcon } from "./components/EntityIcon";
import { DatabaseCacheProvider, useDatabaseCache } from "./context/database-cache";
import { LotionActionsProvider, type LotionActions, type NavigationJumpOptions } from "./context/lotion-actions";
import type { PageEditorHandle, PageEditorViewState } from "./features/pages/PageEditor";
import type { PluginOpenRequest, SettingsOpenRequest } from "./features/manage/ManagementView";
import { StartupPerformancePanel } from "./features/startup/StartupPerformancePanel";
import {
  createStartupPerformanceReport,
  STARTUP_PHASES,
  type StartupCountKind,
  type StartupIndexOperationEntry,
  type StartupIndexOperationKey,
  type StartupPerformanceReport,
  type StartupPhaseEntry,
  type StartupPhaseKey,
  type StartupPhaseStatus
} from "./features/startup/startup-performance";
import { useI18n } from "./lib/i18n";
import { useSettings } from "./lib/settings";
import { perfLog } from "./lib/perf-log";
import { shortcutActionForEvent } from "../shared/shortcuts";
import { parseDatabaseViewLink } from "../shared/database-view-link";
import { parseDatabaseRowLink } from "../shared/database-row-link";
import { setRendererActivePageReader } from "./plugin-host";
import { ensureBuiltinPlugins, scheduleBuiltinPlugins } from "./plugin-host/builtin-loader";
import { initialAppState, tagFromManageKind, type ActiveItem, type ActiveRowPageRef, type AppState, type ManageKind } from "./state/app-store";

const DatabaseTable = lazy(() => import("./features/databases/DatabaseTable").then((module) => ({ default: module.DatabaseTable })));
const RowTemplateDialog = lazy(() => import("./features/databases/RowTemplateDialog").then((module) => ({ default: module.RowTemplateDialog })));
const PageEditor = lazy(() => import("./features/pages/PageEditor").then((module) => ({ default: module.PageEditor })));
const PageProperties = lazy(() => import("./features/pages/PageProperties").then((module) => ({ default: module.PageProperties })));
const RowPageProperties = lazy(() => import("./features/pages/RowPageProperties").then((module) => ({ default: module.RowPageProperties })));
const DatabaseTemplatePicker = lazy(() => import("./features/databases/DatabaseTemplatePicker").then((module) => ({ default: module.DatabaseTemplatePicker })));
const GlobalSearchPanel = lazy(() => import("./features/search/GlobalSearchPanel").then((module) => ({ default: module.GlobalSearchPanel })));
const SearchAiSurface = lazy(() => import("./features/search/SearchAiSurface").then((module) => ({ default: module.SearchAiSurface })));
const ManagementView = lazy(() => import("./features/manage/ManagementView").then((module) => ({ default: module.ManagementView })));

const MARKDOWN_SAVE_DEBOUNCE_MS = 500;

type NotificationLevel = "info" | "warn" | "error";

interface AppNotification {
  id: string;
  text: string;
  level: NotificationLevel;
}

export interface StartupLoadingState {
  startedAt: number;
  currentKey?: StartupPhaseKey;
  phases: StartupPhaseEntry[];
  error?: string;
}

interface StartupPhaseSnapshot {
  key: StartupPhaseKey;
  label: string;
  status: StartupPhaseStatus;
  ms?: number;
}

declare global {
  interface Window {
    __lotionStartupPhases?: StartupPhaseSnapshot[];
    __lotionStartupReport?: StartupPerformanceReport;
  }
}

function activeItemsEqual(a: ActiveItem, b: ActiveItem): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "page" && b.type === "page") return a.id === b.id;
  if (a.type === "database" && b.type === "database") return a.id === b.id;
  if (a.type === "row_page" && b.type === "row_page") {
    return a.databaseId === b.databaseId && a.rowId === b.rowId;
  }
  if (a.type === "manage" && b.type === "manage") return a.kind === b.kind;
  if (a.type === "startup" && b.type === "startup") return true;
  return false;
}

interface NavigationOptions extends NavigationJumpOptions {
  recordRecent?: boolean;
}

interface PendingNavigationAnchor {
  viewStateKey: string;
  requestKey: string;
  pos: number;
}

function openLog(label: string, detail: Record<string, unknown>) {
  console.log(`[lotion open] ${label}`, detail);
  try {
    window.lotion.debug.openLog(label, detail);
  } catch {
    // The Electron preload may not exist in tests or accidental browser use.
  }
}

function elapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(1));
}

function createStartupState(): StartupLoadingState {
  return {
    startedAt: performance.now(),
    phases: STARTUP_PHASES.map((phase) => ({ ...phase, status: "pending" }))
  };
}

function startupPhaseDelayMs(): number {
  const raw = Number(window.localStorage.getItem("lotion.debug.startupPhaseDelayMs") ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, 1000);
}

function startupPhaseSnapshot(state: StartupLoadingState): StartupPhaseSnapshot[] {
  return state.phases.map((phase) => ({
    key: phase.key,
    label: phase.label,
    status: phase.status,
    ms: phase.ms
  }));
}

export function App() {
  return (
    <DatabaseCacheProvider>
      <AppContent />
    </DatabaseCacheProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
  const {
    vimMode,
    setVimMode,
    rawMarkdown,
    setRawMarkdown,
    showEmbedSource,
    setShowEmbedSource,
    shortcutOverrides
  } = useSettings();
  const cache = useDatabaseCache();
  const [state, setState] = useState<AppState>(initialAppState);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchAiOpen, setSearchAiOpen] = useState(false);
  const [searchInitialPattern, setSearchInitialPattern] = useState("");
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [rowTemplateDialogOpen, setRowTemplateDialogOpen] = useState(false);
  const [peekRowPage, setPeekRowPage] = useState<{ ref: ActiveRowPageRef; mode: "side_peek" | "center_peek" } | null>(null);
  const peekOriginRef = useRef<HTMLElement | null>(null);
  const [navigationAnchor, setNavigationAnchor] = useState<PendingNavigationAnchor | null>(null);
  const [sidebarSettingsOpenRequest, setSidebarSettingsOpenRequest] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pluginOpenRequest, setPluginOpenRequest] = useState<PluginOpenRequest | undefined>();
  const [settingsOpenRequest, setSettingsOpenRequest] = useState<SettingsOpenRequest | undefined>();
  const [startup, setStartup] = useState<StartupLoadingState>(() => createStartupState());
  const [startupReport, setStartupReport] = useState<StartupPerformanceReport | null>(null);
  // Browser-style back/forward stack over active item navigation.
  const [history, setHistory] = useState<{ stack: ActiveItem[]; index: number }>({
    stack: [],
    index: -1
  });
  // When `goBack` / `goForward` re-applies a navigation, skip recording
  // it (or we'd erase forward history on every back).
  const skipHistoryRef = useRef(false);
  const pageMarkdownSaveTimersRef = useRef<Map<string, number>>(new Map());
  const pageMarkdownPendingRef = useRef<Map<string, string>>(new Map());
  const rowPageMarkdownSaveTimersRef = useRef<Map<string, number>>(new Map());
  const rowPageMarkdownPendingRef = useRef<Map<string, { databaseId: string; rowId: string; markdown: string }>>(new Map());
  const pageDocCacheRef = useRef<Map<string, PageDocument>>(new Map());
  const rowPageDocCacheRef = useRef<Map<string, RowPageDocument>>(new Map());
  const rowPageFileDocCacheRef = useRef<Map<string, RowPageDocument>>(new Map());
  const pageViewStatesRef = useRef<Map<string, PageEditorViewState>>(new Map());
  const activePageEditorRef = useRef<PageEditorHandle | null>(null);
  const activePageForPluginsRef = useRef<PageDocument | null>(null);
  const openEntityRef = useRef<(ref: EntityRef) => void>(() => undefined);
  const bootstrapStartedRef = useRef(false);
  const navigationVersionRef = useRef(0);
  const startupPhaseStartedRef = useRef<Map<StartupPhaseKey, number>>(new Map());
  const startupPhaseResultsRef = useRef<Map<StartupPhaseKey, StartupPhaseEntry>>(new Map());
  const startupIndexOperationsRef = useRef<Map<StartupIndexOperationKey, StartupIndexOperationEntry>>(new Map());
  const notificationTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => () => {
    void flushPendingMarkdownSaves();
  }, []);

  function closeRowPagePeek() {
    if (!peekRowPage) return false;
    void flushPendingMarkdownSaves();
    const rowId = peekRowPage.ref.rowId;
    setPeekRowPage(null);
    requestAnimationFrame(() => {
      if (peekOriginRef.current?.isConnected) peekOriginRef.current.focus({ preventScroll: true });
      else {
        const escapedRowId = CSS.escape(rowId);
        document.querySelector<HTMLElement>(`[data-row-id="${escapedRowId}"] .title-cell-open, .kanban-card[data-row-id="${escapedRowId}"], [data-row-id="${escapedRowId}"]`)?.focus({ preventScroll: true });
      }
    });
    return true;
  }

  useEffect(() => {
    if (!peekRowPage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeRowPagePeek();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [peekRowPage]);

  useEffect(() => () => {
    for (const timer of notificationTimersRef.current.values()) {
      window.clearTimeout(timer);
    }
    notificationTimersRef.current.clear();
  }, []);

  useEffect(() => {
    activePageForPluginsRef.current = state.activePage ?? null;
  }, [state.activePage]);

  useEffect(() => {
    const disposable = setRendererActivePageReader(() => activePageForPluginsRef.current);
    return () => disposable.dispose();
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string } | string>).detail;
      const target = parseDatabaseRowLink(typeof detail === "string" ? detail : detail?.url ?? "");
      if (target) openRowPage(target.databaseId, target.rowId);
    };
    window.addEventListener("lotion:open-database-row-link", handler);
    return () => window.removeEventListener("lotion:open-database-row-link", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const ref = (event as CustomEvent<EntityRef>).detail;
      if (!ref) return;
      openEntityRef.current(ref);
    };
    window.addEventListener("lotion:open-entity", handler);
    return () => window.removeEventListener("lotion:open-entity", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string } | string>).detail;
      const target = parseDatabaseViewLink(typeof detail === "string" ? detail : detail?.url ?? "");
      if (!target) return;
      window.localStorage.setItem(`lotion.database.lastActiveView.${target.databaseId}`, target.viewId);
      openEntityRef.current({ kind: "database", entityId: target.databaseId });
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("lotion:select-database-view", { detail: target })), 0);
    };
    window.addEventListener("lotion:open-database-view-link", handler);
    return () => window.removeEventListener("lotion:open-database-view-link", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ pattern?: unknown }>).detail;
      openSearch(String(detail?.pattern ?? ""));
    };
    window.addEventListener("lotion:open-search", handler);
    return () => window.removeEventListener("lotion:open-search", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ pluginId?: unknown; panel?: unknown }>).detail;
      const pluginId = typeof detail?.pluginId === "string" ? detail.pluginId.trim() : "";
      if (!pluginId) return;
      setPluginOpenRequest({
        pluginId,
        panel: detail?.panel === "settings" ? "settings" : "overview",
        requestId: Date.now()
      });
      openManage("plugins");
    };
    window.addEventListener("lotion:open-plugin-detail", handler);
    return () => window.removeEventListener("lotion:open-plugin-detail", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: unknown }>).detail;
      const section = typeof detail?.section === "string" ? detail.section.trim() : undefined;
      openSettingsCenter(section || undefined);
    };
    window.addEventListener("lotion:open-settings-center", handler);
    return () => window.removeEventListener("lotion:open-settings-center", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: unknown }>).detail?.kind;
      if (!isManageKind(kind)) return;
      openManage(kind);
    };
    window.addEventListener("lotion:open-manage", handler);
    return () => window.removeEventListener("lotion:open-manage", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: unknown; level?: unknown }>).detail;
      const text = String(detail?.text ?? "").trim();
      if (!text) return;
      const level: NotificationLevel = detail?.level === "warn" || detail?.level === "error" ? detail.level : "info";
      const id = `note_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      setNotifications((current) => [...current, { id, text, level }].slice(-3));
      const timer = window.setTimeout(() => {
        notificationTimersRef.current.delete(id);
        setNotifications((current) => current.filter((note) => note.id !== id));
      }, 4_500);
      notificationTimersRef.current.set(id, timer);
    };
    window.addEventListener("lotion:notify", handler);
    return () => window.removeEventListener("lotion:notify", handler);
  }, []);

  function dismissNotification(id: string) {
    const timer = notificationTimersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    notificationTimersRef.current.delete(id);
    setNotifications((current) => current.filter((note) => note.id !== id));
  }

  function recordHistory(item: ActiveItem) {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    setHistory((current) => {
      if (current.index >= 0 && activeItemsEqual(current.stack[current.index], item)) {
        return current;
      }
      const stack = current.stack.slice(0, current.index + 1);
      stack.push(item);
      return { stack, index: stack.length - 1 };
    });
  }

  async function applyNavigation(item: ActiveItem) {
    skipHistoryRef.current = true;
    if (item.type === "page") await selectPage(item.id, { recordRecent: false });
    else if (item.type === "database") await selectDatabase(item.id, { recordRecent: false });
    else if (item.type === "row_page") await openRowPage(item.databaseId, item.rowId, { recordRecent: false });
    else if (item.type === "manage") openManage(item.kind);
    else if (item.type === "startup") {
      setState((current) => ({
        ...current,
        activeItem: item,
        activePage: undefined,
        activeDatabaseId: undefined,
        activeRowPage: undefined
      }));
    }
  }

  function rememberPageViewState(key: string, viewState: PageEditorViewState) {
    pageViewStatesRef.current.set(key, viewState);
  }

  function prepareMarkdownLineAnchor(
    viewStateKey: string,
    markdown: string,
    line: number | undefined
  ): PendingNavigationAnchor | null {
    const linePos = markdownPositionForLine(markdown, line);
    const savedViewState = pageViewStatesRef.current.get(viewStateKey);
    const rawPos = linePos
      ?? savedViewState?.markdownAnchorPos
      ?? savedViewState?.selectionHead
      ?? savedViewState?.selectionAnchor;
    if (typeof rawPos !== "number" || !Number.isFinite(rawPos)) return null;
    const pos = Math.max(0, Math.min(rawPos, markdown.length));
    rememberPageViewState(viewStateKey, {
      ...savedViewState,
      selectionAnchor: pos,
      selectionHead: pos,
      markdownAnchorPos: pos
    });
    return {
      viewStateKey,
      requestKey: `${viewStateKey}:${pos}:${Date.now()}`,
      pos
    };
  }

  function persistActiveEditorViewState() {
    const item = state.activeItem;
    if (!item || (item.type !== "page" && item.type !== "row_page")) return;
    const viewState = activePageEditorRef.current?.getViewState();
    if (!viewState) return;
    const key = editorViewStateKey(item);
    rememberPageViewState(key, viewState);
  }

  async function goBack() {
    if (closeRowPagePeek()) return;
    if (history.index <= 0) return;
    const target = history.stack[history.index - 1];
    setHistory((current) => ({ ...current, index: current.index - 1 }));
    await applyNavigation(target);
  }

  async function goForward() {
    if (peekRowPage) return;
    if (history.index >= history.stack.length - 1) return;
    const target = history.stack[history.index + 1];
    setHistory((current) => ({ ...current, index: current.index + 1 }));
    await applyNavigation(target);
  }

  // Refs let the global mouse / keyboard listeners always call the
  // freshest closure without re-binding on every history change.
  const goBackRef = useRef(goBack);
  const goForwardRef = useRef(goForward);
  goBackRef.current = goBack;
  goForwardRef.current = goForward;
  // Tab actions exposed via ref so the keydown handler (attached once
  // at mount) sees the latest implementations.
  const newTabRef = useRef<() => void>(() => {});
  const closeTabRef = useRef<() => void>(() => {});
  const switchTabRef = useRef<(i: number) => void>(() => {});
  const shortcutOverridesRef = useRef(shortcutOverrides);
  shortcutOverridesRef.current = shortcutOverrides;
  const openSidebarSettingsRef = useRef<() => void>(() => {});
  openSidebarSettingsRef.current = () => setSidebarSettingsOpenRequest((current) => current + 1);

  useEffect(() => {
    function onMouseUp(event: MouseEvent) {
      // Standard 5-button mouse: button 3 = back, 4 = forward.
      if (event.button === 3) {
        event.preventDefault();
        void goBackRef.current();
      } else if (event.button === 4) {
        event.preventDefault();
        void goForwardRef.current();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      const action = shortcutActionForEvent(event, shortcutOverridesRef.current);
      if (!action) return;
      event.preventDefault();
      if (action === "lotion.history-back") {
        void goBackRef.current();
      } else if (action === "lotion.history-forward") {
        void goForwardRef.current();
      } else if (action === "lotion.open-search") {
        openSearch();
      } else if (action === "lotion.new-window") {
        void window.lotion.windows.openNew();
      } else if (action === "lotion.new-tab") {
        newTabRef.current();
      } else if (action === "lotion.close-tab") {
        closeTabRef.current();
      } else if (action.startsWith("lotion.switch-tab-")) {
        const index = Number(action.replace("lotion.switch-tab-", "")) - 1;
        if (Number.isFinite(index)) switchTabRef.current(index);
      } else if (action === "lotion.open-sidebar-settings") {
        openSidebarSettingsRef.current();
      }
    }
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (bootstrapStartedRef.current) return;
    bootstrapStartedRef.current = true;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateStartup(mutator: (current: StartupLoadingState) => StartupLoadingState) {
    setStartup((current) => {
      const next = mutator(current);
      window.__lotionStartupPhases = startupPhaseSnapshot(next);
      return next;
    });
  }

  async function runStartupPhase<T>(key: StartupPhaseKey, work: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    startupPhaseStartedRef.current.set(key, startedAt);
    updateStartup((current) => ({
      ...current,
      currentKey: key,
      phases: current.phases.map((phase) => (
        phase.key === key
          ? { ...phase, status: "active", ms: undefined }
          : phase
      ))
    }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const delayMs = startupPhaseDelayMs();
    if (delayMs > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
    }
    try {
      const result = await work();
      const ms = elapsedMs(startedAt);
      const completed: StartupPhaseEntry = {
        key,
        label: STARTUP_PHASES.find((phase) => phase.key === key)?.label ?? key,
        status: "done",
        ms
      };
      startupPhaseResultsRef.current.set(key, completed);
      updateStartup((current) => ({
        ...current,
        currentKey: current.currentKey === key ? undefined : current.currentKey,
        phases: current.phases.map((phase) => (
          phase.key === key ? { ...phase, status: "done", ms } : phase
        ))
      }));
      console.log(`[lotion startup] ${key} ${ms}ms`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const ms = elapsedMs(startedAt);
      startupPhaseResultsRef.current.set(key, {
        key,
        label: STARTUP_PHASES.find((phase) => phase.key === key)?.label ?? key,
        status: "error",
        ms
      });
      updateStartup((current) => ({
        ...current,
        currentKey: key,
        error: message,
        phases: current.phases.map((phase) => (
          phase.key === key ? { ...phase, status: "error", ms } : phase
        ))
      }));
      console.warn(`[lotion startup] ${key} failed after ${ms}ms`, error);
      throw error;
    }
  }

  async function runStartupIndexOperation<T>(
    key: StartupIndexOperationKey,
    work: () => Promise<T>,
    describe?: (result: T) => { count: number; countKind: StartupCountKind }
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      const result = await work();
      const detail = describe?.(result);
      startupIndexOperationsRef.current.set(key, {
        key,
        ms: elapsedMs(startedAt),
        status: "done",
        ...detail
      });
      return result;
    } catch (error) {
      startupIndexOperationsRef.current.set(key, {
        key,
        ms: elapsedMs(startedAt),
        status: "error"
      });
      throw error;
    }
  }

  // Persist tabs on every tab-shape or active-tab change. Skipping
  // while loading avoids overwriting saved state with the empty
  // initial-state placeholder before bootstrap has restored it.
  useEffect(() => {
    if (state.isLoading) return;
    writePersistedTabs(state);
  }, [state.tabs, state.activeTabIndex, state.isLoading]);

  async function bootstrap() {
    const navigationVersionAtStart = navigationVersionRef.current;
    try {
      if (!window.lotion?.workspace) {
        throw new Error("Lotion needs the Electron preload API. Start it with `npm run dev` and use the Electron window instead of opening the Vite URL in a normal browser.");
      }
      const manifest = await runStartupPhase("workspace", async () => {
        await window.lotion.runtime.ready();
        return window.lotion.workspace.open();
      });
      const { pages, databases, pagesTree, cache: startupCache, favorites, recents, workspacePath } = await runStartupPhase("index", async () => {
        const [startupIndex, nextFavorites, nextRecents, recentWorkspaces] = await Promise.all([
          runStartupIndexOperation("workspaceIndex", () => window.lotion.workspace.getStartupIndex(), (index) => ({
            count: index.pagesTree.topLevelPages.length + index.pagesTree.databases.reduce((total, database) => total + database.fileNames.length, 0),
            countKind: "entries"
          })),
          runStartupIndexOperation("favorites", () => window.lotion.favorites.list(), (items) => ({
            count: items.length,
            countKind: "items"
          })),
          runStartupIndexOperation("recents", () => window.lotion.workspace.listRecents(), (items) => ({
            count: items.length,
            countKind: "items"
          })),
          runStartupIndexOperation("workspacePath", () => window.lotion.workspace.listRecent(), (items) => ({
            count: items.length,
            countKind: "items"
          }))
        ]);
        return {
          pages: startupIndex.pages,
          databases: startupIndex.databases,
          pagesTree: startupIndex.pagesTree,
          cache: startupIndex.cache,
          favorites: nextFavorites,
          recents: nextRecents,
          workspacePath: recentWorkspaces[0]?.path
        };
      });
      // A "move tab to new window" envelope outranks the persisted
      // tabs — when present we open with just that one tab.
      const handed = takeNextWindowInit();
      const rawRestored = handed
        ? { tabs: [{ id: `tab_${Date.now()}`, item: handed.item }], activeTabIndex: 0 }
        : readPersistedTabs();
      const restored = rawRestored ? sanitizePersistedTabs(rawRestored, pages, databases) : null;
      setState((current) => {
        let tabs = restored?.tabs ?? current.tabs;
        const activeTabIndex = restored?.activeTabIndex ?? current.activeTabIndex;
        if (!tabs[activeTabIndex]?.item && pages[0]) {
          tabs = tabs.map((tab, index) => (
            index === activeTabIndex
              ? { ...tab, item: { type: "page", id: pages[0].id } as ActiveItem }
              : tab
          ));
        }
        return {
          ...current,
          manifest,
          pages,
          databases,
          pagesTree,
          favorites,
          recents,
          isLoading: true,
          tabs,
          activeTabIndex
        };
      });

      await runStartupPhase("navigation", async () => {
        // The per-launch diagnostics tab becomes active immediately below.
        // Keep restored tabs as lightweight descriptors and hydrate their
        // content only when the user switches back to one of them.
        await Promise.resolve();
      });
      await runStartupPhase("paint", async () => {
        setState((current) => ({ ...current, isLoading: false }));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      const report = createStartupPerformanceReport({
        startedAt: startup.startedAt,
        completedAt: performance.now(),
        phases: STARTUP_PHASES.map((phase) => (
          startupPhaseResultsRef.current.get(phase.key) ?? { ...phase, status: "pending" }
        )),
        indexOperations: startupIndexOperationsRef.current.values(),
        workspace: {
          name: manifest.name,
          path: workspacePath,
          pages: pages.length,
          databases: databases.length
        },
        cache: startupCache
      });
      setStartupReport(report);
      window.__lotionStartupReport = report;
      setState((current) => {
        const tabs = current.tabs.filter((tab) => tab.item?.type !== "startup");
        const activeTabId = current.tabs[current.activeTabIndex]?.id;
        const returnTabId = tabs.find((tab) => tab.id === activeTabId)?.id
          ?? activeTabId
          ?? tabs[0]?.id;
        const item: ActiveItem = { type: "startup", returnTabId };
        const startupTab = { id: `startup_${Date.now()}`, item };
        if (navigationVersionRef.current !== navigationVersionAtStart) {
          const activeTabIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTabId));
          return {
            ...current,
            tabs: [...tabs, startupTab],
            activeTabIndex
          };
        }
        return {
          ...current,
          tabs: [...tabs, startupTab],
          activeTabIndex: tabs.length,
          activeItem: item,
          activePage: undefined,
          activeDatabaseId: undefined,
          activeRowPage: undefined
        };
      });
      scheduleBuiltinPlugins();
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }

  async function refreshLists() {
    const [manifest, startupIndex, favorites, recents] = await Promise.all([
      window.lotion.workspace.getManifest(),
      window.lotion.workspace.getStartupIndex(),
      window.lotion.favorites.list(),
      window.lotion.workspace.listRecents()
    ]);
    setState((current) => ({
      ...current,
      manifest,
      pages: startupIndex.pages,
      databases: startupIndex.databases,
      pagesTree: startupIndex.pagesTree,
      favorites,
      recents
    }));
  }

  /** Push a navigation onto the manifest's recents list, then sync the
   *  cached recents from the response without a full refreshLists round-trip. */
  async function recordRecent(item: RecentItemInput) {
    try {
      const manifest = await window.lotion.workspace.pushRecent(item);
      setState((current) => ({ ...current, manifest, recents: manifest.recents ?? [] }));
    } catch (error) {
      console.warn("[lotion] failed to record recent item:", error);
    }
  }

  function openManage(kind: ManageKind) {
    navigationVersionRef.current += 1;
    persistActiveEditorViewState();
    void flushPendingMarkdownSaves();
    recordHistory({ type: "manage", kind });
    setState((current) => ({
      ...current,
      activeItem: { type: "manage", kind },
      activePage: undefined,
      activeDatabaseId: undefined,
      activeRowPage: undefined,
      ...activateItemInTabs(current, { type: "manage", kind })
    }));
  }

  function openSettingsCenter(section?: string) {
    setSettingsOpenRequest({ section, requestId: Date.now() });
    openManage("settings");
  }

  // ── Tabs ─────────────────────────────────────────────────────────

  newTabRef.current = newTab;
  closeTabRef.current = () => closeTab(state.activeTabIndex);
  switchTabRef.current = (i: number) => { void switchTab(i); };

  function newTab() {
    persistActiveEditorViewState();
    void flushPendingMarkdownSaves();
    setState((current) => ({
      ...current,
      tabs: [...current.tabs, { id: `tab_${Date.now()}_${current.tabs.length}` }],
      activeTabIndex: current.tabs.length,
      activeItem: undefined,
      activePage: undefined,
      activeDatabaseId: undefined,
      activeRowPage: undefined
    }));
  }

  function closeTab(index: number) {
    if (index === state.activeTabIndex) persistActiveEditorViewState();
    void flushPendingMarkdownSaves();
    setState((current) => {
      if (current.tabs[index]?.item?.type === "startup") return current;
      if (current.tabs.length <= 1) return current; // never leave zero tabs
      const tabs = current.tabs.filter((_, i) => i !== index);
      let nextIndex = current.activeTabIndex;
      if (index < current.activeTabIndex) nextIndex -= 1;
      else if (index === current.activeTabIndex) nextIndex = Math.min(index, tabs.length - 1);
      return { ...current, tabs, activeTabIndex: nextIndex };
    });
  }

  function moveTabToNewWindow(index: number) {
    if (index === state.activeTabIndex) persistActiveEditorViewState();
    const tab = state.tabs[index];
    if (!tab?.item || tab.item.type === "startup") return;
    // Stash the tab content for the new window's bootstrap, then open
    // it. Removing the tab here vs. after the new window confirms is
    // a deliberate optimistic choice — the new window can't reject the
    // payload anyway.
    dropNextWindowInit({ item: tab.item });
    void window.lotion.windows.openNew();
    // If this was the only tab, replace it with a fresh blank tab
    // instead of leaving the strip empty.
    setState((current) => {
      if (current.tabs.length <= 1) {
        return {
          ...current,
          tabs: [{ id: `tab_${Date.now()}` }],
          activeTabIndex: 0,
          activeItem: undefined,
          activePage: undefined,
          activeDatabaseId: undefined,
          activeRowPage: undefined
        };
      }
      const tabs = current.tabs.filter((_, i) => i !== index);
      let nextIndex = current.activeTabIndex;
      if (index < current.activeTabIndex) nextIndex -= 1;
      else if (index === current.activeTabIndex) nextIndex = Math.min(index, tabs.length - 1);
      return { ...current, tabs, activeTabIndex: nextIndex };
    });
  }

  function openItemInNewWindow(item: ActiveItem | undefined = state.activeItem) {
    if (!item || item.type === "startup") {
      void window.lotion.windows.openNew();
      return;
    }
    persistActiveEditorViewState();
    void flushPendingMarkdownSaves();
    dropNextWindowInit({ item });
    void window.lotion.windows.openNew();
  }

  function reorderTabs(source: number, target: number) {
    setState((current) => {
      if (
        source < 0 || source >= current.tabs.length ||
        target < 0 || target >= current.tabs.length ||
        source === target ||
        current.tabs[source]?.item?.type === "startup" ||
        current.tabs[target]?.item?.type === "startup"
      ) return current;
      const tabs = current.tabs.slice();
      const [moved] = tabs.splice(source, 1);
      tabs.splice(target, 0, moved);
      // Re-point activeTabIndex to wherever the active tab landed.
      let nextActive = current.activeTabIndex;
      if (current.activeTabIndex === source) {
        nextActive = target;
      } else if (source < current.activeTabIndex && target >= current.activeTabIndex) {
        nextActive -= 1;
      } else if (source > current.activeTabIndex && target <= current.activeTabIndex) {
        nextActive += 1;
      }
      return { ...current, tabs, activeTabIndex: nextActive };
    });
  }

  async function switchTab(index: number) {
    if (index < 0 || index >= state.tabs.length) return;
    persistActiveEditorViewState();
    await flushPendingMarkdownSaves();
    const target = state.tabs[index];
    let item = isActiveItemAvailable(target.item, state.pages, state.databases) ? target.item : undefined;
    if (item?.type === "startup") {
      const previousTab = state.tabs[state.activeTabIndex];
      const returnTabId = previousTab?.item?.type === "startup"
        ? item.returnTabId
        : previousTab?.id;
      item = { ...item, returnTabId };
    }
    setState((current) => ({
      ...current,
      activeTabIndex: index,
      activeItem: item,
      activePage: undefined,
      activeDatabaseId: undefined,
      activeRowPage: undefined,
      tabs: item === target.item
        ? current.tabs
        : current.tabs.map((tab, i) => (i === index ? { ...tab, item } : tab))
    }));
    if (!item) return;
    if (item.type === "page") await selectPage(item.id);
    else if (item.type === "database") await selectDatabase(item.id);
    else if (item.type === "row_page") await openRowPage(item.databaseId, item.rowId);
    else if (item.type === "manage") openManage(item.kind);
  }

  async function toggleFavoriteCurrent() {
    let item: FavoriteItem | null = null;
    if (state.activePage) {
      item = { type: "page", id: state.activePage.meta.id };
    } else if (state.activeRowPage) {
      item = {
        type: "row_page",
        databaseId: state.activeRowPage.databaseId,
        rowId: state.activeRowPage.rowId
      };
    }
    if (!item) return;
    const manifest = await window.lotion.favorites.toggle(item);
    setState((current) => ({ ...current, manifest, favorites: manifest.favorites ?? [] }));
  }

  async function toggleFullWidthCurrent() {
    if (state.activePage) {
      const next = !state.activePage.meta.fullWidth;
      await updatePageProperties(state.activePage.meta.id, { fullWidth: next });
      return;
    }
    if (state.activeRowPage) {
      const next = !state.activeRowPage.fullWidth;
      await updateRowPageFullWidth(state.activeRowPage.databaseId, state.activeRowPage.rowId, next);
    }
  }

  async function toggleSmallTextCurrent() {
    if (state.activePage) {
      const next = !state.activePage.meta.smallText;
      await updatePageProperties(state.activePage.meta.id, { smallText: next });
      return;
    }
    if (state.activeRowPage) {
      const next = !state.activeRowPage.meta?.smallText;
      await updateRowPageSmallText(state.activeRowPage.databaseId, state.activeRowPage.rowId, next);
    }
  }

  async function refreshPagesTree() {
    const pagesTree = await window.lotion.workspace.getPagesTree();
    setState((current) => ({ ...current, pagesTree }));
  }

  async function createPage(input: Partial<CreatePageInput> = {}) {
    const title = input.title?.trim() || t("common.untitled");
    const page = await window.lotion.pages.create({
      title,
      ...(input.path ? { path: input.path } : {}),
      ...(input.parentId ? { parentId: input.parentId, parentKind: input.parentKind ?? "page" } : {})
    });
    setState((current) => ({
      ...current,
      pages: [
        page.meta,
        ...current.pages.filter((item) => item.id !== page.meta.id)
      ],
      activeItem: { type: "page", id: page.meta.id },
      activePage: page,
      activeDatabaseId: undefined,
      activeRowPage: undefined,
      ...activateItemInTabs(current, { type: "page", id: page.meta.id })
    }));
    await recordRecent({ type: "page", id: page.meta.id });
    void refreshLists().catch((error) => {
      console.warn("[lotion] failed to refresh lists after creating page:", error);
    });
  }

  function createDatabase() {
    // Surface the template picker instead of creating an empty DB
    // immediately. The picker resolves to a CreateDatabaseInput via
    // `template.buildInput()`, which we then send to the IPC.
    setTemplatePickerOpen(true);
  }

  function openSearch(initialPattern = "") {
    setSearchInitialPattern(initialPattern);
    setSearchOpen(true);
  }

  function openSearchAi() {
    setSearchAiOpen(true);
  }

  async function deletePage(id: string) {
    await flushPendingMarkdownSaves();
    await window.lotion.pages.delete(id);
    pageDocCacheRef.current.delete(id);
    pageViewStatesRef.current.delete(editorViewStateKey({ type: "page", id }));
    await refreshLists();
    setState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (
        tab.item?.type === "page" && tab.item.id === id ? { ...tab, item: undefined } : tab
      ))
    }));
    if (state.activeItem?.type === "page" && state.activeItem.id === id) {
      openManage("pages");
    }
  }

  async function createDatabaseFromInput(input: { name: string; template?: { fields?: unknown[]; rows?: unknown[] } }) {
    const bundle = await cache.createDatabase(input as Parameters<typeof cache.createDatabase>[0]);
    await refreshLists();
    await recordRecent({ type: "database", id: bundle.schema.id });
    setState((current) => ({
      ...current,
      activeItem: { type: "database", id: bundle.schema.id },
      activeDatabaseId: bundle.schema.id,
      activePage: undefined,
      activeRowPage: undefined
    }));
  }

  async function selectPage(id: string, options: NavigationOptions = {}) {
    navigationVersionRef.current += 1;
    const startedAt = performance.now();
    persistActiveEditorViewState();
    const flushStartedAt = performance.now();
    await flushPendingMarkdownSaves();
    const flushMs = elapsedMs(flushStartedAt);
    let page = pageDocCacheRef.current.get(id);
    const cacheHit = !!page;
    const fetchStartedAt = performance.now();
    if (!page) {
      page = await window.lotion.pages.get(id);
      pageDocCacheRef.current.set(id, page);
    }
    const fetchMs = elapsedMs(fetchStartedAt);
    const item: ActiveItem = { type: "page", id };
    const viewStateKey = editorViewStateKey(item);
    const pendingAnchor = prepareMarkdownLineAnchor(viewStateKey, page.markdown, options.markdownLine);
    setNavigationAnchor(pendingAnchor);
    recordHistory(item);
    if (options.recordRecent !== false) void recordRecent({ type: "page", id });
    openLog("page.ready", {
      id,
      title: page.meta.title,
      cacheHit,
      recordRecent: options.recordRecent !== false,
      flushMs,
      fetchMs,
      markdownLength: page.markdown.length,
      totalBeforeStateMs: elapsedMs(startedAt)
    });
    setState((current) => ({
      ...current,
      activeItem: item,
      activePage: page,
      activeDatabaseId: undefined,
      activeRowPage: undefined,
      ...activateItemInTabs(current, item)
    }));
    requestAnimationFrame(() => {
      openLog("page.paint", {
        id,
        title: page.meta.title,
        totalMs: elapsedMs(startedAt)
      });
    });
  }

  async function selectDatabase(id: string, options: NavigationOptions = {}) {
    navigationVersionRef.current += 1;
    await ensureBuiltinPlugins();
    persistActiveEditorViewState();
    await flushPendingMarkdownSaves();
    setNavigationAnchor(null);
    const t0 = performance.now();
    console.log(`[lotion] db load click id=${id}`);
    const bundle = await cache.loadBundle(id);
    const t1 = performance.now();
    const ipcMs = t1 - t0;
    console.log(
      `[lotion] db load ipc   id=${id} rows=${bundle.records.length} fields=${bundle.schema.fields.length} views=${bundle.views.length} ipc=${ipcMs.toFixed(1)}ms`
    );
    recordHistory({ type: "database", id });
    if (options.recordRecent !== false) void recordRecent({ type: "database", id });
    setState((current) => ({
      ...current,
      activeItem: { type: "database", id },
      activeDatabaseId: id,
      activeDatabaseLoadMs: ipcMs,
      activePage: undefined,
      activeRowPage: undefined,
      ...activateItemInTabs(current, { type: "database", id })
    }));
    requestAnimationFrame(() => {
      console.log(
        `[lotion] db load paint id=${id} rows=${bundle.records.length} total=${(performance.now() - t0).toFixed(1)}ms`
      );
    });
  }

  async function savePage(markdown: string) {
    if (!state.activePage) return;
    const pageId = state.activePage.meta.id;
    const page = { ...state.activePage, markdown };
    pageDocCacheRef.current.set(pageId, page);
    activePageForPluginsRef.current = page;
    schedulePageMarkdownSave(pageId, markdown);
  }

  function schedulePageMarkdownSave(pageId: string, markdown: string) {
    const existingTimer = pageMarkdownSaveTimersRef.current.get(pageId);
    if (existingTimer) window.clearTimeout(existingTimer);
    pageMarkdownPendingRef.current.set(pageId, markdown);
    perfLog("page.save.schedule", {
      pageId,
      markdownLength: markdown.length,
      debounceMs: MARKDOWN_SAVE_DEBOUNCE_MS,
      replacedTimer: !!existingTimer
    });
    const timer = window.setTimeout(() => {
      pageMarkdownSaveTimersRef.current.delete(pageId);
      const pending = pageMarkdownPendingRef.current.get(pageId);
      pageMarkdownPendingRef.current.delete(pageId);
      if (pending !== undefined) void persistPageMarkdown(pageId, pending);
    }, MARKDOWN_SAVE_DEBOUNCE_MS);
    pageMarkdownSaveTimersRef.current.set(pageId, timer);
  }

  async function persistPageMarkdown(pageId: string, markdown: string) {
    const start = performance.now();
    await window.lotion.pages.update(pageId, { markdown });
    const cached = pageDocCacheRef.current.get(pageId);
    if (cached) pageDocCacheRef.current.set(pageId, { ...cached, markdown });
    perfLog("page.save.persist", {
      pageId,
      ms: Number((performance.now() - start).toFixed(1)),
      markdownLength: markdown.length
    });
  }

  async function updatePageProperties(
    pageId: string,
    input: { tags?: string[]; date?: string; url?: string; coverOffset?: number; fullWidth?: boolean; smallText?: boolean }
  ) {
    const startedAt = performance.now();
    openLog("page.properties.persist", {
      pageId,
      fields: Object.keys(input)
    });
    const page = await window.lotion.pages.update(pageId, input);
    openLog("page.properties.persisted", {
      pageId,
      fields: Object.keys(input),
      ms: elapsedMs(startedAt)
    });
    pageDocCacheRef.current.set(pageId, page);
    setState((current) => ({
      ...current,
      pages: current.pages.map((item) => (item.id === pageId ? page.meta : item)),
      activePage: current.activePage?.meta.id === pageId ? page : current.activePage
    }));
  }

  async function pickIconForPage(pageId: string) {
    const result = await window.lotion.icons.setForPage(pageId);
    if (!result.iconPath) return;
    // Re-fetch the page to pick up its new meta.icon, and refresh
    // sidebar lists so the new icon shows everywhere.
    await refreshLists();
    if (state.activePage?.meta.id === pageId) {
      const page = await window.lotion.pages.get(pageId);
      setState((current) => ({ ...current, activePage: page }));
    }
  }

  async function pickIconForDatabase(databaseId: string) {
    const result = await window.lotion.icons.setForDatabase(databaseId);
    if (!result.iconPath) return;
    cache.invalidate(databaseId);
    await refreshLists();
    if (state.activeDatabaseId === databaseId) {
      await cache.loadBundle(databaseId);
      setState((current) => ({ ...current }));
    }
  }

  async function pickCoverForPage(pageId: string) {
    const result = await window.lotion.covers.setForPage(pageId);
    if (!result.coverPath) return;
    if (state.activePage?.meta.id === pageId) {
      const page = await window.lotion.pages.get(pageId);
      setState((current) => ({ ...current, activePage: page }));
    }
  }

  async function clearCoverForPage(pageId: string) {
    await window.lotion.covers.clearForPage(pageId);
    if (state.activePage?.meta.id === pageId) {
      const page = await window.lotion.pages.get(pageId);
      setState((current) => ({ ...current, activePage: page }));
    }
  }

  async function pickCoverForDatabase(databaseId: string) {
    const result = await window.lotion.covers.setForDatabase(databaseId);
    if (!result.coverPath) return;
    cache.invalidate(databaseId);
    if (state.activeDatabaseId === databaseId) {
      await cache.loadBundle(databaseId);
      setState((current) => ({ ...current }));
    }
  }

  async function clearCoverForDatabase(databaseId: string) {
    await window.lotion.covers.clearForDatabase(databaseId);
    cache.invalidate(databaseId);
    if (state.activeDatabaseId === databaseId) {
      await cache.loadBundle(databaseId);
      setState((current) => ({ ...current }));
    }
  }

  async function updateDatabaseCoverOffset(databaseId: string, offset: number) {
    await window.lotion.covers.setOffsetForDatabase(databaseId, offset);
    cache.invalidate(databaseId);
    if (state.activeDatabaseId === databaseId) {
      await cache.loadBundle(databaseId);
      setState((current) => ({ ...current }));
    }
  }

  async function updateDatabaseTags(databaseId: string, tags: string[]) {
    const bundle = await cache.updateMeta({ databaseId, tags });
    setState((current) => ({
      ...current,
      databases: current.databases.map((database) =>
        database.id === databaseId ? { ...database, tags: bundle.schema.tags } : database
      )
    }));
  }

  async function pickCoverForRow(databaseId: string, rowId: string) {
    const result = await window.lotion.covers.setForRow(databaseId, rowId);
    if (!result.coverPath) return;
    cache.invalidate(databaseId);
    await cache.loadBundle(databaseId);
    setState((current) => ({ ...current }));
  }

  async function clearCoverForRow(databaseId: string, rowId: string) {
    await window.lotion.covers.clearForRow(databaseId, rowId);
    cache.invalidate(databaseId);
    await cache.loadBundle(databaseId);
    setState((current) => ({ ...current }));
  }

  async function updateRowCoverOffset(databaseId: string, rowId: string, offset: number) {
    await window.lotion.covers.setOffsetForRow(databaseId, rowId, offset);
    cache.invalidate(databaseId);
    await cache.loadBundle(databaseId);
    setState((current) => ({ ...current }));
  }

  async function updateRowPageFullWidth(databaseId: string, rowId: string, fullWidth: boolean) {
    const doc = await cache.setRowPageFullWidth({ databaseId, rowId, fullWidth });
    rememberRowPageDoc(doc);
    setState((current) =>
      current.activeRowPage && current.activeRowPage.databaseId === databaseId && current.activeRowPage.rowId === rowId
        ? { ...current, activeRowPage: { ...current.activeRowPage, meta: doc.meta, title: doc.title || current.activeRowPage.title, fullWidth: doc.fullWidth } }
        : current
    );
    setPeekRowPage((current) => current && current.ref.databaseId === databaseId && current.ref.rowId === rowId
      ? { ...current, ref: { ...current.ref, meta: doc.meta, title: doc.title || current.ref.title, fullWidth: doc.fullWidth } }
      : current);
  }

  async function updateRowPageSmallText(databaseId: string, rowId: string, smallText: boolean) {
    const doc = await cache.setRowPageSmallText({ databaseId, rowId, smallText });
    rememberRowPageDoc(doc);
    setState((current) =>
      current.activeRowPage && current.activeRowPage.databaseId === databaseId && current.activeRowPage.rowId === rowId
        ? { ...current, activeRowPage: { ...current.activeRowPage, meta: doc.meta, title: doc.title || current.activeRowPage.title } }
        : current
    );
    setPeekRowPage((current) => current && current.ref.databaseId === databaseId && current.ref.rowId === rowId
      ? { ...current, ref: { ...current.ref, meta: doc.meta, title: doc.title || current.ref.title } }
      : current);
  }

  async function renamePage(pageId: string, title: string) {
    const page = await window.lotion.pages.rename(pageId, title);
    await refreshLists();
    setState((currentState) => ({
      ...currentState,
      activePage: currentState.activePage?.meta.id === pageId ? page : currentState.activePage
    }));
  }

  async function openRowPage(databaseId: string, rowId: string, options: NavigationOptions = {}) {
    navigationVersionRef.current += 1;
    await ensureBuiltinPlugins();
    const startedAt = performance.now();
    const peekMode = options.pageOpenMode === "side_peek" || options.pageOpenMode === "center_peek" ? options.pageOpenMode : undefined;
    if (peekMode) {
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      peekOriginRef.current = options.peekOrigin?.isConnected
        ? options.peekOrigin
        : activeElement?.closest("[data-row-id]")
        ? activeElement
        : document.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"] .title-cell-open`);
    }
    persistActiveEditorViewState();
    const flushStartedAt = performance.now();
    await flushPendingMarkdownSaves();
    const flushMs = elapsedMs(flushStartedAt);
    const cacheKey = rowPageMarkdownKey(databaseId, rowId);
    let doc = rowPageDocCacheRef.current.get(cacheKey);
    const cacheHit = !!doc;
    const fetchStartedAt = performance.now();
    if (!doc) {
      doc = await cache.openRowPage(databaseId, rowId);
      rememberRowPageDoc(doc);
    } else if (!cache.getBundle(databaseId)) {
      await cache.loadBundle(databaseId);
    }
    const fetchMs = elapsedMs(fetchStartedAt);
    const ref: ActiveRowPageRef = { databaseId, rowId, meta: doc.meta, title: doc.title, markdown: doc.markdown, fullWidth: doc.fullWidth };
    if (peekMode) {
      setPeekRowPage({ ref, mode: peekMode });
      if (options.recordRecent !== false) void recordRecent({ type: "row_page", databaseId, rowId, title: doc.title, icon: rowIconFromRecord(doc.record) });
      return;
    }
    const item = rowPageActiveItem(databaseId, rowId, doc.title);
    const viewStateKey = editorViewStateKey(item);
    const pendingAnchor = prepareMarkdownLineAnchor(viewStateKey, doc.markdown, options.markdownLine);
    setNavigationAnchor(pendingAnchor);
    recordHistory(item);
    if (options.recordRecent !== false) {
      void recordRecent({ type: "row_page", databaseId, rowId, title: doc.title, icon: rowIconFromRecord(doc.record) });
    }
    openLog("rowPage.ready", {
      databaseId,
      rowId,
      title: doc.title,
      cacheHit,
      recordRecent: options.recordRecent !== false,
      flushMs,
      fetchMs,
      markdownLength: doc.markdown.length,
      fieldCount: doc.schema.fields.length,
      totalBeforeStateMs: elapsedMs(startedAt)
    });
    setState((current) => ({
      ...current,
      activeItem: item,
      activeRowPage: ref,
      activePage: undefined,
      activeDatabaseId: undefined,
      ...activateItemInTabs(current, item)
    }));
    requestAnimationFrame(() => {
      openLog("rowPage.paint", {
        databaseId,
        rowId,
        title: doc.title,
        totalMs: elapsedMs(startedAt)
      });
    });
  }

  async function openRowPageByFile(databaseId: string, fileName: string, options: NavigationOptions = {}) {
    const startedAt = performance.now();
    persistActiveEditorViewState();
    const flushStartedAt = performance.now();
    await flushPendingMarkdownSaves();
    const flushMs = elapsedMs(flushStartedAt);
    const cacheKey = rowPageFileCacheKey(databaseId, fileName);
    let doc = rowPageFileDocCacheRef.current.get(cacheKey);
    const cacheHit = !!doc;
    const fetchStartedAt = performance.now();
    if (!doc) {
      doc = await cache.openRowPageByFile(databaseId, fileName);
      rememberRowPageDoc(doc);
    } else if (!cache.getBundle(databaseId)) {
      await cache.loadBundle(databaseId);
    }
    const fetchMs = elapsedMs(fetchStartedAt);
    const ref: ActiveRowPageRef = {
      databaseId,
      rowId: doc.rowId,
      meta: doc.meta,
      title: doc.title,
      markdown: doc.markdown,
      fullWidth: doc.fullWidth
    };
    const item = rowPageActiveItem(databaseId, doc.rowId, doc.title);
    const viewStateKey = editorViewStateKey(item);
    const pendingAnchor = prepareMarkdownLineAnchor(viewStateKey, doc.markdown, options.markdownLine);
    setNavigationAnchor(pendingAnchor);
    recordHistory(item);
    if (options.recordRecent !== false) {
      void recordRecent({
        type: "row_page",
        databaseId,
        rowId: doc.rowId,
        title: doc.title,
        icon: rowIconFromRecord(doc.record)
      });
    }
    openLog("rowPageByFile.ready", {
      databaseId,
      fileName,
      rowId: doc.rowId,
      title: doc.title,
      cacheHit,
      recordRecent: options.recordRecent !== false,
      flushMs,
      fetchMs,
      markdownLength: doc.markdown.length,
      fieldCount: doc.schema.fields.length,
      totalBeforeStateMs: elapsedMs(startedAt)
    });
    setState((current) => ({
      ...current,
      activeItem: item,
      activeRowPage: ref,
      activePage: undefined,
      activeDatabaseId: undefined,
      ...activateItemInTabs(current, item)
    }));
    requestAnimationFrame(() => {
      openLog("rowPageByFile.paint", {
        databaseId,
        fileName,
        rowId: doc.rowId,
        title: doc.title,
        totalMs: elapsedMs(startedAt)
      });
    });
  }

  async function openEntity(ref: EntityRef) {
    if (ref.kind === "database") {
      await selectDatabase(ref.entityId);
      return;
    }
    if (ref.kind === "row") {
      let databaseId = ref.databaseId;
      let rowId = ref.rowId ?? ref.entityId;
      if (!databaseId) {
        const resolved = await window.lotion.entities.resolve(ref.entityId);
        if (resolved?.kind === "row") {
          databaseId = resolved.databaseId;
          rowId = resolved.rowId ?? resolved.entityId;
        }
      }
      if (!databaseId || !rowId) return;
      await openRowPage(databaseId, rowId);
      return;
    }
    await selectPage(ref.entityId);
  }

  openEntityRef.current = (ref) => {
    void openEntity(ref);
  };

  async function saveRowPageBody(markdown: string) {
    const rp = peekRowPage?.ref ?? state.activeRowPage;
    if (!rp) return;
    const { databaseId, rowId } = rp;
    patchCachedRowPageMarkdown(databaseId, rowId, markdown);
    scheduleRowPageMarkdownSave(databaseId, rowId, markdown);
  }

  function rowPageMarkdownKey(databaseId: string, rowId: string): string {
    return `${databaseId}\u0000${rowId}`;
  }

  function rowPageFileCacheKey(databaseId: string, fileName: string): string {
    return `${databaseId}\u0000${fileName}`;
  }

  function rememberRowPageDoc(doc: RowPageDocument) {
    rowPageDocCacheRef.current.set(rowPageMarkdownKey(doc.databaseId, doc.rowId), doc);
    const pageFile = String(doc.record.page_file ?? "").trim();
    if (pageFile) {
      rowPageFileDocCacheRef.current.set(rowPageFileCacheKey(doc.databaseId, pageFile), doc);
    }
  }

  function patchCachedRowPageMarkdown(databaseId: string, rowId: string, markdown: string) {
    const key = rowPageMarkdownKey(databaseId, rowId);
    const cached = rowPageDocCacheRef.current.get(key);
    if (!cached) return;
    rememberRowPageDoc({ ...cached, markdown });
  }

  function patchCachedRowPageFullWidth(databaseId: string, rowId: string, fullWidth: boolean | undefined) {
    const key = rowPageMarkdownKey(databaseId, rowId);
    const cached = rowPageDocCacheRef.current.get(key);
    if (!cached) return;
    rememberRowPageDoc({ ...cached, fullWidth, meta: { ...cached.meta, fullWidth } });
  }

  function scheduleRowPageMarkdownSave(databaseId: string, rowId: string, markdown: string) {
    const key = rowPageMarkdownKey(databaseId, rowId);
    const existingTimer = rowPageMarkdownSaveTimersRef.current.get(key);
    if (existingTimer) window.clearTimeout(existingTimer);
    rowPageMarkdownPendingRef.current.set(key, { databaseId, rowId, markdown });
    perfLog("rowPage.save.schedule", {
      databaseId,
      rowId,
      markdownLength: markdown.length,
      debounceMs: MARKDOWN_SAVE_DEBOUNCE_MS,
      replacedTimer: !!existingTimer
    });
    const timer = window.setTimeout(() => {
      rowPageMarkdownSaveTimersRef.current.delete(key);
      const pending = rowPageMarkdownPendingRef.current.get(key);
      rowPageMarkdownPendingRef.current.delete(key);
      if (pending) void persistRowPageMarkdown(pending.databaseId, pending.rowId, pending.markdown);
    }, MARKDOWN_SAVE_DEBOUNCE_MS);
    rowPageMarkdownSaveTimersRef.current.set(key, timer);
  }

  async function persistRowPageMarkdown(databaseId: string, rowId: string, markdown: string) {
    const start = performance.now();
    const doc = await cache.updateRowPage({ databaseId, rowId, markdown });
    rememberRowPageDoc(doc);
    perfLog("rowPage.save.persist", {
      databaseId,
      rowId,
      ms: Number((performance.now() - start).toFixed(1)),
      markdownLength: markdown.length
    });
  }

  async function flushPendingMarkdownSaves() {
    const saves: Promise<void>[] = [];
    for (const timer of pageMarkdownSaveTimersRef.current.values()) window.clearTimeout(timer);
    pageMarkdownSaveTimersRef.current.clear();
    for (const [pageId, markdown] of pageMarkdownPendingRef.current) {
      saves.push(persistPageMarkdown(pageId, markdown));
    }
    pageMarkdownPendingRef.current.clear();

    for (const timer of rowPageMarkdownSaveTimersRef.current.values()) window.clearTimeout(timer);
    rowPageMarkdownSaveTimersRef.current.clear();
    for (const pending of rowPageMarkdownPendingRef.current.values()) {
      saves.push(persistRowPageMarkdown(pending.databaseId, pending.rowId, pending.markdown));
    }
    rowPageMarkdownPendingRef.current.clear();
    await Promise.all(saves);
  }

  async function updateRowField(fieldId: string, value: RecordValue) {
    const rp = peekRowPage?.ref ?? state.activeRowPage;
    if (!rp) return;
    await cache.updateCell({
      databaseId: rp.databaseId,
      rowId: rp.rowId,
      fieldId,
      value
    });
    if (fieldId === "title") {
      const title = String(value ?? "").trim();
      const cached = rowPageDocCacheRef.current.get(rowPageMarkdownKey(rp.databaseId, rp.rowId));
      if (cached) {
        rememberRowPageDoc({
          ...cached,
          title,
          meta: { ...cached.meta, title },
          record: { ...cached.record, title }
        });
      }
      setState((current) => ({
        ...current,
        activeRowPage:
          current.activeRowPage && current.activeRowPage.databaseId === rp.databaseId && current.activeRowPage.rowId === rp.rowId
            ? { ...current.activeRowPage, title, meta: current.activeRowPage.meta ? { ...current.activeRowPage.meta, title } : undefined }
            : current.activeRowPage,
        activeItem: isSameRowPageItem(current.activeItem, rp.databaseId, rp.rowId)
          ? rowPageActiveItem(rp.databaseId, rp.rowId, title)
          : current.activeItem,
        tabs: current.tabs.map((tab, index) => (
          index === current.activeTabIndex && isSameRowPageItem(tab.item, rp.databaseId, rp.rowId)
            ? { ...tab, item: rowPageActiveItem(rp.databaseId, rp.rowId, title) }
            : tab
        ))
      }));
      setPeekRowPage((current) => current && current.ref.databaseId === rp.databaseId && current.ref.rowId === rp.rowId
        ? { ...current, ref: { ...current.ref, title, meta: current.ref.meta ? { ...current.ref.meta, title } : undefined } }
        : current);
      void refreshPagesTree();
    }
  }

  async function applyRowPageTemplate(templateId: string) {
    const rp = peekRowPage?.ref ?? state.activeRowPage;
    if (!rp) return;
    const bundle = cache.getBundle(rp.databaseId);
    const template = bundle?.schema.templates?.find((item) => item.id === templateId);
    if (!template) return;

    if (template.markdown !== undefined) {
      patchCachedRowPageMarkdown(rp.databaseId, rp.rowId, template.markdown);
      setState((current) => (
        current.activeRowPage && current.activeRowPage.databaseId === rp.databaseId && current.activeRowPage.rowId === rp.rowId
          ? { ...current, activeRowPage: { ...current.activeRowPage, markdown: template.markdown ?? "" } }
          : current
      ));
      setPeekRowPage((current) => current && current.ref.databaseId === rp.databaseId && current.ref.rowId === rp.rowId
        ? { ...current, ref: { ...current.ref, markdown: template.markdown ?? "" } }
        : current);
      await persistRowPageMarkdown(rp.databaseId, rp.rowId, template.markdown);
    }
    for (const [fieldId, value] of Object.entries(template.values ?? {})) {
      await updateRowField(fieldId, value);
    }
    await updateRowPageFullWidth(rp.databaseId, rp.rowId, !!template.fullWidth);
  }

  async function renameRowPage(databaseId: string, rowId: string, title: string) {
    const currentTitle = String(lookupRow(cache.getBundle(databaseId), rowId)?.title ?? "");
    if (title === currentTitle) return;
    await cache.updateCell({ databaseId, rowId, fieldId: "title", value: title });
  }

  async function updateRowFieldOptions(fieldId: string, options: SelectOption[]) {
    const rp = peekRowPage?.ref ?? state.activeRowPage;
    if (!rp) return;
    const bundle = cache.getBundle(rp.databaseId);
    const field = bundle?.schema.fields.find((item) => item.id === fieldId);
    if (!field) return;
    await cache.updateField({
      databaseId: rp.databaseId,
      fieldId,
      name: field.name,
      type: field.type,
      options,
      formula: field.formula,
      relation: field.relation,
      rollup: field.rollup,
      dateFormat: field.dateFormat,
      timeFormat: field.timeFormat
    });
  }

  async function updateRowFieldSettings(
    field: FieldSchema,
    input: Pick<FieldSchema, "name" | "type" | "options" | "formula" | "relation" | "rollup" | "dateFormat" | "timeFormat">
  ) {
    const rp = peekRowPage?.ref ?? state.activeRowPage;
    if (!rp) return;
    await cache.updateField({
      databaseId: rp.databaseId,
      fieldId: field.id,
      name: input.name,
      type: input.type,
      options: input.options,
      formula: input.formula,
      relation: input.relation,
      rollup: input.rollup,
      dateFormat: input.dateFormat,
      timeFormat: input.timeFormat
    });
  }

  // ── derive view-model from cache + state ─────────────────────────────

  const activeBundle: DatabaseBundle | undefined = state.activeDatabaseId
    ? cache.getBundle(state.activeDatabaseId)
    : undefined;

  const activeRowBundle: DatabaseBundle | undefined = state.activeRowPage
    ? cache.getBundle(state.activeRowPage.databaseId)
    : undefined;

  const activeRow: DatabaseRecord | undefined =
    state.activeRowPage && activeRowBundle ? lookupRow(activeRowBundle, state.activeRowPage.rowId) : undefined;
  const peekRowBundle = peekRowPage ? cache.getBundle(peekRowPage.ref.databaseId) : undefined;
  const peekRow = peekRowPage && peekRowBundle ? lookupRow(peekRowBundle, peekRowPage.ref.rowId) : undefined;

  let content = <div className="empty-state">{t("app.empty")}</div>;

  if (state.isLoading) {
    content = <StartupLoadingScreen startup={startup} title={t("app.loading")} />;
  } else if (state.error) {
    content = <div className="empty-state error">{state.error}</div>;
  } else if (state.activeItem?.type === "startup" && startupReport) {
    content = <StartupPerformancePanel report={startupReport} />;
  } else if (state.activeItem?.type === "manage") {
    content = (
      <ManagementView
        kind={state.activeItem.kind}
        pages={state.pages}
        databases={state.databases}
        favorites={state.favorites}
        recents={state.recents}
        pluginOpenRequest={pluginOpenRequest}
        settingsOpenRequest={settingsOpenRequest}
      />
    );
  } else if (state.activePage) {
    const activePageMeta = state.activePage.meta;
    const favorited = isFavorited(state.favorites, { type: "page", id: activePageMeta.id });
    const viewStateKey = editorViewStateKey({ type: "page", id: activePageMeta.id });
    const activeNavigationAnchor = navigationAnchor?.viewStateKey === viewStateKey ? navigationAnchor : null;
    content = (
      <PageEditor
        key={viewStateKey}
        ref={activePageEditorRef}
        viewStateKey={viewStateKey}
        page={state.activePage}
        databases={state.databases}
        pages={state.pages}
        onChange={savePage}
        onRename={(title) => renamePage(activePageMeta.id, title)}
        onPickIcon={() => pickIconForPage(activePageMeta.id)}
        onPickCover={() => pickCoverForPage(activePageMeta.id)}
        onClearCover={() => clearCoverForPage(activePageMeta.id)}
        onCommitCoverOffset={(offset) => updatePageProperties(activePageMeta.id, { coverOffset: offset })}
        onSetFullWidth={(fullWidth) => updatePageProperties(activePageMeta.id, { fullWidth })}
        onSetSmallText={(smallText) => updatePageProperties(activePageMeta.id, { smallText })}
        onOpenInNewWindow={() => openItemInNewWindow({ type: "page", id: activePageMeta.id })}
        onOpenEntity={openEntity}
        initialViewState={pageViewStatesRef.current.get(viewStateKey)}
        navigationAnchorPos={activeNavigationAnchor?.pos}
        navigationAnchorKey={activeNavigationAnchor?.requestKey}
        onViewStateChange={(viewState) => rememberPageViewState(viewStateKey, viewState)}
        favorited={favorited}
        onToggleFavorite={toggleFavoriteCurrent}
        propertiesSlot={
          <PageProperties
            meta={activePageMeta}
            onChange={(input) => updatePageProperties(activePageMeta.id, input)}
            onSearchTag={openSearch}
          />
        }
      />
    );
  } else if (activeBundle) {
    const view = activeBundle.views[0];
    content = (
      <DatabaseTable
        bundle={activeBundle}
        view={view}
        databases={state.databases}
        loadDurationMs={state.activeDatabaseLoadMs}
        onPickIcon={() => pickIconForDatabase(activeBundle.schema.id)}
        onPickCover={() => pickCoverForDatabase(activeBundle.schema.id)}
        onClearCover={() => clearCoverForDatabase(activeBundle.schema.id)}
        onCommitCoverOffset={(offset) => updateDatabaseCoverOffset(activeBundle.schema.id, offset)}
        onUpdateTags={(tags) => updateDatabaseTags(activeBundle.schema.id, tags)}
        onOpenInNewWindow={() => openItemInNewWindow({ type: "database", id: activeBundle.schema.id })}
      />
    );
  } else if (state.activeRowPage && activeRowBundle && activeRow) {
    const rp = state.activeRowPage;
    const viewStateKey = editorViewStateKey({ type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId });
    const activeNavigationAnchor = navigationAnchor?.viewStateKey === viewStateKey ? navigationAnchor : null;
    const dbSchema = activeRowBundle.schema;
    const dbPathLabel = entityPathLabel(dbSchema.path, dbSchema.name);
    const rowCover = String(activeRow.cover ?? "");
    const rowCoverOffset = Number(activeRow.cover_offset ?? 50);
    const rowIcon = String(activeRow.row_icon ?? "");
    const rowMeta = rp.meta;
    const page: PageDocument = {
      meta: {
        ...(rowMeta ?? {}),
        id: rp.rowId,
        title: String(activeRow.title ?? ""),
        created_time: String(activeRow.created_time ?? ""),
        updated_time: String(activeRow.updated_time ?? ""),
        icon: rowIcon || rowMeta?.icon || undefined,
        cover: rowCover || rowMeta?.cover || undefined,
        coverOffset: Number.isFinite(rowCoverOffset) ? rowCoverOffset : undefined,
        fullWidth: !!rp.fullWidth
      },
      markdown: rp.markdown
    };
    content = (
      <div className={rp.fullWidth ? "row-page-surface full-width" : "row-page-surface"}>
        <div className="row-page-breadcrumb">
          <button
            type="button"
            className="row-page-breadcrumb-link"
            onClick={() => selectDatabase(rp.databaseId)}
            title={dbPathLabel}
          >
            <EntityIcon kind="database" icon={dbSchema.icon} size={14} />
            <span>{dbPathLabel}</span>
          </button>
          <span className="row-page-breadcrumb-sep">/</span>
          <span className="row-page-breadcrumb-current" title={String(activeRow.title ?? "")}>
            <EntityIcon kind="row_page" icon={rowIcon || undefined} size={14} />
            <span>{String(activeRow.title ?? "") || t("rowPage.untitled")}</span>
          </span>
        </div>
        <PageEditor
          key={viewStateKey}
          ref={activePageEditorRef}
          viewStateKey={viewStateKey}
          page={page}
          databases={state.databases}
          pages={state.pages}
          onChange={saveRowPageBody}
          onRename={(title) => renameRowPage(rp.databaseId, rp.rowId, title)}
          onPickCover={() => pickCoverForRow(rp.databaseId, rp.rowId)}
          onClearCover={() => clearCoverForRow(rp.databaseId, rp.rowId)}
        onCommitCoverOffset={(offset) => updateRowCoverOffset(rp.databaseId, rp.rowId, offset)}
        onSetFullWidth={(fullWidth) => updateRowPageFullWidth(rp.databaseId, rp.rowId, fullWidth)}
        onSetSmallText={(smallText) => updateRowPageSmallText(rp.databaseId, rp.rowId, smallText)}
        onOpenInNewWindow={() => openItemInNewWindow({ type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId })}
          onOpenEntity={openEntity}
          initialViewState={pageViewStatesRef.current.get(viewStateKey)}
          navigationAnchorPos={activeNavigationAnchor?.pos}
          navigationAnchorKey={activeNavigationAnchor?.requestKey}
          onViewStateChange={(viewState) => rememberPageViewState(viewStateKey, viewState)}
          emptyTemplates={(dbSchema.templates ?? []).map((template) => ({
            id: template.id,
            name: template.name,
            markdown: template.markdown,
            icon: String(template.values?.row_icon ?? "").trim() || undefined
          }))}
          onApplyEmptyTemplate={applyRowPageTemplate}
          onCreateEmptyTemplate={() => setRowTemplateDialogOpen(true)}
          favorited={isFavorited(state.favorites, { type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId })}
          onToggleFavorite={toggleFavoriteCurrent}
          propertiesSlot={
            <RowPageProperties
              schema={dbSchema}
              record={activeRow}
              databases={state.databases}
              loadDatabase={cache.loadBundle}
              onUpdateField={updateRowField}
              onUpdateFieldSettings={updateRowFieldSettings}
              onUpdateFieldOptions={updateRowFieldOptions}
              onOpenEntityRef={openEntity}
              onSearchPropertyValue={openSearch}
            />
          }
        />
      </div>
    );
  }

  const actions: LotionActions = {
    selectPage,
    selectDatabase,
    openManage,
    openRowPage,
    openRowPageInNewWindow: (databaseId, rowId) => openItemInNewWindow({ type: "row_page", databaseId, rowId }),
    openRowPageByFile,
    createPage,
    createDatabase,
    deletePage,
    toggleFavoriteCurrent,
    toggleFullWidthCurrent,
    toggleSmallTextCurrent,
    openActiveInNewWindow: () => openItemInNewWindow(),
    openSidebarSettings: () => openSidebarSettingsRef.current(),
    toggleVimMode: () => setVimMode(!vimMode),
    toggleRawMarkdownMode: () => setRawMarkdown(!rawMarkdown),
    toggleEmbedSourceVisibility: () => setShowEmbedSource(!showEmbedSource),
    goBack,
    goForward,
    canBack: Boolean(peekRowPage) || history.index > 0,
    canForward: !peekRowPage && history.index < history.stack.length - 1,
    backLabel: peekRowPage
      ? "Close row peek"
      : history.index > 0
      ? historyItemLabel(history.stack[history.index - 1], state, cache.getBundle)
      : undefined,
    forwardLabel: history.index < history.stack.length - 1
      ? historyItemLabel(history.stack[history.index + 1], state, cache.getBundle)
      : undefined
  };

  return (
    <LotionActionsProvider value={actions}>
      <AppShell
        state={state}
        onOpenSearch={() => openSearch()}
        onOpenSearchAi={openSearchAi}
        onReordered={refreshLists}
        onSwitchTab={(i) => { void switchTab(i); }}
        onCloseTab={closeTab}
        onNewTab={newTab}
        onReorderTabs={reorderTabs}
        onMoveTabToNewWindow={moveTabToNewWindow}
        sidebarSettingsOpenRequest={sidebarSettingsOpenRequest}
      >
        <Suspense fallback={<div className="content-loading" aria-busy="true" />}>
          {content}
        </Suspense>
      </AppShell>
      <Suspense fallback={null}>
        {peekRowPage && peekRowBundle && peekRow && (() => {
        const rp = peekRowPage.ref;
        const viewStateKey = editorViewStateKey({ type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId });
        const rowCoverOffset = Number(peekRow.cover_offset ?? 50);
        const page: PageDocument = {
          meta: {
            ...(rp.meta ?? {}),
            id: rp.rowId,
            title: String(peekRow.title ?? ""),
            created_time: String(peekRow.created_time ?? ""),
            updated_time: String(peekRow.updated_time ?? ""),
            icon: String(peekRow.row_icon ?? "") || rp.meta?.icon || undefined,
            cover: String(peekRow.cover ?? "") || rp.meta?.cover || undefined,
            coverOffset: Number.isFinite(rowCoverOffset) ? rowCoverOffset : undefined,
            fullWidth: !!rp.fullWidth
          },
          markdown: rp.markdown
        };
        return <div className={`row-page-peek-backdrop ${peekRowPage.mode}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRowPagePeek(); }}>
          <section className="row-page-peek" role="dialog" aria-modal="true" aria-label={`Row page ${String(peekRow.title ?? "Untitled")}`}>
            <header className="row-page-peek-toolbar">
              <strong>{String(peekRow.title ?? "") || t("rowPage.untitled")}</strong>
              <span />
              <button type="button" onClick={() => { closeRowPagePeek(); void openRowPage(rp.databaseId, rp.rowId, { pageOpenMode: "full_page" }); }}>Open as full page</button>
              <button type="button" onClick={() => openItemInNewWindow({ type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId })}>Open in new window</button>
              <button type="button" aria-label="Close peek" onClick={closeRowPagePeek}>×</button>
            </header>
            <div className="row-page-peek-scroll">
              <PageEditor
                key={viewStateKey}
                ref={activePageEditorRef}
                viewStateKey={viewStateKey}
                page={page}
                databases={state.databases}
                pages={state.pages}
                onChange={saveRowPageBody}
                onRename={(title) => renameRowPage(rp.databaseId, rp.rowId, title)}
                onPickCover={() => pickCoverForRow(rp.databaseId, rp.rowId)}
                onClearCover={() => clearCoverForRow(rp.databaseId, rp.rowId)}
                onCommitCoverOffset={(offset) => updateRowCoverOffset(rp.databaseId, rp.rowId, offset)}
                onSetFullWidth={(fullWidth) => updateRowPageFullWidth(rp.databaseId, rp.rowId, fullWidth)}
                onSetSmallText={(smallText) => updateRowPageSmallText(rp.databaseId, rp.rowId, smallText)}
                onOpenInNewWindow={() => openItemInNewWindow({ type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId })}
                onOpenEntity={openEntity}
                initialViewState={pageViewStatesRef.current.get(viewStateKey)}
                onViewStateChange={(viewState) => rememberPageViewState(viewStateKey, viewState)}
                favorited={isFavorited(state.favorites, { type: "row_page", databaseId: rp.databaseId, rowId: rp.rowId })}
                onToggleFavorite={toggleFavoriteCurrent}
                propertiesSlot={<RowPageProperties schema={peekRowBundle.schema} record={peekRow} databases={state.databases} loadDatabase={cache.loadBundle} onUpdateField={updateRowField} onUpdateFieldSettings={updateRowFieldSettings} onUpdateFieldOptions={updateRowFieldOptions} onOpenEntityRef={openEntity} onSearchPropertyValue={openSearch} />}
              />
            </div>
          </section>
        </div>;
        })()}
        {searchOpen && (
        <GlobalSearchPanel
          pages={state.pages}
          databases={state.databases}
          recents={state.recents}
          initialPattern={searchInitialPattern}
          onClose={() => setSearchOpen(false)}
        />
        )}
        {searchAiOpen && (
        <SearchAiSurface onClose={() => setSearchAiOpen(false)} />
        )}
        {templatePickerOpen && (
        <DatabaseTemplatePicker
          onClose={() => setTemplatePickerOpen(false)}
          onPick={(tpl) => {
            setTemplatePickerOpen(false);
            void createDatabaseFromInput(tpl.buildInput());
          }}
        />
        )}
        {rowTemplateDialogOpen && activeRowBundle && (
        <RowTemplateDialog
          schema={activeRowBundle.schema}
          onClose={() => setRowTemplateDialogOpen(false)}
          onSave={(template) => cache.saveTemplate({ databaseId: activeRowBundle.schema.id, template }).then(() => undefined)}
          onDelete={(templateId) => cache.deleteTemplate({ databaseId: activeRowBundle.schema.id, templateId }).then(() => undefined)}
        />
        )}
      </Suspense>
      <NotificationStack notifications={notifications} onDismiss={dismissNotification} />
    </LotionActionsProvider>
  );
}

export function StartupLoadingScreen({
  startup,
  title = "Loading Lotion..."
}: {
  startup: StartupLoadingState;
  title?: string;
}) {
  const active = startup.phases.find((phase) => phase.status === "active");
  const completedCount = startup.phases.filter((phase) => phase.status === "done").length;
  const totalMs = Number((performance.now() - startup.startedAt).toFixed(1));
  return (
    <section
      className="startup-loading"
      data-testid="startup-loading"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="startup-loading-inner">
        <div className="startup-loading-mark" aria-hidden="true">
          <span />
        </div>
        <div className="startup-loading-copy">
          <p className="startup-loading-kicker">Starting workspace</p>
          <h1>{title}</h1>
          <p className="startup-loading-current">
            {startup.error ? startup.error : active?.label ?? "Preparing workspace"}
          </p>
          <ol className="startup-loading-phases" aria-label="Startup phases">
            {startup.phases.map((phase) => (
              <li
                key={phase.key}
                data-startup-phase={phase.key}
                data-status={phase.status}
                className={`startup-loading-phase ${phase.status}`}
              >
                <span className="startup-loading-dot" aria-hidden="true" />
                <span className="startup-loading-label">{phase.label}</span>
                {phase.ms !== undefined && <span className="startup-loading-ms">{phase.ms}ms</span>}
              </li>
            ))}
          </ol>
          <p className="startup-loading-progress">
            {completedCount} of {startup.phases.length} phases · {totalMs}ms
          </p>
        </div>
      </div>
    </section>
  );
}

function NotificationStack({
  notifications,
  onDismiss
}: {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
}) {
  if (notifications.length === 0) return null;
  return (
    <div className="notification-stack" role="status" aria-live="polite">
      {notifications.map((notification) => (
        <div key={notification.id} className={`notification-toast ${notification.level}`}>
          <span>{notification.text}</span>
          <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(notification.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function lookupRow(bundle: DatabaseBundle | undefined, rowId: string): DatabaseRecord | undefined {
  return bundle?.records.find((record) => record.id === rowId);
}

function rowPageActiveItem(databaseId: string, rowId: string, title: string): Extract<ActiveItem, { type: "row_page" }> {
  const cleanTitle = title.trim();
  return cleanTitle
    ? { type: "row_page", databaseId, rowId, title: cleanTitle }
    : { type: "row_page", databaseId, rowId };
}

function rowIconFromRecord(record: DatabaseRecord): string | undefined {
  return String(record.row_icon ?? "").trim() || undefined;
}

function historyItemLabel(
  item: ActiveItem,
  state: AppState,
  getBundle: (id: string) => DatabaseBundle | undefined
): string {
  if (item.type === "page") {
    return state.pages.find((page) => page.id === item.id)?.title?.trim() || item.id;
  }
  if (item.type === "database") {
    return state.databases.find((database) => database.id === item.id)?.name?.trim() || item.id;
  }
  if (item.type === "row_page") {
    const databaseName = state.databases.find((database) => database.id === item.databaseId)?.name?.trim();
    const rowTitle =
      titleForHistoryRow(getBundle(item.databaseId), item.rowId) ||
      item.title?.trim() ||
      item.rowId;
    return databaseName ? `${databaseName}/${rowTitle}` : rowTitle;
  }
  if (item.type === "startup") return "Startup performance";
  if (item.kind === "databases") return "管理数据库";
  if (item.kind === "pages") return "所有页面";
  if (item.kind === "plugins") return "插件";
  if (item.kind === "settings") return "设置";
  if (item.kind === "design-system") return "Design system";
  const tag = tagFromManageKind(item.kind);
  if (tag) return `#${tag}`;
  return "最近访问";
}

function isManageKind(value: unknown): value is ManageKind {
  if (typeof value !== "string") return false;
  return (
    value === "databases" ||
    value === "pages" ||
    value === "favorites" ||
    value === "recent" ||
    value === "plugins" ||
    value === "settings" ||
    value === "design-system" ||
    value.startsWith("tag:")
  );
}

function titleForHistoryRow(bundle: DatabaseBundle | undefined, rowId: string): string | undefined {
  const value = bundle?.records.find((record) => record.id === rowId)?.title;
  const title = value == null ? "" : String(value).trim();
  return title || undefined;
}

function isSameRowPageItem(item: ActiveItem | undefined, databaseId: string, rowId: string): boolean {
  return item?.type === "row_page" && item.databaseId === databaseId && item.rowId === rowId;
}

const TABS_STORAGE_KEY = "lotion.tabs";
const NEXT_WINDOW_INIT_KEY = "lotion.nextWindowInit";

/**
 * Drop-once "letter slot" used to hand a tab's content from the
 * spawning window to a freshly opened one. The sender writes the
 * envelope here, calls windows.openNew(), and removes the tab from
 * its own strip; the next window's bootstrap reads and *immediately
 * deletes* the envelope so a second new window doesn't pick it up.
 */
interface NextWindowInit {
  item: ActiveItem;
}

function takeNextWindowInit(): NextWindowInit | null {
  try {
    const raw = window.localStorage.getItem(NEXT_WINDOW_INIT_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(NEXT_WINDOW_INIT_KEY);
    return JSON.parse(raw) as NextWindowInit;
  } catch {
    return null;
  }
}

function dropNextWindowInit(init: NextWindowInit): void {
  try {
    window.localStorage.setItem(NEXT_WINDOW_INIT_KEY, JSON.stringify(init));
  } catch {
    /* ignore — fallback would be to open an empty new window */
  }
}

interface PersistedTabs {
  tabs: AppState["tabs"];
  activeTabIndex: number;
}

function readPersistedTabs(): PersistedTabs | null {
  try {
    const raw = window.localStorage.getItem(TABS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTabs;
    if (!Array.isArray(parsed.tabs) || parsed.tabs.length === 0) return null;
    const safeIndex = Math.max(0, Math.min(parsed.activeTabIndex, parsed.tabs.length - 1));
    return { tabs: parsed.tabs, activeTabIndex: safeIndex };
  } catch {
    return null;
  }
}

function sanitizePersistedTabs(
  persisted: PersistedTabs,
  pages: PageMeta[],
  databases: DatabaseSummary[]
): PersistedTabs | null {
  const activeTabId = persisted.tabs[persisted.activeTabIndex]?.id;
  const tabs = persisted.tabs
    .filter((tab) => tab && typeof tab.id === "string" && tab.item?.type !== "startup")
    .map((tab) => (
      isActiveItemAvailable(tab.item, pages, databases)
        ? tab
        : { ...tab, item: undefined }
    ));
  if (tabs.length === 0) return null;

  const restoredActiveIndex = tabs.findIndex((tab) => tab.id === activeTabId);
  const activeTabIndex = restoredActiveIndex >= 0 ? restoredActiveIndex : 0;
  return { tabs, activeTabIndex };
}

function isActiveItemAvailable(
  item: ActiveItem | undefined,
  pages: PageMeta[],
  databases: DatabaseSummary[]
): boolean {
  if (!item) return true;
  if (item.type === "page") return pages.some((page) => page.id === item.id);
  if (item.type === "database") return databases.some((database) => database.id === item.id);
  if (item.type === "row_page") return databases.some((database) => database.id === item.databaseId);
  if (item.type === "manage") return true;
  if (item.type === "startup") return true;
  return false;
}

function writePersistedTabs(state: AppState): void {
  try {
    const activeTab = state.tabs[state.activeTabIndex];
    const activeTabId = activeTab?.item?.type === "startup"
      ? activeTab.item.returnTabId
      : activeTab?.id;
    const tabs = state.tabs.filter((tab) => tab.item?.type !== "startup");
    if (tabs.length === 0) tabs.push({ id: `tab_${Date.now()}` });
    const restoredActiveIndex = tabs.findIndex((tab) => tab.id === activeTabId);
    const activeTabIndex = restoredActiveIndex >= 0 ? restoredActiveIndex : 0;
    window.localStorage.setItem(
      TABS_STORAGE_KEY,
      JSON.stringify({ tabs, activeTabIndex })
    );
  } catch {
    /* localStorage may be unavailable or full — drop silently. */
  }
}

function activateItemInTabs(
  state: AppState,
  item: ActiveItem | undefined
): Pick<AppState, "tabs" | "activeTabIndex"> {
  const tabs = state.tabs.slice();
  const idx = state.activeTabIndex;
  if (idx < 0 || idx >= tabs.length) return { tabs, activeTabIndex: idx };
  const activeTab = tabs[idx];
  if (activeTab.item?.type !== "startup") {
    tabs[idx] = { ...activeTab, item };
    return { tabs, activeTabIndex: idx };
  }

  const returnTabId = activeTab.item.returnTabId;
  const requestedReturnIndex = returnTabId
    ? tabs.findIndex((tab) => tab.id === returnTabId)
    : -1;
  const returnIndex = requestedReturnIndex >= 0
    ? requestedReturnIndex
    : tabs.findIndex((tab) => tab.item?.type !== "startup");
  if (returnIndex >= 0) {
    tabs[returnIndex] = { ...tabs[returnIndex], item };
    return { tabs, activeTabIndex: returnIndex };
  }

  tabs.splice(idx, 0, { id: `tab_${Date.now()}_startup_return`, item });
  return { tabs, activeTabIndex: idx };
}

function editorViewStateKey(item: Extract<ActiveItem, { type: "page" | "row_page" }>): string {
  if (item.type === "page") return `page:${item.id}`;
  return `row:${item.databaseId}:${item.rowId}`;
}

function markdownPositionForLine(markdown: string, line: number | undefined): number | null {
  if (typeof line !== "number" || !Number.isFinite(line) || line < 1) return null;
  let pos = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const nextBreak = markdown.indexOf("\n", pos);
    if (nextBreak < 0) return markdown.length;
    pos = nextBreak + 1;
  }
  return Math.max(0, Math.min(pos, markdown.length));
}

function entityPathLabel(path: string[] | undefined, fallback: string): string {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 ? segments.join(" / ") : fallback;
}

function isFavorited(list: FavoriteItem[], item: FavoriteItem): boolean {
  return list.some((f) => {
    if (f.type !== item.type) return false;
    if (f.type === "page" && item.type === "page") return f.id === item.id;
    if (f.type === "row_page" && item.type === "row_page") {
      return f.databaseId === item.databaseId && f.rowId === item.rowId;
    }
    return false;
  });
}
