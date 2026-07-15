# Database View Management And Row-Page Polish

Status: done

## Why

Databases are Lotion's highest-risk surface: view JSON, row-page routing,
embedded views, field display, and CSV persistence all meet there. Recent work
improved performance and page identity, but view management needs a focused
stability pass so regressions are caught before relation/rollup work.

## Scope

- Inspect current database view management and row-page presentation.
- Add or tighten validation around view JSON references and row-page metadata.
- Make one small UI or data-contract polish if a low-risk issue is found.
- Keep database cell architecture and row virtualization changes out of scope.

## Non-goals

- Do not implement relation/rollup.
- Do not rewrite database table rendering.
- Do not change CSV storage format.

## Acceptance

- View JSON references valid fields and persisted views remain loadable.
- Row-page metadata remains aligned with its owning database row.
- Database-focused validation/test passes.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Sanitized saved database views against the owning schema:
  - stale visible/order/wrap field ids are removed;
  - empty visible fields fall back to a title/first visible field;
  - stale sorts, filters, column widths, summaries, date field, cover field,
    and default template ids are dropped;
  - column widths must be positive finite numbers;
  - column summary values must be known summary types.
- Tightened demo-space validation so user and system database views are checked
  with the same field-reference rules.
- Added a package-core regression test covering stale view references and bad
  view values.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm exec tsc -- -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
