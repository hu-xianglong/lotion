import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import type { Disposable, PluginContext, PluginManifest, UIAPI } from "../../shared/plugin-api.js";
import type { EntityRef, RecordValue, SelectOption } from "../../shared/types.js";
import { formatDateForField, normalizeDateValue } from "../../shared/date-values.js";
import type {
  ReactFieldTypeProvider,
  RendererFieldRenderContext
} from "../../shared/plugin-react.js";
import { popoverPositionStyle } from "../../renderer/lib/popover-position";

/**
 * Built-in field-type providers. Loaded eagerly at renderer startup
 * (see src/renderer/main.tsx) so default cells render before any
 * user-installed plugin gets a chance to run.
 *
 * Each provider mirrors the behavior the old hard-coded
 * `if (field.type === "...")` chain in DatabaseTable.Cell used to
 * have — same UI, same edit semantics — but routed through the
 * plugin API. Third-party plugins replace any of these by registering
 * a provider with the same `type`; the Registry refuses duplicate
 * `type` so user plugins must load after dispose-and-replace, or use
 * a different `type` (recommended).
 */

// ── Helpers ──────────────────────────────────────────────────────────

export const manifest: PluginManifest = {
  id: "field-types-default",
  name: "Default Field Types",
  version: "0.0.1",
  description: "Built-in database field editors and renderers.",
  permissions: ["workspace.read", "workspace.write", "shell"]
};

function asString(value: RecordValue): string {
  return value == null ? "" : String(value);
}

type DraftInputElement = HTMLInputElement | HTMLTextAreaElement;
const CELL_COMMIT_DEBOUNCE_MS = 800;

