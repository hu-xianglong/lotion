# Debounce Global Search Input Rendering

## Goal

Typing in the global search bar should stay responsive even when the workspace
has many searchable pages, databases, rows, and plugin commands.

## Changes

- Split the controlled input value from the debounced query used for backend
  search, command filtering, result grouping, filter counts, and result list
  rendering.
- Kept existing search results mounted while a new query is pending instead of
  clearing and rebuilding the 100-row result list on every keypress.
- Added a focused `smoke:search-ui` input latency assertion that measures
  repeated search input events after a 100-result render.

## Verification

- [x] `npm run typecheck`
- [x] `npm run smoke:search-ui`
  - Input latency max: 24.2ms under the 80ms guard.
- [x] `git diff --check`
