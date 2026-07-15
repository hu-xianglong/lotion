# Database Header Open-New-Window Smoke

## Goal

Cover the database header's "Open in new window" path so multi-window support is
verified for pages and databases.

## Scope

- Extend the window-popout smoke fixture with one small database.
- Open that database in the original window.
- Click the database header open-new-window button.
- Assert the spawned window and original window both show the database.

## Gates

- [x] `npm run smoke:window-popout-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
