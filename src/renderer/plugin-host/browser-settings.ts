import type { PluginSettings } from "../../shared/plugin-api.js";

export class BrowserPluginSettings implements PluginSettings {
  private readonly storageKey: string;
  private cache: Record<string, unknown>;

  constructor(pluginId: string) {
    this.storageKey = `lotion.plugin.${pluginId}.settings`;
    this.cache = this.load();
  }

  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
      return this.cache[key] as T;
    }
    return defaultValue;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.cache = { ...this.cache, [key]: value };
    this.save();
  }

  async delete(key: string): Promise<void> {
    const next = { ...this.cache };
    delete next[key];
    this.cache = next;
    this.save();
  }

  all(): Record<string, unknown> {
    return { ...this.cache };
  }

  private load(): Record<string, unknown> {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private save(): void {
    window.localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
  }
}
