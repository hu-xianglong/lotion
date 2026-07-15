# Slash Task-List Chinese Alias Real Editor Regression

Status: done

## Goal

Make `/任务列表` work as a natural Chinese alias for the To-do slash command,
matching the command hint and Notion-like user expectations.

## Acceptance

- The slash command filter resolves `任务列表` to `todo`.
- Typing `/任务列表` in the real editor selects To-do.
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
