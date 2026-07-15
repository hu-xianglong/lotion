import electron from "electron";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import { readJsonFile, writeJsonFile } from "../storage/json-file.js";
import type { DatabaseSchema, FieldSchema } from "../../shared/types.js";
import type { DatabaseService } from "./database-service.js";
import type { PageService } from "./page-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";

const { dialog } = electron;

const COVER_FIELD: FieldSchema = {
  id: "cover",
  name: "Cover",
  type: "text",
  system: true,
  hidden: true
};

const COVER_OFFSET_FIELD: FieldSchema = {
  id: "cover_offset",
  name: "Cover offset",
  type: "text",
  system: true,
  hidden: true
};

/** Subfolders of the workspace root where copied images live. */
const ICONS_SUBDIR = join("attachments", "icons");
const COVERS_SUBDIR = join("attachments", "covers");
const SUPPORTED_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

export interface SetIconResult {
  /** Workspace-relative path of the saved icon, or empty string if
   *  the user cancelled the file dialog. */
  iconPath: string;
}

export interface SetCoverResult {
  /** Workspace-relative path of the saved cover, or empty string if
   *  the user cancelled the file dialog. */
  coverPath: string;
}

/**
 * Backs the `icons:*` IPC handlers. Copies a chosen image into a
 * content-addressed slot under `<workspace>/attachments/icons/` and
 * updates the relevant metadata store (system pages DB / schema.json) with the
 * workspace-relative path. Returns empty `iconPath` on dialog
 * cancellation.
 */
export class IconsService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly pages: PageService
  ) {}

  /** Wired post-construction to break the circular import with
   *  DatabaseService (which in turn knows about RowPagesService). */
  private databases!: DatabaseService;
  setDatabaseService(databases: DatabaseService): void {
    this.databases = databases;
  }

  async setForPage(pageId: string): Promise<SetIconResult> {
    const sourcePath = await this.promptForImage();
    if (!sourcePath) return { iconPath: "" };
    const rel = await this.copyIntoWorkspace(sourcePath);
    await this.pages.setIcon(pageId, rel);
    return { iconPath: rel };
  }

  async clearForPage(pageId: string): Promise<void> {
    await this.pages.setIcon(pageId);
  }

  async setForDatabase(databaseId: string): Promise<SetIconResult> {
    const sourcePath = await this.promptForImage();
    if (!sourcePath) return { iconPath: "" };
    const rel = await this.copyIntoWorkspace(sourcePath);
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    schema.icon = rel;
    schema.updated_time = new Date().toISOString();
    await writeJsonFile(paths.schema(databaseId), schema);
    return { iconPath: rel };
  }

  async clearForDatabase(databaseId: string): Promise<void> {
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    if (!schema.icon) return;
    delete schema.icon;
    schema.updated_time = new Date().toISOString();
    await writeJsonFile(paths.schema(databaseId), schema);
  }

  async setForWorkspace(): Promise<SetIconResult> {
    const sourcePath = await this.promptForImage("Choose a workspace icon");
    if (!sourcePath) return { iconPath: "" };
    const rel = await this.copyIntoWorkspace(sourcePath);
    await this.workspace.setWorkspaceIcon(rel);
    return { iconPath: rel };
  }

  async clearForWorkspace(): Promise<void> {
    await this.workspace.clearWorkspaceIcon();
  }

  // ── Covers ──────────────────────────────────────────────────────

  async setCoverForPage(pageId: string): Promise<SetCoverResult> {
    const sourcePath = await this.promptForImage("Choose a cover image");
    if (!sourcePath) return { coverPath: "" };
    const rel = await this.copyIntoWorkspace(sourcePath, COVERS_SUBDIR);
    await this.pages.setCover(pageId, rel);
    return { coverPath: rel };
  }

  async clearCoverForPage(pageId: string): Promise<void> {
    await this.pages.setCover(pageId);
  }

  async setCoverForDatabase(databaseId: string): Promise<SetCoverResult> {
    const sourcePath = await this.promptForImage("Choose a cover image");
    if (!sourcePath) return { coverPath: "" };
    const rel = await this.copyIntoWorkspace(sourcePath, COVERS_SUBDIR);
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    schema.cover = rel;
    schema.updated_time = new Date().toISOString();
    await writeJsonFile(paths.schema(databaseId), schema);
    return { coverPath: rel };
  }

  async clearCoverForDatabase(databaseId: string): Promise<void> {
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    if (!schema.cover) return;
    delete schema.cover;
    schema.updated_time = new Date().toISOString();
    await writeJsonFile(paths.schema(databaseId), schema);
  }

  async setCoverOffsetForDatabase(databaseId: string, offset: number): Promise<void> {
    const paths = this.workspace.requirePaths();
    const schema = await readJsonFile<DatabaseSchema>(paths.schema(databaseId));
    schema.coverOffset = Math.max(0, Math.min(100, offset));
    schema.updated_time = new Date().toISOString();
    await writeJsonFile(paths.schema(databaseId), schema);
  }

  // ── Row covers ─────────────────────────────────────────────────

  async setCoverForRow(databaseId: string, rowId: string): Promise<SetCoverResult> {
    const sourcePath = await this.promptForImage("Choose a cover image");
    if (!sourcePath) return { coverPath: "" };
    const rel = await this.copyIntoWorkspace(sourcePath, COVERS_SUBDIR);
    await this.databases.ensureHiddenField(databaseId, COVER_FIELD);
    await this.databases.setSystemCell(databaseId, rowId, "cover", rel);
    return { coverPath: rel };
  }

  async clearCoverForRow(databaseId: string, rowId: string): Promise<void> {
    await this.databases.setSystemCell(databaseId, rowId, "cover", "");
  }

  async setCoverOffsetForRow(databaseId: string, rowId: string, offset: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, offset));
    await this.databases.ensureHiddenField(databaseId, COVER_OFFSET_FIELD);
    await this.databases.setSystemCell(databaseId, rowId, "cover_offset", String(Math.round(clamped)));
  }

  /** Open a system file picker. Returns the chosen path or null. */
  private async promptForImage(title = "Choose an icon"): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title,
      properties: ["openFile"],
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  /**
   * SHA-256 of the file content + original extension, copied into the
   * given subdir. Content-addressed so re-uploading the same image is
   * a no-op. Returns the workspace-relative path with forward slashes.
   */
  private async copyIntoWorkspace(sourcePath: string, subdir = ICONS_SUBDIR): Promise<string> {
    const ext = extname(sourcePath).toLowerCase();
    if (!SUPPORTED_EXTS.includes(ext)) {
      throw new Error(`Unsupported image format: ${ext}`);
    }
    const data = await fileService.readBuffer(sourcePath);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
    const fileName = `${hash}${ext}`;
    const root = this.workspace.requirePaths().root;
    const targetAbs = join(root, subdir, fileName);
    if (!fileService.exists(targetAbs)) {
      await fileService.copy(sourcePath, targetAbs);
    }
    return [subdir.replace(/\\/g, "/"), fileName].join("/");
  }

}
