# Slash Heading Hint Chinese Aliases Real Editor Regression

Status: done

## Goal

Make `/大标题`, `/中标题`, and `/小标题` work as explicit Chinese aliases for
Heading 1, Heading 2, and Heading 3, matching the command hints shown in the
menu.

## Acceptance

- The slash command filter resolves `大标题` to `h1`.
- The slash command filter resolves `中标题` to `h2`.
- The slash command filter resolves `小标题` to `h3`.
- Typing each command in the real editor inserts the corresponding Markdown
  heading level.
- The flow keeps focus stable and has no horizontal overflow across desktop
  and compact viewports.

## Result

- Added the heading hint text as explicit aliases for Heading 1, Heading 2, and
  Heading 3.
- Added slash-command unit coverage for `大标题`, `中标题`, and `小标题`.
- Extended the multi-resolution real editor regression smoke to type all three
  commands and verify the expected Markdown heading level.
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
