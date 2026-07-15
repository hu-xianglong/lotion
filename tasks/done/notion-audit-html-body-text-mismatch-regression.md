# Notion audit HTML body text mismatch regression

Status: done

## Why

The audit warns when an imported markdown body no longer contains a useful
snippet from the source HTML. That warning protects against subtle body
conversion regressions and should have a focused regression case.

## Scope

- Corrupt one imported row body in the Notion import service fixture.
- Assert HTML audit emits `html_body_text_not_found`.
- Keep audit runtime behavior unchanged.

## Gates

- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
