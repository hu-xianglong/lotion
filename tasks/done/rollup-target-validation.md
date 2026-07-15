# Rollup Target Validation

Status: done

## Why

Rollup settings now expose relation and target field pickers. The fixture
validator should enforce the same schema contract so invalid saved rollup
references do not quietly pass regression gates.

## Scope

- Load all demo database schemas before field validation.
- Treat `entity_ref` as a known field type in demo validation.
- When a rollup relation points to a known target database, assert that the
  configured target field exists on that target schema.

## Non-goals

- Do not rewrite demo fixture data.
- Do not change rollup runtime computation.
- Do not add target field validation for arbitrary workspaces yet.

## Acceptance

- `npm run test:fixtures` catches rollups pointing to missing target fields.
- Existing demo fixtures still validate.
- `npm run typecheck` passes.
- `npm run test:latency` passes.

## Changes

- Preloaded demo database schemas into a database-id index.
- Added `entity_ref` to the accepted demo field types.
- Validated rollup target fields against the relation target database schema
  when that target database is known.

## Verification

- `npm run test:fixtures`
- `npm run typecheck`
- `npm run test:latency`
- `git diff --check`
