# Notion HTML color class paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Notion export/import already preserves `block-color-*` and `highlight-*`
classes as safe Lotion color spans, but direct HTML paste into the editor still
flattens those classes to plain text or generic marks. Users should not lose
foreground/background color semantics when pasting colored Notion snippets.

## Acceptance

- Pasting HTML containing Notion foreground `block-color-*` classes stores safe
  `<span data-lotion-color="...">...</span>` markdown source.
- Pasting HTML containing Notion background `block-color-*_background` or
  `highlight-*` classes stores safe `<span data-lotion-bg="...">...</span>`
  markdown source.
- The real CodeMirror live-preview surface renders the pasted color spans with
  existing Notion color/background decorations on inactive lines and hides raw
  span tags.
- Continued typing after the pasted colored spans remains responsive and
  persists.
- The regression is covered in the shared multi-resolution editor smoke.
- Backend/service tests are not applicable unless the implementation touches
  persistence or API behavior; this item should stay in the renderer clipboard
  conversion and UI smoke path.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-15T05-27-55-752Z`
- [x] `git diff --check`

Backend/service tests were not applicable: the implementation only changes the
renderer clipboard HTML-to-Markdown conversion path and the multi-resolution UI
smoke coverage around that path.
