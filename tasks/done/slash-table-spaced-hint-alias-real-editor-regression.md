# Slash Table Spaced Hint Alias Real Editor Regression

Status: done

## Goal

Make `/Markdown 表格` work as an explicit slash-menu alias for Table, matching
the visible command hint even though it contains a space.

## Acceptance

- The slash command filter resolves `Markdown 表格` to `table`.
- The real editor keeps the slash menu open for command queries containing
  spaces after the slash.
- Typing `/Markdown 表格` in the real editor selects Table, inserts a markdown
  table, keeps the rendered table directly editable, persists a cell edit, and
  has no horizontal overflow across desktop and compact viewports.

## Result

- Added `Markdown 表格` as an explicit Table slash-command alias.
- Updated CodeMirror slash detection so command queries can contain spaces,
  while pure whitespace after `/` still closes the menu.
- Added slash-command unit coverage for resolving `Markdown 表格` to `table`.
- Extended the multi-resolution real editor regression smoke to type
  `/Markdown 表格`, insert a table, edit a rendered table cell, and verify the
  edit persists.
- No backend/service tests were needed because this only changes shared slash
  command metadata and renderer editor behavior.

## Verification

- [x] `npm exec -- tsc -p tsconfig.main.json`
- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
