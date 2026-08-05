# ❤ Active Imported Formatting Source Leak

Status: done

Verification status: verified

Resolution: reverted and superseded

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
- Superseded by `tasks/done/heart-selected-highlight-source-editing.md`, which
  keeps source editing available and fixes the selection highlight layering
  instead.

## Verification

Verified on 2026-07-22 as intentionally reverted and superseded by
`tasks/done/heart-selected-highlight-source-editing.md`. The replacement keeps
the safe HTML and Markdown source visible on active lines while making the
selection readable. Its desktop/compact Electron workflow and four-phase
artifact contract passed with zero console errors; this rejected approach is
not present in the final behavior.

Evidence:
`artifacts/ui-smoke/markdown-preview-ui-2026-07-22T19-38-56-081Z/`.
