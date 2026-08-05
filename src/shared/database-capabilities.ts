import { isSystemDatabaseId } from "./constants.js";
import type { DatabaseSchema } from "./types.js";

export interface DatabaseCapabilities {
  locked: boolean;
  canManageSchema: boolean;
  canManageTemplates: boolean;
  canManageDeletedItems: boolean;
  canLock: boolean;
  structuralDisabledReason?: string;
}

export function databaseCapabilities(schema: Pick<DatabaseSchema, "id" | "locked">): DatabaseCapabilities {
  const system = isSystemDatabaseId(schema.id);
  const locked = Boolean(schema.locked);
  const structuralDisabledReason = system
    ? "System database structure is managed by Lotion."
    : locked
      ? "Database is locked. Unlock it from Database settings to make structural changes."
    : undefined;
  return {
    locked,
    canManageSchema: !system && !locked,
    canManageTemplates: !system && !locked,
    canManageDeletedItems: !system && !locked,
    canLock: !system,
    structuralDisabledReason
  };
}
