# Slash Link Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

The English `/link` command has real editor coverage, and links are a repeated
source of editing/opening regressions. The Chinese `/网址` alias should exercise
the same CodeMirror path so localized users can insert an editable/openable link
without falling back to English commands.

## Acceptance Criteria

- Typing `/网址` in the real editor opens the slash menu and selects the Link
  command.
- Committing the command removes the slash query, keeps editor focus, and lets
  the user type link label text immediately.
- The inserted link persists as markdown, renders as an inline link, and opens
  the expected URL only on the modifier-click path.
- The flow runs across desktop and compact viewports with no horizontal
  overflow.

## Backend Tests

Expected not applicable for this item: slash command alias lookup already has
unit coverage in `scripts/test-slash-commands.mjs`; this task strengthens the
real renderer/editor integration path without changing data or service
behavior.

## Changes

- Parameterized the existing slash link editor smoke so localized aliases run
  through the same real CodeMirror insertion/opening path as `/link`.
- Added a `/网址` path across desktop and compact viewports that verifies the
  Link command selection, command cleanup, immediate label typing, markdown
  persistence, rendered inline link visibility, modifier-click opening, editor
  focus restoration, and no horizontal overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
