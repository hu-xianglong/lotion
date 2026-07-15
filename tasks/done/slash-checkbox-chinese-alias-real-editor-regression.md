# Slash Checkbox Chinese Alias Real Editor Regression

Status: done

## Goal

Make `/复选框` work as a natural Chinese alias for the To-do slash command,
matching the localized checkbox field type and Notion-like command discovery.

## Acceptance

- The slash command filter resolves `复选框` to `todo`.
- Typing `/复选框` in the real editor selects To-do.
- The inserted task item starts unchecked, can be checked, and persists both
  unchecked and checked markdown.
- The flow keeps focus stable and has no horizontal overflow across desktop
  and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
