# Notion HTML sup/sub paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Rich browser and Notion-like HTML paste can include superscript and subscript
inline marks. The clipboard converter currently flattens `<sup>` and `<sub>`
to plain text, and live preview has no inactive-line decoration for those safe
inline tags.

## Acceptance

- Pasting HTML containing `<sup>` and `<sub>` stores safe inline
  `<sup>...</sup>` and `<sub>...</sub>` source.
- The real CodeMirror live-preview surface renders the pasted text as
  superscript/subscript on inactive lines and hides the raw tags.
- Continued typing after the pasted inline math-like marks remains responsive
  and persists.
- The regression is covered in the shared multi-resolution editor smoke.
- Backend/service tests are not applicable unless the implementation touches
  persistence or API behavior; this item should stay in the renderer clipboard
  conversion and UI smoke path.

## Result

- Preserved pasted Notion/browser HTML superscript and subscript semantics by
  converting `<sup>` and `<sub>` inline nodes to safe inline HTML markdown
  source.
- Added live-preview inline decorations for safe `<sup>`/`<sub>` tags so
  inactive lines render script text and hide raw markers.
- Added multi-resolution real editor smoke coverage for desktop and compact
  viewports that pastes script HTML, verifies stored source, verifies
  inactive-line script rendering, continues typing, and checks persistence.
- Backend/service tests are not applicable because this change is limited to
  renderer clipboard conversion, inline decorations, and existing page
  persistence APIs.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  (`artifacts/ui-smoke/editor-regression-2026-06-15T05-14-21-317Z`)
- [x] `git diff --check`
