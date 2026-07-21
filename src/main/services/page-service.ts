import { join } from "node:path";
import type { CreatePageInput, PageDocument, PageMeta, UpdatePageInput } from "../../shared/types.js";
import { createId } from "../../shared/ids.js";
import { readMarkdownBody, writeMarkdownBody } from "../storage/markdown-file.js";
import { defaultPageRecordInput, pageBodyPath, PagesDatabaseService, titleFromPageFileName } from "./pages-database-service.js";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";

export class PageService {
  private readonly pageRecords: PagesDatabaseService;
  private readonly updateQueues = new Map<string, Promise<void>>();

  constructor(private readonly workspace: WorkspaceService) {
    this.pageRecords = new PagesDatabaseService(workspace);
  }

  async list(): Promise<PageMeta[]> {
    const manifest = await this.workspace.getManifest();
    await this.pageRecords.ensure();
    const known = new Map((await this.pageRecords.listMetas()).map((meta) => [meta.id, meta]));
    const pages: PageMeta[] = [];

    for (const id of manifest.pages) {
      let meta = known.get(id);
      if (!meta) {
        meta = await this.createFallbackMeta(id);
        await this.pageRecords.upsert(defaultPageRecordInput(meta));
      }
      pages.push(meta);
    }

    return pages;
  }

  async create(input: CreatePageInput): Promise<PageDocument> {
    const title = input.title.trim() || "Untitled";
    const id = createId("pg");
    const now = new Date().toISOString();
    const parentKind = input.parentId ? input.parentKind ?? "page" : undefined;
    const parentPath = input.parentId && parentKind === "page"
      ? await this.pathForParentPage(input.parentId)
      : [];
    const path = normalizePath(input.path).length > 0
      ? normalizePath(input.path)
      : [...parentPath, title];
    const page: PageDocument = {
      meta: {
        id,
        title,
        created_time: now,
        updated_time: now,
        path,
        ...(input.parentId ? { parentId: input.parentId, parentKind } : {})
      },
      markdown: ""
    };

    const paths = this.workspace.requirePaths();
    await writeMarkdownBody(join(paths.root, pageBodyPath(id, title)), page.markdown);
    await this.pageRecords.upsert({ ...defaultPageRecordInput(page.meta), bodyPath: pageBodyPath(id, title) });
    const manifest = await this.workspace.getManifest();
    await this.workspace.saveManifest({
      ...manifest,
      pages: [...manifest.pages, id],
      activePageId: id
    });
    return page;
  }

  async get(id: string): Promise<PageDocument> {
    const startedAt = performance.now();
    const metaStartedAt = performance.now();
    const meta = await this.getOrCreateMeta(id);
    const metaMs = elapsedMs(metaStartedAt);
    const bodyStartedAt = performance.now();
    const markdown = await this.readBody(id, meta);
    const bodyMs = elapsedMs(bodyStartedAt);
    openLog("page.get", {
      id,
      title: meta.title,
      metaMs,
      bodyMs,
      markdownBytes: Buffer.byteLength(markdown, "utf8"),
      totalMs: elapsedMs(startedAt)
    });
    return { meta, markdown };
  }

  async bodyPath(id: string): Promise<string> {
    const meta = await this.getOrCreateMeta(id);
    const bodyPath = await this.pageRecords.getBodyPath(id);
    return bodyPath || pageBodyPath(id, meta.title);
  }

