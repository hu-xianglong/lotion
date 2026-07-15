# Slash Heading Chinese Alias Real Editor Regression

Status: done

## Goal

Ensure `/标题` selects the expected Heading 1 command in the real editor and
inserts an editable first-level heading across desktop and compact viewports.

## Acceptance

- The slash command filter resolves the Chinese query `标题` to `h1`.
- The editor smoke inserts a Heading 1 with `/标题`.
- The heading persists as `# heading` markdown and remains editable/focused.
- The flow has no horizontal overflow across the shared desktop and compact
  viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
