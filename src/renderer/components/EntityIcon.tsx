import { DatabaseIcon, FolderClosedIcon, NoteIcon, PageFileIcon } from "./Icons";
import { emojiIconText, isEmojiIcon } from "../../shared/entity-icons";

export type EntityKind = "page" | "database" | "row_page" | "workspace";

interface EntityIconProps {
  /** Workspace-relative image path, `emoji:<glyph>`, or undefined. */
  icon?: string;
  /** Drives the fallback SVG (page page-shape vs database grid). */
  kind: EntityKind;
  /** Optional size override (px). Defaults to 14 — sidebar size. */
  size?: number;
  /** Optional extra class for layout (rounded corner, etc.). */
  className?: string;
}

/**
 * Renders the user's chosen icon for a page / database / row, or a
 * neutral default SVG when none is set. Custom icons load through
 * the `lotion-file://` protocol so the renderer doesn't need to know
 * the absolute path on disk.
 */
export function EntityIcon({ icon, kind, size = 14, className }: EntityIconProps) {
  const dim = `${size}px`;
  if (icon) {
    if (isEmojiIcon(icon)) {
      return (
        <span
          className={className ? `entity-icon entity-icon-emoji ${className}` : "entity-icon entity-icon-emoji"}
          style={{ width: dim, height: dim, fontSize: dim }}
        >
          {emojiIconText(icon)}
        </span>
      );
    }
    return (
      <span
        className={className ? `entity-icon entity-icon-image ${className}` : "entity-icon entity-icon-image"}
        style={{ width: dim, height: dim }}
      >
        <img src={iconUrl(icon)} alt="" />
      </span>
    );
  }
  return (
    <span
      className={className ? `entity-icon entity-icon-default ${className}` : "entity-icon entity-icon-default"}
      style={{ width: dim, height: dim }}
    >
      {kind === "database" ? <DatabaseIcon /> : kind === "row_page" ? <NoteIcon /> : kind === "workspace" ? <FolderClosedIcon /> : <PageFileIcon />}
    </span>
  );
}

export function iconUrl(workspaceRelativePath: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(workspaceRelativePath)) return workspaceRelativePath;
  // Custom protocol — registered in main/protocols.ts.
  // Convert workspace-relative path → URL pathname.
  const encoded = workspaceRelativePath
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `lotion-file:///${encoded}`;
}
