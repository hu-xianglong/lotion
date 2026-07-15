# Markdown table direct editing harness regression

## Goal

Move the Markdown table direct-edit regression into the shared multi-viewport UI
harness so table editing is protected with the same production-grade checks as
the newer editor and preview tests.

## Acceptance

- The shared Markdown preview harness renders a fixture Markdown table in live
  preview mode across desktop and compact viewports.
- A visible body cell is directly editable.
- Pressing Escape cancels a pending table-cell edit and leaves the rendered
  value plus persisted Markdown unchanged.
- Pressing Enter commits a changed cell value, re-renders the table, and
  persists the updated Markdown through the page API.
- The table widget stays visible, within the viewport, and does not introduce
  document horizontal overflow.

## Backend Coverage

This is renderer/UI coverage for Markdown table editing behavior. The smoke
uses the existing page markdown update path and does not change backend
service or persistence code, so backend tests are not applicable.

## Result

- Added a Markdown table fixture to the shared multi-viewport Markdown preview
  harness.
- The harness now asserts table visibility, no horizontal overflow, editable
  cell semantics, Escape cancel behavior, Enter commit behavior, re-rendering,
  and persisted Markdown through `window.lotion.pages.get`.
- Fixed a renderer bug where pressing Escape in a Markdown table cell left the
  cell's internal cancelled state set forever, so editing the same cell again
  would update only the DOM and never commit to Markdown. The cell edit session
  now resets on focus.

## Gates

- `node --check scripts/smoke-markdown-preview-harness-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-harness-ui`
- `git diff --check`
