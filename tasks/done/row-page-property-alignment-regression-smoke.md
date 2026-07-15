# Row Page Property Alignment Regression Smoke

Status: done

## Problem

Row page property values could drift visually when field providers rendered
their own controls. Date fields were the clearest regression: the text value
started in the value column, but the calendar button could sit far to the right
and read as a separate column. Checkbox and numeric fields also needed a
predictable start and compact control footprint in the row page property panel.

## Changes

- Tightened row page property CSS so editable controls share the same
  value-column anchor and compact field-specific widths.
- Made row page date fields keep their calendar button adjacent to the displayed
  date or empty value, and hide that button until hover/focus.
- Replaced row page property checkboxes' browser-native chrome with a themed
  custom checkbox style.
- Fixed self-referential root theme variables and added a resolved
  `--theme-accent` so property controls can follow the selected theme while
  retaining a stable default.
- Added a focused Electron UI smoke assertion against real DOM geometry for
  mixed row page property types.

## Gates

- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `npm run build`
- `git diff --check`
