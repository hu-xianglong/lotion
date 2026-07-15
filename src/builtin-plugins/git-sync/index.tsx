import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Disposable, PluginContext, PluginManifest } from "../../shared/plugin-api.js";
import type { GitBackupResult, GitSquashPreflightResult, GitStatus, GitSyncSettings } from "../../shared/types.js";

export const manifest: PluginManifest = {
  id: "git-sync",
  name: "Git Sync",
  version: "0.0.1",
  description: "Local-first backup and sync status for file-backed Lotion workspaces.",
  permissions: ["workspace.write", "network", "shell"]
};

export function installGitSync(ctx: PluginContext): Disposable {
  const disposables: Disposable[] = [
    ctx.settingsTabs.register({
      id: "git-sync.settings",
      title: "Git Sync",
      render: (el) => renderGitSyncSettings(el)
    }),
    ctx.commands.register({
      id: "git-sync.backup-now",
      title: "Backup Now",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.backupNow();
        ctx.ui.notify(result.message, result.success ? "info" : "error");
      }
    }),
    ctx.commands.register({
      id: "git-sync.open",
      title: "Open Git Sync",
      category: "Sync",
      run: () => openGitSyncModal(ctx)
    }),
    ctx.commands.register({
      id: "git-sync.fetch-status",
      title: "Fetch Git remote status",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.fetchStatus();
        ctx.ui.notify(`Git remote status: ${result.message}`, result.success ? "info" : "error");
      }
    }),
    ctx.commands.register({
      id: "git-sync.init-repository",
      title: "Initialize Git repo",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.initRepository();
        ctx.ui.notify(`Git repository: ${result.message}`, result.success ? "info" : "error");
      }
    }),
    ctx.commands.register({
      id: "git-sync.test-remote",
      title: "Test Git remote access",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.testRemoteAccess();
        ctx.ui.notify(`Git remote test: ${result.message}`, result.success ? "info" : "error");
      }
    }),
    ctx.commands.register({
      id: "git-sync.pull",
      title: "Pull Git remote",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.pull();
        ctx.ui.notify(`Git pull: ${result.message}`, result.success ? "info" : "error");
      }
    }),
    ctx.commands.register({
      id: "git-sync.push",
      title: "Push Git remote",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.push();
        ctx.ui.notify(`Git push: ${result.message}`, result.success ? "info" : "error");
      }
    }),
    ctx.commands.register({
      id: "git-sync.squash-preflight",
      title: "Check Git squash safety",
      category: "Sync",
      run: async () => {
        const result = await window.lotion.git.squashPreflight();
        ctx.ui.notify(`Git squash safety: ${result.message}`, result.ok ? "info" : "warn");
      }
    })
  ];
  return {
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    }
  };
}

type GitSyncRootEntry = {
  disposeTimer: number | undefined;
  root: Root;
  version: number;
};

const gitSyncRoots = new WeakMap<HTMLElement, GitSyncRootEntry>();

function renderGitSyncSettings(el: HTMLElement): Disposable {
  const entry = gitSyncRootEntryFor(el);
  entry.version += 1;
  if (entry.disposeTimer !== undefined) {
    window.clearTimeout(entry.disposeTimer);
    entry.disposeTimer = undefined;
  }
  const renderVersion = entry.version;
  entry.root.render(<GitSyncSettings />);
  return {
    dispose: () => {
      const current = gitSyncRoots.get(el);
      if (!current || current.version !== renderVersion || current.disposeTimer !== undefined) return;
      current.disposeTimer = window.setTimeout(() => {
        const latest = gitSyncRoots.get(el);
        if (!latest || latest.version !== renderVersion) return;
        latest.root.unmount();
        gitSyncRoots.delete(el);
      }, 0);
    }
  };
}

function gitSyncRootEntryFor(el: HTMLElement): GitSyncRootEntry {
  const existing = gitSyncRoots.get(el);
  if (existing) return existing;
  const entry: GitSyncRootEntry = {
    disposeTimer: undefined,
    root: createRoot(el),
    version: 0
  };
  gitSyncRoots.set(el, entry);
  return entry;
}

async function openGitSyncModal(ctx: PluginContext): Promise<void> {
  await ctx.ui.modal({
    title: "Git Sync",
    width: 900,
    render: (el) => {
      renderGitSyncSettings(el);
    }
  });
}

export interface GitSyncSettingsPanelProps {
  initialStatus?: GitStatus;
  initialSettings?: GitSyncSettings;
  initialMessage?: GitBackupResult;
}

const DEFAULT_GIT_SYNC_PANEL_SETTINGS: GitSyncSettings = {
  remoteUrl: "",
  branch: "main",
  sshKeyPath: "",
  autoBackupCadence: "off",
  autoPushCadence: "off",
  automationPaused: false,
  commitMessagePrefix: "Lotion backup"
};

