# Sidebar Quick-Create Page And Database Actions

Status: done

## Problem

Creating a blank page from the sidebar feels slow, and the current creation
entry points are small plus controls hidden inside sidebar sections. Users need
a persistent left-bottom icon entry for quickly creating a page or database.

## Changes

- Add dedicated page/database icon buttons to the sidebar footer.
- Reuse the existing create actions so data creation stays on the same API path.
- Make blank page creation show the new page before doing the heavier sidebar
  list refresh.
- Run focused typecheck and sidebar smoke coverage.

## Gates

- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`
