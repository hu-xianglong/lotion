import type { ID } from "./types.js";

export type GitHubBackupProvider = "local_mock" | "github_api";

export interface GitHubBackupSettings {
  provider: GitHubBackupProvider;
  repository: string;
  branch: string;
  basePath: string;
  token?: string;
}

export type GitHubBackupState =
  | "not_configured"
  | "backing_up"
  | "backed_up"
  | "failed"
  | "history_empty";

export interface GitHubBackupStatus {
  state: GitHubBackupState;
  message: string;
  lastBackupAt?: string;
  lastCommitSha?: string;
  fileCount?: number;
}

export interface GitHubBackupVersion {
  id: string;
  sha: string;
  message: string;
  createdAt: string;
  path: string;
  title: string;
  pageId: ID;
}

export interface GitHubBackupDiffLine {
  type: "same" | "added" | "removed";
  text: string;
}

export interface GitHubBackupPreview {
  version: GitHubBackupVersion;
  selectedMarkdown: string;
  currentMarkdown: string;
  diff: GitHubBackupDiffLine[];
}

export interface GitHubBackupRunResult {
  status: GitHubBackupStatus;
  commitCreated: boolean;
  changedPaths: string[];
}
