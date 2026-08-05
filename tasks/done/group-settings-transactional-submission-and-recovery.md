# Group Settings Transactional Submission And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Group Settings dialog so view persistence is
single-flight, failures are visible and retryable, and in-flight work cannot be
dismissed.

## Problems

- Save grouping has no synchronous guard, so same-tick activation can submit
  the same view mutation more than once.
- A failed `onSave` rejects from an unobserved click promise and exposes no
  actionable UI error.
- Close, Cancel, and backdrop dismissal remain active while persistence is
  unresolved.
- All form controls remain editable during the pending request.
- The existing grouping Electron smoke covers successful shared table/list/
  Kanban behavior but no persistence failure, rollback, duplicate suppression,
  retained draft, or retry.
- `GroupSettingsDialog.tsx` has 15.38% renderer line coverage and zero executed
  functions.

## Acceptance Criteria

- Route Save grouping through a synchronous single-flight helper.
- Retain the dialog and configured draft with a readable alert on failure;
  close only after persistence succeeds.
- Disable form controls and competing actions, expose busy state, and block
  Close, Cancel, and backdrop dismissal while pending.
- Preserve grouping removal, primary/secondary configuration, ordering,
  hide-empty, hidden/collapsed buckets, and successful table/list/Kanban
  behavior.
- Add real-source tests for success, failure normalization, same-tick duplicate
  suppression, retry, and idle-only dismissal.
- Extend the grouping Electron smoke with an injected view-write failure, two
  synchronous Save actions, unchanged persisted groups, visible retained
  recovery, and retry producing exactly one configured grouping.
- Strengthen artifact validation with positive and negative recovery proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed `save()` awaited the view mutation but the click handler discarded
  its promise. A rejection therefore produced no dialog error, while
  same-tick clicks could enter `onSave` more than once before React state
  changed. Close, Cancel, backdrop dismissal, and every draft control remained
  active during the request.
- Added one synchronous submission guard with normalized error capture,
  explicit pending transitions, and success-only close. The dialog now exposes
  `aria-busy`, disables its complete form and close controls while saving,
  blocks backdrop/Close/Cancel dismissal through an idle-only guard, retains
  the configured draft and alert on failure, and resets cleanly for retry.
- Upgraded the existing end-to-end shared grouping scenario so recovery is
  proven on the real Table view mutation boundary before the test continues
  through grouped table/list/Kanban behavior and reload persistence.
- The first focused run exposed a regression in the new test rather than the
  product: Playwright's fuzzy `getByLabel("Group by")` also matched
  “Sub-group by”. The retained-draft assertions now use exact accessible-label
  matching, eliminating the false ambiguity without weakening the check.

## Verification

- `npm run test:renderer-components` passed real-source contracts for pending
  dismissal blocking, synchronous duplicate suppression, success-only close,
  raw failure normalization, guard reset, and retry.
- `node --test test/database-grouping-artifacts.test.mjs` passed 2/2: complete
  positive artifact evidence and a negative rollback-proof regression.
- `npm run smoke:database-grouping-ui` passed after the exact-label test fix.
  It injected a view-write failure, invoked Save twice synchronously, proved
  persisted groups stayed empty, retained the dialog, error, primary and
  secondary draft, then retried to exactly one two-level configuration. All
  prior table/list/Kanban, group-local row, collapsed/hidden, viewport, and
  reload assertions stayed green. Evidence:
  `artifacts/ui-smoke/database-grouping-ui-2026-07-23T22-42-17-405Z/`
  (2 screenshots, 179,284 bytes).
- Renderer coverage passed with 64/66 source files executed. The aggregate rose
  from 64.00% to 64.02% lines/statements, 25.87% to 26.00% functions, and
  64.94% to 65.09% branches. `GroupSettingsDialog.tsx` rose from 15.38% lines
  and zero executed functions to 47.82% lines, 40% functions, and 90.90%
  branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run typecheck`,
  `npm run build`, and `git diff --check` passed.
- `npm run test:production-visual` passed 16 required suites, 79 screenshots,
  8,692,136 image bytes, and 48 strict perceptual baselines:
  `artifacts/ui-smoke/ui-suite-2026-07-23T22-42-58-158Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 validator tests and
  validated 686 task files, 812 references, and 674 queue items.
  `npm run test:renderer-coverage` passed 9/9 gate tests plus the real-source
  rerun at the exact verified baseline, and `git diff --check` passed.
