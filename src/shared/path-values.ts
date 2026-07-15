export function serializePathValue(path: string[] | undefined): string {
  const segments = normalizePathSegments(path);
  return segments.length > 0 ? JSON.stringify(segments) : "";
}

export function parsePathValue(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return normalizePathSegments(parsed);
  } catch {
    /* Legacy path strings are handled below. */
  }
  return raw
    .split(/\s+\/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function displayPathValue(value: unknown): string {
  return parsePathValue(value).join(" / ");
}

function normalizePathSegments(path: unknown[] | undefined): string[] {
  return (path ?? [])
    .map((segment) => String(segment ?? "").trim())
    .filter(Boolean);
}
