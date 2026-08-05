import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { popoverPositionStyle } from "../lib/popover-position";

export interface MenuAnchor {
  left: number;
  top: number;
}

export function MenuSurface({ anchor, ariaLabel, title, focusKey, onBack, onClose, children }: {
  anchor: MenuAnchor;
  ariaLabel: string;
  title: string;
  focusKey?: unknown;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const [compact, setCompact] = useState(() => window.innerWidth <= 1100);

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth <= 1100);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useLayoutEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])');
    first?.focus();
  }, [focusKey, title]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && ref.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [onClose]);

  useEffect(() => () => {
    const origin = returnFocusRef.current;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (origin?.isConnected && (!active || active === document.body || !active.isConnected)) origin.focus();
    });
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      (onBack ?? onClose)();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      items[(index + delta + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  }

  return createPortal(
    <div className={compact ? "menu-sheet-backdrop" : "menu-popover-layer"}>
      <div
        ref={ref}
        className={compact ? "menu-surface menu-sheet" : "menu-surface"}
        role="menu"
        aria-label={ariaLabel}
        style={compact ? undefined : popoverPositionStyle(anchor, { maxWidth: 340, maxHeight: 580 })}
        onKeyDown={onKeyDown}
      >
        <div className="menu-surface-header">
          {onBack && <button type="button" className="menu-back" onClick={onBack} aria-label="Back">←</button>}
          <strong>{title}</strong>
          <button type="button" className="menu-close" onClick={onClose} aria-label="Close menu">×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function MenuSection({ label, danger = false, children }: { label?: string; danger?: boolean; children: ReactNode }) {
  return (
    <div className={danger ? "menu-section danger" : "menu-section"}>
      {label && <div className="menu-section-label">{label}</div>}
      {children}
    </div>
  );
}

export function MenuItem({ label, description, disabledReason, danger = false, submenu = false, onSelect }: {
  label: string;
  description?: string;
  disabledReason?: string;
  danger?: boolean;
  submenu?: boolean;
  onSelect?: () => void;
}) {
  const disabled = Boolean(disabledReason) || !onSelect;
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? "menu-item danger" : "menu-item"}
      disabled={disabled}
      title={disabledReason}
      onClick={onSelect}
    >
      <span className="menu-item-copy">
        <span>{label}</span>
        {(description || disabledReason) && <small>{disabledReason || description}</small>}
      </span>
      {submenu && <span aria-hidden="true">›</span>}
    </button>
  );
}
