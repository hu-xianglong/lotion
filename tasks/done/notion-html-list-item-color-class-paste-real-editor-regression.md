# Notion HTML list item color class paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Notion HTML can place `block-color-*` classes directly on list item elements.
After block-level color paste support, list items remain a separate conversion
path and can still lose foreground/background colors during direct HTML paste.

## Acceptance

- Pasting an unordered list item with a Notion foreground `block-color-*` class
  stores a safe color span after the list marker.
- Pasting an ordered list item with `block-color-*_background` stores a safe
  background span after the ordered list marker.
- The real CodeMirror live-preview surface renders the pasted list item color
  spans with existing Notion color/background decorations on inactive lines and
  hides raw span tags.
- Continued typing after the pasted colored list remains responsive and
  persists.
- The regression is covered in the shared multi-resolution editor smoke.
- Backend/service tests are not applicable unless the implementation touches
  persistence or API behavior; this item should stay in renderer conversion and
  UI smoke coverage.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-15T06-07-06-326Z/result.json`
  - Covered desktop and compact viewports.
  - Verified unordered foreground list item color and ordered background list
    item color persist as safe spans and render without raw span source leakage.
- [x] `git diff --check`

Backend/service tests are not applicable for this item because the change stays
inside renderer HTML-paste conversion plus existing Markdown persistence and is
covered by renderer component tests and the real multi-resolution editor smoke.
