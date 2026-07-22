import type { DatabaseBundle } from "../../shared/types";
import { resolveRowIcon } from "../../shared/row-icons";

export interface RowPageDisplay {
  title: string;
  icon?: string;
}

export function rowPageDisplay(
  bundle: DatabaseBundle | undefined,
  rowId: string,
  storedTitle: string | undefined,
  storedIcon: string | undefined,
  fallbackTitle: string
): RowPageDisplay {
  const record = bundle?.records.find((item) => item.id === rowId);
  const title = String(record?.title ?? storedTitle ?? "").trim() || fallbackTitle;
  const icon = resolveRowIcon(record, bundle?.schema.icon, storedIcon);
  return { title, icon };
}
