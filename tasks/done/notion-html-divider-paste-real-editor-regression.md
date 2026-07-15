# Notion HTML divider paste real editor regression

Status: done

## Why

Notion and browser HTML can represent dividers as `<hr>`. Lotion's editor
should preserve that divider when rich HTML is pasted, instead of dropping it
from the stored Markdown.

This continues the focused Notion HTML paste regression sequence from the
editor parity backlog.

## Acceptance

- Pasting HTML that contains `<hr>` stores a Markdown `---` divider between the
  surrounding pasted blocks.
- The rendered editor shows the divider widget without leaking source while
  inactive.
- Continued typing after the pasted divider lands below it and persists.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.
- Lower-level/backend tests are not required. This task only touches renderer
  clipboard conversion and UI smoke coverage; no backend/service behavior
  changed.

## Result

- HTML clipboard conversion now maps block-level `<hr>` nodes to Markdown
  dividers.
- The editor regression smoke now pastes a real HTML divider between
  paragraphs, verifies `---` persistence, divider widget rendering, hidden raw
  source while inactive, continued typing, focus, and no horizontal overflow
  in desktop and compact viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T19-44-20-025Z`
- [x] `git diff --check`
