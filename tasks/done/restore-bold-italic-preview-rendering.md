# Restore bold and italic preview rendering

## Goal

Rendered Markdown preview should hide emphasis markers and render `**text**` /
`*text*` with bold and italic styling on inactive lines.

## Acceptance

- `**等待**` renders as bold text without leaking `**` markers.
- `*等待*` renders as italic text without leaking `*` markers.
- Existing strikethrough, URL, and widget preview behavior remains intact.
- Markdown preview UI smoke covers the bold and italic cases.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Markdown preview UI smoke now covers `**粗体等待**` and `*斜体等待*`.
- The smoke verifies emphasis markers are hidden in inactive preview and the
  rendered spans expose `.cm-md-strong` / `.cm-md-emphasis`.
- The existing renderer already handled standalone bold and italic correctly;
  the missing part was coded regression coverage.
- Backend tests are not applicable because this is renderer-only preview
  behavior.
