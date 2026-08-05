# View Context Menu Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage View Context Menu so every persistent view action
is single-flight, recoverable, and observable when storage rejects.

## Problems

- Duplicate, Set as default, and Delete discard rejected promises through
  `.then(onClose)` and render no failure.
- Rename catches failures but has no synchronous duplicate-submit guard.
- Menu dismissal remains active while a persistent action is unresolved.
- The existing Electron smoke proves only successful actions.
- `ViewContextMenu.tsx` has 7.69% renderer line coverage and zero executed
  functions.

## Acceptance Criteria

- Route rename, duplicate, set-default, and delete through one synchronous
  single-flight action helper.
- Keep the menu open with a readable alert on failure, allow retry, and close
  only after success.
- Block outside/Escape dismissal and disable competing actions while pending.
- Preserve rename validation, clipboard behavior, inactive-tab isolation, and
  structural disabled reasons.
- Add real-source coverage for validation, action success/failure, duplicate
  suppression, retry, and dismissal.
- Extend the desktop/compact Electron smoke with injected bundle-write failure,
  two synchronous duplicate actions, zero accidental copies, visible recovery,
  and retry creating exactly one copy.
- Strengthen the artifact contract with positive and negative recovery proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move to done/verified.

## Debugging

- Confirmed duplicate, set-default, and delete discarded rejected promises
  through `.then(onClose)`, while rename had no same-tick submission guard.
  Storage rejection could therefore become unhandled or disappear behind a
  closed menu.
- Added one synchronous action guard shared by rename, duplicate, set-default,
  and delete. The action helper clears stale errors, publishes pending state,
  normalizes `Error` and non-Error failures, resets in `finally`, closes only
  after success, and ignores a second same-tick call.
- Menu backdrop/Escape dismissal now consults the same guard. Persistent and
  competing actions are disabled while pending, and a failed action renders a
  `role="alert"` without closing the menu so the user can retry.
- Extracted rename validation, guarded dismissal, and action orchestration for
  direct real-source coverage without replacing the Electron behavior check
  with mocks.
- Extended the real desktop/compact smoke to arm
  `failNextDatabaseBundleWrite`, click Duplicate twice synchronously, verify
  zero `Board copy` views and a retained actionable error, then retry and
  verify exactly one persisted copy.
- Strengthened the persisted artifact contract to reject a missing injected
  error, retained-menu proof, duplicate-suppression proof, or exact-one retry
  result.

## Verification

- `npm run test:renderer-components` passed. The real-source contract covers
  blank and case-insensitive rename conflicts, valid current/unique names,
  pending/idle dismissal, action success, same-tick duplicate suppression,
  raw failure normalization, guard reset, and retry.
- `node --test test/database-view-menu-artifacts.test.mjs` passed, including a
  negative assertion that rejects false duplicate-suppression evidence.
- `npm run smoke:database-view-menu-ui` passed desktop and compact. Artifact:
  `artifacts/ui-smoke/database-view-menu-ui-2026-07-23T22-08-41-416Z/`.
  Both viewports recorded the injected write error, zero partial copies, a
  retained menu, and exactly one copy after retry; two screenshots total
  204,195 bytes.
- Renderer coverage passed with an exact 66-file inventory and 64 covered
  files. Aggregate coverage is 63.99% lines/statements, 25.56% functions, and
  64.63% branches. `ViewContextMenu.tsx` rose from 7.69% lines and zero
  executed functions to 41.08% lines, 75% functions, and 94.44% branches.
- `node --test test/package-core.test.mjs` passed 45/45. `npm run typecheck`
  and `npm run build` passed.
- `npm run test:production-visual` passed. Artifact:
  `artifacts/ui-smoke/ui-suite-2026-07-23T22-09-40-384Z/production-visual-gate/production-visual-gate.json`.
  It records 16/16 suites, 79 screenshots, 48 strict zero-diff baselines, and
  8,691,702 image bytes.
- `npm run test:task-docs` passed with 683 task files, 809 references, and 671
  queue items. The post-baseline renderer coverage gate and
  `git diff --check` passed.
