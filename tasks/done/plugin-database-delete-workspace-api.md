# Plugin Database Delete Workspace API

Status: done

## Why

`WorkspaceAPI.deleteDatabase` is part of the public plugin contract but still
threw in the renderer. User database deletion can be scoped to manifest cleanup
plus removing the database directory.

## Scope

- Added user-database deletion to `DatabaseService`.
- Removed deleted database ids from the manifest.
- Removed row/page records owned by the deleted database from the system pages
  database.
- Exposed database deletion through customer API, IPC, preload API, and renderer
  plugin host.
- Added focused customer API coverage.

## Gates

- `npm run test:customer-api`
- `npm run typecheck`
- `git diff --check`
