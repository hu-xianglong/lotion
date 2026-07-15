# Renderer Component Embedded View Renderer Regression

Status: done

## Why

Embedded database blocks are a frequent import and page-rendering regression
surface. Existing renderer component coverage checks the embedded database
header and table grid primitives, but not the `EmbeddedViewRenderer` entry point
that connects the database cache to the embedded table/loading states.

## Scope

- Add static renderer coverage for an embedded view with a cached database
  bundle so the table shell, header, toolbar, rows, and footer remain visible.
- Add static renderer coverage for the uncached/loading state so embedded views
  do not render source text or a blank region while loading.

## Verification

## Result

- Added static renderer coverage for `EmbeddedViewRenderer` with a cached
  database bundle.
- Asserted the embedded table wrapper, database header, toolbar actions, rows,
  footer row count, and absence of raw `lotion-view` source fences.
- Added loading-state coverage for uncached embedded databases so the component
  keeps a stable wrapper and visible status instead of a blank region.
- Completed the fixture schema shape needed by the full `DatabaseTable` path
  (`fieldOrder`, `filters`, and `sorts`).
- Backend/service tests were not applicable because this item only adds static
  renderer coverage and fixture shape for an existing UI path.

## Verification

- Passed: `node --check scripts/test-renderer-components.mjs`
- Passed: `npm run test:renderer-components`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
