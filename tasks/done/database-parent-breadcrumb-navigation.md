# Database parent breadcrumb navigation

## Problem

The standalone database header rendered its imported path as plain text. For
the real `数据库 / 数据库汇总` path, the `数据库` page existed in the workspace but
users could not navigate to it from the database header.

## Resolution

- Render resolved database ancestor pages and databases as accessible
  breadcrumb buttons.
- Resolve ancestors by their complete imported path so duplicate titles do not
  navigate to the wrong entity.
- Keep unresolved ancestors and the current database segment as non-interactive
  text while preserving the existing subtitle and statistics.
- Added renderer and focused Electron regressions that click a database parent
  breadcrumb and verify the parent page opens.

## Verification

Verification status: verified

- `npm run test:renderer-components --workspaces=false`
- `npm run smoke:database-breadcrumb-ui --workspaces=false`
- `npm run typecheck --workspaces=false`
- `npm run test:fixtures --workspaces=false`
- `npm run test:latency --workspaces=false`
- `npm run build --workspaces=false`
- `npm run package:mac --workspaces=false`
- `npm run package:mac:verify --workspaces=false`
- The installed `/Applications/Lotion.app` opened real database
  `db_d005875a` as `数据库 / 数据库汇总 · 6 fields · 52 rows`; clicking `数据库`
  opened the `数据库` page and updated the active tab.
- `npm run test:fast --workspaces=false` (outside the restricted sandbox): all
  80 main tests and the converter/import/repair/formula/editor, renderer, link,
  hierarchy, workspace, fixture, and latency gates passed. The earlier 77/80
  sandbox run was confirmed to be limited by native macOS file watchers
  reporting `EMFILE: too many open files, watch`.
