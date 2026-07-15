# Notion audit database path mismatch

Status: done

## Why

Imported databases need to retain the source Notion hierarchy. If a database
schema loses or rewrites its path, search results, breadcrumbs, sidebar context,
and audit review all become misleading.

## Scope

- Corrupt one imported database schema path.
- Assert the Notion import audit reports `database_path_mismatch`.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
