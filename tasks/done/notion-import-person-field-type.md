# Notion Import Person Field Type

Status: done

## What Changed

- Added `person` to the shared Lotion field type model.
- Preserved Notion `property-row-person` as a static `person` field during
  HTML import.
- Added a default Person field provider that reuses the text cell editor.
- Exposed Person in the database field type selector and localized labels.
- Added import-service regression coverage for a Notion person property.
- Updated Notion import compatibility and pitfall docs.

## Gates

- `npm run typecheck`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
