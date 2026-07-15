/**
 * Kanban view — first non-trivial dogfood of the plugin API.
 *
 * Implemented using ONLY public types from src/shared/plugin-api.ts +
 * the PluginContext interface. No imports from internal renderer
 * modules: this is exactly what a third-party plugin would write.
 *
 * What it does: takes a database, picks a `select` field to group by,
 * renders a column per option, drops each row into the matching
 * column as a card. Dragging a card to another column calls
 * workspace.updateCell to commit the change — same API any cell
 * editor uses.
 */

import type {
  DatabaseViewProvider,
  Disposable,
  PluginManifest,
  PluginContext,
  ViewRenderContext
} from "../../shared/plugin-api.js";
import type {
  DatabaseRecord,
  FieldSchema,
  RecordValue,
  SelectOption
} from "../../shared/types.js";

// ── The provider ──────────────────────────────────────────────────

export const manifest: PluginManifest = {
  id: "view-kanban",
  name: "Kanban View",
  version: "0.0.1",
  description: "Built-in Kanban database view provider.",
  permissions: ["workspace.read", "workspace.write"]
};

const kanbanProvider: DatabaseViewProvider = {
  type: "kanban",
  label: "Kanban Board",
  icon: "📋",
  configSchema: {
    groupBy: {
      type: "field-ref",
      label: "Group by",
      // Hint: only `select` fields make sense as column groupings.
      // The host's settings UI is expected to honor this filter.
      fieldKind: "select"
    }
  },
  render(ctx: ViewRenderContext): Disposable {
    const { bundle, view, container, workspace } = ctx;
    container.replaceChildren(); // start clean each render

    // Pick a groupBy field: explicit config first, then the first
    // select field as a fallback so the view renders something
    // sensible before the user configures anything.
    const config = (view.config ?? {}) as { groupBy?: string };
    const groupByFieldId =
      config.groupBy ?? bundle.schema.fields.find(isGroupable)?.id;

    if (!groupByFieldId) {
      const msg = document.createElement("div");
      msg.className = "kanban-empty-state";
      msg.textContent =
        "Kanban view requires a `select` field to group by. Add one to this database first.";
      msg.style.cssText = "padding: 24px; color: var(--ink-3);";
      container.appendChild(msg);
      return { dispose: () => container.replaceChildren() };
    }

    const groupByField = bundle.schema.fields.find((f) => f.id === groupByFieldId);
    if (!groupByField) {
      container.textContent = `Group-by field ${groupByFieldId} not found.`;
      return { dispose: () => container.replaceChildren() };
    }

    const titleField =
      bundle.schema.fields.find((f) => f.id === "title") ??
      bundle.schema.fields.find((f) => !f.system && !f.hidden);
    const metaFields = bundle.schema.fields
      .filter((f) =>
        !f.system &&
        !f.hidden &&
        f.id !== titleField?.id &&
        f.id !== groupByField.id
      )
      .slice(0, 3);

    const shell = document.createElement("div");
    shell.className = "kanban-shell";
    shell.style.cssText = shellCss;

    const groupBar = document.createElement("div");
    groupBar.className = "kanban-groupbar";
    groupBar.style.cssText = groupBarCss;
    const groupLabel = document.createElement("span");
    groupLabel.textContent = "Group by";
    groupLabel.style.cssText = groupLabelCss;
    const groupPill = document.createElement("span");
    groupPill.textContent = groupByField.name;
    groupPill.style.cssText = groupPillCss;
    groupBar.append(groupLabel, groupPill);
    shell.appendChild(groupBar);

    const board = document.createElement("div");
    board.className = "kanban-board";
    board.style.cssText = boardCss;
    shell.appendChild(board);

    // One column per option of the groupBy field. If the schema
    // doesn't declare options explicitly (common for imported
    // Notion DBs), infer them from the distinct values across all
    // rows. Empty-valued rows always go into a trailing "(empty)"
    // column.
    const columns: KanbanColumn[] = [];
    const knownLabels = new Set<string>();
    if (groupByField.options && groupByField.options.length > 0) {
      for (const opt of groupByField.options) {
        knownLabels.add(opt.name);
        columns.push({
          value: opt.id,
          label: opt.name,
          color: opt.color,
          records: []
        });
      }
    }

    const distinct = new Set<string>();
    for (const r of bundle.records) {
      const v = r[groupByField.id];
      if (v != null && String(v).trim() !== "") distinct.add(String(v));
    }
    for (const label of Array.from(distinct).sort()) {
      if (!knownLabels.has(label)) {
        columns.push({ value: label, label, records: [] });
      }
    }
    columns.push({ value: "", label: "(empty)", records: [] });

    // Distribute records into columns.
    for (const record of bundle.records) {
      const rawValue = record[groupByField.id];
      const valueString = rawValue == null ? "" : String(rawValue);
      // The select field stores by option NAME in CSV, not option ID.
      // Normalize: try matching by name OR by id.
      const matchingCol =
        columns.find((c) => c.label === valueString || c.value === valueString) ??
        columns[columns.length - 1];
      matchingCol.records.push(record);
    }

    for (const col of columns) {
      const el = makeColumn(col, async () => {
        const beforeIds = new Set(bundle.records.map((record) => String(record.id)));
        let nextBundle = await workspace.addRow(bundle.schema.id);
        const newRecord =
          nextBundle.records.find((record) => !beforeIds.has(String(record.id))) ??
          nextBundle.records[nextBundle.records.length - 1];
        if (newRecord && col.label !== "(empty)") {
          nextBundle = await workspace.updateCell({
            databaseId: bundle.schema.id,
            rowId: String(newRecord.id),
            fieldId: groupByField.id,
            value: col.label
          });
        }
        kanbanProvider.render({ ...ctx, bundle: nextBundle });
      });
      board.appendChild(el);
      const body = el.querySelector(".kanban-col-body");
      for (const record of col.records) {
        const card = makeCard(record, titleField, metaFields);
        attachDragHandlers(card, record, col);
        body?.appendChild(card);
      }
      attachDropHandlers(el, col, async (record) => {
        const newValue = col.label === "(empty)" ? "" : col.label;
        try {
          const updated = await workspace.updateCell({
            databaseId: bundle.schema.id,
            rowId: String(record.id),
            fieldId: groupByField.id,
            value: newValue
          });
          kanbanProvider.render({ ...ctx, bundle: updated });
        } catch (err) {
          console.error("[kanban] updateCell failed", err);
        }
      });
    }

    container.appendChild(shell);

    return { dispose: () => container.replaceChildren() };
  }
};

