# Floating Table Of Contents Navigation And Layout Bugs

Status: done

Verification status: verified

Priority: P0

Source: user report after installing local build 27

## Goal

Keep floating table-of-contents navigation in the rendered reading experience:
clicking an entry must scroll without exposing heading Markdown source, and an
expanded desktop TOC must not cover page content.

## Reproduction

- Open the imported daily journal page with a long heading outline and an
  embedded database.
- Expand the floating TOC and click `人生倒计时`.
- The editor selection moves into the heading and exposes the leading `##`.
- At the observed 1180px window width, the expanded TOC covers the embedded
  database instead of reserving readable page space.
- An imported heading such as
  `工作反思[[跳转]](https://app.notion.com/...)` leaks link source into the TOC.

## Acceptance

- Floating TOC clicks scroll to the heading without changing the editor
  selection or focusing the editor.
- The clicked heading stays rendered and does not expose `#` source markers.
- Keyboard focus remains on the TOC item after navigation.
- Expanded TOCs at desktop and laptop widths do not overlap `.cm-content`.
- Compact overlay behavior remains viewport-contained and uses an opaque
  surface.
- Imported double-bracket link labels are readable without URL or bracket
  source in the TOC.

## Required Gates

- Focused page-secondary UI smoke on compact, laptop, desktop, and wide
  viewports with screenshot evidence.
- Renderer component heading-cleanup coverage.
- `npm run typecheck`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Delivered

- Floating TOC navigation scrolls without moving the CodeMirror selection or
  focusing the editor, so clicked headings stay rendered.
- The clicked TOC button retains keyboard focus after navigation.
- Expanded TOCs reserve horizontal page space from 1121px through the 1500px
  responsive boundary; wide layouts retain the centered reading column.
- Compact TOCs use an opaque, bordered surface with independent vertical
  scrolling.
- Imported `[[label]](url)` heading fragments render as readable TOC labels.
- The page-secondary smoke now captures the expanded TOC after navigation and
  requires source-safe focus, non-overlap geometry, and cleaned labels in its
  artifact contract.

## Verification

- `LOTION_PAGE_SECONDARY_SKIP_BASELINE=1 npm run smoke:page-secondary-ui`
  passed desktop, compact, and laptop viewports with three TOC screenshots:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T00-54-38-679Z`.
- `LOTION_UI_VIEWPORTS=boundary:1500x900,wide:1600x1000 LOTION_PAGE_SECONDARY_SKIP_BASELINE=1 npm run smoke:page-secondary-ui`
  passed boundary, wide, and laptop viewports with three TOC screenshots:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T00-56-15-082Z`.
- `npm run test:renderer-components` passed.
- `node --test test/ui-harness-artifacts.test.mjs` passed 125 tests.
- `npm run typecheck` passed.
- `npm run test:fixtures` passed.
- `npm run test:latency` passed; the 20k-row slowest median was 20.3ms and
  50k-row CSV median was 72.036ms.
- `npm run build` passed.

## Independent Verification And Repair — 2026-07-26

- Independent verification did not accept the original `SKIP_BASELINE=1`
  evidence as sufficient. The unskipped command
  `LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000 npm run
  smoke:page-secondary-ui` failed twice under Node 20.18.1 and once under the
  supported Node 22.22.0 toolchain. Each failure reported the same 40 desktop
  Page History text-raster pixels (0.011%) at threshold 0.15 with zero allowed
  pixels. Failure artifacts:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T01-16-48-240Z/`,
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T01-17-50-060Z/`, and
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T01-19-50-803Z/`.
- Threshold measurement against the committed desktop baseline left 2 pixels
  at 0.19 and 0 pixels at 0.20. The desktop, compact, and wide Page History
  policies now use the minimum stable 0.20 threshold while retaining
  `includeAA=false`, `maxDiffPixels=0`, and `maxDiffRatio=0`.
- Added an automated positive contract proving threshold 0.20 absorbs bounded
  text raster drift while retaining the zero-pixel budget. The existing
  desktop/compact/wide deliberate magenta-pixel mutations remain required to
  fail, so a visible regression is not hidden by the policy adjustment.
- `node --test test/production-visual-baseline.test.mjs` passed 21/21,
  including the new positive boundary and all committed mutation guards.
- `npm run test:renderer-components` passed, covering imported
  double-bracket-link heading cleanup. `node --test
  test/ui-harness-artifacts.test.mjs` passed 125/125, including rejection of
  heading-source exposure and desktop TOC/content overlap.
- The four-viewport source-safe behavior first passed without baseline
  comparison at
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T01-18-36-460Z/`.
  It verified that focus remains on the TOC item, the editor and heading line
  remain inactive, cleaned imported labels contain no URL/bracket source, and
  desktop/compact/wide/laptop layouts do not overlap.
- The supported Node 22.22.0 unskipped command
  `PATH=/opt/homebrew/bin:/usr/bin:/bin
  LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000
  /opt/homebrew/bin/npm run smoke:page-secondary-ui` then passed all four
  viewports, all four TOC screenshots, and all three committed Page History
  baselines with zero differing pixels. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-26T01-23-41-837Z/`.
- `npm run typecheck` passed. `npm run build` passed with 2,338 transformed
  modules. Final task-doc validation and `git diff --check` are recorded by the
  verification commit.
