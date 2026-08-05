export type DatabaseMutationErrorCode =
  | "DATABASE_CONFLICT"
  | "DATABASE_LOCKED"
  | "DATABASE_NOT_FOUND"
  | "DATABASE_INVALID_DEPENDENCY"
  | "DATABASE_PERSISTENCE_FAILURE";

export class DatabaseMutationError<Code extends string = DatabaseMutationErrorCode> extends Error {
  constructor(public readonly code: Code, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseMutationError";
  }
}

export function databasePersistenceError(databaseId: string, error: unknown): DatabaseMutationError {
  if (error instanceof DatabaseMutationError) return error;
  const cause = error instanceof Error ? error : new Error(String(error));
  return new DatabaseMutationError("DATABASE_PERSISTENCE_FAILURE", `Could not persist database ${databaseId}: ${cause.message}`, { cause });
}
