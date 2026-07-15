# Notion audit database original CSV link regression

Status: done

## Why

Rows preserve `notion_original_csv`, but imported databases also store the
source CSV link in `schema.notion_original_csv`. The audit should flag schema
link loss too, especially for sparse or empty imported databases.

## Scope

- Check imported database schema-level original CSV links during CSV audit.
- Add a regression that removes `schema.notion_original_csv`.
- Keep importer behavior unchanged.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
