# Slash Task Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

The To-do slash command already has real editor coverage for `/待办`,
`/任务列表`, and `/复选框`, but the command also advertises `任务`. That is a
short natural Chinese query for task creation and should stay protected in the
real editor.

## Acceptance Criteria

- Slash command unit coverage asserts that the Chinese `任务` query resolves to
  the To-do command.
- Typing `/任务` in the real editor opens the slash menu and selects To-do.
- Committing the command removes the localized query, creates an unchecked
  task, allows toggling it checked, and persists both markdown states.
- The editor remains focused and layout-safe across desktop and compact
  viewports.

## Backend Tests

No backend service changes are expected. This task adds slash command lookup
coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `任务` query
  resolves to the To-do command.
- Added desktop and compact UI smoke coverage for `/任务`, including localized
  query cleanup, To-do selection, unchecked and checked task persistence,
  editor focus retention, and layout overflow checks.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T08-00-31-255Z`
  - Desktop and compact results include `slashChineseTaskTodo.checked: true`.
- [x] `git diff --check`
