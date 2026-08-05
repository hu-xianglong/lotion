# Database View Order Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug Database View Tabs drag reorder so one user operation produces at most
one persistence write, atomic failures preserve the complete stored order and
remain visibly retryable, and competing view operations cannot invalidate the
retained recovery request.

## Problems

- The reorder callback discarded the `reorderViews` promise with `void`, so a
  rejected filesystem write produced no local feedback or recovery path.
- View tabs acquired no synchronous guard. Two same-tick drops could both enter
  persistence; after the first injected failure, the second request could
  succeed and silently mutate disk despite the failed interaction.
- Drag, New view, view menus, switching, and display controls remained active
  during persistence and after an unresolved failure.
- The existing view-write debug hook only ran for a single `writeView`; the
  `writeViews` path used by reorder could not be failed before its first file
  write, leaving atomic rollback unverified.
- Existing multi-view coverage proved normal reorder and reload persistence,
  but not failure visibility, unchanged revisions, duplicate suppression, or
  exactly-once Retry.
- The multi-view smoke dispatched its open-entity event before startup had
  always settled, causing intermittent initial-navigation timeouts unrelated to
  the feature under test.

## Acceptance Criteria

- Route drag reorder through a synchronous single-flight guard.
- Normalize arbitrary thrown values into visible local failure feedback.
- Retain the exact accepted view order and expose Retry after atomic failure.
- Disable the complete view-tab fieldset during persistence and until an
  unresolved failure is retried or dismissed.
- Ignore repeated drops and Retry clicks without replacing the retained order.
- Release the guard in `finally`, clear recovery state on success or explicit
  dismissal, and expose accurate busy state.
- Make the view-write fault hook fail a multi-view write before any file is
  touched.
- Add real-source coverage for same-tick suppression, raw and typed errors,
  pending transitions, guard reset, Retry, and blocking policy.
- Inject a real reorder failure in desktop and compact Electron flows and prove
  stored order plus all revisions are unchanged before exactly-once recovery.
- Require that rollback and recovery evidence in the persisted artifact
  contract, including a deliberate missing-evidence negative.
- Run focused/core/coverage/UI/typecheck/build/task-doc/diff and full production
  visual gates, recording exact evidence.

## Debugging

- Added a shared view-order runner that acquires a ref synchronously before
  awaiting, normalizes failures, and releases its guard in `finally`.
- Retained a copy of the accepted view-id sequence. Retry reuses that sequence;
  ignored same-tick drops or Retry clicks cannot replace it.
- The initial disabled-fieldset implementation added `aria-busy`, but the
  production visual gate caught its one-pixel embedded-table layout
  shift, so the final implementation preserves the original `div` geometry,
  marks it inert/disabled, and explicitly disables native controls and
  draggable tabs. Retry and dismiss remain outside that control surface.
- Replaced the fire-and-forget parent callback with an awaited promise so
  failure reaches the local transaction runner.
- Centralized consumption of the next view-write failure and invoked it before
  `writeViews` creates or updates any file. The hook remains shared with
  single-view persistence.
- Extended the real-source renderer contract with concurrent, raw-string,
  typed-Error, retry, and control-blocking cases. Coverage initially detected a
  0.06-point branch regression; the missing typed-error and blocking-policy
  branches were added rather than weakening the verified baseline.
- Extended the multi-view Electron smoke to double-drop under injected failure,
  compare every stored id and revision, double-click Retry, and require one
  revision increment per view.
- Stabilized the scenario's initial navigation by waiting for startup teardown
  and clicking the real Tasks sidebar entry before asserting the database.
- Strengthened the multi-view artifact validator with failure message,
  blocked-controls, order/revision rollback, duplicate-drop suppression, and
  exactly-once recovery evidence.

## Verification

- `npm run typecheck` and `npm run test:renderer-components` passed. The
  real-source contract covers same-tick suppression, pending ownership,
  raw-string and typed-Error normalization, guard reset, Retry, and idle,
  pending, and unresolved-recovery control policy.
- `node --test test/database-multi-view-artifacts.test.mjs
  test/ui-harness-artifacts.test.mjs` passed 115/115, including a negative that
  removes revision-rollback evidence.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-multi-view-ui` passed. Both viewports surfaced
  `Injected view reorder failure`, blocked competing controls, preserved the
  entire stored order and every revision after double drop, then incremented
  every revision exactly once after double Retry. Normal overflow, keyboard
  focus, sidebar views, reload order, and Create View failure recovery remained
  covered. Evidence:
  `artifacts/ui-smoke/database-multi-view-ui-2026-07-24T00-42-57-785Z/`
  (2 screenshots, 194,099 bytes).
- The direct service regression required typed
  `DATABASE_PERSISTENCE_FAILURE`, then reloaded the unchanged order and revision
  vector before normal reorder. The full `node --test
  test/package-core.test.mjs` gate passed 45/45.
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.24% lines/statements, 26.83% functions, and 66.02% branches.
  `DatabaseChrome.tsx` recorded 73.93% lines, 32.14% functions, and 57.14%
  branches.
- `npm run build` passed; its only diagnostic was the existing large-chunk
  warning.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,692,489 image bytes. The gate recorded renderer coverage
  at 64.24% lines/statements, 26.83% functions, and 66.02% branches in
  `artifacts/ui-smoke/ui-suite-2026-07-24T00-43-44-534Z/production-visual-gate/production-visual-gate.json`.
