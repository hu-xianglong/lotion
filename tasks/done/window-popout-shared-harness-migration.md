# Window Popout Shared Harness Migration

Status: done

## Scope

Move the multi-window popout smoke onto the shared Electron UI harness so tab,
page-menu, and database open-in-new-window flows use deterministic app
lifecycle, workspace cleanup, failure artifacts, and desktop plus compact
viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the isolated page plus database fixture.
- Exercise tab pop-out, page menu open-in-new-window, and database header
  open-in-new-window flows.
- Run the smoke across desktop and compact viewports.
- Assert the original window stays on the expected entity, the spawned window
  opens the expected entity, and temporary spawned windows are closed.
- Assert the tested controls are visible/interactable and the main document has
  no horizontal overflow at each viewport.
- This should remain UI smoke coverage only; no page/database service behavior
  changes are expected.

## Gates

- `node --check scripts/smoke-window-popout-ui.mjs`
- `npm run typecheck`
- `npm run smoke:window-popout-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-window-popout-ui.mjs` to
  `withLotionUIHarness`.
- Added explicit page navigation after opening the isolated fixture workspace,
  removing the old dependency on implicit active-page state.
- Ran tab pop-out, page-menu open-in-new-window, and database
  open-in-new-window flows independently across desktop and compact viewports.
- Preserved assertions that the spawned window opens the expected page/database
  while the original window stays on the expected entity.
- Added viewport intersection and no-horizontal-overflow assertions for the
  tested controls and main document.
- This change only updates UI smoke harness coverage; page, database, and
  window service behavior was not changed, so backend tests were not
  applicable.
