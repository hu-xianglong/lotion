# Slash Text Hint Chinese Alias Real Editor Regression

Status: done

## Goal

Make `/普通文本` work as an explicit Chinese alias for Text, matching the
command hint shown in the slash menu.

## Acceptance

- The slash command filter resolves `普通文本` to `text`.
- Typing `/普通文本` in the real editor selects Text, removes the command query,
  preserves editor focus, and continues as a plain paragraph.
- The flow has no horizontal overflow across desktop and compact viewports.

## Result

- Added `普通文本` as an explicit Text slash-command alias.
- Added slash-command unit coverage for resolving `普通文本` to `text`.
- Extended the multi-resolution real editor regression smoke to type
  `/普通文本`, commit Text, and verify the resulting content persists as a plain
  paragraph.
- No backend/service tests were needed because this only changes shared slash
  command metadata and existing renderer editor behavior.

## Verification

- [x] `npm exec -- tsc -p tsconfig.main.json`
- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
