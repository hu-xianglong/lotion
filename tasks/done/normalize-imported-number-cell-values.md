# Normalize imported number cell values

Status: done

## Why

Notion can export number properties with display formatting such as currency
symbols, thousands separators, or accounting-style negatives. When Lotion
imports those cells into `number` fields, CSV storage should keep canonical
numeric values so summaries, formulas, sorts, and edits operate on numbers.

## Scope

- Normalize clear number display formats for imported `number` fields.
- Preserve unparseable number-looking text instead of guessing.
- Add Notion import fixture coverage for currency and accounting negative
  values.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
