# Sidebar Page Context Menu Actions

## Problem

Sidebar page entries do not expose right-click actions. Users need a Notion-like
context menu for common page operations from the sidebar, starting with opening
and deleting a page.

## Result

- Added a right-click context menu to sidebar page entries with Open and Delete.
- Exposed page deletion through the renderer action context and refresh state
  after deletion.
- Extended the sidebar navigation UI smoke to cover right-click menu open/delete,
  including confirmation and removal from the sidebar after deletion.
- Backend/service tests are not needed for this item because the existing page
  delete IPC/API already existed; this change only wires renderer actions and
  sidebar UI behavior.

## Gates

- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`
