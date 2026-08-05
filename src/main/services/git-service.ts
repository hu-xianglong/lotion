import { execFile } from "node:child_process";
import { isAbsolute, join, normalize, sep } from "node:path";
import { promisify } from "node:util";
import type {
  GitBackupResult,
  GitPageHistoryDiffLine,
  GitPageHistoryPreview,
  GitPageHistoryResult,
  GitPageHistoryVersion,
  GitSquashPreflightResult,
  GitStatus,
  GitSyncSettings,
  GitSyncSettingsInput
} from "../../shared/types.js";
import type { AppConfigService } from "./app-config-service.js";
import { fileService } from "./file-service.js";
import type { WorkspaceService } from "./workspace-service.js";

const execFileAsync = promisify(execFile);

export class GitService {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly appConfig?: AppConfigService
  ) {}

  async settings(): Promise<GitSyncSettings> {
    return this.requireAppConfig().gitSyncSettingsForWorkspace(this.workspace.requirePaths().root);
  }

  async updateSettings(input: GitSyncSettingsInput): Promise<GitSyncSettings> {
    return this.requireAppConfig().updateGitSyncSettingsForWorkspace(
      this.workspace.requirePaths().root,
      input
    );
  }

  async status(): Promise<GitStatus> {
    const cwd = this.workspace.requirePaths().root;
    try {
      await execFileAsync("git", ["--version"], { cwd });
    } catch (error) {
      return {
        installed: false,
        repoInitialized: false,
        enabled: false,
        clean: false,
        dirtyCount: 0,
        output: error instanceof Error ? error.message : "Git is not available"
      };
    }

    try {
      await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    } catch {
      return {
        installed: true,
        repoInitialized: false,
        enabled: false,
        clean: false,
        dirtyCount: 0,
        output: "Workspace is not a Git repository."
      };
    }

    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "--branch"], { cwd });
      const parsed = parsePorcelainStatus(stdout);
      const [remote, lastCommit] = await Promise.all([
        readOptionalGitOutput(cwd, ["remote", "get-url", "origin"]),
        readOptionalGitOutput(cwd, ["log", "-1", "--pretty=%h %cs %s"])
      ]);
      return {
        installed: true,
        repoInitialized: true,
        enabled: true,
        clean: parsed.dirtyCount === 0,
        dirtyCount: parsed.dirtyCount,
        branch: parsed.branch,
        ahead: parsed.ahead,
        behind: parsed.behind,
        remote,
        lastCommit,
        output: stdout
      };
    } catch (error) {
      return {
        installed: true,
        repoInitialized: true,
        enabled: false,
        clean: false,
        dirtyCount: 0,
        output: error instanceof Error ? error.message : "Git is not available"
      };
    }
  }

  async backupNow(message?: string): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      await execFileAsync("git", ["init"], { cwd });
      await execFileAsync("git", ["add", "."], { cwd });
      const status = await this.status();
      if (status.clean) {
        await this.rememberGitSyncHistory({ lastError: "" });
        return { success: true, message: "Nothing to backup." };
      }
      const commitMessage = message?.trim() || await this.defaultBackupCommitMessage();
      const { stdout, stderr } = await execFileAsync("git", ["commit", "-m", commitMessage], { cwd });
      await this.rememberGitSyncHistory({ lastBackupAt: new Date().toISOString(), lastError: "" });
      return { success: true, message: "Backup created.", output: stdout || stderr };
    } catch (error) {
      const output = error instanceof Error ? error.message : String(error);
      await this.rememberGitFailure("Backup failed.", output);
      return {
        success: false,
        message: "Backup failed.",
        output
      };
    }
  }

  async initRepository(): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      const settings = await this.settings();
      await execFileAsync("git", ["init"], { cwd });
      if (settings.branch.trim()) {
        await execFileAsync("git", ["branch", "-M", settings.branch.trim()], { cwd });
      }
      await this.rememberGitSyncHistory({ lastError: "" });
      return {
        success: true,
        message: "Git repository initialized.",
        output: settings.branch.trim() ? `branch ${settings.branch.trim()}` : undefined
      };
    } catch (error) {
      return this.gitFailure("Git repository initialization failed.", error);
    }
  }

  async configureRemote(): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      const settings = await this.settings();
      if (!settings.remoteUrl.trim()) {
        return this.gitFailure("Remote repository URL is required.");
      }
      await execFileAsync("git", ["init"], { cwd });
      if (settings.branch.trim()) {
        await execFileAsync("git", ["branch", "-M", settings.branch.trim()], { cwd });
      }
      const existingRemote = await readOptionalGitOutput(cwd, ["remote", "get-url", "origin"]);
      if (existingRemote) {
        await execFileAsync("git", ["remote", "set-url", "origin", settings.remoteUrl], { cwd });
      } else {
        await execFileAsync("git", ["remote", "add", "origin", settings.remoteUrl], { cwd });
      }
      await this.rememberGitSyncHistory({ lastError: "" });
      return {
        success: true,
        message: "Git remote configured.",
        output: `origin ${settings.remoteUrl}`
      };
    } catch (error) {
      return this.gitFailure("Git remote configuration failed.", error);
    }
  }

  async testRemoteAccess(): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      const settings = await this.settings();
      if (settings.remoteUrl.trim()) {
        const configured = await this.configureRemote();
        if (!configured.success) return configured;
      }
      const remote = await readOptionalGitOutput(cwd, ["remote", "get-url", "origin"]);
      if (!remote) {
        return this.gitFailure("Remote repository URL is required.");
      }
      const { stdout, stderr } = await execFileAsync("git", ["ls-remote", "--heads", "origin"], {
        cwd,
        env: gitEnvironment(settings),
        timeout: 15_000
      });
      await this.rememberGitSyncHistory({ lastError: "" });
      return {
        success: true,
        message: "Git remote is reachable.",
        output: (stdout || stderr).trim() || "Remote reachable; no remote heads found."
      };
    } catch (error) {
      return this.gitFailure("Git remote test failed.", error);
    }
  }

  async push(): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      const settings = await this.settings();
      if (settings.remoteUrl.trim()) {
        const configured = await this.configureRemote();
        if (!configured.success) return configured;
      }
      const remote = await readOptionalGitOutput(cwd, ["remote", "get-url", "origin"]);
      if (!remote) {
        return this.gitFailure("Remote repository URL is required.");
      }
      const status = await this.status();
      if (!status.repoInitialized) {
        return this.gitFailure("Git repository is not initialized.");
      }
      const branch = settings.branch.trim() || status.branch || "main";
      const { stdout, stderr } = await execFileAsync("git", ["push", "-u", "origin", branch], {
        cwd,
        env: gitEnvironment(settings),
        timeout: 30_000
      });
      await this.rememberGitSyncHistory({ lastPushAt: new Date().toISOString(), lastError: "" });
      return {
        success: true,
        message: "Git push completed.",
        output: (stdout || stderr).trim()
      };
    } catch (error) {
      return this.gitFailure("Git push failed.", error);
    }
  }

  async autoPush(): Promise<GitBackupResult> {
    const fetched = await this.fetchStatus();
    if (!fetched.success) return fetched;
    const status = await this.status();
    if (!status.repoInitialized) {
      return this.gitFailure("Git repository is not initialized.");
    }
    if (!status.clean) {
      return this.gitFailure("Auto push paused: commit local changes before pushing.", status.output);
    }
    if ((status.behind ?? 0) > 0) {
      return this.gitFailure("Auto push paused: remote has changes. Pull before pushing.");
    }
    return this.push();
  }

  async fetchStatus(): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      const settings = await this.settings();
      if (settings.remoteUrl.trim()) {
        const configured = await this.configureRemote();
        if (!configured.success) return configured;
      }
      const remote = await readOptionalGitOutput(cwd, ["remote", "get-url", "origin"]);
      if (!remote) {
        return this.gitFailure("Remote repository URL is required.");
      }
      const status = await this.status();
      if (!status.repoInitialized) {
        return this.gitFailure("Git repository is not initialized.");
      }
      const { stdout, stderr } = await execFileAsync("git", ["fetch", "origin", "--prune"], {
        cwd,
        env: gitEnvironment(settings),
        timeout: 30_000
      });
      await this.rememberGitSyncHistory({ lastError: "" });
      return {
        success: true,
        message: "Git remote status fetched.",
        output: (stdout || stderr).trim()
      };
    } catch (error) {
      return this.gitFailure("Git fetch failed.", error);
    }
  }

  async pull(): Promise<GitBackupResult> {
    const cwd = this.workspace.requirePaths().root;
    try {
      const settings = await this.settings();
      if (settings.remoteUrl.trim()) {
        const configured = await this.configureRemote();
        if (!configured.success) return configured;
      }
      const remote = await readOptionalGitOutput(cwd, ["remote", "get-url", "origin"]);
      if (!remote) {
        return this.gitFailure("Remote repository URL is required.");
      }
      const status = await this.status();
      if (!status.repoInitialized) {
        return this.gitFailure("Git repository is not initialized.");
      }
      if (!status.clean) {
        return this.gitFailure("Commit or discard local changes before pulling.", status.output);
      }
      const branch = settings.branch.trim() || status.branch || "main";
      const { stdout, stderr } = await execFileAsync("git", ["pull", "--ff-only", "origin", branch], {
        cwd,
        env: gitEnvironment(settings),
        timeout: 30_000
      });
      await this.rememberGitSyncHistory({ lastError: "" });
      return {
        success: true,
        message: "Git pull completed.",
        output: (stdout || stderr).trim()
      };
    } catch (error) {
      return this.gitFailure("Git pull failed.", error);
    }
  }

  async listFileHistory(
    relativePath: string,
    options: { pageId: string; title: string }
  ): Promise<GitPageHistoryResult> {
    const path = normalizeWorkspaceRelativeGitPath(relativePath);
    const status = await this.status();
    if (!status.installed || !status.repoInitialized) {
      return {
        state: "repo_missing",
        message: "Initialize Git or create a backup to start local page history.",
        path,
        pageId: options.pageId,
        title: options.title,
        versions: []
      };
    }
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["log", "--follow", "--format=%H%x1f%h%x1f%cI%x1f%s", "--", path],
        { cwd: this.workspace.requirePaths().root, timeout: 15_000 }
      );
      const versions = parseGitHistory(stdout, path, options);
      return {
        state: versions.length > 0 ? "ready" : "history_empty",
        message: versions.length > 0
          ? `${versions.length} local Git version${versions.length === 1 ? "" : "s"} found.`
          : "This page has no local Git versions yet. Run Backup now to create one.",
        path,
        pageId: options.pageId,
        title: options.title,
        versions
      };
    } catch (error) {
      return {
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
        path,
        pageId: options.pageId,
        title: options.title,
        versions: []
      };
    }
  }

  async previewFileVersion(
    relativePath: string,
    sha: string,
    options: { pageId: string; title: string }
  ): Promise<GitPageHistoryPreview> {
    const path = normalizeWorkspaceRelativeGitPath(relativePath);
    const safeSha = normalizeGitObjectName(sha);
    const cwd = this.workspace.requirePaths().root;
    const [history, currentMarkdown, selectedMarkdown] = await Promise.all([
      this.listFileHistory(path, options),
      fileService.readText(join(cwd, path)),
      this.readFileAtRevision(path, safeSha)
    ]);
    const version = history.versions.find((candidate) => candidate.sha === safeSha || candidate.shortSha === safeSha);
    if (!version) throw new Error(`Version ${safeSha} was not found in local page history.`);
    return {
      version,
      currentMarkdown,
      selectedMarkdown,
      diff: diffGitPageHistoryLines(currentMarkdown, selectedMarkdown)
    };
  }

  async restoreFileVersion(
    relativePath: string,
    sha: string,
    options: { pageId: string; title: string }
  ): Promise<string> {
    const preview = await this.previewFileVersion(relativePath, sha, options);
    await fileService.writeText(join(this.workspace.requirePaths().root, preview.version.path), preview.selectedMarkdown);
    return preview.selectedMarkdown;
  }

  async squashPreflight(): Promise<GitSquashPreflightResult> {
    const status = await this.status();
    if (!status.installed || !status.repoInitialized) {
      return {
        ok: false,
        state: "repo_missing",
        message: "Initialize Git before squash maintenance can run.",
        output: status.output
      };
    }
    if (!status.clean) {
      return {
        ok: false,
        state: "dirty",
        message: "Commit or discard local changes before rewriting backup history.",
        branch: status.branch,
        remote: status.remote,
        ahead: status.ahead,
        behind: status.behind,
        output: status.output
      };
    }
    if (!status.remote) {
      return {
        ok: false,
        state: "remote_missing",
        message: "Configure a remote before remote squash maintenance.",
        branch: status.branch,
        ahead: status.ahead,
        behind: status.behind
      };
    }
    const fetched = await this.fetchStatus();
    if (!fetched.success) {
      return {
        ok: false,
        state: "failed",
        message: fetched.message,
        branch: status.branch,
        remote: status.remote,
        ahead: status.ahead,
        behind: status.behind,
        output: fetched.output
      };
    }
    const nextStatus = await this.status();
    if ((nextStatus.ahead ?? 0) > 0 && (nextStatus.behind ?? 0) > 0) {
      return {
        ok: false,
        state: "diverged",
        message: "Local and remote history diverged. Resolve manually before any squash.",
        branch: nextStatus.branch,
        remote: nextStatus.remote,
        ahead: nextStatus.ahead,
        behind: nextStatus.behind,
        output: nextStatus.output
      };
    }
    if ((nextStatus.behind ?? 0) > 0) {
      return {
        ok: false,
        state: "behind",
        message: "Remote has newer commits. Pull before any squash.",
        branch: nextStatus.branch,
        remote: nextStatus.remote,
        ahead: nextStatus.ahead,
        behind: nextStatus.behind,
        output: nextStatus.output
      };
    }
    return {
      ok: true,
      state: "ready",
      message: "Local and remote state are clean for an explicitly confirmed squash.",
      branch: nextStatus.branch,
      remote: nextStatus.remote,
      ahead: nextStatus.ahead,
      behind: nextStatus.behind
    };
  }

  private async readFileAtRevision(relativePath: string, sha: string): Promise<string> {
    const { stdout } = await execFileAsync("git", ["show", `${sha}:${relativePath}`], {
      cwd: this.workspace.requirePaths().root,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 15_000
    });
    return stdout;
  }

  private requireAppConfig(): AppConfigService {
    if (!this.appConfig) {
      throw new Error("Git sync settings require AppConfigService.");
    }
    return this.appConfig;
  }

  private async gitFailure(message: string, error?: unknown): Promise<GitBackupResult> {
    const output = error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error === undefined
          ? undefined
          : String(error);
    await this.rememberGitFailure(message, output);
    return output ? { success: false, message, output } : { success: false, message };
  }

  private async rememberGitFailure(message: string, output?: string): Promise<void> {
    const detail = output ? `${message} ${output}` : message;
    await this.rememberGitSyncHistory({ lastError: detail.slice(0, 1000) });
  }

  private async rememberGitSyncHistory(input: GitSyncSettingsInput): Promise<void> {
    if (!this.appConfig) return;
    try {
      await this.appConfig.updateGitSyncSettingsForWorkspace(this.workspace.requirePaths().root, input);
    } catch {
      // Operation history should never make the Git operation itself fail.
    }
  }

  private async defaultBackupCommitMessage(): Promise<string> {
    if (!this.appConfig) return "Backup Lotion space";
    try {
      const settings = await this.settings();
      return settings.commitMessagePrefix || "Backup Lotion space";
    } catch {
      return "Backup Lotion space";
    }
  }
}

