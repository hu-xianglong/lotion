import type { LotionActions } from "../../context/lotion-actions";
import { databaseFolderName, idFromDatabaseFolderName, idFromMarkdownFileName } from "../../../shared/workspace-paths";

export type WorkspaceLinkKind = "internal-md" | "internal-db" | "external" | "ignore";

/**
 * Buckets a markdown/property URL into one of four handling lanes:
 *
 *   internal-md  -> workspace `.md` we can route through Lotion navigation
 *   internal-db  -> `databases/user|system/<title>--db_<id>` database paths
 *   external     -> protocol URLs or workspace files/attachments opened by the OS
 *   ignore       -> empty links and in-page anchors
 */
export function classifyLink(url: string): WorkspaceLinkKind {
  if (!url || url.startsWith("#")) return "ignore";
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return "external";
  const path = workspacePathFromUrl(url);
  if (pageIdFromWorkspacePath(path)) return "internal-md";
  if (/^databases\/(?:user|system)\/[^/]+\/pages\/[^/]+\.md$/.test(path)) return "internal-md";
  if (/^databases\/(?:user|system)\/[^/]+\/?$/.test(path)) return "internal-db";
  return "external";
}

export function tryNavigateWorkspaceLink(url: string, actions: Pick<LotionActions, "selectPage" | "openRowPageByFile" | "selectDatabase">): boolean {
  const path = workspacePathFromUrl(url);

  const pageId = pageIdFromWorkspacePath(path);
  if (pageId) {
    actions.selectPage(pageId);
    return true;
  }

  const rowPage = path.match(/^databases\/(user|system)\/([^/]+)\/pages\/([^/]+\.md)$/);
  if (rowPage) {
    actions.openRowPageByFile(idFromDatabaseFolderName(rowPage[2], rowPage[1] === "system"), rowPage[3]);
    return true;
  }

  const databaseId = databaseIdFromWorkspaceLink(path);
  if (databaseId) {
    actions.selectDatabase(databaseId);
    return true;
  }

  return false;
}

export function databaseIdFromWorkspaceLink(url: string): string | null {
  const path = workspacePathFromUrl(url);
  const match = path.match(/^databases\/(user|system)\/([^/]+)\/?$/);
  if (!match) return null;
  return idFromDatabaseFolderName(match[2], match[1] === "system");
}

export function pageIdFromWorkspacePath(pathOrUrl: string): string | null {
  const path = workspacePathFromUrl(pathOrUrl);
  const pagesFolder = escapeRegExp(databaseFolderName("pages", "pages"));
  const match = new RegExp(`^databases/system/${pagesFolder}/pages/([^/]+)\\.md$`).exec(path);
  return match ? idFromMarkdownFileName(`${match[1]}.md`) : null;
}

function workspacePathFromUrl(url: string): string {
  let path = url.trim().replace(/^\.\//, "");
  const hashIndex = path.indexOf("#");
  if (hashIndex >= 0) path = path.slice(0, hashIndex);
  return path;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
