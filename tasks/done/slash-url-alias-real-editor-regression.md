# Slash URL Alias Real Editor Regression

Status: done

## Goal

Make sure `/url` works as a real-editor alias for the Link slash command. This
keeps the common URL wording covered alongside `/link` and `/网址`.

## Acceptance

- The slash command filter resolves `url` to `link`.
- Typing `/url` in the real editor selects Link and removes the slash query.
- The inserted markdown persists as `[label](https://)` and renders as an
  openable link without breaking editor focus.
- The multi-resolution editor smoke covers desktop and compact viewports with
  no horizontal overflow.

## Result

- Added slash-command unit coverage for resolving `url` to `link`.
- Extended the multi-resolution real editor regression smoke to type `/url`,
  commit Link, verify markdown persistence, click the rendered link through the
  shell-open dry-run capture, and return focus to the editor.
- No backend/service tests were needed because this only exercises existing
  slash metadata and renderer editor behavior.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T08-34-21-252Z`
  - Desktop and compact results include `slashUrlLink.opened: ["https://"]`.
- [x] `git diff --check`
