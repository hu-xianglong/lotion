import type { Disposable, EventBus, LotionEventName } from "../plugin-api.js";

type Handler = (data: unknown) => void;

/**
 * In-process pub/sub for host-emitted events.
 *
 * Subscription patterns:
 *   - exact:    `on("page.saved", h)`         → fires only on page.saved
 *   - prefix:   `on("page.*", h)`             → fires on every page.* event
 *   - wildcard: `on("*", h)`                  → fires on every event
 *
 * Handlers run synchronously in emit-order. If a handler throws, it
 * is logged and the rest still fire — a buggy plugin shouldn't take
 * the bus down for everyone.
 *
 * Cross-process delivery (main ↔ renderer) is the loader's
 * responsibility — this class is local to one process.
 */
export class InProcessEventBus implements EventBus {
  /** Exact-event subscribers, keyed by event name. */
  private readonly exact = new Map<string, Set<Handler>>();
  /** Wildcard-prefix subscribers, e.g. `page.*`. The map key is the
   *  prefix without the trailing `*` ("page."). */
  private readonly prefix = new Map<string, Set<Handler>>();
  /** Global wildcard subscribers — `"*"`. */
  private readonly global = new Set<Handler>();

  on<T = unknown>(event: LotionEventName | "*" | string, handler: (data: T) => void): Disposable {
    const h = handler as Handler;

    if (event === "*") {
      this.global.add(h);
      return { dispose: () => this.global.delete(h) };
    }

    if (event.endsWith("*")) {
      const pfx = event.slice(0, -1); // strip trailing "*"
      let set = this.prefix.get(pfx);
      if (!set) {
        set = new Set();
        this.prefix.set(pfx, set);
      }
      set.add(h);
      return {
        dispose: () => {
          const cur = this.prefix.get(pfx);
          if (!cur) return;
          cur.delete(h);
          if (cur.size === 0) this.prefix.delete(pfx);
        }
      };
    }

    let set = this.exact.get(event);
    if (!set) {
      set = new Set();
      this.exact.set(event, set);
    }
    set.add(h);
    return {
      dispose: () => {
        const cur = this.exact.get(event);
        if (!cur) return;
        cur.delete(h);
        if (cur.size === 0) this.exact.delete(event);
      }
    };
  }

  emit<T = unknown>(event: LotionEventName, data?: T): void {
    // Exact handlers.
    const exactSet = this.exact.get(event);
    if (exactSet) {
      for (const h of exactSet) this.safeRun(h, data, event);
    }

    // Prefix handlers — match every prefix that's a strict prefix
    // of `event`. Worst case O(prefix-count) per emit; with our
    // handful of prefixes per running session this is fine.
    for (const [pfx, set] of this.prefix) {
      if (event.startsWith(pfx)) {
        for (const h of set) this.safeRun(h, data, event);
      }
    }

    // Global handlers.
    for (const h of this.global) this.safeRun(h, data, event);
  }

  /** Test helper: how many handlers are currently subscribed? */
  size(): number {
    let n = this.global.size;
    for (const set of this.exact.values()) n += set.size;
    for (const set of this.prefix.values()) n += set.size;
    return n;
  }

  private safeRun(handler: Handler, data: unknown, eventName: string): void {
    try {
      handler(data);
    } catch (error) {
      console.error(`[EventBus] handler for ${eventName} threw`, error);
    }
  }
}
