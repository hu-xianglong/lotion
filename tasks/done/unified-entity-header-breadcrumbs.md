# Unified entity header breadcrumbs

## Problem

Full pages used three independently assembled breadcrumb surfaces: ordinary
pages rendered a path inside `PageEditor`, standalone databases rendered a path
in their subtitle, and row pages rendered a separate breadcrumb wrapper in
`App`. The duplicated implementations had different spacing, colors, link
behavior, and parent-resolution rules, which caused valid database parents to
appear as plain text and made page rendering depend on entity type.

## Resolution

- Added one shared entity breadcrumb model, complete-path resolver, renderer,
  accessibility contract, and visual style.
- Ordinary pages, standalone databases, full row pages, and row-page previews
  now render the shared component between their icon affordance and title.
- Stable immediate-parent IDs take priority; other ancestors resolve by their
  complete path so duplicate titles cannot navigate to the wrong entity.
- Current and unresolved segments remain readable and non-interactive.
- Long path segments truncate as a unit instead of breaking Chinese labels one
  character per line.
- Embedded databases remain intentionally compact because they are blocks, not
  full-page surfaces.

## Verification

Verification status: verified

- `npm run test:renderer-components --workspaces=false`
- `npm run smoke:database-breadcrumb-ui --workspaces=false`
  - database page: `数据库 / 数据库汇总`
  - row page: `数据库 / 数据库汇总 / Import inventory`
  - both parent navigation directions passed
  - deterministic database-header and row-header screenshots inspected
- `npm run smoke:page-path-slash-ui --workspaces=false`
  - desktop and compact page parent navigation passed without overflow
- `npm run smoke:database-row-menu-ui --workspaces=false`
  - desktop and compact row creation, rename, duplicate, calendar, board,
    gallery, list, and deletion scenarios passed
  - the calendar lookup now derives its month offset from the fixture date,
    so the regression remains deterministic as the wall clock advances
- `npm run typecheck --workspaces=false`
- `npm run test:fixtures --workspaces=false`
- `npm run test:latency --workspaces=false`
- `npm run build --workspaces=false`
- `npm run test:fast --workspaces=false`: all 80 core tests plus import,
  formula, editor, renderer, link, hierarchy, workspace, fixture, and latency
  gates passed.
- `npm run package:mac --workspaces=false`
- `npm run package:mac:verify --workspaces=false`
- Replaced `/Applications/Lotion.app` and verified the packaged renderer from
  `app.asar` against the complete demo workspace using an isolated profile.
  The installed row page rendered `Tasks / Design sample workspace`; clicking
  `Tasks` opened the database. The normal installed app was then relaunched as
  a single `/Applications/Lotion.app` process for the user's real workspace.
- The installed build was also verified against the user's real
  `Lotion-reimport-2026-08-05` workspace: the standalone database rendered
  `数据库 / 数据库汇总` with `6 fields · 52 rows`, and opening `人生目标`
  rendered `数据库 / 数据库汇总 / 人生目标` with both ancestors interactive
  and the current entity non-interactive. The previous installed app remains
  recoverable at `/private/tmp/Lotion-pre-task-722.app`.
- The Electron harness now waits for `runtime.ready()` before issuing workspace
  IPC calls, eliminating an observed startup race where preload existed before
  the main-process handlers were registered.
