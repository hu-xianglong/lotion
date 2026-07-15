import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Disposable, PluginContext, PluginManifest } from "../../shared/plugin-api.js";
import type { PageDocument } from "../../shared/types.js";
import type {
  GitHubBackupPreview,
  GitHubBackupSettings,
  GitHubBackupStatus,
  GitHubBackupVersion
} from "../../shared/github-backup.js";
import {
  DEFAULT_GITHUB_BACKUP_SETTINGS,
  createGitHubBackupService,
  normalizeGitHubBackupSettings
} from "./service.js";

const SETTINGS_KEY = "githubBackupSettings";

export const manifest: PluginManifest = {
  id: "github-backup",
  name: "GitHub Backup",
  version: "0.0.1",
  description: "GitHub-backed workspace backup and page history.",
  permissions: ["workspace.read", "workspace.write", "network"]
};

export function installGitHubBackup(ctx: PluginContext): Disposable {
  const disposables: Disposable[] = [
    ctx.settingsTabs.register({
      id: "github-backup.settings",
      title: "GitHub Backup",
      render: (el) => renderGitHubBackupPanel(el, ctx)
    }),
    ctx.sidebar.register({
      id: "github-backup.sidebar",
      title: "GitHub Backup",
      icon: "↗",
      order: 1250,
      onClick: () => void openGitHubBackupModal(ctx)
    }),
    ctx.commands.register({
      id: "github-backup.open",
      title: "Open GitHub Backup",
      category: "Sync",
      run: () => openGitHubBackupModal(ctx)
    })
  ];
  return {
    dispose() {
      for (const disposable of disposables) disposable.dispose();
    }
  };
}

type GitHubBackupRootEntry = {
  disposeTimer: number | undefined;
  root: Root;
  version: number;
};

const githubBackupRoots = new WeakMap<HTMLElement, GitHubBackupRootEntry>();

export function renderGitHubBackupPanel(el: HTMLElement, ctx: PluginContext): Disposable {
  const entry = githubBackupRootEntryFor(el);
  entry.version += 1;
  if (entry.disposeTimer !== undefined) {
    window.clearTimeout(entry.disposeTimer);
    entry.disposeTimer = undefined;
  }
  const renderVersion = entry.version;
  entry.root.render(<GitHubBackupPanel ctx={ctx} />);
  return {
    dispose() {
      const current = githubBackupRoots.get(el);
      if (!current || current.version !== renderVersion || current.disposeTimer !== undefined) return;
      current.disposeTimer = window.setTimeout(() => {
        const latest = githubBackupRoots.get(el);
        if (!latest || latest.version !== renderVersion) return;
        latest.root.unmount();
        githubBackupRoots.delete(el);
      }, 0);
    }
  };
}

function githubBackupRootEntryFor(el: HTMLElement): GitHubBackupRootEntry {
  const existing = githubBackupRoots.get(el);
  if (existing) return existing;
  const entry: GitHubBackupRootEntry = {
    disposeTimer: undefined,
    root: createRoot(el),
    version: 0
  };
  githubBackupRoots.set(el, entry);
  return entry;
}

async function openGitHubBackupModal(ctx: PluginContext): Promise<void> {
  await ctx.ui.modal({
    title: "GitHub Backup",
    width: 960,
    render: (el) => {
      renderGitHubBackupPanel(el, ctx);
    }
  });
}

export interface GitHubBackupPanelProps {
  ctx: PluginContext;
  initialStatus?: GitHubBackupStatus;
  initialActivePage?: PageDocument | null;
  initialHistory?: GitHubBackupVersion[];
  initialPreview?: GitHubBackupPreview | null;
}