  async update(id: string, input: UpdatePageInput): Promise<PageDocument> {
    const previous = this.updateQueues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.updateUnlocked(id, input));
    const marker = next.then(() => undefined, () => undefined);
    this.updateQueues.set(id, marker);
    marker.finally(() => {
      if (this.updateQueues.get(id) === marker) this.updateQueues.delete(id);
    }).catch(() => undefined);
    return next;
  }

  private async updateUnlocked(id: string, input: UpdatePageInput): Promise<PageDocument> {
    const page = await this.get(id);
    const meta = { ...page.meta, updated_time: new Date().toISOString() };
    // Partial metadata updates: any field omitted from `input` is
    // left as-is. Empty string/array clears optional properties.
    if (input.tags !== undefined) {
      if (input.tags.length === 0) delete meta.tags;
      else meta.tags = input.tags;
    }
    if (input.date !== undefined) {
      if (input.date === "") delete meta.date;
      else meta.date = input.date;
    }
    if (input.url !== undefined) {
      if (input.url === "") delete meta.url;
      else meta.url = input.url;
    }
    if (input.path !== undefined) {
      const path = input.path.map((part) => part.trim()).filter(Boolean);
      if (path.length === 0) delete meta.path;
      else meta.path = path;
    }
    if (input.parentId !== undefined) {
      if (input.parentId === null || input.parentId === "") {
        delete meta.parentId;
        delete meta.parentKind;
      } else {
        meta.parentId = input.parentId;
        meta.parentKind = input.parentKind ?? "page";
      }
    } else if (input.parentKind !== undefined) {
      if (input.parentKind === null) delete meta.parentKind;
      else if (meta.parentId) meta.parentKind = input.parentKind;
    }
    if (input.coverOffset !== undefined) {
      meta.coverOffset = clampPct(input.coverOffset);
    }
    if (input.fullWidth !== undefined) {
      if (input.fullWidth) meta.fullWidth = true;
      else delete meta.fullWidth;
    }
    if (input.smallText !== undefined) {
      if (input.smallText) meta.smallText = true;
      else delete meta.smallText;
    }
    const next: PageDocument = {
      meta,
      markdown: input.markdown ?? page.markdown
    };
    if (input.markdown !== undefined) {
      await writeMarkdownBody(join(this.workspace.requirePaths().root, pageBodyPath(id, next.meta.title)), next.markdown);
      await this.pageRecords.upsert({ ...defaultPageRecordInput(next.meta), bodyPath: pageBodyPath(id, next.meta.title) });
    } else {
      await this.pageRecords.upsert(defaultPageRecordInput(next.meta));
    }
    return next;
  }

  async rename(id: string, title: string): Promise<PageDocument> {
    const page = await this.get(id);
    const nextTitle = title.trim() || "Untitled";
    const markdown = page.markdown.startsWith("# ")
      ? page.markdown.replace(/^# .*/, `# ${nextTitle}`)
      : `# ${nextTitle}\n\n${page.markdown}`;
    const next: PageDocument = {
      meta: {
        ...page.meta,
        title: nextTitle,
        updated_time: new Date().toISOString()
      },
      markdown
    };
    await this.renameBodyFile(id, page.meta.title, nextTitle);
    await this.pageRecords.upsert({ ...defaultPageRecordInput(next.meta), bodyPath: pageBodyPath(id, nextTitle) });
    await writeMarkdownBody(join(this.workspace.requirePaths().root, pageBodyPath(id, nextTitle)), next.markdown);
    return next;
  }

  async delete(id: string): Promise<void> {
    await this.pageRecords.ensure();
    const meta = await this.pageRecords.getMeta(id);
    const bodyPath = await this.pageRecords.getBodyPath(id);
    await this.pageRecords.delete(id);

    const manifest = await this.workspace.getManifest();
    const nextManifest = {
      ...manifest,
      pages: manifest.pages.filter((pageId) => pageId !== id)
    };
    if (nextManifest.activePageId === id) delete nextManifest.activePageId;
    if (nextManifest.pages.length !== manifest.pages.length || manifest.activePageId === id) {
      await this.workspace.saveManifest(nextManifest);
    }

    const paths = this.workspace.requirePaths();
    const candidates = [
      bodyPath ? join(paths.root, bodyPath) : undefined,
      meta ? join(paths.root, pageBodyPath(id, meta.title)) : undefined,
      join(paths.root, pageBodyPath(id))
    ].filter((candidate): candidate is string => Boolean(candidate));
    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        await fileService.remove(candidate, { force: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  async setIcon(id: string, icon?: string): Promise<PageMeta> {
    const meta = await this.getOrCreateMeta(id);
    const next = { ...meta, updated_time: new Date().toISOString() };
    if (icon) next.icon = icon;
    else delete next.icon;
    return this.pageRecords.upsert(defaultPageRecordInput(next));
  }

  async setCover(id: string, cover?: string): Promise<PageMeta> {
    const meta = await this.getOrCreateMeta(id);
    const next = { ...meta, updated_time: new Date().toISOString() };
    if (cover) next.cover = cover;
    else delete next.cover;
    return this.pageRecords.upsert(defaultPageRecordInput(next));
  }

  async setCoverOffset(id: string, offset: number): Promise<PageMeta> {
    const meta = await this.getOrCreateMeta(id);
    const next = {
      ...meta,
      coverOffset: clampPct(offset),
      updated_time: new Date().toISOString()
    };
    return this.pageRecords.upsert(defaultPageRecordInput(next));
  }

  private async getOrCreateMeta(id: string): Promise<PageMeta> {
    await this.pageRecords.ensure();
    const existing = await this.pageRecords.getMeta(id);
    if (existing) return existing;
    const meta = await this.createFallbackMeta(id);
    return this.pageRecords.upsert(defaultPageRecordInput(meta));
  }

  private async pathForParentPage(id: string): Promise<string[]> {
    const parent = await this.getOrCreateMeta(id);
    const path = normalizePath(parent.path);
    return path.length > 0 ? path : [parent.title];
  }

  private async createFallbackMeta(id: string): Promise<PageMeta> {
    const bodyPath = await this.pageRecords.getBodyPath(id);
    const markdown = await this.readBody(id);
    const now = new Date().toISOString();
    return {
      id,
      title: firstMarkdownHeading(markdown) || titleFromBodyPath(bodyPath, id) || "Untitled",
      created_time: now,
      updated_time: now
    };
  }

  private async readBody(id: string, meta?: PageMeta): Promise<string> {
    const paths = this.workspace.requirePaths();
    const bodyPath = await this.pageRecords.getBodyPath(id);
    const candidates = [
      bodyPath ? join(paths.root, bodyPath) : undefined,
      meta ? join(paths.root, pageBodyPath(id, meta.title)) : undefined,
      join(paths.root, pageBodyPath(id)),
      join(paths.pagesDir(), `page_${id}.md`),
      join(paths.root, "system", "pages", "db_pages", `page_${id}.md`)
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      const readStartedAt = performance.now();
      try {
        const markdown = await readMarkdownBody(candidate);
        openLog("page.readMarkdown", {
          id,
          title: meta?.title,
          path: workspaceRelativePath(paths.root, candidate),
          bytes: Buffer.byteLength(markdown, "utf8"),
          ms: elapsedMs(readStartedAt)
        });
        if (candidate !== candidates[0] && meta) {
          await writeMarkdownBody(join(paths.root, pageBodyPath(id, meta.title)), markdown);
        }
        return markdown;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return "";
  }

  private async renameBodyFile(id: string, oldTitle: string, nextTitle: string): Promise<void> {
    const paths = this.workspace.requirePaths();
    const oldPath = join(paths.root, pageBodyPath(id, oldTitle));
    const nextPath = join(paths.root, pageBodyPath(id, nextTitle));
    if (oldPath === nextPath) return;
    try {
      await fileService.rename(oldPath, nextPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function firstMarkdownHeading(markdown: string): string | undefined {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match?.[1]?.trim() || undefined;
}

function normalizePath(path: string[] | undefined): string[] {
  return (path ?? []).map((part) => part.trim()).filter(Boolean);
}

function titleFromBodyPath(bodyPath: string | undefined, id: string): string | undefined {
  const fileName = bodyPath?.split(/[\\/]/).pop();
  return fileName ? titleFromPageFileName(fileName, id) : undefined;
}

function openLog(label: string, detail: Record<string, unknown>) {
  console.log(`[lotion open] ${label}`, detail);
}

function elapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(1));
}

function workspaceRelativePath(root: string, path: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1).split("\\").join("/") : path;
}
