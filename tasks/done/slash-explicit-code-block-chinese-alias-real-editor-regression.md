# Slash Explicit Code Block Chinese Alias Real Editor Regression

Status: done

## Goal

Make `/代码块` work as the explicit Chinese alias for the Code block slash
command, matching the command hint shown in the menu.

## Acceptance

- The slash command filter resolves `代码块` to `code`.
- Typing `/代码块` in the real editor inserts an editable fenced code block.
- The continuation cursor remains usable after the code fence.
- The flow keeps focus stable and has no horizontal overflow across desktop
  and compact viewports.

## Result

- Added `代码块` as an explicit Code block alias in the shared slash command
  registry.
- Added slash-command unit coverage for filtering `代码块`.
- Extended the multi-resolution real editor regression smoke to type `/代码块`,
  commit the Code block command, type inside the fence, verify persisted
  Markdown, and continue typing after the fence.
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