function DraftStringCell({
  value,
  ctx,
  inputType = "text",
  placeholder
}: {
  value: RecordValue;
  ctx: RendererFieldRenderContext;
  inputType?: "text" | "url";
  placeholder?: string;
}) {
  const initialValue = asString(value);
  const [draft, setDraft] = useState(initialValue);
  const draftRef = useRef(initialValue);
  const committedRef = useRef(initialValue);
  const commitRef = useRef(ctx.commit);
  const debounceTimerRef = useRef<number | null>(null);
  const skipBlurCommitRef = useRef(false);
  commitRef.current = ctx.commit;

  useEffect(() => {
    const next = asString(value);
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
    commitRef.current?.(pending);
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
    commitRef.current?.(next);
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

  function handleChange(event: ChangeEvent<DraftInputElement>) {
    const next = event.target.value;
    draftRef.current = next;
    setDraft(next);
    scheduleCommit();
  }

  function handleKeyDown(event: KeyboardEvent<DraftInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      revert();
      event.currentTarget.blur();
      return;
    }
    if (event.key !== "Enter") return;
    const isTextarea = event.currentTarget instanceof HTMLTextAreaElement;
    if (isTextarea && !event.metaKey && !event.ctrlKey) return;
    event.preventDefault();
    commit();
    event.currentTarget.blur();
  }

  const resolvedPlaceholder = placeholder ?? ctx.placeholder ?? "";
  if (ctx.wrap && inputType === "text") {
    return (
      <textarea
        className="cell-textarea"
        rows={1}
        placeholder={resolvedPlaceholder}
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
  return (
    <input
      type={inputType}
      placeholder={resolvedPlaceholder}
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

function DraftNumberCell({ value, ctx }: { value: RecordValue; ctx: RendererFieldRenderContext }) {
  const initialValue = asString(value);
  const [draft, setDraft] = useState(initialValue);
  const draftRef = useRef(initialValue);
  const committedRef = useRef(initialValue);
  const commitRef = useRef(ctx.commit);
  const debounceTimerRef = useRef<number | null>(null);
  const skipBlurCommitRef = useRef(false);
  commitRef.current = ctx.commit;

  useEffect(() => {
    const next = asString(value);
    const hasLocalDraft = draftRef.current !== committedRef.current;
    committedRef.current = next;
    if (hasLocalDraft) return;
    draftRef.current = next;
    setDraft(next);
  }, [value]);

  useEffect(() => () => {
    if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    commit();
  }, []);

  function clearDebounce() {
    if (debounceTimerRef.current === null) return;
    window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }

  function commit() {
    clearDebounce();
    const trimmed = draftRef.current.trim();
    if (!trimmed) {
      if (committedRef.current === "") return;
      committedRef.current = "";
      draftRef.current = "";
      setDraft("");
      commitRef.current?.("");
      return;
    }
    const next = Number(trimmed);
    if (!Number.isFinite(next)) {
      draftRef.current = committedRef.current;
      setDraft(committedRef.current);
      return;
    }
    if (trimmed === committedRef.current) return;
    committedRef.current = String(next);
    commitRef.current?.(next);
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
      type="number"
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        draftRef.current = next;
        setDraft(next);
        scheduleCommit();
      }}
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

function vanillaText(text: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

const OPTION_COLORS = [
  { id: "gray", label: "Gray", background: "#ece7dd", border: "#d4ccc0", text: "#5d574f" },
  { id: "red", label: "Red", background: "#fdecea", border: "#efb7af", text: "#8f352b" },
  { id: "orange", label: "Orange", background: "#fff0db", border: "#eac08a", text: "#7a4b13" },
  { id: "yellow", label: "Yellow", background: "#fff8cc", border: "#e1cf69", text: "#6a5800" },
  { id: "green", label: "Green", background: "#e9f6eb", border: "#a9d4b0", text: "#28623a" },
  { id: "blue", label: "Blue", background: "#e9f2ff", border: "#adc8ee", text: "#2d5f9a" },
  { id: "purple", label: "Purple", background: "#f2ecfb", border: "#c8b5e7", text: "#5f3d86" },
  { id: "pink", label: "Pink", background: "#fdeef6", border: "#e7b3ce", text: "#84375c" }
] as const;

function OptionDropdown({
  mode,
  options,
  value,
  placeholder,
  onChange,
  onOptionColorChange,
  onOptionsChange
}: {
  mode: "select" | "multi_select";
  options: SelectOption[];
  value: RecordValue | undefined;
  placeholder?: string;
  onChange: (value: RecordValue) => void;
  onOptionColorChange?: (optionId: string, color: string) => void;
  onOptionsChange?: (options: SelectOption[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draggedOptionId, setDraggedOptionId] = useState<string>();
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedNames = mode === "multi_select" ? parseMultiSelectValue(value) : [String(value ?? "")].filter(Boolean);
  const optionList = getOptionsWithCurrentValue(options, value);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPosition({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function close() {
      setIsOpen(false);
    }
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [isOpen]);

  function toggleOption(option: SelectOption) {
    if (mode === "select") {
      onChange(option.name);
      setIsOpen(false);
      return;
    }
    const next = selectedNames.includes(option.name)
      ? selectedNames.filter((name) => name !== option.name)
      : [...selectedNames, option.name];
    onChange(serializeMultiSelectValue(next));
  }

  function clear() {
    onChange("");
    if (mode === "select") setIsOpen(false);
  }

  function reorderOption(sourceId: string | undefined, targetId: string) {
    if (!sourceId || sourceId === targetId || !onOptionsChange) return;
    const sourceIndex = options.findIndex((option) => option.id === sourceId);
    const targetIndex = options.findIndex((option) => option.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const next = [...options];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    onOptionsChange(next);
  }

  function deleteOption(option: SelectOption) {
    if (!onOptionsChange || options.length <= 1) return;
    onOptionsChange(options.filter((item) => item.id !== option.id));
  }

  const menu = isOpen && menuPosition
    ? createPortal(
      <div
        ref={menuRef}
        className="option-menu"
        style={{
          ...popoverPositionStyle({ top: menuPosition.top, left: menuPosition.left }, { maxWidth: 430, maxHeight: 260 }),
          minWidth: menuPosition.minWidth
        }}
      >
        <button className="option-menu-item clear-item" onClick={clear}>Clear</button>
        {optionList.map((option) => {
          const selected = selectedNames.includes(option.name);
          const canManage = Boolean(onOptionsChange) && !option.id.startsWith("unknown_");
          return (
            <div
              className={draggedOptionId === option.id ? "option-menu-item dragging" : "option-menu-item"}
              key={option.id}
              role="button"
              tabIndex={0}
              onDragOver={(event) => {
                if (canManage) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                reorderOption(draggedOptionId, option.id);
                setDraggedOptionId(undefined);
              }}
              onClick={() => toggleOption(option)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggleOption(option);
                }
              }}
            >
              {canManage && (
                <span
                  className="drag-handle"
                  draggable
                  title="Drag to reorder"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedOptionId(option.id);
                  }}
                  onDragEnd={() => setDraggedOptionId(undefined)}
                >
                  ::
                </span>
              )}
              {mode === "multi_select" && <input type="checkbox" readOnly checked={selected} />}
              {mode === "select" && <span className={selected ? "single-check selected" : "single-check"} />}
              <OptionPill option={option} muted={!selected} />
              {onOptionColorChange && !option.id.startsWith("unknown_") && (
                <select
                  className="option-color-select"
                  aria-label={`Change color for ${option.name}`}
                  value={option.color || "gray"}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    onOptionColorChange(option.id, event.target.value);
                  }}
                >
                  {OPTION_COLORS.map((color) => (
                    <option key={color.id} value={color.id}>{color.label}</option>
                  ))}
                </select>
              )}
              {canManage && (
                <button
                  className="option-delete-button"
                  disabled={options.length <= 1}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteOption(option);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>,
      document.body
    )
    : null;

  return (
    <div className="option-dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        className="option-dropdown-trigger"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="selected-options">
          {selectedNames.length === 0 && <span className="empty-option">{placeholder ?? "Empty"}</span>}
          {selectedNames.map((name) => {
            const option = optionList.find((item) => item.name === name) || { id: `unknown_${name}`, name };
            return <OptionPill key={option.id} option={option} />;
          })}
        </span>
      </button>
      {menu}
    </div>
  );
}

function OptionPill({ option, muted = false }: { option: SelectOption; muted?: boolean }) {
  const color = getOptionColor(option.color);
  return (
    <span
      className={muted ? "option-pill muted" : "option-pill"}
      style={{
        backgroundColor: color.background,
        borderColor: color.border,
        color: color.text
      }}
    >
      {option.name}
    </span>
  );
}

function parseMultiSelectValue(value: RecordValue | undefined): string[] {
  if (typeof value !== "string") return [];
  return value.split(";").map((item) => item.trim()).filter(Boolean);
}

function serializeMultiSelectValue(values: string[]): string {
  return [...new Set(values)].join(";");
}

function getOptionsWithCurrentValue(options: SelectOption[], value: RecordValue | undefined): SelectOption[] {
  const names = new Set(options.map((option) => option.name));
  const unknownNames = typeof value === "string"
    ? value.split(";").map((item) => item.trim()).filter((item) => item && !names.has(item))
    : [];
  return [
    ...options,
    ...unknownNames.map((name) => ({ id: `unknown_${name}`, name, color: "gray" }))
  ];
}

function getOptionColor(color?: string) {
  return OPTION_COLORS.find((item) => item.id === color) || OPTION_COLORS[0];
}

// ── text ─────────────────────────────────────────────────────────────

const textProvider: ReactFieldTypeProvider = {
  type: "text",
  label: "Text",
  render: (value) => vanillaText(asString(value)),
  renderReact: (value, ctx) => <DraftStringCell value={value} ctx={ctx} />
};

const personProvider: ReactFieldTypeProvider = {
  type: "person",
  label: "Person",
  render: (value) => vanillaText(asString(value)),
  renderReact: (value, ctx) => <DraftStringCell value={value} ctx={ctx} />
};

// ── number ───────────────────────────────────────────────────────────

const numberProvider: ReactFieldTypeProvider = {
  type: "number",
  label: "Number",
  validate(value) {
    if (value == null || value === "") return;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Not a number: ${String(value)}`);
  },
  render: (value) => vanillaText(asString(value)),
  renderReact: (value, ctx) => <DraftNumberCell value={value} ctx={ctx} />
};

// ── select ───────────────────────────────────────────────────────────

const selectProvider: ReactFieldTypeProvider = {
  type: "select",
  label: "Select",
  render: (value) => vanillaText(asString(value)),
  renderReact: (value, ctx: RendererFieldRenderContext) => {
    const options = ctx.field.options ?? [];
    return (
      <OptionDropdown
        mode="select"
        options={options}
        value={value}
        placeholder={ctx.placeholder}
        onChange={(next) => ctx.commit?.(next)}
        onOptionColorChange={(optionId, color) =>
          ctx.onOptionsChange?.(
            options.map((o) => (o.id === optionId ? { ...o, color } : o))
          )
        }
        onOptionsChange={(next) => ctx.onOptionsChange?.(next)}
      />
    );
  }
};

// ── multi_select ─────────────────────────────────────────────────────

const multiSelectProvider: ReactFieldTypeProvider = {
  type: "multi_select",
  label: "Multi select",
  render: (value) => vanillaText(asString(value)),
  renderReact: (value, ctx: RendererFieldRenderContext) => {
    const options = ctx.field.options ?? [];
    return (
      <OptionDropdown
        mode="multi_select"
        options={options}
        value={value}
        placeholder={ctx.placeholder}
        onChange={(next) => ctx.commit?.(next)}
        onOptionColorChange={(optionId, color) =>
          ctx.onOptionsChange?.(
            options.map((o) => (o.id === optionId ? { ...o, color } : o))
          )
        }
        onOptionsChange={(next) => ctx.onOptionsChange?.(next)}
      />
    );
  }
};

// ── date ─────────────────────────────────────────────────────────────

const dateProvider: ReactFieldTypeProvider = {
  type: "date",
  label: "Date",
  render: (value, ctx) => vanillaText(formatDateForField(value, ctx.field)),
  renderReact: (value, ctx) => (
    <DateCellInput value={value} ctx={ctx} />
  )
};

function DateCellInput({ value, ctx }: { value: RecordValue; ctx: RendererFieldRenderContext }) {
  const raw = asString(value);
  const normalized = normalizeDateValue(value);
  const display = formatDateForField(value, ctx.field);
  const initialDraft = display || "";
  const [draft, setDraft] = useState(initialDraft);
  const draftRef = useRef(initialDraft);
  const committedRef = useRef(raw);
  const skipBlurCommitRef = useRef(false);
  const commitRef = useRef(ctx.commit);
  commitRef.current = ctx.commit;

  useEffect(() => {
    const nextRaw = asString(value);
    const nextDraft = formatDateForField(value, ctx.field) || "";
    committedRef.current = nextRaw;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }, [ctx.field.dateFormat, ctx.field.timeFormat, ctx.field.type, value]);

  function commitText() {
    const trimmed = draftRef.current.trim();
    const next = trimmed ? normalizeDateValue(trimmed) || trimmed : "";
    if (next === committedRef.current) return;
    committedRef.current = next;
    commitRef.current?.(next);
  }

  function revert() {
    const nextDraft = formatDateForField(committedRef.current, ctx.field) || "";
    draftRef.current = nextDraft;
    setDraft(nextDraft);
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
      commitText();
      event.currentTarget.blur();
    }
  }

  const ariaLabel = display ? `Edit date: ${display}` : "Edit date";
  return (
    <span className="date-cell-wrap">
      <input
        type="text"
        className={raw ? "date-cell-text-input" : "date-cell-text-input empty"}
        value={draft}
        placeholder={ctx.placeholder || "Empty"}
        title={raw || display}
        aria-label={ariaLabel}
        onChange={(event) => {
          draftRef.current = event.target.value;
          setDraft(event.target.value);
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commitText();
        }}
        onKeyDown={handleKeyDown}
      />
      <input
        className="date-cell-picker"
        type="date"
        value={normalized}
        title={raw || display}
        aria-label={ariaLabel}
        onChange={(event) => ctx.commit?.(event.target.value)}
      />
    </span>
  );
}

// ── url ──────────────────────────────────────────────────────────────

function createUrlProvider(ui: UIAPI): ReactFieldTypeProvider {
  return {
  type: "url",
  label: "URL",
  validate(value) {
    const raw = asString(value).trim();
    if (!raw) return;
    try {
      new URL(raw);
    } catch {
      throw new Error(`Not a URL: ${raw}`);
    }
  },
  render(value) {
    const raw = asString(value).trim();
    if (!raw) return vanillaText("");
    const link = document.createElement("a");
    link.href = raw;
    link.textContent = raw;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  },
  renderReact: (value, ctx) => <UrlCell value={value} ctx={ctx} ui={ui} />
  };
}

function UrlCell({ value, ctx, ui }: { value: RecordValue; ctx: RendererFieldRenderContext; ui: UIAPI }) {
  const raw = asString(value).trim();
  const href = normalizeUrlForOpen(raw);
  const display = raw || ctx.placeholder || "";
  return (
    <span className="url-cell">
      <span
        className={raw ? "url-cell-display" : "url-cell-display empty"}
        title={raw}
        onMouseDown={(event) => {
          event.preventDefault();
          const cell = event.currentTarget.closest(".url-cell");
          const input = cell?.querySelector("input");
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }}
      >
        {display}
      </span>
      <DraftStringCell value={value} ctx={ctx} inputType="url" placeholder="https://" />
      <button
        type="button"
        className="url-cell-open"
        disabled={!href}
        title={href || ctx.placeholder || "Open URL"}
        aria-label="Open URL"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!href) return;
          void ui.openUrl(href).catch((error) => {
            console.warn("[lotion] failed to open URL:", error);
          });
        }}
      >
        <ExternalLink size={16} strokeWidth={2} />
      </button>
    </span>
  );
}

function normalizeUrlForOpen(raw: string): string {
  if (!raw) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  if (/^[^\s/@]+\.[^\s]+/.test(raw)) return `https://${raw}`;
  return raw;
}

// ── entity_ref ───────────────────────────────────────────────────────

function createEntityRefProvider(ui: UIAPI): ReactFieldTypeProvider {
  return {
  type: "entity_ref",
  label: "Page / row link",
  render(value) {
    const { refs, fallback } = parseEntityRefCell(value);
    if (refs.length === 0) return vanillaText(fallback);
    return vanillaText(refs.map(entityRefTitle).join(", "));
  },
  renderReact: (value, ctx) => {
    const { refs, fallback } = parseEntityRefCell(value);
    if (refs.length === 0) {
      return (
        <DraftStringCell
          value={fallback || value}
          ctx={ctx}
          placeholder={ctx.placeholder || "Empty"}
        />
      );
    }
    return (
      <span className="entity-ref-cell">
        {refs.map((ref) => (
          <button
            key={`${ref.kind}:${ref.entityId}`}
            type="button"
            className="entity-ref-chip"
            title={entityRefTitle(ref)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              ui.openEntity(ref);
            }}
          >
            <EntityGlyph kind={ref.kind} />
            <span>{entityRefTitle(ref)}</span>
          </button>
        ))}
      </span>
    );
  }
  };
}

function EntityGlyph({ kind }: { kind: EntityRef["kind"] }) {
  return (
    <span aria-hidden="true" className="entity-ref-glyph">
      {kind === "database" ? "▦" : kind === "row" ? "▤" : "□"}
    </span>
  );
}

function parseEntityRefCell(value: RecordValue): { refs: EntityRef[]; fallback: string } {
  const raw = asString(value).trim();
  if (!raw) return { refs: [], fallback: "" };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const refs = candidates
      .map((candidate) => normalizeEntityRef(candidate))
      .filter((candidate): candidate is EntityRef => Boolean(candidate));
    if (refs.length > 0) return { refs, fallback: "" };
  } catch {
    // Imported workspaces before the entity_ref migration may still
    // contain readable text/Markdown. Show it instead of surfacing JSON errors.
  }
  return { refs: [], fallback: raw };
}

function normalizeEntityRef(value: unknown): EntityRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const entityId = typeof candidate.entityId === "string" ? candidate.entityId : "";
  const kind = candidate.kind === "page" || candidate.kind === "database" || candidate.kind === "row"
    ? candidate.kind
    : undefined;
  if (!entityId || !kind) return null;
  const ref: EntityRef = { entityId, kind };
  if (typeof candidate.databaseId === "string") ref.databaseId = candidate.databaseId;
  if (typeof candidate.rowId === "string") ref.rowId = candidate.rowId;
  if (typeof candidate.titleSnapshot === "string") ref.titleSnapshot = candidate.titleSnapshot;
  if (Array.isArray(candidate.pathSnapshot)) ref.pathSnapshot = candidate.pathSnapshot.map(String).filter(Boolean);
  return ref;
}

function entityRefTitle(ref: EntityRef): string {
  return ref.titleSnapshot || ref.pathSnapshot?.at(-1) || ref.entityId || "Untitled";
}

// ── checkbox ─────────────────────────────────────────────────────────

const checkboxProvider: ReactFieldTypeProvider = {
  type: "checkbox",
  label: "Checkbox",
  render: (value) => vanillaText(value === true || value === "true" ? "✓" : ""),
  renderReact: (value, ctx) => (
    <input
      type="checkbox"
      checked={value === true || value === "true"}
      onChange={(event) => ctx.commit?.(event.target.checked)}
    />
  )
};

// ── formula (read-only) ──────────────────────────────────────────────

const formulaProvider: ReactFieldTypeProvider = {
  type: "formula",
  label: "Formula",
  configSchema: {
    formula: { type: "string", label: "Expression", multiline: true }
  },
  render: (value) => vanillaText(asString(value)),
  renderReact: (value) => (
    <span className="readonly-cell">{asString(value)}</span>
  )
};

// ── rollup (read-only until cross-database compute lands) ────────────

const rollupProvider: ReactFieldTypeProvider = {
  type: "rollup",
  label: "Rollup",
  render: (value) => vanillaText(asString(value)),
  renderReact: (value) => (
    <span className="readonly-cell">{asString(value)}</span>
  )
};

// ── Public entry point ───────────────────────────────────────────────

/** Register all default field-type providers via the plugin context.
 *  Returns a Disposable; `ctx.disposeAll()` (on plugin unload) will
 *  also dispose these registrations automatically. */
export function installDefaultFieldTypes(ctx: PluginContext): Disposable {
  const disposables: Disposable[] = [
    ctx.fields.register(textProvider),
    ctx.fields.register(personProvider),
    ctx.fields.register(numberProvider),
    ctx.fields.register(selectProvider),
    ctx.fields.register(multiSelectProvider),
    ctx.fields.register(dateProvider),
    ctx.fields.register(createUrlProvider(ctx.ui)),
    ctx.fields.register(createEntityRefProvider(ctx.ui)),
    ctx.fields.register(checkboxProvider),
    ctx.fields.register(formulaProvider),
    ctx.fields.register(rollupProvider)
  ];
  return {
    dispose: () => {
      for (const d of disposables) d.dispose();
    }
  };
}
