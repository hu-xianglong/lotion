# Slash Todo Task Checkbox Editing Regression

Status: wip

Split from `tasks/todo/notion-core-parity-sequence.md` slash/live-preview
editing and `tasks/todo/ui-regression-lab-and-renderer-coverage.md` editor
coverage.

## Goal

The Notion-like `/todo` writing path should be protected by coded UI coverage:
insert a to-do block from the slash menu, see a real checkbox in the editor,
toggle it, and persist the checked Markdown state.

## Acceptance

- In the normal page editor, typing `/todo` and pressing Enter inserts a task
  row without leaving raw slash text behind.
- The task row renders a visible, clickable checkbox widget in the CodeMirror
  editing surface.
- Clicking the checkbox toggles the task to checked and persists `- [x] ...`
  to the page markdown.
- The flow remains stable at desktop and compact viewports with no horizontal
  overflow.

## Gates

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- Added desktop and compact UI smoke coverage for the `/todo` slash command:
  inserts a task row, renders a live checkbox, toggles it, persists `- [x]`,
  restores editor focus, and continues through paste, long URL, page switch,
  reload, empty row, and large-document editor paths.
- Fixed task checkboxes so the live checkbox remains visible/interactable on
  the active line and returns focus to CodeMirror after toggling.
- Fixed two persistence issues exposed by the editor smoke:
  - `PageService.update` now serializes concurrent updates for the same page so
    markdown autosave and page setting updates do not overwrite each other.
  - `PagesDatabaseService` records/schema caches are scoped to the active
    workspace root so isolated UI workspaces cannot inherit another workspace's
    pages database cache.
- Added customer API regression tests for concurrent page update serialization
  and workspace-scoped pages database cache behavior.

## Verified

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:customer-api`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`
