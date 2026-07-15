# Notion HTML code br paste real editor regression

Status: done

## Why

Some rich HTML clipboards represent code block line breaks as `<br>` elements
inside `<pre><code>`. Lotion's rich paste path should preserve those line
breaks in the Markdown fence instead of flattening multiple code lines into one
line.

This continues the focused Notion HTML paste regression sequence from the
editor parity backlog.

## Acceptance

- Pasting HTML that contains `<pre><code>line 1<br>line 2</code></pre>` stores
  a Markdown code fence with two separate code lines.
- The rendered editor continues to style both pasted lines as code.
- Continued typing after the pasted code block lands below it and persists.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.
- Lower-level/backend tests are not required if this only touches renderer
  clipboard conversion and UI smoke coverage; no backend/service behavior
  changes.

## Result

- HTML clipboard conversion now reads `<br>` inside pasted `<pre>` blocks as
  newline characters before producing the Markdown code fence.
- The editor regression smoke now pastes a real HTML code block with `<br>`
  between two code lines, verifies persisted Markdown keeps separate lines,
  checks both rendered code lines, continues typing below the block, and asserts
  focus/no horizontal overflow in desktop and compact viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T20-20-06-520Z`
- [x] `git diff --check`
