# GitHub REST Backup Adapter Mocked HTTP Regression

Status: done

## Why

The GitHub Backup service has local mock coverage, but the GitHub API adapter
also owns important behavior: reading existing content, writing changed files,
listing page history, reading versions, and surfacing conflict/rate-limit
errors. This is now covered without calling real GitHub.

## Changes

- Added deterministic mocked-`fetch` package-core coverage for
  `GitHubRestBackupAdapter`.
- Asserted unchanged files are skipped, changed files are PUT with the existing
  GitHub content `sha`, and commit metadata reports changed paths.
- Covered commit history listing and version reads through the GitHub contents
  API, including base64 decode behavior.
- Covered 409 conflict and 403 rate-limit responses mapping to typed backup
  errors.

## Verification

- `node --check test/package-core.test.mjs`
- `npm exec -- tsc -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `npm run typecheck`
- `git diff --check`
