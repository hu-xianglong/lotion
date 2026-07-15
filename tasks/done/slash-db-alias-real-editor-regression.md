# Slash DB Alias Real Editor Regression

Status: done

## Goal

Make sure `/db` works as a real-editor alias for dynamic database view slash
commands, without falling back to the static Markdown table command.

## Acceptance

- Dynamic database slash commands resolve `db` to the target database command.
- Typing `/db` in the real editor exposes the fixture database row, inserts a
  `lotion-view` block, and removes the slash query.
- The embedded database widget renders with the expected database name and lets
  the user continue typing below the view.
- The multi-resolution editor smoke covers desktop and compact viewports with
  no horizontal overflow.

## Result

- Added slash-command unit coverage for resolving `db` to a dynamic database
  slash command.
- Extended the multi-resolution real editor regression smoke to type `/db`,
  click the fixture database command, verify the `lotion-view` markdown block,
  render the embedded database widget, and continue typing below it.
- No backend/service tests were needed because this only exercises existing
  slash metadata and renderer editor behavior.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T08-44-17-635Z`
  - Desktop and compact results include `slashDbDatabaseView.rendered: true`.
- [x] `git diff --check`
