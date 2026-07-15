# Slash Explicit Callout Chinese Alias Real Editor Regression

Status: done

## Goal

Make `/强调块` work as the explicit Chinese alias for the Callout slash command,
matching the command hint shown in the menu.

## Acceptance

- The slash command filter resolves `强调块` to `callout`.
- Typing `/强调块` in the real editor inserts a rendered Lotion callout block.
- The continuation cursor remains usable after the callout block.
- The flow keeps focus stable and has no horizontal overflow across desktop
  and compact viewports.

## Result

- Added `强调块` as an explicit Callout alias in the shared slash command
  registry.
- Added slash-command unit coverage for filtering `强调块`.
- Extended the multi-resolution real editor regression smoke to type `/强调块`,
  commit the Callout command, verify the rendered callout body, and continue
  typing after the block.
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
