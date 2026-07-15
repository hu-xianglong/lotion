# Slash page alias real editor regression

Status: done

## Problem

Dynamic page link slash commands support the English `page` alias, but the real
editor regression suite only covered selecting a page by title and Chinese
aliases. The explicit `/page` workflow should stay stable because linking pages
is a core Notion-like editing path.

## Scope

- Added focused slash command unit coverage showing `page` resolves to dynamic
  page link commands.
- Extended the multi-resolution real editor smoke to insert an internal page
  link through `/page`.
- Verified the markdown link persists, clicking navigates inside Lotion, and
  the flow stays stable on desktop and compact widths.
- Tightened the page-link smoke assertion to check raw slash command lines
  instead of global substring matches, because internal targets legitimately
  contain `/pages/...`.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T09-19-46-798Z`
  - Desktop and compact results include `slashPageAliasLink.navigated: true`.
- [x] `git diff --check`
