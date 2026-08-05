# ❤ Table Drag Reorder

Status: done

Verification status: verified

## Context

Markdown tables had add/delete row and column controls, but users still needed to
edit raw source to change row or column order.

## Expected Behavior

- Rendered table rows expose drag handles.
- Rendered table columns expose drag handles.
- Dragging a row rewrites the markdown table row order.
- Dragging a column rewrites the header, separator, and every row.
- Existing cell editing, add/delete controls, and `Edit source` still work.

## Fix Notes

- Add pointer-based drag handles to table rows and columns.
- Resolve the drop target from the row or column under the pointer.
- Reorder the parsed markdown table and serialize it back to source.
- Extend markdown preview smoke coverage for row and column drag reorder flows.

## Verification

Independently verified on 2026-07-22. The pointer workflow drags the first row
after the second and restores it, then moves the first column to the end and
restores it. Each step is checked against persisted Markdown and rendered
header/row order; the final artifact contract requires the original order.

- Artifact contract suite: 76/76 passed
- Markdown preview UI suite: passed at 1440x1000 and 1040x820, zero console
  errors
- Evidence: `artifacts/ui-smoke/markdown-preview-ui-2026-07-22T19-38-56-081Z/`
