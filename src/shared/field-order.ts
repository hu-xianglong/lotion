import type { DatabaseRecord, ID } from "./types.js";

export interface ContentRichnessOrderOptions {
  pinnedFirst?: readonly ID[];
  pinnedLast?: readonly ID[];
}

export function orderFieldIdsByContentRichness(
  records: readonly DatabaseRecord[],
  fieldIds: readonly ID[],
  options: ContentRichnessOrderOptions = {}
): ID[] {
  const originalIndex = new Map(fieldIds.map((id, index) => [id, index]));
  const pinnedFirst = new Set(options.pinnedFirst ?? []);
  const pinnedLast = new Set(options.pinnedLast ?? []);
  const rowCount = Math.max(1, records.length);
  const averageLength = (fieldId: ID): number => {
    let total = 0;
    for (const record of records) {
      total += String(record[fieldId] ?? "").trim().length;
    }
    return total / rowCount;
  };
  const byOriginalOrder = (a: ID, b: ID): number => (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
  const byRichness = (a: ID, b: ID): number => {
    const richness = averageLength(b) - averageLength(a);
    return richness !== 0 ? richness : byOriginalOrder(a, b);
  };

  const first = fieldIds.filter((id) => pinnedFirst.has(id));
  const last = fieldIds.filter((id) => !pinnedFirst.has(id) && pinnedLast.has(id));
  const middle = fieldIds
    .filter((id) => !pinnedFirst.has(id) && !pinnedLast.has(id))
    .sort(byRichness);
  return [...first, ...middle, ...last];
}
