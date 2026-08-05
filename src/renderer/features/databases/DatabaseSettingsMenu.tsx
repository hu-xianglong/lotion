import { useRef, useState } from "react";
import type { DatabaseCapabilities } from "../../../shared/database-capabilities";
import type { PageOpenMode, TableView } from "../../../shared/types";
import { normalizePageOpenMode } from "../../../shared/database-page-open";
import { MenuItem, MenuSection, MenuSurface, type MenuAnchor } from "../../components/Menu";

type MenuLevel = "root" | "view" | "database" | "open-pages";

export type DatabaseSettingsActionStatus = "submitted" | "failed" | "ignored";

export function databaseSettingsPageOpenMode(view: Pick<TableView, "pageOpenMode" | "type">): PageOpenMode {
  return normalizePageOpenMode(view.pageOpenMode, view.type);
}

export function runDatabaseSettingsNavigationIfIdle(guard: { current: boolean }, action: () => void): boolean {
  if (guard.current) return false;
  action();
  return true;
}

export async function runDatabaseSettingsAction({
  action,
  guard,
  onError,
  onPendingChange,
  onSuccess
}: {
  action: () => Promise<void>;
  guard: { current: boolean };
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
}): Promise<DatabaseSettingsActionStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await action();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
  onSuccess();
  return "submitted";
}

export function DatabaseSettingsMenu({ anchor, view, capabilities, onClose, onEditView, onFilter, onSort, onGroup, onPageOpenMode, onEditProperties, onTemplates, onDeletedItems, onToggleLock }: {
  anchor: MenuAnchor;
  view: TableView;
  capabilities: DatabaseCapabilities;
  onClose: () => void;
  onEditView: () => void;
  onFilter: () => void;
  onSort: () => void;
  onGroup: () => void;
  onPageOpenMode: (mode: PageOpenMode) => Promise<void>;
  onEditProperties: () => void;
  onTemplates: () => void;
  onDeletedItems: () => void;
  onToggleLock: () => Promise<void>;
}) {
  const [level, setLevel] = useState<MenuLevel>("root");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const actionRef = useRef(false);
  const structuralReason = capabilities.structuralDisabledReason;
  const pageOpenMode = databaseSettingsPageOpenMode(view);
  const pendingReason = pending ? "A database setting is being saved." : undefined;

  function navigateIfIdle(action: () => void) {
    return runDatabaseSettingsNavigationIfIdle(actionRef, action);
  }

  function runAction(action: () => Promise<void>) {
    return runDatabaseSettingsAction({
      action,
      guard: actionRef,
      onError: setActionError,
      onPendingChange: setPending,
      onSuccess: onClose
    });
  }

  if (level === "open-pages") {
    return (
      <MenuSurface anchor={anchor} ariaLabel="Open pages in menu" title="Open pages in" onBack={() => navigateIfIdle(() => setLevel("view"))} onClose={() => navigateIfIdle(onClose)}>
        <MenuSection label="This view">
          {([["Side peek", "side_peek"], ["Center peek", "center_peek"], ["Full page", "full_page"]] as const).map(([label, mode]) => {
            return <MenuItem key={mode} label={label} description={pageOpenMode === mode ? "Current" : undefined} disabledReason={pendingReason} onSelect={() => void runAction(() => onPageOpenMode(mode))} />;
          })}
        </MenuSection>
        {actionError && <small className="view-menu-action-error" role="alert">{actionError}</small>}
      </MenuSurface>
    );
  }

  if (level === "view") {
    return (
      <MenuSurface anchor={anchor} ariaLabel="View settings menu" title={`View settings · ${view.name}`} onBack={() => navigateIfIdle(() => setLevel("root"))} onClose={() => navigateIfIdle(onClose)}>
        <MenuSection label="Saved view">
          <MenuItem label="Layout" description="Table, list, calendar, gallery, or plugin layout" disabledReason={!capabilities.canManageSchema ? structuralReason : undefined} onSelect={onEditView} />
          <MenuItem label="Property visibility" description="Choose and reorder columns" disabledReason={!capabilities.canManageSchema ? structuralReason : undefined} onSelect={onEditView} />
          <MenuItem label="Filter" disabledReason={!capabilities.canManageSchema ? structuralReason : undefined} onSelect={onFilter} />
          <MenuItem label="Sort" disabledReason={!capabilities.canManageSchema ? structuralReason : undefined} onSelect={onSort} />
          <MenuItem label="Group" disabledReason={!capabilities.canManageSchema ? structuralReason : undefined} onSelect={onGroup} />
          <MenuItem label="Open pages in" description={pageOpenMode.replaceAll("_", " ")} disabledReason={!capabilities.canManageSchema ? structuralReason : undefined} submenu onSelect={() => setLevel("open-pages")} />
          <MenuItem
            label={copied ? "Link copied" : "Copy link to view"}
            onSelect={() => {
              const reference = `lotion://database/${encodeURIComponent(view.databaseId)}?view=${encodeURIComponent(view.id)}`;
              void navigator.clipboard.writeText(reference)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          />
        </MenuSection>
      </MenuSurface>
    );
  }

  if (level === "database") {
    return (
      <MenuSurface anchor={anchor} ariaLabel="Database settings menu" title="Database settings" onBack={() => navigateIfIdle(() => setLevel("root"))} onClose={() => navigateIfIdle(onClose)}>
        <MenuSection label="Database-wide">
          <MenuItem label="Edit properties" description="Changes apply to every view" disabledReason={pendingReason || (!capabilities.canManageSchema ? structuralReason : undefined)} onSelect={onEditProperties} />
          <MenuItem label="Templates" disabledReason={pendingReason || (!capabilities.canManageTemplates ? structuralReason : undefined)} onSelect={onTemplates} />
          <MenuItem label="Deleted items" disabledReason={pendingReason || (!capabilities.canManageDeletedItems ? structuralReason : undefined)} onSelect={onDeletedItems} />
          <MenuItem label={capabilities.locked ? "Unlock database" : "Lock database"} description={capabilities.locked ? "Allow structural changes again" : "Prevent view, property, and template changes"} disabledReason={pendingReason || (!capabilities.canLock ? structuralReason : undefined)} onSelect={() => void runAction(onToggleLock)} />
        </MenuSection>
        {actionError && <small className="view-menu-action-error" role="alert">{actionError}</small>}
      </MenuSurface>
    );
  }

  return (
    <MenuSurface anchor={anchor} ariaLabel="Database settings" title="Settings" onClose={() => navigateIfIdle(onClose)}>
      <MenuSection label="Choose scope">
        <MenuItem label="View settings" description={`Only affects “${view.name}”`} submenu onSelect={() => setLevel("view")} />
        <MenuItem label="Database settings" description="Affects every saved view" submenu onSelect={() => setLevel("database")} />
      </MenuSection>
    </MenuSurface>
  );
}
