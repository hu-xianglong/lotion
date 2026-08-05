# Database Settings Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug the active low-coverage Database Settings Menu so page-open-mode and
database-lock persistence failures remain visible, recoverable, and
single-flight.

## Problems

- Selecting an Open pages in mode closes the menu before persistence settles
  and routes rejection through a helper that silently discards it.
- Lock/Unlock closes the menu and discards the `updateMeta` promise, producing
  no actionable recovery state.
- Same-tick activation can enter either mutation more than once before React
  commits disabled state.
- Backdrop/Escape dismissal remains active while persistence is unresolved.
- The existing Electron smoke covers navigation and geometry but no persistent
  setting success, failure, rollback, duplicate suppression, or retry.
- `DatabaseSettingsMenu.tsx` has 10.46% renderer line coverage and zero
  executed functions.

## Acceptance Criteria

- Route page-open-mode and lock/unlock through one synchronous single-flight
  action helper.
- Keep the current submenu open with a readable alert on failure and close only
  after success.
- Disable competing actions and block outside/Escape dismissal while pending.
- Preserve all scope navigation, capability reasons, page-mode descriptions,
  clipboard behavior, and responsive menu geometry.
- Add real-source coverage for action success/failure, duplicate suppression,
  retry, dismissal, and page-mode normalization.
- Extend the desktop/compact Electron smoke with an injected metadata-write
  failure, two synchronous Lock actions, persisted unlocked state, visible
  recovery, and retry producing one locked state.
- Strengthen the artifact contract with positive and negative recovery proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates,
  record exact evidence, and move the task to done/verified.

## Debugging

- Confirmed page-open-mode persistence closed its submenu before the promise
  settled and passed through a mutation wrapper that swallowed rejection.
  Lock/Unlock also closed immediately and discarded the metadata promise.
- Routed both persistent settings through one synchronous action guard. Pending
  actions now disable competitors and block Back, Escape, and outside
  dismissal; failures normalize to a readable alert, retain the submenu, and
  reset the guard for retry; only successful persistence closes the menu.
- Added an exact one-shot metadata-write debug failure across the main service,
  IPC, preload types, and bridge. Metadata failures now use the existing
  `DATABASE_PERSISTENCE_FAILURE` contract, so the Electron test exercises the
  same boundary as production lock persistence.
- The first failure-hook edit matched an unrelated `writeJsonFile` call in
  permanent field deletion. The new UI recovery smoke exposed the mismatch
  because Lock closed without an alert. The stray edit was reverted and the
  hook was anchored specifically in `updateMeta`.
- The Electron smoke also exposed a startup race: a delayed Home navigation
  could overwrite the database route after the test opened its entity. Waiting
  for the initial page header before navigation made the test assert the
  intended standalone database deterministically.

## Verification

- `npm run test:renderer-components` passed the real-source page-mode defaults,
  idle navigation, synchronous duplicate suppression, raw failure
  normalization, guard reset, and retry contracts.
- `node --test test/database-settings-menu-artifacts.test.mjs` passed positive
  artifact validation and a negative rollback-evidence regression.
- `npm run smoke:database-settings-menu-ui` passed desktop and compact. It
  persisted Center peek, injected an exact metadata-write failure, issued two
  synchronous Lock clicks, proved the menu and alert remained visible and the
  database stayed unlocked, then retried to one locked state. Evidence:
  `artifacts/ui-smoke/database-settings-menu-ui-2026-07-23T22-23-47-408Z/`
  (2 screenshots, 230,070 bytes).
- The focused core lock test and full `test/package-core.test.mjs` suite passed
  45/45, including failure code, reload rollback, and successful retry.
- `npm run typecheck` and `npm run build` passed.
- Renderer coverage passed with 64/66 files executed. The verified aggregate
  rose from 63.99% to 64.00% lines/statements, 25.56% to 25.75% functions, and
  64.63% to 64.79% branches. `DatabaseSettingsMenu.tsx` reached 34.45% lines,
  75% functions, and 91.66% branches from 10.46% lines and zero functions.
- `npm run test:production-visual` passed 16 required suites, 79 screenshots,
  8,691,837 image bytes, and 48 strict perceptual baselines:
  `artifacts/ui-smoke/ui-suite-2026-07-23T22-24-27-972Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 validator tests and
  validated 684 task files, 810 references, and 672 queue items.
  `npm run test:renderer-coverage` passed 9/9 gate tests plus the real-source
  rerun at the exact verified baseline, and `git diff --check` passed.
