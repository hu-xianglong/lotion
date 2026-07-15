# GitHub-Backed Page History And Workspace Backup

Status: done

## Scope

Use GitHub as a backup and history backend for Lotion workspaces/pages. Keep a
narrow GitHub service/integration boundary instead of scattering `gh` or API
calls through UI code.

## Product Behavior

- Detect/configure GitHub auth.
- Configure repo, branch, and backup path.
- Sanitize all GitHub paths.
- Use predictable commit messages.
- Map local Lotion content to GitHub backup paths for pages, databases, and
  attachment metadata where in scope.
- Support manual backup first, with automatic backup as a follow-up path.
- Show clear UI states:
  - not configured,
  - backing up,
  - backed up,
  - failed,
  - history empty.
- Page history should list versions/commits for a page.
- Page history should preview diffs and restore prior content safely.
- Handle conflicts, network/API failures, rate limits, and idempotent backups.

## Test And Safety Constraints

- Normal tests must not require real GitHub; use mocked/fake GitHub adapters for
  deterministic backend/package-core coverage.
- Any real GitHub integration smoke must be explicitly guarded by an environment
  flag or existing authenticated GitHub context.
- Real GitHub smoke must use only an isolated test repo or isolated timestamped
  folder/path such as `lotion-integration-tests/<run-id>/...`.
- Never write test artifacts into user content paths.
- Git does not track empty folders, so real integration smoke should create a
  small marker/content file under the isolated path.
- Clean up if feasible. If cleanup is intentionally skipped for auditability,
  record the exact path.

## Tests

- Service/backend/package-core tests with mocked GitHub adapter for:
  - path mapping,
  - commit create/update,
  - history listing,
  - diff/restore,
  - conflict handling,
  - error/rate-limit handling,
  - idempotency.
- Coded UI smoke/regression tests for:
  - configuring or detecting GitHub backup,
  - running backup,
  - seeing backup status,
  - opening page history,
  - previewing/selecting a version,
  - restore confirmation.
- Optional real GitHub integration smoke under an explicit guard. Record why it
  could not run if unavailable.

## Gates

- `npm run typecheck`
- Mocked GitHub service/package-core tests
- Focused GitHub backup/history UI smoke
- `git diff --check`

## Result

- Added a built-in `GitHub Backup` plugin with a narrow service/adapter
  boundary for workspace backup, page history listing, diff preview, and safe
  page restore.
- Added path sanitization and deterministic backup mapping for page markdown,
  page metadata, database bundle snapshots, and non-empty row-page bodies.
- Added a local mock GitHub adapter as the default safe/offline provider so
  regular tests and local validation do not hit GitHub or create user repo
  artifacts.
- Added a GitHub REST adapter boundary for owner/repo, branch, path, token,
  commit, history, and file-at-commit reads. Real GitHub integration smoke is
  intentionally not run by default; it still needs an explicit authenticated
  env-gated follow-up before touching a real isolated repo/path.
- Added package-core coverage for path mapping, commit/update behavior,
  idempotent backups, history listing, diff/restore, and conflict/rate-limit
  failure status.
- Added multi-resolution UI smoke coverage for configuring the plugin, running
  backup, seeing status/history, previewing a version, confirming restore, and
  showing the not-configured GitHub API state.

Verified:

- `npm exec -- tsc -p tsconfig.main.json && node --test test/package-core.test.mjs`
- `npm run smoke:github-backup-ui`
- `npm run typecheck`
