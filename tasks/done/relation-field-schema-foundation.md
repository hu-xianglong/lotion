# Relation Field Schema Foundation

Status: done

## Why

Lotion already imports Notion relation properties as `entity_ref`, and search can
expand relation cells, but the field schema does not describe relation intent:
which database is targeted, whether the relation is single/multi-value, or how a
future rollup should resolve it. That makes relation/rollup work hard to build
incrementally.

## Scope

- Add explicit relation metadata to `FieldSchema`.
- Let add/update field inputs persist relation metadata for `entity_ref` fields.
- Sanitize relation metadata when field types change away from `entity_ref`.
- Validate relation metadata in demo fixtures.
- Add package-core coverage for relation metadata persistence.

## Non-goals

- Do not implement rollup computation yet.
- Do not redesign relation cell editing.
- Do not add a relation target picker UI yet.

## Acceptance

- `entity_ref` fields can store normalized relation config.
- Non-relation fields do not retain relation config.
- Demo fixture validation catches invalid relation target database ids.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added `RelationFieldConfig` to the shared field schema.
- Added relation metadata to add/update field inputs.
- Normalized relation metadata in database create/add-field/update-field paths:
  - trims target database ids;
  - defaults relation multiplicity to multi;
  - clears relation metadata when a field changes away from `entity_ref`.
- Extended demo-space validation so relation target database ids must exist.
- Added package-core coverage for relation metadata persistence and cleanup.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm exec tsc -- -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `git diff --check`