function parseGitHistory(
  stdout: string,
  path: string,
  options: { pageId: string; title: string }
): GitPageHistoryVersion[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha = "", shortSha = "", createdAt = "", ...messageParts] = line.split("\x1f");
      const message = messageParts.join("\x1f").trim() || shortSha || sha;
      return {
        id: `${path}@${sha}`,
        sha,
        shortSha,
        message,
        createdAt,
        path,
        pageId: options.pageId,
        title: options.title
      };
    })
    .filter((version) => version.sha && version.createdAt);
}

function diffGitPageHistoryLines(current: string, selected: string): GitPageHistoryDiffLine[] {
  const currentLines = current.split(/\r?\n/);
  const selectedLines = selected.split(/\r?\n/);
  const max = Math.max(currentLines.length, selectedLines.length);
  const diff: GitPageHistoryDiffLine[] = [];
  for (let i = 0; i < max; i += 1) {
    const before = currentLines[i];
    const after = selectedLines[i];
    if (before === after) {
      if (before !== undefined) diff.push({ type: "same", text: before });
      continue;
    }
    if (before !== undefined) diff.push({ type: "removed", text: before });
    if (after !== undefined) diff.push({ type: "added", text: after });
  }
  return diff;
}

function normalizeWorkspaceRelativeGitPath(value: string): string {
  const compact = value.trim();
  if (!compact || isAbsolute(compact)) throw new Error("Git history path must be workspace-relative.");
  const normalized = normalize(compact).split(sep).join("/");
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Git history path must stay inside the workspace.");
  }
  return normalized;
}

