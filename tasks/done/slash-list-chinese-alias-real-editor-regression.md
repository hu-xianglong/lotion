# Slash List Chinese Alias Real Editor Regression

Status: done

## Goal

Ensure `/列表` selects the expected bulleted list command in the real editor and
inserts an editable list item across desktop and compact viewports.

## Acceptance

- The slash command filter resolves the Chinese query `列表` to `bullet`.
- The editor smoke inserts a bulleted list with `/列表`.
- The list item persists as `- item` markdown, supports continued typing, and
  keeps focus stable.
- The flow has no horizontal overflow across the shared desktop and compact
  viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
