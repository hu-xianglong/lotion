import { createHash } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import {
  attachmentCategoryForExtension,
  attachmentCategoryForFilename,
  isImageAttachmentName,
  lotionFileUrl,
  safeAttachmentStem,
  type AttachmentCategory,
  type AttachmentRef,
  workspaceAttachmentPath,
  type ImportedAttachment
} from "../../shared/attachments.js";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";

const CONTENT_SHA_LENGTH = 24;
const ATTACHMENT_CATEGORIES: AttachmentCategory[] = [
  "images",
  "documents",
  "audio",
  "video",
  "archives",
  "web",
  "data",
  "misc"
];

export class AttachmentService {
  constructor(private readonly workspace: WorkspaceService) {}

  async list(): Promise<AttachmentRef[]> {
    const root = join(this.workspace.requirePaths().root, "attachments");
    if (!fileService.exists(root)) return [];
    const refs: AttachmentRef[] = [];
    for (const category of ATTACHMENT_CATEGORIES) {
      const dir = join(root, category);
      if (!fileService.exists(dir)) continue;
      for (const entry of await fileService.readDir(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        refs.push(this.refForPath(["attachments", category, entry.name].join("/")));
      }
    }
    return refs.sort((left, right) => left.path.localeCompare(right.path));
  }

  async get(sha: string): Promise<Uint8Array> {
    const targetPath = await this.findBySha(sha);
    return new Uint8Array(await fileService.readBuffer(targetPath));
  }

  async add(data: Uint8Array, ext: string): Promise<AttachmentRef> {
    const buffer = Buffer.from(data);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, CONTENT_SHA_LENGTH);
    const normalizedExt = normalizeExtension(ext);
    const fileName = `${hash}${normalizedExt}`;
    const relPath = workspaceAttachmentPath(fileName);
    const targetPath = join(this.workspace.requirePaths().root, relPath);
    if (!fileService.exists(targetPath)) {
      await fileService.writeBuffer(targetPath, buffer);
    }
    return this.refForPath(relPath);
  }

  async importFiles(sourcePaths: string[]): Promise<ImportedAttachment[]> {
    const results: ImportedAttachment[] = [];
    for (const rawPath of sourcePaths) {
      const sourcePath = resolve(rawPath);
      const info = await fileService.stat(sourcePath);
      if (!info.isFile()) continue;
      results.push(await this.importFile(sourcePath));
    }
    return results;
  }

  private async importFile(sourcePath: string): Promise<ImportedAttachment> {
    const data = await fileService.readBuffer(sourcePath);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, CONTENT_SHA_LENGTH);
    const ext = extname(sourcePath).toLowerCase();
    const fileName = `${hash}-${safeAttachmentStem(sourcePath)}${ext}`;
    const relPath = workspaceAttachmentPath(fileName);
    const targetPath = join(this.workspace.requirePaths().root, relPath);
    if (!fileService.exists(targetPath) && resolve(sourcePath) !== resolve(targetPath)) {
      await fileService.copy(sourcePath, targetPath);
    }
    return {
      originalName: sourcePath.split(/[\\/]/).pop() || fileName,
      path: relPath,
      category: attachmentCategoryForFilename(fileName),
      isImage: isImageAttachmentName(fileName)
    };
  }

  private refForPath(relPath: string): AttachmentRef {
    const fileName = basename(relPath);
    const ext = extname(fileName).replace(/^\./, "").toLowerCase();
    return {
      sha: attachmentSha(fileName),
      ext,
      path: relPath,
      url: lotionFileUrl(relPath)
    };
  }

  private async findBySha(sha: string): Promise<string> {
    const normalized = normalizeSha(sha);
    const root = join(this.workspace.requirePaths().root, "attachments");
    for (const category of ATTACHMENT_CATEGORIES) {
      const dir = join(root, category);
      if (!fileService.exists(dir)) continue;
      for (const entry of await fileService.readDir(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const candidateSha = attachmentSha(entry.name);
        if (candidateSha === normalized || candidateSha.startsWith(normalized)) {
          return join(dir, entry.name);
        }
      }
    }
    throw new Error(`Attachment not found: ${sha}`);
  }
}

function attachmentSha(fileName: string): string {
  const match = fileName.match(/^([a-f0-9]{16,64})(?:[.-]|$)/i);
  if (match) return match[1].toLowerCase();
  return fileName.slice(0, Math.max(0, fileName.length - extname(fileName).length));
}

function normalizeSha(sha: string): string {
  const normalized = sha.trim().toLowerCase();
  if (!/^[a-f0-9]{8,64}$/.test(normalized)) {
    throw new Error(`Invalid attachment sha: ${sha}`);
  }
  return normalized;
}

function normalizeExtension(ext: string): string {
  const raw = ext.trim().toLowerCase().split(/[\\/]/).pop() ?? "";
  const candidate = raw.startsWith(".") ? raw : `.${raw}`;
  if (/^\.[a-z0-9][a-z0-9+_-]{0,15}$/.test(candidate)) return candidate;
  return ".bin";
}
