# URL Field Shared Harness Migration

Status: done

## Scope

Move the focused URL field smoke onto the shared Electron UI harness so the
URL edit/open regression path uses deterministic app lifecycle, temp workspace
cleanup, failure artifacts, and desktop plus compact viewport coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the database table workflow where clicking URL text enters editing
  instead of opening the link, typing commits the edited URL, and the explicit
  open control dispatches the normalized URL through the dry-run shell hook.
- Preserve the row-page property workflow where editable URL properties render
  as URL editors, not read-only source links.
- Run the workflow across desktop and compact viewports with isolated fixture
  workspaces.
- Assert the URL display/open controls do not overlap and the document has no
  horizontal overflow in both viewports.
- This should remain UI smoke coverage only; no URL field, shell-open, or data
  service behavior changes are expected.

## Gates

- `node --check scripts/smoke-url-field-ui.mjs`
- `npm run typecheck`
- `npm run smoke:url-field-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-url-field-ui.mjs` to `withLotionUIHarness`.
- Preserved table URL editing, explicit URL open dry-run dispatch, and row-page
  editable URL property assertions.
- Ran the fixture independently across desktop and compact viewports.
- Added viewport/no-horizontal-overflow checks and URL display/open-control
  overlap checks.
- This change only updates UI smoke harness coverage; URL field persistence,
  shell-open behavior, and data services were not changed, so backend tests were
  not applicable.
