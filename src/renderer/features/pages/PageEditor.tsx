import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type {
  DatabaseBundle,
  DatabaseSummary,
  EntityBacklink,
  EntityRef,
  GitPageHistoryPreview,
  GitPageHistoryResult,
  GitPageHistoryVersion,
  PageDocument,
  PageMeta,
  TableView
} from "../../../shared/types";
import { useI18n } from "../../lib/i18n";
import { CodeMirrorMarkdownEditor, type CodeMirrorMarkdownEditorHandle, type MarkdownEditorViewState } from "./CodeMirrorMarkdownEditor";
import { EntityIcon } from "../../components/EntityIcon";
import { CoverArea } from "./CoverArea";
import { PageLayout } from "./PageLayout";
import { ArrowUpRight, CaseSensitive, History, ImagePlus, Maximize2, MoreHorizontal, SmilePlus, Star } from "lucide-react";
import { useDatabaseCache } from "../../context/database-cache";
import { ViewTypeIcon } from "../../components/FieldTypeIcon";
import { pluginHost } from "../../plugin-host";
import { formatDateForField, type DateTimeDisplayDefaults } from "../../../shared/date-values";
import { useDateTimeDisplayDefaults } from "../../lib/settings";
import {
  EntityBreadcrumbs,
  resolveEntityBreadcrumbItems,
  type EntityBreadcrumbSource
} from "../../components/EntityBreadcrumbs";

// The favorite toggle uses Lucide's Star — filled when active so the
// gold "favorited" state is unambiguous without changing icon shape.
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <Star size={16} strokeWidth={1.8} fill={filled ? "currentColor" : "none"} />
  );
}

interface PageEditorProps {
  page: PageDocument;
  databases: DatabaseSummary[];
  /** All workspace pages — passed through to the editor so inline link
   *  widgets can resolve target page icons. */
  pages?: PageMeta[];
  onChange: (markdown: string) => void;
  onRename: (title: string) => Promise<void> | void;
  /** Called when the user clicks the icon slot. The host wires this to
   *  the `icons:setForPage` IPC and triggers a refresh on success. */
  onPickIcon?: () => void;
  /** Called when the user clicks "Add cover" / "Change cover". */
  onPickCover?: () => void;
  /** Called when the user clicks "Remove cover". */
  onClearCover?: () => void;
  /** Called when the user finishes a reposition drag. */
  onCommitCoverOffset?: (offset: number) => void | Promise<void>;
  /** Optional content rendered between the topbar and the body — used by
   *  row pages to surface their row's editable properties. */
  propertiesSlot?: ReactNode;
  /** Whether this entity is currently favorited (host-managed). */
  favorited?: boolean;
  /** Called when the user clicks the star icon. */
  onToggleFavorite?: () => void;
  /** Persists Notion-style page layout settings. */
  onSetFullWidth?: (fullWidth: boolean) => void | Promise<void>;
  onSetSmallText?: (smallText: boolean) => void | Promise<void>;
  onOpenInNewWindow?: () => void;
  onOpenEntity?: (ref: EntityRef) => void;
  /** Overrides the page identity used by the shared breadcrumb resolver. */
  breadcrumbSource?: EntityBreadcrumbSource;
  viewStateKey?: string;
  initialViewState?: PageEditorViewState;
  navigationAnchorPos?: number;
  navigationAnchorKey?: string;
  onViewStateChange?: (state: PageEditorViewState) => void;
  emptyTemplates?: PageEditorEmptyTemplate[];
  onApplyEmptyTemplate?: (templateId: string) => void | Promise<void>;
  onCreateEmptyTemplate?: () => void;
}

export type PageTitleMutationResult = "submitted" | "failed" | "ignored";
export type PageTitleMutationState =
  | { status: "idle" }
  | { status: "saving"; title: string }
  | { status: "error"; title: string; error: string };

type PageTitleMutationOperation = (title: string) => Promise<void> | void;

export function createPageTitleMutationController({
  onStateChange
}: {
  onStateChange: (state: PageTitleMutationState) => void;
}) {
  let generation = 0;
  let running = false;
  let failedAttempt: { title: string; operation: PageTitleMutationOperation } | null = null;

  async function submit(
    title: string,
    operation: PageTitleMutationOperation,
    retry = false
  ): Promise<PageTitleMutationResult> {
    if (running || (!retry && failedAttempt)) return "ignored";
    const attempt = retry ? failedAttempt : { title, operation };
    if (!attempt) return "ignored";
    const ownedGeneration = generation;
    running = true;
    onStateChange({ status: "saving", title: attempt.title });
    try {
      await attempt.operation(attempt.title);
      if (ownedGeneration !== generation) return "submitted";
      running = false;
      failedAttempt = null;
      onStateChange({ status: "idle" });
      return "submitted";
    } catch (error) {
      if (ownedGeneration !== generation) return "failed";
      running = false;
      failedAttempt = attempt;
      onStateChange({
        status: "error",
        title: attempt.title,
        error: error instanceof Error ? error.message : String(error)
      });
      return "failed";
    }
  }

  function retry() {
    return failedAttempt
      ? submit(failedAttempt.title, failedAttempt.operation, true)
      : Promise.resolve<PageTitleMutationResult>("ignored");
  }

  function discard() {
    if (running || !failedAttempt) return false;
    failedAttempt = null;
    onStateChange({ status: "idle" });
    return true;
  }

  function reset() {
    generation += 1;
    running = false;
    failedAttempt = null;
    onStateChange({ status: "idle" });
  }

  function isBlocked() {
    return running || !!failedAttempt;
  }

  return { discard, isBlocked, reset, retry, submit };
}

export function submitPageTitleBlurValue(
  value: string,
  controller: Pick<ReturnType<typeof createPageTitleMutationController>, "submit"> | null,
  operation: PageTitleMutationOperation
): void {
  void controller?.submit(value, operation);
}

