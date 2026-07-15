# Notion audit missing entity ref target

Status: done

## Why

Imported relation/page-link cells are stored as `entity_ref` values. The audit
already has logic to verify those targets exist, but the regression suite should
prove a missing target is caught.

## Scope

- Corrupt one imported relation cell so its `entityId` points at a missing
  entity.
- Assert the Notion import audit reports `missing_entity_ref_target`.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
