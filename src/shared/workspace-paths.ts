import { slugifyTitle } from "./ids.js";

const FILE_ID_SEPARATOR = "--";

export function databaseStableFolderId(id: string): string {
  return id.startsWith("db_") ? id : `db_${id}`;
}

export function databaseFolderName(id: string, title?: string): string {
  const stableId = databaseStableFolderId(id);
  const slug = title ? slugifyTitle(title, 72) : "";
  return slug && slug !== stableId
    ? `${slug}${FILE_ID_SEPARATOR}${stableId}`
    : stableId;
}

export function idFromDatabaseFolderName(folderName: string, system = false): string {
  const separatorIndex = folderName.lastIndexOf(FILE_ID_SEPARATOR);
  const stableId = separatorIndex >= 0 ? folderName.slice(separatorIndex + FILE_ID_SEPARATOR.length) : folderName;
  return system && stableId.startsWith("db_") ? stableId.slice("db_".length) : stableId;
}

export function pageMarkdownFileName(id: string, title?: string): string {
  const slug = title ? slugifyTitle(title, 72) : "";
  return slug && slug !== id
    ? `${slug}${FILE_ID_SEPARATOR}${id}.md`
    : `${id}.md`;
}

export function idFromMarkdownFileName(fileName: string): string {
  const stem = fileName.replace(/\.md$/i, "");
  const separatorIndex = stem.lastIndexOf(FILE_ID_SEPARATOR);
  return separatorIndex >= 0 ? stem.slice(separatorIndex + FILE_ID_SEPARATOR.length) : stem;
}

export function databaseWorkspacePath(id: string, system = false): string {
  const prefix = system ? "databases/system" : "databases/user";
  return `${prefix}/${databaseFolderName(id)}`;
}

export function databaseWorkspacePathWithName(id: string, system = false, title?: string): string {
  const prefix = system ? "databases/system" : "databases/user";
  return `${prefix}/${databaseFolderName(id, title)}`;
}

export function rowPagesWorkspacePath(databaseId: string, system = false, databaseTitle?: string): string {
  return `${databaseWorkspacePathWithName(databaseId, system, databaseTitle)}/pages`;
}

export function templatePagesWorkspacePath(databaseId: string, system = false, databaseTitle?: string): string {
  return `${databaseWorkspacePathWithName(databaseId, system, databaseTitle)}/templates/pages`;
}
