# Notion audit noncanonical number cells

Status: done

## Why

Import now normalizes display-formatted Notion numbers, but the audit should
also catch regressions where a number field stores formatted text again. That
protects formulas, summaries, sorting, and numeric edits.

## Scope

- Treat display-formatted source numbers and canonical imported numbers as
  equivalent during CSV comparison.
- Scan imported `number` fields for noncanonical or invalid values.
- Add a regression that corrupts one imported number cell and asserts audit
  reports it.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
