# Rollup Target Field Picker

Status: done

## Why

Rollup settings still require typing the target field id. Once a rollup selects
a relation field, the relation's target database id is usually known, so Lotion
can load that database schema and offer a field picker.

## Scope

- Let field settings request a database bundle through an injected loader.
- Resolve the selected rollup relation field's target database.
- Show a target-field select when the target schema is available.
- Keep raw-id fallback for unknown targets, missing loaders, or target load
  failures.

## Non-goals

- Do not change rollup computation.
- Do not auto-create relation targets.
- Do not implement relation-cell editing.

## Acceptance

- Rollup settings can choose a target field by name when the selected relation
  points at a known database.
- Unknown saved target ids remain visible and saveable.
- Fallback input still works when no target database can be resolved.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added an injected database loader to field settings.
- Resolved the selected rollup relation field's target database id.
- Loaded the target schema on demand and rendered target-field options by name.
- Preserved raw-id fallback for missing targets, load errors, and unknown ids.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
