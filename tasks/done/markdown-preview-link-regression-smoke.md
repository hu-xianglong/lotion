# Markdown Preview Link Regression Smoke

## Goal

Add an end-to-end UI smoke for CodeMirror Markdown live preview regressions:

- Plain bracket text such as `[WIP]` must remain plain text, not a link.
- GFM strikethrough must render with the preview strike styling.
- Markdown links whose labels contain URL-encoded text must display a decoded,
  non-duplicated label while still opening the encoded destination.

## Gates

- `npm run smoke:markdown-preview-ui`
- `npm run smoke:ui`
- `git diff --check`

## Result

- Added `scripts/smoke-markdown-preview-ui.mjs`.
- Added the focused `npm run smoke:markdown-preview-ui` command.
- Included the focused smoke in `npm run smoke:ui`.
- Stabilized source/attachment smoke by resetting the CodeMirror viewport
  before asserting virtualized editor content.
