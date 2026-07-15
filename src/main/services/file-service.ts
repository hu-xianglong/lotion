import { createReadStream as fsCreateReadStream, existsSync as fsExistsSync, readdirSync as fsReaddirSync } from "node:fs";
import {
  copyFile as fsCopyFile,
  mkdir as fsMkdir,
  open as fsOpen,
  readFile as fsReadFile,
  readdir as fsReaddir,
  rename as fsRename,
  rm as fsRm,
  stat as fsStat,
  writeFile as fsWriteFile,
  type FileHandle
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Dirent, ReadStream } from "node:fs";

export type FileServiceDirent = Dirent;

type CacheKind = "text" | "buffer";

interface CachedFileBase {
  kind: CacheKind;
  path: string;
  size: number;
  mtimeMs: number;
  bytes: number;
}

interface CachedTextFile extends CachedFileBase {
  kind: "text";
  value: string;
}

interface CachedBufferFile extends CachedFileBase {
  kind: "buffer";
  value: Buffer;
}

type CachedFile = CachedTextFile | CachedBufferFile;

const DEFAULT_MAX_CACHE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_CACHE_ENTRY_BYTES = 128 * 1024 * 1024;

export class FileService {
  private readonly maxCacheBytes = envBytes("LOTION_FILE_CACHE_MAX_MB", DEFAULT_MAX_CACHE_BYTES);
  private readonly maxCacheEntryBytes = envBytes("LOTION_FILE_CACHE_MAX_ENTRY_MB", DEFAULT_MAX_CACHE_ENTRY_BYTES);
  private readonly contentCache = new Map<string, CachedFile>();
  private readonly inflightReads = new Map<string, Promise<string | Buffer>>();
  private cacheBytes = 0;
  private mutationRevision = 0;
  private readonly mutationRevisionsByPath = new Map<string, number>();

  exists(path: string): boolean {
    return fsExistsSync(path);
  }

  readDirSync(path: string, options: { withFileTypes: true }): FileServiceDirent[] {
    return fsReaddirSync(path, options);
  }

  async readDir(path: string): Promise<string[]>;
  async readDir(path: string, options: { withFileTypes: true }): Promise<FileServiceDirent[]>;
  async readDir(path: string, options?: { withFileTypes: true }): Promise<string[] | FileServiceDirent[]> {
    return options ? fsReaddir(path, options) : fsReaddir(path);
  }

