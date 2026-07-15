# Slash Bulleted-List Explicit Chinese Alias Real Editor Regression

Status: done

## Goal

Ensure Chinese users have an explicit slash command for bulleted lists, so
`/无序列表` selects Bulleted list without relying on the ambiguous `列表` alias.

## Acceptance

- The slash command filter resolves `无序列表` to `bullet`.
- The editor smoke inserts a bulleted list with `/无序列表`.
- The list item persists as `- item` markdown, supports continued typing, and
  keeps focus stable.
- The flow has no horizontal overflow across the shared desktop and compact
  viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
