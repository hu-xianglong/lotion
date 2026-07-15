# Database Default Created-Date Views

Status: done

## Why

User-facing databases should have useful Notion-like default view options for
created date ordering without forcing users to manually configure the same
sort views in every database.

## Scope

- Add generated table views for created date ascending and descending when a
  database has a `created_time` field.
- Apply to newly created databases and existing/imported databases when read.
- Preserve existing user-created views and the current default view.
- Avoid duplicating generated views on repeated reads/startup/import.
- Keep row/page navigation and view switching behavior intact.
- Cover desktop and compact/narrow layouts with no horizontal overflow.

## Gates

- `node --check scripts/smoke-database-created-views-ui.mjs`
- `npm run typecheck`
- `node --test test/package-core.test.mjs`
- `npm run smoke:database-created-views-ui`
- `git diff --check`

## Result

Implemented generated Created date asc/desc table views for databases that
carry `created_time` metadata, including hidden imported `created_time`
fields. New databases receive the generated views at creation, and existing
or imported databases get them idempotently when opened/read. Existing custom
views and the current default view remain preserved.

Added package-core coverage for generation, idempotency, custom default
preservation, and hidden `created_time` handling. Added a focused shared
UI-harness smoke that opens a fixture database across desktop and compact
viewports, verifies the generated tabs, keyboard focus/Enter activation,
asc/desc row ordering, idempotent generated view count, and no document
horizontal overflow.

Gates:

- `node --check scripts/smoke-database-created-views-ui.mjs` passed.
- `npm run typecheck` passed.
- `npm exec -- tsc -p tsconfig.main.json` passed before package-core tests
  because package-core imports `dist-electron`.
- `node --test test/package-core.test.mjs` passed.
- `npm run smoke:database-created-views-ui` passed.
- `git diff --check` passed.
