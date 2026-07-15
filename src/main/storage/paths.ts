import { join, resolve } from "node:path";
import { DATABASE_STATS_DATABASE_ID, ENTITIES_DATABASE_ID, isSystemDatabaseId, PAGES_DATABASE_ID, WORKSPACES_DATABASE_ID } from "../../shared/constants.js";
import type { ID } from "../../shared/types.js";
import { databaseFolderName, databaseStableFolderId, pageMarkdownFileName } from "../../shared/workspace-paths.js";
import { fileService } from "../services/file-service.js";

export class WorkspacePaths {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  manifest(): string {
    return join(this.root, "lotion.json");
  }

  pagesDir(): string {
    return join(this.root, "pages");
  }

  databasesDir(): string {
    return join(this.root, "databases");
  }

  userDatabasesDir(): string {
    return join(this.databasesDir(), "user");
  }

  systemDatabasesDir(): string {
    return join(this.databasesDir(), "system");
  }

  page(id: ID): string {
    return this.rowPage(PAGES_DATABASE_ID, pageMarkdownFileName(id));
  }

  databaseDir(id: ID, name?: string): string {
    const normalizedBaseDir = isSystemDatabaseId(id) ? this.systemDatabasesDir() : this.userDatabasesDir();
    const existing = resolveDatabaseFolder(normalizedBaseDir, id);
    if (existing) return join(normalizedBaseDir, existing);
    return join(normalizedBaseDir, databaseFolderName(id, name ?? defaultDatabaseName(id)));
  }

  schema(id: ID, name?: string): string {
    return join(this.databaseDir(id, name), "schema.json");
  }

  data(id: ID, name?: string): string {
    return join(this.databaseDir(id, name), "data.csv");
  }

  viewsDir(id: ID, name?: string): string {
    return join(this.databaseDir(id, name), "views");
  }

  view(databaseId: ID, viewId: ID, databaseName?: string): string {
    return join(this.viewsDir(databaseId, databaseName), `${viewId}.json`);
  }

  rowPagesDir(databaseId: ID, databaseName?: string): string {
    return join(this.databaseDir(databaseId, databaseName), "pages");
  }

  rowPage(databaseId: ID, fileName: string, databaseName?: string): string {
    return join(this.rowPagesDir(databaseId, databaseName), fileName);
  }

  templatesDir(databaseId: ID, databaseName?: string): string {
    return join(this.databaseDir(databaseId, databaseName), "templates");
  }

  templateData(databaseId: ID, databaseName?: string): string {
    return join(this.templatesDir(databaseId, databaseName), "data.csv");
  }

  templatePagesDir(databaseId: ID, databaseName?: string): string {
    return join(this.templatesDir(databaseId, databaseName), "pages");
  }

  templatePage(databaseId: ID, fileName: string, databaseName?: string): string {
    return join(this.templatePagesDir(databaseId, databaseName), fileName);
  }
}

function resolveDatabaseFolder(baseDir: string, id: ID): string | undefined {
  const stableId = databaseStableFolderId(id);
  if (!fileService.exists(baseDir)) return undefined;
  for (const entry of fileService.readDirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === stableId || entry.name.endsWith(`--${stableId}`)) return entry.name;
  }
  return undefined;
}

function defaultDatabaseName(id: ID): string | undefined {
  if (id === PAGES_DATABASE_ID) return "pages";
  if (id === WORKSPACES_DATABASE_ID) return "workspaces";
  if (id === DATABASE_STATS_DATABASE_ID) return "database_stats";
  if (id === ENTITIES_DATABASE_ID) return "entities";
  return undefined;
}
