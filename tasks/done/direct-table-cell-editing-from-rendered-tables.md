# Direct table cell editing from rendered tables

## Goal

Let users edit visible table cells directly instead of having to switch back to
raw source. This covers Markdown/GFM table previews in page bodies and protects
database table direct cell editing with a focused UI smoke.

## Acceptance

- Rendered Markdown table cells are focusable/editable.
- Blurring or pressing Enter commits a changed Markdown table cell back to the
  page source and re-renders the table with the new value.
- Escape cancels an in-progress Markdown table cell edit.
- A coded UI smoke edits a rendered Markdown table cell and verifies persistence.
- A coded UI smoke opens a database table, edits a visible cell directly, and
  verifies the updated value persists/re-renders.

## Backend Coverage

The implementation reuses existing page markdown updates and database
`updateCell` APIs. No backend/service behavior changed, so lower-level backend
tests are not applicable for this item.

## Result

- Rendered Markdown table cells are now `contenteditable` in preview mode.
- Blur or Enter commits changed Markdown table text back into the source table.
- Escape cancels a Markdown table cell edit and restores the original visible text.
- Markdown preview UI smoke now edits a rendered table cell and verifies both
  re-rendering and persisted markdown.
- Row page navigation UI smoke now edits a visible database table cell directly
  and verifies the value through `window.lotion.databases.get`.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `npm run smoke:row-page-navigation-ui`
- `git diff --check`
