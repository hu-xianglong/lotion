export function databaseRowLink(databaseId: string, rowId: string): string {
  return `lotion://database/${encodeURIComponent(databaseId)}/row/${encodeURIComponent(rowId)}`;
}

export function parseDatabaseRowLink(value: string): { databaseId: string; rowId: string } | null {
  const match = value.match(/^lotion:\/\/database\/([^/?#]+)\/row\/([^/?#]+)$/);
  if (!match) return null;
  try { return { databaseId: decodeURIComponent(match[1]), rowId: decodeURIComponent(match[2]) }; } catch { return null; }
}
