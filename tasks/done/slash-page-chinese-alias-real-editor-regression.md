# Slash Page Chinese Alias Real Editor Regression

Status: done

## Goal

Ensure the Chinese slash command `/页面` works in the real CodeMirror editor for
dynamic page-link insertion, not only in command filtering/unit coverage.

## Acceptance

- Dynamic page slash commands can be found with the Chinese query `页面`.
- The editor smoke inserts a linked page with `/页面` at desktop and compact
  viewports.
- The inserted link is persisted as the expected internal markdown link.
- The rendered link remains visible, keyboard/focus-safe, and navigates to the
  target page without horizontal overflow.
- The page-link smoke explicitly focuses CodeMirror instead of accidentally
  typing into embedded database cells after navigation.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
