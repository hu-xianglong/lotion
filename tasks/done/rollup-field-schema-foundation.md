# Rollup Field Schema Foundation

Status: done

## Why

Notion rollups need a first-class schema contract before we can safely compute
them. Without that, imported rollup properties fall back to text and the UI has
no place to store relation/target/aggregation settings.

## Scope

- Add a `rollup` field type and rollup config shape.
- Persist rollup config through add/update field flows.
- Clear rollup config when a field changes away from `rollup`.
- Surface simple rollup settings in the field dialog.
- Treat rollup cells as read-only until computation is implemented.
- Validate rollup config in demo fixtures.

## Non-goals

- Do not compute rollup values yet.
- Do not add a relation/target field picker yet.
- Do not re-import Notion rollup fields in this task.

## Acceptance

- Rollup fields can store relation field id, target field id, and aggregation.
- Non-rollup fields do not retain rollup config.
- Demo fixture validation catches invalid rollup field references.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added `rollup` to `FieldType`.
- Added `RollupFieldConfig` and aggregation types.
- Normalized rollup config in database create/add-field/update-field paths.
- Kept rollup fields read-only in update-cell and template flows.
- Added rollup settings to the field dialog.
- Registered a built-in read-only rollup field provider.
- Added demo-space validation for rollup configs.
- Added package-core coverage for rollup metadata persistence and cleanup.

## Verification

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run build`
- `npm run test:latency`
- `npm exec tsc -- -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `git diff --check`
