import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Disposable, PluginContext, PluginManifest } from "../../shared/plugin-api.js";
import type { PageMeta } from "../../shared/types.js";
import { PAGES_DATABASE_ID } from "../../shared/constants.js";
import { NotionAuditPanel } from "./NotionAuditPanel.js";
import { NotionImportPanel } from "./NotionImportDialog.js";

export const manifest: PluginManifest = {
  id: "notion-import",
  name: "Notion Import",
  version: "0.0.1",
  description: "Import and audit Notion HTML exports into Lotion workspaces.",
  permissions: ["workspace.read", "workspace.write", "vault.fs"]
};

export function installNotionImport(ctx: PluginContext): Disposable {
  const disposables: Disposable[] = [
    ctx.settingsTabs.register({
      id: "notion-import.settings",
      title: "Notion Import",
      render: (el) => renderNotionImportSettings(el)
    }),
    ctx.commands.register({
      id: "notion-import.open-settings",
      title: "Open Notion Import",
      category: "Import",
      run: () => {
        void openNotionImportModal(ctx);
      }
    })
  ];
  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    }
  };
}

function openNotionImportModal(ctx: PluginContext): Promise<unknown | null> {
  return ctx.ui.modal({
    title: "Import from Notion",
    width: 760,
    render: (el, resolve) => {
      const root = createRoot(el);
      root.render(<NotionImportPanel onClose={() => resolve(null)} />);
      return {
        dispose: () => {
          window.setTimeout(() => root.unmount(), 0);
        }
      };
    }
  });
}

type NotionImportRootEntry = {
  disposeTimer: number | undefined;
  root: Root;
  version: number;
};

const notionImportRoots = new WeakMap<HTMLElement, NotionImportRootEntry>();

function renderNotionImportSettings(el: HTMLElement): Disposable {
  const entry = rootEntryFor(el);
  entry.version += 1;
  if (entry.disposeTimer !== undefined) {
    window.clearTimeout(entry.disposeTimer);
    entry.disposeTimer = undefined;
  }
  const renderVersion = entry.version;
  entry.root.render(<NotionImportSettings />);
  return {
    dispose: () => {
      const current = notionImportRoots.get(el);
      if (!current || current.version !== renderVersion || current.disposeTimer !== undefined) return;
      current.disposeTimer = window.setTimeout(() => {
        const latest = notionImportRoots.get(el);
        if (!latest || latest.version !== renderVersion) return;
        latest.root.unmount();
        notionImportRoots.delete(el);
      }, 0);
    }
  };
}

function rootEntryFor(el: HTMLElement): NotionImportRootEntry {
  const existing = notionImportRoots.get(el);
  if (existing) return existing;
  const entry: NotionImportRootEntry = {
    disposeTimer: undefined,
    root: createRoot(el),
    version: 0
  };
  notionImportRoots.set(el, entry);
  return entry;
}

export function NotionImportSettings({ initialLatestReport }: { initialLatestReport?: PageMeta } = {}) {
  const [latestReport, setLatestReport] = useState<PageMeta | undefined>(initialLatestReport);

  useEffect(() => {
    let cancelled = false;
    window.lotion.databases.get(PAGES_DATABASE_ID)
      .then((bundle) => {
        if (cancelled) return;
        const pages = bundle.records.map((record) => ({
          id: String(record.id ?? ""),
          title: String(record.title ?? "").trim() || "Untitled",
          created_time: String(record.created_time ?? ""),
          updated_time: String(record.updated_time ?? "")
        }));
        setLatestReport(findLatestImportReport(pages));
      })
      .catch((error) => {
        console.error("[lotion] failed to load import report from pages database:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="plugin-import-report-link">
        <div>
          <h2>Latest import report</h2>
          <p>{latestReport ? latestReport.title : "No import report in this workspace yet."}</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={!latestReport}
          onClick={() => {
            if (!latestReport) return;
            window.dispatchEvent(new CustomEvent("lotion:open-entity", {
              detail: {
                kind: "page",
                entityId: latestReport.id,
                titleSnapshot: latestReport.title
              }
            }));
          }}
        >
          Open report
        </button>
      </div>
      <NotionAuditPanel />
      <NotionImportPanel embedded />
    </>
  );
}

function findLatestImportReport(pages: PageMeta[]): PageMeta | undefined {
  return [...pages]
    .filter((page) => page.title.startsWith("Import report "))
    .sort((a, b) => {
      const byCreated = Date.parse(b.created_time) - Date.parse(a.created_time);
      if (Number.isFinite(byCreated) && byCreated !== 0) return byCreated;
      return b.title.localeCompare(a.title);
    })[0];
}
