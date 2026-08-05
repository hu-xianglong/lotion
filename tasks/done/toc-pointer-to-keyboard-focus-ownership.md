# Task 708: TOC pointer-to-keyboard focus ownership

Status: done

Verification status: verified

Priority: P0

Source: independent follow-up after Task 707

## Problem

After clicking a table-of-contents item, pressing Tab transfers interaction to
the keyboard. Moving the pointer away still treated the focused item as
pointer-owned, blurred it, and collapsed the panel. This broke keyboard
navigation while fixing the pointer auto-hide regression.

## Goal

Track the current input ownership so pointer exit collapses a pointer-driven
panel without collapsing a panel that the user has continued to navigate with
the keyboard.

## Acceptance

- Clicking a TOC item and moving the pointer away collapses the panel.
- Clicking a TOC item, pressing Tab, and moving the pointer away preserves the
  expanded panel and focused TOC item.
- Escape collapses the keyboard-expanded panel and clears its focus.
- The collapsed rail remains transparent and the expanded panel remains
  translucent.
- Electron smoke and artifact contracts verify both interaction paths in all
  supported viewports.

## Required Gates

- `npm run test:renderer-components`
- `node --test test/ui-harness-artifacts.test.mjs`
- focused `npm run smoke:page-secondary-ui`
- `npm run typecheck`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Result

- Non-modifier keyboard input within the panel now transfers focus ownership
  away from the pointer. Pointer exit only blurs focus when the last focus
  interaction is still pointer-owned; Escape remains an explicit collapse.
- Extended the Electron smoke with the exact click -> Tab -> pointer-exit
  sequence, followed by Escape and a second pure-pointer navigation/exit
  sequence.
- Added artifact-contract coverage that requires the pointer to be outside
  while a TOC item remains focused and the panel remains expanded.

## Verification

- Reproduced before the fix: the focused item was blurred and the host returned
  to `cm-md-toc-collapsed` after click -> Tab -> pointer exit.
- `npm run test:renderer-components`: passed.
- `node --test test/ui-harness-artifacts.test.mjs`: 128/128 passed.
- `LOTION_PAGE_SECONDARY_SKIP_BASELINE=1
  LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000 npm run
  smoke:page-secondary-ui`: passed desktop, compact, wide, and laptop. Each
  viewport recorded `hovered=false`, `focusedWithin=true`, and
  `activeIsTocItem=true` after keyboard ownership transfer, followed by a
  separate pure-pointer collapse to the transparent 32px rail. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-28T00-49-09-470Z/`.
- Visually inspected the expanded and auto-hidden desktop screenshots.
- `npm run typecheck`: passed.
- `npm run build`: passed with 2,342 transformed modules.
- `npm run test:task-docs`: passed; 708 queue items aligned.
- `git diff --check`
