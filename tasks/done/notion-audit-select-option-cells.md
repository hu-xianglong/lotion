# Notion audit select option cells

Status: done

## Why

Notion enum/select imports are fragile when schema options and row values drift
apart. The audit should flag imported select values that cannot be shown in the
field's option picker.

## Scope

- Scan imported `select` and `multi_select` fields against schema options.
- Treat non-empty option cells with no schema options as an audit issue.
- Add a regression that corrupts an imported select value and asserts audit
  reports it.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
