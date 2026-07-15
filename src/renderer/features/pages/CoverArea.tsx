import { useEffect, useRef, useState } from "react";
import { iconUrl } from "../../components/EntityIcon";

interface CoverAreaProps {
  /** Workspace-relative path to the cover image. */
  src: string;
  /** Saved focal point (0..100). Defaults to 50 (center). */
  offset?: number;
  /** Pop the system file picker → save the chosen path. */
  onChangeImage?: () => void;
  /** Drop the cover entirely. */
  onClear?: () => void;
  /** Commit a new focal point. Called once when the user releases the
   *  drag in reposition mode. */
  onCommitOffset?: (offset: number) => void;
}

/**
 * Banner cover at the top of a page or DB. Hover surfaces three
 * actions: 更换 (re-pick image), 重新定位 (drag-to-reposition), 移除
 * (remove cover). Drag mode lets the user pull the image vertically;
 * the resulting `object-position` percentage is persisted on release.
 */
export function CoverArea({ src, offset = 50, onChangeImage, onClear, onCommitOffset }: CoverAreaProps) {
  const [repositioning, setRepositioning] = useState(false);
  // Live offset while dragging — independent of the prop so we don't
  // round-trip through React state for every mouse move.
  const [livePct, setLivePct] = useState(offset);
  const rootRef = useRef<HTMLDivElement>(null);
  // Track where the drag started so we can map dy → ΔPct.
  const dragRef = useRef<{ startY: number; startPct: number } | null>(null);

  useEffect(() => {
    setLivePct(offset);
  }, [offset]);

  useEffect(() => {
    if (!repositioning) return;
    function onMove(event: MouseEvent) {
      const drag = dragRef.current;
      const el = rootRef.current;
      if (!drag || !el) return;
      const height = el.clientHeight;
      // Each pixel of drag moves the focal point by `100 / height`
      // percent — i.e. dragging the full height of the cover sweeps
      // the focal point 100%. Dragging DOWN moves the focal point UP
      // (image content scrolls down), matching Notion's feel.
      const delta = ((drag.startY - event.clientY) / height) * 100;
      const next = Math.max(0, Math.min(100, drag.startPct + delta));
      setLivePct(next);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      dragRef.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [repositioning]);

  function startDrag(event: React.MouseEvent) {
    if (!repositioning) return;
    dragRef.current = { startY: event.clientY, startPct: livePct };
  }

  function commit() {
    setRepositioning(false);
    if (livePct !== offset) onCommitOffset?.(livePct);
  }
  function cancel() {
    setRepositioning(false);
    setLivePct(offset);
  }

  return (
    <div
      ref={rootRef}
      className={repositioning ? "page-cover repositioning" : "page-cover"}
      onMouseDown={startDrag}
    >
      <img
        src={iconUrl(src)}
        alt=""
        style={{ objectPosition: `50% ${livePct}%` }}
        draggable={false}
      />
      {repositioning ? (
        <div className="page-cover-reposition-actions">
          <span className="page-cover-hint">拖动以重新定位</span>
          <button type="button" onClick={cancel}>取消</button>
          <button type="button" className="primary" onClick={commit}>保存</button>
        </div>
      ) : (
        <div className="page-cover-actions">
          {onChangeImage && (
            <button type="button" onClick={onChangeImage}>更换封面</button>
          )}
          {onCommitOffset && (
            <button type="button" onClick={() => setRepositioning(true)}>重新定位</button>
          )}
          {onClear && (
            <button type="button" onClick={onClear}>移除</button>
          )}
        </div>
      )}
    </div>
  );
}
