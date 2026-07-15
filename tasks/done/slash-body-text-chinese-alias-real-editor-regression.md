# Slash Body-Text Chinese Alias Real Editor Regression

Status: done

## Goal

Make sure `/正文` works as a real-editor Chinese alias for the Text slash
command, not just as metadata in the command list.

## Acceptance

- The slash command filter resolves `正文` to `text`.
- Typing `/正文` in the real editor selects Text, removes the command query,
  preserves editor focus, and continues as a plain paragraph.
- The resulting markdown persists as a plain paragraph line, not a heading,
  list, quote, table, or other block syntax.
- The multi-resolution editor smoke covers desktop and compact viewports with
  no horizontal overflow.

## Result

- Added slash-command unit coverage for resolving `正文` to `text`.
- Extended the multi-resolution real editor regression smoke to type `/正文`,
  commit Text, and verify the resulting content persists as a plain paragraph
  line in both desktop and compact viewports.
- No backend/service tests were needed because this only exercises existing
  slash metadata and renderer editor behavior.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T08-22-20-980Z`
  - Desktop and compact results include `slashChineseBodyText.plainLine: true`.
- [x] `git diff --check`
