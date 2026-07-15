import { dirname, join } from "node:path";
import type { WorkspaceService } from "./workspace-service.js";
import { fileService } from "./file-service.js";

export class PluginStorageService {
  constructor(private readonly workspace: WorkspaceService) {}

  async appendJsonl(pluginId: string, fileName: string, value: unknown): Promise<void> {
    const path = await this.resolvePluginFile(pluginId, fileName);
    const line = `${JSON.stringify(value)}\n`;
    const previous = fileService.exists(path) ? await fileService.readText(path) : "";
    await fileService.writeText(path, previous + line);
  }

  async readJsonl<T = unknown>(pluginId: string, fileName: string, options?: { limit?: number }): Promise<T[]> {
    const path = await this.resolvePluginFile(pluginId, fileName);
    if (!fileService.exists(path)) return [];
    const lines = (await fileService.readText(path))
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const limit = Number(options?.limit);
    const selected = Number.isFinite(limit) && limit > 0 ? lines.slice(-Math.floor(limit)) : lines;
    const values: T[] = [];
    for (const line of selected) {
      try {
        values.push(JSON.parse(line) as T);
      } catch {
        // Corrupt history rows should not prevent the plugin from opening.
      }
    }
    return values;
  }

  async readJson<T = unknown>(pluginId: string, fileName: string): Promise<T | null> {
    const path = await this.resolvePluginFile(pluginId, fileName, ".json");
    if (!fileService.exists(path)) return null;
    return JSON.parse(await fileService.readText(path)) as T;
  }

  async writeJson(pluginId: string, fileName: string, value: unknown): Promise<void> {
    const path = await this.resolvePluginFile(pluginId, fileName, ".json");
    await fileService.writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  async delete(pluginId: string, fileName: string): Promise<void> {
    const jsonPath = await this.resolvePluginFile(pluginId, fileName, ".json");
    const jsonlPath = await this.resolvePluginFile(pluginId, fileName, ".jsonl");
    await fileService.remove(jsonPath, { force: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    await fileService.remove(jsonlPath, { force: true }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
  }

  private async resolvePluginFile(pluginId: string, fileName: string, defaultExt = ".jsonl"): Promise<string> {
    const root = this.workspace.requirePaths().root;
    const path = join(root, ".lotion", "plugins", safeSegment(pluginId), safeFileName(fileName, defaultExt));
    await fileService.ensureDir(dirname(path));
    return path;
  }
}

function safeSegment(value: string): string {
  const safe = value.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return safe || "plugin";
}

function safeFileName(value: string, defaultExt: string): string {
  const safe = safeSegment(value);
  if (safe.endsWith(".jsonl") || safe.endsWith(".json")) return safe;
  return `${safe}${defaultExt}`;
}
