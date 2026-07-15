# Option Dropdown Viewport Clamp Smoke

Status: done

## Why

Filter and sort popovers now clamp to the viewport, but select/multi-select cell
menus use their own portal positioning. A menu opened near the right edge should
not render off-screen.

## Scope

- Reuse the database popover positioning helper for option dropdown menus.
- Keep the existing fixed portal behavior so menus escape table overflow.
- Add a smoke assertion that opened option menus stay inside the viewport.
- Apply the fix to both the local database dropdown component and the built-in
  field-type plugin dropdown implementation used by cells.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
