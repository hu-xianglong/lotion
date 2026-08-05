# Row Context Menu Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Row Context Menu so rename, duplicate, and delete
persistence is single-flight, failures are visible and retryable, and pending
actions cannot be dismissed.

## Problems

- Rename, Duplicate, and Delete close the menu before persistence settles and
  discard their promises.
- Same-tick activation can submit Duplicate or Delete more than once before
  React commits any disabled state.
- Persistence rejection has no menu-local alert or retry path.
- Close, Escape, and outside dismissal remain active while an action is
  unresolved.
- The existing Row Menu smoke covers successful actions but no menu action
  failure, rollback, duplicate suppression, retained error, or retry.
- `RowContextMenu.tsx` has 36.36% renderer line coverage and zero executed
  functions.

## Acceptance Criteria

- Route Rename, Duplicate, and Delete through one synchronous single-flight
  helper.
- Keep the menu open with a readable alert on failure, reset for retry, and
  close only after success.
- Disable every competing menu action and block Close/Escape/outside dismissal
  while pending; avoid repeated destructive confirmation.
- Preserve Open/new-window/Edit navigation, Copy link, prompt/confirmation
  semantics, row recovery banner, all cross-view handles, and successful row
  lifecycle behavior.
- Add real-source tests for success, raw failure normalization, same-tick
  duplicate suppression, retry, and idle-only dismissal.
- Extend desktop/compact Row Menu Electron coverage with an injected bundle
  write failure, two synchronous Duplicate actions, zero accidental copies,
  visible retained recovery, and retry creating exactly one independent copy.
- Strengthen artifact validation with positive and negative menu recovery
  evidence while retaining Deleted Rows recovery evidence.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed Rename, Duplicate, and Delete closed the menu before their promises
  settled and discarded the resulting rejection. Same-tick activation could
  enter Duplicate/Delete twice, while Escape, Close, and outside clicks stayed
  active during the unresolved write.
- Routed all three persistent actions through one synchronous guard with
  normalized error capture, pending transitions, success-only close, and
  idle-only dismissal. Every navigation/copy/persistent menu item is disabled
  during the request; failure retains the menu/alert and resets for retry.
- Changed the `DatabaseTable` callback boundary to return the real
  update/duplicate/delete promises. Delete keeps the existing recovery banner
  but can rethrow to the menu after recording its error; standalone banner
  Retry continues to consume the error internally. Prompt and confirmation
  cancellation preserve their prior close semantics.
- Extended the existing lifecycle scenario before its successful independent
  duplicate. The test now distinguishes rollback from a second hidden success
  by querying the persisted row-title count, then continues through rename,
  cross-view handles, delete/restore, body/metadata, and permanent deletion.

## Verification

- `npm run test:renderer-components` passed real-source contracts for pending
  dismissal blocking, synchronous duplicate suppression, success-only close,
  raw failure normalization, guard reset, and retry.
- `node --test test/database-row-menu-artifacts.test.mjs` passed 3/3: complete
  positive lifecycle evidence plus independent negative menu-action and
  Deleted Rows rollback regressions.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-row-menu-ui` passed both viewports. Two synchronous Duplicate
  activations after an injected bundle-write failure created zero copies,
  retained the menu/alert, and retry created exactly one independent copy with
  full body/metadata. The same run retained #675's double-Restore unresolved
  tombstone proof and all seven menu/cross-view/lifecycle contracts. Evidence:
  `artifacts/ui-smoke/database-row-menu-ui-2026-07-23T22-59-00-444Z/`
  (2 screenshots, 345,446 bytes).
- Renderer coverage passed with 64/66 source files executed. The aggregate rose
  from 64.07% to 64.08% lines/statements, 26.12% to 26.25% functions, and
  65.16% to 65.31% branches. `RowContextMenu.tsx` rose from 36.36% lines and
  zero executed functions to 64.17% lines, 66.66% functions, and 90.90%
  branches.
- Full `test/package-core.test.mjs` passed 45/45. `npm run typecheck`,
  `npm run build`, and `git diff --check` passed.
- `npm run test:production-visual` passed 16 required suites, 79 screenshots,
  8,693,324 image bytes, and 48 strict perceptual baselines:
  `artifacts/ui-smoke/ui-suite-2026-07-23T22-59-49-689Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 validator tests and
  validated 688 task files, 814 references, and 676 queue items.
  `npm run test:renderer-coverage` passed 9/9 gate tests plus the real-source
  rerun at the exact verified baseline, and `git diff --check` passed.
