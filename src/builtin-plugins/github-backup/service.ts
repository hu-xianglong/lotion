import type { PluginStorageAPI, WorkspaceAPI } from "../../shared/plugin-api.js";
import type {
  DatabaseBundle,
  DatabaseRecord,
  DatabaseSummary,
  ID,
  PageDocument,
  PageMeta
} from "../../shared/types.js";
import type {
  GitHubBackupDiffLine,
  GitHubBackupPreview,
  GitHubBackupRunResult,
  GitHubBackupSettings,
  GitHubBackupStatus,
  GitHubBackupVersion
} from "../../shared/github-backup.js";

const STATUS_FILE = "github-backup-status.json";
const REMOTE_FILE = "github-backup-local-remote.json";

export const DEFAULT_GITHUB_BACKUP_SETTINGS: GitHubBackupSettings = {
  provider: "local_mock",
  repository: "",
  branch: "main",
  basePath: "lotion-backups"
};

export interface GitHubBackupFile {
  path: string;
  content: string;
  kind: "page" | "database" | "row_page" | "attachment_metadata";
  entityId?: ID;
  databaseId?: ID;
  rowId?: ID;
  title: string;
}

export interface GitHubBackupCommit {
  sha: string;
  message: string;
  createdAt: string;
  changedPaths: string[];
  fileCount: number;
}

export interface GitHubBackupAdapter {
  name: string;
  isConfigured(settings: GitHubBackupSettings): boolean;
  commitFiles(settings: GitHubBackupSettings, files: GitHubBackupFile[], message: string): Promise<GitHubBackupCommit>;
  listCommits(settings: GitHubBackupSettings, path: string): Promise<GitHubBackupCommit[]>;
  readFileAtCommit(settings: GitHubBackupSettings, path: string, sha: string): Promise<string | null>;
}

export interface GitHubBackupWorkspace
  extends Pick<WorkspaceAPI, "listPages" | "getPage" | "listDatabases" | "getDatabase" | "getRowPage" | "updatePage"> {}

export class GitHubBackupError extends Error {}
export class GitHubBackupConflictError extends GitHubBackupError {}
export class GitHubBackupRateLimitError extends GitHubBackupError {}

export class GitHubBackupService {
  constructor(
    private readonly workspace: GitHubBackupWorkspace,
    private readonly storage: PluginStorageAPI,
    private readonly adapter: GitHubBackupAdapter
  ) {}

  async status(settings: GitHubBackupSettings): Promise<GitHubBackupStatus> {
    const saved = await this.storage.readJson<GitHubBackupStatus>(STATUS_FILE);
    if (!this.adapter.isConfigured(settings)) {
      return {
        state: "not_configured",
        message: "Configure a GitHub repository before running backup."
      };
    }
    return saved ?? {
      state: "history_empty",
      message: "No GitHub backup has been created yet."
    };
  }

  async backupWorkspace(settings: GitHubBackupSettings, message?: string): Promise<GitHubBackupRunResult> {
    if (!this.adapter.isConfigured(settings)) {
      const status = {
        state: "not_configured",
        message: "Configure a GitHub repository before running backup."
      } satisfies GitHubBackupStatus;
      await this.storage.writeJson(STATUS_FILE, status);
      return { status, commitCreated: false, changedPaths: [] };
    }

    const files = await this.collectWorkspaceFiles(settings);
    let commit: GitHubBackupCommit;
    try {
      commit = await this.adapter.commitFiles(
        settings,
        files,
        message?.trim() || `Lotion backup ${new Date().toISOString()}`
      );
    } catch (error) {
      const status = {
        state: "failed",
        message: error instanceof Error ? error.message : String(error),
        fileCount: files.length
      } satisfies GitHubBackupStatus;
      await this.storage.writeJson(STATUS_FILE, status);
      return { status, commitCreated: false, changedPaths: [] };
    }
    const status = {
      state: "backed_up",
      message: commit.changedPaths.length > 0
        ? `Backed up ${commit.changedPaths.length} changed files.`
        : "No changes to backup.",
      lastBackupAt: commit.createdAt,
      lastCommitSha: commit.sha,
      fileCount: commit.fileCount
    } satisfies GitHubBackupStatus;
    await this.storage.writeJson(STATUS_FILE, status);
    return {
      status,
      commitCreated: commit.changedPaths.length > 0,
      changedPaths: commit.changedPaths
    };
  }

  async listPageHistory(settings: GitHubBackupSettings, pageId: ID): Promise<GitHubBackupVersion[]> {
    const page = await this.workspace.getPage(pageId);
    const path = pageBackupPath(settings, page.meta);
    const commits = await this.adapter.listCommits(settings, path);
    return commits.map((commit) => ({
      id: `${path}@${commit.sha}`,
      sha: commit.sha,
      message: commit.message,
      createdAt: commit.createdAt,
      path,
      title: page.meta.title,
      pageId
    }));
  }

