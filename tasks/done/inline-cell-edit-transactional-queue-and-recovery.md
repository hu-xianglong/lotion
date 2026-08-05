# Inline Cell Edit Transactional Queue and Recovery

Status: done

Verification status: verified

## Goal

Debug inline database cell persistence so rapid edits cannot race whole-bundle
writes, failures remain visible and recoverable, and retry or discard produces
an unambiguous stored and rendered result.

## Problems

- Cell renderers exposed a synchronous commit callback even though the parent
  performed asynchronous persistence. Rejection became an unhandled promise
  after the editor had already accepted its draft.
- A failed write left the draft visible while disk retained the old value, with
  no error, Retry, or Discard action.
- Independent cell commits could run concurrently even though each rewrites the
  complete database bundle, allowing rapid edits to overwrite one another.
- Duplicate commits and repeated Retry clicks had no synchronous guard.
- Existing interaction coverage exercised successful table configuration and
  reload, but not real cell-write rollback, ordering, retry, or discard.

## Acceptance Criteria

- Serialize accepted cell edits in submission order and never overlap bundle
  writes.
- Suppress duplicate active or queued inputs synchronously.
- Stop at the first failure, retain its exact input, pause later edits, and show
  the error plus queued count.
- Retry the failed head exactly once and resume later edits in order.
- Allow explicit discard of only the failed head, preserve the stored value,
  reset the editor draft, and resume any later work.
- Normalize arbitrary thrown values without creating unhandled rejections.
- Add real-source queue tests, service-level atomicity coverage, Electron
  failure/recovery evidence, and a negative artifact-contract test.
- Run typecheck, build, package/API, coverage, UI, task-doc, diff, and production
  visual gates and record exact results.

## Debugging

- Added one table-owned cell-edit queue around `cache.updateCell`. It acquires
  work synchronously, runs one operation at a time, deduplicates matching
  active/tail inputs, and resolves accepted UI promises only after submit or
  discard.
- A failed queue head is retained with its database, row, field, and value.
  Later edits remain queued and the table renders a local alert with Retry and
  `Discard failed edit`.
- Retry is single-flight and reuses the retained input. Discard removes only
  the failed input, remounts cell editors from the last stored props, and then
  resumes later queue entries.
- Removed an attempted cache-equality shortcut after the Electron test showed
  that it could report recovery before disk evidence existed. Deduplication is
  confined to queue inputs; every accepted persistence attempt reaches the
  service.
- Extended the real Electron interaction lab to inject a database bundle
  failure, edit a second row while recovery is unresolved, double-click Retry,
  poll the stored records in order, then inject another failure and prove
  Discard resets the draft without changing disk.
- Strengthened the persisted artifact contract to require rollback, visible
  queuing, duplicate-Retry suppression, ordered recovery, stored-value
  preservation, and draft reset, with a deliberate missing-evidence negative.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The queue contract covers serial execution,
  duplicate suppression, pending counts, raw-string failure normalization,
  paused later work, single-flight Retry, exact attempt order, and discard
  resumption. Build emitted only the existing large-chunk warning.
- `node --test test/database-grouping-artifacts.test.mjs
  test/ui-harness-artifacts.test.mjs` passed 116/116. The interaction negative
  changes ordered-resumption evidence to false and is rejected.
- `node --test test/package-core.test.mjs` passed 47/47. The focused database
  service regression injects typed `DATABASE_PERSISTENCE_FAILURE`, reloads the
  unchanged title, retries, and reloads the new title. `npm run
  test:customer-api` also passed 6/6.
- `npm run smoke:database-interaction-ui` passed desktop, compact, and wide.
  Each viewport proved the first failed title stayed unchanged on disk, the
  second edit paused, double Retry persisted both titles in order, and Discard
  preserved the recovered disk value while resetting the visible draft.
  Existing settings/filter/sort persistence and reload behavior remained
  covered. Evidence:
  `artifacts/ui-smoke/database-interaction-ui-2026-07-24T01-19-07-868Z/`
  (9 screenshots, 1,150,261 bytes; committed desktop/compact settings
  baselines had zero changed pixels).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.42% lines/statements, 27.27% functions, and 66.53% branches.
  `DatabaseTable.tsx` recorded 48.58% lines, 18.13% functions, and 56.02%
  branches.
- `npm run test:task-docs` passed with 697 files, 823 task references, and 685
  queue items; `git diff --check` passed.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,691,947 image bytes. The gate recorded the promoted
  coverage baseline in
  `artifacts/ui-smoke/ui-suite-2026-07-24T01-21-05-501Z/production-visual-gate/production-visual-gate.json`.
