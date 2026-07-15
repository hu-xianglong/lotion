# Renderer Component GitHub Backup Empty And Failure States

Status: done

## Why

The GitHub Backup panel had renderer coverage for the configured happy path
with history and restore preview. It also needed deterministic coverage for
states users see when setup is incomplete or GitHub backup fails: failed,
missing connection values, no active page, and active page history empty.

## Changes

- Added static renderer fixtures for:
  - GitHub API selected with missing repository/token and failed status.
  - Active page with no backed-up versions and no restore preview.
- Asserted the error/status pill, connection controls, GitHub API token hint,
  no-active-page helper, empty history helper, accessible history list, refresh
  action, and absence of stale restore preview/version controls.

## Backend Tests

No backend tests were added because this item only extends static renderer
coverage for existing GitHub Backup UI states. GitHub service/adapter behavior
is covered separately by package-core tests.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
