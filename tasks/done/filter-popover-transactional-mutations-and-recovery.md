# Filter Popover Transactional Mutations And Recovery

Status: done

Verification status: verified

## Goal

Debug the active Filter Popover so view-filter persistence is single-flight,
failures are visible and retryable, and pending or debounced work cannot be
silently lost when the popover is dismissed.

## Problems

- `FilterPopover` types `onChange` as a synchronous callback even though the
  active database mutation is asynchronous.
- `DatabaseTable` discards filter mutation rejections through
  `runViewMutation`, leaving the popover without actionable recovery.
- Immediate controls have no synchronous guard, so same-tick activation can
  submit overlapping view writes.
- Debounced text changes are flushed from effect cleanup into an unobserved
  Promise; closing can therefore hide a failed write.
- The existing created-views smoke proves global save-status rollback, but not
  retained filter draft, local error, safe dismissal, duplicate suppression, or
  explicit retry.

## Acceptance Criteria

- Route valid filter writes through a synchronous single-flight helper and
  propagate the real persistence Promise from `DatabaseTable`.
- Retain the current filter draft with a readable local alert on failure and
  expose an explicit retry action.
- Disable competing filter controls and block dismissal while persistence is
  pending.
- Flush a queued debounced value before dismissal, closing only after that
  persistence succeeds; retain the popover on failure.
- Preserve invalid-expression editing without issuing persistence writes.
- Add real-source tests for success, failure normalization, same-tick duplicate
  suppression, retry, and idle-only dismissal.
- Extend the created-views Electron smoke with an injected view-write failure,
  same-tick duplicate submission, unchanged persisted filter, visible retained
  recovery, and retry producing exactly one committed filter value.
- Strengthen artifact validation with positive and negative recovery proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed the active filter callback discarded its persistence Promise through
  `runViewMutation`. Debounced input cleanup could therefore start a hidden
  write after the popover had already unmounted, while immediate mutations had
  no synchronous guard and failures exposed only the distant view-save status.
- Changed the filter contract to propagate the real Promise from
  `DatabaseTable`, added one synchronous mutation guard with normalized errors,
  pending transitions and explicit retry, and disabled the complete filter
  control fieldset while a write is active.
- Replaced unmount-time background flushing with an owned dismissal path.
  Escape and outside click now block during an active write; a queued debounced
  expression is flushed before closing, and persistence failure retains the
  popover, draft and local alert.
- Extended the existing created-views persistence scenario at the real
  `views:patch` boundary. It now proves successful debounce-close flushing,
  injected-write rollback, retained draft, same-tick Retry suppression, pending
  Escape/outside-click blocking and exactly-one revision on recovery.
- Strengthened the persisted artifact contract with required recovery fields
  and focused positive plus rollback/exactly-once negative tests.

## Verification

- `npm run test:renderer-components` passed real-source contracts for pending
  dismissal blocking, synchronous duplicate suppression, success, raw failure
  normalization, guard reset and retry.
- `node --test test/database-filter-recovery-artifacts.test.mjs` passed 3/3:
  complete evidence plus missing-rollback and missing-exactly-once negatives.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-created-views-ui` passed. In both viewports it flushed
  `Queued filter close` before Escape dismissal, injected `Injected view
  persistence failure`, proved persisted revision/value stayed unchanged and
  the draft/error remained visible, invoked Retry twice synchronously while
  dispatching Escape and outside mousedown, then observed exactly one revision
  and one recovered value. Evidence:
  `artifacts/ui-smoke/database-created-views-ui-2026-07-23T23-10-28-984Z/`
  (2 screenshots, 100,526 bytes).
- Renderer coverage passed with 64/66 source files executed. Aggregate coverage
  stayed at 64.08% lines/statements and rose from 26.25% to 26.31% functions
  and 65.31% to 65.41% branches. `FilterPopover.tsx` recorded 66.53% lines,
  25.71% functions and 66.66% branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run typecheck`, `npm run
  build`, and `git diff --check` passed; build emitted only the existing chunk
  size advisory.
- `npm run test:production-visual` passed 16 required suites, 79 screenshots,
  8,691,321 image bytes and 48 strict perceptual baselines:
  `artifacts/ui-smoke/ui-suite-2026-07-23T23-11-08-721Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs`, `npm run
  test:renderer-coverage`, and `git diff --check` passed.
