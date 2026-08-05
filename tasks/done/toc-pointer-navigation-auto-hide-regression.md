# Task 707: TOC pointer-navigation auto-hide regression

Status: done

Verification status: verified

Priority: P0

Source: user report after installing Build 37

## Problem

The floating table of contents remains fully expanded and opaque after a user
clicks a heading and moves the pointer away. The Task 706 smoke test only
covered pointer exit before clicking an item, so it missed the focus retained
by pointer navigation.

## Goal

Make the Notion-style outline transient for real pointer navigation: the
expanded panel may remain open while the pointer is inside it, but it must
return to the translucent rail when the pointer leaves, including after the
user clicks a heading.

## Acceptance

- The TOC defaults to the compact translucent rail.
- Hover expands the outline and pointer exit collapses it.
- Clicking a heading keeps source-safe navigation behavior.
- Moving the pointer away after clicking a heading clears pointer-owned focus
  and restores the compact translucent rail.
- Keyboard focus still expands the outline until focus exits or Escape is
  pressed.
- The expanded panel remains an overlay and does not reflow the document.
- Focused Electron smoke and artifact contracts cover the exact
  click-heading-then-pointer-exit regression in all supported viewports.
- The fixed build is installed locally and verified against a real workspace.

## Required Gates

- `npm run test:renderer-components`
- `node --test test/ui-harness-artifacts.test.mjs`
- focused `npm run smoke:page-secondary-ui`
- `npm run typecheck`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Result

- Reproduced the regression in the installed Build 37 against the user's real
  workspace. Pointer exit worked before navigation, but a clicked TOC item
  retained focus and kept the panel expanded.
- Added explicit pointer-owned focus tracking. Pointer exit now blurs focus
  created by a pointer click before synchronizing the collapsed state, while
  keyboard-owned focus continues to keep the outline accessible.
- Reduced the resting rail to 34% opacity with a fully transparent background.
- Changed the expanded outline surface to 90% background alpha with backdrop
  blur, keeping text readable while making the overlay visibly translucent.
- Extended the Electron smoke sequence to click a heading, prove the item owns
  focus, move the pointer away, and require both collapsed geometry and cleared
  focus.
- Extended artifact contracts to reject opaque rail backgrounds, missing
  expanded-surface translucency, and pointer-owned focus that survives pointer
  exit.

## Verification

- Reproduced the sticky expanded panel in installed Build 37 before editing.
- `npm run typecheck`
- `npm run test:renderer-components`
- `node --test test/ui-harness-artifacts.test.mjs`: 127/127 passed.
- `LOTION_PAGE_SECONDARY_SKIP_BASELINE=1
  LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000 npm run
  smoke:page-secondary-ui`: passed desktop, compact, wide, and laptop.
  Every viewport recorded pointer item focus before exit and
  `focusedWithin=false`, 32px width, transparent background, and 0.34 opacity
  after exit. Expanded surfaces recorded 0.9 background alpha. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-28T00-00-41-132Z/`.
- Visually inspected expanded and auto-hidden desktop screenshots.
- `npm run build`: passed with 2,342 transformed modules.
- `npm run test:task-docs`
- `git diff --check`
