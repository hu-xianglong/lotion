# ❤ Selection Block Background Overlay

Status: done

Verification status: verified

## Context

The earlier selection fix only handled inline highlight/background spans. The
actual visible bug in `8. Push all your own buttons` was different: CodeMirror
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

## Verification

Independently verified on 2026-07-22. The dual-viewport smoke requires the
selected line decoration and measures the selected blockquote background alpha
at 0.48 while the inline highlight is transparent. Manual inspection confirmed
the native selection remains visible in both generated screenshots.

- Artifact contract suite: 76/76 passed
- Markdown preview UI suite: passed at desktop and compact viewports
- Evidence: `artifacts/ui-smoke/markdown-preview-ui-2026-07-22T19-38-56-081Z/snapshots/markdown-preview-selected-imported-highlight-desktop.png`
  and the matching compact snapshot
