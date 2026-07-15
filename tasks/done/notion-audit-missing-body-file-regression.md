# Notion audit missing body file regression

Status: done

## Why

Imported row/page records can retain source HTML and metadata while the markdown
body file is missing. The audit should fail that case because the source HTML
has material body content and the imported workspace no longer has the rendered
body to compare.

## Scope

- Delete one imported row body file in the Notion import service fixture.
- Assert HTML audit emits `missing_body_file`.
- Restore the fixture body after the assertion.
- Keep importer and audit runtime behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