export function GitSyncSettingsPanel({
  initialStatus,
  initialSettings,
  initialMessage
}: GitSyncSettingsPanelProps) {
  const [status, setStatus] = useState<GitStatus | undefined>(initialStatus);
  const [settings, setSettings] = useState<GitSyncSettings>(initialSettings ?? DEFAULT_GIT_SYNC_PANEL_SETTINGS);
  const [message, setMessage] = useState<GitBackupResult | undefined>(initialMessage);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const [nextStatus, nextSettings] = await Promise.all([
        window.lotion.git.status(),
        window.lotion.git.settings()
      ]);
      setStatus(nextStatus);
      setSettings(nextSettings);
    } finally {
      setBusy(false);
    }
  }

  async function backupNow() {
    setBusy(true);
    try {
      const result = await window.lotion.git.backupNow();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function initRepository() {
    setBusy(true);
    try {
      if (settings) setSettings(await window.lotion.git.updateSettings(settings));
      const result = await window.lotion.git.initRepository();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      setSettings(await window.lotion.git.updateSettings(settings));
      setMessage({ success: true, message: "Git sync settings saved." });
    } finally {
      setBusy(false);
    }
  }

  async function applyRemoteConfig() {
    setBusy(true);
    try {
      setSettings(await window.lotion.git.updateSettings(settings));
      const result = await window.lotion.git.configureRemote();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function testRemoteAccess() {
    setBusy(true);
    try {
      setSettings(await window.lotion.git.updateSettings(settings));
      const result = await window.lotion.git.testRemoteAccess();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function pushRemote() {
    setBusy(true);
    try {
      setSettings(await window.lotion.git.updateSettings(settings));
      const result = await window.lotion.git.push();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function fetchStatus() {
    setBusy(true);
    try {
      setSettings(await window.lotion.git.updateSettings(settings));
      const result = await window.lotion.git.fetchStatus();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function pullRemote() {
    setBusy(true);
    try {
      setSettings(await window.lotion.git.updateSettings(settings));
      const result = await window.lotion.git.pull();
      setMessage(result);
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function checkSquashPreflight() {
    setBusy(true);
    try {
      const result = await window.lotion.git.squashPreflight();
      setMessage({
        success: result.ok,
        message: `Squash preflight: ${result.message}`,
        output: squashPreflightOutput(result)
      });
      setStatus(await window.lotion.git.status());
    } finally {
      setBusy(false);
    }
  }

  async function pickSshKey() {
    const path = await window.lotion.git.pickSshKey();
    if (path) setSettings({ ...settings, sshKeyPath: path });
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="git-sync-panel">
      <div className="git-sync-header">
        <div>
          <h3>Git Sync</h3>
          <p>Inspect the workspace Git state and create manual backup commits.</p>
        </div>
        <span className={`git-sync-pill ${statusClass(status)}`}>{statusLabel(status)}</span>
      </div>

      <div className="git-sync-actions">
        <button type="button" onClick={() => void refresh()} disabled={busy}>Refresh</button>
        <button type="button" onClick={() => void initRepository()} disabled={busy}>Initialize repo</button>
        <button type="button" onClick={() => void backupNow()} disabled={busy}>Backup now</button>
      </div>

      {settings && (
        <form className="git-sync-form" onSubmit={(event) => {
          event.preventDefault();
          void saveSettings();
        }}>
          <label>
            <span>Remote repository URL</span>
            <input
              type="text"
              value={settings.remoteUrl}
              placeholder="git@github.com:user/repo.git"
              onChange={(event) => setSettings({ ...settings, remoteUrl: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Branch</span>
            <input
              type="text"
              value={settings.branch}
              placeholder="main"
              onChange={(event) => setSettings({ ...settings, branch: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>SSH key path</span>
            <div className="git-sync-input-row">
              <input
                type="text"
                value={settings.sshKeyPath}
                placeholder="/Users/me/.ssh/id_ed25519"
                onChange={(event) => setSettings({ ...settings, sshKeyPath: event.currentTarget.value })}
              />
              <button type="button" disabled={busy} onClick={() => void pickSshKey()}>
                Choose
              </button>
            </div>
          </label>
          <div className="git-sync-field">
            <span>Pause automatic sync</span>
            <label className="git-sync-checkbox">
              <input
                type="checkbox"
                checked={settings.automationPaused}
                onChange={(event) => setSettings({ ...settings, automationPaused: event.currentTarget.checked })}
              />
              <span>Manual actions stay available</span>
            </label>
          </div>
          <label>
            <span>Commit message prefix</span>
            <input
              type="text"
              value={settings.commitMessagePrefix}
              placeholder="Lotion backup"
              onChange={(event) => setSettings({ ...settings, commitMessagePrefix: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>Auto backup cadence</span>
            <select
              value={settings.autoBackupCadence}
              onChange={(event) => setSettings({ ...settings, autoBackupCadence: event.currentTarget.value as GitSyncSettings["autoBackupCadence"] })}
            >
              <option value="off">Off</option>
              <option value="minutes_15">Every 15 minutes</option>
              <option value="minutes_30">Every 30 minutes</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
          </label>
          <label>
            <span>Auto push cadence</span>
            <select
              value={settings.autoPushCadence}
              onChange={(event) => setSettings({ ...settings, autoPushCadence: event.currentTarget.value as GitSyncSettings["autoPushCadence"] })}
            >
              <option value="off">Off</option>
              <option value="after_backup">After backup</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
          </label>
          <div className="git-sync-actions">
            <button type="submit" disabled={busy}>Save settings</button>
            <button type="button" disabled={busy} onClick={() => void applyRemoteConfig()}>
              Apply remote config
            </button>
            <button type="button" disabled={busy} onClick={() => void testRemoteAccess()}>
              Test remote
            </button>
            <button type="button" disabled={busy} onClick={() => void fetchStatus()}>
              Fetch status
            </button>
            <button type="button" disabled={busy} onClick={() => void pullRemote()}>
              Pull
            </button>
            <button type="button" disabled={busy} onClick={() => void pushRemote()}>
              Push
            </button>
            <button type="button" disabled={busy} onClick={() => void checkSquashPreflight()}>
              Check squash safety
            </button>
          </div>
        </form>
      )}

      {message && (
        <div className={`git-sync-message ${message.success ? "success" : "error"}`}>
          <strong>{message.message}</strong>
          {message.output && <pre>{message.output}</pre>}
        </div>
      )}

      <div className="git-sync-grid">
        <StatusItem label="Git" value={status?.installed ? "Installed" : "Unavailable"} />
        <StatusItem label="Repository" value={status?.repoInitialized ? "Initialized" : "Not initialized"} />
        <StatusItem label="Working tree" value={workingTreeLabel(status)} />
        <StatusItem label="Branch" value={status?.branch || "Unknown"} />
        <StatusItem label="Remote" value={status?.remote || "Not configured"} />
        <StatusItem label="Ahead / behind" value={`${status?.ahead ?? 0} / ${status?.behind ?? 0}`} />
        <StatusItem label="Automation" value={settings?.automationPaused ? "Paused" : "Active"} />
        <StatusItem label="Last commit" value={status?.lastCommit || "None"} />
        <StatusItem label="Last backup" value={formatOptionalTime(settings?.lastBackupAt)} />
        <StatusItem label="Last push" value={formatOptionalTime(settings?.lastPushAt)} />
        <StatusItem label="Last error" value={settings?.lastError || "None"} />
      </div>

      {status?.output && (
        <details className="git-sync-output">
          <summary>Raw status output</summary>
          <pre>{status.output}</pre>
        </details>
      )}
    </div>
  );
}

const GitSyncSettings = GitSyncSettingsPanel;

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="git-sync-status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusLabel(status: GitStatus | undefined): string {
  if (!status) return "Loading";
  if (!status.installed) return "Git unavailable";
  if (!status.repoInitialized) return "Repo missing";
  if (!status.clean) return `${status.dirtyCount} changed`;
  if ((status.behind ?? 0) > 0 && (status.ahead ?? 0) > 0) return "Diverged";
  if ((status.behind ?? 0) > 0) return "Sync needed";
  if ((status.ahead ?? 0) > 0) return "Ready to push";
  return "Clean";
}

function statusClass(status: GitStatus | undefined): string {
  if (!status || !status.installed || !status.repoInitialized) return "warn";
  if (!status.clean) return "dirty";
  if ((status.behind ?? 0) > 0) return "warn";
  return "success";
}

function workingTreeLabel(status: GitStatus | undefined): string {
  if (!status) return "Loading";
  if (!status.repoInitialized) return "Not initialized";
  return status.clean ? "Clean" : `${status.dirtyCount} changed files`;
}

function formatOptionalTime(value: string | undefined): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function squashPreflightOutput(result: GitSquashPreflightResult): string {
  return [
    `state: ${result.state}`,
    result.branch ? `branch: ${result.branch}` : "",
    result.remote ? `remote: ${result.remote}` : "",
    `ahead: ${result.ahead ?? 0}`,
    `behind: ${result.behind ?? 0}`,
    result.output ? `output:\n${result.output}` : ""
  ].filter(Boolean).join("\n");
}
