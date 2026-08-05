# Column Header Menu Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Column Header Menu so persistent column actions
remain single-flight, observable, and recoverable when storage fails.

## Problems

- Sort, calculate, wrap, hide, freeze, duplicate, insert, and delete close the
  menu before persistence settles.
- View mutations route rejection through `runViewMutation`, which deliberately
  discards the failure; schema mutation promises are also discarded.
- Same-tick activation can submit the same operation more than once before
  React commits disabled state.
- Escape, Close, and outside dismissal remain active while persistence is
  unresolved.
- The existing Electron smoke covers broad successful interaction and reload
  behavior but no persistent-action failure, rollback, duplicate suppression,
  retained error, or retry.
- `ColumnHeaderMenu.tsx` has 12.12% renderer line coverage.

## Acceptance Criteria

- Route every persistent column action through one synchronous single-flight
  helper.
- Keep the menu open with a readable alert on persistence failure and close
  only after successful persistence.
- Disable competing actions and block Close, Escape, and outside dismissal
  while pending.
- Preserve navigation-only actions, confirmations, protected-field reasons,
  keyboard behavior, resize/drag isolation, responsive geometry, and all
  existing successful persistence behavior.
- Add real-source coverage for success, failure normalization, same-tick
  duplicate suppression, retry, and idle-only dismissal.
- Extend desktop/compact Electron coverage with an injected bundle-write
  failure, two synchronous Duplicate property actions, zero accidental copied
  fields after failure/reload, visible recovery, and retry creating exactly one
  copy.
- Strengthen persisted artifact validation with positive and negative recovery
  evidence.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed every persistent menu action closed before its promise settled.
  Sort, calculate, wrap, hide, and freeze additionally passed through
  `runViewMutation`, which intentionally swallowed rejection; duplicate,
  insert, and delete discarded their promises directly.
- Added one synchronous action guard shared by sort, calculate, wrap, hide,
  duplicate, insert, freeze, and delete. Pending state disables every competing
  action and idle-only dismissal blocks Close, Escape, and outside clicks.
  Successful persistence closes once; failure normalizes the thrown value,
  retains the menu and alert, and resets the guard for retry.
- Changed the `DatabaseTable` callback boundary to return the real view/schema
  persistence promises instead of pre-closing or discarding them. Edit and
  filter remain navigation-only actions, and delete confirmation behavior is
  preserved inside the guarded action.
- Upgraded the existing broad Electron scenario instead of creating an
  isolated artificial path. It now arms the production bundle-write failure
  hook, invokes Duplicate property twice in the same JavaScript turn, verifies
  zero live and reloaded copies, and then retries through the same UI.

## Verification

- `npm run test:renderer-components` passed real-source contracts for pending
  dismissal blocking, synchronous duplicate suppression, success close,
  non-Error failure normalization, guard reset, and retry.
- `node --test test/database-column-menu-artifacts.test.mjs` passed 2/2:
  complete positive desktop/compact evidence and a negative rollback-proof
  regression.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-column-menu-ui` passed both viewports. Each injected failure
  retained the menu and alert, two synchronous Duplicate clicks produced zero
  live and reloaded copies, retry created exactly one, and all original 13
  actions plus keyboard, resize, drag, freeze, delete, and reload contracts
  remained green. Evidence:
  `artifacts/ui-smoke/database-column-menu-ui-2026-07-23T22-33-12-969Z/`
  (2 screenshots, 184,574 bytes).
- Renderer coverage passed with 64/66 source files executed. Aggregate
  lines/statements held at 64.00%, while functions rose from 25.75% to 25.87%
  and branches from 64.79% to 64.94%. `ColumnHeaderMenu.tsx` rose from 12.12%
  lines and zero executed functions to 46.73% lines, 66.66% functions, and
  90.90% branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run typecheck`,
  `npm run build`, and `git diff --check` passed.
- `npm run test:production-visual` passed 16 required suites, 79 screenshots,
  8,691,589 image bytes, and 48 strict perceptual baselines:
  `artifacts/ui-smoke/ui-suite-2026-07-23T22-34-08-089Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 validator tests and
  validated 685 task files, 811 references, and 673 queue items.
  `npm run test:renderer-coverage` passed 9/9 gate tests plus the real-source
  rerun at the exact verified baseline, and `git diff --check` passed.