// ── DOM helpers ───────────────────────────────────────────────────

interface KanbanColumn {
  value: string;
  label: string;
  color?: string;
  records: DatabaseRecord[];
  el?: HTMLElement;
}

function isGroupable(field: FieldSchema): boolean {
  return !field.system && !field.hidden && field.type === "select";
}

function makeColumn(column: KanbanColumn, onAddRecord: () => Promise<void>): HTMLElement {
  const col = document.createElement("div");
  col.className = "kanban-col";
  col.style.cssText = columnCss;
  column.el = col;

  const header = document.createElement("div");
  header.className = "kanban-col-header";
  header.style.cssText = columnHeaderCss;

  const color = resolveOptionColor(column.color);
  const dot = document.createElement("span");
  dot.style.cssText = `width: 8px; height: 8px; border-radius: 50%; background: ${color.dot}; flex: 0 0 auto;`;
  const name = document.createElement("span");
  name.textContent = column.label;
  name.style.cssText = columnNameCss;
  const count = document.createElement("span");
  count.textContent = String(column.records.length);
  count.style.cssText = columnCountCss;
  header.append(dot, name, count);
  col.appendChild(header);

  const body = document.createElement("div");
  body.className = "kanban-col-body";
  body.style.cssText = columnBodyCss;
  col.appendChild(body);

  const add = document.createElement("button");
  add.type = "button";
  add.className = "kanban-add-card";
  add.textContent = "+ New";
  add.style.cssText = addCardCss;
  add.addEventListener("click", async () => {
    add.disabled = true;
    try {
      await onAddRecord();
    } finally {
      add.disabled = false;
    }
  });
  col.appendChild(add);

  return col;
}

