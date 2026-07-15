import { useState } from "react";
import type { DatabaseBundle } from "../../shared/types";
import { useDatabaseCache } from "../context/database-cache";
import { tagFromManageKind, type ActiveItem, type TabState } from "../state/app-store";
import type { AppState } from "../state/app-store";
import { EntityIcon } from "./EntityIcon";

interface TabStripProps {
  tabs: TabState[];
  activeIndex: number;
  state: AppState;
  onSwitch: (index: number) => void;
  onClose: (index: number) => void;
  onNew: () => void;
  /** Move tab `source` to slot `target`. The host shifts the tabs
   *  array and re-points activeTabIndex to wherever the active tab
   *  ends up. */
  onReorder: (source: number, target: number) => void;
  /** Open this tab in a freshly spawned BrowserWindow, removing it
   *  from the current window's strip. */
  onMoveToNewWindow: (index: number) => void;
}

/**
 * Tab strip above the main canvas. Each tab labels itself from the
 * workspace caches (pages → title, databases → name, row_pages → row title).
 * A blank tab — one with no `item` yet — shows "新标签页". Close is a tiny
 * × that only appears when more than one tab is open (the last tab is
 * sticky so the window always has something rendered).
 */
export function TabStrip({ tabs, activeIndex, state, onSwitch, onClose, onNew, onReorder, onMoveToNewWindow }: TabStripProps) {
  const cache = useDatabaseCache();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  return (
    <div className="tab-strip">
      {tabs.map((tab, i) => {
        const active = i === activeIndex;
        const label = labelFor(tab.item, state, cache.getBundle, active);
        const typeLabel = typeLabelFor(tab.item);
        const icon = iconFor(tab.item, state);
        const dragging = dragIndex === i;
        const dropTarget = dropIndex === i && dragIndex !== null && dragIndex !== i;
        return (
          <div
            key={tab.id}
            className={`tab${active ? " active" : ""}${dragging ? " dragging" : ""}${dropTarget ? " drop-target" : ""}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(i));
              setDragIndex(i);
            }}
            onDragOver={(event) => {
              if (dragIndex === null || dragIndex === i) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              if (dropIndex !== i) setDropIndex(i);
            }}
            onDragLeave={() => {
              if (dropIndex === i) setDropIndex(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              const source = dragIndex;
              setDragIndex(null);
              setDropIndex(null);
              if (source !== null && source !== i) onReorder(source, i);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDropIndex(null);
            }}
            onClick={() => onSwitch(i)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(i);
              }
            }}
            title={typeLabel ? `${typeLabel}: ${label}` : label}
          >
            {icon && <span className="tab-icon" aria-hidden="true">{icon}</span>}
            <span className="tab-label">{label}</span>
            {tab.item && (
              <button
                type="button"
                className="tab-pop-out"
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveToNewWindow(i);
                }}
                title="移到新窗口"
                aria-label="Move to new window"
              >
                ↗
              </button>
            )}
            {tabs.length > 1 && (
              <button
                type="button"
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(i);
                }}
                aria-label="Close tab"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="tab-add" onClick={onNew} aria-label="New tab">+</button>
    </div>
  );
}

function labelFor(
  item: ActiveItem | undefined,
  state: AppState,
  getBundle: (id: string) => DatabaseBundle | undefined,
  isActive: boolean
): string {
  if (!item) return "新标签页";
  if (item.type === "page") {
    const activeRowLabel = activeRowPageLabelFor(item, state, isActive);
    if (activeRowLabel) return activeRowLabel;
    return state.pages.find((p) => p.id === item.id)?.title ?? item.id;
  }
  if (item.type === "database") {
    return state.databases.find((d) => d.id === item.id)?.name ?? item.id;
  }
  if (item.type === "row_page") {
    const activeRowLabel = activeRowPageLabelFor(item, state, isActive);
    if (activeRowLabel) return activeRowLabel;
    return rowPageLabel(state, item.databaseId, titleForRow(getBundle(item.databaseId), item.rowId) ?? item.title);
  }
  if (item.type === "manage") {
    if (item.kind === "databases") return "管理数据库";
    if (item.kind === "pages") return "所有页面";
    if (item.kind === "plugins") return "插件";
    const tag = tagFromManageKind(item.kind);
    if (tag) return `#${tag}`;
    return "最近访问";
  }
  return "";
}

function activeRowPageLabelFor(item: ActiveItem, state: AppState, isActive: boolean): string | undefined {
  if (!isActive || !state.activeRowPage?.title) return undefined;
  const title = state.activeRowPage.title.trim();
  if (!title) return undefined;
  if (
    item.type === "row_page" &&
    item.databaseId === state.activeRowPage.databaseId &&
    item.rowId === state.activeRowPage.rowId
  ) {
    return rowPageLabel(state, state.activeRowPage.databaseId, title);
  }
  if (item.type === "page" && item.id === state.activeRowPage.rowId) {
    return rowPageLabel(state, state.activeRowPage.databaseId, title);
  }
  return undefined;
}

function rowPageLabel(state: AppState, databaseId: string, title: string | undefined): string {
  const databaseName = state.databases.find((database) => database.id === databaseId)?.name?.trim();
  const pageTitle = title?.trim() || "无标题";
  return databaseName ? `${databaseName}/${pageTitle}` : pageTitle;
}

function typeLabelFor(item: ActiveItem | undefined): string | undefined {
  if (!item) return undefined;
  if (item.type === "page") return "页面";
  if (item.type === "database") return "数据库";
  if (item.type === "row_page") return "页面";
  if (item.type === "manage") return undefined;
  return undefined;
}

function iconFor(item: ActiveItem | undefined, state: AppState) {
  if (!item) return undefined;
  if (item.type === "page") {
    const icon = state.pages.find((page) => page.id === item.id)?.icon;
    return <EntityIcon kind="page" icon={icon} size={15} />;
  }
  if (item.type === "database") {
    const icon = state.databases.find((database) => database.id === item.id)?.icon;
    return <EntityIcon kind="database" icon={icon} size={15} />;
  }
  if (item.type === "row_page") {
    return <EntityIcon kind="row_page" size={15} />;
  }
  return undefined;
}

function titleForRow(bundle: DatabaseBundle | undefined, rowId: string): string | undefined {
  const value = bundle?.records.find((record) => record.id === rowId)?.title;
  const title = value == null ? "" : String(value).trim();
  return title || undefined;
}
