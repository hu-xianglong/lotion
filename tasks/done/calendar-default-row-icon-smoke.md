# Calendar Default Row Icon Smoke

Status: done

## Why

Calendar row chips should show a default row-page icon when a row has no custom
icon. This keeps calendar consistent with table/list/gallery behavior for
imported rows without Notion icons.

## Scope

- Reuse the template-created row, which has no custom `row_icon`.
- Assert that its calendar row chip renders the default entity icon.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
