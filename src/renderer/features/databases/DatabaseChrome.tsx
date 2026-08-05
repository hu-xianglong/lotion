import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowUpRight, ImagePlus, RefreshCw, SmilePlus } from "lucide-react";
import type { DatabaseBundle, EntityRef, FieldSchema, TableView } from "../../../shared/types";
import type { DatabaseViewProvider } from "../../../shared/plugin-api";
import { EntityIcon } from "../../components/EntityIcon";
import { FieldTypeIcon, ViewTypeIcon } from "../../components/FieldTypeIcon";
import { SettingsIcon } from "../../components/Icons";
import { useI18n } from "../../lib/i18n";
import { CoverArea } from "../pages/CoverArea";
import { EntityBreadcrumbs, type EntityBreadcrumbItem } from "../../components/EntityBreadcrumbs";

export type ViewOrderMutationStatus = "submitted" | "failed" | "ignored";

export function viewOrderControlsBlocked(pending: boolean, retryable: boolean): boolean {
  return pending || retryable;
}

export async function runViewOrderMutation({
  guard,
  onError,
  onPendingChange,
  onSuccess,
  operation
}: {
  guard: { current: boolean };
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  operation: () => Promise<void>;
}): Promise<ViewOrderMutationStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await operation();
    onSuccess();
    return "submitted";
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
}

