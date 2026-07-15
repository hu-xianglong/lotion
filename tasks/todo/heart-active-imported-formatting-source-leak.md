# ❤ Active Imported Formatting Source Leak

Status: reverted

## Context

On imported pages such as `8. Example imported chapter`, a blockquote line can
contain safe imported inline formatting:

```md
> <span data-lotion-bg="yellow">**From now on, make it a personal commitment...**</span>
```

When the line is active or selected, Lotion was revealing the source markers:
`>`, `<span data-lotion-bg="yellow">`, `</span>`, and `**`.

## Expected Behavior

- Imported safe inline formatting should render like normal text in every block,
  including blockquotes/callouts/toggles.
- The active or selected line must not reveal safe imported HTML source.
- The visual selection must remain visible and not be obscured by the highlight
  background.

## Fix Notes

- Reverted. This hid active-line source and made the full block harder to edit.
- Superseded by `tasks/todo/heart-selected-highlight-source-editing.md`, which
  keeps source editing available and fixes the selection highlight layering
  instead.
