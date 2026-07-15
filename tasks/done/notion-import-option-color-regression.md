# Notion Import Option Color Regression

## Goal

Lock down imported Notion select, status, and multi-select option colors so
future importer changes do not silently degrade colored database properties to
plain text-only options.

## Scope

- Extend the focused Notion import fixture with `select-value-color-*` spans
  for select, status, and multi-select properties.
- Assert imported `schema.fields[].options[].color` values.
- Refresh the Notion import compatibility checklist so it reflects current
  schema support.

## Gates

- [x] `npm run typecheck`
- [x] `node scripts/test-notion-import-service.mjs`
- [x] `git diff --check`
