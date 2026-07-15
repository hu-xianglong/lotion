# Render imported single-tilde strikethrough

## Goal

Imported Notion Markdown sometimes uses single tilde spans such as
`~text(~~**nested**~~)~` for strikethrough. Rendered preview should show the
outer span as strikethrough instead of leaking the raw single tilde markers.

## Acceptance

- Inactive preview lines hide matched single `~` markers and strike through the
  text between them.
- Existing GFM `~~text~~`, HTML `<s>/<del>`, URLs, and active-line editing
  behavior remain intact.
- Markdown preview UI smoke covers a nested imported single-tilde example.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Rendered preview now supports imported single-tilde strikethrough spans such
  as `~从国内买茶叶，药品，书法用具(~~**等待**~~)~`.
- The compatibility path hides the outer single tilde markers and common nested
  `~~` / `**` markers, while preserving visible strikethrough styling.
- Markdown link ranges are excluded so URL text fragments such as `#:~:text=`
  are not falsely decorated.
- Markdown preview UI smoke covers the imported nested case and the URL
  false-positive guard.
- Backend tests are not applicable because this is renderer-only preview
  decoration behavior.
