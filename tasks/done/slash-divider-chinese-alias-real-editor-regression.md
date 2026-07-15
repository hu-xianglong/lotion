# Slash Divider Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Dividers are a common Notion writing block. English `/divider` has real editor
coverage, but Chinese users should be able to type `/分割` and get the same
rendered divider, markdown persistence, continuation behavior, and layout
guarantees.

## Acceptance Criteria

- Slash command unit coverage asserts that the `/分割` alias resolves to
  Divider.
- Typing `/分割` in the real editor opens the slash menu and selects the
  Divider command.
- Committing the command removes the localized slash query, keeps editor focus,
  and renders a divider widget.
- Following text persists after the divider markdown and the page remains
  layout-safe across desktop and compact viewports.

## Backend Tests

No backend service changes are expected. This task adds shared slash command
lookup coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `分割` alias
  resolves to the Divider command.
- Parameterized the real editor divider smoke and added `/分割` coverage
  across desktop and compact viewports.
- Verified localized divider command selection, slash query cleanup, rendered
  divider preview, markdown persistence before following text, editor focus, and
  layout safety.
- Fixed a stale failure-diagnostic variable in the todo slash smoke so future
  failures report the original menu state cleanly.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
