export const WORKSPACE_VERSION = 1;
export const DEFAULT_VIEW_ID = "view_default";
export const DATABASE_STATS_DATABASE_ID = "database_stats";
export const ENTITIES_DATABASE_ID = "entities";
export const PAGES_DATABASE_ID = "pages";
export const WORKSPACES_DATABASE_ID = "workspaces";

export const SYSTEM_DATABASE_IDS = [
  DATABASE_STATS_DATABASE_ID,
  ENTITIES_DATABASE_ID,
  PAGES_DATABASE_ID,
  WORKSPACES_DATABASE_ID
] as const;

export function isSystemDatabaseId(id: string): boolean {
  return (SYSTEM_DATABASE_IDS as readonly string[]).includes(id);
}
