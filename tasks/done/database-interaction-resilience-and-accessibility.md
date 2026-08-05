# Database Interaction Resilience And Accessibility

Status: done

Verification status: verified

Priority: P1

Depends on: Database view and property menu tasks

## Goal

Make the new interaction system predictable under keyboard use, failures,
compact layouts, and overlapping popovers.

## Frontend

- Standardize focus return, roving menu focus, shortcuts, screen-reader names,
  danger confirmation, toasts, undo affordances, and loading/disabled states.
- Guarantee only one database menu layer is active unless it is a child submenu.
- Add responsive sheet equivalents for menus that cannot fit compact width.
- Add Cmd/Ctrl shortcuts for new row, search view, and clear selection where
  they do not conflict with the shortcut registry.

## Backend

- Standardize typed database mutation errors for conflict, locked, not found,
  invalid dependency, and persistence failure.

## Acceptance

- All actions can be completed without a mouse.
- Focus returns to the originating tab/header/row after close.
- Failed mutations have visible recovery and no silent state divergence.

## Gates

- Menu accessibility renderer tests.
- Keyboard-only database workflow and forced-error UI smoke.
- `npm run typecheck`, `npm run build`.

## Delivered

- Standardized database menu focus behavior with roving keyboard navigation,
  Escape dismissal, origin focus restoration, and a single active menu layer.
- Added keyboard shortcuts for in-view search, new rows, and clearing bulk
  selection, plus named controls and compact filter/sort sheet layouts.
- Added recoverable row deletion and view persistence failures through Undo and
  Retry affordances backed by retained mutation state.
- Introduced typed mutation errors for conflicts, locks, missing resources,
  invalid dependencies, and persistence failures across shared and main-process
  database services.
- Added a focused accessibility contract test and a keyboard-only Electron
  smoke covering focus return, menu isolation, shortcuts, and forced write
  failure recovery.

## Verification

Independently verified on 2026-07-22 against the goal, acceptance criteria,
main-process mutation boundary, renderer behavior, real Electron keyboard
interaction, failure recovery, compact layout, and generated visual evidence.

Defects found and fixed during verification:

- Escape was handled by two selection listeners. Closing an open database menu
  could synchronously unmount it and also clear bulk selection on the same key
  press. The remaining handler now respects `defaultPrevented`; the UI smoke
  proves the first Escape closes the menu while preserving selection and the
  second Escape clears it.
- Row delete and Undo persistence failures were fire-and-forget and could fail
  silently. Both now expose typed, visible alerts with Retry delete/Retry undo,
  preserve the correct row state, restore focus, and strip Electron IPC wrapper
  noise from the displayed error.
- Missing-row/field/database and invalid immutable/dependency mutations could
  silently return or leak raw filesystem errors. The main service now rejects
  them consistently with `DATABASE_NOT_FOUND`, `DATABASE_CONFLICT`, or
  `DATABASE_INVALID_DEPENDENCY`; forced bundle-write failures cover the
  `DATABASE_PERSISTENCE_FAILURE` recovery path.
- Search lacked an accessible name; sort/filter dialogs did not move focus
  inside themselves; and the overflow-view menu lacked roving focus, Escape
  focus return, outside dismissal, and coordination with other menu layers.
  These keyboard and screen-reader behaviors are now implemented and covered.
- Locked overflow views remained draggable even though the backend rejected the
  reorder. Locked views now disable dragging consistently with other structural
  controls.
- Recovery UI used undefined CSS variables (`--bg`, `--border`, and `--muted`),
  making the error toast transparent over table content. It now uses the real
  paper/rule/ink tokens and wraps without shrinking action buttons.
- The prior smoke claimed keyboard coverage at one nominal viewport without a
  validated artifact contract. It now runs at actual 1440x1000 and 1040x820
  viewports, validates exact body geometry, records all interaction/recovery
  flags, and fails on missing or undersized evidence.
- Combination testing exposed two harness-only flakes hidden by standalone
  runs: stale renderer cache after switching to a workspace whose database was
  already open, and competing Playwright CDP connections handling a native
  confirm dialog. The smoke now reloads after its preload-level view seed and
  uses an observable confirm stub, so the registered suite is deterministic
  while still asserting the destructive confirmation text.

Verification results:

- `npx tsc -p tsconfig.main.json && node --test test/package-core.test.mjs
  test/customer-api.test.mjs test/database-menu-accessibility.test.mjs
  test/database-accessibility-artifacts.test.mjs` (51/51 passed)
- `npm run test:renderer-components` (passed)
- `LOTION_UI_SUITE_FILTER=database-page-open,database-lock,database-accessibility
  npm run smoke:ui` (3/3 suites passed; 1440x1000 desktop and 1040x820 compact;
  six validated snapshots, 852789 total image bytes, zero console errors, and
  no missing artifact contracts)
- `npm run typecheck`, `npm run test:fixtures`, `npm run test:latency`, and
  `npm run build` (all passed; CSV median 58.786ms/max 81.485ms; build retains
  the existing non-blocking chunk-size warning)
- `git diff --check` (passed)

Evidence:

- Database accessibility artifact:
  `artifacts/ui-smoke/database-accessibility-ui-2026-07-22T19-28-37-605Z/`
- Database page-open regression artifact:
  `artifacts/ui-smoke/database-page-open-ui-2026-07-22T19-28-12-627Z/`
- Database lock regression artifact:
  `artifacts/ui-smoke/database-lock-ui-2026-07-22T19-28-27-648Z/`
- Combined suite artifact/index:
  `artifacts/ui-smoke/ui-suite-2026-07-22T19-28-06-045Z/`
- Manually inspected desktop and compact recoverable-error screenshots after
  the CSS correction; alerts are opaque and readable, actions remain contained,
  and neither layout has document-level horizontal overflow.
