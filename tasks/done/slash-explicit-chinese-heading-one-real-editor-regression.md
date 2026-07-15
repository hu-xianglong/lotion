# Slash Explicit Chinese Heading One Real Editor Regression

Status: done

## Goal

Ensure `/一级标题` works in the real editor as an explicit Heading 1 alias,
not only the shorter `/标题` generic alias.

## Acceptance

- The slash command filter resolves `一级标题` to `h1`.
- The editor smoke inserts Heading 1 with `/一级标题` and persists `# heading`.
- The flow keeps focus stable and has no horizontal overflow across desktop
  and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
