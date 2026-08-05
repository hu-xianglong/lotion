import type { DatabaseViewType, PageOpenMode } from "./types.js";

const VALID_MODES = new Set<PageOpenMode>(["side_peek", "center_peek", "full_page"]);

export function defaultPageOpenMode(type: DatabaseViewType): PageOpenMode {
  return type === "table" || type === "kanban" ? "side_peek" : "center_peek";
}

export function normalizePageOpenMode(value: unknown, type: DatabaseViewType): PageOpenMode {
  return VALID_MODES.has(value as PageOpenMode) ? value as PageOpenMode : defaultPageOpenMode(type);
}
