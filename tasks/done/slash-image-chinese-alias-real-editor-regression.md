# Slash Image Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Image insertion and source/preview toggling have repeatedly regressed. The
English `/image` path now has real editor coverage, but localized users should
get the same confidence for `/图片` because it exercises the same hidden-source
preview and hover edit-source path.

## Acceptance Criteria

- Typing `/图片` in the real editor opens the slash menu and selects the Image
  command.
- Committing the command removes the localized slash query, keeps editor focus,
  and lets the user type alt text immediately.
- The inserted image persists as markdown, renders as a preview without leaking
  source by default, exposes the hover Edit source affordance, reveals source
  when requested, then hides source again after leaving the source area.
- The flow runs across desktop and compact viewports with no horizontal
  overflow.

## Backend Tests

Expected not applicable for this item: slash command alias lookup already has
unit coverage in `scripts/test-slash-commands.mjs`; this task strengthens the
real renderer/editor integration path without changing parser, data, or service
behavior.

## Changes

- Parameterized the existing slash image editor smoke so localized aliases run
  through the same real CodeMirror insertion, preview, source reveal, and source
  hide path as `/image`.
- Added a `/图片` path across desktop and compact viewports that verifies Image
  command selection, localized command cleanup, immediate alt-text typing,
  markdown persistence, rendered preview without source leakage, hover-visible
  Edit source behavior, focused source editing, preview restoration, editor
  focus restoration, and no horizontal overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
