# Markdown Link Label Escape Preview

## Goal

Render markdown-escaped punctuation in inactive live-preview link labels as the
user-facing characters, while keeping the raw markdown source editable when the
cursor is on the line.

## Scope

- Decode markdown escapes such as `\[` and `\]` in link labels for live preview.
- Keep URL-like label percent-decoding behavior and destination href unchanged.
- Add markdown preview smoke coverage for escaped bracket labels.
- Refresh the Notion import compatibility note that tracked this display gap.

## Gates

- [x] `npm run typecheck`
- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
