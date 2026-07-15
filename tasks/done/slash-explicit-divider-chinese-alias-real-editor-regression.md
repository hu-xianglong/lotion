# Slash Explicit Divider Chinese Alias Real Editor Regression

Status: done

## Goal

Make `/分割线` work as the explicit Chinese alias for the Divider slash command,
matching the command hint shown in the menu.

## Acceptance

- The slash command filter resolves `分割线` to `divider`.
- Typing `/分割线` in the real editor inserts a rendered divider.
- The continuation cursor remains usable after the divider insertion.
- The flow keeps focus stable and has no horizontal overflow across desktop
  and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
