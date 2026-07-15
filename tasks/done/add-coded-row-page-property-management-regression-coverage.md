# Add Coded Row-Page Property Management Regression Coverage

## Problem

`row-page-property-field-management-and-editable-values.md` added row-page
property field management and editability behavior, but it only recorded a
manual Electron UI smoke. Existing coded smokes covered alignment and some
source-link behavior, but not the field settings entry point or the full
row-property editability workflow from that item.

## Scope

- Extend the row-page navigation UI smoke with row-property management coverage.
- Verify a row-property settings button is discoverable.
- Open the Field settings dialog from a row property and assert concrete dialog
  state.
- Verify direct date property editing persists through the database API and UI.
- Verify imported source URL properties stay read-only as values and remain
  openable links.

## Gates

- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`

## Result

- `scripts/smoke-row-page-navigation-ui.mjs` now covers the row-property
  settings entry point by opening the `Field settings` dialog from the `Notes`
  property and asserting field id, name, type, and editability.
- The smoke edits an empty date property from the row page, waits for the value
  to persist through `window.lotion.databases.get()`, reopens the row page, and
  verifies the rendered date display.
- The fixture now includes `Original Notion HTML` and `Original Notion CSV`
  source URL properties. The smoke asserts they render as read-only source link
  rows, have no normal editor, and dispatch open requests through the shell
  dry-run hook.
- Backend/service tests were not added because this item only extends UI smoke
  coverage around existing field settings, update-cell, and shell-open paths;
  no service or persistence implementation changed.
