# Add Coded New-Page Editing Regression Coverage

Status: done

## Goal

Cover the Notion-like quick-create editing loop: after creating a page from the
sidebar quick-create control, the new page should be immediately editable,
persist body text without extra navigation, survive reload/reopen, and remain
first in Recent.

## What Changed

- Extended `scripts/smoke-sidebar-navigation-ui.mjs` so quick-create page
  coverage now records page ids before creation, finds the new page id, types
  body text into the newly opened editor, waits for `window.lotion.pages.get()`
  to observe persisted markdown, reloads, reopens from Recent, and verifies the
  body still renders.
- Kept the existing quick-create icon, chooser, title, database-option, and
  Recent placement assertions.
- Fixed a frontend bootstrap regression where restoring a persisted tab on
  reload recorded that restored page/database as a fresh Recent item, which
  could push the newly created page out of the first Recent slot.

## Verification

- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`

## Notes

- Backend/service tests are not applicable for this item because the persistence
  path already uses the existing page service APIs and no backend/service code
  changed. The product fix is frontend navigation bookkeeping: restored tabs now
  open with `recordRecent: false` so reload does not mutate recents.
