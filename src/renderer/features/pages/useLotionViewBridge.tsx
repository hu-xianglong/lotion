import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LotionActionsProvider, useLotionActions } from "../../context/lotion-actions";
import { DatabaseCacheValueProvider, useDatabaseCache } from "../../context/database-cache";
import { I18nValueProvider, useI18n } from "../../lib/i18n";
import { perfLog } from "../../lib/perf-log";
import { EmbeddedViewRenderer } from "./EmbeddedViewRenderer";
import {
  LotionViewRegistry,
  nextLotionViewStableId,
  type LotionViewSpec
} from "./markdown-decorations";

export interface LotionViewBridge {
  registry: LotionViewRegistry;
  preloadHostRef: RefObject<HTMLDivElement | null>;
  sync: (markdown: string, warmupDelayMs?: number) => void;
  scheduleSync: (markdown: string, delayMs?: number) => void;
  cancelScheduled: () => void;
  dispose: () => void;
}

export function useLotionViewBridge(): LotionViewBridge {
  const actions = useLotionActions();
  const cache = useDatabaseCache();
  const i18n = useI18n();
  const registryRef = useRef(new LotionViewRegistry());
  const preloadHostRef = useRef<HTMLDivElement | null>(null);
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const contextRef = useRef({ actions, cache, i18n });
  const cacheRef = useRef(cache);
  const warmupTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const embedsRef = useRef<LotionViewSpec[]>([]);
  const signatureRef = useRef("");
  contextRef.current = { actions, cache, i18n };
  cacheRef.current = cache;

  useEffect(() => {
    const registry = registryRef.current;
    registry.setRenderer({
      render(mount) {
        const contexts = contextRef.current;
        let root = rootsRef.current.get(mount.id);
        if (!root) {
          root = createRoot(mount.container);
          rootsRef.current.set(mount.id, root);
        }
        root.render(
          <I18nValueProvider value={contexts.i18n}>
            <DatabaseCacheValueProvider value={contexts.cache}>
              <LotionActionsProvider value={contexts.actions}>
                <EmbeddedViewRenderer databaseId={mount.databaseId} viewId={mount.viewId} />
              </LotionActionsProvider>
            </DatabaseCacheValueProvider>
          </I18nValueProvider>
        );
      },
      unmount(mount) {
        const root = rootsRef.current.get(mount.id);
        if (!root) return;
        rootsRef.current.delete(mount.id);
        window.setTimeout(() => {
          root.unmount();
        }, 0);
      }
    });
    return () => {
      registry.dispose();
      registry.setRenderer(null);
      rootsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    registryRef.current.renderAll();
  }, [actions, cache, i18n]);

  useEffect(() => {
    registryRef.current.setParkingContainer(preloadHostRef.current);
    return () => registryRef.current.setParkingContainer(null);
  }, []);

  const cancelWarmup = useCallback(() => {
    if (warmupTimerRef.current === null) return;
    window.clearTimeout(warmupTimerRef.current);
    perfLog("editor.lotionViewWarmup.cancel", {
      queuedEmbeds: embedsRef.current.length
    });
    warmupTimerRef.current = null;
  }, []);

  const cancelScheduled = useCallback(() => {
    if (syncTimerRef.current === null) return;
    window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
  }, []);

  const scheduleWarmup = useCallback((embeds: LotionViewSpec[], initialDelayMs = 180) => {
    cancelWarmup();
    if (embeds.length === 0) return;

    let index = 0;
    perfLog("editor.lotionViewWarmup.schedule", {
      embeds: embeds.length,
      initialDelayMs
    });
    const warmNext = () => {
      const embed = embeds[index];
      if (!embed) {
        warmupTimerRef.current = null;
        perfLog("editor.lotionViewWarmup.done", { embeds: embeds.length });
        return;
      }
      const start = performance.now();
      registryRef.current.preload(embed);
      perfLog("editor.lotionViewWarmup.step", {
        index,
        total: embeds.length,
        databaseId: embed.databaseId,
        viewId: embed.viewId,
        ms: Number((performance.now() - start).toFixed(2))
      });
      index += 1;
      warmupTimerRef.current = window.setTimeout(warmNext, 90);
    };
    warmupTimerRef.current = window.setTimeout(warmNext, initialDelayMs);
  }, [cancelWarmup]);

  const sync = useCallback((markdown: string, warmupDelayMs = 180) => {
    const embeds = extractLotionViewEmbeds(markdown);
    const signature = embeds.map((embed) => `${embed.stableId}:${embed.databaseId}:${embed.viewId}`).join("\n");
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;
    embedsRef.current = embeds;
    perfLog("editor.lotionViewEmbeds", {
      embeds: embeds.length,
      databaseIds: uniqueDatabaseIds(embeds),
      markdownLength: markdown.length
    });
    registryRef.current.syncExpected(embeds);
    scheduleWarmup(embeds, warmupDelayMs);
    const databaseIds = uniqueDatabaseIds(embeds);
    if (databaseIds.length === 0) return;

    window.setTimeout(() => {
      for (const databaseId of databaseIds) {
        void cacheRef.current.loadBundle(databaseId).catch(() => undefined);
      }
    }, 20);
  }, [scheduleWarmup]);

  const scheduleSync = useCallback((markdown: string, delayMs = 350) => {
    cancelScheduled();
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      sync(markdown, 900);
    }, delayMs);
  }, [cancelScheduled, sync]);

  const dispose = useCallback(() => {
    cancelScheduled();
    cancelWarmup();
    registryRef.current.dispose();
  }, [cancelScheduled, cancelWarmup]);

  return useMemo(() => ({
    registry: registryRef.current,
    preloadHostRef,
    sync,
    scheduleSync,
    cancelScheduled,
    dispose
  }), [cancelScheduled, dispose, scheduleSync, sync]);
}

function extractLotionViewEmbeds(markdown: string): LotionViewSpec[] {
  const embeds: LotionViewSpec[] = [];
  const counters = new Map<string, number>();
  const fenceRe = /```lotion-view\s*\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fenceRe)) {
    const body = match[1] || "";
    const databaseMatch = /^database:\s*(\S+)\s*$/m.exec(body);
    const databaseId = databaseMatch?.[1]?.trim();
    if (!databaseId) continue;
    const viewMatch = /^view:\s*(\S+)\s*$/m.exec(body);
    const viewId = viewMatch?.[1]?.trim() ?? "";
    embeds.push({
      databaseId,
      viewId,
      stableId: nextLotionViewStableId(databaseId, viewId, counters)
    });
  }
  return embeds;
}

function uniqueDatabaseIds(embeds: LotionViewSpec[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const embed of embeds) {
    if (seen.has(embed.databaseId)) continue;
    seen.add(embed.databaseId);
    ids.push(embed.databaseId);
  }
  return ids;
}