  async previewPageVersion(settings: GitHubBackupSettings, pageId: ID, versionSha: string): Promise<GitHubBackupPreview> {
    const page = await this.workspace.getPage(pageId);
    const path = pageBackupPath(settings, page.meta);
    const selectedMarkdown = await this.adapter.readFileAtCommit(settings, path, versionSha);
    if (selectedMarkdown === null) {
      throw new GitHubBackupError(`Version ${versionSha} no longer contains ${path}.`);
    }
    const history = await this.listPageHistory(settings, pageId);
    const version = history.find((candidate) => candidate.sha === versionSha);
    if (!version) throw new GitHubBackupError(`Version ${versionSha} was not found in page history.`);
    return {
      version,
      selectedMarkdown,
      currentMarkdown: page.markdown,
      diff: diffLines(page.markdown, selectedMarkdown)
    };
  }

  async restorePageVersion(settings: GitHubBackupSettings, pageId: ID, versionSha: string): Promise<PageDocument> {
    const preview = await this.previewPageVersion(settings, pageId, versionSha);
    await this.workspace.updatePage(pageId, { markdown: preview.selectedMarkdown });
    return this.workspace.getPage(pageId);
  }

  async collectWorkspaceFiles(settings: GitHubBackupSettings): Promise<GitHubBackupFile[]> {
    const files: GitHubBackupFile[] = [];
    const [pages, databases] = await Promise.all([
      this.workspace.listPages(),
      this.workspace.listDatabases()
    ]);

    for (const page of pages) {
      const doc = await this.workspace.getPage(page.id);
      files.push({
        path: pageBackupPath(settings, doc.meta),
        content: doc.markdown,
        kind: "page",
        entityId: doc.meta.id,
        title: doc.meta.title
      });
      files.push({
        path: pageMetadataPath(settings, doc.meta),
        content: stableJson(doc.meta),
        kind: "page",
        entityId: doc.meta.id,
        title: `${doc.meta.title} metadata`
      });
    }

    for (const summary of databases) {
      const bundle = await this.workspace.getDatabase(summary.id);
      files.push({
        path: databaseBackupPath(settings, summary, "database.json"),
        content: stableJson({
          schema: bundle.schema,
          records: bundle.records,
          views: bundle.views
        }),
        kind: "database",
        entityId: summary.id,
        title: summary.name
      });
      for (const record of bundle.records) {
        const rowId = String(record.id ?? "");
        if (!rowId) continue;
        try {
          const rowPage = await this.workspace.getRowPage(summary.id, rowId);
          if (!rowPage.markdown.trim()) continue;
          files.push({
            path: rowPageBackupPath(settings, summary, record, rowPage),
            content: rowPage.markdown,
            kind: "row_page",
            entityId: rowPage.meta.id,
            databaseId: summary.id,
            rowId,
            title: rowTitle(record, rowPage.meta)
          });
        } catch {
          // Some rows legitimately have no materialized body yet.
        }
      }
    }

    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
}

export class StorageGitHubBackupAdapter implements GitHubBackupAdapter {
  readonly name = "Local mock GitHub";

  constructor(private readonly storage: PluginStorageAPI) {}

  isConfigured(settings: GitHubBackupSettings): boolean {
    return settings.provider === "local_mock" || Boolean(parseRepository(settings.repository));
  }

  async commitFiles(_settings: GitHubBackupSettings, files: GitHubBackupFile[], message: string): Promise<GitHubBackupCommit> {
    const remote = await this.readRemote();
    const changedPaths = files
      .filter((file) => remote.head[file.path] !== file.content)
      .map((file) => file.path);
    const now = new Date().toISOString();
    if (changedPaths.length === 0) {
      return {
        sha: remote.commits[0]?.sha ?? "empty",
        message: "No changes",
        createdAt: remote.commits[0]?.createdAt ?? now,
        changedPaths: [],
        fileCount: Object.keys(remote.head).length
      };
    }

    const nextHead = { ...remote.head };
    for (const file of files) nextHead[file.path] = file.content;
    const sha = makeCommitSha(`${message}\n${now}\n${changedPaths.join("\n")}\n${remote.commits.length}`);
    remote.commits.unshift({
      sha,
      message,
      createdAt: now,
      changedPaths,
      fileCount: Object.keys(nextHead).length,
      files: nextHead
    });
    remote.head = nextHead;
    await this.writeRemote(remote);
    return remote.commits[0];
  }

