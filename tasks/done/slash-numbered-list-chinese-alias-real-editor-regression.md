# Slash Numbered-List Chinese Alias Real Editor Regression

Status: done

## Goal

Ensure Chinese users have an unambiguous slash command for numbered lists, so
`/有序列表` selects Numbered list instead of falling back to the shared `列表`
alias.

## Acceptance

- The slash command filter resolves `有序列表` to `numbered`.
- The editor smoke inserts a numbered list with `/有序列表`.
- The list item persists as `1. item` markdown, supports continued typing, and
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
