# Notion-Like Sidebar New Page Icon

Status: done

## Problem

The sidebar quick-create page button currently uses the generic page icon. It
does not match Notion's familiar compose/new-page icon.

## Changes

- Add a dedicated square-pen new-page icon.
- Use it for the sidebar quick-create page action.
- Make quick-create buttons read as compact circular icon buttons.
- Extend the sidebar smoke check to assert the new icon renders.

## Gates

- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`
