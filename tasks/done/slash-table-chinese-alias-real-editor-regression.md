# Slash Table Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Tables are a common Notion-style writing block and Lotion already supports
editable Markdown table widgets from `/table`. Chinese users should get the
same behavior from `/表格`: localized slash matching, command cleanup, rendered
editable table widget, cell edit persistence, continuation after the table, and
layout safety across viewports.

## Acceptance Criteria

- Slash command unit coverage asserts that the `/表格` alias resolves to Table.
- Typing `/表格` in the real editor opens the slash menu and selects the Table
  command.
- Committing the command removes the localized slash query and persists a valid
  Markdown table.
- The rendered table widget exposes editable body cells, direct cell editing
  persists to Markdown, following text lands after the table, and the page stays
  layout-safe across desktop and compact viewports.

## Backend Tests

No backend service changes are expected. This task adds shared slash command
lookup coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `表格` query
  resolves to the Table command.
- Parameterized the real editor table smoke so it can exercise localized slash
  commands and assert the active menu command.
- Added desktop and compact UI smoke coverage for `/表格`, including localized
  menu selection, slash query cleanup, Markdown table persistence, rendered
  editable table cells, direct cell edit persistence, continuation after the
  table, and layout overflow checks.
- Tightened the table smoke to wait for the Markdown table count to increase,
  preventing later table insertions from passing on stale earlier tables.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