export type PageLayoutSetting = "fullWidth" | "smallText";
export type PageLayoutMutationResult = "submitted" | "failed" | "ignored";
export type PageLayoutMutationState =
  | { status: "idle" }
  | { status: "saving"; setting: PageLayoutSetting; value: boolean }
  | { status: "error"; setting: PageLayoutSetting; value: boolean; error: string };

type PageLayoutMutationOperation = (value: boolean) => Promise<void> | void;

export function createPageLayoutMutationController({
  onStateChange
}: {
  onStateChange: (state: PageLayoutMutationState) => void;
}) {
  let generation = 0;
  let running = false;
  let failedAttempt: {
    setting: PageLayoutSetting;
    value: boolean;
    operation: PageLayoutMutationOperation;
  } | null = null;

  async function submit(
    setting: PageLayoutSetting,
    value: boolean,
    operation: PageLayoutMutationOperation,
    retry = false
  ): Promise<PageLayoutMutationResult> {
    if (running || (!retry && failedAttempt)) return "ignored";
    const attempt = retry ? failedAttempt : { setting, value, operation };
    if (!attempt) return "ignored";
    const ownedGeneration = generation;
    running = true;
    onStateChange({ status: "saving", setting: attempt.setting, value: attempt.value });
    try {
      await attempt.operation(attempt.value);
      if (ownedGeneration !== generation) return "submitted";
      running = false;
      failedAttempt = null;
      onStateChange({ status: "idle" });
      return "submitted";
    } catch (error) {
      if (ownedGeneration !== generation) return "failed";
      running = false;
      failedAttempt = attempt;
      onStateChange({
        status: "error",
        setting: attempt.setting,
        value: attempt.value,
        error: error instanceof Error ? error.message : String(error)
      });
      return "failed";
    }
  }

  function retry() {
    return failedAttempt
      ? submit(failedAttempt.setting, failedAttempt.value, failedAttempt.operation, true)
      : Promise.resolve<PageLayoutMutationResult>("ignored");
  }

  function discard() {
    if (running || !failedAttempt) return false;
    failedAttempt = null;
    onStateChange({ status: "idle" });
    return true;
  }

  function reset() {
    generation += 1;
    running = false;
    failedAttempt = null;
    onStateChange({ status: "idle" });
  }

  function isBlocked() {
    return running || !!failedAttempt;
  }

  return { discard, isBlocked, reset, retry, submit };
}

export type PageEditorViewState = MarkdownEditorViewState;

export interface PageEditorEmptyTemplate {
  id: string;
  name: string;
  markdown?: string;
  icon?: string;
}

const pageEditorViewStateStore = new Map<string, PageEditorViewState>();

export interface PageEditorHandle {
  getViewState: () => PageEditorViewState;
}

