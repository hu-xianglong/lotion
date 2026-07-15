# Notion audit empty body file regression

Status: done

## Why

An imported row/page can have a markdown body file that exists but is empty even
though the source Notion HTML had material body content. That is data loss and
should be reported distinctly from a missing file.

## Scope

- Truncate one imported row body file in the Notion import service fixture.
- Assert HTML audit emits `empty_body_file`.
- Restore the fixture body after the assertion.
- Keep importer and audit runtime behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
