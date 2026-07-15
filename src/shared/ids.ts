export function createId(prefix: string): string {
  let random = "";
  do {
    random = Math.random().toString(36).slice(2, 10);
  } while (random.startsWith(prefix));
  return `${prefix}_${random}`;
}

export function slugifyId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

/**
 * Filename slug: keeps Unicode (Chinese, etc.), only strips characters that
 * are unsafe on common filesystems. Returns "untitled" if the input would
 * produce an empty slug.
 */
export function slugifyTitle(value: string, maxLength = 64): string {
  const cleaned = value
    .trim()
    // Filesystem-unsafe across macOS / Linux / Windows + NUL.
    .replace(/[\\/:*?"<>|\x00]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return cleaned || "untitled";
}

export function randomSuffix(length = 4): string {
  return Math.random().toString(36).slice(2, 2 + length);
}