export const PageEditor = forwardRef<PageEditorHandle, PageEditorProps>(function PageEditor({
  page,
  databases,
  pages,
  onChange,
  onRename,
  onPickIcon,
  onPickCover,
  onClearCover,
  onCommitCoverOffset,
  propertiesSlot,
  favorited,
  onToggleFavorite,
  onSetFullWidth,
  onSetSmallText,
  onOpenInNewWindow,
  onOpenEntity,
  breadcrumbSource,
  viewStateKey,
  initialViewState,
  navigationAnchorPos,
  navigationAnchorKey,
  onViewStateChange,
  emptyTemplates,
  onApplyEmptyTemplate,
  onCreateEmptyTemplate
}, ref) {
  const { t } = useI18n();
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  const cache = useDatabaseCache();
  const restoredViewState = initialViewState ?? (viewStateKey ? pageEditorViewStateStore.get(viewStateKey) : undefined);
  const [title, setTitle] = useState(page.meta.title);
  const [titleMutationState, setTitleMutationState] = useState<PageTitleMutationState>({ status: "idle" });
  const titleMutationControllerRef = useRef<ReturnType<typeof createPageTitleMutationController> | null>(null);
  if (!titleMutationControllerRef.current) {
    titleMutationControllerRef.current = createPageTitleMutationController({
      onStateChange: setTitleMutationState
    });
  }
  const titlePageIdRef = useRef(page.meta.id);
  const [editorValue, setEditorValue] = useState(page.markdown);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewPickerOpen, setViewPickerOpen] = useState(false);
  const [selectedViewDatabaseId, setSelectedViewDatabaseId] = useState(databases[0]?.id ?? "");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [viewPickerLoadingId, setViewPickerLoadingId] = useState("");
  const [viewPickerError, setViewPickerError] = useState("");
  const [fullWidth, setFullWidth] = useState(!!page.meta.fullWidth);
  const [smallText, setSmallText] = useState(!!page.meta.smallText);
  const [layoutMutationState, setLayoutMutationState] = useState<PageLayoutMutationState>({ status: "idle" });
  const layoutMutationControllerRef = useRef<ReturnType<typeof createPageLayoutMutationController> | null>(null);
  if (!layoutMutationControllerRef.current) {
    layoutMutationControllerRef.current = createPageLayoutMutationController({
      onStateChange: setLayoutMutationState
    });
  }
  const layoutPageIdRef = useRef(page.meta.id);
  const [emptyPromptDismissed, setEmptyPromptDismissed] = useState(false);
  const [emptyPromptIndex, setEmptyPromptIndex] = useState(() => emptyTemplates?.length ?? 0);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  const [pageHistory, setPageHistory] = useState<GitPageHistoryResult | null>(null);
  const [pageHistoryPreview, setPageHistoryPreview] = useState<GitPageHistoryPreview | null>(null);
  const [pageHistoryBusy, setPageHistoryBusy] = useState(false);
  const [pageHistoryMessage, setPageHistoryMessage] = useState("");
  const pageHistoryRequestRef = useRef(0);
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const [secondaryPinned, setSecondaryPinned] = useState(false);
  const codeMirrorRef = useRef<CodeMirrorMarkdownEditorHandle | null>(null);
  const markdownRef = useRef(page.markdown);
  const pageIdRef = useRef(page.meta.id);
  const viewStateRef = useRef<PageEditorViewState>(restoredViewState ?? {});
  const breadcrumbItems = resolveEntityBreadcrumbItems({
    source: breadcrumbSource
      ? { ...breadcrumbSource, title }
      : {
          id: page.meta.id,
          kind: "page",
          title,
          path: page.meta.path,
          parentId: page.meta.parentId,
          parentKind: page.meta.parentKind
        },
    pages,
    databases
  });

  useEffect(() => {
    if (titlePageIdRef.current !== page.meta.id) {
      titlePageIdRef.current = page.meta.id;
      titleMutationControllerRef.current?.reset();
      setTitle(page.meta.title);
      return;
    }
    if (titleMutationState.status === "idle") setTitle(page.meta.title);
  }, [page.meta.id, page.meta.title, titleMutationState.status]);

  useEffect(() => {
    if (layoutPageIdRef.current !== page.meta.id) {
      layoutPageIdRef.current = page.meta.id;
      layoutMutationControllerRef.current?.reset();
      setFullWidth(!!page.meta.fullWidth);
      setSmallText(!!page.meta.smallText);
      return;
    }
    if (layoutMutationState.status !== "idle") return;
    setFullWidth(!!page.meta.fullWidth);
    setSmallText(!!page.meta.smallText);
  }, [
    layoutMutationState.status,
    page.meta.fullWidth,
    page.meta.id,
    page.meta.smallText
  ]);

  useEffect(() => {
    if (pageIdRef.current === page.meta.id) return;
    pageIdRef.current = page.meta.id;
    markdownRef.current = page.markdown;
    setEditorValue(page.markdown);
    setMenuOpen(false);
    setSecondaryExpanded(false);
    setSecondaryPinned(false);
    setBacklinks([]);
    setBacklinksLoaded(false);
    setEmptyPromptDismissed(false);
    setEmptyPromptIndex(0);
    viewStateRef.current = initialViewState ?? (viewStateKey ? pageEditorViewStateStore.get(viewStateKey) : undefined) ?? {};
  }, [page.meta.id, page.markdown]);

  useEffect(() => {
    if (!secondaryExpanded || backlinksLoaded) return;
    let cancelled = false;
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!page.meta.id || !api?.entities?.backlinks) return;
    api.entities.backlinks(page.meta.id)
      .then((items) => {
        if (!cancelled) {
          setBacklinks(items);
          setBacklinksLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) setBacklinks([]);
        console.warn("Failed to load page backlinks", error);
      });
    return () => {
      cancelled = true;
    };
  }, [backlinksLoaded, page.meta.id, secondaryExpanded]);

  useEffect(() => {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.entities?.onBacklinksUpdated) return;
    return api.entities.onBacklinksUpdated(() => {
      setBacklinksLoaded(false);
    });
  }, [page.meta.id]);

  const loadPageHistory = useCallback(async () => {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.git?.listPageHistory) return;
    const requestId = ++pageHistoryRequestRef.current;
    setPageHistoryBusy(true);
    try {
      const result = await api.git.listPageHistory(page.meta.id);
      if (pageHistoryRequestRef.current !== requestId) return;
      setPageHistory(result);
      setPageHistoryMessage("");
      if (result.versions.length === 0) setPageHistoryPreview(null);
    } catch (error) {
      if (pageHistoryRequestRef.current !== requestId) return;
      setPageHistory({
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
        pageId: page.meta.id,
        title: page.meta.title,
        versions: []
      });
    } finally {
      if (pageHistoryRequestRef.current === requestId) setPageHistoryBusy(false);
    }
  }, [page.meta.id, page.meta.title]);

  useEffect(() => {
    pageHistoryRequestRef.current += 1;
    setPageHistory(null);
    setPageHistoryPreview(null);
    setPageHistoryMessage("");
    setPageHistoryBusy(false);
  }, [page.meta.id, page.meta.title]);

  useEffect(() => {
    if (!secondaryExpanded) return;
    if (!pageHistory && !pageHistoryBusy) void loadPageHistory();
  }, [loadPageHistory, pageHistory, pageHistoryBusy, secondaryExpanded]);

  const persistTitle = useCallback(async (nextTitle: string) => {
    await onRename(nextTitle);
    if (secondaryExpanded) await loadPageHistory();
  }, [loadPageHistory, onRename, secondaryExpanded]);

  useEffect(() => {
    if (!databases.some((database) => database.id === selectedViewDatabaseId)) {
      setSelectedViewDatabaseId(databases[0]?.id ?? "");
      setSelectedViewId("");
    }
  }, [databases, selectedViewDatabaseId]);

  useEffect(() => {
    if (!viewPickerOpen || !selectedViewDatabaseId) return;
    if (cache.getBundle(selectedViewDatabaseId)) return;
    let cancelled = false;
    setViewPickerLoadingId(selectedViewDatabaseId);
    setViewPickerError("");
    cache.loadBundle(selectedViewDatabaseId)
      .catch(() => {
        if (!cancelled) setViewPickerError(t("page.viewPickerLoadError"));
      })
      .finally(() => {
        if (!cancelled) setViewPickerLoadingId("");
      });
    return () => {
      cancelled = true;
    };
  }, [cache, selectedViewDatabaseId, t, viewPickerOpen]);

  useEffect(() => {
    if (!selectedViewDatabaseId) return;
    const bundle = cache.getBundle(selectedViewDatabaseId);
    if (!bundle) return;
    if (!bundle.views.some((view) => view.id === selectedViewId)) {
      setSelectedViewId(bundle.schema.defaultViewId || bundle.views[0]?.id || "view_default");
    }
  }, [cache, selectedViewDatabaseId, selectedViewId]);

  useEffect(() => {
    const actionCount = (emptyTemplates?.length ?? 0) + 1 + (onCreateEmptyTemplate ? 1 : 0);
    if (emptyPromptIndex >= actionCount) setEmptyPromptIndex(Math.max(0, actionCount - 1));
  }, [emptyPromptIndex, emptyTemplates?.length, onCreateEmptyTemplate]);

  useEffect(() => {
    setEmptyPromptIndex(emptyTemplates?.length ?? 0);
  }, [emptyTemplates?.length, page.meta.id]);

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".page-options-wrap")) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  function insertView(databaseId: string, viewId: string) {
    if (!databaseId) return;
    const block = `\n\n\`\`\`lotion-view\ndatabase: ${databaseId}\nview: ${viewId || "view_default"}\n\`\`\`\n`;
    const next = `${markdownRef.current.trimEnd()}${block}`;
    markdownRef.current = next;
    setEditorValue(next);
    onChange(next);
  }

  function openViewPicker() {
    const databaseId = selectedViewDatabaseId || databases[0]?.id || "";
    setSelectedViewDatabaseId(databaseId);
    setSelectedViewId("");
    setViewPickerError("");
    setViewPickerOpen(true);
  }

  function insertSelectedView() {
    const databaseId = selectedViewDatabaseId || databases[0]?.id || "";
    const bundle = databaseId ? cache.getBundle(databaseId) : undefined;
    const viewId = selectedViewId || bundle?.schema.defaultViewId || bundle?.views[0]?.id || "view_default";
    insertView(databaseId, viewId);
    setViewPickerOpen(false);
    setMenuOpen(false);
  }

  async function toggleFullWidth() {
    if (
      layoutMutationState.status !== "idle"
      || layoutMutationControllerRef.current?.isBlocked()
      || !onSetFullWidth
    ) return;
    const next = !fullWidth;
    setFullWidth(next);
    await layoutMutationControllerRef.current?.submit("fullWidth", next, onSetFullWidth);
  }

  async function toggleSmallText() {
    if (
      layoutMutationState.status !== "idle"
      || layoutMutationControllerRef.current?.isBlocked()
      || !onSetSmallText
    ) return;
    const next = !smallText;
    setSmallText(next);
    await layoutMutationControllerRef.current?.submit("smallText", next, onSetSmallText);
  }

  function mergeViewState(partial: PageEditorViewState) {
    const next = { ...viewStateRef.current, ...partial };
    viewStateRef.current = next;
    if (viewStateKey) pageEditorViewStateStore.set(viewStateKey, next);
    onViewStateChange?.(next);
  }

  function readCurrentViewState(): PageEditorViewState {
    return {
      ...viewStateRef.current,
      ...codeMirrorRef.current?.getViewState()
    };
  }

  const showEmptyPrompt = emptyTemplates !== undefined && editorValue.trim().length === 0 && !emptyPromptDismissed;
  function focusBodyEditorSoon() {
    window.setTimeout(() => codeMirrorRef.current?.focus(), 0);
  }

  async function backupForPageHistory() {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.git?.backupNow) return;
    setPageHistoryBusy(true);
    try {
      const result = await api.git.backupNow(`Lotion page history: ${page.meta.title || page.meta.id}`);
      await loadPageHistory();
      setPageHistoryMessage(result.message);
    } catch (error) {
      setPageHistoryMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPageHistoryBusy(false);
    }
  }

  async function previewHistoryVersion(version: GitPageHistoryVersion) {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.git?.previewPageVersion) return;
    setPageHistoryBusy(true);
    try {
      setPageHistoryPreview(await api.git.previewPageVersion(page.meta.id, version.sha));
      setPageHistoryMessage("");
    } catch (error) {
      setPageHistoryMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPageHistoryBusy(false);
    }
  }

  async function restoreHistoryPreview() {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.git?.restorePageVersion || !pageHistoryPreview) return;
    const ok = window.confirm(`Restore ${page.meta.title} from ${formatHistoryTime(pageHistoryPreview.version.createdAt, dateTimeDefaults)}?`);
    if (!ok) return;
    setPageHistoryBusy(true);
    try {
      const restored = await api.git.restorePageVersion(page.meta.id, pageHistoryPreview.version.sha);
      markdownRef.current = restored.markdown;
      setEditorValue(restored.markdown);
      setTitle(restored.meta.title);
      onChange(restored.markdown);
      setPageHistoryPreview(null);
      await loadPageHistory();
      setPageHistoryMessage("Page restored from local Git history.");
    } catch (error) {
      setPageHistoryMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPageHistoryBusy(false);
    }
  }

  function continueWithEmptyPage() {
    setEmptyPromptDismissed(true);
    focusBodyEditorSoon();
  }

  function applyEmptyTemplate(template: PageEditorEmptyTemplate) {
    const next = template.markdown ?? "";
    markdownRef.current = next;
    setEditorValue(next);
    setEmptyPromptDismissed(true);
    onChange(next);
    void onApplyEmptyTemplate?.(template.id);
    focusBodyEditorSoon();
  }

  function runEmptyPromptAction(index: number) {
    const templates = emptyTemplates ?? [];
    if (index < templates.length) {
      applyEmptyTemplate(templates[index]);
      return;
    }
    if (index === templates.length) {
      continueWithEmptyPage();
      return;
    }
    onCreateEmptyTemplate?.();
  }

  function handleEmptyPromptKeyDown(event: KeyboardEvent<HTMLElement>) {
    const actionCount = (emptyTemplates?.length ?? 0) + 1 + (onCreateEmptyTemplate ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setEmptyPromptIndex((index) => (index + 1) % actionCount);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setEmptyPromptIndex((index) => (index - 1 + actionCount) % actionCount);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.target === event.currentTarget) {
        continueWithEmptyPage();
        return;
      }
      runEmptyPromptAction(emptyPromptIndex);
    }
  }

  useImperativeHandle(ref, () => ({
    getViewState() {
      const next = readCurrentViewState();
      viewStateRef.current = next;
      if (viewStateKey) pageEditorViewStateStore.set(viewStateKey, next);
      return next;
    }
  }));

  const coverSlot = page.meta.cover ? (
    <CoverArea
      mutationKey={page.meta.id}
      src={page.meta.cover}
      offset={page.meta.coverOffset}
      onChangeImage={onPickCover}
      onClear={onClearCover}
      onCommitOffset={onCommitCoverOffset}
    />
  ) : undefined;

  const headerSlot = (
    <>
      <div className="page-icon-row">
        {page.meta.icon ? (
          <button
            type="button"
            className="page-icon-button page-icon-button-large"
            onClick={onPickIcon}
            disabled={!onPickIcon}
            title={t("page.setIcon")}
            aria-label={t("page.setIcon")}
          >
            <EntityIcon kind="page" icon={page.meta.icon} size={64} />
          </button>
        ) : onPickIcon ? (
          <button type="button" className="page-header-addition page-add-icon" onClick={onPickIcon}>
            <SmilePlus size={14} strokeWidth={1.8} />
            <span>{t("page.addIcon")}</span>
          </button>
        ) : null}
        {onPickCover && !page.meta.cover && (
          <button type="button" className="page-header-addition page-add-cover" onClick={onPickCover}>
            <ImagePlus size={14} strokeWidth={1.8} />
            <span>{t("page.addCover")}</span>
          </button>
        )}
      </div>
      <EntityBreadcrumbs items={breadcrumbItems} onOpenEntity={onOpenEntity} />
      <div className="topbar">
        <input
          className="title-input"
          value={title}
          aria-busy={titleMutationState.status === "saving"}
          disabled={titleMutationState.status !== "idle"}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={(event) => {
            // The DOM value is authoritative at the blur boundary. Under a
            // busy renderer, React may not have committed the final onChange
            // state before blur fires.
            submitPageTitleBlurValue(event.currentTarget.value, titleMutationControllerRef.current, persistTitle);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !showEmptyPrompt) return;
            event.preventDefault();
            continueWithEmptyPage();
          }}
        />
        <div className="page-action-bar" aria-label={t("page.actions")}>
          {onToggleFavorite && (
            <button
              type="button"
              className={favorited ? "favorite-toggle on" : "favorite-toggle"}
              onClick={onToggleFavorite}
              title={favorited ? t("page.unfavorite") : t("page.favorite")}
              aria-pressed={!!favorited}
            >
              <StarIcon filled={!!favorited} />
            </button>
          )}
          <div className="page-options-wrap">
            <button
              type="button"
              className={menuOpen ? "page-options-toggle active" : "page-options-toggle"}
              onClick={() => setMenuOpen((open) => !open)}
              title={t("page.options")}
              aria-label={t("page.options")}
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={17} strokeWidth={2} />
            </button>
            {menuOpen && (
              <div className="page-action-menu" role="menu">
                <button
                  type="button"
                  className="page-menu-item page-menu-item-switch"
                  role="menuitemcheckbox"
                  aria-checked={smallText}
                  aria-busy={layoutMutationState.status === "saving" && layoutMutationState.setting === "smallText"}
                  disabled={layoutMutationState.status !== "idle" || !onSetSmallText}
                  onClick={() => void toggleSmallText()}
                >
                  <span className="page-menu-icon" aria-hidden="true">
                    <CaseSensitive size={15} strokeWidth={1.9} />
                  </span>
                  <span>{t("page.smallText")}</span>
                  <span className={smallText ? "page-menu-switch on" : "page-menu-switch"} aria-hidden="true">
                    <span />
                  </span>
                </button>
                <button
                  type="button"
                  className="page-menu-item page-menu-item-switch"
                  role="menuitemcheckbox"
                  aria-checked={fullWidth}
                  aria-busy={layoutMutationState.status === "saving" && layoutMutationState.setting === "fullWidth"}
                  disabled={layoutMutationState.status !== "idle" || !onSetFullWidth}
                  onClick={() => void toggleFullWidth()}
                >
                  <span className="page-menu-icon" aria-hidden="true">
                    <Maximize2 size={15} strokeWidth={1.9} />
                  </span>
                  <span>{t("page.fullWidth")}</span>
                  <span className={fullWidth ? "page-menu-switch on" : "page-menu-switch"} aria-hidden="true">
                    <span />
                  </span>
                </button>
                <button
                  type="button"
                  className="page-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onOpenInNewWindow?.();
                    setMenuOpen(false);
                  }}
                  disabled={!onOpenInNewWindow}
                >
                  <span className="page-menu-icon" aria-hidden="true">
                    <ArrowUpRight size={15} strokeWidth={1.9} />
                  </span>
                  <span>{t("page.openInNewWindow")}</span>
                </button>
                <button
                  type="button"
                  className="page-menu-item"
                  role="menuitem"
                  onClick={() => {
                    openViewPicker();
                  }}
                  disabled={databases.length === 0}
                >
                  <span className="page-menu-icon" aria-hidden="true">+</span>
                  <span>{t("page.insertView")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {titleMutationState.status === "error" && (
        <div
          className="database-mutation-toast page-title-feedback error"
          role="alert"
          aria-live="assertive"
          data-title={titleMutationState.title}
        >
          <span>Page title failed to save: {titleMutationState.error}</span>
          <button type="button" onClick={() => { void titleMutationControllerRef.current?.retry(); }}>Retry</button>
          <button
            type="button"
            onClick={() => {
              if (!titleMutationControllerRef.current?.discard()) return;
              setTitle(page.meta.title);
            }}
          >
            Discard title
          </button>
        </div>
      )}
      {layoutMutationState.status === "error" && (
        <div
          className="database-mutation-toast page-layout-feedback error"
          role="alert"
          aria-live="assertive"
          data-setting={layoutMutationState.setting}
          data-value={String(layoutMutationState.value)}
        >
          <span>Page layout failed to save: {layoutMutationState.error}</span>
          <button type="button" onClick={() => { void layoutMutationControllerRef.current?.retry(); }}>Retry</button>
          <button
            type="button"
            onClick={() => {
              if (!layoutMutationControllerRef.current?.discard()) return;
              setFullWidth(!!page.meta.fullWidth);
              setSmallText(!!page.meta.smallText);
            }}
          >
            Discard layout
          </button>
        </div>
      )}
    </>
  );

  const overlaySlot = viewPickerOpen ? (
    <EmbeddedViewPickerDialog
      databases={databases}
      selectedDatabaseId={selectedViewDatabaseId}
      selectedViewId={selectedViewId}
      loadingDatabaseId={viewPickerLoadingId}
      error={viewPickerError}
      getBundle={(databaseId) => cache.getBundle(databaseId)}
      onSelectDatabase={(databaseId) => {
        setSelectedViewDatabaseId(databaseId);
        setSelectedViewId("");
        setViewPickerError("");
      }}
      onSelectView={setSelectedViewId}
      onCancel={() => setViewPickerOpen(false)}
      onInsert={insertSelectedView}
    />
  ) : undefined;
  const secondarySlot = (
    <PageSecondaryPanel
      expanded={secondaryExpanded}
      pinned={secondaryPinned}
      backlinksCount={backlinks.length}
      historyCount={pageHistory?.versions.length ?? 0}
      onExpand={() => setSecondaryExpanded(true)}
      onCollapse={() => {
        setSecondaryExpanded(false);
        setSecondaryPinned(false);
      }}
      onTogglePinned={() => {
        const nextPinned = !(secondaryPinned && secondaryExpanded);
        setSecondaryPinned(nextPinned);
        setSecondaryExpanded(nextPinned);
      }}
    >
      {propertiesSlot}
      <PageHistoryPanel
        result={pageHistory}
        preview={pageHistoryPreview}
        busy={pageHistoryBusy}
        message={pageHistoryMessage}
        onRefresh={loadPageHistory}
        onBackup={backupForPageHistory}
        onPreview={previewHistoryVersion}
        onRestore={restoreHistoryPreview}
      />
      <PageBacklinks backlinks={backlinks} onOpenEntity={onOpenEntity} />
    </PageSecondaryPanel>
  );

  return (
    <PageLayout
      fullWidth={fullWidth}
      smallText={smallText}
      cover={coverSlot}
      header={headerSlot}
      properties={secondarySlot}
      overlay={overlaySlot}
    >
      {showEmptyPrompt ? (
        <EmptyPagePrompt
          templates={emptyTemplates ?? []}
          selectedIndex={emptyPromptIndex}
          onSelectedIndexChange={setEmptyPromptIndex}
          onKeyDown={handleEmptyPromptKeyDown}
          onApplyTemplate={applyEmptyTemplate}
          onContinueEmpty={continueWithEmptyPage}
          onCreateTemplate={onCreateEmptyTemplate}
        />
      ) : (
        <>
          <div className="page-body">
            <CodeMirrorMarkdownEditor
              ref={codeMirrorRef}
              value={editorValue}
              onChange={(next) => {
                markdownRef.current = next;
                onChange(next);
              }}
              initialViewState={restoredViewState}
              navigationAnchorPos={navigationAnchorPos}
              navigationAnchorKey={navigationAnchorKey}
              onViewStateChange={mergeViewState}
              pages={pages}
              databases={databases}
            />
          </div>
        </>
      )}
    </PageLayout>
  );
});

