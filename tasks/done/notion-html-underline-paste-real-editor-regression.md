# Notion HTML underline paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Notion import parity and rich browser paste both need underline preservation.
The live editor already supports safe inline `<u>`/`<ins>` decoration, but the
HTML clipboard converter currently flattens those elements to plain text.

## Acceptance

- Pasting HTML containing `<u>` or `<ins>` stores safe inline `<u>...</u>`
  source.
- The real CodeMirror live-preview surface renders the pasted text with the
  existing underline decoration on inactive lines.
- Continued typing after the pasted underline remains responsive and persists.
- The regression is covered in the shared multi-resolution editor smoke.
- Backend/service tests are not applicable unless the implementation touches
  persistence or API behavior; this item should stay in the renderer clipboard
  conversion and UI smoke path.

## Result

- Preserved pasted Notion/browser HTML underline semantics by converting `<u>`
  and `<ins>` inline nodes to safe `<u>...</u>` markdown source.
- Added multi-resolution real editor smoke coverage for desktop and compact
  viewports that pastes underlined HTML, verifies stored source, verifies
  inactive-line underline rendering, continues typing, and checks persistence.
- Backend/service tests are not applicable because this change is limited to
  renderer clipboard conversion and existing page persistence APIs.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  (`artifacts/ui-smoke/editor-regression-2026-06-15T05-02-06-675Z`)
- [x] `git diff --check`
