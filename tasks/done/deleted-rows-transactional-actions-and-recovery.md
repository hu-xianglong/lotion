# Deleted Rows Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Deleted Rows dialog so restore and permanent
delete are globally single-flight, failures remain visible and retryable, and
pending work cannot be dismissed.

## Problems

- The duplicate guard reads a React `pending` state closure. Two same-tick
  Restore or Permanently delete activations both pass before React commits.
- Concurrent actions for different tombstones can mutate stale database
  bundles and lose one lifecycle change.
- Close and backdrop dismissal remain active while a row lifecycle write is
  unresolved.
- A pending row disables only its own controls, leaving competing destructive
  actions active.
- Existing Electron evidence covers successful restore/permanent delete but no
  injected failure, hidden second submit, rollback, retained error, or retry.
- `DeletedRowsDialog.tsx` has 15.38% renderer line coverage and zero executed
  functions.

## Acceptance Criteria

- Route Restore and Permanently delete through one synchronous dialog-wide
  single-flight helper.
- Normalize errors, retain the dialog and tombstone on failure, and allow a
  clean retry without any hidden successful submit.
- Disable every lifecycle control, expose dialog/row busy state, avoid repeated
  confirmation, and block Close/backdrop dismissal while pending.
- Preserve empty state, deleted timestamps, successful restore with page
  metadata/body, and permanent deletion behavior.
- Add real-source tests for success, raw failure normalization, same-tick
  duplicate suppression, retry, and idle-only dismissal.
- Extend desktop/compact Row Menu Electron coverage with an injected bundle
  write failure, two synchronous Restore activations, tombstone/ghost-state
  rollback proof, visible retained recovery, and retry restoring exactly once.
- Strengthen artifact validation with positive and negative recovery evidence.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed the apparent per-row duplicate guard read a stale React `pending`
  Map captured by the click handler. Two same-turn Restore calls could both
  enter the persistence boundary; with a one-shot injected failure, the first
  could reject while the second silently restored the row. Actions on
  different tombstones could likewise race on stale bundles.
- Replaced the state-only check with one synchronous dialog-wide guard shared
  by Restore and Permanently delete. All lifecycle controls are disabled while
  any operation runs, the active row and dialog expose busy state, and the
  destructive handler checks the guard before showing another confirmation.
- Added idle-only Close/backdrop dismissal, normalized raw rejection values,
  retained the dialog/tombstone/alert after failure, and reset the guard for a
  clean retry. Successful restore and permanent-delete update behavior remains
  driven by the cache's returned bundle.
- Extended the existing broad Row Menu lifecycle scenario at the exact restore
  boundary, so the test distinguishes a real rollback from a second hidden
  success by checking active records, tombstones, and entity resolution.

## Verification

- `npm run test:renderer-components` passed real-source contracts for
  dialog-wide pending dismissal, synchronous competing-action suppression,
  success, raw failure normalization, guard reset, and retry.
- `node --test test/database-row-menu-artifacts.test.mjs` passed 2/2: complete
  positive desktop/compact lifecycle evidence and a negative rollback-proof
  regression.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-row-menu-ui` passed both viewports. Two synchronous Restore
  activations after an injected bundle-write failure left the row absent from
  active records, retained its tombstone, kept entity resolution null, and
  retained the dialog/error; retry restored it exactly once with its full body
  and layout metadata. All original seven menu actions, cross-view handles,
  duplicate independence, reload, and permanent deletion stayed green.
  Evidence:
  `artifacts/ui-smoke/database-row-menu-ui-2026-07-23T22-50-43-685Z/`
  (2 screenshots, 345,526 bytes).
- Renderer coverage passed with 64/66 source files executed. The aggregate rose
  from 64.02% to 64.07% lines/statements, 26.00% to 26.12% functions, and
  65.09% to 65.16% branches. `DeletedRowsDialog.tsx` rose from 15.38% lines
  and zero executed functions to 63.49% lines, 66.66% functions, and 80%
  branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run typecheck`,
  `npm run build`, and `git diff --check` passed.
- `npm run test:production-visual` passed 16 required suites, 79 screenshots,
  8,692,047 image bytes, and 48 strict perceptual baselines:
  `artifacts/ui-smoke/ui-suite-2026-07-23T22-51-36-715Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 validator tests and
  validated 687 task files, 813 references, and 675 queue items.
  `npm run test:renderer-coverage` passed 9/9 gate tests plus the real-source
  rerun at the exact verified baseline, and `git diff --check` passed.
