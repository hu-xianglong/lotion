import type { DatabaseSchema } from "./types.js";
import { DatabaseMutationError } from "./database-mutation-errors.js";

export const DATABASE_LOCKED_CODE = "DATABASE_LOCKED" as const;

export class DatabaseLockedError extends DatabaseMutationError<typeof DATABASE_LOCKED_CODE> {
  constructor(public readonly databaseId: string) {
    super(DATABASE_LOCKED_CODE, `Database ${databaseId} is locked. Unlock it before changing views, properties, or templates.`);
    this.name = "DatabaseLockedError";
  }
}

export function assertDatabaseUnlocked(schema: Pick<DatabaseSchema, "id" | "locked">): void {
  if (schema.locked) throw new DatabaseLockedError(schema.id);
}
