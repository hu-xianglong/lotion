export interface DatabaseViewLinkTarget {
  databaseId: string;
  viewId: string;
}

export function databaseViewLink(databaseId: string, viewId: string): string {
  return `lotion://database/${encodeURIComponent(databaseId)}?view=${encodeURIComponent(viewId)}`;
}

export function parseDatabaseViewLink(value: string): DatabaseViewLinkTarget | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "lotion:" || url.hostname !== "database") return null;
    const databaseId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const viewId = url.searchParams.get("view")?.trim() ?? "";
    if (!databaseId || !viewId) return null;
    return { databaseId, viewId };
  } catch {
    return null;
  }
}
