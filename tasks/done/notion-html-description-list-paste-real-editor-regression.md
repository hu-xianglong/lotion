# Notion HTML description list paste real editor regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and the
ongoing Notion HTML paste parity sequence.

## Problem

Browser and documentation HTML can represent term/description content with
`<dl><dt><dd>`. Lotion should paste that content into a readable Markdown shape
instead of joining the term and definition together without spacing.

## Acceptance

- Pasting HTML that contains a description list stores readable Markdown with
  the term and definition preserved.
- Multiple term/definition pairs are preserved in order.
- The pasted description list renders in the real editor across desktop and
  compact viewports.
- Continued typing after the pasted content remains focused, persists, and
  does not create horizontal overflow.
- Renderer/component coverage, typecheck, the multi-resolution editor smoke,
  and diff check all pass.

## Result

- Added explicit HTML clipboard conversion for `<dl>`, `<dt>`, and `<dd>`.
- Description lists now paste as readable Markdown bullets in the shape
  `- **Term**: Definition` instead of concatenating term and definition text.
- Extended the multi-resolution real-editor smoke to paste two description-list
  pairs, verify persisted Markdown, rendered editor text, continued typing,
  focus, and no horizontal overflow.
- No backend/service tests were needed because the implementation is scoped to
  the renderer clipboard conversion path; renderer coverage and real Electron
  UI smoke cover the changed behavior.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T21-37-47-123Z`
- [x] `git diff --check`
