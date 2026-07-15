# Database Multi-Select Option Cell Dropdown UI Smoke

Status: done

## Why

Tags and multi-select fields are common in imported Notion databases. As with
single select fields, options that exist in the schema but are not currently
used by a row still need to appear in the cell dropdown.

## Scope

- Add a deterministic multi-select field with an unused option.
- Open the multi-select cell dropdown and verify all schema options appear.
- Toggle an unused option on.
- Verify the row record persists the combined multi-select value.
- Reload and verify the combined value persists.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
