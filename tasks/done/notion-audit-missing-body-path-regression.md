# Notion audit missing body path regression

Status: done

## Why

Imported row/page records can lose the body path metadata while the markdown
file still exists. When the source Notion HTML has material body content, audit
should flag that missing pointer before checking file existence.

## Scope

- Clear one imported row's `body_path` or `page_file` cell in the import
  service fixture.
- Assert HTML audit emits `missing_body_path`.
- Restore the fixture CSV after the assertion.
- Keep importer and audit runtime behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
