export type DatabaseViewErrorCode = "VIEW_NOT_FOUND" | "VIEW_NAME_CONFLICT" | "LAST_VIEW" | "INVALID_VIEW_ORDER";

export class DatabaseViewError extends DatabaseMutationError<DatabaseViewErrorCode> {
  constructor(public readonly code: DatabaseViewErrorCode, message: string) {
    super(code, message);
    this.name = "DatabaseViewError";
  }
}
import { DatabaseMutationError } from "./database-mutation-errors.js";
