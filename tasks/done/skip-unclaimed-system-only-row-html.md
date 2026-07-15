# Skip unclaimed system-only row HTML

Status: done

## Why

Notion exports can contain extra row HTML files that are not present in the CSV
and only contain system properties such as `Created time`. Importing those as
real rows creates noisy Untitled pages and makes audits harder to review.

## Scope

- Add a fixture for an unclaimed empty row HTML with only a system property.
- Assert the row is skipped from the imported database.
- Assert the generated import report records it as a blank row.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
