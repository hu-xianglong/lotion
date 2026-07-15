# ❤ Selected Highlight Source Editing Contract

Status: fixed

## Context

Imported Notion content can contain markdown blocks with safe inline HTML:

```md
> <span data-lotion-bg="yellow">**From now on...**</span>
```

The editor has two competing requirements:

- Active lines must expose the underlying source so the whole block remains
  editable.
- When text inside a highlighted range is selected, the highlight background
  must not cover the native selection.

The previous attempt solved this by hiding the source on active lines, which
made source editing worse.

## Expected Behavior

- Clicking the imported blockquote line exposes the editable source, including
  the blockquote marker, safe HTML span, and markdown emphasis markers.
- Selecting text inside the highlighted range keeps the source editable while
  making the yellow background transparent so the selection is visible.
- Inactive lines still render imported highlight/color markup normally.

## Fix Notes

- Revert active-line source hiding for safe imported HTML.
- Keep the editor selection-state class.
- Move the selection override after all Notion background color rules and make
  it explicit so it wins while selection is active.
- Add a screenshot smoke covering source visibility plus selected-highlight
  transparency.
