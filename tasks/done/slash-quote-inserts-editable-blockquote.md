# Slash quote inserts editable blockquote

Status: done

## Why

The slash menu is part of the core Notion-like writing loop. `/quote` already
exists as a basic command, but it is not protected by the current multi-viewport
editor smoke. A regression here would push users back into raw Markdown for a
common writing block.

## Acceptance

- `/quote` replaces the slash trigger with a Markdown blockquote and places the
  cursor after the quote marker.
- Typing immediately after insertion stores the expected Markdown source.
- The live preview renders an editable blockquote line instead of exposing a
  raw slash trigger.
- Continued editing after the quote remains possible.
- The regression is covered by slash unit tests and the shared multi-resolution
  editor smoke with geometry/overflow checks.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`

## Result

- Added slash-template coverage for `/quote`, including the expected blockquote
  Markdown and cursor placement.
- Extended the shared multi-resolution editor regression smoke so desktop and
  compact viewports insert `/quote`, type into the quote, verify the rendered
  blockquote decoration, confirm persisted Markdown, continue editing, and check
  for horizontal overflow.

Backend tests are not applicable for this item because the behavior uses the
existing slash-command template API and editor persistence path; the change only
adds focused coverage for the existing frontend writing loop.
