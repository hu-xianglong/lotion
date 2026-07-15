# Align Callout Preview With Page Content

Status: done

## Why

Collapsed `lotion-callout` previews still had an internal horizontal margin, so
the rendered callout started to the right of surrounding headings and body
content. That makes imported Notion pages look misaligned.

## Scope

- Remove the extra callout preview horizontal margin.
- Add a UI smoke assertion that callout preview left edge aligns with a normal
  markdown text line, so the widget cannot drift one gutter inward again.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Removed the extra horizontal margin from the collapsed callout preview.
- Added a markdown preview smoke assertion that compares the callout left edge
  against a normal markdown line; the fixed path reports
  `calloutLineLeftDelta: 0`.
