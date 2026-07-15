# Slash Menu Tab Commits Active Command Regression

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` slash/live-preview
editing coverage.

## Why

The slash menu supports Tab as a keyboard commit shortcut, but the real editor
smoke only covered Enter activation. In a Notion-like editor, Tab should not
move focus away or leave slash text behind when the menu is open.

## Acceptance Criteria

- Opening the slash menu from the real editor with `/h1` marks Heading 1 active.
- Pressing Tab commits the active command, closes the menu, keeps editor focus,
  and removes the slash query.
- Typing immediately after Tab insertion persists as a Heading 1 markdown line.
- The path is covered in the shared multi-resolution editor UI smoke with no
  horizontal overflow. Static renderer component coverage is run for the slash
  menu active-state surface.

## Changes

- Extended the existing slash-menu keyboard UI regression path with a Tab
  activation branch.
- The shared editor smoke now opens `/h1`, verifies Heading 1 is active,
  presses Tab, checks the menu closes and the query is removed, then types
  heading text and verifies it persists as `# ...`.
- The same path runs across desktop and compact viewports.

## Backend Tests

No backend/service tests were needed because this item only adds UI coverage for
existing renderer keyboard behavior. Static renderer component coverage still
runs for the slash menu active-state rendering surface.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
