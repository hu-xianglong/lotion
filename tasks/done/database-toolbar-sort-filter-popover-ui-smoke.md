# Database Toolbar Sort And Filter Popover UI Smoke

Status: done

## Why

The view settings dialog now has smoke coverage for persisted sort/filter
changes. The direct toolbar popovers are a separate, frequently used database
path because they persist each small mutation immediately.

## Scope

- Keep the toolbar popovers inside the viewport so their row actions remain
  clickable from the right side of the table toolbar.
- Clear the existing sort/filter state through the popovers.
- Add a filter through the toolbar popover.
- Add a sort through the toolbar popover.
- Verify the visible table reflects the filter and sort.
- Verify the saved view stores the toolbar changes.
- Reload and verify the table still reflects the saved toolbar changes.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
