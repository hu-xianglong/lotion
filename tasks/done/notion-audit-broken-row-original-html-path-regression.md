# Notion audit broken row original HTML path regression

Status: done

## Why

Imported row/page bodies can retain `notion_original_html` while the copied
source file is missing or the path is stale. The audit should flag that case so
the original Notion comparison link remains trustworthy.

## Scope

- Add a regression that corrupts one row's `notion_original_html` path.
- Assert the audit reports a missing workspace file for the row HTML source
  link.
- Keep importer and audit runtime behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
