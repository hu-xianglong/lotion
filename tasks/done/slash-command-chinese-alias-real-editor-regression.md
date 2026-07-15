# Slash Command Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Slash command unit coverage proves Chinese aliases such as `/文本` map to the
Text command, but the real editor smoke only exercises English slash commands.
Chinese UI/content is a first-class Lotion workflow, so the CodeMirror path
should prove localized slash aliases work end to end across viewports.

## Acceptance Criteria

- Typing `/文本` in the real editor opens the slash menu and selects the Text
  command.
- Committing the command removes the slash query, keeps editor focus, and lets
  the user continue typing without extra navigation.
- The inserted content persists as a plain paragraph, not a heading, list,
  quote, table, or other markdown wrapper.
- The flow runs across desktop and compact viewports with no horizontal
  overflow.

## Backend Tests

No backend/service tests were needed because this item only adds UI coverage for
existing renderer alias behavior. The slash command alias lookup already has
unit coverage in `scripts/test-slash-commands.mjs`; renderer component coverage
still runs as a focused gate.

## Changes

- Extended the shared editor regression smoke with a real `/文本` slash command
  path.
- The smoke now verifies the Chinese alias selects Text, commits with Enter,
  removes the slash query, preserves editor focus, persists typed content as a
  plain paragraph, and checks for horizontal overflow across desktop and compact
  viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
