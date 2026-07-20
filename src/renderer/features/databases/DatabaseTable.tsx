import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type WheelEvent } from "react";
import type { ColumnSummaryType, DatabaseBundle, DatabaseRecord, DatabaseSummary, EntityRef, FieldSchema, FieldType, RecordValue, SelectOption, TableView } from "../../../shared/types";
import { formatDateForField, isDateLikeFieldType, parseDateValue } from "../../../shared/date-values";
import type { DatabaseViewProvider, Disposable, WorkspaceAPI } from "../../../shared/plugin-api";
import { useDatabaseCache } from "../../context/database-cache";
import { useLotionActions } from "../../context/lotion-actions";
import { formatRowCount, useI18n } from "../../lib/i18n";
import { getViewRecords, getVisibleFields } from "../../lib/view-query";
import { EntityIcon } from "../../components/EntityIcon";
import { CalendarBody } from "./CalendarBody";
import { GalleryBody } from "./GalleryBody";
import { ListBody } from "./ListBody";
import { FieldTypeIcon } from "../../components/FieldTypeIcon";
import { FilterIcon, SearchIcon, SettingsIcon, SortIcon } from "../../components/Icons";
import { DatabaseProperties, DatabaseViewTabsBar, EmbeddedDatabaseHeader, StandaloneDatabaseHeader } from "./DatabaseChrome";
import { FilterPopover } from "./FilterPopover";
import { SortPopover } from "./SortPopover";
import { FieldSettingsDialog, formatFieldType, usesOptions } from "./FieldSettingsDialog";
import { ViewSettingsDialog } from "./ViewSettingsDialog";
import { RowTemplateDialog } from "./RowTemplateDialog";
import { DatabaseTableGrid } from "./DatabaseTableGrid";
import { perfLog } from "../../lib/perf-log";
import { pluginHost } from "../../plugin-host";
import { isReactProvider } from "../../../shared/plugin-react";
import { formulaColumnLabel } from "../../../shared/formula";

const DEFAULT_COLUMN_WIDTH = 180;
const MIN_COLUMN_WIDTH = 80;
const ESTIMATED_ROW_HEIGHT = 54;
const ROW_OVERSCAN = 8;
const VIRTUALIZATION_ROW_LIMIT = 120;
const DEFAULT_EMBEDDED_TABLE_ROW_LIMIT = 20;
const EMBEDDED_LOAD_MORE_ROWS = 50;
const CELL_COMMIT_DEBOUNCE_MS = 800;

function tablePerfLog(label: string, detail: Record<string, unknown>): void {
  perfLog(label, detail);
}

interface DatabaseTableProps {
  bundle: DatabaseBundle;
  view: TableView;
  databases?: DatabaseSummary[];
  embedded?: boolean;
  embeddedTitle?: string;
  embeddedSubtitle?: string;
  onOpenEmbedded?: () => void;
  onRefreshEmbedded?: () => void | Promise<void>;
  embeddedRefreshing?: boolean;
  loadDurationMs?: number;
  /** Click handler for the database's icon — set by the host so we
   *  can pop a file picker. Undefined in embedded mode (the host
   *  owns the database, not the embed). */
  onPickIcon?: () => void;
  /** Cover image handlers — same shape as icons. */
  onPickCover?: () => void;
  onClearCover?: () => void;
  onCommitCoverOffset?: (offset: number) => void;
  onUpdateTags?: (tags: string[]) => void;
  onOpenInNewWindow?: () => void;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}

