# Plugin Field Delete Workspace API

Status: done

## Why

`WorkspaceAPI.deleteField` is part of the public plugin contract but previously
threw in the renderer. The database service already normalizes views against a
schema, so field deletion could be a small schema/data operation.

## What Changed

- Added `DatabaseService.deleteField` for non-system, non-title fields.
- Removed deleted field values from records and let view normalization drop
  stale field references.
- Exposed field deletion through customer API, IPC, preload API, and renderer
  plugin host.
- Added focused customer API coverage.

## Gates

- `npm run test:customer-api`
- `npm run typecheck`
- `git diff --check`
