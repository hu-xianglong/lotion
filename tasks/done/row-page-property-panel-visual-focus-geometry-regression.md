# Row-page Property Panel Visual And Focus Geometry Regression

Status: done

## Why

The row-page property panel has repeatedly regressed in ways users can see:
misaligned values, source links looking editable, date controls shifting or
overflowing, checkbox styling drifting from the theme, and focused controls
changing the layout. Static screenshots catch part of this, but the panel also
needs multi-viewport interaction checks for focused property controls.

## Changes

- Strengthened `scripts/smoke-row-page-navigation-ui.mjs` with an explicit
  row-property focus geometry pass.
- Covered desktop and compact viewports through the shared UI harness.
- Asserted source HTML/CSV properties remain read-only, focusable link buttons
  with no editable URL/input controls.
- Asserted date, checkbox, number, and option-search controls keep focus within
  their property row, stay within the viewport, do not horizontally overflow,
  and do not shift the property value column while focused.
- Expanded the property-panel snapshot metadata to include the blocked checkbox
  and empty date rows that are already part of the geometry checks.

## Verification

- `node --check scripts/smoke-row-page-navigation-ui.mjs`
- `npm run smoke:row-page-navigation-ui`
  - Artifact: `artifacts/ui-smoke/row-page-navigation-2026-06-15T19-51-52-225Z`
  - Viewports: desktop, compact
- `npm run typecheck`
- `git diff --check`
