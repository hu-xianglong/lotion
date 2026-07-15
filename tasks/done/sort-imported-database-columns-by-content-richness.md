# Sort Imported Database Columns By Content Richness

Status: done

## Why

Imported database default views preserved source/export field order. That often
put low-value or audit columns before fields with meaningful text. The default
column order should surface richer content first.

## Scope

- Keep the title column first.
- Sort ordinary visible user fields by average trimmed cell length, descending.
- Preserve original order for ties.
- Keep imported Original Notion HTML/CSV audit links after ordinary fields even
  though their path values are long.

## Result

- Added content-richness ordering to imported CSV and inline database default
  views.
- Added an import-service regression fixture that verifies long text fields are
  promoted while source audit links stay last.

## Gates

- `npm run typecheck`
- `npm exec -- tsc -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
