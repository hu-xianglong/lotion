# Slash Menu Empty Result Recovery Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

The slash menu has a static empty-state renderer test, but the real editor path
should also prove that unmatched slash queries do not trap the user. A
Notion-like editor should show a clear no-results state, let Escape dismiss it,
keep the query editable, and let normal typing continue.

## Acceptance Criteria

- Typing an unmatched slash query in the real editor opens a visible empty
  slash menu state with no command rows.
- The empty state is visible and within the viewport across desktop and compact
  viewports.
- Escape closes the empty slash menu, keeps editor focus, leaves the query
  editable, and allows cleanup plus continued typing.
- Continued typing persists to markdown and the editor layout has no horizontal
  overflow.

## Changes

- Extended the shared editor regression smoke with a real unmatched slash-query
  path.
- The smoke now types an unmatched slash query, verifies the localized empty
  state, asserts no command rows are rendered, presses Escape, checks editor
  focus and query editability, removes the query, and verifies continued typing
  persists.
- The path runs across desktop and compact viewports.

## Backend Tests

No backend/service tests were needed because this item only adds UI coverage for
existing renderer empty-state behavior. Static renderer component coverage
already covers the slash menu empty-state markup and still runs as a focused
gate.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
