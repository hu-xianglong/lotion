# Slash URL Link Hint Disambiguation Regression

Status: done

## Goal

Disambiguate the plain URL Link slash command from dynamic internal page links:
the visible URL command hint should match the working `/网址` query, while
`/链接` remains reserved for internal page links.

## Acceptance

- The base Link slash command shows `网址` as its visible hint.
- The slash command filter resolves `网址` to the base `link` command.
- Dynamic page slash commands still resolve `链接` to the target page command.
- The real editor smoke still verifies `/网址` inserts an external URL link and
  `/链接` inserts a navigable internal page reference across desktop and compact
  viewports.

## Result

- Changed the base Link slash command visible hint from `链接` to `网址`.
- Added slash-command unit coverage for the visible hint and `网址` lookup.
- Preserved existing dynamic page-link coverage for `链接`.
- Verified the multi-resolution real editor smoke still inserts an external URL
  link with `/网址` and an internal page link with `/链接`.
- No backend/service tests were needed because this only changes shared slash
  command metadata and existing renderer editor behavior.

## Verification

- [x] `npm exec -- tsc -p tsconfig.main.json`
- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
  - Note: an initial parallel run raced ahead of `tsc` and read stale
    `dist-electron`; rerunning after compilation passed.
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
