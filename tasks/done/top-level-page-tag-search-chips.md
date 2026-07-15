# Top-Level Page Tag Search Chips

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` tag pages/richer
backlink workflows and `tasks/todo/ui-regression-lab-and-renderer-coverage.md`
property interaction coverage.

## Goal

Top-level page tags should not be static text. When a page has tags, the
property panel should show Notion-like tag chips that are visibly clickable,
keyboard focusable, and open the global search with that tag prefilled.

## Implementation

- `PageProperties` now renders saved top-level page tags as compact search
  chips while preserving the editable tags input.
- Clicking a chip opens global search with the exact tag value prefilled.
- Keyboard focus plus Enter on the chip opens the same global search path.
- The editor regression smoke fixture now includes page tags and the current
  system pages `small_text` schema field so page-setting persistence checks run
  against the production schema shape.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

The focused UI smoke runs desktop and compact viewports. It asserts chip
visibility, click and keyboard activation, focused global search input,
visible results, panel bounds, and absence of horizontal document overflow.
