import type { Disposable, ProviderRegistry } from "../plugin-api.js";

/**
 * Backing implementation for every `ProviderRegistry<T>` in the
 * plugin-api. One instance per provider category (fields, views,
 * blocks, sync, …) — they all share this class.
 *
 * Beyond what `ProviderRegistry` defines, this also emits change
 * events so dependent UI (e.g. the "add field" dropdown, the "add
 * view" picker) can re-render when plugins register / unregister.
 *
 * Not thread-safe; safe for Electron's single-renderer / single-main
 * usage. If multi-window plugins ever land we'll need to think
 * harder about replication.
 */
export class Registry<T extends { type: string }> implements ProviderRegistry<T> {
  private readonly providers = new Map<string, T>();
  private readonly changeListeners = new Set<(change: RegistryChange<T>) => void>();

  /** Human-readable name of this registry, used in error messages
   *  ("field-type", "database-view", etc.). */
  constructor(readonly kind: string) {}

  register(provider: T): Disposable {
    if (this.providers.has(provider.type)) {
      throw new Error(
        `${this.kind} provider already registered: ${provider.type}. ` +
        `Did two plugins register the same type, or is the same plugin double-registering?`
      );
    }
    this.providers.set(provider.type, provider);
    this.notify({ kind: "added", type: provider.type, provider });

    return {
      dispose: () => {
        const removed = this.providers.delete(provider.type);
        if (removed) this.notify({ kind: "removed", type: provider.type, provider });
      }
    };
  }

  get(type: string): T | undefined {
    return this.providers.get(type);
  }

  list(): T[] {
    return Array.from(this.providers.values());
  }

  /** Subscribe to register / unregister events. The change handler
   *  fires synchronously inside `register` / `Disposable.dispose`. */
  onChange(handler: (change: RegistryChange<T>) => void): Disposable {
    this.changeListeners.add(handler);
    return {
      dispose: () => {
        this.changeListeners.delete(handler);
      }
    };
  }

  private notify(change: RegistryChange<T>): void {
    for (const handler of this.changeListeners) {
      try {
        handler(change);
      } catch (error) {
        // Bad handler shouldn't take the rest down.
        console.error(`[Registry:${this.kind}] change listener threw`, error);
      }
    }
  }
}

export type RegistryChange<T> =
  | { kind: "added"; type: string; provider: T }
  | { kind: "removed"; type: string; provider: T };
