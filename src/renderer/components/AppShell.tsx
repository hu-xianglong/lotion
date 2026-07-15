import { useEffect, useState, type ReactNode } from "react";
import type { AppState } from "../state/app-store";
import { Sidebar } from "./Sidebar";
import { TabStrip } from "./TabStrip";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";

const SIDEBAR_COLLAPSED_KEY = "lotion.sidebar.collapsed";

interface AppShellProps {
  state: AppState;
  onOpenSearch: () => void;
  onOpenSearchAi: () => void;
  onReordered?: () => void;
  onSwitchTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  onNewTab: () => void;
  onReorderTabs: (source: number, target: number) => void;
  onMoveTabToNewWindow: (index: number) => void;
  sidebarSettingsOpenRequest?: number;
  children: ReactNode;
}

export function AppShell(props: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true"
  );

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!props.sidebarSettingsOpenRequest) return;
    setSidebarCollapsed(false);
  }, [props.sidebarSettingsOpenRequest]);

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      {!sidebarCollapsed && (
        <Sidebar
          state={props.state}
          onOpenSearch={props.onOpenSearch}
          onOpenSearchAi={props.onOpenSearchAi}
          onReordered={props.onReordered}
          settingsOpenRequest={props.sidebarSettingsOpenRequest}
        />
      )}
      <button
        type="button"
        className="sidebar-collapse-toggle"
        onClick={() => setSidebarCollapsed((value) => !value)}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        aria-expanded={!sidebarCollapsed}
      >
        {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
      </button>
      <main className="main-area">
        <TabStrip
          tabs={props.state.tabs}
          activeIndex={props.state.activeTabIndex}
          state={props.state}
          onSwitch={props.onSwitchTab}
          onClose={props.onCloseTab}
          onNew={props.onNewTab}
          onReorder={props.onReorderTabs}
          onMoveToNewWindow={props.onMoveTabToNewWindow}
        />
        <div className="main-content">{props.children}</div>
      </main>
    </div>
  );
}
