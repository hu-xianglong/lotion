# Raw Markdown Toggle Stability Smoke

## Goal

Prevent regressions where toggling raw markdown mode crashes or blanks the page
editor.

## Scope

- Extend the markdown preview smoke.
- Force raw mode off before preview assertions.
- Toggle raw mode on and back off through the sidebar UI.
- Verify the page title and CodeMirror lines remain present after each toggle.

## Gates

- [x] `npm run smoke:markdown-preview-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
