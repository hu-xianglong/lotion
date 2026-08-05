# Property Manager Transactional Mutations And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Property Manager so schema mutations cannot run
concurrently, reject as unhandled promises, or disappear behind a closed
dialog.

## Problems

- Create, reorder, delete, restore, and permanent-delete paths discard rejected
  promises and show no actionable error.
- Two synchronous clicks can start duplicate schema mutations before React
  state can disable controls.
- The dialog can close through its button or backdrop while a schema write is
  still unresolved.
- The existing Electron smoke verifies only successful creation/reorder/editor
  paths, so it cannot catch persistence-error or duplicate-submit regressions.
- `PropertyManagerDialog.tsx` has only 7.07% renderer line coverage.

## Acceptance Criteria

- Route every Property Manager schema mutation through one synchronous
  single-flight guard.
- Display normalized persistence errors, retain the dialog, and allow retry.
- Disable mutation controls and block dismissal while a mutation is in flight.
- Add real-source renderer coverage for dialog states, filtering, creation
  inputs, mutation success/failure, duplicate suppression, and retry.
- Extend the real Electron property-manager smoke with an injected bundle-write
  failure, two synchronous create clicks, zero accidental fields, visible
  recovery state, and retry creating exactly one field.
- Make persisted artifact evidence reject missing recovery or
  duplicate-suppression proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed every async mutation path discarded its rejection and the dialog
  had no error state. Two same-tick create clicks could both enter `onAdd`
  before React committed any disabled state.
- Added one synchronous ref guard shared by create, reorder, delete, restore,
  and permanent delete. All mutation controls now reflect a single busy state,
  errors render through `role="alert"`, and the guard resets in `finally`.
- Close-button and backdrop dismissal now use the same synchronous guard, so a
  dialog cannot disappear while schema persistence is unresolved.
- Extracted and directly exercised filtering, create-input scoping, reorder
  planning, property-state labels, dismissal, and mutation orchestration
  against the real renderer source.
- The Electron smoke uses `failNextDatabaseBundleWrite` because add-field is an
  atomic schema/data/views write. Two synchronous clicks leave zero matching
  fields; the retained dialog then retries to exactly one.
- The renderer trend initially rejected the change because JSX closures reduced
  aggregate function coverage by 0.04 points even though line coverage rose.
  Added meaningful render-time state-label and dismissal contracts instead of
  lowering the verified baseline.
- The full core gate repeatedly exposed a separate continuous-backlink bug.
  Incremental refresh closed its source watchers without reinstalling them,
  making later external edits dependent on another `backlinks()` call.
  Refresh and background validation now reinstall watchers immediately. The
  preceding cache test also disposes both services so watchers do not leak
  between fixtures.

## Verification

- `npm run test:renderer-components` passed. The contract covers blank/name/type
  filtering, current/all create payloads, valid/no-op reorder plans, synchronous
  duplicate suppression, raw failure normalization, retry, and pending/idle
  dismissal behavior.
- `node --test test/database-property-manager-artifacts.test.mjs` passed,
  including a negative assertion that rejects false duplicate-suppression
  evidence.
- `npm run smoke:database-property-manager-ui` passed desktop and compact.
  Artifact:
  `artifacts/ui-smoke/database-property-manager-ui-2026-07-23T21-55-23-879Z/`.
  Both viewports recorded zero fields after injected failure and exactly one
  after retry; two screenshots total 328,498 bytes.
- The external-backlink refresh test passed three consecutive focused runs,
  then `node --test test/package-core.test.mjs` passed 45/45 with fixture
  watcher cleanup.
- Renderer coverage passed with an exact 66-file inventory and 64 covered
  files. Aggregate coverage is 63.93% lines/statements, 25.36% functions, and
  64.35% branches. `PropertyManagerDialog.tsx` is 85.56% lines and 83.33%
  branches.
- `npm run typecheck` and `npm run build` passed.
- `npm run test:production-visual` passed. Artifact:
  `artifacts/ui-smoke/ui-suite-2026-07-23T21-59-50-799Z/production-visual-gate/production-visual-gate.json`.
  It records 16/16 suites, 79 screenshots, 48 strict zero-diff baselines,
  8,692,580 image bytes, zero console errors, and zero missing contracts.
- `npm run test:task-docs` passed with 682 task files, 808 references, and 670
  queue items. `git diff --check` passed.
