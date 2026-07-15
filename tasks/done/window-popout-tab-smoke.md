# Window Pop-Out Tab Smoke

## Goal

Add a focused UI smoke for the existing multi-window path: moving the active
tab into a newly spawned Electron window.

## Scope

- Create a deterministic temporary workspace with one page.
- Click the active tab's pop-out button.
- Assert a new renderer window opens with that page.
- Assert the original window falls back to a blank tab.
- Close the spawned window and restore the original workspace.

## Gates

- [x] `npm run smoke:window-popout-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