export function DatabaseProperties({
  tags,
  onChangeTags
}: {
  tags: string[];
  onChangeTags: (tags: string[]) => void;
}) {
  const { t } = useI18n();
  const [tagsText, setTagsText] = useState(tags.join(", "));

  useEffect(() => {
    setTagsText(tags.join(", "));
  }, [tags]);

  function commitTags() {
    const next = tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.join(",") === next.join(",")) return;
    onChangeTags(next);
  }

  return (
    <div className="row-properties page-properties database-properties">
      <div className="row-property">
        <div className="row-property-label">
          <span className="row-property-icon"><FieldTypeIcon type="multi_select" /></span>
          <span className="row-property-name">{t("page.props.tags")}</span>
        </div>
        <div className="row-property-value">
          <input
            className="page-property-input"
            value={tagsText}
            placeholder={t("cell.empty")}
            onChange={(event) => setTagsText(event.target.value)}
            onBlur={commitTags}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function StandaloneDatabaseHeader({
  bundle,
  breadcrumbs,
  onPickIcon,
  onPickCover,
  onClearCover,
  onCommitCoverOffset,
  onOpenEntity,
  onOpenInNewWindow
}: {
  bundle: DatabaseBundle;
  breadcrumbs?: EntityBreadcrumbItem[];
  onPickIcon?: () => void;
  onPickCover?: () => void;
  onClearCover?: () => void;
  onCommitCoverOffset?: (offset: number) => void | Promise<void>;
  onOpenEntity?: (ref: EntityRef) => void;
  onOpenInNewWindow?: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <>
      {bundle.schema.cover && (
        <CoverArea
          mutationKey={bundle.schema.id}
          src={bundle.schema.cover}
          offset={bundle.schema.coverOffset}
          onChangeImage={onPickCover}
          onClear={onClearCover}
          onCommitOffset={onCommitCoverOffset}
        />
      )}
      <div className="page-header">
        <div className="page-icon-row">
          {bundle.schema.icon ? (
            <button
              type="button"
              className="page-icon-button page-icon-button-large"
              onClick={onPickIcon}
              disabled={!onPickIcon}
              title={t("page.setIcon")}
              aria-label={t("page.setIcon")}
            >
              <EntityIcon kind="database" icon={bundle.schema.icon} size={64} />
            </button>
          ) : onPickIcon ? (
            <button type="button" className="page-header-addition page-add-icon" onClick={onPickIcon}>
              <SmilePlus size={14} strokeWidth={1.8} />
              <span>{t("page.addIcon")}</span>
            </button>
          ) : null}
          {onPickCover && !bundle.schema.cover && (
            <button type="button" className="page-header-addition page-add-cover" onClick={onPickCover}>
              <ImagePlus size={14} strokeWidth={1.8} />
              <span>{t("page.addCover")}</span>
            </button>
          )}
        </div>
        <EntityBreadcrumbs items={breadcrumbs ?? []} onOpenEntity={onOpenEntity} />
        <div className="database-toolbar">
          <div className="database-title-wrap">
            <h1>{bundle.schema.name}</h1>
            <div className="database-subtitle">
              <span>{formatDbStats(locale, bundle)}</span>
            </div>
          </div>
          {onOpenInNewWindow && (
            <button
              type="button"
              className="database-open-window"
              onClick={onOpenInNewWindow}
              title={t("page.openInNewWindow")}
              aria-label={t("page.openInNewWindow")}
            >
              <ArrowUpRight size={16} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function EmbeddedDatabaseHeader({
  bundle,
  title,
  subtitle,
  activeView,
  activeViewTypeLabel,
  activePluginView,
  viewActions,
  refreshing,
  onOpen,
  onRefresh,
  onOpenSettings
}: {
  bundle: DatabaseBundle;
  title?: string;
  subtitle?: string;
  activeView: TableView;
  activeViewTypeLabel: string;
  activePluginView?: DatabaseViewProvider;
  viewActions: ReactNode;
  refreshing: boolean;
  onOpen?: () => void;
  onRefresh?: () => void | Promise<void>;
  onOpenSettings: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { t } = useI18n();
  const resolvedTitle = title || bundle.schema.name;
  const resolvedSubtitle = subtitle || `${activeView.name} · ${activeViewTypeLabel}`;

  return (
    <div className="embedded-view-header">
      <div className="embedded-view-titlebar">
        <EntityIcon
          kind="database"
          icon={bundle.schema.icon}
          size={22}
          className="embedded-view-database-icon"
        />
        <div className="embedded-view-title-stack">
          <strong title={resolvedTitle}>{resolvedTitle}</strong>
          <span className="embedded-view-subtitle" title={resolvedSubtitle}>
            <ViewTypeIcon type={activeView.type} providerIcon={activePluginView?.icon} />
            <span>{activeView.name}</span>
            <span aria-hidden="true">·</span>
            <span>{activeViewTypeLabel}</span>
          </span>
        </div>
        <div className="embedded-view-header-actions">
          {onOpen && (
            <button type="button" onClick={onOpen}>
              {t("rowPage.open")}
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              className="toolbar-icon"
              onClick={() => void onRefresh()}
              disabled={refreshing}
              title={refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
              aria-label={refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
            >
              <RefreshCw size={16} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            className="toolbar-icon"
            onClick={onOpenSettings}
            title={t("toolbar.viewSettings")}
            aria-label={t("toolbar.viewSettings")}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>
      {viewActions}
    </div>
  );
}

export function DatabaseViewTabsBar({
  views,
  activeView,
  embedded,
  viewActions,
  getProvider,
  onSelectView,
  onCreateView,
  onReorderViews,
  onOpenViewMenu,
  structuralDisabledReason,
  menuLayerOpen = false
}: {
  views: TableView[];
  activeView: TableView;
  embedded: boolean;
  viewActions?: ReactNode;
  getProvider: (type: string) => DatabaseViewProvider | undefined;
  onSelectView: (view: TableView) => void;
  onCreateView: () => void;
  onReorderViews: (viewIds: string[]) => Promise<void>;
  onOpenViewMenu: (view: TableView, anchor: { left: number; top: number }) => void;
  structuralDisabledReason?: string;
  menuLayerOpen?: boolean;
}) {
  const { t } = useI18n();
  const preferenceKey = `lotion.database.viewTabs.${activeView.databaseId}`;
  const [display, setDisplay] = useState<"both" | "text" | "icon">(() => {
    if (typeof window === "undefined") return "both";
    const saved = window.localStorage.getItem(preferenceKey);
    return saved === "text" || saved === "icon" ? saved : "both";
  });
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth <= 1100);
  const [moreOpen, setMoreOpen] = useState(false);
  const draggedId = useRef<string | null>(null);
  const reorderGuard = useRef(false);
  const reorderRetryRef = useRef<string[] | null>(null);
  const [reorderPending, setReorderPending] = useState(false);
  const [reorderFeedback, setReorderFeedback] = useState<{ kind: "error" | "success"; message: string; retryable?: boolean }>();
  const tabsRef = useRef<HTMLDivElement>(null);
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth <= 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => window.localStorage.setItem(preferenceKey, display), [display, preferenceKey]);
  useEffect(() => { if (menuLayerOpen) setMoreOpen(false); }, [menuLayerOpen]);
  useEffect(() => {
    if (!moreOpen) return;
    requestAnimationFrame(() => moreWrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    function closeOnOutside(event: globalThis.MouseEvent) {
      if (event.target instanceof Node && moreWrapRef.current?.contains(event.target)) return;
      setMoreOpen(false);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMoreOpen(false);
      requestAnimationFrame(() => moreTriggerRef.current?.focus());
    }
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  // Full-page databases share this row with filter/sort/search/new-row actions.
  // Seven text tabs can visually fit the viewport while still sitting under
  // those actions, so overflow before that collision point.
  const limit = compact ? (embedded ? 2 : 3) : views.length > 6 ? 5 : views.length;
  const leading = views.slice(0, limit);
  const visibleViews = leading.some((view) => view.id === activeView.id) || views.length <= limit
    ? leading
    : [...leading.slice(0, Math.max(0, limit - 1)), activeView];
  const visibleIds = new Set(visibleViews.map((view) => view.id));
  const overflowViews = views.filter((view) => !visibleIds.has(view.id));
  const reorderControlsBlocked = viewOrderControlsBlocked(reorderPending, reorderFeedback?.retryable === true);

  function submitOrder(viewIds: string[]) {
    if (!reorderGuard.current) reorderRetryRef.current = [...viewIds];
    return runViewOrderMutation({
      guard: reorderGuard,
      operation: async () => { await onReorderViews(viewIds); },
      onError: (message) => setReorderFeedback({ kind: "error", message, retryable: true }),
      onPendingChange: setReorderPending,
      onSuccess: () => {
        reorderRetryRef.current = null;
        setReorderFeedback({ kind: "success", message: "View order saved." });
      }
    });
  }

  function dismissReorderFeedback() {
    if (reorderGuard.current) return;
    reorderRetryRef.current = null;
    setReorderFeedback(undefined);
  }

  function moveView(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = views.map((view) => view.id);
    const sourceIndex = next.indexOf(sourceId);
    const targetIndex = next.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, sourceId);
    void submitOrder(next);
  }

  function switchWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, view: TableView) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = views.findIndex((item) => item.id === view.id);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = views[(index + delta + views.length) % views.length];
    if (!next) return;
    onSelectView(next);
    requestAnimationFrame(() => {
      const nextTab = Array.from(tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
        .find((candidate) => candidate.dataset.viewId === next.id);
      nextTab?.focus();
    });
  }

  function renderTab(item: TableView) {
    const active = item.id === activeView.id;
    const provider = getProvider(item.type);
    return (
      <button
        key={item.id}
        role="tab"
        disabled={reorderControlsBlocked}
        data-view-id={item.id}
        aria-selected={active}
        aria-label={display === "icon" ? item.name : undefined}
        className={active ? `view-tab active display-${display}` : `view-tab display-${display}`}
        draggable={!structuralDisabledReason && !reorderControlsBlocked}
        onDragStart={() => { draggedId.current = item.id; }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => { if (draggedId.current) moveView(draggedId.current, item.id); draggedId.current = null; }}
        onKeyDown={(event) => switchWithKeyboard(event, item)}
        onClick={(event) => {
          if (active) {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenViewMenu(item, { left: rect.left, top: rect.bottom + 4 });
          } else {
            onSelectView(item);
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenViewMenu(item, { left: event.clientX, top: event.clientY });
        }}
      >
        {display !== "text" && <ViewTypeIcon type={item.type} providerIcon={provider?.icon} />}
        {display !== "icon" && <span className="view-tab-label">{item.name}</span>}
      </button>
    );
  }

  return (
    <>
      <div
        className="view-tabs-bar view-order-controls"
        aria-disabled={reorderControlsBlocked}
        aria-busy={reorderPending}
        inert={reorderControlsBlocked}
      >
        <div ref={tabsRef} className="view-tabs" role="tablist">
        {visibleViews.map(renderTab)}
        <button
          type="button"
          className="view-tab-secondary"
          aria-label={`Open ${activeView.name} view menu`}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            onOpenViewMenu(activeView, { left: rect.left, top: rect.bottom + 4 });
          }}
          disabled={reorderControlsBlocked}
        >•••</button>
        {overflowViews.length > 0 && (
          <div ref={moreWrapRef} className="view-tabs-more-wrap">
            <button ref={moreTriggerRef} type="button" className="view-tabs-more" aria-haspopup="menu" aria-expanded={moreOpen} disabled={reorderControlsBlocked} onClick={() => setMoreOpen((open) => !open)}>
              {overflowViews.length} more
            </button>
            {moreOpen && (
              <div className="view-tabs-more-menu" role="menu" aria-label="More views" onKeyDown={(event) => {
                const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
                const index = items.indexOf(document.activeElement as HTMLElement);
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const delta = event.key === "ArrowDown" ? 1 : -1;
                  items[(index + delta + items.length) % items.length]?.focus();
                } else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  items[event.key === "Home" ? 0 : items.length - 1]?.focus();
                }
              }}>
                {overflowViews.map((item) => (
                  <button key={item.id} type="button" role="menuitem" disabled={reorderControlsBlocked} draggable={!structuralDisabledReason && !reorderControlsBlocked} onDragStart={() => { draggedId.current = item.id; }} onClick={() => { onSelectView(item); setMoreOpen(false); }}>
                    <ViewTypeIcon type={item.type} providerIcon={getProvider(item.type)?.icon} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button className="view-tab-add" title={structuralDisabledReason || t("toolbar.newViewTitle")} aria-label={t("toolbar.newViewTitle")} disabled={Boolean(structuralDisabledReason) || reorderControlsBlocked} onClick={onCreateView}>+</button>
        <select className="view-tab-display" aria-label="View tab display" value={display} disabled={reorderControlsBlocked} onChange={(event) => setDisplay(event.target.value as typeof display)}>
          <option value="both">Icon + text</option>
          <option value="text">Text</option>
          <option value="icon">Icons</option>
        </select>
        </div>
        {!embedded && viewActions}
      </div>
      {reorderFeedback && (
        <div className={`database-mutation-toast view-order-feedback ${reorderFeedback.kind}`} role={reorderFeedback.kind === "error" ? "alert" : "status"} aria-live="polite">
          <span>{reorderFeedback.kind === "error" ? `View reorder failed: ${reorderFeedback.message}` : reorderFeedback.message}</span>
          {reorderFeedback.retryable && <button type="button" disabled={reorderPending} onClick={() => { const retry = reorderRetryRef.current; if (retry) void submitOrder(retry); }}>Retry</button>}
          <button type="button" aria-label="Dismiss view order result" disabled={reorderPending} onClick={dismissReorderFeedback}>×</button>
        </div>
      )}
    </>
  );
}

function formatDbStats(locale: string, bundle: DatabaseBundle): string {
  const fields = bundle.schema.fields.filter(
    (field) => !field.hidden && field.id !== "id"
  ).length;
  const rows = bundle.records.length;
  return locale === "zh"
    ? `${fields} 个字段 · ${rows} 行`
    : `${fields} field${fields === 1 ? "" : "s"} · ${rows} row${rows === 1 ? "" : "s"}`;
}
