import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  AddFieldInput,
  CopyFieldToSystemTimeInput,
  CopyFieldToSystemTimeResult,
  CreateDatabaseInput,
  CreateViewInput,
  DatabaseBundle,
  DeleteDatabaseTemplateInput,
  DeleteRowInput,
  DeleteViewInput,
  DuplicateViewInput,
  RowPageDocument,
  SaveDatabaseTemplateInput,
  SetDefaultViewInput,
  SetRowPageFullWidthInput,
  SetRowPageSmallTextInput,
  UpdateCellInput,
  UpdateDatabaseMetaInput,
  UpdateFieldInput,
  UpdateRowPageInput,
  UpdateViewInput
} from "../../shared/types";
import { perfLog } from "../lib/perf-log";

/**
 * Shared `DatabaseBundle` store. Every surface in the renderer (the
 * standalone database view, the row-page editor, every embedded view in
 * a Markdown page) reads its bundle from here. Every mutating IPC also
 * goes through here, so when one surface edits a cell, every other
 * surface that's currently rendering the same database re-renders with
 * the new bundle.
 *
 * Without this, each surface holds its own `useState<DatabaseBundle>`
 * copy and they drift apart between mutations. See docs/lessons.md and
 * docs/roadmap.md for the longer story.
 */
export interface DatabaseCache {
  getBundle(id: string): DatabaseBundle | undefined;
  /** Returns from cache if present; otherwise issues one IPC and shares
   *  the in-flight promise so concurrent callers don't fire duplicate
   *  requests. */
  loadBundle(id: string): Promise<DatabaseBundle>;
  invalidate(id: string): void;

  createDatabase(input: CreateDatabaseInput): Promise<DatabaseBundle>;
  updateMeta(input: UpdateDatabaseMetaInput): Promise<DatabaseBundle>;
  updateCell(input: UpdateCellInput): Promise<DatabaseBundle>;
  updateField(input: UpdateFieldInput): Promise<DatabaseBundle>;
  copyFieldToSystemTime(input: CopyFieldToSystemTimeInput): Promise<CopyFieldToSystemTimeResult>;
  addField(databaseId: string, input: AddFieldInput): Promise<DatabaseBundle>;
  addRow(databaseId: string, templateId?: string): Promise<DatabaseBundle>;
  deleteRow(input: DeleteRowInput): Promise<DatabaseBundle>;
  saveTemplate(input: SaveDatabaseTemplateInput): Promise<DatabaseBundle>;
  deleteTemplate(input: DeleteDatabaseTemplateInput): Promise<DatabaseBundle>;
  createView(input: CreateViewInput): Promise<DatabaseBundle>;
  duplicateView(input: DuplicateViewInput): Promise<DatabaseBundle>;
  updateView(input: UpdateViewInput): Promise<DatabaseBundle>;
  deleteView(input: DeleteViewInput): Promise<DatabaseBundle>;
  setDefaultView(input: SetDefaultViewInput): Promise<DatabaseBundle>;

  openRowPage(databaseId: string, rowId: string): Promise<RowPageDocument>;
  openRowPageByFile(databaseId: string, fileName: string): Promise<RowPageDocument>;
  updateRowPage(input: UpdateRowPageInput): Promise<RowPageDocument>;
  setRowPageFullWidth(input: SetRowPageFullWidthInput): Promise<RowPageDocument>;
  setRowPageSmallText(input: SetRowPageSmallTextInput): Promise<RowPageDocument>;
}

const Ctx = createContext<DatabaseCache | null>(null);

