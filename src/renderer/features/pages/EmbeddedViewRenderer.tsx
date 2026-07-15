import { memo, useCallback, useEffect, useState } from "react";
import { useDatabaseCache } from "../../context/database-cache";
import { useLotionActions } from "../../context/lotion-actions";
import { perfLog } from "../../lib/perf-log";
import { DatabaseTable } from "../databases/DatabaseTable";

interface EmbeddedViewRendererProps {
  databaseId: string;
  viewId: string;
}

export const EmbeddedViewRenderer = memo(function EmbeddedViewRenderer({ databaseId, viewId }: EmbeddedViewRendererProps) {
  const actions = useLotionActions();
  const cache = useDatabaseCache();
  const bundle = cache.getBundle(databaseId);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!databaseId || bundle) return;
    const start = performance.now();
    perfLog("embeddedView.load.start", { databaseId, viewId });
    cache.loadBundle(databaseId)
      .then((loaded) => {
        perfLog("embeddedView.load.done", {
          databaseId,
          viewId,
          ms: Number((performance.now() - start).toFixed(1)),
          records: loaded.records.length,
          fields: loaded.schema.fields.length
        });
      })
      .catch(() => setError("Could not load embedded view."));
  }, [databaseId, bundle, cache]);

  const refresh = useCallback(async () => {
    if (!databaseId) return;
    const start = performance.now();
    setRefreshing(true);
    setError("");
    cache.invalidate(databaseId);
    try {
      const loaded = await cache.loadBundle(databaseId);
      perfLog("embeddedView.refresh.done", {
        databaseId,
        viewId,
        ms: Number((performance.now() - start).toFixed(1)),
        records: loaded.records.length,
        fields: loaded.schema.fields.length
      });
    } catch {
      setError("Could not refresh embedded view.");
    } finally {
      setRefreshing(false);
    }
  }, [cache, databaseId, viewId]);

  if (error) return <div className="embedded-error">{error}</div>;
  if (!bundle) {
    perfLog("embeddedView.render.loading", { databaseId, viewId });
    return <div className="embedded-view">Loading view...</div>;
  }

  const view = bundle.views.find((item) => item.id === viewId) || bundle.views[0];
  if (!view) return <div className="embedded-error">Could not load embedded view.</div>;
  perfLog("embeddedView.render.table", {
    databaseId,
    viewId: view?.id,
    records: bundle.records.length,
    fields: bundle.schema.fields.length
  });

  return (
    <div className="embedded-view">
      <DatabaseTable
        bundle={bundle}
        view={view}
        embedded
        embeddedTitle={bundle.schema.name}
        embeddedSubtitle={`${view.name} · ${view.type}`}
        onOpenEmbedded={() => actions.selectDatabase(databaseId)}
        onRefreshEmbedded={refresh}
        embeddedRefreshing={refreshing}
      />
    </div>
  );
});
