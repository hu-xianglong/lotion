export function notionShortIdFromHash(value: string | undefined): string {
  const hash = String(value ?? "").replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hash) ? `${hash.slice(0, 4)}${hash.slice(-4)}` : "";
}

export function notionShortIdFromHref(value: string): string {
  const decoded = safeDecodeURIComponent(value).toLowerCase();
  const match = /(?:^|[^0-9a-f])([0-9a-f]{4})-([0-9a-f]{4})(?=(?:_all)?\.(?:csv|html|md)(?:$|[?#]))/i.exec(decoded);
  return match ? `${match[1]}${match[2]}`.toLowerCase() : "";
}

export function notionFullIdFromHref(value: string): string {
  const decoded = safeDecodeURIComponent(value).toLowerCase();
  const match = /(?:^|[^0-9a-f])([0-9a-f]{32})(?=(?:_all)?\.(?:csv|html|md)(?:$|[?#]))/i.exec(decoded);
  return match?.[1]?.toLowerCase() ?? "";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
