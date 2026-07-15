# ❤ Selection Block Background Overlay

Status: fixed

## Context

The earlier selection fix only handled inline highlight/background spans. The
actual visible bug in `8. Example imported chapter` was different: CodeMirror
was drawing the purple selection range, but the opaque block-level line
background for blockquotes sat above it, so the selection only showed around
the edges of the block.

Example source:

```md
> <span data-lotion-bg="yellow">**From now on...**</span>
```

## Expected Behavior

- Selecting text inside a blockquote keeps the blockquote source editable.
- The blockquote marker, safe HTML span, and markdown emphasis markers are
  still visible on the active line.
- The selected block line gets a selection-specific class, and opaque block
  backgrounds become translucent so the native selection remains visible.
- Inline highlight/background spans still become transparent while a selection
  is active.

## Fix Notes

- Add a selected-line decoration field that marks only lines touched by a
  non-empty editor selection.
- Make selected blockquote/code/code-fence line backgrounds translucent instead
  of opaque.
- Extend the markdown preview screenshot smoke to assert both inline highlight
  transparency and block-level background translucency.
