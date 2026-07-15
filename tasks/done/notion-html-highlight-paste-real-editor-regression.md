# Notion HTML highlight paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Notion and browser rich-text copy paths often represent highlighted text as
`<mark>`. Lotion's HTML clipboard conversion should not flatten that styling
into plain text, because imported/pasted review notes lose a visible semantic
cue and the live editor already supports safe inline highlight rendering.

## Acceptance

- Pasting HTML containing `<mark>` stores safe inline `<mark>...</mark>`
  Markdown/HTML source.
- The real CodeMirror live-preview surface renders the pasted text with the
  existing highlight decoration instead of leaking raw markers on inactive
  lines.
- Continued typing after the pasted highlight remains responsive and persists.
- The regression is covered in the shared multi-resolution editor smoke.
- Backend/service tests are not applicable unless the implementation touches
  persistence or API behavior; this item should stay in the renderer clipboard
  conversion and UI smoke path.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - First run exposed a late-suite page-close flake outside the highlight path:
    `artifacts/ui-smoke/editor-regression-2026-06-15T04-33-53-404Z`.
  - Rerun passed:
    `artifacts/ui-smoke/editor-regression-2026-06-15T04-40-15-381Z`.
- [x] `git diff --check`

## Result

- HTML clipboard conversion now maps `<mark>` and simple inline
  `span` background-color highlights to safe inline `<mark>...</mark>` source.
- The shared editor regression smoke now pastes both forms, verifies persisted
  source, verifies live-preview highlight decorations in desktop and compact
  viewports, and confirms continued typing/autosave remains stable.
- Backend/service tests are not applicable because this is renderer clipboard
  conversion and UI behavior only; page persistence APIs are unchanged.
