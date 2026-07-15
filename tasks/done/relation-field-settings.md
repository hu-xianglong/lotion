# Relation Field Settings

Status: done

## Why

Relation metadata exists in the schema now, but users still cannot adjust it
from the field settings dialog. Rollups and richer relation UI need a place to
persist target database and multiplicity.

## Scope

- Expose relation target database id and multiplicity in `FieldSettingsDialog`.
- Save relation settings through the existing update-field flow.
- Keep the UI simple: raw database id for now, no database picker.

## Non-goals

- Do not implement rollups.
- Do not implement relation picker/search.
- Do not add reciprocal relation fields.

## Acceptance

- `entity_ref` fields show relation settings.
- Saving the dialog persists relation metadata.
- Switching away from `entity_ref` still clears relation metadata through the
  service sanitizer.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Changes

- Added relation target database id and multiplicity controls to field settings.
- Persisted relation settings through the existing `updateField` path.
- Added localized English/Chinese copy for relation settings.
- Added compact styling for the relation settings block.

## Verification

- `npm run typecheck`
- `npm run build`
- `npm run test:fixtures`
- `npm run test:latency`
- `git diff --check`