function makeCard(record: DatabaseRecord, titleField: FieldSchema | undefined, metaFields: FieldSchema[]): HTMLElement {
  const card = document.createElement("div");
  card.className = "kanban-card";
  card.style.cssText = cardCss;
  card.draggable = true;
  const title =
    titleField && record[titleField.id] != null
      ? String(record[titleField.id])
      : "Untitled";

  const titleEl = document.createElement("div");
  titleEl.className = "kanban-card-title";
  titleEl.textContent = title.trim() || "Untitled";
  titleEl.style.cssText = cardTitleCss;
  card.appendChild(titleEl);

  const meta = document.createElement("div");
  meta.className = "kanban-card-meta";
  meta.style.cssText = cardMetaCss;
  for (const field of metaFields) {
    const value = record[field.id];
    if (isBlank(value)) continue;
    if (field.type === "select" || field.type === "multi_select") {
      for (const part of String(value).split(";").map((v) => v.trim()).filter(Boolean).slice(0, 3)) {
        meta.appendChild(makePill(part, findOption(field, part)?.color));
      }
    } else {
      const line = document.createElement("span");
      line.textContent = `${field.name} · ${formatValue(value)}`;
      line.style.cssText = cardLineCss;
      meta.appendChild(line);
    }
  }
  if (meta.childElementCount > 0) card.appendChild(meta);
  card.dataset.rowId = String(record.id);
  return card;
}

function attachDragHandlers(
  card: HTMLElement,
  record: DatabaseRecord,
  sourceColumn: KanbanColumn
): void {
  card.addEventListener("dragstart", (event) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData("application/x-lotion-row-id", String(record.id));
    event.dataTransfer.setData("application/x-lotion-kanban-source", sourceColumn.label);
    event.dataTransfer.effectAllowed = "move";
    card.style.opacity = "0.44";
    card.style.cursor = "grabbing";
  });
  card.addEventListener("dragend", () => {
    card.style.opacity = "";
    card.style.cursor = "";
  });
}

function attachDropHandlers(
  columnEl: HTMLElement,
  column: { value: string; label: string },
  onDrop: (record: DatabaseRecord) => Promise<void>
): void {
  columnEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    columnEl.classList.add("kanban-drop-target");
    columnEl.style.outline = "2px dashed var(--accent)";
    columnEl.style.outlineOffset = "4px";
  });
  columnEl.addEventListener("dragleave", () => {
    columnEl.classList.remove("kanban-drop-target");
    columnEl.style.outline = "";
    columnEl.style.outlineOffset = "";
  });
  columnEl.addEventListener("drop", async (event) => {
    event.preventDefault();
    columnEl.classList.remove("kanban-drop-target");
    columnEl.style.outline = "";
    columnEl.style.outlineOffset = "";
    const rowId = event.dataTransfer?.getData("application/x-lotion-row-id");
    if (!rowId) return;
    const source = event.dataTransfer?.getData("application/x-lotion-kanban-source");
    if (source === column.label) return;
    await onDrop({ id: rowId } as DatabaseRecord);
  });
}

function isBlank(value: RecordValue | undefined): boolean {
  return value == null || String(value).trim() === "";
}

function formatValue(value: RecordValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function findOption(field: FieldSchema, name: string): SelectOption | undefined {
  return field.options?.find((option) => option.name === name || option.id === name);
}

function makePill(label: string, colorName?: string): HTMLElement {
  const colors = resolveOptionColor(colorName);
  const pill = document.createElement("span");
  pill.textContent = label;
  pill.style.cssText = [
    "display: inline-flex",
    "align-items: center",
    "max-width: 100%",
    `border: 1px solid ${colors.border}`,
    `background: ${colors.bg}`,
    `color: ${colors.text}`,
    "border-radius: 999px",
    "font-size: 11px",
    "font-weight: 600",
    "line-height: 1",
    "padding: 3px 7px",
    "overflow: hidden",
    "text-overflow: ellipsis",
    "white-space: nowrap"
  ].join(";");
  return pill;
}

function resolveOptionColor(colorName?: string): {
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  const colors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    gray: { bg: "#ece7dd", border: "#d4ccc0", text: "#5d574f", dot: "var(--ink-4)" },
    red: { bg: "#fdecea", border: "#efb7af", text: "#8f352b", dot: "#8f352b" },
    orange: { bg: "#fff0db", border: "#eac08a", text: "#7a4b13", dot: "#7a4b13" },
    yellow: { bg: "#fff8cc", border: "#e1cf69", text: "#6a5800", dot: "#6a5800" },
    green: { bg: "#e9f6eb", border: "#a9d4b0", text: "#28623a", dot: "#28623a" },
    blue: { bg: "#e9f2ff", border: "#adc8ee", text: "#2d5f9a", dot: "#2d5f9a" },
    purple: { bg: "#f2ecfb", border: "#c8b5e7", text: "#5f3d86", dot: "#5f3d86" },
    pink: { bg: "#fdeef6", border: "#e7b3ce", text: "#84375c", dot: "#84375c" }
  };
  return colors[colorName || "gray"] ?? colors.gray;
}

