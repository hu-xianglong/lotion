# Notion audit duplicate database paths

Status: done

## Why

Imported databases can share display names, especially Untitled nested
databases. The importer disambiguates those paths; audit should catch any
regression that collapses two databases back to the same hierarchy path.

## Scope

- Corrupt one imported database schema so two databases share the same path.
- Assert the Notion import audit reports `duplicate_database_path`.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
