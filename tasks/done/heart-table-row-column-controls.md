# ❤ Table Row And Column Controls

Status: done

Verification status: verified

## Context

Markdown tables can now render as editable widgets and expose `Edit source`, but
users still could not add or delete table rows and columns without switching to
raw markdown.

## Expected Behavior

- Hovering a rendered markdown table exposes structure controls.
- Users can add a row after the active row.
- Users can delete the active row.
- Users can add a column after the active column.
- Users can delete the active column while preserving at least one column.
- Existing table cell editing and `Edit source` still work.

## Fix Notes

- Add table structure controls to `TableWidget`.
- Track the active table cell via row/column indexes.
- Apply row/column mutations by serializing the markdown table source.
- Extend markdown preview smoke coverage for add/delete row and add/delete
  column flows.

## Verification

Independently verified on 2026-07-22. At both real viewports, the smoke adds and
deletes a row, adds and deletes a column, waits for the Markdown file after each
mutation, and finally proves the original header, first row, and rendered table
shape are restored. The artifact contract rejects missing controls or recovery.

- Artifact contract suite: 76/76 passed
- Markdown preview UI suite: passed with zero console errors
- Evidence: `artifacts/ui-smoke/markdown-preview-ui-2026-07-22T19-38-56-081Z/`
