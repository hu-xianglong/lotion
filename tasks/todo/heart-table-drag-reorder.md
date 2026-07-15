# ❤ Table Drag Reorder

Status: fixed

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
