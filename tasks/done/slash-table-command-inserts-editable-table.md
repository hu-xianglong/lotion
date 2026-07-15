# Slash Table Command Inserts Editable Table

Status: done

## Why

`/table` is a core Notion-like writing primitive. It should not just insert raw
Markdown text; the live editor should render the inserted table and keep the
cells directly editable in the page flow.

## Acceptance

- Added slash command unit coverage for the table template.
- Added multi-resolution editor UI smoke coverage for inserting `/table`
  through the real slash menu.
- Fixed the table slash template by adding explicit `{{cursor}}` template
  support so Markdown table pipes are not mistaken for the cursor marker.
- Verified the inserted table renders as the live table widget, exposes editable
  cells, and accepts a direct cell edit.
- Verified the edited table cell persists back to the page markdown and the
  flow has no horizontal overflow at desktop and compact viewports.
- Hardened the todo slash smoke to exit task-list continuation before testing
  later slash commands.

## Verification

- Passed: `node --check scripts/smoke-editor-regression-ui.mjs`
- Passed: `npm run test:slash`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
- Passed: `git diff --check`

Backend/service tests are not applicable because this item exercises existing
slash-command template behavior and the existing live Markdown table editor
through the frontend UI.
