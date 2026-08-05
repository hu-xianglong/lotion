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
    const next = { ...this.cache, [key]: value };
    this.cache = this.save(next);
  }

  async delete(key: string): Promise<void> {
    const next = { ...this.cache };
    delete next[key];
    this.cache = this.save(next);
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

  private save(next: Record<string, unknown>): Record<string, unknown> {
    if (typeof next.toJSON === "function") {
      throw new TypeError('Plugin setting key "toJSON" cannot contain a function.');
    }
    const serialized = JSON.stringify(next);
    if (serialized === undefined) {
      throw new TypeError("Plugin settings must be JSON-serializable.");
    }
    window.localStorage.setItem(this.storageKey, serialized);
    return JSON.parse(serialized) as Record<string, unknown>;
  }
}
