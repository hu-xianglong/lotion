# Notion Import Focused Regression Cases

Status: done

## Why

The importer has a broad synthetic regression fixture, but audit coverage should
also catch specific high-value failures that make manual review painful.

## Scope

- Add an audit assertion for imported rows that have a body/page file but lost
  their original Notion HTML link.
- Add a regression mutation in `scripts/test-notion-import-service.mjs` that
  blanks a row's `notion_original_html` and verifies the audit reports it.

## Gates

- `npm run typecheck`
- `npm run build`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
