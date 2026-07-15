# Row page property visual snapshot artifact

Status: done

## Source

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

The existing row-page property smoke catches many DOM and geometry regressions,
but it does not leave a durable visual artifact for reviewing the exact
property panel that users complain about: source links, editable dates,
checkboxes, tags, empty values, and relation-like fields. The UI regression lab
needs a small first screenshot slice before broader baseline diffing.

## Acceptance

- Add a shared UI harness helper that captures a visible element screenshot plus
  JSON metadata into the normal UI smoke artifact directory.
- Unit-test the helper without launching Electron so artifact structure remains
  stable.
- Extend the row-page navigation smoke to capture row-property panel snapshots
  for both default desktop and compact viewports.
- Keep the existing row-page geometry assertions for no horizontal overflow,
  label/value alignment, date control alignment, checkbox centering, and source
  link affordances.
- Do not change product data behavior.

## Required Gates

- `node --test test/ui-harness-artifacts.test.mjs`
- `node --check scripts/smoke-row-page-navigation-ui.mjs`
- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`

## Result

- Added `captureElementSnapshot` to the shared UI harness. It writes a visible
  element PNG plus JSON metadata into the current UI smoke artifact directory.
- Added unit coverage for the new artifact helper using a fake page/locator, so
  the artifact schema is checked without launching Electron.
- Extended the row-page navigation smoke to capture `.row-properties` snapshots
  for the default desktop and compact viewports while preserving the existing
  geometry, alignment, source-link, date, checkbox, field-settings, direct-cell
  edit, and entity-ref assertions.
- No backend/data behavior changed, so no package-core/service test was needed.

## Verification

- `node --test test/ui-harness-artifacts.test.mjs`
- `node --check scripts/smoke-row-page-navigation-ui.mjs`
- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`
