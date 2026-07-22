import type { DatabaseRecord } from "./types.js";

/**
 * A database row may have its own page icon. When it does not, inherit the
 * database icon for display so row pages stay visually identifiable without
 * duplicating the same icon value into every CSV record.
 */
export function resolveRowIcon(
  record: DatabaseRecord | undefined,
  databaseIcon?: string,
  storedIcon?: string
): string | undefined {
  return firstIconValue(record?.row_icon, storedIcon, databaseIcon);
}

function firstIconValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    const icon = String(value ?? "").trim();
    if (icon) return icon;
  }
  return undefined;
}
