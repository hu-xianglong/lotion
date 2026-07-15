# Backlink Property Excerpt Labels

Status: done

## Why

Property backlinks currently expose raw serialized `entity_ref` JSON in the
preview excerpt. Users should see the referenced page or row title instead.

## Scope

- Format entity-ref property backlink excerpts from title snapshots/path
  snapshots instead of raw JSON.
- Extend focused API/UI smoke assertions so raw entity ids do not leak in the
  property backlink preview.

## Gates

- `node --test test/customer-api.test.mjs`
- `npm run smoke:page-backlinks-ui`
- `npm run typecheck`
- `git diff --check`
