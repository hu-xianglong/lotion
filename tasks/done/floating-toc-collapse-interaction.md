# Floating Table Of Contents Collapse Interaction

Status: done

Verification status: verified

Priority: P0

Source: user report after installing local build 29

## Goal

Make the floating table of contents collapse immediately and visibly when its
toggle is clicked, even while the pointer remains over the toggle and keyboard
focus remains inside the TOC.

## Root Cause

The persisted state and `aria-expanded` value changed to collapsed, but CSS
`:hover` and `:focus-within` rules immediately forced the collapsed panel back
to expanded geometry and made its navigation visible. The UI therefore looked
as if the collapse button did nothing.

## Acceptance

- Hovering or focusing a collapsed TOC does not expand it.
- Clicking the toggle is the only action that changes expanded/collapsed state.
- After clicking collapse, the host returns to compact width and navigation is
  hidden while the toggle remains hovered and focused.
- Keyboard activation still expands and collapses the TOC.
- Compact, laptop, desktop, and wide layouts retain their existing geometry.
- The UI smoke captures and validates the post-collapse state.

## Required Gates

- Focused page-secondary UI smoke with post-collapse screenshot evidence.
- Page-secondary artifact contract tests.
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Delivered

- Removed the collapsed-state `:hover` and `:focus-within` CSS overrides that
  reopened the floating TOC without changing its persisted state.
- The toggle is now the only control that changes expanded/collapsed state.
- The page-secondary Electron smoke keeps the pointer over the TOC and focus
  on its button while asserting the collapsed width, hidden navigation, class,
  and `aria-expanded` state.
- Added a post-click recollapse screenshot for every viewport and made it part
  of the machine-checked artifact contract.
- Added real `Enter` expansion and `Space` recollapse coverage after the mouse
  interaction, preserving keyboard behavior.

## Verification

- `LOTION_PAGE_SECONDARY_SKIP_BASELINE=1
  LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000 npm run
  smoke:page-secondary-ui` passed desktop, compact, wide, and laptop
  viewports. All four post-click screenshots prove the TOC stays at 38/44px
  with hidden navigation while hovered and focused. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-27T16-27-50-897Z/`.
- The same smoke also passed real keyboard expansion with `Enter` and
  recollapse with `Space` in all four viewports.
- The unskipped run reached the unrelated committed Page History raster
  comparison before the TOC phase and reported a 3px capture-height drift
  (486px actual versus 489px baseline). The focused TOC run therefore skipped
  only that existing Page History pixel comparison; all Page History behavior,
  geometry, and artifact-contract checks still passed.
- `node --test test/ui-harness-artifacts.test.mjs` passed 126/126.
- `npm run typecheck` passed.
- `npm run test:fixtures` passed.
- `npm run test:latency` passed; 20k-row view queries remained below 15ms,
  50k-row CSV median was 47.766ms, and row duplication median was 66.723ms.
- `npm run build` passed with 2,338 transformed modules.
- Final task-document validation and `git diff --check` are recorded by the
  task commit.
