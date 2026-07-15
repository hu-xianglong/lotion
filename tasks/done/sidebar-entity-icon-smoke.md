# Sidebar Entity Icon Smoke

## Goal

Ensure sidebar page/database navigation rows render explicit entity icons
instead of falling back to blank/default icons.

## Scope

- Extend the sidebar navigation fixture with explicit page and database emoji
  icons.
- Assert the sidebar nav items render the expected emoji icons.

## Gates

- [x] `npm run smoke:sidebar-navigation-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