  async listCommits(_settings: GitHubBackupSettings, path: string): Promise<GitHubBackupCommit[]> {
    const remote = await this.readRemote();
    return remote.commits
      .filter((commit) => commit.changedPaths.includes(path))
      .map(({ files: _files, ...commit }) => commit);
  }

  async readFileAtCommit(_settings: GitHubBackupSettings, path: string, sha: string): Promise<string | null> {
    const remote = await this.readRemote();
    const commit = remote.commits.find((candidate) => candidate.sha === sha);
    return commit?.files[path] ?? null;
  }

  private async readRemote(): Promise<StoredRemote> {
    return (await this.storage.readJson<StoredRemote>(REMOTE_FILE)) ?? { commits: [], head: {} };
  }

  private async writeRemote(remote: StoredRemote): Promise<void> {
    await this.storage.writeJson(REMOTE_FILE, remote);
  }
}

export class GitHubRestBackupAdapter implements GitHubBackupAdapter {
  readonly name = "GitHub API";

  isConfigured(settings: GitHubBackupSettings): boolean {
    return settings.provider === "github_api" &&
      Boolean(parseRepository(settings.repository)) &&
      Boolean(settings.branch.trim()) &&
      Boolean(settings.token?.trim());
  }

  async commitFiles(settings: GitHubBackupSettings, files: GitHubBackupFile[], message: string): Promise<GitHubBackupCommit> {
    this.assertConfigured(settings);
    const changedPaths: string[] = [];
    let lastSha = "";
    for (const file of files) {
      const previous = await this.readHeadFile(settings, file.path);
      if (previous.content === file.content) continue;
      const result = await this.putFile(settings, file.path, file.content, message, previous.sha);
      changedPaths.push(file.path);
      lastSha = result.commitSha || lastSha;
    }
    return {
      sha: lastSha || "unchanged",
      message: changedPaths.length ? message : "No changes",
      createdAt: new Date().toISOString(),
      changedPaths,
      fileCount: files.length
    };
  }

  async listCommits(settings: GitHubBackupSettings, path: string): Promise<GitHubBackupCommit[]> {
    this.assertConfigured(settings);
    const repo = parseRepository(settings.repository);
    if (!repo) return [];
    const url = githubApiUrl(`/repos/${repo.owner}/${repo.name}/commits`, {
      sha: settings.branch.trim() || "main",
      path
    });
    const rows = await this.fetchJson<Array<{
      sha: string;
      commit?: { message?: string; author?: { date?: string } };
      files?: unknown[];
    }>>(settings, url);
    return rows.map((row) => ({
      sha: row.sha,
      message: row.commit?.message ?? row.sha,
      createdAt: row.commit?.author?.date ?? "",
      changedPaths: [path],
      fileCount: 1
    }));
  }

  async readFileAtCommit(settings: GitHubBackupSettings, path: string, sha: string): Promise<string | null> {
    this.assertConfigured(settings);
    const response = await this.fetchGitHub(settings, contentsUrl(settings, path, sha), { method: "GET" });
    if (response.status === 404) return null;
    const json = await parseGitHubResponse<{ content?: string; encoding?: string }>(response);
    if (!json.content) return null;
    return decodeBase64(json.content);
  }

  private assertConfigured(settings: GitHubBackupSettings): void {
    if (!this.isConfigured(settings)) {
      throw new GitHubBackupError("GitHub API backup requires repository, branch, and token.");
    }
  }

  private async readHeadFile(settings: GitHubBackupSettings, path: string): Promise<{ sha?: string; content?: string }> {
    const response = await this.fetchGitHub(settings, contentsUrl(settings, path, settings.branch), { method: "GET" });
    if (response.status === 404) return {};
    const json = await parseGitHubResponse<{ sha?: string; content?: string }>(response);
    return {
      sha: json.sha,
      content: json.content ? decodeBase64(json.content) : undefined
    };
  }

  private async putFile(settings: GitHubBackupSettings, path: string, content: string, message: string, sha?: string): Promise<{ commitSha?: string }> {
    const body: Record<string, unknown> = {
      message,
      content: encodeBase64(content),
      branch: settings.branch.trim() || "main"
    };
    if (sha) body.sha = sha;
    const json = await this.fetchJson<{ commit?: { sha?: string } }>(settings, contentsUrl(settings, path), {
      method: "PUT",
      body: JSON.stringify(body)
    });
    return { commitSha: json.commit?.sha };
  }

  private async fetchJson<T>(settings: GitHubBackupSettings, url: string, init?: RequestInit): Promise<T> {
    return parseGitHubResponse<T>(await this.fetchGitHub(settings, url, init));
  }

