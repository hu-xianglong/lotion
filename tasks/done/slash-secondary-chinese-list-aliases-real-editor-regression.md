# Slash Secondary Chinese List Aliases Real Editor Regression

Status: done

## Goal

Ensure the secondary Chinese slash list aliases `/项目列表` and `/编号列表`
work in the real editor, not only in the command metadata.

## Acceptance

- The slash command filter resolves `项目列表` to `bullet`.
- The slash command filter resolves `编号列表` to `numbered`.
- The editor smoke inserts a bulleted list with `/项目列表` and persists
  `- item`.
- The editor smoke inserts a numbered list with `/编号列表` and persists
  `1. item`.
- Both flows keep focus stable and have no horizontal overflow across desktop
  and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
