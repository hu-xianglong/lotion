# Renderer plugin page move workspace API

Status: done

## Why

Renderer plugins receive a `WorkspaceAPI`, but `movePage` was still a TODO
stub. That made page-organization workflows and future LLM/plugin actions fail
even though Lotion already stores page parent/path metadata.

## Changes

- Added `path`, `parentId`, and `parentKind` to `UpdatePageInput`.
- Persisted those metadata updates through `PageService.update`.
- Implemented renderer `WorkspaceAPI.movePage` through the existing
  `window.lotion.pages.update` IPC surface.
- Clarified that the `order` argument is reserved until the page model has a
  sibling order field.
- Added customer API coverage for persisting and clearing page parent/path
  metadata.

## Gates

- `npm run typecheck`
- `node --test test/customer-api.test.mjs`
- `git diff --check`
