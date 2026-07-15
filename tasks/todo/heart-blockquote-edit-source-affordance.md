# ❤ Blockquote Edit Source Affordance

Status: fixed

## Context

Imported Notion blockquotes can contain safe inline HTML and markdown source
that is hidden while the line is rendered in Notion-like preview mode:

```md
> <span data-lotion-bg="yellow">**From now on...**</span>
```

Clicking the line makes the active line editable, but there was no explicit
`Edit source` affordance like the ones used by callouts, embeds, equations, and
missing imported views. That made it hard to discover how to edit the whole raw
blockquote source.

## Expected Behavior

- Inactive blockquote blocks expose an `Edit source` button on hover.
- Clicking the button focuses the editor and selects the full blockquote source
  range, so all lines in the block are active/editable.
- The button does not replace the block content and does not change line layout.
- Existing selection visibility behavior still works for highlighted source.

## Fix Notes

- Add a lightweight blockquote source-edit widget anchored at the first line of
  each inactive blockquote.
- Reuse the existing `Edit source` button styling and dispatch path.
- Extend markdown preview smoke coverage to click the blockquote `Edit source`
  affordance before asserting source visibility and selection behavior.

## Follow-up Fix

The first implementation only attached the affordance to the first line of a
blockquote and hid it while the cursor was inside the block. Real imported pages
such as `8. Example imported chapter` contain multi-line blockquotes, so
hovering the highlighted middle line did not reveal anything.

- Attach the same source-edit affordance to every visual line in a blockquote.
- Keep the affordance available even when the cursor is already inside the
  block, because selecting the whole block source is still useful.
- Use a multi-line blockquote in screenshot smoke coverage so a first-line-only
  implementation fails.
