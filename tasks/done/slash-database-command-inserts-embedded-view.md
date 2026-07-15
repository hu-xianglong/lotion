# Slash database command inserts embedded view

Status: done

## Why

The slash menu should support Notion-like insertion of linked database views
from the editor. Lotion has dynamic database slash commands, but the real
frontend path is not covered: finding a database command, inserting the
`lotion-view` block, rendering the embedded view, and continuing to write.

## Acceptance

- A database-specific slash query selects a database command from the slash
  menu.
- The command inserts a `lotion-view` fenced block with the database id and
  default view id.
- The inserted block renders as an embedded database widget rather than visible
  raw source when the cursor leaves the block.
- The editor remains usable after insertion.
- The behavior is covered across desktop and compact editor smoke viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`

## Result

- Added slash-template coverage for applying a dynamic database command,
  including the generated `lotion-view` fenced block and cursor placement.
- Extended the shared multi-resolution editor regression smoke so desktop and
  compact viewports search a database-specific slash command, insert the
  embedded view, verify persisted Markdown, assert the rendered embedded-view
  widget hides source, continue typing after the fence, and check horizontal
  overflow.

Backend tests are not applicable for this item because it uses the existing
database slash-command generation and existing embedded-view renderer path; no
service or persistence behavior changed.
