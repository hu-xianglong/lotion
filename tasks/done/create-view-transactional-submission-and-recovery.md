# Create View Transactional Submission And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Create View dialog so duplicate submits and
persistence failures cannot create duplicate views or surface as unhandled
promises.

## Problems

- The dialog guards submission with React `saving` state. Two submit events in
  the same event loop can both observe the old `false` value and call
  `onCreate`.
- The form invokes `void submit()`, while `submit` does not catch `onCreate`
  rejection. A persistence failure leaves the dialog mounted but emits an
  unhandled rejection and provides no user-visible recovery message.
- Close, Cancel, Escape, and backdrop actions remain available during an
  in-flight create, allowing the dialog to disappear while mutation state is
  unresolved.
- The real source has only 5.81% renderer line coverage despite being a
  user-facing schema workflow.

## Acceptance Criteria

- Add a synchronous single-flight guard that rejects duplicate in-flight
  submissions before calling `onCreate`.
- Catch and display readable create failures without closing the dialog.
- Re-enable retry after failure and close only after success.
- Block close/cancel/backdrop/Escape while a create is in flight.
- Add real-source renderer tests for initial dialog content, generated names,
  success, duplicate suppression, failure normalization, and retry.
- Extend the Electron multi-view smoke with injected write failure, two
  synchronous submit events, no accidental view, visible alert, and successful
  retry creating exactly one view.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move to done/verified.

## Debugging

- Reproduced the same-tick race in a direct real-source contract: React state
  had not committed before a second submission, so both calls could enter
  `onCreate`.
- Moved exclusion to a synchronous ref guard and kept React state for visible
  busy/disabled feedback. Backdrop, Escape, Close, and Cancel now consult the
  same guard while persistence is unresolved.
- Wrapped `onCreate` so Error and non-Error rejections become a visible
  `role="alert"` message, the guard always resets, and `onClose` runs only after
  success.
- The first Electron attempt exposed a harness bug: create uses the atomic
  database-bundle writer, while the smoke initially armed the single-view patch
  writer. Switching to `failNextDatabaseBundleWrite` made the failure
  deterministic and verified the intended persistence boundary.
- The recovered view became active, revealing an old smoke assumption that
  duplicate-view verification always started from Default. The smoke now
  explicitly selects Default before checking copied sorts and fields.
- The core gate exposed an unrelated test-isolation bug: an LLM test used
  `window` without installing it and asserted before asynchronous chat state
  settled. The test now owns/restores its fake window and waits for the initial
  prompt.

## Verification

- `npm run test:renderer-components` passed. The direct contract proves the
  first submission returns `submitted`, the same-tick second returns `ignored`,
  `onCreate` is called once, saving transitions once, failures stay open, and a
  retry succeeds.
- `node --test test/ui-harness-artifacts.test.mjs` passed 113/113, including a
  positive database multi-view recovery contract and a negative contract that
  rejects missing duplicate-suppression evidence.
- `npm run smoke:database-multi-view-ui` passed desktop and compact. Artifact:
  `artifacts/ui-smoke/database-multi-view-ui-2026-07-23T21-43-34-094Z/`.
  Each viewport recorded zero views after injected failure and exactly one
  after retry; its two screenshots total 195,862 bytes.
- `npm run test:renderer-coverage` passed with exact 66-file inventory and
  64 covered files. Aggregate coverage is 63.53% lines/statements, 25.28%
  functions, and 63.98% branches. `CreateViewDialog.tsx` is 86.71% lines and
  78.57% branches.
- `node --test test/package-core.test.mjs` passed 45/45 after the isolated LLM
  test fix. `npm run typecheck` and `npm run build` passed.
- `npm run test:production-visual` passed. Artifact:
  `artifacts/ui-smoke/ui-suite-2026-07-23T21-45-28-063Z/production-visual-gate/production-visual-gate.json`.
  It records 16/16 suites, 79 screenshots, 48 strict zero-diff baselines,
  8,690,872 image bytes, zero console errors, and zero missing contracts.
- `npm run test:task-docs` passed after aligning the queue and verified task
  record. `git diff --check` passed.