  async readText(path: string): Promise<string> {
    const absPath = normalizePath(path);
    const cached = await this.getCached(absPath, "text");
    if (cached) return cached.value;

    const key = cacheKey(absPath, "text");
    const inflight = this.inflightReads.get(key);
    if (inflight) return inflight as Promise<string>;

    const promise = this.readAndCacheText(absPath);
    this.inflightReads.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflightReads.delete(key);
    }
  }

  async readBuffer(path: string): Promise<Buffer> {
    const absPath = normalizePath(path);
    const cached = await this.getCached(absPath, "buffer");
    if (cached) return cached.value;

    const key = cacheKey(absPath, "buffer");
    const inflight = this.inflightReads.get(key);
    if (inflight) return inflight as Promise<Buffer>;

    const promise = this.readAndCacheBuffer(absPath);
    this.inflightReads.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflightReads.delete(key);
    }
  }

  async writeText(path: string, value: string): Promise<void> {
    const absPath = normalizePath(path);
    await this.ensureDir(dirname(absPath));
    await fsWriteFile(absPath, value, "utf8");
    await this.rememberText(absPath, value);
    this.markMutation(absPath);
  }

  async writeBuffer(path: string, value: Buffer | Uint8Array): Promise<void> {
    const absPath = normalizePath(path);
    await this.ensureDir(dirname(absPath));
    await fsWriteFile(absPath, value);
    await this.rememberBuffer(absPath, Buffer.from(value));
    this.markMutation(absPath);
  }

  async writeTextAtomic(path: string, value: string): Promise<void> {
    const absPath = normalizePath(path);
    await this.ensureDir(dirname(absPath));
    const tmpPath = `${absPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await fsWriteFile(tmpPath, value, "utf8");
    await fsRename(tmpPath, absPath);
    this.invalidate(tmpPath);
    await this.rememberText(absPath, value);
    this.markMutation(absPath);
  }

  async ensureDir(path: string): Promise<void> {
    await fsMkdir(path, { recursive: true });
  }

  async copy(sourcePath: string, targetPath: string): Promise<void> {
    const absTarget = normalizePath(targetPath);
    await this.ensureDir(dirname(absTarget));
    await fsCopyFile(sourcePath, absTarget);
    this.invalidate(absTarget);
    this.markMutation(absTarget);
  }

  async rename(sourcePath: string, targetPath: string): Promise<void> {
    const absSource = normalizePath(sourcePath);
    const absTarget = normalizePath(targetPath);
    await this.ensureDir(dirname(absTarget));
    await fsRename(absSource, absTarget);
    this.invalidate(absSource);
    this.invalidate(absTarget);
    this.markMutation(absSource);
    this.markMutation(absTarget);
  }

  async remove(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const absPath = normalizePath(path);
    await fsRm(absPath, options);
    this.invalidate(absPath, Boolean(options?.recursive));
    this.markMutation(absPath);
  }

  async stat(path: string) {
    return fsStat(path);
  }

  async open(path: string, flags: string): Promise<FileHandle> {
    return fsOpen(path, flags);
  }

  createReadStream(path: string): ReadStream {
    return fsCreateReadStream(path);
  }

  clearCache(): void {
    this.contentCache.clear();
    this.cacheBytes = 0;
  }

  cacheStats(): { entries: number; bytes: number; maxBytes: number; maxEntryBytes: number } {
    return {
      entries: this.contentCache.size,
      bytes: this.cacheBytes,
      maxBytes: this.maxCacheBytes,
      maxEntryBytes: this.maxCacheEntryBytes
    };
  }

  /**
   * Monotonic process-local revision for writes routed through the file
   * boundary. Derived indexes can use it as an O(1) freshness check instead
   * of statting every source file on every lookup.
   */
  revision(path?: string): number {
    if (!path) return this.mutationRevision;
    return this.mutationRevisionsByPath.get(normalizePath(path)) ?? 0;
  }

  private async getCached(path: string, kind: "text"): Promise<CachedTextFile | undefined>;
  private async getCached(path: string, kind: "buffer"): Promise<CachedBufferFile | undefined>;
  private async getCached(path: string, kind: CacheKind): Promise<CachedFile | undefined> {
    const key = cacheKey(path, kind);
    const cached = this.contentCache.get(key);
    if (!cached) return undefined;
    let info;
    try {
      info = await fsStat(path);
    } catch (error) {
      this.contentCache.delete(key);
      this.cacheBytes -= cached.bytes;
      throw error;
    }
    if (info.size !== cached.size || info.mtimeMs !== cached.mtimeMs) {
      this.contentCache.delete(key);
      this.cacheBytes -= cached.bytes;
      return undefined;
    }
    this.touch(key, cached);
    return cached;
  }

  private async readAndCacheText(path: string): Promise<string> {
    const value = await fsReadFile(path, "utf8");
    await this.rememberText(path, value);
    return value;
  }

  private async readAndCacheBuffer(path: string): Promise<Buffer> {
    const value = await fsReadFile(path);
    await this.rememberBuffer(path, value);
    return value;
  }

  private async rememberText(path: string, value: string): Promise<void> {
    const bytes = Buffer.byteLength(value, "utf8");
    const info = await fsStat(path);
    this.remember({
      kind: "text",
      path,
      value,
      size: info.size,
      mtimeMs: info.mtimeMs,
      bytes
    });
  }

  private async rememberBuffer(path: string, value: Buffer): Promise<void> {
    const info = await fsStat(path);
    this.remember({
      kind: "buffer",
      path,
      value,
      size: info.size,
      mtimeMs: info.mtimeMs,
      bytes: value.byteLength
    });
  }

  private remember(entry: CachedFile): void {
    const key = cacheKey(entry.path, entry.kind);
    const existing = this.contentCache.get(key);
    if (existing) {
      this.contentCache.delete(key);
      this.cacheBytes -= existing.bytes;
    }
    if (entry.bytes > this.maxCacheEntryBytes || entry.bytes > this.maxCacheBytes) return;
    this.contentCache.set(key, entry);
    this.cacheBytes += entry.bytes;
    this.trimCache();
  }

  private touch(key: string, entry: CachedFile): void {
    this.contentCache.delete(key);
    this.contentCache.set(key, entry);
  }

  private trimCache(): void {
    while (this.cacheBytes > this.maxCacheBytes) {
      const oldest = this.contentCache.entries().next().value as [string, CachedFile] | undefined;
      if (!oldest) break;
      this.contentCache.delete(oldest[0]);
      this.cacheBytes -= oldest[1].bytes;
    }
  }

  private invalidate(path: string, recursive = false): void {
    const absPath = normalizePath(path);
    for (const [key, entry] of this.contentCache) {
      const matches = entry.path === absPath || (recursive && entry.path.startsWith(absPath + sep));
      if (!matches) continue;
      this.contentCache.delete(key);
      this.cacheBytes -= entry.bytes;
    }
  }

  private markMutation(path: string): void {
    this.mutationRevision += 1;
    let current = normalizePath(path);
    while (true) {
      this.mutationRevisionsByPath.set(current, this.mutationRevision);
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
}

function normalizePath(path: string): string {
  return resolve(path);
}

function cacheKey(path: string, kind: CacheKind): string {
  return `${kind}:${path}`;
}

function envBytes(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value * 1024 * 1024);
}

export const fileService = new FileService();
