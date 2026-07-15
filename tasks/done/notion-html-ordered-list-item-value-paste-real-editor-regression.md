# Notion HTML ordered list item value paste real editor regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and the
ongoing Notion HTML paste parity sequence.

## Problem

The editor preserved an `<ol start="...">` offset, but browser/Notion HTML can
also encode a numbering jump on a specific `<li value="...">`. Losing that
value changes the user's visible ordered-list numbering after paste.

## Acceptance

- Pasting HTML with an ordered list that contains an individual `<li value>`
  preserves the explicit list item number in Markdown.
- The pasted list renders in the real editor across desktop and compact
  viewports.
- Continued typing after the pasted list remains focused, persists, and does
  not create horizontal overflow.
- Renderer/component coverage, typecheck, the multi-resolution editor smoke,
  and diff check all pass.

## Result

- HTML ordered-list conversion now honors a positive `value` attribute on
  individual list items and continues numbering from that explicit value.
- The real editor regression smoke now pastes an ordered list with
  `start="3"` and `li value="7"` and verifies persisted Markdown keeps
  `3.`, `7.`, and `8.` numbering across desktop and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T20-32-07-968Z`
- [x] `git diff --check`
