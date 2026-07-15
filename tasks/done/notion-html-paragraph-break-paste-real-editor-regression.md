# Notion HTML paragraph break paste real editor regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and the
ongoing Notion HTML paste parity sequence.

## Problem

Rich HTML copied from Notion or browsers often represents manual line breaks
inside a paragraph as `<br>`. Lotion should preserve those visible line breaks
when pasting into the real editor instead of flattening the text into one line
or converting it into an awkward extra paragraph.

## Acceptance

- Pasting HTML that contains `<p>first<br>second</p>` stores Markdown with the
  line break preserved between the two text segments.
- The pasted lines render in the real editor across desktop and compact
  viewports.
- Continued typing after the pasted paragraph remains focused, persists, and
  does not create horizontal overflow.
- Renderer/component coverage, typecheck, the multi-resolution editor smoke,
  and diff check all pass.

## Result

- Added multi-resolution real-editor smoke coverage for pasting an HTML
  paragraph with a `<br>` line break.
- Verified the existing HTML clipboard conversion already preserves the line
  break in persisted Markdown and rendered editor lines.
- No backend/service tests were needed because this item only strengthens the
  real Electron UI regression coverage around existing parser behavior.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T21-25-49-202Z`
- [x] `git diff --check`
