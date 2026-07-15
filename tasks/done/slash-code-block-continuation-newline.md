# Slash Code Block Continuation Newline

Status: done

Backlog item: Notion core parity sequence slash/live-preview editing.

## Why

The slash menu has a Code block command, but its template ends immediately after
the closing fence. When users leave the block and continue typing, the next text
can attach to the closing fence instead of starting as normal body text. Code
block insertion should be safe for continuous writing.

## Acceptance

- `/code` inserts a fenced code block with the cursor inside the body.
- The template includes a trailing newline after the closing fence.
- Moving to the document end and typing after insertion places new text after
  the code block, not on the closing fence line.
- The behavior is covered in the multi-resolution editor regression smoke.

## Tests

- `npm run test:slash`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- `/code` now inserts a fenced code block with a trailing newline after the
  closing fence.
- The slash command cursor still lands inside the code block body.
- Editor regression smoke now inserts a code block from the slash menu, types
  code, moves to the document end, types normal text after the closing fence,
  and verifies the persisted Markdown structure across desktop and compact
  viewports.

## Backend Tests

`npm run test:slash` covers the pure slash command template. Additional backend
tests are not applicable because persistence, workspace storage, and Markdown
rendering services were not changed.
