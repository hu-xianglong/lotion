const POPOVER_MARGIN = 12;
const POPOVER_MAX_WIDTH = 480;

interface PopoverPositionOptions {
  maxWidth?: number;
  maxHeight?: number;
}

export function popoverPositionStyle(anchor: { left: number; top: number }, options: PopoverPositionOptions = {}) {
  const maxWidth = options.maxWidth ?? POPOVER_MAX_WIDTH;
  const viewportWidth = typeof window === "undefined" ? maxWidth + POPOVER_MARGIN * 2 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? (options.maxHeight ?? 0) + POPOVER_MARGIN * 2 : window.innerHeight;
  const left = Math.max(
    POPOVER_MARGIN,
    Math.min(anchor.left, viewportWidth - maxWidth - POPOVER_MARGIN)
  );
  const top = options.maxHeight
    ? Math.max(POPOVER_MARGIN, Math.min(anchor.top, viewportHeight - options.maxHeight - POPOVER_MARGIN))
    : anchor.top;
  return {
    left,
    top,
    position: "fixed" as const,
    width: `min(${maxWidth}px, calc(100vw - ${POPOVER_MARGIN * 2}px))`
  };
}
