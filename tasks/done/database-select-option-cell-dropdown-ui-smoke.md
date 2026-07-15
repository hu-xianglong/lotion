# Database Select Option Cell Dropdown UI Smoke

Status: done

## Why

Imported enum/select fields can fail in subtle ways: an option may exist in the
field schema but not appear in the cell dropdown if no current row uses it. This
was a previously observed import failure mode.

## Scope

- Add an unused select option to the deterministic database fixture.
- Open a select cell dropdown and verify all schema options are visible.
- Choose the previously unused option.
- Verify the row record persists the new option.
- Verify the row disappears from the current filtered view when the new option
  no longer matches the active filter.
- Reload and verify the selected option still persists.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
