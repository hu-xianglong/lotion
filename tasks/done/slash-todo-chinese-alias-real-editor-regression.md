# Slash Todo Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

The English `/todo` command has real editor coverage, and slash command unit
tests prove the Chinese `待办` alias maps to the To-do command. Because todo
checkboxes are a core writing workflow, the actual CodeMirror path should prove
that `/待办` inserts an editable task item and persists checkbox state.

## Acceptance Criteria

- Typing `/待办` in the real editor opens the slash menu and selects the To-do
  command.
- Committing the command removes the slash query, keeps editor focus, and lets
  the user type task text immediately.
- The inserted task starts unchecked, persists as `- [ ] ...`, can be checked in
  the rendered preview, and persists as `- [x] ...`.
- The flow runs across desktop and compact viewports with no horizontal
  overflow.

## Backend Tests

No backend/service tests were needed because this item only adds UI coverage for
existing renderer alias behavior. Slash command alias lookup already has unit
coverage in `scripts/test-slash-commands.mjs`; renderer component coverage still
runs as a focused gate.

## Changes

- Parameterized the existing slash todo editor regression path so it can cover
  both English and localized commands without duplicating checkbox assertions.
- Added a real `/待办` editor path that verifies the alias selects To-do,
  commits with Enter, removes the slash query, accepts immediate task text,
  starts unchecked, persists `- [ ] ...`, toggles through the rendered checkbox,
  persists `- [x] ...`, and checks for horizontal overflow across desktop and
  compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