  private async fetchGitHub(settings: GitHubBackupSettings, url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${settings.token?.trim() ?? ""}`,
        ...(init.headers ?? {})
      }
    });
    if (response.status === 409) throw new GitHubBackupConflictError("GitHub reported a content conflict.");
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new GitHubBackupRateLimitError("GitHub API rate limit exceeded.");
    }
    return response;
  }
}

interface StoredRemote {
  commits: StoredCommit[];
  head: Record<string, string>;
}

interface StoredCommit extends GitHubBackupCommit {
  files: Record<string, string>;
}

export function createGitHubBackupService(
  workspace: GitHubBackupWorkspace,
  storage: PluginStorageAPI,
  settings: GitHubBackupSettings
): GitHubBackupService {
  const adapter = settings.provider === "github_api"
    ? new GitHubRestBackupAdapter()
    : new StorageGitHubBackupAdapter(storage);
  return new GitHubBackupService(workspace, storage, adapter);
}

export function normalizeGitHubBackupSettings(input: Partial<GitHubBackupSettings> | null | undefined): GitHubBackupSettings {
  return {
    provider: input?.provider === "github_api" ? "github_api" : "local_mock",
    repository: input?.repository?.trim() ?? "",
    branch: input?.branch?.trim() || DEFAULT_GITHUB_BACKUP_SETTINGS.branch,
    basePath: input?.basePath?.trim() || DEFAULT_GITHUB_BACKUP_SETTINGS.basePath,
    token: input?.token?.trim() || undefined
  };
}

export function pageBackupPath(settings: GitHubBackupSettings, page: PageMeta): string {
  return joinGitHubPath(settings.basePath, "pages", `${safeGitHubSegment(page.title)}--${safeGitHubSegment(page.id)}.md`);
}

export function pageMetadataPath(settings: GitHubBackupSettings, page: PageMeta): string {
  return joinGitHubPath(settings.basePath, "pages", `${safeGitHubSegment(page.title)}--${safeGitHubSegment(page.id)}.meta.json`);
}

export function databaseBackupPath(settings: GitHubBackupSettings, database: DatabaseSummary, fileName: string): string {
  return joinGitHubPath(
    settings.basePath,
    "databases",
    `${safeGitHubSegment(database.name)}--${safeGitHubSegment(database.id)}`,
    safeGitHubSegment(fileName)
  );
}

export function rowPageBackupPath(
  settings: GitHubBackupSettings,
  database: DatabaseSummary,
  record: DatabaseRecord,
  rowPage: PageDocument
): string {
  return joinGitHubPath(
    settings.basePath,
    "databases",
    `${safeGitHubSegment(database.name)}--${safeGitHubSegment(database.id)}`,
    "row-pages",
    `${safeGitHubSegment(rowTitle(record, rowPage.meta))}--${safeGitHubSegment(String(record.id ?? rowPage.meta.id))}.md`
  );
}

export function joinGitHubPath(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split("/"))
    .filter((part) => !/^\.*$/.test(part.trim()))
    .map(safeGitHubSegment)
    .filter(Boolean)
    .join("/");
}

export function safeGitHubSegment(value: string): string {
  const compact = value.trim()
    .replace(/[<>:"\\|?*\u0000-\u001F]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .slice(0, 96);
  return compact || "untitled";
}

export function diffLines(current: string, selected: string): GitHubBackupDiffLine[] {
  const currentLines = current.split(/\r?\n/);
  const selectedLines = selected.split(/\r?\n/);
  const max = Math.max(currentLines.length, selectedLines.length);
  const diff: GitHubBackupDiffLine[] = [];
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

function rowTitle(record: DatabaseRecord, meta: PageMeta): string {
  const title = record.title ?? record.Name ?? record.name ?? meta.title;
  return String(title || meta.title || record.id || "Untitled");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortJson(nested)])
  );
}

function parseRepository(value: string): { owner: string; name: string } | null {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value.trim());
  if (!match) return null;
  return { owner: match[1], name: match[2] };
}

function contentsUrl(settings: GitHubBackupSettings, path: string, ref?: string): string {
  const repo = parseRepository(settings.repository);
  if (!repo) throw new GitHubBackupError("GitHub repository must be owner/repo.");
  return githubApiUrl(`/repos/${repo.owner}/${repo.name}/contents/${path}`, ref ? { ref } : undefined);
}

function githubApiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(`https://api.github.com${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

async function parseGitHubResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GitHubBackupError(`GitHub API failed (${response.status}): ${text || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function encodeBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeBase64(text: string): string {
  return decodeURIComponent(escape(atob(text.replace(/\s+/g, ""))));
}

function makeCommitSha(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mock-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