export function GitHubBackupPanel({
  ctx,
  initialStatus,
  initialActivePage = null,
  initialHistory = [],
  initialPreview = null
}: GitHubBackupPanelProps) {
  const [settings, setSettings] = useState<GitHubBackupSettings>(() =>
    normalizeGitHubBackupSettings(ctx.settings.get<GitHubBackupSettings>(SETTINGS_KEY, DEFAULT_GITHUB_BACKUP_SETTINGS))
  );
  const [status, setStatus] = useState<GitHubBackupStatus>(initialStatus ?? {
    state: "history_empty",
    message: "Loading GitHub backup status."
  });
  const [activePage, setActivePage] = useState<PageDocument | null>(initialActivePage);
  const [history, setHistory] = useState<GitHubBackupVersion[]>(initialHistory);
  const [preview, setPreview] = useState<GitHubBackupPreview | null>(initialPreview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const previewRef = useRef<HTMLDivElement | null>(null);

  const service = useMemo(
    () => createGitHubBackupService(ctx.workspace, ctx.storage, settings),
    [ctx, settings.provider, settings.repository, settings.branch, settings.basePath, settings.token]
  );

  const refresh = useCallback(async () => {
    const [nextStatus, page] = await Promise.all([
      service.status(settings),
      ctx.workspace.activePage()
    ]);
    setStatus(nextStatus);
    setActivePage(page);
    if (page && nextStatus.state !== "not_configured" && nextStatus.state !== "failed") {
      const nextHistory = await service.listPageHistory(settings, page.meta.id);
      setHistory(nextHistory);
      if (nextHistory.length === 0 && nextStatus.state === "backed_up") {
        setStatus({
          ...nextStatus,
          state: "history_empty",
          message: "This page has no backed-up versions yet."
        });
      }
    } else {
      setHistory([]);
      setPreview(null);
    }
  }, [ctx.workspace, service, settings]);

  useEffect(() => {
    void refresh().catch((error) => setStatus(failedStatus(error)));
  }, [refresh]);

  useEffect(() => {
    if (!preview) return;
    const frame = window.requestAnimationFrame(() => {
      previewRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [preview]);

  async function saveSettings() {
    setBusy(true);
    try {
      const next = normalizeGitHubBackupSettings(settings);
      await ctx.settings.set(SETTINGS_KEY, next);
      setSettings(next);
      setMessage("Settings saved.");
      await refresh();
    } catch (error) {
      setStatus(failedStatus(error));
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runBackup() {
    setBusy(true);
    setStatus({ state: "backing_up", message: "Backing up workspace to GitHub target..." });
    setMessage("");
    try {
      const result = await service.backupWorkspace(settings);
      setStatus(result.status);
      setMessage(result.status.message);
      setPreview(null);
      await refresh();
    } catch (error) {
      setStatus(failedStatus(error));
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function previewVersion(version: GitHubBackupVersion) {
    if (!activePage) return;
    setBusy(true);
    try {
      setPreview(await service.previewPageVersion(settings, activePage.meta.id, version.sha));
    } catch (error) {
      setStatus(failedStatus(error));
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function restoreVersion() {
    if (!activePage || !preview) return;
    const confirmed = await ctx.ui.confirm(`Restore ${activePage.meta.title} from ${preview.version.createdAt}?`);
    if (!confirmed) return;
    setBusy(true);
    try {
      await service.restorePageVersion(settings, activePage.meta.id, preview.version.sha);
      ctx.ui.notify("Page restored from GitHub history.", "info");
      ctx.ui.openEntity({ kind: "page", entityId: activePage.meta.id });
      setMessage("Page restored from selected version.");
      setPreview(null);
      await refresh();
    } catch (error) {
      setStatus(failedStatus(error));
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="github-backup-panel" data-testid="github-backup-panel">
      <div className="github-backup-hero">
        <div>
          <p className="plugin-detail-kicker">Workspace backup</p>
          <h3>GitHub-backed page history</h3>
          <p>Back up Lotion content to a configured GitHub target and restore page versions safely.</p>
        </div>
        <span className={`github-backup-status ${status.state}`}>{statusLabel(status)}</span>
      </div>

      <div className="github-backup-grid">
        <form
          className="github-backup-card github-backup-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveSettings();
          }}
        >
          <h4>Connection</h4>
          <label>
            <span>Adapter</span>
            <select
              aria-label="GitHub backup adapter"
              value={settings.provider}
              onChange={(event) => setSettings({ ...settings, provider: event.currentTarget.value === "github_api" ? "github_api" : "local_mock" })}
            >
              <option value="local_mock">Local mock GitHub</option>
              <option value="github_api">GitHub API</option>
            </select>
          </label>
          <label>
            <span>Repository</span>
            <input
              aria-label="GitHub repository"
              type="text"
              placeholder="owner/repo"
              value={settings.repository}
              onChange={(event) => setSettings({ ...settings, repository: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Branch</span>
            <input
              aria-label="GitHub branch"
              type="text"
              value={settings.branch}
              onChange={(event) => setSettings({ ...settings, branch: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Backup path</span>
            <input
              aria-label="GitHub backup path"
              type="text"
              value={settings.basePath}
              onChange={(event) => setSettings({ ...settings, basePath: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Token</span>
            <input
              aria-label="GitHub token"
              type="password"
              placeholder={settings.provider === "github_api" ? "Required for GitHub API" : "Not used by local mock"}
              value={settings.token ?? ""}
              onChange={(event) => setSettings({ ...settings, token: event.currentTarget.value || undefined })}
            />
          </label>
          <div className="github-backup-actions">
            <button type="submit" disabled={busy}>Save settings</button>
            <button type="button" onClick={() => void runBackup()} disabled={busy}>Run backup</button>
          </div>
        </form>

        <div className="github-backup-card github-backup-state">
          <h4>Status</h4>
          <p>{status.message}</p>
          <dl>
            <div>
              <dt>Last backup</dt>
              <dd>{status.lastBackupAt ? new Date(status.lastBackupAt).toLocaleString() : "None"}</dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>{status.lastCommitSha ?? "None"}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>{status.fileCount ?? 0}</dd>
            </div>
          </dl>
          {message && <p className="github-backup-message">{message}</p>}
          {settings.provider === "local_mock" && (
            <p className="github-backup-note">Local mock mode stores a deterministic fake GitHub remote in workspace plugin storage for safe testing.</p>
          )}
        </div>
      </div>

      <div className="github-backup-card github-backup-history">
        <div className="github-backup-history-header">
          <div>
            <h4>Page history</h4>
            <p>{activePage ? activePage.meta.title : "Open a page to inspect its GitHub history."}</p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>
        </div>
        {activePage && history.length === 0 && (
          <div className="github-backup-empty">History empty for the current page.</div>
        )}
        <div className="github-backup-history-list" role="list" aria-label="GitHub page history">
          {history.map((version) => (
            <button
              key={version.id}
              type="button"
              className={`github-backup-version ${preview?.version.sha === version.sha ? "selected" : ""}`}
              onClick={() => void previewVersion(version)}
            >
              <span>{version.message}</span>
              <small>{new Date(version.createdAt).toLocaleString()} · {version.sha}</small>
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <div ref={previewRef} className="github-backup-card github-backup-preview" aria-label="GitHub backup diff preview">
          <div className="github-backup-history-header">
            <div>
              <h4>Preview restore</h4>
              <p>{preview.version.path}</p>
            </div>
            <button type="button" onClick={() => void restoreVersion()} disabled={busy}>Restore this version</button>
          </div>
          <pre>
            {preview.diff.slice(0, 80).map((line, index) => (
              <span key={`${index}:${line.type}`} className={`github-backup-diff-line ${line.type}`}>
                {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}{line.text || " "}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}

function failedStatus(error: unknown): GitHubBackupStatus {
  return {
    state: "failed",
    message: error instanceof Error ? error.message : String(error)
  };
}

function statusLabel(status: GitHubBackupStatus): string {
  switch (status.state) {
    case "not_configured":
      return "Not configured";
    case "backing_up":
      return "Backing up";
    case "backed_up":
      return "Backed up";
    case "failed":
      return "Failed";
    case "history_empty":
      return "History empty";
  }
}
