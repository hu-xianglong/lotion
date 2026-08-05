# Bulk Row Actions Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug Database Table bulk Apply, Duplicate, and Delete so each accepted action
is single-flight, atomic persistence failures remain visible and safely
retryable, and a repeated or competing click cannot mutate rows after the UI
has reported failure.

## Problems

- Bulk actions relied on asynchronous React state and did not acquire a
  synchronous guard. A second same-tick click could enter persistence before
  the first render disabled anything.
- Buttons, the Apply field selector, and Clear remained active while a batch
  mutation was pending, so another action could replace the user's intended
  operation.
- Thrown persistence failures produced feedback but retained no accepted input
  or Retry path.
- A naïve Retry implementation would be unsafe for service-returned partial
  results: valid rows may already have committed even though other rows failed.
- Existing coverage proved normal bulk selection and actions, but did not
  inject an atomic batch-write failure or prove rollback, duplicate
  suppression, selection retention, and exactly-once recovery.

## Acceptance Criteria

- Route Apply, Duplicate, and Delete through one synchronous single-flight
  guard with a single pending owner.
- Disable the complete bulk-action surface and mark it busy while persistence
  is pending.
- Normalize thrown values into a visible local failure and retain the exact
  accepted action, input, and success message for Retry.
- Ignore repeated and competing actions without replacing the Retry target.
- Offer Retry only for thrown atomic failures. Keep partial-result feedback
  non-retryable so already committed rows are never replayed.
- Reset the guard in `finally` and clear stale recovery state after success or
  explicit dismissal.
- Add real-source coverage for concurrency, pending ownership, arbitrary
  failure normalization, guard reset, success, Retry, and partial results.
- Inject a real two-row duplicate persistence failure in desktop and compact
  Electron flows, proving rollback, retained selection, duplicate suppression,
  and exactly-once Retry.
- Extend persisted artifact and direct service contracts with explicit
  rollback evidence and negative cases.
- Run focused/core/coverage/UI/typecheck/build/task-doc/diff and full production
  visual gates, recording exact evidence.

## Debugging

- Added a shared bulk-action runner whose ref guard is acquired synchronously
  before awaiting. Pending state identifies the accepted Apply, Duplicate, or
  Delete action, while `finally` always releases the guard.
- Retained the accepted input and success message only when an operation throws
  atomically. Retry reuses that immutable operation, and ignored same-tick or
  competing clicks cannot replace it.
- Kept service-returned row errors on a separate feedback path with no Retry.
  This preserves accurate partial-result reporting without risking duplicate
  work for rows that already committed.
- Wrapped the toolbar in a disabled, busy fieldset, supplied operation-specific
  pending labels, and guarded the field selector, Clear, Retry, and dismiss
  controls against same-tick interaction.
- Extended renderer-component coverage against the real `DatabaseTable`
  helpers, including a raw-string rejection and a partial-result contract.
- Extended the existing bulk-selection Electron scenario to arm an atomic
  bundle-write failure before a two-row Duplicate, double-click Duplicate,
  reload the database to prove rollback, and double-click Retry to prove
  exactly-once recovery.
- Strengthened the artifact validator with required failure message, retained
  selection, rollback, duplicate-suppression, and exactly-once evidence.
- Added a direct service regression that injects the same typed persistence
  failure and reloads 200 unchanged rows with zero copies before continuing the
  normal batch contract.

## Verification

- `npm run typecheck` and `npm run test:renderer-components` passed. The
  real-source contract covers same-tick suppression, pending ownership,
  raw-string failure normalization, guard reset, Retry, success feedback, and
  non-retryable partial results.
- Focused artifact and direct-service tests passed, and the full
  `node --test test/package-core.test.mjs` gate passed 45/45. The service test
  required `DATABASE_PERSISTENCE_FAILURE` and reloaded 200 rows with zero
  duplicates after the injected failure.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-bulk-selection-ui` passed. Both viewports surfaced
  `Injected bulk row persistence failure`, retained both selected rows, proved
  the stored database remained at 160 rows with zero copies, suppressed the
  repeated submit, and recovered to exactly two copies after repeated Retry.
  Evidence:
  `artifacts/ui-smoke/database-bulk-selection-ui-2026-07-24T00-24-47-120Z/`
  (2 screenshots, 401,000 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.21% lines/statements, 26.77% functions, and 65.97% branches.
  `DatabaseTable.tsx` recorded 45.24% lines, 14.20% functions, and 49.78%
  branches.
- `npm run build` passed; its only diagnostic was the existing large-chunk
  warning.
- `npm run test:production-visual` passed the full production gate: 16 required
  suites, 79 screenshots, 48 perceptual baselines, and 8,690,887 image bytes.
  Every perceptual comparison passed at zero diff. The embedded post-promotion
  coverage gate matched this task's baseline exactly at 64.21%
  lines/statements, 26.77% functions, and 65.97% branches. Gate evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T00-26-45-312Z/production-visual-gate/production-visual-gate.json`.
