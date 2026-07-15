# Notion HTML code language paste real editor regression

Status: done

## Why

Notion and browser HTML can preserve code block languages on
`<pre><code class="language-*">` nodes. Lotion's rich paste path should keep
that language in the Markdown fence so imported or pasted snippets continue to
render as language-tagged code blocks.

This continues the focused Notion HTML paste regression sequence from the
editor parity backlog.

## Acceptance

- Pasting HTML that contains `<pre><code class="language-ts">...</code></pre>`
  stores a Markdown code fence with the `ts` language tag.
- The rendered editor continues to style the pasted code block as code.
- Continued typing after the pasted code block lands below it and persists.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.
- Lower-level/backend tests are not required if this only touches renderer
  clipboard conversion and UI smoke coverage; no backend/service behavior
  changes.

## Result

- HTML clipboard conversion now maps `<pre><code class="language-ts">` to a
  Markdown code fence with the `ts` language tag.
- The editor regression smoke now pastes a real language-tagged HTML code
  block, verifies persisted Markdown includes the language fence, checks code
  preview styling, continues typing below the block, and asserts focus/no
  horizontal overflow in desktop and compact viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T19-57-27-750Z`
- [x] `git diff --check`
