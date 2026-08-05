# View Settings Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug the active View Settings dialog so save, duplicate, delete, and
set-default mutations are single-flight, persistence failures remain visible
and retryable without losing the edited draft, and pending work cannot be
silently abandoned.

## Problems

- Save used a dedicated boolean without `catch` or `finally`; a rejected write
  left the dialog stuck in Saving with an unhandled rejection.
- Save, duplicate, delete, and set-default used separate flags. Two actions in
  the same event loop could enter different asynchronous mutations before React
  rendered either disabled state.
- Failed actions had no local error or Retry affordance.
- Backdrop, Close, and Cancel remained active while persistence was pending.
- The real failed-write rollback refreshed the `view` prop and the hydration
  effect erased the user's retained local draft.
- A competing ignored action could replace the operation retained for Retry.
- Existing coverage only server-rendered the idle dialog and did not exercise
  mutation failure, concurrency, recovery, or dismissal behavior.

## Acceptance Criteria

- Route all four persistent actions through one synchronous single-flight
  guard.
- Normalize thrown and non-Error failures into a local alert with Retry.
- Retain the exact failed operation and edited draft, without letting an
  ignored competing action replace either.
- Disable the complete form and block backdrop/header/cancel dismissal while
  persistence is pending.
- Continue hydrating idle or newly selected views while preserving a failed
  same-view draft.
- Add real-source tests for hydration policy, idle-only dismissal, same-tick
  suppression, error normalization, guard reset, and retry.
- Inject a real view-write failure in desktop and compact Electron flows,
  proving stored rollback, retained name, pending dismissal blocking, and one
  committed retry.
- Require complete recovery evidence in the created-views artifact contract,
  including focused rollback and exactly-once negative tests.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates
  and record exact evidence.

## Debugging

- Replaced the four independent pending flags with a dialog-wide action ref and
  action identity. The ref is acquired synchronously before awaiting, so a
  second same-tick action is ignored even before disabled markup renders.
- Added a shared action runner that clears stale errors, owns the pending
  transition, normalizes raw rejection values, resets the guard in `finally`,
  and closes only after success.
- Stored the accepted action and operation for Retry. The Retry ref is written
  only when the guard is idle, preventing a competing ignored action from
  changing recovery semantics.
- Wrapped every editable control and action in a disabled fieldset, marked the
  dialog busy, and routed backdrop, header Close, and Cancel through an
  idle-only dismissal helper.
- The first Electron reproduction proved persisted rollback but failed because
  the name input reverted. The database rollback refreshed the same view
  object, triggering the dialog hydration effect. Added an explicit hydration
  policy that preserves an accepted action's same-view draft until success
  while still accepting idle refreshes and view switches.
- Extended the created-views smoke at the real `views:patch` boundary. It
  changes the active view name, injects an atomic write failure, submits twice,
  checks name and revision rollback, verifies the edited input, retries twice,
  dispatches backdrop dismissal during both pending attempts, and requires one
  recovered revision.
- Strengthened the persisted artifact contract with required View Settings
  recovery evidence and focused missing-rollback and missing-exactly-once
  negatives.

## Verification

- `npm run typecheck` passed.
- `npm run test:renderer-components` passed the real-source View Settings
  contract: same-view failure draft preservation, idle/switch hydration,
  pending dismissal blocking, synchronous duplicate suppression, raw error
  normalization, guard reset, and retry.
- `node --test test/database-view-settings-recovery-artifacts.test.mjs
  test/database-sort-recovery-artifacts.test.mjs
  test/database-filter-recovery-artifacts.test.mjs` passed 9/9.
- `node --test test/ui-harness-artifacts.test.mjs` passed 113/113 with the
  aggregate created-views fixture requiring filter, sort, and View Settings
  recovery evidence.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-created-views-ui` passed. Both viewports injected `Injected
  view settings persistence failure`, retained the changed name and local
  alert, proved stored name/revision rollback, blocked backdrop dismissal
  during submit and Retry, and committed exactly one recovered revision. Both
  strict screenshot baselines remained at zero diff. Evidence:
  `artifacts/ui-smoke/database-created-views-ui-2026-07-23T23-32-41-697Z/`
  (2 screenshots, 100,526 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.15% lines/statements, 26.48% functions, and 65.63% branches.
  `ViewSettingsDialog.tsx` recorded 70.41% lines, 12.50% functions, and 57.74%
  branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run build` passed with
  only the existing chunk-size advisory.
- `npm run test:production-visual` passed the complete production gate: 16
  required suites, 79 screenshots, 48 perceptual baselines, and 8,691,472 image
  bytes. The authoritative result is
  `artifacts/ui-smoke/ui-suite-2026-07-23T23-35-03-067Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 691 task
  files, 817 references, and all 679 queue items. A fresh renderer coverage run
  matched the #679 verified baseline exactly.
