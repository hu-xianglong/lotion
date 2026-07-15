# Markdown Decoded URL Single Click Target

## Goal

Avoid duplicate clickable DOM targets when a Markdown link label is decoded for
display. The outer link mark should own the URL; the decoded label widget should
only render text.

## Scope

- Remove URL/click marker attributes from `DecodedLinkLabelWidget`.
- Keep decoded long-URL display behavior.
- Strengthen the markdown preview smoke to assert one click target for the long
  URL line.

## Gates

- [x] `npm run smoke:markdown-preview-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
