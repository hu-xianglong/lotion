# Sort Popover Transactional Mutations And Recovery

Status: done

Verification status: verified

## Goal

Debug the active Sort Popover so every view-sort mutation is single-flight,
persistence failures remain visible and retryable, and pending work cannot be
silently abandoned through Escape or outside-click dismissal.

## Problems

- `SortPopover` typed `onChange` as synchronous even though the active database
  view mutation is asynchronous.
- `DatabaseTable` discarded sort mutation rejections through `runViewMutation`,
  leaving the popover unable to offer actionable recovery.
- Every rule edit immediately changed local state without a synchronous guard,
  so same-tick actions could submit overlapping view writes.
- Persistence failure left the optimistic draft visible but provided no local
  explanation or Retry action; Escape and outside clicks could close while the
  write was pending.
- Existing sort tests covered semantics and layout, not rollback, retained
  draft state, duplicate suppression, safe dismissal, or exact recovery.

## Acceptance Criteria

- Propagate the real sort persistence Promise from `DatabaseTable`.
- Route sort writes through a synchronous single-flight helper with normalized
  error and pending transitions.
- Retain the current sort draft with a readable local alert and explicit Retry
  after failure.
- Disable all competing controls and drag actions, and block Escape/outside
  dismissal while persistence is pending.
- Add real-source tests for idle-only dismissal, success, same-tick duplicate
  suppression, raw failure normalization, guard reset, and retry.
- Inject a real view-write failure in desktop and compact Electron flows,
  proving unchanged persisted state, retained direction, pending dismissal
  blocking, and exactly one committed retry.
- Require positive recovery evidence in the created-views artifact contract and
  reject missing rollback or exactly-once proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates
  and record the exact evidence.

## Debugging

- Confirmed that `DatabaseTable` passed the sort update through
  `runViewMutation`, which observes the failure globally but returns no rejected
  Promise to `SortPopover`.
- Changed the callback contract to `Promise<void>` and propagated the real
  `updateView` Promise. A synchronous ref guard now owns the full mutation,
  normalizes non-Error rejections, and resets in `finally`.
- Added pending state and a fieldset that disables all sort controls, suppressed
  dragging while pending, and routed both document mousedown and Escape through
  an idle-only dismissal request.
- Kept the optimistic local sort draft on failure, rendered an inline alert and
  Retry button, and reused the same guarded mutation path for recovery.
- Extended the real created-views smoke at `views:patch`: it changes the
  existing descending sort to ascending under an injected atomic write failure,
  checks stored revision and sorts byte-for-byte, double-clicks Retry, sends
  Escape and outside mousedown during the write, and requires one revision.
- Strengthened the persisted artifact contract and its aggregate unit fixture
  with required sort recovery evidence plus focused rollback and exactly-once
  negative tests.

## Verification

- `npm run test:renderer-components` passed the real-source sort mutation
  contract, including pending dismissal blocking, synchronous duplicate
  suppression, raw error normalization, guard reset and successful retry.
- `node --test test/database-sort-recovery-artifacts.test.mjs
  test/database-filter-recovery-artifacts.test.mjs` passed 6/6; the new sort
  contract includes complete evidence plus missing-rollback and
  missing-exactly-once negatives.
- `node --test test/ui-harness-artifacts.test.mjs` passed 113/113, including the
  aggregate created-views contract fixture with both filter and sort recovery.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-created-views-ui` passed. Both viewports injected `Injected
  sort persistence failure`, retained the ascending draft and local alert,
  proved revision/sorts rollback, blocked Escape and outside mousedown during
  Retry, and committed exactly one ascending revision. Both strict screenshot
  baselines remained at zero diff. Evidence:
  `artifacts/ui-smoke/database-created-views-ui-2026-07-23T23-20-52-956Z/`
  (2 screenshots, 100,526 bytes).
- Renderer coverage passed with 64/66 source files executed. Aggregate coverage
  rose from 64.08% to 64.10% lines/statements, 26.31% to 26.36% functions, and
  65.41% to 65.52% branches. `SortPopover.tsx` recorded 74.82% lines, 16.00%
  functions and 84.37% branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run typecheck` and `npm
  run build` passed; build emitted only the existing chunk-size advisory.
- `npm run test:production-visual` passed the full production gate: 16 required
  suites, 79 screenshots, 48 perceptual baselines, and 8,691,804 image bytes.
  The authoritative result is
  `artifacts/ui-smoke/ui-suite-2026-07-23T23-21-57-914Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 690 task
  files, 816 references, and all 678 queue items. A fresh `npm run
  test:renderer-coverage` matched the #678 verified baseline exactly at 64.10%
  lines/statements, 26.36% functions, 65.52% branches, and 64/66 covered source
  files. `git diff --check` passed.