interface PageSecondaryPanelProps {
  expanded: boolean;
  pinned: boolean;
  backlinksCount: number;
  historyCount: number;
  onExpand: () => void;
  onCollapse: () => void;
  onTogglePinned: () => void;
  children: ReactNode;
}

function PageSecondaryPanel({
  expanded,
  pinned,
  backlinksCount,
  historyCount,
  onExpand,
  onCollapse,
  onTogglePinned,
  children
}: PageSecondaryPanelProps) {
  function collapseIfUnpinned(element: HTMLElement) {
    if (pinned) return;
    const active = document.activeElement;
    if (active instanceof Node && element.contains(active)) return;
    onCollapse();
  }

  return (
    <section
      className={[
        "page-secondary-panel",
        expanded ? "expanded" : "collapsed",
        pinned ? "pinned" : ""
      ].filter(Boolean).join(" ")}
      data-testid="page-secondary-panel"
      aria-label="Page details"
      aria-expanded={expanded}
      onMouseEnter={onExpand}
      onMouseLeave={(event) => collapseIfUnpinned(event.currentTarget)}
      onFocus={onExpand}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        collapseIfUnpinned(event.currentTarget);
      }}
    >
      <button
        type="button"
        className="page-secondary-toggle"
        aria-expanded={expanded}
        aria-controls="page-secondary-content"
        aria-label={expanded ? "Collapse page details" : "Expand page details"}
        title={expanded ? "Collapse page details" : "Expand page details"}
        onClick={onTogglePinned}
      >
        <span className="page-secondary-toggle-icon" aria-hidden="true">{expanded ? "⌃" : "⌄"}</span>
        <span className="page-secondary-toggle-label">Page details</span>
        <span className="page-secondary-summary" aria-hidden="true">
          History{historyCount > 0 ? ` · ${historyCount} versions` : ""}{backlinksCount > 0 ? ` · ${backlinksCount} backlinks` : ""}
        </span>
      </button>
      <div
        id="page-secondary-content"
        className="page-secondary-content"
        aria-hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}

