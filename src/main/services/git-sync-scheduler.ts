import type { GitSyncCadence, GitSyncPushCadence } from "../../shared/types.js";
import type { GitService } from "./git-service.js";

type GitSyncTimerHandle = ReturnType<typeof setInterval> & { unref?: () => void };

export interface GitSyncSchedulerTimers {
  setInterval(callback: () => void | Promise<void>, delayMs: number): GitSyncTimerHandle;
  clearInterval(handle: GitSyncTimerHandle): void;
}

const REAL_TIMERS: GitSyncSchedulerTimers = {
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: (handle) => clearInterval(handle)
};

export function gitAutoBackupDelayMs(cadence: GitSyncCadence): number | null {
  if (cadence === "minutes_15") return 15 * 60 * 1000;
  if (cadence === "minutes_30") return 30 * 60 * 1000;
  if (cadence === "hourly") return 60 * 60 * 1000;
  if (cadence === "daily") return 24 * 60 * 60 * 1000;
  return null;
}

export function gitAutoPushDelayMs(cadence: GitSyncPushCadence): number | null {
  if (cadence === "hourly") return 60 * 60 * 1000;
  if (cadence === "daily") return 24 * 60 * 60 * 1000;
  return null;
}

export class GitSyncScheduler {
  private backupTimer?: GitSyncTimerHandle;
  private pushTimer?: GitSyncTimerHandle;
  private runningBackup = false;
  private runningPush = false;
  private autoPushPaused = false;
  private autoPushCadence: GitSyncPushCadence = "off";

  constructor(
    private readonly git: Pick<GitService, "settings" | "backupNow" | "autoPush">,
    private readonly timers: GitSyncSchedulerTimers = REAL_TIMERS
  ) {}

  async refresh(): Promise<void> {
    this.stop();
    this.autoPushPaused = false;
    let backupDelay: number | null = null;
    let pushDelay: number | null = null;
    try {
      const settings = await this.git.settings();
      if (settings.automationPaused) return;
      this.autoPushCadence = settings.autoPushCadence;
      backupDelay = gitAutoBackupDelayMs(settings.autoBackupCadence);
      pushDelay = gitAutoPushDelayMs(settings.autoPushCadence);
    } catch {
      return;
    }
    if (backupDelay) {
      this.backupTimer = this.timers.setInterval(() => this.runBackup(), backupDelay);
      this.backupTimer.unref?.();
    }
    if (pushDelay) {
      this.pushTimer = this.timers.setInterval(() => this.runAutoPush(), pushDelay);
      this.pushTimer.unref?.();
    }
  }

  stop(): void {
    if (this.backupTimer) {
      this.timers.clearInterval(this.backupTimer);
      this.backupTimer = undefined;
    }
    if (this.pushTimer) {
      this.timers.clearInterval(this.pushTimer);
      this.pushTimer = undefined;
    }
  }

  private async runBackup(): Promise<void> {
    if (this.runningBackup) return;
    this.runningBackup = true;
    try {
      const result = await this.git.backupNow();
      if (result.success && this.autoPushCadence === "after_backup") {
        await this.runAutoPush();
      }
    } finally {
      this.runningBackup = false;
    }
  }

  private async runAutoPush(): Promise<void> {
    if (this.runningPush || this.autoPushPaused) return;
    this.runningPush = true;
    try {
      const result = await this.git.autoPush();
      if (!result.success && result.message.startsWith("Auto push paused: remote has changes.")) {
        this.autoPushPaused = true;
      }
    } finally {
      this.runningPush = false;
    }
  }
}
