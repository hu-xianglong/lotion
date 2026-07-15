import type { PluginSettings } from "../plugin-api.js";

/**
 * In-memory PluginSettings. Real persistence to
 * `~/.lotion/plugins/<id>/settings.json` lands with the loader
 * (task #76). Used now so PluginContextImpl can be constructed
 * before that work happens — built-in plugins that don't need
 * persistence (e.g. field-types-default) work just fine against
 * this.
 */
export class InMemoryPluginSettings implements PluginSettings {
  private readonly store = new Map<string, unknown>();

  get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) return this.store.get(key) as T;
    return defaultValue;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  all(): Record<string, unknown> {
    return Object.fromEntries(this.store);
  }
}
