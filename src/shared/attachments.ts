export type AttachmentCategory =
  | "images"
  | "documents"
  | "audio"
  | "video"
  | "archives"
  | "web"
  | "data"
  | "misc";

export interface ImportedAttachment {
  originalName: string;
  path: string;
  category: AttachmentCategory;
  isImage: boolean;
}

export interface AttachmentRef {
  /** SHA-256 prefix used in the on-disk filename. */
  sha: string;
  /** Lowercase extension without the leading dot. */
  ext: string;
  /** Workspace-relative attachment path. */
  path: string;
  /** `lotion-file://` URL the renderer can load. */
  url: string;
}

const EXTENSIONS_BY_CATEGORY: Record<AttachmentCategory, Set<string>> = {
  images: new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".heic", ".heif", ".tif", ".tiff"
  ]),
  documents: new Set([
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".txt", ".md", ".rtf", ".pages", ".key", ".numbers"
  ]),
  audio: new Set([".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg", ".opus", ".aiff"]),
  video: new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]),
  archives: new Set([".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz"]),
  web: new Set([".html", ".htm", ".css", ".js", ".mjs"]),
  data: new Set([".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml"]),
  misc: new Set()
};

export function attachmentCategoryForExtension(ext: string): AttachmentCategory {
  const normalized = normalizeExtension(ext);
  for (const [category, exts] of Object.entries(EXTENSIONS_BY_CATEGORY) as Array<[AttachmentCategory, Set<string>]>) {
    if (category !== "misc" && exts.has(normalized)) return category;
  }
  return "misc";
}

export function attachmentCategoryForFilename(name: string): AttachmentCategory {
  return attachmentCategoryForExtension(extensionFromFilename(name));
}

export function workspaceAttachmentPath(fileName: string): string {
  return ["attachments", attachmentCategoryForFilename(fileName), fileName].join("/");
}

export function lotionFileUrl(path: string): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `lotion-file:///${encoded.replace(/^\/+/, "")}`;
}

export function isImageAttachmentName(name: string): boolean {
  return attachmentCategoryForFilename(name) === "images";
}

export function safeAttachmentStem(name: string): string {
  const base = name.split(/[\\/]/).pop() || "attachment";
  const ext = extensionFromFilename(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  return safePathSegment(stem).replace(/^\.+$/, "attachment") || "attachment";
}

function normalizeExtension(ext: string): string {
  const raw = ext.trim().toLowerCase();
  if (!raw) return "";
  return raw.startsWith(".") ? raw : `.${raw}`;
}

function extensionFromFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || "";
  const index = base.lastIndexOf(".");
  if (index <= 0 || index === base.length - 1) return "";
  return base.slice(index).toLowerCase();
}

function safePathSegment(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}
