# Notion audit missing original CSV regression

Status: done

## Why

Audit already flags missing original Notion HTML links, and the importer stores
original CSV links for review. The test suite should also pin the CSV side so
source-link regressions are caught automatically.

## Scope

- Add a focused regression that removes a row's `notion_original_csv` value.
- Assert the Notion audit reports `missing_original_csv_link`.
- Keep importer behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
