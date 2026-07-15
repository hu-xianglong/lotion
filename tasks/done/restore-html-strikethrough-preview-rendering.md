# Restore HTML strikethrough preview rendering

## Goal

Rendered Markdown preview should show both GFM `~~text~~` and imported HTML
`<s>text</s>` / `<del>text</del>` as real strikethrough text instead of leaking
raw source tags.

## Acceptance

- Safe inline strikethrough tags are restored in widget Markdown output.
- Markdown preview UI smoke covers `~~text~~`, `<s>text</s>`, and `<del>text</del>`.
- No backend behavior changes are expected.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- HTML `<s>` and `<del>` inline tags now render through the same
  `cm-md-strike` decoration path as GFM strikethrough.
- Safe inline HTML restoration now allows `<s>` / `<del>` in rendered widget
  Markdown alongside the existing mark/underline tags.
- Markdown preview UI smoke covers GFM `~~text~~`, `<s>text</s>`, and
  `<del>text</del>` and verifies raw HTML tags do not leak into preview text.
- Backend tests are not applicable because the change is limited to renderer
  preview decoration and the existing smoke exercises the user-visible path.
