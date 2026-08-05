import { useEffect, useRef, useState } from "react";
import { iconUrl } from "../../components/EntityIcon";

interface CoverAreaProps {
  /** Stable entity identity used to invalidate stale recovery UI when
   *  navigating between entities that happen to share the same cover. */
  mutationKey?: string;
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
  onCommitOffset?: (offset: number) => void | Promise<void>;
}

export type CoverOffsetMutationResult = "submitted" | "failed" | "ignored";
export type CoverOffsetMutationState =
  | { status: "idle" }
  | { status: "saving"; offset: number }
  | { status: "error"; offset: number; error: string };

type CoverOffsetMutationOperation = (offset: number) => void | Promise<void>;

export function createCoverOffsetMutationController({
  onStateChange
}: {
  onStateChange: (state: CoverOffsetMutationState) => void;
}) {
  let generation = 0;
  let running = false;
  let failedAttempt: { offset: number; operation: CoverOffsetMutationOperation } | null = null;

  async function submit(
    offset: number,
    operation: CoverOffsetMutationOperation,
    retry = false
  ): Promise<CoverOffsetMutationResult> {
    if (running || (!retry && failedAttempt)) return "ignored";
    const attempt = retry ? failedAttempt : { offset, operation };
    if (!attempt) return "ignored";
    const ownedGeneration = generation;
    running = true;
    onStateChange({ status: "saving", offset: attempt.offset });
    try {
      await attempt.operation(attempt.offset);
      if (ownedGeneration !== generation) return "submitted";
      running = false;
      failedAttempt = null;
      onStateChange({ status: "idle" });
      return "submitted";
    } catch (error) {
      if (ownedGeneration !== generation) return "failed";
      running = false;
      failedAttempt = attempt;
      onStateChange({
        status: "error",
        offset: attempt.offset,
        error: error instanceof Error ? error.message : String(error)
      });
      return "failed";
    }
  }

  function retry() {
    return failedAttempt
      ? submit(failedAttempt.offset, failedAttempt.operation, true)
      : Promise.resolve<CoverOffsetMutationResult>("ignored");
  }

  function discard() {
    if (running || !failedAttempt) return false;
    failedAttempt = null;
    onStateChange({ status: "idle" });
    return true;
  }

  function reset() {
    generation += 1;
    running = false;
    failedAttempt = null;
    onStateChange({ status: "idle" });
  }

  return { discard, reset, retry, submit };
}

/**
 * Banner cover at the top of a page or DB. Hover surfaces three
 * actions: 更换 (re-pick image), 重新定位 (drag-to-reposition), 移除
 * (remove cover). Drag mode lets the user pull the image vertically;
 * the resulting `object-position` percentage is persisted on release.
 */
export function CoverArea({
  mutationKey = "",
  src,
  offset = 50,
  onChangeImage,
  onClear,
  onCommitOffset
}: CoverAreaProps) {
  const [repositioning, setRepositioning] = useState(false);
  // Live offset while dragging — independent of the prop so we don't
  // round-trip through React state for every mouse move.
  const [livePct, setLivePct] = useState(offset);
  const [mutationState, setMutationState] = useState<CoverOffsetMutationState>({ status: "idle" });
  const mutationControllerRef = useRef<ReturnType<typeof createCoverOffsetMutationController> | null>(null);
  if (!mutationControllerRef.current) {
    mutationControllerRef.current = createCoverOffsetMutationController({ onStateChange: setMutationState });
  }
  const sourceRef = useRef(`${mutationKey}\0${src}`);
  const rootRef = useRef<HTMLDivElement>(null);
  // Track where the drag started so we can map dy → ΔPct.
  const dragRef = useRef<{ startY: number; startPct: number } | null>(null);

  useEffect(() => {
    if (mutationState.status === "idle") setLivePct(offset);
  }, [mutationState.status, offset]);

  useEffect(() => {
    const sourceIdentity = `${mutationKey}\0${src}`;
    if (sourceRef.current === sourceIdentity) return;
    sourceRef.current = sourceIdentity;
    mutationControllerRef.current?.reset();
    setRepositioning(false);
    setLivePct(offset);
  }, [mutationKey, offset, src]);

  useEffect(() => {
    if (!repositioning) {
      dragRef.current = null;
      return;
    }
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
    if (event.target instanceof Element && event.target.closest("button")) return;
    dragRef.current = { startY: event.clientY, startPct: livePct };
  }

  async function commit() {
    if (livePct === offset || !onCommitOffset) {
      setRepositioning(false);
      return;
    }
    const result = await mutationControllerRef.current?.submit(livePct, onCommitOffset);
    if (result === "submitted") setRepositioning(false);
  }
  function cancel() {
    setRepositioning(false);
    setLivePct(offset);
  }

  return (
    <div
      ref={rootRef}
      className={repositioning ? "page-cover repositioning" : "page-cover"}
      aria-busy={mutationState.status === "saving"}
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
          <button type="button" onClick={cancel} disabled={mutationState.status !== "idle"}>取消</button>
          <button type="button" className="primary" onClick={() => { void commit(); }} disabled={mutationState.status !== "idle"}>保存</button>
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
      {mutationState.status === "error" && (
        <div className="database-mutation-toast cover-offset-feedback error" role="alert" aria-live="assertive" data-offset={mutationState.offset}>
          <span>Cover position failed to save: {mutationState.error}</span>
          <button
            type="button"
            onClick={() => {
              void mutationControllerRef.current?.retry().then((result) => {
                if (result === "submitted") setRepositioning(false);
              });
            }}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => {
              if (!mutationControllerRef.current?.discard()) return;
              setLivePct(offset);
              setRepositioning(false);
            }}
          >
            Discard position
          </button>
        </div>
      )}
    </div>
  );
}
