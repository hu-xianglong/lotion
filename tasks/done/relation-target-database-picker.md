# Relation Target Database Picker

Status: done

## Why

Relation settings currently require manually typing a database id. The app
already has database summaries in the main app state, so standalone database
field settings can offer a safer picker without broadening embedded-view props.

## Scope

- Pass database summaries into standalone `DatabaseTable`.
- Show a target database select for `entity_ref` field settings when summaries
  are available.
- Keep the raw id fallback for embedded/isolated contexts.

## Non-goals

- Do not add rollup target field picker yet.
- Do not preload target database fields.
- Do not change relation cell editing.

## Acceptance

- Standalone database relation settings can choose a target database by title.
- Embedded relation settings still work with raw id input.
- Saving still persists the same `relation.targetDatabaseId`.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Passed workspace database summaries into standalone database tables.
- Added a relation target database select when database summaries are
  available, with a raw-id fallback for embedded or isolated tables.
- Added localized "Any database" labels for the relation picker.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
