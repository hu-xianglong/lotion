# GitHub Backup Page History Redesign

Status: done

## Decision

Git history / page restore is a high-priority product surface. It should be
available from the page experience, not only from GitHub Backup settings, and
it must work with local Git history even when no remote repository is
configured.

## Why

The GitHub Backup UI is currently hard to use and visually weak. The feature
also treats history as a backup/settings concern, but page version history
should be available from the page itself and should work even when the user has
not configured a remote Git repository.

## Requirements

- Redesign the GitHub Backup / Git Sync front end so status, actions, and
  settings are clear, compact, and consistent with the rest of the app.
- Use local Git history as the source for page history versions even when
  there is no remote repository.
- Put history viewing in the page experience, not only in plugin/settings UI.
- Let users inspect historical versions for the active page and restore or copy
  content through an explicit action.
- Provide a page-level diff viewer that makes changed lines readable before
  restore.
- Show per-page backup/history status, including local-only, remote synced,
  stale, conflict, and no-history states.
- Keep remote GitHub setup optional. A local-only repository should still
  provide useful version history.
- When a remote Git repository is configured, expose push frequency and squash
  frequency controls.
- Before any squash/rewrite operation, confirm that local and remote state have
  no conflict:
  - the working tree is not unexpectedly dirty,
  - remote status has been fetched,
  - local and remote are not behind/diverged,
  - the user explicitly confirms the destructive rewrite/force-push path.
- Use an isolated private repository such as `git@github.com:example/lotion-git-test.git` as the test remote for
  manual/automated coverage where a real remote is needed.

## UX Notes

- History belongs near the page editor/page detail surface, not buried inside
  settings.
- The backup settings page should focus on repository setup, status, frequency,
  and maintenance actions.
- Avoid token/mock GitHub API concepts as the main flow; this feature should be
  grounded in the workspace Git repository.
- Conflict states need plain user-facing copy and should stop automation rather
  than trying to auto-resolve.
- Expose read-only page-history metadata in a way that future AI Q&A can use as
  source citations without being allowed to restore automatically.

## Non-goals

- Do not auto-resolve Git conflicts.
- Do not force-push or rewrite history without explicit confirmation.
- Do not require a remote repository for local page history.
- Do not move unrelated page/editor UI while redesigning this surface.

## Suggested Slices

1. Create the UI design and task split for page history plus backup settings.
2. Add/verify local Git history APIs for page-level version listing and preview.
3. Add the page-level history UI and focused renderer coverage.
4. Add remote push frequency and squash frequency settings.
5. Add squash preflight conflict checks and confirmation flow.
6. Smoke test with an isolated private test remote.

## Acceptance

- A local Git repository with no remote can show page history versions.
- The active page has an in-page history/version viewer.
- The active page has a readable diff preview before restore.
- Page-level history status is visible without opening plugin settings.
- The GitHub Backup/Git Sync settings UI is visually redesigned and no longer
  serves as the only place to view history.
- Remote-backed workspaces can configure push frequency and squash frequency.
- Squash refuses to proceed when local/remote conflict checks fail.
- Squash requires explicit confirmation before any history rewrite or
  force-with-lease push.
- Focused renderer tests and Git service tests cover the main local history,
  remote frequency, and squash preflight behavior.

## Gates

- Renderer component coverage for the redesigned backup settings UI.
- Renderer/component or UI smoke coverage for the page history viewer.
- Git service tests for local history listing/preview and squash preflight.
- Manual or automated remote smoke against an isolated private test remote.
- `npm run typecheck`
- `git diff --check`

## Result

- Added local Git page-history APIs for listing versions, previewing diffs,
  restoring page body content, and checking squash safety before destructive
  history maintenance.
- Surfaced local page history in the page secondary panel with refresh,
  backup-now, version selection, diff preview, and explicit restore flow.
- Tightened GitHub Backup/Git Sync plugin behavior so unconfigured remotes
  show clear local-only states instead of throwing page errors, and added
  squash safety preflight affordances.
- Added package-core Git service coverage for file history, preview, restore,
  path safety, and squash preflight states.
- Added renderer coverage for the page history panel and redesigned backup
  controls, plus a multi-viewport GitHub backup/page-history UI smoke using an
  isolated local Git workspace.

## Verification

- `node --check scripts/smoke-github-backup-ui.mjs`
- `node --check scripts/test-renderer-components.mjs`
- `npm run typecheck`
- `npm run test:renderer-components`
- `npm exec -- tsc -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `npm run smoke:github-backup-ui`
- `git diff --check`
