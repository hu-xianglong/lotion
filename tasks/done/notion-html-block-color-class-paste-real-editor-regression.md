# Notion HTML block color class paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Notion export often stores color classes on block containers such as paragraphs
and headings, not only on inline spans. Lotion's direct HTML paste path should
preserve those block-level foreground/background color semantics instead of
flattening the block to unstyled text.

## Acceptance

- Pasting a paragraph with a Notion foreground `block-color-*` class stores a
  safe `<span data-lotion-color="...">...</span>` wrapper.
- Pasting a paragraph or heading with `block-color-*_background` stores a safe
  `<span data-lotion-bg="...">...</span>` wrapper while preserving the heading
  markdown marker.
- The real CodeMirror live-preview surface renders the block color wrappers
  with existing Notion color/background decorations on inactive lines and hides
  raw span tags.
- Continued typing after the pasted colored block remains responsive and
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
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-15T05-51-57-937Z/result.json`
- [x] `git diff --check`

Backend/service tests were not applicable: the implementation only changes the
renderer clipboard HTML-to-Markdown conversion path and the multi-resolution UI
smoke coverage around that path.
