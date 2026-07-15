# Notion audit invalid date cells

Status: done

## Why

Date parsing regressions are hard to spot manually because an imported table can
look mostly correct while one date cell is no longer parseable. The audit should
report imported date values that Lotion cannot interpret.

## Scope

- Scan imported `date` fields for non-empty values that cannot be parsed.
- Add a regression that corrupts one imported date cell and asserts audit
  reports it.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
