# Restore Clean-Checkout Quality Gate

Status: done

Verification status: verified

## Goal

Make the release quality gate pass from a clean Node 22 checkout without
committing the generated 183 MB `db_rows_500k` CSV or weakening validation for
normal workspace databases.

## Root Causes

- The demo workspace tracks the 500K database schema and views, but its
  generated CSV is intentionally ignored because it exceeds GitHub's file-size
  limit. Local workspaces hid the clean-checkout failure by retaining the file.
- The complete release run exposed real disposal/startup races in search and
  database services that focused local runs did not exercise reliably.
- Electron suites leaked locale, date/time, popover, and process state between
  shared-harness scenarios. Several assertions also sampled React or filesystem
  state before the corresponding mutation had settled.
- Most committed visual baselines predated the current UI. A few rounded modal
  edges additionally composite against live workspace pixels, so only those
  explicitly bounded corner regions are excluded while content remains at a
  zero-pixel budget.

## Implementation

- Added `--allow-missing-generated-data <database-id>` to both workspace
  validators and configured fixture commands to allow only `db_rows_500k`.
  Schema, view, and manifest validation still run; every other partial database
  still fails.
- Added positive, absent-allowlist, and wrong-ID regression coverage for the
  generated-data exception.
- Closed search startup and customer/database disposal races, with regression
  coverage for concurrent teardown and late async completion.
- Made the UI harness terminate complete process groups and isolate locale,
  date/time, selection, popover, and workspace state. Database, editor, search,
  embedded-view, page-history, and settings scenarios now wait on observable
  idle/persistence contracts instead of fixed timing assumptions.
- Fixed the row-delete keyboard/menu state, page-history hash normalization,
  URL tab behavior, startup recents restoration, plugin modal sizing API, and
  other product defects exposed by the gate rather than masking them in tests.
- Re-captured stale production baselines after inspecting the intended current
  UI, retained strict zero-pixel comparisons, strengthened the mutation test to
  reject a visible 5x5 change, and limited antialias exceptions to documented
  modal corner regions.

## Verification

- A Git-archive checkout at `/tmp/lotion-ci-fixed.nnxqQL` used Node 22.22.0 and
  a clean dependency install. `npm run test:workspace` passes without the
  ignored 500K CSV.
- The focused validator suite proves a schema-only database fails with no
  allowlist and with a different ID, then passes only when its exact ID is
  explicitly allowed.
- The final `npm run release:gate -- --allow-dirty` exited successfully in the
  clean checkout with all seven gates passed: `test:fast`, typecheck,
  package/plugin coverage, complete UI regression, complete production visual,
  build, and `git diff --check`. Its manifest is
  `artifacts/test-releases/lotion-test-2026-08-08T18-17-29-629Z-dfabd5c/release-manifest.json`.
  Package runtime coverage was 84.8% (14,164/16,697); builtin-plugin coverage
  was 84.1% (2,422/2,879).
- The complete UI regression suite passed after 789.738 seconds. Focused shared
  process reruns also passed Settings -> Created Views, wide Created Views,
  Search & AI wide, and GitHub Backup across desktop/compact/wide with strict
  zero-pixel content comparisons.
- Production baseline mutation and policy tests passed 27/27. Renderer coverage
  passed with 68/71 source files covered, 75.58% lines/statements, 31.43%
  functions, and 69.03% branches, all above the verified historical baseline.
- The full production visual sequence passed all 16 required suites and all
  desktop/compact/wide contracts. The final tail contract from GitHub Backup
  through Notion Import, Settings, Plugin Manager, LLM Chat, and Advanced Search
  exited successfully after the refreshed GitHub Backup baselines repeated at
  zero differing pixels.
- `npm run test:task-docs` and `git diff --check` pass before publication.
