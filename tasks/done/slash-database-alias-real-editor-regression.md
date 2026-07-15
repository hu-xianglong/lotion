# Slash database alias real editor regression

Status: done

## Problem

Dynamic database view slash commands support the English `database` alias, but
the real editor regression suite only covered the default database query, `/db`,
and Chinese aliases. A future slash ranking or command wiring change could
break the explicit `/database` path without being caught.

## Scope

- Added focused slash command unit coverage showing `database` resolves to
  dynamic database view commands.
- Extended the multi-resolution real editor smoke to insert an embedded
  database view through `/database`.
- Verified the generated `lotion-view` markdown persists, renders the database
  view, keeps editor focus, and has no desktop/compact overflow.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T08-57-03-235Z`
  - Desktop and compact results include `slashDatabaseAliasView.rendered: true`.
- [x] `git diff --check`
