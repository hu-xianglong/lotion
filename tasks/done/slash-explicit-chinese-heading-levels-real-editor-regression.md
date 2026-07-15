# Slash Explicit Chinese Heading Levels Real Editor Regression

Status: done

## Goal

Ensure `/二级标题` and `/三级标题` select Heading 2 and Heading 3 in the real
editor, complementing the generic `/标题` Heading 1 coverage.

## Acceptance

- The slash command filter resolves `二级标题` to `h2`.
- The slash command filter resolves `三级标题` to `h3`.
- The editor smoke inserts Heading 2 with `/二级标题` and persists `## heading`.
- The editor smoke inserts Heading 3 with `/三级标题` and persists `### heading`.
- Both flows keep focus stable and have no horizontal overflow across desktop
  and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
