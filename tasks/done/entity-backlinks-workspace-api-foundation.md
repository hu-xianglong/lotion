# Entity Backlinks Workspace API Foundation

Status: done

## Why

Backlinks are a high-value Notion parity feature, but the smallest useful slice
is a stable API that can answer which pages or row pages reference an entity.
That keeps future UI work small and gives plugins/LLM workflows a way to inspect
workspace graph context.

## Scope

- Added a shared `EntityBacklink` result type.
- Added `entities.backlinks(entityId)` to the customer, preload, and renderer
  plugin workspace APIs.
- Detect incoming markdown links to page/row body files.
- Detect incoming structured `entity_ref` cells in databases.
- Covered both cases with the focused customer API test.

## Gates

- `npm run test:customer-api`
- `npm run typecheck`
- `git diff --check`
