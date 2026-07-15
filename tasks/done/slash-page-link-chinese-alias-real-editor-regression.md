# Slash Page Link Chinese Alias Real Editor Regression

Status: done

## Goal

Ensure the Chinese slash query `/链接` inserts a dynamic internal page link in
the real editor and stays distinct from the plain URL link command.

## Acceptance

- Dynamic page slash commands can be found with the Chinese query `链接`.
- The editor smoke inserts a page reference with `/链接` at desktop and compact
  viewports.
- The inserted page reference persists as an internal markdown link and
  navigates to the target page.
- The flow keeps focus in CodeMirror and avoids horizontal overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
