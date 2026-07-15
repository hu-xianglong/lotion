# Slash view alias real editor regression

Status: done

## Problem

Dynamic database view slash commands support the English `view` alias, but the
real editor regression suite only covered the default database query, `/db`,
`/database`, and Chinese aliases. Since embedded database views are a core
Notion-like writing action, the explicit `/view` path should be covered too.

## Scope

- Added focused slash command unit coverage showing `view` resolves to dynamic
  database view commands.
- Extended the multi-resolution real editor smoke to insert an embedded
  database view through `/view`.
- Verified the generated `lotion-view` markdown persists, renders the database
  view, keeps editor focus, and has no desktop/compact overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T09-06-01-696Z`
  - Desktop and compact results include
    `slashViewAliasDatabaseView.rendered: true`.
- [x] `git diff --check`
