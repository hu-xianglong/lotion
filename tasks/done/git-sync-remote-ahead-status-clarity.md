# Git Sync Remote-Ahead Status Clarity

Status: done

## Source

Split from `tasks/todo/git-sync-plugin.md` conflict policy.

## Goal

Make the Git Sync status pill clearly show when a clean workspace is behind the
remote or has diverged history, instead of displaying a misleading clean state.

## Acceptance

- A clean repo with `behind > 0` shows `Sync needed` with a warning style.
- A clean repo with both `ahead > 0` and `behind > 0` shows `Diverged` with a
  warning style.
- A clean repo with `ahead > 0` and `behind === 0` shows `Ready to push`.
- Dirty working trees continue to prioritize the local changed-files warning.
- Renderer coverage exercises the conflict-facing status labels without running
  network or Git operations.

## Verification

- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Result

- Git Sync now shows `Sync needed` for a clean repo behind the remote.
- Git Sync now shows `Diverged` for a clean repo that is both ahead and behind.
- Git Sync now shows `Ready to push` for a clean repo that is only ahead.
- Dirty worktrees continue to show the local changed-file count first.
- Renderer component coverage locks all four user-visible states without
  invoking Git or network operations.
