# ❤ Table Edit Source Affordance

Status: fixed

## Context

Markdown tables are already recognized and rendered as editable table widgets,
but they did not expose the same `Edit source` affordance used by callouts,
embeds, equations, missing imported views, and blockquotes.

This makes imported tables harder to inspect or repair when the rendered table
is not enough.

## Expected Behavior

- Inactive markdown table widgets expose an `Edit source` button on hover.
- Clicking the button focuses the editor and selects the full markdown table
  source range.
- Existing direct table-cell editing continues to work and persist to markdown.

## Fix Notes

- Add the shared `Edit source` button to `TableWidget`.
- Select the full table source range when the button is clicked.
- Extend the markdown preview UI smoke to cover both cell editing and table
  source editing.
