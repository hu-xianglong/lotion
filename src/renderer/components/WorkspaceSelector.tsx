import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RecentWorkspace } from "../../preload/lotion-api";
import { EntityIcon } from "./EntityIcon";
import { ChevronDownIcon } from "./Icons";

interface WorkspaceSelectorProps {
  currentName: string;
  currentIcon?: string;
  onImportNotion: () => void;
  onWorkspaceIconChanged?: () => void;
}

/**
 * The workspace name at the top of the sidebar, click-to-open
 * dropdown listing recent workspaces + actions. Switching just
 * persists the new active path through `workspace.open` (which
 * records into the recents list) and reloads the renderer so the
 * whole tree rebuilds against the new manifest.
 */
export function WorkspaceSelector({
  currentName,
  currentIcon,
  onImportNotion,
  onWorkspaceIconChanged
}: WorkspaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<RecentWorkspace[]>([]);
  const [pendingSwitch, setPendingSwitch] = useState<RecentWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void window.lotion.workspace.listRecent().then(setRecents);
    const trigger = triggerRef.current;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      setMenuPos({ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 240) });
    }

    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScroll() { setOpen(false); }
    function onResize() { setOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useEffect(() => {
    function onWorkspaceOpenError(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setPendingSwitch(null);
      setOpen(false);
      setWorkspaceError(formatWorkspaceError(detail?.message ?? "Could not open the selected workspace."));
    }
    window.addEventListener("lotion:workspace-open-error", onWorkspaceOpenError);
    return () => window.removeEventListener("lotion:workspace-open-error", onWorkspaceOpenError);
  }, []);

  async function switchTo(path: string) {
    setWorkspaceError(null);
    setOpen(false);
    try {
      await window.lotion.workspace.open(path);
      window.location.reload();
    } catch (e) {
      console.error("Failed to open workspace:", e);
      setWorkspaceError(formatWorkspaceError(e));
    }
  }

  async function openPicker() {
    setWorkspaceError(null);
    setPendingSwitch(null);
    setOpen(false);
    try {
      const result = await window.lotion.workspace.openPicker();
      if (result) window.location.reload();
    } catch (e) {
      console.error("Failed to open workspace:", e);
      setWorkspaceError(formatWorkspaceError(e));
    }
  }

  async function forget(path: string, event: React.MouseEvent) {
    event.stopPropagation();
    await window.lotion.workspace.forget(path);
    const next = await window.lotion.workspace.listRecent();
    setRecents(next);
  }

  async function changeWorkspaceIcon() {
    setOpen(false);
    const result = await window.lotion.icons.setForWorkspace();
    if (result.iconPath) onWorkspaceIconChanged?.();
  }

  async function clearWorkspaceIcon() {
    setOpen(false);
    await window.lotion.icons.clearForWorkspace();
    onWorkspaceIconChanged?.();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="workspace-selector"
        onClick={() => setOpen((v) => {
          const next = !v;
          if (!next) setPendingSwitch(null);
          return next;
        })}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <EntityIcon kind="workspace" icon={currentIcon} size={22} />
        <span className="workspace-selector-label">{currentName}</span>
        <ChevronDownIcon />
      </button>
      {workspaceError && (
        <div className="workspace-selector-error" role="alert">
          <span>{workspaceError}</span>
          <button type="button" onClick={() => setWorkspaceError(null)} aria-label="Dismiss workspace open error">×</button>
        </div>
      )}
      {open && menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="workspace-selector-menu"
            style={{ left: menuPos.left, top: menuPos.top, minWidth: menuPos.width }}
            role="menu"
          >
            {pendingSwitch ? (
              <div className="workspace-selector-confirm" role="group" aria-label="Confirm workspace switch">
                <div className="workspace-selector-confirm-title">Open workspace?</div>
                <div className="workspace-selector-confirm-name">{pendingSwitch.name}</div>
                <div className="workspace-selector-confirm-path">{pendingSwitch.path}</div>
                <div className="workspace-selector-confirm-actions">
                  <button type="button" onClick={() => setPendingSwitch(null)}>Cancel</button>
                  <button type="button" className="primary" onClick={() => switchTo(pendingSwitch.path)}>Open</button>
                </div>
              </div>
            ) : recents.length > 0 && (
              <>
                <div className="workspace-selector-section">Recent</div>
                {recents.map((r) => (
                  <div key={r.path} className="workspace-selector-item-wrap">
                    <button
                      type="button"
                      className="workspace-selector-item"
                      onClick={() => {
                        setWorkspaceError(null);
                        setPendingSwitch(r);
                      }}
                      title={r.path}
                    >
                      <span className="workspace-selector-item-icon">
                        <EntityIcon kind="workspace" icon={r.icon} size={18} />
                      </span>
                      <span className="workspace-selector-item-name">{r.name}</span>
                      <span className="workspace-selector-item-path">{shortenPath(r.path)}</span>
                    </button>
                    <button
                      type="button"
                      className="workspace-selector-forget"
                      onClick={(e) => forget(r.path, e)}
                      title="Remove from list"
                      aria-label="Remove from list"
                    >×</button>
                  </div>
                ))}
                <div className="workspace-selector-divider" />
              </>
            )}
            <button type="button" className="workspace-selector-item action" onClick={changeWorkspaceIcon}>
              Change workspace icon…
            </button>
            {currentIcon && (
              <button type="button" className="workspace-selector-item action" onClick={clearWorkspaceIcon}>
                Clear workspace icon
              </button>
            )}
            <div className="workspace-selector-divider" />
            <button type="button" className="workspace-selector-item action" onClick={openPicker}>
              Open workspace…
            </button>
            <button type="button" className="workspace-selector-item action" onClick={() => { setOpen(false); onImportNotion(); }}>
              Import from Notion…
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function formatWorkspaceError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Could not open the selected workspace.";
}

function shortenPath(p: string): string {
  // Tail end is most informative — keep the last 2-3 segments.
  const parts = p.split(/[\\/]/);
  if (parts.length <= 3) return p;
  return "…/" + parts.slice(-2).join("/");
}
