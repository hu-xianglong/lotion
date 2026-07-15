# Slash Database Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Embedded database views are core Notion parity. Lotion has real editor coverage
for inserting a fixture database view through an English query, but Chinese
users should be able to type `/数据库`, choose the intended database result, and
get the same hidden-source embedded view behavior.

## Acceptance Criteria

- Slash command unit coverage asserts that the Chinese `数据库` query resolves
  to dynamic database commands.
- Typing `/数据库` in the real editor opens the slash menu and exposes the
  intended database result.
- Selecting the database removes the localized query, persists the expected
  `lotion-view` block, and renders the embedded database view without source
  leakage.
- Following text lands after the embedded view fence, editor focus remains
  usable, and the page stays layout-safe across desktop and compact viewports.

## Backend Tests

No backend service changes are expected. This task adds dynamic slash command
lookup coverage plus real renderer/editor smoke coverage.

## Changes

- Added dynamic slash-command unit coverage that verifies the Chinese
  `数据库` query resolves to database view commands.
- Parameterized the real editor embedded database smoke so it can exercise
  localized slash commands without duplicating the English path.
- Added desktop and compact UI smoke coverage for `/数据库`, including localized
  query cleanup, visible database command selection, `lotion-view` markdown
  persistence, rendered embedded database preview without source leakage,
  continuation after the view fence, focus retention, and layout overflow
  checks.
- Tightened embedded database insertion waits to check that the target
  `database:` marker count increases, preventing stale earlier views from
  satisfying later insertions.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
