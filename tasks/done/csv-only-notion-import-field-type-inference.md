# CSV-only Notion Import Field Type Inference

## Why

Markdown-format Notion exports do not include HTML property-row type classes, so
CSV-only databases can import URL/date/checkbox/number fields as plain text. That
breaks field rendering and URL click behavior.

## Scope

- Infer a conservative field type from CSV values when HTML property metadata is
  absent.
- Cover URL, checkbox, number, and date only.
- Keep explicit HTML-derived Notion types authoritative.
- Add an importer fixture regression for a CSV-only database.

## Gates

- `npm run typecheck`
- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
