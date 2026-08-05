# Exact database title search ranking

## Problem

Searching for the exact imported database name `数据库汇总` did not make the
database itself visible as the leading result. The system `database_stats`
database contained a row with the same title and search projected that internal
row as a page. Database metadata hits also used the lower-priority `database`
match route even when the database name directly matched the query, so
descendant path matches could obscure the intended result.

## Resolution

- Projected matching `database_stats` rows back to their referenced database
  identity instead of exposing internal system rows as pages.
- Classified direct database-name matches as both `title` and `database`, using
  title relevance for ranking while retaining the database result filter.
- Added a focused search fixture with a same-name internal statistics row and
  asserted the database is first, correctly classified, and not duplicated as a
  page.

This is a backend result-contract fix. The existing search panel renders the
returned order directly, so no renderer behavior changed.

## Verification

Verification status: verified

- Focused package-core search regression passed.
- `npm run typecheck --workspaces=false`
- `npm run test:fixtures --workspaces=false`
- `npm run test:latency --workspaces=false`
- `npm run build --workspaces=false`
- `npm run test:fast --workspaces=false`: all 80 main tests and all converter,
  importer, renderer, link, hierarchy, workspace, fixture, and latency gates
  passed.
- A read-only query against `/Users/xianglonghu/Downloads/同步空间/Lotion` returned
  database `db_d005875a` (`数据库汇总`) as the first result and returned no
  same-name page projection.
- Packaged ZIP and DMG verification passed. The verified app was installed at
  `/Applications/Lotion.app` after moving the previous version to
  `/private/tmp/Lotion-before-task720-20260805.app`.
- In the installed UI, searching `数据库汇总` showed `Database · Title ·
  数据库汇总` as the first result with path `数据库 / 数据库汇总`.
