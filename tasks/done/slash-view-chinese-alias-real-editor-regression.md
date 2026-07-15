# Slash View Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Dynamic database view slash commands already support the Chinese `数据库` alias.
The same command advertises `视图`, and Chinese users should be able to insert
an embedded database view from the real editor through `/视图` with the same
Notion-like behavior.

## Acceptance Criteria

- Slash command unit coverage asserts that the Chinese `视图` query resolves to
  dynamic database commands.
- Typing `/视图` in the real editor opens the slash menu and exposes the
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

- Added dynamic slash-command unit coverage that verifies the Chinese `视图`
  query resolves to database view commands.
- Added desktop and compact UI smoke coverage for `/视图`, including localized
  query cleanup, visible database command selection, `lotion-view` markdown
  persistence, rendered embedded database preview without source leakage,
  continuation after the view fence, focus retention, and layout overflow
  checks.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T07-49-38-268Z`
  - Desktop and compact results include `slashChineseViewDatabaseView.rendered:
    true`.
- [x] `git diff --check`