export function PageHistoryPanel({
  result,
  preview,
  busy,
  message,
  onRefresh,
  onBackup,
  onPreview,
  onRestore
}: {
  result: GitPageHistoryResult | null;
  preview: GitPageHistoryPreview | null;
  busy: boolean;
  message?: string;
  onRefresh?: () => void | Promise<void>;
  onBackup?: () => void | Promise<void>;
  onPreview?: (version: GitPageHistoryVersion) => void | Promise<void>;
  onRestore?: () => void | Promise<void>;
}) {
  const dateTimeDefaults = useDateTimeDisplayDefaults();
  const state = result?.state ?? "history_empty";
  const status = result?.message ?? "Loading local Git history.";
  const versions = result?.versions ?? [];
  return (
    <section className="page-history-panel" aria-label="Page history">
      <div className="page-history-title">
        <span className="page-history-title-copy">
          <History size={14} strokeWidth={2} />
          <span>Page history</span>
          <span className="page-backlinks-count">{versions.length}</span>
        </span>
        <span className={`page-history-status ${state}`}>{pageHistoryStateLabel(state)}</span>
      </div>
      <p className="page-history-message">{message || status}</p>
      <div className="page-history-actions">
        <button type="button" onClick={() => void onRefresh?.()} disabled={busy}>Refresh</button>
        <button type="button" onClick={() => void onBackup?.()} disabled={busy}>Backup now</button>
      </div>
      {versions.length > 0 && (
        <div className="page-history-list" role="list" aria-label="Local Git page history">
          {versions.map((version) => (
            <button
              key={version.id}
              type="button"
              className={preview?.version.sha === version.sha ? "page-history-version selected" : "page-history-version"}
              onClick={() => void onPreview?.(version)}
              disabled={busy}
            >
              <span>{version.message}</span>
              <small>{formatHistoryTime(version.createdAt, dateTimeDefaults)} · {version.shortSha}</small>
            </button>
          ))}
        </div>
      )}
      {preview && (
        <div className="page-history-preview" aria-label="Local Git page history diff preview">
          <div className="page-history-preview-header">
            <span>{pageHistoryPreviewLabel(preview.version)}</span>
            <button type="button" onClick={() => void onRestore?.()} disabled={busy}>Restore</button>
          </div>
          <pre>
            {preview.diff.slice(0, 80).map((line, index) => (
              <span key={`${index}:${line.type}`} className={`page-history-diff-line ${line.type}`}>
                {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}{line.text || " "}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}

function pageHistoryStateLabel(state: GitPageHistoryResult["state"]): string {
  if (state === "ready") return "Ready";
  if (state === "repo_missing") return "Repo missing";
  if (state === "failed") return "Failed";
  return "History empty";
}

function formatHistoryTime(value: string, defaults: DateTimeDisplayDefaults): string {
  return formatDateForField(value, { type: "updated_time" }, defaults);
}

export function pageHistoryPreviewLabel(version: Pick<GitPageHistoryVersion, "title">): string {
  const title = version.title.trim() || "Untitled";
  return `Page snapshot · ${title}`;
}

interface EmbeddedViewPickerDialogProps {
  databases: DatabaseSummary[];
  selectedDatabaseId: string;
  selectedViewId: string;
  loadingDatabaseId: string;
  error: string;
  getBundle: (databaseId: string) => DatabaseBundle | undefined;
  onSelectDatabase: (databaseId: string) => void;
  onSelectView: (viewId: string) => void;
  onCancel: () => void;
  onInsert: () => void;
}

function EmbeddedViewPickerDialog({
  databases,
  selectedDatabaseId,
  selectedViewId,
  loadingDatabaseId,
  error,
  getBundle,
  onSelectDatabase,
  onSelectView,
  onCancel,
  onInsert
}: EmbeddedViewPickerDialogProps) {
  const { t } = useI18n();
  const selectedDatabase = databases.find((database) => database.id === selectedDatabaseId) ?? databases[0];
  const bundle = selectedDatabase ? getBundle(selectedDatabase.id) : undefined;
  const views = bundle?.views ?? [];
  const activeViewId = selectedViewId || bundle?.schema.defaultViewId || views[0]?.id || "";
  const canInsert = Boolean(selectedDatabase && activeViewId && bundle);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="view-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t("page.viewPickerTitle")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <h2>{t("page.viewPickerTitle")}</h2>
            <p>{t("page.viewPickerHint")}</p>
          </div>
          <button type="button" onClick={onCancel}>{t("common.close")}</button>
        </div>

        <div className="view-picker-body">
          <div className="view-picker-list" aria-label={t("sidebar.databases")}>
            {databases.map((database) => {
              const active = database.id === selectedDatabase?.id;
              return (
                <button
                  key={database.id}
                  type="button"
                  className={active ? "view-picker-database active" : "view-picker-database"}
                  onClick={() => onSelectDatabase(database.id)}
                >
                  <EntityIcon kind="database" icon={database.icon} size={18} />
                  <span>
                    <strong>{database.name}</strong>
                    <small>{databasePathLabel(database.path) || database.id}</small>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="view-picker-detail">
            {!selectedDatabase && <div className="view-picker-empty">{t("page.viewPickerNoDatabases")}</div>}
            {selectedDatabase && loadingDatabaseId === selectedDatabase.id && (
              <div className="view-picker-empty">{t("page.viewPickerLoading")}</div>
            )}
            {selectedDatabase && error && <div className="view-picker-empty error">{error}</div>}
            {selectedDatabase && bundle && views.length === 0 && (
              <div className="view-picker-empty">{t("page.viewPickerNoViews")}</div>
            )}
            {selectedDatabase && bundle && views.length > 0 && (
              <div className="view-picker-views">
                {views.map((view) => (
                  <ViewPickerRow
                    key={view.id}
                    view={view}
                    active={view.id === activeViewId}
                    onClick={() => onSelectView(view.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" disabled={!canInsert} onClick={onInsert}>{t("page.viewPickerInsert")}</button>
        </div>
      </div>
    </div>
  );
}

function ViewPickerRow({ view, active, onClick }: { view: TableView; active: boolean; onClick: () => void }) {
  const provider = pluginHost.views.get(view.type);
  return (
    <button type="button" className={active ? "view-picker-view active" : "view-picker-view"} onClick={onClick}>
      <ViewTypeIcon type={view.type} providerIcon={provider?.icon} />
      <span>
        <strong>{view.name}</strong>
        <small>{provider?.label || view.type}</small>
      </span>
    </button>
  );
}

export function PageBacklinks({
  backlinks,
  onOpenEntity
}: {
  backlinks: EntityBacklink[];
  onOpenEntity?: (ref: EntityRef) => void;
}) {
  const { locale, t } = useI18n();
  if (backlinks.length === 0) return null;
  return (
    <section className="page-backlinks" aria-label={t("page.backlinks")}>
      <div className="page-backlinks-title">
        <span>{t("page.backlinks")}</span>
        <span className="page-backlinks-count">{backlinks.length}</span>
      </div>
      <div className="page-backlinks-list">
        {backlinks.map((backlink, index) => {
          const title = backlink.source.title || backlink.source.titleSnapshot || t("common.untitled");
          const path = backlink.source.path ?? backlink.source.pathSnapshot ?? [];
          const sourcePath = backlinkSourcePathLabel(path, title);
          const sourceType = backlinkSourceTypeLabel(backlink.source, t);
          const context = backlinkContextLabel(backlink, t);
          const excerpt = backlinkExcerptLabel(backlink.excerpt);
          const ariaLabel = locale === "zh"
            ? `打开反向链接来源：${title}（${sourceType}）`
            : `Open backlink source: ${title} (${sourceType})`;
          return (
            <button
              key={`${backlink.source.entityId}-${backlink.type}-${backlink.line ?? backlink.fieldId ?? index}`}
              type="button"
              className="page-backlink-item"
              data-has-path={sourcePath ? "true" : undefined}
              data-has-excerpt={excerpt ? "true" : undefined}
              onClick={() => onOpenEntity?.(backlink.source)}
              disabled={!onOpenEntity}
              aria-label={ariaLabel}
              title={path.length > 0 ? path.join(" / ") : title}
            >
              <EntityIcon kind={entityIconKind(backlink.source)} icon={backlink.source.icon} size={16} />
              <span className="page-backlink-copy">
                <span className="page-backlink-heading">
                  <span className="page-backlink-title">{title}</span>
                  <span className="page-backlink-type">{sourceType}</span>
                </span>
                {sourcePath && <span className="page-backlink-path">{sourcePath}</span>}
                <span className="page-backlink-context">{context}</span>
                {excerpt && <span className="page-backlink-excerpt">{excerpt}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function backlinkSourcePathLabel(path: string[], title: string): string {
  const normalized = path.map((part) => part.trim()).filter(Boolean);
  if (normalized.length === 0) return "";
  const last = normalized[normalized.length - 1];
  const parts = last === title ? normalized.slice(0, -1) : normalized;
  return parts.join(" / ");
}

export function backlinkExcerptLabel(value?: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  return normalized
    .replace(/!?\[([^\]]+)\]\((?:\\.|[^)])*\)/g, "$1")
    .replace(/<(?:(?:databases|pages)\/[^>]+)>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function backlinkSourceTypeLabel(ref: EntityRef, t: ReturnType<typeof useI18n>["t"]): string {
  if (ref.kind === "database") return t("page.backlinkSourceDatabase");
  if (ref.kind === "row") return t("page.backlinkSourceRow");
  return t("page.backlinkSourcePage");
}

function backlinkContextLabel(backlink: EntityBacklink, t: (key: "page.backlinksMarkdown" | "page.backlinksProperty") => string): string {
  if (backlink.type === "markdown") {
    return backlink.line ? `${t("page.backlinksMarkdown")} · L${backlink.line}` : t("page.backlinksMarkdown");
  }
  const parts = [t("page.backlinksProperty")];
  if (backlink.databaseName) parts.push(backlink.databaseName);
  if (backlink.fieldName) parts.push(backlink.fieldName);
  return parts.join(" · ");
}

function entityIconKind(ref: EntityRef): "page" | "database" | "row_page" | "workspace" {
  if (ref.kind === "database") return "database";
  if (ref.kind === "row") return "row_page";
  return "page";
}

function databasePathLabel(path: string[] | undefined): string {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 1 ? segments.join(" / ") : "";
}

interface EmptyPagePromptProps {
  templates: PageEditorEmptyTemplate[];
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onApplyTemplate: (template: PageEditorEmptyTemplate) => void;
  onContinueEmpty: () => void;
  onCreateTemplate?: () => void;
}

function EmptyPagePrompt({
  templates,
  selectedIndex,
  onSelectedIndexChange,
  onKeyDown,
  onApplyTemplate,
  onContinueEmpty,
  onCreateTemplate
}: EmptyPagePromptProps) {
  const { t } = useI18n();
  const emptyIndex = templates.length;
  const createIndex = templates.length + 1;
  return (
    <section
      className="empty-page-prompt"
      tabIndex={0}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onSelectedIndexChange(emptyIndex);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="empty-page-prompt-divider" />
      <p className="empty-page-prompt-hint">{t("templates.emptyPrompt")}</p>
      <div className="empty-template-list">
        {templates.map((template, index) => (
          <button
            key={template.id}
            type="button"
            className={selectedIndex === index ? "empty-template-option active" : "empty-template-option"}
            onMouseEnter={() => onSelectedIndexChange(index)}
            onFocus={() => onSelectedIndexChange(index)}
            onClick={() => onApplyTemplate(template)}
          >
            <EntityIcon kind="row_page" icon={template.icon} size={18} />
            <span>{template.name}</span>
          </button>
        ))}
        <button
          type="button"
          className={selectedIndex === emptyIndex ? "empty-template-option active" : "empty-template-option"}
          onMouseEnter={() => onSelectedIndexChange(emptyIndex)}
          onFocus={() => onSelectedIndexChange(emptyIndex)}
          onClick={onContinueEmpty}
        >
          <EntityIcon kind="page" size={18} />
          <span>{t("templates.emptyPage")}</span>
        </button>
        {onCreateTemplate && (
          <button
            type="button"
            className={selectedIndex === createIndex ? "empty-template-option active" : "empty-template-option"}
            onMouseEnter={() => onSelectedIndexChange(createIndex)}
            onFocus={() => onSelectedIndexChange(createIndex)}
            onClick={onCreateTemplate}
          >
            <span className="empty-template-plus" aria-hidden="true">+</span>
            <span>{t("templates.newTemplate")}</span>
          </button>
        )}
      </div>
    </section>
  );
}