export function DatabaseCacheProvider({ children }: { children: ReactNode }) {
  const [bundles, setBundles] = useState<Map<string, DatabaseBundle>>(new Map());
  const bundlesRef = useRef(bundles);
  const inFlightRef = useRef<Map<string, Promise<DatabaseBundle>>>(new Map());

  const write = useCallback((id: string, bundle: DatabaseBundle) => {
    setBundles((current) => {
      const next = new Map(current).set(id, bundle);
      bundlesRef.current = next;
      return next;
    });
  }, []);

  const invalidate = useCallback((id: string) => {
    setBundles((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      bundlesRef.current = next;
      return next;
    });
    inFlightRef.current.delete(id);
  }, []);

  const loadBundle = useCallback(async (id: string): Promise<DatabaseBundle> => {
    const cached = bundlesRef.current.get(id);
    if (cached) {
      perfLog("cache.loadBundle.cacheHit", {
        databaseId: id,
        records: cached.records.length,
        fields: cached.schema.fields.length,
        views: cached.views.length
      });
      return cached;
    }

    const inFlight = inFlightRef.current.get(id);
    if (inFlight) {
      perfLog("cache.loadBundle.inFlight", { databaseId: id });
      return inFlight;
    }

    const start = performance.now();
    const promise = window.lotion.databases
      .get(id)
      .then((bundle) => {
        perfLog("cache.loadBundle.ipc", {
          databaseId: id,
          ms: Number((performance.now() - start).toFixed(1)),
          records: bundle.records.length,
          fields: bundle.schema.fields.length,
          views: bundle.views.length
        });
        write(id, bundle);
        return bundle;
      })
      .finally(() => {
        inFlightRef.current.delete(id);
      });
    inFlightRef.current.set(id, promise);
    return promise;
  }, [bundles, write]);

  // ── mutating IPCs ─────────────────────────────────────────────────────
  // Each wraps the existing preload call and writes the returned bundle
  // back into the shared map. All subscribers re-render automatically.

  const createDatabase = useCallback(async (input: CreateDatabaseInput) => {
    const next = await window.lotion.databases.create(input);
    write(next.schema.id, next);
    return next;
  }, [write]);

  const updateCell = useCallback(async (input: UpdateCellInput) => {
    const next = await window.lotion.databases.updateCell(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const updateMeta = useCallback(async (input: UpdateDatabaseMetaInput) => {
    const next = await window.lotion.databases.updateMeta(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const updateField = useCallback(async (input: UpdateFieldInput) => {
    const next = await window.lotion.databases.updateField(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const copyFieldToSystemTime = useCallback(async (input: CopyFieldToSystemTimeInput) => {
    const result = await window.lotion.databases.copyFieldToSystemTime(input);
    write(input.databaseId, result.bundle);
    return result;
  }, [write]);

  const addField = useCallback(async (databaseId: string, input: AddFieldInput) => {
    const next = await window.lotion.databases.addField(databaseId, input);
    write(databaseId, next);
    return next;
  }, [write]);

  const addRow = useCallback(async (databaseId: string, templateId?: string) => {
    const next = await window.lotion.databases.addRow(databaseId, templateId);
    write(databaseId, next);
    return next;
  }, [write]);

  const deleteRow = useCallback(async (input: DeleteRowInput) => {
    const next = await window.lotion.databases.deleteRow(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const saveTemplate = useCallback(async (input: SaveDatabaseTemplateInput) => {
    const next = await window.lotion.databases.saveTemplate(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const deleteTemplate = useCallback(async (input: DeleteDatabaseTemplateInput) => {
    const next = await window.lotion.databases.deleteTemplate(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const createView = useCallback(async (input: CreateViewInput) => {
    const next = await window.lotion.views.create(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const duplicateView = useCallback(async (input: DuplicateViewInput) => {
    const next = await window.lotion.views.duplicate(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const updateView = useCallback(async (input: UpdateViewInput) => {
    const next = await window.lotion.views.update(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const deleteView = useCallback(async (input: DeleteViewInput) => {
    const next = await window.lotion.views.delete(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  const setDefaultView = useCallback(async (input: SetDefaultViewInput) => {
    const next = await window.lotion.views.setDefault(input);
    write(input.databaseId, next);
    return next;
  }, [write]);

  // ── row pages ─────────────────────────────────────────────────────────
  // The row-page IPCs return RowPageDocument which carries the *current*
  // schema + the *current* record. We splice those into the cached bundle
  // so e.g. opening a row page (which may add the hidden page_file field
  // or assign the row's filename for the first time) immediately
  // propagates everywhere else.

  const mergeRowIntoBundle = useCallback((doc: RowPageDocument) => {
    setBundles((current) => {
      const existing = current.get(doc.databaseId);
      if (!existing) return current;
      const records = existing.records.map((record) =>
        record.id === doc.rowId ? doc.record : record
      );
      // If the row didn't exist in the cached bundle (unlikely but
      // possible if the bundle is stale), append it so we don't lose it.
      const found = existing.records.some((record) => record.id === doc.rowId);
      const finalRecords = found ? records : [...records, doc.record];
      const next = new Map(current);
      next.set(doc.databaseId, { ...existing, schema: doc.schema, records: finalRecords });
      bundlesRef.current = next;
      return next;
    });
  }, []);

  const openRowPage = useCallback(async (databaseId: string, rowId: string) => {
    // Ensure the bundle is in cache first — App.tsx renders the row
    // page using `activeRowBundle = cache.getBundle(databaseId)`, and
    // mergeRowIntoBundle is a no-op when the bundle is absent.
    if (!bundlesRef.current.has(databaseId)) await loadBundle(databaseId);
    const doc = await window.lotion.rowPages.open(databaseId, rowId);
    mergeRowIntoBundle(doc);
    return doc;
  }, [loadBundle, mergeRowIntoBundle]);

  const openRowPageByFile = useCallback(async (databaseId: string, fileName: string) => {
    if (!bundlesRef.current.has(databaseId)) await loadBundle(databaseId);
    const doc = await window.lotion.rowPages.openByFilename(databaseId, fileName);
    mergeRowIntoBundle(doc);
    return doc;
  }, [loadBundle, mergeRowIntoBundle]);

  const updateRowPage = useCallback(async (input: UpdateRowPageInput) => {
    // Only the Markdown body changes; nothing in the CSV moves. No cache
    // bookkeeping needed.
    const start = performance.now();
    const doc = await window.lotion.rowPages.update(input);
    perfLog("rowPage.update", {
      databaseId: input.databaseId,
      rowId: input.rowId,
      ms: Number((performance.now() - start).toFixed(1)),
      markdownLength: input.markdown.length
    });
    return doc;
  }, []);

  const setRowPageFullWidth = useCallback(async (input: SetRowPageFullWidthInput) => {
    const doc = await window.lotion.rowPages.setFullWidth(input);
    mergeRowIntoBundle(doc);
    return doc;
  }, [mergeRowIntoBundle]);

  const setRowPageSmallText = useCallback(async (input: SetRowPageSmallTextInput) => {
    const doc = await window.lotion.rowPages.setSmallText(input);
    mergeRowIntoBundle(doc);
    return doc;
  }, [mergeRowIntoBundle]);

  const value = useMemo<DatabaseCache>(() => ({
    getBundle: (id) => bundles.get(id),
    loadBundle,
    invalidate,
    createDatabase,
    updateMeta,
    updateCell,
    updateField,
    copyFieldToSystemTime,
    addField,
    addRow,
    deleteRow,
    saveTemplate,
    deleteTemplate,
    createView,
    duplicateView,
    updateView,
    deleteView,
    setDefaultView,
    openRowPage,
    openRowPageByFile,
    updateRowPage,
    setRowPageFullWidth,
    setRowPageSmallText
  }), [bundles, loadBundle, invalidate, createDatabase, updateMeta, updateCell, updateField, copyFieldToSystemTime, addField, addRow, deleteRow, saveTemplate, deleteTemplate, createView, duplicateView, updateView, deleteView, setDefaultView, openRowPage, openRowPageByFile, updateRowPage, setRowPageFullWidth, setRowPageSmallText]);

  return <DatabaseCacheValueProvider value={value}>{children}</DatabaseCacheValueProvider>;
}

export function DatabaseCacheValueProvider({
  value,
  children
}: {
  value: DatabaseCache;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDatabaseCache(): DatabaseCache {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useDatabaseCache must be used inside a DatabaseCacheProvider");
  }
  return ctx;
}
