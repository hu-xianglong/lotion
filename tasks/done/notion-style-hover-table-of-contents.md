# Task 706: Notion-style hover table of contents

Status: done

Verification status: verified

Priority: P0

Source: user report after installing Build 36

## Problem

The floating table of contents still changes the editor's horizontal layout
when expanded. It can also remain open and cover body content until the user
manually collapses it.

## Goal

Match Notion's transient outline behavior: keep a quiet, partially transparent
rail at the page edge, reveal the full outline only while the user is
interacting with it, and never resize or reposition the document body.

## Acceptance

- The TOC defaults to a compact, partially transparent rail.
- Pointer hover and keyboard focus reveal the full outline.
- Moving the pointer away or moving focus outside restores the compact rail.
- Expanded and collapsed states use identical document-body geometry.
- Expansion is an overlay interaction and never triggers page reflow.
- Heading navigation remains source-safe and keyboard accessible.
- The rail and expanded panel stay inside compact, laptop, desktop, and wide
  viewports.
- Focused UI smoke and artifact contracts cover default, hover, focus,
  navigation, auto-hide, opacity, and stable body geometry.

## Required Gates

- `npm run test:renderer-components`
- `node --test test/ui-harness-artifacts.test.mjs`
- focused `npm run smoke:page-secondary-ui`
- `npm run typecheck`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Result

- Removed persisted click-toggle state from the floating TOC.
- Added a 32px edge rail made from heading-depth markers. It rests at 42%
  opacity and expands to the full outline on pointer hover or keyboard focus.
- Pointer exit, focus exit, and Escape restore the quiet rail automatically.
- Removed every TOC-state-dependent content width, flex-basis, margin, and
  responsive layout rule. The expanded outline is now a fixed overlay and
  cannot resize or reposition the document.
- Preserved source-safe heading navigation and independent outline scrolling.
- Updated screenshot and artifact contracts to reject layout movement, missing
  auto-hide, incorrect opacity, broken hover/focus expansion, and raw heading
  source exposure.

## Verification

- `npm run typecheck`
- `npm run test:renderer-components`
- `node --test test/ui-harness-artifacts.test.mjs`: 126/126 passed.
- `LOTION_PAGE_SECONDARY_SKIP_BASELINE=1
  LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000 npm run
  smoke:page-secondary-ui`: passed desktop, compact, wide, and laptop with
  eight TOC screenshots and machine-checked stable body geometry. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-27T23-48-16-229Z/`.
- `npm run build`: passed with 2,342 transformed modules.
- `git diff --check`
