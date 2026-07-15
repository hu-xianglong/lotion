import electron from "electron";
import { join } from "node:path";
import type { GitSyncSettings, GitSyncSettingsInput } from "../../shared/types.js";
import { fileService } from "./file-service.js";

const { app } = electron;

export interface RecentWorkspace {
  /** Absolute path to the workspace root directory. */
  path: string;
  /** Display name (from the workspace's lotion.json at open time). */
  name: string;
  /** Workspace-relative icon path copied from the workspace metadata DB. */
  icon?: string;
  /** ISO timestamp of the last time we opened it. */
  lastOpened: string;
}

export interface AppConfig {
  /** Path of the most recently opened workspace, opened on next launch. */
  active: string | null;
  /** Workspaces the user has touched, MRU first, capped at MAX_RECENTS. */
  recents: RecentWorkspace[];
  /** Machine-local Git sync preferences keyed by absolute workspace path. */
  gitSyncByWorkspace: Record<string, GitSyncSettings>;
}

const MAX_RECENTS = 12;

export const DEFAULT_GIT_SYNC_SETTINGS: GitSyncSettings = {
  remoteUrl: "",
  branch: "main",
  sshKeyPath: "",
  autoBackupCadence: "off",
  autoPushCadence: "off",
  automationPaused: false,
  commitMessagePrefix: "Lotion backup"
};

/**
 * Lives at `<userData>/app-config.json`. A tiny key-value store with
 * just enough to remember which workspace to open and which we've
 * seen before. All writes are synchronous from main's perspective —
 * the file is small.
 */
export class AppConfigService {
  private cache: AppConfig | null = null;
  private readonly path: string;

  constructor(configPath?: string) {
    this.path = configPath ?? join(app.getPath("userData"), "app-config.json");
  }

  async load(): Promise<AppConfig> {
    if (this.cache) return this.cache;
    if (!fileService.exists(this.path)) {
      this.cache = emptyConfig();
      return this.cache;
    }
    try {
      const raw = await fileService.readText(this.path);
      const parsed = JSON.parse(raw) as Partial<AppConfig>;
      this.cache = {
        active: parsed.active ?? null,
        recents: Array.isArray(parsed.recents) ? parsed.recents : [],
        gitSyncByWorkspace: normalizeGitSyncByWorkspace(parsed.gitSyncByWorkspace)
      };
    } catch {
      this.cache = emptyConfig();
    }
    return this.cache;
  }

  async save(next: AppConfig): Promise<void> {
    this.cache = next;
    await fileService.writeTextAtomic(this.path, JSON.stringify(next, null, 2) + "\n");
  }

  /** Mark a workspace path as the active one + bump it to the front
   *  of the recents list (deduped by path). */
  async touch(path: string, name: string, icon?: string): Promise<void> {
    const config = await this.load();
    const filtered = config.recents.filter((r) => r.path !== path);
    filtered.unshift({ path, name, icon, lastOpened: new Date().toISOString() });
    await this.save({
      active: path,
      recents: filtered.slice(0, MAX_RECENTS),
      gitSyncByWorkspace: config.gitSyncByWorkspace
    });
  }

  async forget(path: string): Promise<void> {
    const config = await this.load();
    const gitSyncByWorkspace = { ...config.gitSyncByWorkspace };
    delete gitSyncByWorkspace[path];
    await this.save({
      active: config.active === path ? null : config.active,
      recents: config.recents.filter((r) => r.path !== path),
      gitSyncByWorkspace
    });
  }

  async gitSyncSettingsForWorkspace(path: string): Promise<GitSyncSettings> {
    const config = await this.load();
    return normalizeGitSyncSettings(config.gitSyncByWorkspace[path]);
  }

  async updateGitSyncSettingsForWorkspace(
    path: string,
    input: GitSyncSettingsInput
  ): Promise<GitSyncSettings> {
    const config = await this.load();
    const next = normalizeGitSyncSettings({
      ...config.gitSyncByWorkspace[path],
      ...input
    });
    await this.save({
      ...config,
      gitSyncByWorkspace: {
        ...config.gitSyncByWorkspace,
        [path]: next
      }
    });
    return next;
  }
}

function emptyConfig(): AppConfig {
  return {
    active: null,
    recents: [],
    gitSyncByWorkspace: {}
  };
}

function normalizeGitSyncByWorkspace(value: unknown): Record<string, GitSyncSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([path]) => path.trim())
      .map(([path, settings]) => [path, normalizeGitSyncSettings(settings)])
  );
}

function normalizeGitSyncSettings(value: unknown): GitSyncSettings {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<GitSyncSettings>
    : {};
  const normalized: GitSyncSettings = {
    remoteUrl: stringValue(input.remoteUrl),
    branch: stringValue(input.branch) || DEFAULT_GIT_SYNC_SETTINGS.branch,
    sshKeyPath: stringValue(input.sshKeyPath),
    autoBackupCadence: (
      input.autoBackupCadence === "minutes_15" ||
      input.autoBackupCadence === "minutes_30" ||
      input.autoBackupCadence === "hourly" ||
      input.autoBackupCadence === "daily"
    )
      ? input.autoBackupCadence
      : DEFAULT_GIT_SYNC_SETTINGS.autoBackupCadence,
    autoPushCadence: (
      input.autoPushCadence === "after_backup" ||
      input.autoPushCadence === "hourly" ||
      input.autoPushCadence === "daily"
    )
      ? input.autoPushCadence
      : DEFAULT_GIT_SYNC_SETTINGS.autoPushCadence,
    automationPaused: input.automationPaused === true,
    commitMessagePrefix: stringValue(input.commitMessagePrefix) || DEFAULT_GIT_SYNC_SETTINGS.commitMessagePrefix
  };
  const lastBackupAt = stringValue(input.lastBackupAt);
  const lastPushAt = stringValue(input.lastPushAt);
  const lastError = stringValue(input.lastError);
  if (lastBackupAt) normalized.lastBackupAt = lastBackupAt;
  if (lastPushAt) normalized.lastPushAt = lastPushAt;
  if (lastError) normalized.lastError = lastError;
  return normalized;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