// ── Inline styles (no external CSS — keeps the plugin self-contained) ─

const shellCss = [
  "display: flex",
  "flex-direction: column",
  "min-height: 0",
  "height: 100%",
  "background: var(--paper)"
].join(";");

const groupBarCss = [
  "display: flex",
  "align-items: center",
  "gap: 10px",
  "padding: 14px 24px 4px",
  "font-size: 12px",
  "color: var(--ink-3)"
].join(";");

const groupLabelCss = [
  "font-size: 11px",
  "font-weight: 700",
  "letter-spacing: 0.06em",
  "text-transform: uppercase",
  "color: var(--ink-4)"
].join(";");

const groupPillCss = [
  "display: inline-flex",
  "align-items: center",
  "min-height: 24px",
  "border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--rule))",
  "border-radius: 999px",
  "background: var(--accent-soft)",
  "color: var(--accent)",
  "font-weight: 600",
  "padding: 3px 9px"
].join(";");

const boardCss = [
  "display: flex",
  "gap: 28px",
  "align-items: flex-start",
  "flex: 1 1 0",
  "padding: 18px 24px 40px",
  "overflow-x: auto",
  "overflow-y: hidden",
  "min-height: 360px"
].join(";");

const columnCss = [
  "width: 260px",
  "min-width: 260px",
  "display: flex",
  "flex-direction: column",
  "max-height: 100%",
  "border-radius: var(--r-3)",
  "transition: outline-color 0.1s, background 0.1s"
].join(";");

const columnHeaderCss = [
  "display: flex",
  "align-items: center",
  "gap: 8px",
  "padding: 10px 0 12px",
  "font-weight: 700",
  "color: var(--ink-1)"
].join(";");

const columnNameCss = [
  "min-width: 0",
  "overflow: hidden",
  "text-overflow: ellipsis",
  "white-space: nowrap",
  "font-size: 11px",
  "letter-spacing: 0.08em",
  "text-transform: uppercase"
].join(";");

const columnCountCss = [
  "font-family: var(--font-mono, ui-monospace, monospace)",
  "font-size: 11px",
  "color: var(--ink-4)"
].join(";");

const columnBodyCss = [
  "display: flex",
  "flex: 1 1 auto",
  "min-height: 120px",
  "overflow-y: auto",
  "border-top: 1px solid var(--rule)",
  "flex-direction: column",
  "gap: 0"
].join(";");

const cardCss = [
  "background: var(--paper)",
  "border: 0",
  "border-bottom: 1px solid var(--rule)",
  "border-radius: 0",
  "padding: 12px 2px",
  "cursor: grab",
  "user-select: none",
  "font-size: 13px",
  "color: var(--ink-1)"
].join(";");

const cardTitleCss = [
  "font-weight: 600",
  "line-height: 1.35",
  "color: var(--ink-1)"
].join(";");

const cardMetaCss = [
  "display: flex",
  "flex-wrap: wrap",
  "gap: 5px",
  "margin-top: 8px"
].join(";");

const cardLineCss = [
  "display: block",
  "width: 100%",
  "overflow: hidden",
  "text-overflow: ellipsis",
  "white-space: nowrap",
  "font-family: var(--font-mono, ui-monospace, monospace)",
  "font-size: 11px",
  "color: var(--ink-3)"
].join(";");

const addCardCss = [
  "align-self: stretch",
  "border: 0",
  "border-bottom: 1px solid transparent",
  "border-radius: 0",
  "background: transparent",
  "color: var(--ink-4)",
  "font-size: 13px",
  "padding: 10px 2px",
  "text-align: left",
  "cursor: pointer"
].join(";");

// ── Plugin entry point ────────────────────────────────────────────

/** Install the Kanban view provider against a PluginContext.
 *  When the loader exists, the loader will instantiate a Plugin
 *  class; for now we expose this function so the renderer bootstrap
 *  can wire it up directly. */
export function installKanbanView(ctx: PluginContext): Disposable {
  return ctx.views.register(kanbanProvider);
}
