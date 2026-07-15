# Image Preview Edit-Source Hover Affordance

## Problem

Rendered image previews should not show the raw Markdown source by default, but
users still need a clear way to edit that source.

## Result

- Standalone image Markdown now stays collapsed into the rendered preview while
  raw/embed source mode is off, even when the cursor is on that image line.
- Superseded by the later Notion-like source-hiding pass: image previews no
  longer expose an `Edit source` affordance on hover. Hovering or clicking a
  rendered image keeps the raw Markdown source hidden.
- Backend/parser/service tests are not applicable: this change only touches the
  renderer's CodeMirror decoration behavior and its UI smoke coverage.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`
