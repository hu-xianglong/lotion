# Notion HTML nested list paste real editor regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and the
ongoing Notion HTML paste parity sequence.

## Problem

Nested lists are common in Notion exports and rich clipboard HTML. Lotion
should preserve nested bullet/numbered structure when users paste HTML into the
local editor, not flatten child list items into parent text.

## Acceptance

- Pasting HTML with nested bullet and ordered lists stores indented Markdown
  list items.
- Nested ordered-list start values are preserved inside the nested list.
- The pasted nested list renders in the real editor across desktop and compact
  viewports.
- Continued typing after the pasted list remains focused, persists, and does
  not create horizontal overflow.
- Renderer/component coverage, typecheck, the multi-resolution editor smoke,
  and diff check all pass.

## Result

- The multi-resolution editor regression smoke now pastes nested Notion-style
  HTML lists and verifies persisted Markdown keeps parent, child, and nested
  ordered-list indentation.
- Existing conversion behavior already preserved this case; the task adds
  coded coverage so future paste changes cannot flatten nested lists silently.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T20-44-01-878Z`
- [x] `git diff --check`
