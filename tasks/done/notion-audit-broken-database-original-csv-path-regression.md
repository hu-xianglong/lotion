# Notion audit broken database original CSV path regression

Status: done

## Why

The database schema-level `notion_original_csv` field can exist but point to a
missing workspace file. The audit should catch that separately from total field
loss so source-link recovery remains trustworthy.

## Scope

- Add a regression that corrupts `schema.notion_original_csv`.
- Assert the audit reports a missing workspace file for the database-level CSV
  source link.
- Keep importer and audit runtime behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
