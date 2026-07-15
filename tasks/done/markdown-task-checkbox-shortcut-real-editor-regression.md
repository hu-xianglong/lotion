# Markdown task checkbox shortcut real editor regression

Status: done

## Why

Slash todo insertion is covered, and the preview harness covers task checkbox
rendering. The real editor also needs coverage for the common Markdown writing
path: typing `- [ ] task` directly should produce an editable checkbox, persist
as unchecked Markdown, toggle to checked Markdown, and keep the editor usable.

## Scope

- Extend the shared editor regression smoke across desktop and compact
  viewports.
- Type a task checkbox line directly into the editor, without using slash.
- Assert the checkbox renders, starts unchecked, toggles with a click, persists
  as `- [x] ...`, restores editor focus, and does not introduce horizontal
  overflow.

## Acceptance

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

Backend tests are not applicable unless the implementation touches persistence,
parser, or service behavior; this item is expected to add UI regression coverage
for existing editor task checkbox behavior.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

The editor smoke now types `- [ ] ...` directly in both desktop and compact
viewports, verifies the rendered checkbox starts unchecked, toggles to checked,
persists as `- [x] ...`, restores editor focus, exits the task list cleanly, and
checks for horizontal overflow.

Backend/service tests are not applicable because this item only adds UI
regression assertions for existing editor checkbox and autosave behavior; no
parser, persistence, or service code changed.
