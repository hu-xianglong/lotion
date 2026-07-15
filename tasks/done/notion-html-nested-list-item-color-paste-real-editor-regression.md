# Notion HTML nested list item color paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Notion HTML can place `block-color-*` classes on nested list items. Item 508
protects top-level list items, but nested list conversion is a separate recursive
path and should preserve foreground/background color wrappers without flattening
the list.

## Acceptance

- Pasting a nested unordered list where the child `<li>` has a Notion
  `block-color-*_background` class stores the child as an indented list item
  with a safe background span.
- Pasting a nested ordered list where the child `<li>` has a Notion foreground
  `block-color-*` class stores the child as an indented ordered item with a safe
  foreground span.
- The real CodeMirror live-preview surface renders nested list item color spans
  with existing Notion color/background decorations and hides raw span source
  when the cursor leaves the lines.
- Continued typing after the pasted nested colored list remains responsive and
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
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-15T06-20-57-490Z/result.json`
  - Covered desktop and compact viewports.
  - Verified nested unordered background-color and nested ordered foreground
    list item colors persist as safe spans and render without raw span source
    leakage.
- [x] `git diff --check`

Backend/service tests are not applicable for this item because it only adds
multi-resolution real-editor coverage around renderer paste conversion behavior
already exercised through the existing Markdown persistence path.
