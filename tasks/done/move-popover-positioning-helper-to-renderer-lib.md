# Move Popover Positioning Helper To Renderer Lib

Status: done

## Why

The built-in field-type plugin should not import helpers from the database
feature directory. Popover positioning is a renderer UI utility shared by
database toolbar popovers and option dropdown menus.

## Scope

- Move `popoverPositionStyle` from `features/databases` to `renderer/lib`.
- Update database popovers and the field-types plugin to import the shared
  helper from the neutral location.
- Keep behavior unchanged.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
