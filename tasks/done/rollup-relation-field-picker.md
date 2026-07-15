# Rollup Relation Field Picker

Status: done

## Why

Rollup settings currently ask users to type the source relation field id. The
current database schema is already available in table rendering, so the dialog
can offer a Notion-like select for relation fields without loading another
database.

## Scope

- Pass the current database fields into field settings.
- Show a relation-field select for rollup fields when relation fields exist.
- Preserve the raw-id fallback when no relation fields are available or the
  saved field id is unknown.

## Non-goals

- Do not load the target database schema.
- Do not add a target-field picker yet.
- Do not change rollup computation.

## Acceptance

- Rollup settings can choose an `entity_ref` field by name.
- Existing unknown relation field ids remain visible and saveable.
- Dialog behavior remains usable for isolated/embedded tables.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Passed the owning database fields into field settings.
- Rendered a rollup relation-field select from visible `entity_ref` fields.
- Preserved unknown saved ids in the select and kept the raw input fallback
  when no relation fields exist.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