export const DatabaseTable = memo(function DatabaseTable({
  bundle,
  view,
  databases = [],
  embedded = false,
  embeddedTitle,
  embeddedSubtitle,
  onOpenEmbedded,
  onRefreshEmbedded,
  embeddedRefreshing = false,
  loadDurationMs,
  onPickIcon,
  onPickCover,
  onClearCover,
  onCommitCoverOffset,
  onUpdateTags,
  onOpenInNewWindow,
  favorited,
  onToggleFavorite
}: DatabaseTableProps) {
  const renderStartedAt = performance.now();
  const { t, locale } = useI18n();
  const { openRowPage, selectDatabase, selectPage } = useLotionActions();
  const cache = useDatabaseCache();
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<FieldSchema["type"]>("text");
  const [formula, setFormula] = useState("=IF(title=\"Done\", 1, 0)");
  const [editingField, setEditingField] = useState<FieldSchema>();
  const [editingView, setEditingView] = useState<TableView>();
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [activeViewId, setActiveViewId] = useState(view.id);
  const previousDatabaseIdRef = useRef(bundle.schema.id);
  const previousPropViewIdRef = useRef(view.id);
  const [viewProviderVersion, setViewProviderVersion] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [sortAnchor, setSortAnchor] = useState<{ left: number; top: number } | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<{ left: number; top: number } | null>(null);
  const activeView = bundle.views.find((item) => item.id === activeViewId) || bundle.views[0] || view;
  const viewProviders = useMemo(() => pluginHost.views.list(), [viewProviderVersion]);
  const activePluginView = useMemo(
    () => pluginHost.views.get(activeView.type),
    [activeView.type, viewProviderVersion]
  );
  const activeViewTypeLabel = activePluginView?.label || formatViewTypeLabel(activeView.type);
  const openRecordPage = useCallback((rowId: string) => {
    openRowPage(bundle.schema.id, rowId);
  }, [bundle.schema.id, openRowPage]);
  const openEntityRef = useCallback((ref: EntityRef) => {
    if (ref.kind === "page") {
      selectPage(ref.entityId);
      return;
    }
    if (ref.kind === "database") {
      selectDatabase(ref.entityId);
      return;
    }
    if (ref.kind === "row" && ref.databaseId) {
      openRowPage(ref.databaseId, ref.rowId || ref.entityId);
    }
  }, [openRowPage, selectDatabase, selectPage]);
  const fields = useMemo(() => {
    const start = performance.now();
    const result = getVisibleFields(bundle, activeView);
    tablePerfLog("table.getVisibleFields", {
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      embedded,
      ms: Number((performance.now() - start).toFixed(2)),
      fields: result.length
    });
    return result;
  }, [activeView, bundle, embedded]);
  const baseRecords = useMemo(() => {
    const start = performance.now();
    const result = getViewRecords(bundle, activeView);
    tablePerfLog("table.getViewRecords", {
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      embedded,
      ms: Number((performance.now() - start).toFixed(2)),
      records: result.length,
      bundleRecords: bundle.records.length
    });
    return result;
  }, [activeView, bundle, embedded]);
  // In-table search: case-insensitive contains on the stringified
  // value of every visible field, with loose punctuation-insensitive
  // token matching for Notion-style titles like "[Uber] Account...".
  // Applies on top of the view's own filter / sort pipeline so it
  // composes with whatever's saved.
  const records = useMemo(() => {
    const start = performance.now();
    const queryInfo = buildTableSearchQuery(searchQuery);
    if (!queryInfo) {
      tablePerfLog("table.searchRecords", {
        databaseId: bundle.schema.id,
        viewId: activeView.id,
        embedded,
        ms: Number((performance.now() - start).toFixed(2)),
        query: "",
        records: baseRecords.length
      });
      return baseRecords;
    }
    const result = baseRecords
      .map((record, index) => ({
        record,
        index,
        score: scoreTableRecord(record, fields, queryInfo)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.record);
    tablePerfLog("table.searchRecords", {
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      embedded,
      ms: Number((performance.now() - start).toFixed(2)),
      query: queryInfo.raw,
      records: result.length,
      baseRecords: baseRecords.length,
      fields: fields.length
    });
    return result;
  }, [activeView.id, baseRecords, bundle.schema.id, embedded, fields, searchQuery]);
  const embeddedBaseRowLimit = embedded && activeView.type === "table"
    ? activeView.pageSize && activeView.pageSize > 0
      ? activeView.pageSize
      : DEFAULT_EMBEDDED_TABLE_ROW_LIMIT
    : undefined;
  const [embeddedExtraRows, setEmbeddedExtraRows] = useState(0);
  const embeddedRowLimit = embeddedBaseRowLimit === undefined ? undefined : embeddedBaseRowLimit + embeddedExtraRows;
  const tableRecords = useMemo(() => {
    const start = performance.now();
    const result = embeddedRowLimit
      ? records.slice(0, embeddedRowLimit)
      : records;
    tablePerfLog("table.sliceRows", {
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      embedded,
      ms: Number((performance.now() - start).toFixed(2)),
      records: records.length,
      renderedRows: result.length,
      rowLimit: embeddedRowLimit ?? null
    });
    return result;
  }, [activeView.id, bundle.schema.id, embedded, embeddedRowLimit, records]);
  const sourceRowNumberById = useMemo(
    () => new Map(bundle.records.map((record, index) => [String(record.id), index + 1])),
    [bundle.records]
  );
  const getFormulaRowNumber = useCallback(
    (record: DatabaseRecord) => sourceRowNumberById.get(String(record.id)) ?? 0,
    [sourceRowNumberById]
  );
  const hiddenEmbeddedRows = embedded && activeView.type === "table" && tableRecords.length < records.length;
  const embeddedLoadMoreCount = hiddenEmbeddedRows
    ? Math.min(EMBEDDED_LOAD_MORE_ROWS, records.length - tableRecords.length)
    : 0;
  const columnSummaries = useMemo(() => {
    const start = performance.now();
    const result = computeColumnSummaries(fields, records, activeView, locale);
    tablePerfLog("table.computeColumnSummaries", {
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      embedded,
      ms: Number((performance.now() - start).toFixed(2)),
      records: records.length,
      fields: fields.length,
      summaries: result.byFieldId.size
    });
    return result;
  }, [activeView, bundle.schema.id, embedded, fields, locale, records]);

  useEffect(() => {
    setEmbeddedExtraRows(0);
  }, [bundle.schema.id, activeView.id, activeView.pageSize, searchQuery]);

  useEffect(() => {
    const databaseChanged = previousDatabaseIdRef.current !== bundle.schema.id;
    const propViewChanged = previousPropViewIdRef.current !== view.id;
    previousDatabaseIdRef.current = bundle.schema.id;
    previousPropViewIdRef.current = view.id;

    if ((databaseChanged || propViewChanged) && bundle.views.some((item) => item.id === view.id)) {
      setActiveViewId(view.id);
      return;
    }
    if (!bundle.views.some((item) => item.id === activeViewId)) {
      setActiveViewId(bundle.views[0]?.id || view.id);
    }
  }, [activeViewId, bundle.views, view.id]);

  useEffect(() => {
    if (!templateMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".new-row-menu-wrap")) return;
      setTemplateMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [templateMenuOpen]);

  async function addField() {
    if (!fieldName.trim()) return;
    await cache.addField(bundle.schema.id, {
      name: fieldName,
      type: fieldType,
      options: usesOptions(fieldType) ? defaultOptions() : undefined,
      formula: fieldType === "formula" ? formula : undefined
    });
    setFieldName("");
  }

  async function updateCell(rowId: string, field: FieldSchema, value: RecordValue) {
    const record = bundle.records.find((item) => String(item.id) === rowId);
    if (record && recordValueEquals(record[field.id], value)) return;
    await cache.updateCell({
      databaseId: bundle.schema.id,
      rowId,
      fieldId: field.id,
      value
    });
  }

  async function addRow(templateId?: string) {
    const previousIds = new Set(bundle.records.map((record) => String(record.id)));
    const next = await cache.addRow(bundle.schema.id, templateId);
    if (templateId) {
      const created = next.records.find((record) => !previousIds.has(String(record.id)));
      if (created) openRecordPage(String(created.id));
    }
  }

  function loadMoreEmbeddedRows() {
    setEmbeddedExtraRows((current) => Math.min(current + EMBEDDED_LOAD_MORE_ROWS, records.length));
  }

  function forwardEmbeddedWheel(event: WheelEvent<HTMLDivElement>) {
    if (!embedded || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const target = event.currentTarget;
    const canScrollVertically = target.scrollHeight > target.clientHeight + 1;
    if (canScrollVertically) return;
    const scroller = findVerticalScrollContainer(target);
    if (!scroller) return;
    event.preventDefault();
    scroller.scrollTop += event.deltaY;
  }

  async function deleteRow(rowId: string) {
    await cache.deleteRow({ databaseId: bundle.schema.id, rowId });
  }

  async function createView() {
    const existingNames = new Set(bundle.views.map((item) => item.name));
    let name = `View ${bundle.views.length + 1}`;
    let suffix = bundle.views.length + 1;
    while (existingNames.has(name)) {
      suffix += 1;
      name = `View ${suffix}`;
    }
    const previousViewIds = new Set(bundle.views.map((item) => item.id));
    const next = await cache.createView({
      databaseId: bundle.schema.id,
      name,
      sourceViewId: activeView.id
    });
    const createdView = next.views.find((item) => !previousViewIds.has(item.id));
    if (createdView) {
      setActiveViewId(createdView.id);
      setEditingView(createdView);
    }
  }

  async function duplicateView(targetView: TableView) {
    const previousViewIds = new Set(bundle.views.map((item) => item.id));
    const next = await cache.duplicateView({
      databaseId: bundle.schema.id,
      viewId: targetView.id
    });
    const duplicatedView = next.views.find((item) => !previousViewIds.has(item.id));
    if (duplicatedView) setActiveViewId(duplicatedView.id);
  }

  async function updateView(nextView: TableView) {
    await cache.updateView({
      databaseId: bundle.schema.id,
      view: nextView
    });
    setActiveViewId(nextView.id);
  }

  async function deleteView(targetView: TableView) {
    const next = await cache.deleteView({
      databaseId: bundle.schema.id,
      viewId: targetView.id
    });
    if (activeViewId === targetView.id) {
      setActiveViewId(next.views[0]?.id || view.id);
    }
  }

  async function setDefaultView(targetView: TableView) {
    await cache.setDefaultView({
      databaseId: bundle.schema.id,
      viewId: targetView.id
    });
    setActiveViewId(targetView.id);
  }

  async function toggleColumnWrap(fieldId: string) {
    const current = resolveWrappedFieldIds(activeView, fields);
    const wrapFieldIds = current.has(fieldId)
      ? [...current].filter((id) => id !== fieldId)
      : [...current, fieldId];
    await updateView({ ...activeView, wrapFieldIds });
  }

  async function updateColumnSummary(fieldId: string, summaryType: ColumnSummaryType) {
    const columnSummaries = { ...(activeView.columnSummaries ?? {}) };
    columnSummaries[fieldId] = summaryType;
    await updateView({ ...activeView, columnSummaries });
  }

  async function hideColumn(fieldId: string) {
    const visibleFieldIds = activeView.visibleFieldIds.filter((id) => id !== fieldId);
    await updateView({ ...activeView, visibleFieldIds });
  }

  async function reorderColumn(sourceFieldId: string, targetFieldId: string) {
    if (sourceFieldId === targetFieldId) return;
    const baseOrder = activeView.fieldOrder.length ? activeView.fieldOrder : activeView.visibleFieldIds;
    const without = baseOrder.filter((id) => id !== sourceFieldId);
    const targetIndex = without.indexOf(targetFieldId);
    if (targetIndex === -1) return;
    without.splice(targetIndex, 0, sourceFieldId);
    await updateView({ ...activeView, fieldOrder: without });
  }

  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [dropTargetFieldId, setDropTargetFieldId] = useState<string | null>(null);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const rowNodesRef = useRef(new Map<string, HTMLTableRowElement>());
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [measuredRowHeights, setMeasuredRowHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;

    setViewportHeight(el.clientHeight);
    setScrollTop(el.scrollTop);
    setScrollLeft(el.scrollLeft);

    let rafId: number | null = null;
    function onScroll() {
      if (!el || rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        setScrollTop(el.scrollTop);
        setScrollLeft(el.scrollLeft);
        rafId = null;
      });
    }
    el.addEventListener("scroll", onScroll, { passive: true });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportHeight(entry.contentRect.height);
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      resizeObserver.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Reset scroll position when the active view changes — otherwise the viewport
  // would be left at the previous view's offset, which usually shows nothing.
  useEffect(() => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [activeView.id]);

  const switchTimerRef = useRef<{ id: string; t: number } | null>(null);
  useLayoutEffect(() => {
    const pending = switchTimerRef.current;
    if (pending && pending.id === activeView.id) {
      const commitMs = performance.now() - pending.t;
      console.log(
        `[lotion] view switch commit db=${bundle.schema.id} view=${activeView.id} ` +
        `rows=${records.length} commit=${commitMs.toFixed(1)}ms`
      );
      requestAnimationFrame(() => {
        const paintMs = performance.now() - pending.t;
        console.log(
          `[lotion] view switch paint  db=${bundle.schema.id} view=${activeView.id} paint=${paintMs.toFixed(1)}ms`
        );
        switchTimerRef.current = null;
      });
    }
  }, [activeView.id, bundle.schema.id, records.length]);

  useEffect(() => {
    const rowIds = new Set(tableRecords.map((record) => String(record.id)));
    setMeasuredRowHeights((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [id, height] of Object.entries(current)) {
        if (rowIds.has(id)) next[id] = height;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [tableRecords]);

  const virtualizeRows = tableRecords.length > VIRTUALIZATION_ROW_LIMIT;
  const rowMetrics = useMemo(() => {
    const offsets = new Array<number>(tableRecords.length + 1);
    let total = 0;
    offsets[0] = 0;
    for (let i = 0; i < tableRecords.length; i += 1) {
      const id = String(tableRecords[i].id);
      total += measuredRowHeights[id] ?? ESTIMATED_ROW_HEIGHT;
      offsets[i + 1] = total;
    }
    return { offsets, total };
  }, [measuredRowHeights, tableRecords]);

  const startIndex = virtualizeRows
    ? Math.max(0, offsetToRowIndex(rowMetrics.offsets, scrollTop) - ROW_OVERSCAN)
    : 0;
  const endIndex = virtualizeRows
    ? Math.min(
        tableRecords.length,
        offsetToRowIndex(rowMetrics.offsets, scrollTop + viewportHeight) + ROW_OVERSCAN + 1
      )
    : tableRecords.length;
  const visibleRecords = tableRecords.slice(startIndex, endIndex);
  const topSpacerHeight = virtualizeRows ? rowMetrics.offsets[startIndex] ?? 0 : 0;
  const bottomSpacerHeight = virtualizeRows
    ? Math.max(0, rowMetrics.total - (rowMetrics.offsets[endIndex] ?? rowMetrics.total))
    : 0;

  useLayoutEffect(() => {
    tablePerfLog("table.commit", {
      databaseId: bundle.schema.id,
      viewId: activeView.id,
      embedded,
      ms: Number((performance.now() - renderStartedAt).toFixed(2)),
      fields: fields.length,
      records: records.length,
      tableRecords: tableRecords.length,
      visibleRows: visibleRecords.length,
      renderedCells: visibleRecords.length * fields.length,
      virtualized: virtualizeRows
    });
  });

  useLayoutEffect(() => {
    if (!virtualizeRows || visibleRecords.length === 0) return;
    const visibleIds = new Set(visibleRecords.map((record) => String(record.id)));
    const observer = new ResizeObserver((entries) => {
      const updates: Array<[string, number]> = [];
      for (const entry of entries) {
        const rowId = (entry.target as HTMLElement).dataset.rowId;
        if (!rowId) continue;
        const height = Math.ceil(entry.target.getBoundingClientRect().height);
        if (height > 0) updates.push([rowId, height]);
      }
      if (updates.length === 0) return;
      setMeasuredRowHeights((current) => {
        let next = current;
        for (const [rowId, height] of updates) {
          if (Math.abs((current[rowId] ?? 0) - height) <= 1) continue;
          if (next === current) next = { ...current };
          next[rowId] = height;
        }
        return next;
      });
    });
    for (const [rowId, node] of rowNodesRef.current) {
      if (visibleIds.has(rowId)) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [virtualizeRows, visibleRecords]);

  const activeViewRef = useRef(activeView);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  const [draftWidths, setDraftWidths] = useState<Record<string, number>>({});
  const widths = useMemo(
    () => ({ ...(activeView.columnWidths || {}), ...draftWidths }),
    [activeView.columnWidths, draftWidths]
  );

  function startResize(fieldId: string, startEvent: React.MouseEvent) {
    startEvent.preventDefault();
    startEvent.stopPropagation();
    const startX = startEvent.clientX;
    const startWidth = widths[fieldId] ?? DEFAULT_COLUMN_WIDTH;

    function onMove(event: MouseEvent) {
      const next = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (event.clientX - startX)));
      setDraftWidths((current) => ({ ...current, [fieldId]: next }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("is-resizing-column");
      setDraftWidths((current) => {
        const finalWidth = current[fieldId];
        const rest = Object.fromEntries(Object.entries(current).filter(([id]) => id !== fieldId));
        if (finalWidth != null) {
          const baseView = activeViewRef.current;
          const columnWidths = { ...(baseView.columnWidths || {}), [fieldId]: finalWidth };
          void updateView({ ...baseView, columnWidths });
        }
        return rest;
      });
    }

    document.body.classList.add("is-resizing-column");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const actionsColumnWidth = embedded ? 0 : 88;
  const totalTableWidth = fields.reduce(
    (sum, field) => sum + (widths[field.id] ?? DEFAULT_COLUMN_WIDTH),
  0
  ) + actionsColumnWidth;
  const renderedTableWidth = totalTableWidth + 38;

  function renderTableColGroup() {
    return (
      <colgroup>
        <col style={{ width: 38 }} />
        {fields.map((field) => (
          <col key={field.id} style={{ width: widths[field.id] ?? DEFAULT_COLUMN_WIDTH }} />
        ))}
        {!embedded && <col style={{ width: actionsColumnWidth }} />}
      </colgroup>
    );
  }

  function renderTableHead() {
    return (
      <thead>
        <tr>
          <th className="row-num" aria-label={t("formula.rowNumber")} title={t("formula.rowNumber")}>
            <span className="formula-row-reference">#</span>
          </th>
          {fields.map((field) => {
            const formulaColumn = formulaColumnLabel(bundle.schema.fields.findIndex((candidate) => candidate.id === field.id));
            const dropTargetClass = dropTargetFieldId === field.id && dragFieldId && dragFieldId !== field.id ? " drop-target" : "";
            const draggingClass = dragFieldId === field.id ? " dragging" : "";
            return (
              <th
                key={field.id}
                className={`column-header${dropTargetClass}${draggingClass}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", field.id);
                  setDragFieldId(field.id);
                }}
                onDragOver={(event) => {
                  if (!dragFieldId || dragFieldId === field.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (dropTargetFieldId !== field.id) setDropTargetFieldId(field.id);
                }}
                onDragLeave={() => {
                  if (dropTargetFieldId === field.id) setDropTargetFieldId(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const source = dragFieldId;
                  setDragFieldId(null);
                  setDropTargetFieldId(null);
                  if (source) void reorderColumn(source, field.id);
                }}
                onDragEnd={() => {
                  setDragFieldId(null);
                  setDropTargetFieldId(null);
                }}
              >
                <button
                  className="field-header-button"
                  onClick={() => setEditingField(field)}
                  title={translateFieldType(t, field.type)}
                >
                  <span
                    className="formula-column-reference"
                    aria-label={`${t("formula.column")} ${formulaColumn}`}
                    title={`${t("formula.column")} ${formulaColumn}`}
                  >
                    {formulaColumn}
                  </span>
                  <FieldTypeIcon type={field.type} isTitle={field.id === "title"} />
                  <span className="field-header-name">{field.name}</span>
                </button>
                <span
                  className="column-resize-handle"
                  role="separator"
                  aria-label={`Resize ${field.name}`}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onMouseDown={(event) => startResize(field.id, event)}
                />
              </th>
            );
          })}
          {!embedded && <th className="row-actions"></th>}
        </tr>
      </thead>
    );
  }

  function renderViewActions({ showSettings = true }: { showSettings?: boolean } = {}) {
    return (
      <div className="view-tab-actions">
        <button
          type="button"
          className={filterAnchor ? "toolbar-icon active" : "toolbar-icon"}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setFilterAnchor({ left: rect.left, top: rect.bottom + 4 });
          }}
          title="Filter"
          aria-label="Filter"
        >
          <FilterIcon />
        </button>
        <button
          type="button"
          className={sortAnchor ? "toolbar-icon active" : "toolbar-icon"}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSortAnchor({ left: rect.left, top: rect.bottom + 4 });
          }}
          title="Sort"
          aria-label="Sort"
        >
          <SortIcon />
        </button>
        <button
          type="button"
          className={searchOpen ? "toolbar-icon active" : "toolbar-icon"}
          onClick={() => {
            const next = !searchOpen;
            setSearchOpen(next);
            if (!next) setSearchQuery("");
            else setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
          title={t("toolbar.search") || "Search"}
          aria-label={t("toolbar.search") || "Search"}
        >
          <SearchIcon />
        </button>
        {showSettings && (
          <button
            type="button"
            className="toolbar-icon"
            onClick={() => setEditingView(activeView)}
            title={t("toolbar.viewSettings")}
            aria-label={t("toolbar.viewSettings")}
          >
            <SettingsIcon />
          </button>
        )}
        {renderNewRowControl()}
      </div>
    );
  }

  function renderNewRowControl() {
    const templates = bundle.schema.templates ?? [];
    const defaultTemplate = activeView.defaultTemplateId
      ? templates.find((template) => template.id === activeView.defaultTemplateId)
      : undefined;
    return (
      <div className="new-row-menu-wrap">
        <button className="primary" onClick={() => void addRow(defaultTemplate?.id)}>{t("toolbar.addRow")}</button>
        <button
          type="button"
          className={templateMenuOpen ? "new-row-menu-toggle active" : "new-row-menu-toggle"}
          onClick={() => setTemplateMenuOpen((open) => !open)}
          title={t("templates.newWithTemplate")}
          aria-label={t("templates.newWithTemplate")}
        >
          ▾
        </button>
        {templateMenuOpen && (
          <div className="new-row-menu">
            <button
              type="button"
              onClick={() => {
                setTemplateMenuOpen(false);
                void addRow();
              }}
            >
              {t("templates.blankRow")}
            </button>
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  setTemplateMenuOpen(false);
                  void addRow(template.id);
                }}
              >
                {template.name}
              </button>
            ))}
            {templates.length > 0 && <div className="new-row-menu-divider" />}
            <button
              type="button"
              onClick={() => {
                setTemplateMenuOpen(false);
                setTemplateDialogOpen(true);
              }}
            >
              {t("templates.manage")}
            </button>
          </div>
        )}
      </div>
    );
  }

  async function updateField(field: FieldSchema, input: Pick<FieldSchema, "name" | "type" | "options" | "formula" | "relation" | "rollup" | "dateFormat" | "timeFormat">) {
    await cache.updateField({
      databaseId: bundle.schema.id,
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

  async function updateOptionColor(field: FieldSchema, optionId: string, color: string) {
    if (!usesOptions(field.type)) return;
    const options = (field.options || []).map((option) => option.id === optionId ? { ...option, color } : option);
    await updateOptions(field, options);
  }

  async function updateOptions(field: FieldSchema, options: SelectOption[]) {
    if (!usesOptions(field.type)) return;
    await updateField(field, {
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

  const wrapFieldSet = useMemo(
    () => resolveWrappedFieldIds(activeView, fields),
    [activeView, fields]
  );

  useEffect(() => {
    const disposable = pluginHost.views.onChange(() => {
      setViewProviderVersion((version) => version + 1);
    });
    return () => disposable.dispose();
  }, []);

  return (
    <div className={embedded ? "database-table embedded-table" : "database-table"}>
      {!embedded && (
        <StandaloneDatabaseHeader
          bundle={bundle}
          onPickIcon={onPickIcon}
          onPickCover={onPickCover}
          onClearCover={onClearCover}
          onCommitCoverOffset={onCommitCoverOffset}
          onOpenInNewWindow={onOpenInNewWindow}
          favorited={favorited}
          onToggleFavorite={onToggleFavorite}
        />
      )}
      {!embedded && onUpdateTags && (
        <DatabaseProperties tags={bundle.schema.tags ?? []} onChangeTags={onUpdateTags} />
      )}
      {embedded && (
        <EmbeddedDatabaseHeader
          bundle={bundle}
          title={embeddedTitle}
          subtitle={embeddedSubtitle}
          activeView={activeView}
          activeViewTypeLabel={activeViewTypeLabel}
          activePluginView={activePluginView}
          viewActions={renderViewActions({ showSettings: false })}
          refreshing={embeddedRefreshing}
          onOpen={onOpenEmbedded}
          onRefresh={onRefreshEmbedded}
          onOpenSettings={() => setEditingView(activeView)}
        />
      )}
      <DatabaseViewTabsBar
        views={bundle.views}
        activeView={activeView}
        embedded={embedded}
        viewActions={embedded ? undefined : renderViewActions()}
        getProvider={(type) => pluginHost.views.get(type)}
        onSelectView={(item) => {
          switchTimerRef.current = { id: item.id, t: performance.now() };
          console.log(`[lotion] view switch click db=${bundle.schema.id} view=${item.id}`);
          setActiveViewId(item.id);
        }}
        onCreateView={() => void createView()}
      />

      {searchOpen && (
        <div className="table-search-bar">
          <SearchIcon />
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            placeholder={t("toolbar.searchPlaceholder") || "Search in this view…"}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchQuery("");
                setSearchOpen(false);
              }
            }}
          />
          {searchQuery && (
            <span className="table-search-count">
              {records.length} / {baseRecords.length}
            </span>
          )}
        </div>
      )}

      {activeView.type === "gallery" && (
        <GalleryBody
          records={records}
          fields={fields}
          view={activeView}
          onOpenRow={(rowId) => openRowPage(bundle.schema.id, rowId)}
        />
      )}
      {activeView.type === "calendar" && (
        <CalendarBody
          records={records}
          fields={fields}
          view={activeView}
          onOpenRow={(rowId) => openRowPage(bundle.schema.id, rowId)}
        />
      )}
      {activeView.type === "list" && (
        <ListBody
          records={records}
          fields={fields}
          onOpenRow={(rowId) => openRowPage(bundle.schema.id, rowId)}
        />
      )}
      {activePluginView && (
        <PluginViewBody
          provider={activePluginView}
          bundle={bundle}
          view={activeView}
          records={records}
        />
      )}
      {activeView.type === "table" && (
        <>
          <DatabaseTableGrid
            embedded={embedded}
            fields={fields}
            tableRecords={tableRecords}
            visibleRecords={visibleRecords}
            startIndex={startIndex}
            endIndex={endIndex}
            topSpacerHeight={topSpacerHeight}
            bottomSpacerHeight={bottomSpacerHeight}
            renderedTableWidth={renderedTableWidth}
            scrollLeft={scrollLeft}
            hiddenEmbeddedRows={hiddenEmbeddedRows}
            tableScrollRef={tableScrollRef}
            rowNodesRef={rowNodesRef}
            onWheel={embedded ? forwardEmbeddedWheel : undefined}
            onAddRow={() => void addRow()}
            renderColGroup={renderTableColGroup}
            renderHead={renderTableHead}
            renderCell={(record, field) => (
              <Cell
                field={field}
                value={record[field.id]}
                wrap={wrapFieldSet.has(field.id)}
                record={record}
                databaseId={bundle.schema.id}
                onChange={(value) => updateCell(String(record.id), field, value)}
                onOptionColorChange={(optionId, color) => updateOptionColor(field, optionId, color)}
                onOptionsChange={(options) => updateOptions(field, options)}
                onOpenRowPage={openRecordPage}
                onOpenEntityRef={openEntityRef}
              />
            )}
            getRowNumber={getFormulaRowNumber}
            rowNumberLabel={t("formula.rowNumber")}
            renderRowActions={
              embedded
                ? undefined
                : (record) => (
                  <>
                    <button onClick={() => openRecordPage(String(record.id))}>{t("rowPage.open")}</button>
                    <button onClick={() => deleteRow(String(record.id))}>{t("common.delete")}</button>
                  </>
                )
            }
            addRowLabel={t("toolbar.addRow")}
          />
      {fields.length > 0 && (
        <div className="table-summary-scroll" aria-label="Column summaries">
          <table style={{ minWidth: renderedTableWidth, marginLeft: -scrollLeft }}>
            <colgroup>
              <col style={{ width: 38 }} />
              {fields.map((field) => (
                <col key={field.id} style={{ width: widths[field.id] ?? DEFAULT_COLUMN_WIDTH }} />
              ))}
              {!embedded && <col style={{ width: actionsColumnWidth }} />}
            </colgroup>
            <tbody>
              <tr className="column-summary-row">
                <td className="row-num" />
                {fields.map((field) => {
                  const summary = columnSummaries.byFieldId.get(field.id);
                  const selectedSummary = selectedSummaryType(activeView, field);
                  return (
                    <td key={field.id} className={summary ? "column-summary-cell numeric" : "column-summary-cell"}>
                      <span className="column-summary">
                        <select
                          className={summary ? "column-summary-select active" : "column-summary-select"}
                          value={selectedSummary}
                          aria-label={`${field.name} summary`}
                          onChange={(event) => void updateColumnSummary(field.id, event.target.value as ColumnSummaryType)}
                        >
                          {summaryOptionsForField(field).map((option) => (
                            <option key={option} value={option}>
                              {summaryLabel(t, option)}
                            </option>
                          ))}
                        </select>
                        {summary && (
                          <span className="column-summary-value">{summary.value}</span>
                        )}
                      </span>
                    </td>
                  );
                })}
                {!embedded && <td className="row-actions" />}
              </tr>
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      <div className="table-footer">
        {hiddenEmbeddedRows && (
          <button type="button" className="table-load-more" onClick={loadMoreEmbeddedRows}>
            <span aria-hidden="true" className="table-load-more-icon">+</span>
            <span>{locale === "zh" ? `加载 ${embeddedLoadMoreCount} 行` : `Load ${embeddedLoadMoreCount} more`}</span>
          </button>
        )}
        <span className="table-row-count">
          {formatRowCount(
            locale,
            activeView.type === "table" ? tableRecords.length : records.length,
            hiddenEmbeddedRows ? records.length : bundle.records.length
          )}
          {loadDurationMs != null && ` · ${formatLoadDuration(loadDurationMs)}`}
        </span>
      </div>

      {!embedded && (
        <div className="field-adder">
          <input placeholder={t("toolbar.newField")} value={fieldName} onChange={(event) => setFieldName(event.target.value)} />
          <select value={fieldType} onChange={(event) => setFieldType(event.target.value as FieldSchema["type"])}>
            <option value="text">{t("type.text")}</option>
            <option value="number">{t("type.number")}</option>
            <option value="select">{t("type.select")}</option>
            <option value="multi_select">{t("type.multiSelect")}</option>
            <option value="date">{t("type.date")}</option>
            <option value="url">{t("type.url")}</option>
            <option value="person">{t("type.person")}</option>
            <option value="entity_ref">{t("type.entityRef")}</option>
            <option value="checkbox">{t("type.checkbox")}</option>
            <option value="formula">{t("type.formula")}</option>
            <option value="rollup">{t("type.rollup")}</option>
          </select>
          {fieldType === "formula" && (
            <input className="formula-input" value={formula} onChange={(event) => setFormula(event.target.value)} />
          )}
          <button onClick={addField}>{t("toolbar.addField")}</button>
        </div>
      )}

      {editingField && (
        <FieldSettingsDialog
          field={editingField}
          fields={bundle.schema.fields}
          records={bundle.records}
          databases={databases}
          loadDatabase={cache.loadBundle}
          wrap={wrapFieldSet.has(editingField.id)}
          onToggleWrap={() => toggleColumnWrap(editingField.id)}
          onHide={
            activeView.visibleFieldIds.includes(editingField.id) && activeView.visibleFieldIds.length > 1
              ? () => {
                  void hideColumn(editingField.id);
                  setEditingField(undefined);
                }
              : undefined
          }
          onClose={() => setEditingField(undefined)}
          onSave={(input) => updateField(editingField, input)}
        />
      )}

      {editingView && (
        <ViewSettingsDialog
          view={editingView}
          fields={bundle.schema.fields}
          templates={bundle.schema.templates ?? []}
          viewProviders={viewProviders}
          canDelete={bundle.views.length > 1}
          isDefault={bundle.schema.defaultViewId === editingView.id}
          onClose={() => setEditingView(undefined)}
          onSave={updateView}
          onDuplicate={duplicateView}
          onDelete={deleteView}
          onSetDefault={setDefaultView}
        />
      )}

      {templateDialogOpen && (
        <RowTemplateDialog
          schema={bundle.schema}
          onClose={() => setTemplateDialogOpen(false)}
          onSave={(template) => cache.saveTemplate({ databaseId: bundle.schema.id, template }).then(() => undefined)}
          onDelete={(templateId) => cache.deleteTemplate({ databaseId: bundle.schema.id, templateId }).then(() => undefined)}
        />
      )}

      {sortAnchor && (
        <SortPopover
          fields={bundle.schema.fields.filter((f) => !f.hidden)}
          view={activeView}
          anchor={sortAnchor}
          onClose={() => setSortAnchor(null)}
          onChange={(sorts) => void updateView({ ...activeView, sorts })}
        />
      )}

      {filterAnchor && (
        <FilterPopover
          fields={bundle.schema.fields.filter((f) => !f.hidden)}
          view={activeView}
          anchor={filterAnchor}
          onClose={() => setFilterAnchor(null)}
          onChange={(filters) => void updateView({ ...activeView, filters })}
        />
      )}
    </div>
  );
});

export interface CellProps {
  field: FieldSchema;
  value: RecordValue | undefined;
  wrap: boolean;
  record: DatabaseRecord;
  databaseId: string;
  onChange: (value: RecordValue) => void;
  onOptionColorChange: (optionId: string, color: string) => void;
  onOptionsChange: (options: SelectOption[]) => void;
  onOpenRowPage?: (rowId: string) => void;
  onOpenEntityRef?: (ref: EntityRef) => void;
}

function PluginViewBody({
  provider,
  bundle,
  view,
  records
}: {
  provider: DatabaseViewProvider;
  bundle: DatabaseBundle;
  view: TableView;
  records: DatabaseRecord[];
}) {
  const cache = useDatabaseCache();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const workspace = useMemo<WorkspaceAPI>(() => ({
    ...pluginHost.workspace,
    getDatabase: (id) => cache.loadBundle(id),
    addField: (databaseId, input) => cache.addField(databaseId, input),
    updateField: (input) => cache.updateField(input),
    addRow: (databaseId) => cache.addRow(databaseId),
    updateCell: (input) => cache.updateCell(input),
    deleteRow: (databaseId, rowId) => cache.deleteRow({ databaseId, rowId }),
    createView: (input) => cache.createView(input),
    duplicateView: (databaseId, viewId, name) => cache.duplicateView({ databaseId, viewId, name }),
    updateView: (input) => cache.updateView(input),
    deleteView: (databaseId, viewId) => cache.deleteView({ databaseId, viewId }),
    setDefaultView: (databaseId, viewId) => cache.setDefaultView({ databaseId, viewId })
  }), [cache]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scopedBundle = { ...bundle, records };
    const maybeDisposable = provider.render({
      bundle: scopedBundle,
      view,
      container,
      workspace
    }) as Disposable | void;

    return () => {
      maybeDisposable?.dispose?.();
      container.replaceChildren();
    };
  }, [bundle, provider, records, view, workspace]);

  return (
    <div className="plugin-view-host" ref={containerRef} />
  );
}

export function Cell({
  field,
  value,
  wrap,
  record,
  databaseId,
  onChange,
  onOptionsChange,
  onOpenRowPage,
  onOpenEntityRef
}: CellProps) {
  const { t } = useI18n();
  const empty = t("cell.empty");
  const rowIcon = String(record.row_icon ?? "");

  // System fields, imported timestamp fields, formula fields, and rollup fields are
  // read-only regardless of provider — they're managed by the host or
  // by computed field evaluation, not direct user input.
  if (field.system || field.type === "formula" || field.type === "rollup" || field.type === "created_time" || field.type === "updated_time") {
    const displayValue = isDateLikeFieldType(field.type)
      ? formatDateForField(value, field)
      : String(value ?? "");
    return (
      <span className={wrap ? "readonly-cell wrap" : "readonly-cell"} title={String(value ?? "")}>
        {displayValue}
      </span>
    );
  }

  if (field.type === "entity_ref") {
    const refs = parseEntityRefCellValue(value);
    if (refs.length > 0) {
      return (
        <EntityRefCell
          refs={refs}
          wrap={wrap}
          onOpen={onOpenEntityRef}
        />
      );
    }
  }

  const editor = (() => {
    // Plugin dispatch: look up provider for this field type and render
    // its React component. If no provider is registered (unknown type,
    // e.g. a migration left it behind), fall through to a plain input
    // so the user can still edit the cell.
    const provider = pluginHost.fields.get(field.type);
    if (provider && isReactProvider(provider) && provider.renderReact) {
      return provider.renderReact(value ?? null, {
        field,
        record,
        databaseId,
        commit: onChange,
        onOptionsChange,
        wrap,
        placeholder: empty
      });
    }

    // Fallback for unknown field types — keeps the cell editable even
    // when no provider matches.
    return (
      <DraftFallbackInput
        placeholder={empty}
        value={value}
        onCommit={onChange}
      />
    );
  })();

  if (field.id === "title") {
    const rowId = String(record.id);
    return (
      <span className="title-cell-with-icon">
        <EntityIcon kind="row_page" icon={rowIcon || undefined} size={16} />
        <span className="title-cell-editor">{editor}</span>
        {onOpenRowPage && (
          <button
            type="button"
            className="title-cell-open"
            title={t("rowPage.open")}
            aria-label={t("rowPage.open")}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenRowPage(rowId);
            }}
          >
            <span className="title-cell-open-glyph" aria-hidden="true" />
            <span>{t("rowPage.open")}</span>
          </button>
        )}
      </span>
    );
  }

  return <>{editor}</>;
}

function EntityRefCell({
  refs,
  wrap,
  onOpen
}: {
  refs: EntityRef[];
  wrap: boolean;
  onOpen?: (ref: EntityRef) => void;
}) {
  return (
    <span className={wrap ? "entity-ref-cell wrap" : "entity-ref-cell"}>
      {refs.map((ref) => {
        const label = entityRefLabel(ref);
        return (
          <button
            key={`${ref.kind}:${ref.databaseId ?? ""}:${ref.entityId}:${ref.rowId ?? ""}`}
            type="button"
            className="entity-ref-chip"
            title={entityRefTitle(ref)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpen?.(ref);
            }}
          >
            <EntityIcon kind={ref.kind === "database" ? "database" : ref.kind === "page" ? "page" : "row_page"} size={14} />
            <span>{label}</span>
          </button>
        );
      })}
    </span>
  );
}

function parseEntityRefCellValue(value: RecordValue | undefined): EntityRef[] {
  if (typeof value !== "string" || !value.trim().startsWith("[")) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntityRefLike);
  } catch {
    return [];
  }
}

function isEntityRefLike(value: unknown): value is EntityRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Partial<EntityRef>;
  return (
    typeof ref.entityId === "string" &&
    (ref.kind === "page" || ref.kind === "database" || ref.kind === "row")
  );
}

function entityRefLabel(ref: EntityRef): string {
  return ref.titleSnapshot
    || ref.pathSnapshot?.at(-1)
    || ref.rowId
    || ref.entityId
    || "Untitled";
}

function entityRefTitle(ref: EntityRef): string {
  const path = ref.pathSnapshot?.join(" / ");
  const label = entityRefLabel(ref);
  return path ? `${label} · ${path}` : label;
}

function recordValueEquals(left: RecordValue | undefined, right: RecordValue): boolean {
  if (left === right) return true;
  const leftEmpty = left == null || left === "";
  const rightEmpty = right == null || right === "";
  return leftEmpty && rightEmpty;
}

function DraftFallbackInput({
  value,
  placeholder,
  onCommit
}: {
  value: RecordValue | undefined;
  placeholder: string;
  onCommit: (next: string) => void;
}) {
  const initialValue = String(value ?? "");
  const [draft, setDraft] = useState(initialValue);
  const draftRef = useRef(initialValue);
  const committedRef = useRef(initialValue);
  const onCommitRef = useRef(onCommit);
  const debounceTimerRef = useRef<number | null>(null);
  const skipBlurCommitRef = useRef(false);
  onCommitRef.current = onCommit;

  useEffect(() => {
    const next = String(value ?? "");
    const hasLocalDraft = draftRef.current !== committedRef.current;
    committedRef.current = next;
    if (hasLocalDraft) return;
    draftRef.current = next;
    setDraft(next);
  }, [value]);

  useEffect(() => () => {
    if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    const pending = draftRef.current;
    if (pending === committedRef.current) return;
    committedRef.current = pending;
    onCommitRef.current(pending);
  }, []);

  function clearDebounce() {
    if (debounceTimerRef.current === null) return;
    window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }

  function commit(next = draftRef.current) {
    clearDebounce();
    if (next === committedRef.current) return;
    committedRef.current = next;
    onCommitRef.current(next);
  }

  function scheduleCommit() {
    clearDebounce();
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      commit();
    }, CELL_COMMIT_DEBOUNCE_MS);
  }

  function revert() {
    clearDebounce();
    const next = committedRef.current;
    draftRef.current = next;
    setDraft(next);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    draftRef.current = next;
    setDraft(next);
    scheduleCommit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      revert();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      event.currentTarget.blur();
    }
  }

  return (
    <input
      placeholder={placeholder}
      value={draft}
      onChange={handleChange}
      onBlur={() => {
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        commit();
      }}
      onKeyDown={handleKeyDown}
    />
  );
}

function defaultOptions(): SelectOption[] {
  return [
    { id: "opt_todo", name: "Todo", color: "gray" },
    { id: "opt_in_progress", name: "In Progress", color: "blue" },
    { id: "opt_done", name: "Done", color: "green" }
  ];
}

interface TableSearchQuery {
  raw: string;
  exact: string;
  loose: string;
  tokens: string[];
}

function buildTableSearchQuery(value: string): TableSearchQuery | null {
  const raw = value.trim();
  if (!raw) return null;
  const loose = normalizeTableSearch(raw);
  return {
    raw,
    exact: raw.toLowerCase(),
    loose,
    tokens: loose.split(/\s+/).filter(Boolean)
  };
}

function scoreTableRecord(record: DatabaseRecord, fields: FieldSchema[], query: TableSearchQuery): number {
  let bestScore = 0;
  let totalScore = 0;
  for (const field of fields) {
    const value = record[field.id];
    if (value === undefined || value === null) continue;
    const score = scoreTableCell(String(value), field, query);
    if (score <= 0) continue;
    bestScore = Math.max(bestScore, score);
    totalScore += Math.min(score, 500);
  }
  return bestScore > 0 ? bestScore + totalScore : 0;
}

function scoreTableCell(value: string, field: FieldSchema, query: TableSearchQuery): number {
  const raw = value.trim();
  if (!raw) return 0;
  const lower = raw.toLowerCase();
  const loose = normalizeTableSearch(raw);
  const exactMatch = lower.includes(query.exact);
  const looseMatch = query.tokens.length > 1 && query.tokens.every((token) => loose.includes(token));
  if (!exactMatch && !looseMatch) return 0;

  let score = field.id === "title" ? 50_000 : field.type === "entity_ref" ? 20_000 : 10_000;
  if (lower === query.exact || loose === query.loose) score += 10_000;
  else if (lower.startsWith(query.exact) || loose.startsWith(query.loose)) score += 6_000;
  else if (exactMatch) score += 3_000;
  else score += 1_500;
  return score;
}

function normalizeTableSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function formatLoadDuration(ms: number): string {
  if (ms < 1000) return `loaded in ${ms.toFixed(0)} ms`;
  return `loaded in ${(ms / 1000).toFixed(2)} s`;
}

function computeColumnSummaries(
  fields: FieldSchema[],
  records: DatabaseRecord[],
  view: TableView,
  locale: "en" | "zh"
): { byFieldId: Map<string, { type: ColumnSummaryType; value: string }>; hasAny: boolean } {
  const byFieldId = new Map<string, { type: ColumnSummaryType; value: string }>();
  for (const field of fields) {
    const type = selectedSummaryType(view, field);
    if (type === "none") continue;
    const value = computeColumnSummaryValue(type, field, records, locale);
    if (!value) continue;
    byFieldId.set(field.id, { type, value });
  }
  return { byFieldId, hasAny: byFieldId.size > 0 };
}

function selectedSummaryType(view: TableView, field: FieldSchema): ColumnSummaryType {
  const configured = view.columnSummaries?.[field.id];
  if (configured && summaryOptionsForField(field).includes(configured)) return configured;
  return defaultSummaryType(field);
}

function defaultSummaryType(field: FieldSchema): ColumnSummaryType {
  return isNumericSummaryField(field) ? "average" : "none";
}

function summaryOptionsForField(field: FieldSchema): ColumnSummaryType[] {
  const generic: ColumnSummaryType[] = ["none", "count", "not_empty", "empty", "unique"];
  if (isNumericSummaryField(field)) {
    return [...generic, "sum", "average", "median", "min", "max", "range"];
  }
  if (isDateLikeFieldType(field.type)) {
    return [...generic, "min", "max"];
  }
  return generic;
}

function summaryLabel(t: ReturnType<typeof useI18n>["t"], type: ColumnSummaryType): string {
  if (type === "none") return t("table.summary.none");
  if (type === "count") return t("table.summary.count");
  if (type === "not_empty") return t("table.summary.notEmpty");
  if (type === "empty") return t("table.summary.empty");
  if (type === "unique") return t("table.summary.unique");
  if (type === "sum") return t("table.summary.sum");
  if (type === "average") return t("table.summary.average");
  if (type === "median") return t("table.summary.median");
  if (type === "min") return t("table.summary.min");
  if (type === "max") return t("table.summary.max");
  return t("table.summary.range");
}

function computeColumnSummaryValue(
  type: ColumnSummaryType,
  field: FieldSchema,
  records: DatabaseRecord[],
  locale: "en" | "zh"
): string {
  if (type === "count") return records.length.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");

  const values = records.map((record) => record[field.id]);
  const nonEmptyValues = values.filter((value) => !isEmptyCellValue(value));
  if (type === "not_empty") return nonEmptyValues.length.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  if (type === "empty") return (records.length - nonEmptyValues.length).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  if (type === "unique") {
    const unique = new Set(nonEmptyValues.map((value) => String(value).trim()));
    return unique.size.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  }

  if (isDateLikeFieldType(field.type) && (type === "min" || type === "max")) {
    const dates = nonEmptyValues
      .map((value) => ({ value, date: parseDateValue(value) }))
      .filter((item): item is { value: RecordValue; date: Date } => Boolean(item.date));
    if (dates.length === 0) return "";
    const selected = dates.reduce((best, item) =>
      type === "min"
        ? item.date.getTime() < best.date.getTime() ? item : best
        : item.date.getTime() > best.date.getTime() ? item : best
    );
    return formatDateForField(selected.value, field);
  }

  const numbers = nonEmptyValues
    .map(parseSummaryNumber)
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  if (numbers.length === 0) return "";

  if (type === "sum") return formatSummaryNumber(numbers.reduce((sum, value) => sum + value, 0), locale);
  if (type === "average") {
    const total = numbers.reduce((sum, value) => sum + value, 0);
    return formatSummaryNumber(total / numbers.length, locale);
  }
  if (type === "median") return formatSummaryNumber(median(numbers), locale);
  if (type === "min") return formatSummaryNumber(numbers[0], locale);
  if (type === "max") return formatSummaryNumber(numbers[numbers.length - 1], locale);
  if (type === "range") return formatSummaryNumber(numbers[numbers.length - 1] - numbers[0], locale);
  return "";
}

function isNumericSummaryField(field: FieldSchema): boolean {
  return field.type === "number" || field.type === "formula";
}

function isEmptyCellValue(value: RecordValue | undefined): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

function median(sortedNumbers: number[]): number {
  const middle = Math.floor(sortedNumbers.length / 2);
  if (sortedNumbers.length % 2 === 1) return sortedNumbers[middle];
  return (sortedNumbers[middle - 1] + sortedNumbers[middle]) / 2;
}

function findVerticalScrollContainer(start: HTMLElement): HTMLElement | null {
  let node = start.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const canScroll = node.scrollHeight > node.clientHeight + 1;
    if (canScroll && style.overflowY !== "hidden" && style.overflowY !== "clip") return node;
    node = node.parentElement;
  }
  const root = document.scrollingElement as HTMLElement | null;
  return root && root.scrollHeight > root.clientHeight + 1 ? root : null;
}

function parseSummaryNumber(value: RecordValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/,/g, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSummaryNumber(value: number, locale: "en" | "zh"): string {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function resolveWrappedFieldIds(view: TableView, fields: FieldSchema[]): Set<string> {
  if (view.wrapFieldIds) return new Set(view.wrapFieldIds);
  return new Set(fields.map((field) => field.id));
}

function offsetToRowIndex(offsets: number[], offset: number): number {
  if (offsets.length <= 1) return 0;
  let low = 0;
  let high = offsets.length - 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (offsets[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

function formatViewTypeLabel(type: TableView["type"]): string {
  if (type === "table") return "Table";
  if (type === "list") return "List";
  if (type === "calendar") return "Calendar";
  if (type === "gallery") return "Gallery";
  return String(type)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ") || "View";
}

function translateFieldType(t: ReturnType<typeof useI18n>["t"], type: FieldType): string {
  if (type === "text") return t("type.text");
  if (type === "number") return t("type.number");
  if (type === "select") return t("type.select");
  if (type === "multi_select") return t("type.multiSelect");
  if (type === "date") return t("type.date");
  if (type === "url") return t("type.url");
  if (type === "person") return t("type.person");
  if (type === "entity_ref") return t("type.entityRef");
  if (type === "checkbox") return t("type.checkbox");
  if (type === "formula") return t("type.formula");
  if (type === "rollup") return t("type.rollup");
  return formatFieldType(type);
}
