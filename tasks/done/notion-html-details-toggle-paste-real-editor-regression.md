# Notion HTML details toggle paste real editor regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and the
ongoing Notion HTML paste parity sequence.

## Problem

Rich HTML clipboards can represent toggle/disclosure blocks as
`<details><summary>...</summary>...</details>`. Lotion should preserve that
block as an editable toggle preview instead of flattening the summary and body
into ordinary paragraphs.

## Acceptance

- Pasting HTML `details/summary` stores a `lotion-toggle` Markdown fence.
- The summary, open state, and body text are preserved.
- The pasted toggle renders as the editable toggle widget across desktop and
  compact viewports.
- Continued typing after the pasted toggle remains focused, persists, and does
  not create horizontal overflow.
- Renderer/component coverage, typecheck, the multi-resolution editor smoke,
  and diff check all pass.

## Result

- HTML clipboard conversion now maps `<details>` blocks to existing
  `lotion-toggle` fences.
- The summary text, open state, and nested body Markdown are preserved.
- The multi-resolution editor regression smoke now pastes a real
  `details/summary` block and verifies the persisted fence plus rendered
  editable toggle widget.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T21-12-57-235Z`
- [x] `git diff --check`
