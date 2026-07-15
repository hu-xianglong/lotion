# Gallery Default Row Icon Smoke

Status: done

## Why

Gallery cards should show a default row-page icon when a row has no custom icon.
This guards against blank icon slots in imported pages that do not define
icons.

## Scope

- Reuse the template-created row, which has no custom `row_icon`.
- Assert that its gallery card renders the default entity icon.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