function normalizeGitObjectName(value: string): string {
  const compact = value.trim();
  if (!/^[0-9A-Fa-f]{4,64}$/.test(compact)) {
    throw new Error("Invalid Git revision.");
  }
  return compact;
}

interface ParsedGitStatus {
  dirtyCount: number;
  branch?: string;
  ahead?: number;
  behind?: number;
}

function parsePorcelainStatus(stdout: string): ParsedGitStatus {
  const lines = stdout.split(/\r?\n/).filter(Boolean);
  const branchLine = lines.find((line) => line.startsWith("## "));
  const dirtyCount = lines.filter((line) => !line.startsWith("## ")).length;
  return {
    dirtyCount,
    ...parseBranchLine(branchLine)
  };
}

function parseBranchLine(line: string | undefined): Omit<ParsedGitStatus, "dirtyCount"> {
  if (!line) return {};
  const text = line.slice(3);
  const unbornBranch = /^No commits yet on (?<branch>.+)$/.exec(text);
  if (unbornBranch?.groups?.branch) {
    return { branch: unbornBranch.groups.branch.trim() };
  }
  const [branchPart, trackingPart] = text.split("...");
  const branch = branchPart.trim() || undefined;
  const result: Omit<ParsedGitStatus, "dirtyCount"> = {};
  if (branch) result.branch = branch;
  const bracket = /\[(?<content>[^\]]+)\]/.exec(trackingPart ?? "");
  if (!bracket?.groups?.content) return result;
  const ahead = /ahead (?<count>\d+)/.exec(bracket.groups.content);
  const behind = /behind (?<count>\d+)/.exec(bracket.groups.content);
  if (ahead?.groups?.count) result.ahead = Number(ahead.groups.count);
  if (behind?.groups?.count) result.behind = Number(behind.groups.count);
  return result;
}

async function readOptionalGitOutput(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

function gitEnvironment(settings: GitSyncSettings): NodeJS.ProcessEnv | undefined {
  const sshKeyPath = settings.sshKeyPath.trim();
  if (!sshKeyPath) return undefined;
  return {
    ...process.env,
    GIT_SSH_COMMAND: `ssh -i ${quoteSshCommandArg(sshKeyPath)} -o IdentitiesOnly=yes`
  };
}

function quoteSshCommandArg(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
