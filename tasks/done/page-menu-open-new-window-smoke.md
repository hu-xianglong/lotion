# Page Menu Open-New-Window Smoke

## Goal

Cover the page action menu's "Open in new window" path in addition to the tab
pop-out move behavior.

## Scope

- Reuse the deterministic window-popout smoke workspace.
- Open the same page through the page options menu into a new window.
- Assert the original window keeps the page open while the new window opens a
  second copy.

## Gates

- [x] `npm run smoke:window-popout-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
