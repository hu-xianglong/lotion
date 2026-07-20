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
import { ArrowUpRight, CaseSensitive, History, ImagePlus, Maximize2, MoreHorizontal, SmilePlus } from "lucide-react";
import { useDatabaseCache } from "../../context/database-cache";
import { ViewTypeIcon } from "../../components/FieldTypeIcon";
import { pluginHost } from "../../plugin-host";
import { FavoriteToggle } from "../../components/FavoriteToggle";

interface PageEditorProps {
  page: PageDocument;
  databases: DatabaseSummary[];
  /** All workspace pages — passed through to the editor so inline link
   *  widgets can resolve target page icons. */
  pages?: PageMeta[];
  onChange: (markdown: string) => void;
  onRename: (title: string) => void;
  /** Called when the user clicks the icon slot. The host wires this to
   *  the `icons:setForPage` IPC and triggers a refresh on success. */
  onPickIcon?: () => void;
  /** Called when the user clicks "Add cover" / "Change cover". */
  onPickCover?: () => void;
  /** Called when the user clicks "Remove cover". */
  onClearCover?: () => void;
  /** Called when the user finishes a reposition drag. */
  onCommitCoverOffset?: (offset: number) => void;
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
  viewStateKey?: string;
  initialViewState?: PageEditorViewState;
  navigationAnchorPos?: number;
  navigationAnchorKey?: string;
  onViewStateChange?: (state: PageEditorViewState) => void;
  emptyTemplates?: PageEditorEmptyTemplate[];
  onApplyEmptyTemplate?: (templateId: string) => void | Promise<void>;
  onCreateEmptyTemplate?: () => void;
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
  const cache = useDatabaseCache();
  const restoredViewState = initialViewState ?? (viewStateKey ? pageEditorViewStateStore.get(viewStateKey) : undefined);
  const [title, setTitle] = useState(page.meta.title);
  const [editorValue, setEditorValue] = useState(page.markdown);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewPickerOpen, setViewPickerOpen] = useState(false);
  const [selectedViewDatabaseId, setSelectedViewDatabaseId] = useState(databases[0]?.id ?? "");
  const [selectedViewId, setSelectedViewId] = useState("");
  const [viewPickerLoadingId, setViewPickerLoadingId] = useState("");
  const [viewPickerError, setViewPickerError] = useState("");
  const [fullWidth, setFullWidth] = useState(!!page.meta.fullWidth);
  const [smallText, setSmallText] = useState(!!page.meta.smallText);
  const [fullWidthSaving, setFullWidthSaving] = useState(false);
  const [smallTextSaving, setSmallTextSaving] = useState(false);
  const [emptyPromptDismissed, setEmptyPromptDismissed] = useState(false);
  const [emptyPromptIndex, setEmptyPromptIndex] = useState(() => emptyTemplates?.length ?? 0);
  const [backlinks, setBacklinks] = useState<EntityBacklink[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  const [pageHistory, setPageHistory] = useState<GitPageHistoryResult | null>(null);
  const [pageHistoryPreview, setPageHistoryPreview] = useState<GitPageHistoryPreview | null>(null);
  const [pageHistoryBusy, setPageHistoryBusy] = useState(false);
  const [pageHistoryMessage, setPageHistoryMessage] = useState("");
  const [secondaryExpanded, setSecondaryExpanded] = useState(false);
  const [secondaryPinned, setSecondaryPinned] = useState(false);
  const codeMirrorRef = useRef<CodeMirrorMarkdownEditorHandle | null>(null);
  const markdownRef = useRef(page.markdown);
  const pageIdRef = useRef(page.meta.id);
  const viewStateRef = useRef<PageEditorViewState>(restoredViewState ?? {});
  const parentLink = parentLinkFromMeta(page.meta, pages, databases);
  const pathSegments = pagePathSegments(page.meta, parentLink);
  const parentPathIndex = parentPathSegmentIndex(pathSegments, parentLink);

  useEffect(() => {
    setTitle(page.meta.title);
  }, [page.meta.id, page.meta.title]);

  useEffect(() => {
    setFullWidth(!!page.meta.fullWidth);
  }, [page.meta.id, page.meta.fullWidth]);

  useEffect(() => {
    setSmallText(!!page.meta.smallText);
  }, [page.meta.id, page.meta.smallText]);

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

  const loadPageHistory = useCallback(async () => {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.git?.listPageHistory) return;
    setPageHistoryBusy(true);
    try {
      const result = await api.git.listPageHistory(page.meta.id);
      setPageHistory(result);
      setPageHistoryMessage("");
      if (result.versions.length === 0) setPageHistoryPreview(null);
    } catch (error) {
      setPageHistory({
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
        pageId: page.meta.id,
        title: page.meta.title,
        versions: []
      });
    } finally {
      setPageHistoryBusy(false);
    }
  }, [page.meta.id, page.meta.title]);

  useEffect(() => {
    setPageHistory(null);
    setPageHistoryPreview(null);
    setPageHistoryMessage("");
    setPageHistoryBusy(false);
  }, [page.meta.id, page.meta.title]);

  useEffect(() => {
    if (!secondaryExpanded) return;
    if (!pageHistory && !pageHistoryBusy) void loadPageHistory();
  }, [loadPageHistory, pageHistory, pageHistoryBusy, secondaryExpanded]);

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
    if (fullWidthSaving) return;
    const previous = fullWidth;
    const next = !previous;
    setFullWidth(next);
    setFullWidthSaving(true);
    try {
      await onSetFullWidth?.(next);
    } catch (error) {
      setFullWidth(previous);
      console.error("Failed to persist full width setting", error);
    } finally {
      setFullWidthSaving(false);
    }
  }

  async function toggleSmallText() {
    if (smallTextSaving) return;
    const previous = smallText;
    const next = !previous;
    setSmallText(next);
    setSmallTextSaving(true);
    try {
      await onSetSmallText?.(next);
    } catch (error) {
      setSmallText(previous);
      console.error("Failed to persist small text setting", error);
    } finally {
      setSmallTextSaving(false);
    }
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
  const pagePathLabel = pathSegments.join(" / ");

  function focusBodyEditorSoon() {
    window.setTimeout(() => codeMirrorRef.current?.focus(), 0);
  }

  async function backupForPageHistory() {
    const api = typeof window === "undefined" ? undefined : window.lotion;
    if (!api?.git?.backupNow) return;
    setPageHistoryBusy(true);
    try {
      const result = await api.git.backupNow(`Lotion page history: ${page.meta.title || page.meta.id}`);
      setPageHistoryMessage(result.message);
      await loadPageHistory();
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
    const ok = window.confirm(`Restore ${page.meta.title} from ${formatHistoryTime(pageHistoryPreview.version.createdAt)}?`);
    if (!ok) return;
    setPageHistoryBusy(true);
    try {
      const restored = await api.git.restorePageVersion(page.meta.id, pageHistoryPreview.version.sha);
      markdownRef.current = restored.markdown;
      setEditorValue(restored.markdown);
      setTitle(restored.meta.title);
      onChange(restored.markdown);
      setPageHistoryPreview(null);
      setPageHistoryMessage("Page restored from local Git history.");
      await loadPageHistory();
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
      {(pathSegments.length > 1 || parentLink) && (
        <div className="page-path-label" title={pagePathLabel || parentLink?.label}>
          {pathSegments.length > 1 ? (
            pathSegments.map((segment, index) => {
              const isParent = !!parentLink && index === parentPathIndex;
              return (
                <span key={`${segment}-${index}`} className="page-path-part">
                  {index > 0 && <span className="page-path-separator">/</span>}
                  {isParent && parentLink.ref && onOpenEntity ? (
                    <button
                      type="button"
                      className="page-path-link"
                      onClick={() => onOpenEntity(parentLink.ref as EntityRef)}
                      title={parentLink.label}
                    >
                      {parentLink.label}
                    </button>
                  ) : (
                    <span className="page-path-segment">{segment}</span>
                  )}
                </span>
              );
            })
          ) : parentLink?.ref && onOpenEntity ? (
            <button
              type="button"
              className="page-path-link"
              onClick={() => onOpenEntity(parentLink.ref as EntityRef)}
              title={parentLink.label}
            >
              {parentLink.label}
            </button>
          ) : (
            <span className="page-path-segment">{parentLink?.label}</span>
          )}
        </div>
      )}
      <div className="topbar">
        <input
          className="title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => onRename(title)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !showEmptyPrompt) return;
            event.preventDefault();
            continueWithEmptyPage();
          }}
        />
        <div className="page-action-bar" aria-label={t("page.actions")}>
          {onToggleFavorite && (
            <FavoriteToggle favorited={favorited} onToggle={onToggleFavorite} />
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
                  aria-busy={smallTextSaving}
                  disabled={smallTextSaving}
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
                  aria-busy={fullWidthSaving}
                  disabled={fullWidthSaving}
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
              <small>{formatHistoryTime(version.createdAt)} · {version.shortSha}</small>
            </button>
          ))}
        </div>
      )}
      {preview && (
        <div className="page-history-preview" aria-label="Local Git page history diff preview">
          <div className="page-history-preview-header">
            <span>{preview.version.path}</span>
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

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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
          const excerpt = backlink.excerpt?.trim();
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
  const segments = pagePathSegmentsFromPath(path) ?? [];
  return segments.length > 1 ? segments.join(" / ") : "";
}

interface ParentEntityLink {
  label: string;
  ref?: EntityRef;
  path?: string[];
}

function pagePathSegments(meta: PageMeta, parentLink?: ParentEntityLink): string[] {
  const segments = (meta.path ?? []).map((segment) => segment.trim()).filter(Boolean);
  const parentPath = pagePathSegmentsFromPath(parentLink?.path);
  const title = meta.title.trim() || "Untitled";
  if (!parentPath || !title) return segments;
  const expected = [...parentPath, title];
  const prefixMatches = parentPath.every((segment, index) => segments[index] === segment);
  const titleMatches = segments[segments.length - 1] === title;
  return prefixMatches && titleMatches && segments.length === expected.length ? segments : expected;
}

function parentLinkFromMeta(
  meta: PageMeta,
  pages: PageMeta[] | undefined,
  databases: DatabaseSummary[]
): ParentEntityLink | undefined {
  if (!meta.parentId) return undefined;
  const kind = meta.parentKind ?? "page";
  let label = parentTitleFromPath(meta);
  let parentPath = parentPathFromMeta(meta);
  if (kind === "database") {
    const database = databases.find((item) => item.id === meta.parentId);
    label = database?.name || label;
    parentPath = pagePathSegmentsFromPath(database?.path) ?? parentPath;
  } else if (kind === "page") {
    const page = pages?.find((item) => item.id === meta.parentId);
    label = page?.title || label;
    parentPath = pagePathSegmentsFromPath(page?.path) ?? parentPath;
  }
  label = label || "Parent";
  return {
    label,
    path: parentPath,
    ref: {
      entityId: meta.parentId,
      kind,
      rowId: kind === "row" ? meta.parentId : undefined,
      titleSnapshot: label,
      pathSnapshot: parentPath
    }
  };
}

function parentPathSegmentIndex(path: string[], parentLink: ParentEntityLink | undefined): number {
  if (!parentLink || path.length <= 1) return -1;
  const parentPath = pagePathSegmentsFromPath(parentLink.path) ?? [];
  if (parentPath.length > 0 && parentPath.length < path.length) {
    const prefixMatches = parentPath.every((segment, index) => path[index] === segment);
    if (prefixMatches) return parentPath.length - 1;
  }
  const labelIndex = path.findIndex((segment, index) => index < path.length - 1 && segment === parentLink.label);
  if (labelIndex >= 0) return labelIndex;
  return path.length - 2;
}

function parentTitleFromPath(meta: PageMeta): string {
  const path = pagePathSegments(meta);
  return path.length >= 2 ? path[path.length - 2] : "";
}

function parentPathFromMeta(meta: PageMeta): string[] | undefined {
  const path = pagePathSegments(meta);
  if (path.length <= 1) return undefined;
  return path.slice(0, -1);
}

function pagePathSegmentsFromPath(path: string[] | undefined): string[] | undefined {
  const segments = (path ?? []).map((segment) => segment.trim()).filter(Boolean);
  return segments.length > 0 ? segments : undefined;
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
