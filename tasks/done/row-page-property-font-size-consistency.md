# Row Page Property Font-Size Consistency

Status: done

## Problem

Row page properties could render with mixed font sizes because the property label
used its own font size while values and field editors inherited another size.
This made dates, numbers, empty placeholders, and labels look visually
inconsistent.

## Changes

- Gave row page property rows one shared `14px` font-size baseline.
- Made labels and values inherit the same baseline.
- Extended the row-page UI smoke test to assert computed font-size consistency
  for labels, values, editors, number inputs, and date text inputs.

## Gates

- `npm run typecheck`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`
