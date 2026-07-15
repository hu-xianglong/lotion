# Plugin Page Delete Workspace API

Status: done

## Why

`WorkspaceAPI.deletePage` is part of the public plugin contract but previously
threw in the renderer. Page deletion already had a system pages database
primitive, so this could be wired without introducing a broader database
deletion model.

## What Changed

- Added `PageService.delete`.
- Exposed page deletion through the customer API, Electron IPC, preload API,
  and renderer plugin host.
- Removed deleted pages from the manifest/sidebar order and cleared the active
  page when needed.
- Added focused customer API coverage.

## Gates

- `npm run test:customer-api`
- `npm run typecheck`
- `git diff --check`
