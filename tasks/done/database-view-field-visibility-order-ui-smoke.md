# Database View Field Visibility And Order UI Smoke

Status: done

## Why

Database view settings let users choose visible fields and reorder columns, but
the smoke suite only verified that newly created and duplicated views preserve
existing field config. It did not verify the UI path that changes field
visibility and order.

## Scope

- Hide the `Notes` field through the view settings dialog.
- Move `Score` before `Status` through the view settings dialog.
- Verify the saved view stores the visible fields and field order.
- Verify the rendered table header reflects the saved field order.
- Reload and verify the header still reflects the saved field order.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
